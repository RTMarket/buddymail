/** 营销活动统计页：上次成功结果本地 + 内存缓存（先展示再后台刷新） */

import { businessDaysAgoFromYmd, businessDaysAgoYmd, businessTodayYmd } from "./businessCalendar";

export type CachedTenantRangeSummary = {
  totalSendAttempts: number;
  deliveredCount: number;
  openedCount: number;
  subscribeCount: number;
  unsubscribeCount: number;
  complaintCount: number;
  subscribeTodayCount: number;
  subscribeTodayBySendingDomain: Array<{ fromEmail: string; count: number }>;
  subscribeTodayDate: string;
  savedAt: string;
  scopeKey?: string;
  rangeFrom?: string;
  rangeTo?: string;
};

export type TenantRangeSnapshot = Omit<
  CachedTenantRangeSummary,
  "savedAt" | "scopeKey" | "rangeFrom" | "rangeTo"
>;

const LATEST_CACHE_KEY = "bss-tenant-range:@latest";

/** 当前会话内存缓存，切换今天/昨天/近7天零延迟 */
const memCache = new Map<string, TenantRangeSnapshot>();

function memCacheKey(from: string, to: string, scope: string) {
  return `${from}|${to}|${scope}`;
}

function tenantCacheKey(from: string, to: string, scope: string) {
  return `bss-tenant-range:${from}:${to}:${scope}`;
}

function toSummaryPayload(
  summary: TenantRangeSnapshot,
  meta: { scopeKey: string; from: string; to: string }
): CachedTenantRangeSummary {
  return {
    ...summary,
    savedAt: new Date().toISOString(),
    scopeKey: meta.scopeKey,
    rangeFrom: meta.from,
    rangeTo: meta.to
  };
}

export function tenantRangeFromCache(c: CachedTenantRangeSummary | TenantRangeSnapshot): TenantRangeSnapshot {
  return {
    totalSendAttempts: c.totalSendAttempts,
    deliveredCount: c.deliveredCount,
    openedCount: c.openedCount,
    subscribeCount: c.subscribeCount,
    unsubscribeCount: c.unsubscribeCount,
    complaintCount: c.complaintCount,
    subscribeTodayCount: c.subscribeTodayCount,
    subscribeTodayBySendingDomain: c.subscribeTodayBySendingDomain,
    subscribeTodayDate: c.subscribeTodayDate
  };
}

export function readTenantRangeCache(
  from: string,
  to: string,
  scopeKey: string
): { snapshot: TenantRangeSnapshot; exact: boolean } | null {
  const mk = memCacheKey(from, to, scopeKey);
  const mem = memCache.get(mk);
  if (mem) return { snapshot: mem, exact: true };

  try {
    const raw = localStorage.getItem(tenantCacheKey(from, to, scopeKey));
    if (raw) {
      const o = JSON.parse(raw) as CachedTenantRangeSummary;
      if (o && typeof o === "object") {
        const snap = tenantRangeFromCache(o);
        memCache.set(mk, snap);
        return { snapshot: snap, exact: true };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readLatestTenantRange(): CachedTenantRangeSummary | null {
  try {
    const raw = localStorage.getItem(LATEST_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as CachedTenantRangeSummary;
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

/** 用于切换日期时：精确缓存 > 屏幕上次数字 > 全局最近一次 */
export function resolveTenantRangeDisplay(
  from: string,
  to: string,
  scopeKey: string,
  lastOnScreen: TenantRangeSnapshot | null
): { snapshot: TenantRangeSnapshot; exact: boolean } | null {
  const exact = readTenantRangeCache(from, to, scopeKey);
  if (exact) return exact;
  if (lastOnScreen) return { snapshot: lastOnScreen, exact: false };
  const latest = readLatestTenantRange();
  if (latest) return { snapshot: tenantRangeFromCache(latest), exact: false };
  return null;
}

/** 诊断与修复：清浏览器端日期范围缓存，配合服务端 invalidateTenantRangeStatsCache */
export function purgeTenantRangeLocalCache() {
  memCache.clear();
  try {
    localStorage.removeItem(LATEST_CACHE_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("bss-tenant-range:")) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export function writeCachedTenantRange(from: string, to: string, scopeKey: string, summary: TenantRangeSnapshot) {
  const snap = tenantRangeFromCache(summary as CachedTenantRangeSummary);
  memCache.set(memCacheKey(from, to, scopeKey), snap);
  try {
    const payload = toSummaryPayload(snap, { scopeKey, from, to });
    localStorage.setItem(tenantCacheKey(from, to, scopeKey), JSON.stringify(payload));
    localStorage.setItem(LATEST_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function tenantRangePresetTriples(anchorYmd?: string | null): Array<{ from: string; to: string; label: string }> {
  const t = anchorYmd && /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd) ? anchorYmd : businessTodayYmd();
  const y = anchorYmd ? businessDaysAgoFromYmd(t, 1) : businessDaysAgoYmd(1);
  const w = anchorYmd ? businessDaysAgoFromYmd(t, 6) : businessDaysAgoYmd(6);
  return [
    { from: t, to: t, label: "today" },
    { from: y, to: y, label: "yesterday" },
    { from: w, to: t, label: "7d" }
  ];
}
