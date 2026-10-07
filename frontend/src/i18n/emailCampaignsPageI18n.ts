import type { SiteLocale } from "./siteLocaleTypes";
import { getCrmSharedStrings, type CrmSharedStrings } from "./crmSharedI18n";
import { getEmailCampaignSuiteShellStrings } from "./emailCampaignSuiteShellI18n";
import type { LaneDeliveryOutcome } from "../lib/marketingSendMonitor";
import type { LaneLiveRow } from "../lib/laneSendLiveRows";

export type EmailCampaignVariant = "single" | "multi";

export type EmailCampaignsPageStrings = CrmSharedStrings & {
  defaultCampaignName: string;
  pageTitle: string;
  pageDescription: string;
  usageTitle: string;
  usageBullets: string[];
  prepBannerBullets: string[];
  workbenchTitle: string;
  workbenchDescription: string;
  templateSectionTitle: string;
  templateSectionDescription: string;
  channelSectionTitle: string;
  channelSectionDescription: string;
  taskSectionTitle: string;
  taskSectionDescription: string;
  taskSectionHint: string;
  recipientsSectionTitle: string;
  recipientsSectionDescription: string;
  progressSectionTitle: string;
  progressSectionDescription: string;
  viewStatsLink: string;
  viewStatsDetailed: string;
  campaignStatsLink: string;
  templateTagLabel: string;
  allTags: string;
  noTag: string;
  selectTemplateLabel: string;
  selectTemplatePlaceholder: string;
  noSubject: string;
  noTemplatesHint: string;
  currentSender: string;
  savedNameLabel: string;
  selectSavedNamePlaceholder: string;
  noSavedNames: string;
  taskNameLabel: string;
  campaignNameLabel: string;
  taskNamePlaceholder: string;
  newCampaignNamePlaceholder: string;
  confirmSave: string;
  saveCampaign: string;
  saveNameOnly: string;
  campaignCodeLabel: string;
  industryCrmTitle: string;
  industryCrmDescription: string;
  newIndustryTagLabel: string;
  industryTagPlaceholder: string;
  creatingIndustryTag: string;
  createIndustryTag: string;
  csvUploadTitle: string;
  csvBatchHint: string;
  csvImportHint: string;
  chooseCsv: string;
  noFileSelected: string;
  unrecognizedCols: (n: number) => string;
  selectedFilePrefix: string;
  importIndustryTagLabel: string;
  importIndustryTagPlaceholder: string;
  importIndustryTagEmptyHint: string;
  confirmImportVerify: string;
  importByIndustry: string;
  importing: string;
  resumeImport: string;
  importComplete: string;
  skippedImportRows: (n: number) => string;
  activityIdRecent: string;
  activityIdRecentHint: string;
  deleteCampaign: string;
  deleting: string;
  currentSelection: string;
  notInRecentSix: string;
  confirmDeleteCampaign: string;
  confirmDelete: string;
  cancel: string;
  sendTargetIndustries: string;
  selectIndustriesPlaceholder: string;
  sendPaceLabel: string;
  paceAsap: string;
  pace3s: string;
  pace5s: string;
  pace10s: string;
  pace30s: string;
  warmUpTitle: string;
  warmUpBullets: string[];
  sendProgressStats: string;
  noActivitySelected: string;
  taskNotSending: string;
  monitorTotals: (attempted: number, sent: number, failed: number) => string;
  monitorRefreshEvery: (sec: number) => string;
  monitorSummaryAfterSend: string;
  selectTask: string;
  totalLabel: string;
  successLabel: string;
  failedLabel: string;
  colIndex: string;
  colRecipientEmail: string;
  colDeliveryStatus: string;
  liveRowsHint: (rows: number, sec: number) => string;
  taskFinishedSummaryBelow: string;
  taskNotSendingNow: string;
  selectTaskThenSend: string;
  readyToSendHint: string;
  sendBlockedOtherCampaignInFlight: (code: string) => string;
  confirmStartSend: string;
  sendBusy: string;
  confirmSend: string;
  pause: string;
  pausing: string;
  send: string;
  stopSend: string;
  stopping: string;
  formalSend: string;
  testEmailSectionTitle: string;
  testEmailSectionDescription: string;
  testRecipientLabel: string;
  sendTestEmail: string;
  monitorActivityLabel: string;
  selectMonitorActivity: string;
  selectMonitorActivityPlaceholder: string;
  monitorSelectHint: string;
  stopSendSubmitted: string;
  pauseSendSubmitted: string;
  stopFailed: (msg: string) => string;
  pauseFailed: (msg: string) => string;
  errSelectTemplate: string;
  errSelectSenderChannel: string;
  errInvalidSenderChannel: string;
  errFillCampaignName: string;
  errSelectScheduleDate: string;
  errInvalidScheduleTime: string;
  errScheduleNotPast: string;
  campaignSaved: (code: string) => string;
  campaignNameSaved: (name: string) => string;
  errEnterCampaignName: string;
  errSelectCampaignId: string;
  errCampaignSending: string;
  errSelectNameToDelete: string;
  errSelectCampaignIdToDelete: string;
  nameDeleted: (name: string) => string;
  campaignDeleted: string;
  errSelectLaneFirst: string;
  errSelectActivityCard: string;
  errFillTestEmail: string;
  errSelectMonitorCampaign: string;
  paceAsapShort: string;
  paceIntervalSec: (sec: number) => string;
  prepFirstSend: string;
  monitorDeliveryStatusLabel: (outcome: LaneDeliveryOutcome | null, row: LaneLiveRow | null) => string;
  validateContactGroupName: (name: string) => { ok: true } | { ok: false; message: string };
  formalIndustryPlaceholder: string;
  formalIndustrySelected: (count: number, names: string, more: string) => string;
  formalIndustryMore: (count: number) => string;
  etaSelectIndustries: string;
  etaHours: (h: number, m: number, s: number, cnt: number) => string;
  etaMinutes: (m: number, s: number, cnt: number) => string;
  etaSeconds: (s: number, cnt: number) => string;
  confirmAudienceRecipients: (n: number) => string;
  confirmAudienceIndustries: (n: number) => string;
  csvParsedConfirm: (outcome: string, ignoreNote: string) => string;
  csvTooLarge: (outcome: string) => string;
  csvIgnoreNote: (n: number) => string;
  importProgressStart: (done: number, total: number) => string;
  importProgress: (done: number, total: number) => string;
  importDoneMessage: (
    industry: string,
    parseNote: string,
    success: number,
    serverSkipped: number,
    apiRejected: number
  ) => string;
  importInterrupted: (done: number, total: number) => string;
  validEmailsCount: (n: number) => string;
  industryTagRemoved: (tag: string, deleted?: number) => string;
  industryTagCreated: (name: string) => string;
  sendingInProgressKeyword: string;
  formalSendStopHint: string;
  statusSent: string;
  statusSending: string;
  statusReady: string;
  statusCompleted: string;
  statusNotSent: string;
  recentCardsEmpty: string;
  recentCardSentDisabled: (code: string, name: string) => string;
  recentCardClickSelect: (code: string, name: string) => string;
  newActivitySectionTitle: string;
  newActivitySectionDescription: string;
  prepTitle: string;
  pageDescriptionDetail: string;
  campaignNameBlockTitle: string;
  campaignNameBlockHint: string;
  savedNamesSidebarTitle: string;
  savedNamesSidebarHint: string;
  selectSavedNameAria: string;
  deleteCurrentNameBtn: string;
  confirmDeleteNameMessage: (name: string) => string;
  newEditNameTitle: string;
  newEditNameHint: string;
  emailTemplateBlockTitle: string;
  emailTemplateBlockDesc: string;
  activityIdRecent15: string;
  formalSendLongDescription: string;
  activityIdListLabel: string;
  selectCampaignPlaceholder: string;
  multiLaneSeparateHint: string;
  industryUnionHint: string;
  industryRemoveHint: string;
  industryLaneLockHint: string;
  confirmFormalSend: string;
  formalSendMonitorHint: string;
  monitorLiveTitle: string;
  selectMonitorShort: string;
  monitorStatusLabel: (status: string) => string;
  monitorNotActive: string;
  monitorRunAttempted: (attempted: number, sent: number, failed: number) => string;
  colAttempt: string;
  colEmailAddress: string;
  colSmtpStatus: string;
  colOpen: string;
  colClick: string;
  colBounceEvents: string;
  rowStatusWaiting: string;
  rowStatusSent: string;
  rowStatusFailed: string;
  eventsTableHint: (sec: number) => string;
  monitorActivityFinished: string;
  noteDone: string;
  noteStopped: string;
  notePaused: string;
  deliverySummaryLine: (sent: number, failed: number, attempted: number) => string;
  duplicateEmailsNote: string;
  testSendOk: string;
  testSendFailed: (msg: string) => string;
  importSubmitStart: (done: number, total: number) => string;
  progressResumeKeyword: string;
  errCsvOnly: string;
  errIndustryTagName: string;
  selectIndustryTagFirst: string;
  errSelectIndustryBeforeCsv: string;
  errCsvNeedsEmail: string;
  errNoValidEmails: string;
};

