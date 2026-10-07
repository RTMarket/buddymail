/**
 * 专线栏：单次「点确认发送」的 UI 会话（进度 / 计数 / 完成）
 * 规则见 LANE_SEND_PANEL_SPEC.md
 */

import type { SiteLocale } from "../i18n/siteLocaleTypes";
import { intlLocaleTag } from "../i18n/siteLocaleTypes";

export type LaneSendUiPhase = "idle" | "active" | "completing";

/** 100% 短暂展示后切到绿色摘要（毫秒） */
export const LANE_SEND_COMPLETE_FLASH_MS = 220;

export type LaneSendProgressSnapshot = {
  planned: number;
  progressPct: number;
  remainCount: number;
  remainSec: number;
  runAttempted: number;
  runSent: number;
  runFailed: number;
  avgSec: number | null;
};

export type LaneSendSessionSummary = {
  planned: number;
  attempted: number;
  sent: number;
  failed: number;
  durationSec: number;
  stopped?: boolean;
  campaignCode?: string;
  campaignName?: string;
  /** 如「发送目标行业：测试组」 */
  targetIndustriesNote?: string;
  /** 收尾完成时刻（本地展示用） */
  finishedAtMs?: number;
};

export type LaneProgressPoll = {
  campaignFailCount?: number | null;
  summaryFailCount?: number | null;
  runFailCount?: number | null;
  attempted?: number | null;
  sent?: number | null;
  failed?: number | null;
  smtpFailed?: number | null;
  bounceFailures?: number | null;
  suppressedCount?: number | null;
  sendRunId?: number | null;
  runPlannedTotal?: number | null;
  recipientCount?: number | null;
};

/**
 * 统计页 7 栏 / 名单失败 tab 同源的去重失败数（send-progress 的 campaignFailCount / summaryFailCount）。
 * 有该字段时须优先于 poll.failed（后者可能叠 smtp+退信分项多 1）。
 */
export function laneStatsAlignedFailFromPoll(poll: LaneProgressPoll): number | null {
  if (poll.campaignFailCount == null && poll.summaryFailCount == null) return null;
  const campaignFail = Math.max(0, Math.floor(Number(poll.campaignFailCount) || 0));
  const summaryFail = Math.max(0, Math.floor(Number(poll.summaryFailCount) || 0));
  const runFail = Math.max(0, Math.floor(Number(poll.runFailCount) || 0));
  return Math.max(campaignFail, summaryFail, runFail);
}

/**
 * 专线栏「投递异常」去重人数：优先 API `failed`（smtp+拒收+仅 sent 退信，互不叠加重算）。
 * 勿对分项 smtp+bounce+suppressed 再求和（同一封对账为 failed 后可能既有 failed 又有退信事件）。
 */
export function laneFailedCountFromPoll(poll: LaneProgressPoll): number {
  const statsAligned = laneStatsAlignedFailFromPoll(poll);
  if (statsAligned != null) return statsAligned;

  const campaignFail = Math.max(0, Math.floor(Number(poll.campaignFailCount) || 0));
  const summaryFail = Math.max(0, Math.floor(Number(poll.summaryFailCount) || 0));
  const runFail = Math.max(0, Math.floor(Number(poll.runFailCount) || 0));
  const failed = Math.max(0, Math.floor(Number(poll.failed) || 0));
  const smtp = Math.max(0, Math.floor(Number(poll.smtpFailed) || 0));
  const bounce = Math.max(0, Math.floor(Number(poll.bounceFailures) || 0));
  const suppressed = Math.max(0, Math.floor(Number(poll.suppressedCount) || 0));
  const core = Math.max(failed, campaignFail, summaryFail, runFail);
  if (core > 0) return core;
  return Math.max(0, smtp + bounce + suppressed);
}

export function laneDefaultSecPerMail(minIntervalMs: number): number {
  const intervalSec = Math.max(0, Number(minIntervalMs) || 0) / 1000;
  return Math.max(intervalSec, 2.5);
}

