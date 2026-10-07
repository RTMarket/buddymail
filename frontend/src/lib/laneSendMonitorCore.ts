/**
 * 专线栏 · 实时监控发送（重写版纯逻辑）
 * 产品规则见 LANE_SEND_PANEL_SPEC.md 与对话确认的 Step 1 口径。
 */

import { formalSendMetricsFromPoll } from "./campaignSendProgressTotal";
import { FORMAL_SEND_LIVE_POLL_MS, applyFormalSendLivePollView } from "./formalSendLivePoll";
import {
  laneLiveFailedHintFromRows,
  laneMonitorBreakdownCounts,
  mapSendProgressRecentRows,
  syncLaneLiveRowsFromPoll,
  type LaneLiveRow
} from "./laneSendLiveRows";
import { laneFailedCountFromPoll, laneStatsAlignedFailFromPoll } from "./laneSendSession";
import { resolveLaneAcceptedDisplay } from "./laneSendTailDisplay";
import {
  estimateLaneRemainSec,
  formatLaneSendSessionSummary,
  laneSendProgressStatusLabel,
  laneSendSessionReadyToFinish,
  LANE_SEND_COMPLETE_FLASH_MS,
  type LaneSendSessionSummary,
  type LaneSendUiPhase
} from "./laneSendSession";

/** 与单组 VPS 发信区轮询间隔一致 */
export const LANE_MONITOR_POLL_MS = FORMAL_SEND_LIVE_POLL_MS;
export { LANE_SEND_COMPLETE_FLASH_MS, formatLaneSendSessionSummary, laneSendProgressStatusLabel };
export type { LaneSendSessionSummary, LaneSendUiPhase, LaneLiveRow };

export type MonitorPollPayload = {
  attempted?: number | null;
  sent?: number | null;
  failed?: number | null;
  campaignFailCount?: number | null;
  summaryFailCount?: number | null;
  runFailCount?: number | null;
  smtpFailed?: number | null;
  bounceFailures?: number | null;
  suppressedCount?: number | null;
  sendingDistinct?: number | null;
  totalRows?: number | null;
  sendRunId?: number | null;
  runPlannedTotal?: number | null;
  recipientCount?: number | null;
  campaignStatus?: string | null;
  runStillSending?: boolean | null;
  lastAsyncError?: string | null;
  warmingUp?: boolean | null;
  prepStage?: string | null;
  prepDetail?: string | null;
  prepBlockReason?: string | null;
  prepAgeMs?: number | null;
  /** 本轮投递已结束：attempted≥计划 且无 sending（后端计算） */
  runDeliveryComplete?: boolean | null;
  sendWorkerAlive?: boolean | null;
  recent?: Array<{
    id?: number | null;
    email?: string | null;
    status?: string | null;
    error?: string | null;
    createdAt?: string | Date | null;
    created_at?: string | Date | null;
    openCount?: number | null;
    clickCount?: number | null;
    bounceEventCount?: number | null;
  }>;
};

export type MonitorCounts = {
  planned: number;
  attempted: number;
  sent: number;
  failed: number;
  delivered: number;
  smtpFailed: number;
  bounced: number;
  suppressed: number;
  /** 仍在 SMTP/DB 为 sending 的去重邮箱数 */
  inFlight: number;
  /** 已有终态（成功+失败，失败含退信/拒收，与统计页一致） */
  processedDone: number;
  /** 进度用：终态 + 在途 */
  progressTouched: number;
  progressPct: number;
  remainCount: number;
  remainSec: number;
  avgSec: number | null;
  /** 末封触达计划：面板显示「发送完成 ✅」 */
  showSendComplete: boolean;
};

