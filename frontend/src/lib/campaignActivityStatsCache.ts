/** 当前活动 7 栏：按活动 ID 缓存，仅展示本活动 ID 的快照（禁止串活动） */

export type CampaignStatsSnapshot = {
  /** 必须与请求的 campaignId 一致，否则视为无效缓存 */
  campaignId: number;
  statsScope?: "range" | "all_time_fallback";
  campaignSendFirstYmd?: string | null;
  campaignSendLastYmd?: string | null;
  summary: Record<string, unknown>;
  series?: Array<{
    label: string;
    success: number;
    fail?: number;
    date?: string;
    segments?: Array<{ timeRange: string; success: number }>;
  }>;
};

const mem = new Map<number, CampaignStatsSnapshot>();

function storageKey(campaignId: number) {
  return `bss-campaign-stats:v4:${campaignId}`;
}

/** 有送达但互动指标全 0 的旧缓存，切换活动时丢弃 */
export function isLikelyStaleEngagementCache(snapshot: CampaignStatsSnapshot): boolean {
  const s = snapshot.summary ?? {};
  const success = Number(s.successCount ?? 0);
  if (!Number.isFinite(success) || success <= 0) return false;
  const opened = Number(s.openedCount ?? 0);
  const sub = Number(s.subscribeCount ?? 0);
  const unsub = Number(s.unsubscribeCount ?? 0);
  const comp = Number(s.complaintCount ?? 0);
  if (opened === 0 && sub === 0 && unsub === 0 && comp === 0) return true;
  /** 有订阅/退订/投诉但已打开仍为 0：多为发送后首轮快照，切换第 2/3 场活动时勿沿用 */
  if (opened === 0 && (sub > 0 || unsub > 0 || comp > 0)) return true;
  return false;
}

function isValidSnapshot(campaignId: number, o: CampaignStatsSnapshot | null): o is CampaignStatsSnapshot {
  return o != null && Number(o.campaignId) === campaignId;
}

export function readCampaignStatsCache(campaignId: number): CampaignStatsSnapshot | null {
  const m = mem.get(campaignId);
  if (m != null && isValidSnapshot(campaignId, m) && !isLikelyStaleEngagementCache(m)) return m;
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return null;
    const o = JSON.parse(raw) as CampaignStatsSnapshot;
    if (!isValidSnapshot(campaignId, o) || isLikelyStaleEngagementCache(o)) {
      mem.delete(campaignId);
      try {
        localStorage.removeItem(storageKey(campaignId));
      } catch {
        /* ignore */
      }
      return null;
    }
    mem.set(campaignId, o);
    return o;
  } catch {
    return null;
  }
}

/** 仅当缓存命中该活动 ID 时用于首屏；禁止用其它活动的 @latest */
export function resolveCampaignStatsDisplay(
  campaignId: number,
  lastOnScreen: { campaignId: number; snapshot: CampaignStatsSnapshot } | null
): { snapshot: CampaignStatsSnapshot; exact: boolean } | null {
  const exact = readCampaignStatsCache(campaignId);
  if (exact) return { snapshot: exact, exact: true };
  if (lastOnScreen && lastOnScreen.campaignId === campaignId) {
    return { snapshot: lastOnScreen.snapshot, exact: false };
  }
  return null;
}

export function writeCampaignStatsCache(campaignId: number, snapshot: Omit<CampaignStatsSnapshot, "campaignId">) {
  const row: CampaignStatsSnapshot = { ...snapshot, campaignId };
  mem.set(campaignId, row);
  try {
    localStorage.setItem(storageKey(campaignId), JSON.stringify(row));
  } catch {
    /* quota */
  }
}

/** 清除旧版无 campaignId 的全局缓存，避免误展示其它活动数据 */
export function purgeCampaignStatsCache(campaignId: number) {
  mem.delete(campaignId);
  try {
    localStorage.removeItem(storageKey(campaignId));
  } catch {
    /* ignore */
  }
}

export function purgeLegacyCampaignStatsCache() {
  try {
    localStorage.removeItem("bss-campaign-stats:@latest");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (
        k?.startsWith("bss-campaign-stats:") &&
        !k.startsWith("bss-campaign-stats:v4:")
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}
