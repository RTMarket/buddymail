/**
 * 发布中心 / 模版预览：将用户文案中的 HTML 片段安全化后供 innerHTML 使用。
 * 允许与内容创作区常见用法一致的标签（span 样式、插图、视频等），剔除脚本与危险属性。
 */

const ALLOWED_TAGS = new Set([
  "span",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "p",
  "img",
  "video",
  "a",
  "source"
]);

function sanitizeStyle(style: string): string {
  let s = style.replace(/[\u0000-\u001f]/g, "");
  s = s.replace(/expression\s*\(/gi, "");
  s = s.replace(/javascript\s*:/gi, "");
  s = s.replace(/@import/gi, "");
  s = s.replace(/behavior\s*:/gi, "");
  s = s.replace(/-moz-binding/gi, "");
  s = s.replace(/url\s*\([^)]*\)/gi, (m) => {
    if (/url\s*\(\s*["']?(https?:|data:image)/i.test(m)) return m;
    return "";
  });
  return s.slice(0, 4000);
}

function sanitizeSrc(src: string, kind: "image" | "video"): string {
  const t = src.trim();
  if (kind === "image") {
    if (/^https?:\/\//i.test(t) || /^data:image\//i.test(t)) return t;
    return "";
  }
  if (/^https?:\/\//i.test(t) || /^data:video\//i.test(t) || /^blob:/i.test(t)) return t;
  return "";
}

function sanitizeHref(href: string): string {
  const t = href.trim();
  return /^https?:\/\//i.test(t) ? t : "";
}

function sanitizeNode(node: Node, into: Node, doc: Document) {
  if (node.nodeType === Node.TEXT_NODE) {
    into.appendChild(doc.createTextNode(node.textContent ?? ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    into.appendChild(doc.createElement("br"));
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    for (const c of Array.from(el.childNodes)) sanitizeNode(c, into, doc);
    return;
  }

  const fresh = doc.createElement(tag);

  if (tag === "span" || tag === "p") {
    const st = el.getAttribute("style");
    if (st) fresh.setAttribute("style", sanitizeStyle(st));
  }

  if (tag === "img") {
    const src = sanitizeSrc(el.getAttribute("src") ?? "", "image");
    if (src) fresh.setAttribute("src", src);
    const alt = el.getAttribute("alt");
    if (alt) fresh.setAttribute("alt", alt.slice(0, 500));
    const st = el.getAttribute("style");
    if (st) fresh.setAttribute("style", sanitizeStyle(st));
  }

  if (tag === "source") {
    const src = sanitizeSrc(el.getAttribute("src") ?? "", "video");
    if (src) fresh.setAttribute("src", src);
    const type = el.getAttribute("type");
    if (type && /^[\w.+/\-]+$/i.test(type)) fresh.setAttribute("type", type);
  }

  if (tag === "video") {
    const src = sanitizeSrc(el.getAttribute("src") ?? "", "video");
    if (src) fresh.setAttribute("src", src);
    if (el.hasAttribute("controls")) fresh.setAttribute("controls", "");
    if (el.hasAttribute("playsinline")) fresh.setAttribute("playsinline", "");
    const st = el.getAttribute("style");
    if (st) fresh.setAttribute("style", sanitizeStyle(st));
  }

  if (tag === "a") {
    const href = sanitizeHref(el.getAttribute("href") ?? "");
    if (href) {
      fresh.setAttribute("href", href);
      fresh.setAttribute("rel", "noopener noreferrer");
      fresh.setAttribute("target", "_blank");
    }
  }

  for (const c of Array.from(el.childNodes)) sanitizeNode(c, fresh, doc);
  into.appendChild(fresh);
}

/** 是否像「含可渲染 HTML」而不仅是纯文本/Markdown 字面量 */
export function copyTextLooksLikeHtml(text: string): boolean {
  return /<[a-z][\s/>]/i.test(text);
}

/**
 * 返回可放入预览容器的 HTML 字符串（已白名单过滤）。
 * 非浏览器环境返回转义后的纯文本（不含 HTML）。
 */
export function sanitizeCopyPreviewHtml(raw: string): string {
  if (typeof document === "undefined") {
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const doc = new DOMParser().parseFromString(`<div id="bsb-copy-sanitize-root">${raw}</div>`, "text/html");
  const root = doc.getElementById("bsb-copy-sanitize-root");
  if (!root) return "";

  const frag = doc.createDocumentFragment();
  for (const ch of Array.from(root.childNodes)) sanitizeNode(ch, frag, doc);

  const wrap = doc.createElement("div");
  wrap.appendChild(frag);
  return wrap.innerHTML;
}
