/**
 * 营销活动失败计数（7 栏 / 名单「退回/失败」tab / send-progress 对齐口径）。
 * 按活动内 DISTINCT contact_id（须仍在 CRM），SMTP failed/suppressed + sent 退信 + postfix_deferred。
 */
import type { Pool } from "mysql2/promise";
import { sqlContactHasCampaignSendFailure } from "./campaignSendContactsList.js";
import { resolveSendListFilterContext } from "./campaignSendContactsBulkDelete.js";

const CRM_CONTACT_JOIN = "INNER JOIN email_contacts c_exist ON c_exist.id = s.contact_id";

export type CampaignFailedContactsCountOpts = {
  sendRunId?: number | null;
  fromY?: string;
  toY?: string;
  fromEmail?: string;
  /** 与 /stats 日期范围、发信邮箱筛选一致 */
  sendRangeClause?: string;
  sendRangeParams?: unknown[];
  fromClause?: string;
  fromParams?: unknown[];
};

export async function countCampaignFailedContactsDistinct(
  db: Pool,
  campaignId: number,
  opts?: CampaignFailedContactsCountOpts
): Promise<number> {
  const ctx = await resolveSendListFilterContext(
    db,
    campaignId,
    opts?.fromY ?? "",
    opts?.toY ?? "",
    opts?.fromEmail ?? "all",
    opts?.sendRunId
  );
  const rangeExtra = opts?.sendRangeClause ?? "";
  const fromExtra = opts?.fromClause ?? "";
  const baseParams = [
    campaignId,
    ...ctx.commonParams,
    ...(opts?.sendRangeParams ?? []),
    ...(opts?.fromParams ?? [])
  ];
  const failPred = sqlContactHasCampaignSendFailure("s");
  const [failedRows] = await db.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT DISTINCT s.contact_id AS cid
         FROM email_sends s
         ${CRM_CONTACT_JOIN}
        WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}${rangeExtra}${fromExtra}
          AND (${failPred})
     ) u`,
    baseParams
  );
  return Math.max(0, Number((failedRows as Array<{ c?: unknown }>)[0]?.c ?? 0));
}

/** 仅按 SMTP 终态行计数（含 skipped）；联系人须在 CRM。用于 7 栏托底，避免退信 EXISTS 漏计。 */
export async function countCampaignSmtpStatusFailedContacts(
  db: Pool,
  campaignId: number,
  opts?: CampaignFailedContactsCountOpts
): Promise<number> {
  const ctx = await resolveSendListFilterContext(
    db,
    campaignId,
    opts?.fromY ?? "",
    opts?.toY ?? "",
    opts?.fromEmail ?? "all",
    opts?.sendRunId
  );
  const rangeExtra = opts?.sendRangeClause ?? "";
  const fromExtra = opts?.fromClause ?? "";
  const baseParams = [
    campaignId,
    ...ctx.commonParams,
    ...(opts?.sendRangeParams ?? []),
    ...(opts?.fromParams ?? [])
  ];
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT s.contact_id) AS c
       FROM email_sends s
       ${CRM_CONTACT_JOIN}
      WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${ctx.rangeClause} ${ctx.fromClause}${rangeExtra}${fromExtra}
        AND s.status IN ('failed', 'suppressed', 'skipped')`,
    baseParams
  );
  return Math.max(0, Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0));
}

/**
 * 按发送行计数失败（不要求 CRM contact_id），与单组实时监控「失败 N 封」一致。
 */
export async function countCampaignFailedSendRows(
  db: Pool,
  campaignId: number,
  opts?: CampaignFailedContactsCountOpts
): Promise<number> {
  const ctx = await resolveSendListFilterContext(
    db,
    campaignId,
    opts?.fromY ?? "",
    opts?.toY ?? "",
    opts?.fromEmail ?? "all",
    opts?.sendRunId
  );
  const rangeExtra = opts?.sendRangeClause ?? "";
  const fromExtra = opts?.fromClause ?? "";
  const baseParams = [
    campaignId,
    ...ctx.commonParams,
    ...(opts?.sendRangeParams ?? []),
    ...(opts?.fromParams ?? [])
  ];
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_sends s
      WHERE s.campaign_id = ? ${ctx.rangeClause} ${ctx.fromClause}${rangeExtra}${fromExtra}
        AND s.status IN ('failed', 'suppressed', 'skipped')`,
    baseParams
  );
  return Math.max(0, Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0));
}

/** 最近一轮 send_run 写入的成功/失败（与单组监控 finalize 一致） */
export async function loadLatestSendRunBarCounts(
  db: Pool,
  campaignId: number
): Promise<{ success: number; failed: number } | null> {
  const [rows] = await db.query(
    `SELECT COALESCE(success_count, 0) AS sc, COALESCE(fail_count, 0) AS fc
       FROM email_campaign_send_runs
      WHERE campaign_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [campaignId]
  );
  const row = (rows as Array<{ sc?: unknown; fc?: unknown }>)[0];
  if (!row) return null;
  const success = Math.max(0, Number(row.sc ?? 0));
  const failed = Math.max(0, Number(row.fc ?? 0));
  if (success + failed <= 0) return null;
  return { success, failed };
}
