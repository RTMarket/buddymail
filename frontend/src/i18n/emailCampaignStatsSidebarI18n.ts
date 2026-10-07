import type { SiteLocale } from "./siteLocaleTypes";

export type EmailCampaignStatsSidebarStrings = {
  activityIdLabel: string;
  loadingActivities: string;
  loadFailed: (msg: string) => string;
  noActivitiesSingle: string;
  noActivitiesSentSingle: string;
  noActivitiesSentMulti: string;
  selectSenderFirstSingle: string;
  selectDomainFirstMulti: string;
  selectActivity: string;
  deleting: string;
  deleteActivity: string;
  confirmDelete: string;
  lookupByCodeLabel: string;
  codePlaceholder: string;
  lookup: string;
  enterSixDigitCode: string;
  codeNotFound: string;
  internalIdCode: (id: number, code: string) => string;
  activityNameLabel: string;
  plannedRecipientsLabel: string;
  sidebarHint: string;
  deleteConfirm: (id: number, code: string, nameSuffix: string) => string;
  deleteWarningRecords: string;
  deleteWarningCircuit: string;
  deleteWarningSending: string;
  deleteSuccess: string;
  currentActivityName: string;
};

export function getEmailCampaignStatsSidebarStrings(
  locale: SiteLocale,
  mode: "single" | "multi"
): EmailCampaignStatsSidebarStrings {
  if (locale === "en") {
    return {
      activityIdLabel: "Campaign ID",
      loadingActivities: "Loading campaigns…",
      loadFailed: (msg) => `Load failed: ${msg.slice(0, 80)}`,
      noActivitiesSingle: "No campaigns on this domain (not sent / SMTP not bound)",
      noActivitiesSentSingle: "No campaigns on this sending domain",
      noActivitiesSentMulti: "No sent campaigns on this domain",
      selectSenderFirstSingle: "Select sending mailbox first",
      selectDomainFirstMulti: "Select sending domain first",
      selectActivity: "Select campaign",
      deleting: "Deleting…",
      deleteActivity: "Delete campaign",
      confirmDelete: "Confirm delete",
      lookupByCodeLabel: "Lookup by campaign code",
      codePlaceholder: "6-digit code, e.g. 729317",
      lookup: "Lookup",
      enterSixDigitCode: "Enter a 6-digit campaign code",
      codeNotFound: "Campaign code not found",
      internalIdCode: (id, code) => `Internal ID ${id} · ${code}`,
      activityNameLabel: "Campaign name",
      plannedRecipientsLabel: "Planned recipients",
      sidebarHint: "Date summary above; pick a campaign ID here for per-campaign detail.",
      deleteConfirm: (id, code, nameSuffix) =>
        `Permanently delete campaign Internal ID ${id} · ${code}${nameSuffix}?`,
      deleteWarningRecords:
        "This removes the campaign and all send records, bounces, complaints, etc. (cannot undo).",
      deleteWarningCircuit: "If it had many bounces, the circuit window will be recalculated immediately.",
      deleteWarningSending: "Cannot delete while sending — pause on New/Send page first.",
      deleteSuccess: "✓ Campaign deleted",
      currentActivityName: "Current campaign"
    };
  }
  return {
    activityIdLabel: "活动 ID",
    loadingActivities: "加载活动列表…",
    loadFailed: (msg) => `加载失败：${msg.slice(0, 80)}`,
    noActivitiesSingle: "该发信域下暂无活动（未发信且未绑定此 SMTP）",
    noActivitiesSentSingle: "该发信域下暂无活动（未发信且未绑定此 SMTP）",
    noActivitiesSentMulti: "该发信域下暂无已发送活动",
    selectSenderFirstSingle: "请先选择发信邮箱",
    selectDomainFirstMulti: "请先选择发信域名",
    selectActivity: "请选择活动",
    deleting: "删除中…",
    deleteActivity: "删除此活动",
    confirmDelete: "确认删除",
    lookupByCodeLabel: "按活动编号查询",
    codePlaceholder: "6 位编号，如 729317",
    lookup: "查询",
    enterSixDigitCode: "请输入 6 位活动编号",
    codeNotFound: "未找到该活动编号",
    internalIdCode: (id, code) => `内部 ID ${id} · ${code}`,
    activityNameLabel: "活动名称",
    plannedRecipientsLabel: "应发送人数",
    sidebarHint: "上方为日期汇总；此处选活动 ID 查看该场活动明细。",
    deleteConfirm: (id, code, nameSuffix) => `确认永久删除活动「内部ID ${id} · ${code}」${nameSuffix}？`,
    deleteWarningRecords: "将删除该活动及全部发送记录、退信/投诉等投递事件（不可恢复）。",
    deleteWarningCircuit: "若该活动曾大量退信，删除后系统会立刻重算熔断窗口。",
    deleteWarningSending: "正在发送中的活动不可删除，请先到「新建/发送」页暂停后再删。",
    deleteSuccess: "✓ 活动已删除",
    currentActivityName: "当前活动"
  };
}
