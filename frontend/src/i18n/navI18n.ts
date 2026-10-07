import type { NavSection } from "../ui/nav/siteNavCatalog";
import type { SiteLocale } from "./siteLocaleTypes";

const LABEL_EN: Record<string, string> = {
  概览: "Overview",
  "独立&云端": "Self-hosted & Cloud",
  使用场景: "Use cases",
  独立部署: "Standalone deploy",
  部署套餐: "Plans & checkout",
  部署安装文档: "Install docs",
  文件转换工具: "File tools",
  文件格式转换: "File converter",
  "帮助与支持": "Help",
  在线答疑: "Q&A",
  系统: "Account",
  账户: "Account",
  生成邮箱: "Generate emails",
  "B2B AI": "B2B AI",
  获客流程: "Acquisition flow",
  每日日报总结: "Daily report",
  企业调研: "Company research",
  "Leads 搜索": "Leads search",
  企业leads精搜: "Company leads search",
  "Lead Finder 插件": "Lead Finder",
  导出记录: "Export history",
  用量与额度: "Usage & quota",
  "CRM 管理": "CRM",
  "CRM 客户新增": "Add contacts",
  "CRM 数据库": "CRM database",
  精选客户跟进: "Follow-ups",
  客户跟进详情: "Follow-up detail",
  邮件与营销: "Email & campaigns",
  邮件模版: "Email templates",
  邮件营销: "Campaigns",
  营销活动统计: "Campaign stats",
  发信装机: "Mail server setup",
  专机装机工作台: "Dedicated VPS workbench",
  ...(import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS
    ? {}
    : {
        "LinkedIn 发布管理": "LinkedIn publishing",
        账号管理: "Accounts",
        发布队列: "Queue",
        创建发布: "Compose",
        网站文章导入: "Website import",
        文件库: "Library"
      }),
  ...(import.meta.env.VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS
    ? {}
    : {
        "TikTok 账号管理": "TikTok accounts",
        账号管理: "Accounts",
        发布队列: "Queue",
        创建发布: "Compose",
        文件库: "Library"
      }),
  ...(import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS === "0" ||
  !import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS
    ? {}
    : {
        "微信公众号发布管理": "WeChat publishing",
        公众号发布中心: "WeChat publisher",
        账号认证: "Account auth",
        数据看板: "Dashboard",
        创建文章: "Compose article",
        提交发布: "Submit publish",
        内容复用: "Content reuse",
        文章涨阅读量: "Reading growth"
      }),
  社媒发布: "Social publishing",
  频道区: "Channels",
  文件库: "Library",
  创作区: "Studio",
  智能对话: "Desk chat",
  自动化办公: "Automation office",
  自动化任务: "Automation tasks",
  任务执行: "Task execution",
  使用面板: "Operations",
  面板使用: "Usage panel",
  安全评估: "Security assessment",
  发信安全评估: "Mail security assessment",
  个人中心: "Account settings",
  站内信: "Notifications",
  私信客服: "Contact support"
};

function translateLabel(label: string, locale: SiteLocale): string {
  if (locale === "zh") return label;
  return LABEL_EN[label] ?? label;
}

export function getNavSectionDisplayTitle(title: string, locale: SiteLocale): string {
  return translateLabel(title, locale);
}

export function getNavItemDisplayLabel(_sectionTitle: string, label: string, locale: SiteLocale): string {
  return translateLabel(label, locale);
}

export function getLocalizedNavSections(sections: NavSection[], locale: SiteLocale): NavSection[] {
  return sections.map((section) => {
    const title = translateLabel(section.title, locale);
    const items = section.items.map((item) => {
      const itemLabel = translateLabel(item.label, locale);
      if (!item.children?.length) {
        return { ...item, label: itemLabel };
      }
      return {
        ...item,
        label: itemLabel,
        children: item.children.map((child) => {
          if ("to" in child && !("group" in child)) {
            return { ...child, label: translateLabel(child.label, locale) };
          }
          if ("items" in child) {
            return {
              ...child,
              items: child.items.map((leaf) => ({
                ...leaf,
                label: translateLabel(leaf.label, locale)
              }))
            };
          }
          return child;
        })
      };
    });
    return { ...section, title, items };
  });
}

export function getTopbarStrings(locale: SiteLocale) {
  if (locale === "en") {
    return { accountCenter: "Account", logout: "Log out" };
  }
  return { accountCenter: "个人中心", logout: "退出登录" };
}