export type MonitorSession = {
  phase: LaneSendUiPhase;
  /** 确认时锁定的预览计划数；有 send_run 后以 poll.runPlannedTotal 校准（去重后实发数） */
  lockedPlanned: number;
  /** 受众联系人总数（去重前），用于「N 个联系人 · M 个唯一邮箱」展示 */
  totalRecipients: number;
  sendRunId: number;
  postAck: boolean;
  sawSending: boolean;
  startedAtMs: number | null;
  liveRows: LaneLiveRow[];
  counts: MonitorCounts;
  atPlanPollTicks: number;
  /** 剩余 ≤1 封且轮次已结束：连续 poll 计数，用于 15/16 收尾 */
  nearDonePollTicks: number;
  /** 后端判定本轮已发完（无 sending） */
  deliveryCompletePollTicks: number;
  pollFailStreak: number;
  /** 最近一次 send-progress 返回的准备阶段文案 */
  prepDetail: string | null;
  /** 后端诊断：worker 未跑 / 准备超时等（非致命，勿触发收尾） */
  prepBlockReason: string | null;
  /** 当前准备阶段已持续毫秒（send-progress） */
  prepAgeMs: number;
  /** 后台 executeCampaignSend 异常（若有） */
  lastAsyncError: string | null;
  /** 已受理 UI 卡住计时：同数 + 在途 ≥6.5s 时补 +1（最多到 planned） */
  lastDisplayAccepted?: number;
  lastDisplayAcceptedAtMs?: number;
};

export function createIdleMonitorSession(): MonitorSession {
  return {
    phase: "idle",
    lockedPlanned: 0,
    totalRecipients: 0,
    sendRunId: 0,
    postAck: false,
    sawSending: false,
    startedAtMs: null,
    liveRows: [],
    counts: emptyCounts(0),
    atPlanPollTicks: 0,
    nearDonePollTicks: 0,
    deliveryCompletePollTicks: 0,
    pollFailStreak: 0,
    prepDetail: null,
    prepBlockReason: null,
    prepAgeMs: 0,
    lastAsyncError: null
  };
}

function emptyCounts(planned: number): MonitorCounts {
  return {
    planned,
    attempted: 0,
    sent: 0,
    failed: 0,
    delivered: 0,
    smtpFailed: 0,
    bounced: 0,
    suppressed: 0,
    inFlight: 0,
    processedDone: 0,
    progressTouched: 0,
    progressPct: 0,
    remainCount: planned > 0 ? planned : 0,
    remainSec: 0,
    avgSec: null,
    showSendComplete: false
  };
}

/** 确认发送：立刻进入 active，锁定 preview 计划数 */
export function beginMonitorSession(planned: number, nowMs = Date.now(), totalRecipients?: number): MonitorSession {
  const n = Math.max(0, Math.floor(planned));
  const total = totalRecipients != null && Number.isFinite(totalRecipients) ? Math.max(0, Math.floor(totalRecipients)) : 0;
  return {
    phase: "active",
    lockedPlanned: n,
    totalRecipients: total > 0 ? total : n,
    sendRunId: 0,
    postAck: false,
    sawSending: false,
    startedAtMs: nowMs,
    liveRows: [],
    counts: {
      ...emptyCounts(n),
      remainSec: n > 0 ? estimateLaneRemainSec(n, 0, null) : 0
    },
    atPlanPollTicks: 0,
    nearDonePollTicks: 0,
    deliveryCompletePollTicks: 0,
    pollFailStreak: 0,
    prepDetail: null,
    prepBlockReason: null,
    prepAgeMs: 0,
    lastAsyncError: null
  };
}

/** 轮询/收尾用计划数：后端去重后 runPlannedTotal 覆盖发送前锁定的预览人数 */
export function resolveLaneEffectivePlanned(
  session: Pick<MonitorSession, "lockedPlanned" | "postAck">,
  poll: MonitorPollPayload | null | undefined
): number {
  const locked = Math.max(0, Math.floor(session.lockedPlanned));
  const runPlanned = Math.max(0, Math.floor(Number(poll?.runPlannedTotal ?? 0)));
  const recipient = Math.max(0, Math.floor(Number(poll?.recipientCount ?? 0)));
  if (session.postAck && runPlanned > 0) return runPlanned;
  if (session.postAck && recipient > 0 && (locked <= 0 || recipient < locked)) return recipient;
  return locked;
}

export function bindMonitorSendRun(session: MonitorSession, sendRunId: number): MonitorSession {
  const runId = Math.max(0, Math.floor(sendRunId));
  if (runId <= 0) return session;
  return {
    ...session,
    sendRunId: runId,
    postAck: true,
    sawSending: true
  };
}

