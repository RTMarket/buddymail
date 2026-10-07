import React, { useMemo } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useEmailCampaignPackageMode } from "../../lib/useEmailCampaignPackageMode";
import { EmailCampaignsSingleLanePage } from "./EmailCampaignsSingleLanePage";
import { EmailCampaignsMultiLanePage } from "./EmailCampaignsMultiLanePage";
import { EmailCampaignsPremiumMarketingPage } from "./EmailCampaignsPremiumMarketingPage";
import { isStandaloneMultiLanePremiumPack } from "../../lib/standaloneMultiLanePremiumProfile";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getEmailCampaignSuiteShellStrings } from "../../i18n/emailCampaignSuiteShellI18n";

/** 独立站：按 LICENSE 日发上限分流单组 / 多组 / 多机组 premium 邮件营销 */
export function EmailCampaignsPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailCampaignSuiteShellStrings(locale), [locale]);
  const { multiLane, blocking } = useEmailCampaignPackageMode();
  const premiumMultiLane = isStandaloneMultiLanePremiumPack();

  if (blocking) {
    return (
      <PageShell title={ui.campaignsTitle}>
        <SectionCard title={ui.campaignsLoadingTitle}>{ui.campaignsLoadingBody}</SectionCard>
      </PageShell>
    );
  }

  if (premiumMultiLane) {
    return <EmailCampaignsPremiumMarketingPage />;
  }

  return multiLane ? <EmailCampaignsMultiLanePage /> : <EmailCampaignsSingleLanePage />;
}
