import type { SiteLocale } from "./siteLocaleTypes";
import { getEmailCampaignSuiteShellStrings } from "./emailCampaignSuiteShellI18n";

export type EmailCampaignListSingleLanePageStrings = {
  pageTitle: string;
  pageDescription: string;
  linkUsage: string;
  linkNewCampaign: string;
  refresh: string;
  statsSectionTitle: string;
  statsSectionDescription: string;
  senderScopeLabel: string;
};

export function getEmailCampaignListSingleLanePageStrings(locale: SiteLocale): EmailCampaignListSingleLanePageStrings {
  const shell = getEmailCampaignSuiteShellStrings(locale);
  if (locale === "en") {
    return {
      pageTitle: shell.statsTitle,
      pageDescription:
        "Pick a recently created campaign on the right: recipient count reflects industry tags at save/send time. Left side shows real SMTP delivery and unsubscribes/complaints for the selected date range.",
      linkUsage: "Plan usage & stats",
      linkNewCampaign: "New campaign",
      refresh: "Refresh",
      statsSectionTitle: "Campaign statistics",
      statsSectionDescription:
        "Date range above defaults to today (all tenant campaigns). Below is per-campaign detail; pick by campaign ID or dropdown on the right.",
      senderScopeLabel: "Sender scope (select before listing campaigns)"
    };
  }
  return {
    pageTitle: shell.statsTitle,
    pageDescription:
      "右侧选择最近创建的活动：发送人数为当时保存或发送时所选行业标签下的可发人数。左侧为所选日期内真实 SMTP 投递与退订/投诉等统计。",
    linkUsage: "套餐用量与统计",
    linkNewCampaign: "新建活动",
    refresh: "刷新",
    statsSectionTitle: "邮件活动统计",
    statsSectionDescription:
      "上方日期范围默认统计今天（本租户全部活动）；可改选昨天、近7天或自定义区间。下方为单次活动明细；右侧可按活动编号或下拉选择活动。",
    senderScopeLabel: "发信范围（先选再查活动）"
  };
}
