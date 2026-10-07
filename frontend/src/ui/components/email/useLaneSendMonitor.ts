import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson, apiJsonWithTimeout } from "../../../lib/api";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import {
  getEmailCampaignsLaneStrings,
  localizeLaneMonitorBanner
} from "../../../i18n/emailCampaignsLaneI18n";
import { resolveFormalSendAudienceLimit } from "../../../lib/campaignSendProgressTotal";
import {
  clearLaneUserStopped,
  isLaneUserStopped,
  markLaneUserStopped
} from "../../../lib/laneFormalSendSession";
import {
  applyMonitorPoll,
  applyMonitorPollError,
  beginMonitorSession,
  bindMonitorSendRun,
  buildCompleteSummary,
  buildSessionSummaryFromPoll,
  resolveLaneEffectivePlanned,
  buildStopSummary,
  createIdleMonitorSession,
  LANE_SEND_COMPLETE_FLASH_MS,
  resolveResumePlanned,
  resumeMonitorSession,
  shouldSkipResumeFromPoll,
  type MonitorPollPayload,
  type MonitorSession,
  type LaneSendReportMeta,
  type LaneSendSessionSummary,
  type LaneSendUiPhase
} from "../../../lib/laneSendMonitorCore";

/** 多专线各栏 monitor：略降频率、减轻 DB（单组机仍用 FORMAL_SEND_LIVE_POLL_FAST_MS） */
const LANE_MULTI_SEND_POLL_MS = 520;

/** 多专线同时 poll 时错峰，减轻 send-progress 并发 */
const LANE_MONITOR_POLL_STAGGER_MS = 120;

function laneDbgLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
): void {
  // #region agent log
  fetch("http://127.0.0.1:7503/ingest/d864ed04-a7c1-4f95-adce-2666080d6809", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0bd240" },
    body: JSON.stringify({
      sessionId: "0bd240",
      location,
      message,
      data,
      timestamp: Date.now(),
      hypothesisId
    })
  }).catch(() => undefined);
  // #endregion
}

async function fetchSendProgress(
  campaignId: number,
  sendRunId?: number,
  sinceId?: number,
  fresh = false
) {
  const q = new URLSearchParams();
  const runId = Math.max(0, Math.floor(Number(sendRunId) || 0));
  if (runId > 0) q.set("sendRunId", String(runId));
  const since = Math.max(0, Math.floor(Number(sinceId) || 0));
  if (since > 0) q.set("sinceId", String(since));
  if (fresh) q.set("fresh", "1");
  q.set("laneMonitor", "1");
  const qs = q.toString();
  return apiJsonWithTimeout<MonitorPollPayload>(
    `/api/email/campaigns/${campaignId}/send-progress${qs ? `?${qs}` : ""}`,
    undefined,
    8_000
  );
}

export type UseLaneSendMonitorOpts = {
  campaignId: number;
  campaignStatus: string;
  formalAudienceCount: number | null | undefined;
  formalSelectedIndustries: string[];
  formalSendMinIntervalMs: number;
  laneIndex: number;
  disabled: boolean;
  hasIndustrySelection: boolean;
  onRefreshCampaigns: () => Promise<void>;
  onRefreshLanes?: () => Promise<void>;
  onCampaignStopped?: (campaignId: number) => void;
  /** 用户在本栏再次点「确认发送」：工作台 mask 须允许重新显示域发送中 */
  onCampaignSendStarted?: (campaignId: number) => void;
  onBeginSend?: () => void;
  onSendCompleted?: () => void;
  laneSendingCampaignId?: number;
  laneOwnsSending?: boolean;
  campaignsReady?: boolean;
  /** 专线列表 API 已返回（刷新恢复须等 lane.sendingCampaignId 就位） */
  lanesReady?: boolean;
  /** 用于刷新后识别用户已点停止（勿恢复监控） */
  sessionWatchKeyPrefix?: string;
  onResumeSend?: () => void;
  /** 收尾摘要：活动编号、名称、目标行业 */
  sendReportMeta?: LaneSendReportMeta | null;
};