function buildCounts(
  planned: number,
  attempted: number,
  sent: number,
  failed: number,
  delivered: number,
  smtpFailed: number,
  bounced: number,
  suppressed: number,
  minIntervalMs: number,
  startedAtMs: number | null,
  sendingDistinct = 0,
  pollAttemptedRaw?: number,
  opts?: { runDeliveryComplete?: boolean }
): MonitorCounts {
  const inFlight = Math.max(0, Math.floor(sendingDistinct));
  const rawAttempted = Math.max(
    0,
    Math.floor(pollAttemptedRaw != null ? pollAttemptedRaw : attempted)
  );
  const display = resolveLaneAcceptedDisplay({
    planned,
    processed: rawAttempted,
    inFlight
  });
  const runAttempted = display.accepted;
  const runSent = Math.min(runAttempted, Math.max(0, Math.floor(sent)));
  const runFailed = Math.min(runAttempted, Math.max(0, Math.floor(failed)));
  const terminalDone = Math.min(planned, rawAttempted);
  const remainCount = display.remain;
  const deliveryDone =
    display.showSendComplete &&
    (inFlight === 0 || opts?.runDeliveryComplete === true);
  const progressPct = display.progressPct;
  let avgSec: number | null = null;
  const doneForAvg = terminalDone > 0 ? terminalDone : runAttempted;
  if (doneForAvg > 0 && startedAtMs != null) {
    avgSec = Math.max(1, (Date.now() - startedAtMs) / 1000) / doneForAvg;
  }
  const remainSec =
    display.showSendComplete || remainCount <= 0
      ? 0
      : remainCount > 0
        ? estimateLaneRemainSec(remainCount, minIntervalMs, avgSec)
        : 0;
  return {
    planned,
    attempted: runAttempted,
    sent: runSent,
    failed: runFailed,
    delivered,
    smtpFailed,
    bounced,
    suppressed,
    inFlight: inFlight,
    processedDone: terminalDone,
    progressTouched: runAttempted,
    progressPct,
    remainCount,
    remainSec,
    avgSec,
    showSendComplete: display.showSendComplete
  };
}

/** 同数卡在途超过该毫秒则 UI 先补 +1（SMTP 对账约 5–8s 才写回 processed） */
const LANE_ACCEPTED_STALE_BUMP_MS = 6_500;

export type MonitorPollBanner =
  | { kind: "ok" | "err"; text: string }
  | { kind: "err"; pollError: "db_busy" }
  | { kind: "err"; pollError: "transient"; detail: string }
  | { kind: "err"; pollError: "fatal"; detail: string };

export type MonitorPollResult = {
  session: MonitorSession;
  /** 须结束会话；completed=true 表示正常完成，false=停止/错误 */
  finish: null | { completed: boolean; reason: "async_error" | "status" | "at_plan" | "tail_display" };
  /** 非致命提示（如轮询失败） */
  banner: MonitorPollBanner | null;
};

