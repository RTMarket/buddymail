/** 电商邮件助手：商品横排 table → Quill BlockEmbed（ql-email-commerce-row） */

export type CommerceProductDraft = {
  id: string;
  imageUrl: string;
  title: string;
  price: string;
  comparePrice: string;
  link: string;
  ctaText: string;
};

export type CommerceLayoutOptions = {
  headline: string;
  intro: string;
  products: CommerceProductDraft[];
  /** 每行商品数 1~5 */
  columnsPerRow: number;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function imgMaxWidth(cols: number): number {
  if (cols <= 1) return 520;
  if (cols === 2) return 260;
  if (cols === 3) return 168;
  if (cols === 4) return 128;
  return 100;
}

function tdWidthPct(cols: number): number {
  return Math.floor(100 / cols);
}

function productCellTd(p: CommerceProductDraft, cols: number): string {
  const title = esc(p.title.trim() || "商品名称");
  const link = p.link.trim();
  const cta = esc(p.ctaText.trim() || "立即购买");
  const img = p.imageUrl.trim();
  const maxW = imgMaxWidth(cols);
  const pct = tdWidthPct(cols);
  const imgTag = img
    ? `<img src="${escAttr(img)}" alt="${title}" width="${maxW}" style="display:block;width:${maxW}px;max-width:100%;height:auto;margin:0 auto 6px;border-radius:6px;" />`
    : "";
  const price = p.price.trim();
  const was = p.comparePrice.trim();
  let priceHtml = "";
  if (price || was) {
    const main = price
      ? `<strong style="color:#dc2626;font-size:15px;">${esc(price)}</strong>`
      : "";
    const old =
      was && was !== price
        ? ` <s style="color:#94a3b8;font-size:12px;">${esc(was)}</s>`
        : "";
    priceHtml = `<p style="margin:4px 0;line-height:1.35;text-align:center;">${main}${old}</p>`;
  }
  const ctaHtml = link
    ? `<p style="margin:8px 0 0;text-align:center;"><a href="${esc(link)}" rel="noopener noreferrer" style="display:inline-block;background-color:#059669;color:#ffffff;padding:6px 12px;text-decoration:none;border-radius:4px;font-size:12px;font-weight:bold;">${cta}</a></p>`
    : `<p style="margin:8px 0 0;text-align:center;"><strong style="font-size:12px;">${cta}</strong></p>`;
  return `<td width="${pct}%" align="center" valign="top" style="width:${pct}%;padding:8px 4px;vertical-align:top;text-align:center;">${imgTag}<p style="margin:6px 0 4px;font-size:13px;line-height:1.35;text-align:center;"><strong>${title}</strong></p>${priceHtml}${ctaHtml}</td>`;
}

function productRowEmbed(cells: string[]): string {
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%;margin:0 auto;border-collapse:collapse;"><tr>${cells.join("")}</tr></table>`;
  return `<div class="ql-email-commerce-row" contenteditable="false">${table}</div>`;
}

/** 生成可插入邮件正文的 HTML（每行 table 横排） */
export function buildCommerceAssistantBodyHtml(opts: CommerceLayoutOptions): string {
  const headline = opts.headline.trim();
  const intro = opts.intro.trim();
  const cols = Math.max(1, Math.min(5, opts.columnsPerRow || 3));
  const usable = opts.products.filter((p) => p.imageUrl.trim() || p.title.trim());
  const parts: string[] = [];
  if (headline) parts.push(`<p><strong>${esc(headline)}</strong></p>`);
  if (intro) parts.push(`<p>${esc(intro)}</p>`);
  if (headline || intro) parts.push(`<p><br></p>`);
  let rowBuf: CommerceProductDraft[] = [];
  const flushRow = () => {
    if (!rowBuf.length) return;
    parts.push(productRowEmbed(rowBuf.map((p) => productCellTd(p, cols))));
    rowBuf = [];
  };
  for (const p of usable) {
    rowBuf.push(p);
    if (rowBuf.length >= cols) flushRow();
  }
  flushRow();
  parts.push(
    `<p style="font-size:12px;color:#64748b;text-align:center;margin-top:16px;">价格与库存以店铺页面为准。</p>`
  );
  return parts.join("");
}

export function newCommerceProductDraft(partial?: Partial<CommerceProductDraft>): CommerceProductDraft {
  return {
    id: partial?.id ?? `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageUrl: partial?.imageUrl ?? "",
    title: partial?.title ?? "",
    price: partial?.price ?? "",
    comparePrice: partial?.comparePrice ?? "",
    link: partial?.link ?? "",
    ctaText: partial?.ctaText ?? "立即购买"
  };
}

export type CommerceColumnsPerRow = 1 | 2 | 3 | 4 | 5;

export const COMMERCE_COLUMN_OPTIONS: CommerceColumnsPerRow[] = [1, 2, 3, 4, 5];
