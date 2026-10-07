import {
  clearLaneSendingCampaign,
  maskDedicatedLanesWorkbenchSending,
  type DedicatedLaneSnapshot
} from "./dedicatedLanes";

/** 本页已验收收尾的活动：API 仍可能短暂返回 sending，前端强制展示为已完成 */
export function applyLocallyFinishedCampaignOverrides<
  T extends {
    id: number;
    status?: string | null;
    has_sent?: boolean;
    attempts_count?: number;
  }
>(items: T[], finishedIds: ReadonlySet<number>): T[] {
  if (finishedIds.size === 0) return items;
  return items.map((c) => {
    if (!finishedIds.has(c.id)) return c;
    const attempts = Math.max(0, Number(c.attempts_count ?? 0));
    return {
      ...c,
      status: "completed",
      has_sent: true,
      attempts_count: attempts > 0 ? attempts : 1
    };
  });
}

export function buildCampaignStatusByIdForWorkbenchMask(
  campaigns: Array<{ id: number; status?: string | null }>,
  locallyFinishedIds: readonly number[]
): Map<number, string> {
  const finished = new Set(locallyFinishedIds);
  const m = new Map<number, string>();
  for (const c of campaigns) {
    if (c.id > 0) {
      m.set(c.id, finished.has(c.id) ? "completed" : String(c.status ?? "").trim().toLowerCase());
    }
  }
  for (const id of locallyFinishedIds) {
    if (id > 0) m.set(id, "completed");
  }
  return m;
}

/** 拉取 dedicated-lanes 后立刻清本页已收尾活动的「域发送中」占位 */
export function dedicatedLanesAfterLocalFinish(
  lanes: DedicatedLaneSnapshot[],
  opts: {
    clearedCampaignIds: Iterable<number>;
    campaignStatusById?: ReadonlyMap<number, string>;
  }
): DedicatedLaneSnapshot[] {
  let out = lanes;
  const cleared = new Set<number>();
  for (const raw of opts.clearedCampaignIds) {
    const id = Math.floor(Number(raw) || 0);
    if (id > 0) {
      cleared.add(id);
      out = clearLaneSendingCampaign(out, id);
    }
  }
  return maskDedicatedLanesWorkbenchSending(out, {
    clearedCampaignIds: cleared,
    campaignStatusById: opts.campaignStatusById
  });
}
