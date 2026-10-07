/** 识图/链接复刻 HTML → 邮件 Quill 可保留的片段（颜色、图片、视频） */

function parseHexColor(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    return `#${h}`;
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Math.min(255, Number(rgb[1]));
    const g = Math.min(255, Number(rgb[2]));
    const b = Math.min(255, Number(rgb[3]));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  const named: Record<string, string> = {
    red: "#ff0000",
    orange: "#ff9900",
    white: "#ffffff",
    black: "#000000",
    blue: "#0066cc",
    green: "#008a00"
  };
  return named[s] ?? null;
}

function styleColor(style: string): string | null {
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  if (!m) return null;
  return parseHexColor(m[1]!);
}

function styleBackground(style: string): string | null {
  const m = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style);
  if (!m) return null;
  return parseHexColor(m[1]!);
}

function styleTextAlign(style: string): string | null {
  const m = /(?:^|;)\s*text-align\s*:\s*(center|left|right|justify)/i.exec(style);
  return m ? m[1]!.toLowerCase() : null;
}

/** 把 block 上的 color 下推到 inline span；段落的 background-color 保留在 <p> 上以维持顶栏/灰底外形 */
function hoistColorsInDom(doc: Document): void {
  const blocks = doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, div, span");
  for (const el of Array.from(blocks)) {
    const htmlEl = el as HTMLElement;
    const tag = htmlEl.tagName.toLowerCase();
    const color = styleColor(htmlEl.getAttribute("style") ?? "");
    const bg = styleBackground(htmlEl.getAttribute("style") ?? "");
    if (!color && !bg) continue;
    const inner = htmlEl.innerHTML;
    if (!inner.trim()) continue;
    if (color && !htmlEl.querySelector("span[style*='color'], a[style*='color']")) {
      htmlEl.innerHTML = `<span style="color:${color}">${inner}</span>`;
      htmlEl.style.removeProperty("color");
    }
    if (bg && tag !== "p") {
      if (!htmlEl.querySelector("span[style*='background']")) {
        htmlEl.innerHTML = `<span style="background-color:${bg}">${htmlEl.innerHTML}</span>`;
      }
      htmlEl.style.removeProperty("background");
      htmlEl.style.removeProperty("background-color");
    }
  }
}

function simplifyBlockTags(doc: Document): void {
  for (const tag of ["div", "section", "article", "header", "footer", "nav", "main"]) {
    for (const el of Array.from(doc.body.querySelectorAll(tag))) {
      const p = doc.createElement("p");
      const align = styleTextAlign(el.getAttribute("style") ?? "");
      if (align) p.setAttribute("style", `text-align:${align}`);
      p.innerHTML = el.innerHTML;
      el.replaceWith(p);
    }
  }
}

function stripUnsafeTags(doc: Document): void {
  for (const sel of ["script", "style", "iframe", "form", "input", "button", "select", "textarea"]) {
    for (const el of Array.from(doc.body.querySelectorAll(sel))) {
      el.remove();
    }
  }
}

/** 是否含真实 border 样式（排除 box-sizing:border-box 误匹配） */
function spanHasReplicaBorder(style: string): boolean {
  return /(?:^|;)\s*border(?:-top|-right|-bottom|-left|-width|-style|-color)?\s*:/i.test(
    style
  );
}

/** 把带 border 的 span 换成 blockquote 类名，避免 Quill 粘贴时剥掉边框 */
function convertBorderedSpansToReplicaFields(doc: Document): void {
  for (const span of Array.from(doc.body.querySelectorAll("span[style]"))) {
    const style = span.getAttribute("style") ?? "";
    if (!spanHasReplicaBorder(style)) continue;
    const el = span as HTMLElement;
    const text = el.textContent?.trim() ?? "";
    if (!text) continue;
    const bq = doc.createElement("blockquote");
    if (/login|登录|submit|提交/i.test(text) && text.length < 16) {
      bq.className = "email-replica-btn";
    } else {
      bq.className = "email-replica-field";
    }
    bq.textContent = text;
    el.replaceWith(bq);
  }
}

export function normalizeVisionHtmlForQuill(
  html: string,
  opts?: { convertReplicaFields?: boolean }
): string {
  const raw = String(html ?? "").trim();
  if (!raw) return "";
  if (typeof DOMParser === "undefined") return raw;

  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  stripUnsafeTags(doc);
  simplifyBlockTags(doc);
  if (opts?.convertReplicaFields !== false) {
    convertBorderedSpansToReplicaFields(doc);
  }
  hoistColorsInDom(doc);

  for (const a of Array.from(doc.body.querySelectorAll("a"))) {
    const htmlA = a as HTMLElement;
    const c = styleColor(htmlA.getAttribute("style") ?? "");
    if (!c) {
      htmlA.setAttribute("style", `${htmlA.getAttribute("style") ?? ""};color:#0066cc`.replace(/^;/, ""));
    }
  }

  return doc.body.innerHTML.trim();
}

/** 电商助手排版：保留 blockquote 商品卡片横排，不拆 div、不做登录页假框转换 */
export function normalizeCommerceHtmlForQuill(html: string): string {
  const raw = String(html ?? "").trim();
  if (!raw) return "";
  if (typeof DOMParser === "undefined") return raw;

  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  stripUnsafeTags(doc);
  hoistColorsInDom(doc);

  for (const a of Array.from(doc.body.querySelectorAll("a"))) {
    const htmlA = a as HTMLElement;
    const c = styleColor(htmlA.getAttribute("style") ?? "");
    if (!c) {
      htmlA.setAttribute("style", `${htmlA.getAttribute("style") ?? ""};color:#0066cc`.replace(/^;/, ""));
    }
  }

  return doc.body.innerHTML.trim();
}

export function countVisionReplicaContent(html: string): {
  textLen: number;
  images: number;
  videos: number;
} {
  const textLen = html.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length;
  const images = (html.match(/<img\b/gi) ?? []).length;
  const videos = (html.match(/<video\b/gi) ?? []).length;
  return { textLen, images, videos };
}

export function isVisionReplicaHtmlInsertable(html: string): boolean {
  const { textLen, images, videos } = countVisionReplicaContent(html);
  return textLen >= 4 || images >= 1 || videos >= 1;
}
