import type { Pool } from "mysql2/promise";
import {
  businessDayMysqlRange,
  sqlBusinessDayCampaignSendActivityAnd,
  sqlBusinessDatetimeBetweenAnd
} from "./businessCalendar.js";
import { chartSlotTimeRange } from "./campaignSuccessChartSeries.js";
import { sqlSendRowHasBounceEvent } from "./emailBounceReconcile.js";
import { sqlSendRowHasPostfixDeferredForCampaign } from "./campaignSendContactsList.js";

const CRM_CONTACT_JOIN = "INNER JOIN email_contacts c_exist ON c_exist.id = s.contact_id";

/** 该活动是否已有正式发送记录（任一 email_sends 行即视为已发过，不可再次发送） */
export async function campaignHasSendHistory(db: Pool, campaignId: number): Promise<boolean> {
  const id = Math.floor(Number(campaignId) || 0);
  if (id <= 0) return false;
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM email_sends WHERE campaign_id = ? LIMIT 1`,
    [id]
  );
  return (rows as Array<{ ok?: unknown }>).length > 0;
}

export type TodayCampaignActivityRow = {
  id: number;
  campaign_code: string | null;
  name: string;
  totalAttempts: number;
  successCount: number;
  subscribeCount: number;
};

export type TodaySuccessSeriesPoint = {
  label: string;
  success: number;
  date?: string;
  segments?: Array<{ timeRange: string; success: number }>;
};

export type TodayCampaignActivitiesSummary = {
  activityCount: number;
  totalAttempts: number;
  totalSuccess: number;
  totalSubscribe: number;
  activities: TodayCampaignActivityRow[];
  /** 今日全部活动：按 3 小时时段汇总的发信成功折线 */
  successSeries: TodaySuccessSeriesPoint[];
};

/** 今日租户全部营销活动：按北京时间 3 小时桶汇总发信成功 */
export async function buildTodayTenantSuccessSeries(
  db: Pool,
  tenantId: number,
  dayYmd: string,
  opts?: { lite?: boolean }
): Promise<TodaySuccessSeriesPoint[]> {
  if (tenantId <= 0) return [];
  const activityDay = sqlBusinessDayCampaignSendActivityAnd(dayYmd);
  const lite = opts?.lite === true;
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id)`;
  const postfixPred = sqlSendRowHasPostfixDeferredForCampaign("s");
  const successExpr = lite
    ? `SUM(CASE WHEN s.status IN ('sent', 'delivered') AND NOT (${bounceBySendId}) AND NOT (${postfixPred}) THEN 1 ELSE 0 END)`
    : `SUM(CASE WHEN s.status IN ('sent', 'delivered') AND NOT (${sqlSendRowHasBounceEvent("s")}) AND NOT (${postfixPred}) THEN 1 ELSE 0 END)`;
  const [buckRows] = await db.query(
    `SELECT FLOOR(HOUR(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) / 3) AS bi,
            ${successExpr} AS okc
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
       ${activityDay.joinSendRuns}
       WHERE c.tenant_id = ?${activityDay.clause}
       GROUP BY bi
       ORDER BY bi`,
    [tenantId, ...activityDay.params]
  );
  const byB = new Map<number, number>();
  for (const r of buckRows as Array<{ bi?: unknown; okc?: unknown }>) {
    byB.set(Number(r.bi ?? 0), Math.max(0, Number(r.okc ?? 0)));
  }
  const labels = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
  const series: TodaySuccessSeriesPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const ok = byB.get(i) ?? 0;
    series.push({
      label: labels[i]!,
      date: dayYmd,
      success: ok,
      segments: ok > 0 ? [{ timeRange: chartSlotTimeRange(i), success: ok }] : []
    });
  }
  return series;
}

