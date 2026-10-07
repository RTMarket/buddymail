import type { SiteLocale } from "./siteLocaleTypes";

export type EmailCampaignsLaneStrings = {
  noIndustryRecorded: string;
  industryMore: (n: number) => string;
  unnamedCampaign: string;
  errCampaignTakenByOtherLane: string;
  errSelectCampaignId: string;
  errCampaignAlreadySent: string;
  errSelectIndustriesFirst: string;
  errAudienceLoading: string;
  errNoContactsForIndustries: string;
  errActiveSession: string;
  errNoSendSession: string;
  errNotSendingNoStop: string;
  stopOkFull: string;
  stopOkPartial: string;
  laneTodayTotal: string;
  laneTodayTotalHint: string;
  laneDomains: (emails: string) => string;
  sendingBadge: string;
  staleSendingHint: string;
  blockingDomainSend: (fromEmail: string, code: string) => string;
  laneNoDomain: string;
  noCampaignData: string;
  retry: string;
  activityIdLabel: string;
  noCampaignSaveFirst: string;
  noCampaign: string;
  errCampaignTakenSelectOther: string;
  sendingPrefix: string;
  selectedPrefix: string;
  campaignSendComplete: string;
  campaignAlreadySentHint: string;
  completeIndustryFirst: string;
  sendBusy: string;
  alreadySent: string;
  send: string;
  stopping: string;
  stopSend: string;
  viewStats: string;
  confirmLaneSend: (count: string) => string;
  confirm: string;
  cancel: string;
  monitorShowComplete: string;
  monitorCompleting: string;
  monitorSending: string;
  monitorPlanned: (n: number) => string;
  monitorAttempted: (attempted: number, planned: number) => string;
  monitorRemain: (hms: string, remainCount: number) => string;
  closeTitle: string;
  activityIdCode: (code: string) => string;
  notSending: string;
  recentEmpty: string;
  statusSent: string;
  statusSending: string;
  statusReady: string;
  newCampaign: string;
  createdToday: (hm: string) => string;
  createdDate: (month: number, day: number) => string;
  cardSentDisabled: (code: string, name: string) => string;
  cardClickSelect: (code: string, name: string) => string;
  pollErrDbBusy: string;
  pollErrTransient: (detail: string) => string;
  pollErrFatal: (msg: string) => string;
};

export type LaneMonitorPollBanner =
  | { kind: "ok" | "err"; text: string }
  | { kind: "err"; pollError: "db_busy" }
  | { kind: "err"; pollError: "transient"; detail: string }
  | { kind: "err"; pollError: "fatal"; detail: string };

export function localizeLaneMonitorBanner(
  banner: LaneMonitorPollBanner,
  laneUi: EmailCampaignsLaneStrings
): { kind: "ok" | "err"; text: string } {
  if ("text" in banner) {
    return { kind: banner.kind, text: banner.text };
  }
  if (banner.pollError === "db_busy") {
    return { kind: "err", text: laneUi.pollErrDbBusy };
  }
  if (banner.pollError === "transient") {
    return { kind: "err", text: laneUi.pollErrTransient(banner.detail) };
  }
  return { kind: "err", text: laneUi.pollErrFatal(banner.detail) };
}

