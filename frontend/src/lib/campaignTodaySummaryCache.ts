import { businessTodayYmd } from "./businessCalendar";

export type TodaySummarySnapshot = {
  activityCount: number;
  totalAttempts: number;
  totalSuccess: number;
  totalSubscribe: number;
  activities: Array<{
    id: number;
    campaign_code: string | null;
    name: string;
    totalAttempts: number;
    successCount: number;
    subscribeCount: number;
  }>;
  successSeries: Array<{
    label: string;
    success: number;
    date?: string;
    segments?: Array<{ timeRange: string; success: number }>;
  }>;
};

let cached: { day: string; summary: TodaySummarySnapshot } | null = null;

export function readCachedTodaySummary(dayYmd = businessTodayYmd()): TodaySummarySnapshot | null {
  if (cached?.day === dayYmd) return cached.summary;
  return null;
}

export function writeCachedTodaySummary(dayYmd: string, summary: TodaySummarySnapshot) {
  cached = { day: dayYmd, summary };
}

export function invalidateCachedTodaySummary() {
  cached = null;
}
