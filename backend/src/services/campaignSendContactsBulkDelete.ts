import type { Pool, PoolConnection } from "mysql2/promise";
import { businessRangeMysqlBounds, sqlBusinessDatetimeBetweenAnd } from "./businessCalendar.js";
import { invalidateCampaignSendListCache } from "./campaignSendContactsCache.js";
import { sqlBounceEventMatchesSend } from "./emailBounceReconcile.js";
import { sqlSumEmailSendSmtpFailures } from "./campaignSendDeliveryFailure.js";
import { sqlSendRunFilter } from "./campaignSendRunFilter.js";

export type SendListSliceTab = "opened" | "success" | "failed";

export type SendListFilterContext = {
  campaignId: number;
  tenantId: number;
  rangeClause: string;
  sxRangeClause: string;
  fromClause: string;
  commonParams: unknown[];
  bounceJoinParams: unknown[];
  /** 子查询 sx：campaign_id + 日期范围参数（各用一次） */
  sxRangeParams: unknown[];
  sendRunId: number | null;
};

function sendContactsTabFilterSql(tab: SendListSliceTab): string {
  if (tab === "opened") return " AND agg.open_count > 0";
  if (tab === "success") return " AND GREATEST(0, agg.send_count - agg.bounce_like_count) > 0";
  return " AND agg.bounce_like_count > 0";
}

/** 与 send-contacts / tab-totals 一致的日期、发信邮箱筛选 */
export async function resolveSendListFilterContext(
  db: Pool,
  campaignId: number,
  fromY: string,
  toY: string,
  fromEmailRaw: string,
  sendRunIdInput?: number | null
): Promise<SendListFilterContext> {
  const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  const tenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);

  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  let from = fromY && ymdRe.test(fromY) ? fromY : "";
  let to = toY && ymdRe.test(toY) ? toY : "";
  if (from && to && from > to) {
    const t = from;
    from = to;
    to = t;
  }
  const hasDateRange = Boolean(from && to);
  const rangeBounds = hasDateRange ? businessRangeMysqlBounds(from, to) : null;
  const startDt = rangeBounds?.start ?? "";
  const endExclusive = rangeBounds?.endExclusive ?? "";

  const fe = String(fromEmailRaw ?? "")
    .trim()
    .toLowerCase();
  const fromEmailFilter = fe && fe !== "all";
  const [smtpJoinRows] = await db.query(
    `SELECT LOWER(TRIM(COALESCE(sp.from_email, ''))) AS fe
       FROM email_campaigns c
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       WHERE c.id = ?
       LIMIT 1`,
    [campaignId]
  );
  const campaignSmtpFromLower = String((smtpJoinRows as { fe?: unknown }[])[0]?.fe ?? "").trim();
  const fromClause = fromEmailFilter
    ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ?`
    : "";
  const fromParams: unknown[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fe] : [];
  const sendRunId =
    sendRunIdInput != null && Number.isFinite(Number(sendRunIdInput)) && Number(sendRunIdInput) > 0
      ? Math.floor(Number(sendRunIdInput))
      : null;
  const runOnS = sqlSendRunFilter("s", sendRunId);
  const runOnSx = sqlSendRunFilter("sx", sendRunId);

  let sendListRange = hasDateRange
    ? sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive)
    : { clause: "", params: [] as unknown[] };

  if (hasDateRange) {
    const [rangeProbeRows] = await db.query(
      `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${sendListRange.clause}${runOnS.clause}${fromClause}`,
      [campaignId, ...sendListRange.params, ...runOnS.params, ...fromParams]
    );
    if (Number((rangeProbeRows as { n?: unknown }[])[0]?.n ?? 0) === 0) {
      const [allProbeRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${runOnS.clause}${fromClause}`,
        [campaignId, ...runOnS.params, ...fromParams]
      );
      if (Number((allProbeRows as { n?: unknown }[])[0]?.n ?? 0) > 0) {
        sendListRange = { clause: "", params: [] };
      }
    }
  }

  const rangeClause = `${sendListRange.clause}${runOnS.clause}`;
  const sxRangeClause = `${sendListRange.clause.replace(/s\.created_at/g, "sx.created_at")}${runOnSx.clause}`;
  const commonParams: unknown[] = [...sendListRange.params, ...runOnS.params, ...fromParams];
  const bounceJoinParams: unknown[] = [
    campaignId,
    ...sendListRange.params,
    ...runOnS.params,
    campaignId,
    ...sendListRange.params,
    ...runOnS.params,
    campaignId,
    ...commonParams
  ];

  return {
    campaignId,
    tenantId,
    rangeClause,
    sxRangeClause,
    fromClause,
    commonParams,
    bounceJoinParams,
    sxRangeParams: [campaignId, ...sendListRange.params, ...runOnSx.params],
    sendRunId
  };
}

