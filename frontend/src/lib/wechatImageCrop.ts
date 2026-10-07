/** 公众号图片裁剪 · 预览与导出共用同一套坐标 */

import { loadImage } from "./wechatCoverExport";

export type ImageCropState = {
  /** 初始适配比例（cover 或 contain，随视口与图片尺寸计算） */
  baseScale: number;
  /** 用户缩放倍数：&lt;1 缩小，&gt;1 放大裁剪 */
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const CROP_SCALE_MIN = 0.25;
export const CROP_SCALE_MAX = 3;

export function computeBaseScale(imgW: number, imgH: number, vw: number, vh: number, mode: "cover" | "contain"): number {
  if (imgW <= 0 || imgH <= 0 || vw <= 0 || vh <= 0) return 1;
  return mode === "cover" ? Math.max(vw / imgW, vh / imgH) : Math.min(vw / imgW, vh / imgH);
}

export function defaultCropViewportSize(aspectRatio: number, maxWidth = 480): { width: number; height: number } {
  const width = maxWidth;
  return { width, height: width / aspectRatio };
}

export async function initImageCropState(
  imageSrc: string,
  viewportWidth: number,
  viewportHeight: number,
  mode: "cover" | "contain"
): Promise<ImageCropState> {
  const img = await loadImage(imageSrc);
  return {
    baseScale: computeBaseScale(img.width, img.height, viewportWidth, viewportHeight, mode),
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };
}

export function computeDrawRect(crop: ImageCropState, imgW: number, imgH: number, vw: number, vh: number) {
  const drawScale = crop.baseScale * crop.scale;
  const drawW = imgW * drawScale;
  const drawH = imgH * drawScale;
  const cx = vw / 2 + crop.offsetX;
  const cy = vh / 2 + crop.offsetY;
  return {
    drawW,
    drawH,
    sx: cx - drawW / 2,
    sy: cy - drawH / 2
  };
}

export async function drawCroppedImageToCanvas(
  imageSrc: string,
  crop: ImageCropState,
  viewportWidth: number,
  viewportHeight: number,
  outWidth: number,
  outHeight: number
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageSrc);
  const vw = viewportWidth;
  const vh = viewportHeight;
  const { drawW, drawH, sx, sy } = computeDrawRect(crop, img.width, img.height, vw, vh);

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outWidth, outHeight);
  const ratioX = outWidth / vw;
  const ratioY = outHeight / vh;
  ctx.drawImage(img, sx * ratioX, sy * ratioY, drawW * ratioX, drawH * ratioY);
  return canvas;
}
