import type { SiteLocale } from "./siteLocaleTypes";
import type { SendListTabId, SendListTabTheme } from "../ui/components/email/campaignSendListUi";

export type EmailCampaignStatsListStrings = {
  sendListTitle: string;
  lastUpdated: string;
  listTransferPending: string;
  tabOpened: string;
  tabSuccess: string;
  tabUnconfirmed: string;
  tabFailed: string;
  tabSubscribe: string;
  tabUnsubscribe: string;
  tabComplaint: string;
  tabAll: string;
  pagerTotal: (total: number, page: number, totalPages: number) => string;
  prevPage: string;
  nextPage: string;
  confirmDelete: string;
  cancel: string;
  delete: string;
  exportCsv: string;
  exporting: string;
  sortByOpens: string;
  sortByOpensDesc: string;
  detailLoading: string;
  detailFailed: string;
  emptyOpened: string;
  emptySuccess: string;
  emptyUnconfirmed: string;
  emptyFailed: string;
  emptySubscribe: string;
  emptyUnsubscribe: string;
  emptyComplaint: string;
  emptyAll: string;
  colIndex: string;
  colEmailContact: string;
  colEmail: string;
  colAction: string;
  liveTableTitle: string;
  liveLoading: string;
  perfTitle: string;
  perfCopied: string;
  perfCopy: string;
  perfRefresh: string;
  perfClear: string;
  perfEmpty: string;
  contactCsvHeaders: string[];
  complianceCsvHeaders: string[];
  confirmDeleteContact: (email: string) => string;
  confirmRemoveSubscribe: (email: string) => string;
  confirmDeleteUnsubWithCrm: (email: string) => string;
  confirmRemoveUnsubEvent: (email: string) => string;
  confirmDeleteComplaintWithCrm: (email: string) => string;
  confirmRemoveComplaintEvent: (email: string) => string;
  bulkDeleteFailed: string;
  bulkDeleting: (done: number, total: number) => string;
  bulkDeletedRefreshing: (n: number) => string;
  selectCampaignHint: string;
  panelOpenedTitle: string;
  panelOpenedDesc: string;
  panelOpenedTruncated: string;
  panelSuccessTitle: string;
  panelSuccessDesc: string;
  panelUnconfirmedTitle: string;
  panelUnconfirmedDesc: string;
  panelFailedTitle: string;
  panelFailedDesc: string;
  panelSubscribeDesc: string;
  deleteSelected: (n: number) => string;
  bulkDeleteHint: string;
  selectAllPageAria: string;
  colContact: string;
  colCompany: string;
  colOpens: string;
  colSuccessCount: string;
  colUnconfirmed: string;
  colFailed: string;
  colIndustry: string;
  colEnterprise: string;
  colJobTitle: string;
  colPhone: string;
  colSend: string;
  colBounce: string;
  deleting: string;
  emptyAllLoadFailed: string;
  bulkDeleteMax: string;
  deleteAll: string;
  deleteAllConfirm: (n: number) => string;
  deleteAllProgress: (done: number, total: number) => string;
  deleteAllDone: (deleted: number, remaining: number) => string;
  /** 删除完成：统计栏数字不变，仅列表与 CRM/行业标签同步 */
  deleteDoneKeepStats: (deleted: number) => string;
  confirmDeleteSelected: (n: number) => string;
  deleteFailedMsg: string;
  deleteDisabledWhileSending: string;
  opensCsvHeader: string;
  liveSendId: string;
  liveRecipient: string;
  liveSmtpStatus: string;
  liveFromEmail: string;
  liveClicks: string;
  liveBounceEvents: string;
  liveComplaintsCol: string;
  liveTime: string;
  liveEmpty: string;
  statusAccepted: string;
  statusFailedLabel: string;
  statusDelivered: string;
  livePagerTotal: (total: number, page: number, totalPages: number) => string;
  perfFilterTestTitle: string;
  perfFilterTestDesc: string;
  perfCopyLogTitle: (campaignId: number | null) => string;
  perfExportTimeLine: (time: string) => string;
  tabCountBadge: (n: number) => string;
  perfStepLabel: (step: string) => string;
};

