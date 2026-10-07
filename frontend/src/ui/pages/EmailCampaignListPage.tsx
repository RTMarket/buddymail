import React, { useMemo } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useEmailCampaignPackageMode } from "../../lib/useEmailCampaignPackageMode";
import { EmailCampaignListSingleLanePage } from "./EmailCampaignListSingleLanePage";
import { EmailCampaignListMultiLanePage } from "./EmailCampaignListMultiLanePage";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getEmailCampaignSuiteShellStrings } from "../../i18n/emailCampaignSuiteShellI18n";

/** 独立站：按 LICENSE 日发上限分流单组 / 多组营销活动统计 */
export function EmailCampaignListPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailCampaignSuiteShellStrings(locale), [locale]);
  const { multiLane, blocking } = useEmailCampaignPackageMode();

  if (blocking) {
    return (
      <PageShell title={ui.statsTitle}>
        <SectionCard title={ui.statsLoadingTitle}>{ui.statsLoadingBody}</SectionCard>
      </PageShell>
    );
  }

  return multiLane ? <EmailCampaignListMultiLanePage /> : <EmailCampaignListSingleLanePage />;
}
