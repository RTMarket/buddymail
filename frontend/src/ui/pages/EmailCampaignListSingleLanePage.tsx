import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getEmailCampaignListSingleLanePageStrings } from "../../i18n/emailCampaignListSingleLanePageI18n";
import { getEmailCampaignStatsSidebarStrings } from "../../i18n/emailCampaignStatsSidebarI18n";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson, apiJsonWithTimeout } from "../../lib/api";
import {
  buildCampaignStatsSenderGroups,
  CAMPAIGN_STATS_CHANNEL_ORDER,
  firstSenderEmailInChannel
} from "../../lib/campaignStatsSenderChannels";
import {
  pickDefaultStatsCampaignId,
  sortStatsCampaignPickerByRecentActivity,
  statsCampaignPickerPool
} from "../../lib/campaignPickerBySender";
import {
  fetchDedicatedLanes,
  filterCampaignStatsGroupsByEmails,
  findLaneByIndex,
  laneFromEmails,
  pickDefaultLaneIndex,
  readDedicatedLanesCache,
  type DedicatedLaneSnapshot
} from "../../lib/dedicatedLanes";
import { IS_STANDALONE_DEPLOY } from "../../lib/standaloneDeploy";
import type { EmailChannelKind } from "../../lib/dedicatedEntitlements";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "../../lib/emailMarketingSenderPicklist";
import {
  CampaignActivityIdDropdown,
  type CampaignActivityIdOption
} from "../components/email/CampaignActivityIdDropdown";
import { DedicatedLaneSenderFilters } from "../components/email/DedicatedLaneSenderFilters";
import { StandaloneDedicatedSenderFiltersGate } from "../components/email/StandaloneDedicatedSenderFiltersGate";
import { MarketingSenderChannelPicker } from "../components/email/MarketingSenderChannelPicker";
import { CampaignActivityStats } from "../components/email/CampaignActivityStats";
import { CampaignStatsPerfPanel } from "../components/email/CampaignStatsPerfPanel";
import { CampaignStatsSelfHealPanel } from "../components/email/CampaignStatsSelfHealPanel";
import { InlineConfirmBar, PageFeedbackLine } from "../components/InlineFeedbackPanels";
import {
  clearCampaignListBySenderCache,
  hasCampaignListCacheForSender,
  readCampaignListBySender,
  writeCampaignListBySender
} from "../../lib/campaignListBySenderCache";
import { purgeCampaignStatsCache } from "../../lib/campaignActivityStatsCache";

function modeSenderCacheKey(fromEmail: string): string {
  const email = String(fromEmail ?? "").trim().toLowerCase();
  return `single::${email}`;
}

type CampaignListItem = {
  id: number;
  campaign_code: string | null;
  latest_round_no?: number | null;
  name: string;
  status: string;
  business_line: string | null;
  template_id: number | null;
  template_name: string | null;
  template_category: string | null;
  schedule_start_at: string | null;
  next_run_at: string | null;
  repeat_every_days: number | null;
  repeat_every_hours: number | null;
  send_mode: string | null;
  send_rounds_total: number | null;
  send_rounds_done: number | null;
  recipient_count: number | null;
  sent_count: number;
  failed_count: number;
  attempts_count: number;
  last_send_id?: number;
  pending_unsent: number;
  created_at: string;
  /** picker=1 接口：是否已有 email_sends 记录 */
  has_sent?: boolean;
};

/**
 * 单机组套餐（日发小于 3 万）· 营销活动统计页。
 * 与 {@link EmailCampaignListMultiLanePage} 代码独立；修单机组时不要同步改多机组文件。
 */
