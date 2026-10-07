/** 微信公众号封面 · 2.35:1 头条 + 1:1 方图预览，永久 thumb 素材 ≤64KB */

import { drawCroppedImageToCanvas, type ImageCropState } from "./wechatImageCrop";

export const WECHAT_COVER_ASPECT_WIDE = 2.35;
export const WECHAT_COVER_ASPECT_SQUARE = 1;
export const WECHAT_COVER_EXPORT_WIDE_W = 900;
export const WECHAT_COVER_EXPORT_WIDE_H = Math.round(900 / WECHAT_COVER_ASPECT_WIDE);
export const WECHAT_COVER_EXPORT_SQUARE = 900;

/** 兼容旧引用 */
export const WECHAT_COVER_WIDTH = WECHAT_COVER_EXPORT_WIDE_W;
export const WECHAT_COVER_HEIGHT = WECHAT_COVER_EXPORT_WIDE_H;
export const WECHAT_COVER_ASPECT = WECHAT_COVER_ASPECT_WIDE;

export type WechatCoverCropMode = "wide" | "square";

const MAX_BYTES = 64 * 1024;

export type CoverCropState = ImageCropState;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export function defaultCoverCropState(): CoverCropState {
  return { baseScale: 1, scale: 1, offsetX: 0, offsetY: 0 };
}

export function coverAspectForMode(mode: WechatCoverCropMode): number {
  return mode === "square" ? WECHAT_COVER_ASPECT_SQUARE : WECHAT_COVER_ASPECT_WIDE;
}

export async function exportWechatCoverBlob(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number,
  mode: WechatCoverCropMode = "wide"
): Promise<Blob> {
  if (mode === "square") {
    return exportCoverJpeg(imageSrc, crop, viewportWidth, viewportHeight, WECHAT_COVER_EXPORT_SQUARE, WECHAT_COVER_EXPORT_SQUARE);
  }
  return exportCoverJpeg(
    imageSrc,
    crop,
    viewportWidth,
    viewportHeight,
    WECHAT_COVER_EXPORT_WIDE_W,
    WECHAT_COVER_EXPORT_WIDE_H
  );
}

async function exportCoverJpeg(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number,
  outWidth: number,
  outHeight: number
): Promise<Blob> {
  const canvas = await drawCroppedImageToCanvas(imageSrc, crop, viewportWidth, viewportHeight, outWidth, outHeight);

  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  for (const q of qualities) {
    const blob = await canvasToJpeg(canvas, q);
    if (blob.size <= MAX_BYTES) return blob;
  }
  const small = document.createElement("canvas");
  small.width = Math.round(outWidth * 0.8);
  small.height = Math.round(outHeight * 0.8);
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("无法压缩封面");
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  for (const q of qualities) {
    const blob = await canvasToJpeg(small, q);
    if (blob.size <= MAX_BYTES) return blob;
  }
  const last = await canvasToJpeg(small, 0.45);
  if (last.size > MAX_BYTES) {
    throw new Error("封面图过大，请换一张更简单的图片或缩小后重试。");
  }
  return last;
}

/** 微信 thumb 永久素材：上传原图（不裁剪），压缩至 ≤64KB；pic_crop 坐标须相对此图 */
export async function exportWechatThumbSourceBlob(imageSrc: string): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const scales = [1, 0.88, 0.76, 0.64, 0.52, 0.42, 0.34];
  const qualities = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44];
  for (const scale of scales) {
    const cw = Math.max(1, Math.round(img.width * scale));
    const ch = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法压缩封面原图");
    ctx.drawImage(img, 0, 0, cw, ch);
    for (const q of qualities) {
      const blob = await canvasToJpeg(canvas, q);
      if (blob.size <= MAX_BYTES) return blob;
    }
  }
  throw new Error("封面原图过大，请换一张更小的图片后重试。");
}

/** 从 2.35:1 裁剪区域中心截取 1:1 方图 */
export async function exportWechatCoverSquareFromWideCrop(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number,
  outSize = WECHAT_COVER_EXPORT_WIDE_H
): Promise<Blob> {
  const wideW = Math.round(outSize * WECHAT_COVER_ASPECT_WIDE);
  const wideH = outSize;
  const wideCanvas = await drawCroppedImageToCanvas(imageSrc, crop, viewportWidth, viewportHeight, wideW, wideH);
  const squareCanvas = document.createElement("canvas");
  squareCanvas.width = outSize;
  squareCanvas.height = outSize;
  const ctx = squareCanvas.getContext("2d");
  if (!ctx) throw new Error("无法导出方图预览");
  const sx = (wideW - outSize) / 2;
  ctx.drawImage(wideCanvas, sx, 0, outSize, outSize, 0, 0, outSize, outSize);
  return compressCanvasToCoverBlob(squareCanvas);
}