function multiExtrasZh(isMulti: boolean): Pick<
  EmailCampaignsPageStrings,
  | "prepTitle"
  | "pageDescriptionDetail"
  | "campaignNameBlockTitle"
  | "campaignNameBlockHint"
  | "savedNamesSidebarTitle"
  | "savedNamesSidebarHint"
  | "selectSavedNameAria"
  | "deleteCurrentNameBtn"
  | "confirmDeleteNameMessage"
  | "newEditNameTitle"
  | "newEditNameHint"
  | "emailTemplateBlockTitle"
  | "emailTemplateBlockDesc"
  | "activityIdRecent15"
  | "formalSendLongDescription"
  | "activityIdListLabel"
  | "selectCampaignPlaceholder"
  | "multiLaneSeparateHint"
  | "industryUnionHint"
  | "industryRemoveHint"
  | "industryLaneLockHint"
  | "confirmFormalSend"
  | "formalSendMonitorHint"
  | "monitorLiveTitle"
  | "selectMonitorShort"
  | "monitorStatusLabel"
  | "monitorNotActive"
  | "monitorRunAttempted"
  | "colAttempt"
  | "colEmailAddress"
  | "colSmtpStatus"
  | "colOpen"
  | "colClick"
  | "colBounceEvents"
  | "rowStatusWaiting"
  | "rowStatusSent"
  | "rowStatusFailed"
  | "eventsTableHint"
  | "monitorActivityFinished"
  | "noteDone"
  | "noteStopped"
  | "notePaused"
  | "deliverySummaryLine"
  | "duplicateEmailsNote"
  | "testSendOk"
  | "testSendFailed"
  | "importSubmitStart"
  | "progressResumeKeyword"
