/**
 * 单组 VPS 与多专线发信区 · 实时监控轮询（统一口径）
 * 计数、末封收尾与最近邮件列表与专线栏 protected rules 对齐。
 */

import {
  formalSendMetricsFromPoll,
  syncSendSessionPlannedFromPoll,
  type SendProgressPollPayload
} from "./campaignSendProgressTotal";
import {
  laneMonitorBreakdownCounts,
  mapSendProgressRecentRows,
  syncLaneLiveRowsDripFromPoll,
  syncLaneLiveRowsFromPoll,
  type LaneLiveRow,
  type LaneMonitorBreakdown
} from "./laneSendLiveRows";
import { resolveLaneAcceptedDisplay } from "./laneSendTailDisplay";

/** 发送中默认轮询间隔（可感知实时与 DB 压力折中） */
export const FORMAL_SEND_LIVE_POLL_MS = 650;
/** 首封未露出前加快轮询，避免长期停在「等待中」 */
export const FORMAL_SEND_LIVE_POLL_FAST_MS = 280;

export const FORMAL_SEND_LIVE_RECENT_ROWS = 5;

/** 每轮 poll 向监控列表新增的行数（与 FORMAL_SEND_LIVE_POLL_MS 配合 ≈ 逐封露出） */
export const FORMAL_SEND_LIVE_DRIP_ROWS_PER_TICK = 1;

export type FormalSendLiveBaseline = {
  baselineAttempted: number;
  baselineSent: number;
  baselineFailed: number;
};

export type FormalSendLivePollOpts = {
  previewAudienceCount: number | null | undefined;
  campaignRecipientCount: number | null | undefined;
  hasIndustrySelection: boolean;
  plannedLocked: number;
  plannedLockedFlag: boolean;
  baselines: FormalSendLiveBaseline;
  prevLiveRows: LaneLiveRow[];
  prevBreakdown?: Partial<LaneMonitorBreakdown>;
  /** 本轮 POST 已绑定 send_run（或 poll 已返回 sendRunId） */
  sendRunBound: boolean;
  /** false=收尾/恢复时一次合并全部；默认逐封 drip */
  dripLiveRows?: boolean;
};

export type FormalSendPollFinishReason = "tail_display" | "delivery_complete" | null;

export type FormalSendLivePollView = {
  planned: number;
  runAttempted: number;
  runSent: number;
  runFailed: number;
  remain: number;
  progressPct: number;
  sendingInFlight: number;
  liveRows: LaneLiveRow[];
  sendRunId: number;
  breakdown: LaneMonitorBreakdown;
  finish: { shouldFinish: boolean; reason: FormalSendPollFinishReason };
  showSendComplete: boolean;
};

export function detectFormalSendPollFinish(
  poll: SendProgressPollPayload,
  planned: number,
  sendRunBound: boolean
): { shouldFinish: boolean; reason: FormalSendPollFinishReason } {
  const sendRunId = Math.max(0, Math.floor(Number(poll.sendRunId ?? 0)));
  if (!sendRunBound || sendRunId <= 0) {
    return { shouldFinish: false, reason: null };
  }

  const sendingDistinct = Math.max(0, Math.floor(Number(poll.sendingDistinct ?? 0)));
  const pollAttempted = Math.max(0, Math.floor(Number(poll.attempted ?? 0)));
  const runPlanned = Math.max(0, Math.floor(Number(poll.runPlannedTotal ?? 0)));
  const effectivePlan = runPlanned > 0 ? runPlanned : Math.max(0, Math.floor(planned));

  if (poll.runDeliveryComplete === true && sendingDistinct === 0 && pollAttempted > 0) {
    return { shouldFinish: true, reason: "delivery_complete" };
  }

  const display = resolveLaneAcceptedDisplay({
    planned: effectivePlan,
    processed: pollAttempted,
    inFlight: sendingDistinct
  });
  if (display.showSendComplete) {
    return { shouldFinish: true, reason: "tail_display" };
  }

  return { shouldFinish: false, reason: null };
}

/** 单次 send-progress 响应 → 与单组 VPS 相同的展示用计数与最近 N 封 */
export function applyFormalSendLivePollView(
  poll: SendProgressPollPayload,
  opts: FormalSendLivePollOpts
): FormalSendLivePollView {
  const planned = syncSendSessionPlannedFromPoll(opts.plannedLocked, {
    previewAudienceCount: opts.previewAudienceCount,
    campaignRecipientCount: opts.campaignRecipientCount,
    serverRecipientCount: poll.recipientCount,
    serverRunPlannedTotal: poll.runPlannedTotal,
    hasIndustrySelection: opts.hasIndustrySelection,
    locked: opts.plannedLockedFlag
  });

  const metrics = formalSendMetricsFromPoll(poll, {
    plannedLocked: planned,
    baselineAttempted: opts.baselines.baselineAttempted,
    baselineSent: opts.baselines.baselineSent,
    baselineFailed: opts.baselines.baselineFailed
  });

  const recent = mapSendProgressRecentRows(Array.isArray(poll.recent) ? poll.recent : []);
  const useDrip = opts.dripLiveRows !== false;
  const liveRows = useDrip
    ? syncLaneLiveRowsDripFromPoll(
        opts.prevLiveRows,
        recent,
        FORMAL_SEND_LIVE_RECENT_ROWS,
        FORMAL_SEND_LIVE_DRIP_ROWS_PER_TICK
      )
    : syncLaneLiveRowsFromPoll(opts.prevLiveRows, recent, FORMAL_SEND_LIVE_RECENT_ROWS);
  const breakdown = laneMonitorBreakdownCounts({
    poll,
    liveRows,
    prev: opts.prevBreakdown
  });

  const sendingInFlight = Math.max(0, Math.floor(Number(poll.sendingDistinct ?? 0)));
  const pollAttemptedRaw = Math.max(0, Math.floor(Number(poll.attempted ?? 0)));
  const runPlanned = Math.max(0, Math.floor(Number(poll.runPlannedTotal ?? 0)));
  const effectivePlan = runPlanned > 0 && opts.sendRunBound ? runPlanned : planned;
  /** 监控「总数」：终态 processed + 在途 sending，首封 SMTP 期间即显示 1/N 而非长期 0 */
  const progressProcessed =
    opts.sendRunBound && (pollAttemptedRaw > 0 || sendingInFlight > 0)
      ? pollAttemptedRaw + sendingInFlight
      : opts.sendRunBound
        ? pollAttemptedRaw
        : metrics.runAttempted;

  const display = resolveLaneAcceptedDisplay({
    planned: effectivePlan > 0 ? effectivePlan : planned,
    processed: progressProcessed,
    inFlight: 0
  });

  const sendRunId = Math.max(0, Math.floor(Number(poll.sendRunId ?? 0)));
  const finish = detectFormalSendPollFinish(poll, planned, opts.sendRunBound || sendRunId > 0);

  return {
    planned: effectivePlan > 0 ? effectivePlan : planned,
    runAttempted: display.accepted,
    runSent: metrics.runSent,
    runFailed: breakdown.deliveryIssues,
    remain: display.remain,
    progressPct: display.progressPct,
    sendingInFlight,
    liveRows,
    sendRunId,
    breakdown,
    finish,
    showSendComplete: display.showSendComplete
  };
}
