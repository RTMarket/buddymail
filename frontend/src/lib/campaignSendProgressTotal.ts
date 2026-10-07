/**
 * 实时发送进度：本次点击发送时锁定计划数；轮询用「本轮」尝试数（累计 − 基线）。
 */

export type SendSessionPlannedOpts = {
  /** 勾选行业后 preview-count 的人数 */
  previewAudienceCount: number | null | undefined;
  /** 活动列表里的 recipient_count（可能含历史全行业预估，勿优先） */
  campaignRecipientCount: number | null | undefined;
  serverRecipientCount: number | null | undefined;
  serverRunPlannedTotal?: number | null | undefined;
  hasIndustrySelection: boolean;
};

/**
 * 点击发送 / 轮询时解析计划总数：
 * 优先用后端「本轮剩余」(runPlannedTotal)，避免同一活动二次发送时仍用全行业预览导致进度卡在 60–70%。
 */
export function resolveSendSessionPlannedTotal(opts: SendSessionPlannedOpts): number {
  const runPlanned = Math.max(0, Math.floor(Number(opts.serverRunPlannedTotal) || 0));
  if (runPlanned > 0) return runPlanned;

  const preview = Math.max(0, Math.floor(Number(opts.previewAudienceCount) || 0));
  if (opts.hasIndustrySelection) {
    if (preview > 0) return preview;
    /** 已勾选行业时勿用活动表 recipient_count（常为历史全行业预估，会误显示 2 万+） */
    return 0;
  }

  const server = Math.max(0, Math.floor(Number(opts.serverRecipientCount) || 0));
  if (server > 0) return server;

  return Math.max(0, Math.floor(Number(opts.campaignRecipientCount) || 0));
}

/** 正式发送 POST body 的 limit：优先行业预览人数 */
export function resolveFormalSendAudienceLimit(opts: {
  previewAudienceCount: number | null | undefined;
  hasIndustrySelection: boolean;
}): number | undefined {
  const preview = Math.max(0, Math.floor(Number(opts.previewAudienceCount) || 0));
  if (opts.hasIndustrySelection) {
    return preview > 0 ? preview : undefined;
  }
  return preview > 0 ? preview : undefined;
}

/** 轮询响应校准：有 runPlannedTotal 时始终采用（覆盖发送前误锁的预览人数） */
export function syncSendSessionPlannedFromPoll(
  currentPlanned: number,
  opts: SendSessionPlannedOpts & { locked: boolean }
): number {
  const runPlanned = Math.max(0, Math.floor(Number(opts.serverRunPlannedTotal) || 0));
  if (runPlanned > 0) return runPlanned;
  if (opts.locked && currentPlanned > 0) return currentPlanned;
  return resolveSendSessionPlannedTotal(opts);
}

export type SendRunProgressDisplayOpts = {
  isSending: boolean;
  /** 活动已正常发完（非手动停止）时进度条应收束到 100% */
  campaignCompleted?: boolean;
};

/** 非发送中时的展示：正常完成 / 本轮已满则进度条到 100% */
export function toSendRunProgressDisplay(
  run: SendRunProgress,
  opts: SendRunProgressDisplayOpts
): SendRunProgress {
  if (opts.isSending) return run;
  if (opts.campaignCompleted && run.planned > 0) {
    return { ...run, progressPct: 100, remain: 0, runAttempted: run.planned };
  }
  if (run.planned <= 0) return run;
  if (run.remain <= 0 || run.runAttempted >= run.planned) {
    return { ...run, progressPct: 100, remain: 0 };
  }
  return run;
}

export type SendRunProgressInput = {
  plannedTotal: number;
  /** 活动累计去重尝试（send-progress.attempted） */
  cumulativeAttempted: number;
  /** 本次点击发送前的累计尝试 */
  baselineAttempted: number;
};

export type SendRunProgress = {
  planned: number;
  runAttempted: number;
  remain: number;
  progressPct: number;
};

export type SendProgressRecentRow = {
  id?: number | null;
  email?: string | null;
  status?: string | null;
  error?: string | null;
  openCount?: number | null;
  clickCount?: number | null;
  bounceEventCount?: number | null;
};

export type SendProgressPollPayload = {
  attempted?: number | null;
  sent?: number | null;
  failed?: number | null;
  smtpFailed?: number | null;
  bounceFailures?: number | null;
  suppressedCount?: number | null;
  sendingDistinct?: number | null;
  runBaselineAttempted?: number | null;
  runPlannedTotal?: number | null;
  recipientCount?: number | null;
  sendRunId?: number | null;
  recent?: SendProgressRecentRow[] | null;
  runDeliveryComplete?: boolean | null;
  /** 与统计页 8 栏 summaryFailCount 同口径（活动内联系人去重） */
  campaignFailCount?: number | null;
  summaryFailCount?: number | null;
  runFailCount?: number | null;
};

function failedCountFromPoll(poll: SendProgressPollPayload): number {
  const campaignFail = Math.max(0, Math.floor(Number(poll.campaignFailCount) || 0));
  const summaryFail = Math.max(0, Math.floor(Number(poll.summaryFailCount) || 0));
  const runFail = Math.max(0, Math.floor(Number(poll.runFailCount) || 0));
  const smtp = Math.max(0, Math.floor(Number(poll.smtpFailed) || 0));
  const bounce = Math.max(0, Math.floor(Number(poll.bounceFailures) || 0));
  const suppressed = Math.max(0, Math.floor(Number(poll.suppressedCount) || 0));
  const failed = Math.max(0, Math.floor(Number(poll.failed) || 0));
  return Math.max(failed, campaignFail, summaryFail, runFail, smtp + bounce + suppressed);
}

