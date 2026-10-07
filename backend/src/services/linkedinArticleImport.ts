import {
  assertSafeHttpUrl,
  fetchPageHtmlWithFallback,
  metaContent,
  stripHtmlToText,
  URL_FETCH_UA
} from "./emailUrlFetchShared.js";
import { ensureLinkedInFixedPromoAboveHashtags } from "../lib/linkedinFixedPromo.js";

const MAX_SITEMAP_BYTES = 2 * 1024 * 1024;
const MAX_DISCOVER_URLS = 120;
const MAX_BATCH_DRAFTS = 30;

export type LinkedInCopyLocale = "zh" | "en";

export type LinkedInArticleDraft = {
  url: string;
  title: string;
  body: string;
  summary: string;
  insights: string[];
  copyLocale: LinkedInCopyLocale;
  /** og:image / twitter:image — used as LinkedIn article card thumbnail */
  thumbnailUrl?: string;
};

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseXmlLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s][^<]*)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = decodeXmlEntities(m[1]!.trim());
    if (loc.startsWith("http://") || loc.startsWith("https://")) out.push(loc);
  }
  return out;
}

async function fetchTextUrl(url: URL): Promise<string> {
  const resp = await fetch(url.href, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": URL_FETCH_UA,
      Accept: "application/xml,text/xml,text/plain,text/html,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_SITEMAP_BYTES) throw new Error("sitemap too large");
  return buf.toString("utf8");
}

function inferCopyLocaleFromUrl(urlRaw: string): LinkedInCopyLocale {
  try {
    const parts = new URL(urlRaw).pathname.split("/").filter(Boolean);
    if (parts[0] === "zh") return "zh";
    if (parts[0] === "en") return "en";
  } catch {
    /* ignore */
  }
  return "en";
}

export function resolveLinkedInCopyLocale(input?: string, urlHint?: string): LinkedInCopyLocale {
  if (input === "zh" || input === "en") return input;
  if (urlHint) return inferCopyLocaleFromUrl(urlHint);
  return "en";
}

function inferLocaleFromPath(pathname: string): LinkedInCopyLocale | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "en" || parts[0] === "zh") return parts[0];
  return undefined;
}

function isLikelyArticleUrl(raw: string, preferLocale?: "en" | "zh"): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const path = u.pathname.replace(/\/$/, "") || "/";
  const lower = path.toLowerCase();
  if (/\.(xml|rss|json|atom|txt|pdf|png|jpe?g|webp|gif|css|js)$/i.test(lower)) return false;
  if (/(^|\/)sitemap/i.test(lower) || /rss/i.test(lower) || lower.endsWith("/blog") || lower.endsWith("/articles")) {
    return false;
  }
  if (lower === "/en" || lower === "/zh" || lower === "/") return false;
  if (/(^|\/)category(\/|$)/i.test(lower) || /privacy/i.test(lower)) return false;

  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2 && (parts[0] === "en" || parts[0] === "zh")) {
    if (preferLocale && parts[0] !== preferLocale) return false;
    return parts[1]!.length > 2;
  }
  if (parts[0] === "blog" && parts.length >= 2) return true;
  return parts.length >= 2 && parts.every((p) => !["blog", "articles", "tag", "tags", "author", "page"].includes(p.toLowerCase()));
}

