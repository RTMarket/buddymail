/** 公众号已发布文章 → 邮件模版预填（独立站组合套餐场景） */

import { ensureWechatImageDisplayHtml, prepareWechatContentHtmlForSync, proxiedWechatImageUrl } from "./wechatArticleHtml";
import type { WechatDraftRecord } from "./wechatPublisherStorage";


export type WechatEmailTemplatePrefill = {
  wechatDraftId: string;
  nameSuggested: string;
  category: string;
  subjectTemplate: string;
  bodyHtml: string;
  bodyText: string;
  publishedArticleUrl?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtmlToPlain(html: string, maxLen: number): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** 邮件正文：保留公众号 HTML，替换 iframe 等邮件客户端不支持的块 */
function prepareWechatContentHtmlForEmail(html: string): string {
  let content = prepareWechatContentHtmlForSync(html);
  content = ensureWechatImageDisplayHtml(content);
  if (typeof document === "undefined") return content;
  const wrap = document.createElement("div");
  wrap.innerHTML = content;
  wrap.querySelectorAll("img").forEach((img) => {
    const src =
      img.getAttribute("data-wechat-url") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original-src") ||
      img.getAttribute("src") ||
      "";
    if (src) img.setAttribute("src", proxiedWechatImageUrl(src));
    img.setAttribute("referrerpolicy", "no-referrer");
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.display = "block";
  });
  wrap.querySelectorAll("iframe").forEach((iframe) => {
    const note = document.createElement("p");
    note.setAttribute(
      "style",
      "margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px;font-size:14px;line-height:1.6;color:#475569;"
    );
    note.textContent = "视频内容请在微信公众号中观看。";
    iframe.replaceWith(note);
  });
  wrap.querySelectorAll("video").forEach((video) => {
    const note = document.createElement("p");
    note.setAttribute(
      "style",
      "margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px;font-size:14px;line-height:1.6;color:#475569;"
    );
    note.textContent = "视频内容请在微信公众号中观看。";
    video.replaceWith(note);
  });
  return wrap.innerHTML;
}

function rewriteWechatArticleLinksForEmail(html: string, replacementUrl: string): string {
  const cleanReplacement = replacementUrl.trim();
  if (!html || !cleanReplacement || !/mp\.weixin\.qq\.com/i.test(html)) return html;
  if (typeof document === "undefined") {
    return html.replace(
      /\bhref\s*=\s*(["'])([^"']*mp\.weixin\.qq\.com[^"']*)\1/gi,
      (match, quote: string, rawHref: string) => {
        try {
          const u = new URL(rawHref.replace(/&amp;/gi, "&").trim());
          const host = u.hostname.toLowerCase();
          const path = u.pathname.toLowerCase();
          if ((host === "mp.weixin.qq.com" || host === "www.mp.weixin.qq.com") && (path === "/s" || path.startsWith("/s/"))) {
            return `href=${quote}${escapeHtml(cleanReplacement)}${quote}`;
          }
        } catch {
          return match;
        }
        return match;
      }
    );
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    try {
      const u = new URL(href, window.location.origin);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.toLowerCase();
      if ((host === "mp.weixin.qq.com" || host === "www.mp.weixin.qq.com") && (path === "/s" || path.startsWith("/s/"))) {
        a.setAttribute("href", cleanReplacement);
      }
    } catch {
      /* keep original link */
    }
  });
  return wrap.innerHTML;
}

/** 生成邮件模版：复制公众号全文 HTML，文末附「阅读原文」追踪链接（可选） */
export function buildWechatArticleEmailPrefill(
  article: WechatDraftRecord,
  opts?: { trackedGoUrl?: string; ctaVariant?: "wechatInline" | "readingOriginalFooter" }
): WechatEmailTemplatePrefill {
  const title = (article.title || "公众号文章").trim().slice(0, 64);
  const digest = (article.digest || "").trim();
  const readUrl = (article.publishedArticleUrl || "").trim();
  const trackedUrl = (opts?.trackedGoUrl || "").trim();
  const ctaHref = trackedUrl || readUrl;
  const articleHtml = rewriteWechatArticleLinksForEmail(prepareWechatContentHtmlForEmail(article.contentHtml || ""), trackedUrl);

  const digestBlock = digest
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#64748b;">${escapeHtml(digest)}</p>`
    : "";

  const footerBlock =
    ctaHref && opts?.ctaVariant === "readingOriginalFooter"
      ? `<div style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">本文来自微信公众号</p>
        <p style="margin:0;"><a href="${escapeHtml(ctaHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;border-radius:6px;background:#059669;color:#ffffff;font-size:14px;font-weight:700;line-height:1;text-decoration:none;padding:12px 18px;">阅读原文</a></p>
      </div>`
      : ctaHref
        ? `<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">本文来自微信公众号 · <a href="${escapeHtml(ctaHref)}" target="_blank" rel="noopener noreferrer" style="color:#059669;font-weight:600;text-decoration:none;">在公众号阅读</a></p>`
        : "";

  const wechatMarker =
    ctaHref && opts?.ctaVariant === "readingOriginalFooter"
      ? `<!-- BSS_WECHAT_READ_ORIGINAL_URL:${encodeURIComponent(ctaHref)} -->`
      : "";

  const bodyHtml = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.75;max-width:640px;">`,
    `<p style="margin:0 0 12px;font-size:20px;font-weight:700;line-height:1.35;">${escapeHtml(title)}</p>`,
    digestBlock,
    `<div class="wechat-article-body" style="font-size:15px;line-height:1.85;color:#334155;">${articleHtml || `<p style="color:#94a3b8;">（正文为空）</p>`}</div>`,
    footerBlock,
    `</div>`,
    wechatMarker
  ]
    .filter(Boolean)
    .join("");

  const plainFull = stripHtmlToPlain(articleHtml, 50000);
  const bodyText = [title, digest, plainFull, readUrl ? `微信公众号原文：${readUrl}` : ""].filter(Boolean).join("\n\n");

  return {
    wechatDraftId: article.id,
    nameSuggested: `公众号-${title.slice(0, 12)}`,
    category: "公众号",
    subjectTemplate: title.slice(0, 120),
    bodyHtml,
    bodyText,
    publishedArticleUrl: readUrl || undefined
  };
}
