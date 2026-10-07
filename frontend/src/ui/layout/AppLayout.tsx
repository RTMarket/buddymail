import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { apiJson } from "../../lib/api";
import { PublishTemplateLibraryProvider } from "../../state/PublishTemplateLibraryContext";
import { type ProductModuleKey, useProductModules } from "../../state/ProductModulesContext";
import { Topbar } from "./Topbar";
import { BrandLogo } from "../components/BrandLogo";
import { getVisibleNavSections } from "../nav/siteNavCatalog";
import { FollowupChannelNavItems } from "../nav/FollowupChannelNavItems";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getNavItemDisplayLabel, getNavSectionDisplayTitle } from "../../i18n/navI18n";
import { getAppLayoutStrings } from "../../i18n/shellI18n";
/** 开源版：无渠道锁定，始终放行 */
function canBypassEmailMidBulkLock(_user: unknown): boolean {
  return true;
}
import { IconPanelLeft, IconPanelRight } from "./sidebarCollapseIcons";
import { SiteVisitTracker } from "../components/SiteVisitTracker";
import { SiteFooter } from "./SiteFooter";
import { CloudGatedNavLink } from "../components/CloudGatedNavLink";
import { KeepAliveOutlet } from "./KeepAliveOutlet";
import { prefetchCommonAppRoutesWhenIdle } from "../../lib/routeChunkPrefetch";
import { isDashboardOverviewPath } from "../pages/dashboard/DashboardSubNav";
import { StandaloneAgentBrainProvider } from "../../state/StandaloneAgentBrainContext";

const SIDEBAR_COLLAPSED_LS_KEY = "bss_app_sidebar_collapsed_v1";

/** 侧栏分组对应的订阅板块（用于「未开通」角标）。文件格式转换单独分组且已在 FREE_OPEN_SECTIONS 中免费开放，勿绑定 social。 */
const SECTION_PRODUCT_MODULE: Partial<Record<string, ProductModuleKey>> = {
  搜索与获客: "leads",
  "Leads 搜索": "leads",
  企业leads精搜: "leads",
  "CRM 管理": "crm",
  邮件与营销: "email",
  邮件营销: "email"
};

// 以下分组为免费开放（即使套餐门禁开启，也不显示「未开通」）。
const FREE_OPEN_SECTIONS = new Set<string>([
  "概览",
  "自动化办公",
  "文件转换工具",
  "搜索与获客",
  "Leads 搜索",
  "企业leads精搜",
  "B2B AI",
  "生成邮箱",
  "CRM 管理",
  "邮件与营销",
  "邮件营销",
  "社媒发布",
  "帮助与支持",
  ...(import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS
    ? []
    : (["LinkedIn 发布管理"] as const)),
  ...(import.meta.env.VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS
    ? []
    : (["TikTok 账号管理"] as const)),
  ...(import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS
    ? []
    : (["微信公众号发布管理"] as const))
]);

import type { NavChild, NavItem, NavLeaf, NavSection } from "../nav/siteNavCatalog";

/** dnrpj.cn 定制版：体验版 badge，含"体验版"的导航项显示橙色标识（2026-10-01） */
function TrialBadge({ label }: { label: string }) {
  const isTrial = label.includes("体验版");
  const cleanLabel = label.replace("（体验版）", "").replace("(体验版)", "");
  if (!isTrial) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      <span>{cleanLabel}</span>
      <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
        体验版
      </span>
    </span>
  );
}

function TrialSectionTitle({ title }: { title: string }) {
  const isTrial = title.includes("体验版");
  const cleanTitle = title.replace("（体验版）", "").replace("(体验版)", "");
  if (!isTrial) return <>{title}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{cleanTitle}</span>
      <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
        体验版
      </span>
    </span>
  );
}

const SUB_DOT_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-indigo-500"
];