export function estimateLaneRemainSec(
  planned: number,
  minIntervalMs: number,
  avgSecPerMail?: number | null
): number {
  const n = Math.max(0, Math.floor(planned));
  if (n <= 0) return 0;
  const per =
    avgSecPerMail != null && avgSecPerMail > 0 ? avgSecPerMail : laneDefaultSecPerMail(minIntervalMs);
  return Math.round(n * per);
}

/**
 * 计划数：确认前用预览；有 send_run 且后端已校准时以 runPlannedTotal 为准
 * （避免「预览 12、本活动已发过 2 个重复邮箱、实发 10」卡在剩余 2 封）。
 */
export function resolveLaneSessionPlanned(opts: {
  lockedPlanned: number;
  sendPlannedLocked: boolean;
  previewAudienceCount: number | null | undefined;
  poll: LaneProgressPoll;
}): number {
  const sendRunId = Math.max(0, Math.floor(Number(opts.poll.sendRunId) || 0));
  const runPlanned = Math.max(0, Math.floor(Number(opts.poll.runPlannedTotal) || 0));
  if (sendRunId > 0 && runPlanned > 0) {
    return runPlanned;
  }
  if (opts.sendPlannedLocked && opts.lockedPlanned > 0) {
    return opts.lockedPlanned;
  }
  const preview = Math.max(0, Math.floor(Number(opts.previewAudienceCount) || 0));
  if (preview > 0) return preview;
  if (runPlanned > 0) return runPlanned;
  return Math.max(0, Math.floor(opts.lockedPlanned || 0));
}

/** 结束判定用的有效计划数（与 resolveLaneSessionPlanned 一致） */
export function laneEffectivePlannedForFinish(opts: {
  planned: number;
  runPlannedTotal?: number | null;
  sendRunId?: number | null;
}): number {
  const sendRunId = Math.max(0, Math.floor(Number(opts.sendRunId) || 0));
  const runPlanned = Math.max(0, Math.floor(Number(opts.runPlannedTotal) || 0));
  if (sendRunId > 0 && runPlanned > 0) return runPlanned;
  return Math.max(0, Math.floor(opts.planned || 0));
}

export type LaneProgressHold = {
  runAttempted: number;
  runSent: number;
  runFailed: number;
};

/** 轮询尚未带上 send_run 时，用本会话已出现的邮件条数托底（避免「列表有信、计数为 0」） */
export function laneSessionLiveCountFloor(rows: { status: string; bounceEventCount?: number }[]): {
  attempted: number;
  sent: number;
  failed: number;
  bounced: number;
  suppressed: number;
} {
  let sent = 0;
  let failed = 0;
  let bounced = 0;
  let suppressed = 0;
  for (const r of rows) {
    const s = String(r.status ?? "").toLowerCase();
    const bounceN = Math.max(0, Number(r.bounceEventCount ?? 0));
    if (s === "suppressed") suppressed += 1;
    else if (s === "failed") failed += 1;
    else if (s === "sent" && bounceN > 0) bounced += 1;
    else if (s === "sent") sent += 1;
  }
  return { attempted: rows.length, sent, failed, bounced, suppressed };
}

/** 发送中会话内：尝试/成功/失败只增不减，禁止进度条回退 */
export function laneProgressMonotonicMerge(
  prev: LaneProgressHold,
  next: LaneProgressHold
): LaneProgressHold {
  return {
    runAttempted: Math.max(prev.runAttempted, next.runAttempted),
    runSent: Math.max(prev.runSent, next.runSent),
    runFailed: Math.max(prev.runFailed, next.runFailed)
  };
}