> {
  if (!isMulti) {
    return {
      prepTitle: "",
      pageDescriptionDetail: "",
      campaignNameBlockTitle: "",
      campaignNameBlockHint: "",
      savedNamesSidebarTitle: "",
      savedNamesSidebarHint: "",
      selectSavedNameAria: "",
      deleteCurrentNameBtn: "",
      confirmDeleteNameMessage: () => "",
      newEditNameTitle: "",
      newEditNameHint: "",
      emailTemplateBlockTitle: "",
      emailTemplateBlockDesc: "",
      activityIdRecent15: "",
      formalSendLongDescription: "",
      activityIdListLabel: "",
      selectCampaignPlaceholder: "",
      multiLaneSeparateHint: "",
      industryUnionHint: "",
      industryRemoveHint: "",
      industryLaneLockHint: "",
      confirmFormalSend: "",
      formalSendMonitorHint: "",
      monitorLiveTitle: "",
      selectMonitorShort: "",
      monitorStatusLabel: () => "",
      monitorNotActive: "",
      monitorRunAttempted: () => "",
      colAttempt: "",
      colEmailAddress: "",
      colSmtpStatus: "",
      colOpen: "",
      colClick: "",
      colBounceEvents: "",
      rowStatusWaiting: "",
      rowStatusSent: "",
      rowStatusFailed: "",
      eventsTableHint: () => "",
      monitorActivityFinished: "",
      noteDone: "",
      noteStopped: "",
      notePaused: "",
      deliverySummaryLine: () => "",
      duplicateEmailsNote: "",
      testSendOk: "",
      testSendFailed: () => "",
      importSubmitStart: () => "",
      progressResumeKeyword: "继续"
    };
  }
  return {
    prepTitle: "",
    pageDescriptionDetail:
      "选择模版创建活动；主题与正文由模版生成。发送目标由行业筛选决定。保存后可发测试邮件与正式发送。",
    campaignNameBlockTitle: "活动名称",
    campaignNameBlockHint:
      "左侧从已保存名称中选择会填入右侧；右侧可编辑并「保存到名称库」或直接去下方点「保存活动」。",
    savedNamesSidebarTitle: "已保存名称",
    savedNamesSidebarHint: "标准下拉，单选后同步到右侧输入框",
    selectSavedNameAria: "选择已保存活动名称",
    deleteCurrentNameBtn: "删除当前名称",
    confirmDeleteNameMessage: (name: string) => `确认删除活动名称「${name}」？删除后不会影响已创建活动记录。`,
    newEditNameTitle: "新建 / 编辑名称",
    newEditNameHint: "输入框与按钮等高对齐，保存后写入本地名称库",
    emailTemplateBlockTitle: "邮件模版",
    emailTemplateBlockDesc: "先选模版标签，再选具体模版（与「邮件模板」页模版库一致）。",
    activityIdRecent15: "活动 ID（近期 15 个）",
    formalSendLongDescription:
      "群发为顺序一封接一封（同一进程内同步发送），不是瞬间并行几百封。在此勾选发送目标行业（可多选）。选「尽快」时实际间隔取决于 SMTP；也可选每封之间至少间隔数秒。完成后可到「营销活动统计」查看明细。",
    activityIdListLabel: "活动 ID（6 位编号 · 列表）",
    selectCampaignPlaceholder: "请选择活动…",
    multiLaneSeparateHint:
      "混元及以上：请在下方各专线发送窗口中分别选择活动 ID；每条专线同时仅 1 场发送。",
    industryUnionHint:
      "右侧为已选行业的可发去重邮箱并集（与下拉括号人数一致）。若本活动历史已发过部分邮箱，实际本轮可发可能更少；专线发送时会按活动自动排除已发。",
    industryRemoveHint: "下拉右侧小圆 × 将同步删除该标签下全部 CRM 联系人。",
    industryLaneLockHint:
      "某条专线发送中时仍可在此改选行业，供下一条专线开送使用；已在发送中的专线沿用开送时锁定的行业。",
    confirmFormalSend: "确认开始正式发送？",
    formalSendMonitorHint: "发送记录与进度请在右侧「邮件传送实时监控」查看。",
    monitorLiveTitle: "邮件传送实时监控（最近 3 封）",
    selectMonitorShort: "选择监控活动…",
    monitorStatusLabel: (status: string) =>
      status === "sending" ? "发送中" : status === "completed" ? "已完成" : status || "未发送",
    monitorNotActive: "当前活动未在发送中",
    monitorRunAttempted: (a: number, s: number, f: number) => `本轮尝试 ${a} · 成功 ${s} · 失败 ${f}`,
    colAttempt: "尝试",
    colEmailAddress: "邮箱地址",
    colSmtpStatus: "SMTP 状态",
    colOpen: "打开",
    colClick: "点击",
    colBounceEvents: "退信事件",
    rowStatusWaiting: "等待中…",
    rowStatusSent: "☑️ ✅ 已发送",
    rowStatusFailed: "❌ 失败",
    eventsTableHint: (sec: number) =>
      `表格中「打开 / 点击 / 退信事件」来自 email_delivery_events（写入后随本区域约每 ${sec} 秒刷新）。`,
    monitorActivityFinished: "本活动已发完；最近 3 封实时记录已结束，汇总见下方。",
    noteDone: "✅ 完成发送",
    noteStopped: "⏹ 已停止发送",
    notePaused: "⏸ 已暂停发送",
    deliverySummaryLine: (sent: number, failed: number, attempted: number) =>
      `送达 ${sent} · 失败 ${failed} · 已尝试 ${attempted}`,
    duplicateEmailsNote: "受众含重复邮箱时，实际只发唯一地址，故尝试数可能小于计划人数；以成功/失败为准。",
    testSendOk: "已发送",
    testSendFailed: (msg: string) => `发送失败：${msg}`,
    importSubmitStart: (done: number, total: number) =>
      done > 0 ? `从断点继续：已完成 ${done}/${total} 条邮箱` : `正在提交 0/${total} 条邮箱…`,
    progressResumeKeyword: "继续"
  };
}

function multiExtrasEn(isMulti: boolean) {
  if (!isMulti) {
    return multiExtrasZh(false);
  }
  return {
    prepTitle: "",
    pageDescriptionDetail:
      "Pick a template to create a campaign; subject and body come from the template. Targets are filtered by industry. After save you can send a test or formal blast.",
    campaignNameBlockTitle: "Campaign name",
    campaignNameBlockHint:
      "Pick a saved name on the left to fill the field; edit on the right, save to the name library, or save the campaign below.",
    savedNamesSidebarTitle: "Saved names",
    savedNamesSidebarHint: "Standard dropdown; selection syncs to the field on the right",
    selectSavedNameAria: "Select saved campaign name",
    deleteCurrentNameBtn: "Delete current name",
    confirmDeleteNameMessage: (name: string) =>
      `Delete saved name “${name}”? Existing campaigns are not affected.`,
    newEditNameTitle: "New / edit name",
    newEditNameHint: "Field and button aligned; saving writes to the local name library",
    emailTemplateBlockTitle: "Email template",
    emailTemplateBlockDesc: "Pick tag then template (same library as Email templates page).",
    activityIdRecent15: "Campaign ID (recent 15)",
    formalSendLongDescription:
      "Blast sends one-by-one in-process, not hundreds in parallel. Select target industries (multi-select). ASAP pace depends on SMTP; or pick a minimum gap. View details under Campaign stats when done.",
    activityIdListLabel: "Campaign ID (6-digit · list)",
    selectCampaignPlaceholder: "Select campaign…",
    multiLaneSeparateHint:
      "Multi-lane plans: pick campaign ID per lane below; only one active send per lane.",
    industryUnionHint:
      "Right side shows deduped union of selected industries. Prior sends may reduce this round; lanes auto-exclude already sent addresses.",
    industryRemoveHint: "× on a tag removes all CRM contacts under it.",
    industryLaneLockHint:
      "You can change industries here for the next lane while another lane is sending; active lanes keep industries locked at start.",
    confirmFormalSend: "Start formal send?",
    formalSendMonitorHint: "See send log and progress in Live delivery monitor on the right.",
    monitorLiveTitle: "Live delivery monitor (last 3)",
    selectMonitorShort: "Select campaign to monitor…",
    monitorStatusLabel: (status: string) =>
      status === "sending" ? "Sending" : status === "completed" ? "Completed" : status || "Not sent",
    monitorNotActive: "Selected campaign is not sending",
    monitorRunAttempted: (a: number, s: number, f: number) => `This run: ${a} attempted · ${s} OK · ${f} failed`,
    colAttempt: "Attempt",
    colEmailAddress: "Email",
    colSmtpStatus: "SMTP status",
    colOpen: "Opens",
    colClick: "Clicks",
    colBounceEvents: "Bounces",
    rowStatusWaiting: "Waiting…",
    rowStatusSent: "☑️ ✅ Sent",
    rowStatusFailed: "❌ Failed",
    eventsTableHint: (sec: number) =>
      `Opens / clicks / bounces from email_delivery_events (refreshes about every ${sec}s).`,
    monitorActivityFinished: "Campaign finished; last 3 live rows ended — see summary below.",
    noteDone: "✅ Send complete",
    noteStopped: "⏹ Stopped",
    notePaused: "⏸ Paused",
    deliverySummaryLine: (sent: number, failed: number, attempted: number) =>
      `Delivered ${sent} · Failed ${failed} · Attempted ${attempted}`,
    duplicateEmailsNote:
      "Duplicate emails in audience are sent once; attempts may be less than planned — trust OK/failed counts.",
    testSendOk: "Sent",
    testSendFailed: (msg: string) => `Send failed: ${msg}`,
    importSubmitStart: (done: number, total: number) =>
      done > 0 ? `Resume: ${done}/${total} emails done` : `Submitting 0/${total} emails…`,
    progressResumeKeyword: "resume"
  };
}

