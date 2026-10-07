import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Env } from "../env.js";

export type CommerceLinkProduct = {
  title: string;
  price: string;
  comparePrice: string;
  imageUrl: string;
  link: string;
};

export type CommerceLinkParseResult = {
  headline: string;
  intro: string;
  products: CommerceLinkProduct[];
  notes?: string;
  sourceUrl: string;
};

const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function extractJsonObject(text: string): unknown {
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
  throw new Error("AI 未返回可解析的商品 JSON");
}

function assertSafeHttpUrl(raw: string): URL {
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

function resolveAbsoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i"
  );
  const m = html.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function stripHtmlToText(html: string, maxLen: number): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function collectImgSrcs(html: string, baseUrl: string, limit = 40): string[] {
  const out: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const src = resolveAbsoluteUrl(m[1]!, baseUrl);
    if (!src.startsWith("http")) continue;
    if (/\.(svg|gif|ico)(\?|$)/i.test(src)) continue;
    if (/logo|icon|avatar|sprite|badge|1x1|pixel/i.test(src)) continue;
    if (out.includes(src)) continue;
    out.push(src);
  }
  return out;
}

function priceFromOffer(offer: unknown): { price: string; comparePrice: string } {
  if (!offer || typeof offer !== "object") return { price: "", comparePrice: "" };
  const o = offer as Record<string, unknown>;
  const p = o.price ?? o.lowPrice ?? o.highPrice;
  const price =
    typeof p === "number"
      ? String(p)
      : typeof p === "string"
        ? p.trim()
        : "";
  const was = typeof o.priceSpecification === "object" ? "" : "";
  return { price: price ? (price.startsWith("¥") || price.startsWith("$") ? price : `¥${price}`) : "", comparePrice: was };
}

function productFromJsonLdNode(node: Record<string, unknown>, pageUrl: string): CommerceLinkProduct | null {
  const type = String(node["@type"] ?? "").toLowerCase();
  if (!type.includes("product")) return null;
  const title = String(node.name ?? node.title ?? "").trim();
  const link = String(node.url ?? pageUrl).trim() || pageUrl;
  let imageUrl = "";
  const img = node.image;
  if (typeof img === "string") imageUrl = img;
  else if (Array.isArray(img) && typeof img[0] === "string") imageUrl = img[0];
  else if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") {
    imageUrl = String((img as Record<string, unknown>).url);
  }
  const { price, comparePrice } = priceFromOffer(node.offers ?? node.offer);
  if (!title && !imageUrl) return null;
  return {
    title: title || "商品",
    price,
    comparePrice,
    imageUrl: imageUrl ? resolveAbsoluteUrl(imageUrl, pageUrl) : "",
    link: resolveAbsoluteUrl(link, pageUrl)
  };
}

function productsFromJsonLd(html: string, pageUrl: string): CommerceLinkProduct[] {
  const products: CommerceLinkProduct[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]!.trim()) as unknown;
      const nodes: Record<string, unknown>[] = [];
      if (Array.isArray(data)) nodes.push(...(data as Record<string, unknown>[]));
      else if (data && typeof data === "object") {
        const o = data as Record<string, unknown>;
        if (Array.isArray(o["@graph"])) nodes.push(...(o["@graph"] as Record<string, unknown>[]));
        else nodes.push(o);
      }
      for (const node of nodes) {
        const type = String(node["@type"] ?? "").toLowerCase();
        if (type.includes("itemlist") && Array.isArray(node.itemListElement)) {
          for (const el of node.itemListElement as unknown[]) {
            if (!el || typeof el !== "object") continue;
            const item = (el as Record<string, unknown>).item ?? el;
            if (item && typeof item === "object") {
              const p = productFromJsonLdNode(item as Record<string, unknown>, pageUrl);
              if (p) products.push(p);
            }
          }
        } else {
          const p = productFromJsonLdNode(node, pageUrl);
          if (p) products.push(p);
        }
      }
    } catch {
      /* skip bad json-ld */
    }
  }
  return products;
}

function heuristicSingleProduct(html: string, pageUrl: string): CommerceLinkProduct | null {
  const ogTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (ogTitle || titleMatch?.[1] || "").replace(/\s*[-|–—].*$/, "").trim();
  const ogImage = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  const priceMatch = html.match(/(?:¥|￥|CNY\s*|USD\s*\$|\$)\s*[\d,.]+(?:\.\d{1,2})?/i);
  const wasMatch = html.match(/(?:原价|划线价)[^\d]{0,12}((?:¥|￥|\$)\s*[\d,.]+)/i);
  if (!title && !ogImage) return null;
  return {
    title: title || "商品",
    price: priceMatch?.[0]?.trim() ?? "",
    comparePrice: wasMatch?.[1]?.trim() ?? "",
    imageUrl: ogImage ? resolveAbsoluteUrl(ogImage, pageUrl) : "",
    link: pageUrl
  };
}

async function openAiCompatibleChat(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}) {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user }
      ]
    })
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    const err = (data?.error as Record<string, unknown>)?.message;
    throw new Error(String(err ?? `AI request failed: HTTP ${resp.status}`));
  }
  const choices = data?.choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error("Empty AI response");
  const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  throw new Error("Empty AI response");
}

