import type { NavSection } from "./siteNavCatalog";

const FOLLOWUP_CHANNELS_CACHE_KEY = "bss-followup-channels-cache";

/** 从缓存读取跟进渠道（前端登录后从接口加载并缓存） */
export function getFollowupChannelNavItems(): { to: string; label: string }[] {
  const defaults = [
    { to: "/crm/followup-boards/direct", label: "直客跟进" },
    { to: "/crm/followup-boards/agency", label: "代理分销商" },
    { to: "/crm/followup-boards/influencer", label: "网红博主导师" },
  ];
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(FOLLOWUP_CHANNELS_CACHE_KEY) : null;
    if (!raw) return defaults;
    const arr = JSON.parse(raw) as { channelKey: string; label: string }[];
    if (!Array.isArray(arr) || !arr.length) return defaults;
    return arr.map((ch) => ({ to: `/crm/followup-boards/${ch.channelKey}`, label: ch.label }));
  } catch {
    return defaults;
  }
}

/** 刷新跟进渠道缓存（从接口） */
export async function refreshFollowupChannelsCache(): Promise<void> {
  try {
    const resp = await fetch("/api/crm/followup-channels", { credentials: "include" });
    const data = (await resp.json()) as { ok: boolean; items?: { channelKey: string; label: string }[] };
    if (data.ok && Array.isArray(data.items)) {
      localStorage.setItem(FOLLOWUP_CHANNELS_CACHE_KEY, JSON.stringify(data.items));
    }
  } catch {
    // 忽略
  }
}
import { standaloneLicensePlanTierId } from "../../lib/standaloneDeploy";

/** 日发 3000：侧栏不挂 B2B AI / 企业调研 / 企业leads精搜，只保留「生成邮箱」 */
function isStandaloneDaily3kPack(): boolean {
  return standaloneLicensePlanTierId() === "email-send-3000";
}

/** 与 {@link getVisibleNavSections} 中动态替换的区块 title 一致 */
export const STANDALONE_EMAIL_MARKETING_NAV_TITLE = "邮件营销";

/** 仅多机组 5 万/10 万拆「邮件营销 / 正式发送」专页；须运行时调用（非模块加载时），以读取 /api/standalone/license */
export function buildEmailMarketingNavItems(): NavSection["items"] {
  return [
    { to: "/email/templates", label: "邮件模版" },
    { to: "/email/campaigns", label: "邮件营销" },
    { to: "/email/campaigns/list", label: "营销活动统计" },
    { to: "/email/ops-health", label: "运维模式健康度管理" },
    { to: "/settings/email/dedicated-vps", label: "装机配置" }
  ];
}

/** 企业邮箱：构建时 env VITE_DAILY_MAILBOX_ADDRESSES 逗号分隔（与后端 DAILY_MAILBOX_ADDRESSES 保持一致） */
function mailboxEnvList(key: string): string[] {
  return String((import.meta.env as Record<string, string | undefined>)[key] ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
}

export function buildEnterpriseMailboxNavItems(): NavSection["items"] {
  const boxKey = (email: string) => email.replace(/[^a-z0-9]/g, "-") || "box";
  return mailboxEnvList("VITE_DAILY_MAILBOX_ADDRESSES").map((email) => ({
    to: `/email/daily-mailbox/${boxKey(email)}`,
    label: email
  }));
}

/** 员工邮箱：构建时 env VITE_STAFF_MAILBOX_ADDRESSES 逗号分隔 */
export function buildStaffMailboxNavItems(): NavSection["items"] {
  const boxKey = (email: string) => email.replace(/[^a-z0-9]/g, "-") || "box";
  return mailboxEnvList("VITE_STAFF_MAILBOX_ADDRESSES").map((email) => ({
    to: `/email/daily-mailbox/${boxKey(email)}`,
    label: email
  }));
}

/** 静态 nav 骨架；邮件与营销项由 {@link buildEmailMarketingNavItems} 在渲染侧栏时覆盖 */
const emailMarketingNavItems: NavSection["items"] = buildEmailMarketingNavItems();

const socialLibraryNavSections: NavSection[] = [
  {
    title: "社媒发布",
    items: [
      { to: "/social/library", label: "频道区" }
    ]
  }
];

const linkedInNavSections: NavSection[] =
  import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS
    ? []
    : [
        {
          title: "LinkedIn 发布管理",
          items: [
            { to: "/linkedin/publishing", label: "账号管理" },
            { to: "/linkedin/publishing/queue", label: "发布队列" },
            { to: "/linkedin/publishing/compose", label: "创建发布" },
            { to: "/linkedin/publishing/import", label: "网站文章导入" },
            { to: "/linkedin/publishing/library", label: "文件库" }
          ]
        }
      ];

const wechatNavSections: NavSection[] =
  import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS
    ? []
    : [
        {
          title: "微信公众号发布管理",
          items: [
            { to: "/wechat-official/publishing", label: "创建文章" }
          ]
        }
      ];

function groupedNavItem(sections: NavSection[]): NavSection["items"][number] | null {
  const sec = sections[0];
  if (!sec?.items[0]) return null;
  return { to: sec.items[0].to, label: sec.title, children: sec.items };
}

const socialPublishItems: NavSection["items"] = [
  ...socialLibraryNavSections[0]!.items,
  ...(groupedNavItem(linkedInNavSections) ? [groupedNavItem(linkedInNavSections)!] : []),
  ...(groupedNavItem(wechatNavSections) ? [groupedNavItem(wechatNavSections)!] : [])
];

const qqEmailNavSection: NavSection = {
  title: "生成邮箱",
  items: [{ to: "/tools/qq-emails", label: "生成邮箱" }]
};

/** 运行时动态计算菜单 */
function buildLeadsNavSection(): NavSection {
  return {
    title: "行业企业搜索",
    items: [
      { to: "/leads/industry", label: "行业企业搜索" },
      { to: "/leads/search", label: "企业精搜" },
    ]
  };
}

/** 每日日报总结 */
const dailyReportNavSection: NavSection = {
  title: "每日日报",
  items: [{ to: "/b2b-ai/daily-report", label: "每日日报总结" }]
};

/** 开源版侧栏：每日日报 → 行业企业搜索 → 企业邮箱 → CRM → 邮件营销 → 社媒发布 → 开发者应用 → 账户 */
export function getStandaloneNavSections(): NavSection[] {
  return [
    ...(isStandaloneDaily3kPack() ? [] : [dailyReportNavSection]),
    buildLeadsNavSection(),
    {
      title: "企业邮箱",
      items: buildEnterpriseMailboxNavItems()
    },
    {
      title: "员工邮箱",
      items: buildStaffMailboxNavItems()
    },
    {
      title: "CRM 管理",
      items: [
        { to: "/email/contacts", label: "CRM 客户新增" },
        { to: "/email/contacts/database", label: "CRM 数据库" },
        { to: "/crm/followup-boards", label: "客户跟进", children: getFollowupChannelNavItems() }
      ]
    },
    {
      title: STANDALONE_EMAIL_MARKETING_NAV_TITLE,
      items: emailMarketingNavItems
    },
    {
      title: "社媒发布",
      items: socialPublishItems
    },
    {
      title: "开发者应用",
      items: [
        { to: "/settings/api", label: "开发者应用" }
      ]
    },
    {
      title: "账户",
      items: [{ to: "/account/center", label: "个人中心" }]
    }
  ];
}

/** 兼容：模块加载时的快照（构建档位正确时与动态结果一致） */
export const navSections: NavSection[] = getStandaloneNavSections();