function buildZh(variant: EmailCampaignVariant): Omit<EmailCampaignsPageStrings, keyof CrmSharedStrings> {
  const shell = getEmailCampaignSuiteShellStrings("zh");
  const isSingle = variant === "single";
  return {
    defaultCampaignName: "新活动",
    pageTitle: shell.campaignsTitle,
    pageDescription: isSingle
      ? ""
      : "选择模版创建活动；主题与正文由模版生成。发送目标由行业筛选决定。保存后可发测试邮件与正式发送。",
    usageTitle: "使用说明",
    usageBullets: isSingle
      ? [
          "在「设置 · 邮件」中配置发信域后，按顺序：选模版 → 选发信通道 → 添加任务保存（得 6 位编号）→ 维护收件人 → 发送。",
          "先维护收件人（CRM 行业标签 + CSV 导入），再在「发送进度」中选择活动并确认发送。",
          "单组 VPS 套餐请遵守日发上限与养号建议，发送中可在下方查看实时进度。"
        ]
      : [],
    prepBannerBullets: [],
    workbenchTitle: isSingle ? "今日工作台" : "专线工作台",
    workbenchDescription: isSingle
      ? "当前单组 VPS 发信域、今日用量与预热进度；点击下方卡片切换本组发信域。"
      : "套餐专线名额与今日发信用量；点击下方卡片或在下方的「发信专线」中选择。",
    templateSectionTitle: "邮件模板",
    templateSectionDescription: isSingle
      ? "选择邮件模板，主题与正文由模板生成。"
      : "选择邮件模板；保存后自动生成活动 ID，邮件内容由所选模版决定。",
    channelSectionTitle: "选择发送通道",
    channelSectionDescription: "选择本任务使用的发信通道与发信邮箱。",
    taskSectionTitle: isSingle ? "添加任务" : "新建活动",
    taskSectionDescription: isSingle
      ? "选好上方邮件模板与发信通道后，填写任务名称并确认保存；系统将分配 6 位活动编号。"
      : "保存后自动生成活动 ID；邮件内容由所选模版决定。",
    taskSectionHint: isSingle
      ? "保存成功后，新活动会出现在下方「发送进度」的最近 6 个活动卡片中，可继续选行业并确认发送。"
      : "",
    recipientsSectionTitle: "收件人管理",
    recipientsSectionDescription: "CRM 模式：维护行业标签并导入联系人。",
    progressSectionTitle: "发送进度",
    progressSectionDescription: "选择活动与发送目标行业，确认发送后在此查看实时进度与结果。",
    viewStatsLink: "查看营销活动统计",
    viewStatsDetailed: "查看详细统计",
    campaignStatsLink: "营销活动统计",
    templateTagLabel: "模版标签",
    allTags: "全部标签",
    noTag: "无标签",
    selectTemplateLabel: isSingle ? "选择邮件模板" : "选择邮件模版",
    selectTemplatePlaceholder: "请选择模版…",
    noSubject: "（无主题）",
    noTemplatesHint: "暂无模版：请先到「邮件模板」创建并保存。",
    currentSender: "当前发件：",
    savedNameLabel: isSingle ? "已保存任务名称" : "已保存活动名称",
    selectSavedNamePlaceholder: "请选择已保存名称…",
    noSavedNames: "暂无已保存名称",
    taskNameLabel: "任务名称",
    campaignNameLabel: "活动名称",
    taskNamePlaceholder: "输入任务名称",
    newCampaignNamePlaceholder: "输入新活动名称",
    confirmSave: "确认保存",
    saveCampaign: "保存活动",
    saveNameOnly: "新建保存",
    campaignCodeLabel: "活动编号（6 位）：",
    industryCrmTitle: "行业标签管理（CRM）",
    industryCrmDescription:
      "仅显示本账号自建的行业标签与已导入 CRM 的行业。点 × 将同步删除该标签下全部 CRM 联系人。",
    newIndustryTagLabel: "新建行业标签",
    industryTagPlaceholder: "输入行业标签名称",
    creatingIndustryTag: "创建中…",
    createIndustryTag: "创建行业标签",
    csvUploadTitle: isSingle ? "上传 CSV 导入联系人" : "上传 CSV 导入行业联系人",
    csvBatchHint: "单次建议 ≤1500 条",
    csvImportHint: "先选上方导入行业标签，再选 CSV 文件。",
    chooseCsv: "选择 CSV 文件",
    noFileSelected: "未选择文件",
    unrecognizedCols: (n) => ` · 未识别列 ${n} 个`,
    selectedFilePrefix: "已选 ",
    importIndustryTagLabel: "导入行业标签",
    importIndustryTagPlaceholder: "请选择行业标签…",
    importIndustryTagEmptyHint: "暂无行业标签。请先上方「新建行业标签」创建。",
    confirmImportVerify: "确认导入并验证",
    importByIndustry: "按所选行业标签导入",
    importing: "导入中…",
    resumeImport: "继续导入（从断点）",
    importComplete: "导入完成",
    skippedImportRows: (n) => `已跳过 ${n} 条连续失败记录（其余继续导入）。`,
    activityIdRecent: "活动 ID（最近 6 个）",
    activityIdRecentHint: "未发送活动可用于正式发送；发送中或已发送活动可点击查看实时状态与记录。",
    deleteCampaign: "删除活动",
    deleting: "删除中…",
    currentSelection: "当前选中：",
    notInRecentSix: "（不在下方最近 6 个列表中）",
    confirmDeleteCampaign: "确认删除该活动？删除后发送记录与统计会一并移除，无法恢复。",
    confirmDelete: "确认删除",
    cancel: "取消",
    sendTargetIndustries: "发送目标行业（可多选）",
    selectIndustriesPlaceholder: "请选择行业（可多选）",
    sendPaceLabel: "发送节奏（每封之间）",
    paceAsap: "尽快（连续发送，间隔由 SMTP 决定）",
    pace3s: "至少间隔 3 秒",
    pace5s: "至少间隔 5 秒",
    pace10s: "至少间隔 10 秒",
    pace30s: "至少间隔 30 秒",
    warmUpTitle: "友情提示",
    warmUpBullets: [
      "每条专线单次活动建议不超过 3000 个邮箱。",
      "单次超过 2000 封或多专线长时间发送时，发送节奏请选择至少 3 秒或 5 秒，减轻监控同步压力、降低计数超时。"
    ],
    sendProgressStats: "发送进度",
    noActivitySelected: "未选活动",
    taskNotSending: "当前任务未在发送中",
    monitorTotals: (a, s, f) => `总数 ${a} · 成功 ${s} · 失败 ${f}`,
    monitorRefreshEvery: (sec) => `约每 ${sec} 秒刷新`,
    monitorSummaryAfterSend: "发送结束后将在此显示汇总",
    selectTask: "请选择任务",
    totalLabel: "总数",
    successLabel: "成功",
    failedLabel: "失败",
    colIndex: "序号",
    colRecipientEmail: "收件人邮箱",
    colDeliveryStatus: "投递状态",
    liveRowsHint: (rows, sec) => `发送中逐封展示最近 ${rows} 封，约每 ${sec} 秒刷新。`,
    taskFinishedSummaryBelow: "本任务已发完；汇总见下方。",
    taskNotSendingNow: "该任务当前未在发送中。",
    selectTaskThenSend: "请选择任务后确认发送。",
    readyToSendHint: "已选待发活动，可确认发送",
    sendBlockedOtherCampaignInFlight: (code) =>
      `当前有活动 ${code} 正在发送中，暂不可发送新活动。请等待其结束，或点该活动的「停止发送」后再发。`,
    confirmStartSend: "确认开始发送？",
    sendBusy: "发送中…",
    confirmSend: "确认发送",
    pause: "暂停",
    pausing: "暂停中…",
    send: "发送",
    stopSend: "停止发送",
    stopping: "停止中…",
    formalSend: "正式发送",
    testEmailSectionTitle: "发送测试邮件",
    testEmailSectionDescription:
      "点击下方近期活动卡片选择活动 ID，再填写收件邮箱发送（主题加「测试」前缀）。测试为单封投递，常见为几秒，与下方正式群发的「发送节奏」无关。",
    testRecipientLabel: "收件邮箱",
    sendTestEmail: "发送测试邮件",
    monitorActivityLabel: "监控活动",
    selectMonitorActivity: "请选择监控活动",
    selectMonitorActivityPlaceholder: "选择要查看实时发送状态的营销活动",
    monitorSelectHint: "请选择要监控的营销活动。",
    stopSendSubmitted: "✓ 已提交停止指令，剩余邮件将不再发送。",
    pauseSendSubmitted: "✓ 已提交暂停指令，剩余邮件将不再发送。",
    stopFailed: (msg) => `停止指令失败：${msg}`,
    pauseFailed: (msg) => `暂停失败：${msg}`,
    errSelectTemplate: "请选择邮件模版。",
    errSelectSenderChannel: "请选择发件通道（轻量 SMTP、中量专线或巨量专线）。",
    errInvalidSenderChannel: "发件通道选择无效，请重新选择。",
    errFillCampaignName: "请先填写活动名称。",
    errSelectScheduleDate: "请选择特定发送日期。",
    errInvalidScheduleTime: "特定发送时间无效。",
    errScheduleNotPast: "特定发送时间须不早于当前时间（请选择今天起的之后时刻）。",
    campaignSaved: (code) => `✓ 活动已保存，编号 ${code}`,
    campaignNameSaved: (name) => `✓ 活动名称已保存：${name}`,
    errEnterCampaignName: "请先输入活动名称。",
    errSelectCampaignId: "请先在列表中选择活动 ID。",
    errCampaignSending: "该活动正在发送中。下方实时监控会显示当前进度；如需中止请点击「停止发送」。",
    errSelectNameToDelete: "请先在右侧输入框或左侧下拉中选中要删除的活动名称。",
    errSelectCampaignIdToDelete: "请先选择要删除的活动 ID。",
    nameDeleted: (name) => `✓ 已删除名称「${name}」`,
    campaignDeleted: "✓ 活动已删除",
    errSelectLaneFirst: "请先在「专线与邮箱」选择专线，并确认该专线下已配置发信域。",
    errSelectActivityCard: "请先点击上方活动卡片选择活动。",
    errFillTestEmail: "请填写测试收件邮箱。",
    errSelectMonitorCampaign: "该活动当前未在发送中，暂无实时传送记录。",
    paceAsapShort: "尽快发送",
    paceIntervalSec: (sec) => `每封间隔至少 ${sec} 秒`,
    prepFirstSend: "正在准备首封发送…",
    monitorDeliveryStatusLabel: (outcome, row) => {
      if (!row) return "等待中…";
      const s = String(row.status ?? "").toLowerCase();
      if (s === "sending") return "投递中";
      if (outcome === "success") return "成功";
      if (outcome === "fail") return "失败";
      if (outcome === "bounce") return "退信";
      if (outcome === "reject") return "拒收";
      return "—";
    },
    validateContactGroupName: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, message: "分组名称不能为空" };
      const hasCjk =
        /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u9fff\uf900-\ufaff]/.test(trimmed);
      if (hasCjk) {
        if ([...trimmed].length > 30) return { ok: false, message: "含中文时分组名称请控制在 30 个字以内" };
      } else {
        const words = trimmed.split(/\s+/).filter(Boolean);
        if (words.length > 120) return { ok: false, message: "纯英文分组名称请控制在 120 个单词以内" };
      }
      return { ok: true };
    },
    formalIndustryPlaceholder: "请选择行业（可多选）",
    formalIndustrySelected: (count, names, more) => `已选 ${count} 个：${names}${more}`,
    formalIndustryMore: (count) => ` 等 ${count} 个`,
    etaSelectIndustries: "预计时长：请在「正式发送」中选择发送目标行业以计算人数",
    etaHours: (h, m, s, cnt) => `预计时长：约 ${h} 小时 ${m} 分 ${s} 秒（${cnt} 封）`,
    etaMinutes: (m, s, cnt) => `预计时长：约 ${m} 分 ${s} 秒（${cnt} 封）`,
    etaSeconds: (s, cnt) => `预计时长：约 ${s} 秒（${cnt} 封）`,
    confirmAudienceRecipients: (n) => `约 ${n} 位收件人`,
    confirmAudienceIndustries: (n) => `已选 ${n} 个发送行业`,
    csvParsedConfirm: (outcome, ignoreNote) => `✓ ${outcome}${ignoreNote}。确认无误后点击「确认导入并验证」。`,
    csvTooLarge: (outcome) => `${outcome}。建议每次控制在 1500 条以内，请拆分 CSV 后分次导入。`,
    csvIgnoreNote: (n) => `；未识别列 ${n} 个（整列不导入）`,
    importProgressStart: (done, total) =>
      done > 0 ? `从断点继续：已完成 ${done}/${total} 条邮箱` : `正在导入 0/${total} 条邮箱…`,
    importProgress: (done, total) => `已导入 ${done}/${total} 条邮箱`,
    importDoneMessage: (industry, parseNote, success, serverSkipped, apiRejected) =>
      `✓ 导入完成（行业「${industry}」）：${parseNote}，成功写入 ${success} 条` +
      (serverSkipped > 0 ? `，写入失败 ${serverSkipped} 条` : "") +
      (apiRejected > 0 ? `，提交前剔除不合规邮箱 ${apiRejected} 条` : "") +
      "。可保存活动并在下方按行业发送。",
    importInterrupted: (done, total) =>
      `导入中断：已完成 ${done}/${total} 条。请再次点击「按所选行业标签导入」继续。`,
    validEmailsCount: (n) => `有效邮箱 ${n} 条`,
    industryTagRemoved: (tag, deleted) =>
      deleted != null && deleted > 0
        ? `✓ 已移除行业标签「${tag}」，并删除 ${deleted} 条 CRM 联系人`
        : `✓ 已移除行业标签「${tag}」`,
    industryTagCreated: (name) => `✓ 已创建行业标签「${name}」`,
    sendingInProgressKeyword: "正在发送中",
    formalSendStopHint: "提示：发送过程中可点击「停止发送」取消剩余邮件；已发出的仍计入统计，请勿频繁操作。",
    statusSent: "已发送",
    statusSending: "发送中",
    statusReady: "待发送",
    statusCompleted: "已完成",
    statusNotSent: "未发送",
    recentCardsEmpty: "暂无活动。请先在上方「添加任务」保存任务，最近 6 个活动 ID 会显示在这里。",
    recentCardSentDisabled: (code, name) => `${code} · ${name}（已发送，不可再次选择）`,
    recentCardClickSelect: (code, name) => `${code} · ${name}（点击选择）`,
    newActivitySectionTitle: "新建活动",
    newActivitySectionDescription: "保存后自动生成活动 ID；邮件内容由所选模版决定。",
    errCsvOnly: "仅支持 .csv（请在 Excel 中「另存为」选择 CSV UTF-8）。",
    errIndustryTagName: "请输入行业标签名称。",
    selectIndustryTagFirst: "请先选择导入行业标签",
    errSelectIndustryBeforeCsv: "请先选择导入行业标签，再导入 CSV。",
    errCsvNeedsEmail: "请先选择 CSV，且文件中需至少一行合法邮箱。",
    errNoValidEmails: "没有可提交的合法邮箱，请检查 CSV 邮箱列格式。",
    ...multiExtrasZh(!isSingle)
  };
}

