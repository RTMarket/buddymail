import type { SiteLocale } from "./siteLocaleTypes";
import type { EmailChannelKind } from "../lib/dedicatedEntitlements";
import { getEmailCampaignsChildStrings } from "./emailCampaignsChildI18n";

export type EmailCampaignStatsPageStrings = {
  channelLabel: (ch: EmailChannelKind) => string;
  dateRangeTitle: string;
  presetToday: string;
  presetYesterday: string;
  preset7d: string;
  loading: string;
  confirm: string;
  tenantRangeHint: string;
  tenantRangeLoading: string;
  tenantScopeAll: string;
  tenantScopeEmail: (email: string) => string;
  tenantScopeLaneChannel: (lane: number, ch: string) => string;
  tenantScopeLane: (lane: number) => string;
  tenantScopeSelected: string;
  selectLane: string;
  allLanes: string;
  packageChannel: string;
  allChannels: string;
  senderDomain: string;
  allSenderEmails: string;
  totalSends: string;
  delivered: string;
  opened: string;
  subscribed: string;
  unsubscribed: string;
  complaints: string;
  currentCampaignTitle: string;
  internalId: (id: number) => string;
  templateLabel: (name: string) => string;
  campaignDetailLoading: string;
  noCampaignYet: string;
  noSendsYet: string;
  activityDetailTitle: (code: string) => string;
  activityDetailLoading: (code: string) => string;
  activityStatsLoading: (code: string) => string;
  chartEmptyDefault: string;
  chartLegendSuccess: string;
  chartAriaTrend: string;
  chartAriaScopeTrend: (scope: string) => string;
  chartScopeCampaign: (code: string) => string;
  chartHoverBucket: (label: string, success: number) => string;
  chartHoverPeriodSuccess: (success: number) => string;
  chartHoverNoSuccessDay: string;
  totalSendAttempts: string;
  deliveredReal: string;
  deliveredUnconfirmed: string;
  deliveredUnconfirmedNote: string;
  openedTracked: string;
  bouncedFailed: string;
  subscribedLabel: string;
  unsubscribedLabel: string;
  complaintReal: string;
  pctOfSends: (pct: string) => string;
  pctOfDelivered: (pct: string) => string;
  pending: string;
  dash: string;
  todayOverviewTitle: string;
  activityRunCount: string;
  todayTotalSends: string;
  todaySuccess: string;
  todaySubscribeTotal: string;
  todayTrendTitle: string;
  todayAllActivities: string;
  todayNoSuccess: string;
  todayActivitiesTitle: string;
  colCampaignCode: string;
  colName: string;
  colSendVolume: string;
  colSuccess: string;
  colSubscribed: string;
  todayNoActivitySends: string;
  statsRangeThisCampaign: string;
  diagnosticTitle: string;
  diagnosticCopied: string;
  diagnosticCopy: string;
  diagnosticEmpty: string;
  diagnosticCopyLogTitle: (campaignCode: string, campaignId: number | null) => string;
  diagnosticExportTime: (time: string) => string;
  selfHealTitle: string;
  selfHealDesc: string;
  selfHealRun: string;
  selfHealRunning: string;
  selfHealStepExport: string;
  selfHealStepExportDone: string;
  selfHealStepServer: string;
  selfHealStepServerDone: string;
  selfHealStepServerFail: string;
  selfHealStepClient: string;
  selfHealStepClientDone: string;
  selfHealStepResult: string;
  selfHealResultOk: string;
  selfHealResultFail: string;
  selfHealCopyPackage: string;
  selfHealPackageCopied: string;
  selfHealSupportHint: string;
  selfHealPackageTitle: (campaignCode: string, campaignId: number | null) => string;
  selfHealSectionLoadLog: string;
  selfHealSectionServer: string;
  selfHealSectionClient: string;
  selfHealSectionResult: string;
  cumulativeLabel: string;
};

