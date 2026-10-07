/** 邮件营销统计统一使用北京时间 UTC+8。 */
export const BUSINESS_STATS_TIME_ZONE = "Asia/Shanghai";

export function businessTodayYmd(timeZone = BUSINESS_STATS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** 业务日历向前推 N 天（用于「昨天」「近7天」等快捷筛选） */
export function businessDaysAgoYmd(daysAgo: number, timeZone = BUSINESS_STATS_TIME_ZONE): string {
  const anchor = new Date(`${businessTodayYmd(timeZone)}T12:00:00+08:00`);
  anchor.setDate(anchor.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(anchor);
}

export function businessDaysAgoFromYmd(anchorYmd: string, daysAgo: number): string {
  const anchor = new Date(`${anchorYmd}T12:00:00+08:00`);
  anchor.setDate(anchor.getDate() - Math.max(0, Math.floor(daysAgo)));
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_STATS_TIME_ZONE }).format(anchor);
}

/** 从业务时区时间串取 HH:mm */
export function businessTimeHm(s: string | null | undefined): string {
  if (!s) return "";
  const norm = String(s).trim().replace("T", " ");
  const m = norm.match(/(\d{2}):(\d{2})/);
  if (!m || norm.length < 16) return norm.slice(11, 16) || norm;
  return `${m[1]}:${m[2]}`;
}

/** 活跃时段：同日显示 14:35 ~ 16:20，同一分钟只显示一个时刻 */
export function formatActiveTimeRange(
  firstAt: string | null | undefined,
  lastAt: string | null | undefined,
  businessDay?: string
): string {
  const fFull = firstAt ? String(firstAt).trim().replace("T", " ") : "";
  const lFull = lastAt ? String(lastAt).trim().replace("T", " ") : "";
  if (!fFull && !lFull) return "—";
  const fHm = businessTimeHm(fFull);
  const lHm = businessTimeHm(lFull);
  if (!fHm && !lHm) return "—";
  if (!lHm || fHm === lHm) return fHm;
  const fDay = fFull.slice(0, 10);
  const lDay = lFull.slice(0, 10);
  if (fDay === lDay && (!businessDay || fDay === businessDay)) {
    return `${fHm} ~ ${lHm}`;
  }
  if (fDay === lDay) {
    return `${fDay.slice(5)} ${fHm} ~ ${lHm}`;
  }
  return `${fFull.slice(0, 16)} ~ ${lFull.slice(0, 16)}`;
}

export function formatBusinessDateTime(s: string | null | undefined): string {
  if (!s) return "-";
  const norm = String(s).trim().replace("T", " ");
  if (norm.length >= 16) return norm.slice(0, 16);
  return norm.slice(0, 19).replace("T", " ");
}
