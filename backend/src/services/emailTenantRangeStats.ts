import type { Pool } from "mysql2/promise";
import {
  businessDayMysqlRange,
  businessRangeMysqlBounds,
  sqlCampaignSendActivityRangeAnd,
  businessTodayYmd,
  sqlBusinessDatetimeBetweenAnd,
  normalizeMysqlTimezoneOffset
} from "./businessCalendar.js";
import { sqlSendRowHasBounceEvent } from "./emailBounceReconcile.js";
import { sqlEmailSendCountsAsDeliveryFailure } from "./campaignSendDeliveryFailure.js";
import { sqlSendRowHasPostfixDeferredForCampaign } from "./campaignSendContactsList.js";

const CRM_CONTACT_JOIN = "INNER JOIN email_contacts c_exist ON c_exist.id = s.contact_id";

/** 与「今日各场活动」加总一致：同一联系人在不同活动各计 1（非租户级 contact 去重） */
const DISTINCT_CAMPAIGN_RECIPIENT =
  "CONCAT(s.campaign_id, ':', COALESCE(CONCAT('c:', s.contact_id), CONCAT('e:', LOWER(TRIM(s.to_email)))))";

export type TenantRangeStatsSummary = {
  totalSendAttempts: number;
  deliveredCount: number;
  openedCount: number;
  subscribeCount: number;
  unsubscribeCount: number;
  complaintCount: number;
  subscribeTodayCount: number;
  subscribeTodayBySendingDomain: Array<{ fromEmail: string; count: number }>;
  subscribeTodayDate: string;
};

function normalizeScopeFromEmails(scopeFromEmail?: string | null, scopeFromEmails?: string[] | null): string[] {
  const fromList = (scopeFromEmails ?? [])
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)];
  const single = String(scopeFromEmail ?? "")
    .trim()
    .toLowerCase();
  return single ? [single] : [];
}

function sqlSendFromEmailIn(alias: string, emails: string[]): { clause: string; params: string[] } {
  if (emails.length === 0) return { clause: "", params: [] };
  if (emails.length === 1) {
    return {
      clause: ` AND LOWER(TRIM(COALESCE(${alias}.from_email, ''))) = ?`,
      params: [emails[0]!]
    };
  }
  return {
    clause: ` AND LOWER(TRIM(COALESCE(${alias}.from_email, ''))) IN (${emails.map(() => "?").join(",")})`,
    params: emails
  };
}

/** 打开/投诉等投递事件按关联 email_sends.from_email 归因到发信邮箱 */
function sqlDeliveryEventAttributedToFromEmails(eventAlias: string, emails: string[]): { clause: string; params: string[] } {
  if (emails.length === 0) return { clause: "", params: [] };
  const inList = emails.map(() => "?").join(",");
  return {
    clause: ` AND EXISTS (
         SELECT 1 FROM email_sends sx
          WHERE sx.campaign_id = ${eventAlias}.campaign_id
            AND (
              (${eventAlias}.email_send_id IS NOT NULL AND sx.id = ${eventAlias}.email_send_id)
              OR (
                ${eventAlias}.email_send_id IS NULL
                AND sx.contact_id IS NOT NULL
                AND sx.contact_id = ${eventAlias}.contact_id
              )
            )
            AND LOWER(TRIM(COALESCE(sx.from_email, ''))) IN (${inList})
       )`,
    params: emails
  };
}

function sqlSubscribeAttributedToFromEmails(
  eventAlias: string,
  emails: string[],
  bouncePredSub: string
): { clause: string; params: string[] } {
  if (emails.length === 0) return { clause: "", params: [] };
  const inList = emails.map(() => "?").join(",");
  return {
    clause: ` AND EXISTS (
         SELECT 1 FROM email_sends es
          WHERE es.campaign_id = ${eventAlias}.campaign_id
            AND es.contact_id = ${eventAlias}.contact_id
            AND es.status = 'sent'
            AND NOT (${bouncePredSub})
            AND LOWER(TRIM(COALESCE(es.from_email, ''))) IN (${inList})
       )`,
    params: emails
  };
}

/**
 * 租户日期区间 · 发信量 / 已送达（与今日活动概览加总、7 栏单活动口径一致）：
 * 按 (campaign_id, contact_id) 去重；已送达不含 postfix / 退信 / SMTP 失败。
 */
