import type { Pool } from "mysql2/promise";
import { formatBusinessDateTime } from "./businessCalendar.js";
import { sqlSendRowHasBounceEvent } from "./emailBounceReconcile.js";

export type CampaignSuccessChartPoint = {
  label: string;
  success: number;
  fail: number;
  date?: string;
  segments?: Array<{ timeRange: string; success: number }>;
};

const SLOT_STARTS = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] as const;
const SLOT_ENDS = ["02:59", "05:59", "08:59", "11:59", "14:59", "17:59", "20:59", "23:59"] as const;

export function chartSlotTimeRange(bucketIndex: number): string {
  const i = Math.max(0, Math.min(7, bucketIndex));
  return `${SLOT_STARTS[i]}–${SLOT_ENDS[i]}`;
}

export function ymdFromDbDateValue(dv: unknown): string {
  if (dv instanceof Date) {
    return formatBusinessDateTime(dv)?.slice(0, 10) ?? "";
  }
  return String(dv ?? "").slice(0, 10);
}

export function enumerateYmdInclusive(fromY: string, toY: string, maxDays = 90): string[] {
  let a = fromY;
  let b = toY;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const out: string[] = [];
  const cursor = new Date(`${a}T12:00:00+08:00`);
  const end = new Date(`${b}T12:00:00+08:00`);
  while (cursor.getTime() <= end.getTime() && out.length < maxDays) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  if (out.length >= maxDays && a < b) {
    const trimmed: string[] = [];
    const c2 = new Date(`${b}T12:00:00+08:00`);
    for (let i = 0; i < maxDays; i++) {
      trimmed.unshift(
        `${c2.getFullYear()}-${String(c2.getMonth() + 1).padStart(2, "0")}-${String(c2.getDate()).padStart(2, "0")}`
      );
      c2.setDate(c2.getDate() - 1);
    }
    return trimmed.reverse();
  }
  return out;
}

/** 活动全周期：按自然日汇总发送成功，并附当日各 3 小时发送时段明细 */
export async function buildCampaignAllTimeSuccessSeries(
  db: Pool,
  campaignId: number,
  fromClause: string,
  fromParams: unknown[],
  firstYmd: string | null,
  lastYmd: string | null,
  fallbackSuccess: number,
  fallbackFail: number
): Promise<CampaignSuccessChartPoint[]> {
  const bouncePred = sqlSendRowHasBounceEvent("s");
  const dateExpr = `DATE(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at))`;
  const hourExpr = `FLOOR(HOUR(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) / 3)`;

  const [dayRows] = await db.query(
    `SELECT ${dateExpr} AS d,
        SUM(CASE WHEN s.status = 'sent' AND NOT (${bouncePred}) THEN 1 ELSE 0 END) AS okc
       FROM email_sends s
       WHERE s.campaign_id = ? ${fromClause}
       GROUP BY d ORDER BY d ASC`,
    [campaignId, ...fromParams]
  );

  const [buckRows] = await db.query(
    `SELECT ${dateExpr} AS d, ${hourExpr} AS bi,
        SUM(CASE WHEN s.status = 'sent' AND NOT (${bouncePred}) THEN 1 ELSE 0 END) AS okc
       FROM email_sends s
       WHERE s.campaign_id = ? ${fromClause}
       GROUP BY d, bi
       HAVING okc > 0
       ORDER BY d ASC, bi ASC`,
    [campaignId, ...fromParams]
  );

  const byD = new Map<string, number>();
  for (const r of dayRows as { d?: unknown; okc?: unknown }[]) {
    const key = ymdFromDbDateValue(r.d);
    if (!key) continue;
    byD.set(key, Number(r.okc ?? 0));
  }

  const segByDate = new Map<string, Array<{ timeRange: string; success: number }>>();
  for (const r of buckRows as { d?: unknown; bi?: unknown; okc?: unknown }[]) {
    const key = ymdFromDbDateValue(r.d);
    if (!key) continue;
    const list = segByDate.get(key) ?? [];
    list.push({
      timeRange: chartSlotTimeRange(Number(r.bi ?? 0)),
      success: Number(r.okc ?? 0)
    });
    segByDate.set(key, list);
  }

  const keysFromData = [...byD.keys()].sort();
  const rangeStart = firstYmd ?? keysFromData[0] ?? null;
  const rangeEnd = lastYmd ?? keysFromData[keysFromData.length - 1] ?? null;
  if (!rangeStart || !rangeEnd) {
    if (fallbackSuccess > 0) {
      return [{ label: "累计", success: fallbackSuccess, fail: fallbackFail, segments: [] }];
    }
    return [];
  }

  const series: CampaignSuccessChartPoint[] = [];
  for (const key of enumerateYmdInclusive(rangeStart, rangeEnd, 90)) {
    const mm = key.slice(5, 7);
    const dd = key.slice(8, 10);
    series.push({
      date: key,
      label: `${mm}-${dd}`,
      success: byD.get(key) ?? 0,
      fail: 0,
      segments: segByDate.get(key) ?? []
    });
  }
  if (series.length === 0 && fallbackSuccess > 0) {
    series.push({ label: "累计", success: fallbackSuccess, fail: fallbackFail, segments: [] });
  }
  return series;
}
