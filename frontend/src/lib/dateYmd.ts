/** 本地日历日 yyyy-mm-dd，与发布记录等页共用 */

export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const da = parts[2]!;
  const dt = new Date(y, mo - 1, da);
  dt.setDate(dt.getDate() + delta);
  return localYmd(dt);
}

export function todayYmd(): string {
  return localYmd(new Date());
}

export function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localYmd(d);
}

/** 近 7 个自然日，不含今天：从「昨天往前共 7 天」 */
export function last7ExcludingTodayRange(): { start: string; end: string; labels: string[] } {
  const end = yesterdayYmd();
  const start = addDaysToYmd(todayYmd(), -7);
  const labels: string[] = [];
  let cur = start;
  while (cur <= end) {
    labels.push(cur);
    cur = addDaysToYmd(cur, 1);
  }
  return { start, end, labels };
}