async function loadSendDeliveredSummary(
  db: Pool,
  tenantId: number,
  sendRange: { clause: string; params: unknown[] },
  sendEmailClause: string,
  sendEmailParams: string[]
): Promise<{ totalSendAttempts: number; deliveredCount: number }> {
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id)`;
  const postfixPred = sqlSendRowHasPostfixDeferredForCampaign("s");
  const joinSendRuns = "joinSendRuns" in sendRange ? String((sendRange as { joinSendRuns?: unknown }).joinSendRuns ?? "") : "";
  const baseFrom = `FROM email_sends s ${joinSendRuns} INNER JOIN email_campaigns c ON c.id = s.campaign_id WHERE c.tenant_id = ?${sendRange.clause}${sendEmailClause}`;
  const baseParams = [tenantId, ...sendRange.params, ...sendEmailParams];

  const [successRes, failedRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DISTINCT ${DISTINCT_CAMPAIGN_RECIPIENT} AS k ${baseFrom}
           AND s.status IN ('sent', 'delivered')
           AND s.contact_id IS NOT NULL
           AND NOT (${bounceBySendId})
           AND NOT (${postfixPred})
       ) u`,
      baseParams
    ),
    db.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DISTINCT ${DISTINCT_CAMPAIGN_RECIPIENT} AS k ${baseFrom}
           AND (
             ${sqlEmailSendCountsAsDeliveryFailure("s")}
             OR (s.status IN ('sent', 'delivered') AND (${bounceBySendId}))
             OR (${postfixPred})
           )
           AND TRIM(COALESCE(s.to_email, '')) <> ''
       ) u`,
      baseParams
    )
  ]);
  const deliveredCount = Math.max(0, Number((successRes[0] as { c?: unknown }[])[0]?.c ?? 0));
  const failCount = Math.max(0, Number((failedRes[0] as { c?: unknown }[])[0]?.c ?? 0));
  return { totalSendAttempts: deliveredCount + failCount, deliveredCount };
}

export async function loadTenantEmailRangeStats(
  db: Pool,
  tenantId: number,
  fromY: string,
  toY: string,
  _clientTodayYmd?: string | null,
  lite = false,
  scopeFromEmail?: string | null,
  scopeFromEmails?: string[] | null
): Promise<TenantRangeStatsSummary> {
  const tzOffset = normalizeMysqlTimezoneOffset();
  const { start: startDt, endExclusive } = businessRangeMysqlBounds(fromY, toY, tzOffset);
  const sendRange = sqlCampaignSendActivityRangeAnd(startDt, endExclusive, tzOffset);
  const evtRange = sqlBusinessDatetimeBetweenAnd("e.created_at", startDt, endExclusive, tzOffset);
  const scopeEmails = normalizeScopeFromEmails(scopeFromEmail, scopeFromEmails);
  const sendFe = sqlSendFromEmailIn("s", scopeEmails);
  const sendEmailClause = sendFe.clause;
  const sendEmailParams = sendFe.params;

  const evtScope = sqlDeliveryEventAttributedToFromEmails("e", scopeEmails);
  const bouncePredSub = sqlSendRowHasBounceEvent("es");
  const scopedSub = sqlSubscribeAttributedToFromEmails("s", scopeEmails, bouncePredSub);
  const subscribeTodayYmd = businessTodayYmd();

  const subRange = sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive, tzOffset);
  const unsubRange = sqlBusinessDatetimeBetweenAnd("u.created_at", startDt, endExclusive, tzOffset);
  const scopedUnsub = sqlSubscribeAttributedToFromEmails("u", scopeEmails, bouncePredSub);
  const { start: todayStart, endExclusive: todayEndExclusive } = businessDayMysqlRange(subscribeTodayYmd, tzOffset);
  const todaySubRange = sqlBusinessDatetimeBetweenAnd("s.created_at", todayStart, todayEndExclusive, tzOffset);
  const todaySubScope = sqlSubscribeAttributedToFromEmails("s", scopeEmails, bouncePredSub);

  const sendSummaryP = loadSendDeliveredSummary(
    db,
    tenantId,
    sendRange,
    sendEmailClause,
    sendEmailParams
  );

  const openP = db.query(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT DISTINCT s.campaign_id, s.contact_id
           FROM email_sends s
           ${CRM_CONTACT_JOIN}
           INNER JOIN email_delivery_events e
             ON e.event_type = 'opened' AND e.email_send_id = s.id
           INNER JOIN email_campaigns c ON c.id = s.campaign_id
          WHERE c.tenant_id = ?
            AND s.contact_id IS NOT NULL
            ${sendEmailClause}
            ${evtRange.clause}
       ) t`,
    [tenantId, ...sendEmailParams, ...evtRange.params]
  );

  const complaintP = db.query(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT DISTINCT e.campaign_id, e.contact_id
           FROM email_delivery_events e
           INNER JOIN email_campaigns c ON c.id = e.campaign_id
          WHERE c.tenant_id = ?
            AND e.event_type = 'complaint'
            AND e.contact_id IS NOT NULL
            ${evtRange.clause}${evtScope.clause}
       ) t`,
    [tenantId, ...evtRange.params, ...evtScope.params]
  );

  const subP = db
    .query(
      `SELECT COUNT(*) AS sub_cnt
         FROM email_subscribe_events s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE c.tenant_id = ?${subRange.clause}${scopedSub.clause}`,
      [tenantId, ...subRange.params, ...scopedSub.params]
    )
    .catch(() => [[{ sub_cnt: 0 }]] as const);

  const unsubP = db
    .query(
      `SELECT COUNT(*) AS unsub_cnt
         FROM email_unsubscribe_events u
         INNER JOIN email_campaigns c ON c.id = u.campaign_id
        WHERE c.tenant_id = ?${unsubRange.clause}${scopedUnsub.clause}`,
      [tenantId, ...unsubRange.params, ...scopedUnsub.params]
    )
    .catch(() => [[{ unsub_cnt: 0 }]] as const);

  const todaySubP = db
    .query(
      `SELECT COUNT(*) AS sub_cnt
         FROM email_subscribe_events s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE c.tenant_id = ?${todaySubRange.clause}${todaySubScope.clause}`,
      [tenantId, ...todaySubRange.params, ...todaySubScope.params]
    )
    .catch(() => [[{ sub_cnt: 0 }]] as const);

  const todayDomainP =
    !lite
      ? db
          .query(
            `SELECT sub.from_email, COUNT(*) AS sub_cnt
           FROM (
             SELECT s.id,
               (
                 SELECT LOWER(TRIM(COALESCE(NULLIF(TRIM(es.from_email), ''), '')))
                   FROM email_sends es
                  WHERE es.campaign_id = s.campaign_id
                    AND es.contact_id = s.contact_id
                    AND es.status = 'sent'
                    AND NOT (${bouncePredSub})
                    AND es.created_at <= s.created_at
                  ORDER BY es.created_at DESC
                  LIMIT 1
               ) AS from_email
              FROM email_subscribe_events s
               INNER JOIN email_campaigns c ON c.id = s.campaign_id
              WHERE c.tenant_id = ?${todaySubRange.clause}${todaySubScope.clause}
           ) sub
          WHERE sub.from_email IS NOT NULL AND sub.from_email <> ''${
            scopeEmails.length > 0
              ? ` AND sub.from_email IN (${scopeEmails.map(() => "?").join(",")})`
              : ""
          }
          GROUP BY sub.from_email
          ORDER BY sub_cnt DESC, sub.from_email ASC`,
            [
              tenantId,
              ...todaySubRange.params,
              ...todaySubScope.params,
              ...scopeEmails
            ]
          )
          .catch(() => [[]] as const)
      : Promise.resolve([[]] as const);

  const [
    sendSummary,
    openRes,
    complaintRes,
    subRes,
    unsubRes,
    todaySubRes,
    todayDomainRes
  ] = await Promise.all([
    sendSummaryP,
    openP,
    complaintP,
    subP,
    unsubP,
    todaySubP,
    todayDomainP
  ]);

  const openedCount = Number(((openRes[0] as { c?: unknown }[]) ?? [])[0]?.c ?? 0);
  const complaintCount = Number(((complaintRes[0] as { c?: unknown }[]) ?? [])[0]?.c ?? 0);
  const subscribeCount = Number(((subRes[0] as { sub_cnt?: unknown }[]) ?? [])[0]?.sub_cnt ?? 0);
  const unsubscribeCount = Number(((unsubRes[0] as { unsub_cnt?: unknown }[]) ?? [])[0]?.unsub_cnt ?? 0);
  const subscribeTodayCount = Number(((todaySubRes[0] as { sub_cnt?: unknown }[]) ?? [])[0]?.sub_cnt ?? 0);

  let subscribeTodayBySendingDomain: Array<{ fromEmail: string; count: number }> = [];
  if (!lite) {
    subscribeTodayBySendingDomain = ((todayDomainRes[0] as { from_email?: unknown; sub_cnt?: unknown }[]) ?? [])
      .map((r) => ({
        fromEmail: String(r.from_email ?? "").trim(),
        count: Number(r.sub_cnt ?? 0)
      }))
      .filter((r) => r.fromEmail && r.count > 0);
  }

  return {
    totalSendAttempts: sendSummary.totalSendAttempts,
    deliveredCount: sendSummary.deliveredCount,
    openedCount,
    subscribeCount,
    unsubscribeCount,
    complaintCount,
    subscribeTodayCount,
    subscribeTodayBySendingDomain,
    subscribeTodayDate: subscribeTodayYmd
  };
}
