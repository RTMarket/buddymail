/** 微信公众号 draft 封面裁剪坐标 pic_crop_235_1 / pic_crop_1_1（相对原图 0~1） */

import { WECHAT_COVER_ASPECT_SQUARE, WECHAT_COVER_ASPECT_WIDE, loadImage, type CoverCropState, type WechatCoverCropMode } from "./wechatCoverExport";
import { computeDrawRect, type ImageCropState } from "./wechatImageCrop";

export type WechatPicCropRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function formatCropCoord(n: number): string {
  const c = clamp01(n);
  let s = c.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s || "0";
}

export function formatWechatPicCrop(rect: WechatPicCropRect): string {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  return `${formatCropCoord(x1)}_${formatCropCoord(y1)}_${formatCropCoord(x2)}_${formatCropCoord(y2)}`;
}

function viewportPointToNormalized(
  crop: ImageCropState,
  imgW: number,
  imgH: number,
  vw: number,
  vh: number,
  vx: number,
  vy: number
): { x: number; y: number } {
  const { drawW, drawH, sx, sy } = computeDrawRect(crop, imgW, imgH, vw, vh);
  if (drawW <= 0 || drawH <= 0) return { x: 0, y: 0 };
  const ix = ((vx - sx) / drawW) * imgW;
  const iy = ((vy - sy) / drawH) * imgH;
  return { x: clamp01(ix / imgW), y: clamp01(iy / imgH) };
}

function rectFromViewportRegion(
  crop: ImageCropState,
  imgW: number,
  imgH: number,
  vw: number,
  vh: number,
  region: { x1: number; y1: number; x2: number; y2: number }
): WechatPicCropRect {
  const tl = viewportPointToNormalized(crop, imgW, imgH, vw, vh, region.x1, region.y1);
  const br = viewportPointToNormalized(crop, imgW, imgH, vw, vh, region.x2, region.y2);
  return {
    x1: Math.min(tl.x, br.x),
    y1: Math.min(tl.y, br.y),
    x2: Math.max(tl.x, br.x),
    y2: Math.max(tl.y, br.y)
  };
}

function expandSquareToWideRect(square: WechatPicCropRect): WechatPicCropRect {
  const side = Math.min(square.x2 - square.x1, square.y2 - square.y1);
  const cx = (square.x1 + square.x2) / 2;
  const cy = (square.y1 + square.y2) / 2;
  const wideW = side * WECHAT_COVER_ASPECT_WIDE;
  return {
    x1: clamp01(cx - wideW / 2),
    y1: clamp01(cy - side / 2),
    x2: clamp01(cx + wideW / 2),
    y2: clamp01(cy + side / 2)
  };
}

function fitRectToAspect(rect: WechatPicCropRect, aspect: number, imgW: number, imgH: number): WechatPicCropRect {
  const normAspect = aspect * (imgH / imgW);
  let w = Math.max(rect.x2 - rect.x1, 0.0001);
  let h = Math.max(rect.y2 - rect.y1, 0.0001);
  const cx = (rect.x1 + rect.x2) / 2;
  const cy = (rect.y1 + rect.y2) / 2;
  const ratio = w / h;
  if (ratio > normAspect) w = h * normAspect;
  else h = w / normAspect;
  let x1 = cx - w / 2;
  let y1 = cy - h / 2;
  let x2 = cx + w / 2;
  let y2 = cy + h / 2;
  if (x1 < 0) {
    x2 -= x1;
    x1 = 0;
  }
  if (y1 < 0) {
    y2 -= y1;
    y1 = 0;
  }
  if (x2 > 1) {
    x1 -= x2 - 1;
    x2 = 1;
  }
  if (y2 > 1) {
    y1 -= y2 - 1;
    y2 = 1;
  }
  return {
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2)
  };
}

/** 根据当前裁剪框计算微信 draft 所需的 pic_crop_235_1 与 pic_crop_1_1 */
export async function computeWechatCoverPicCrops(
  imageSrc: string,
  crop: CoverCropState,
  viewportWidth: number,
  viewportHeight: number,
  editMode: WechatCoverCropMode
): Promise<{ picCrop2351: string; picCrop11: string }> {
  const img = await loadImage(imageSrc);
  const vw = viewportWidth;
  const vh = viewportHeight;

  let wideRect: WechatPicCropRect;
  let squareRect: WechatPicCropRect;

  if (editMode === "wide") {
    wideRect = rectFromViewportRegion(crop, img.width, img.height, vw, vh, { x1: 0, y1: 0, x2: vw, y2: vh });
    const side = vh;
    const ox = (vw - side) / 2;
    squareRect = rectFromViewportRegion(crop, img.width, img.height, vw, vh, {
      x1: ox,
      y1: 0,
      x2: ox + side,
      y2: vh
    });
  } else {
    squareRect = rectFromViewportRegion(crop, img.width, img.height, vw, vh, { x1: 0, y1: 0, x2: vw, y2: vh });
    wideRect = expandSquareToWideRect(squareRect);
  }

  wideRect = fitRectToAspect(wideRect, WECHAT_COVER_ASPECT_WIDE, img.width, img.height);
  squareRect = fitRectToAspect(squareRect, WECHAT_COVER_ASPECT_SQUARE, img.width, img.height);

  return {
    picCrop2351: formatWechatPicCrop(wideRect),
    picCrop11: formatWechatPicCrop(squareRect)
  };
}
