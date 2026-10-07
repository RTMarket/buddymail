import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsLaneStrings } from "../../../i18n/emailCampaignsLaneI18n";
import { Link } from "react-router-dom";
import { isCampaignActivitySendDisabled } from "./CampaignActivityIdDropdown";
import { laneFromEmails, type DedicatedLaneSnapshot, type LaneLastFormalSend } from "../../../lib/dedicatedLanes";
import { CampaignDeliveryDiagnosticLog } from "./CampaignDeliveryDiagnosticLog";
import {
  laneCampaignSessionKey,
  laneSendIndustriesSessionKey,
  readLaneCampaignId,
  readLaneSendIndustries,
  resolveInternalCampaignId,
  writeLaneCampaignId,
  writeLaneSendIndustries
} from "../../../lib/laneFormalSendSession";
import {
  buildLaneCampaignSelectionSnapshot,
  formatLaneIndustrySendNote,
  resolveLaneDisplayIndustries,
  resolveLaneSelectionHint,
  type LaneCampaignSelectionSnapshot
} from "../../../lib/laneCampaignSelectionDisplay";
import { laneSnapshotOwnsSending } from "../../../lib/laneSendMonitorCore";
import { campaignPickerCode } from "../../../lib/campaignRoundDisplay";
import {
  CampaignActivityIdDropdown,
  type CampaignActivityIdOption
} from "./CampaignActivityIdDropdown";
import { LaneSendMonitorBlock } from "./LaneSendMonitorBlock";
import { useLaneSendMonitor } from "./useLaneSendMonitor";
import { apiJson } from "../../../lib/api";
import { LaneScheduledTaskList } from "./LaneScheduledTaskList";

type CampaignOption = {
  id: number;
  campaign_code: string | null;
  name: string;
  status?: string | null;
  recipient_count?: number | null;
  has_sent?: boolean;
  from_email?: string | null;
  smtp_from_email?: string | null;
  targetIndustries?: string[];
};

function laneOwnsCampaignSend(
  lane: DedicatedLaneSnapshot,
  campaignId: number,
  laneUiActive: boolean
): boolean {
  if (campaignId <= 0) return false;
  if (laneUiActive) return true;
  return laneSnapshotOwnsSending(lane, campaignId);
}

function laneSnapshotSendingCampaignId(lane: DedicatedLaneSnapshot): number {
  const laneId = Number(lane.sendingCampaignId ?? 0);
  if (laneId > 0) return laneId;
  for (const d of lane.domains ?? []) {
    const sid = Number(d.sendingCampaignId ?? 0);
    if (sid > 0) return sid;
  }
  return 0;
}

