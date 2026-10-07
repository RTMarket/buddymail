/** 加载图片供 Canvas 绘制；网络图会带 crossOrigin，需服务端 CORS 才能导出。 */
export function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("无法导出像素（常见原因：网络图未允许跨域 CORS）"))),
      "image/png"
    );
  });
}

/** 生成纯色 PNG 的 data URL，用作文字成图底图 */
export function solidColorImageDataUrl(width: number, height: number, fillCss: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.fillStyle = fillCss;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

/** 截取 video 当前帧为 PNG data URL；跨域未授权时返回 null */
export function captureVideoFrameToDataUrl(video: HTMLVideoElement): string | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** 顺时针旋转 90° */
export function rotate90Clockwise(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.translate(h, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** 逆时针旋转 90° */
export function rotate90CounterClockwise(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.translate(0, w);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function flipHorizontal(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function flipVertical(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** 宽度超过 maxWidth 时缩小，否则保持原尺寸 */
export function scaleToMaxWidth(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) throw new Error("图片尺寸无效");
  const ratio = w > maxWidth ? maxWidth / w : 1;
  const nw = Math.max(1, Math.round(w * ratio));
  const nh = Math.max(1, Math.round(h * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  if (ratio < 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  ctx.drawImage(img, 0, 0, nw, nh);
  return canvas;
}

/** 将已有画布按最大宽度等比缩小（不超过则不变），用于裁切后再压尺寸 */
export function scaleCanvasToMaxWidth(canvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) throw new Error("画布尺寸无效");
  const ratio = w > maxWidth ? maxWidth / w : 1;
  const nw = Math.max(1, Math.round(w * ratio));
  const nh = Math.max(1, Math.round(h * ratio));
  const out = document.createElement("canvas");
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  if (ratio < 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, nw, nh);
  return out;
}
