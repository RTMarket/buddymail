import type { Pool } from "mysql2/promise";
import { businessRangeMysqlBounds, businessTodayYmd, formatBusinessDateTime } from "./businessCalendar.js";
import { sqlSendRowHasBounceEvent } from "./emailBounceReconcile.js";
import { resolveTenantPackageStatsStartYmd } from "./emailPackageStatsStart.js";

export type PackageSuccessCampaignDay = {
  campaignId: number;
  campaignCode: string;
  name: string;
  successCount: number;
};

export type PackageSuccessDailyDay = {
  date: string;
  totalSuccess: number;
  campaigns: PackageSuccessCampaignDay[];
};

export type TenantPackageSuccessDailySeries = {
  statsStartYmd: string | null;
  rangeFrom: string;
  rangeTo: string;
  days: PackageSuccessDailyDay[];
};

const MAX_CHART_DAYS = 400;

function padCampaignCode(raw: unknown, id: number): string {
  const s = String(raw ?? "").replace(/\D/g, "");
  if (s) return s.padStart(6, "0").slice(-6);
  return String(id).padStart(6, "0").slice(-6);
}

function ymdFromRowDate(dv: unknown): string {
  if (dv instanceof Date) {
    return formatBusinessDateTime(dv)?.slice(0, 10) ?? "";
  }
  return String(dv ?? "").slice(0, 10);
}

function enumerateYmdRange(fromY: string, toY: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromY}T12:00:00+08:00`);
  const end = new Date(`${toY}T12:00:00+08:00`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() + 1);
    if (out.length > MAX_CHART_DAYS) break;
  }
  return out;
}

export async function loadTenantPackageSuccessDailySeries(
  db: Pool,
  tenantId: number,
  chartFromY?: string | null,
  chartToY?: string | null
): Promise<TenantPackageSuccessDailySeries> {
  const todayY = businessTodayYmd();
  const statsStartYmd = await resolveTenantPackageStatsStartYmd(db, tenantId);
  let rangeTo = chartToY && /^\d{4}-\d{2}-\d{2}$/.test(chartToY) ? chartToY : todayY;
  let rangeFrom =
    chartFromY && /^\d{4}-\d{2}-\d{2}$/.test(chartFromY)
      ? chartFromY
      : statsStartYmd ?? rangeTo;
  if (statsStartYmd && rangeFrom < statsStartYmd) rangeFrom = statsStartYmd;
  if (rangeFrom > rangeTo) {
    const t = rangeFrom;
    rangeFrom = rangeTo;
    rangeTo = t;
  }

  const allDates = enumerateYmdRange(rangeFrom, rangeTo);
  if (allDates.length === 0) {
    return { statsStartYmd, rangeFrom, rangeTo, days: [] };
  }

  if (allDates.length > MAX_CHART_DAYS) {
    rangeFrom = allDates[allDates.length - MAX_CHART_DAYS]!;
  }

  const { start: startDt, endExclusive } = businessRangeMysqlBounds(rangeFrom, rangeTo);
  const bouncePred = sqlSendRowHasBounceEvent("s");

  const [rows] = await db.query(
    `SELECT
        DATE(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) AS d,
        s.campaign_id AS campaign_id,
        c.campaign_code AS campaign_code,
        c.name AS campaign_name,
        COUNT(*) AS success_cnt
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
       WHERE c.tenant_id = ?
         AND s.status = 'sent'
         AND NOT (${bouncePred})
         AND s.created_at >= ? AND s.created_at < ?
       GROUP BY d, s.campaign_id, c.campaign_code, c.name
       ORDER BY d ASC, success_cnt DESC, s.campaign_id ASC`,
    [tenantId, startDt, endExclusive]
  );

  const byDate = new Map<string, PackageSuccessCampaignDay[]>();
  for (const r of rows as Array<{
    d?: unknown;
    campaign_id?: unknown;
    campaign_code?: unknown;
    campaign_name?: unknown;
    success_cnt?: unknown;
  }>) {
    const date = ymdFromRowDate(r.d);
    if (!date) continue;
    const campaignId = Number(r.campaign_id ?? 0);
    if (!campaignId) continue;
    const successCount = Number(r.success_cnt ?? 0);
    if (successCount <= 0) continue;
    const list = byDate.get(date) ?? [];
    list.push({
      campaignId,
      campaignCode: padCampaignCode(r.campaign_code, campaignId),
      name: String(r.campaign_name ?? "").trim() || `活动 ${campaignId}`,
      successCount
    });
    byDate.set(date, list);
  }

  const days: PackageSuccessDailyDay[] = enumerateYmdRange(rangeFrom, rangeTo).map((date) => {
    const campaigns = (byDate.get(date) ?? []).sort(
      (a, b) => b.successCount - a.successCount || a.campaignId - b.campaignId
    );
    const totalSuccess = campaigns.reduce((s, c) => s + c.successCount, 0);
    return { date, totalSuccess, campaigns };
  });

  return { statsStartYmd, rangeFrom, rangeTo, days };
}
