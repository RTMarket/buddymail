/**
 * 统计口径见同目录 CAMPAIGN_SEND_LIST_STATS_RULES.md — 修改计数/筛选前必读。
 */
import type { Pool } from "mysql2/promise";
import {
  sqlEmailSendCountsAsDeliveryFailure,
  sqlEmailSendIsSmtpFailure,
  sqlSumEmailSendSmtpFailures
} from "./campaignSendDeliveryFailure.js";
import { sqlSendRowHasBounceEventImmediate } from "./emailCampaignSendRunService.js";
import type { SendListSliceTab } from "./sendContactsTabFilter.js";
import { resolveSendListFilterContext, type SendListFilterContext } from "./campaignSendContactsBulkDelete.js";
import {
  countCampaignFailedContactsDistinct,
  countCampaignSmtpStatusFailedContacts,
  loadLatestSendRunBarCounts
} from "./campaignSendFailureCount.js";
import {
  campaignSendListCacheKey,
  readCampaignSendListCache,
  writeCampaignSendListCache
} from "./campaignSendContactsCache.js";
import { countCampaignDistinctOpeners } from "./campaignEngagementStats.js";

/** 仅统计 CRM 仍存在的联系人（删除后不再出现在名单） */
const CRM_CONTACT_JOIN = "INNER JOIN email_contacts c_exist ON c_exist.id = s.contact_id";

/** tab-totals「已打开」与 7 栏 engagement-summary 对齐（CRM 名单可能漏计） */
async function alignOpenedTabTotal(
  db: Pool,
  campaignId: number,
  ctx: SendListFilterContext,
  openedCrm: number
): Promise<number> {
  const fromParamCount = ctx.fromClause ? 2 : 0;
  const sendRange = {
    clause: ctx.rangeClause,
    params: ctx.commonParams.slice(0, Math.max(0, ctx.commonParams.length - fromParamCount))
  };
  const fromParams = fromParamCount ? ctx.commonParams.slice(-2) : [];
  const openedEng = await countCampaignDistinctOpeners(
    db,
    campaignId,
    sendRange,
    ctx.fromClause,
    fromParams
  );
  return Math.max(openedCrm, openedEng);
}

export type SendContactsTabTotals = {
  all: number;
  opened: number;
  success: number;
  failed: number;
};

export type SendContactListItem = {
  contactId: number;
  industry: string;
  company: string;
  contactName: string;
  jobTitle: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  sendCount: number;
  openCount: number;
  bounceLikeCount: number;
};

function mapRow(r: Record<string, unknown>): SendContactListItem {
  return {
    contactId: Number(r.contact_id),
    industry: String(r.industry ?? ""),
    company: String(r.company ?? ""),
    contactName: String(r.contact_name ?? "").trim() || "—",
    jobTitle: String(r.job_title ?? ""),
    phone: String(r.phone ?? ""),
    fax: String(r.fax ?? ""),
    email: String(r.email ?? ""),
    address: String(r.address ?? ""),
    sendCount: Number(r.send_count ?? 0),
    openCount: Number(r.open_count ?? 0),
    bounceLikeCount: Number(r.bounce_like_count ?? 0)
  };
}

function baseSendWhere(ctx: SendListFilterContext, campaignId: number): { clause: string; params: unknown[] } {
  return {
    clause: `s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}`,
    params: [campaignId, ...ctx.commonParams]
  };
}