/** 轮询 send-progress：有本轮 send_run 时用 attempted 作本轮进度，避免基线错位卡在 60–70% */
export function computeSendProgressFromPoll(
  poll: SendProgressPollPayload,
  opts: { plannedLocked: number; baselineAttempted: number }
): SendRunProgress {
  const runPlanned = Math.max(0, Math.floor(Number(poll.runPlannedTotal) || 0));
  const sendRunId = Math.max(0, Math.floor(Number(poll.sendRunId) || 0));
  /** 必须已有 send_run，否则 attempted 仍是活动累计，会误显示 100% */
  const hasRunScope = sendRunId > 0;

  let planned = runPlanned > 0 ? runPlanned : Math.max(0, Math.floor(opts.plannedLocked || 0));
  if (planned <= 0) {
    planned = Math.max(0, Math.floor(Number(poll.recipientCount) || 0));
  }

  if (hasRunScope) {
    const runAttempted = Math.max(0, Math.floor(Number(poll.attempted) || 0));
    const remain = Math.max(0, planned - runAttempted);
    const progressPct = planned > 0 ? Math.min(100, Math.round((runAttempted / planned) * 100)) : 0;
    return { planned, runAttempted, remain, progressPct };
  }

  return computeSendRunProgress({
    plannedTotal: planned,
    cumulativeAttempted: Math.max(0, Math.floor(Number(poll.attempted) || 0)),
    baselineAttempted: opts.baselineAttempted
  });
}

/** 正式发送实时监控：有 send_run 时 sent/failed 已是本轮口径；sent 为真实送达（已扣退信） */
export function formalSendMetricsFromPoll(
  poll: SendProgressPollPayload,
  opts: {
    plannedLocked: number;
    baselineAttempted: number;
    baselineSent: number;
    baselineFailed: number;
  }
): { runAttempted: number; runSent: number; runFailed: number; remain: number; progressPct: number } {
  const sendRunId = Math.max(0, Math.floor(Number(poll.sendRunId) || 0));
  if (sendRunId > 0) {
    const run = computeSendProgressFromPoll(poll, {
      plannedLocked: opts.plannedLocked,
      baselineAttempted: 0
    });
    return {
      runAttempted: run.runAttempted,
      runSent: Math.max(0, Math.floor(Number(poll.sent) || 0)),
      runFailed: failedCountFromPoll(poll),
      remain: run.remain,
      progressPct: run.progressPct
    };
  }
  const runRaw = computeSendRunProgress({
    plannedTotal: opts.plannedLocked,
    cumulativeAttempted: Math.max(0, Math.floor(Number(poll.attempted) || 0)),
    baselineAttempted: opts.baselineAttempted
  });
  const runFailedRaw = failedCountFromPoll(poll);
  return {
    runAttempted: runRaw.runAttempted,
    runSent: Math.max(0, Math.floor(Number(poll.sent) || 0) - opts.baselineSent),
    runFailed: Math.max(0, runFailedRaw - opts.baselineFailed),
    remain: runRaw.remain,
    progressPct: runRaw.progressPct
  };
}

export function computeSendRunProgress(input: SendRunProgressInput): SendRunProgress {
  const planned = Math.max(0, Math.floor(Number(input.plannedTotal) || 0));
  const cumulative = Math.max(0, Math.floor(Number(input.cumulativeAttempted) || 0));
  const baseline = Math.max(0, Math.floor(Number(input.baselineAttempted) || 0));
  const runAttempted = Math.max(0, cumulative - baseline);

  if (planned <= 0) {
    return {
      planned: 0,
      runAttempted,
      remain: 0,
      progressPct: 0
    };
  }

  const remain = Math.max(0, planned - runAttempted);
  const progressPct = Math.min(100, Math.round((runAttempted / planned) * 100));
  return { planned, runAttempted, remain, progressPct };
}

/** @deprecated */
export function lockCampaignPlannedTotal(currentLock: number, candidates: number[]): number {
  if (currentLock > 0) return currentLock;
  const best = candidates.map((x) => Math.max(0, Math.floor(Number(x) || 0))).filter((n) => n > 0);
  return best.length > 0 ? Math.max(...best) : 0;
}

/** @deprecated */
export function resolveCampaignSendProgressDenominator(opts: {
  plannedTotal: number;
  attemptedTotal: number;
}): { denom: number; remain: number; planned: number } {
  const run = computeSendRunProgress({
    plannedTotal: opts.plannedTotal,
    cumulativeAttempted: opts.attemptedTotal,
    baselineAttempted: 0
  });
  return { denom: run.planned, remain: run.remain, planned: run.planned };
}

/** @deprecated */
export function mergeCampaignPlannedRecipient(localPlanned: number, serverPlanned: number): number {
  return resolveSendSessionPlannedTotal({
    previewAudienceCount: localPlanned,
    campaignRecipientCount: null,
    serverRecipientCount: serverPlanned,
    hasIndustrySelection: false
  });
}
