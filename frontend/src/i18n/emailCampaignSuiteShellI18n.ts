import type { SiteLocale } from "./siteLocaleTypes";

export type EmailCampaignSuiteShellStrings = {
  campaignsTitle: string;
  campaignsLoadingTitle: string;
  campaignsLoadingBody: string;
  statsTitle: string;
  statsLoadingTitle: string;
  statsLoadingBody: string;
};

export function getEmailCampaignSuiteShellStrings(locale: SiteLocale): EmailCampaignSuiteShellStrings {
  if (locale === "en") {
    return {
      campaignsTitle: "Email campaigns",
      campaignsLoadingTitle: "Loading",
      campaignsLoadingBody: "Detecting package mode…",
      statsTitle: "Campaign statistics",
      statsLoadingTitle: "Loading",
      statsLoadingBody: "Detecting package mode…"
    };
  }
  return {
    campaignsTitle: "邮件营销",
    campaignsLoadingTitle: "加载中",
    campaignsLoadingBody: "正在识别当前套餐模式…",
    statsTitle: "营销活动统计",
    statsLoadingTitle: "加载中",
    statsLoadingBody: "正在识别当前套餐模式…"
  };
}
