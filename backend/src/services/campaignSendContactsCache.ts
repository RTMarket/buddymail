/** 活动发送名单 tab-totals / 分页：进程内短 TTL 缓存 */

const TTL_MS = Number(process.env.CAMPAIGN_SEND_LIST_CACHE_TTL_MS ?? 120 * 1000);

type Row = { expiresAt: number; payload: unknown };

const mem = new Map<string, Row>();

export function campaignSendListCacheKey(parts: Record<string, string | number>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

export function readCampaignSendListCache<T>(key: string): T | null {
  const row = mem.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    mem.delete(key);
    return null;
  }
  return row.payload as T;
}

export function writeCampaignSendListCache(key: string, payload: unknown, ttlMs = TTL_MS) {
  mem.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

export function invalidateCampaignSendListCache(campaignId: number) {
  for (const k of mem.keys()) {
    if (k.includes(`campaignId=${campaignId}`)) mem.delete(k);
  }
}

export function invalidateCampaignSendListCaches(campaignIds: Iterable<number>) {
  for (const id of campaignIds) {
    if (Number.isFinite(id) && id > 0) invalidateCampaignSendListCache(id);
  }
}
