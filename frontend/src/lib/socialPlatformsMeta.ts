/**
 * 8 个社媒平台：与账号管理 / 发布中心一致（id 与 SocialPlatformLogo 对齐）
 */
export const SOCIAL_PLATFORM_LIST = [
  { id: "xiaohongshu" as const, name: "小红书", abbr: "红" },
  { id: "douyin" as const, name: "抖音", abbr: "抖" },
  { id: "channels" as const, name: "视频号", abbr: "视" },
  { id: "kuaishou" as const, name: "快手", abbr: "快" },
  { id: "tiktok" as const, name: "TikTok", abbr: "TT" },
  { id: "instagram" as const, name: "Instagram", abbr: "IG" },
  { id: "facebook" as const, name: "Facebook", abbr: "FB" },
  { id: "linkedin" as const, name: "LinkedIn", abbr: "领" }
] as const;