/** 今日（按 YYYY-MM-DD）各场营销活动汇总，供统计页「今日活动发送概览」 */
export async function loadTodayCampaignActivitiesSummary(
  db: Pool,
  tenantId: number,
  dayYmd: string,
  opts?: { lite?: boolean }
): Promise<TodayCampaignActivitiesSummary> {
  if (tenantId <= 0) {
    return {
      activityCount: 0,
      totalAttempts: 0,
      totalSuccess: 0,
      totalSubscribe: 0,
      activities: [],
      successSeries: []
    };
  }
  const { start: dayStart, endExclusive: dayEndStr } = businessDayMysqlRange(dayYmd);
  const activityDay = sqlBusinessDayCampaignSendActivityAnd(dayYmd);
  const bounceBySendId = `EXISTS (SELECT 1 FROM email_delivery_events e WHERE e.event_type = 'bounced' AND e.email_send_id = s.id)`;
  const postfixPred = sqlSendRowHasPostfixDeferredForCampaign("s");
  const [rows] = await db.query(
    `SELECT
       c.id,
       c.campaign_code,
       c.name,
       COUNT(DISTINCT s.contact_id) AS all_count,
       COUNT(DISTINCT CASE
         WHEN s.status IN ('sent', 'delivered')
           AND NOT (${bounceBySendId})
           AND NOT (${postfixPred})
         THEN s.contact_id END) AS success_count,
       MAX(s.created_at) AS last_send_at
     FROM email_campaigns c
     INNER JOIN email_sends s ON s.campaign_id = c.id
     ${activityDay.joinSendRuns}
     ${CRM_CONTACT_JOIN}
     WHERE c.tenant_id = ? AND s.contact_id IS NOT NULL${activityDay.clause}
     GROUP BY c.id, c.campaign_code, c.name
     ORDER BY last_send_at DESC, c.id DESC
     LIMIT 200`,
    [tenantId, ...activityDay.params]
  );
  const byId = new Map<number, TodayCampaignActivityRow & { lastSendAt?: unknown }>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = Number(row.id ?? 0);
    if (id <= 0) continue;
    const allCount = Math.max(0, Number(row.all_count ?? 0));
    const successCount = Math.max(0, Number(row.success_count ?? 0));
    byId.set(id, {
      id,
      campaign_code: row.campaign_code != null ? String(row.campaign_code) : null,
      name: String(row.name ?? ""),
      totalAttempts: allCount,
      successCount,
      subscribeCount: 0,
      lastSendAt: row.last_send_at
    });
  }
  /** 仅统计当日确有发信记录的活动；勿用 send_run.ended_at 托底（跨日/时区易把昨日场次算进今日） */
  const base = [...byId.values()]
    .filter((r) => r.totalAttempts > 0)
    .sort((a, b) => {
      const ta = a.lastSendAt ? Date.parse(String(a.lastSendAt)) : 0;
      const tb = b.lastSendAt ? Date.parse(String(b.lastSendAt)) : 0;
      if (tb !== ta) return tb - ta;
      return b.id - a.id;
    })
    .map(({ lastSendAt: _drop, ...r }) => r);
  const ids = base.map((r) => r.id).filter((n) => n > 0);
  if (ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const subDayRange = sqlBusinessDatetimeBetweenAnd("created_at", dayStart, dayEndStr);
    const [subRows] = await db.query(
      `SELECT campaign_id, COUNT(DISTINCT LOWER(TRIM(email))) AS c
         FROM email_subscribe_events
        WHERE campaign_id IN (${ph})${subDayRange.clause}
          AND TRIM(COALESCE(email, '')) <> ''
        GROUP BY campaign_id`,
      [...ids, ...subDayRange.params]
    );
    const subMap = new Map<number, number>();
    for (const row of subRows as Array<{ campaign_id?: unknown; c?: unknown }>) {
      subMap.set(Number(row.campaign_id ?? 0), Math.max(0, Number(row.c ?? 0)));
    }
    for (const r of base) {
      r.subscribeCount = subMap.get(r.id) ?? 0;
    }
  }
  let totalAttempts = 0;
  let totalSuccess = 0;
  let totalSubscribe = 0;
  for (const r of base) {
    totalAttempts += r.totalAttempts;
    totalSuccess += r.successCount;
    totalSubscribe += r.subscribeCount;
  }
  const successSeries = await buildTodayTenantSuccessSeries(db, tenantId, dayYmd, opts);
  return {
    activityCount: base.length,
    totalAttempts,
    totalSuccess,
    totalSubscribe,
    activities: base,
    successSeries
  };
}