export function getEmailCampaignStatsPageStrings(locale: SiteLocale): EmailCampaignStatsPageStrings {
  const child = getEmailCampaignsChildStrings(locale);
  if (locale === "en") {
    return {
      channelLabel: child.channelLabel,
      dateRangeTitle: "Date range summary",
      presetToday: "Today",
      presetYesterday: "Yesterday",
      preset7d: "Last 7 days",
      loading: "Loading…",
      confirm: "Apply",
      tenantRangeHint:
        "All date and time statistics use Beijing time (UTC+8). The 6 metrics below sum by selected date range and sender filters. For custom dates, pick range then Apply; Today/Yesterday/Last 7 days switch instantly.",
      tenantRangeLoading: "(loading…)",
      tenantScopeAll: "All lanes & sending domains on plan",
      tenantScopeEmail: (email) => `Sender ${email}`,
      tenantScopeLaneChannel: (lane, ch) => `Lane ${lane} · ${ch}`,
      tenantScopeLane: (lane) => `Lane ${lane}`,
      tenantScopeSelected: "Selected scope",
      selectLane: "Lane",
      allLanes: "All lanes",
      packageChannel: "Plan channel",
      allChannels: "All channels",
      senderDomain: "Sending domain",
      allSenderEmails: "All sending mailboxes",
      totalSends: "Total sends",
      delivered: "Delivered",
      opened: "Opened",
      subscribed: "Subscribed",
      unsubscribed: "Unsubscribed",
      complaints: "Complaints",
      currentCampaignTitle: "Current campaign · 6-digit code",
      internalId: (id) => `Internal ID ${id}`,
      templateLabel: (name) => `Template: ${name}`,
      campaignDetailLoading: "(loading campaign detail…)",
      noCampaignYet: "No campaigns yet — stats appear after you create and send one.",
      noSendsYet: "No sends for this campaign yet; stats appear after sending completes.",
      activityDetailTitle: (code) => `Campaign ${code} · single-send detail`,
      activityDetailLoading: (code) => `Loading send detail for ${code}…`,
      activityStatsLoading: (code) => `Loading send statistics for campaign ${code}…`,
      chartEmptyDefault: "No delivery success trend data yet",
      chartLegendSuccess: "Delivered (excl. bounces)",
      chartAriaTrend: "Delivery success trend",
      chartAriaScopeTrend: (scope) => `${scope} delivery success trend`,
      chartScopeCampaign: (code) => `Campaign ${code}`,
      chartHoverBucket: (label, success) => `${label} · delivered in period: ${success}`,
      chartHoverPeriodSuccess: (success) => `Delivered in this period: ${success}`,
      chartHoverNoSuccessDay: "No successful deliveries on this day",
      totalSendAttempts: "Total attempts",
      deliveredReal: "Delivered (confirmed)",
      deliveredUnconfirmed: "Delivered, no feedback",
      deliveredUnconfirmedNote: "Accepted by the recipient server; inbox placement or visibility cannot be verified.",
      openedTracked: "Opened (tracked)",
      bouncedFailed: "Bounced / failed",
      subscribedLabel: "Subscribed",
      unsubscribedLabel: "Unsubscribed",
      complaintReal: "Complaints (confirmed)",
      pctOfSends: (pct) => `${pct} of sends`,
      pctOfDelivered: (pct) => `${pct} of delivered`,
      pending: "…",
      dash: "—",
      todayOverviewTitle: "Today’s campaign overview",
      activityRunCount: "Campaign runs",
      todayTotalSends: "Total sends",
      todaySuccess: "Successful",
      todaySubscribeTotal: "Subscriptions",
      todayTrendTitle: "Today’s delivery success trend",
      todayAllActivities: "All campaigns today",
      todayNoSuccess: "No successful sends today yet",
      todayActivitiesTitle: "Today’s campaigns",
      colCampaignCode: "Campaign code",
      colName: "Name",
      colSendVolume: "Sends",
      colSuccess: "Success",
      colSubscribed: "Subscribed",
      todayNoActivitySends: "No campaign sends today yet",
      statsRangeThisCampaign: "This campaign",
      diagnosticTitle: "Stats & list load diagnostic",
      diagnosticCopied: "Copied",
      diagnosticCopy: "Copy load log",
      diagnosticEmpty: "Steps appear here after you select a campaign and switch list tabs.",
      diagnosticCopyLogTitle: (campaignCode, campaignId) =>
        `[Campaign stats · load diagnostic · ${campaignCode} · ID ${campaignId ?? "—"}]`,
      diagnosticExportTime: (time) => `Exported: ${time}`,
      selfHealTitle: "Diagnose & repair",
      selfHealDesc:
        "Clears stats caches for this standalone site (current user + selected campaign only), then reloads numbers. Other campaigns and features are not affected.",
      selfHealRun: "Run diagnose & repair",
      selfHealRunning: "Running…",
      selfHealStepExport: "1. Collect load diagnostic log",
      selfHealStepExportDone: "Log collected",
      selfHealStepServer: "2. Server: clear caches & lite probe",
      selfHealStepServerDone: "Server caches cleared",
      selfHealStepServerFail: "Server step failed",
      selfHealStepClient: "3. Browser: clear local caches & reload 7-bar",
      selfHealStepClientDone: "Local caches cleared, reload triggered",
      selfHealStepResult: "4. Result",
      selfHealResultOk: "Repair completed — numbers should refresh shortly",
      selfHealResultFail: "Repair incomplete",
      selfHealCopyPackage: "Copy diagnostic package",
      selfHealPackageCopied: "Copied",
      selfHealSupportHint:
        "If numbers are still wrong or timeouts persist, copy the diagnostic package and contact support via in-app message.",
      selfHealPackageTitle: (campaignCode, campaignId) =>
        `[Standalone stats self-heal · ${campaignCode} · ID ${campaignId ?? "—"}]`,
      selfHealSectionLoadLog: "— Load diagnostic —",
      selfHealSectionServer: "— Server self-heal —",
      selfHealSectionClient: "— Browser refresh —",
      selfHealSectionResult: "— Result —",
      cumulativeLabel: "Cumulative"
    };
  }
  return {
    channelLabel: child.channelLabel,
    dateRangeTitle: "日期范围统计",
    presetToday: "今天",
    presetYesterday: "昨天",
    preset7d: "近7天",
    loading: "加载中…",
    confirm: "确定",
    tenantRangeHint:
      "所有计时统计统一按照北京时间（UTC+8）计算。下方 6 项均按所选日期与发信邮箱筛选汇总。自定义起止日请选好后点确定；「今天/昨天/近7天」即时切换、不显示加载提示。",
    tenantRangeLoading: "（数据正在加载中…）",
    tenantScopeAll: "本租户套餐下全部专线 / 全部发信域名",
    tenantScopeEmail: (email) => `发信邮箱 ${email}`,
    tenantScopeLaneChannel: (lane, ch) => `专线 ${lane} · ${ch}`,
    tenantScopeLane: (lane) => `专线 ${lane}`,
    tenantScopeSelected: "已选范围",
    selectLane: "发信专线",
    allLanes: "全部专线",
    packageChannel: "套餐通道",
    allChannels: "全部通道",
    senderDomain: "发信邮箱 / 域名",
    allSenderEmails: "全部发信邮箱",
    totalSends: "总发信量",
    delivered: "已送达",
    opened: "已打开",
    subscribed: "已订阅",
    unsubscribed: "已退订",
    complaints: "投诉",
    currentCampaignTitle: "当前活动 · 6 位编号",
    internalId: (id) => `内部 ID ${id}`,
    templateLabel: (name) => `模版：${name}`,
    campaignDetailLoading: "（活动明细加载中…）",
    noCampaignYet: "暂无营销活动；创建并发送后将在此展示最新一场统计。",
    noSendsYet: "本活动尚无发送记录；发送完成后此处将显示统计。",
    activityDetailTitle: (code) => `活动 ${code} · 单次发送明细`,
    activityDetailLoading: (code) => `正在加载活动 ${code} 发送明细…`,
    activityStatsLoading: (code) => `正在加载活动 ${code} 的发送统计…`,
    chartEmptyDefault: "暂无发送成功趋势数据",
    chartLegendSuccess: "发送成功（已扣退回）",
    chartAriaTrend: "发送成功趋势",
    chartAriaScopeTrend: (scope) => `${scope}发送成功趋势`,
    chartScopeCampaign: (code) => `活动 ${code}`,
    chartHoverBucket: (label, success) => `${label} · 该时段发送成功：${success}`,
    chartHoverPeriodSuccess: (success) => `该时段发送成功 ${success} 封`,
    chartHoverNoSuccessDay: "该日无发送成功记录",
    totalSendAttempts: "发信总数",
    deliveredReal: "已送达（真实）",
    deliveredUnconfirmed: "已投递无反馈",
    deliveredUnconfirmedNote: "对方服务器已受理，但无法确认是否进入收件箱或是否被用户看到。",
    openedTracked: "已打开（真实追踪）",
    bouncedFailed: "已退回（投递失败）",
    subscribedLabel: "已订阅",
    unsubscribedLabel: "已退订",
    complaintReal: "投诉（真实）",
    pctOfSends: (pct) => `占发信 ${pct}`,
    pctOfDelivered: (pct) => `占送达 ${pct}`,
    pending: "…",
    dash: "—",
    todayOverviewTitle: "今日活动发送概览",
    activityRunCount: "总活动次数",
    todayTotalSends: "总发信量",
    todaySuccess: "发信成功",
    todaySubscribeTotal: "总订阅量",
    todayTrendTitle: "今日发信成功趋势",
    todayAllActivities: "今日全部活动",
    todayNoSuccess: "今日尚无发信成功记录",
    todayActivitiesTitle: "今日各场活动明细",
    colCampaignCode: "活动编号",
    colName: "名称",
    colSendVolume: "发信量",
    colSuccess: "成功",
    colSubscribed: "已订阅",
    todayNoActivitySends: "今日尚无活动发送记录",
    statsRangeThisCampaign: "本活动",
    diagnosticTitle: "统计与名单加载诊断",
    diagnosticCopied: "已复制",
    diagnosticCopy: "复制加载日志",
    diagnosticEmpty: "选择活动并切换发送名单标签后，步骤会出现在此。",
    diagnosticCopyLogTitle: (campaignCode, campaignId) =>
      `[营销活动统计 · 加载诊断 · ${campaignCode} · ID ${campaignId ?? "—"}]`,
    diagnosticExportTime: (time) => `导出：${time}`,
    selfHealTitle: "诊断与修复",
    selfHealDesc:
      "仅清理本独立站当前用户与所选活动的统计缓存并重新拉取数字。不影响其他活动计数与功能。",
    selfHealRun: "运行诊断与修复",
    selfHealRunning: "运行中…",
    selfHealStepExport: "1. 收集加载诊断日志",
    selfHealStepExportDone: "已收集日志",
    selfHealStepServer: "2. 服务端：清缓存并 lite 探测",
    selfHealStepServerDone: "服务端缓存已清理",
    selfHealStepServerFail: "服务端步骤失败",
    selfHealStepClient: "3. 浏览器：清本地缓存并重拉 7 栏",
    selfHealStepClientDone: "本地缓存已清理，已触发重拉",
    selfHealStepResult: "4. 结果",
    selfHealResultOk: "修复完成，数字将很快刷新",
    selfHealResultFail: "修复未完全成功",
    selfHealCopyPackage: "复制诊断包",
    selfHealPackageCopied: "已复制",
    selfHealSupportHint: "若数字仍不对或仍频繁超时，请复制诊断包后通过站内私信联系客服处理。",
    selfHealPackageTitle: (campaignCode, campaignId) =>
      `[独立站统计诊断与修复 · ${campaignCode} · ID ${campaignId ?? "—"}]`,
    selfHealSectionLoadLog: "— 加载诊断 —",
    selfHealSectionServer: "— 服务端自愈 —",
    selfHealSectionClient: "— 浏览器刷新 —",
    selfHealSectionResult: "— 结果 —",
    cumulativeLabel: "累计"
  };
}
