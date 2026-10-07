import type { SiteLocale } from "./siteLocaleTypes";

export type EmailCampaignsWorkbenchStrings = {
  senderEmailTitle: string;
  packageChannelLabel: string;
  senderDomainLabel: string;
  boundSenderEmail: (channelLabel: string) => string;
  noSenderForChannel: (label: string) => string;
  channelNoSenderOption: string;
  channelPickerHint: string;
  formatSentCap: (sent: number) => string;
  defaultHeadingTitle: string;
  defaultHeadingDescription: string;
  domainsSending: (n: number) => string;
  sending: string;
  domainCount: (n: number) => string;
  deliveredVsCap: string;
  capReachedToday: string;
  remainingDeliveries: (n: number) => string;
  laneAttempts: string;
  laneAttemptCapReached: (n: number) => string;
  domainSendingSuffix: string;
  moreDomains: (n: number) => string;
  noDomainsHint: string;
};

export function getEmailCampaignsWorkbenchStrings(locale: SiteLocale): EmailCampaignsWorkbenchStrings {
  if (locale === "en") {
    return {
      senderEmailTitle: "From address",
      packageChannelLabel: "Plan channel",
      senderDomainLabel: "Sending domain",
      boundSenderEmail: (label) => `${label} · bound sender`,
      noSenderForChannel: (label) => `${label} — (no sender yet)`,
      channelNoSenderOption: "No sender for this channel",
      channelPickerHint:
        "Pick plan channel first, then a bound sender; same rules as Campaign stats page.",
      formatSentCap: (sent) => `${sent.toLocaleString()} sent`,
      defaultHeadingTitle: "Dedicated lanes workbench",
      defaultHeadingDescription:
        "Pick a lane, then a sender on that lane. Bar = today's delivered vs daily cap; small text = attempts (incl. failures).",
      domainsSending: (n) => `${n} domain(s) sending`,
      sending: "Sending",
      domainCount: (n) => `${n} sending domain(s)`,
      deliveredVsCap: "Delivered / daily cap",
      capReachedToday: "Daily delivery cap reached — try tomorrow or upgrade",
      remainingDeliveries: (n) => `About ${n.toLocaleString()} delivery slots left`,
      laneAttempts: "Lane attempts (incl. failures)",
      laneAttemptCapReached: (n) => `Lane attempt cap ${n.toLocaleString()} reached today`,
      domainSendingSuffix: "· Sending",
      moreDomains: (n) => `+${n} more domain(s)…`,
      noDomainsHint: "No sending domains — configure under Settings → Email"
    };
  }
  return {
    senderEmailTitle: "发件邮箱",
    packageChannelLabel: "套餐通道",
    senderDomainLabel: "发信域名",
    boundSenderEmail: (label) => `${label} · 已绑发信邮箱`,
    noSenderForChannel: (label) => `${label} — （暂无发信邮箱）`,
    channelNoSenderOption: "该通道暂无发信邮箱",
    channelPickerHint: "先选套餐通道，再选该通道下已绑定的发信邮箱；与「营销活动统计」页口径一致。",
    formatSentCap: (sent) => `${sent.toLocaleString()} 封`,
    defaultHeadingTitle: "专线工作台",
    defaultHeadingDescription:
      "先选发信专线，再选该线下的发信邮箱。进度条按今日送达成功占套餐日发上限；下方小字为本线发送尝试总数（含失败）。",
    domainsSending: (n) => `${n} 域发送中`,
    sending: "发送中",
    domainCount: (n) => `发信域 ${n} 个`,
    deliveredVsCap: "送达成功 / 日发上限",
    capReachedToday: "今日送达成功已达套餐上限，请明日再试或升级套餐",
    remainingDeliveries: (n) => `约余 ${n.toLocaleString()} 封送达名额`,
    laneAttempts: "本线尝试（含失败）",
    laneAttemptCapReached: (n) => `本线今日发送尝试已达 ${n.toLocaleString()} 上限`,
    domainSendingSuffix: "· 发送中",
    moreDomains: (n) => `+${n} 个域…`,
    noDomainsHint: "暂无发信域，请至「设置 · 邮件」配置"
  };
}