/** 单次 poll 响应 → 更新会话；结束判定只在此处与 stop 触发 */
export function applyMonitorPoll(
  session: MonitorSession,
  poll: MonitorPollPayload,
  opts: { minIntervalMs: number; prevCampaignStatus?: string }
): MonitorPollResult {
  // pullLive 已用 phaseRef 守卫；勿再读 session.phase（React render 可能把 sessionRef 冲成 idle）
  const asyncErr = String(poll.lastAsyncError ?? "").trim();
  if (asyncErr) {
    return {
      session: { ...session, pollFailStreak: 0 },
      finish: { completed: false, reason: "async_error" },
      banner: { kind: "err", text: asyncErr }
    };
  }

  const respRunId = Math.max(0, Math.floor(Number(poll.sendRunId ?? 0)));
  let sessionBoundRunId = Math.max(0, Math.floor(session.sendRunId));

  /** POST bind 前：不把历史 send-progress 当本轮 */
  if (sessionBoundRunId <= 0 && !session.postAck) {
    return {
      session: { ...session, pollFailStreak: 0 },
      finish: null,
      banner: null
    };
  }

  let next = session;
  if (respRunId > 0 && sessionBoundRunId <= 0 && session.postAck) {
    next = { ...next, sendRunId: respRunId, sawSending: true };
  } else if (
    respRunId > 0 &&
    sessionBoundRunId > 0 &&
    respRunId !== sessionBoundRunId &&
    session.postAck
  ) {
    /** DB 活跃 send_run 与本地绑定不一致（刷新/上一轮 finalize 滞后）：跟随后端权威 id，勿丢弃 poll */
    next = { ...next, sendRunId: respRunId, sawSending: true };
  }
  sessionBoundRunId = Math.max(0, Math.floor(next.sendRunId));

  const sendRunId = sessionBoundRunId > 0 ? sessionBoundRunId : respRunId;
  const sendRunBound = session.postAck && sendRunId > 0;

  const runPlannedTotal = Math.max(0, Math.floor(Number(poll.runPlannedTotal ?? 0)));
  const recipientCountPoll = Math.max(0, Math.floor(Number(poll.recipientCount ?? 0)));
  let planned = resolveLaneEffectivePlanned(next, poll);
  if (planned <= 0) planned = Math.max(runPlannedTotal, recipientCountPoll, 1);

  const view = applyFormalSendLivePollView(poll, {
    previewAudienceCount: next.lockedPlanned,
    campaignRecipientCount: next.totalRecipients > 0 ? next.totalRecipients : recipientCountPoll,
    hasIndustrySelection: next.lockedPlanned > 0,
    plannedLocked: planned,
    plannedLockedFlag: next.postAck,
    baselines: { baselineAttempted: 0, baselineSent: 0, baselineFailed: 0 },
    prevLiveRows: next.liveRows,
    prevBreakdown: {
      smtpFailed: next.counts.smtpFailed,
      bounced: next.counts.bounced,
      suppressed: next.counts.suppressed,
      deliveryIssues: next.counts.failed
    },
    sendRunBound,
    dripLiveRows: false
  });

  planned = view.planned;
  if (next.lockedPlanned !== planned && planned > 0) {
    next = { ...next, lockedPlanned: planned };
  }

  const liveRows = view.liveRows;
  const breakdown = view.breakdown;
  const sendingDistinctPoll = view.sendingInFlight;
  const pollAttempted = Math.max(0, Math.floor(Number(poll.attempted ?? 0)));
  const pollSent = Math.max(0, Math.floor(Number(poll.sent ?? 0)));
  const runDeliveryCompleteEarly = poll.runDeliveryComplete === true;

  let avgSec: number | null = null;
  const terminalDone = Math.min(planned, pollAttempted);
  const doneForAvg = terminalDone > 0 ? terminalDone : view.runAttempted;
  if (doneForAvg > 0 && next.startedAtMs != null) {
    avgSec = Math.max(1, (Date.now() - next.startedAtMs) / 1000) / doneForAvg;
  }

  /** 与单组 VPS applyFormalSendLivePollView 同口径（processed+在途，首封即 1/N） */
  let counts: MonitorCounts = {
    planned: view.planned,
    attempted: view.runAttempted,
    sent: Math.min(view.runAttempted, view.runSent),
    failed: Math.min(view.runAttempted, view.runFailed),
    delivered: pollSent,
    smtpFailed: breakdown.smtpFailed,
    bounced: breakdown.bounced,
    suppressed: breakdown.suppressed,
    inFlight: sendingDistinctPoll,
    processedDone: terminalDone,
    progressTouched: view.runAttempted,
    progressPct: view.progressPct,
    remainCount: view.remain,
    remainSec:
      view.showSendComplete || view.remain <= 0
        ? 0
        : estimateLaneRemainSec(view.remain, opts.minIntervalMs, avgSec),
    avgSec,
    showSendComplete: view.showSendComplete
  };

  /** 发送中 poll 偶发回退时勿把「已受理」闪回更小值 */
  if (counts.attempted < session.counts.attempted) {
    counts = {
      ...counts,
      attempted: session.counts.attempted,
      progressTouched: Math.max(counts.progressTouched, session.counts.attempted),
      remainCount: Math.max(0, planned - session.counts.attempted),
      progressPct: Math.min(
        99,
        Math.max(counts.progressPct, session.counts.progressPct)
      )
    };
  }

  /** 单封 SMTP 挂起：同数在途 ≥6.5s 先展示下一格，避免 15/28 长期不动 */
  const prevDisplay = session.lastDisplayAccepted ?? session.counts.attempted;
  let displayAtMs = next.lastDisplayAcceptedAtMs ?? next.startedAtMs ?? Date.now();
  if (counts.attempted > prevDisplay) {
    displayAtMs = Date.now();
  } else if (
    counts.attempted < planned &&
    sendingDistinctPoll > 0 &&
    counts.attempted === prevDisplay &&
    Date.now() - displayAtMs >= LANE_ACCEPTED_STALE_BUMP_MS
  ) {
    const bumped = Math.min(planned, counts.attempted + 1);
    counts = {
      ...counts,
      attempted: bumped,
      progressTouched: bumped,
      remainCount: Math.max(0, planned - bumped),
      progressPct: Math.min(99, Math.round((bumped / planned) * 100))
    };
    displayAtMs = Date.now();
  }
  next = {
    ...next,
    lastDisplayAccepted: counts.attempted,
    lastDisplayAcceptedAtMs: displayAtMs
  };

  const progressStatus = String(poll.campaignStatus ?? "").trim().toLowerCase();
  const runStillSending = poll.runStillSending !== false;
  const runDeliveryComplete = runDeliveryCompleteEarly;
  const sendWorkerAlive = poll.sendWorkerAlive !== false;

  /** 收尾：本轮已受理数 >= 计划数，且无在途 sending（保证绿色框 sent/failed 有数） */
  const finishPlanned = Math.max(planned, runPlannedTotal || 0, recipientCountPoll || 0);
  const effectivePlan =
    runPlannedTotal > 0 && next.postAck ? runPlannedTotal : finishPlanned;
  const reachedFinishPlan =
    effectivePlan > 0 &&
    pollAttempted >= effectivePlan &&
    sendingDistinctPoll === 0 &&
    pollAttempted > 0;
  const reachedRunPlan =
    runPlannedTotal > 0 &&
    pollAttempted >= runPlannedTotal &&
    sendingDistinctPoll === 0 &&
    pollAttempted > 0;

  let deliveryComplete =
    (reachedFinishPlan || reachedRunPlan) && sendRunId > 0 && next.sawSending;

  /** 面板已显示 13/13 + 发送完成 ✅ 时，后台 inFlight 归零即收尾（绿色汇报另验） */
  if (
    !deliveryComplete &&
    counts.showSendComplete &&
    sendingDistinctPoll === 0 &&
    sendRunId > 0 &&
    next.sawSending
  ) {
    deliveryComplete = true;
  }

  /** 后端已判定本轮投递结束（含 totalRows 触达计划、末封 endgame 后） */
  if (!deliveryComplete && runDeliveryCompleteEarly && sendingDistinctPoll === 0 && sendRunId > 0 && next.sawSending) {
    deliveryComplete = true;
  }

  /** 兜底：后端判定本轮已结束 */
  if (
    !deliveryComplete &&
    sendingDistinctPoll === 0 &&
    next.sawSending &&
    sendRunId > 0 &&
    pollAttempted > 0 &&
    (runDeliveryCompleteEarly || runStillSending === false)
  ) {
    deliveryComplete = true;
  }

  /** 完成时 attempted 对齐到计划数，保证显示 X/X 而非少于计划 */
  if (deliveryComplete && effectivePlan > 0 && counts.attempted < effectivePlan) {
    counts = { ...counts, attempted: effectivePlan, progressPct: 100, remainCount: 0, remainSec: 0 };
  }

  let deliveryCompletePollTicks = next.deliveryCompletePollTicks ?? 0;
  if (deliveryComplete) deliveryCompletePollTicks += 1;
  else deliveryCompletePollTicks = 0;

  let atPlanPollTicks = next.atPlanPollTicks;
  const atPlan = deliveryComplete;

  if (atPlan) atPlanPollTicks += 1;
  else atPlanPollTicks = 0;

  const nearDone = deliveryComplete;
  let nearDonePollTicks = next.nearDonePollTicks ?? 0;
  if (nearDone) nearDonePollTicks += 1;
  else nearDonePollTicks = 0;

  const prepDetailRaw = String(poll.prepDetail ?? "").trim();
  const prepBlockRaw = String(poll.prepBlockReason ?? "").trim();
  const asyncErrRaw = String(poll.lastAsyncError ?? "").trim();
  const prepAgeMs = Math.max(0, Math.floor(Number(poll.prepAgeMs ?? 0)));

  next = {
    ...next,
    sendRunId,
    liveRows,
    counts,
    atPlanPollTicks,
    nearDonePollTicks,
    deliveryCompletePollTicks,
    pollFailStreak: 0,
    prepDetail: prepDetailRaw || next.prepDetail,
    prepBlockReason: prepBlockRaw || next.prepBlockReason,
    prepAgeMs: prepAgeMs > 0 ? prepAgeMs : next.prepAgeMs,
    lastAsyncError: asyncErrRaw || next.lastAsyncError
  };

  /** 活动已离开 sending：须已见过 sending 且满足完成/停止条件 */
  if (
    progressStatus &&
    progressStatus !== "sending" &&
    next.sawSending &&
    sendRunId > 0
  ) {
    if (progressStatus === "stopped" || progressStatus === "paused") {
      return {
        session: next,
        finish: { completed: false, reason: "status" },
        banner: null
      };
    }
    if (
      progressStatus === "completed" &&
      (counts.attempted >= finishPlanned || !runStillSending || !sendWorkerAlive)
    ) {
      return {
        session: next,
        finish: { completed: true, reason: "status" },
        banner: null
      };
    }
    if (
      progressStatus === "draft" &&
      counts.attempted <= 0 &&
      runStillSending
    ) {
      /** 列表 refresh 闪 draft、后台仍在跑：不收尾 */
      return { session: next, finish: null, banner: null };
    }
  }

  /** 本轮已发完：后端 runDeliveryComplete 或已无在途且触达计划 → 直接收尾（一次 poll） */
  if (deliveryComplete && next.sawSending && sendRunId > 0) {
    return {
      session: next,
      finish: { completed: true, reason: "at_plan" },
      banner: null
    };
  }

  /** 面板 13/13 + 发送完成 ✅：释放发信区/工作台「发送中」（不必等 DB sending=0） */
  if (
    counts.showSendComplete &&
    next.sawSending &&
    sendRunId > 0 &&
    next.postAck
  ) {
    return {
      session: next,
      finish: { completed: true, reason: "tail_display" },
      banner: null
    };
  }

  const prevStatus = String(opts.prevCampaignStatus ?? "").toLowerCase();
  if (
    laneSendSessionReadyToFinish({
      sawSending: next.sawSending,
      prevStatus,
      nextStatus: progressStatus,
      sendRunId,
      sessionSendRunId: next.sendRunId,
      runAttempted: counts.attempted,
      planned,
      runPlannedTotal: planned
    })
  ) {
    return {
      session: next,
      finish: { completed: progressStatus === "completed", reason: "status" },
      banner: null
    };
  }

  return { session: next, finish: null, banner: null };
}

