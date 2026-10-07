/** 邮件模版正文内联媒体上限（与后端 /api/email/upload kind=inline 一致） */

export const MAX_BODY_INLINE_IMAGES = 5;
export const MAX_BODY_INLINE_VIDEOS = 3;
export const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024;
/** 正文内联图片+视频合计建议上限（含已上传 URL 占位，按单文件上限估算） */
export const MAX_BODY_INLINE_MEDIA_TOTAL_BYTES = 18 * 1024 * 1024;

export const ALLOWED_BODY_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export function countBodyInlineMedia(html: string): { images: number; videos: number } {
  const images = (html.match(/<img\b/gi) ?? []).length;
  const videos = (html.match(/<video\b/gi) ?? []).length;
  return { images, videos };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
