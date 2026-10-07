/** 统计页 panel 快照：进程内 TTL 缓存（按活动 ID 隔离）。部署 Redis 时可替换为 ioredis。 */

const TTL_MS = Number(process.env.CAMPAIGN_PANEL_STATS_CACHE_TTL_MS ?? 5 * 60 * 1000);

type CacheRow = { expiresAt: number; payload: unknown };

const mem = new Map<string, CacheRow>();

function key(campaignId: number, variant: string) {
  return `campaign:${campaignId}:panel:${variant}`;
}

export function readCampaignPanelStatsCache(campaignId: number, variant = "v1"): unknown | null {
  const k = key(campaignId, variant);
  const row = mem.get(k);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    mem.delete(k);
    return null;
  }
  return row.payload;
}

export function writeCampaignPanelStatsCache(
  campaignId: number,
  payload: unknown,
  variant = "v1",
  ttlMs = TTL_MS
) {
  mem.set(key(campaignId, variant), { expiresAt: Date.now() + ttlMs, payload });
}

export function invalidateCampaignPanelStatsCache(campaignId: number, variant = "v1") {
  mem.delete(key(campaignId, variant));
}
