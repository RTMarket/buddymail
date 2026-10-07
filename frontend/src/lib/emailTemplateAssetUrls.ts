/**
 * 邮件模版 HTML 中的图片/链接常为 `/uploads/...` 相对路径。
 * 浏览器在 SPA（尤其 dev 下 Vite 端口）会按「当前页 origin」解析，若无反代到静态目录则断裂；
 * 与后端 `email.ts` 中 `rewriteRelativeUrlsForEmail` 保持同一套规则（出站前也会改写）。
 *
 * 可选环境变量：`VITE_PUBLIC_EMAIL_ASSET_BASE_URL`（勿尾斜杠），与实际上传文件对外域名一致。
 */

export function getPublicEmailAssetBaseUrl(): string {
  const explicit = (import.meta.env.VITE_PUBLIC_EMAIL_ASSET_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const apiBase = (import.meta.env.VITE_API_BASE ?? "").trim();
  if (apiBase) {
    try {
      return new URL(apiBase).origin.replace(/\/+$/, "");
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "");
  return (import.meta.env.VITE_PUBLIC_SITE_ORIGIN || "").replace(/\/$/, "");
}

/** 上传接口返回的 `/uploads/...` 转为编辑器/发信可用的绝对 URL */
export function toAbsoluteEmailAssetUrl(url: string, base?: string): string {
  const u = (url ?? "").trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u) || /^data:/i.test(u) || /^cid:/i.test(u)) return u;
  const trimmedBase = (base ?? getPublicEmailAssetBaseUrl()).replace(/\/+$/, "");
  if (!trimmedBase) return u;
  return u.startsWith("/") ? `${trimmedBase}${u}` : `${trimmedBase}/${u}`;
}

export function rewriteRelativeUrlsForEmailPreview(html: string, base?: string): string {
  const trimmedBase = (base ?? getPublicEmailAssetBaseUrl()).replace(/\/+$/, "");
  if (!html || !trimmedBase) return html ?? "";
  return html
    .replace(
      /(\b(?:src|href|action|poster|background)\s*=\s*)(["'])\/(?!\/)([^"']*)\2/gi,
      (_m, attr: string, quote: string, path: string) => `${attr}${quote}${trimmedBase}/${path}${quote}`
    )
    .replace(
      /(url\(\s*)(["']?)\/(?!\/)([^"')]+)\2(\s*\))/gi,
      (_m, pre: string, quote: string, path: string, post: string) =>
        `${pre}${quote}${trimmedBase}/${path}${quote}${post}`
    );
}
