import type { Pool } from "mysql2/promise";
import { sqlSendRowHasBounceEvent, sqlBounceEventMatchesSend } from "./emailBounceReconcile.js";
import { sqlSendRowHasBounceEventImmediate } from "./emailCampaignSendRunService.js";
import { loadCampaignEngagementSummary } from "./campaignEngagementStats.js";
import { sqlSumEmailSendSmtpFailures } from "./campaignSendDeliveryFailure.js";
import { sqlSendRunFilter } from "./campaignSendRunFilter.js";

export type CampaignRoundStatsSummary = {
  deliveredPct: number;
  openedPct: number;
  bouncedPct: number;
  unsubscribeCount: number;
  unsubscribePct: number;
  subscribeCount: number;
  subscribePct: number;
  complaintCount: number;
  openedCount: number;
  clickedCount: number;
  deliveredUnconfirmedCount: number;
  successCount: number;
  failCount: number;
  successRatePct: number;
};

/** 单轮发送：7 栏与名单用的送达/互动汇总（allTime，不按日期截断） */
export async function computeCampaignRoundStatsSummary(
  db: Pool,
  campaignId: number,
  sendRunId: number,
  fromClause: string,
  fromParams: unknown[]
): Promise<CampaignRoundStatsSummary> {
  const runFilter = sqlSendRunFilter("s", sendRunId);
  const [sumRows] = await db.query(
    `SELECT
        SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent_ok,
        ${sqlSumEmailSendSmtpFailures("s")} AS sent_fail
       FROM email_sends s
       WHERE s.campaign_id = ?${runFilter.clause}${fromClause}`,
    [campaignId, ...runFilter.params, ...fromParams]
  );
  const sum = (sumRows as Array<Record<string, unknown>>)[0] ?? {};
  let successCount = Number(sum.sent_ok ?? 0);
  let failedSendCount = Number(sum.sent_fail ?? 0);
  const bouncePred = sqlSendRowHasBounceEvent("s");
  const [bounceRows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_sends s
       WHERE s.campaign_id = ?
         AND s.status = 'sent'
         ${runFilter.clause}${fromClause}
         AND EXISTS (
           SELECT 1 FROM email_delivery_events e
           WHERE e.event_type = 'bounced' AND ${sqlBounceEventMatchesSend("e", "s")}
         )`,
    [campaignId, ...runFilter.params, ...fromParams]
  );
  const bouncedMatchedSentCount = Number((bounceRows as Array<{ c?: unknown }>)[0]?.c ?? 0);
  const bouncedDeduct = Math.max(0, Math.min(successCount, bouncedMatchedSentCount));
  const deliveredSuccessCount = Math.max(0, successCount - bouncedDeduct);
  const bounceImm = sqlSendRowHasBounceEventImmediate("s");
  const [failDistinctRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(s.to_email))) AS c
       FROM email_sends s
      WHERE s.campaign_id = ?
        ${runFilter.clause}${fromClause}
        AND (
          s.status IN ('failed', 'suppressed')
          OR (${bounceImm})
        )`,
    [campaignId, ...runFilter.params, ...fromParams]
  );
  const failCountDistinct = Number((failDistinctRows as Array<{ c?: unknown }>)[0]?.c ?? 0);
  const failCount = Math.max(failedSendCount + bouncedDeduct, failCountDistinct);
  const attemptsInRange = deliveredSuccessCount + failCount;
  const successRatePct =
    attemptsInRange > 0 ? Math.round((100 * deliveredSuccessCount) / attemptsInRange) : 0;

  const sendRange = { clause: runFilter.clause, params: [...runFilter.params] };
  const subRange = {
    clause: ` AND EXISTS (
      SELECT 1 FROM email_sends es
       WHERE es.campaign_id = s.campaign_id
         AND es.contact_id = s.contact_id
         AND es.send_run_id = ?
    )`,
    params: [sendRunId]
  };
  const unsubRange = {
    clause: ` AND EXISTS (
      SELECT 1 FROM email_sends es
       WHERE es.campaign_id = u.campaign_id
         AND es.contact_id = u.contact_id
         AND es.send_run_id = ?
    )`,
    params: [sendRunId]
  };
  const evtRange = {
    clause: ` AND s.send_run_id = ?`,
    params: [sendRunId]
  };

  const engagement = await loadCampaignEngagementSummary(db, campaignId, {
    sendRange,
    subRange,
    fromClause,
    fromParams,
    unsubRange,
    evtRange
  });

  const openedCount = engagement.openedCount;
  const subscribeCount = engagement.subscribeCount;
  const unsubscribeCount = engagement.unsubscribeCount;
  const complaintCount = engagement.complaintCount;
  const deliveredUnconfirmedCount = Math.min(
    deliveredSuccessCount,
    Math.max(0, engagement.deliveredUnconfirmedCount)
  );

  return {
    deliveredPct: successRatePct,
    openedPct:
      deliveredSuccessCount > 0 ? Math.round((100 * openedCount) / deliveredSuccessCount) : 0,
    bouncedPct: attemptsInRange > 0 ? Math.round((100 * failCount) / attemptsInRange) : 0,
    unsubscribeCount,
    unsubscribePct:
      deliveredSuccessCount > 0
        ? Math.round((100 * unsubscribeCount) / deliveredSuccessCount)
        : 0,
    subscribeCount,
    subscribePct:
      deliveredSuccessCount > 0 ? Math.round((100 * subscribeCount) / deliveredSuccessCount) : 0,
    complaintCount,
    openedCount,
    clickedCount: engagement.clickedCount,
    deliveredUnconfirmedCount,
    successCount: deliveredSuccessCount,
    failCount,
    successRatePct
  };
}
