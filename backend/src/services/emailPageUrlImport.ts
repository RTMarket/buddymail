import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { buildEmailBodyHtmlFromPage } from "./emailPageHtmlToEmail.js";
import { importWechatPublishedArticleUrl } from "./socialPublishingWechat.js";
import {
  assertSafeHttpUrl,
  fetchPageHtmlWithFallback,
  metaContent,
  mirrorImageToUploads,
  stripHtmlToText
} from "./emailUrlFetchShared.js";

export type PageUrlImportResult = {
  subjectSuggestion: string;
  bodyHtml: string;
  sourceUrl: string;
  screenshotUrl?: string;
  products?: never;
};

function pageTitle(html: string): string {
  const og = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  if (og) return og.trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return t ? t.replace(/\s*[-|–—|｜].*$/, "").trim() : "";
}

function isWechatArticleUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host !== "mp.weixin.qq.com" && host !== "www.mp.weixin.qq.com" && host !== "mp.weixinbridge.com") {
    return false;
  }
  const path = url.pathname.toLowerCase();
  return path === "/s" || path.startsWith("/s/") || path.startsWith("/mp/appmsg/show");
}

async function mirrorImagesInHtml(
  html: string,
  pageUrl: string,
  uploadDir: string,
  resolvePublicUrl: (filename: string) => string
): Promise<string> {
  const re = /<img([^>]+)src=["']([^"']+)["']/gi;
  let out = html;
  const seen = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = m[2]!;
    if (seen.has(src)) continue;
    const mirrored = await mirrorImageToUploads(src, pageUrl, uploadDir, resolvePublicUrl);
    seen.set(src, mirrored);
  }
  for (const [src, mirrored] of seen) {
    out = out.split(src).join(mirrored);
  }
  return out;
}

function normalizeWechatImageSrc(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^http:\/\/mmbiz\./i.test(trimmed) || /^http:\/\/.*\.qpic\.cn/i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return trimmed;
}

