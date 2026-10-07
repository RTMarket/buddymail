/** 租户日期范围 6 栏统计：进程内 TTL 缓存（按租户 + 日期 + 筛选范围隔离） */

const TTL_MS = Number(process.env.TENANT_RANGE_STATS_CACHE_TTL_MS ?? 90 * 1000);

type CacheRow = { expiresAt: number; payload: unknown };

const mem = new Map<string, CacheRow>();

export function tenantRangeStatsCacheKey(parts: {
  tenantId: number;
  fromY: string;
  toY: string;
  lite: boolean;
  scopeKey: string;
}): string {
  return `tenant:${parts.tenantId}:${parts.fromY}:${parts.toY}:${parts.lite ? "lite" : "full"}:${parts.scopeKey}`;
}

export function readTenantRangeStatsCache(key: string): unknown | null {
  const row = mem.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    mem.delete(key);
    return null;
  }
  return row.payload;
}

export function writeTenantRangeStatsCache(key: string, payload: unknown, ttlMs = TTL_MS) {
  mem.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

export function invalidateTenantRangeStatsCache(tenantId: number) {
  const prefix = `tenant:${tenantId}:`;
  for (const k of mem.keys()) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}
