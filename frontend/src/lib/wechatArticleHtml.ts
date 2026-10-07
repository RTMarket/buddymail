/** 公众号正文 HTML 工具（与邮件模版 Quill 无关） */
import { resolveApiUrl } from "./api";

export function escapeWechatHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToWechatParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 40)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.9;color:#334155;">${escapeWechatHtml(p).replace(/\n/g, "<br/>")}</p>`
    )
    .join("");
}

export function defaultWechatArticleBodyHtml(): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.9;color:#334155;">在这里开始撰写正文。可直接输入文字，或点击下方排版组件插入分隔线、金句引用等模块。</p>`;
}

export function defaultWechatArticleHtml(_title?: string): string {
  return defaultWechatArticleBodyHtml();
}

export function insertComponentIntoHtml(contentHtml: string, componentHtml: string): string {
  const trimmed = contentHtml.trim();
  if (!trimmed) return componentHtml;
  return `${trimmed}\n${componentHtml}`;
}

/** 编辑器预览用：微信 CDN 图需 no-referrer，否则浏览器显示「未经允许不可引用」 */
export function ensureWechatImageDisplayHtml(html: string): string {
  if (!html.trim()) return html;
  if (typeof document === "undefined") return html;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll("img").forEach((img) => {
    const src =
      img.getAttribute("data-src") ||
      img.getAttribute("data-backsrc") ||
      img.getAttribute("data-original-src") ||
      img.getAttribute("data-wechat-url") ||
      img.getAttribute("src") ||
      "";
    if (src) {
      const normalizedSrc = normalizeWechatImageUrl(src);
      img.setAttribute("src", proxiedWechatImageUrl(normalizedSrc));
      img.setAttribute("data-wechat-url", normalizedSrc);
    }
    if (!img.getAttribute("referrerpolicy")) {
      img.setAttribute("referrerpolicy", "no-referrer");
    }
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    if (!img.style.display) img.style.display = "block";
  });
  return wrap.innerHTML;
}

export function countWechatTextChars(html: string): number {
  if (!html.trim()) return 0;
  if (typeof document === "undefined") {
    return normalizeWechatTextForCount(html.replace(/<[^>]+>/g, "")).length;
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll("script, style, svg, noscript").forEach((node) => node.remove());
  wrap.querySelectorAll<HTMLElement>("*").forEach((node) => {
    const style = node.getAttribute("style") ?? "";
    if (/(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)(?:;|$)/i.test(style) || node.hidden) {
      node.remove();
    }
  });
  return normalizeWechatTextForCount(wrap.textContent ?? "").length;
}

function normalizeWechatTextForCount(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\uFFFC]/g, "")
    .replace(/\s+/g, "");
}

function normalizeWechatImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^http:\/\/mmbiz\./i.test(trimmed) || /^http:\/\/.*\.qpic\.cn/i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return trimmed;
}

export function proxiedWechatImageUrl(raw: string): string {
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const allowed = host === "mmbiz.qpic.cn" || host.endsWith(".qpic.cn") || host.endsWith(".qq.com");
    if (!allowed) return raw;
  } catch {
    return raw;
  }
  return resolveApiUrl(`/api/wechat-official/image-proxy?url=${encodeURIComponent(raw)}`);
}

export function countWechatHtmlImages(html: string): number {
  if (!html.trim()) return 0;
  if (typeof document === "undefined") return (html.match(/<img\b/gi) ?? []).length;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return wrap.querySelectorAll("img").length;
}

/** 同步草稿箱前：正文 img 的 src 换为微信 CDN 地址（data-wechat-url） */
export function prepareWechatContentHtmlForSync(html: string): string {
  if (!html.trim()) return html;
  if (typeof document === "undefined") return html;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll("img[data-wechat-url]").forEach((img) => {
    const wxUrl = img.getAttribute("data-wechat-url");
    if (wxUrl) img.setAttribute("src", wxUrl);
    img.removeAttribute("data-wechat-url");
  });
  return wrap.innerHTML;
}

export type WechatListStyle =
  | "decimal"
  | "upper-alpha"
  | "lower-alpha"
  | "upper-roman"
  | "lower-roman"
  | "circle"
  | "disc"
  | "disc-small"
  | "square";

export type WechatListStyleGroup = "ordered" | "marker";

export const WECHAT_LIST_STYLE_OPTIONS: {
  value: WechatListStyle;
  label: string;
  group: WechatListStyleGroup;
}[] = [
  { value: "decimal", label: "1. 2. 3.", group: "ordered" },
  { value: "upper-alpha", label: "A. B. C.", group: "ordered" },
  { value: "lower-alpha", label: "a. b. c.", group: "ordered" },
  { value: "upper-roman", label: "I. II. III.", group: "ordered" },
  { value: "lower-roman", label: "i. ii. iii.", group: "ordered" },
  { value: "circle", label: "大圆点 ○", group: "marker" },
  { value: "disc", label: "小圆点 ●", group: "marker" },
  { value: "disc-small", label: "小黑点 •", group: "marker" },
  { value: "square", label: "小黑方块 ■", group: "marker" }
];

