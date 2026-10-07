import { apiJson } from "./api";
import type { CampaignStatsSenderGroups } from "./campaignStatsSenderChannels";
import { CAMPAIGN_STATS_CHANNEL_ORDER } from "./campaignStatsSenderChannels";
import type { DedicatedEntitlementsSnapshot } from "./dedicatedEntitlements";
import type { EmailChannelKind } from "./dedicatedEntitlements";

export type LaneLastFormalSend = {
  campaignId: number;
  campaignCode: string | null;
  name: string;
  industries: string[];
  plannedCount: number;
  successCount: number;
  failCount: number;
  startedAt: string | null;
  endedAt: string | null;
  stopped: boolean;
};

export type DedicatedLaneDomain = {
  serverId: number;
  senderDomain: string | null;
  fromEmail: string | null;
  status: string;
  smtpProfileId: number | null;
  sentToday: number;
  domainSuggestCap: number;
  sendingCampaignId?: number | null;
};

export type DedicatedLaneSnapshot = {
  vpsGroupId: number | null;
  laneIndex: number;
  label: string;
  provisioned: boolean;
  relayIp: string | null;
  ptrIp: string | null;
  sentToday: number;
  /** 本专线今日送达成功 */
  deliveredToday?: number;
  lineSentCap: number;
  sentRemaining: number;
  packageDailyLimit?: number;
  tenantDeliveredToday?: number;
  packageDeliveredRemaining?: number;
  domains: DedicatedLaneDomain[];
  sendingCampaignId: number | null;
  lastFormalSend?: LaneLastFormalSend | null;
};

export type DedicatedLanesResponse = {
  ok: boolean;
  dailyLimit?: number;
  tenantDeliveredToday?: number;
  entitlements?: DedicatedEntitlementsSnapshot;
  lineSentCapDefault?: number;
  domainSuggestCap?: number;
  lanes?: DedicatedLaneSnapshot[];
  message?: string;
};

function normEmail(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export function laneFromEmails(lane: DedicatedLaneSnapshot | null | undefined): string[] {
  if (!lane) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of lane.domains ?? []) {
    const fe = normEmail(String(d.fromEmail ?? ""));
    if (!fe || seen.has(fe)) continue;
    seen.add(fe);
    out.push(fe);
  }
  return out;
}

export function filterCampaignStatsGroupsByEmails(
  groups: CampaignStatsSenderGroups,
  allowedFromEmails: string[] | null | undefined
): CampaignStatsSenderGroups {
  if (!allowedFromEmails?.length) return groups;
  const allow = new Set(allowedFromEmails.map(normEmail));
  const out = { ...groups } as CampaignStatsSenderGroups;
  for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
    out[ch] = (groups[ch] ?? []).filter((fe) => allow.has(normEmail(fe)));
  }
  return out;
}

const DEDICATED_LANES_CACHE_KEY = "bss_dedicated_lanes_cache_v2";

type DedicatedLanesCache = {
  dailyLimit: number;
  lanes: DedicatedLaneSnapshot[];
  savedAt: number;
};