function buildEn(variant: EmailCampaignVariant): Omit<EmailCampaignsPageStrings, keyof CrmSharedStrings> {
  const shell = getEmailCampaignSuiteShellStrings("en");
  const isSingle = variant === "single";
  return {
    defaultCampaignName: "New campaign",
    pageTitle: shell.campaignsTitle,
    pageDescription: isSingle
      ? ""
      : "Pick a template to create a campaign; content from template. Targets by industry. After save: test or formal send.",
    usageTitle: "How to use",
    usageBullets: isSingle
      ? [
          "After configuring sending domains under Settings → Email: pick template → channel → save task (6-digit ID) → maintain recipients → send.",
          "Maintain recipients first (CRM industry tags + CSV import), then pick the campaign under Send progress and confirm.",
          "Single-VPS plans: respect daily caps and warm-up; live progress appears below while sending."
        ]
      : [],
    prepBannerBullets: [],
    workbenchTitle: isSingle ? "Today's workbench" : "Dedicated lanes workbench",
    workbenchDescription: isSingle
      ? "Current single-VPS sending domain, today's usage and warm-up; click a card below to switch this group's domain."
      : "Lane quota and today's send usage; click a card below or pick a lane under Sending lanes.",
    templateSectionTitle: "Email template",
    templateSectionDescription: isSingle
      ? "Pick a template; subject and body come from the template."
      : "Pick a template; saving auto-generates a campaign ID. Content comes from the template.",
    channelSectionTitle: "Sending channel",
    channelSectionDescription: "Choose the channel and from-address for this task.",
    taskSectionTitle: isSingle ? "Add task" : "New campaign",
    taskSectionDescription: isSingle
      ? "After picking template and channel above, enter a task name and save; a 6-digit campaign ID is assigned."
      : "Saving auto-generates a campaign ID; email content comes from the selected template.",
    taskSectionHint: isSingle
      ? "After save, the new campaign appears in the recent 6 cards under Send progress; pick industries and confirm send."
      : "",
    recipientsSectionTitle: "Recipients",
    recipientsSectionDescription: "CRM mode: maintain industry tags and import contacts.",
    progressSectionTitle: "Send progress",
    progressSectionDescription: "Pick campaign and target industries; confirm send to view live progress here.",
    viewStatsLink: "View campaign stats",
    viewStatsDetailed: "View detailed stats",
    campaignStatsLink: "Campaign stats",
    templateTagLabel: "Template tag",
    allTags: "All tags",
    noTag: "No tag",
    selectTemplateLabel: "Select email template",
    selectTemplatePlaceholder: "Select template…",
    noSubject: "(no subject)",
    noTemplatesHint: "No templates yet — create one under Email templates first.",
    currentSender: "Current sender:",
    savedNameLabel: isSingle ? "Saved task names" : "Saved campaign names",
    selectSavedNamePlaceholder: "Select saved name…",
    noSavedNames: "No saved names yet",
    taskNameLabel: "Task name",
    campaignNameLabel: "Campaign name",
    taskNamePlaceholder: "Task name",
    newCampaignNamePlaceholder: "New campaign name",
    confirmSave: "Confirm save",
    saveCampaign: "Save campaign",
    saveNameOnly: "Save new",
    campaignCodeLabel: "Campaign ID (6 digits):",
    industryCrmTitle: "Industry tags (CRM)",
    industryCrmDescription:
      "Only tags you created and industries imported to CRM (per login). Removing (×) deletes all CRM contacts under that tag.",
    newIndustryTagLabel: "New industry tag",
    industryTagPlaceholder: "Industry tag name",
    creatingIndustryTag: "Creating…",
    createIndustryTag: "Create industry tag",
    csvUploadTitle: isSingle ? "Upload CSV to import contacts" : "Upload CSV to import industry contacts",
    csvBatchHint: "≤1500 rows per batch recommended",
    csvImportHint: "Select an import industry tag above, then choose a CSV file.",
    chooseCsv: "Choose CSV file",
    noFileSelected: "No file selected",
    unrecognizedCols: (n) => ` · ${n} unrecognized column(s)`,
    selectedFilePrefix: "Selected ",
    importIndustryTagLabel: "Import industry tag",
    importIndustryTagPlaceholder: "Select industry tag…",
    importIndustryTagEmptyHint: "No industry tags yet. Create one above first.",
    confirmImportVerify: "Confirm import & verify",
    importByIndustry: "Import by selected industry tag",
    importing: "Importing…",
    resumeImport: "Resume import",
    importComplete: "Import complete",
    skippedImportRows: (n) => `Skipped ${n} consecutive failed row(s); others continued.`,
    activityIdRecent: "Campaign ID (recent 6)",
    activityIdRecentHint: "Unsent campaigns can be used for formal sending; sending or sent campaigns can be opened for status and records.",
    deleteCampaign: "Delete campaign",
    deleting: "Deleting…",
    currentSelection: "Selected:",
    notInRecentSix: "(not in recent 6 below)",
    confirmDeleteCampaign: "Delete this campaign? Send records and stats will be removed and cannot be restored.",
    confirmDelete: "Confirm delete",
    cancel: "Cancel",
    sendTargetIndustries: "Target industries (multi-select)",
    selectIndustriesPlaceholder: "Select industries (multi-select)",
    sendPaceLabel: "Send pace (between emails)",
    paceAsap: "ASAP (back-to-back; SMTP sets spacing)",
    pace3s: "At least 3 seconds apart",
    pace5s: "At least 5 seconds apart",
    pace10s: "At least 10 seconds apart",
    pace30s: "At least 30 seconds apart",
    warmUpTitle: "Friendly tip",
    warmUpBullets: [
      "Keep each lane under ~3,000 recipients per send.",
      "For sends over 2,000 or long multi-lane runs, choose at least 3s or 5s between emails to ease live sync load and reduce count timeouts."
    ],
    sendProgressStats: "Send progress",
    noActivitySelected: "No campaign selected",
    taskNotSending: "This task is not sending",
    monitorTotals: (a, s, f) => `Total ${a} · OK ${s} · Failed ${f}`,
    monitorRefreshEvery: (sec) => `Refreshes about every ${sec}s`,
    monitorSummaryAfterSend: "Summary appears here after sending completes",
    selectTask: "Select a task",
    totalLabel: "Total",
    successLabel: "OK",
    failedLabel: "Failed",
    colIndex: "#",
    colRecipientEmail: "Recipient email",
    colDeliveryStatus: "Delivery status",
    liveRowsHint: (rows, sec) => `While sending, shows last ${rows} emails; refreshes about every ${sec}s.`,
    taskFinishedSummaryBelow: "This task finished; see summary below.",
    taskNotSendingNow: "This task is not sending right now.",
    selectTaskThenSend: "Select a task, then confirm send.",
    readyToSendHint: "Pending campaign selected — ready to send",
    sendBlockedOtherCampaignInFlight: (code) =>
      `Campaign ${code} is sending — new sends are blocked until it finishes or you stop it.`,
    confirmStartSend: "Start sending?",
    sendBusy: "Sending…",
    confirmSend: "Confirm send",
    pause: "Pause",
    pausing: "Pausing…",
    send: "Send",
    stopSend: "Stop sending",
    stopping: "Stopping…",
    formalSend: "Formal send",
    testEmailSectionTitle: "Send test email",
    testEmailSectionDescription:
      "Click a recent campaign card for ID, enter recipient email (subject gets a “Test” prefix). Single message; unrelated to formal send pace below.",
    testRecipientLabel: "Recipient email",
    sendTestEmail: "Send test email",
    monitorActivityLabel: "Monitor campaign",
    selectMonitorActivity: "Select campaign to monitor",
    selectMonitorActivityPlaceholder: "Pick a campaign to view live send status",
    monitorSelectHint: "Select a campaign to monitor.",
    stopSendSubmitted: "✓ Stop requested; remaining emails will not be sent.",
    pauseSendSubmitted: "✓ Pause requested; remaining emails will not be sent.",
    stopFailed: (msg) => `Stop failed: ${msg}`,
    pauseFailed: (msg) => `Pause failed: ${msg}`,
    errSelectTemplate: "Select an email template.",
    errSelectSenderChannel: "Select a sender channel (light SMTP, medium lane, or high-volume lane).",
    errInvalidSenderChannel: "Invalid sender channel; pick again.",
    errFillCampaignName: "Enter a campaign name first.",
    errSelectScheduleDate: "Select a scheduled send date.",
    errInvalidScheduleTime: "Invalid scheduled time.",
    errScheduleNotPast: "Scheduled time must not be before now (pick a future time today or later).",
    campaignSaved: (code) => `✓ Campaign saved, ID ${code}`,
    campaignNameSaved: (name) => `✓ Campaign name saved: ${name}`,
    errEnterCampaignName: "Enter a campaign name first.",
    errSelectCampaignId: "Select a campaign ID from the list first.",
    errCampaignSending:
      "This campaign is sending. Live progress is below; click Stop sending to abort.",
    errSelectNameToDelete: "Select the campaign name to delete in the field or dropdown.",
    errSelectCampaignIdToDelete: "Select the campaign ID to delete first.",
    nameDeleted: (name) => `✓ Deleted name “${name}”`,
    campaignDeleted: "✓ Campaign deleted",
    errSelectLaneFirst: "Select a dedicated lane with configured sending domains first.",
    errSelectActivityCard: "Click a campaign card above first.",
    errFillTestEmail: "Enter a test recipient email.",
    errSelectMonitorCampaign: "This campaign is not sending; no live feed.",
    paceAsapShort: "ASAP",
    paceIntervalSec: (sec) => `At least ${sec}s between emails`,
    prepFirstSend: "Preparing first send…",
    monitorDeliveryStatusLabel: (outcome, row) => {
      if (!row) return "Waiting…";
      const s = String(row.status ?? "").toLowerCase();
      if (s === "sending") return "Sending";
      if (outcome === "success") return "OK";
      if (outcome === "fail") return "Failed";
      if (outcome === "bounce") return "Bounced";
      if (outcome === "reject") return "Rejected";
      return "—";
    },
    validateContactGroupName: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, message: "Group name cannot be empty" };
      const hasCjk =
        /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u9fff\uf900-\ufaff]/.test(trimmed);
      if (hasCjk) {
        if ([...trimmed].length > 30) return { ok: false, message: "Group name with CJK must be ≤30 characters" };
      } else {
        const words = trimmed.split(/\s+/).filter(Boolean);
        if (words.length > 120) return { ok: false, message: "English-only group name must be ≤120 words" };
      }
      return { ok: true };
    },
    formalIndustryPlaceholder: "Select industries (multi-select)",
    formalIndustrySelected: (count, names, more) => `Selected ${count}: ${names}${more}`,
    formalIndustryMore: (count) => ` +${count - 3} more`,
    etaSelectIndustries: "ETA: select target industries under Formal send to compute count",
    etaHours: (h, m, s, cnt) => `ETA: about ${h}h ${m}m ${s}s (${cnt} emails)`,
    etaMinutes: (m, s, cnt) => `ETA: about ${m}m ${s}s (${cnt} emails)`,
    etaSeconds: (s, cnt) => `ETA: about ${s}s (${cnt} emails)`,
    confirmAudienceRecipients: (n) => `about ${n} recipient(s)`,
    confirmAudienceIndustries: (n) => `${n} target industr${n === 1 ? "y" : "ies"} selected`,
    csvParsedConfirm: (outcome, ignoreNote) =>
      `✓ ${outcome}${ignoreNote}. Click Confirm import & verify when ready.`,
    csvTooLarge: (outcome) => `${outcome}. Keep batches ≤1500 rows; split CSV and import in parts.`,
    csvIgnoreNote: (n) => `; ${n} unrecognized column(s) not imported`,
    importProgressStart: (done, total) =>
      done > 0 ? `Resume: ${done}/${total} emails done` : `Importing 0/${total} emails…`,
    importProgress: (done, total) => `Imported ${done}/${total} emails`,
    importDoneMessage: (industry, parseNote, success, serverSkipped, apiRejected) =>
      `✓ Import complete (industry “${industry}”): ${parseNote}, wrote ${success}` +
      (serverSkipped > 0 ? `, ${serverSkipped} write failures` : "") +
      (apiRejected > 0 ? `, ${apiRejected} rejected before submit` : "") +
      ". Save campaign and send by industry below.",
    importInterrupted: (done, total) =>
      `Import interrupted: ${done}/${total} done. Click Import by selected industry tag to continue.`,
    validEmailsCount: (n) => `${n} valid email(s)`,
    industryTagRemoved: (tag, deleted) =>
      deleted != null && deleted > 0
        ? `✓ Removed industry tag “${tag}” and deleted ${deleted} CRM contact(s)`
        : `✓ Removed industry tag “${tag}”`,
    industryTagCreated: (name) => `✓ Created industry tag “${name}”`,
    sendingInProgressKeyword: "sending",
    formalSendStopHint:
      "Tip: click Stop sending during a run to cancel remaining emails; already sent messages still count in stats.",
    statusSent: "Sent",
    statusSending: "Sending",
    statusReady: "Ready",
    statusCompleted: "Completed",
    statusNotSent: "Not sent",
    recentCardsEmpty: "No campaigns yet. Save a task above; the latest 6 IDs appear here.",
    recentCardSentDisabled: (code, name) => `${code} · ${name} (sent — cannot select again)`,
    recentCardClickSelect: (code, name) => `${code} · ${name} (click to select)`,
    newActivitySectionTitle: "New campaign",
    newActivitySectionDescription: "Saving auto-generates a campaign ID; content comes from the template.",
    errCsvOnly: "Only .csv files are supported (Excel: Save As → CSV UTF-8).",
    errIndustryTagName: "Enter an industry tag name.",
    selectIndustryTagFirst: "Select an import industry tag first",
    errSelectIndustryBeforeCsv: "Select an import industry tag before importing CSV.",
    errCsvNeedsEmail: "Choose a CSV with at least one valid email row.",
    errNoValidEmails: "No valid emails to submit. Check the email column format.",
    ...multiExtrasEn(!isSingle)
  };
}

export function getEmailCampaignsPageStrings(
  locale: SiteLocale,
  variant: EmailCampaignVariant
): EmailCampaignsPageStrings {
  const shared = getCrmSharedStrings(locale);
  const page = locale === "en" ? buildEn(variant) : buildZh(variant);
  return { ...shared, ...page };
}

/** @deprecated use getEmailCampaignsPageStrings(locale, 'single') */
export function getEmailCampaignsSingleLanePageStrings(locale: SiteLocale): EmailCampaignsPageStrings {
  return getEmailCampaignsPageStrings(locale, "single");
}

export function getEmailCampaignsMultiLanePageStrings(locale: SiteLocale): EmailCampaignsPageStrings {
  return getEmailCampaignsPageStrings(locale, "multi");
}