/** @deprecated 使用 WechatListStyle */
export type WechatOrderedListStyle = Extract<
  WechatListStyle,
  "decimal" | "upper-alpha" | "lower-alpha" | "upper-roman" | "lower-roman"
>;

/** @deprecated 使用 WECHAT_LIST_STYLE_OPTIONS */
export const WECHAT_ORDERED_LIST_STYLE_OPTIONS = WECHAT_LIST_STYLE_OPTIONS.filter(
  (o) => o.group === "ordered"
);

const ORDERED_LIST_STYLES = new Set<WechatListStyle>([
  "decimal",
  "upper-alpha",
  "lower-alpha",
  "upper-roman",
  "lower-roman"
]);

function buildCustomMarkerListUl(items: string[], marker: string, markerSize: string): string {
  const lis = items
    .map(
      (item) =>
        `<li style="margin:6px 0;list-style-type:none;"><span style="display:inline-block;width:1.4em;margin-left:-1.4em;text-align:center;font-size:${markerSize};line-height:1.85;color:#334155;">${marker}</span>${escapeWechatHtml(item)}</li>`
    )
    .join("");
  return `<ul style="margin:14px 0;padding-left:28px;font-size:15px;line-height:1.85;color:#334155;list-style-type:none;">${lis}</ul>`;
}

export function buildWechatListHtml(items: string[], listStyle: WechatListStyle = "decimal"): string {
  const rows = items.map((i) => i.trim()).filter(Boolean);
  const lines = rows.length > 0 ? rows : ["第一项", "第二项", "第三项"];

  if (listStyle === "disc-small") {
    return buildCustomMarkerListUl(lines, "•", "8px");
  }

  const lis = lines
    .map((item) => `<li style="margin:6px 0;">${escapeWechatHtml(item)}</li>`)
    .join("");

  if (ORDERED_LIST_STYLES.has(listStyle)) {
    return `<ol style="margin:14px 0;padding-left:28px;font-size:15px;line-height:1.85;color:#334155;list-style-type:${listStyle};">${lis}</ol>`;
  }

  return `<ul style="margin:14px 0;padding-left:28px;font-size:15px;line-height:1.85;color:#334155;list-style-type:${listStyle};">${lis}</ul>`;
}

/** @deprecated 使用 buildWechatListHtml */
export function buildWechatOrderedListHtml(
  items: string[],
  listStyle: WechatOrderedListStyle = "decimal"
): string {
  return buildWechatListHtml(items, listStyle);
}

export function buildWechatTableHtml(rows: number, cols: number): string {
  const rowCount = Math.min(12, Math.max(1, Math.round(rows)));
  const colCount = Math.min(8, Math.max(1, Math.round(cols)));
  const cellStyle =
    "border:1px solid #dfe6ee;padding:8px 10px;vertical-align:top;font-size:15px;line-height:1.75;color:#334155;word-break:break-word;";
  const trs: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const tds: string[] = [];
    for (let c = 0; c < colCount; c++) {
      tds.push(`<td style="${cellStyle}">内容</td>`);
    }
    trs.push(`<tr>${tds.join("")}</tr>`);
  }
  return `<table data-wechat-table="1" style="width:100%;max-width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed;font-size:15px;"><tbody>${trs.join("")}</tbody></table>`;
}

export function buildWechatArticlePreviewHtml(
  title: string,
  digest: string,
  bodyHtml: string,
  coverPreviewUrl?: string
): string {
  const parts: string[] = [];
  if (coverPreviewUrl?.trim()) {
    const coverUrl = proxiedWechatImageUrl(normalizeWechatImageUrl(coverPreviewUrl.trim()));
    parts.push(
      `<div style="margin:0 0 14px;overflow:hidden;border-radius:8px;"><img src="${escapeWechatHtml(coverUrl)}" alt="封面" referrerpolicy="no-referrer" style="width:100%;height:auto;display:block;aspect-ratio:2.35/1;object-fit:cover;" /></div>`
    );
  }
  if (title.trim()) {
    parts.push(
      `<h1 style="margin:0 0 10px;font-size:22px;font-weight:700;line-height:1.35;color:#0f172a;">${escapeWechatHtml(title.trim())}</h1>`
    );
  }
  if (digest.trim()) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#64748b;">${escapeWechatHtml(digest.trim())}</p>`
    );
  }
  const body = bodyHtml.trim();
  parts.push(ensureWechatImageDisplayHtml(body || `<p style="color:#94a3b8;font-size:14px;">正文将显示在这里</p>`));
  return parts.join("");
}

export function linkedInPostToWechatHtml(title: string, body: string, url?: string): string {
  const parts = [plainTextToWechatParagraphs(body || title)];
  if (url?.trim()) {
    parts.push(
      `<p style="margin:16px 0 0;font-size:13px;color:#64748b;">LinkedIn 原文：${escapeWechatHtml(url.trim())}</p>`
    );
  }
  return parts.join("");
}