const TAB_THEMES_BASE: Omit<SendListTabTheme, "label">[] = [
  {
    id: "opened",
    panelBorder: "border-sky-200",
    panelBg: "bg-sky-50/80",
    theadBg: "bg-sky-50",
    rowBorder: "border-sky-100",
    tabActive: "border-sky-500 bg-sky-100 text-sky-950 ring-1 ring-sky-300",
    tabIdle: "border-sky-200 bg-white text-sky-900 hover:bg-sky-50"
  },
  {
    id: "success",
    panelBorder: "border-emerald-200",
    panelBg: "bg-emerald-50/80",
    theadBg: "bg-emerald-50",
    rowBorder: "border-emerald-100",
    tabActive: "border-emerald-500 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300",
    tabIdle: "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
  },
  {
    id: "unconfirmed",
    panelBorder: "border-cyan-200",
    panelBg: "bg-cyan-50/80",
    theadBg: "bg-cyan-50",
    rowBorder: "border-cyan-100",
    tabActive: "border-cyan-500 bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300",
    tabIdle: "border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-50"
  },
  {
    id: "failed",
    panelBorder: "border-rose-200",
    panelBg: "bg-rose-50/80",
    theadBg: "bg-rose-50",
    rowBorder: "border-rose-100",
    tabActive: "border-rose-500 bg-rose-100 text-rose-950 ring-1 ring-rose-300",
    tabIdle: "border-rose-200 bg-white text-rose-900 hover:bg-rose-50"
  },
  {
    id: "subscribe",
    panelBorder: "border-teal-200",
    panelBg: "bg-teal-50/80",
    theadBg: "bg-teal-50",
    rowBorder: "border-teal-100",
    tabActive: "border-teal-500 bg-teal-100 text-teal-950 ring-1 ring-teal-300",
    tabIdle: "border-teal-200 bg-white text-teal-900 hover:bg-teal-50"
  },
  {
    id: "unsubscribe",
    panelBorder: "border-slate-300",
    panelBg: "bg-slate-100/90",
    theadBg: "bg-slate-100",
    rowBorder: "border-slate-200",
    tabActive: "border-slate-500 bg-slate-200 text-slate-950 ring-1 ring-slate-400",
    tabIdle: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
  },
  {
    id: "complaint",
    panelBorder: "border-amber-200",
    panelBg: "bg-amber-50/80",
    theadBg: "bg-amber-50",
    rowBorder: "border-amber-100",
    tabActive: "border-amber-500 bg-amber-100 text-amber-950 ring-1 ring-amber-300",
    tabIdle: "border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
  },
  {
    id: "all",
    panelBorder: "border-indigo-200",
    panelBg: "bg-indigo-50/70",
    theadBg: "bg-indigo-50",
    rowBorder: "border-indigo-100",
    tabActive: "border-indigo-500 bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300",
    tabIdle: "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
  }
];

export function getSendListTabs(locale: SiteLocale): SendListTabTheme[] {
  const s = getEmailCampaignStatsListStrings(locale);
  const labels: Record<SendListTabId, string> = {
    opened: s.tabOpened,
    success: s.tabSuccess,
    unconfirmed: s.tabUnconfirmed,
    failed: s.tabFailed,
    subscribe: s.tabSubscribe,
    unsubscribe: s.tabUnsubscribe,
    complaint: s.tabComplaint,
    all: s.tabAll
  };
  return TAB_THEMES_BASE.map((t) => ({ ...t, label: labels[t.id] }));
}

