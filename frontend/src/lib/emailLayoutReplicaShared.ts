import type { CommerceBbox } from "./commerceScreenshotCrop";

export type ReplicaProduct = {
  title: string;
  price: string;
  comparePrice: string;
  bbox: CommerceBbox;
};

function buildReplicaImageTag(url: string, product: ReplicaProduct, index: number): string {
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

const FULL_SCREEN_BBOX: CommerceBbox = { left: 0, top: 0, right: 1000, bottom: 1000 };

export function injectReplicaImageUrls(
  bodyHtml: string,
  products: ReplicaProduct[],
  imageUrls: string[],
  fallbackImageUrl?: string
): string {
  let out = bodyHtml;
  const fallbackProduct: ReplicaProduct = products[0] ?? {
    title: "截图",
    price: "",
    comparePrice: "",
    bbox: { ...FULL_SCREEN_BBOX }
  };
  for (let i = 0; i < products.length; i++) {
    const url = imageUrls[i] || fallbackImageUrl;
    if (!url) continue;
    const p = products[i]!;
    const imgTag = buildReplicaImageTag(url, p, i);
    out = out.replace(new RegExp(`\\{\\{IMG_${i}\\}\\}`, "g"), imgTag);
  }
  if (fallbackImageUrl) {
    out = out.replace(/\{\{IMG_(\d+)\}\}/g, () =>
      buildReplicaImageTag(fallbackImageUrl, fallbackProduct, 0)
    );
  } else {
    out = out.replace(/\{\{IMG_\d+\}\}/g, "");
  }
  return out;
}

export function injectReplicaVideoPlaceholders(bodyHtml: string): string {
  return bodyHtml.replace(/\{\{VIDEO_(\d+)\}\}/g, (_m, idx: string) => {
    return `<video controls playsinline preload="metadata" data-replica-video="${idx}" style="display:block;max-width:100%;width:100%;height:auto;margin:8px auto;border-radius:6px;background:#0f172a;"></video>`;
  });
}

/** 识图/裁图后仍无可见内容时，用整张上传图托底 */
export function ensureReplicaHasVisibleContent(html: string, fullImageUrl: string): string {
  const h = html.trim();
  const textLen = h.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length;
  const images = (h.match(/<img\b/gi) ?? []).length;
  const videos = (h.match(/<video\b/gi) ?? []).length;
  if (textLen >= 4 || images >= 1 || videos >= 1) return h;
  if (!fullImageUrl) return h;
  const banner = `<p style="text-align:center;margin:0;line-height:0;"><img src="${fullImageUrl}" alt="上传截图" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto;border:0;" /></p>`;
  return `${banner}${h}`;
}

export function finalizeReplicaBodyHtml(
  bodyHtml: string,
  products: ReplicaProduct[],
  imageUrls: string[],
  columnsPerRow: number,
  fallbackImageUrl?: string
): string {
  let html = bodyHtml;
  if (html.includes("{{IMG_")) {
    html = injectReplicaImageUrls(html, products, imageUrls, fallbackImageUrl);
  } else if (products.length && (imageUrls.some(Boolean) || fallbackImageUrl)) {
    const cols = Math.max(1, Math.min(5, columnsPerRow || 3));
    const cells = products
      .map((p, i) => {
        const url = imageUrls[i] || fallbackImageUrl;
        if (!url) return "";
        const title = p.title
          ? `<span style="display:block;font-size:13px;margin:4px 0;"><strong>${p.title}</strong></span>`
          : "";
        const price = p.price
          ? `<span style="display:block;margin-top:4px;color:#dc2626;font-weight:bold;">${p.price}</span>`
          : "";
        return `<span style="display:inline-block;width:${Math.floor(100 / cols) - 2}%;max-width:200px;vertical-align:top;text-align:center;padding:6px;">${buildReplicaImageTag(url, p, i)}${title}${price}</span>`;
      })
      .filter(Boolean)
      .join("");
    if (cells) {
      html = `${html}<p style="text-align:center;font-size:0;line-height:1.4;">${cells}</p>`;
    }
  }
  html = injectReplicaVideoPlaceholders(html);
  html = html.replace(/<img([^>]*?)src=["']\s*["']/gi, "");
  return ensureReplicaHasVisibleContent(html, fallbackImageUrl ?? "");
}
