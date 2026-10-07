import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings } from "../../../i18n/emailCampaignStatsListI18n";
import { apiJson, getAccessToken, resolveApiUrl } from "../../../lib/api";
import {
  readCachedSlicePage,
  readCachedTabTotals,
  sliceCacheKey,
  totalsCacheKey,
  writeCachedSlicePage,
  writeCachedTabTotals,
  invalidateSendListCacheForCampaign
} from "../../../lib/campaignSendListCache";
import { pushStatsPerf, timedStatsPerf } from "../../../lib/campaignStatsPerfLog";
import { notifyEmailContactsChanged } from "../../../lib/emailCrmContactsSync";
import { SendListTabBar, SendListTabId, contactToCsvRow, downloadCsvFile } from "./campaignSendListUi";
import { CampaignSendListActivePanel } from "./CampaignSendListActivePanel";
import type {
  CampaignListMetricsPublishOptions,
  CampaignListMetricsSnapshot
} from "./CampaignActivityStats";

const PAGE_SIZE = 50;
const LIST_FETCH_TIMEOUT_MS = 90_000;

function tabTotalPages(total: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** 删除联系人后：当前页不得超过新 total 下的最后一页 */
function clampTabPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), tabTotalPages(total));
}

async function apiJsonWithTimeout<T>(path: string, init?: RequestInit, timeoutMs = LIST_FETCH_TIMEOUT_MS): Promise<T> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await apiJson<T>(path, { ...init, signal: ac.signal });
  } finally {
    window.clearTimeout(timer);
  }
}
/** 列表框内默认可见的数据行数，超出部分在框内纵向滚动 */
const VISIBLE_LIST_ROWS = 10;
/** 导出 CSV 时按 tab 分页拉取的上限 */
const EXPORT_MAX_PAGES = 40;
const EXPORT_PAGE_SIZE = 200;
/** 订阅/退订/投诉列表 API pageSize 上限 100（send-contacts 为 200） */
const COMPLIANCE_FETCH_PAGE_SIZE = 100;
/** 全部删除：每批条数（与 CSV 导入分批一致，避免一次删太多） */
const DELETE_ALL_BATCH = 500;

type SliceTabId = "opened" | "success" | "failed" | "unconfirmed";
type TabTotals = { all: number; opened: number; success: number; failed: number; unconfirmed?: number };

/** 已打开与 7 栏 engagement 同源：tab-totals 未就绪时勿冲 0（送达/失败仍随删除下降） */
function mergeTabTotalsSticky(next: TabTotals, prev: TabTotals | null): TabTotals {
  if (!prev) return next;
  return {
    all: next.all,
    success: next.success,
    failed: next.failed,
    unconfirmed: next.unconfirmed ?? 0,
    opened: next.opened <= prev.opened ? next.opened : Math.max(next.opened, prev.opened)
  };
}

function buildSendContactsQuery(opts: {
  page: number;
  pageSize: number;
  fromDate: string;
  toDate: string;
  fromEmail: string;
  sort?: string;
  tab?: SliceTabId;
  sendRunId?: number | null;
  refresh?: boolean;
}) {
  const q = new URLSearchParams({
    page: String(opts.page),
    pageSize: String(opts.pageSize),
    sort: opts.sort ?? "default",
    from: opts.fromDate,
    to: opts.toDate,
    skipImap: "1",
    fast: "1",
    lite: "1"
  });
  if (!opts.fromDate && !opts.toDate && (!opts.fromEmail || opts.fromEmail === "all")) {
    q.set("statsPanel", "1");
  }
  if (opts.tab) q.set("tab", opts.tab);
  if (opts.fromEmail && opts.fromEmail !== "all") q.set("fromEmail", opts.fromEmail);
  const runId = Math.floor(Number(opts.sendRunId) || 0);
  if (runId > 0) q.set("sendRunId", String(runId));
  if (opts.refresh) q.set("refresh", "1");
  return q;
}

/** 约 {VISIBLE_LIST_ROWS} 行数据 + 表头高度，用于框内滚动 */
const LIST_SCROLL_BOX =
  "mt-2 max-h-[22.75rem] overflow-y-auto overflow-x-auto rounded-md border bg-white [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:shadow-[0_1px_0_0_rgba(226,232,240,1)]";
const LIST_SCROLL_BOX_WIDE =
  "mt-2 max-h-[24rem] overflow-y-auto overflow-x-auto rounded-md border border-slate-200 bg-white [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:shadow-[0_1px_0_0_rgba(226,232,240,1)]";

function paginateSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total
  };
}

function listScrollHint(
  _sliceCount: number,
  _opts: { page: number; pageSize: number; total: number; totalPages: number }
) {
  return null;
}

function InlineConfirmBar(props: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  return (
    <div
      className={`space-y-1.5 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950 ${props.className ?? "mt-2"}`}
      role="status"
    >
      <p className="whitespace-pre-wrap">{props.message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-rose-300 bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          disabled={props.busy}
          onClick={props.onConfirm}
        >
          {props.confirmLabel ?? listUi.confirmDelete}
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          {listUi.cancel}
        </button>
      </div>
    </div>
  );
}

function InlineListPager(props: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (next: number) => void;
}) {
  const { page, totalPages, total, onPageChange } = props;
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  if (total <= 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
      <span>{listUi.pagerTotal(total, page, totalPages)}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          {listUi.prevPage}
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          {listUi.nextPage}
        </button>
      </div>
    </div>
  );
}

export type SendContactRow = {
  contactId: number;
  industry: string;
  company: string;
  contactName: string;
  jobTitle: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  sendCount: number;
  openCount: number;
  bounceLikeCount: number;
};

type ApiResponse = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: SendContactRow[];
};

type EventItem = {
  id: number;
  contactId?: number | null;
  email: string;
  reason?: string;
  createdAt?: string;
  company?: string;
  name?: string;
};

type DeleteConfirmState = {
  anchor: string;
  message: string;
  run: () => Promise<void>;
};

