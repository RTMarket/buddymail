import React from "react";
import { Navigate } from "react-router-dom";
import { EmailCampaignsMultiLanePage } from "./EmailCampaignsMultiLanePage";
import { isStandaloneMultiLanePremiumPack } from "../../lib/standaloneMultiLanePremiumProfile";

/** 多机组 5 万/10 万：正式发送（各专线独立发信） */
export function EmailFormalSendPremiumPage() {
  if (!isStandaloneMultiLanePremiumPack()) {
    return <Navigate to="/email/campaigns" replace />;
  }
  return <EmailCampaignsMultiLanePage premiumPageMode="formal" />;
}