export function useLaneSendMonitor(opts: UseLaneSendMonitorOpts) {
  const {
    campaignId,
    campaignStatus,
    formalAudienceCount,
    formalSelectedIndustries,
    formalSendMinIntervalMs,
    laneIndex,
    disabled,
    hasIndustrySelection,
    onRefreshCampaigns,
    onRefreshLanes,
    onCampaignStopped,
    onCampaignSendStarted,
    onBeginSend,
    onSendCompleted,
    laneSendingCampaignId = 0,
    laneOwnsSending = false,
    campaignsReady = true,
    lanesReady = true,
    sessionWatchKeyPrefix = "",
    onResumeSend,
    sendReportMeta = null
  } = opts;

  const { locale } = useSiteLocale();
  const laneUi = useMemo(() => getEmailCampaignsLaneStrings(locale), [locale]);

  const sendReportMetaRef = useRef<LaneSendReportMeta | null>(sendReportMeta);
  sendReportMetaRef.current = sendReportMeta;

  const [phase, setPhase] = useState<LaneSendUiPhase>("idle");
  const [session, setSession] = useState<MonitorSession>(() => createIdleMonitorSession());
  const [confirmSend, setConfirmSend] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [sessionSummary, setSessionSummary] = useState<LaneSendSessionSummary | null>(null);
  const [stopBusy, setStopBusy] = useState(false);

  const phaseRef = useRef(phase);
  const sessionRef = useRef(session);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStaggerRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);
  const sessionGenRef = useRef(0);
  const finishingRef = useRef(false);
  const prevStatusRef = useRef(campaignStatus);
  const minIntervalRef = useRef(formalSendMinIntervalMs);
  /** 本页访问内用户已点「确认」发送 → 禁止刷新恢复覆盖 */
  const userConfirmedSendRef = useRef(false);
  /** Step 2 刷新恢复已成功（仅成功后置 true，避免失败仍锁死重试） */
  const pageResumeSucceededRef = useRef(false);
  const pageResumeInFlightRef = useRef(false);
  /** 末封 13/13 已触发工作台占位释放（避免 finishSession 异步前仍显示域发送中） */
  const tailWorkbenchReleasedRef = useRef(false);
  const optimisticBootCampaignRef = useRef(0);

  phaseRef.current = phase;
  minIntervalRef.current = formalSendMinIntervalMs;

  /** sessionRef 仅在 commitSession / pullLive 内更新；勿在 render 里用 React state 覆盖，否则 poll 会被 idle 会话冲掉 */
  const commitSession = useCallback((next: MonitorSession | ((prev: MonitorSession) => MonitorSession)) => {
    if (typeof next === "function") {
      setSession((prev) => {
        const merged = next(prev);
        sessionRef.current = merged;
        return merged;
      });
      return;
    }
    sessionRef.current = next;
    setSession(next);
  }, []);

  const stopPoll = useCallback(() => {
    if (pollStaggerRef.current) {
      clearTimeout(pollStaggerRef.current);
      pollStaggerRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetIdle = useCallback(() => {
    stopPoll();
    setPhase("idle");
    phaseRef.current = "idle";
    const idle = createIdleMonitorSession();
    sessionRef.current = idle;
    setSession(idle);
    finishingRef.current = false;
    tailWorkbenchReleasedRef.current = false;
  }, [stopPoll]);

  const finishSession = useCallback(
    async (completed: boolean) => {
      if (finishingRef.current || phaseRef.current !== "active") return;
      finishingRef.current = true;
      sessionGenRef.current += 1;
      stopPoll();

      if (completed && campaignId > 0) onCampaignStopped?.(campaignId);

      let snap = sessionRef.current;
      const started = snap.startedAtMs;
      const finishedAtMs = Date.now();
      const durationSec =
        started != null ? Math.max(0, Math.round((finishedAtMs - started) / 1000)) : 0;

      let finalPoll: MonitorPollPayload | null = null;
      if (campaignId > 0) {
        try {
          finalPoll = await fetchSendProgress(
            campaignId,
            snap.sendRunId > 0 ? snap.sendRunId : undefined,
            undefined,
            true
          );
          const merged = applyMonitorPoll(snap, finalPoll, {
            minIntervalMs: minIntervalRef.current,
            prevCampaignStatus: prevStatusRef.current
          });
          snap = merged.session;
        } catch {
          /* 收尾前尽力拉一次 */
        }
      }

      setPhase("completing");
      commitSession((s) => ({
        ...s,
        counts: { ...s.counts, progressPct: 100, remainCount: 0, remainSec: 0 }
      }));
      await new Promise((r) => window.setTimeout(r, LANE_SEND_COMPLETE_FLASH_MS));

      const summaryPlanned = resolveLaneEffectivePlanned(snap, finalPoll);
      const finalStatus = String(finalPoll?.campaignStatus ?? "")
        .trim()
        .toLowerCase();
      const backendStopped =
        !completed &&
        (finalStatus === "stopped" ||
          finalStatus === "paused" ||
          (finalPoll?.runStillSending === false &&
            finalPoll?.runDeliveryComplete !== true &&
            finalStatus !== "sending"));
      setSessionSummary(
        finalPoll
          ? buildSessionSummaryFromPoll(
              finalPoll,
              {
                planned: summaryPlanned > 0 ? summaryPlanned : snap.lockedPlanned,
                durationSec,
                stopped: !completed,
                finishedAtMs,
                liveRows: snap.liveRows,
                sessionFailedFloor: snap.counts.failed
              },
              sendReportMetaRef.current
            )
          : buildCompleteSummary(snap, durationSec, completed, sendReportMetaRef.current, finishedAtMs)
      );
      if (completed) onSendCompleted?.();
      else if (backendStopped && campaignId > 0) onCampaignStopped?.(campaignId);
      resetIdle();
      await onRefreshCampaigns();
      await onRefreshLanes?.();
    },
    [campaignId, stopPoll, resetIdle, onRefreshCampaigns, onRefreshLanes, onSendCompleted, onCampaignStopped]
  );

  const pullLive = useCallback(
    async (id: number) => {
      if (phaseRef.current !== "active" || finishingRef.current) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      const pollStarted = Date.now();
      const pollGuard = window.setTimeout(() => {
        pollInFlightRef.current = false;
      }, 12_000);
      laneDbgLog(
        "useLaneSendMonitor.ts:pullLive",
        "poll start",
        { campaignId: id, sendRunId: sessionRef.current.sendRunId },
        "H1-poll-start"
      );
      try {
        const boundRunId = Math.max(0, sessionRef.current.sendRunId);
        const needFresh =
          sessionRef.current.liveRows.length === 0 &&
          sessionRef.current.counts.attempted <= 0;
        const raw = await fetchSendProgress(
          id,
          boundRunId > 0 ? boundRunId : undefined,
          undefined,
          needFresh
        );
        if (finishingRef.current || phaseRef.current !== "active") return;
        const result = applyMonitorPoll(sessionRef.current, raw, {
          minIntervalMs: minIntervalRef.current,
          prevCampaignStatus: prevStatusRef.current
        });
        laneDbgLog(
          "useLaneSendMonitor.ts:pullLive",
          "poll applied",
          {
            campaignId: id,
            rawAttempted: raw.attempted,
            sendRunId: result.session.sendRunId,
            displayAttempted: result.session.counts.attempted
          },
          "H1-poll-apply"
        );
        commitSession(result.session);
        if (result.banner) setActionMsg(localizeLaneMonitorBanner(result.banner, laneUi));
        else setActionMsg(null);
        if (
          result.session.counts.showSendComplete &&
          campaignId > 0 &&
          !tailWorkbenchReleasedRef.current &&
          sessionRef.current.postAck &&
          sessionRef.current.sendRunId > 0
        ) {
          tailWorkbenchReleasedRef.current = true;
          onCampaignStopped?.(campaignId);
        }
        if (result.finish) {
          void finishSession(result.finish.completed);
          return;
        }
        const pollStatus = String(raw.campaignStatus ?? "").trim().toLowerCase();
        const runDone =
          raw.runDeliveryComplete === true && raw.runStillSending === false;
        const pollAttempted = Math.max(0, Math.floor(Number(raw.attempted ?? 0)));
        const pollPlanned = Math.max(
          result.session.lockedPlanned,
          Math.floor(Number(raw.runPlannedTotal ?? 0))
        );
        if (
          result.session.postAck &&
          (pollStatus === "completed" ||
            (pollStatus === "stopped" && pollAttempted > 0) ||
            (runDone && pollPlanned > 0 && pollAttempted >= pollPlanned))
        ) {
          void finishSession(pollStatus === "completed" || runDone);
        }
      } catch (e) {
        if (finishingRef.current || phaseRef.current !== "active") return;
        const msg = String((e as Error)?.message ?? e);
        const dbOrPool = /数据库暂时不可用|MYSQL|连接池|pool|503|504/i.test(msg);
        if (dbOrPool && id > 0 && sessionRef.current.pollFailStreak < 8) {
          try {
            const recovery = await fetchSendProgress(id);
            if (finishingRef.current || phaseRef.current !== "active") return;
            const recovered = applyMonitorPoll(sessionRef.current, recovery, {
              minIntervalMs: minIntervalRef.current,
              prevCampaignStatus: prevStatusRef.current
            });
            commitSession(recovered.session);
            if (recovered.banner) setActionMsg(localizeLaneMonitorBanner(recovered.banner, laneUi));
            else setActionMsg(null);
            if (recovered.finish) {
              void finishSession(recovered.finish.completed);
            }
            return;
          } catch {
            /* 仍走失败计数 */
          }
        }
        const result = applyMonitorPollError(sessionRef.current, e);
        commitSession(result.session);
        if (result.banner) setActionMsg(localizeLaneMonitorBanner(result.banner, laneUi));
        const streak = result.session.pollFailStreak;
        if (streak > 0 && streak % 15 === 0) {
          void onRefreshCampaigns();
        }
      } finally {
        window.clearTimeout(pollGuard);
        pollInFlightRef.current = false;
        laneDbgLog(
          "useLaneSendMonitor.ts:pullLive",
          "poll finished",
          { campaignId: id, ms: Date.now() - pollStarted },
          "H5-poll-latency"
        );
      }
    },
    [finishSession, laneUi, onRefreshCampaigns, onCampaignStopped, campaignId, commitSession]
  );

  const startPoll = useCallback(
    (id: number) => {
      stopPoll();
      const run = () => void pullLive(id);
      const staggerMs = Math.max(0, Math.floor(laneIndex) - 1) * LANE_MONITOR_POLL_STAGGER_MS;
      const startInterval = () => {
        if (phaseRef.current !== "active" || finishingRef.current) return;
        pollRef.current = setInterval(run, LANE_MULTI_SEND_POLL_MS);
        void run();
      };
      if (staggerMs > 0) {
        pollStaggerRef.current = window.setTimeout(startInterval, staggerMs);
      } else {
        startInterval();
      }
    },
    [pullLive, stopPoll, laneIndex]
  );

  useEffect(() => () => stopPoll(), [stopPoll]);

  useEffect(() => {
    prevStatusRef.current = campaignStatus;
  }, [campaignStatus]);

  /** 列表已标 completed/stopped 但 send-progress 轮询失败时，仍应收尾并释放「发送中」按钮 */
  useEffect(() => {
    if (finishingRef.current || phaseRef.current !== "active") return;
    const st = String(campaignStatus ?? "").trim().toLowerCase();
    const snap = sessionRef.current;
    if (st === "completed") {
      if (!snap.postAck || snap.sendRunId <= 0) return;
      if (
        snap.counts.planned > 0 &&
        snap.counts.attempted < snap.counts.planned &&
        !snap.counts.showSendComplete
      ) {
        return;
      }
      setActionMsg(null);
      void finishSession(true);
      return;
    }
    if ((st === "stopped" || st === "paused") && snap.postAck) {
      void (async () => {
        if (finishingRef.current || phaseRef.current !== "active") return;
        try {
          const boundRunId = snap.sendRunId > 0 ? snap.sendRunId : undefined;
          const pre = await fetchSendProgress(campaignId, boundRunId, undefined, true);
          if (finishingRef.current || phaseRef.current !== "active") return;
          const preStatus = String(pre.campaignStatus ?? "").trim().toLowerCase();
          const attempted = Math.max(0, Math.floor(Number(pre.attempted ?? 0)));
          const planned = Math.max(
            snap.lockedPlanned,
            Math.floor(Number(pre.runPlannedTotal ?? 0))
          );
          if (preStatus === "sending" || pre.runStillSending === true) return;
          if (planned > 0 && attempted > 0 && attempted < planned && preStatus !== "stopped") return;
        } catch {
          return;
        }
        setActionMsg(null);
        void finishSession(false);
      })();
    }
  }, [campaignStatus, finishSession]);

  /** 发送中定期刷新活动列表，避免后台已收尾而本栏仍显示 sending + 轮询报错 */
  useEffect(() => {
    if (phase !== "active" || campaignId <= 0) return;
    const t = window.setInterval(() => {
      void onRefreshCampaigns();
    }, 4000);
    return () => window.clearInterval(t);
  }, [phase, campaignId, onRefreshCampaigns]);

  useEffect(() => {
    optimisticBootCampaignRef.current = 0;
    pageResumeSucceededRef.current = false;
    pageResumeInFlightRef.current = false;
  }, [campaignId]);

  const runPageResumeAttempt = useCallback(() => {
    if (pageResumeSucceededRef.current || userConfirmedSendRef.current) return;
    if (pageResumeInFlightRef.current) return;
    const id =
      laneSendingCampaignId > 0
        ? laneSendingCampaignId
        : campaignId > 0
          ? campaignId
          : 0;
    if (id <= 0 || disabled || !campaignsReady) return;
    if (
      sessionWatchKeyPrefix &&
      isLaneUserStopped(sessionWatchKeyPrefix, laneIndex, id)
    ) {
      laneDbgLog(
        "useLaneSendMonitor.ts:resume",
        "skip resume: user stopped",
        { campaignId: id, laneIndex },
        "H4-user-stop-suppress"
      );
      return;
    }
    const lanesGateOk =
      lanesReady ||
      String(campaignStatus ?? "").trim().toLowerCase() === "sending" ||
      laneSendingCampaignId > 0;
    if (!lanesGateOk) return;
    const hydrateWhileActive =
      phaseRef.current === "active" &&
      sessionRef.current.postAck &&
      sessionRef.current.sendRunId <= 0;
    if (phaseRef.current !== "idle" && !hydrateWhileActive) return;
    if (confirmSend || finishingRef.current || sessionSummary?.stopped) return;

    pageResumeInFlightRef.current = true;
    void (async () => {
      try {
        const pre = await fetchSendProgress(id, undefined, undefined, true);
        if (userConfirmedSendRef.current) return;
        if (phaseRef.current !== "idle" && !hydrateWhileActive) return;
        if (
          sessionWatchKeyPrefix &&
          isLaneUserStopped(sessionWatchKeyPrefix, laneIndex, id)
        ) {
          return;
        }
        if (shouldSkipResumeFromPoll(pre)) return;

        const preStatus = String(pre.campaignStatus ?? "").trim().toLowerCase();
        const runId = Math.max(0, Math.floor(Number(pre.sendRunId ?? 0)));
        const attempted = Math.max(0, Math.floor(Number(pre.attempted ?? 0)));
        const ownsLane =
          laneOwnsSending ||
          Number(laneSendingCampaignId ?? 0) === id ||
          Number(laneSendingCampaignId ?? 0) === campaignId;
        const sendingNow =
          preStatus === "sending" || runId > 0 || attempted > 0;
        if (!sendingNow && !ownsLane && campaignStatus !== "sending") return;
        const planned = resolveResumePlanned({
          runPlannedTotal: pre.runPlannedTotal,
          previewAudienceCount: formalAudienceCount
        });
        const effectivePlanned =
          planned > 0 ? planned : runId > 0 || attempted > 0 ? Math.max(attempted, 1) : 0;
        const canResume =
          runId > 0 ||
          attempted > 0 ||
          effectivePlanned > 0 ||
          campaignStatus === "sending" ||
          ownsLane;
        if (!canResume) return;
        if (userConfirmedSendRef.current) return;
        if (phaseRef.current !== "idle" && !hydrateWhileActive) return;

        laneDbgLog(
          "useLaneSendMonitor.ts:resume",
          "resume monitor hydrated",
          {
            campaignId: id,
            laneIndex,
            runId,
            attempted,
            preStatus
          },
          "H1-resume-hydrate"
        );

        onResumeSend?.();
        finishingRef.current = false;
        const resumed = resumeMonitorSession({
          planned:
            effectivePlanned > 0
              ? effectivePlanned
              : Math.max(1, attempted, Math.floor(Number(formalAudienceCount ?? 0) || 0)),
          sendRunId: runId,
          poll: pre,
          minIntervalMs: minIntervalRef.current,
          totalRecipients: formalAudienceCount ?? undefined
        });
        commitSession(resumed);
        setPhase("active");
        phaseRef.current = "active";
        setSessionSummary(null);
        setActionMsg(null);
        if (!hydrateWhileActive) {
          startPoll(id);
        }
        pageResumeSucceededRef.current = true;
      } catch {
        laneDbgLog(
          "useLaneSendMonitor.ts:resume",
          "resume fetch failed",
          { campaignId: id, laneIndex },
          "H1-resume-fail"
        );
        /* 恢复失败保持 idle，定时重试或用户可手动停止后重试 */
      } finally {
        pageResumeInFlightRef.current = false;
      }
    })();
  }, [
    campaignId,
    campaignStatus,
    confirmSend,
    disabled,
    formalAudienceCount,
    laneIndex,
    laneSendingCampaignId,
    laneOwnsSending,
    lanesReady,
    campaignsReady,
    sessionWatchKeyPrefix,
    onResumeSend,
    sessionSummary?.stopped,
    startPoll
  ]);

  /**
   * 刷新后立刻展示监控栏（占位），send-progress 到达后再对齐数字。
   */
  useEffect(() => {
    if (disabled || userConfirmedSendRef.current || pageResumeSucceededRef.current) return;
    const id =
      laneSendingCampaignId > 0
        ? laneSendingCampaignId
        : campaignId > 0
          ? campaignId
          : 0;
    if (id <= 0) return;
    if (optimisticBootCampaignRef.current === id) return;
    if (
      sessionWatchKeyPrefix &&
      isLaneUserStopped(sessionWatchKeyPrefix, laneIndex, id)
    ) {
      return;
    }
    const st = String(campaignStatus ?? "").trim().toLowerCase();
    const owns =
      laneOwnsSending ||
      Number(laneSendingCampaignId ?? 0) === id ||
      st === "sending";
    if (!owns) return;
    if (phaseRef.current !== "idle" || confirmSend || finishingRef.current || sessionSummary?.stopped) {
      return;
    }

    optimisticBootCampaignRef.current = id;
    const planned = Math.max(
      Math.floor(Number(formalAudienceCount) || 0),
      1
    );
    finishingRef.current = false;
    const optimistic = beginMonitorSession(planned, Date.now(), formalAudienceCount ?? 0);
    /** 刷新恢复：后端已在发，须 postAck 才能消费 send-progress（区别于 POST 发出前的 postAck=false） */
    commitSession({ ...optimistic, sawSending: true, postAck: true });
    setPhase("active");
    phaseRef.current = "active";
    setSessionSummary(null);
    startPoll(id);
    laneDbgLog(
      "useLaneSendMonitor.ts:optimistic",
      "optimistic monitor on refresh",
      { campaignId: id, laneIndex, campaignStatus: st },
      "H1-optimistic-resume"
    );
  }, [
    campaignId,
    campaignStatus,
    confirmSend,
    disabled,
    formalAudienceCount,
    laneIndex,
    laneOwnsSending,
    laneSendingCampaignId,
    sessionWatchKeyPrefix,
    sessionSummary?.stopped,
    startPoll,
    commitSession
  ]);

  /**
   * Step 2 · 刷新恢复：用户本页已点「确认」则绝不恢复；成功前可重试（专线/活动列表晚到）。
   */
  useEffect(() => {
    runPageResumeAttempt();
  }, [runPageResumeAttempt, phase, lanesReady, campaignsReady]);

  useEffect(() => {
    if (pageResumeSucceededRef.current || userConfirmedSendRef.current) return;
    if (campaignId <= 0 || disabled || phase !== "idle" || !lanesReady || !campaignsReady) return;
    const ownsLane =
      laneOwnsSending || Number(laneSendingCampaignId ?? 0) === campaignId;
    if (!ownsLane && campaignStatus !== "sending") return;

    const t1 = window.setTimeout(() => runPageResumeAttempt(), 400);
    const t2 = window.setTimeout(() => runPageResumeAttempt(), 1200);
    const t3 = window.setTimeout(() => runPageResumeAttempt(), 3000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [
    campaignId,
    campaignStatus,
    campaignsReady,
    disabled,
    laneOwnsSending,
    laneSendingCampaignId,
    lanesReady,
    phase,
    runPageResumeAttempt
  ]);

  const onConfirmSend = useCallback(async () => {
    if (disabled || finishingRef.current) return;
    const id = campaignId;
    if (id <= 0) {
      setActionMsg({ kind: "err", text: laneUi.errSelectCampaignId });
      return;
    }
    if (!hasIndustrySelection) {
      setActionMsg({ kind: "err", text: laneUi.errSelectIndustriesFirst });
      return;
    }
    if (formalAudienceCount == null) {
      setActionMsg({ kind: "err", text: laneUi.errAudienceLoading });
      return;
    }
    if (formalAudienceCount <= 0) {
      setActionMsg({ kind: "err", text: laneUi.errNoContactsForIndustries });
      return;
    }
    if (phaseRef.current !== "idle") {
      setActionMsg({ kind: "err", text: laneUi.errActiveSession });
      return;
    }

    userConfirmedSendRef.current = true;
    if (sessionWatchKeyPrefix && id > 0) {
      clearLaneUserStopped(sessionWatchKeyPrefix, laneIndex, id);
    }
    tailWorkbenchReleasedRef.current = false;
    if (id > 0) onCampaignSendStarted?.(id);
    const myGen = sessionGenRef.current + 1;
    sessionGenRef.current = myGen;
    finishingRef.current = false;

    setConfirmSend(false);
    setActionMsg(null);
    setSessionSummary(null);
    onBeginSend?.();

    const planned = Math.max(0, Math.floor(formalAudienceCount));
    const next = beginMonitorSession(planned, undefined, formalAudienceCount ?? 0);
    commitSession(next);
    setPhase("active");
    phaseRef.current = "active";

    try {
      const audienceLimit = resolveFormalSendAudienceLimit({
        previewAudienceCount: formalAudienceCount,
        hasIndustrySelection
      });
      const resp = await apiJson<{ sendRunId?: number }>(`/api/email/campaigns/${id}/send`, {
        method: "POST",
        body: JSON.stringify({
          minIntervalMs: minIntervalRef.current,
          industries: formalSelectedIndustries,
          triggerSource: "lane_manual",
          laneIndex,
          ...(audienceLimit != null ? { limit: audienceLimit } : {})
        })
      });
      if (myGen !== sessionGenRef.current || finishingRef.current) return;
      const runId = Math.max(0, Number(resp.sendRunId ?? 0));
      if (runId <= 0) {
        stopPoll();
        resetIdle();
        setActionMsg({ kind: "err", text: laneUi.errNoSendSession });
        return;
      }
      const bound = bindMonitorSendRun(sessionRef.current, runId);
      /** 先同步更新 ref，再开始轮询，避免吃到上一轮 send-progress */
      commitSession(bound);
      startPoll(id);
      void pullLive(id);
      void onRefreshCampaigns();
    } catch (e) {
      if (myGen !== sessionGenRef.current) return;
      sessionGenRef.current += 1;
      stopPoll();
      resetIdle();
      setActionMsg({ kind: "err", text: String((e as Error)?.message ?? e) });
      void onRefreshCampaigns();
    }
  }, [
    disabled,
    campaignId,
    hasIndustrySelection,
    formalAudienceCount,
    formalSelectedIndustries,
    formalSendMinIntervalMs,
    laneIndex,
    sessionWatchKeyPrefix,
    onBeginSend,
    onCampaignSendStarted,
    startPoll,
    pullLive,
    stopPoll,
    resetIdle,
    onRefreshCampaigns,
    laneUi
  ]);

  const onStopSend = useCallback(async () => {
    const id = campaignId;
    if (id <= 0) {
      setActionMsg({ kind: "err", text: laneUi.errSelectCampaignId });
      return;
    }
    if (phaseRef.current !== "active" && campaignStatus !== "sending") {
      setActionMsg({ kind: "err", text: laneUi.errNotSendingNoStop });
      return;
    }

    /** 须停本栏实际在发的活动（lane gate / session run），勿仅停下拉框里另一个 id */
    const stopTargetId =
      laneSendingCampaignId > 0 &&
      (laneOwnsSending || phaseRef.current === "active" || campaignStatus === "sending")
        ? laneSendingCampaignId
        : id;
    if (stopTargetId <= 0) {
      setActionMsg({ kind: "err", text: laneUi.errSelectCampaignId });
      return;
    }

    if (sessionWatchKeyPrefix) {
      markLaneUserStopped(sessionWatchKeyPrefix, laneIndex, stopTargetId);
    }
    laneDbgLog(
      "useLaneSendMonitor.ts:onStopSend",
      "user stop clicked",
      {
        campaignId: id,
        stopTargetId,
        laneIndex,
        laneSendingCampaignId,
        attempted: sessionRef.current.counts.attempted
      },
      "H2-stop-click"
    );

    const snapAtStop = sessionRef.current;
    const started = snapAtStop.startedAtMs;
    const durationSec =
      started != null ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
    const finishedAtMs = Date.now();
    const meta = sendReportMetaRef.current;
    /** 禁止只用 lockedPlanned：恢复发送时可能仍为 0，而监控栏 counts.planned 已是实发计划数 */
    const plannedAtStop = Math.max(
      0,
      Math.floor(snapAtStop.lockedPlanned),
      Math.floor(snapAtStop.counts.planned)
    );

    /** 立刻冻结监控 UI；工作台 mask 须等 /control 成功后再释放（见 standalone-lane-stop-send-stable.mdc） */
    sessionGenRef.current += 1;
    stopPoll();
    finishingRef.current = true;
    setStopBusy(true);
    setActionMsg({ kind: "ok", text: laneUi.stopping });

    const runStopControl = async (): Promise<boolean> => {
      try {
        await apiJsonWithTimeout(
          `/api/email/campaigns/${stopTargetId}/control`,
          {
            method: "POST",
            body: JSON.stringify({ action: "stop" })
          },
          12_000
        );
        return true;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        const slowOrNet = /超时|timeout|failed to fetch|502|503|504|数据库/i.test(msg);
        if (!slowOrNet) throw e;
        await new Promise((r) => window.setTimeout(r, 400));
        try {
          await apiJsonWithTimeout(
            `/api/email/campaigns/${stopTargetId}/control`,
            {
              method: "POST",
              body: JSON.stringify({ action: "stop" })
            },
            12_000
          );
          return true;
        } catch (retryErr) {
          const retryMsg = String((retryErr as Error)?.message ?? retryErr);
          if (/已处于停止|不在发送中|stopped/i.test(retryMsg)) return true;
          if (/超时|timeout|failed to fetch|502|503|504|数据库/i.test(retryMsg)) return false;
          throw retryErr;
        }
      }
    };

    const verifyBackendStopped = async (): Promise<boolean> => {
      try {
        const stopRunId = snapAtStop.sendRunId > 0 ? snapAtStop.sendRunId : undefined;
        const poll = await fetchSendProgress(stopTargetId, stopRunId, undefined, true);
        const st = String(poll.campaignStatus ?? "").trim().toLowerCase();
        if (poll.runStillSending === true || st === "sending") return false;
        return st === "stopped" || st === "paused" || st === "completed";
      } catch {
        return false;
      }
    };

    let controlOk = false;
    try {
      controlOk = await runStopControl();
    } catch (e) {
      finishingRef.current = false;
      setStopBusy(false);
      const msg = String((e as Error)?.message ?? e);
      setActionMsg({ kind: "err", text: msg });
      laneDbgLog(
        "useLaneSendMonitor.ts:onStopSend",
        "stop control error",
        { campaignId: id, msg },
        "H2-stop-fail"
      );
      return;
    }

    laneDbgLog(
      "useLaneSendMonitor.ts:onStopSend",
      "stop control result",
      { campaignId: id, stopTargetId, controlOk },
      "H2-stop-control"
    );

    if (!controlOk) {
      setActionMsg({ kind: "err", text: laneUi.stopOkPartial });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((r) => window.setTimeout(r, 800));
        try {
          if (await runStopControl()) {
            controlOk = true;
            break;
          }
        } catch {
          /* keep retrying */
        }
      }
    }

    if (controlOk) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (await verifyBackendStopped()) break;
        if (attempt < 4) {
          try {
            await runStopControl();
          } catch {
            /* retry verify */
          }
          await new Promise((r) => window.setTimeout(r, 600));
        } else {
          controlOk = false;
        }
      }
    }

    if (!controlOk) {
      finishingRef.current = false;
      setStopBusy(false);
      if (sessionWatchKeyPrefix) clearLaneUserStopped(sessionWatchKeyPrefix, laneIndex, stopTargetId);
      if (phaseRef.current === "active" && stopTargetId === id) startPoll(stopTargetId);
      void onRefreshCampaigns();
      void onRefreshLanes?.();
      setActionMsg({ kind: "err", text: laneUi.stopOkPartial });
      return;
    }

    if (sessionWatchKeyPrefix) clearLaneUserStopped(sessionWatchKeyPrefix, laneIndex, stopTargetId);
    onCampaignStopped?.(stopTargetId);
    setSessionSummary(buildStopSummary(snapAtStop, durationSec, meta, finishedAtMs));
    resetIdle();
    setStopBusy(false);
    setActionMsg({ kind: "ok", text: laneUi.stopOkFull });

    try {
      const stopRunId = snapAtStop.sendRunId > 0 ? snapAtStop.sendRunId : undefined;
      const latePoll = await fetchSendProgress(stopTargetId, stopRunId, undefined, true);
      const planned = Math.max(
        plannedAtStop,
        Math.floor(Number(latePoll.runPlannedTotal ?? 0)),
        Math.floor(Number(latePoll.recipientCount ?? 0))
      );
      setSessionSummary(
        buildSessionSummaryFromPoll(
          latePoll,
          {
            planned,
            durationSec,
            stopped: true,
            finishedAtMs,
            liveRows: snapAtStop.liveRows,
            sessionFailedFloor: snapAtStop.counts.failed
          },
          meta
        )
      );
    } catch {
      /* 保持停止瞬间快照 */
    }
    void onRefreshCampaigns();
    void onRefreshLanes?.();
  }, [
    campaignId,
    campaignStatus,
    laneIndex,
    laneSendingCampaignId,
    laneOwnsSending,
    sessionWatchKeyPrefix,
    stopPoll,
    startPoll,
    resetIdle,
    onCampaignStopped,
    onRefreshCampaigns,
    onRefreshLanes,
    laneUi
  ]);

  const abortSession = useCallback(() => {
    sessionGenRef.current += 1;
    stopPoll();
    resetIdle();
    setConfirmSend(false);
    setActionMsg(null);
  }, [stopPoll, resetIdle]);

  const laneUiActive =
    (phase === "active" || phase === "completing") && !session.counts.showSendComplete;

  return {
    phase,
    session,
    confirmSend,
    setConfirmSend,
    actionMsg,
    setActionMsg,
    sessionSummary,
    setSessionSummary,
    stopBusy,
    laneUiActive,
    onConfirmSend,
    onStopSend,
    abortSession
  };
}