function shortenPollErrorDetail(msg: string): string {
  const s = String(msg ?? "").trim();
  if (!s) return "";
  if (/failed to fetch/i.test(s)) return "";
  if (/请求超时|timeout|aborted/i.test(s)) return "请求超时";
  if (/502|503|504/.test(s)) return "服务繁忙";
  if (/数据库暂时不可用|MYSQL|连接池|pool/i.test(s)) return "";
  return s.length > 48 ? `${s.slice(0, 48)}…` : s;
}

export function applyMonitorPollError(
  session: MonitorSession,
  err: unknown
): MonitorPollResult {
  const streak = session.pollFailStreak + 1;
  const next = { ...session, pollFailStreak: streak };
  const msg = String((err as Error)?.message ?? err);
  const dbOrPool =
    /数据库暂时不可用|MYSQL|连接池|pool|PROTOCOL_CONNECTION/i.test(msg);
  const transient =
    dbOrPool ||
    /failed to fetch|network|timeout|aborted|502|503|504/i.test(msg) ||
    msg.includes("请求超时");
  /** 多专线并发 poll 时偶发失败：提高阈值，减少红字闪烁 */
  const threshold = dbOrPool ? 28 : transient ? 22 : 10;
  if (streak >= threshold) {
    const detail = shortenPollErrorDetail(msg);
    return {
      session: next,
      finish: null,
      banner: dbOrPool
        ? { kind: "err", pollError: "db_busy" }
        : transient
          ? { kind: "err", pollError: "transient", detail }
          : { kind: "err", pollError: "fatal", detail: detail || msg.slice(0, 80) }
    };
  }
  return { session: next, finish: null, banner: null };
}

