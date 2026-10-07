import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings } from "../../../i18n/emailCampaignStatsListI18n";
import { getEmailCampaignStatsPageStrings } from "../../../i18n/emailCampaignStatsPageI18n";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";
import { apiJson, apiJsonWithTimeout } from "../../../lib/api";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "../../../lib/emailMarketingSenderPicklist";
import {
  buildCampaignStatsSenderGroups,
  CAMPAIGN_STATS_CHANNEL_LABELS,
  CAMPAIGN_STATS_CHANNEL_ORDER,
  firstSenderEmailInChannel
} from "../../../lib/campaignStatsSenderChannels";
import type { EmailChannelKind } from "../../../lib/dedicatedEntitlements";
import { businessDaysAgoFromYmd, businessDaysAgoYmd, businessTodayYmd } from "../../../lib/businessCalendar";
import {
  readCachedTodaySummary,
  writeCachedTodaySummary,
  invalidateCachedTodaySummary
} from "../../../lib/campaignTodaySummaryCache";
import { getStatsPerfLog, pushStatsPerf, subscribeStatsPerf, timedStatsPerf } from "../../../lib/campaignStatsPerfLog";
import { standaloneOmitPackageChannelPicker } from "../../../lib/standaloneDeploy";

type TenantChannelFilter = EmailChannelKind | "all";

type TenantRangeSummary = TenantRangeSnapshot;

function emptyTenantRange(): TenantRangeSummary {
  return {
    totalSendAttempts: 0,
    deliveredCount: 0,
    openedCount: 0,
    subscribeCount: 0,
    unsubscribeCount: 0,
    complaintCount: 0,
    subscribeTodayCount: 0,
    subscribeTodayBySendingDomain: [],
    subscribeTodayDate: businessTodayYmd()
  };
}
import { CampaignSendRecipientsTable } from "./CampaignSendRecipientsTable";
import type { CampaignSuccessSeriesPoint } from "./CampaignSuccessLineChart";
import { CampaignSuccessLineChart } from "./CampaignSuccessLineChart";
import {
  fetchDedicatedLanes,
  filterCampaignStatsGroupsByEmails,
  findLaneByIndex,
  laneFromEmails,
  pickDefaultLaneIndex,
  type DedicatedLaneSnapshot
} from "../../../lib/dedicatedLanes";
import { DedicatedLaneSenderFilters } from "./DedicatedLaneSenderFilters";
import { MarketingSenderChannelPicker } from "./MarketingSenderChannelPicker";
import { CampaignSendRowsLiveTable } from "./CampaignSendRowsLiveTable";
import {
  isLikelyStaleEngagementCache,
  purgeCampaignStatsCache,
  purgeLegacyCampaignStatsCache,
  resolveCampaignStatsDisplay,
  writeCampaignStatsCache,
  type CampaignStatsSnapshot
} from "../../../lib/campaignActivityStatsCache";

const STATS_PANEL_FLAGS = {
  panel: "1",
  lite: "1",
  skipImap: "1",
  skipReconcile: "1"
} as const;

import {
  readLatestTenantRange,
  readTenantRangeCache,
  resolveTenantRangeDisplay,
  tenantRangeFromCache,
  tenantRangePresetTriples,
  writeCachedTenantRange,
  type TenantRangeSnapshot
} from "../../../lib/campaignStatsCache";

export type CampaignActivityRow = {
  id: number;
  campaign_code: string | null;
  name: string;
  status: string;
  template_name: string | null;
  template_id: number | null;
  latest_round_no?: number | null;
  /** 活动全量已尝试发送数（列表接口），用于判断「所选日期无数据」提示 */
  sent_count?: number;
  failed_count?: number;
  attempts_count?: number;
  has_sent?: boolean;
};

type StatsResponse = {
  ok: boolean;
  /** 后端 panel 响应带回，用于切换活动时校验未串数据 */
  campaignId?: number;
  range: { from: string; to: string };
  /** range=所选日期内；all_time_fallback=所选日期无发送，已展示本活动累计 */
  statsScope?: "range" | "all_time_fallback";
  campaignSendFirstYmd?: string | null;
  campaignSendLastYmd?: string | null;
  summary: {
    deliveredPct: number;
    openedPct: number;
    clickedPct: number;
    bouncedPct: number;
    unsubscribeCount: number;
    unsubscribePct: number;
    subscribeCount: number;
    subscribePct: number;
    complaintCount: number;
    openedCount: number;
    clickedCount: number;
    deliveredUnconfirmedCount?: number;
    delayedQueue: number;
    successCount: number;
    failCount: number;
    successRatePct: number;
    /** 所选日期内：订阅日与成功送达日为同一天的订阅数 */
    subscribeSameDayCount?: number;
    /** 浏览器本地「今天」、当前活动的订阅数 */
    subscribeTodayCount?: number;
    /** 今日订阅按发信邮箱归因 */
    subscribeTodayBySendingDomain?: Array<{ fromEmail: string; count: number }>;
    /** 今日订阅统计使用的日历日 YYYY-MM-DD（北京时间） */
    subscribeTodayDate?: string | null;
    /** 自邮件套餐开通日起至当前的订阅总数（租户维度） */
    subscribeTotalSincePackage?: number;
    subscribePackageStart?: string | null;
    subscribeBySendingDomain?: Array<{ fromEmail: string; count: number }>;
  };
  /** 小写发件邮箱，用于筛选与下拉 value；与邮件配置里 SMTP 的 from_email 对应 */
  senderEmails?: string[];
  /** 旧版接口：收件人邮箱域，已弃用 */
  domains?: string[];
  series: CampaignSuccessSeriesPoint[];
  /** 当前选中轮次的 7 栏指标（概览 summary 仍为全活动全轮次） */
  roundSummary?: StatsResponse["summary"];
  selectedSendRunId?: number;
  selectedRoundNo?: number;
};

type DedicatedServerListItem = {
  id?: number;
  fromEmail?: string | null;
  from_email?: string | null;
  subscriptionTierId?: string | null;
  subscription_tier_id?: string | null;
  smtpProfileId?: number | null;
  smtp_profile_id?: number | null;
};

