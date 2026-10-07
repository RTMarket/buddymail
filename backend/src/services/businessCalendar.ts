/** 邮件营销等业务统计使用的日历日：默认北京时间 */
export const BUSINESS_STATS_TIME_ZONE = "Asia/Shanghai";

type BusinessDateParts = {
  y: string;
  m: string;
  d: string;
  hh: string;
  mm: string;
  ss: string;
};

function businessDateParts(dt: Date, timeZone = BUSINESS_STATS_TIME_ZONE): BusinessDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(dt);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    y: pick("year"),
    m: pick("month"),
    d: pick("day"),
    hh: pick("hour"),
    mm: pick("minute"),
    ss: pick("second")
  };
}

/** 将时刻格式化为业务时区 MySQL 时间串 YYYY-MM-DD HH:mm:ss */
export function dateToBusinessMysql(dt: Date, timeZone = BUSINESS_STATS_TIME_ZONE): string {
  const p = businessDateParts(dt, timeZone);
  return `${p.y}-${p.m}-${p.d} ${p.hh}:${p.mm}:${p.ss}`;
}

function parseBusinessDateTimeInput(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    const d = new Date(s.replace(" ", "T") + "+08:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 展示用：业务时区 YYYY-MM-DD HH:mm:ss */
export function formatBusinessDateTime(v: unknown, timeZone = BUSINESS_STATS_TIME_ZONE): string | null {
  const d = parseBusinessDateTimeInput(v);
  if (!d) return null;
  return dateToBusinessMysql(d, timeZone);
}

/** 当前业务日 YYYY-MM-DD（默认北京时间） */
export function businessTodayYmd(timeZone = BUSINESS_STATS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function serverTodayYmdForTimeZone(timeZone?: string | null): string {
  const tz = String(timeZone ?? "").trim();
  try {
    if (tz) return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    /* fall back below */
  }
  return businessTodayYmd();
}

export function daysAgoYmdFromServerToday(daysAgo: number, timeZone?: string | null): string {
  const today = serverTodayYmdForTimeZone(timeZone);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(daysAgo)));
  return d.toISOString().slice(0, 10);
}

export function normalizeMysqlTimezoneOffset(v?: string | null): string {
  const s = String(v ?? "").trim();
  return /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(s) ? s : "+08:00";
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 业务日 [00:00:00, 次日 00:00:00) 的 MySQL 时间字符串（与 stats 其它日期筛选写法一致） */
export function businessDayMysqlRange(ymd: string, timeZone = BUSINESS_STATS_TIME_ZONE): {
  start: string;
  endExclusive: string;
} {
  const start = `${ymd} 00:00:00`;
  if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timeZone)) {
    return { start, endExclusive: `${addDaysYmd(ymd, 1)} 00:00:00` };
  }
  const anchor = new Date(`${ymd}T00:00:00+08:00`);
  const next = new Date(anchor.getTime() + 86_400_000);
  const endYmd = new Intl.DateTimeFormat("en-CA", { timeZone }).format(next);
  return { start, endExclusive: `${endYmd} 00:00:00` };
}

/** 闭区间 [fromYmd, toYmd] 对应 MySQL 时间窗 [from 00:00:00, to 次日 00:00:00) */
export function businessRangeMysqlBounds(
  fromYmd: string,
  toYmd: string,
  timeZone = BUSINESS_STATS_TIME_ZONE
): { start: string; endExclusive: string } {
  const { start } = businessDayMysqlRange(fromYmd, timeZone);
  const { endExclusive } = businessDayMysqlRange(toYmd, timeZone);
  return { start, endExclusive };
}

/** 从库内时间戳取业务日 YYYY-MM-DD（默认北京时间） */
export function businessYmdFromDbDatetime(
  v: unknown,
  timeZone = BUSINESS_STATS_TIME_ZONE
): string | null {
  return formatBusinessDateTime(v, timeZone)?.slice(0, 10) ?? null;
}

/**
 * 将库内 datetime 转为业务时区时刻再与 [start, endExclusive) 比较。
 * CONVERT_TZ 不可用时回退为原列（兼容库内已是北京时间字符串的场景）。
 */
export function sqlBusinessDatetimeBetween(
  column: string,
  start: string,
  endExclusive: string,
  tzOffset = "+08:00"
): { sql: string; params: [string, string] } {
  const offset = normalizeMysqlTimezoneOffset(tzOffset);
  const expr = `COALESCE(CONVERT_TZ(${column}, @@session.time_zone, '${offset}'), ${column})`;
  return {
    sql: `${expr} >= ? AND ${expr} < ?`,
    params: [start, endExclusive]
  };
}

/** 生成 ` AND … ` 片段，便于拼进现有 WHERE */
export function sqlBusinessDatetimeBetweenAnd(
  column: string,
  start: string,
  endExclusive: string,
  tzOffset = "+08:00"
): { clause: string; params: [string, string] } {
  const { sql, params } = sqlBusinessDatetimeBetween(column, start, endExclusive, tzOffset);
  return { clause: ` AND ${sql} `, params };
}

export const CAMPAIGN_SEND_RUN_JOIN_SQL =
  " LEFT JOIN email_campaign_send_runs r ON r.id = s.send_run_id ";

/**
 * 发信归属业务时间窗 [start, endExclusive)：
 * - 有 send_run：按轮次 started_at（避免昨日轮次跨零点后 created_at 仍算进今日）
 * - 无 send_run（历史）：按 email_sends.created_at
 */
export function sqlCampaignSendActivityRangeAnd(
  start: string,
  endExclusive: string,
  tzOffset = "+08:00"
): { joinSendRuns: string; clause: string; params: unknown[] } {
  const runRange = sqlBusinessDatetimeBetween("r.started_at", start, endExclusive, tzOffset);
  const sendRange = sqlBusinessDatetimeBetween("s.created_at", start, endExclusive, tzOffset);
  return {
    joinSendRuns: CAMPAIGN_SEND_RUN_JOIN_SQL,
    clause: ` AND (
      (s.send_run_id IS NOT NULL AND ${runRange.sql})
      OR (s.send_run_id IS NULL AND ${sendRange.sql})
    ) `,
    params: [...runRange.params, ...sendRange.params]
  };
}

/** 单日业务日版本（与 tenant-range / 今日概览 / 工作台「今天」一致） */
export function sqlBusinessDayCampaignSendActivityAnd(dayYmd: string, tzOffset = "+08:00"): {
  joinSendRuns: string;
  clause: string;
  params: unknown[];
} {
  const { start, endExclusive } = businessDayMysqlRange(dayYmd, normalizeMysqlTimezoneOffset(tzOffset));
  return sqlCampaignSendActivityRangeAnd(start, endExclusive, tzOffset);
}

/** 闭区间 [fromYmd, toYmd] 的每个业务日（含首尾） */
export function enumerateBusinessYmdRange(
  fromYmd: string,
  toYmd: string,
  timeZone = BUSINESS_STATS_TIME_ZONE
): string[] {
  const from = fromYmd <= toYmd ? fromYmd : toYmd;
  const to = fromYmd <= toYmd ? toYmd : fromYmd;
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const anchor = new Date(`${cur}T12:00:00+08:00`);
    anchor.setDate(anchor.getDate() + 1);
    cur = new Intl.DateTimeFormat("en-CA", { timeZone }).format(anchor);
    if (out.length > 400) break;
  }
  return out;
}