export function readDedicatedLanesCache(): DedicatedLanesCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEDICATED_LANES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DedicatedLanesCache;
    if (!Array.isArray(parsed.lanes) || parsed.lanes.length === 0) return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > 6 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDedicatedLanesCache(dailyLimit: number, lanes: DedicatedLaneSnapshot[]): void {
  if (typeof window === "undefined" || lanes.length === 0) return;
  try {
    window.sessionStorage.setItem(
      DEDICATED_LANES_CACHE_KEY,
      JSON.stringify({ dailyLimit: Math.max(0, Number(dailyLimit) || 0), lanes, savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/** 停止发送后立刻清工作台/专线栏「发送中」占位（与后端 refresh 结果对齐前的前端乐观更新） */
export function clearLaneSendingCampaign(
  lanes: DedicatedLaneSnapshot[],
  campaignId: number
): DedicatedLaneSnapshot[] {
  const cid = Math.floor(Number(campaignId) || 0);
  if (cid <= 0 || lanes.length === 0) return lanes;
  return lanes.map((lane) => ({
    ...lane,
    sendingCampaignId: Number(lane.sendingCampaignId ?? 0) === cid ? null : lane.sendingCampaignId ?? null,
    domains: (lane.domains ?? []).map((d) => ({
      ...d,
      sendingCampaignId: Number(d.sendingCampaignId ?? 0) === cid ? null : d.sendingCampaignId ?? null
    }))
  }));
}

/**
 * 工作台展示：后端 dedicated-lanes 仍可能返回 status=sending 的占位；
 * 前端已验收完成的活动须继续隐藏「N 域发送中」（勿动 Rule D 发信区收尾逻辑）。
 */
export function maskDedicatedLanesWorkbenchSending(
  lanes: DedicatedLaneSnapshot[],
  opts: {
    clearedCampaignIds?: Iterable<number>;
    campaignStatusById?: ReadonlyMap<number, string>;
  }
): DedicatedLaneSnapshot[] {
  if (lanes.length === 0) return lanes;

  const cleared = new Set<number>();
  for (const raw of opts.clearedCampaignIds ?? []) {
    const id = Math.floor(Number(raw) || 0);
    if (id > 0) cleared.add(id);
  }

  const shouldHideSending = (campaignId: number | null | undefined): boolean => {
    const id = Math.floor(Number(campaignId) || 0);
    if (id <= 0) return false;
    if (cleared.has(id)) return true;
    const statusById = opts.campaignStatusById;
    if (!statusById) return false;
    const st = String(statusById.get(id) ?? "")
      .trim()
      .toLowerCase();
    return st.length > 0 && st !== "sending";
  };

  return lanes.map((lane) => ({
    ...lane,
    sendingCampaignId: shouldHideSending(lane.sendingCampaignId) ? null : lane.sendingCampaignId ?? null,
    domains: (lane.domains ?? []).map((d) => ({
      ...d,
      sendingCampaignId: shouldHideSending(d.sendingCampaignId) ? null : d.sendingCampaignId ?? null
    }))
  }));
}

export async function fetchDedicatedLanes(): Promise<DedicatedLanesResponse> {
  const res = await apiJson<DedicatedLanesResponse>("/api/email/dedicated-lanes");
  const lanes = Array.isArray(res.lanes) ? res.lanes : [];
  const dailyLimit = Math.max(0, Number(res.dailyLimit ?? 0));
  if (lanes.length > 0) writeDedicatedLanesCache(dailyLimit, lanes);
  return res;
}

/** 混元（3 万/日）及以上：N 专线 = N 个发送窗口 */
export const MULTI_LANE_PACKAGE_DAILY_MIN = 30_000;

export function usesMultiLaneFormalSend(
  dailyLimit: number | null | undefined,
  lanes: DedicatedLaneSnapshot[] | null | undefined
): boolean {
  const limit = Math.max(0, Number(dailyLimit) || 0);
  const n = lanes?.length ?? 0;
  return limit >= MULTI_LANE_PACKAGE_DAILY_MIN && n >= 2;
}

/** 与 {@link usesMultiLaneFormalSend} 一致，仅需套餐日发上限（不必等 dedicated-lanes 全量统计） */
export function inferMultiLaneModeFromDailyLimit(dailyLimit: number | null | undefined): boolean {
  const limit = Math.max(0, Number(dailyLimit) || 0);
  const slots = Math.max(1, Math.ceil(limit / 20_000));
  return limit >= MULTI_LANE_PACKAGE_DAILY_MIN && slots >= 2;
}

export const LANE_SENDER_SELECTION_PREF_KEY = "bss_lane_sender_selection_v1";

export type LaneSenderSelectionPref = {
  laneIndex: number;
  channel: EmailChannelKind;
  fromEmail: string;
  savedAt: number;
};

export function laneSenderPrefStorageKey(userEmail: string | null | undefined): string {
  const em = String(userEmail ?? "")
    .trim()
    .toLowerCase();
  return em ? `${LANE_SENDER_SELECTION_PREF_KEY}:${em}` : LANE_SENDER_SELECTION_PREF_KEY;
}

export function readLaneSenderSelectionPref(storageKey: string): LaneSenderSelectionPref | null {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LaneSenderSelectionPref;
    const laneIndex = Math.floor(Number(parsed.laneIndex) || 0);
    const fromEmail = String(parsed.fromEmail ?? "").trim().toLowerCase();
    const channel = String(parsed.channel ?? "").trim() as EmailChannelKind;
    if (laneIndex <= 0 || !fromEmail) return null;
    return { laneIndex, channel, fromEmail, savedAt: Number(parsed.savedAt ?? 0) };
  } catch {
    return null;
  }
}

export function writeLaneSenderSelectionPref(
  storageKey: string,
  pref: { laneIndex: number; channel: EmailChannelKind; fromEmail: string }
): void {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ ...pref, savedAt: Date.now() } satisfies LaneSenderSelectionPref)
    );
  } catch {
    /* ignore */
  }
}

/** 默认专线：最近本页选用 → 最近正式发送 → 首个有发信域的专线 */
export function pickDefaultLaneIndex(
  lanes: DedicatedLaneSnapshot[],
  opts?: { preferenceStorageKey?: string }
): number | "" {
  if (!lanes.length) return "";
  const prefKey = opts?.preferenceStorageKey;
  if (prefKey) {
    const pref = readLaneSenderSelectionPref(prefKey);
    if (pref && lanes.some((l) => l.laneIndex === pref.laneIndex)) {
      return pref.laneIndex;
    }
  }
  let bestLane: DedicatedLaneSnapshot | null = null;
  let bestTs = 0;
  for (const lane of lanes) {
    const iso = lane.lastFormalSend?.endedAt ?? lane.lastFormalSend?.startedAt ?? null;
    const ts = iso ? Date.parse(iso) : 0;
    if (Number.isFinite(ts) && ts > bestTs) {
      bestTs = ts;
      bestLane = lane;
    }
  }
  if (bestLane && bestTs > 0) return bestLane.laneIndex;
  const withDomains = lanes.find((l) => laneFromEmails(l).length > 0);
  if (withDomains) return withDomains.laneIndex;
  return lanes[0]!.laneIndex;
}

export function findLaneByIndex(
  lanes: DedicatedLaneSnapshot[],
  laneIndex: number | ""
): DedicatedLaneSnapshot | null {
  if (laneIndex === "") return null;
  return lanes.find((l) => l.laneIndex === laneIndex) ?? null;
}
