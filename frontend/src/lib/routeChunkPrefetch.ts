/** 独立站：仅预取 router.tsx 中存在的 lazy 路由分包 */
const ROUTE_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  "/email/contacts": () => import("../ui/pages/EmailContactsPage"),
  "/email/contacts/database": () => import("../ui/pages/CrmContactsDatabasePage"),
  "/email/contacts/followups": () => import("../ui/pages/CrmFollowupsPage"),
  "/email/contacts/followups/detail-builder": () => import("../ui/pages/CrmFollowupDetailBuilderPage"),
  "/email/templates": () => import("../ui/pages/EmailTemplatesPage"),
  "/email/campaigns": () => import("../ui/pages/EmailCampaignsPage"),
  "/email/campaigns/list": () => import("../ui/pages/EmailCampaignListPage"),
  "/settings/email/dedicated": () => import("../ui/pages/SettingsEmailDedicatedVpsPage"),
  "/settings/email/dedicated-vps": () => import("../ui/pages/SettingsEmailDedicatedVpsPage"),
  "/account/center": () => import("../ui/pages/AccountCenterPage")
};

const inflight = new Set<string>();
const done = new Set<string>();

function normalizeRoutePath(to: string): string {
  const noHash = to.includes("#") ? to.slice(0, to.indexOf("#")) : to;
  const noQuery = noHash.includes("?") ? noHash.slice(0, noHash.indexOf("?")) : noHash;
  return noQuery || "/";
}

export function prefetchAppRouteChunk(to: string): void {
  const path = normalizeRoutePath(to);
  const loader = ROUTE_CHUNK_LOADERS[path];
  if (!loader || inflight.has(path) || done.has(path)) return;
  inflight.add(path);
  void loader()
    .then(() => {
      done.add(path);
    })
    .finally(() => {
      inflight.delete(path);
    });
}

const COMMON_IDLE_PREFETCH = [
  "/email/campaigns",
  "/email/campaigns/list",
  "/email/contacts",
  "/email/contacts/database",
  "/email/templates"
];

export function prefetchCommonAppRoutesWhenIdle(): void {
  const run = () => {
    for (const path of COMMON_IDLE_PREFETCH) prefetchAppRouteChunk(path);
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 2000);
  }
}
