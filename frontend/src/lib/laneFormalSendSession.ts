/** 混元+ 多栏正式发送：每条专线独立记忆活动 ID（sessionStorage，仅存内部 id） */

/** 旧版曾用页级 selectedCampaignId 同步到全部专线；升级 key 以丢弃污染数据 */
const LANE_CAMPAIGN_SESSION_SCHEMA = "independent-v1";

export function laneCampaignSessionKey(sessionWatchKeyPrefix: string, laneIndex: number): string {
  return `${sessionWatchKeyPrefix}_${LANE_CAMPAIGN_SESSION_SCHEMA}_lane_${laneIndex}_campaignId`;
}

/** 一次性清除旧 schema 下写入各专线的活动 ID（曾跨栏同步） */
export function clearLegacyLaneCampaignSessionKeys(sessionWatchKeyPrefix: string, maxLanes = 8): void {
  try {
    for (let laneIndex = 1; laneIndex <= maxLanes; laneIndex += 1) {
      window.sessionStorage.removeItem(`${sessionWatchKeyPrefix}_lane_${laneIndex}_campaignId`);
    }
  } catch {
    /* private mode */
  }
}

/** 6 位营销活动编号（508217）与内部 id（150）都是数字；API 必须用内部 id */
export function resolveInternalCampaignId(
  raw: string,
  campaigns: Array<{ id: number; campaign_code?: string | null }>
): number {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (campaigns.some((c) => c.id === n)) return n;
  const codeMatch = campaigns.find((c) => {
    const code = String(c.campaign_code ?? "").trim();
    return code.length > 0 && (code === trimmed || code === String(n));
  });
  if (codeMatch) return codeMatch.id;
  /** 大号纯数字多为误存的 campaign_code，禁止当作 id 调 API（否则 404「活动不存在」） */
  if (n >= 100_000) return 0;
  return n;
}

export function readLaneCampaignId(storageKey: string): string {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const v = String(raw ?? "").trim();
    if (v && /^\d+$/.test(v)) return v;
  } catch {
    /* private mode */
  }
  return "";
}

export function writeLaneCampaignId(storageKey: string, campaignId: string): void {
  try {
    const v = String(campaignId ?? "").trim();
    if (v) window.sessionStorage.setItem(storageKey, v);
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

export function laneSendIndustriesSessionKey(sessionWatchKeyPrefix: string, laneIndex: number): string {
  return `${sessionWatchKeyPrefix}_${LANE_CAMPAIGN_SESSION_SCHEMA}_lane_${laneIndex}_sendIndustries`;
}

export function readLaneSendIndustries(storageKey: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => String(t ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeLaneSendIndustries(storageKey: string, industries: string[]): void {
  try {
    const list = industries.map((t) => String(t ?? "").trim()).filter(Boolean);
    if (list.length > 0) window.sessionStorage.setItem(storageKey, JSON.stringify(list));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/** 多专线页级「正式发送」行业勾选（刷新后恢复，与各栏 sendIndustries 独立） */
export function pageFormalIndustriesSessionKey(sessionWatchKeyPrefix: string): string {
  return `${sessionWatchKeyPrefix}_${LANE_CAMPAIGN_SESSION_SCHEMA}_pageFormalIndustries`;
}

export function readPageFormalIndustries(storageKey: string): string[] {
  return readLaneSendIndustries(storageKey);
}

export function writePageFormalIndustries(storageKey: string, industries: string[]): void {
  writeLaneSendIndustries(storageKey, industries);
}

/** 用户已点停止：刷新后勿恢复实时监控（直至新发送或后端确认 stopped） */
export function laneUserStopSuppressKey(
  sessionWatchKeyPrefix: string,
  laneIndex: number,
  campaignId: number
): string {
  return `${sessionWatchKeyPrefix}_${LANE_CAMPAIGN_SESSION_SCHEMA}_lane_${laneIndex}_userStop_${campaignId}`;
}

export function markLaneUserStopped(
  sessionWatchKeyPrefix: string,
  laneIndex: number,
  campaignId: number
): void {
  try {
    window.sessionStorage.setItem(
      laneUserStopSuppressKey(sessionWatchKeyPrefix, laneIndex, campaignId),
      String(Date.now())
    );
  } catch {
    /* private mode */
  }
}

export function isLaneUserStopped(
  sessionWatchKeyPrefix: string,
  laneIndex: number,
  campaignId: number
): boolean {
  try {
    return (
      window.sessionStorage.getItem(
        laneUserStopSuppressKey(sessionWatchKeyPrefix, laneIndex, campaignId)
      ) != null
    );
  } catch {
    return false;
  }
}

export function clearLaneUserStopped(
  sessionWatchKeyPrefix: string,
  laneIndex: number,
  campaignId: number
): void {
  try {
    window.sessionStorage.removeItem(
      laneUserStopSuppressKey(sessionWatchKeyPrefix, laneIndex, campaignId)
    );
  } catch {
    /* ignore */
  }
}