function normFromEmail(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** 默认统计窗口：今天（业务日北京时间，与后端 tenant-range-stats / stats 一致） */
function defaultStatsRangeToday(): { from: string; to: string } {
  const t = businessTodayYmd();
  return { from: t, to: t };
}

const EMPTY_SUMMARY: StatsResponse["summary"] = {
  deliveredPct: 0,
  openedPct: 0,
  clickedPct: 0,
  bouncedPct: 0,
  unsubscribeCount: 0,
  unsubscribePct: 0,
  subscribeCount: 0,
  subscribePct: 0,
  complaintCount: 0,
  openedCount: 0,
  clickedCount: 0,
  deliveredUnconfirmedCount: 0,
  delayedQueue: 0,
  successCount: 0,
  failCount: 0,
  successRatePct: 0
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 防止接口偶发字符串/null，并与 EMPTY_SUMMARY 合并 */
function normalizeStatsResponse(raw: StatsResponse): StatsResponse {
  const sum = raw.summary;
  const base = { ...EMPTY_SUMMARY, ...(sum && typeof sum === "object" ? sum : {}) };
  return {
    ...raw,
    summary: {
      deliveredPct: num(base.deliveredPct),
      openedPct: num(base.openedPct),
      clickedPct: num(base.clickedPct),
      bouncedPct: num(base.bouncedPct),
      unsubscribeCount: num(base.unsubscribeCount),
      unsubscribePct: num(base.unsubscribePct),
      subscribeCount: num(base.subscribeCount),
      subscribePct: num(base.subscribePct),
      subscribeSameDayCount: num(base.subscribeSameDayCount),
      subscribeTodayCount: num(base.subscribeTodayCount),
      subscribeTodayBySendingDomain: Array.isArray(base.subscribeTodayBySendingDomain)
        ? base.subscribeTodayBySendingDomain.map((r) => ({
            fromEmail: String((r as { fromEmail?: unknown }).fromEmail ?? ""),
            count: num((r as { count?: unknown }).count)
          }))
        : [],
      subscribeTodayDate: base.subscribeTodayDate ?? null,
      subscribeTotalSincePackage: num(base.subscribeTotalSincePackage),
      subscribePackageStart: base.subscribePackageStart ?? null,
      subscribeBySendingDomain: Array.isArray(base.subscribeBySendingDomain)
        ? base.subscribeBySendingDomain.map((r) => ({
            fromEmail: String((r as { fromEmail?: unknown }).fromEmail ?? ""),
            count: num((r as { count?: unknown }).count)
          }))
        : [],
      complaintCount: num(base.complaintCount),
      openedCount: num(base.openedCount),
      clickedCount: num(base.clickedCount),
      deliveredUnconfirmedCount: num(base.deliveredUnconfirmedCount),
      delayedQueue: num(base.delayedQueue),
      successCount: num(base.successCount),
      failCount: num(base.failCount),
      successRatePct: num(base.successRatePct)
    },
    series: Array.isArray(raw.series) ? raw.series : []
  };
}

/** 活动列表已带的 sent/failed，用于 stats 接口返回前先展示数字与折线 */
function bootstrapStatsFromCampaignRow(campaign: CampaignActivityRow, cumulativeLabel = "累计"): StatsResponse {
  const success = num(campaign.sent_count);
  const fail = num(campaign.failed_count);
  const attempts = num(campaign.attempts_count);
  const failN = fail > 0 ? fail : Math.max(0, attempts - success);
  const total = Math.max(attempts, success + failN);
  const deliveredPct = total > 0 ? Math.round((100 * success) / total) : 0;
  const bouncedPct = total > 0 ? Math.round((100 * failN) / total) : 0;
  return normalizeStatsResponse({
    ok: true,
    range: { from: businessTodayYmd(), to: businessTodayYmd() },
    statsScope: "all_time_fallback",
    summary: {
      ...EMPTY_SUMMARY,
      successCount: success,
      failCount: failN,
      deliveredPct,
      bouncedPct,
      successRatePct: deliveredPct
    },
    series: total > 0 ? [{ label: cumulativeLabel, success, fail: failN }] : []
  });
}

type EngagementSticky = {
  campaignId: number;
  openedCount: number;
  subscribeCount: number;
  unsubscribeCount: number;
  complaintCount: number;
};

/** lite 轮询不应把已打开/订阅/退订冲回 0；投诉以 next 为准（可下降） */
function mergeEngagementCounts(
  next: StatsResponse,
  campaignId: number,
  sticky: EngagementSticky | null
): StatsResponse {
  const s = next.summary ?? EMPTY_SUMMARY;
  const st = sticky?.campaignId === campaignId ? sticky : null;
  const openedCount = Math.max(num(s.openedCount), st?.openedCount ?? 0);
  const subscribeCount = Math.max(num(s.subscribeCount), st?.subscribeCount ?? 0);
  const unsubscribeCount = Math.max(num(s.unsubscribeCount), st?.unsubscribeCount ?? 0);
  const complaintCount = num(s.complaintCount);
  const successCount = num(s.successCount);
  return {
    ...next,
    summary: {
      ...s,
      openedCount,
      openedPct:
        successCount > 0 ? Math.round((100 * openedCount) / successCount) : num(s.openedPct),
      subscribeCount,
      unsubscribeCount,
      complaintCount,
      subscribePct:
        successCount > 0 ? Math.round((100 * subscribeCount) / successCount) : num(s.subscribePct),
      unsubscribePct:
        successCount > 0 ? Math.round((100 * unsubscribeCount) / successCount) : num(s.unsubscribePct)
    }
  };
}

function recordEngagementSticky(campaignId: number, summary: StatsResponse["summary"]) {
  const openedCount = num(summary?.openedCount);
  const subscribeCount = num(summary?.subscribeCount);
  const unsubscribeCount = num(summary?.unsubscribeCount);
  const complaintCount = num(summary?.complaintCount);
  if (subscribeCount > 0 || unsubscribeCount > 0 || complaintCount > 0 || openedCount > 0) {
    return {
      campaignId,
      openedCount,
      subscribeCount,
      unsubscribeCount,
      complaintCount
    };
  }
  return null;
}

/** 发送名单 tab 计数与 compliance 接口口径与 7 栏一致，用于补齐 stats 面板缓存/轻量请求滞后 */
export type CampaignListMetricsSnapshot = {
  opened: number;
  success: number;
  unconfirmed?: number;
  failed: number;
  /** 本活动触达联系人总数（去重），用于 总发信 = 已送达 + 失败 */
  all?: number;
  /** 名单「退回/失败」tab（去重联系人） */
  campaignFailCount?: number;
  /** 7 栏「失败 X 封」（SMTP failed + postfix_deferred） */
  summaryFailCount?: number;
  subscribe: number;
  unsubscribe: number;
  complaint: number;
  /** 为 true 时投诉数可下降（来自 compliance-counts 权威值） */
  complaintAuthoritative?: boolean;
};

/** replace=true：权威 tab-totals / 删联系人后，勿 Math.max 托底（否则 7 栏无法下降） */
export type CampaignListMetricsPublishOptions = { replace?: boolean };

type TabTotalsShape = { opened: number; success: number; failed: number; unconfirmed?: number; all?: number };

type TodayCampaignActivitiesSummary = {
  activityCount: number;
  totalAttempts: number;
  totalSuccess: number;
  totalSubscribe: number;
  activities: Array<{
    id: number;
    campaign_code: string | null;
    name: string;
    totalAttempts: number;
    successCount: number;
    subscribeCount: number;
  }>;
  successSeries?: CampaignSuccessSeriesPoint[];
};

const STATS_FETCH_TIMEOUT_MS = 45_000;
const TODAY_SUMMARY_TIMEOUT_MS = 30_000;

const EMPTY_TODAY_SUMMARY: TodayCampaignActivitiesSummary = {
  activityCount: 0,
  totalAttempts: 0,
  totalSuccess: 0,
  totalSubscribe: 0,
  activities: [],
  successSeries: []
};

function campaignListTabTotalsQuery(fromEmailFilter: string, opts?: { refresh?: boolean }) {
  const q = new URLSearchParams({
    page: "1",
    pageSize: "1",
    sort: "default",
    from: "",
    to: "",
    skipImap: "1",
    fast: "1",
    statsPanel: "1"
  });
  const fe = fromEmailFilter.trim().toLowerCase();
  if (fe) q.set("fromEmail", fe);
  if (opts?.refresh) q.set("refresh", "1");
  return q;
}

function applyListMetricsToStatsResponse(
  prev: StatsResponse,
  metrics: CampaignListMetricsSnapshot
): StatsResponse {
  return {
    ...prev,
    summary: mergeListMetricsIntoSummary(prev.summary ?? EMPTY_SUMMARY, metrics)
  };
}

function mergeListMetricsIntoSummary(
  base: StatsResponse["summary"],
  metrics: CampaignListMetricsSnapshot | null
): StatsResponse["summary"] {
  if (!metrics) return base;
  /** 失败：以 tab-totals 去重联系人为准；勿用 /stats 按发送次数累加的 failCount 覆盖 */
  const failCount = Math.max(
    num(metrics.summaryFailCount),
    num(metrics.campaignFailCount),
    metrics.failed
  );
  const listAll = Math.max(num(metrics.all ?? 0), metrics.success + failCount);
  /** 总发信 = 已送达 + 失败；有 tab-totals 时以名单口径为准，勿被 /stats 按行累加盖回 */
  let successCount: number;
  let totalAttempts: number;
  if (listAll > 0 || failCount > 0) {
    totalAttempts = listAll > 0 ? listAll : metrics.success + failCount;
    successCount = Math.max(0, totalAttempts - failCount);
  } else {
    totalAttempts = num(base.successCount) + num(base.failCount);
    successCount = Math.max(num(base.successCount), metrics.success);
  }
  const openedCount = Math.max(num(base.openedCount), metrics.opened);
  const subscribeCount = Math.max(num(base.subscribeCount), metrics.subscribe);
  const unsubscribeCount = Math.max(num(base.unsubscribeCount), metrics.unsubscribe);
  /**
   * 投诉允许用名单/compliance 口径下降（清理假投诉后 47→0）。
   * 订阅/退订仍 Math.max，避免名单 tab 未带合规计数时用默认 0 把 7 栏冲掉。
   */
  const complaintCount =
    metrics.complaintAuthoritative === true
      ? num(metrics.complaint)
      : Math.max(num(base.complaintCount), metrics.complaint);
  const deliveredUnconfirmedCount = Math.max(
    0,
    num(metrics.unconfirmed ?? base.deliveredUnconfirmedCount)
  );
  const attempts = totalAttempts > 0 ? totalAttempts : successCount + failCount;
  return {
    ...base,
    successCount,
    failCount,
    openedCount,
    subscribeCount,
    unsubscribeCount,
    complaintCount,
    deliveredUnconfirmedCount,
    deliveredPct: attempts > 0 ? Math.round((100 * successCount) / attempts) : num(base.deliveredPct),
    openedPct: successCount > 0 ? Math.round((100 * openedCount) / successCount) : num(base.openedPct),
    subscribePct:
      successCount > 0 ? Math.round((100 * subscribeCount) / successCount) : num(base.subscribePct),
    unsubscribePct:
      successCount > 0 ? Math.round((100 * unsubscribeCount) / successCount) : num(base.unsubscribePct),
    bouncedPct: attempts > 0 ? Math.round((100 * failCount) / attempts) : num(base.bouncedPct)
  };
}

function ensureChartSeries(res: StatsResponse, cumulativeLabel = "累计"): StatsResponse {
  if (res.series && res.series.length > 0) return res;
  const success = num(res.summary?.successCount);
  const fail = num(res.summary?.failCount);
  if (success + fail > 0) {
    return {
      ...res,
      series: [{ label: cumulativeLabel, success, fail }]
    };
  }
  return res;
}

/** 与后端 stats 接口空数据时的横轴一致：单日 8 个 3 小时桶，多日按天最多 31 点 */
function buildEmptySeries(fromY: string, toY: string): { label: string; success: number; fail: number }[] {
  let a = fromY;
  let b = toY;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const labelsDay = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
  if (a === b) {
    return labelsDay.map((label) => ({ label, success: 0, fail: 0 }));
  }
  const tFrom = new Date(a + "T12:00:00").getTime();
  const tTo = new Date(b + "T12:00:00").getTime();
  const daySpan = Math.floor((tTo - tFrom) / 86400000) + 1;
  const cappedEnd = Math.min(daySpan, 31);
  const series: { label: string; success: number; fail: number }[] = [];
  const cursor = new Date(a + "T12:00:00");
  for (let i = 0; i < cappedEnd; i++) {
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    series.push({ label: `${mm}-${dd}`, success: 0, fail: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

export function CampaignActivityStats(props: {
  campaign: CampaignActivityRow | null;
  refreshSignal?: number;
  /** 与右侧活动 ID 联动：当前选中的发信邮箱（小写） */
  filterFromEmail?: string;
  onFilterFromEmailChange?: (fromEmail: string) => void;
  filterChannel?: EmailChannelKind;
  onFilterChannelChange?: (channel: EmailChannelKind) => void;
  filterLaneIndex?: number | "";
  onFilterLaneIndexChange?: (laneIndex: number | "") => void;
  /** 右侧栏已放专线/通道/域名筛选时，左侧不再重复 */
  hideSenderFilters?: boolean;
  /** 仅刷新租户日期汇总与套餐订阅，不触发当前活动 stats 全量重载 */
  tenantRefreshSignal?: number;
  /** 用户点「刷新」时递增，后台更新当前活动统计（保留已展示数字） */
  campaignRefreshSignal?: number;
  /** 父页已拉取发信通道数据时传入，避免重复请求 smtp/dedicated/ses/lanes */
  externalSenderBootstrap?: {
    smtp: MarketingSmtpRow[];
    dedicated: Array<{
      fromEmail?: string | null;
      from_email?: string | null;
      subscriptionTierId?: string | null;
      subscription_tier_id?: string | null;
    }>;
    ses: MarketingSesAddressRow[];
    lanes: DedicatedLaneSnapshot[];
  };
  /** 独立站：右侧栏「诊断与修复」调用本页刷新逻辑 */
  selfHealRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  const { locale } = useSiteLocale();
  const statsUi = useMemo(() => getEmailCampaignStatsPageStrings(locale), [locale]);
  const {
    campaign,
    refreshSignal = 0,
    tenantRefreshSignal,
    campaignRefreshSignal = 0,
    hideSenderFilters = false,
    filterFromEmail,
    onFilterFromEmailChange,
    filterChannel,
    onFilterChannelChange,
    filterLaneIndex: filterLaneIndexProp,
    onFilterLaneIndexChange,
    externalSenderBootstrap,
    selfHealRefreshRef
  } = props;
  const tenantStatsRefresh = tenantRefreshSignal ?? refreshSignal;
  const campaignId = campaign?.id ?? null;
  const [fromEmailInternal, setFromEmailInternal] = useState("");
  const [channelInternal, setChannelInternal] = useState<EmailChannelKind>("light");
  const fromEmail = filterFromEmail ?? fromEmailInternal;
  const setFromEmail = onFilterFromEmailChange ?? setFromEmailInternal;
  /** 统计页右侧已选发信域时，左侧 7 栏/名单/今日概览按「当前活动」全量统计，勿再按侧边栏域名过滤（否则会全 0） */
  const activityStatsFromEmail = hideSenderFilters ? "" : fromEmail;
  const senderChannel = filterChannel ?? channelInternal;
  const setSenderChannel = onFilterChannelChange ?? setChannelInternal;
  /** 上方「日期范围统计」专用：默认今天，不受下方活动切换影响 */
  const initialTenantRange = defaultStatsRangeToday();
  /** 已生效的日期（驱动接口与 6 项展示）；自定义日期仅在点「确定」后写入 */
  const [tenantFromDate, setTenantFromDate] = useState(initialTenantRange.from);
  const [tenantToDate, setTenantToDate] = useState(initialTenantRange.to);
  const [tenantDateDraftFrom, setTenantDateDraftFrom] = useState(initialTenantRange.from);
  const [tenantDateDraftTo, setTenantDateDraftTo] = useState(initialTenantRange.to);
  const [tenantCustomRangeLoading, setTenantCustomRangeLoading] = useState(false);
  const [listMetrics, setListMetrics] = useState<CampaignListMetricsSnapshot | null>(null);
  const listMetricsRef = useRef<CampaignListMetricsSnapshot | null>(null);
  listMetricsRef.current = listMetrics;
  const [sendListGateOpen, setSendListGateOpen] = useState(false);
  const [sendListTabTotals, setSendListTabTotals] = useState<{
    all: number;
    opened: number;
    success: number;
    unconfirmed?: number;
    failed: number;
  } | null>(null);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [smtpItems, setSmtpItems] = useState<MarketingSmtpRow[]>([]);
  const [dedicatedServers, setDedicatedServers] = useState<DedicatedServerListItem[]>([]);
  const [sesAddresses, setSesAddresses] = useState<MarketingSesAddressRow[]>([]);
  const [dedicatedLanes, setDedicatedLanes] = useState<DedicatedLaneSnapshot[]>([]);
  const [laneIndexInternal, setLaneIndexInternal] = useState<number | "">("");
  const selectedLaneIndex = filterLaneIndexProp ?? laneIndexInternal;
  const setSelectedLaneIndex = onFilterLaneIndexChange ?? setLaneIndexInternal;
  /** 递增后触发下方「邮件发送列表」重新请求 */
  const [sendListPullKey, setSendListPullKey] = useState(0);
  /** 递增以丢弃过期的 stats 请求结果（快速换活动、改日期时避免旧请求覆盖新数据或错误地把 loading 关掉） */
  const loadGenRef = useRef(0);
  /** 7 栏轻量指标专用世代；不与 runCampaignStatsLoad 共用，避免 poll 把并行结果作废 */
  const fastMetricsGenRef = useRef(0);
  /** 当前活动已成功拉取过一次统计后，定时刷新不再 setLoading(true)，避免卡片与图表节律闪烁 */
  const hasStatsSnapshotRef = useRef(false);
  /** 仅保留当前活动 ID 的上次成功响应，禁止串到其它活动 */
  const lastGoodStatsRef = useRef<{ campaignId: number; data: StatsResponse } | null>(null);
  const [campaignStatsStale, setCampaignStatsStale] = useState(false);
  const [campaignStatsRefreshing, setCampaignStatsRefreshing] = useState(false);
  const engagementStickyByCampaignRef = useRef<Map<number, EngagementSticky>>(new Map());
  const campaignIdRef = useRef<number | null>(campaignId);
  campaignIdRef.current = campaignId;
  const [todaySummary, setTodaySummary] = useState<TodayCampaignActivitiesSummary | null>(() => {
    const cached = readCachedTodaySummary(businessTodayYmd());
    return cached ?? null;
  });
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(() => readCachedTodaySummary(businessTodayYmd()) == null);
  const todaySummaryRef = useRef(todaySummary);
  todaySummaryRef.current = todaySummary;
  const todaySummaryFetchGenRef = useRef(0);
  const [serverBusinessTodayYmd, setServerBusinessTodayYmd] = useState<string | null>(null);
  const statsTodayYmd = serverBusinessTodayYmd ?? businessTodayYmd();
  /** 跨自然日（北京时间）时清空「今日概览」，避免仍展示昨日场次 */
  const todayOverviewDayRef = useRef(businessTodayYmd());

  const mergeListMetricsSticky = useCallback(
    (next: CampaignListMetricsSnapshot, prev: CampaignListMetricsSnapshot | null): CampaignListMetricsSnapshot => {
      if (!prev) return next;
      const failN = Math.max(
        next.failed,
        next.campaignFailCount ?? 0,
        next.summaryFailCount ?? 0,
        prev.failed,
        prev.campaignFailCount ?? 0,
        prev.summaryFailCount ?? 0
      );
      const successN = Math.max(next.success, prev.success);
      const unconfirmedN = Math.max(num(next.unconfirmed ?? 0), num(prev.unconfirmed ?? 0));
      const allN = Math.max(num(next.all ?? 0), num(prev.all ?? 0), successN + failN);
      return {
        ...next,
        opened: Math.max(next.opened, prev.opened),
        success: successN,
        unconfirmed: unconfirmedN,
        all: allN > 0 ? allN : next.all ?? prev.all,
        subscribe: Math.max(next.subscribe, prev.subscribe),
        unsubscribe: Math.max(next.unsubscribe, prev.unsubscribe),
        complaint: Math.max(next.complaint, prev.complaint),
        failed: failN,
        campaignFailCount: failN,
        summaryFailCount: failN
      };
    },
    []
  );

  const onListMetricsChange = useCallback(
    (metrics: CampaignListMetricsSnapshot, opts?: CampaignListMetricsPublishOptions) => {
      const sending = String(campaignRef.current?.status ?? "").toLowerCase() === "sending";
      if (opts?.replace && !sending) {
        setListMetrics(metrics);
        return;
      }
      setListMetrics((prev) => mergeListMetricsSticky(metrics, prev));
    },
    [mergeListMetricsSticky]
  );

  /** 日期范围统计专用筛选（默认全部 = 本租户套餐今日汇总） */
  const [tenantFilterLane, setTenantFilterLane] = useState<number | "">("");
  const [tenantFilterChannel, setTenantFilterChannel] = useState<TenantChannelFilter>("all");
  const [tenantFilterFromEmail, setTenantFilterFromEmail] = useState("");

  const [tenantRange, setTenantRange] = useState<TenantRangeSummary | null>(() => {
    const latest = readLatestTenantRange();
    return latest ? tenantRangeFromCache(latest) : null;
  });
  const tenantRangeGenRef = useRef(0);
  const [tenantRangeRefreshing, setTenantRangeRefreshing] = useState(false);
  const [tenantRangeStaleScope, setTenantRangeStaleScope] = useState(false);
  const lastShownTenantRangeRef = useRef<TenantRangeSummary | null>(
    (() => {
      const latest = readLatestTenantRange();
      return latest ? tenantRangeFromCache(latest) : null;
    })()
  );

  const applyTenantRangeDisplay = useCallback(
    (from: string, to: string, scopeKey: string) => {
      const resolved = resolveTenantRangeDisplay(from, to, scopeKey, lastShownTenantRangeRef.current);
      if (resolved) {
        setTenantRange(resolved.snapshot);
        lastShownTenantRangeRef.current = resolved.snapshot;
        setTenantRangeStaleScope(!resolved.exact);
      }
      return resolved?.exact ?? false;
    },
    []
  );

  const allSenderGroups = useMemo(
    () => buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses),
    [smtpItems, dedicatedServers, sesAddresses]
  );

  const tenantFilterEmailOptions = useMemo(() => {
    let emails: string[] = [];
    const chOrder =
      tenantFilterChannel === "all" ? CAMPAIGN_STATS_CHANNEL_ORDER : [tenantFilterChannel];
    for (const ch of chOrder) {
      emails.push(...(allSenderGroups[ch] ?? []));
    }
    if (tenantFilterLane !== "") {
      const lane = findLaneByIndex(dedicatedLanes, tenantFilterLane);
      const allowed = new Set(laneFromEmails(lane));
      emails = emails.filter((e) => allowed.has(e));
    }
    return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
  }, [allSenderGroups, tenantFilterLane, tenantFilterChannel, dedicatedLanes]);

  const tenantFilterActive =
    tenantFilterLane !== "" || tenantFilterChannel !== "all" || tenantFilterFromEmail.trim() !== "";

  const tenantScopeEmails = useMemo(() => {
    if (tenantFilterFromEmail.trim()) {
      return [tenantFilterFromEmail.trim().toLowerCase()];
    }
    if (!tenantFilterActive) return [];
    return tenantFilterEmailOptions;
  }, [tenantFilterActive, tenantFilterFromEmail, tenantFilterEmailOptions]);

  const tenantScopeKey = `${tenantFilterLane}|${tenantFilterChannel}|${tenantFilterFromEmail.trim().toLowerCase() || "__all__"}`;

  const fetchTenantRangeBackground = useCallback(async (opts?: { refresh?: boolean }) => {
    if (tenantFilterActive && tenantScopeEmails.length === 0) {
      const empty = emptyTenantRange();
      setTenantRange(empty);
      lastShownTenantRangeRef.current = empty;
      setTenantRangeStaleScope(false);
      setTenantRangeRefreshing(false);
      setTenantCustomRangeLoading(false);
      return;
    }

    const myGen = ++tenantRangeGenRef.current;
    setTenantRangeRefreshing(true);
    try {
      const q = new URLSearchParams({ from: tenantFromDate, to: tenantToDate, lite: "1" });
      if (opts?.refresh) q.set("refresh", "1");
      if (tenantScopeEmails.length === 1) {
        q.set("fromEmail", tenantScopeEmails[0]!);
      } else if (tenantScopeEmails.length > 1) {
        q.set("fromEmails", tenantScopeEmails.join(","));
      }
      const r = await apiJson<{ ok: boolean; summary?: TenantRangeSummary }>(
        `/api/email/marketing/tenant-range-stats?${q.toString()}`
      );
      if (myGen !== tenantRangeGenRef.current) return;
      const summary = r.summary ?? null;
      if (summary) {
        setTenantRange(summary);
        lastShownTenantRangeRef.current = summary;
        setTenantRangeStaleScope(false);
        writeCachedTenantRange(tenantFromDate, tenantToDate, tenantScopeKey, summary);
      }
    } catch {
      if (myGen !== tenantRangeGenRef.current) return;
    } finally {
      if (myGen === tenantRangeGenRef.current) {
        setTenantRangeRefreshing(false);
        setTenantCustomRangeLoading(false);
      }
    }
  }, [tenantFromDate, tenantToDate, tenantScopeKey, tenantFilterActive, tenantScopeEmails]);

  const prefetchTenantRangePresets = useCallback(
    (scopeKey: string, emails: string[]) => {
      if (tenantFilterActive && emails.length === 0) return;
      for (const p of tenantRangePresetTriples(serverBusinessTodayYmd)) {
        if (readTenantRangeCache(p.from, p.to, scopeKey)) continue;
        void (async () => {
          const q = new URLSearchParams({ from: p.from, to: p.to, lite: "1" });
          if (emails.length === 1) q.set("fromEmail", emails[0]!);
          else if (emails.length > 1) q.set("fromEmails", emails.join(","));
          try {
            const r = await apiJson<{ ok: boolean; summary?: TenantRangeSummary }>(
              `/api/email/marketing/tenant-range-stats?${q.toString()}`
            );
            if (r.summary) writeCachedTenantRange(p.from, p.to, scopeKey, r.summary);
          } catch {
            /* 预取失败不打扰主流程 */
          }
        })();
      }
    },
    [tenantFilterActive, serverBusinessTodayYmd]
  );

  useEffect(() => {
    applyTenantRangeDisplay(tenantFromDate, tenantToDate, tenantScopeKey);
    void fetchTenantRangeBackground({ refresh: tenantStatsRefresh > 0 });
  }, [
    tenantFromDate,
    tenantToDate,
    tenantScopeKey,
    tenantStatsRefresh,
    applyTenantRangeDisplay,
    fetchTenantRangeBackground
  ]);

  useEffect(() => {
    prefetchTenantRangePresets(tenantScopeKey, tenantScopeEmails);
  }, [tenantScopeKey, tenantScopeEmails, prefetchTenantRangePresets]);

  useEffect(() => {
    const boot = externalSenderBootstrap;
    if (boot) {
      setSmtpItems(boot.smtp);
      setDedicatedServers(boot.dedicated as DedicatedServerListItem[]);
      setSesAddresses(boot.ses);
      setDedicatedLanes(boot.lanes);
      if (filterLaneIndexProp === undefined && selectedLaneIndex === "" && boot.lanes.length > 0) {
        const def = pickDefaultLaneIndex(boot.lanes);
        if (def !== "") setLaneIndexInternal(def);
      }
      return;
    }
    void Promise.all([
      apiJson<{ ok: boolean; items: MarketingSmtpRow[] }>("/api/email/smtp"),
      apiJson<{ ok: boolean; items: DedicatedServerListItem[] }>("/api/email/dedicated-servers").catch(() => ({
        ok: true,
        items: [] as DedicatedServerListItem[]
      })),
      apiJson<{ ok: boolean; items: MarketingSesAddressRow[] }>("/api/email/ses/sender-addresses").catch(() => ({
        ok: true,
        items: [] as MarketingSesAddressRow[]
      })),
      fetchDedicatedLanes().catch(() => ({ ok: false as const, lanes: [] as DedicatedLaneSnapshot[] }))
    ])
      .then(([smtp, ded, ses, lanesRes]) => {
        setSmtpItems(Array.isArray(smtp.items) ? smtp.items : []);
        setDedicatedServers(Array.isArray(ded.items) ? ded.items : []);
        setSesAddresses(Array.isArray(ses.items) ? ses.items : []);
        const lanes = Array.isArray(lanesRes.lanes) ? lanesRes.lanes : [];
        setDedicatedLanes(lanes);
        if (filterLaneIndexProp === undefined && selectedLaneIndex === "" && lanes.length > 0) {
          const def = pickDefaultLaneIndex(lanes);
          if (def !== "") setLaneIndexInternal(def);
        }
      })
      .catch(() => {
        setSmtpItems([]);
        setDedicatedServers([]);
        setSesAddresses([]);
        setDedicatedLanes([]);
      });
  }, [externalSenderBootstrap, filterLaneIndexProp, selectedLaneIndex]);

  const selectedLane = useMemo(
    () => findLaneByIndex(dedicatedLanes, selectedLaneIndex),
    [dedicatedLanes, selectedLaneIndex]
  );
  const laneAllowedEmails = useMemo(() => laneFromEmails(selectedLane), [selectedLane]);

  const statsSenderGroups = useMemo(() => {
    const base = buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses);
    if (dedicatedLanes.length > 0 && selectedLaneIndex !== "" && laneAllowedEmails.length > 0) {
      return filterCampaignStatsGroupsByEmails(base, laneAllowedEmails);
    }
    return base;
  }, [smtpItems, dedicatedServers, sesAddresses, dedicatedLanes.length, selectedLaneIndex, laneAllowedEmails]);

  useEffect(() => {
    if (hideSenderFilters) return;
    const emails = statsSenderGroups[senderChannel] ?? [];
    if (fromEmail && emails.includes(fromEmail)) return;
    const next = firstSenderEmailInChannel(statsSenderGroups, senderChannel);
    if (next === fromEmail) return;
    setFromEmail(next);
  }, [hideSenderFilters, senderChannel, statsSenderGroups, fromEmail, setFromEmail]);

  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;

  useEffect(() => {
    purgeLegacyCampaignStatsCache();
  }, []);

  const applyCampaignStatsDisplay = useCallback((id: number) => {
    const lastOnScreen =
      lastGoodStatsRef.current?.campaignId === id
        ? ({
            campaignId: id,
            snapshot: lastGoodStatsRef.current.data as unknown as CampaignStatsSnapshot
          } as const)
        : null;
    const resolved = resolveCampaignStatsDisplay(id, lastOnScreen);
    if (resolved) {
      const snap = resolved.snapshot as unknown as StatsResponse;
      if (isLikelyStaleEngagementCache(resolved.snapshot)) {
        purgeCampaignStatsCache(id);
        setData(null);
        hasStatsSnapshotRef.current = false;
        return false;
      }
      const normalized = normalizeStatsResponse(snap);
      setData(normalized);
      lastGoodStatsRef.current = { campaignId: id, data: normalized };
      hasStatsSnapshotRef.current = true;
      setCampaignStatsStale(!resolved.exact);
      return resolved.exact;
    }
    setData(null);
    setCampaignStatsStale(false);
    hasStatsSnapshotRef.current = false;
    return false;
  }, []);

  type StatsLoadMode = "initial" | "poll" | "full";

  const statsQueryBase = useCallback(() => {
    return new URLSearchParams({
      from: statsTodayYmd,
      to: statsTodayYmd,
      allTime: "1"
    });
  }, [statsTodayYmd]);

  const fetchStats = useCallback(
    (extra: Record<string, string>) => {
      const q = statsQueryBase();
      for (const [k, v] of Object.entries(extra)) q.set(k, v);
      const fe = String(activityStatsFromEmail ?? "").trim().toLowerCase();
      if (fe) q.set("fromEmail", fe);
      const url = `/api/email/campaigns/${campaignId}/stats?${q.toString()}`;
      return timedStatsPerf("stats-panel", campaignId ?? null, () => apiJson<StatsResponse>(url));
    },
    [campaignId, statsQueryBase, activityStatsFromEmail]
  );

  /** 切换活动后优先并行轻量接口，几秒内先填满 7 栏，完整 stats 后台再对账 */
  const applyFastMetricsPayload = useCallback(
    (
      id: number,
      myGen: number,
      payload: {
        totalsRes: {
          totals?: TabTotalsShape;
          campaignFailCount?: number;
          summaryFailCount?: number;
        };
        compRes: {
          ok?: boolean;
          counts?: { subscribe: number; unsubscribe: number; complaint: number };
        };
        engSummary?: StatsResponse["summary"];
      }
    ) => {
      if (myGen !== fastMetricsGenRef.current || id !== campaignIdRef.current) return;
      const st = String(campaignRef.current?.status ?? "").toLowerCase();
      const terminal = st === "completed" || st === "stopped" || st === "paused";
      /** 发送中保留 engagement sticky，避免 lite 轮询把已打开/订阅冲低导致 7 栏闪 */
      if (terminal) {
        engagementStickyByCampaignRef.current.delete(id);
      }
      const complianceOk = payload.compRes.ok !== false;
      const failForBar = Math.max(
        Number(payload.totalsRes.summaryFailCount ?? 0),
        Number(payload.totalsRes.campaignFailCount ?? 0),
        Number(payload.totalsRes.totals?.failed ?? 0)
      );
      const eng = payload.engSummary;
      const metrics: CampaignListMetricsSnapshot | null = payload.totalsRes.totals
        ? {
            opened: Math.max(Number(payload.totalsRes.totals.opened ?? 0), Number(eng?.openedCount ?? 0)),
            success: Number(payload.totalsRes.totals.success ?? 0),
            unconfirmed: Number(payload.totalsRes.totals.unconfirmed ?? 0),
            all: Number(payload.totalsRes.totals.all ?? 0),
            failed: failForBar,
            campaignFailCount: failForBar,
            summaryFailCount: failForBar,
            subscribe: Math.max(
              Number(payload.compRes.counts?.subscribe ?? 0),
              Number(eng?.subscribeCount ?? 0)
            ),
            unsubscribe: Math.max(
              Number(payload.compRes.counts?.unsubscribe ?? 0),
              Number(eng?.unsubscribeCount ?? 0)
            ),
            complaint: Math.max(
              Number(payload.compRes.counts?.complaint ?? 0),
              Number(eng?.complaintCount ?? 0)
            )
          }
        : null;

      /**
       * success/failed/opened 发送中仍 sticky 防闪。
       * 仅投诉在 compliance-counts 成功时允许下降；订阅/退订保持 sticky Math.max，避免被默认 0 冲掉。
       */
      const stickyMerged = metrics ? mergeListMetricsSticky(metrics, listMetricsRef.current) : null;
      const mergedMetrics =
        stickyMerged && metrics
          ? complianceOk
            ? {
                ...stickyMerged,
                subscribe: Math.max(stickyMerged.subscribe, metrics.subscribe),
                unsubscribe: Math.max(stickyMerged.unsubscribe, metrics.unsubscribe),
                complaint: metrics.complaint,
                complaintAuthoritative: true
              }
            : stickyMerged
          : stickyMerged;
      if (mergedMetrics) {
        listMetricsRef.current = mergedMetrics;
        setListMetrics(mergedMetrics);
      }
      if (complianceOk && metrics) {
        const prevEng = engagementStickyByCampaignRef.current.get(id);
        engagementStickyByCampaignRef.current.set(id, {
          campaignId: id,
          openedCount: Math.max(prevEng?.openedCount ?? 0, metrics.opened),
          subscribeCount: Math.max(prevEng?.subscribeCount ?? 0, metrics.subscribe),
          unsubscribeCount: Math.max(prevEng?.unsubscribeCount ?? 0, metrics.unsubscribe),
          complaintCount: metrics.complaint
        });
      }
      if (payload.totalsRes.totals) {
        const openedBar = Math.max(
          Number(payload.totalsRes.totals.opened ?? 0),
          Number(eng?.openedCount ?? 0)
        );
        const nextTabTotals = {
          all: Number(payload.totalsRes.totals.all ?? 0),
          opened: openedBar,
          success: Number(payload.totalsRes.totals.success ?? 0),
          unconfirmed: Number(payload.totalsRes.totals.unconfirmed ?? 0),
          failed: Number(payload.totalsRes.totals.failed ?? 0)
        };
        setSendListTabTotals((prev) =>
          prev
            ? {
                all: Math.max(prev.all, nextTabTotals.all),
                opened: Math.max(prev.opened, nextTabTotals.opened),
                success: Math.max(prev.success, nextTabTotals.success),
                unconfirmed: Math.max(prev.unconfirmed ?? 0, nextTabTotals.unconfirmed),
                failed: Math.max(prev.failed, nextTabTotals.failed)
              }
            : nextTabTotals
        );
        setSendListPullKey((k) => k + 1);
      }

      const c = campaignRef.current;
      setData((prev) => {
        if (id !== campaignIdRef.current) return prev;
        const base =
          prev ??
          (c && c.id === id
            ? bootstrapStatsFromCampaignRow(c, statsUi.cumulativeLabel)
            : normalizeStatsResponse({
                ok: true,
                range: { from: statsTodayYmd, to: statsTodayYmd },
                summary: { ...EMPTY_SUMMARY },
                series: []
              }));
        let next = mergedMetrics ? applyListMetricsToStatsResponse(base, mergedMetrics) : base;
        if (eng) {
          const complaintAuthoritative = mergedMetrics?.complaintAuthoritative === true;
          next = {
            ...next,
            summary: {
              ...(next.summary ?? EMPTY_SUMMARY),
              openedCount: Math.max(num(next.summary?.openedCount), Number(eng.openedCount ?? 0)),
              subscribeCount: Math.max(
                num(next.summary?.subscribeCount),
                Number(eng.subscribeCount ?? 0)
              ),
              unsubscribeCount: Math.max(
                num(next.summary?.unsubscribeCount),
                Number(eng.unsubscribeCount ?? 0)
              ),
              complaintCount: complaintAuthoritative
                ? num(next.summary?.complaintCount)
                : Math.max(num(next.summary?.complaintCount), Number(eng.complaintCount ?? 0))
            }
          };
        }
        const engSticky = recordEngagementSticky(id, next.summary);
        if (engSticky) engagementStickyByCampaignRef.current.set(id, engSticky);
        return mergeEngagementCounts(next, id, engagementStickyByCampaignRef.current.get(id) ?? null);
      });
    },
    [statsUi.cumulativeLabel, mergeListMetricsSticky]
  );

  const fastEightBarInflightRef = useRef<Promise<void> | null>(null);
  const fastEightBarLastOkRef = useRef<{ id: number; at: number } | null>(null);

  const loadFastEightBarMetrics = useCallback(async (id: number, opts?: { force?: boolean }) => {
    const statusHint = String(campaignRef.current?.status ?? "").toLowerCase();
    const sending = statusHint === "sending";
    const terminalStats =
      statusHint === "completed" || statusHint === "stopped" || statusHint === "paused";
    const minRefreshMs = sending ? 20_000 : 8_000;
    if (
      !opts?.force &&
      fastEightBarLastOkRef.current?.id === id &&
      Date.now() - fastEightBarLastOkRef.current.at < minRefreshMs
    ) {
      return;
    }
    if (fastEightBarInflightRef.current) {
      await fastEightBarInflightRef.current.catch(() => undefined);
      if (!opts?.force) return;
    }
    const run = async () => {
    const myGen = ++fastMetricsGenRef.current;
    const q = campaignListTabTotalsQuery(activityStatsFromEmail, {
      refresh: sending || terminalStats || opts?.force === true
    });
    const complianceQ = "?allTime=1";

    try {
      const [totalsRes, compRes, engRes] = await Promise.all([
        timedStatsPerf("metrics-fast-tab-totals", id, () =>
          apiJsonWithTimeout<{
            ok?: boolean;
            totals?: TabTotalsShape;
            campaignFailCount?: number;
            summaryFailCount?: number;
          }>(
            `/api/email/campaigns/${id}/send-contacts/tab-totals?${q.toString()}`,
            undefined,
            STATS_FETCH_TIMEOUT_MS
          )
        ),
        timedStatsPerf("metrics-fast-compliance", id, () =>
          apiJsonWithTimeout<{
            ok?: boolean;
            counts?: { subscribe: number; unsubscribe: number; complaint: number };
          }>(`/api/email/campaigns/${id}/compliance-counts${complianceQ}`, undefined, STATS_FETCH_TIMEOUT_MS)
        ).catch(() => ({ ok: false as const, counts: { subscribe: 0, unsubscribe: 0, complaint: 0 } })),
        timedStatsPerf("metrics-fast-engagement", id, () =>
          apiJsonWithTimeout<{
            ok?: boolean;
            summary?: StatsResponse["summary"];
          }>(`/api/email/campaigns/${id}/engagement-summary?allTime=1`, undefined, STATS_FETCH_TIMEOUT_MS)
        ).catch(() => ({ ok: false as const }))
      ]);
      const engSummary = engRes && "summary" in engRes ? engRes.summary : undefined;
      applyFastMetricsPayload(id, myGen, {
        totalsRes,
        compRes: {
          ok: compRes.ok !== false,
          counts: compRes.counts ?? { subscribe: 0, unsubscribe: 0, complaint: 0 }
        },
        engSummary
      });
      if (totalsRes.totals) {
        fastEightBarLastOkRef.current = { id, at: Date.now() };
      }
    } catch {
      /* fast 8-bar partial failure: keep last good snapshot */
    }
    };
    fastEightBarInflightRef.current = run().finally(() => {
      fastEightBarInflightRef.current = null;
    });
    await fastEightBarInflightRef.current;
  }, [activityStatsFromEmail, applyFastMetricsPayload]);

  const loadFastEightBarMetricsRef = useRef(loadFastEightBarMetrics);
  loadFastEightBarMetricsRef.current = loadFastEightBarMetrics;

  const commitStatsPayload = useCallback(
    (payload: StatsResponse, id: number, stale: boolean) => {
      if (id !== campaignIdRef.current) return;
      if (payload.campaignId != null && Number(payload.campaignId) !== id) return;

      const stickyEng = engagementStickyByCampaignRef.current.get(id) ?? null;
      let merged = mergeEngagementCounts(payload, id, stickyEng);
      const nextEng = recordEngagementSticky(id, merged.summary);
      if (nextEng) engagementStickyByCampaignRef.current.set(id, nextEng);
      let finalData = mergeEngagementCounts(
        merged,
        id,
        engagementStickyByCampaignRef.current.get(id) ?? null
      );
      const lm = listMetricsRef.current;
      if (lm) {
        finalData = applyListMetricsToStatsResponse(finalData, lm);
      }
      const sending = String(campaignRef.current?.status ?? "").toLowerCase() === "sending";
      if (sending) {
        const prevSnap =
          lastGoodStatsRef.current?.campaignId === id ? lastGoodStatsRef.current.data.summary : null;
        if (prevSnap) {
          finalData = {
            ...finalData,
            summary: {
              ...(finalData.summary ?? EMPTY_SUMMARY),
              successCount: Math.max(
                num(finalData.summary?.successCount),
                num(prevSnap.successCount)
              ),
              failCount: Math.max(num(finalData.summary?.failCount), num(prevSnap.failCount))
            }
          };
        }
      }
      finalData = ensureChartSeries(finalData, statsUi.cumulativeLabel);
      setData(finalData);
      lastGoodStatsRef.current = { campaignId: id, data: finalData };
      hasStatsSnapshotRef.current = true;
      setCampaignStatsStale(stale);
      if (!stale) {
        writeCampaignStatsCache(id, {
          statsScope: finalData.statsScope,
          campaignSendFirstYmd: finalData.campaignSendFirstYmd,
          campaignSendLastYmd: finalData.campaignSendLastYmd,
          summary: finalData.summary,
          series: finalData.series
        });
      }
      /** 静默 poll 不 bump：避免每 10s 重拉发送名单导致「明细加载中」卡住 */
      if (!stale) {
        setSendListPullKey((k) => k + 1);
      }
    },
    [statsUi.cumulativeLabel]
  );

  useEffect(() => {
    setListMetrics(null);
    setSendListTabTotals(null);
    setSendListGateOpen(false);
    fastEightBarLastOkRef.current = null;
    loadGenRef.current += 1;
    fastMetricsGenRef.current += 1;
  }, [campaignId]);

  const fetchTodaySummary = useCallback(async (opts?: { background?: boolean }) => {
    const day = statsTodayYmd;
    if (todayOverviewDayRef.current !== day) {
      todayOverviewDayRef.current = day;
      invalidateCachedTodaySummary();
      setTodaySummary(null);
    }
    const cached = readCachedTodaySummary(day);
    const hasDataForToday = cached != null;
    const background = opts?.background === true || hasDataForToday;
    const myGen = ++todaySummaryFetchGenRef.current;
    if (!background) {
      setTodaySummaryLoading(true);
    }
    try {
      const r = await apiJsonWithTimeout<{
        ok?: boolean;
        day?: string;
        summary?: TodayCampaignActivitiesSummary;
      }>(
        `/api/email/marketing/today-campaigns-summary?lite=1`,
        undefined,
        TODAY_SUMMARY_TIMEOUT_MS
      );
      if (myGen !== todaySummaryFetchGenRef.current) return;
      const respDay = r.day && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : day;
      if (respDay !== serverBusinessTodayYmd) setServerBusinessTodayYmd(respDay);
      if (r.summary) {
        const normalized = {
          ...r.summary,
          successSeries: r.summary.successSeries ?? []
        };
        setTodaySummary(normalized);
        writeCachedTodaySummary(respDay, normalized);
      } else if (!hasDataForToday && todaySummaryRef.current == null) {
        setTodaySummary(EMPTY_TODAY_SUMMARY);
      }
    } catch {
      if (myGen !== todaySummaryFetchGenRef.current) return;
      if (todaySummaryRef.current == null) {
        setTodaySummary(EMPTY_TODAY_SUMMARY);
      }
    } finally {
      if (myGen === todaySummaryFetchGenRef.current) {
        setTodaySummaryLoading(false);
      }
    }
  }, [serverBusinessTodayYmd, statsTodayYmd]);

  useEffect(() => {
    const day = statsTodayYmd;
    const cached = readCachedTodaySummary(day);
    if (cached) {
      setTodaySummary(cached);
      setTodaySummaryLoading(false);
    }
    todayOverviewDayRef.current = day;
    void fetchTodaySummary({ background: cached != null });
    const iv = window.setInterval(() => {
      void fetchTodaySummary({ background: true });
    }, 30_000);
    return () => window.clearInterval(iv);
  }, [fetchTodaySummary, statsTodayYmd]);

  useEffect(() => {
    if (campaignRefreshSignal <= 0) return;
    invalidateCachedTodaySummary();
    void fetchTodaySummary({ background: false });
  }, [campaignRefreshSignal, fetchTodaySummary]);

  useEffect(() => {
    setErr(null);
    if (campaignId == null) {
      setData(null);
      lastGoodStatsRef.current = null;
      hasStatsSnapshotRef.current = false;
      return;
    }
    const c = campaignRef.current;
    const hadExactCache = applyCampaignStatsDisplay(campaignId);
    if (!hadExactCache && c && c.id === campaignId) {
      commitStatsPayload(bootstrapStatsFromCampaignRow(c, statsUi.cumulativeLabel), campaignId, true);
    }
  }, [campaignId, applyCampaignStatsDisplay, commitStatsPayload, statsUi.cumulativeLabel]);

  useEffect(() => {
    if (campaignId == null) return;
    const st = String(campaignRef.current?.status ?? "").toLowerCase();
    const force =
      st === "completed" || st === "stopped" || st === "paused";
    void loadFastEightBarMetricsRef.current(campaignId, { force });
  }, [campaignId, activityStatsFromEmail]);

  const runCampaignStatsLoad = useCallback(
    async (mode: StatsLoadMode = "initial") => {
      if (campaignId == null) {
        loadGenRef.current += 1;
        setLoading(false);
        setCampaignStatsRefreshing(false);
        return;
      }

      const myGen = ++loadGenRef.current;
      const id = campaignId;
      /** 已有 bootstrap / 缓存 / 轻量 7 栏时，首屏与轮询不挡 UI */
      const silent =
        hasStatsSnapshotRef.current && (mode === "poll" || mode === "initial");
      setCampaignStatsRefreshing(!silent);
      if (!silent && mode !== "poll") setLoading(true);
      setErr(null);

      const sending = campaignStatusRef.current === "sending";
      const flags: Record<string, string> = { ...STATS_PANEL_FLAGS };
      /** 轮询/全量/发送中/切活动首屏 refresh 对账；避免第 2/3 场活动沿用 panel 缓存 */
      if (mode === "poll" || mode === "full" || mode === "initial" || sending) {
        flags.refresh = "1";
      }
      /** 仅用户点「刷新」全量对账时拉 IMAP；首屏/切活动勿开，否则 7 栏与名单易超时 */
      if (mode === "full") {
        flags.bounceImap = "1";
      }

      try {
        const res = await fetchStats(flags);
        if (myGen !== loadGenRef.current || id !== campaignIdRef.current) return;
        commitStatsPayload(normalizeStatsResponse(res), id, mode === "poll");
      } catch (e: unknown) {
        if (myGen !== loadGenRef.current) return;
        const msg = String((e as Error)?.message ?? e);
        if (hasStatsSnapshotRef.current || lastGoodStatsRef.current) {
          console.warn("[CampaignActivityStats] background refresh failed", msg);
          setErr(null);
        } else {
          setErr(msg);
        }
      } finally {
        if (myGen === loadGenRef.current) {
          setLoading(false);
          setCampaignStatsRefreshing(false);
        }
      }
    },
    [campaignId, fetchStats, commitStatsPayload]
  );

  const runCampaignStatsLoadRef = useRef(runCampaignStatsLoad);
  runCampaignStatsLoadRef.current = runCampaignStatsLoad;
  const fetchTenantRangeBackgroundRef = useRef(fetchTenantRangeBackground);
  fetchTenantRangeBackgroundRef.current = fetchTenantRangeBackground;

  const runStatsSelfHealClientRefresh = useCallback(async () => {
    if (campaignId == null) return;
    engagementStickyByCampaignRef.current.delete(campaignId);
    listMetricsRef.current = null;
    setListMetrics(null);
    purgeCampaignStatsCache(campaignId);
    fastEightBarLastOkRef.current = null;
    setSendListPullKey((k) => k + 1);
    await loadFastEightBarMetricsRef.current(campaignId, { force: true });
    await runCampaignStatsLoadRef.current("initial");
    await fetchTenantRangeBackgroundRef.current({ refresh: true });
  }, [campaignId]);

  useEffect(() => {
    if (!selfHealRefreshRef) return;
    selfHealRefreshRef.current = runStatsSelfHealClientRefresh;
    return () => {
      selfHealRefreshRef.current = null;
    };
  }, [selfHealRefreshRef, runStatsSelfHealClientRefresh]);

  const campaignStatusRef = useRef("");
  campaignStatusRef.current = String(campaign?.status ?? "").toLowerCase();

  useEffect(() => {
    if (campaignId == null) return;
    const c = campaignRef.current;
    const hinted =
      c &&
      c.id === campaignId &&
      (num(c.sent_count) + num(c.failed_count) + num(c.attempts_count) > 0 ||
        c.has_sent === true);
    /** 列表已带 sent/failed 时尽快对账；否则略延后，让 fast 7 栏先返回 */
    const delayMs = hinted || hasStatsSnapshotRef.current ? 80 : 700;
    const t = window.setTimeout(() => {
      void runCampaignStatsLoadRef.current("initial");
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [campaignId, activityStatsFromEmail]);

  useEffect(() => {
    if (campaignRefreshSignal <= 0 || campaignId == null) return;
    void runCampaignStatsLoadRef.current("full");
  }, [campaignRefreshSignal, campaignId]);

  /** 轮询一律走 lite，避免发送中每 2s 拉 IMAP + 扫全库受众导致页面卡死 */
  useEffect(() => {
    if (campaignId == null) return undefined;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void runCampaignStatsLoadRef.current("poll");
      if (campaignId != null) {
        const st = campaignStatusRef.current;
        const terminal = st === "completed" || st === "stopped" || st === "paused";
        if (st === "sending" || terminal) {
          void loadFastEightBarMetricsRef.current(campaignId, { force: terminal });
        }
      }
    };
    const intervalMs = campaignStatusRef.current === "sending" ? 6_000 : 10_000;
    const iv = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(iv);
  }, [campaignId]);

  const tenantScopeKeyRef = useRef(tenantScopeKey);
  tenantScopeKeyRef.current = tenantScopeKey;

  const commitTenantRangeDates = useCallback(
    (from: string, to: string, opts?: { customConfirm?: boolean }) => {
      let f = from;
      let t = to;
      if (f && t && f > t) {
        const swap = f;
        f = t;
        t = swap;
      }
      setTenantDateDraftFrom(f);
      setTenantDateDraftTo(t);
      setTenantFromDate(f);
      setTenantToDate(t);
      applyTenantRangeDisplay(f, t, tenantScopeKeyRef.current);
      if (opts?.customConfirm) setTenantCustomRangeLoading(true);
    },
    [applyTenantRangeDisplay]
  );

  const setTenantPresetToday = () => {
    const t = statsTodayYmd;
    commitTenantRangeDates(t, t);
  };
  const setTenantPresetYesterday = () => {
    const t = serverBusinessTodayYmd ? businessDaysAgoFromYmd(serverBusinessTodayYmd, 1) : businessDaysAgoYmd(1);
    commitTenantRangeDates(t, t);
  };
  const setTenantPreset7d = () => {
    const t = statsTodayYmd;
    const from = serverBusinessTodayYmd ? businessDaysAgoFromYmd(serverBusinessTodayYmd, 6) : businessDaysAgoYmd(6);
    commitTenantRangeDates(from, t);
  };

  const applyTenantCustomDateRange = () => {
    commitTenantRangeDates(tenantDateDraftFrom, tenantDateDraftTo, { customConfirm: true });
  };
  const code = campaign ? campaign.campaign_code ?? String(campaign.id).padStart(6, "0") : statsUi.dash;
  const displayData =
    data ??
    (lastGoodStatsRef.current?.campaignId === campaignId ? lastGoodStatsRef.current.data : null);
  const sOverviewRaw = displayData?.summary ?? EMPTY_SUMMARY;
  const mergeListMetrics = useCallback(
    (base: StatsResponse["summary"], metrics: CampaignListMetricsSnapshot | null) =>
      mergeListMetricsIntoSummary(base, metrics),
    []
  );
  const sOverview = sOverviewRaw;
  const sActivity = useMemo(
    () => mergeListMetrics(sOverview, listMetrics),
    [sOverview, listMetrics, mergeListMetrics]
  );
  const hasActivityStatsData =
    num(sActivity.successCount) + num(sActivity.failCount) > 0 ||
    num(campaign?.attempts_count ?? 0) + num(campaign?.sent_count ?? 0) > 0 ||
    campaign?.has_sent === true ||
    (listMetrics != null &&
      (listMetrics.success + listMetrics.failed > 0 ||
        num(listMetrics.unconfirmed ?? 0) > 0 ||
        listMetrics.opened > 0 ||
        listMetrics.subscribe > 0 ||
        listMetrics.unsubscribe > 0 ||
        listMetrics.complaint > 0));
  const activityStatsPending =
    campaignId != null &&
    !hasActivityStatsData &&
    (loading || campaignStatsRefreshing) &&
    String(campaign?.status ?? "").toLowerCase() !== "sending";
  const showPct = (v: number) => `${v}%`;
  const showNum = (v: number) => String(v ?? 0);
  const showActivityNum = (v: number) => (activityStatsPending ? statsUi.pending : showNum(v));
  const showActivityPct = (v: number) => (activityStatsPending ? statsUi.pending : showPct(v));
  const totalSendAttemptsActivity = num(sActivity.successCount) + num(sActivity.failCount);
  const totalSendAttemptsOverview = num(sOverview.successCount) + num(sOverview.failCount);
  const tenantRangeLabel =
    tenantFromDate === tenantToDate ? tenantFromDate : `${tenantFromDate} → ${tenantToDate}`;
  const campaignSendSpan =
    displayData?.campaignSendFirstYmd && displayData?.campaignSendLastYmd
      ? displayData.campaignSendFirstYmd === displayData.campaignSendLastYmd
        ? displayData.campaignSendFirstYmd
        : `${displayData.campaignSendFirstYmd} ~ ${displayData.campaignSendLastYmd}`
      : null;
  /** 发送列表等 tab-totals 完成后再拉 send-contacts，减轻单组 VPS MySQL 并发超时 */
  useEffect(() => {
    if (campaignId == null) {
      setSendListGateOpen(false);
      return;
    }
    if (sendListTabTotals) {
      setSendListGateOpen(true);
      return;
    }
    const t = window.setTimeout(() => setSendListGateOpen(true), 4_000);
    return () => window.clearTimeout(t);
  }, [campaignId, sendListTabTotals]);

  const statsReady = campaignId != null && sendListGateOpen;
  const campaignAttempts = num(campaign?.attempts_count ?? campaign?.sent_count ?? 0);
  const rangeShowsNoSends =
    campaignId != null &&
    !campaignStatsRefreshing &&
    !hasActivityStatsData &&
    totalSendAttemptsOverview === 0 &&
    campaignAttempts <= 0 &&
    campaign?.has_sent !== true &&
    String(campaign?.status ?? "").toLowerCase() !== "sending";
  const tr = tenantRange ?? lastShownTenantRangeRef.current;
  const tenantCustomRangeDirty =
    tenantDateDraftFrom !== tenantFromDate || tenantDateDraftTo !== tenantToDate;
  /** 仅自定义日期点「确定」后展示加载态；今天/昨天/近7天 静默后台刷新 */
  const tenantBarsLoading = tenantCustomRangeLoading && !tr;
  const showTenantNum = (v: number) => String(v ?? 0);

  const todayOverviewPending = todaySummaryLoading && todaySummary == null;
  const todayOverviewTotals = useMemo(
    () => ({
      activityCount: todaySummary?.activityCount ?? 0,
      totalAttempts: todaySummary?.totalAttempts ?? 0,
      totalSuccess: todaySummary?.totalSuccess ?? 0,
      totalSubscribe: todaySummary?.totalSubscribe ?? 0
    }),
    [todaySummary]
  );

  const todayActivities = todaySummary?.activities ?? [];
  const todaySuccessSeries = todaySummary?.successSeries ?? [];

  const tenantDatePreset = useMemo(() => {
    const t = statsTodayYmd;
    const y = serverBusinessTodayYmd ? businessDaysAgoFromYmd(serverBusinessTodayYmd, 1) : businessDaysAgoYmd(1);
    const w = serverBusinessTodayYmd ? businessDaysAgoFromYmd(serverBusinessTodayYmd, 6) : businessDaysAgoYmd(6);
    if (tenantFromDate === t && tenantToDate === t) return "today" as const;
    if (tenantFromDate === y && tenantToDate === y) return "yesterday" as const;
    if (tenantFromDate === w && tenantToDate === t) return "7d" as const;
    return "custom" as const;
  }, [serverBusinessTodayYmd, statsTodayYmd, tenantFromDate, tenantToDate]);

  const tenantPresetBtnClass = (preset: "today" | "yesterday" | "7d") =>
    tenantDatePreset === preset
      ? "rounded px-3 py-1.5 text-xs font-bold bg-violet-700 text-white shadow-md ring-2 ring-violet-600"
      : "rounded px-3 py-1.5 text-xs font-medium text-violet-950 hover:bg-violet-100";
  const tenantScopeNote = !tenantFilterActive
    ? statsUi.tenantScopeAll
    : tenantFilterFromEmail.trim()
      ? statsUi.tenantScopeEmail(tenantFilterFromEmail.trim().toLowerCase())
      : tenantFilterLane !== "" && tenantFilterChannel !== "all"
        ? statsUi.tenantScopeLaneChannel(tenantFilterLane, statsUi.channelLabel(tenantFilterChannel))
        : tenantFilterLane !== ""
          ? statsUi.tenantScopeLane(tenantFilterLane)
          : tenantFilterChannel !== "all"
            ? statsUi.channelLabel(tenantFilterChannel)
            : statsUi.tenantScopeSelected;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/95 via-indigo-50/80 to-slate-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-900">{statsUi.dateRangeTitle}</div>
          <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-[10px] text-violet-800 ring-1 ring-violet-200/80">
            {tenantRangeLabel}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-violet-300 bg-white p-0.5 shadow-sm">
            <button type="button" className={tenantPresetBtnClass("today")} onClick={setTenantPresetToday}>
              {statsUi.presetToday}
            </button>
            <button type="button" className={tenantPresetBtnClass("yesterday")} onClick={setTenantPresetYesterday}>
              {statsUi.presetYesterday}
            </button>
            <button type="button" className={tenantPresetBtnClass("7d")} onClick={setTenantPreset7d}>
              {statsUi.preset7d}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-violet-950">
            <input
              type="date"
              className="rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-violet-400"
              value={tenantDateDraftFrom}
              onChange={(e) => setTenantDateDraftFrom(e.target.value)}
            />
            <span className="text-violet-400">→</span>
            <input
              type="date"
              className="rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-violet-400"
              value={tenantDateDraftTo}
              onChange={(e) => setTenantDateDraftTo(e.target.value)}
            />
            <button
              type="button"
              disabled={!tenantCustomRangeDirty || tenantCustomRangeLoading}
              onClick={applyTenantCustomDateRange}
              className="rounded-md border border-violet-500 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:border-violet-200 disabled:bg-violet-100 disabled:text-violet-400"
            >
              {tenantCustomRangeLoading ? statsUi.loading : statsUi.confirm}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-violet-800/90">
          {statsUi.tenantRangeHint}{tenantCustomRangeLoading ? (<span className="ml-1 font-medium text-violet-700">{statsUi.tenantRangeLoading}</span>) : null}
        </p>
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-violet-100 bg-white/90 p-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-violet-800">{statsUi.selectLane}</span>
            <select
              className="h-7 w-full rounded border border-violet-200 bg-white px-1.5 text-[11px] outline-none focus:border-violet-500"
              value={tenantFilterLane === "" ? "" : String(tenantFilterLane)}
              onChange={(e) => {
                const v = e.target.value;
                setTenantFilterLane(v ? Number(v) : "");
                setTenantFilterFromEmail("");
              }}
            >
              <option value="">{statsUi.allLanes}</option>
              {dedicatedLanes.map((lane) => (
                <option key={lane.laneIndex} value={String(lane.laneIndex)}>
                  {lane.label}
                </option>
              ))}
            </select>
          </div>
          {!standaloneOmitPackageChannelPicker() ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-violet-800">{statsUi.packageChannel}</span>
            <select
              className="h-7 w-full rounded border border-violet-200 bg-white px-1.5 text-[11px] outline-none focus:border-violet-500"
              value={tenantFilterChannel}
              onChange={(e) => {
                const ch = e.target.value as TenantChannelFilter;
                const sk = `${tenantFilterLane}|${ch}|__all__`;
                applyTenantRangeDisplay(tenantFromDate, tenantToDate, sk);
                setTenantFilterChannel(ch);
                setTenantFilterFromEmail("");
              }}
            >
              <option value="all">{statsUi.allChannels}</option>
              {CAMPAIGN_STATS_CHANNEL_ORDER.map((ch) => (
                <option key={ch} value={ch}>
                  {statsUi.channelLabel(ch)}
                </option>
              ))}
            </select>
          </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-violet-800">{statsUi.senderDomain}</span>
            <select
              className="h-7 w-full rounded border border-violet-200 bg-white px-1.5 font-mono text-[10px] outline-none focus:border-violet-500"
              value={tenantFilterFromEmail}
              onChange={(e) => {
                const fe = e.target.value;
                const sk = `${tenantFilterLane}|${tenantFilterChannel}|${fe.trim().toLowerCase() || "__all__"}`;
                applyTenantRangeDisplay(tenantFromDate, tenantToDate, sk);
                setTenantFilterFromEmail(fe);
              }}
            >
              <option value="">{statsUi.allSenderEmails}</option>
              {tenantFilterEmailOptions.map((fe) => (
                <option key={fe} value={fe}>
                  {fe}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="relative mt-3">
          {tenantCustomRangeLoading && tr ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75 backdrop-blur-[1px]"
              aria-live="polite"
            >
              <span className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-800 shadow-sm">
                {statsUi.loading}
              </span>
            </div>
          ) : null}
          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 ${
              tenantCustomRangeLoading ? "opacity-80" : ""
            }`}
          >
          {tenantBarsLoading ? (
            <div className="col-span-2 flex min-h-[3.25rem] items-center justify-center rounded-lg border border-violet-100 bg-white/90 sm:col-span-3 lg:col-span-6">
              <span className="text-sm text-violet-700">{statsUi.loading}</span>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-violet-100 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-slate-600">{statsUi.totalSends}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                  {showTenantNum(tr?.totalSendAttempts ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-emerald-800">{statsUi.delivered}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-900">
                  {showTenantNum(tr?.deliveredCount ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-blue-800">{statsUi.opened}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-blue-900">
                  {showTenantNum(tr?.openedCount ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-teal-100 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-teal-800">{statsUi.subscribed}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-teal-900">
                  {showTenantNum(tr?.subscribeCount ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-slate-700">{statsUi.unsubscribed}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                  {showTenantNum(tr?.unsubscribeCount ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-orange-100 bg-white/90 px-3 py-2 text-center shadow-sm">
                <div className="text-[10px] font-medium text-orange-800">{statsUi.complaints}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-orange-900">
                  {showTenantNum(tr?.complaintCount ?? 0)}
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {statsUi.currentCampaignTitle}
          </div>
          {campaign ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-base font-semibold tracking-wider text-slate-900">{code}</span>
                <span className="text-slate-400">·</span>
                <span className="text-[11px] font-medium text-slate-800">{campaign.name}</span>
                <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[9px] text-slate-600">
                  {statsUi.internalId(campaign.id)}
                </span>
                <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] text-slate-500 ring-1 ring-slate-200">
                  {campaign.status}
                </span>
              </div>
              {campaign.template_name ? (
                <p className="mt-1 text-[10px] text-slate-500">{statsUi.templateLabel(campaign.template_name)}</p>
              ) : null}
            </>
          ) : campaignId != null ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-base font-semibold tracking-wider text-slate-900">
                {String(campaignId).padStart(6, "0")}
              </span>
              <span className="text-[11px] text-slate-500">{statsUi.campaignDetailLoading}</span>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-600">{statsUi.noCampaignYet}</p>
          )}
        </div>
      </div>

      {!hideSenderFilters ? (
        dedicatedLanes.length > 0 ? (
          <DedicatedLaneSenderFilters
            compact
            requireLane
            mode="fromEmail"
            fromEmail={fromEmail}
            onFromEmailChange={setFromEmail}
            channel={senderChannel}
            onChannelChange={setSenderChannel}
            lanes={dedicatedLanes}
            selectedLaneIndex={selectedLaneIndex}
            onSelectLaneIndex={setSelectedLaneIndex}
            smtpItems={smtpItems}
            dedicatedServers={dedicatedServers}
            sesAddresses={sesAddresses}
          />
        ) : (
          <MarketingSenderChannelPicker
            compact
            mode="fromEmail"
            fromEmail={fromEmail}
            onFromEmailChange={setFromEmail}
            channel={senderChannel}
            onChannelChange={setSenderChannel}
            smtpItems={smtpItems}
            dedicatedServers={dedicatedServers}
            sesAddresses={sesAddresses}
          />
        )
      ) : null}

      {rangeShowsNoSends ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
          {statsUi.noSendsYet}
        </div>
      ) : null}

      {/** 当前活动：7 项发送明细 */}
      <p className="mt-2 text-[11px] font-medium text-violet-900">
        {statsUi.activityDetailTitle(code)}
      </p>
      {activityStatsPending ? (
        <p className="mt-1 text-[10px] text-violet-600">{statsUi.activityDetailLoading(code)}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-violet-900">{statsUi.totalSendAttempts}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-violet-950">
            {showActivityNum(totalSendAttemptsActivity)}
          </div>
          <div className="mt-0.5 text-[11px] text-violet-800">&nbsp;</div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-emerald-900">{statsUi.deliveredReal}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-900">{showActivityNum(sActivity.successCount)}</div>
          <div className="mt-0.5 text-[11px] text-emerald-700">
            {statsUi.pctOfSends(showActivityPct(sActivity.deliveredPct))}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-blue-900">{statsUi.openedTracked}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-blue-900">{showActivityNum(sActivity.openedCount)}</div>
          <div className="mt-0.5 text-[11px] text-blue-700">
            {activityStatsPending
              ? statsUi.pending
              : sActivity.successCount > 0
                ? statsUi.pctOfDelivered(showPct(sActivity.openedPct))
                : statsUi.dash}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-cyan-900">{statsUi.deliveredUnconfirmed}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-cyan-900">
            {showActivityNum(num(sActivity.deliveredUnconfirmedCount))}
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-cyan-700">
            {activityStatsPending ? statsUi.pending : statsUi.deliveredUnconfirmedNote}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-rose-900">{statsUi.bouncedFailed}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-rose-900">{showActivityNum(sActivity.failCount)}</div>
          <div className="mt-0.5 text-[11px] text-rose-700">
            {activityStatsPending
              ? statsUi.pending
              : totalSendAttemptsActivity > 0
                ? statsUi.pctOfSends(showActivityPct(sActivity.bouncedPct))
                : statsUi.dash}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-teal-900">{statsUi.subscribedLabel}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-teal-900">{showActivityNum(sActivity.subscribeCount)}</div>
          <div className="mt-0.5 text-[11px] text-teal-700">
            {activityStatsPending
              ? statsUi.pending
              : sActivity.successCount > 0
                ? statsUi.pctOfDelivered(showPct(sActivity.subscribePct))
                : statsUi.dash}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-slate-300 bg-slate-100/80 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-slate-800">{statsUi.unsubscribedLabel}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{showActivityNum(sActivity.unsubscribeCount)}</div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            {activityStatsPending
              ? statsUi.pending
              : sActivity.successCount > 0
                ? statsUi.pctOfDelivered(showPct(sActivity.unsubscribePct))
                : statsUi.dash}
          </div>
        </div>
        <div className="flex min-h-[6.2rem] flex-col justify-between rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-3 text-center shadow-sm">
          <div className="text-xs text-orange-900">{statsUi.complaintReal}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-orange-900">{showActivityNum(sActivity.complaintCount)}</div>
          <div className="mt-0.5 text-[11px] text-orange-700">
            {activityStatsPending
              ? statsUi.pending
              : sActivity.successCount > 0
                ? statsUi.pctOfDelivered(showPct(Math.round((100 * num(sActivity.complaintCount)) / sActivity.successCount)))
                : statsUi.dash}
          </div>
        </div>
      </div>
      {err ? <p className="mt-2 text-xs text-amber-700">{err}</p> : null}

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{statsUi.todayOverviewTitle}</div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-center sm:mx-auto sm:max-w-2xl sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-600">{statsUi.activityRunCount}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-violet-700">
              {todayOverviewPending ? statsUi.pending : showNum(todayOverviewTotals.activityCount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600">{statsUi.totalSends}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {todayOverviewPending ? statsUi.pending : showNum(todayOverviewTotals.totalAttempts)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600">{statsUi.todaySuccess}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
              {todayOverviewPending ? statsUi.pending : showNum(todayOverviewTotals.totalSuccess)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600">{statsUi.todaySubscribeTotal}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-teal-600">
              {todayOverviewPending ? statsUi.pending : showNum(todayOverviewTotals.totalSubscribe)}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="text-sm font-semibold text-slate-900">{statsUi.todayTrendTitle}</div>
          <div className="relative mt-3 overflow-x-auto">
            <CampaignSuccessLineChart
              series={todaySuccessSeries}
              scopeLabel={statsUi.todayAllActivities}
              emptyHint={todayOverviewPending ? statsUi.loading : statsUi.todayNoSuccess}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="text-sm font-semibold text-slate-900">{statsUi.todayActivitiesTitle}</div>
          <div
            className="mt-2 overflow-y-auto rounded-md border border-slate-200"
            style={{ maxHeight: "calc(3 * 2.5rem + 2.25rem)" }}
          >
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium">{statsUi.colCampaignCode}</th>
                  <th className="px-2 py-1.5 font-medium">{statsUi.colName}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{statsUi.colSendVolume}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{statsUi.colSuccess}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{statsUi.colSubscribed}</th>
                </tr>
              </thead>
              <tbody>
                {todayActivities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                      {todayOverviewPending ? statsUi.loading : statsUi.todayNoActivitySends}
                    </td>
                  </tr>
                ) : (
                  todayActivities.map((row) => {
                    const rowCode = row.campaign_code ?? String(row.id).padStart(6, "0");
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-mono font-semibold text-slate-900">{rowCode}</td>
                        <td className="max-w-[8rem] truncate px-2 py-1.5 text-slate-700">{row.name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.totalAttempts}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{row.successCount}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-teal-700">{row.subscribeCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <CampaignSendRecipientsTable
        campaignId={campaignId}
        campaignIdLabel={code}
        deliveredCount={num(sActivity.successCount)}
        openedCampaignCount={num(sActivity.openedCount)}
        subscribeCampaignCount={num(sActivity.subscribeCount)}
        unsubscribeCampaignCount={num(sActivity.unsubscribeCount)}
        complaintCampaignCount={num(sActivity.complaintCount)}
        subscribeBySendingDomain={sActivity.subscribeBySendingDomain ?? []}
        listTransferPending={false}
        statsRangeLabel={statsUi.statsRangeThisCampaign}
        fromDate=""
        toDate=""
        fromEmail="all"
        listPullKey={sendListPullKey}
        statsReady={statsReady}
        initialTabTotals={sendListTabTotals}
        aggressivePoll={
          ["sending", "completed", "stopped", "paused"].includes(
            String(campaign?.status ?? "").toLowerCase()
          )
        }
        campaignStatus={campaign?.status ?? ""}
        onListMetricsChange={onListMetricsChange}
      />

      <CampaignSendRowsLiveTable
        campaignId={campaignId}
        campaignIdLabel={code}
        campaignStatus={campaign?.status ?? ""}
        fromDate=""
        toDate=""
        fromEmail="all"
        listPullKey={sendListPullKey}
        statsReady={statsReady}
      />

      <div className="mt-4 space-y-4">
        <CampaignStatsLoadDiagnostic campaignId={campaignId} campaignCode={code} />
      </div>
    </div>
  );
}

function CampaignStatsLoadDiagnostic(props: { campaignId: number | null; campaignCode: string }) {
  const { campaignId, campaignCode } = props;
  const { locale } = useSiteLocale();
  const statsUi = useMemo(() => getEmailCampaignStatsPageStrings(locale), [locale]);
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const [resolved, setResolved] = useState(() => getStatsPerfLog());
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeStatsPerf(() => setResolved(getStatsPerfLog())), []);

  const filtered =
    campaignId == null
      ? resolved
      : resolved.filter((e) => e.campaignId == null || e.campaignId === campaignId);

  async function copy() {
    const lines = [
      statsUi.diagnosticCopyLogTitle(campaignCode, campaignId),
      statsUi.diagnosticExportTime(new Date().toLocaleString(intlLocaleTag(locale))),
      "",
      ...filtered.map((e) => {
        const ms = e.ms != null ? ` ${e.ms}ms` : "";
        const detail = e.detail ? ` · ${e.detail}` : "";
        return `${e.at} · ${listUi.perfStepLabel(e.step)}${ms}${detail}`;
      })
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{statsUi.diagnosticTitle}</div>
        </div>
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => void copy()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {copied ? statsUi.diagnosticCopied : statsUi.diagnosticCopy}
        </button>
      </div>
      <ul className="mt-3 max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700">
        {filtered.length === 0 ? (
          <li className="text-slate-500">{statsUi.diagnosticEmpty}</li>
        ) : (
          filtered
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${e.at}-${i}`}>
                {e.at} · {listUi.perfStepLabel(e.step)}
                {e.ms != null ? ` · ${e.ms}ms` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
              </li>
            ))
        )}
      </ul>
    </div>
  );
}
