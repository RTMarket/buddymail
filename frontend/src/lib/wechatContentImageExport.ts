/** 公众号正文插图 · uploadimg 要求 jpg/png ≤1MB */

import { drawCroppedImageToCanvas, type ImageCropState } from "./wechatImageCrop";
import type { CoverCropState } from "./wechatCoverExport";

export {
  type CoverCropState,
  defaultCoverCropState,
  fileToDataUrl,
  loadImage
} from "./wechatCoverExport";
export { initImageCropState, CROP_SCALE_MIN, CROP_SCALE_MAX } from "./wechatImageCrop";

export const CONTENT_IMAGE_ASPECT = 4 / 3;
export const CONTENT_IMAGE_MAX_BYTES = 1024 * 1024;
export const CONTENT_IMAGE_MAX_WIDTH = 1080;

function canvasToBlob(canvas: HTMLCanvasElement, mime: "image/jpeg" | "image/png", quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("导出图片失败"))),
      mime,
      quality
    );
  });
}

export async function exportContentImageBlob(
  imageSrc: string,
  crop: CoverCropState | ImageCropState,
  viewportWidth: number,
  viewportHeight: number,
  preferPng = false
): Promise<Blob> {
  const vw = viewportWidth;
  const vh = viewportHeight;
  let outW = Math.min(CONTENT_IMAGE_MAX_WIDTH, Math.round(vw));
  let outH = Math.round(outW * (vh / vw));
  if (outW < 320) {
    outW = 320;
    outH = Math.round(320 * (vh / vw));
  }

  const canvas = await drawCroppedImageToCanvas(imageSrc, crop, vw, vh, outW, outH);

  const mime: "image/jpeg" | "image/png" = preferPng ? "image/png" : "image/jpeg";
  const qualities = preferPng ? [undefined] : [0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.46];
  for (const q of qualities) {
    const blob = await canvasToBlob(canvas, mime, q ?? 0.92);
    if (blob.size <= CONTENT_IMAGE_MAX_BYTES) return blob;
  }
  const small = document.createElement("canvas");
  small.width = Math.round(outW * 0.75);
  small.height = Math.round(outH * 0.75);
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("无法压缩图片");
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  for (const q of [0.72, 0.6, 0.5, 0.42]) {
    const blob = await canvasToBlob(small, "image/jpeg", q);
    if (blob.size <= CONTENT_IMAGE_MAX_BYTES) return blob;
  }
  throw new Error("图片过大，请换一张更小的图片或缩小裁剪区域。");
}

export function buildWechatContentImageHtml(previewSrc: string, widthPercent: number, wechatUrl?: string): string {
  const pct = Math.min(100, Math.max(40, Math.round(widthPercent)));
  const safePreview = previewSrc.replace(/"/g, "&quot;");
  const wxAttr = wechatUrl?.trim()
    ? ` data-wechat-url="${wechatUrl.trim().replace(/"/g, "&quot;")}"`
    : "";
  return `<p style="margin:16px 0;text-align:center;"><img src="${safePreview}" data-wechat-img="1" data-width="${pct}"${wxAttr} referrerpolicy="no-referrer" style="max-width:100%;width:${pct}%;height:auto;display:inline-block;border-radius:6px;" alt="" /></p>`;
}

export function buildWechatLinkHtml(text: string, href: string): string {
  const safeText = text.trim() || href;
  const safeHref = href.trim();
  return `<p style="margin:14px 0;font-size:15px;line-height:1.9;"><a href="${safeHref.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer" style="color:#059669;text-decoration:underline;">${safeText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a></p>`;
}
