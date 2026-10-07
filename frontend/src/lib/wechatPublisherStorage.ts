export const WECHAT_LS_DRAFTS = "bss_wechat_drafts_v1";
export const WECHAT_LS_PUBLISHED = "bss_wechat_published_v1";
export const WECHAT_LS_STATS = "bss_wechat_stats_v1";
export const WECHAT_OPEN_DRAFT_ID = "bss_wechat_open_draft_id";
export const WECHAT_READING_GROWTH_WATCH_URLS = "bss_wechat_reading_growth_watch_urls_v1";

export type WechatDraftRecord = {
  id: string;
  title: string;
  digest: string;
  contentHtml: string;
  status: "local" | "synced" | "published" | "failed";
  mediaId?: string;
  publishId?: string;
  publishedAt?: string;
  publishError?: string;
  /** 公众号账号槽位：当前单账号为 default；未来多账号按账号 ID/名称区分 */
  accountId?: string;
  accountName?: string;
  readCount: number;
  /** 邮件「阅读原文」追踪跳转累计（我方统计，非微信后台字段） */
  emailDrivenReads: number;
  emailSent: number;
  /** 使用该模版的邮件「打开」人次（按联系人去重，仅涨阅读看板展示） */
  emailOpened?: number;
  emailClicks: number;
  aiRevised?: boolean;
  aiRevisionNote?: string;
  author?: string;
  coverThumbMediaId?: string;
  coverPreviewUrl?: string;
  coverSquarePreviewUrl?: string;
  coverCropMode?: "wide" | "square";
  coverPicCrop2351?: string;
  coverPicCrop11?: string;
  /** 正式发布后在公众号后台复制的文章链接（邮件 CTA 用） */
  publishedArticleUrl?: string;
  /** 由内容复用生成的邮件模版 ID */
  linkedEmailTemplateId?: number;
  linkedEmailTemplateName?: string;
  createdAt: string;
  updatedAt: string;
};

export function readWechatJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeWechatJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function createWechatDraftId(): string {
  return `wx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readWechatReadingGrowthWatchUrls(): string[] {
  return readWechatJson<string[]>(WECHAT_READING_GROWTH_WATCH_URLS, []);
}

export function prependWechatReadingGrowthWatchUrl(url: string): string[] {
  const clean = url.trim();
  if (!clean) return readWechatReadingGrowthWatchUrls();
  const prev = readWechatReadingGrowthWatchUrls().filter((u) => u.trim() !== clean);
  const next = [clean, ...prev].slice(0, 50);
  writeWechatJson(WECHAT_READING_GROWTH_WATCH_URLS, next);
  return next;
}