export function CampaignSendRecipientsTable(props: {
  campaignId: number | null;
  /** 展示用活动编号（如 000012） */
  campaignIdLabel: string;
  /** 单次发送轮次（7 栏与名单明细） */
  sendRunId?: number | null;
  roundNo?: number | null;
  /** 邮件送达数量：与营销活动统计里所选日期范围内的「成功」一致 */
  deliveredCount: number;
  /** 当前活动在 statsRangeLabel 日期范围内的订阅数 */
  subscribeCampaignCount?: number;
  /** 与 7 栏「已退订」一致 */
  unsubscribeCampaignCount?: number;
  /** 与 7 栏「已打开」一致 */
  openedCampaignCount?: number;
  /** 与 7 栏「投诉」一致 */
  complaintCampaignCount?: number;
  statsRangeLabel?: string;
  /** 自邮件套餐开通日起的订阅总数（租户维度） */
  subscribeTotalSincePackage?: number;
  subscribePackageStart?: string | null;
  subscribeBySendingDomain?: Array<{ fromEmail: string; count: number }>;
  dedicatedSummary?: {
    emailTierId: string | null;
    emailTierLabel: string | null;
    vpsGroupCount: number;
    senderDomainCount: number;
    lanes: Array<{ laneIndex: number; label: string; domainCount: number; relayIp: string | null }>;
    domains: Array<{ senderDomain: string; fromEmail: string | null; laneIndex: number | null; laneLabel: string | null }>;
  } | null;
  /** 父组件 7 栏已拉到的 tab 计数，用于名单首屏不等 tab-totals */
  initialTabTotals?: TabTotals | null;
  /** 首屏列表/统计仍在传输时展示提示 */
  listTransferPending?: boolean;
  /** 与上方统计卡片保持同口径的筛选窗口 */
  fromDate: string;
  toDate: string;
  fromEmail: string;
  /** 父组件在统计加载完成后递增，用于拉取最新发送列表 */
  listPullKey?: number;
  /** 为 false 时暂缓拉取发送列表，避免与 stats 抢带宽导致首屏卡死 */
  statsReady?: boolean;
  /** 活动发送中时间隔缩短，便于与顶部卡片同步 */
  aggressivePoll?: boolean;
  /** 用于区分发送中(2s)与已结束(8s)轮询间隔 */
  campaignStatus?: string;
  /** 名单 tab 计数 / 合规计数就绪后回传，用于补齐上方 7 栏互动指标 */
  onListMetricsChange?: (
    metrics: CampaignListMetricsSnapshot,
    opts?: CampaignListMetricsPublishOptions
  ) => void;
}) {
  const {
    campaignId,
    campaignIdLabel,
    sendRunId = null,
    roundNo = null,
    deliveredCount,
    subscribeCampaignCount = 0,
    unsubscribeCampaignCount = 0,
    openedCampaignCount = 0,
    complaintCampaignCount = 0,
    statsRangeLabel = "",
    subscribeTotalSincePackage = 0,
    subscribePackageStart = null,
    subscribeBySendingDomain = [],
    dedicatedSummary = null,
    listTransferPending = false,
    initialTabTotals = null,
    fromDate,
    toDate,
    fromEmail,
    listPullKey = 0,
    statsReady = true,
    aggressivePoll = false,
    campaignStatus = "",
    onListMetricsChange
  } = props;

  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);

  const [page, setPage] = useState(1);
  const [openedPage, setOpenedPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [unconfirmedPage, setUnconfirmedPage] = useState(1);
  const [failedPage, setFailedPage] = useState(1);
  const [complaintPage, setComplaintPage] = useState(1);
  const [complaintTotal, setComplaintTotal] = useState(0);
  const [complaintTotalPages, setComplaintTotalPages] = useState(1);
  const [sortByOpensDesc, setSortByOpensDesc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allListFetched, setAllListFetched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [tabTotals, setTabTotals] = useState<TabTotals | null>(null);
  const [complianceTotals, setComplianceTotals] = useState<{
    subscribe: number;
    unsubscribe: number;
    complaint: number;
  } | null>(null);
  const [sliceByTab, setSliceByTab] = useState<Partial<Record<SliceTabId, ApiResponse>>>({});
  const [sliceLoadingTab, setSliceLoadingTab] = useState<Partial<Record<SliceTabId, boolean>>>({});
  /** 该 tab 是否已尝试过拉取分页（避免「有数字但无 slice」时永远显示加载中） */
  const [sliceTabFetched, setSliceTabFetched] = useState<Partial<Record<SliceTabId, boolean>>>({});
  const [complianceLoadingTab, setComplianceLoadingTab] = useState<
    Partial<Record<"subscribe" | "unsubscribe" | "complaint", boolean>>
  >({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>("");
  const [complaintItems, setComplaintItems] = useState<EventItem[]>([]);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [selectedFailedContactIds, setSelectedFailedContactIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [subscribePage, setSubscribePage] = useState(1);
  const [subscribeTotal, setSubscribeTotal] = useState(0);
  const [subscribeTotalPages, setSubscribeTotalPages] = useState(1);
  const [unsubscribePage, setUnsubscribePage] = useState(1);
  const [unsubscribeTotal, setUnsubscribeTotal] = useState(0);
  const [unsubscribeTotalPages, setUnsubscribeTotalPages] = useState(1);
  const [subscribeItems, setSubscribeItems] = useState<EventItem[]>([]);
  const [unsubscribeItems, setUnsubscribeItems] = useState<EventItem[]>([]);
  const [deletingSubscribeEventId, setDeletingSubscribeEventId] = useState<number | null>(null);
  const [deletingUnsubscribeEventId, setDeletingUnsubscribeEventId] = useState<number | null>(null);
  const [exportingSubscribes, setExportingSubscribes] = useState(false);
  const [activeListTab, setActiveListTab] = useState<SendListTabId>("all");
  const [exportingTab, setExportingTab] = useState<SendListTabId | null>(null);
  const [deletingComplaintEventId, setDeletingComplaintEventId] = useState<number | null>(null);
  const deleteConfirmBusy =
    bulkDeleting ||
    deleteAllBusy ||
    deletingContactId != null ||
    deletingComplaintEventId != null ||
    deletingSubscribeEventId != null ||
    deletingUnsubscribeEventId != null;
  const deleteLocked = String(campaignStatus).trim().toLowerCase() === "sending";
  const blockDeleteWhileSending = useCallback(() => {
    if (!deleteLocked) return false;
    setErr(listUi.deleteDisabledWhileSending);
    return true;
  }, [deleteLocked, listUi]);
  /** 已在当前活动下拉取过「全量发送明细」分页数据后，轮询仅后台刷新，不把整表换成「加载中」 */
  const hasPagedContactsRef = useRef(false);
  /** 切换活动/轮次时递增，丢弃过期的名单请求回写 */
  const listScopeGenRef = useRef(0);
  const sliceInflightRef = useRef<Record<string, Promise<void>>>({});

  useEffect(() => {
    hasPagedContactsRef.current = false;
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId]);

  useEffect(() => {
    listScopeGenRef.current += 1;
    setPage(1);
    setOpenedPage(1);
    setSuccessPage(1);
    setUnconfirmedPage(1);
    setFailedPage(1);
    setSubscribePage(1);
    setUnsubscribePage(1);
    setSubscribeTotal(0);
    setUnsubscribeTotal(0);
    setSubscribeItems([]);
    setUnsubscribeItems([]);
    setComplianceTotals(null);
    setTabTotals(null);
    setApiData(null);
    setLoading(false);
    setSliceByTab({});
    setSliceLoadingTab({});
    setSliceTabFetched({});
    hasPagedContactsRef.current = false;
    sliceInflightRef.current = {};
  }, [sendRunId]);

  useEffect(() => {
    lastPublishedListMetricsRef.current = null;
    if (campaignId != null) invalidateSendListCacheForCampaign(campaignId);
    listScopeGenRef.current += 1;
    setPage(1);
    setOpenedPage(1);
    setSuccessPage(1);
    setUnconfirmedPage(1);
    setFailedPage(1);
    setComplaintPage(1);
    setSortByOpensDesc(false);
    setSelectedFailedContactIds([]);
    setTabTotals(null);
    setComplianceTotals(null);
    setSliceByTab({});
    setSliceLoadingTab({});
    setSliceTabFetched({});
    setAllListFetched(false);
    setComplianceLoadingTab({});
    setComplaintItems([]);
    setComplaintTotal(0);
    setComplaintTotalPages(1);
    setDeleteConfirm(null);
    setActiveListTab("all");
    pushStatsPerf({ campaignId, step: "change-campaign-reset-list" });
  }, [campaignId]);

  useEffect(() => {
    setPage(1);
    setOpenedPage(1);
    setSuccessPage(1);
    setUnconfirmedPage(1);
    setFailedPage(1);
    setComplaintPage(1);
    setSelectedFailedContactIds([]);
    setTabTotals(null);
    setComplianceTotals(null);
    setSliceByTab({});
    setSliceTabFetched({});
  }, [fromDate, toDate, fromEmail]);

  const complianceTotalsRef = useRef(complianceTotals);
  complianceTotalsRef.current = complianceTotals;
  const openedCampaignCountRef = useRef(openedCampaignCount);
  openedCampaignCountRef.current = openedCampaignCount;
  const unsubscribeCampaignCountRef = useRef(unsubscribeCampaignCount);
  unsubscribeCampaignCountRef.current = unsubscribeCampaignCount;
  const lastPublishedListMetricsRef = useRef<{
    subscribe: number;
    unsubscribe: number;
    complaint: number;
    opened: number;
    unconfirmed: number;
  } | null>(null);

  const publishListMetrics = useCallback(
    (
      totals: TabTotals | null,
      compliance: { subscribe: number; unsubscribe: number; complaint: number } | null,
      publishOpts?: CampaignListMetricsPublishOptions
    ) => {
      if (!onListMetricsChange || !totals) return;
      const replace = publishOpts?.replace === true;
      const comp = compliance ?? complianceTotalsRef.current;
      const prev = lastPublishedListMetricsRef.current;
      /** compliance 未返回前勿写 0，避免 7 栏已打开/退订/投诉闪没 */
      const subscribe = comp != null ? comp.subscribe : prev?.subscribe ?? 0;
      const unsubscribe =
        comp != null
          ? replace
            ? comp.unsubscribe
            : Math.max(comp.unsubscribe, prev?.unsubscribe ?? 0, unsubscribeCampaignCountRef.current)
          : Math.max(prev?.unsubscribe ?? 0, unsubscribeCampaignCountRef.current);
      const complaint = comp != null ? comp.complaint : prev?.complaint ?? 0;
      const opened = replace
        ? totals.opened
        : Math.max(totals.opened, prev?.opened ?? 0, openedCampaignCountRef.current);
      const unconfirmed = totals.unconfirmed ?? prev?.unconfirmed ?? 0;
      lastPublishedListMetricsRef.current = { subscribe, unsubscribe, complaint, opened, unconfirmed };
      onListMetricsChange(
        {
          all: totals.all,
          opened,
          success: totals.success,
          unconfirmed,
          failed: totals.failed,
          campaignFailCount: totals.failed,
          summaryFailCount: totals.failed,
          subscribe,
          unsubscribe,
          complaint
        },
        replace ? { replace: true } : undefined
      );
    },
    [onListMetricsChange]
  );

  const initialTabTotalsHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (campaignId == null) return;
    if (!initialTabTotals) return;
    const ck = `${totalsCacheKey(campaignId, fromDate, toDate, fromEmail, sendRunId)}|pull:${listPullKey}|o:${initialTabTotals.opened}`;
    if (initialTabTotalsHydratedRef.current === ck) return;
    initialTabTotalsHydratedRef.current = ck;
    const replace = initialTabTotals.opened >= (openedCampaignCountRef.current || 0);
    setTabTotals((prev) =>
      replace ? initialTabTotals : mergeTabTotalsSticky(initialTabTotals, prev)
    );
    writeCachedTabTotals(
      totalsCacheKey(campaignId, fromDate, toDate, fromEmail, sendRunId),
      initialTabTotals
    );
    publishListMetrics(initialTabTotals, complianceTotals, replace ? { replace: true } : undefined);
  }, [
    campaignId,
    fromDate,
    toDate,
    fromEmail,
    sendRunId,
    listPullKey,
    initialTabTotals,
    complianceTotals,
    publishListMetrics
  ]);

  useEffect(() => {
    initialTabTotalsHydratedRef.current = null;
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId, listPullKey]);

  useEffect(() => {
    tabTotalsLastOkRef.current = null;
    tabTotalsInflightRef.current = null;
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId]);

  const tabTotalsInflightRef = useRef<Promise<void> | null>(null);
  const tabTotalsLastOkRef = useRef<{ key: string; at: number } | null>(null);
  const TAB_TOTALS_MIN_REFRESH_MS = aggressivePoll ? 8_000 : 20_000;

  const loadTabTotals = useCallback(async (opts?: { force?: boolean }): Promise<TabTotals | null> => {
    if (campaignId == null) return null;
    const ck = totalsCacheKey(campaignId, fromDate, toDate, fromEmail, sendRunId);
    const cached = readCachedTabTotals(ck);
    if (cached && !opts?.force) {
      setTabTotals((prev) => mergeTabTotalsSticky(cached, prev));
      publishListMetrics(mergeTabTotalsSticky(cached, tabTotals), complianceTotals);
      pushStatsPerf({ campaignId, step: "tab-totals-cache", detail: `failed=${cached.failed}` });
      return cached;
    }
    if (
      !opts?.force &&
      tabTotalsLastOkRef.current?.key === ck &&
      Date.now() - tabTotalsLastOkRef.current.at < TAB_TOTALS_MIN_REFRESH_MS
    ) {
      return tabTotals;
    }
    if (tabTotalsInflightRef.current) {
      await tabTotalsInflightRef.current.catch(() => undefined);
      if (!opts?.force) return tabTotals;
    }
    let resolved: TabTotals | null = null;
    const run = async () => {
    try {
      const q = buildSendContactsQuery({
        page: 1,
        pageSize: 1,
        fromDate,
        toDate,
        fromEmail,
        sendRunId,
        refresh: Boolean(opts?.force)
      });
      const res = await timedStatsPerf(
        "tab-totals",
        campaignId,
        () =>
          apiJsonWithTimeout<{
            ok?: boolean;
            totals?: TabTotals;
            campaignFailCount?: number;
            summaryFailCount?: number;
          }>(
            `/api/email/campaigns/${campaignId}/send-contacts/tab-totals?${q.toString()}`,
            undefined,
            LIST_FETCH_TIMEOUT_MS
          )
      );
      if (res.totals) {
        /** 以 totals.failed 为准；勿 Math.max(campaignFailCount) 托底，否则删除联系人后 7 栏/tab 数无法下降 */
        const raw = { ...res.totals };
        const merged = opts?.force ? raw : mergeTabTotalsSticky(raw, tabTotals);
        setTabTotals((prev) => (opts?.force ? merged : mergeTabTotalsSticky(merged, prev)));
        writeCachedTabTotals(ck, merged);
        publishListMetrics(merged, complianceTotals, opts?.force ? { replace: true } : undefined);
        tabTotalsLastOkRef.current = { key: ck, at: Date.now() };
        resolved = merged;
      }
    } catch {
      setTabTotals(null);
      resolved = null;
    }
    };
    tabTotalsInflightRef.current = run().finally(() => {
      tabTotalsInflightRef.current = null;
    });
    await tabTotalsInflightRef.current;
    return resolved ?? readCachedTabTotals(ck) ?? tabTotals;
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId, complianceTotals, publishListMetrics, tabTotals]);

  const loadComplianceTotals = useCallback(
    async (opts?: { replace?: boolean; totals?: TabTotals | null }) => {
      if (campaignId == null) return;
      try {
        const res = await apiJson<{
          ok?: boolean;
          counts?: { subscribe: number; unsubscribe: number; complaint: number };
        }>(
          `/api/email/campaigns/${campaignId}/compliance-counts?allTime=1${
            sendRunId != null && sendRunId > 0 ? `&sendRunId=${sendRunId}` : ""
          }`
        );
        if (res.counts) {
          setComplianceTotals(res.counts);
          const totalsForPublish = opts?.totals ?? tabTotals;
          publishListMetrics(
            totalsForPublish,
            res.counts,
            opts?.replace ? { replace: true } : undefined
          );
        }
      } catch {
        setComplianceTotals(null);
      }
    },
    [campaignId, sendRunId, tabTotals, publishListMetrics]
  );

  const loadSliceTab = useCallback(
    async (
      tab: SliceTabId,
      tabPage: number,
      opts?: { background?: boolean; forceFetch?: boolean }
    ): Promise<ApiResponse | null> => {
      if (campaignId == null) return null;
      const scopeGen = listScopeGenRef.current;
      const inflightKey = `${tab}:${tabPage}:${fromDate}:${toDate}:${fromEmail}:${sendRunId ?? 0}`;
      const inflight = sliceInflightRef.current[inflightKey];
      if (inflight && opts?.background) {
        await inflight.catch(() => undefined);
        return null;
      }
      if (inflight && !opts?.background) {
        await inflight.catch(() => undefined);
        delete sliceInflightRef.current[inflightKey];
      }
      const totalsCk = totalsCacheKey(campaignId, fromDate, toDate, fromEmail, sendRunId);
      const cachedTotals = readCachedTabTotals(totalsCk);
      /** 已打开：角标/tab-totals 为 0 时仍拉明细，避免 engagement 有记录而名单空 */
      if (cachedTotals && cachedTotals[tab] === 0 && tab !== "opened") {
        setSliceByTab((prev) => ({
          ...prev,
          [tab]: {
            ok: true,
            page: tabPage,
            pageSize: PAGE_SIZE,
            total: 0,
            totalPages: 1,
            items: []
          }
        }));
        if (!opts?.background) {
          setSliceTabFetched((prev) => ({ ...prev, [tab]: true }));
        }
        return {
          ok: true,
          page: 1,
          pageSize: PAGE_SIZE,
          total: 0,
          totalPages: 1,
          items: []
        };
      }
      const ck = sliceCacheKey(campaignId, tab, tabPage, fromDate, toDate, fromEmail, sendRunId);
      const cached = opts?.forceFetch ? null : readCachedSlicePage(ck);
      if (cached) {
        setSliceByTab((prev) => ({
          ...prev,
          [tab]: {
            ok: true,
            page: cached.page,
            pageSize: cached.pageSize,
            total: cached.total,
            totalPages: cached.totalPages,
            items: cached.items
          }
        }));
        if (!opts?.background) {
          pushStatsPerf({ campaignId, step: `list-tab-cache:${tab}`, detail: `page=${tabPage} total=${cached.total}` });
          setSliceTabFetched((prev) => ({ ...prev, [tab]: true }));
          return {
            ok: true,
            page: cached.page,
            pageSize: cached.pageSize,
            total: cached.total,
            totalPages: cached.totalPages,
            items: cached.items
          };
        }
      }
      const run = async (): Promise<ApiResponse | null> => {
        if (!opts?.background) {
          setSliceLoadingTab((prev) => ({ ...prev, [tab]: true }));
        }
        try {
          const q = buildSendContactsQuery({
            page: tabPage,
            pageSize: PAGE_SIZE,
            fromDate,
            toDate,
            fromEmail,
            tab,
            sort: tab === "opened" && sortByOpensDesc ? "opens_desc" : "default",
            sendRunId,
            refresh: Boolean(opts?.forceFetch)
          });
          const res = await timedStatsPerf(
            `send-contacts:${tab}`,
            campaignId,
            () =>
              apiJsonWithTimeout<ApiResponse>(
                `/api/email/campaigns/${campaignId}/send-contacts?${q.toString()}`
              ),
            `page=${tabPage}`
          );
          if (scopeGen !== listScopeGenRef.current) return null;
          setSliceByTab((prev) => ({ ...prev, [tab]: res }));
          writeCachedSlicePage(ck, {
            page: Number(res.page ?? tabPage),
            pageSize: Number(res.pageSize ?? PAGE_SIZE),
            total: Number(res.total ?? 0),
            totalPages: Math.max(1, Number(res.totalPages ?? 1)),
            items: Array.isArray(res.items) ? res.items : []
          });
          return res;
        } catch (e: unknown) {
          if (scopeGen !== listScopeGenRef.current) return null;
          if (!cached) {
            setSliceByTab((prev) => {
              const next = { ...prev };
              delete next[tab];
              return next;
            });
          }
          if (!opts?.background) {
            setErr(String((e as Error)?.message ?? e));
          }
          return null;
        } finally {
          if (scopeGen === listScopeGenRef.current && !opts?.background) {
            setSliceLoadingTab((prev) => ({ ...prev, [tab]: false }));
            setSliceTabFetched((prev) => ({ ...prev, [tab]: true }));
          }
        }
      };
      const p = run();
      sliceInflightRef.current[inflightKey] = p.then(() => undefined);
      try {
        return await p;
      } finally {
        delete sliceInflightRef.current[inflightKey];
      }
    },
    [campaignId, fromDate, toDate, fromEmail, sendRunId, sortByOpensDesc]
  );

  const fetchAllRowsForTab = useCallback(
    async (tab: SliceTabId): Promise<SendContactRow[]> => {
      if (campaignId == null) return [];
      const merged: SendContactRow[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const q = buildSendContactsQuery({
          page: p,
          pageSize: EXPORT_PAGE_SIZE,
          fromDate,
          toDate,
          fromEmail,
          tab,
          sendRunId
        });
        const res = await apiJson<ApiResponse>(
          `/api/email/campaigns/${campaignId}/send-contacts?${q.toString()}`
        );
        const chunk = Array.isArray(res.items) ? res.items : [];
        merged.push(...chunk);
        const totalPages = Math.max(1, Number(res.totalPages ?? 1));
        if (chunk.length === 0 || p >= totalPages) break;
        if (chunk.length < EXPORT_PAGE_SIZE) break;
      }
      return merged;
    },
    [campaignId, fromDate, toDate, fromEmail, sendRunId]
  );

  const fetchAllComplianceItems = useCallback(
    async (kind: "subscribe" | "unsubscribe" | "complaint"): Promise<EventItem[]> => {
      if (campaignId == null) return [];
      const base =
        kind === "subscribe"
          ? `/api/email/campaigns/${campaignId}/subscribes`
          : kind === "unsubscribe"
            ? `/api/email/campaigns/${campaignId}/unsubscribes`
            : `/api/email/campaigns/${campaignId}/complaints`;
      const merged: EventItem[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const runQ =
          kind === "subscribe" && sendRunId != null && sendRunId > 0 ? `&sendRunId=${sendRunId}` : "";
        const res = await apiJson<{
          ok: boolean;
          items: EventItem[];
          totalPages?: number;
        }>(`${base}?page=${p}&pageSize=${COMPLIANCE_FETCH_PAGE_SIZE}&slim=1${runQ}`);
        const chunk = Array.isArray(res.items) ? res.items : [];
        merged.push(...chunk);
        const totalPages = Math.max(1, Number(res.totalPages ?? 1));
        if (chunk.length === 0 || p >= totalPages) break;
        if (chunk.length < COMPLIANCE_FETCH_PAGE_SIZE) break;
      }
      return merged;
    },
    [campaignId, sendRunId]
  );

  const loadApi = useCallback(async (opts?: { pageOverride?: number }) => {
    if (campaignId == null) return;
    const scopeGen = listScopeGenRef.current;
    const silent = hasPagedContactsRef.current;
    const usePage = opts?.pageOverride ?? page;
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const sort = sortByOpensDesc ? "opens_desc" : "default";
      const q = buildSendContactsQuery({
        page: usePage,
        pageSize: PAGE_SIZE,
        fromDate,
        toDate,
        fromEmail,
        sort,
        sendRunId
      });
      const res = await timedStatsPerf(
        "send-contacts:all",
        campaignId,
        () =>
          apiJsonWithTimeout<ApiResponse>(
            `/api/email/campaigns/${campaignId}/send-contacts?${q.toString()}`
          ),
        `page=${usePage}`
      );
      if (scopeGen !== listScopeGenRef.current) return;
      setApiData(res);
      if (opts?.pageOverride != null && opts.pageOverride !== page) {
        setPage(opts.pageOverride);
      }
      hasPagedContactsRef.current = true;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      setLastUpdatedAt(`${hh}:${mm}:${ss}`);
    } catch (e: unknown) {
      if (scopeGen !== listScopeGenRef.current) return;
      setErr(String((e as Error)?.message ?? e));
      setApiData(null);
      hasPagedContactsRef.current = false;
    } finally {
      if (scopeGen !== listScopeGenRef.current) return;
      setAllListFetched(true);
      if (!silent) setLoading(false);
    }
  }, [campaignId, page, sortByOpensDesc, fromDate, toDate, fromEmail, sendRunId]);

  const loadComplaints = useCallback(async (): Promise<number> => {
    if (campaignId == null) return 0;
    setComplianceLoadingTab((prev) => ({ ...prev, complaint: true }));
    try {
      const res = await timedStatsPerf("complaints", campaignId, () =>
        apiJson<{
        ok: boolean;
        page: number;
        pageSize: number;
        total: number;
        items: EventItem[];
      }>(
          `/api/email/campaigns/${campaignId}/complaints?page=${complaintPage}&pageSize=${PAGE_SIZE}&slim=1`
        )
      );
      const total = Number(res.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      setComplaintItems(Array.isArray(res.items) ? res.items : []);
      setComplaintTotal(total);
      setComplaintTotalPages(totalPages);
      if (complaintPage > totalPages) setComplaintPage(totalPages);
      return total;
    } catch (e: unknown) {
      setComplaintItems([]);
      setComplaintTotal(0);
      setComplaintTotalPages(1);
      setErr(String((e as Error)?.message ?? e));
      return 0;
    } finally {
      setComplianceLoadingTab((prev) => ({ ...prev, complaint: false }));
    }
  }, [campaignId, complaintPage]);

  const loadSubscribes = useCallback(async (): Promise<number> => {
    if (campaignId == null) return 0;
    setComplianceLoadingTab((prev) => ({ ...prev, subscribe: true }));
    try {
      const res = await timedStatsPerf("subscribes", campaignId, () =>
        apiJson<{
        ok: boolean;
        page: number;
        pageSize: number;
        total: number;
        items: EventItem[];
        }>(
          `/api/email/campaigns/${campaignId}/subscribes?page=${subscribePage}&pageSize=${PAGE_SIZE}&slim=1${
            sendRunId != null && sendRunId > 0 ? `&sendRunId=${sendRunId}` : ""
          }`
        )
      );
      const total = Number(res.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      setSubscribeItems(Array.isArray(res.items) ? res.items : []);
      setSubscribeTotal(total);
      setSubscribeTotalPages(totalPages);
      if (subscribePage > totalPages) setSubscribePage(totalPages);
      return total;
    } catch (e: unknown) {
      setSubscribeItems([]);
      setSubscribeTotal(0);
      setSubscribeTotalPages(1);
      setErr(String((e as Error)?.message ?? e));
      return 0;
    } finally {
      setComplianceLoadingTab((prev) => ({ ...prev, subscribe: false }));
    }
  }, [campaignId, subscribePage, sendRunId]);

  const loadUnsubscribes = useCallback(async (): Promise<number> => {
    if (campaignId == null) return 0;
    setComplianceLoadingTab((prev) => ({ ...prev, unsubscribe: true }));
    try {
      const res = await timedStatsPerf("unsubscribes", campaignId, () =>
        apiJson<{
        ok: boolean;
        page: number;
        pageSize: number;
        total: number;
        items: EventItem[];
        }>(`/api/email/campaigns/${campaignId}/unsubscribes?page=${unsubscribePage}&pageSize=${PAGE_SIZE}&slim=1`)
      );
      const total = Number(res.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      setUnsubscribeItems(Array.isArray(res.items) ? res.items : []);
      setUnsubscribeTotal(total);
      setUnsubscribeTotalPages(totalPages);
      if (unsubscribePage > totalPages) setUnsubscribePage(totalPages);
      return total;
    } catch (e: unknown) {
      setUnsubscribeItems([]);
      setUnsubscribeTotal(0);
      setUnsubscribeTotalPages(1);
      setErr(String((e as Error)?.message ?? e));
      return 0;
    } finally {
      setComplianceLoadingTab((prev) => ({ ...prev, unsubscribe: false }));
    }
  }, [campaignId, unsubscribePage]);

  useEffect(() => {
    if (campaignId == null || !statsReady) return;
    const force = listPullKey > 0;
    if (initialTabTotals && !force) {
      void loadComplianceTotals();
      return;
    }
    void loadTabTotals({ force });
    void loadComplianceTotals({ replace: force });
  }, [
    campaignId,
    fromDate,
    toDate,
    fromEmail,
    sendRunId,
    listPullKey,
    initialTabTotals,
    loadTabTotals,
    loadComplianceTotals,
    statsReady
  ]);

  useEffect(() => {
    if (campaignId == null || !statsReady) return;
    /** 仅加载当前标签，避免多路 send-contacts 同时打满连接导致超时 */
    if (activeListTab === "all") void loadApi();
    else if (activeListTab === "opened") void loadSliceTab("opened", openedPage);
    else if (activeListTab === "success") void loadSliceTab("success", successPage);
    else if (activeListTab === "unconfirmed") void loadSliceTab("unconfirmed", unconfirmedPage);
    else if (activeListTab === "failed") void loadSliceTab("failed", failedPage);
  }, [
    activeListTab,
    openedPage,
    successPage,
    unconfirmedPage,
    failedPage,
    page,
    campaignId,
    fromDate,
    toDate,
    fromEmail,
    sendRunId,
    listPullKey,
    loadSliceTab,
    loadApi,
    statsReady
  ]);

  const loadApiRef = useRef(loadApi);
  loadApiRef.current = loadApi;
  const loadTabTotalsRef = useRef(loadTabTotals);
  loadTabTotalsRef.current = loadTabTotals;
  const loadComplianceTotalsRef = useRef(loadComplianceTotals);
  loadComplianceTotalsRef.current = loadComplianceTotals;
  const loadSliceTabRef = useRef(loadSliceTab);
  loadSliceTabRef.current = loadSliceTab;
  const activeListTabRef = useRef(activeListTab);
  activeListTabRef.current = activeListTab;

  /** 切换已打开/已退订 tab 时清 sticky，强制重拉明细 */
  useEffect(() => {
    if (activeListTab !== "opened" && activeListTab !== "unsubscribe") return;
    lastPublishedListMetricsRef.current = null;
    if (activeListTab === "opened") {
      setSliceByTab((prev) => {
        if (prev.opened == null) return prev;
        const next = { ...prev };
        delete next.opened;
        return next;
      });
      setSliceTabFetched((prev) => ({ ...prev, opened: false }));
    }
  }, [activeListTab]);

  const refreshLists = useCallback(async () => {
    await loadTabTotals();
    await loadComplianceTotals();
    await loadApi();
    const tab = activeListTabRef.current;
    if (tab === "opened") await loadSliceTab("opened", openedPage);
    else if (tab === "success") await loadSliceTab("success", successPage);
    else if (tab === "unconfirmed") await loadSliceTab("unconfirmed", unconfirmedPage);
    else if (tab === "failed") await loadSliceTab("failed", failedPage);
  }, [loadTabTotals, loadApi, loadSliceTab, openedPage, successPage, unconfirmedPage, failedPage]);

  const failedPageRef = useRef(failedPage);
  failedPageRef.current = failedPage;
  const openedPageRef = useRef(openedPage);
  openedPageRef.current = openedPage;
  const successPageRef = useRef(successPage);
  successPageRef.current = successPage;
  const unconfirmedPageRef = useRef(unconfirmedPage);
  unconfirmedPageRef.current = unconfirmedPage;
  const pageRef = useRef(page);
  pageRef.current = page;

  /** 删除成功后立即从当前列表 state 移除，避免等服务端缓存刷新 */
  const evictContactsFromSendLists = useCallback(
    (contactIds: number[], dropHint?: Partial<Record<"all" | "opened" | "success" | "unconfirmed" | "failed", number>>) => {
      const idSet = new Set(contactIds.filter((id) => id > 0));
      if (idSet.size === 0) return;

      const dropRows = (items: SendContactRow[]) => {
        const next = items.filter((r) => !idSet.has(r.contactId));
        return { next, removed: items.length - next.length };
      };

      let openedRemoved = 0;
      let successRemoved = 0;
      let unconfirmedRemoved = 0;
      let failedRemoved = 0;
      let allRemoved = 0;

      setSliceByTab((prev) => {
        let changed = false;
        const out = { ...prev };
        for (const tab of ["opened", "success", "unconfirmed", "failed"] as const) {
          const api = out[tab];
          if (!api?.items?.length) continue;
          const { next, removed } = dropRows(api.items as SendContactRow[]);
          if (removed === 0) continue;
          changed = true;
          if (tab === "opened") openedRemoved += removed;
          if (tab === "success") successRemoved += removed;
          if (tab === "unconfirmed") unconfirmedRemoved += removed;
          if (tab === "failed") failedRemoved += removed;
          const total = Math.max(0, Number(api.total ?? 0) - removed);
          const pageSize = Number(api.pageSize ?? PAGE_SIZE);
          out[tab] = {
            ...api,
            items: next,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize) || 1)
          };
        }
        return changed ? out : prev;
      });

      if (dropHint?.failed && dropHint.failed > failedRemoved) {
        const extra = dropHint.failed - failedRemoved;
        setSliceByTab((prev) => {
          const api = prev.failed;
          if (!api) return prev;
          const total = Math.max(0, Number(api.total ?? 0) - extra);
          const pageSize = Number(api.pageSize ?? PAGE_SIZE);
          return {
            ...prev,
            failed: {
              ...api,
              total,
              totalPages: Math.max(1, Math.ceil(total / pageSize) || 1)
            }
          };
        });
      }

      setApiData((prev) => {
        if (!prev?.items?.some((r) => idSet.has(r.contactId))) return prev;
        const { next, removed } = dropRows(prev.items as SendContactRow[]);
        allRemoved = removed;
        const total = Math.max(0, Number(prev.total ?? 0) - removed);
        const pageSize = Number(prev.pageSize ?? PAGE_SIZE);
        return {
          ...prev,
          items: next,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize) || 1)
        };
      });

      /** 勿改 tabTotals / 7 栏：删除仅清列表 + CRM/行业标签，统计栏保持发送当时快照 */
      setSelectedFailedContactIds((prev) => prev.filter((id) => !idSet.has(id)));

      if (campaignId != null) invalidateSendListCacheForCampaign(campaignId);
    },
    [campaignId]
  );

  const evictContactsFromSendListsRef = useRef(evictContactsFromSendLists);
  evictContactsFromSendListsRef.current = evictContactsFromSendLists;

  /** 删除联系人后：刷新 tab 角标/7 栏统计并 reload 当前列表 */
  const refreshAfterContactDelete = useCallback(
    async (opts?: { deletedContactIds?: number[] }) => {
    if (campaignId == null) return;
    invalidateSendListCacheForCampaign(campaignId);
    tabTotalsLastOkRef.current = null;
    lastPublishedListMetricsRef.current = null;
    const tab = activeListTabRef.current;
    const fetchOpts = { forceFetch: true as const };
    const totalsCk = totalsCacheKey(campaignId, fromDate, toDate, fromEmail, sendRunId);
    const totals =
      (await loadTabTotals({ force: true })) ?? readCachedTabTotals(totalsCk) ?? tabTotals;
    await loadComplianceTotals({ replace: true, totals });

    const safeFailed = clampTabPage(failedPageRef.current, totals?.failed ?? 0);
    if (safeFailed !== failedPageRef.current) setFailedPage(safeFailed);
    const safeUnconfirmed = clampTabPage(unconfirmedPageRef.current, totals?.unconfirmed ?? 0);
    if (safeUnconfirmed !== unconfirmedPageRef.current) setUnconfirmedPage(safeUnconfirmed);

    const jobs: Promise<unknown>[] = [loadSliceTab("failed", safeFailed, fetchOpts)];

    if (tab === "opened") {
      const safe = clampTabPage(openedPageRef.current, totals?.opened ?? 0);
      if (safe !== openedPageRef.current) setOpenedPage(safe);
      jobs.push(loadSliceTab("opened", safe, fetchOpts));
    } else if (tab === "success") {
      const safe = clampTabPage(successPageRef.current, totals?.success ?? 0);
      if (safe !== successPageRef.current) setSuccessPage(safe);
      jobs.push(loadSliceTab("success", safe, fetchOpts));
    } else if (tab === "unconfirmed") {
      jobs.push(loadSliceTab("unconfirmed", safeUnconfirmed, fetchOpts));
    } else if (tab === "all") {
      const safe = clampTabPage(pageRef.current, totals?.all ?? 0);
      if (safe !== pageRef.current) setPage(safe);
      jobs.push(loadApi({ pageOverride: safe }));
    } else if (tab === "complaint") {
      jobs.push(loadComplaints());
    } else if (tab === "subscribe") {
      jobs.push(loadSubscribes());
    } else if (tab === "unsubscribe") {
      jobs.push(loadUnsubscribes());
    }

    await Promise.all(jobs);
    const deletedIds = Array.from(new Set((opts?.deletedContactIds ?? []).filter((id) => id > 0)));
    if (deletedIds.length > 0) {
      notifyEmailContactsChanged({ contactIds: deletedIds, source: "send-list-delete" });
    }
  }, [
    campaignId,
    fromDate,
    toDate,
    fromEmail,
    sendRunId,
    tabTotals,
    loadTabTotals,
    loadSliceTab,
    loadApi,
    loadComplaints,
    loadSubscribes,
    loadUnsubscribes,
    loadComplianceTotals
  ]);

  const refreshListsRef = useRef(refreshLists);
  refreshListsRef.current = refreshLists;
  const refreshAfterContactDeleteRef = useRef(refreshAfterContactDelete);
  refreshAfterContactDeleteRef.current = refreshAfterContactDelete;
  const loadComplaintsRef = useRef(loadComplaints);
  loadComplaintsRef.current = loadComplaints;
  const loadSubscribesRef = useRef(loadSubscribes);
  loadSubscribesRef.current = loadSubscribes;
  const loadUnsubscribesRef = useRef(loadUnsubscribes);
  loadUnsubscribesRef.current = loadUnsubscribes;

  useEffect(() => {
    if (!statsReady || campaignId == null) return;
    if (activeListTab === "complaint") {
      const expect = complianceTotals?.complaint ?? complaintTotal;
      if (expect === 0 && complianceTotals != null) {
        setComplaintItems([]);
        setComplaintTotal(0);
        setComplaintTotalPages(1);
        return;
      }
      void loadComplaints();
    } else if (activeListTab === "subscribe") void loadSubscribes();
    else if (activeListTab === "unsubscribe") void loadUnsubscribes();
  }, [
    activeListTab,
    subscribePage,
    unsubscribePage,
    complaintPage,
    sendRunId,
    loadComplaints,
    loadSubscribes,
    loadUnsubscribes,
    listPullKey,
    statsReady,
    campaignId,
    complianceTotals,
    complaintTotal
  ]);

  /** 发送中/已结束活动轮询：同步已打开与名单（已结束用较长间隔减轻 VPS 压力） */
  useEffect(() => {
    if (campaignId == null || !statsReady || !aggressivePoll) return undefined;
    const pollMs = String(campaignStatus).toLowerCase() === "sending" ? 2000 : 8000;
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadTabTotalsRef.current({ force: true });
      void loadComplianceTotalsRef.current({ replace: true });
      const tab = activeListTabRef.current;
      const bg = { background: true as const, forceFetch: true as const };
      if (tab === "all") void loadApiRef.current();
      else if (tab === "complaint") void loadComplaintsRef.current();
      else if (tab === "subscribe") void loadSubscribesRef.current();
      else if (tab === "unsubscribe") void loadUnsubscribesRef.current();
      else if (tab === "opened") void loadSliceTabRef.current("opened", openedPageRef.current, bg);
      else if (tab === "success") void loadSliceTabRef.current("success", successPageRef.current, bg);
      else if (tab === "unconfirmed") void loadSliceTabRef.current("unconfirmed", unconfirmedPageRef.current, bg);
      else if (tab === "failed") void loadSliceTabRef.current("failed", failedPageRef.current, bg);
    }, pollMs);
    return () => window.clearInterval(iv);
  }, [campaignId, aggressivePoll, campaignStatus, statsReady]);

  const confirmRemoveContact = useCallback((row: SendContactRow, anchor: string) => {
    if (!row.contactId) return;
    if (blockDeleteWhileSending()) return;
    setDeleteConfirm({
      anchor,
      message: listUi.confirmDeleteContact(row.email),
      run: async () => {
        setDeletingContactId(row.contactId);
        setErr(null);
        try {
          await apiJson<{ ok: boolean }>(`/api/email/contacts/${row.contactId}`, { method: "DELETE" });
          evictContactsFromSendListsRef.current([row.contactId]);
          await refreshAfterContactDeleteRef.current({
            deletedContactIds: [row.contactId]
          });
        } catch (e: unknown) {
          setErr(String((e as Error)?.message ?? e));
        } finally {
          setDeletingContactId(null);
        }
      }
    });
  }, [blockDeleteWhileSending, listUi]);

  const removeContact = useCallback(
    (row: SendContactRow) => {
      confirmRemoveContact(row, `failed-row-${row.contactId}`);
    },
    [confirmRemoveContact]
  );

  const removeAllContact = useCallback(
    (row: SendContactRow) => {
      confirmRemoveContact(row, `all-row-${row.contactId}`);
    },
    [confirmRemoveContact]
  );

  type ComplianceKind = "subscribe" | "unsubscribe" | "complaint";

  const deleteComplianceEventWithCrm = useCallback(
    async (item: EventItem, kind: ComplianceKind): Promise<number[]> => {
      const deletedContactIds: number[] = [];
      const directId = item.contactId != null && item.contactId > 0 ? item.contactId : null;
      if (directId) {
        const res = await apiJson<{ ok: boolean; contactIds?: number[] }>(
          `/api/email/contacts/${directId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(listUi.deleteFailedMsg);
        const ids =
          Array.isArray(res.contactIds) && res.contactIds.length > 0 ? res.contactIds : [directId];
        deletedContactIds.push(...ids.filter((id) => id > 0));
      } else {
        const em = String(item.email ?? "").trim();
        if (em) {
          const res = await apiJson<{ ok: boolean; contactIds?: number[]; deleted?: number }>(
            "/api/email/contacts/delete-by-email",
            { method: "POST", body: JSON.stringify({ email: em }) }
          );
          if (!res.ok) throw new Error(listUi.deleteFailedMsg);
          if (Array.isArray(res.contactIds)) {
            deletedContactIds.push(...res.contactIds.filter((id) => id > 0));
          }
        }
      }
      if (deletedContactIds.length === 0) {
        if (kind === "subscribe") {
          await apiJson<{ ok: boolean }>(`/api/email/subscribe-events/${item.id}`, { method: "DELETE" });
        } else if (kind === "unsubscribe") {
          await apiJson<{ ok: boolean }>(`/api/email/unsubscribe-events/${item.id}`, { method: "DELETE" });
        } else {
          await apiJson<{ ok: boolean }>(`/api/email/delivery-events/${item.id}`, { method: "DELETE" });
        }
      }
      return Array.from(new Set(deletedContactIds));
    },
    [listUi]
  );

  const removeSubscribe = useCallback(
    (item: EventItem) => {
      if (blockDeleteWhileSending()) return;
      setDeleteConfirm({
        anchor: `subscribe-row-${item.id}`,
        message: listUi.confirmRemoveSubscribe(item.email),
        run: async () => {
          setDeletingSubscribeEventId(item.id);
          setErr(null);
          try {
            const deletedContactIds = await deleteComplianceEventWithCrm(item, "subscribe");
            if (deletedContactIds.length > 0) {
              evictContactsFromSendListsRef.current(deletedContactIds);
            }
            setSubscribeItems((prev) => prev.filter((x) => x.id !== item.id));
            setSubscribeTotal((t) => Math.max(0, t - 1));
            await refreshAfterContactDeleteRef.current(
              deletedContactIds.length > 0 ? { deletedContactIds } : undefined
            );
            if (deletedContactIds.length === 0) await loadSubscribes();
          } catch (e: unknown) {
            setErr(String((e as Error)?.message ?? e));
          } finally {
            setDeletingSubscribeEventId(null);
          }
        }
      });
    },
    [blockDeleteWhileSending, deleteComplianceEventWithCrm, loadSubscribes, listUi]
  );

  const removeUnsubscribe = useCallback(
    (item: EventItem) => {
      if (blockDeleteWhileSending()) return;
      setDeleteConfirm({
        anchor: `unsubscribe-row-${item.id}`,
        message: listUi.confirmDeleteUnsubWithCrm(item.email),
        run: async () => {
          setDeletingUnsubscribeEventId(item.id);
          setErr(null);
          try {
            const deletedContactIds = await deleteComplianceEventWithCrm(item, "unsubscribe");
            if (deletedContactIds.length > 0) {
              evictContactsFromSendListsRef.current(deletedContactIds);
            }
            setUnsubscribeItems((prev) => prev.filter((x) => x.id !== item.id));
            setUnsubscribeTotal((t) => Math.max(0, t - 1));
            await refreshAfterContactDeleteRef.current(
              deletedContactIds.length > 0 ? { deletedContactIds } : undefined
            );
            if (deletedContactIds.length === 0) await loadUnsubscribes();
          } catch (e: unknown) {
            setErr(String((e as Error)?.message ?? e));
          } finally {
            setDeletingUnsubscribeEventId(null);
          }
        }
      });
    },
    [blockDeleteWhileSending, deleteComplianceEventWithCrm, loadUnsubscribes, listUi]
  );

  const exportSubscribesCsv = useCallback(async () => {
    if (campaignId == null) return;
    setExportingSubscribes(true);
    setErr(null);
    try {
      const token = getAccessToken();
      const url = resolveApiUrl(`/api/email/campaigns/${campaignId}/subscribes/export.csv`);
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `campaign-${campaignId}-subscribes.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setExportingSubscribes(false);
    }
  }, [campaignId]);

  const removeComplaint = useCallback(
    (item: EventItem) => {
      if (blockDeleteWhileSending()) return;
      setDeleteConfirm({
        anchor: `complaint-row-${item.id}`,
        message: listUi.confirmDeleteComplaintWithCrm(item.email),
        run: async () => {
          setDeletingComplaintEventId(item.id);
          setErr(null);
          try {
            const deletedContactIds = await deleteComplianceEventWithCrm(item, "complaint");
            if (deletedContactIds.length > 0) {
              evictContactsFromSendListsRef.current(deletedContactIds);
            }
            setComplaintItems((prev) => prev.filter((x) => x.id !== item.id));
            setComplaintTotal((t) => Math.max(0, t - 1));
            await refreshAfterContactDeleteRef.current(
              deletedContactIds.length > 0 ? { deletedContactIds } : undefined
            );
            if (deletedContactIds.length === 0) await loadComplaints();
          } catch (e: unknown) {
            setErr(String((e as Error)?.message ?? e));
          } finally {
            setDeletingComplaintEventId(null);
          }
        }
      });
    },
    [blockDeleteWhileSending, deleteComplianceEventWithCrm, loadComplaints, listUi]
  );

  const renderDeleteConfirm = (anchor: string, className?: string) => {
    if (!deleteConfirm || deleteConfirm.anchor !== anchor) return null;
    return (
      <InlineConfirmBar
        className={className}
        message={deleteConfirm.message}
        busy={deleteConfirmBusy}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          const run = deleteConfirm.run;
          setDeleteConfirm(null);
          void run();
        }}
      />
    );
  };

  const rows = apiData?.items ?? [];
  const total = apiData?.total ?? tabTotals?.all ?? 0;
  const totalPages = apiData?.totalPages ?? 1;

  const slicePaged = useCallback(
    (tab: SliceTabId, tabPage: number) => {
      const api = sliceByTab[tab];
      if (api) {
        return {
          slice: Array.isArray(api.items) ? api.items : [],
          page: Number(api.page ?? tabPage),
          totalPages: Math.max(1, Number(api.totalPages ?? 1)),
          total: Number(api.total ?? 0)
        };
      }
      const fallbackTotal = tabTotals?.[tab] ?? 0;
      return { slice: [] as SendContactRow[], page: tabPage, totalPages: 1, total: fallbackTotal };
    },
    [sliceByTab, tabTotals]
  );

  const openedPaged = useMemo(() => slicePaged("opened", openedPage), [slicePaged, openedPage]);
  const successPaged = useMemo(() => slicePaged("success", successPage), [slicePaged, successPage]);
  const unconfirmedPaged = useMemo(() => slicePaged("unconfirmed", unconfirmedPage), [slicePaged, unconfirmedPage]);
  const failedPaged = useMemo(() => slicePaged("failed", failedPage), [slicePaged, failedPage]);
  const openedRows = openedPaged.slice;
  const successRows = successPaged.slice;
  const unconfirmedRows = unconfirmedPaged.slice;
  const failedRows = failedPaged.slice;

  const isSliceTabLoading = useCallback(
    (tab: SliceTabId) => Boolean(sliceLoadingTab[tab]),
    [sliceLoadingTab]
  );

  const sliceTabEmptyMessage = useCallback(
    (tab: SliceTabId, label: string, paged: { slice: SendContactRow[]; total: number }) => {
      if (paged.slice.length > 0) return label;
      if (isSliceTabLoading(tab)) return listUi.detailLoading;
      if (sliceTabFetched[tab] && sliceByTab[tab] == null) {
        return listUi.detailFailed;
      }
      if (sliceTabFetched[tab] && paged.total === 0 && paged.slice.length === 0) return label;
      if (tabTotals?.[tab] == null && paged.total === 0) return listUi.detailLoading;
      if (paged.total === 0) return label;
      if (sliceTabFetched[tab]) return label;
      return listUi.detailLoading;
    },
    [isSliceTabLoading, sliceTabFetched, sliceByTab, tabTotals, listUi]
  );

  const sliceTabLoadingForPanel = useMemo(
    () => ({
      opened: isSliceTabLoading("opened"),
      success: isSliceTabLoading("success"),
      unconfirmed: isSliceTabLoading("unconfirmed"),
      failed: isSliceTabLoading("failed")
    }),
    [isSliceTabLoading]
  );

  const sliceTabEmptyMessageForPanel = useMemo(
    () => ({
      opened: sliceTabEmptyMessage("opened", listUi.emptyOpened, openedPaged),
      success: sliceTabEmptyMessage("success", listUi.emptySuccess, successPaged),
      unconfirmed: sliceTabEmptyMessage("unconfirmed", listUi.emptyUnconfirmed, unconfirmedPaged),
      failed: sliceTabEmptyMessage("failed", listUi.emptyFailed, failedPaged)
    }),
    [sliceTabEmptyMessage, openedPaged, successPaged, unconfirmedPaged, failedPaged, listUi]
  );

  const complianceTabLoadingForPanel = useMemo(
    () => ({
      subscribe: activeListTab === "subscribe" && Boolean(complianceLoadingTab.subscribe),
      unsubscribe: activeListTab === "unsubscribe" && Boolean(complianceLoadingTab.unsubscribe),
      complaint: activeListTab === "complaint" && Boolean(complianceLoadingTab.complaint)
    }),
    [activeListTab, complianceLoadingTab]
  );

  const allEmptyMessage = useMemo(() => {
    if (rows.length > 0) return listUi.emptyAll;
    const knownAll = tabTotals?.all;
    if (knownAll === 0 || total === 0) return listUi.emptyAll;
    if (loading) return listUi.detailLoading;
    if (allListFetched && apiData == null) {
      return listUi.emptyAllLoadFailed;
    }
    if (allListFetched) return listUi.emptyAll;
    return listUi.detailLoading;
  }, [rows.length, loading, total, allListFetched, apiData, tabTotals?.all, listUi]);

  const bulkDeleteFailedContacts = useCallback(
    async (contactIds: number[]) => {
      if (campaignId == null) return;
      if (blockDeleteWhileSending()) return;
      const selectedIds = Array.from(new Set(contactIds)).filter((id) => Number.isFinite(id) && id > 0);
      if (selectedIds.length === 0) return;
      if (selectedIds.length > 200) {
        setErr(listUi.bulkDeleteMax);
        return;
      }

      const DELETE_CONCURRENCY = 4;

      setDeleteConfirm({
        anchor: "failed-bulk",
        message: listUi.confirmDeleteSelected(selectedIds.length),
        run: async () => {
          setBulkDeleting(true);
          setErr(null);
          let deletedAcc = 0;
          try {
            for (let i = 0; i < selectedIds.length; i += DELETE_CONCURRENCY) {
              const chunk = selectedIds.slice(i, i + DELETE_CONCURRENCY);
              const done = Math.min(i + chunk.length, selectedIds.length);
              setBulkDeleteProgress(listUi.bulkDeleting(done, selectedIds.length));
              const results = await Promise.all(
                chunk.map((id) =>
                  timedStatsPerf(`delete-contact`, campaignId, () =>
                    apiJson<{ ok: boolean; deleted?: number }>(`/api/email/contacts/${id}`, {
                      method: "DELETE"
                    })
                  )
                )
              );
              for (const res of results) {
                if (!res.ok) throw new Error(listUi.deleteFailedMsg);
                deletedAcc += Number(res.deleted ?? 1);
              }
            }
            setSelectedFailedContactIds([]);
            evictContactsFromSendListsRef.current(selectedIds, { failed: selectedIds.length });
            await refreshAfterContactDeleteRef.current({
              deletedContactIds: selectedIds
            });
          } catch (e: unknown) {
            setErr(String((e as Error)?.message ?? e));
            setBulkDeleteProgress(null);
          } finally {
            setBulkDeleting(false);
            window.setTimeout(() => setBulkDeleteProgress(null), 4000);
          }
        }
      });
    },
    [blockDeleteWhileSending, campaignId, fromDate, toDate, fromEmail, listUi]
  );

  const failedPageIds = failedPaged.slice.map((r) => r.contactId);
  const allFailedSelected =
    failedPageIds.length > 0 && failedPageIds.every((id) => selectedFailedContactIds.includes(id));

  const toggleSelectFailed = (contactId: number, checked: boolean) => {
    setSelectedFailedContactIds((prev) => {
      if (checked) {
        if (prev.includes(contactId)) return prev;
        return [...prev, contactId];
      }
      return prev.filter((x) => x !== contactId);
    });
  };

  const toggleSelectAllFailed = (checked: boolean) => {
    if (checked) {
      setSelectedFailedContactIds((prev) => Array.from(new Set([...prev, ...failedPageIds])));
    } else {
      setSelectedFailedContactIds((prev) => prev.filter((id) => !failedPageIds.includes(id)));
    }
  };


  const tabCounts = useMemo((): Record<SendListTabId, number> => {
    const roundScoped = sendRunId != null && sendRunId > 0;
    const subscribeLoaded = complianceLoadingTab.subscribe === false;
    const unsubscribeLoaded = complianceLoadingTab.unsubscribe === false;
    const complaintLoaded = complianceLoadingTab.complaint === false;
    const totalsReady = tabTotals != null;
    return {
      opened: totalsReady
        ? tabTotals.opened
        : Math.max(openedPaged.total, openedCampaignCount),
      success: totalsReady ? tabTotals.success : successPaged.total,
      unconfirmed: totalsReady ? (tabTotals.unconfirmed ?? 0) : unconfirmedPaged.total,
      failed: totalsReady ? tabTotals.failed : failedPaged.total,
      subscribe: roundScoped
        ? Math.max(complianceTotals?.subscribe ?? 0, subscribeTotal)
        : subscribeLoaded
          ? subscribeTotal
          : Math.max(complianceTotals?.subscribe ?? 0, subscribeCampaignCount),
      unsubscribe: roundScoped
        ? Math.max(complianceTotals?.unsubscribe ?? 0, unsubscribeTotal)
        : unsubscribeLoaded
          ? unsubscribeTotal
          : Math.max(complianceTotals?.unsubscribe ?? 0, unsubscribeCampaignCount),
      complaint: roundScoped
        ? Math.max(complianceTotals?.complaint ?? 0, complaintTotal)
        : complaintLoaded
          ? complaintTotal
          : Math.max(complianceTotals?.complaint ?? 0, complaintCampaignCount),
      all: totalsReady ? tabTotals.all : total
    };
  }, [
    sendRunId,
    tabTotals,
    openedPaged.total,
    successPaged.total,
    unconfirmedPaged.total,
    failedPaged.total,
    subscribeCampaignCount,
    unsubscribeCampaignCount,
    openedCampaignCount,
    complaintCampaignCount,
    complianceTotals,
    complianceLoadingTab.subscribe,
    complianceLoadingTab.unsubscribe,
    complianceLoadingTab.complaint,
    subscribeTotal,
    unsubscribeTotal,
    complaintTotal,
    total
  ]);

  const deleteAllActiveTab = useCallback(() => {
    if (campaignId == null) return;
    if (blockDeleteWhileSending()) return;
    const tab = activeListTab;
    if (tab === "all" || tab === "success") return;
    const totalCount = tabCounts[tab] ?? 0;
    if (totalCount <= 0) return;

    setDeleteConfirm({
      anchor: `delete-all-${tab}`,
      message: listUi.deleteAllConfirm(totalCount),
      run: async () => {
        setDeleteAllBusy(true);
        setErr(null);
        let deletedAcc = 0;
        const cid = campaignId;
        const fromMail = fromEmail && fromEmail !== "all" ? fromEmail : undefined;
        try {
          if (tab === "opened" || tab === "unconfirmed" || tab === "failed") {
            const sliceTab = tab;
            const allRows = await fetchAllRowsForTab(sliceTab);
            const contactIds = Array.from(
              new Set(allRows.map((r) => r.contactId).filter((id) => id > 0))
            );
            for (let i = 0; i < contactIds.length; i += DELETE_ALL_BATCH) {
              const chunk = contactIds.slice(i, i + DELETE_ALL_BATCH);
              const done = Math.min(i + chunk.length, contactIds.length);
              setBulkDeleteProgress(listUi.deleteAllProgress(done, contactIds.length));
              const res = await apiJson<{ ok: boolean; deleted?: number }>(
                `/api/email/campaigns/${cid}/send-contacts/bulk-delete-contacts`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    tab: sliceTab,
                    contactIds: chunk,
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    fromEmail: fromMail
                  })
                }
              );
              if (!res.ok) throw new Error(listUi.deleteFailedMsg);
              deletedAcc += Number(res.deleted ?? chunk.length);
            }
            evictContactsFromSendListsRef.current(contactIds);
            await refreshAfterContactDeleteRef.current({ deletedContactIds: contactIds });
          } else if (tab === "subscribe") {
            const items = await fetchAllComplianceItems("subscribe");
            const deletedContactIds: number[] = [];
            for (let i = 0; i < items.length; i += DELETE_ALL_BATCH) {
              const chunk = items.slice(i, i + DELETE_ALL_BATCH);
              const done = Math.min(i + chunk.length, items.length);
              setBulkDeleteProgress(listUi.deleteAllProgress(done, items.length));
              for (const item of chunk) {
                const ids = await deleteComplianceEventWithCrm(item, "subscribe");
                deletedContactIds.push(...ids);
                deletedAcc += 1;
              }
            }
            const uniqIds = Array.from(new Set(deletedContactIds));
            if (uniqIds.length > 0) evictContactsFromSendListsRef.current(uniqIds);
            await refreshAfterContactDeleteRef.current(
              uniqIds.length > 0 ? { deletedContactIds: uniqIds } : undefined
            );
          } else if (tab === "unsubscribe") {
            const items = await fetchAllComplianceItems("unsubscribe");
            const deletedContactIds: number[] = [];
            for (let i = 0; i < items.length; i += DELETE_ALL_BATCH) {
              const chunk = items.slice(i, i + DELETE_ALL_BATCH);
              const done = Math.min(i + chunk.length, items.length);
              setBulkDeleteProgress(listUi.deleteAllProgress(done, items.length));
              for (const item of chunk) {
                const ids = await deleteComplianceEventWithCrm(item, "unsubscribe");
                deletedContactIds.push(...ids);
                deletedAcc += 1;
              }
            }
            const uniqIds = Array.from(new Set(deletedContactIds));
            if (uniqIds.length > 0) evictContactsFromSendListsRef.current(uniqIds);
            await refreshAfterContactDeleteRef.current(
              uniqIds.length > 0 ? { deletedContactIds: uniqIds } : undefined
            );
          } else if (tab === "complaint") {
            const items = await fetchAllComplianceItems("complaint");
            const deletedContactIds: number[] = [];
            for (let i = 0; i < items.length; i += DELETE_ALL_BATCH) {
              const chunk = items.slice(i, i + DELETE_ALL_BATCH);
              const done = Math.min(i + chunk.length, items.length);
              setBulkDeleteProgress(listUi.deleteAllProgress(done, items.length));
              for (const item of chunk) {
                const ids = await deleteComplianceEventWithCrm(item, "complaint");
                deletedContactIds.push(...ids);
                deletedAcc += 1;
              }
            }
            const uniqIds = Array.from(new Set(deletedContactIds));
            if (uniqIds.length > 0) evictContactsFromSendListsRef.current(uniqIds);
            await refreshAfterContactDeleteRef.current(
              uniqIds.length > 0 ? { deletedContactIds: uniqIds } : undefined
            );
          }
          setBulkDeleteProgress(listUi.bulkDeletedRefreshing(deletedAcc));
        } catch (e: unknown) {
          setErr(String((e as Error)?.message ?? e));
          setBulkDeleteProgress(null);
        } finally {
          setDeleteAllBusy(false);
          window.setTimeout(() => setBulkDeleteProgress(null), 6000);
        }
      }
    });
  }, [
    campaignId,
    blockDeleteWhileSending,
    activeListTab,
    tabCounts,
    listUi,
    fetchAllRowsForTab,
    fetchAllComplianceItems,
    fromDate,
    toDate,
    fromEmail,
    rows,
    loadSubscribes,
    loadUnsubscribes,
    loadComplaints,
    deleteComplianceEventWithCrm
  ]);

  const downloadCsvFromApi = useCallback(async (apiPath: string, filename: string) => {
    const token = getAccessToken();
    const r = await fetch(resolveApiUrl(apiPath), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const exportActiveTabCsv = useCallback(async () => {
    if (campaignId == null) return;
    setExportingTab(activeListTab);
    setErr(null);
    try {
      const cid = campaignId;
      switch (activeListTab) {
        case "opened": {
          const exportOpened = await fetchAllRowsForTab("opened");
          downloadCsvFile(
            `campaign-${cid}-opened.csv`,
            [...listUi.contactCsvHeaders.slice(0, 8), listUi.opensCsvHeader, ...listUi.contactCsvHeaders.slice(8)],
            exportOpened.map((r) => [
              ...contactToCsvRow(r).slice(0, 8),
              r.openCount,
              r.sendCount,
              r.bounceLikeCount
            ])
          );
          break;
        }
        case "success": {
          const exportSuccess = await fetchAllRowsForTab("success");
          downloadCsvFile(
            `campaign-${cid}-success.csv`,
            listUi.contactCsvHeaders,
            exportSuccess.map((r) => contactToCsvRow(r))
          );
          break;
        }
        case "unconfirmed": {
          const exportUnconfirmed = await fetchAllRowsForTab("unconfirmed");
          downloadCsvFile(
            `campaign-${cid}-delivered-no-feedback.csv`,
            listUi.contactCsvHeaders,
            exportUnconfirmed.map((r) => contactToCsvRow(r))
          );
          break;
        }
        case "failed": {
          const exportFailed = await fetchAllRowsForTab("failed");
          downloadCsvFile(
            `campaign-${cid}-failed.csv`,
            listUi.contactCsvHeaders,
            exportFailed.map((r) => contactToCsvRow(r))
          );
          break;
        }
        case "subscribe":
          await downloadCsvFromApi(
            `/api/email/campaigns/${cid}/subscribes/export.csv`,
            `campaign-${cid}-subscribes.csv`
          );
          break;
        case "unsubscribe":
          await downloadCsvFromApi(
            `/api/email/campaigns/${cid}/unsubscribes/export.csv`,
            `campaign-${cid}-unsubscribes.csv`
          );
          break;
        case "complaint":
          await downloadCsvFromApi(
            `/api/email/campaigns/${cid}/complaints/export.csv`,
            `campaign-${cid}-complaints.csv`
          );
          break;
        case "all": {
          const exportRows = await fetchAllRowsForTab("success").then(async (successPart) => {
            const failedPart = await fetchAllRowsForTab("failed");
            const map = new Map<number, SendContactRow>();
            for (const r of [...successPart, ...failedPart, ...rows]) {
              if (r.contactId > 0) map.set(r.contactId, r);
            }
            return [...map.values()];
          });
          downloadCsvFile(
            `campaign-${cid}-all-contacts.csv`,
            listUi.contactCsvHeaders,
            exportRows.map((r) => contactToCsvRow(r))
          );
          break;
        }
        default:
          break;
      }
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setExportingTab(null);
    }
  }, [
    activeListTab,
    campaignId,
    rows,
    fetchAllRowsForTab,
    downloadCsvFromApi,
    listUi
  ]);

  const removeOpenedContact = useCallback(
    (row: SendContactRow) => {
      confirmRemoveContact(row, `opened-row-${row.contactId}`);
    },
    [confirmRemoveContact]
  );

  const removeSuccessContact = useCallback(
    (row: SendContactRow) => {
      confirmRemoveContact(row, `success-row-${row.contactId}`);
    },
    [confirmRemoveContact]
  );

  /** 订阅/退订/投诉由后端分页，勿再对当前页数据做客户端 slice（否则第 2 页起会空白、看不到删除按钮） */
  const subscribePaged = useMemo(
    () => ({
      slice: subscribeItems,
      page: subscribePage,
      totalPages: subscribeTotalPages,
      total: subscribeTotal
    }),
    [subscribeItems, subscribePage, subscribeTotalPages, subscribeTotal]
  );
  const unsubscribePaged = useMemo(
    () => ({
      slice: unsubscribeItems,
      page: unsubscribePage,
      totalPages: unsubscribeTotalPages,
      total: unsubscribeTotal
    }),
    [unsubscribeItems, unsubscribePage, unsubscribeTotalPages, unsubscribeTotal]
  );

  if (campaignId == null) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{listUi.sendListTitle}</div>
        <p className="mt-3 text-sm text-slate-500">{listUi.selectCampaignHint}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        {listTransferPending ||
        ((loading || Object.values(sliceLoadingTab).some(Boolean)) &&
          !apiData &&
          activeListTab === "all") ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
            {listUi.listTransferPending}
          </p>
        ) : null}
        <div className="text-sm font-semibold text-slate-900">{listUi.sendListTitle}</div>
        <div className="mt-1 text-right text-[11px] text-slate-500">
          {listUi.lastUpdated}
          <span className="tabular-nums text-slate-700">{lastUpdatedAt || "—"}</span>
        </div>

        <div className="mt-4 space-y-3">
          <SendListTabBar active={activeListTab} counts={tabCounts} onChange={setActiveListTab} />
          <CampaignSendListActivePanel
            activeTab={activeListTab}
            sliceTabLoading={sliceTabLoadingForPanel}
            sliceTabEmptyMessage={sliceTabEmptyMessageForPanel}
            complianceTabLoading={complianceTabLoadingForPanel}
            allEmptyMessage={allEmptyMessage}
            summaryTruncated={false}
            sortByOpensDesc={sortByOpensDesc}
            onSortByOpensDesc={(v) => {
              setSortByOpensDesc(v);
              setPage(1);
            }}
            openedRows={openedRows}
            openedPaged={openedPaged}
            onOpenedPage={setOpenedPage}
            successRows={successRows}
            successPaged={successPaged}
            onSuccessPage={setSuccessPage}
            unconfirmedRows={unconfirmedRows}
            unconfirmedPaged={unconfirmedPaged}
            onUnconfirmedPage={setUnconfirmedPage}
            failedRows={failedRows}
            failedPaged={failedPaged}
            onFailedPage={setFailedPage}
            selectedFailedContactIds={selectedFailedContactIds}
            allFailedSelected={allFailedSelected}
            bulkDeleting={bulkDeleting}
            onToggleSelectAllFailed={toggleSelectAllFailed}
            onToggleSelectFailed={toggleSelectFailed}
            onRemoveFailedSelected={() => void bulkDeleteFailedContacts(selectedFailedContactIds)}
            subscribeTotal={subscribeTotal}
            subscribePaged={subscribePaged}
            onSubscribePage={setSubscribePage}
            unsubscribeTotal={unsubscribeTotal}
            unsubscribePaged={unsubscribePaged}
            onUnsubscribePage={setUnsubscribePage}
            complaintItems={complaintItems}
            complaintPage={complaintPage}
            complaintTotal={complaintTotal}
            complaintTotalPages={complaintTotalPages}
            onComplaintPage={setComplaintPage}
            allRows={rows}
            allPage={page}
            allTotal={total}
            allTotalPages={totalPages}
            allLoading={loading}
            hasAllData={apiData != null}
            onAllPage={setPage}
            exportingTab={exportingTab}
            activeTabForExport={activeListTab}
            onExportCsv={() => void exportActiveTabCsv()}
            exportDisabled={tabCounts[activeListTab] === 0}
            deleteLocked={deleteLocked}
            deleteAllBusy={deleteAllBusy}
            deleteAllDisabled={deleteLocked || deleteConfirmBusy || tabCounts[activeListTab] === 0}
            onDeleteAll={() => deleteAllActiveTab()}
            deleteConfirmBusy={deleteConfirmBusy}
            deletingContactId={deletingContactId}
            deletingSubscribeEventId={deletingSubscribeEventId}
            deletingUnsubscribeEventId={deletingUnsubscribeEventId}
            deletingComplaintEventId={deletingComplaintEventId}
            renderDeleteConfirm={renderDeleteConfirm}
            onRemoveOpened={(row) => void removeOpenedContact(row)}
            onRemoveSuccess={(row) => void removeSuccessContact(row)}
            onRemoveFailed={(row) => void removeContact(row)}
            onRemoveSubscribe={(item) => removeSubscribe(item)}
            onRemoveUnsubscribe={(item) => removeUnsubscribe(item)}
            onRemoveComplaint={(item) => removeComplaint(item)}
            onRemoveAllContact={(row) => void removeAllContact(row)}
          />
          {activeListTab !== "all" && activeListTab !== "success"
            ? renderDeleteConfirm(`delete-all-${activeListTab}`, "mt-2 max-w-lg")
            : null}
        </div>

        {bulkDeleteProgress ? (
          <p className="mt-2 text-sm font-medium text-amber-800">{bulkDeleteProgress}</p>
        ) : null}
        {err ? <p className="mt-2 text-xs text-amber-700">{err}</p> : null}
      </div>
    </div>
  );
}