function splitTo(to: string): { path: string; hash: string } {
  const i = to.indexOf("#");
  if (i < 0) return { path: to, hash: "" };
  return { path: to.slice(0, i), hash: `#${to.slice(i + 1)}` };
}

/** 无子菜单的条目是否与当前路由一致（含 hash 片段） */
function flatNavItemActive(pathname: string, locHash: string, item: NavItem): boolean {
  if (item.children?.length) return false;
  const { path, hash } = splitTo(item.to);
  if (hash) {
    return pathname === path && locHash === hash;
  }
  // 避免 /publish 与 /publish/history 同时高亮：发布中心仅精确匹配自身路由
  if (path === "/publish") return pathname === "/publish";
  if (path === "/account/center") return pathname === "/account/center";
  if (path === "/account/notifications") return pathname === "/account/notifications";
  if (path === "/account/support-message") return pathname === "/account/support-message";
  // 避免 /email/contacts 与 database、followups 等子路径同时高亮
  if (path === "/email/contacts") return pathname === "/email/contacts";
  // 避免 /email/campaigns 与 /email/campaigns/list 同时高亮
  if (path === "/email/campaigns") return pathname === "/email/campaigns";
  if (path.startsWith("/email/daily-mailbox")) return pathname === path;
  // 避免 /settings/email 总览与 smtp/ses/dedicated 子页同时高亮
  if (path === "/settings/email") return pathname === "/settings/email";
  // 避免 /standalone-deploy 与 /standalone-deploy/plans 同时高亮
  if (path === "/standalone-deploy") return pathname === "/standalone-deploy";
  if (path === "/standalone-deploy/plans") return pathname === "/standalone-deploy/plans";
  if (path === "/dashboard/usage-modes") return pathname === "/dashboard/usage-modes";
  if (path === "/dashboard/audience") return pathname === "/dashboard/audience";
  if (path === "/ops/usage-panel") return pathname === "/ops/usage-panel";
  if (path === "/ops/automation-tasks") return pathname === "/ops/automation-tasks";
  if (path === "/ops/automation-execution") return pathname === "/ops/automation-execution";
  if (path === "/b2b-ai") return pathname === "/b2b-ai";
  if (path === "/linkedin/publishing") return pathname === "/linkedin/publishing";
  if (path === "/tiktok/publishing") return pathname === "/tiktok/publishing";
  if (path === "/wechat-official/publishing") return pathname === "/wechat-official/publishing";
  if (pathname === path) return true;
  if (path !== "/" && pathname.startsWith(`${path}/`)) return true;
  return false;
}

/** 与 flatNavItemActive 一致，用于带子菜单的嵌套链接（避免 /publish 与 /publish/history 同时亮） */
function navLinkActive(pathname: string, locHash: string, to: string): boolean {
  return flatNavItemActive(pathname, locHash, { to, label: "" });
}

function sectionHasActiveItem(pathname: string, locHash: string, section: NavSection): boolean {
  return section.items.some((item) => {
    if (item.children?.length) {
      const { path } = splitTo(item.to);
      if (pathname === path || pathname.startsWith(`${path}/`)) return true;
      return item.children.some((sub) => {
        if ("group" in sub && sub.items?.length) {
          return sub.items.some((leaf) => navLinkActive(pathname, locHash, leaf.to));
        }
        const leaf = sub as NavLeaf;
        return navLinkActive(pathname, locHash, leaf.to);
      });
    }
    return flatNavItemActive(pathname, locHash, item);
  });
}

function isNavLeafEntry(sub: NavChild): sub is NavLeaf {
  return !("group" in sub);
}

/** 普通租户：侧栏「邮箱配置」下不单独列出中量/巨量，只保留轻量 + 一条定制入口（与是否已开通邮件套餐无关） */
function shouldBundleEmailSettingsNav(sectionTitle: string, item: NavItem, user: { role?: string; email?: string | null } | null): boolean {
  if (sectionTitle !== "邮件与营销") return false;
  if (item.to !== "/settings/email") return false;
  if (!item.children?.length) return false;
  if (canBypassEmailMidBulkLock(user)) return false;
  return item.children.every(isNavLeafEntry);
}