function buildLaneProgressSnapshot(
  planned: number,
  counts: LaneProgressHold,
  minIntervalMs: number,
  startedAtMs: number | null
): LaneSendProgressSnapshot {
  const runAttempted = planned > 0 ? Math.min(planned, counts.runAttempted) : counts.runAttempted;
  const runSent = Math.min(runAttempted, counts.runSent);
  const runFailed = Math.min(runAttempted, counts.runFailed);
  const remainCount = planned > 0 ? Math.max(0, planned - runAttempted) : 0;
  const progressPct =
    planned > 0 ? Math.min(100, Math.round((runAttempted / planned) * 100)) : 0;
  let avgSec: number | null = null;
  if (runAttempted > 0 && startedAtMs != null) {
    const elapsedSec = Math.max(1, (Date.now() - startedAtMs) / 1000);
    avgSec = elapsedSec / runAttempted;
  }
  const remainSec =
    remainCount > 0 ? estimateLaneRemainSec(remainCount, minIntervalMs, avgSec) : 0;
  return {
    planned,
    runAttempted,
    runSent,
    runFailed,
    remainCount,
    progressPct,
    remainSec,
    avgSec
  };
}

/**
 * 从 send-progress 解析专线栏进度。
 * 有 send_run 时：attempted/sent/failed 已是本轮口径，勿再减 baseline。
 * 无 send_run 时：优先用 sessionLiveRows（会话累计实时行）托底，再回退 hold。
 */
export function resolveLaneLiveProgress(opts: {
  poll: LaneProgressPoll;
  lockedPlanned: number;
  sendPlannedLocked: boolean;
  previewAudienceCount: number | null | undefined;
  minIntervalMs: number;
  startedAtMs: number | null;
  /** 本会话 POST 锁定的 send_run_id */
  boundSendRunId?: number;
  /** 本会话累计出现的实时行（最近 3 封等），用于无 send_run 时托底计数 */
  sessionLiveRows?: { status: string }[];
  /** boundSendRunId>0 但本轮 poll 未带上同 id 时沿用上一快照计数 */
  hold?: LaneProgressHold;
}): LaneSendProgressSnapshot {
  const planned = resolveLaneSessionPlanned({
    lockedPlanned: opts.lockedPlanned,
    sendPlannedLocked: opts.sendPlannedLocked,
    previewAudienceCount: opts.previewAudienceCount,
    poll: opts.poll
  });
  const sendRunId = Math.max(0, Math.floor(Number(opts.poll.sendRunId) || 0));
  const bound = Math.max(0, Math.floor(Number(opts.boundSendRunId) || 0));

  /** poll 未带 send_run 但会话已绑定时，仍按 bound 解析（配合 sendRunId 查询参数） */
  if (sendRunId <= 0 && bound > 0) {
    return resolveLaneLiveProgress({
      ...opts,
      poll: { ...opts.poll, sendRunId: bound }
    });
  }

  if (sendRunId <= 0) {
    /** 无 send_run 时，优先用本会话累计实时行的状态数作为托底（避免列表有信但计数为 0） */
    const floor = opts.sessionLiveRows?.length
      ? laneSessionLiveCountFloor(opts.sessionLiveRows)
      : { attempted: 0, sent: 0, failed: 0, bounced: 0, suppressed: 0 };
    const hold = opts.hold ?? { runAttempted: 0, runSent: 0, runFailed: 0 };
    const merged: LaneProgressHold = {
      runAttempted: Math.max(floor.attempted, hold.runAttempted),
      runSent: Math.max(floor.sent, hold.runSent),
      runFailed: Math.max(floor.failed + floor.bounced + floor.suppressed, hold.runFailed)
    };
    return buildLaneProgressSnapshot(
      planned,
      merged,
      opts.minIntervalMs,
      opts.startedAtMs
    );
  }

  const rawAttempted = Math.max(0, Math.floor(Number(opts.poll.attempted) || 0));
  const runAttempted = planned > 0 ? Math.min(planned, rawAttempted) : rawAttempted;
  const nextCounts: LaneProgressHold = {
    runAttempted,
    runSent: Math.max(0, Math.floor(Number(opts.poll.sent) || 0)),
    runFailed: laneFailedCountFromPoll(opts.poll)
  };
  const counts = opts.hold ? laneProgressMonotonicMerge(opts.hold, nextCounts) : nextCounts;
  return buildLaneProgressSnapshot(
    planned,
    counts,
    opts.minIntervalMs,
    opts.startedAtMs
  );
}