async function aiExtractProductsFromPage(opts: {
  env: Env;
  pageUrl: string;
  html: string;
  columnsHint?: number;
  layoutHint?: string;
}): Promise<{ headline: string; intro: string; products: CommerceLinkProduct[]; notes?: string }> {
  if (opts.env.AI_PROVIDER === "deepseek") {
    throw new Error("当前 AI_PROVIDER=deepseek，链接解读需 openai 兼容文本模型");
  }
  const apiKey = opts.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("未配置 OPENAI_API_KEY，无法 AI 解读页面");

  const text = stripHtmlToText(opts.html, 12000);
  const imgs = collectImgSrcs(opts.html, opts.pageUrl, 30);
  const cols = opts.columnsHint ?? 3;
  const user = [
    `页面 URL：${opts.pageUrl}`,
    `用户希望邮件约每行 ${cols} 个商品。`,
    opts.layoutHint?.trim() ? `用户说明：${opts.layoutHint.trim()}` : "",
    "",
    "页面可见图片 URL（可参考）：",
    imgs.slice(0, 20).join("\n") || "(无)",
    "",
    "页面文本摘要：",
    text
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openAiCompatibleChat({
    apiKey,
    baseUrl: opts.env.OPENAI_BASE_URL,
    model: opts.env.OPENAI_MODEL,
    system: `你是电商页面解读助手。根据网页文本与图片 URL，提取可放进邮件营销的商品列表。
只输出 JSON：
{
  "headline": "邮件标题行",
  "intro": "导语一句",
  "products": [
    { "title": "", "price": "¥99", "comparePrice": "¥199", "imageUrl": "https://...", "link": "https://..." }
  ],
  "notes": "可选说明"
}
规则：products 尽量多提取商品；link 用商品详情链接，没有则用页面 URL；imageUrl 必须从给定图片 URL 中选或留空；价格看不清留空。`,
    user,
    maxTokens: 4096
  });

  const data = extractJsonObject(raw) as Record<string, unknown>;
  const list = Array.isArray(data.products) ? data.products : [];
  const products: CommerceLinkProduct[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.name ?? "").trim();
    if (!title) continue;
    products.push({
      title,
      price: String(o.price ?? "").trim(),
      comparePrice: String(o.comparePrice ?? o.originalPrice ?? "").trim(),
      imageUrl: String(o.imageUrl ?? o.image ?? "").trim(),
      link: String(o.link ?? o.url ?? opts.pageUrl).trim() || opts.pageUrl
    });
  }
  if (!products.length) throw new Error("AI 未能从页面提取商品，请换链接或改用截图识别");
  return {
    headline: String(data.headline ?? "").trim(),
    intro: String(data.intro ?? "").trim(),
    products,
    notes: typeof data.notes === "string" ? data.notes : undefined
  };
}

async function fetchPageHtml(url: URL): Promise<string> {
  const resp = await fetch(url.href, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) {
    throw new Error(`无法打开链接（HTTP ${resp.status}）。部分平台需登录或禁止抓取，请改用截图上传。`);
  }
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new Error("链接不是 HTML 页面，请粘贴店铺/商品网页地址");
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_HTML_BYTES) {
    throw new Error("页面过大，请改用商品详情链接或截图上传");
  }
  return buf.toString("utf8");
}

async function mirrorImageToUploads(
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
      headers: { "User-Agent": FETCH_UA, Referer: pageUrl },
      signal: AbortSignal.timeout(20000)
    });
    if (!resp.ok) return abs;
    const ct = resp.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return abs;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return abs;
    const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ".jpg";
    const filename = `commerce_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), buf);
    return resolvePublicUrl(filename);
  } catch {
    return abs;
  }
}

export async function parseCommerceUrl(opts: {
  env: Env;
  url: string;
  columnsHint?: number;
  layoutHint?: string;
  uploadDir: string;
  resolvePublicUrl: (filename: string) => string;
}): Promise<CommerceLinkParseResult> {
  const safe = assertSafeHttpUrl(opts.url);
  const pageUrl = safe.href;
  const html = await fetchPageHtml(safe);

  let headline = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!headline && titleTag) headline = titleTag.replace(/\s*[-|–—].*$/, "").trim();
  let intro =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    metaContent(html, "twitter:description");

  let products = productsFromJsonLd(html, pageUrl);
  let notes: string | undefined;

  if (products.length <= 1) {
    const single = heuristicSingleProduct(html, pageUrl);
    if (single && !products.some((p) => p.title === single.title)) {
      products = single.title ? [single] : products;
    }
  }

  const needAi = products.length === 0 || (products.length === 1 && !products[0]!.price);
  if (needAi && opts.env.OPENAI_API_KEY && opts.env.AI_PROVIDER !== "deepseek") {
    try {
      const ai = await aiExtractProductsFromPage({
        env: opts.env,
        pageUrl,
        html,
        columnsHint: opts.columnsHint,
        layoutHint: opts.layoutHint
      });
      if (ai.headline) headline = ai.headline;
      if (ai.intro) intro = ai.intro;
      products = ai.products;
      notes = ai.notes;
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!products.length) throw e;
      notes = `结构化提取 ${products.length} 个商品；AI 补充失败：${msg}`;
    }
  } else if (needAi && !products.length) {
    throw new Error(
      "未能从页面提取商品。淘宝/天猫等可能需登录或拦截抓取，请改用「上传店铺截图」或配置 OPENAI_API_KEY 后重试。"
    );
  }

  const mirrored: CommerceLinkProduct[] = [];
  for (const p of products.slice(0, 24)) {
    const imageUrl = p.imageUrl
      ? await mirrorImageToUploads(p.imageUrl, pageUrl, opts.uploadDir, opts.resolvePublicUrl)
      : "";
    mirrored.push({
      ...p,
      imageUrl,
      link: p.link ? resolveAbsoluteUrl(p.link, pageUrl) : pageUrl
    });
  }

  if (!mirrored.length) {
    throw new Error("未解析到可用商品，请检查链接或改用截图识别");
  }

  return {
    headline: headline || "本周特价 · 精选好物",
    intro: intro || "以下商品来自店铺页面，欢迎选购。",
    products: mirrored,
    notes,
    sourceUrl: pageUrl
  };
}