export function AppLayout() {
  const { user } = useAuth();
  const { locale } = useSiteLocale();
  const shellUi = getAppLayoutStrings(locale);
  const { isModuleActive, linkedInNavRevision } = useProductModules();
  const location = useLocation();
  const pathname = location.pathname;
  const showSiteFooter = isDashboardOverviewPath(pathname);
  const locHash = location.hash;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_COLLAPSED_LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_LS_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!user) return;
    prefetchCommonAppRoutesWhenIdle();
  }, [user?.id]);

  // 企业邮箱导航：加载已配置的邮箱，监听配置页的实时预览和保存事件
  const [mailboxNavTick, setMailboxNavTick] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiJson<{ ok: boolean; emails: string[] }>("/api/daily-mailbox/configured");
        if (r.ok && r.emails.length > 0) {
          // dnrpj.cn 定制版：邮箱地址硬编码，不动态加载
          setMailboxNavTick((t) => t + 1);
        }
      } catch { /* 忽略 */ }
    })();
    const onPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prefixes: string[]; slots: { domain: string }[] };
      const emails: string[] = [];
      detail.prefixes.forEach((p, i) => {
        const prefix = (p || "").trim().toLowerCase();
        if (prefix && detail.slots[i]) {
          emails.push(`${prefix}@${detail.slots[i].domain}`);
        }
      });
      if (emails.length > 0) {
        // dnrpj.cn 定制版：邮箱地址硬编码，不动态加载
        setMailboxNavTick((t) => t + 1);
      }
    };
    const onSaved = async () => {
      try {
        const r = await apiJson<{ ok: boolean; emails: string[] }>("/api/daily-mailbox/configured");
        if (r.ok && r.emails.length > 0) {
          // dnrpj.cn 定制版：邮箱地址硬编码，不动态加载
          setMailboxNavTick((t) => t + 1);
        }
      } catch { /* 忽略 */ }
    };
    window.addEventListener("mailbox-config-preview", onPreview);
    window.addEventListener("mailbox-config-saved", onSaved);
    return () => {
      window.removeEventListener("mailbox-config-preview", onPreview);
      window.removeEventListener("mailbox-config-saved", onSaved);
    };
  }, [user?.id]);

  const [unreadNotif, setUnreadNotif] = useState(0);

  const visibleNavSections = React.useMemo(() => getVisibleNavSections(), [linkedInNavRevision, mailboxNavTick]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    visibleNavSections.forEach((s) => {
      // 「系统」默认展开，便于看到个人中心 / 站内信（其余分组仍默认收起）
      init[s.title] = s.title === "系统";
    });
    return init;
  });

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      visibleNavSections.forEach((sec) => {
        if (sectionHasActiveItem(pathname, locHash, sec)) {
          next[sec.title] = true;
        }
      });
      return next;
    });
  }, [pathname, locHash]);

  useEffect(() => {
    if (!user) {
      setUnreadNotif(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiJson<{ ok: true; count: number }>("/api/me/notifications/unread-count");
        if (!cancelled) {
          const c = Number(r.count ?? 0);
          setUnreadNotif(c);
          if (c > 0) {
            setOpenSections((prev) => ({ ...prev, 系统: true }));
          }
        }
      } catch {
        if (!cancelled) setUnreadNotif(0);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, pathname]);

  const toggleSection = (title: string) => {
    setOpenSections((p) => ({ ...p, [title]: !p[title] }));
  };

  function dotColorFor(sectionIdx: number, itemIdx: number) {
    return SUB_DOT_COLORS[(sectionIdx * 3 + itemIdx) % SUB_DOT_COLORS.length];
  }

  const navTree = (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {visibleNavSections.map((section, sectionIdx) => {
              const open = openSections[section.title] ?? false;
              const hasActive = sectionHasActiveItem(pathname, locHash, section);
              const productMod = SECTION_PRODUCT_MODULE[section.title];
              const sectionLocked =
                !FREE_OPEN_SECTIONS.has(section.title) &&
                Boolean(productMod) &&
                user?.role !== "super_admin" &&
                !isModuleActive(productMod!);
              return (
                <div key={section.title} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className={clsx(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                      "text-slate-900",
                      hasActive ? "bg-slate-100" : "bg-white hover:bg-slate-50"
                    )}
                    aria-expanded={open}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="select-none truncate">{getNavSectionDisplayTitle(section.title, locale)}</span>
                      {sectionLocked ? (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                          {shellUi.notActivated}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={clsx(
                        "inline-block text-slate-400 transition-transform duration-200",
                        open ? "rotate-180" : "rotate-0"
                      )}
                      aria-hidden
                    >
                      ▼
                    </span>
                  </button>
                  {open ? (
                    <div className="mt-1 ml-1 rounded-lg bg-slate-100 py-1.5 pl-2 pr-1">
                      {section.items.map((item, itemIdx) => {
                        if (item.children?.length) {
                          if (shouldBundleEmailSettingsNav(section.title, item, user)) {
                            const leaves = item.children.filter(isNavLeafEntry);
                            const ultraLeaf = leaves.find((l) => l.to === "/settings/email/ultra");
                            const onDedicatedOrSes =
                              pathname === "/settings/email/dedicated" ||
                              pathname === "/settings/email/dedicated-vps" ||
                              pathname === "/settings/email/ses";
                            return (
                              <div key={item.to} className="mb-1 last:mb-0">
                                <div
                                  className="mb-1 flex select-none items-center justify-between px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                                  role="presentation"
                                >
                                  <span>{<TrialBadge label={getNavItemDisplayLabel(section.title, item.label, locale)} />}</span>
                                  {item.to === "/crm/followup-boards" ? (
                                    <button
                                      type="button"
                                      title="管理跟进渠道"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.location.href = "/crm/followup-boards?manage=1";
                                      }}
                                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="3" />
                                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                      </svg>
                                    </button>
                                  ) : null}
                                </div>
                                <div className="ml-2 border-l border-slate-300/70 py-0.5 pl-2">
                                  {ultraLeaf ? (
                                    <CloudGatedNavLink
                                      key={ultraLeaf.to}
                                      to={ultraLeaf.to}
                                      className={clsx(
                                        "mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors last:mb-0",
                                        navLinkActive(pathname, locHash, ultraLeaf.to)
                                          ? "bg-slate-800 text-white shadow-sm"
                                          : "text-slate-800 hover:bg-slate-200/90"
                                      )}
                                      aria-current={navLinkActive(pathname, locHash, ultraLeaf.to) ? "page" : undefined}
                                    >
                                      <span
                                        className={clsx(
                                          "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/30",
                                          navLinkActive(pathname, locHash, ultraLeaf.to)
                                            ? "bg-white"
                                            : dotColorFor(sectionIdx, itemIdx * 4 + 2)
                                        )}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 flex-1 leading-snug">
                                        {<TrialBadge label={getNavItemDisplayLabel(section.title, ultraLeaf.label, locale)} />}
                                      </span>
                                    </CloudGatedNavLink>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => {}}
                                    title={shellUi.customChannelTitle}
                                    className={clsx(
                                      "mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium transition-colors last:mb-0",
                                      onDedicatedOrSes
                                        ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80"
                                        : "text-slate-500 hover:bg-amber-50/90"
                                    )}
                                  >
                                    <span
                                      className={clsx(
                                        "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/30",
                                        dotColorFor(sectionIdx, itemIdx * 4 + 3)
                                      )}
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1 leading-snug">
                                      <span className="mr-0.5" aria-hidden>
                                        🔒
                                      </span>
                                      {shellUi.customChannelLabel}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={item.to} className="mb-1 last:mb-0">
                              <div
                                className="mb-1 select-none px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                                role="presentation"
                              >
                                {<TrialBadge label={getNavItemDisplayLabel(section.title, item.label, locale)} />}
                              </div>
                              <div className="ml-2 border-l border-slate-300/70 py-0.5 pl-2">
                                {item.to === "/crm/followup-boards" ? (
                                  <FollowupChannelNavItems
                                    pathname={pathname}
                                    renderLink={(to, label, active) => (
                                      <CloudGatedNavLink
                                        key={to}
                                        to={to}
                                        className={clsx(
                                          "mb-0.5 flex items-center gap-2.5 rounded-md border border-slate-200 px-2 py-1.5 text-[13px] font-medium transition-colors last:mb-0",
                                          active
                                            ? "bg-slate-800 text-white shadow-sm border-slate-800"
                                            : "text-slate-800 hover:bg-slate-200/90 bg-white"
                                        )}
                                        aria-current={active ? "page" : undefined}
                                      >
                                        <span
                                          className={clsx(
                                            "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/30",
                                            active ? "bg-white" : dotColorFor(sectionIdx, itemIdx * 4 + 1)
                                          )}
                                          aria-hidden
                                        />
                                        <span className="min-w-0 flex-1 truncate leading-snug" title={label}>
                                          {label}
                                        </span>
                                      </CloudGatedNavLink>
                                    )}
                                  />
                                ) : (
                                item.children.map((sub, subIdx) => {
                                  if ("group" in sub && sub.items?.length) {
                                    return (
                                      <div key={sub.group} className="mb-2 last:mb-0">
                                        <div className="mb-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                          {sub.group}
                                        </div>
                                        <div className="ml-1 space-y-0.5 border-l border-slate-200 pl-2">
                                          {sub.items.map((leaf, leafIdx) => {
                                            const subActive = navLinkActive(pathname, locHash, leaf.to);
                                            const dotKey = itemIdx * 8 + subIdx * 4 + leafIdx + 1;
                                            return (
                                              <CloudGatedNavLink
                                                key={leaf.to}
                                                to={leaf.to}
                                                className={clsx(
                                                  "mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors last:mb-0",
                                                  subActive
                                                    ? "bg-slate-800 text-white shadow-sm"
                                                    : "text-slate-800 hover:bg-slate-200/90"
                                                )}
                                                aria-current={subActive ? "page" : undefined}
                                              >
                                                <span
                                                  className={clsx(
                                                    "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/30",
                                                    subActive ? "bg-white" : dotColorFor(sectionIdx, dotKey)
                                                  )}
                                                  aria-hidden
                                                />
                                                <span className="min-w-0 flex-1 truncate leading-snug" title={getNavItemDisplayLabel(section.title, leaf.label, locale)}>
                                                  {<TrialBadge label={getNavItemDisplayLabel(section.title, leaf.label, locale)} />}
                                                </span>
                                              </CloudGatedNavLink>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  }
                                  const leaf = sub as NavLeaf;
                                  const subActive = navLinkActive(pathname, locHash, leaf.to);
                                  return (
                                    <CloudGatedNavLink
                                      key={`${item.to}-${leaf.to}-${subIdx}`}
                                      to={leaf.to}
                                      className={clsx(
                                        "mb-0.5 flex items-center gap-2.5 rounded-md border border-slate-200 px-2 py-1.5 text-[13px] font-medium transition-colors last:mb-0",
                                        subActive
                                          ? "bg-slate-800 text-white shadow-sm border-slate-800"
                                          : "text-slate-800 hover:bg-slate-200/90 bg-white"
                                      )}
                                      aria-current={subActive ? "page" : undefined}
                                    >
                                      <span
                                        className={clsx(
                                          "h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/30",
                                          subActive ? "bg-white" : dotColorFor(sectionIdx, itemIdx * 4 + subIdx + 1)
                                        )}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 flex-1 truncate leading-snug" title={getNavItemDisplayLabel(section.title, leaf.label, locale)}>
                                        {<TrialBadge label={getNavItemDisplayLabel(section.title, leaf.label, locale)} />}
                                      </span>
                                    </CloudGatedNavLink>
                                  );
                                })
                                )}
                              </div>
                            </div>
                          );
                        }

                        const itemActive = flatNavItemActive(pathname, locHash, item);
                        // 外链导航：在新标签页打开
                        if (item.href) {
                          return (
                            <a
                              key={item.to}
                              href={item.href}
                              target={item.newTab ? "_blank" : undefined}
                              rel={item.newTab ? "noopener noreferrer" : undefined}
                              className="mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors last:mb-0 text-slate-900 hover:bg-slate-200/90"
                            >
                              <span
                                className={clsx(
                                  "h-2 w-2 shrink-0 rounded-full ring-2 ring-white/40",
                                  dotColorFor(sectionIdx, itemIdx)
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 leading-snug">
                                {<TrialBadge label={getNavItemDisplayLabel(section.title, item.label, locale)} />}
                              </span>
                            </a>
                          );
                        }
                        return (
                          <CloudGatedNavLink
                            key={item.to}
                            to={item.to}
                            className={clsx(
                              "mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors last:mb-0",
                              itemActive
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-900 hover:bg-slate-200/90"
                            )}
                            aria-current={itemActive ? "page" : undefined}
                          >
                            <span
                              className={clsx(
                                "h-2 w-2 shrink-0 rounded-full ring-2 ring-white/40",
                                itemActive ? "bg-white" : dotColorFor(sectionIdx, itemIdx)
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 leading-snug">
                              {<TrialBadge label={getNavItemDisplayLabel(section.title, item.label, locale)} />}
                            </span>
                            {item.to === "/account/notifications" && unreadNotif > 0 ? (
                              <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                {unreadNotif > 99 ? "99+" : unreadNotif}
                              </span>
                            ) : null}
                          </CloudGatedNavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
  );

  return (
    <StandaloneAgentBrainProvider>
    <div
      className={clsx(
        "w-full bg-slate-50 text-slate-900",
        showSiteFooter ? "flex min-h-screen flex-col" : "min-h-screen"
      )}
    >
      <div className={clsx("flex min-w-0", showSiteFooter ? "min-h-0 flex-1" : "min-h-screen")}>
        {sidebarCollapsed ? (
          <aside className="flex w-[52px] shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3 transition-[width] duration-200 ease-out">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title={shellUi.expandSidebar}
              aria-label={shellUi.expandSidebar}
            >
              <IconPanelLeft className="h-5 w-5" />
            </button>
            <Link
              to="/dashboard"
              className="mt-3 flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              title={shellUi.workbench}
            >
              <img
                src="/brand/bigsocialboss-logo.png"
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-cover object-[center_58%]"
              />
            </Link>
          </aside>
        ) : (
          <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out">
            <div className="relative shrink-0 px-4 pb-2 pt-4">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title={shellUi.collapseSidebar}
                aria-label={shellUi.collapseSidebar}
              >
                <IconPanelRight className="h-5 w-5" />
              </button>
              <Link
                to="/dashboard"
                className="block max-w-full rounded-lg pr-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <BrandLogo variant="sidebar" />
                <span className="sr-only">BigSocialBoss</span>
              </Link>
            </div>
            {navTree}
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SiteVisitTracker />
          <Topbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-slate-50 [scrollbar-gutter:stable]">
            <PublishTemplateLibraryProvider>
              <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-6">
                <KeepAliveOutlet />
              </div>
            </PublishTemplateLibraryProvider>
          </main>
        </div>
      </div>
      {showSiteFooter ? <SiteFooter /> : null}
    </div>
    </StandaloneAgentBrainProvider>
  );
}
