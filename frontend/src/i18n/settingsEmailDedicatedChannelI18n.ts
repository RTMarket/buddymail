import type { EmailChannelKind } from "../lib/dedicatedEntitlements";
import type { SiteLocale } from "./siteLocaleTypes";

export type SettingsEmailDedicatedChannelStrings = {
  subnavOverview: string;
  subnavMedium: string;
  subnavBulk: string;
  subnavUltra: string;
  subnavLockedBundle: string;
  subnavLockedTitle: string;
  subnavAria: string;
  mediumTitle: string;
  bulkTitle: string;
  channelMedium: string;
  channelBulk: string;
  peerEmailSetup: (peer: string) => string;
  applyServiceTitle: string;
  unpaidBanner: string;
  cloudMonthlyPlans: string;
  unpaidBannerSuffix: string;
  paidBannerStrong: string;
  paidBannerTier: (tierName: string) => string;
  paidBannerChange: string;
  paidBannerSubmit: (channel: string) => string;
  otherChannelBanner: (tierName: string, accountChannel: string, pageChannel: string) => string;
  otherChannelPeer: (peerSetup: string) => string;
  changePlan: string;
  ultraTitle: string;
  ultraIntro: string;
  lockAlert: string;
  lockTitle: string;
  lockBodyWithEmail: string;
  lockBodyNoEmail: string;
  lockGoAccount: string;
  lockSupport: string;
};

const ZH: SettingsEmailDedicatedChannelStrings = {
  subnavOverview: "总览",
  subnavMedium: "中量邮箱配置",
  subnavBulk: "巨量邮箱配置",
  subnavUltra: "超量邮箱配置",
  subnavLockedBundle: "🔒 中量 / 巨量（定制）",
  subnavLockedTitle: "定制通道，请联系客服",
  subnavAria: "邮箱设置子导航",
  mediumTitle: "中量邮箱配置",
  bulkTitle: "巨量邮箱配置",
  channelMedium: "中量",
  channelBulk: "巨量",
  peerEmailSetup: (peer) => `${peer}邮箱配置`,
  applyServiceTitle: "申请邮件营销服务开通",
  unpaidBanner: "您尚未订购「邮件与营销」付费套餐：请先在",
  cloudMonthlyPlans: "云端月付套餐",
  unpaidBannerSuffix: "选择档位并扫码支付；付款成功后再在本页提交专线申请与 DNS 配置。",
  paidBannerStrong: "套餐已订购（付款成功）。",
  paidBannerTier: (tierName) => `当前档位：${tierName}。换购请前往`,
  paidBannerChange: "云端月付套餐",
  paidBannerSubmit: (channel) => `。请向下填写发件域名并提交${channel}专线申请。`,
  otherChannelBanner: (tierName, accountChannel, pageChannel) =>
    `您已在个人中心开通 ${tierName}（${accountChannel}）。本页用于${pageChannel}专线档位；可在`,
  otherChannelPeer: (peerSetup) => `或前往「${peerSetup}」查看说明。`,
  changePlan: "换购",
  ultraTitle: "超量邮箱配置",
  ultraIntro:
    "超量通道面向日发 15 万封以上的企业客户，由平台定制独立发送方案（IP、域名、品牌隔离等）。请填写下方申请表，工作人员将在 1–2 个工作日内与您联系。中量 / 巨量专线请使用导航中的对应页面。",
  lockAlert:
    "请联系客服：在「系统 → 私信客服」中发送您的定制需求与期望日发数量；管理员将为您评估中量或巨量方案。",
  lockTitle: "定制通道（中量 / 巨量）",
  lockBodyWithEmail:
    "中量、巨量为定制发送通道，不在自助开通范围内。请在「私信客服」中说明定制需求与期望日发数量，由管理员审核后为您开通。",
  lockBodyNoEmail:
    "请先开通个人中心「邮件与营销」基础套餐；中量、巨量仍需通过「私信客服」说明定制需求与期望日发数量，由管理员审核开通。",
  lockGoAccount: "前往开通套餐",
  lockSupport: "私信客服"
};

const EN: SettingsEmailDedicatedChannelStrings = {
  subnavOverview: "Overview",
  subnavMedium: "Medium dedicated setup",
  subnavBulk: "Bulk dedicated setup",
  subnavUltra: "Ultra-high volume setup",
  subnavLockedBundle: "🔒 Medium / bulk (custom)",
  subnavLockedTitle: "Custom channel — contact support",
  subnavAria: "Email settings sub-navigation",
  mediumTitle: "Medium dedicated setup",
  bulkTitle: "Bulk dedicated setup",
  channelMedium: "Medium",
  channelBulk: "Bulk",
  peerEmailSetup: (peer) => `${peer} dedicated setup`,
  applyServiceTitle: "Apply for email marketing channel",
  unpaidBanner: "You have not subscribed to a paid Email & Marketing plan. First open",
  cloudMonthlyPlans: "Cloud monthly plans",
  unpaidBannerSuffix:
    ", choose a tier and pay; then return here to submit your dedicated channel request and DNS setup.",
  paidBannerStrong: "Plan active (payment received).",
  paidBannerTier: (tierName) => `Current tier: ${tierName}. To change plan, go to`,
  paidBannerChange: "Cloud monthly plans",
  paidBannerSubmit: (channel) => `. Fill in your sending domain below and submit the ${channel} channel request.`,
  otherChannelBanner: (tierName, accountChannel, pageChannel) =>
    `Your account has ${tierName} (${accountChannel}). This page is for ${pageChannel} channel tiers — change plan on`,
  otherChannelPeer: (peerSetup) => `or see ${peerSetup}.`,
  changePlan: "Change plan",
  ultraTitle: "Ultra-high volume setup",
  ultraIntro:
    "Ultra-high volume is for enterprises sending 150,000+ emails/day. We provide a custom dedicated setup (IP, domains, brand isolation). Submit the form below; our team will contact you within 1–2 business days. For medium or bulk self-serve channels, use the corresponding pages in the nav.",
  lockAlert:
    "Contact support via in-app message with your custom requirements and expected daily volume; we will assess medium or bulk options.",
  lockTitle: "Custom channel (medium / bulk)",
  lockBodyWithEmail:
    "Medium and bulk are custom dedicated channels, not self-serve. Message support with your requirements and expected daily volume for admin review.",
  lockBodyNoEmail:
    "Activate Email & Marketing in Account Center first; medium/bulk still require messaging support with requirements and daily volume.",
  lockGoAccount: "Open account center",
  lockSupport: "Contact support"
};

export function getSettingsEmailDedicatedChannelStrings(
  locale: SiteLocale
): SettingsEmailDedicatedChannelStrings {
  return locale === "en" ? EN : ZH;
}

/** 个人中心已购通道类型展示（中量/巨量等），用于跨页提示条 */
export function emailChannelKindLabel(locale: SiteLocale, kind: EmailChannelKind): string {
  const ui = getSettingsEmailDedicatedChannelStrings(locale);
  if (kind === "medium") return ui.channelMedium;
  if (kind === "bulk") return ui.channelBulk;
  if (kind === "ultra") return locale === "en" ? "Ultra-high volume" : "超量";
  return locale === "en" ? "Light SMTP" : "轻量";
}
