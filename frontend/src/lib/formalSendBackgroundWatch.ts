/**
 * 单组正式发送：离开邮件营销页时保持 send-progress 轮询，避免后台发送被误判收尾或返回页 0/0/0。
 * 仅由 EmailCampaignsSingleLanePage 使用（日发 3000 单机组包）。
 */

import { apiJson } from "./api";

type WatchState = {
  campaignId: number;
  sendRunId: number;
  sinceId: number;
  timer: ReturnType<typeof setInterval> | null;
};

let active: WatchState | null = null;

const POLL_MS = 2500;

async function pollOnce(state: WatchState): Promise<boolean> {
  const qs = new URLSearchParams();
  if (state.sinceId > 0) qs.set("sinceId", String(state.sinceId));
  if (state.sendRunId > 0) qs.set("sendRunId", String(state.sendRunId));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  try {
    const p = await apiJson<{
      ok?: boolean;
      lastId?: number | null;
      sendRunId?: number | null;
      runDeliveryComplete?: boolean | null;
      attempted?: number | null;
      runPlannedTotal?: number | null;
    }>(`/api/email/campaigns/${state.campaignId}/send-progress${suffix}`);
    const lastId = Math.max(0, Math.floor(Number(p.lastId ?? 0)));
    if (lastId > state.sinceId) state.sinceId = lastId;
    const runId = Math.max(0, Math.floor(Number(p.sendRunId ?? 0)));
    if (runId > 0) state.sendRunId = runId;
    const complete =
      p.runDeliveryComplete === true ||
      (Math.max(0, Number(p.runPlannedTotal ?? 0)) > 0 &&
        Math.max(0, Number(p.attempted ?? 0)) >= Math.max(0, Number(p.runPlannedTotal ?? 0)));
    return complete;
  } catch {
    return false;
  }
}

/** 页面卸载且仍在发送：接管轮询直至本轮结束 */
export function handoffFormalSendBackgroundWatch(
  campaignId: number,
  opts?: { sendRunId?: number; sinceId?: number }
): void {
  const id = Math.floor(Number(campaignId) || 0);
  if (id <= 0) return;
  stopFormalSendBackgroundWatch();
  active = {
    campaignId: id,
    sendRunId: Math.max(0, Math.floor(Number(opts?.sendRunId) || 0)),
    sinceId: Math.max(0, Math.floor(Number(opts?.sinceId) || 0)),
    timer: null
  };
  const tick = async () => {
    if (!active || active.campaignId !== id) return;
    const done = await pollOnce(active);
    if (done) stopFormalSendBackgroundWatch();
  };
  void tick();
  active.timer = setInterval(() => {
    void tick();
  }, POLL_MS);
}

export function stopFormalSendBackgroundWatch(): void {
  if (active?.timer != null) {
    clearInterval(active.timer);
  }
  active = null;
}

/** 回到邮件营销页：停止后台轮询并返回 sinceId 供页面恢复 */
export function reclaimFormalSendBackgroundWatch(campaignId: number): {
  sinceId: number;
  sendRunId: number;
} {
  const id = Math.floor(Number(campaignId) || 0);
  if (!active || active.campaignId !== id) {
    return { sinceId: 0, sendRunId: 0 };
  }
  const snap = { sinceId: active.sinceId, sendRunId: active.sendRunId };
  stopFormalSendBackgroundWatch();
  return snap;
}

export function isFormalSendBackgroundWatching(campaignId: number): boolean {
  const id = Math.floor(Number(campaignId) || 0);
  return active != null && active.campaignId === id;
}
