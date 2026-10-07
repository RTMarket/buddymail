import React, { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./ui/layout/AppLayout";
import { GatePage } from "./ui/pages/GatePage";
import { RoutePageFallback } from "./ui/components/RoutePageFallback";
import { lazyPage } from "./routeLazy";
import { RequireProductModule } from "./auth/RequireProductModule";

const EmailContactsPage = lazyPage(() => import("./ui/pages/EmailContactsPage"), "EmailContactsPage");
const QqEmailGeneratePage = lazyPage(() => import("./ui/pages/QqEmailGeneratePage"), "QqEmailGeneratePage");
const B2bDailyReportPage = lazyPage(() => import("./ui/pages/B2bDailyReportPage"), "B2bDailyReportPage");
const CompanyResearchPage = lazyPage(() => import("./ui/pages/CompanyResearchPage"), "CompanyResearchPage");
const LeadsSearchPage = lazyPage(() => import("./ui/pages/LeadsSearchPage"), "LeadsSearchPage");
const IndustrySearchPage = lazyPage(() => import("./ui/pages/IndustrySearchPage"), "IndustrySearchPage");
const LeadsExportsPage = lazyPage(() => import("./ui/pages/LeadsExportsPage"), "LeadsExportsPage");
const LeadsUsagePage = lazyPage(() => import("./ui/pages/LeadsUsagePage"), "LeadsUsagePage");
const CrmContactsDatabasePage = lazyPage(
  () => import("./ui/pages/CrmContactsDatabasePage"),
  "CrmContactsDatabasePage"
);
const CrmFollowupBoardsPage = lazyPage(
  () => import("./ui/pages/CrmFollowupBoardsPage"),
  "CrmFollowupBoardsPage"
);
const CrmFollowupDirectPage = lazyPage(
  () => import("./ui/pages/CrmFollowupBoardsPage"),
  "CrmFollowupDirectPage"
);
const CrmFollowupAgencyPage = lazyPage(
  () => import("./ui/pages/CrmFollowupBoardsPage"),
  "CrmFollowupAgencyPage"
);
const CrmFollowupInfluencerPage = lazyPage(
  () => import("./ui/pages/CrmFollowupBoardsPage"),
  "CrmFollowupInfluencerPage"
);
const CrmFollowupIntentPage = lazyPage(
  () => import("./ui/pages/CrmFollowupIntentPage"),
  "CrmFollowupIntentPage"
);
const CrmFollowupDealPage = lazyPage(
  () => import("./ui/pages/CrmFollowupDealPage"),
  "CrmFollowupDealPage"
);
const CrmFollowupWonPage = lazyPage(
  () => import("./ui/pages/CrmFollowupWonPage"),
  "CrmFollowupWonPage"
);
const EmailDailyMailboxPage = lazyPage(
  () => import("./ui/pages/EmailDailyMailboxPage"),
  "EmailDailyMailboxPage"
);
const EmailDailyMailboxConfigPage = lazyPage(
  () => import("./ui/pages/EmailDailyMailboxConfigPage"),
  "EmailDailyMailboxConfigPage"
);
const PressReleasePage = lazyPage(() => import("./ui/pages/PressReleasePage"), "PressReleasePage");
const EmailTemplatesPage = lazyPage(() => import("./ui/pages/EmailTemplatesPage"), "EmailTemplatesPage");
const EmailOpsHealthPage = lazyPage(() => import("./ui/pages/EmailOpsHealthPage"), "EmailOpsHealthPage");
const EmailCampaignsPage = lazyPage(() => import("./ui/pages/EmailCampaignsPage"), "EmailCampaignsPage");
const EmailFormalSendPremiumPage = lazyPage(
  () => import("./ui/pages/EmailFormalSendPremiumPage"),
  "EmailFormalSendPremiumPage"
);
const EmailCampaignListPage = lazyPage(
  () => import("./ui/pages/EmailCampaignListPage"),
  "EmailCampaignListPage"
);
const SettingsEmailDedicatedVpsPage = lazyPage(
  () => import("./ui/pages/SettingsEmailDedicatedVpsPage"),
  "SettingsEmailDedicatedVpsPage"
);
const AccountCenterPage = lazyPage(() => import("./ui/pages/AccountCenterPage"), "AccountCenterPage");
const StandaloneApiAccessPage = lazyPage(
  () => import("./ui/pages/StandaloneApiAccessPage"),
  "StandaloneApiAccessPage"
);
const LinkedInPublishingPage = lazyPage(
  () => import("./ui/pages/LinkedInPublishingPage"),
  "LinkedInPublishingPage"
);
const LinkedInQueuePage = lazyPage(() => import("./ui/pages/LinkedInPublishingPage"), "LinkedInQueuePage");
const LinkedInComposePage = lazyPage(() => import("./ui/pages/LinkedInPublishingPage"), "LinkedInComposePage");
const LinkedInWebsiteImportPage = lazyPage(
  () => import("./ui/pages/LinkedInPublishingPage"),
  "LinkedInWebsiteImportPage"
);
const LinkedInLibraryPage = lazyPage(() => import("./ui/pages/LinkedInPublishingPage"), "LinkedInLibraryPage");
const TikTokPublishingPage = lazyPage(
  () => import("./ui/pages/TikTokPublishingPage"),
  "TikTokPublishingPage"
);
const TikTokQueuePage = lazyPage(() => import("./ui/pages/TikTokPublishingPage"), "TikTokQueuePage");
const TikTokComposePage = lazyPage(() => import("./ui/pages/TikTokPublishingPage"), "TikTokComposePage");
const TikTokLibraryPage = lazyPage(() => import("./ui/pages/TikTokPublishingPage"), "TikTokLibraryPage");
const WechatOfficialPublisherPage = lazyPage(
  () => import("./ui/pages/WechatOfficialPublisherPage"),
  "WechatOfficialPublisherPage"
);
const WechatOfficialDraftsPage = lazyPage(
  () => import("./ui/pages/WechatOfficialPublisherPage"),
  "WechatOfficialDraftsPage"
);
const StandaloneSocialLibraryPage = lazyPage(
  () => import("./ui/pages/StandaloneSocialLibraryPage"),
  "StandaloneSocialLibraryPage"
);
const StandaloneStudioPage = lazyPage(
  () => import("./ui/pages/StandaloneStudioPage"),
  "StandaloneStudioPage"
);

function LazyEl(props: { children: React.ReactNode }) {
  return <Suspense fallback={<RoutePageFallback />}>{props.children}</Suspense>;
}

/** 独立站 · 邮件 + LinkedIn/微信/自动化办公 */
export const router = createBrowserRouter([
  { path: "/gate", element: <GatePage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/b2b-ai/daily-report" replace /> },
      {
        path: "b2b-ai",
        element: <Navigate to="/b2b-ai/daily-report" replace />
      },
      {
        path: "b2b-ai/daily-report",
        element: (
          <LazyEl>
            <B2bDailyReportPage />
          </LazyEl>
        )
      },
      {
        path: "tools/qq-emails",
        element: (
          <LazyEl>
            <QqEmailGeneratePage />
          </LazyEl>
        )
      },
      {
        path: "leads/company-research",
        element: (
          <LazyEl>
            <CompanyResearchPage />
          </LazyEl>
        )
      },
      {
        path: "leads/search",
        element: (
          <LazyEl>
            <LeadsSearchPage />
          </LazyEl>
        )
      },
      {
        path: "leads/industry",
        element: (
          <LazyEl>
            <IndustrySearchPage />
          </LazyEl>
        )
      },
      { path: "leads/finder", element: <Navigate to="/leads/search" replace /> },
      {
        path: "leads/exports",
        element: (
          <LazyEl>
            <LeadsExportsPage />
          </LazyEl>
        )
      },
      {
        path: "leads/usage",
        element: (
          <LazyEl>
            <LeadsUsagePage />
          </LazyEl>
        )
      },
      {
        path: "email/contacts",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <EmailContactsPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/contacts/database",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmContactsDatabasePage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupBoardsPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/direct",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDirectPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/agency",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupAgencyPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/influencer",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupInfluencerPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/direct/intent",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupIntentPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/direct/deal",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDealPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/direct/won",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupWonPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/agency/intent",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupIntentPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/agency/deal",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDealPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/agency/won",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupWonPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/influencer/intent",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupIntentPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/influencer/deal",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDealPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/influencer/won",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupWonPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/:channelKey",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDirectPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/:channelKey/intent",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupIntentPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/:channelKey/deal",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupDealPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "crm/followup-boards/:channelKey/won",
        element: (
          <LazyEl>
            <RequireProductModule module="crm">
              <CrmFollowupWonPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/daily-mailbox",
        element: <Navigate to="/email/daily-mailbox/marketing-mail-bigsocialboss-com" replace />
      },
      {
        path: "email/daily-mailbox/config",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailDailyMailboxConfigPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/daily-mailbox/:box",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailDailyMailboxPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/templates",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailTemplatesPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/ops-health",
        element: (
          <LazyEl>
            <EmailOpsHealthPage />
          </LazyEl>
        )
      },
      {
        path: "email/campaigns/list",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailCampaignListPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/campaigns",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailCampaignsPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "email/formal-send",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <EmailFormalSendPremiumPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "settings/email/dedicated",
        element: (
          <LazyEl>
            <RequireProductModule module="email">
              <SettingsEmailDedicatedVpsPage />
            </RequireProductModule>
          </LazyEl>
        )
      },
      {
        path: "settings/email/security-assessment",
        element: <Navigate to="/settings/email/dedicated" replace />
      },
      {
        path: "settings/email/dedicated-vps",
        element: <Navigate to="/settings/email/dedicated" replace />
      },
      {
        path: "press/releases",
        element: (
          <LazyEl>
            <PressReleasePage />
          </LazyEl>
        )
      },
      {
        path: "settings/api",
        element: (
          <LazyEl>
            <StandaloneApiAccessPage />
          </LazyEl>
        )
      },
      {
        path: "linkedin/publishing",
        element: (
          <LazyEl>
            <LinkedInPublishingPage />
          </LazyEl>
        )
      },
      {
        path: "linkedin/publishing/queue",
        element: (
          <LazyEl>
            <LinkedInQueuePage />
          </LazyEl>
        )
      },
      {
        path: "linkedin/publishing/compose",
        element: (
          <LazyEl>
            <LinkedInComposePage />
          </LazyEl>
        )
      },
      {
        path: "linkedin/publishing/import",
        element: (
          <LazyEl>
            <LinkedInWebsiteImportPage />
          </LazyEl>
        )
      },
      {
        path: "linkedin/publishing/library",
        element: (
          <LazyEl>
            <LinkedInLibraryPage />
          </LazyEl>
        )
      },
      {
        path: "tiktok/publishing",
        element: (
          <LazyEl>
            <TikTokPublishingPage />
          </LazyEl>
        )
      },
      {
        path: "tiktok/publishing/queue",
        element: (
          <LazyEl>
            <TikTokQueuePage />
          </LazyEl>
        )
      },
      {
        path: "tiktok/publishing/compose",
        element: (
          <LazyEl>
            <TikTokComposePage />
          </LazyEl>
        )
      },
      {
        path: "tiktok/publishing/library",
        element: (
          <LazyEl>
            <TikTokLibraryPage />
          </LazyEl>
        )
      },
      {
        path: "wechat-official/publishing",
        element: (
          <LazyEl>
            <WechatOfficialPublisherPage />
          </LazyEl>
        )
      },
      {
        path: "wechat-official/publishing/dashboard",
        element: <Navigate to="/wechat-official/publishing" replace />
      },
      {
        path: "wechat-official/publishing/compose",
        element: <Navigate to="/wechat-official/publishing" replace />
      },
      {
        path: "wechat-official/publishing/publish",
        element: <Navigate to="/wechat-official/publishing" replace />
      },
      {
        path: "wechat-official/publishing/reuse",
        element: <Navigate to="/wechat-official/publishing" replace />
      },
      {
        path: "wechat-official/publishing/reading-growth",
        element: <Navigate to="/wechat-official/publishing" replace />
      },
      {
        path: "social/library",
        element: (
          <LazyEl>
            <StandaloneSocialLibraryPage />
          </LazyEl>
        )
      },
      {
        path: "social/studio",
        element: (
          <LazyEl>
            <StandaloneStudioPage />
          </LazyEl>
        )
      },
      { path: "social/chat", element: <Navigate to="/social/studio" replace /> },
      {
        path: "account/center",
        element: (
          <LazyEl>
            <AccountCenterPage />
          </LazyEl>
        )
      },
      { path: "*", element: <Navigate to="/b2b-ai/daily-report" replace /> }
    ]
  },
  { path: "*", element: <Navigate to="/gate" replace /> }
]);
