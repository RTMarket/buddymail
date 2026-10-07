import React, { useMemo } from "react";
import {
  buildMonitorDisplaySlots,
  formatFormalSendCompletionLines,
  type FormalSendReportSnapshot,
  type LaneDeliveryOutcome,
  type LaneLiveRow
} from "../../../lib/marketingSendMonitor";
import { FORMAL_SEND_LIVE_POLL_MS } from "../../../lib/formalSendLivePoll";

const FORMAL_SEND_LIVE_POLL_SEC = FORMAL_SEND_LIVE_POLL_MS / 1000;
const MONITOR_RECENT_ROW_COUNT = 5;

type Props = {
  laneLabel?: string | null;
  monitorCampaignSelect?: React.ReactNode | null;
  monitorIdleHint: React.ReactNode;
  monitorLive: boolean;
  liveRows?: LaneLiveRow[];
  successCount?: number;
  failCount?: number;
  planned: number;
  /** 已尝试/已处理（含在途），用于汇总行 */
  attemptedCount?: number;
  remainCount?: number;
  remainSec?: number;
  progressPct?: number;
  avgSecPerMail?: number | null;
  audienceIndustryNote?: string | null;
  totalContacts?: number | null;
  completionReport: FormalSendReportSnapshot | null;
  onDismissCompletion?: () => void;
  embedded?: boolean;
  /** @deprecated 请用 showRecentRows */
  progressOnly?: boolean;
  /** 是否展示最近邮件列表（默认开） */
  showRecentRows?: boolean;
  sendingInFlight?: number;
  progressTouched?: number;
  processedDone?: number;
  title?: string;
};

/** 发送中：已处理 / 成功 / 失败 / 投递中（与 send-progress 轮询同步） */
export function formatLaneSendLiveTally(opts: {
  planned: number;
  processedDone: number;
  progressTouched?: number;
  successCount: number;
  failCount: number;
  sendingInFlight?: number;
}): string {
  const planned = Math.max(0, Math.floor(opts.planned));
  const done = Math.max(0, Math.floor(opts.processedDone));
  const touched = Math.max(
    done,
    Math.floor(opts.progressTouched ?? 0),
    done + Math.max(0, Math.floor(opts.sendingInFlight ?? 0))
  );
  const sent = Math.max(0, Math.floor(opts.successCount));
  const failed = Math.max(0, Math.floor(opts.failCount));
  const inFlight = Math.max(0, Math.floor(opts.sendingInFlight ?? 0));
  const head =
    planned > 0
      ? `已发送 ${touched.toLocaleString()} / ${planned.toLocaleString()} 封`
      : `已发送 ${touched.toLocaleString()} 封`;
  const parts = [
    `成功 ${sent.toLocaleString()}`,
    `失败 ${failed.toLocaleString()}（含退信/拒收）`
  ];
  if (inFlight > 0) parts.push(`投递中 ${inFlight.toLocaleString()}`);
  return `${head} · ${parts.join(" · ")}`;
}

function DeliveryOutcomeMark({
  outcome,
  deliveryPending = false
}: {
  outcome: LaneDeliveryOutcome | null;
  deliveryPending?: boolean;
}) {
  if (outcome == null && deliveryPending) {
    return (
      <span className="text-[9px] font-medium text-sky-700" title="SMTP 投递中，完成后显示结果">
        投递中
      </span>
    );
  }
  if (outcome == null) {
    return <span className="text-[9px] text-slate-400">—</span>;
  }
  if (outcome === "success") {
    return (
      <span className="text-[11px] leading-none" title="投递成功">
        ✅
      </span>
    );
  }
  if (outcome === "fail") {
    return (
      <span className="text-[11px] leading-none" title="发送失败">
        ❌
      </span>
    );
  }
  if (outcome === "bounce") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] text-rose-800" title="退信">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-rose-600" aria-hidden />
        退信
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-900" title="拒收">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
      拒收
    </span>
  );
}

function MonitorDeliveryLegend() {
  return (
    <span
      className="inline-flex max-w-[11rem] flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] leading-tight text-slate-500"
      title="投递结果标记（退信/拒收/失败均计入右侧失败数，与统计页一致）"
    >
      <span>✅成功</span>
      <span>❌失败</span>
      <span className="inline-flex items-center gap-0.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-600" />
        退信
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
        拒收
      </span>
    </span>
  );
}