export function getEmailCampaignsLaneStrings(locale: SiteLocale): EmailCampaignsLaneStrings {
  if (locale === "en") {
    return {
      noIndustryRecorded: "(no industries recorded)",
      industryMore: (n) => ` +${n} more`,
      unnamedCampaign: "Unnamed campaign",
      errCampaignTakenByOtherLane: "This campaign is used on another lane; pick a different ID.",
      errSelectCampaignId: "Select a campaign ID first.",
      errCampaignAlreadySent: "This campaign was already sent; create a new one.",
      errSelectIndustriesFirst: "Select target industries under Formal send above first.",
      errAudienceLoading: "Audience count loading; wait before sending.",
      errNoContactsForIndustries: "No contacts for selected industries; change industry tags.",
      errActiveSession: "A send session is already active; please wait.",
      errNoSendSession: "No send session returned — stop and retry, or refresh the page.",
      errNotSendingNoStop: "This campaign is not sending; no need to stop.",
      stopOkFull: "Send stopped; messages already sent still count in campaign stats.",
      stopOkPartial:
        "UI monitoring stopped; backend stop may still be processing — refresh to confirm status.",
      laneTodayTotal: "Today's send total on this lane",
      laneTodayTotalHint: "(includes failures; separate from plan delivery success)",
      laneDomains: (emails) => `Domains: ${emails}`,
      sendingBadge: "Sending",
      staleSendingHint:
        "This campaign is still marked sending in the backend. If live monitor stalls, click Stop sending, then refresh.",
      blockingDomainSend: (fromEmail, code) =>
        `Lane${fromEmail ? ` (${fromEmail})` : ""} still has internal campaign ID ${code} in sending. Refresh; if stuck, stop that campaign or contact support.`,
      laneNoDomain: "This lane has no sending domain configured; cannot send here.",
      noCampaignData: "No campaign data",
      retry: "Retry",
      activityIdLabel: "Campaign ID",
      noCampaignSaveFirst: "No campaigns — save one above first",
      noCampaign: "No campaigns",
      errCampaignTakenSelectOther: "Campaign used on another lane; pick another.",
      sendingPrefix: "Sending:",
      selectedPrefix: "Selected:",
      campaignSendComplete: "Campaign send complete ✅",
      campaignAlreadySentHint: "This campaign was already sent; create a new one to send again.",
      completeIndustryFirst: "Complete industry selection for sending first.",
      sendBusy: "Sending…",
      alreadySent: "Sent",
      send: "Send",
      stopping: "Stopping…",
      stopSend: "Stop sending",
      viewStats: "View stats →",
      confirmLaneSend: (count) => `Start send on this lane? Planned ${count} email(s). Progress below.`,
      confirm: "Confirm",
      cancel: "Cancel",
      monitorShowComplete: "Send complete ✅",
      monitorCompleting: "Finishing send…",
      monitorSending: "Sending",
      monitorPlanned: (n) => `Target ${n.toLocaleString()} email(s) on this lane`,
      monitorAttempted: (a, p) => `Accepted ${a.toLocaleString()} / ${p.toLocaleString()}`,
      monitorRemain: (hms, n) => (n > 0 ? `About ${hms} left (~${n.toLocaleString()} emails)` : `About ${hms} left`),
      closeTitle: "Close",
      activityIdCode: (code) => `Campaign ID ${code || "—"}`,
      notSending: "Not sending",
      recentEmpty:
        "No campaigns yet. Save a task above; the latest 6 IDs appear here.",
      statusSent: "Sent",
      statusSending: "Sending",
      statusReady: "Ready",
      newCampaign: "New campaign",
      createdToday: (hm) => `Today ${hm}`,
      createdDate: (m, d) => `Created ${m}/${d}`,
      cardSentDisabled: (code, name) => `${code} · ${name} (sent — cannot select)`,
      cardClickSelect: (code, name) => `${code} · ${name} (click to select)`,
      pollErrDbBusy:
        "Stats sync paused (database busy). Send may still finish in the background — refreshing; if unchanged for long, reload the page.",
      pollErrTransient: (_detail) =>
        "Send progress sync paused; SMTP may still be sending. Retrying — refresh if numbers stay stuck.",
      pollErrFatal: (msg) =>
        `Progress sync failed${msg ? ` (${msg})` : ""}. Sending may continue — wait or refresh the page.`
    };
  }
  return {
    noIndustryRecorded: "（未记录行业）",
    industryMore: (n) => ` 等 ${n} 个`,
    unnamedCampaign: "未命名活动",
    errCampaignTakenByOtherLane: "当前活动已被其它专线选用，请重新选择活动 ID。",
    errSelectCampaignId: "请先选择活动 ID。",
    errCampaignAlreadySent: "该活动编号已发送过，请新建活动后再发。",
    errSelectIndustriesFirst: "请先在上方「正式发送」勾选发送目标行业。",
    errAudienceLoading: "人数统计加载中，请稍候再点发送。",
    errNoContactsForIndustries: "所选行业暂无可发联系人，请更换行业标签。",
    errActiveSession: "当前已有发送会话，请稍候。",
    errNoSendSession: "未拿到发送会话，请点停止后重试或刷新页面。",
    errNotSendingNoStop: "当前活动不在发送中，无需停止。",
    stopOkFull: "已停止发送；已发出的邮件仍计入营销活动统计。",
    stopOkPartial: "界面已停止监控；后台停止指令可能仍在处理，请稍候刷新确认活动状态。",
    laneTodayTotal: "本专线今日发送总数",
    laneTodayTotalHint: "（含失败；与套餐送达成功分开统计）",
    laneDomains: (emails) => `发信域：${emails}`,
    sendingBadge: "发送中",
    staleSendingHint:
      "该活动仍在后台标记为「发送中」。若实时监控长时间不变，请先点停止发送，再刷新页面后重试。",
    blockingDomainSend: (fromEmail, code) =>
      `本专线${fromEmail ? `（${fromEmail}）` : ""}仍有活动内部 ID ${code} 占用「发送中」。请刷新页面；若仍无法发送，点该活动「停止发送」或联系后台解除占用。`,
    laneNoDomain: "该专线未开通或未绑定发信域名，无法在此栏发送。",
    noCampaignData: "暂无活动数据",
    retry: "重试",
    activityIdLabel: "活动 ID",
    noCampaignSaveFirst: "暂无活动，请先在上方保存活动",
    noCampaign: "暂无活动",
    errCampaignTakenSelectOther: "该活动已被其它专线选用，请选择其它活动。",
    sendingPrefix: "正在发送：",
    selectedPrefix: "已选：",
    campaignSendComplete: "活动已发送完成 ✅",
    campaignAlreadySentHint: "该活动编号已发送过，请新建活动后再发",
    completeIndustryFirst: "请先完成发送目标行业选择。",
    sendBusy: "发送中…",
    alreadySent: "已发送",
    send: "发送",
    stopping: "停止中…",
    stopSend: "停止发送",
    viewStats: "查看统计 →",
    confirmLaneSend: (count) => `确认在本专线开始发送？计划 ${count} 封。进度见下方实时监控。`,
    confirm: "确认",
    cancel: "取消",
    monitorShowComplete: "发送完成 ✅",
    monitorCompleting: "发送收尾中…",
    monitorSending: "发送中",
    monitorPlanned: (n) => `本栏目标 ${n.toLocaleString()} 封`,
    monitorAttempted: (a, p) => `已受理 ${a.toLocaleString()} / ${p.toLocaleString()} 封`,
    monitorRemain: (hms, n) =>
      n > 0 ? `预计还需约 ${hms}（约剩 ${n.toLocaleString()} 封）` : `预计还需约 ${hms}`,
    closeTitle: "关闭",
    activityIdCode: (code) => `活动 ID ${code || "—"}`,
    notSending: "未在发送",
    recentEmpty: "暂无活动。请先在上方「添加任务」保存任务，最近 6 个活动 ID 会显示在这里。",
    statusSent: "已发送",
    statusSending: "发送中",
    statusReady: "待发送",
    newCampaign: "新建活动",
    createdToday: (hm) => `今天 ${hm}`,
    createdDate: (m, d) => `${m}/${d} 创建`,
    cardSentDisabled: (code, name) => `${code} · ${name}（已发送，不可再次选择）`,
    cardClickSelect: (code, name) => `${code} · ${name}（点击选择）`,
    pollErrDbBusy:
      "统计同步暂时中断（数据库繁忙）。后台 SMTP 仍在发，已受理数字可能停住；正在自动重试，请稍候。",
    pollErrTransient: (_detail) =>
      "发送进度同步暂时中断，后台 SMTP 仍在发；正在自动重试，已受理可能短暂不涨，请稍候或刷新页面。",
    pollErrFatal: (msg) =>
      `进度同步失败${msg ? `（${msg}）` : ""}。后台可能仍在发；请稍候或刷新页面。`
  };
}
