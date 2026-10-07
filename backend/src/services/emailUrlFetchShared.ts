import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const URL_FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
export const MAX_PAGE_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_MIRROR_IMAGE_BYTES = 5 * 1024 * 1024;

export function assertSafeHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("链接格式无效，请粘贴完整的 http(s) 地址");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("仅支持 http 或 https 链接");
  }
  const host = u.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host === "169.254.169.254" ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("不允许解析内网或本地链接");
  return u;
}

export function resolveAbsoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export function metaContent(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i"
  );
  const m = html.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

export async function fetchPageHtml(url: URL): Promise<string> {
  const resp = await fetch(url.href, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": URL_FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) {
    throw new Error(`无法打开链接（HTTP ${resp.status}）。若需登录或被拦截，请改用截图或手动复制。`);
  }
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new Error("链接不是网页，请粘贴博客/文章/店铺等 HTML 页面地址");
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_PAGE_HTML_BYTES) {
    throw new Error("页面过大，请换较短的文章链接或手动编辑");
  }
  return buf.toString("utf8");
}

export async function mirrorImageToUploads(
  imageUrl: string,
  pageUrl: string,
  uploadDir: string,
  resolvePublicUrl: (filename: string) => string
): Promise<string> {
  if (!imageUrl.trim()) return "";
  const abs = resolveAbsoluteUrl(imageUrl, pageUrl);
  if (!abs.startsWith("http")) return "";
  try {
    const resp = await fetch(abs, {
      headers: { "User-Agent": URL_FETCH_UA, Referer: pageUrl },
      signal: AbortSignal.timeout(20000)
    });
    if (!resp.ok) return abs;
    const ct = resp.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return abs;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_MIRROR_IMAGE_BYTES) return abs;
    const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ".jpg";
    const filename = `pageimport_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), buf);
    return resolvePublicUrl(filename);
  } catch {
    return abs;
  }
}

export function stripHtmlToText(html: string, maxLen: number): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/** React/Vite SPA 壳：仅有 #root，几乎无正文 */
export function isThinSpaShell(html: string): boolean {
  if (!/id=["']root["']/i.test(html)) return false;
  const mainText = stripHtmlToText(html, 8000);
  return mainText.length < 120;
}

/** 无 .html 后缀的 GEO/文章页，依次尝试静态 .html（避免 SPA 空壳） */
const STATIC_HTML_FALLBACKS: Record<string, string[]> = {
  "/about/compare": ["/about/compare.html", "/about/zh/compare.html"],
  "/about/product": ["/about/product.html", "/about/zh/product.html"],
  "/about/faq": ["/about/faq.html", "/about/zh/faq.html"],
  "/about/zh/compare": ["/about/zh/compare.html"],
  "/about/zh/product": ["/about/zh/product.html"],
  "/about/zh/faq": ["/about/zh/faq.html"]
};

export async function fetchPageHtmlWithFallback(initial: URL): Promise<{ html: string; finalUrl: string }> {
  const pathKey = initial.pathname.replace(/\/$/, "") || "/";
  const candidates: URL[] = [initial];
  if (!initial.pathname.endsWith(".html")) {
    candidates.push(new URL(`${pathKey}.html`, initial.origin));
  }
  for (const p of STATIC_HTML_FALLBACKS[pathKey] ?? []) {
    candidates.push(new URL(p, initial.origin));
  }
  const seen = new Set<string>();
  let lastHtml = "";
  for (const u of candidates) {
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    try {
      const html = await fetchPageHtml(u);
      lastHtml = html;
      if (!isThinSpaShell(html)) {
        return { html, finalUrl: u.href };
      }
    } catch {
      /* try next */
    }
  }
  if (lastHtml) return { html: lastHtml, finalUrl: initial.href };
  const html = await fetchPageHtml(initial);
  return { html, finalUrl: initial.href };
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!.trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("AI 未返回可解析内容");
}