function prepareWechatArticleHtmlForEmail(raw: string): string {
  let html = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '<p style="margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px;font-size:14px;line-height:1.6;color:#475569;">视频内容请在微信公众号中观看。</p>')
    .replace(/<video[\s\S]*?<\/video>/gi, '<p style="margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px;font-size:14px;line-height:1.6;color:#475569;">视频内容请在微信公众号中观看。</p>')
    .replace(/\s+data-src=(["'])(.*?)\1/gi, (_m, quote: string, src: string) => ` src=${quote}${normalizeWechatImageSrc(src)}${quote}`)
    .replace(/\s+data-original-src=(["'])(.*?)\1/gi, " ")
    .replace(/\s+data-backsrc=(["'])(.*?)\1/gi, " ")
    .replace(/\s+crossorigin=(["']).*?\1/gi, "")
    .replace(/\s+referrerpolicy=(["']).*?\1/gi, "");

  html = html.replace(/<img\b([^>]*?)>/gi, (_match, attrs: string) => {
    const srcMatch = attrs.match(/\ssrc=(["'])(.*?)\1/i);
    const src = normalizeWechatImageSrc(srcMatch?.[2] ?? "");
    if (!src) return "";
    let nextAttrs = attrs.replace(/\ssrc=(["'])(.*?)\1/i, ` src="${src}"`);
    if (!/\bstyle=/i.test(nextAttrs)) {
      nextAttrs += ' style="display:block;max-width:100%;height:auto;margin:8px auto;border:0;"';
    }
    return `<img${nextAttrs}>`;
  });

  return simplifyWechatHtmlForQuill(html.trim());
}

function styleDecl(style: string, prop: string): string {
  const re = new RegExp(`(?:^|;)\\s*${prop.replace(/-/g, "\\-")}\\s*:\\s*([^;]+)`, "i");
  return re.exec(style)?.[1]?.trim() ?? "";
}

function keepWechatBlockStyle(style: string): string {
  const keep: string[] = [];
  const textAlign = styleDecl(style, "text-align");
  const fontSize = styleDecl(style, "font-size");
  const fontWeight = styleDecl(style, "font-weight");
  const color = styleDecl(style, "color");
  const lineHeight = styleDecl(style, "line-height");
  const marginBottom = styleDecl(style, "margin-bottom");
  const backgroundColor = styleDecl(style, "background-color");
  if (textAlign) keep.push(`text-align:${textAlign}`);
  if (fontSize) keep.push(`font-size:${fontSize}`);
  if (fontWeight) keep.push(`font-weight:${fontWeight}`);
  if (color) keep.push(`color:${color}`);
  if (lineHeight) keep.push(`line-height:${lineHeight}`);
  keep.push(`margin:0 0 ${marginBottom || "14px"}`);
  if (backgroundColor) keep.push(`background-color:${backgroundColor}`);
  return keep.join(";");
}

function stripWechatInlineNoise(html: string): string {
  return html
    .replace(/<mp-[\s\S]*?<\/mp-[a-z-]+>/gi, "")
    .replace(/<[^>]+\bclass=(["'])[^"']*(?:js_uneditable|mp_profile_iframe)[^"']*\1[^>]*>[\s\S]*?<\/[^>]+>/gi, "")
    .replace(/\s(?:data-[a-z0-9_-]+|nodeleaf|leaf|textstyle|type|class)=(["']).*?\1/gi, "")
    .replace(/\s(?:data-[a-z0-9_-]+|nodeleaf|leaf|textstyle)\b/gi, "");
}

function simplifyWechatHtmlForQuill(html: string): string {
  let out = stripWechatInlineNoise(html);

  out = out.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, _lvl, attrs: string, inner: string) => {
    const style = attrs.match(/\sstyle=(["'])(.*?)\1/i)?.[2] ?? "";
    const cleanInner = stripWechatInlineNoise(inner).trim();
    if (!cleanInner.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim() && !/<img\b/i.test(cleanInner)) return "";
    const blockStyle = keepWechatBlockStyle(`font-size:20px;font-weight:700;text-align:center;${style}`);
    return `<p style="${blockStyle}"><strong>${cleanInner}</strong></p>`;
  });

  out = out.replace(/<(?:section|div|article|main|header|footer|figure|figcaption)\b([^>]*)>([\s\S]*?)<\/(?:section|div|article|main|header|footer|figure|figcaption)>/gi, (_m, attrs: string, inner: string) => {
    const style = attrs.match(/\sstyle=(["'])(.*?)\1/i)?.[2] ?? "";
    const cleanInner = stripWechatInlineNoise(inner).trim();
    const text = cleanInner.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
    if (!text && !/<img\b/i.test(cleanInner)) return "";
    return `<p style="${keepWechatBlockStyle(style)}">${cleanInner}</p>`;
  });

  out = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (_m, attrs: string, inner: string) => {
    const style = attrs.match(/\sstyle=(["'])(.*?)\1/i)?.[2] ?? "";
    const color = styleDecl(style, "color");
    const fontWeight = styleDecl(style, "font-weight");
    const fontSize = styleDecl(style, "font-size");
    const safe: string[] = [];
    if (color) safe.push(`color:${color}`);
    if (fontWeight) safe.push(`font-weight:${fontWeight}`);
    if (fontSize) safe.push(`font-size:${fontSize}`);
    return safe.length ? `<span style="${safe.join(";")}">${inner}</span>` : inner;
  });

  out = out.replace(/<p\b([^>]*)>\s*<\/p>/gi, "");
  out = out.replace(/<(?!\/?(?:p|a|img|strong|b|em|i|span|br)\b)[^>]+>/gi, "");
  return out.trim();
}

async function importEmailBodyFromWechatArticleUrl(opts: {
  url: string;
  uploadDir: string;
  resolvePublicUrl: (filename: string) => string;
}): Promise<PageUrlImportResult> {
  const article = await importWechatPublishedArticleUrl({ url: opts.url });
  const articleHtml = prepareWechatArticleHtmlForEmail(article.contentHtml || "");
  let mirroredHtml = await mirrorImagesInHtml(articleHtml, article.articleUrl, opts.uploadDir, opts.resolvePublicUrl);
  const visible = stripHtmlToText(mirroredHtml, 50000);
  if (visible.length < 8 && !mirroredHtml.includes("<img")) {
    throw new Error("未能从该公众号文章提取足够正文，请确认文章链接可公开访问。");
  }

  const digest = article.digest?.trim()
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#64748b;">${escapeHtml(article.digest.trim())}</p>`
    : "";
  const originalLink = article.articleUrl
    ? `<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">本文来自微信公众号 · <a href="${escapeHtml(article.articleUrl)}" target="_blank" rel="noopener noreferrer" style="color:#059669;font-weight:600;text-decoration:none;">在公众号阅读原文</a></p>`
    : "";

  mirroredHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.75;max-width:640px;margin:0 auto;">
    <p style="margin:0 0 12px;font-size:20px;font-weight:700;line-height:1.35;">${escapeHtml(article.title || "公众号文章")}</p>
    ${digest}
    <div class="wechat-article-body" style="font-size:15px;line-height:1.85;color:#334155;">${mirroredHtml}</div>
    ${originalLink}
  </div>`;

  return {
    subjectSuggestion: article.title || "公众号文章",
    bodyHtml: mirroredHtml,
    sourceUrl: article.articleUrl
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 网页链接 → 从 HTML 主内容区复刻邮件正文（文字+排版；不用整页截图识图） */
export async function importEmailBodyFromPageUrl(opts: {
  env: Env;
  db: Pool;
  tenantId: number;
  url: string;
  uploadDir: string;
  resolvePublicUrl: (filename: string) => string;
}): Promise<PageUrlImportResult> {
  const safe = assertSafeHttpUrl(opts.url);
  const pageUrl = safe.href;
  if (isWechatArticleUrl(safe)) {
    return importEmailBodyFromWechatArticleUrl({
      url: pageUrl,
      uploadDir: opts.uploadDir,
      resolvePublicUrl: opts.resolvePublicUrl
    });
  }

  const { html, finalUrl } = await fetchPageHtmlWithFallback(safe);
  const subjectSuggestion = pageTitle(html) || "邮件主题";

  let bodyHtml = buildEmailBodyHtmlFromPage(html, finalUrl);
  bodyHtml = await mirrorImagesInHtml(bodyHtml, finalUrl, opts.uploadDir, opts.resolvePublicUrl);

  const visible = stripHtmlToText(bodyHtml, 20000);
  if (visible.length < 8 && !bodyHtml.includes("<img")) {
    throw new Error("未能从链接提取足够正文，请换链接或改用上传截图。");
  }

  return {
    subjectSuggestion,
    bodyHtml,
    sourceUrl: pageUrl
  };
}
