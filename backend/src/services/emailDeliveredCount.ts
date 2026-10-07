import type { Pool } from "mysql2/promise";
import { businessTodayYmd, sqlBusinessDayCampaignSendActivityAnd } from "./businessCalendar.js";
import { sqlSendRowHasPostfixDeferredForCampaign } from "./campaignSendContactsList.js";

const CRM_CONTACT_JOIN = "INNER JOIN email_contacts c_exist ON c_exist.id = s.contact_id";

/** 与今日活动概览加总一致：按 (campaign_id, contact_id) 计一次 */
const DISTINCT_CAMPAIGN_CONTACT = "s.campaign_id, s.contact_id";

function deliveredDistinctContactSubquery(joinSendRuns: string, extraWhere = ""): string {
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id)`;
  const postfixPred = sqlSendRowHasPostfixDeferredForCampaign("s");
  return `SELECT COUNT(*) AS c FROM (
    SELECT DISTINCT ${DISTINCT_CAMPAIGN_CONTACT}
      FROM email_sends s
      ${joinSendRuns}
      ${CRM_CONTACT_JOIN}
      INNER JOIN email_campaigns c ON c.id = s.campaign_id
     WHERE c.tenant_id = ?
       AND s.contact_id IS NOT NULL
       ${extraWhere}
       AND s.status IN ('sent', 'delivered')
       AND NOT (${bounceBySendId})
       AND NOT (${postfixPred})
  ) u`;
}

const laneVpsGroupJoinSql = `
       INNER JOIN smtp_profiles sp ON sp.id = ec.smtp_profile_id
       LEFT JOIN email_dedicated_servers eds
         ON eds.id = sp.dedicated_server_id AND eds.tenant_id = ec.tenant_id AND eds.status <> 'cancelled'
       LEFT JOIN email_dedicated_servers eds2
         ON eds2.smtp_profile_id = sp.id AND eds2.tenant_id = ec.tenant_id AND eds2.status <> 'cancelled'`;

/**
 * 租户当日送达成功（与统计页 tenant-range「今天」、今日概览加总同口径：
 * 按活动+联系人，不含 postfix / 退信 / SMTP 失败）。
 */
export async function countTenantDeliveredToday(db: Pool, tenantId: number): Promise<number> {
  const tid = Math.floor(Number(tenantId) || 0);
  if (tid <= 0) return 0;
  const activityDay = sqlBusinessDayCampaignSendActivityAnd(businessTodayYmd());
  const [rows] = await db.query(
    deliveredDistinctContactSubquery(activityDay.joinSendRuns, activityDay.clause),
    [tid, ...activityDay.params]
  );
  return Math.max(0, Number((rows as { c?: unknown }[])[0]?.c ?? 0));
}

/** 单条 VPS 专线组当日送达成功（工作台展示；口径同上，限定 vps_group） */
export async function countLaneDeliveredToday(
  db: Pool,
  tenantId: number,
  vpsGroupId: number
): Promise<number> {
  const tid = Math.floor(Number(tenantId) || 0);
  const gid = Math.floor(Number(vpsGroupId) || 0);
  if (tid <= 0 || gid <= 0) return 0;
  const activityDay = sqlBusinessDayCampaignSendActivityAnd(businessTodayYmd());
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT DISTINCT ${DISTINCT_CAMPAIGN_CONTACT}
         FROM email_sends s
         ${activityDay.joinSendRuns}
         ${CRM_CONTACT_JOIN}
         INNER JOIN email_campaigns ec ON ec.id = s.campaign_id
         ${laneVpsGroupJoinSql}
        WHERE ec.tenant_id = ?
          AND s.contact_id IS NOT NULL
          AND COALESCE(eds.vps_group_id, eds2.vps_group_id) = ?
          ${activityDay.clause}
          AND s.status IN ('sent', 'delivered')
          AND NOT (EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id))
          AND NOT (${sqlSendRowHasPostfixDeferredForCampaign("s")})
     ) u`,
    [tid, gid, ...activityDay.params]
  );
  return Math.max(0, Number((rows as { c?: unknown }[])[0]?.c ?? 0));
}