export function getEmailCampaignStatsListStrings(locale: SiteLocale): EmailCampaignStatsListStrings {
  if (locale === "en") {
    return {
      sendListTitle: "Send recipient list",
      lastUpdated: "Last updated:",
      listTransferPending:
        "Waiting for data transfer, usually about 15–60 seconds; the list and numbers above will refresh — no need to click Refresh repeatedly.",
      tabOpened: "Opened",
      tabSuccess: "Delivered",
      tabUnconfirmed: "Delivered, no feedback",
      tabFailed: "Bounced / failed",
      tabSubscribe: "Subscribed",
      tabUnsubscribe: "Unsubscribed",
      tabComplaint: "Complaints",
      tabAll: "All details",
      pagerTotal: (total, page, totalPages) =>
        `${total} total · page ${total > 0 ? page : 0} / ${totalPages}`,
      prevPage: "Previous",
      nextPage: "Next",
      confirmDelete: "Confirm delete",
      cancel: "Cancel",
      delete: "Delete",
      exportCsv: "Export CSV",
      exporting: "Exporting…",
      sortByOpens: "Sort by opens",
      sortByOpensDesc: "Most opens first",
      detailLoading: "Loading details…",
      detailFailed: "List load failed or timed out — switch tab or click Refresh.",
      emptyOpened: "No opens yet",
      emptySuccess: "No successful deliveries",
      emptyUnconfirmed: "No delivered-without-feedback recipients",
      emptyFailed: "No bounces / failures",
      emptySubscribe: "No subscriptions",
      emptyUnsubscribe: "No unsubscribes",
      emptyComplaint: "No complaints",
      emptyAll: "No send records",
      colIndex: "#",
      colEmailContact: "Email / contact",
      colEmail: "Email",
      colAction: "Action",
      liveTableTitle: "Per-message send detail",
      liveLoading: "Loading…",
      perfTitle: "Stats load diagnostic",
      perfCopied: "Copied",
      perfCopy: "Copy",
      perfRefresh: "Refresh",
      perfClear: "Clear",
      perfEmpty: "Steps appear after selecting a campaign and switching list tabs.",
      contactCsvHeaders: [
        "Industry",
        "Company",
        "Contact",
        "Title",
        "Phone",
        "Fax",
        "Email",
        "Address",
        "Send count",
        "Open count",
        "Bounce/fail count"
      ],
      complianceCsvHeaders: [
        "Industry",
        "Company",
        "Contact",
        "Title",
        "Phone",
        "Fax",
        "Email",
        "Address",
        "Country",
        "Website",
        "LinkedIn",
        "Business line",
        "Email status",
        "Contact status",
        "Event time",
        "Reason"
      ],
      confirmDeleteContact: (email) => `Delete contact ${email}?\nRemoves from CRM and groups.`,
      confirmRemoveSubscribe: (email) =>
        `Remove subscribed contact ${email}?\nAlso removes from CRM, groups, industry counts, and contact DB.`,
      confirmDeleteUnsubWithCrm: (email) =>
        `Delete unsubscribed contact ${email}?\nRemoves from CRM, groups, industry counts, and contact DB.`,
      confirmRemoveUnsubEvent: (email) =>
        `Delete unsubscribed contact ${email}?\nRemoves from CRM, groups, industry counts, and contact DB.`,
      confirmDeleteComplaintWithCrm: (email) =>
        `Delete complained contact ${email}?\nRemoves from CRM, groups, industry counts, and contact DB.`,
      confirmRemoveComplaintEvent: (email) =>
        `Delete complained contact ${email}?\nRemoves from CRM, groups, industry counts, and contact DB.`,
      bulkDeleteFailed: "Delete selected failed contacts",
      bulkDeleting: (done, total) => `Deleting ${done} / ${total} contacts…`,
      bulkDeletedRefreshing: (n) => `Deleted ${n}; refreshing list…`,
      selectCampaignHint: "Select a campaign to view contact send status.",
      panelOpenedTitle: "Opened (tracked)",
      panelOpenedDesc: "Sorted by open count; matches date/sender filters.",
      panelOpenedTruncated: "Showing only the first fetched pages of contacts.",
      panelSuccessTitle: "Delivered",
      panelSuccessDesc: "Per contact: at least one successful send, not counted as bounce.",
      panelUnconfirmedTitle: "Delivered, no feedback",
      panelUnconfirmedDesc: "SMTP accepted, with no open / subscribe / unsubscribe / complaint signal yet.",
      panelFailedTitle: "Bounced / failed",
      panelFailedDesc: "Per contact: one row per recipient email (not cumulative sends).",
      panelSubscribeDesc: "Recipient confirmed via in-email subscribe link.",
      deleteSelected: (n) => `Delete selected (${n})`,
      bulkDeleteHint: "Check rows to delete, or use Delete all (25 per batch).",
      selectAllPageAria: "Select all on this page",
      colContact: "Contact",
      colCompany: "Company",
      colOpens: "Opens",
      colSuccessCount: "Success count",
      colUnconfirmed: "Unconfirmed",
      colFailed: "Failed",
      colIndustry: "Industry",
      colEnterprise: "Company",
      colJobTitle: "Title",
      colPhone: "Phone",
      colSend: "Sends",
      colBounce: "Bounces",
      deleting: "Deleting…",
      emptyAllLoadFailed: "Full list load failed or timed out — retry or switch tab.",
      bulkDeleteMax: "You can delete at most 200 at once — reduce selection and retry.",
      deleteAll: "Delete all",
      deleteAllConfirm: (n) => `Delete all ${n} entries in this list? This cannot be undone.`,
      deleteAllProgress: (done, total) => `Deleting ${done} / ${total}…`,
      deleteAllDone: (deleted, remaining) =>
        `Deleted ${deleted}; ${remaining} remaining in this tab.`,
      deleteDoneKeepStats: (deleted) =>
        `Deleted ${deleted}. Summary counts unchanged; list updated (CRM & industry tags synced).`,
      confirmDeleteSelected: (n) =>
        `Delete ${n} selected contacts?\nRemoves from CRM, groups, and contact DB.`,
      deleteFailedMsg: "Delete failed",
      deleteDisabledWhileSending: "This campaign is sending. Delete recipients after the campaign finishes.",
      opensCsvHeader: "Open count",
      liveSendId: "Send ID",
      liveRecipient: "Recipient",
      liveSmtpStatus: "SMTP status",
      liveFromEmail: "From",
      liveClicks: "Clicks",
      liveBounceEvents: "Bounce events",
      liveComplaintsCol: "Complaints",
      liveTime: "Time",
      liveEmpty: "No send records (or empty for current date/sender filter)",
      statusAccepted: "Accepted",
      statusFailedLabel: "Failed",
      statusDelivered: "Delivered",
      livePagerTotal: (total, page, totalPages) =>
        `${total} messages · page ${page} / ${totalPages}`,
      perfFilterTestTitle: "List filter self-test",
      perfFilterTestDesc:
        "After changing opened/success/failed SQL filters, run the command below from repo root.",
      perfCopyLogTitle: (campaignId) =>
        `[Campaign stats · load diagnostic · campaign ID ${campaignId ?? "—"}]`,
      perfExportTimeLine: (time) => `Exported: ${time}`,
      tabCountBadge: (n) => `(${n})`,
      perfStepLabel: (step) => formatStatsPerfStepLabel(step, "en")
    };
  }
  return {
    sendListTitle: "邮件发送列表",
    lastUpdated: "最近更新时间：",
    listTransferPending:
      "等待数据传输中，通常约 15～60 秒；发送名单与上方数字会陆续刷新，无需反复点击「刷新」。",
    tabOpened: "已打开",
    tabSuccess: "发送成功",
    tabUnconfirmed: "已投递无反馈",
    tabFailed: "退回/失败",
    tabSubscribe: "已订阅",
    tabUnsubscribe: "已退订",
    tabComplaint: "投诉",
    tabAll: "全量明细",
    pagerTotal: (total, page, totalPages) =>
      `共 ${total} 条 · 第 ${total > 0 ? page : 0} / ${totalPages} 页`,
    prevPage: "上一页",
    nextPage: "下一页",
    confirmDelete: "确认删除",
    cancel: "取消",
    delete: "删除",
    exportCsv: "导出 CSV",
    exporting: "导出中…",
    sortByOpens: "按打开次数排序",
    sortByOpensDesc: "打开次数从高到低",
    detailLoading: "明细加载中…",
    detailFailed: "名单加载失败或超时，请切换标签后重试，或点页面「刷新」。",
    emptyOpened: "暂无打开记录",
    emptySuccess: "暂无发送成功记录",
    emptyUnconfirmed: "暂无已投递无反馈记录",
    emptyFailed: "暂无退回/失败记录",
    emptySubscribe: "暂无订阅记录",
    emptyUnsubscribe: "暂无退订记录",
    emptyComplaint: "暂无投诉记录",
    emptyAll: "暂无发送记录",
    colIndex: "序号",
    colEmailContact: "邮箱 / 联系人",
    colEmail: "邮箱",
    colAction: "操作",
    liveTableTitle: "单次发送明细（每一封）",
    liveLoading: "加载中…",
    perfTitle: "统计加载诊断",
    perfCopied: "已复制",
    perfCopy: "复制",
    perfRefresh: "刷新",
    perfClear: "清空",
    perfEmpty: "选择活动并切换名单标签后，步骤会出现在此。",
    contactCsvHeaders: [
      "行业",
      "企业名称",
      "联系人",
      "职位",
      "电话",
      "传真",
      "邮箱",
      "联系地址",
      "发送次数",
      "打开次数",
      "退回失败次数"
    ],
    complianceCsvHeaders: [
      "行业",
      "企业名称",
      "联系人",
      "职位",
      "电话",
      "传真",
      "邮箱",
      "联系地址",
      "国家",
      "网址",
      "LinkedIn",
      "业务线",
      "邮箱状态",
      "联系人状态",
      "事件时间",
      "原因"
    ],
    confirmDeleteContact: (email) => `确认删除联系人 ${email} 吗？\n将同步从 CRM 与分组中移除。`,
    confirmRemoveSubscribe: (email) =>
      `确认删除已订阅联系人 ${email} 吗？\n将同步从 CRM、邮件分组、行业标签人数与联系人库中移除。`,
    confirmDeleteUnsubWithCrm: (email) =>
      `确认删除退订联系人 ${email} 吗？\n将同步从 CRM、邮件分组、行业标签人数与联系人库中移除。`,
    confirmRemoveUnsubEvent: (email) =>
      `确认删除退订联系人 ${email} 吗？\n将同步从 CRM、邮件分组、行业标签人数与联系人库中移除。`,
    confirmDeleteComplaintWithCrm: (email) =>
      `确认删除投诉联系人 ${email} 吗？\n将同步从 CRM、邮件分组、行业标签人数与联系人库中移除。`,
    confirmRemoveComplaintEvent: (email) =>
      `确认删除投诉联系人 ${email} 吗？\n将同步从 CRM、邮件分组、行业标签人数与联系人库中移除。`,
    bulkDeleteFailed: "删除所选失败联系人",
    bulkDeleting: (done, total) => `正在删除 ${done} / ${total} 条联系人…`,
    bulkDeletedRefreshing: (n) => `已删除 ${n} 条，列表刷新中…`,
    selectCampaignHint: "请选择营销活动后查看该活动下的联系人发送情况。",
    panelOpenedTitle: "已打开阅读（真实追踪）",
    panelOpenedDesc: "按打开次数从高到低；与所选日期/发件人筛选一致。",
    panelOpenedTruncated: "仅展示已拉取的前若干页联系人。",
    panelSuccessTitle: "已发送成功",
    panelSuccessDesc: "联系人维度：至少一次发送成功且未计为退回。",
    panelUnconfirmedTitle: "已投递无反馈",
    panelUnconfirmedDesc: "对方服务器已受理，但暂无打开、订阅、退订、投诉、退信等后续信号；无法确认收件箱是否实际显示。",
    panelFailedTitle: "已退回 / 发送失败",
    panelFailedDesc: "联系人维度：每位收件邮箱计 1（失败/退回），非发送次数累加。",
    panelSubscribeDesc: "收件人点击邮件内订阅链接确认继续接收。",
    deleteSelected: (n) => `删除已选（${n}）`,
    bulkDeleteHint: "可逐条删除，或使用「全部删除」（每批 25 条自动跑完）。",
    selectAllPageAria: "全选本页",
    colContact: "联系人",
    colCompany: "公司",
    colOpens: "打开",
    colSuccessCount: "成功次数",
    colUnconfirmed: "无反馈",
    colFailed: "失败",
    colIndustry: "行业",
    colEnterprise: "企业",
    colJobTitle: "职位",
    colPhone: "电话",
    colSend: "发送",
    colBounce: "退回",
    deleting: "删除中…",
    emptyAllLoadFailed: "全量明细加载失败或超时，请重试或切换标签。",
    bulkDeleteMax: "单次最多删除 200 条，请减少勾选数量后重试。",
    deleteAll: "全部删除",
    deleteAllConfirm: (n) => `确认删除本列表全部 ${n} 条记录吗？此操作不可撤销。`,
    deleteAllProgress: (done, total) => `正在删除 ${done} / ${total} 条…`,
    deleteAllDone: (deleted, remaining) => `已删除 ${deleted} 条，当前剩余 ${remaining} 条`,
    deleteDoneKeepStats: (deleted) =>
      `已删除 ${deleted} 条；上方统计栏数字不变，列表已更新（已同步 CRM 与行业标签）。`,
    confirmDeleteSelected: (n) =>
      `确认删除已选择的 ${n} 条联系人吗？\n将同步从 CRM、邮件目标分组与联系人库中移除。`,
    deleteFailedMsg: "删除失败",
    deleteDisabledWhileSending: "活动发送中，发送列表需等活动结束后再删除。",
    opensCsvHeader: "打开次数",
    liveSendId: "发送ID",
    liveRecipient: "收件人",
    liveSmtpStatus: "SMTP状态",
    liveFromEmail: "发件邮箱",
    liveClicks: "点击",
    liveBounceEvents: "退信事件",
    liveComplaintsCol: "投诉",
    liveTime: "时间",
    liveEmpty: "暂无发送记录（或当前日期/发件人筛选下为空）",
    statusAccepted: "已受理",
    statusFailedLabel: "失败",
    statusDelivered: "已送达",
    livePagerTotal: (total, page, totalPages) =>
      `共 ${total} 封 · 第 ${page} / ${totalPages} 页`,
    perfFilterTestTitle: "名单筛选逻辑自测",
    perfFilterTestDesc: "修改「已打开 / 成功 / 失败」SQL 筛选后，在仓库根目录执行下方命令，确认 tab 条件未写错。",
    perfCopyLogTitle: (campaignId) => `[营销活动统计 · 加载诊断 · 活动 ID ${campaignId ?? "—"}]`,
    perfExportTimeLine: (time) => `导出时间：${time}`,
    tabCountBadge: (n) => `（${n}）`,
    perfStepLabel: (step) => formatStatsPerfStepLabel(step, "zh")
  };
}

