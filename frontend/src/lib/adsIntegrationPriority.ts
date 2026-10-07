/**
 * 广告投流 / 投放联动：首发 API 打通范围（与产品 Roadmap 一致）。
 * 其余平台（视频号、快手、LinkedIn 等）可在后续阶段按套餐或定制扩展。
 */
export const ADS_PHASE1_PLATFORM_IDS = [
  "xiaohongshu",
  "douyin",
  "tiktok",
  "instagram",
  "facebook"
] as const;

export type AdsPhase1PlatformId = (typeof ADS_PHASE1_PLATFORM_IDS)[number];

/** 用于页面说明、对内文档 */
export const ADS_PHASE1_PLATFORMS_DISPLAY =
  "小红书（聚光等）、抖音（巨量等）、TikTok Ads、Instagram / Facebook（Meta 广告体系）";

/** 侧栏子菜单展示名（与路由 `/ads/:platformId` 一致） */
export const ADS_PHASE1_NAV_LABEL: Record<AdsPhase1PlatformId, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook"
};

export function isAdsPhase1PlatformId(v: string): v is AdsPhase1PlatformId {
  return (ADS_PHASE1_PLATFORM_IDS as readonly string[]).includes(v);
}

/** 默认进入的首个联动平台 */
export const ADS_DEFAULT_PLATFORM_ID: AdsPhase1PlatformId = "xiaohongshu";