/**
 * 结束条件（Spec）：本轮 send_run 已满 + 活动已离开 sending。
 */
export function laneSendSessionReadyToFinish(opts: {
  sawSending: boolean;
  prevStatus: string;
  nextStatus: string;
  sendRunId: number;
  sessionSendRunId: number;
  runAttempted: number;
  planned: number;
  runPlannedTotal?: number | null;
}): boolean {
  if (!opts.sawSending) return false;
  if (opts.sessionSendRunId <= 0 || opts.sendRunId <= 0) return false;
  if (opts.sendRunId !== opts.sessionSendRunId) return false;

  const prev = String(opts.prevStatus ?? "").toLowerCase();
  const next = String(opts.nextStatus ?? "").toLowerCase();
  if (next === "sending") return false;

  /** 用户点停止 / 后端写 paused：不必等尝试数满计划数 */
  if (prev === "sending" && (next === "stopped" || next === "paused")) return true;

  const effectivePlanned = laneEffectivePlannedForFinish({
    planned: opts.planned,
    runPlannedTotal: opts.runPlannedTotal,
    sendRunId: opts.sendRunId
  });
  if (effectivePlanned > 0 && opts.runAttempted < effectivePlanned) return false;

  if (next === "completed") return true;
  return false;
}

export function formatLaneSendDurationSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h} 小时 ${m} 分 ${ss} 秒`;
  if (m > 0) return `${m} 分 ${ss} 秒`;
  return `${ss} 秒`;
}

export function formatLaneSendFinishedAt(ms: number, locale: SiteLocale = "zh"): string {
  const t = Math.floor(Number(ms) || 0);
  if (t <= 0) return "—";
  try {
    return new Date(t).toLocaleString(intlLocaleTag(locale), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  } catch {
    return new Date(t).toISOString();
  }
}

export function formatLaneSendSessionSummary(s: LaneSendSessionSummary, stopped = false): string {
  const sent = Math.max(0, Math.floor(s.sent));
  const failed = Math.max(0, Math.floor(s.failed));
  const sec = Math.max(0, Math.floor(s.durationSec));
  const time = formatLaneSendDurationSec(sec);
  const code = String(s.campaignCode ?? "").trim() || "—";
  const name = String(s.campaignName ?? "").trim() || "未命名活动";
  const targetRaw = String(s.targetIndustriesNote ?? "").trim();
  const target = targetRaw.replace(/^发送目标行业：?/u, "").trim() || targetRaw || "—";
  const finishedAt = formatLaneSendFinishedAt(s.finishedAtMs ?? 0);
  if (stopped) {
    return [
      `活动 ID ${code} · ${name}`,
      `发送标签：${target}`,
      `已停止 · 成功 ${sent} 封 · 失败 ${failed} 封 · 用时 ${time}`,
      `发送时间：${finishedAt}`
    ].join("\n");
  }
  return [
    `活动 ID ${code} · ${name} · 已发送完成 ✅`,
    `发送标签：${target}`,
    `已经发送 ${sent} 封 · 用时 ${time}${failed > 0 ? ` · 失败 ${failed} 封` : ""}`,
    `发送时间：${finishedAt}`
  ].join("\n");
}

export function laneSendProgressVisible(phase: LaneSendUiPhase, planned: number): boolean {
  if (phase === "active" || phase === "completing") return planned > 0;
  return false;
}

export function laneSendProgressStatusLabel(progressPct: number, phase: LaneSendUiPhase): string {
  const p = Math.max(0, Math.min(100, Math.floor(progressPct)));
  if (phase === "completing") return "✅ 已完成";
  if (phase === "active") {
    if (p <= 0) return "发送中… 0%";
    return `发送中… ${p}%`;
  }
  return p > 0 ? "已结束" : "未在发送";
}