async function campaignListTotalsAllowRunBarFallback(db: Pool, campaignId: number): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT LOWER(COALESCE(status, '')) AS st FROM email_campaigns WHERE id = ? LIMIT 1`,
    [campaignId]
  );
  return String((rows as { st?: unknown }[])[0]?.st ?? "") === "sending";
}

/** 快速 tab 计数：4 条轻量 SQL 并行 */
export async function loadCampaignSendTabTotalsFast(
  db: Pool,
  campaignId: number,
  fromY: string,
  toY: string,
  fromEmail: string,
  sendRunId?: number | null
): Promise<SendContactsTabTotals> {
  const ctx = await resolveSendListFilterContext(db, campaignId, fromY, toY, fromEmail, sendRunId);
  const base = `FROM email_sends s ${CRM_CONTACT_JOIN} WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}`;
  const baseParams = [campaignId, ...ctx.commonParams];

  const bounceImm = sqlSendRowHasBounceEventImmediate("s");
  const [allRows, openedRows, successRows, failedRows] = await Promise.all([
    db.query(`SELECT COUNT(DISTINCT s.contact_id) AS c ${base}`, baseParams),
    db.query(
      `SELECT COUNT(DISTINCT s.contact_id) AS c
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
         INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'opened'
        WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}`,
      baseParams
    ),
    db.query(
      `SELECT COUNT(DISTINCT s.contact_id) AS c
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
        WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}
          AND s.status IN ('sent', 'delivered')
          AND NOT (${bounceImm})`,
      baseParams
    ),
    db.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DISTINCT s.contact_id AS cid
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
          WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}
            AND (${sqlContactHasCampaignSendFailure("s")})
       ) u`,
      baseParams
    )
  ]);

  let allN = Number((allRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  let successN = Number((successRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  let failedN = Number((failedRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  const failOpts = { fromY, toY, fromEmail, sendRunId: sendRunId ?? undefined };
  const smtpStatusFailed = await countCampaignSmtpStatusFailedContacts(db, campaignId, failOpts);
  const failDistinct = await countCampaignFailedContactsDistinct(db, campaignId, failOpts);
  /** 名单 tab 仅 CRM 联系人；无 contact 的 orphan 发送行不出现在列表，勿计入 tab 失败数 */
  failedN = Math.max(failedN, smtpStatusFailed, failDistinct);
  const runBar = await loadLatestSendRunBarCounts(db, campaignId);
  const allowRunBar = await campaignListTotalsAllowRunBarFallback(db, campaignId);
  if (
    allowRunBar &&
    allN === 0 &&
    successN === 0 &&
    failedN === 0 &&
    runBar &&
    runBar.success + runBar.failed > 0
  ) {
    failedN = runBar.failed;
    successN = runBar.success;
    allN = runBar.success + runBar.failed;
  }
  successN = Math.max(0, Math.min(successN, Math.max(0, allN - failedN)));
  const totalN = Math.max(allN, successN + failedN);
  const openedCrm = Number((openedRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  const openedN = await alignOpenedTabTotal(db, campaignId, ctx, openedCrm);

  return {
    all: totalN,
    opened: openedN,
    success: successN,
    failed: failedN
  };
}

/** 无 CRM contact_id 的 SMTP 失败行（监控按封计数，7 栏须托底） */
async function countCampaignOrphanSmtpFailedSends(
  db: Pool,
  campaignId: number,
  opts?: { sendRunId?: number | null; fromY?: string; toY?: string; fromEmail?: string }
): Promise<number> {
  const ctx = await resolveSendListFilterContext(
    db,
    campaignId,
    opts?.fromY ?? "",
    opts?.toY ?? "",
    opts?.fromEmail ?? "all",
    opts?.sendRunId
  );
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_sends s
      WHERE s.campaign_id = ? AND s.contact_id IS NULL ${ctx.rangeClause} ${ctx.fromClause}
        AND s.status IN ('failed', 'suppressed', 'skipped')`,
    [campaignId, ...ctx.commonParams]
  );
  return Math.max(0, Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0));
}

/**
 * 统计页 7 栏 / 发送名单首屏：退信仅按 email_send_id 关联（与实时监控一致），
 * 避免 sqlSendRowHasBounceEventImmediate 在百万级 email_sends 上拖垮连接。
 */
export async function loadCampaignSendTabTotalsStatsPanel(
  db: Pool,
  campaignId: number,
  sendRunId?: number | null,
  opts?: { fromY?: string; toY?: string; fromEmail?: string }
): Promise<SendContactsTabTotals> {
  const ctx = await resolveSendListFilterContext(
    db,
    campaignId,
    opts?.fromY ?? "",
    opts?.toY ?? "",
    opts?.fromEmail ?? "all",
    sendRunId
  );
  const base = `FROM email_sends s ${CRM_CONTACT_JOIN} WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}`;
  const baseParams = [campaignId, ...ctx.commonParams];
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id)`;
  const postfixByEmail = sqlSendRowHasPostfixDeferredForCampaign("s");
  const failPred = sqlContactHasCampaignSendFailure("s");

  const [allRows, openedRows, successRows, failedRows] = await Promise.all([
    db.query(`SELECT COUNT(DISTINCT s.contact_id) AS c ${base}`, baseParams),
    db.query(
      `SELECT COUNT(DISTINCT s.contact_id) AS c
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
         INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'opened'
        WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}`,
      baseParams
    ),
    db.query(
      `SELECT COUNT(DISTINCT s.contact_id) AS c
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
        WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}
          AND s.status IN ('sent', 'delivered')
          AND NOT (${bounceBySendId})
          AND NOT (${postfixByEmail})`,
      baseParams
    ),
    db.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DISTINCT s.contact_id AS cid
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
          WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}
            AND (${failPred})
       ) u`,
      baseParams
    )
  ]);

  let allN = Number((allRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  const openedCrm = Number((openedRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  let successRaw = Number((successRows[0] as { c?: unknown }[])[0]?.c ?? 0);
  let failedN = Number((failedRows[0] as { c?: unknown }[])[0]?.c ?? 0);

  const failOpts = {
    sendRunId: sendRunId ?? undefined,
    fromY: opts?.fromY,
    toY: opts?.toY,
    fromEmail: opts?.fromEmail
  };
  const smtpStatusFailed = await countCampaignSmtpStatusFailedContacts(db, campaignId, failOpts);
  const failDistinct = await countCampaignFailedContactsDistinct(db, campaignId, failOpts);
  const orphanSmtpFailed = await countCampaignOrphanSmtpFailedSends(db, campaignId, failOpts);
  /** 与统计页名单一致：仅 CRM 联系人；勿 rowFailed / send_run 托底（删联系人后发送行仍在） */
  failedN = Math.max(failedN, smtpStatusFailed, failDistinct, orphanSmtpFailed);

  const runBar = await loadLatestSendRunBarCounts(db, campaignId);
  const allowRunBar = await campaignListTotalsAllowRunBarFallback(db, campaignId);
  if (
    allowRunBar &&
    allN === 0 &&
    successRaw === 0 &&
    failedN === 0 &&
    runBar &&
    runBar.success + runBar.failed > 0
  ) {
    failedN = runBar.failed;
    successRaw = runBar.success;
    allN = runBar.success + runBar.failed;
  }

  /** orphan 失败行没有 contact_id，不能反向扣掉已送达；总数统一由已送达 + 失败组成 */
  const successN = Math.max(0, successRaw);
  const totalN = Math.max(allN, successN + failedN);
  const openedN = await alignOpenedTabTotal(db, campaignId, ctx, openedCrm);

  return {
    all: totalN,
    opened: openedN,
    success: successN,
    failed: failedN
  };
}

function tabTotalForPage(totals: SendContactsTabTotals, tab: SendListSliceTab | undefined): number {
  if (tab === "opened") return totals.opened;
  if (tab === "success") return totals.success;
  if (tab === "failed") return totals.failed;
  return totals.all;
}

/** 首屏：按 email_sends.id 倒序过采样再按 contact_id 去重，避免大活动 DISTINCT+OFFSET 全表扫描 */
const FAST_CONTACT_PAGE_OVERFETCH = 600;

async function pageContactIdsFromRecentSends(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  pageSize: number,
  extraJoin: string,
  extraWhere: string,
  extraParams: unknown[] = []
): Promise<number[]> {
  const bw = baseSendWhere(ctx, campaignId);
  const limit = Math.min(Math.max(pageSize * 8, pageSize), FAST_CONTACT_PAGE_OVERFETCH);
  const [rows] = await db.query(
    `SELECT s.contact_id AS contact_id
       FROM email_sends s
       ${CRM_CONTACT_JOIN}${extraJoin}
      WHERE ${bw.clause}${extraWhere}
      ORDER BY s.id DESC
      LIMIT ?`,
    [...bw.params, ...extraParams, limit]
  );
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const r of rows as { contact_id?: unknown }[]) {
    const id = Number(r.contact_id ?? 0);
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= pageSize) break;
    }
  }
  return ids;
}

async function loadOpenCountsForContacts(
  db: Pool,
  campaignId: number,
  contactIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (contactIds.length === 0) return map;
  const placeholders = contactIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT sx.contact_id AS contact_id, COUNT(DISTINCT e.id) AS open_count
       FROM email_sends sx
       INNER JOIN email_delivery_events e ON e.email_send_id = sx.id AND e.event_type = 'opened'
      WHERE sx.campaign_id = ? AND sx.contact_id IN (${placeholders})
      GROUP BY sx.contact_id`,
    [campaignId, ...contactIds]
  );
  for (const r of rows as { contact_id?: unknown; open_count?: unknown }[]) {
    map.set(Number(r.contact_id), Number(r.open_count ?? 0));
  }
  return map;
}

async function loadBounceCountsForContacts(
  db: Pool,
  campaignId: number,
  contactIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (contactIds.length === 0) return map;
  const placeholders = contactIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT sx.contact_id AS contact_id, COUNT(DISTINCT e.id) AS bounce_count
       FROM email_sends sx
       INNER JOIN email_delivery_events e ON e.event_type = 'bounced'
        AND (
          e.email_send_id = sx.id
          OR (
            e.provider = 'postfix_deferred'
            AND e.campaign_id = sx.campaign_id
            AND LOWER(TRIM(e.email)) = LOWER(TRIM(sx.to_email))
          )
        )
      WHERE sx.campaign_id = ? AND sx.contact_id IN (${placeholders})
      GROUP BY sx.contact_id`,
    [campaignId, ...contactIds]
  );
  for (const r of rows as { contact_id?: unknown; bounce_count?: unknown }[]) {
    map.set(Number(r.contact_id), Number(r.bounce_count ?? 0));
  }
  return map;
}

async function loadSendStatsForContacts(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  contactIds: number[]
): Promise<Map<number, { sendCount: number; syncFailed: number }>> {
  const map = new Map<number, { sendCount: number; syncFailed: number }>();
  if (contactIds.length === 0) return map;
  const bw = baseSendWhere(ctx, campaignId);
  const placeholders = contactIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT s.contact_id AS contact_id,
            COUNT(s.id) AS send_count,
            ${sqlSumEmailSendSmtpFailures("s")} AS sync_failed
       FROM email_sends s
      WHERE ${bw.clause} AND s.contact_id IN (${placeholders})
      GROUP BY s.contact_id`,
    [...bw.params, ...contactIds]
  );
  for (const r of rows as { contact_id?: unknown; send_count?: unknown; sync_failed?: unknown }[]) {
    map.set(Number(r.contact_id), {
      sendCount: Number(r.send_count ?? 0),
      syncFailed: Number(r.sync_failed ?? 0)
    });
  }
  return map;
}

async function enrichContacts(
  db: Pool,
  campaignId: number,
  contactIds: number[],
  stats: Map<number, { sendCount: number; syncFailed: number }>,
  openMap: Map<number, number>,
  bounceMap: Map<number, number>,
  contactLevelMetrics = false
): Promise<SendContactListItem[]> {
  if (contactIds.length === 0) return [];
  const placeholders = contactIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT c.id AS contact_id,
            COALESCE(c.industry, '') AS industry,
            COALESCE(c.company, '') AS company,
            TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS contact_name,
            COALESCE(c.job_title, '') AS job_title,
            COALESCE(c.phone, '') AS phone,
            COALESCE(c.fax, '') AS fax,
            c.email,
            COALESCE(c.address, '') AS address
       FROM email_contacts c
      WHERE c.id IN (${placeholders})`,
    contactIds
  );
  const byId = new Map<number, Record<string, unknown>>();
  for (const r of rows as Record<string, unknown>[]) {
    byId.set(Number(r.contact_id), r);
  }
  const items: SendContactListItem[] = [];
  for (const id of contactIds) {
    const r = byId.get(id);
    if (!r) continue;
    const st = stats.get(id) ?? { sendCount: 0, syncFailed: 0 };
    const bounceEvents = bounceMap.get(id) ?? 0;
    const failedContact = st.syncFailed > 0 || bounceEvents > 0;
    items.push(
      mapRow({
        ...r,
        send_count: contactLevelMetrics ? (st.sendCount > 0 ? 1 : 0) : st.sendCount,
        open_count: openMap.get(id) ?? 0,
        bounce_like_count: contactLevelMetrics ? (failedContact ? 1 : 0) : st.syncFailed + bounceEvents
      })
    );
  }
  return items;
}

async function pageContactIdsOpened(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  page: number,
  pageSize: number,
  sort: "default" | "opens_desc"
): Promise<number[]> {
  const bw = baseSendWhere(ctx, campaignId);
  const offset = (page - 1) * pageSize;
  /** 默认排序：DISTINCT 分页，避免全活动 GROUP BY 导致统计页名单超时 */
  if (sort !== "opens_desc") {
    if (page === 1) {
      return pageContactIdsFromRecentSends(
        db,
        ctx,
        campaignId,
        pageSize,
        ` INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'opened'`,
        ""
      );
    }
    const [rows] = await db.query(
      `SELECT DISTINCT s.contact_id AS contact_id
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
         INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'opened'
        WHERE ${bw.clause}
        ORDER BY s.contact_id ASC
        LIMIT ? OFFSET ?`,
      [...bw.params, pageSize, offset]
    );
    return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
  }
  const [rows] = await db.query(
    `SELECT s.contact_id AS contact_id, COUNT(DISTINCT e.id) AS open_count
       FROM email_sends s
       ${CRM_CONTACT_JOIN}
       INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'opened'
      WHERE ${bw.clause}
      GROUP BY s.contact_id
      ORDER BY open_count DESC, contact_id ASC
      LIMIT ? OFFSET ?`,
    [...bw.params, pageSize, offset]
  );
  return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
}

async function pageContactIdsSuccess(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  page: number,
  pageSize: number,
  sort: "default" | "opens_desc"
): Promise<number[]> {
  const bw = baseSendWhere(ctx, campaignId);
  const offset = (page - 1) * pageSize;
  const sentFilter = ` AND s.status IN ('sent', 'delivered')`;
  if (sort !== "opens_desc" && page === 1) {
    return pageContactIdsFromRecentSends(db, ctx, campaignId, pageSize, "", sentFilter);
  }
  if (sort === "opens_desc") {
    const [rows] = await db.query(
      `SELECT agg.contact_id
         FROM (
           SELECT s.contact_id,
                  COUNT(s.id) AS send_count
             FROM email_sends s
             ${CRM_CONTACT_JOIN}
            WHERE ${bw.clause} AND s.status IN ('sent', 'delivered')
            GROUP BY s.contact_id
         ) agg
         LEFT JOIN (
           SELECT sx.contact_id, COUNT(DISTINCT e.id) AS open_count
             FROM email_sends sx
             INNER JOIN email_delivery_events e ON e.email_send_id = sx.id AND e.event_type = 'opened'
            WHERE sx.campaign_id = ?
            GROUP BY sx.contact_id
         ) oc ON oc.contact_id = agg.contact_id
        ORDER BY COALESCE(oc.open_count, 0) DESC, agg.send_count DESC, agg.contact_id ASC
        LIMIT ? OFFSET ?`,
      [...bw.params, campaignId, pageSize, offset]
    );
    return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
  }
  const [rows] = await db.query(
    `SELECT DISTINCT s.contact_id AS contact_id
       FROM email_sends s
       ${CRM_CONTACT_JOIN}
      WHERE ${bw.clause} AND s.status IN ('sent', 'delivered')
      ORDER BY s.contact_id ASC
      LIMIT ? OFFSET ?`,
    [...bw.params, pageSize, offset]
  );
  return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
}

/** 7 栏 / 名单失败 tab / send-progress：联系人去重失败（含 skipped，与 lite 监控一致） */
export function sqlContactHasCampaignSendFailure(sAlias = "s"): string {
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = ${sAlias}.id)`;
  const postfixByEmail = sqlSendRowHasPostfixDeferredForCampaign(sAlias);
  return `(
    ${sqlEmailSendCountsAsDeliveryFailure(sAlias)}
    OR (${sAlias}.status IN ('sent', 'delivered') AND (${bounceBySendId}))
    OR (${postfixByEmail})
  )`;
}

/** postfix 对账：须限定本活动，勿按邮箱全局匹配（否则他场 deferred 会把本场 sent 全算失败） */
export function sqlSendRowHasPostfixDeferredForCampaign(sAlias = "s"): string {
  return `EXISTS (
    SELECT 1 FROM email_delivery_events e
    WHERE e.event_type = 'bounced'
      AND e.provider = 'postfix_deferred'
      AND e.campaign_id = ${sAlias}.campaign_id
      AND LOWER(TRIM(e.email)) = LOWER(TRIM(${sAlias}.to_email))
  )`;
}

async function pageContactIdsFailed(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  page: number,
  pageSize: number
): Promise<number[]> {
  const bw = baseSendWhere(ctx, campaignId);
  const offset = (page - 1) * pageSize;
  const postfixPred = sqlSendRowHasPostfixDeferredForCampaign("s");
  const [rows] = await db.query(
    `SELECT u.cid AS contact_id
       FROM (
         SELECT DISTINCT s.contact_id AS cid
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
          WHERE ${bw.clause} AND ${sqlEmailSendIsSmtpFailure("s")}
         UNION
         SELECT DISTINCT s.contact_id AS cid
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
          INNER JOIN email_delivery_events e ON e.email_send_id = s.id AND e.event_type = 'bounced'
          WHERE ${bw.clause}
         UNION
         SELECT DISTINCT s.contact_id AS cid
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
          WHERE ${bw.clause} AND (${postfixPred})
       ) u
      ORDER BY u.cid ASC
      LIMIT ? OFFSET ?`,
    [...bw.params, ...bw.params, ...bw.params, pageSize, offset]
  );
  return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
}

async function pageContactIdsAll(
  db: Pool,
  ctx: SendListFilterContext,
  campaignId: number,
  page: number,
  pageSize: number,
  sort: "default" | "opens_desc"
): Promise<number[]> {
  const bw = baseSendWhere(ctx, campaignId);
  const offset = (page - 1) * pageSize;
  if (sort === "opens_desc") {
    const [rows] = await db.query(
      `SELECT agg.contact_id
         FROM (
           SELECT s.contact_id, COUNT(s.id) AS send_count
             FROM email_sends s
             ${CRM_CONTACT_JOIN}
            WHERE ${bw.clause}
            GROUP BY s.contact_id
         ) agg
         LEFT JOIN (
           SELECT sx.contact_id, COUNT(DISTINCT e.id) AS open_count
             FROM email_sends sx
             INNER JOIN email_delivery_events e ON e.email_send_id = sx.id AND e.event_type = 'opened'
            WHERE sx.campaign_id = ?
            GROUP BY sx.contact_id
         ) oc ON oc.contact_id = agg.contact_id
        ORDER BY COALESCE(oc.open_count, 0) DESC, agg.send_count DESC, agg.contact_id ASC
        LIMIT ? OFFSET ?`,
      [...bw.params, campaignId, pageSize, offset]
    );
    return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
  }
  if (page === 1) {
    return pageContactIdsFromRecentSends(db, ctx, campaignId, pageSize, "", "");
  }
  const [rows] = await db.query(
    `SELECT DISTINCT s.contact_id AS contact_id
       FROM email_sends s
       ${CRM_CONTACT_JOIN}
      WHERE ${bw.clause}
      ORDER BY s.contact_id ASC
      LIMIT ? OFFSET ?`,
    [...bw.params, pageSize, offset]
  );
  return (rows as { contact_id?: unknown }[]).map((r) => Number(r.contact_id));
}

async function readOrLoadTabTotals(
  db: Pool,
  campaignId: number,
  fromY: string,
  toY: string,
  fromEmail: string,
  sendRunId?: number | null
): Promise<SendContactsTabTotals> {
  const cacheKey = campaignSendListCacheKey({
    kind: "totals",
    campaignId,
    from: fromY,
    to: toY,
    fe: fromEmail,
    run: sendRunId ?? 0
  });
  const cached = readCampaignSendListCache<SendContactsTabTotals>(cacheKey);
  if (cached) return cached;
  const totals = await loadCampaignSendTabTotalsFast(db, campaignId, fromY, toY, fromEmail, sendRunId);
  writeCampaignSendListCache(cacheKey, totals);
  return totals;
}

export async function loadCampaignSendContactsPageFast(
  db: Pool,
  opts: {
    campaignId: number;
    tab?: SendListSliceTab;
    page: number;
    pageSize: number;
    sort: "default" | "opens_desc";
    fromY: string;
    toY: string;
    fromEmail: string;
    sendRunId?: number | null;
    /** 跳过退信事件逐联系人统计，显著降低首屏延迟 */
    lite?: boolean;
    /** 调用方已算好 tab 计数时可注入，避免重复 4 路 COUNT */
    totalsHint?: SendContactsTabTotals | null;
    /** 统计页：每联系人最多计 1 次发信/失败（非发送行数累加） */
    contactLevelMetrics?: boolean;
  }
): Promise<{ total: number; items: SendContactListItem[]; listDateScope: "range" | "all_campaign" }> {
  const ctx = await resolveSendListFilterContext(
    db,
    opts.campaignId,
    opts.fromY,
    opts.toY,
    opts.fromEmail,
    opts.sendRunId
  );
  const listDateScope = ctx.rangeClause ? "range" : "all_campaign";
  const totals =
    opts.totalsHint ??
    (await readOrLoadTabTotals(
      db,
      opts.campaignId,
      opts.fromY,
      opts.toY,
      opts.fromEmail,
      opts.sendRunId
    ));
  const total = tabTotalForPage(totals, opts.tab);
  if (total === 0) {
    return { total: 0, listDateScope, items: [] };
  }

  let contactIds: number[];
  if (opts.tab === "opened") {
    contactIds = await pageContactIdsOpened(db, ctx, opts.campaignId, opts.page, opts.pageSize, opts.sort);
  } else if (opts.tab === "success") {
    contactIds = await pageContactIdsSuccess(db, ctx, opts.campaignId, opts.page, opts.pageSize, opts.sort);
  } else if (opts.tab === "failed") {
    contactIds = await pageContactIdsFailed(db, ctx, opts.campaignId, opts.page, opts.pageSize);
  } else {
    contactIds = await pageContactIdsAll(db, ctx, opts.campaignId, opts.page, opts.pageSize, opts.sort);
  }

  if (contactIds.length === 0) {
    return { total, listDateScope, items: [] };
  }

  const skipBounce = opts.lite === true && opts.tab !== "failed";
  const [stats, openMap, bounceMap] = await Promise.all([
    loadSendStatsForContacts(db, ctx, opts.campaignId, contactIds),
    loadOpenCountsForContacts(db, opts.campaignId, contactIds),
    skipBounce
      ? Promise.resolve(new Map<number, number>())
      : loadBounceCountsForContacts(db, opts.campaignId, contactIds)
  ]);

  const items = await enrichContacts(
    db,
    opts.campaignId,
    contactIds,
    stats,
    openMap,
    bounceMap,
    opts.contactLevelMetrics === true
  );
  return { total, listDateScope, items };
}
