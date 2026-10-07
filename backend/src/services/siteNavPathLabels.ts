/** 与 frontend siteNavCatalog 侧栏一致，供管理端展示中文页面名 */
type NavLeaf = { to: string; label: string };
type NavChild = NavLeaf | { group: string; items: NavLeaf[] };
type NavItem = { to: string; label: string; children?: NavChild[] };
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: "概览",
    items: [{ to: "/dashboard", label: "总览" }]
  },
  {
    title: "独立部署",
    items: [
      { to: "/standalone-deploy/plans", label: "部署套餐" },
      { to: "/standalone-deploy", label: "部署安装文档" }
    ]
  },
  {
    title: "文件转换工具",
    items: [{ to: "/content/file-convert", label: "文件格式转换" }]
  },
  {
    title: "搜索与获客",
    items: [{ to: "/leads/search", label: "Leads 搜索" }]
  },
  {
    title: "客户新增与管理",
    items: [
      { to: "/email/contacts", label: "CRM 客户新增" },
      { to: "/email/contacts/database", label: "CRM 数据库" },
      { to: "/email/contacts/followups", label: "精选客户跟进" },
      { to: "/email/contacts/followups/detail-builder", label: "客户跟进详情" }
    ]
  },
  {
    title: "邮件与营销",
    items: [
      { to: "/email/templates", label: "邮件模版" },
      { to: "/email/campaigns", label: "邮件营销" },
      { to: "/email/campaigns/list", label: "营销活动统计" },
      { to: "/email/subscription-usage", label: "套餐用量与统计" },
      { to: "/settings/email", label: "邮箱配置" },
      { to: "/settings/email/smtp", label: "轻量邮箱配置" },
      { to: "/settings/email/dedicated", label: "中量邮箱配置" },
      { to: "/settings/email/ses", label: "巨量邮箱配置" },
      { to: "/settings/email/ultra", label: "超量邮箱配置" }
    ]
  },
  {
    title: "帮助与支持",
    items: [{ to: "/help/qna", label: "在线答疑" }]
  },
  {
    title: "系统",
    items: [
      { to: "/account/center", label: "个人中心" },
      { to: "/account/notifications", label: "站内信" },
      { to: "/account/invoices", label: "申请开票" },
      { to: "/account/support-message", label: "私信客服" }
    ]
  },
  {
    title: "管理后台",
    items: [{ to: "/admin-console/overview", label: "管理后台总览" }]
  }
];

function buildPathLabelMap(): Map<string, string> {
  const byPath = new Map<string, string>();

  function setLabel(path: string, label: string) {
    if (!path.startsWith("/")) return;
    const cur = byPath.get(path);
    if (!cur || label.length > cur.length) byPath.set(path, label);
  }

  function walkItem(sectionTitle: string, trail: string[], item: NavItem) {
    const branch = [...trail, item.label];
    const base = [sectionTitle, ...branch].join(" › ");
    setLabel(item.to, base);
    if (!item.children?.length) return;
    for (const ch of item.children) {
      if ("group" in ch && ch.items?.length) {
        for (const leaf of ch.items) {
          setLabel(leaf.to, [sectionTitle, ...branch, ch.group, leaf.label].join(" › "));
        }
      } else {
        const leaf = ch as NavLeaf;
        setLabel(leaf.to, [sectionTitle, ...branch, leaf.label].join(" › "));
      }
    }
  }

  for (const sec of NAV_SECTIONS) {
    for (const it of sec.items) walkItem(sec.title, [], it);
  }
  return byPath;
}

const PATH_LABEL_MAP = buildPathLabelMap();

export function resolveSiteNavPathLabel(pathRaw: string | null | undefined): string {
  const path = String(pathRaw ?? "").split("?")[0]?.trim() || "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const exact = PATH_LABEL_MAP.get(normalized);
  if (exact) return exact;

  let best = "";
  let bestLen = 0;
  for (const [to, label] of PATH_LABEL_MAP) {
    if (normalized === to || normalized.startsWith(`${to}/`)) {
      if (to.length > bestLen) {
        bestLen = to.length;
        best = label;
      }
    }
  }
  if (best) return best;
  if (normalized === "/") return "官网首页";
  if (normalized === "/gate") return "注册 / 登录";
  if (normalized.startsWith("/admin-console")) return "管理后台";
  if (normalized.startsWith("/alipay")) return "支付宝支付";
  return `其它页面（${normalized}）`;
}

export function resolveSiteNavSectionTitle(pathRaw: string | null | undefined): string {
  const label = resolveSiteNavPathLabel(pathRaw);
  const idx = label.indexOf(" › ");
  return idx > 0 ? label.slice(0, idx) : label;
}
