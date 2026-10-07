import React from "react";
import { EmailCampaignsMultiLanePage } from "./EmailCampaignsMultiLanePage";

/** 多机组 5 万/10 万：邮件营销（止于发送测试邮件） */
export function EmailCampaignsPremiumMarketingPage() {
  return <EmailCampaignsMultiLanePage premiumPageMode="marketing" />;
}