export function EmailCampaignListSingleLanePage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailCampaignListSingleLanePageStrings(locale), [locale]);
  const sidebarUi = useMemo(() => getEmailCampaignStatsSidebarStrings(locale, "single"), [locale]);

  const { user } = useAuth();
  const activeTenantId = Number(user?.tenantId ?? 0);
  const withTenantQuery = useCallback(
    (path: string) => {
      let out = path;
      if (path.includes("/api/email/campaigns") && path.includes("picker=1")) {
        const sep0 = out.includes("?") ? "&" : "?";
        out = `${out}${sep0}singleLaneStats=1`;
      }
      if (!Number.isFinite(activeTenantId) || activeTenantId <= 0) return out;
      const sep = out.includes("?") ? "&" : "?";
      return `${out}${sep}tenantId=${activeTenantId}`;
    },
    [activeTenantId]
  );

  /** @deprecated 统计页不再拉全租户活动；保留状态避免大范围删引用 */
  const [allItems, setAllItems] = useState<CampaignListItem[]>([]);
  /** 按右侧发信邮箱筛选后的活动列表（下拉用） */
  const [items, setItems] = useState<CampaignListItem[]>([]);
  const [campaignListLoading, setCampaignListLoading] = useState(false);
  const [campaignListError, setCampaignListError] = useState<string | null>(null);
  const [statsFromEmail, setStatsFromEmail] = useState("");
  const campaignListFetchGenRef = useRef(0);
  const [statsChannel, setStatsChannel] = useState<EmailChannelKind>("medium");
  const [statsLaneIndex, setStatsLaneIndex] = useState<number | "">("");
  const initialSidebarLanesCache = readDedicatedLanesCache();
  const [sidebarLanes, setSidebarLanes] = useState<DedicatedLaneSnapshot[]>(
    () => initialSidebarLanesCache?.lanes ?? []
  );
  const [sidebarLanesReady, setSidebarLanesReady] = useState(
    () => (initialSidebarLanesCache?.lanes?.length ?? 0) > 0
  );
  const [sidebarSmtp, setSidebarSmtp] = useState<MarketingSmtpRow[]>([]);
  const [sidebarDedicated, setSidebarDedicated] = useState<
    Array<{ fromEmail?: string | null; from_email?: string | null; subscriptionTierId?: string | null; subscription_tier_id?: string | null }>
  >([]);
  const [sidebarSes, setSidebarSes] = useState<MarketingSesAddressRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [campaignCodeInput, setCampaignCodeInput] = useState("");
  const [codeLookupErr, setCodeLookupErr] = useState<string | null>(null);
  const [resolvedCampaign, setResolvedCampaign] = useState<{
    id: number;
    campaign_code: string | null;
    name: string;
    status: string;
  } | null>(null);
  /** 租户日期汇总 / 套餐订阅 */
  const [tenantStatsRefreshSignal, setTenantStatsRefreshSignal] = useState(0);
  /** 用户点「刷新」时递增，后台更新当前活动 7 栏（不清空已展示数字） */
  const [campaignStatsRefreshSignal, setCampaignStatsRefreshSignal] = useState(0);
  const statsSelfHealRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteCampaignUi, setDeleteCampaignUi] = useState<
    | { phase: "idle" }
    | { phase: "confirm"; message: string }
    | { phase: "ok"; message: string }
    | { phase: "err"; message: string }
  >({ phase: "idle" });

  const loadFilteredCampaigns = useCallback(
    async (fromEmail: string, opts?: { silent?: boolean; full?: boolean }) => {
      const email = fromEmail.trim();
      if (!email) return;
      const silent = Boolean(opts?.silent);
      /** 静默轮询不得递增 gen，否则会抢走前台请求的 finally，导致 loading 永不结束 */
      if (!silent) {
        campaignListFetchGenRef.current += 1;
        setCampaignListLoading(true);
        setCampaignListError(null);
      }
      const gen = campaignListFetchGenRef.current;
      try {
        const useFullPicker = opts?.full === true;
        const res = await apiJsonWithTimeout<{ ok?: boolean; items?: CampaignListItem[]; message?: string }>(
          withTenantQuery(
            `/api/email/campaigns?picker=1&fromEmail=${encodeURIComponent(email)}${useFullPicker ? "" : "&fast=1"}`
          ),
          undefined,
          useFullPicker ? 60_000 : 25_000
        );
        if (gen !== campaignListFetchGenRef.current) return;
        const list = Array.isArray(res.items) ? res.items : [];
        if (list.length > 0 || !silent) {
          setItems(list);
          if (list.length > 0) writeCampaignListBySender(modeSenderCacheKey(email), list);
          if (!silent && list.length > 0) {
            const defaultId = pickDefaultStatsCampaignId(list);
            setSelectedId((prev) => {
              if (prev != null && list.some((x) => x.id === prev)) return prev;
              return defaultId;
            });
          }
        }
        setCampaignListError(null);
      } catch (e) {
        if (gen !== campaignListFetchGenRef.current) return;
        const msg = String((e as Error)?.message ?? e);
        console.error(e);
        if (!silent) setCampaignListError(msg);
      } finally {
        if (!silent && gen === campaignListFetchGenRef.current) {
          setCampaignListLoading(false);
        }
      }
    },
    [withTenantQuery]
  );

  const onStatsFromEmailChange = useCallback(
    (email: string) => {
      setStatsFromEmail(email);
      const trimmed = email.trim();
      if (!trimmed) {
        setItems([]);
        setSelectedId(null);
        setCampaignListLoading(false);
        setCampaignListError(null);
        return;
      }
      if (hasCampaignListCacheForSender(modeSenderCacheKey(trimmed))) {
        const cached = readCampaignListBySender<CampaignListItem>(modeSenderCacheKey(trimmed)) ?? [];
        setItems(cached);
        setCampaignListLoading(false);
        const defaultId = pickDefaultStatsCampaignId(cached);
        setSelectedId((prev) => {
          if (prev != null && cached.some((x) => x.id === prev)) return prev;
          return defaultId;
        });
      } else {
        setSelectedId(null);
        setCampaignListLoading(true);
      }
      setCampaignListError(null);
      void loadFilteredCampaigns(trimmed, { full: false });
    },
    [loadFilteredCampaigns]
  );

  const refresh = useCallback(async () => {
    clearCampaignListBySenderCache();
    setAllItems([]);
    if (statsFromEmail.trim()) {
      await loadFilteredCampaigns(statsFromEmail.trim(), { full: true });
    }
    setTenantStatsRefreshSignal((n) => n + 1);
    setCampaignStatsRefreshSignal((n) => n + 1);
  }, [loadFilteredCampaigns, statsFromEmail]);

  const senderBootstrapDoneRef = useRef(false);
  const [searchParams] = useSearchParams();
  const urlPrefillDoneRef = useRef(false);

  useEffect(() => {
    if (urlPrefillDoneRef.current) return;
    const cid = Math.floor(Number(searchParams.get("campaignId") ?? 0));
    const fe = String(searchParams.get("fromEmail") ?? "").trim();
    if (!cid && !fe) return;
    urlPrefillDoneRef.current = true;
    if (fe) {
      senderBootstrapDoneRef.current = true;
      onStatsFromEmailChange(fe);
    }
    if (cid > 0) {
      setSelectedId(cid);
      setCampaignCodeInput(String(cid).padStart(6, "0"));
    }
  }, [searchParams, onStatsFromEmailChange]);

  useEffect(() => {
    void Promise.all([
      apiJson<{ ok: boolean; items: MarketingSmtpRow[] }>("/api/email/smtp"),
      apiJson<{ ok: boolean; items: Array<{ fromEmail?: string | null; from_email?: string | null; subscriptionTierId?: string | null; subscription_tier_id?: string | null }> }>(
        "/api/email/dedicated-servers"
      ).catch(() => ({ ok: true, items: [] })),
      apiJson<{ ok: boolean; items: MarketingSesAddressRow[] }>("/api/email/ses/sender-addresses").catch(() => ({
        ok: true,
        items: [] as MarketingSesAddressRow[]
      })),
      fetchDedicatedLanes().catch(() => ({ ok: false as const, lanes: [] }))
    ])
      .then(([smtp, ded, ses, lanesRes]) => {
        setSidebarSmtp(Array.isArray(smtp.items) ? smtp.items : []);
        setSidebarDedicated(Array.isArray(ded.items) ? ded.items : []);
        setSidebarSes(Array.isArray(ses.items) ? ses.items : []);
        const lanes = Array.isArray(lanesRes.lanes) ? lanesRes.lanes : [];
        setSidebarLanes(lanes);
        setSidebarLanesReady(true);
      })
      .catch(() => {
        setSidebarSmtp([]);
        setSidebarDedicated([]);
        setSidebarSes([]);
        setSidebarLanes([]);
        setSidebarLanesReady(true);
      });
  }, []);

  /** 首屏自动选中第一个可用发信邮箱，避免未选邮箱时活动列表为空、统计区无法加载 */
  useEffect(() => {
    if (senderBootstrapDoneRef.current || statsFromEmail) return;
    let groups = buildCampaignStatsSenderGroups(sidebarSmtp, sidebarDedicated, sidebarSes);
    if (sidebarLanes.length > 0) {
      const lanes = sidebarLanes;
      const laneIdx = pickDefaultLaneIndex(lanes);
      if (laneIdx !== "") {
        setStatsLaneIndex(laneIdx);
        const allowed = laneFromEmails(findLaneByIndex(lanes, laneIdx));
        if (allowed.length > 0) {
          groups = filterCampaignStatsGroupsByEmails(groups, allowed);
        }
      }
    }
    for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
      const fe = firstSenderEmailInChannel(groups, ch);
      if (fe) {
        senderBootstrapDoneRef.current = true;
        setStatsChannel(ch);
        onStatsFromEmailChange(fe);
        return;
      }
    }
  }, [statsFromEmail, sidebarLanes, sidebarSmtp, sidebarDedicated, sidebarSes, onStatsFromEmailChange]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        refresh().catch((e) => console.error(e));
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const selectedStatus = useMemo(() => {
    if (selectedId == null) return "";
    return String(items.find((x) => x.id === selectedId)?.status ?? "").toLowerCase();
  }, [items, selectedId]);

  /** 发送中：缩短列表轮询，便于右侧 stats 尽快识别 sending 并走 IMAP 同步 */
  useEffect(() => {
    if (!statsFromEmail.trim()) return undefined;
    const intervalMs = selectedStatus === "sending" ? 8000 : 20_000;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (campaignListLoading) return;
      void loadFilteredCampaigns(statsFromEmail.trim(), { silent: true }).catch(() => undefined);
    };
    const iv = window.setInterval(tick, intervalMs);
    return () => clearInterval(iv);
  }, [selectedStatus, loadFilteredCampaigns, statsFromEmail, campaignListLoading]);

  /** 须先选发信邮箱；下拉仅展示该域下已发送过的活动 */
  const campaignPickerPool = useMemo((): CampaignListItem[] => {
    if (!statsFromEmail.trim()) return [];
    return sortStatsCampaignPickerByRecentActivity(statsCampaignPickerPool(items));
  }, [items, statsFromEmail]);

  const campaignPickerDropdownItems = useMemo((): CampaignActivityIdOption[] => {
    return campaignPickerPool.map((x) => ({
      id: x.id,
      campaign_code: x.campaign_code,
      name: x.name,
      status: x.status,
      has_sent: x.has_sent
    }));
  }, [campaignPickerPool]);

  const pinnedPickerOption = useMemo((): CampaignActivityIdOption | null => {
    if (selectedId == null) return null;
    const inPool = campaignPickerDropdownItems.find((x) => x.id === selectedId);
    if (inPool) return inPool;
    const row =
      campaignPickerPool.find((x) => x.id === selectedId) ??
      allItems.find((x) => x.id === selectedId) ??
      items.find((x) => x.id === selectedId);
    if (row) {
      return {
        id: row.id,
        campaign_code: row.campaign_code,
        name: row.name,
        status: row.status,
        has_sent: row.has_sent ?? true
      };
    }
    if (resolvedCampaign?.id === selectedId) {
      return {
        id: resolvedCampaign.id,
        campaign_code: resolvedCampaign.campaign_code,
        name: resolvedCampaign.name,
        status: resolvedCampaign.status,
        has_sent: true
      };
    }
    return {
      id: selectedId,
      campaign_code: String(selectedId).padStart(6, "0"),
      name: sidebarUi.currentActivityName,
      status: "",
      has_sent: true
    };
  }, [
    selectedId,
    campaignPickerDropdownItems,
    campaignPickerPool,
    allItems,
    items,
    resolvedCampaign,
    sidebarUi.currentActivityName
  ]);

  const activityIdListLoading =
    pinnedPickerOption == null &&
    campaignPickerDropdownItems.length === 0 &&
    campaignListLoading;

  /** 默认选中最新一场活动（内部 ID 最大），便于「当前活动 · 6 位编号」直接展示 7 栏明细 */
  useEffect(() => {
    if (campaignPickerPool.length === 0) {
      if (!statsFromEmail.trim() && !campaignListLoading) {
        setSelectedId(null);
      }
      return;
    }
    if (statsFromEmail.trim() && campaignListLoading && items.length === 0) return;
    if (!statsFromEmail.trim()) return;
    const defaultId = pickDefaultStatsCampaignId(campaignPickerPool);
    if (defaultId == null) return;
    setSelectedId((prev) => {
      if (prev != null && campaignPickerPool.some((x) => x.id === prev)) return prev;
      return defaultId;
    });
  }, [
    campaignPickerPool,
    statsFromEmail,
    campaignListLoading,
    items.length
  ]);

  const selected =
    selectedId != null
      ? campaignPickerPool.find((x) => x.id === selectedId) ??
        allItems.find((x) => x.id === selectedId) ??
        (resolvedCampaign?.id === selectedId
          ? ({
              id: resolvedCampaign.id,
              campaign_code: resolvedCampaign.campaign_code,
              name: resolvedCampaign.name,
              status: resolvedCampaign.status,
              business_line: null,
              template_id: null,
              template_name: null,
              template_category: null,
              schedule_start_at: null,
              next_run_at: null,
              repeat_every_days: null,
              repeat_every_hours: null,
              send_mode: null,
              send_rounds_total: null,
              send_rounds_done: null,
              recipient_count: null,
              sent_count: 0,
              failed_count: 0,
              attempts_count: 0,
              pending_unsent: 0,
              created_at: ""
            } satisfies CampaignListItem)
          : selectedId != null
            ? ({
                id: selectedId,
                campaign_code: String(selectedId).padStart(6, "0"),
                name: "",
                status: "",
                business_line: null,
                template_id: null,
                template_name: null,
                template_category: null,
                schedule_start_at: null,
                next_run_at: null,
                repeat_every_days: null,
                repeat_every_hours: null,
                send_mode: null,
                send_rounds_total: null,
                send_rounds_done: null,
                recipient_count: null,
                sent_count: 0,
                failed_count: 0,
                attempts_count: 0,
                pending_unsent: 0,
                created_at: ""
              } satisfies CampaignListItem)
            : null)
      : null;
  async function lookupCampaignByCode() {
    const digits = campaignCodeInput.replace(/\D/g, "");
    if (!digits) {
      setCodeLookupErr(sidebarUi.enterSixDigitCode);
      return;
    }
    setCodeLookupErr(null);
    try {
      const r = await apiJson<{
        ok: boolean;
        item?: { id: number; campaign_code: string | null; name: string; status: string };
      }>(`/api/email/campaigns/resolve-code?code=${encodeURIComponent(digits)}`);
      const item = r.item;
      if (!item?.id) {
        setCodeLookupErr(sidebarUi.codeNotFound);
        setResolvedCampaign(null);
        return;
      }
      setResolvedCampaign(item);
      setSelectedId(item.id);
      setTenantStatsRefreshSignal((n) => n + 1);
      setCampaignStatsRefreshSignal((n) => n + 1);
    } catch (e: unknown) {
      setResolvedCampaign(null);
      setCodeLookupErr(String((e as Error)?.message ?? e));
    }
  }

  function beginDeleteCampaign() {
    const id = selectedId;
    if (id == null) return;
    const sel = items.find((x) => x.id === id);
    const resolved = resolvedCampaign?.id === id ? resolvedCampaign : null;
    const code =
      sel?.campaign_code ?? resolved?.campaign_code ?? String(id).padStart(6, "0");
    const fullName = String(sel?.name ?? resolved?.name ?? "");
    const nm = fullName.slice(0, 40);
    const nameSuffix =
      nm.length > 0
        ? `（${nm}${fullName.length > 40 ? "…" : ""}）`
        : "";
    setDeleteCampaignUi({
      phase: "confirm",
      message: [
        sidebarUi.deleteConfirm(id, code, nameSuffix),
        sidebarUi.deleteWarningRecords,
        sidebarUi.deleteWarningCircuit,
        sidebarUi.deleteWarningSending
      ].join(" ")
    });
  }

  async function confirmDeleteCampaign() {
    const id = selectedId;
    if (id == null) return;
    setDeleteCampaignUi({ phase: "idle" });
    setDeleteBusy(true);
    try {
      await apiJson(`/api/email/campaigns/${id}`, { method: "DELETE" });
      purgeCampaignStatsCache(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      setDeleteCampaignUi({ phase: "ok", message: sidebarUi.deleteSuccess });
      window.setTimeout(() => setDeleteCampaignUi({ phase: "idle" }), 3500);
      if (statsFromEmail.trim()) {
        void loadFilteredCampaigns(statsFromEmail.trim()).catch((e) => console.error(e));
      }
      setTenantStatsRefreshSignal((n) => n + 1);
    } catch (e: unknown) {
      setDeleteCampaignUi({ phase: "err", message: String((e as Error)?.message ?? e) });
      window.setTimeout(() => setDeleteCampaignUi({ phase: "idle" }), 8000);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <PageShell
      title={ui.pageTitle}
      description={ui.pageDescription}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/email/subscription-usage"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            {ui.linkUsage}
          </Link>
          <Link
            to="/email/campaigns"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            {ui.linkNewCampaign}
          </Link>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" onClick={() => refresh()}>
            {ui.refresh}
          </button>
        </div>
      }
    >
      <SectionCard title={ui.statsSectionTitle} description={ui.statsSectionDescription}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <aside className="order-1 flex w-full shrink-0 flex-col gap-4 text-[11px] lg:order-2 lg:w-80 [&_button]:text-[11px] [&_input]:text-[11px]">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-2.5">
                <div className="grid gap-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
                    {ui.senderScopeLabel}
                  </span>
                  <StandaloneDedicatedSenderFiltersGate
                    lanes={sidebarLanes}
                    lanesReady={sidebarLanesReady}
                    laneFilters={
                      <DedicatedLaneSenderFilters
                        compact
                        layout="stacked"
                        allowAllLane
                        listAllChannelEmails
                        mode="fromEmail"
                        fromEmail={statsFromEmail}
                        onFromEmailChange={onStatsFromEmailChange}
                        channel={statsChannel}
                        onChannelChange={setStatsChannel}
                        lanes={sidebarLanes}
                        selectedLaneIndex={statsLaneIndex}
                        onSelectLaneIndex={setStatsLaneIndex}
                        smtpItems={sidebarSmtp}
                        dedicatedServers={sidebarDedicated}
                        sesAddresses={sidebarSes}
                      />
                    }
                    legacyPicker={
                      <MarketingSenderChannelPicker
                        compact
                        mode="fromEmail"
                        fromEmail={statsFromEmail}
                        onFromEmailChange={onStatsFromEmailChange}
                        channel={statsChannel}
                        onChannelChange={setStatsChannel}
                        smtpItems={sidebarSmtp}
                        dedicatedServers={sidebarDedicated}
                        sesAddresses={sidebarSes}
                      />
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{sidebarUi.activityIdLabel}</span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <CampaignActivityIdDropdown
                      items={campaignPickerDropdownItems}
                      selectedId={selectedId}
                      pinnedSelection={pinnedPickerOption}
                      allowSentSelection
                      loading={activityIdListLoading}
                      onOpen={() => {
                        const fe = statsFromEmail.trim();
                        if (!fe || campaignListLoading) return;
                        void loadFilteredCampaigns(fe, { full: true });
                      }}
                      emptyHint={
                        activityIdListLoading
                          ? sidebarUi.loadingActivities
                          : campaignListError
                            ? sidebarUi.loadFailed(campaignListError)
                            : campaignPickerDropdownItems.length === 0
                              ? statsFromEmail.trim()
                                ? sidebarUi.noActivitiesSingle
                                : sidebarUi.selectSenderFirstSingle
                              : sidebarUi.selectActivity
                      }
                      onSelect={(id) => {
                        setSelectedId(id);
                        if (deleteCampaignUi.phase === "confirm") setDeleteCampaignUi({ phase: "idle" });
                      }}
                    />
                    <button
                      type="button"
                      className="h-8 shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={deleteBusy || selectedId == null}
                      onClick={() => beginDeleteCampaign()}
                    >
                      {deleteBusy ? sidebarUi.deleting : sidebarUi.deleteActivity}
                    </button>
                  </div>
                  {deleteCampaignUi.phase === "confirm" ? (
                    <InlineConfirmBar
                      message={deleteCampaignUi.message}
                      confirmLabel={sidebarUi.confirmDelete}
                      busy={deleteBusy}
                      onConfirm={() => void confirmDeleteCampaign()}
                      onCancel={() => setDeleteCampaignUi({ phase: "idle" })}
                    />
                  ) : null}
                  {deleteCampaignUi.phase === "ok" || deleteCampaignUi.phase === "err" ? (
                    <PageFeedbackLine
                      feedback={{
                        kind: deleteCampaignUi.phase === "ok" ? "ok" : "err",
                        text: deleteCampaignUi.message
                      }}
                    />
                  ) : null}
                  {campaignListError ? (
                    <p className="text-[9px] leading-relaxed text-rose-600">{campaignListError}</p>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{sidebarUi.lookupByCodeLabel}</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder={sidebarUi.codePlaceholder}
                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 font-mono text-[11px] outline-none focus:border-violet-400"
                      value={campaignCodeInput}
                      onChange={(e) => setCampaignCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void lookupCampaignByCode();
                      }}
                    />
                    <button
                      type="button"
                      className="h-8 shrink-0 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-900 hover:bg-violet-100"
                      onClick={() => void lookupCampaignByCode()}
                    >
                      {sidebarUi.lookup}
                    </button>
                  </div>
                  {codeLookupErr ? <p className="text-[10px] text-rose-600">{codeLookupErr}</p> : null}
                  {resolvedCampaign && selectedId === resolvedCampaign.id ? (
                    <p className="rounded-md border border-violet-100 bg-violet-50/80 px-2 py-1.5 font-mono text-[11px] text-violet-950">
                      {sidebarUi.internalIdCode(
                        resolvedCampaign.id,
                        resolvedCampaign.campaign_code ?? String(resolvedCampaign.id).padStart(6, "0")
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{sidebarUi.activityNameLabel}</span>
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-slate-800"
                    title={selected?.name ?? ""}
                  >
                    {selected?.name?.trim() ? selected.name : "—"}
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{sidebarUi.plannedRecipientsLabel}</span>
                  <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums text-slate-900">
                    {selected?.recipient_count != null && Number.isFinite(Number(selected.recipient_count))
                      ? Number(selected.recipient_count)
                      : "—"}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-slate-500">{sidebarUi.sidebarHint}</p>
            </div>

            {!IS_STANDALONE_DEPLOY ? (
              <div className="text-[11px]">
                <CampaignStatsPerfPanel campaignId={selectedId} />
              </div>
            ) : (
              <>
                <CampaignStatsPerfPanel campaignId={selectedId} />
                {IS_STANDALONE_DEPLOY ? (
                  <CampaignStatsSelfHealPanel
                    campaignId={selectedId}
                    campaignCode={
                      selected?.campaign_code ??
                      (selectedId != null ? String(selectedId).padStart(6, "0") : "—")
                    }
                    onClientRefresh={async () => {
                      if (statsSelfHealRefreshRef.current) {
                        await statsSelfHealRefreshRef.current();
                      }
                    }}
                  />
                ) : null}
              </>
            )}
          </aside>

          <div className="order-2 min-w-0 flex-1 lg:order-1">
            <CampaignActivityStats
              key={selectedId ?? "none"}
              tenantRefreshSignal={tenantStatsRefreshSignal}
              campaignRefreshSignal={campaignStatsRefreshSignal}
              selfHealRefreshRef={statsSelfHealRefreshRef}
              externalSenderBootstrap={
                sidebarSmtp.length > 0 || sidebarLanes.length > 0
                  ? {
                      smtp: sidebarSmtp,
                      dedicated: sidebarDedicated,
                      ses: sidebarSes,
                      lanes: sidebarLanes
                    }
                  : undefined
              }
              hideSenderFilters
              campaign={
                selected
                  ? {
                      id: selected.id,
                      campaign_code: selected.campaign_code,
                      name: selected.name,
                      status: selected.status,
                      template_name: selected.template_name,
                      template_id: selected.template_id,
                      latest_round_no: selected.latest_round_no ?? null,
                      sent_count: selected.sent_count,
                      failed_count: selected.failed_count,
                      attempts_count: selected.attempts_count,
                      has_sent: selected.has_sent
                    }
                  : null
              }
            />
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
