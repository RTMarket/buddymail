import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsLaneStrings } from "../../../i18n/emailCampaignsLaneI18n";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import { laneSummaryToFormalReport } from "../../../lib/marketingSendMonitor";
import { formatRemainHms } from "../../../lib/campaignSendLiveMonitor";
import { laneInFlightFromPrepDetail, type MonitorSession } from "../../../lib/laneSendMonitorCore";
import type { LaneSendSessionSummary, LaneSendUiPhase } from "../../../lib/laneSendSession";

type Props = {
  phase: LaneSendUiPhase;
  session: MonitorSession;
  sessionSummary: LaneSendSessionSummary | null;
  industrySendNote?: string | null;
  campaignCode?: string | null;
  campaignName?: string | null;
  campaignId?: number;
  fromEmails?: string;
  onDismissSummary?: () => void;
};

/** 多专线发信区：发送中仅显示已受理数和剩余，不再细分成功/失败栏 */
function LaneSimpleSendLivePanel({
  session,
  industrySendNote,
  completing,
  laneUi
}: {
  session: MonitorSession;
  industrySendNote?: string | null;
  completing?: boolean;
  laneUi: ReturnType<typeof getEmailCampaignsLaneStrings>;
}) {
  const { counts } = session;
  const planned = Math.max(
    0,
    counts.planned,
    session.totalRecipients,
    session.lockedPlanned
  );
  const attempted = Math.max(0, counts.attempted);
  const showComplete = counts.showSendComplete;
  const remainCount = planned > 0 ? Math.max(0, planned - attempted) : 0;
  const remainSec = remainCount > 0
    ? Math.max(counts.remainSec, remainCount * 2.5)
    : 0;
  const showEta = planned > 0 && remainCount > 0 && remainSec > 0 && !completing && !showComplete;

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-sky-950">
        {showComplete ? laneUi.monitorShowComplete : completing ? laneUi.monitorCompleting : laneUi.monitorSending}
      </p>
      {planned > 0 ? (
        <p className="mt-1 text-[10px] text-slate-700">
          {laneUi.monitorPlanned(planned)}
        </p>
      ) : null}
      {planned > 0 ? (
        <p className="mt-0.5 text-[10px] tabular-nums text-slate-700">
          {laneUi.monitorAttempted(attempted, planned)}
        </p>
      ) : null}
      {showEta ? (
        <p className="mt-1 text-[10px] tabular-nums text-slate-600">
          {laneUi.monitorRemain(formatRemainHms(remainSec), remainCount)}
        </p>
      ) : null}
      {industrySendNote ? (
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">{industrySendNote}</p>
      ) : null}
    </div>
  );
}

function LaneSendCompletionBox({
  completionReport,
  onDismiss,
  laneUi,
  childUi
}: {
  completionReport: NonNullable<ReturnType<typeof laneSummaryToFormalReport>>;
  onDismiss?: () => void;
  laneUi: ReturnType<typeof getEmailCampaignsLaneStrings>;
  childUi: ReturnType<typeof getEmailCampaignsChildStrings>;
}) {
  const lines = childUi.formatFormalSendCompletionLines(completionReport);
  const boxClass =
    completionReport.kind === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : completionReport.kind === "stop"
        ? "border-rose-200 bg-rose-50 text-rose-950"
        : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div className={`relative rounded-md border px-3 py-2 text-[11px] leading-relaxed ${boxClass}`} role="status">
      {onDismiss ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] opacity-70 hover:bg-black/5 hover:opacity-100"
          onClick={onDismiss}
          title={laneUi.closeTitle}
        >
          ×
        </button>
      ) : null}
      {lines.map((line) => (
        <p key={line} className={line.includes("✅") ? "font-semibold" : "mt-0.5 first:mt-0"}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function LaneSendMonitorBlock({
  phase,
  session,
  sessionSummary,
  industrySendNote = null,
  campaignCode = null,
  campaignName = null,
  campaignId = 0,
  fromEmails = "",
  onDismissSummary
}: Props) {
  const { locale } = useSiteLocale();
  const laneUi = useMemo(() => getEmailCampaignsLaneStrings(locale), [locale]);
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const monitorLive = phase === "active" || phase === "completing";
  const completing = phase === "completing";
  const code = String(campaignCode ?? "").trim();
  const name = String(campaignName ?? "").trim();

  const completionReport = useMemo(() => {
    if (!sessionSummary || monitorLive) return null;
    /** 停止/完成汇报：优先 session 内锁定的编号；缺省时用面板传入的选中活动编号（避免显示内部 id 补零成 000013） */
    const mergedSummary = {
      ...sessionSummary,
      campaignCode: String(sessionSummary.campaignCode ?? "").trim() || code || undefined,
      campaignName: String(sessionSummary.campaignName ?? "").trim() || name || undefined
    };
    return laneSummaryToFormalReport(mergedSummary, {
      campaignId,
      fromEmails,
      unnamedCampaign: childUi.activityUnnamed,
      unscopedIndustries: childUi.formatFormalIndustryLabels([]),
      locale
    });
  }, [sessionSummary, monitorLive, campaignId, fromEmails, childUi, locale, code, name]);

  return (
    <div className="rounded border border-slate-100 bg-slate-50/50 p-2">
      {monitorLive && (code || name) ? (
        <p className="mb-2 text-[10px] leading-relaxed text-slate-700">
          <span className="font-medium text-slate-900">
            {laneUi.activityIdCode(code || "—")}
            {name ? ` · ${name}` : ""}
          </span>
        </p>
      ) : !monitorLive && !completionReport ? (
        <p className="mb-2 text-[10px] text-slate-500">{laneUi.notSending}</p>
      ) : null}

      {session.prepBlockReason ? (
        <p className="mb-2 text-[10px] leading-relaxed text-amber-900">{session.prepBlockReason}</p>
      ) : null}

      {session.lastAsyncError ? (
        <p className="mb-2 text-[10px] leading-relaxed text-rose-800">{session.lastAsyncError}</p>
      ) : null}

      {monitorLive ? (
        <LaneSimpleSendLivePanel
          session={session}
          industrySendNote={industrySendNote}
          completing={completing}
          laneUi={laneUi}
        />
      ) : completionReport ? (
        <LaneSendCompletionBox
          completionReport={completionReport}
          onDismiss={onDismissSummary}
          laneUi={laneUi}
          childUi={childUi}
        />
      ) : null}
    </div>
  );
}