function lanePanelDbgLog(
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

/** 刷新恢复：session 选中 ID 须让位于专线 gate 上报的 sendingCampaignId */
function resolveLaneApiCampaignId(
  campaignIdRaw: string,
  campaignsForLane: CampaignOption[],
  lane: DedicatedLaneSnapshot,
  disabledLane: boolean
): number {
  const sessionResolved = resolveInternalCampaignId(campaignIdRaw, campaignsForLane);
  if (disabledLane) return sessionResolved;
  const laneSendingId = laneSnapshotSendingCampaignId(lane);
  if (laneSendingId <= 0) return sessionResolved;
  const laneResolved = resolveInternalCampaignId(String(laneSendingId), campaignsForLane);
  const authoritative = laneResolved > 0 ? laneResolved : laneSendingId;
  if (authoritative <= 0) return sessionResolved;
  if (sessionResolved === authoritative) return sessionResolved;
  return authoritative;
}

function formatLastFormalSendTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatIndustriesList(items: string[], laneUi: ReturnType<typeof getEmailCampaignsLaneStrings>): string {
  if (!items.length) return laneUi.noIndustryRecorded;
  const head = items.slice(0, 4);
  const more = items.length > head.length ? laneUi.industryMore(items.length) : "";
  return `${head.join("、")}${more}`;
}

function laneLastFormalSendCode(rec: LaneLastFormalSend): string {
  return rec.campaignCode?.trim() || String(rec.campaignId).padStart(6, "0");
}

export function LaneFormalSendPanel(props: {
  lane: DedicatedLaneSnapshot;
  campaigns: CampaignOption[];
  campaignsLoaded?: boolean;
  /** 专线列表 API 已返回；刷新恢复监控须等 lane.sendingCampaignId 就位 */
  lanesReady?: boolean;
  formalSelectedIndustries: string[];
  formalAudienceCount?: number | null;
  formalSendMinIntervalMs: number;
  sessionWatchKeyPrefix: string;
  reservedCampaignIds?: ReadonlySet<number>;
  laneCampaignApplySignal?: { token: number; laneIndex: number; campaignId: number } | null;
  onLaneSelectionChange?: (laneIndex: number, campaignId: number) => void;
  onRefreshCampaigns: () => Promise<void>;
  onRefreshLanes?: () => Promise<void>;
  onCampaignStopped?: (campaignId: number) => void;
  onCampaignSendStarted?: (campaignId: number) => void;
}) {
  const { locale } = useSiteLocale();
  const laneUi = useMemo(() => getEmailCampaignsLaneStrings(locale), [locale]);
  const {
    lane,
    campaigns,
    campaignsLoaded = false,
    lanesReady = true,
    formalSelectedIndustries,
    formalAudienceCount,
    formalSendMinIntervalMs,
    sessionWatchKeyPrefix,
    reservedCampaignIds,
    laneCampaignApplySignal = null,
    onLaneSelectionChange,
    onRefreshCampaigns,
    onRefreshLanes,
    onCampaignStopped,
    onCampaignSendStarted
  } = props;

  const laneEmails = useMemo(() => laneFromEmails(lane), [lane]);
  const disabledLane = !lane.provisioned || laneEmails.length === 0;
  const campaignsForLane = useMemo(() => {
    if (disabledLane) return [];
    const allowed = new Set(
      laneEmails.map((e) =>
        String(e ?? "")
          .trim()
          .toLowerCase()
      ).filter(Boolean)
    );
    if (allowed.size === 0) return campaigns;
    const laneSendingId = laneSnapshotSendingCampaignId(lane);
    return campaigns.filter((c) => {
      const fe = String(c.smtp_from_email ?? c.from_email ?? "")
        .trim()
        .toLowerCase();
      if (fe.length > 0 && allowed.has(fe)) return true;
      /** 本栏正在发送的活动：即使列表暂缺 smtp_from_email 也保留，避免汇报框退回内部 id 补零 */
      if (laneSendingId > 0 && c.id === laneSendingId) return true;
      return false;
    });
  }, [disabledLane, campaigns, laneEmails, lane]);

  const campaignSessionKey = laneCampaignSessionKey(sessionWatchKeyPrefix, lane.laneIndex);
  const industriesSessionKey = laneSendIndustriesSessionKey(sessionWatchKeyPrefix, lane.laneIndex);

  const [campaignId, setCampaignId] = useState(() => readLaneCampaignId(campaignSessionKey));
  const apiCampaignId = useMemo(
    () => resolveLaneApiCampaignId(campaignId, campaignsForLane, lane, disabledLane),
    [campaignId, campaignsForLane, lane, disabledLane]
  );

  const [frozenSelection, setFrozenSelection] = useState<LaneCampaignSelectionSnapshot | null>(null);
  const frozenRef = useRef<LaneCampaignSelectionSnapshot | null>(null);
  const [lastCompletedSelection, setLastCompletedSelection] =
    useState<LaneCampaignSelectionSnapshot | null>(null);

  const lockSelection = useCallback((snap: LaneCampaignSelectionSnapshot) => {
    frozenRef.current = snap;
    setFrozenSelection(snap);
  }, []);

  const selectedCampaign = useMemo(() => {
    if (apiCampaignId <= 0) return null;
    return campaignsForLane.find((c) => c.id === apiCampaignId) ?? null;
  }, [apiCampaignId, campaignsForLane]);

  const campaignStatus = String(selectedCampaign?.status ?? "").toLowerCase();
  const laneOwnsSelectedSending = useMemo(
    () => laneSnapshotOwnsSending(lane, apiCampaignId),
    [lane, apiCampaignId]
  );

  const displayIndustries = useMemo(
    () =>
      resolveLaneDisplayIndustries({
        frozenIndustries:
          frozenSelection?.targetIndustries ??
          frozenRef.current?.targetIndustries ??
          (laneOwnsSelectedSending ? readLaneSendIndustries(industriesSessionKey) : undefined),
        campaignIndustries: selectedCampaign?.targetIndustries,
        pageIndustries: formalSelectedIndustries,
        laneUiActive: false,
        ownsSending: laneOwnsSelectedSending
      }),
    [
      frozenSelection?.targetIndustries,
      selectedCampaign?.targetIndustries,
      formalSelectedIndustries,
      laneOwnsSelectedSending,
      industriesSessionKey
    ]
  );

  const industrySendNote = useMemo(
    () => formatLaneIndustrySendNote(displayIndustries),
    [displayIndustries]
  );

  const sendReportMeta = useMemo(() => {
    const frozen = frozenSelection ?? frozenRef.current;
    const fromList =
      selectedCampaign ??
      (apiCampaignId > 0 ? campaigns.find((c) => c.id === apiCampaignId) ?? null : null);
    const snap = frozen ?? fromList;
    if (!snap && apiCampaignId <= 0) return null;
    const frozenCode = frozen && String(frozen.code ?? "").trim() ? String(frozen.code).trim() : "";
    const listCode = fromList ? campaignPickerCode(fromList) : "";
    const code =
      frozenCode ||
      listCode ||
      (apiCampaignId > 0 ? String(apiCampaignId).padStart(6, "0") : "");
    const name =
      (frozen && String(frozen.name ?? "").trim()) ||
      (fromList ? String(fromList.name ?? "").trim() : "") ||
      laneUi.unnamedCampaign;
    return {
      campaignCode: code,
      campaignName: name,
      targetIndustriesNote: industrySendNote ?? undefined
    };
  }, [frozenSelection, selectedCampaign, industrySendNote, apiCampaignId, campaigns, laneUi.unnamedCampaign]);

  const hasIndustrySelection =
    formalSelectedIndustries.length > 0 ||
    readLaneSendIndustries(industriesSessionKey).length > 0;
  const sendPrerequisitesReady =
    hasIndustrySelection && formalAudienceCount != null && formalAudienceCount > 0;

  const monitor = useLaneSendMonitor({
    campaignId: apiCampaignId,
    campaignStatus,
    formalAudienceCount,
    formalSelectedIndustries,
    formalSendMinIntervalMs,
    laneIndex: lane.laneIndex,
    disabled: disabledLane,
    hasIndustrySelection,
    laneSendingCampaignId: laneSnapshotSendingCampaignId(lane),
    laneOwnsSending: laneOwnsSelectedSending,
    campaignsReady: campaignsLoaded || campaignsForLane.length > 0,
    lanesReady,
    sessionWatchKeyPrefix,
    sendReportMeta,
    onRefreshCampaigns,
    onRefreshLanes,
    onCampaignStopped,
    onCampaignSendStarted,
    onBeginSend: () => {
      setLastCompletedSelection(null);
      const industriesAtSend = formalSelectedIndustries
        .map((t) => String(t ?? "").trim())
        .filter(Boolean);
      if (industriesAtSend.length > 0) {
        writeLaneSendIndustries(industriesSessionKey, industriesAtSend);
      }
      if (selectedCampaign) {
        lockSelection(
          buildLaneCampaignSelectionSnapshot(selectedCampaign, industriesAtSend)
        );
      }
    },
    onSendCompleted: () => {
      if (frozenRef.current) setLastCompletedSelection(frozenRef.current);
      frozenRef.current = null;
      setFrozenSelection(null);
      writeLaneSendIndustries(industriesSessionKey, []);
    },
    onResumeSend: () => {
      if (selectedCampaign && !frozenRef.current) {
        const stored = readLaneSendIndustries(industriesSessionKey);
        const fromCamp = (selectedCampaign.targetIndustries ?? [])
          .map((t) => String(t ?? "").trim())
          .filter(Boolean);
        const industries = stored.length > 0 ? stored : fromCamp.length > 0 ? fromCamp : formalSelectedIndustries;
        lockSelection(buildLaneCampaignSelectionSnapshot(selectedCampaign, industries));
      }
    }
  });

  const {
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
  } = monitor;

  const sendControlsLocked = laneUiActive || confirmSend;

  useEffect(() => {
    if (apiCampaignId > 0 && String(apiCampaignId) !== campaignId) {
      const next = String(apiCampaignId);
      setCampaignId(next);
      writeLaneCampaignId(campaignSessionKey, next);
    }
  }, [apiCampaignId, campaignId, campaignSessionKey]);

  useEffect(() => {
    if (disabledLane) {
      if (campaignId) {
        setCampaignId("");
        writeLaneCampaignId(campaignSessionKey, "");
      }
      return;
    }
    const laneSendingId = laneSnapshotSendingCampaignId(lane);
    if (laneSendingId <= 0) return;
    const next = String(laneSendingId);
    if (campaignId === next) return;
    if (sendControlsLocked) return;
    lanePanelDbgLog(
      "LaneFormalSendPanel.tsx:syncSending",
      "sync session campaign to lane sending id",
      { laneIndex: lane.laneIndex, from: campaignId, to: next },
      "H2-session-lane-sync"
    );
    setCampaignId(next);
    writeLaneCampaignId(campaignSessionKey, next);
  }, [disabledLane, lane, campaignId, campaignSessionKey, sendControlsLocked]);

  useEffect(() => {
    if (!campaignId || campaignsForLane.length === 0) return;
    const resolved = resolveInternalCampaignId(campaignId, campaignsForLane);
    if (resolved <= 0 || !campaignsForLane.some((c) => c.id === resolved)) {
      const laneSendingId = laneSnapshotSendingCampaignId(lane);
      if (laneSendingId > 0 && String(laneSendingId) === campaignId.trim()) {
        return;
      }
      setCampaignId("");
      writeLaneCampaignId(campaignSessionKey, "");
    }
  }, [campaignsForLane, campaignId, campaignSessionKey, lane]);

  const isCampaignPickableForLane = useCallback(
    (c: CampaignOption) => {
      if (
        isCampaignActivitySendDisabled({
          id: c.id,
          campaign_code: c.campaign_code,
          name: c.name,
          status: c.status,
          has_sent: c.has_sent
        })
      ) {
        return false;
      }
      if (reservedCampaignIds?.has(c.id)) return false;
      return true;
    },
    [reservedCampaignIds]
  );

  useEffect(() => {
    if (!laneCampaignApplySignal || laneCampaignApplySignal.campaignId <= 0) return;
    const targetId = laneCampaignApplySignal.campaignId;
    if (!campaignsForLane.some((c) => c.id === targetId)) return;
    const next = String(targetId);
    if (campaignId === next) return;
    setCampaignId(next);
    writeLaneCampaignId(campaignSessionKey, next);
  }, [laneCampaignApplySignal, campaignsForLane, campaignId, campaignSessionKey, lane.laneIndex]);

  useEffect(() => {
    onLaneSelectionChange?.(lane.laneIndex, apiCampaignId);
  }, [lane.laneIndex, apiCampaignId, onLaneSelectionChange]);

  useEffect(() => {
    if (disabledLane || campaignId || sendControlsLocked) return;
    if (laneSnapshotSendingCampaignId(lane) > 0) return;
    const firstPickable = campaignsForLane.find((c) => isCampaignPickableForLane(c));
    if (!firstPickable) return;
    const next = String(firstPickable.id);
    setCampaignId(next);
    writeLaneCampaignId(campaignSessionKey, next);
  }, [
    disabledLane,
    lane,
    campaignId,
    sendControlsLocked,
    campaignsForLane,
    campaignSessionKey,
    isCampaignPickableForLane
  ]);

  useEffect(() => {
    if (disabledLane || apiCampaignId <= 0) return;
    if (reservedCampaignIds?.has(apiCampaignId)) {
      setCampaignId("");
      writeLaneCampaignId(campaignSessionKey, "");
      setActionMsg({
        kind: "err",
        text: laneUi.errCampaignTakenByOtherLane
      });
    }
  }, [
    disabledLane,
    apiCampaignId,
    reservedCampaignIds,
    campaignSessionKey,
    setActionMsg
  ]);

  const laneOwnsSend = laneOwnsCampaignSend(lane, apiCampaignId, laneUiActive);
  const dbSending = campaignStatus === "sending" && laneOwnsSend;

  const statsLink = apiCampaignId
    ? `/email/campaigns/list?campaignId=${encodeURIComponent(String(apiCampaignId))}${
        laneEmails[0] ? `&fromEmail=${encodeURIComponent(laneEmails[0])}` : ""
      }`
    : "/email/campaigns/list";

  const laneCampaignPickerItems = useMemo<CampaignActivityIdOption[]>(() => {
    return campaignsForLane.map((c) => ({
      id: c.id,
      campaign_code: c.campaign_code ?? null,
      name: c.name,
      status: c.status,
      has_sent: c.has_sent
    }));
  }, [campaignsForLane]);

  const selectedAlreadySent =
    selectedCampaign?.has_sent === true &&
    String(selectedCampaign?.status ?? "").toLowerCase() !== "sending";

  const canClickLaneSend =
    apiCampaignId > 0 && !selectedAlreadySent && !disabledLane && !sendControlsLocked;

  const laneSendHint = useMemo(() => {
    if (disabledLane) return null;
    if (laneUiActive || phase === "active" || laneOwnsSelectedSending) return null;
    if (apiCampaignId <= 0) return laneUi.errSelectCampaignId;
    if (selectedAlreadySent) return laneUi.errCampaignAlreadySent;
    if (!hasIndustrySelection) return laneUi.errSelectIndustriesFirst;
    if (formalAudienceCount == null) return laneUi.errAudienceLoading;
    if (formalAudienceCount <= 0) return laneUi.errNoContactsForIndustries;
    return null;
  }, [
    disabledLane,
    laneUiActive,
    phase,
    laneOwnsSelectedSending,
    apiCampaignId,
    selectedAlreadySent,
    hasIndustrySelection,
    formalAudienceCount,
    laneUi
  ]);

  const selectionHint = useMemo(
    () => {
      if (disabledLane) return null;
      return resolveLaneSelectionHint({
        campaign: selectedCampaign,
        campaignId: apiCampaignId,
        laneUiActive,
        confirmPending: confirmSend,
        frozen: frozenSelection,
        lastCompleted: lastCompletedSelection
      });
    },
    [
      disabledLane,
      selectedCampaign,
      apiCampaignId,
      laneUiActive,
      confirmSend,
      frozenSelection,
      lastCompletedSelection
    ]
  );

  const diagnosticCampaignId = useMemo(() => {
    if (disabledLane) return lane.lastFormalSend?.campaignId ?? null;
    if (apiCampaignId > 0) return apiCampaignId;
    return lane.lastFormalSend?.campaignId ?? null;
  }, [disabledLane, apiCampaignId, lane.lastFormalSend]);

  const diagnosticCampaignCode = useMemo(() => {
    if (disabledLane) {
      const rec = lane.lastFormalSend;
      return rec ? laneLastFormalSendCode(rec) : "—";
    }
    if (apiCampaignId > 0 && selectedCampaign) return campaignPickerCode(selectedCampaign);
    const rec = lane.lastFormalSend;
    return rec ? laneLastFormalSendCode(rec) : "—";
  }, [disabledLane, apiCampaignId, selectedCampaign, lane.lastFormalSend]);

  const frontendAcceptedComplete =
    sessionSummary != null ||
    (lastCompletedSelection != null && lastCompletedSelection.campaignId === apiCampaignId);
  const showStuckSendingHint =
    !disabledLane &&
    laneOwnsSend &&
    dbSending &&
    apiCampaignId > 0 &&
    phase === "idle" &&
    !frontendAcceptedComplete;

  const blockingDomainSend = useMemo(() => {
    if (disabledLane || laneUiActive || phase === "active" || phase === "completing") return null;
    for (const d of lane.domains ?? []) {
      const sid = Number(d.sendingCampaignId ?? 0);
      if (sid > 0 && sid !== apiCampaignId) {
        const block = { fromEmail: d.fromEmail, campaignId: sid };
        lanePanelDbgLog(
          "LaneFormalSendPanel.tsx:blocking",
          "blockingDomainSend shown",
          {
            laneIndex: lane.laneIndex,
            apiCampaignId,
            sessionCampaignId: campaignId,
            blocking: block
          },
          "H3-blocking-mismatch"
        );
        return block;
      }
    }
    const laneSid = Number(lane.sendingCampaignId ?? 0);
    if (laneSid > 0 && laneSid !== apiCampaignId) {
      const block = { fromEmail: null as string | null, campaignId: laneSid };
      lanePanelDbgLog(
        "LaneFormalSendPanel.tsx:blocking",
        "blockingDomainSend shown (lane)",
        {
          laneIndex: lane.laneIndex,
          apiCampaignId,
          sessionCampaignId: campaignId,
          blocking: block
        },
        "H3-blocking-mismatch"
      );
      return block;
    }
    return null;
  }, [
    disabledLane,
    laneUiActive,
    phase,
    lane.domains,
    lane.sendingCampaignId,
    lane.laneIndex,
    apiCampaignId,
    campaignId
  ]);

  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false);

  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        disabledLane ? "border-slate-200 opacity-75" : "border-violet-200/80"
      } ${campaignPickerOpen ? "relative z-[70]" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{lane.label}</div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            {laneUi.laneTodayTotal}{" "}
            <span className="tabular-nums font-medium text-slate-800">
              {lane.sentToday.toLocaleString()} / {lane.lineSentCap.toLocaleString()}
            </span>
            <span className="text-slate-400">{laneUi.laneTodayTotalHint}</span>
          </div>
          {laneEmails.length > 0 ? (
            <div className="mt-1 break-all text-[10px] text-slate-500">{laneUi.laneDomains(laneEmails.join("、"))}</div>
          ) : null}
        </div>
        {laneUiActive ? (
          <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
            {laneUi.sendingBadge}
          </span>
        ) : null}
      </div>

      {showStuckSendingHint ? (
        <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-950">
          {laneUi.staleSendingHint}
        </p>
      ) : null}

      {blockingDomainSend ? (
        <p className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] leading-relaxed text-rose-900">
          {laneUi.blockingDomainSend(
            blockingDomainSend.fromEmail ?? "",
            String(blockingDomainSend.campaignId)
          )}
        </p>
      ) : null}

      {disabledLane ? (
        <p className="mb-2 text-[11px] text-amber-800">{laneUi.laneNoDomain}</p>
      ) : null}

      {campaignsForLane.length === 0 && !disabledLane && !laneUiActive && phase === "idle" && !laneOwnsSelectedSending ? (
        <p className="mb-2 text-[10px] leading-relaxed text-rose-800">
          {laneUi.noCampaignData}{" "}
          <button
            type="button"
            className="font-medium text-violet-700 underline"
            onClick={() => {
              void onRefreshCampaigns();
            }}
          >
            {laneUi.retry}
          </button>
        </p>
      ) : null}

      <label className="mb-2 grid gap-1">
        <span className="text-[10px] font-medium text-slate-600">{laneUi.activityIdLabel}</span>
        <CampaignActivityIdDropdown
          variant="laneGrid"
          maxItems={6}
          items={laneCampaignPickerItems}
          selectedId={disabledLane || apiCampaignId <= 0 ? null : apiCampaignId}
          disabled={disabledLane}
          selectionLocked={sendControlsLocked}
          reservedCampaignIds={reservedCampaignIds}
          onOpenChange={setCampaignPickerOpen}
          loading={!disabledLane && !campaignsLoaded && campaignsForLane.length === 0}
          emptyHint={
            campaignsForLane.length === 0
              ? laneUi.noCampaignSaveFirst
              : laneUi.noCampaign
          }
          onPickBlocked={(message) => {
            setActionMsg({ kind: "err", text: message });
          }}
          onOpen={() => {
            if (laneCampaignPickerItems.length === 0) {
              void onRefreshCampaigns();
            }
          }}
          onSelect={(id) => {
            if (reservedCampaignIds?.has(id)) {
              setActionMsg({
                kind: "err",
                text: laneUi.errCampaignTakenSelectOther
              });
              return;
            }
            const v = String(id);
            setCampaignId(v);
            writeLaneCampaignId(campaignSessionKey, v);
            onLaneSelectionChange?.(lane.laneIndex, id);
            setConfirmSend(false);
            setActionMsg(null);
            setLastCompletedSelection(null);
            setSessionSummary(null);
            if (phase !== "idle") abortSession();
          }}
        />
        {selectionHint ? (
          <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-[11px] leading-relaxed text-slate-600">
            <span className="text-slate-500">
              {selectionHint.kind === "sending"
                ? laneUi.sendingPrefix
                : selectionHint.kind === "completed"
                  ? ""
                   : laneUi.selectedPrefix}
            </span>
            <span className="font-mono font-semibold text-slate-800">{selectionHint.snap.code}</span>
            <span className="text-slate-500">·</span>
            <span className="min-w-0 truncate font-medium text-slate-800">{selectionHint.snap.name}</span>
            {selectionHint.kind === "completed" ? (
              <span className="w-full text-[10px] font-medium text-emerald-700 sm:w-auto">
                {laneUi.campaignSendComplete}
              </span>
            ) : selectionHint.kind === "picker" && selectedAlreadySent ? (
              <span className="w-full text-[10px] font-medium text-amber-800 sm:w-auto">
                {laneUi.campaignAlreadySentHint}
              </span>
            ) : null}
          </p>
        ) : null}
      </label>

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canClickLaneSend}
          title={laneSendHint ?? undefined}
          className="h-8 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          onClick={() => {
            if (!sendPrerequisitesReady) {
              setActionMsg({
                kind: "err",
                text: laneSendHint ?? laneUi.completeIndustryFirst
              });
              return;
            }
            setLastCompletedSelection(null);
            setSessionSummary(null);
            setConfirmSend(true);
          }}
        >
          {laneUiActive ? laneUi.sendBusy : selectedAlreadySent ? laneUi.alreadySent  : laneUi.send}
        </button>
        <button
          type="button"
          disabled={(!laneUiActive && !dbSending) || !laneOwnsSend || apiCampaignId <= 0 || disabledLane || stopBusy}
          className="h-8 rounded-md border border-rose-300 bg-rose-50 px-3 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
          onClick={() => void onStopSend()}
        >
          {stopBusy ? laneUi.stopping : laneUi.stopSend}
        </button>
        <Link
          to={statsLink}
          className="inline-flex h-8 items-center rounded-md border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-900 hover:bg-violet-100"
        >
          {laneUi.viewStats}
        </Link>
      </div>

      {laneSendHint && canClickLaneSend && !laneUiActive ? (
        <p className="mb-2 text-[10px] leading-relaxed text-amber-800">{laneSendHint}</p>
      ) : null}

      {confirmSend ? (
        <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
          <p>{laneUi.confirmLaneSend(String(formalAudienceCount ?? "…"))}</p>
          {industrySendNote ? <p className="mt-1 text-[10px] text-amber-900">{industrySendNote}</p> : null}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="rounded bg-violet-600 px-2 py-0.5 text-[11px] text-white"
              onClick={() => void onConfirmSend()}
            >
              {laneUi.confirm}
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
              onClick={() => setConfirmSend(false)}
            >
              {laneUi.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {actionMsg ? (
        <p className={`mb-2 text-[11px] ${actionMsg.kind === "err" ? "text-rose-700" : "text-emerald-700"}`}>
          {actionMsg.text}
        </p>
      ) : null}

      <LaneSendMonitorBlock
        phase={phase}
        session={session}
        sessionSummary={sessionSummary}
        industrySendNote={industrySendNote}
        campaignCode={sendReportMeta?.campaignCode}
        campaignName={sendReportMeta?.campaignName}
        campaignId={apiCampaignId}
        fromEmails={laneEmails.join("、")}
        onDismissSummary={() => setSessionSummary(null)}
      />

      <LaneScheduledTaskList
        laneIndex={lane.laneIndex}
        disabledLane={disabledLane}
        campaigns={campaignsForLane}
        selectedCampaignId={apiCampaignId > 0 ? apiCampaignId : null}
        formalSelectedIndustries={formalSelectedIndustries}
        formalAudienceCount={formalAudienceCount ?? null}
      />

      <div className="mt-2">
        <CampaignDeliveryDiagnosticLog
          compact
          laneLabel={lane.label}
          fromEmails={disabledLane ? [] : laneEmails}
          campaignId={diagnosticCampaignId}
          campaignCode={diagnosticCampaignCode}
        />
      </div>
    </div>
  );
}
