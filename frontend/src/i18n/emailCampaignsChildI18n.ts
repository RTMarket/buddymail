import type { SiteLocale } from "./siteLocaleTypes";
import type { EmailChannelKind } from "../lib/dedicatedEntitlements";
import type { FormalSendReportSnapshot } from "../lib/marketingSendMonitor";

export type EmailCampaignsChildStrings = {
  channelLabel: (ch: EmailChannelKind) => string;
  importPickerLabel: string;
  importPickerPlaceholder: string;
  importPickerEmptyHint: string;
  laneFiltersTitle: string;
  laneFiltersHint: string;
  selectLane: string;
  packageChannelLabel: string;
  allLanes: string;
  selectLanePlaceholder: string;
  laneOption: (laneIndex: number, label: string, domainCount: number, sending: boolean) => string;
  laneDomainsSummary: (n: number, channelHint: string) => string;
  laneNoDomains: string;
  selectLaneFirst: string;
  channelOption: (ch: EmailChannelKind, count: number) => string;
  channelNone: string;
  channelEmailCount: (n: number) => string;
  senderDomain: string;
  channelNoDomains: string;
  laneFiltersOrderHint: string;
  dedicatedServerTag: (id: number) => string;
  multiLaneStackHint: (laneCount: number) => string;
  premiumMultiLaneStackHint: (laneCount: number, perLaneCap: number) => string;
  activityUnnamed: string;
  activityInternalId: (id: number) => string;
  activitySentNoResend: string;
  activitySent: string;
  activitySentShort: string;
  activityTestable: string;
  noActivity: string;
  noActivityId: string;
  selectActivity: string;
  loadingActivities: string;
  activityListMeta: (total: number, visible: number) => string;
  activityBlockedSent: string;
  activityBlockedOtherLane: string;
  activityBlockedSending: string;
  testCardsEmpty: string;
  testCardsHint: (n: number) => string;
  testCardsAria: string;
  liveProgressRemain: (remain: number, hms: string, avgSec?: number) => string;
  liveProgressFinished: string;
  liveProgressCounting: string;
  formatRemainHms: (sec: number) => string;
  sendProgressStatus: (pct: number, isSending: boolean) => string;
  plannedAudienceLine: (planned: number, totalContacts?: number | null) => string;
  formatFormalIndustryLabels: (tags: string[]) => string;
  formatFormalSendCompletionLines: (s: FormalSendReportSnapshot) => string[];
  scheduledTitle: string;
  scheduledLaneDisabled: string;
  scheduledCollapse: string;
  scheduledExpand: string;
  scheduledFull: string;
  scheduledNewTitle: string;
  scheduledNameLabel: string;
  scheduledNamePlaceholder: string;
  scheduledDateLabel: string;
  scheduledHour: string;
  scheduledMinute: string;
  scheduledTarget: (industries: string, count: number, hoursHint: string) => string;
  scheduledCreating: string;
  scheduledCreate: string;
  scheduledCancel: string;
  scheduledErrName: string;
  scheduledErrIndustries: string;
  scheduledErrAudience: string;
  scheduledErrCampaign: string;
  scheduledCreated: (msg: string) => string;
  scheduledCreateFailed: string;
  scheduledConflict: (name: string, at: string) => string;
  scheduledConflictWait: string;
  scheduledCancelTask: string;
  scheduledStatusPending: string;
  scheduledStatusConfirm: string;
  scheduledStatusRunning: string;
  scheduledAudience: (n: number) => string;
  scheduledHoursHint: (h: number) => string;
  diagnosticTitle: (lane?: string) => string;
  diagnosticDesc: string;
  diagnosticScopedDomains: (emails: string) => string;
  diagnosticGenerating: string;
  diagnosticGenerate: string;
  diagnosticCopied: string;
  diagnosticCopy: string;
  diagnosticSelectCampaign: string;
  diagnosticSummary: string;
  diagnosticAttempts: string;
  diagnosticAccepted: string;
  diagnosticSyncFailed: string;
  diagnosticBounces: string;
  diagnosticColRecipient: string;
  diagnosticColStatus: string;
  diagnosticColError: string;
  diagnosticBounceAt: (at: string) => string;
  diagnosticClipHeader: (args: {
    campaignCode: string;
    campaignId: number;
    laneLabel?: string;
    scopedDomains?: string;
    lite?: boolean;
  }) => string;
  diagnosticClipGeneratedAt: (time: string) => string;
  diagnosticClipSummaryTitle: string;
  diagnosticClipAttempts: string;
  diagnosticClipAccepted: string;
  diagnosticClipSyncFailed: string;
  diagnosticClipSendingNow: string;
  diagnosticClipBounceEvents: string;
  diagnosticClipBounceMatched: string;
  diagnosticClipDeliveredCorrected: string;
  diagnosticClipFailedCorrected: string;
  diagnosticClipSamplesTitle: string;
};