export async function listSendContactIdsForTab(
  db: Pool,
  ctx: SendListFilterContext,
  tab: SendListSliceTab,
  limit: number,
  offset: number
): Promise<number[]> {
  const tabFilterSql = sendContactsTabFilterSql(tab);
  const [rows] = await db.query(
    `SELECT agg.contact_id AS contact_id
       FROM (
         SELECT
           c.id AS contact_id,
           COUNT(s.id) AS send_count,
           COALESCE(MAX(oe.opened_count), 0) AS open_count,
           ${sqlSumEmailSendSmtpFailures("s")}
             + COALESCE(MAX(be.bounced_count), 0) AS bounce_like_count
         FROM email_sends s
         INNER JOIN email_contacts c ON c.id = s.contact_id
         LEFT JOIN (
           SELECT sx.campaign_id, COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key, COUNT(DISTINCT e.id) AS bounced_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e ON e.event_type = 'bounced' AND ${sqlBounceEventMatchesSend("e", "sx")}
           WHERE sx.campaign_id = ?${ctx.sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) be ON be.campaign_id = s.campaign_id
           AND ((be.contact_id_key > 0 AND be.contact_id_key = c.id) OR (be.contact_id_key = 0 AND be.email_key = LOWER(TRIM(c.email))))
         LEFT JOIN (
           SELECT sx.campaign_id, COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key, COUNT(DISTINCT e.id) AS opened_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e ON e.event_type = 'opened' AND e.email_send_id = sx.id
           WHERE sx.campaign_id = ?${ctx.sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) oe ON oe.campaign_id = s.campaign_id
           AND ((oe.contact_id_key > 0 AND oe.contact_id_key = c.id) OR (oe.contact_id_key = 0 AND oe.email_key = LOWER(TRIM(c.email))))
         WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}
         GROUP BY c.id
       ) agg
       WHERE 1=1${tabFilterSql}
       ORDER BY agg.contact_id ASC
       LIMIT ? OFFSET ?`,
    [...ctx.bounceJoinParams, limit, offset]
  );
  return (rows as { contact_id?: unknown }[])
    .map((r) => Number(r.contact_id ?? 0))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/** 大表分批删投递事件，避免单次 DELETE 扫全表锁死 */
async function deleteDeliveryEventsForContacts(
  conn: PoolConnection,
  tenantId: number,
  contactIds: number[]
): Promise<void> {
  if (contactIds.length === 0) return;
  const ph = contactIds.map(() => "?").join(",");
  const limit = 2500;
  for (;;) {
    const [result] = await conn.query(
      `DELETE FROM email_delivery_events WHERE tenant_id = ? AND contact_id IN (${ph}) LIMIT ${limit}`,
      [tenantId, ...contactIds]
    );
    const n = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    if (n === 0) break;
  }
}

async function deleteContactIdsOnConn(conn: PoolConnection, tenantId: number, contactIds: number[]): Promise<number> {
  if (contactIds.length === 0) return 0;
  const ph = contactIds.map(() => "?").join(",");
  await conn.query(
    `DELETE FROM email_contact_groups WHERE tenant_id = ? AND contact_id IN (${ph})`,
    [tenantId, ...contactIds]
  );
  await conn.query(
    `DELETE FROM crm_contact_followups WHERE tenant_id = ? AND contact_id IN (${ph})`,
    [tenantId, ...contactIds]
  );
  await conn.query(
    `DELETE FROM email_unsubscribe_events WHERE tenant_id = ? AND contact_id IN (${ph})`,
    [tenantId, ...contactIds]
  );
  await conn.query(
    `DELETE FROM email_subscribe_events WHERE tenant_id = ? AND contact_id IN (${ph})`,
    [tenantId, ...contactIds]
  );
  await deleteDeliveryEventsForContacts(conn, tenantId, contactIds);
  const [result] = await conn.query(
    `DELETE FROM email_contacts WHERE tenant_id = ? AND id IN (${ph})`,
    [tenantId, ...contactIds]
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

/** 供单条 DELETE /api/email/contacts/:id 与批量删除共用 */
export async function deleteTenantContactsByIds(
  db: Pool,
  tenantId: number,
  contactIds: number[]
): Promise<number> {
  const uniq = Array.from(new Set(contactIds)).filter((id) => id > 0);
  if (uniq.length === 0) return 0;
  let deleted = 0;
  const conn = await db.getConnection();
  try {
    for (let i = 0; i < uniq.length; i += DELETE_CHUNK) {
      const chunk = uniq.slice(i, i + DELETE_CHUNK);
      await conn.beginTransaction();
      try {
        deleted += await deleteContactIdsOnConn(conn, tenantId, chunk);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }
  } finally {
    conn.release();
  }
  return deleted;
}

/** 订阅/退订/投诉：按邮箱删 CRM 联系人（须与 deleteTenantContactsByIds 同链路） */
export async function deleteTenantContactByEmail(
  db: Pool,
  tenantId: number,
  emailRaw: string
): Promise<{ deleted: number; matched: number }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email || tenantId <= 0) return { deleted: 0, matched: 0 };
  const [rows] = await db.query(
    `SELECT id FROM email_contacts WHERE tenant_id = ? AND LOWER(TRIM(email)) = ? LIMIT 1`,
    [tenantId, email]
  );
  const id = Number((rows as { id?: unknown }[])[0]?.id ?? 0);
  if (id <= 0) return { deleted: 0, matched: 0 };
  const deleted = await deleteTenantContactsByIds(db, tenantId, [id]);
  return { deleted, matched: 1 };
}

const DELETE_CHUNK = 500;
const ID_PAGE = 500;
const EXPLICIT_IDS_MAX = 500;

export async function bulkDeleteCampaignSendTabContacts(
  db: Pool,
  opts: {
    campaignId: number;
    tenantId: number;
    tab: SendListSliceTab;
    contactIds?: number[] | null;
    fromY?: string;
    toY?: string;
    fromEmail?: string;
  }
): Promise<{ deleted: number; matched: number }> {
  const explicit = Array.from(new Set(opts.contactIds ?? [])).filter((id) => id > 0);
  if (explicit.length > EXPLICIT_IDS_MAX) {
    throw new Error(`单次最多删除 ${EXPLICIT_IDS_MAX} 位联系人，请分批勾选删除。`);
  }

  /** 前端已勾选 ID：跳过重型 send-contacts 聚合，只按租户删 CRM */
  if (explicit.length > 0) {
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [
      opts.campaignId
    ]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (opts.tenantId > 0 && campTenantId > 0 && campTenantId !== opts.tenantId) {
      throw new Error("无权操作该活动联系人");
    }
    const tenantId = opts.tenantId > 0 ? opts.tenantId : campTenantId;
    const deleted = await deleteTenantContactsByIds(db, tenantId, explicit);
    invalidateCampaignSendListCache(opts.campaignId);
    return { deleted, matched: explicit.length };
  }

  const ctx = await resolveSendListFilterContext(
    db,
    opts.campaignId,
    opts.fromY ?? "",
    opts.toY ?? "",
    opts.fromEmail ?? ""
  );
  if (ctx.tenantId > 0 && opts.tenantId > 0 && ctx.tenantId !== opts.tenantId) {
    throw new Error("无权操作该活动联系人");
  }
  const tenantId = opts.tenantId > 0 ? opts.tenantId : ctx.tenantId;

  let ids: number[] = [];
  {
    let offset = 0;
    for (;;) {
      const page = await listSendContactIdsForTab(db, ctx, opts.tab, ID_PAGE, offset);
      if (page.length === 0) break;
      ids.push(...page);
      offset += ID_PAGE;
      if (page.length < ID_PAGE) break;
      if (ids.length > 50_000) break;
    }
    ids = Array.from(new Set(ids));
  }

  const matched = ids.length;
  if (matched === 0) return { deleted: 0, matched: 0 };

  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      deleted += await deleteContactIdsOnConn(conn, tenantId, chunk);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  invalidateCampaignSendListCache(opts.campaignId);
  return { deleted, matched };
}