const PERF_TAB_LABEL_EN: Record<string, string> = {
  opened: "Opened",
  success: "Delivered",
  unconfirmed: "Delivered, no feedback",
  failed: "Bounced/failed",
  subscribe: "Subscribed",
  unsubscribe: "Unsubscribed",
  complaint: "Complaints",
  all: "All"
};

const PERF_TAB_LABEL_ZH: Record<string, string> = {
  opened: "已打开",
  success: "发送成功",
  unconfirmed: "已投递无反馈",
  failed: "退回/失败",
  subscribe: "已订阅",
  unsubscribe: "已退订",
  complaint: "投诉",
  all: "全量明细"
};

function formatStatsPerfStepLabel(step: string, locale: SiteLocale): string {
  const en = locale === "en";
  const legacy: Record<string, string> = en
    ? {
        "stats 面板": "Stats panel",
        "7栏-fast-tab-totals": "Metrics fast · tab totals",
        "7栏-fast-compliance": "Metrics fast · compliance",
        "7栏-fast-engagement": "Metrics fast · engagement",
        "切换活动 ID，重置发送名单状态": "Campaign changed · reset list state",
        "tab-totals 命中缓存": "Tab totals cache hit"
      }
    : {};
  if (legacy[step]) return legacy[step];

  const map: Record<string, string> = en
    ? {
        "stats-panel": "Stats panel",
        "metrics-fast-tab-totals": "Metrics fast · tab totals",
        "metrics-fast-compliance": "Metrics fast · compliance",
        "metrics-fast-engagement": "Metrics fast · engagement",
        "change-campaign-reset-list": "Campaign changed · reset list state",
        "tab-totals-cache": "Tab totals cache hit",
        "tab-totals": "Tab totals API",
        "send-contacts:all": "Send contacts · all",
        complaints: "Complaints export",
        subscribes: "Subscribes export",
        unsubscribes: "Unsubscribes export",
        "delete-contact": "Delete contact",
        "self-heal-server": "Self-heal · server",
        "self-heal-client": "Self-heal · browser",
        "self-heal-finish": "Self-heal · finish"
      }
    : {
        "stats-panel": "stats 面板",
        "metrics-fast-tab-totals": "7栏-fast-tab-totals",
        "metrics-fast-compliance": "7栏-fast-compliance",
        "metrics-fast-engagement": "7栏-fast-engagement",
        "change-campaign-reset-list": "切换活动 ID，重置发送名单状态",
        "tab-totals-cache": "tab-totals 命中缓存",
        "tab-totals": "tab-totals",
        "send-contacts:all": "send-contacts:all",
        complaints: "complaints",
        subscribes: "subscribes",
        unsubscribes: "unsubscribes",
        "delete-contact": "delete-contact",
        "self-heal-server": "诊断与修复 · 服务端",
        "self-heal-client": "诊断与修复 · 浏览器",
        "self-heal-finish": "诊断与修复 · 完成"
      };

  if (map[step]) return map[step];

  const listCache = step.match(/^list-tab-cache:(.+)$/);
  if (listCache) {
    const tab = listCache[1] ?? "";
    const tabLabel = (en ? PERF_TAB_LABEL_EN : PERF_TAB_LABEL_ZH)[tab] ?? tab;
    return en ? `List ${tabLabel} cache hit` : `名单 ${tabLabel} 命中缓存`;
  }

  const sendContacts = step.match(/^send-contacts:(.+)$/);
  if (sendContacts) {
    const tab = sendContacts[1] ?? "";
    const tabLabel = (en ? PERF_TAB_LABEL_EN : PERF_TAB_LABEL_ZH)[tab] ?? tab;
    return en ? `Send contacts · ${tabLabel}` : `send-contacts:${tab}`;
  }

  const legacyList = step.match(/^名单 (.+) 命中缓存$/);
  if (legacyList && en) {
    return `List ${legacyList[1]} cache hit`;
  }

  return step;
}

export function formatStatsPerfStep(step: string, locale: SiteLocale): string {
  return formatStatsPerfStepLabel(step, locale);
}