export function MarketingSendMonitorPanel(props: Props) {
  const {
    laneLabel,
    monitorCampaignSelect,
    monitorIdleHint,
    monitorLive,
    liveRows = [],
    successCount = 0,
    failCount = 0,
    planned,
    attemptedCount,
    completionReport,
    onDismissCompletion,
    embedded = false,
    progressOnly = false,
    showRecentRows: showRecentRowsProp,
    sendingInFlight = 0,
    progressTouched: progressTouchedProp,
    processedDone: processedDoneProp,
    title = `邮件传送实时监控（最近 ${MONITOR_RECENT_ROW_COUNT} 封）`
  } = props;

  const showRecentRows = showRecentRowsProp ?? !progressOnly;
  const processedDone = Math.max(0, processedDoneProp ?? successCount + failCount);
  const progressTouched = Math.max(
    0,
    progressTouchedProp ?? attemptedCount ?? processedDone + sendingInFlight
  );

  const displaySlots = useMemo(
    () =>
      showRecentRows ? buildMonitorDisplaySlots(liveRows, MONITOR_RECENT_ROW_COUNT) : [],
    [liveRows, showRecentRows]
  );

  const showTally = monitorLive && (planned > 0 || progressTouched > 0 || processedDone > 0);

  return (
    <div
      className={
        embedded
          ? "h-full"
          : "h-full rounded-md border border-slate-200 bg-white p-3"
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`font-medium text-slate-800 ${embedded ? "text-[11px]" : "text-xs"}`}>
            {title}
            {laneLabel ? <span className="ml-1 font-normal text-slate-500">· {laneLabel}</span> : null}
          </span>
          {monitorCampaignSelect}
        </div>
        {monitorLive ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[11px] tabular-nums">
            <MonitorDeliveryLegend />
            <span className="font-medium text-emerald-700">
              成功 <span className="text-sm font-semibold">{successCount}</span>
            </span>
            <span className="font-medium text-rose-700">
              失败 <span className="text-sm font-semibold">{failCount}</span>
            </span>
          </div>
        ) : completionReport ? (
          <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-slate-600">
            <span>
              成功 <span className="font-semibold text-emerald-800">{completionReport.sent}</span>
            </span>
            <span>
              失败 <span className="font-semibold text-rose-800">{completionReport.failed}</span>
            </span>
          </div>
        ) : null}
      </div>

      {!monitorLive && !completionReport ? (
        <p className="mb-2 text-[10px] text-slate-500">{monitorIdleHint}</p>
      ) : null}

      {showTally ? (
        <p
          className="mb-2 text-[10px] leading-relaxed tabular-nums text-slate-700"
          title="约每 0.4 秒与服务器同步；失败含 SMTP 失败、拒收与退信"
        >
          {formatLaneSendLiveTally({
            planned,
            processedDone,
            progressTouched,
            successCount,
            failCount,
            sendingInFlight
          })}
        </p>
      ) : null}

      {showRecentRows ? (
        <ul className="space-y-1.5">
          {displaySlots.map((slot, i) => {
            const row = slot.row;
            const email = row?.email?.trim() ? row.email : null;
            const queueClass =
              slot.queueLabel === "等待中"
                ? "bg-slate-100 text-slate-500"
                : "bg-sky-100 text-sky-900";
            const deliveryPending = Boolean(row && String(row.status ?? "").toLowerCase() === "sending");
            const outcomeFailed =
              slot.outcome === "fail" ||
              slot.outcome === "bounce" ||
              slot.outcome === "reject";
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-1.5"
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-800"
                  title={email ?? ""}
                >
                  {email?.trim() ? email : "—"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`rounded px-1 py-0.5 text-[8px] font-medium ${queueClass}`}
                    title="队列状态"
                  >
                    {slot.queueLabel}
                  </span>
                  <span
                    className={`min-w-[2.25rem] rounded px-1 py-0.5 text-center ${
                      outcomeFailed ? "bg-rose-50" : slot.outcome === "success" ? "bg-emerald-50" : "bg-slate-50"
                    }`}
                    title="服务器反馈的投递结果"
                  >
                    <DeliveryOutcomeMark outcome={slot.outcome} deliveryPending={deliveryPending} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {monitorLive && showRecentRows ? (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          失败含 SMTP 发送失败、拒收与退信（与营销活动统计「已退回」口径一致）。约每{" "}
          {FORMAL_SEND_LIVE_POLL_SEC} 秒刷新。
        </p>
      ) : null}

      {completionReport ? (
        <div
          className={`relative mt-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${
            completionReport.kind === "done"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : completionReport.kind === "stop"
                ? "border-rose-200 bg-rose-50 text-rose-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
          role="status"
        >
          {onDismissCompletion ? (
            <button
              type="button"
              className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] opacity-70 hover:bg-black/5 hover:opacity-100"
              onClick={onDismissCompletion}
              title="关闭"
            >
              ×
            </button>
          ) : null}
          {formatFormalSendCompletionLines(completionReport).map((line) => (
            <p key={line} className={line.includes("✅") ? "font-semibold" : "mt-0.5 first:mt-0"}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