function formatPrepWaitSuffix(prepAgeMs: number): string {
  const sec = Math.round(Math.max(0, prepAgeMs) / 1000);
  return sec > 0 ? `（已 ${sec} 秒）` : "";
}

/** 从 prepDetail 推断在途（首封 INSERT 后、聚合尚未刷新时） */
export function laneInFlightFromPrepDetail(prepDetail: string | null | undefined): number {
  const p = String(prepDetail ?? "").trim();
  if (p.startsWith("正在投递")) return 1;
  return 0;
}

/** 监控区等待首封时的提示（Step 1 口径；展示后端 prepDetail 便于区分卡在何处） */
export function monitorWaitingHint(session: MonitorSession): string {
  if (session.phase !== "active") return "";
  const inFlightPrep = laneInFlightFromPrepDetail(session.prepDetail);
  if (
    session.liveRows.length > 0 ||
    session.counts.progressTouched > 0 ||
    session.counts.processedDone > 0 ||
    inFlightPrep > 0
  ) {
    return "";
  }
  const asyncErr = String(session.lastAsyncError ?? "").trim();
  if (asyncErr) return `发送异常：${asyncErr}`;
  const prep = String(session.prepDetail ?? "").trim();
  if (prep) return `${prep}${formatPrepWaitSuffix(session.prepAgeMs)}`;
  if (!session.postAck) return "正在提交发送任务…";
  return "";
}

