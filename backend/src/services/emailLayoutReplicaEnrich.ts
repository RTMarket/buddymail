import type { CommerceVisionProduct } from "./emailCommerceAssistantVision.js";

const HEADER_BANNER_BBOX: CommerceVisionProduct["bbox"] = {
  left: 0,
  top: 0,
  right: 1000,
  bottom: 220
};

function hasImagePlaceholderOrTag(html: string): boolean {
  return /\{\{IMG_\d+\}\}/.test(html) || /<img\b/i.test(html);
}

/** 无图占位时补页头横幅裁切位 */
export function ensureReplicaVisualAssets(
  bodyHtml: string,
  products: CommerceVisionProduct[]
): { bodyHtml: string; products: CommerceVisionProduct[] } {
  let html = bodyHtml.trim();
  let prods = [...products];

  if (!hasImagePlaceholderOrTag(html)) {
    prods = [
      {
        title: "页头横幅",
        price: "",
        comparePrice: "",
        bbox: { ...HEADER_BANNER_BBOX }
      },
      ...prods
    ];
    html = `<p style="margin:0;line-height:0;text-align:center;">{{IMG_0}}</p>${html}`;
  }

  const placeholderCount = (html.match(/\{\{IMG_(\d+)\}\}/g) ?? []).length;
  while (prods.length < placeholderCount) {
    prods.push({
      title: `插图${prods.length + 1}`,
      price: "",
      comparePrice: "",
      bbox: { left: 0, top: 0, right: 1000, bottom: 220 }
    });
  }

  return { bodyHtml: html, products: prods };
}

export function sanitizeReplicaNotes(notes?: string): string | undefined {
  if (!notes?.trim()) return undefined;
  return notes.trim();
}

export function buildReplicaImageTag(url: string, product: CommerceVisionProduct, index: number): string {
  const alt = (product.title || `图片${index + 1}`).replace(/"/g, "");
  const h = product.bbox.bottom - product.bbox.top;
  const isBanner =
    index === 0 &&
    (h >= 120 || /横幅|header|hero|页头/i.test(product.title) || product.bbox.left <= 20);
  if (isBanner) {
    return `<img src="${url}" alt="${alt}" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto;border:0;" />`;
  }
  const isLogo = /logo|品牌|标志/i.test(product.title) || (h <= 80 && product.bbox.top < 150);
  if (isLogo) {
    return `<img src="${url}" alt="${alt}" style="display:block;max-width:220px;max-height:56px;width:auto;height:auto;margin:0 auto 8px;" />`;
  }
  return `<img src="${url}" alt="${alt}" style="display:block;max-width:100%;width:168px;height:auto;margin:0 auto 6px;border-radius:6px;" />`;
}