async function discoverSitemapUrls(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap_index.xml`];
  try {
    const robots = await fetchTextUrl(new URL(`${origin}/robots.txt`));
    for (const line of robots.split("\n")) {
      const m = line.match(/^\s*Sitemap:\s*(\S+)/i);
      if (m?.[1]) candidates.unshift(m[1]!.trim());
    }
  } catch {
    /* ignore */
  }

  const seen = new Set<string>();
  const articleCandidates: string[] = [];
  const sitemapQueue = [...new Set(candidates)];

  while (sitemapQueue.length && seen.size < 12) {
    const next = sitemapQueue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    let xml = "";
    try {
      xml = await fetchTextUrl(new URL(next));
    } catch {
      continue;
    }
    const locs = parseXmlLocs(xml);
    const isIndex = /<sitemapindex/i.test(xml);
    if (isIndex) {
      for (const loc of locs) {
        if (!seen.has(loc)) sitemapQueue.push(loc);
      }
    } else {
      articleCandidates.push(...locs);
    }
  }
  return articleCandidates;
}

export async function discoverLinkedInArticleUrls(
  siteUrlRaw: string,
  articleLocale?: LinkedInCopyLocale
): Promise<{
  ok: true;
  siteUrl: string;
  locale?: LinkedInCopyLocale;
  urls: string[];
  total: number;
}> {
  const site = assertSafeHttpUrl(siteUrlRaw);
  const preferLocale = articleLocale ?? inferLocaleFromPath(site.pathname);
  const origin = site.origin;
  const locs = await discoverSitemapUrls(origin);
  const filtered = [...new Set(locs.filter((u) => isLikelyArticleUrl(u, preferLocale)))].slice(0, MAX_DISCOVER_URLS);
  if (!filtered.length) {
    throw new Error(
      "未能从 sitemap 解析到文章链接。请确认网站根目录有 /sitemap.xml（或 robots.txt 声明 Sitemap），或改用「添加单篇文章」逐条粘贴 URL。"
    );
  }
  return { ok: true, siteUrl: site.href, locale: preferLocale, urls: filtered, total: filtered.length };
}

function pageTitle(html: string): string {
  const og = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  if (og) return og.trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return t ? t.replace(/\s*[-|–—|｜].*$/, "").trim() : "";
}

function pageDescription(html: string): string {
  return (
    metaContent(html, "description") ||
    metaContent(html, "og:description") ||
    metaContent(html, "twitter:description") ||
    ""
  ).trim();
}

function resolvePageAssetUrl(pageUrl: string, raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  try {
    return new URL(u, pageUrl).href;
  } catch {
    return "";
  }
}

function isGenericSharePlaceholder(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /og-wechat\.(jpg|jpeg|png|webp)/i.test(lower) ||
    /og-default\.(jpg|jpeg|png|webp)/i.test(lower) ||
    /favicon\.(svg|ico|png)/i.test(lower) ||
    /bigsocialboss-logo/i.test(lower) ||
    /\/brand\//i.test(lower)
  );
}

function extractJsonLdImageUrl(html: string, pageUrl: string): string {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const inner = block.replace(/<script[^>]*>|<\/script>/gi, "").trim();
    if (!inner) continue;
    try {
      const data = JSON.parse(inner) as unknown;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        if (rec["@type"] !== "BlogPosting") continue;
        const image = rec.image;
        if (typeof image === "string") {
          const resolved = resolvePageAssetUrl(pageUrl, image);
          if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
        }
        if (image && typeof image === "object" && !Array.isArray(image)) {
          const url = (image as Record<string, unknown>).url;
          if (typeof url === "string") {
            const resolved = resolvePageAssetUrl(pageUrl, url);
            if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
          }
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return "";
}

function extractArticleCoverImageUrl(html: string, pageUrl: string): string {
  const coverMatch =
    /<figure[^>]*class=["'][^"']*article-cover[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i.exec(html) ??
    /class=["']article-cover["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (coverMatch?.[1]) {
    const resolved = resolvePageAssetUrl(pageUrl, coverMatch[1]);
    if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
  }
  const shareConfigMatch = /data-share-config=["']([^"']+)["']/i.exec(html);
  if (shareConfigMatch?.[1]) {
    try {
      const decoded = shareConfigMatch[1].replace(/&#34;/g, '"');
      const cfg = JSON.parse(decoded) as { imageUrl?: string };
      if (cfg.imageUrl) {
        const resolved = resolvePageAssetUrl(pageUrl, cfg.imageUrl);
        if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
      }
    } catch {
      /* ignore */
    }
  }
  const posterMatch = /poster=["']([^"']+\.(?:png|jpg|jpeg|webp))["']/i.exec(html);
  if (posterMatch?.[1]) {
    const resolved = resolvePageAssetUrl(pageUrl, posterMatch[1]);
    if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
  }
  return "";
}

export function pageThumbnailUrl(html: string, pageUrl: string): string {
  const fromStructured = extractJsonLdImageUrl(html, pageUrl);
  if (fromStructured) return fromStructured;

  const fromCover = extractArticleCoverImageUrl(html, pageUrl);
  if (fromCover) return fromCover;

  const metaCandidates = [
    metaContent(html, "og:image"),
    metaContent(html, "og:image:url"),
    metaContent(html, "twitter:image"),
    metaContent(html, "twitter:image:src")
  ];
  for (const raw of metaCandidates) {
    const resolved = resolvePageAssetUrl(pageUrl, raw);
    if (resolved && !isGenericSharePlaceholder(resolved)) return resolved;
  }
  return "";
}

/** Fetch article page and return og:image URL (empty if none). */
export async function fetchArticleThumbnailUrl(urlRaw: string): Promise<string> {
  const safe = assertSafeHttpUrl(urlRaw);
  const { html, finalUrl } = await fetchPageHtmlWithFallback(safe);
  return pageThumbnailUrl(html, finalUrl);
}

function cleanInsightText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulInsight(text: string): boolean {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const minLen = hasCjk ? 12 : 28;
  const maxLen = hasCjk ? 260 : 220;
  if (text.length < minLen || text.length > maxLen) return false;
  if (/https?:\/\/|www\.|utm_|cookie|privacy policy|subscribe|sign up|all rights reserved|隐私政策|订阅|登录/i.test(text)) {
    return false;
  }
  return true;
}

function uniqueInsights(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").slice(0, 90);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function trimSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  return `${cut.slice(0, Math.max(40, cut.lastIndexOf(" ")))}…`;
}

function extractInsightsFromHtml(html: string, description: string): string[] {
  const candidates: string[] = [];
  if (description && isUsefulInsight(description)) candidates.push(description);

  const blockRe = /<(h2|h3|li|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const cleaned = cleanInsightText(m[2] ?? "");
    if (isUsefulInsight(cleaned)) candidates.push(cleaned);
  }

  const plain = stripHtmlToText(html, 12_000);
  for (const sentence of plain.split(/(?<=[.!?。！？])\s+/)) {
    const cleaned = cleanInsightText(sentence);
    if (isUsefulInsight(cleaned)) candidates.push(cleaned);
  }

  return uniqueInsights(candidates).slice(0, 5).map((x) => trimSentence(x, 145));
}

function buildCommentary(
  title: string,
  insights: string[],
  articleUrl: string,
  copyLocale: LinkedInCopyLocale
): string {
  const labels =
    copyLocale === "zh"
      ? {
          keyIdeas: "核心观点：",
          readFull: "阅读原文：",
          hashtags: "#邮件营销 #B2B营销 #BigSocialBoss"
        }
      : {
          keyIdeas: "Key ideas:",
          readFull: "Read the full article:",
          hashtags: "#EmailMarketing #B2BMarketing #BigSocialBoss"
        };
  const linkLine = `${labels.readFull} ${articleUrl}`;
  const maxChars = 980;
  const lines = [title, "", labels.keyIdeas];
  const minInsightCount = Math.min(3, insights.length);

  for (const insight of insights.slice(0, 5)) {
    lines.push(`• ${insight}`);
    const draft = ensureLinkedInFixedPromoAboveHashtags(`${lines.join("\n")}\n\n${linkLine}\n\n${labels.hashtags}`);
    if (draft.length > maxChars && lines.length > 3 + minInsightCount) {
      lines.pop();
      break;
    }
  }

  let text = ensureLinkedInFixedPromoAboveHashtags(`${lines.join("\n")}\n\n${linkLine}\n\n${labels.hashtags}`);
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 3)}…`;
  }
  return text;
}

