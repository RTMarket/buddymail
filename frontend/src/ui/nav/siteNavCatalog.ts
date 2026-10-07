export type NavLeaf = { to: string; label: string };
export type NavChild = NavLeaf | { group: string; items: NavLeaf[] };
export type NavItem = { to: string; label: string; children?: NavChild[]; href?: string; newTab?: boolean };
export type NavSection = { title: string; items: NavItem[] };

import {
  navSections,
  getStandaloneNavSections,
  buildEmailMarketingNavItems,
  STANDALONE_EMAIL_MARKETING_NAV_TITLE
} from "./standaloneNavCatalog";
import { hasLinkedInPublisherEntitlement } from "../../lib/linkedinPublisherEntitlement";
import { hasTikTokPublisherEntitlement } from "../../lib/tiktokPublisherEntitlement";
import { hasWechatOfficialEntitlement } from "../../lib/wechatOfficialEntitlement";

export { navSections };

function keepSocialNavItem(item: NavItem): boolean {
  if (item.to.startsWith("/linkedin/")) return hasLinkedInPublisherEntitlement();
  if (item.to.startsWith("/tiktok/")) return hasTikTokPublisherEntitlement();
  if (item.to.startsWith("/wechat-official/")) return hasWechatOfficialEntitlement();
  return true;
}

/** 独立站侧栏：构建 env 决定默认模块；license 可补开 LinkedIn/微信/TikTok（须 rebuild 才进 bundle）。 */
export function getVisibleNavSections(): NavSection[] {
  // 档位相关菜单必须运行时动态计算：构建时 VITE 档位可能为空，靠 /api/standalone/license 回写纠正
  return getStandaloneNavSections().map((section) => {
    if (section.title === STANDALONE_EMAIL_MARKETING_NAV_TITLE) {
      return { ...section, items: buildEmailMarketingNavItems() };
    }
    if (section.title === "社媒发布") {
      return { ...section, items: section.items.filter(keepSocialNavItem) };
    }
    return section;
  });
}