export function monitorLiveRowPlaceholder(session: MonitorSession, index: number): string {
  if (session.phase !== "active") return "—";
  if (session.liveRows[index]) return "";
  const filled = session.liveRows.length;
  const attempted = Math.max(session.counts.attempted, filled);
  if (attempted > 0 || filled > 0) return "等待下一封…";
  return "准备中…";
}

export type LaneSendReportMeta = {
  campaignCode?: string;
  campaignName?: string;
  targetIndustriesNote?: string;
};

function withReportMeta(
  base: LaneSendSessionSummary,
  meta?: LaneSendReportMeta | null
): LaneSendSessionSummary {
  if (!meta) return base;
  return {
    ...base,
    campaignCode: meta.campaignCode,
    campaignName: meta.campaignName,
    targetIndustriesNote: meta.targetIndustriesNote
  };
}

/** 绿色/停止汇报：以 send-progress 聚合为准（避免会话计数未刷新时全 0） */
export function buildSessionSummaryFromPoll(
  poll: MonitorPollPayload,
  opts: {
    planned: number;
    durationSec: number;
    stopped: boolean;
    finishedAtMs?: number;
    liveRows?: LaneLiveRow[];
    sessionFailedFloor?: number;
  },
  meta?: LaneSendReportMeta | null
): LaneSendSessionSummary {
  const planned = Math.max(0, Math.floor(opts.planned));
  const metrics = formalSendMetricsFromPoll(poll, {
    plannedLocked: planned,
    baselineAttempted: 0,
    baselineSent: 0,
    baselineFailed: 0
  });
  const attempted = metrics.runAttempted;
  const sent = metrics.runSent;
  /** 绿框失败数与统计页 DISTINCT 对齐；勿再 max metrics.runFailed（其 smtp+bounce 分项会 +1） */
  let failed = laneFailedCountFromPoll(poll);
  const statsFailAligned = laneStatsAlignedFailFromPoll(poll);
  if (statsFailAligned == null && opts.liveRows?.length) {
    failed = Math.max(failed, laneLiveFailedHintFromRows(opts.liveRows));
  }
  /** 仅 poll/live 尚无失败时，才用会话监控托底（监控分项 smtp+bounce 可能比统计 DISTINCT 多 1） */
  if (failed <= 0 && opts.sessionFailedFloor != null) {
    failed = Math.max(failed, Math.max(0, Math.floor(opts.sessionFailedFloor)));
  }
  /** 收尾：attempted 对齐计划数 */
  const attemptedOut =
    !opts.stopped && planned > 0 ? Math.max(attempted, planned) : attempted;
  let failedOut = Math.min(attemptedOut, failed);
  let sentOut = Math.min(attemptedOut, sent);
  /**
   * 末封 tail_display：对齐 attempted；差额计入成功（与统计页 DISTINCT 失败数一致，勿再 +1 失败）。
   */
  if (!opts.stopped && planned > 0 && attemptedOut >= planned) {
    const residual = attemptedOut - sentOut - failedOut;
    if (residual > 0) {
      /** 失败数已由 API/统计对齐时，末封差额只能是成功，勿再 +1 失败 */
      sentOut = Math.min(attemptedOut, sentOut + residual);
    }
  }
  if (failedOut > 0) {
    sentOut = Math.min(sentOut, Math.max(0, attemptedOut - failedOut));
  }
  return withReportMeta(
    {
      planned,
      attempted: attemptedOut,
      sent: sentOut,
      failed: failedOut,
      durationSec: Math.max(0, Math.floor(opts.durationSec)),
      stopped: opts.stopped,
      finishedAtMs: opts.finishedAtMs ?? Date.now()
    },
    meta
  );
}