/** 1:1 裁剪结果居中嵌入 2.35:1 画布（模拟公众号列表宽图展示） */
export async function exportWechatCoverWideFromSquareCrop(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number
): Promise<Blob> {
  const squareCanvas = await drawCroppedImageToCanvas(
    imageSrc,
    crop,
    viewportWidth,
    viewportHeight,
    WECHAT_COVER_EXPORT_WIDE_H,
    WECHAT_COVER_EXPORT_WIDE_H
  );
  const canvas = document.createElement("canvas");
  canvas.width = WECHAT_COVER_EXPORT_WIDE_W;
  canvas.height = WECHAT_COVER_EXPORT_WIDE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法导出宽图预览");
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sq = WECHAT_COVER_EXPORT_WIDE_H;
  const x = (WECHAT_COVER_EXPORT_WIDE_W - sq) / 2;
  ctx.drawImage(squareCanvas, 0, 0, squareCanvas.width, squareCanvas.height, x, 0, sq, sq);
  return compressCanvasToCoverBlob(canvas);
}

async function compressCanvasToCoverBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const qualities = [0.88, 0.78, 0.68, 0.58, 0.48];
  for (const q of qualities) {
    const blob = await canvasToJpeg(canvas, q);
    if (blob.size <= MAX_BYTES) return blob;
  }
  const last = await canvasToJpeg(canvas, 0.42);
  if (last.size > MAX_BYTES) {
    throw new Error("封面图过大，请换一张更简单的图片或缩小后重试。");
  }
  return last;
}

/** 编辑时同时生成 2.35:1 与 1:1 预览（小图，仅 UI） */
export async function previewWechatCoverPair(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number,
  editMode: WechatCoverCropMode
): Promise<{ wideUrl: string; squareUrl: string }> {
  const previewSquareSize = 240;
  const previewWideW = Math.round(previewSquareSize * WECHAT_COVER_ASPECT_WIDE);
  const previewWideH = previewSquareSize;

  if (editMode === "wide") {
    const wideCanvas = await drawCroppedImageToCanvas(
      imageSrc,
      crop,
      viewportWidth,
      viewportHeight,
      previewWideW,
      previewWideH
    );
    const squareCanvas = document.createElement("canvas");
    squareCanvas.width = previewSquareSize;
    squareCanvas.height = previewSquareSize;
    const ctx = squareCanvas.getContext("2d")!;
    const sx = (previewWideW - previewSquareSize) / 2;
    ctx.drawImage(wideCanvas, sx, 0, previewSquareSize, previewSquareSize, 0, 0, previewSquareSize, previewSquareSize);
    return {
      wideUrl: wideCanvas.toDataURL("image/jpeg", 0.82),
      squareUrl: squareCanvas.toDataURL("image/jpeg", 0.82)
    };
  }

  const squareCanvas = await drawCroppedImageToCanvas(
    imageSrc,
    crop,
    viewportWidth,
    viewportHeight,
    previewSquareSize,
    previewSquareSize
  );
  const wideCanvas = document.createElement("canvas");
  wideCanvas.width = previewWideW;
  wideCanvas.height = previewWideH;
  const wctx = wideCanvas.getContext("2d")!;
  wctx.fillStyle = "#f1f5f9";
  wctx.fillRect(0, 0, previewWideW, previewWideH);
  const x = (previewWideW - previewSquareSize) / 2;
  wctx.drawImage(squareCanvas, 0, 0, previewSquareSize, previewSquareSize, x, 0, previewSquareSize, previewSquareSize);
  return {
    wideUrl: wideCanvas.toDataURL("image/jpeg", 0.82),
    squareUrl: squareCanvas.toDataURL("image/jpeg", 0.82)
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("导出封面失败"))),
      "image/jpeg",
      quality
    );
  });
}

export function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取封面预览失败"));
    reader.readAsDataURL(blob);
  });
}

export { initImageCropState, CROP_SCALE_MIN, CROP_SCALE_MAX } from "./wechatImageCrop";