export async function buildLinkedInDraftFromArticleUrl(
  urlRaw: string,
  copyLocaleInput?: LinkedInCopyLocale
): Promise<LinkedInArticleDraft> {
  const safe = assertSafeHttpUrl(urlRaw);
  const copyLocale = resolveLinkedInCopyLocale(copyLocaleInput, safe.href);
  const { html, finalUrl } = await fetchPageHtmlWithFallback(safe);
  const title = pageTitle(html) || compactUrlTitle(finalUrl);
  const summary = pageDescription(html);
  const thumbnailUrl = pageThumbnailUrl(html, finalUrl);
  const insights = extractInsightsFromHtml(html, summary);
  if (!insights.length && summary) insights.push(trimSentence(summary, 145));
  const body = buildCommentary(
    title,
    insights.length ? insights : [summary || title],
    finalUrl,
    copyLocale
  );
  return { url: finalUrl, title, body, summary, insights, copyLocale, thumbnailUrl: thumbnailUrl || undefined };
}

function compactUrlTitle(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").slice(0, 90);
  } catch {
    return url.slice(0, 90);
  }
}

export async function buildLinkedInDraftBatch(
  urlsRaw: string[],
  copyLocaleInput?: LinkedInCopyLocale
): Promise<LinkedInArticleDraft[]> {
  const urls = urlsRaw.map((u) => u.trim()).filter(Boolean).slice(0, MAX_BATCH_DRAFTS);
  if (!urls.length) return [];
  const out: LinkedInArticleDraft[] = [];
  for (const url of urls) {
    try {
      out.push(await buildLinkedInDraftFromArticleUrl(url, copyLocaleInput));
    } catch (e) {
      const title = compactUrlTitle(url);
      const copyLocale = resolveLinkedInCopyLocale(copyLocaleInput, url);
      const failBody =
        copyLocale === "zh"
          ? `${title}\n\n（未能读取正文，请检查链接是否可公开访问。）\n\n阅读原文：${url}`
          : `${title}\n\n(Could not fetch article body. Check the URL is publicly accessible.)\n\nRead the full article: ${url}`;
      out.push({
        url,
        title,
        summary: "",
        insights: [],
        body: failBody,
        copyLocale
      });
    }
  }
  return out;
}
