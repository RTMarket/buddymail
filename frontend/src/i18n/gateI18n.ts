import type { SiteLocale } from "./siteLocaleTypes";

export type GateStrings = {
  heroTitle: string;
  heroSubtitle: string;
  loginHeading: string;
  accountLabel: string;
  passwordLabel: string;
  submit: string;
  submitting: string;
  errAccountFormat: string;
  errPasswordRequired: string;
};

export function getGateStrings(locale: SiteLocale): GateStrings {
  if (locale === "en") {
    return {
      heroTitle: "BigSocialBoss Enterprise Email Marketing",
      heroSubtitle:
        "Built for high-volume outreach: tens of thousands per day, deliverability-focused tiers, and quota counted only on successful delivery. Detailed campaign analytics with export.",
      loginHeading: "Sign in",
      accountLabel: "Account",
      passwordLabel: "Password",
      submit: "Sign in",
      submitting: "Signing in…",
      errAccountFormat: "Account must be BSB + 6 digits or an email address",
      errPasswordRequired: "Please enter your password"
    };
  }
  return {
    heroTitle: "BigSocialBoss 企业邮件营销平台",
    heroSubtitle:
      "专注企业邮件营销：日发上万、高档可达无上限；配额只计真实送达成功。营销活动解析明细详尽，支持下载导出。",
    loginHeading: "登录",
    accountLabel: "账号",
    passwordLabel: "密码",
    submit: "登录并进入",
    submitting: "登录中…",
    errAccountFormat: "账号格式须为 BSB + 6 位数字",
    errPasswordRequired: "请输入密码"
  };
}