function formatRemainHmsEn(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function formatRemainHmsZh(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} 小时 ${m} 分 ${r} 秒`;
  if (m > 0) return `${m} 分 ${r} 秒`;
  return `${r} 秒`;
}

export function getEmailCampaignsChildStrings(locale: SiteLocale): EmailCampaignsChildStrings {
  if (locale === "en") {
    const channelLabel = (ch: EmailChannelKind) =>
      ({ light: "Light", medium: "Medium", bulk: "High-volume", ultra: "Ultra" } as const)[ch];
    return {
      channelLabel,
      importPickerLabel: "Import industry tag (single)",
      importPickerPlaceholder: "Select industry tag…",
      importPickerEmptyHint: "No industry tags yet. Create one above first.",
      laneFiltersTitle: "Sending lanes & email",
      laneFiltersHint: "Matches the dedicated lanes workbench above",
      selectLane: "Select lane",
      packageChannelLabel: "Plan channel",
      allLanes: "All lanes",
      selectLanePlaceholder: "Select lane…",
      laneOption: (laneIndex, label, domainCount, sending) =>
        `Lane ID ${laneIndex} · ${label}${domainCount > 0 ? ` · ${domainCount} domain(s)` : " · no domains"}${sending ? " · sending" : ""}`,
      laneDomainsSummary: (n, channelHint) =>
        n > 0 ? `${n} sending domain(s)${channelHint}` : channelHint,
      laneNoDomains: "No sending domains on this lane — bind under Settings → Email",
      selectLaneFirst: "Select a lane first",
      channelOption: (ch, count) =>
        `Channel ID ${ch} · ${channelLabel(ch)}${count === 0 ? " (none)" : ` · ${count} domain(s)`}`,
      channelNone: "(none)",
      channelEmailCount: (n) => (n > 0 ? ` · ${n} mailbox(es)` : " · no mailboxes on channel"),
      senderDomain: "Sending domain",
      channelNoDomains: "No domains on this channel",
      laneFiltersOrderHint:
        "Order: lane → plan channel → sending domain. Shows your last selection; lanes without domains leave the last two empty.",
      dedicatedServerTag: (id) => `dedicated#${id}`,
      multiLaneStackHint: (laneCount) =>
        `Multi-lane plans: independent send window per lane (up to ${laneCount} concurrent). Lane caps are total sends/day; plan cap is delivered success combined.`,
      premiumMultiLaneStackHint: (laneCount, perLaneCap) =>
        `50k/100k daily plans: up to ${perLaneCap.toLocaleString()} successful deliveries per lane per day (${laneCount} lane(s) max in parallel; matches the cap shown beside each lane’s send total).`,
      activityUnnamed: "Unnamed campaign",
      activityInternalId: (id) => `Internal ID ${id}`,
      activitySentNoResend: "Sent · cannot resend",
      activitySent: "Sent",
      activitySentShort: "Sent",
      activityTestable: "Test",
      noActivity: "No campaigns",
      noActivityId: "No campaign ID",
      selectActivity: "Select campaign",
      loadingActivities: "Loading campaigns…",
      activityListMeta: (total, visible) =>
        `${total} item(s) · list shows ~${visible}; scroll for more`,
      activityBlockedSent: "This campaign was already sent and cannot be selected again.",
      activityBlockedOtherLane: "This campaign is used on another lane; pick another.",
      activityBlockedSending: "Cannot change campaign ID while sending.",
      testCardsEmpty: "No campaigns yet — save one above first.",
      testCardsHint: (n) =>
        `Showing recent ${n} campaign(s); click a card to select (current selection kept if not listed)`,
      testCardsAria: "Recent campaigns",
      liveProgressRemain: (remain, hms, avgSec) =>
        `Remaining ${remain} · about ${hms} until complete` +
        (avgSec != null && avgSec > 0 ? ` · ~${avgSec.toFixed(1)}s/email` : ""),
      liveProgressFinished: "This run finished",
      liveProgressCounting: "Counting sendable recipients…",
      formatRemainHms: formatRemainHmsEn,
      sendProgressStatus: (pct, isSending) => {
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        if (p >= 100) return "✅ Complete";
        if (!isSending) return p > 0 ? "Finished" : "Not sending";
        if (p <= 0) return "Sending…";
        return `Sending… ${p}%`;
      },
      plannedAudienceLine: (planned, totalContacts) => {
        const n = Math.max(0, Math.floor(planned));
        if (n <= 0) return "Planned send: calculating…";
        const total = totalContacts != null ? Math.max(0, Math.floor(totalContacts)) : 0;
        if (total > n) {
          return `Planned ${total.toLocaleString()} contact(s) · ${n.toLocaleString()} unique email(s)`;
        }
        return `Planned ${n.toLocaleString()} contact(s) (${n.toLocaleString()} email(s))`;
      },
      formatFormalIndustryLabels: (tags) => {
        const list = tags.map((t) => String(t ?? "").trim()).filter(Boolean);
        if (list.length === 0) return "All industries (campaign audience)";
        if (list.length <= 4) return list.join(", ");
        return `${list.slice(0, 4).join(", ")} +${list.length - 4} more`;
      },
      formatFormalSendCompletionLines: (s) => {
        const code = s.campaignCode.trim() || String(s.campaignId).padStart(6, "0");
        const name = s.campaignName.trim() || "Unnamed campaign";
        const industries = s.industryLabels.trim() || "—";
        const emails = s.fromEmails.trim() || "—";
        const planned = Math.max(0, Math.floor(s.plannedRecipients));
        const attempted = Math.max(0, Math.floor(s.attempted));
        const sent = Math.max(0, Math.floor(s.sent));
        const failed = Math.max(0, Math.floor(s.failed));
        const head =
          s.kind === "done"
            ? `Campaign ID ${code} · ${name} · complete ✅`
            : s.kind === "stop"
              ? `Campaign ID ${code} · ${name} · stopped`
              : `Campaign ID ${code} · ${name} · paused`;
        if (s.kind === "stop") {
          return [
            head,
            `Industries: ${industries}`,
            `Planned ${planned.toLocaleString()} · from ${emails}`,
            `Attempted ${attempted.toLocaleString()}`,
            `Duration / send time: ${s.sendTimeLabel.trim() || "—"}`
          ];
        }
        return [
          head,
          `Industries: ${industries}`,
          `Planned ${planned.toLocaleString()} · from ${emails}`,
          `Attempted ${attempted.toLocaleString()} · OK ${sent.toLocaleString()} · failed ${failed.toLocaleString()}`,
          `Duration / send time: ${s.sendTimeLabel.trim() || "—"}`
        ];
      },
      scheduledTitle: "Scheduled send tasks",
      scheduledLaneDisabled: "Lane not provisioned",
      scheduledCollapse: "Collapse",
      scheduledExpand: "New",
      scheduledFull: "Max 3 tasks — wait for completion or cancel one",
      scheduledNewTitle: "New scheduled send",
      scheduledNameLabel: "Campaign name",
      scheduledNamePlaceholder: "Campaign name",
      scheduledDateLabel: "Date (Asia/Shanghai)",
      scheduledHour: "Hour",
      scheduledMinute: "Min",
      scheduledTarget: (industries, count, hoursHint) =>
        `Target: ${industries} · ${count.toLocaleString()} recipients · ${hoursHint}`,
      scheduledCreating: "Creating…",
      scheduledCreate: "Create task",
      scheduledCancel: "Cancel",
      scheduledErrName: "Enter a campaign name.",
      scheduledErrIndustries: "Select target industries above first.",
      scheduledErrAudience: "No sendable audience.",
      scheduledErrCampaign: "Select a campaign ID on this lane first.",
      scheduledCreated: (msg) => `✅ Created. ${msg}`,
      scheduledCreateFailed: "Create failed.",
      scheduledConflict: (name, at) =>
        `Scheduled task “${name}” is due (${at}), but this lane is sending another campaign.`,
      scheduledConflictWait: "System will wait up to 5 minutes then switch automatically.",
      scheduledCancelTask: "Cancel this scheduled task",
      scheduledStatusPending: "Waiting",
      scheduledStatusConfirm: "Awaiting confirm",
      scheduledStatusRunning: "Running",
      scheduledAudience: (n) => `${n.toLocaleString()} recipients`,
      scheduledHoursHint: (h) => `~${h}h (about 2h per 1000 emails)`,
      diagnosticTitle: (lane) => `Delivery diagnostics${lane ? ` · ${lane}` : ""}`,
      diagnosticDesc:
        "On blast errors, bounces or sync failures: generate diagnostics and copy for support (failures, bounces, messageId, recent samples).",
      diagnosticScopedDomains: (emails) => `Scoped to lane domains: ${emails}`,
      diagnosticGenerating: "Generating…",
      diagnosticGenerate: "Generate diagnostics",
      diagnosticCopied: "Copied",
      diagnosticCopy: "Copy log",
      diagnosticSelectCampaign: "Select a campaign ID, or use the lane’s last sent campaign.",
      diagnosticSummary: "Summary",
      diagnosticAttempts: "Attempts",
      diagnosticAccepted: "Accepted",
      diagnosticSyncFailed: "Sync failed",
      diagnosticBounces: "Bounce events",
      diagnosticColRecipient: "Recipient",
      diagnosticColStatus: "Status",
      diagnosticColError: "Error / bounce",
      diagnosticBounceAt: (at) => `Bounced: ${at}`,
      diagnosticClipHeader: ({ campaignCode, campaignId, laneLabel, scopedDomains, lite }) => {
        const parts = [
          `Delivery diagnostics · campaign ${campaignCode} · id ${campaignId}`,
          laneLabel ? laneLabel : "",
          scopedDomains ? `domains ${scopedDomains}` : "",
          lite ? "lite" : ""
        ].filter(Boolean);
        return `[${parts.join(" · ")}]`;
      },
      diagnosticClipGeneratedAt: (time) => `Generated: ${time}`,
      diagnosticClipSummaryTitle: "Summary",
      diagnosticClipAttempts: "Attempts",
      diagnosticClipAccepted: "Accepted (SMTP/provider)",
      diagnosticClipSyncFailed: "Sync send failures",
      diagnosticClipSendingNow: "Sending rows now",
      diagnosticClipBounceEvents: "Bounce events",
      diagnosticClipBounceMatched: "Bounces matched to sends",
      diagnosticClipDeliveredCorrected: "Delivered (corrected)",
      diagnosticClipFailedCorrected: "Failed (corrected)",
      diagnosticClipSamplesTitle: "Last 20 send samples"
    };
  }

  const channelLabel = (ch: EmailChannelKind) =>
    ({ light: "轻量", medium: "中量", bulk: "巨量", ultra: "超量" } as const)[ch];

  return {
    channelLabel,
    importPickerLabel: "导入行业标签（单选）",
    importPickerPlaceholder: "请选择行业标签…",
    importPickerEmptyHint: "暂无行业标签。请先上方「新建行业标签」创建。",
    laneFiltersTitle: "发信专线与邮箱",
    laneFiltersHint: "与下方「专线工作台」登记信息一致",
    selectLane: "选择专线",
    packageChannelLabel: "套餐通道",
    allLanes: "全部专线",
    selectLanePlaceholder: "请选择专线…",
    laneOption: (laneIndex, label, domainCount, sending) =>
      `专线 ID ${laneIndex} · ${label}${domainCount > 0 ? ` · ${domainCount} 域` : " · 未绑域"}${sending ? " · 发送中" : ""}`,
    laneDomainsSummary: (n, channelHint) => (n > 0 ? `${n} 个发信域${channelHint}` : channelHint),
    laneNoDomains: "该专线暂无发信域，请至「设置 · 邮件」绑定",
    selectLaneFirst: "请先选择专线",
    channelOption: (ch, count) =>
      `通道 ID ${ch} · ${channelLabel(ch)}${count === 0 ? "（暂无）" : ` · ${count} 域`}`,
    channelNone: "（暂无）",
    channelEmailCount: (n) => (n > 0 ? ` · ${n} 个邮箱` : " · 该通道暂无邮箱"),
    senderDomain: "发信域名",
    channelNoDomains: "该通道暂无发信域",
    laneFiltersOrderHint:
      "顺序：专线 → 套餐通道 → 发信域名。默认展示本账号最近选用的组合；未绑定发信域的专线后两栏留空。",
    dedicatedServerTag: (id) => `专服#${id}`,
    multiLaneStackHint: (laneCount) =>
      `混元及以上：每条专线独立发送窗口（同时最多 ${laneCount} 场）。专线硬闸为发送总数/日（混元 2 万、日发 4 万起 2.5 万/线）；套餐日发为送达成功合计。`,
    premiumMultiLaneStackHint: (laneCount, perLaneCap) =>
      `日发 5 万/10 万套餐：每条专线当日成功送达上限 ${perLaneCap.toLocaleString("zh-CN")} 封（最多 ${laneCount} 条专线并行；与下方「本专线今日发送总数」右侧上限一致）。`,
    activityUnnamed: "未命名活动",
    activityInternalId: (id) => `内部 ID ${id}`,
    activitySentNoResend: "已发送 · 不可再发",
    activitySent: "已发送",
    activitySentShort: "已发",
    activityTestable: "可测",
    noActivity: "暂无活动",
    noActivityId: "暂无活动 ID",
    selectActivity: "请选择活动",
    loadingActivities: "加载活动…",
    activityListMeta: (total, visible) =>
      `共 ${total} 条 · 列表区约显示 ${visible} 条，其余请下拉滚动`,
    activityBlockedSent: "该活动已发送过，不可重复选择。",
    activityBlockedOtherLane: "该活动已被其它专线选用，请选择其它活动。",
    activityBlockedSending: "发送中不可改选活动 ID。",
    testCardsEmpty: "暂无活动，请先在上方保存活动。",
    testCardsHint: (n) => `展示近期 ${n} 个活动（点击卡片选中；不在列表中的已选活动会置顶保留）`,
    testCardsAria: "近期活动",
    liveProgressRemain: (remain, hms, avgSec) =>
      `剩余 ${remain} 封 · 距离发送完成还需 ${hms}` +
      (avgSec != null && avgSec > 0 ? ` · 约 ${avgSec.toFixed(1)} 秒/封` : ""),
    liveProgressFinished: "本轮发送已结束",
    liveProgressCounting: "正在统计可发人数…",
    formatRemainHms: formatRemainHmsZh,
    sendProgressStatus: (pct, isSending) => {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      if (p >= 100) return "✅ 已完成";
      if (!isSending) return p > 0 ? "已结束" : "未在发送";
      if (p <= 0) return "发送中…";
      return `发送中… ${p}%`;
    },
    plannedAudienceLine: (planned, totalContacts) => {
      const n = Math.max(0, Math.floor(planned));
      if (n <= 0) return "计划发送：计算中…";
      const total = totalContacts != null ? Math.max(0, Math.floor(totalContacts)) : 0;
      if (total > n) {
        return `计划发送 ${total.toLocaleString()} 个联系人 · ${n.toLocaleString()} 个唯一邮箱`;
      }
      return `计划发送 ${n.toLocaleString()} 个联系人（${n.toLocaleString()} 个邮箱）`;
    },
    formatFormalIndustryLabels: (tags) => {
      const list = tags.map((t) => String(t ?? "").trim()).filter(Boolean);
      if (list.length === 0) return "未限定行业（按活动受众）";
      if (list.length <= 4) return list.join("、");
      return `${list.slice(0, 4).join("、")} 等 ${list.length} 个`;
    },
    formatFormalSendCompletionLines: (s) => {
      const code = s.campaignCode.trim() || String(s.campaignId).padStart(6, "0");
      const name = s.campaignName.trim() || "未命名活动";
      const industries = s.industryLabels.trim() || "—";
      const emails = s.fromEmails.trim() || "—";
      const planned = Math.max(0, Math.floor(s.plannedRecipients));
      const attempted = Math.max(0, Math.floor(s.attempted));
      const sent = Math.max(0, Math.floor(s.sent));
      const failed = Math.max(0, Math.floor(s.failed));
      const head =
        s.kind === "done"
          ? `活动 ID ${code} · ${name} · 已完成 ✅`
          : s.kind === "stop"
            ? `活动 ID ${code} · ${name} · 已停止发送`
            : `活动 ID ${code} · ${name} · 已暂停发送`;
      if (s.kind === "stop") {
        return [
          head,
          `发送行业：${industries}`,
          `计划人数 ${planned.toLocaleString()} · 发信邮箱 ${emails}`,
          `实际发送 ${attempted.toLocaleString()} 封`,
          `活动发送时间 ${s.sendTimeLabel.trim() || "—"}`
        ];
      }
      return [
        head,
        `发送行业：${industries}`,
        `计划人数 ${planned.toLocaleString()} · 发信邮箱 ${emails}`,
        `实际发送 ${attempted.toLocaleString()} 封 · 成功 ${sent.toLocaleString()} 封 · 失败 ${failed.toLocaleString()} 封`,
        `活动发送时间 ${s.sendTimeLabel.trim() || "—"}`
      ];
    },
    scheduledTitle: "特定时间发送任务",
    scheduledLaneDisabled: "专线未开通",
    scheduledCollapse: "收起",
    scheduledExpand: "新建",
    scheduledFull: "已满 3 个，请等待已有任务完成或取消",
    scheduledNewTitle: "新建特定时间发送任务",
    scheduledNameLabel: "活动名称",
    scheduledNamePlaceholder: "输入活动名称",
    scheduledDateLabel: "日期（北京时间）",
    scheduledHour: "时",
    scheduledMinute: "分",
    scheduledTarget: (industries, count, hoursHint) =>
      `目标：${industries} · ${count.toLocaleString()} 人 · ${hoursHint}`,
    scheduledCreating: "创建中…",
    scheduledCreate: "创建任务",
    scheduledCancel: "取消",
    scheduledErrName: "请输入活动名称。",
    scheduledErrIndustries: "请先在上方选择发送目标行业。",
    scheduledErrAudience: "暂无发送目标人数。",
    scheduledErrCampaign: "请先在本专线选择一个活动 ID。",
    scheduledCreated: (msg) => `✅ 已创建。${msg}`,
    scheduledCreateFailed: "创建失败。",
    scheduledConflict: (name, at) => `特定时间任务「${name}」已到发送时间（${at}），但本专线当前正在发送其他活动。`,
    scheduledConflictWait: "系统最多等待 5 分钟后自动切换。",
    scheduledCancelTask: "取消此定时任务",
    scheduledStatusPending: "等待中",
    scheduledStatusConfirm: "等待确认",
    scheduledStatusRunning: "执行中",
    scheduledAudience: (n) => `${n.toLocaleString()} 人`,
    scheduledHoursHint: (h) => `约 ${h} 小时（每 1000 封约 2 小时）`,
    diagnosticTitle: (lane) => `投递异常诊断${lane ? ` · ${lane}` : ""}`,
    diagnosticDesc:
      "群发异常、退信或同步失败时：点「生成诊断」后复制给后台；含同步失败、退信匹配、messageId 与最近发送样本。",
    diagnosticScopedDomains: (emails) => `仅统计本专线发信域：${emails}`,
    diagnosticGenerating: "生成中…",
    diagnosticGenerate: "生成诊断",
    diagnosticCopied: "已复制",
    diagnosticCopy: "复制诊断日志",
    diagnosticSelectCampaign: "请选择活动 ID，或使用本专线最近一次已发送的活动后再生成诊断。",
    diagnosticSummary: "诊断汇总",
    diagnosticAttempts: "尝试发送",
    diagnosticAccepted: "受理成功",
    diagnosticSyncFailed: "同步失败",
    diagnosticBounces: "退信事件",
    diagnosticColRecipient: "收件邮箱",
    diagnosticColStatus: "状态",
    diagnosticColError: "错误 / 退信",
    diagnosticBounceAt: (at) => `退信：${at}`,
    diagnosticClipHeader: ({ campaignCode, campaignId, laneLabel, scopedDomains, lite }) => {
      const scoped = scopedDomains ? ` · 发信域 ${scopedDomains}` : "";
      const lane = laneLabel ? ` · ${laneLabel}` : "";
      const mode = lite ? " · 快速模式" : "";
      return `[平台诊断 · 邮件活动 ${campaignCode} · 内部ID ${campaignId}${lane}${scoped}${mode}]`;
    },
    diagnosticClipGeneratedAt: (time) => `生成时间：${time}`,
    diagnosticClipSummaryTitle: "【汇总】",
    diagnosticClipAttempts: "尝试发送",
    diagnosticClipAccepted: "SMTP/服务商受理成功",
    diagnosticClipSyncFailed: "同步发送失败",
    diagnosticClipSendingNow: "当前 sending 行",
    diagnosticClipBounceEvents: "退信事件",
    diagnosticClipBounceMatched: "匹配到发送记录的退信",
    diagnosticClipDeliveredCorrected: "修正后送达",
    diagnosticClipFailedCorrected: "修正后失败",
    diagnosticClipSamplesTitle: "【最近 20 条发送样本】"
  };
}