export function buildStopSummary(
  session: MonitorSession,
  durationSec: number,
  meta?: LaneSendReportMeta | null,
  finishedAtMs?: number
): LaneSendSessionSummary {
  const sentN = Math.max(session.counts.sent, session.counts.delivered);
  /** 停止瞬间优先用监控栏已显示的计划数；lockedPlanned 可能仍为 0（恢复发送未锁住） */
  const planned = Math.max(
    0,
    Math.floor(session.counts.planned),
    Math.floor(session.lockedPlanned)
  );
  return withReportMeta(
    {
      planned,
      attempted: session.counts.attempted,
      sent: sentN,
      failed: session.counts.failed,
      durationSec,
      stopped: true,
      finishedAtMs: finishedAtMs ?? Date.now()
    },
    meta
  );
}

export function buildCompleteSummary(
  session: MonitorSession,
  durationSec: number,
  completed: boolean,
  meta?: LaneSendReportMeta | null,
  finishedAtMs?: number
): LaneSendSessionSummary {
  const sentN = Math.max(session.counts.sent, session.counts.delivered);
  return withReportMeta(
    {
      planned: session.counts.planned,
      attempted: session.counts.attempted,
      sent: sentN,
      failed: session.counts.failed,
      durationSec,
      stopped: !completed,
      finishedAtMs: finishedAtMs ?? Date.now()
    },
    meta
  );
}

/** 刷新/返回页面：从 send-progress 恢复本会话（须 DB 仍 sending 且本专线占有） */
export function resolveResumePlanned(opts: {
  runPlannedTotal?: number | null;
  previewAudienceCount?: number | null | undefined;
}): number {
  const run = Math.max(0, Math.floor(Number(opts.runPlannedTotal) || 0));
  const preview = Math.max(0, Math.floor(Number(opts.previewAudienceCount) || 0));
  if (run > 0) return run;
  return preview;
}

export function resumeMonitorSession(opts: {
  planned: number;
  sendRunId: number;
  poll: MonitorPollPayload;
  minIntervalMs: number;
  nowMs?: number;
  totalRecipients?: number;
}): MonitorSession {
  const planned = Math.max(0, Math.floor(opts.planned));
  const sendRunId = Math.max(0, Math.floor(opts.sendRunId));
  const nowMs = opts.nowMs ?? Date.now();
  const totalRecipients = opts.totalRecipients != null && Number.isFinite(opts.totalRecipients)
    ? Math.max(0, Math.floor(opts.totalRecipients))
    : planned;
  const result = applyMonitorPoll(
    {
      ...beginMonitorSession(planned, nowMs, totalRecipients),
      sendRunId,
      postAck: sendRunId > 0,
      sawSending: true
    },
    opts.poll,
    { minIntervalMs: opts.minIntervalMs }
  );
  return result.session;
}

export function shouldSkipResumeFromPoll(poll: MonitorPollPayload): boolean {
  const status = String(poll.campaignStatus ?? "").trim().toLowerCase();
  const runId = Math.max(0, Math.floor(Number(poll.sendRunId ?? 0)));
  const attempted = Math.max(0, Math.floor(Number(poll.attempted ?? 0)));
  const planned = Math.max(0, Math.floor(Number(poll.runPlannedTotal ?? 0)));
  if (status === "completed" || status === "stopped" || status === "paused") return true;
  if (status === "sending" || runId > 0) {
    if (planned > 0 && attempted >= planned && poll.runStillSending === false) return true;
    return false;
  }
  if (status && status !== "sending") return true;
  return false;
}

/** 本专线（含分域）是否占有该活动的 sending 占位 */
export function laneSnapshotOwnsSending(
  lane: {
    sendingCampaignId?: number | null;
    domains?: Array<{ sendingCampaignId?: number | null }>;
  },
  campaignId: number
): boolean {
  const id = Math.max(0, Math.floor(campaignId));
  if (id <= 0) return false;
  if (Number(lane.sendingCampaignId ?? 0) === id) return true;
  return (lane.domains ?? []).some((d) => Number(d.sendingCampaignId ?? 0) === id);
}
