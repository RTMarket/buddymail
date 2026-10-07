/** 从店铺截图按 bbox（0~1000）裁剪商品图 */

export type CommerceBbox = { left: number; top: number; right: number; bottom: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

export async function cropImageRegion(
  imageSrc: string,
  bbox: CommerceBbox,
  scale = 1000
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const x = (bbox.left / scale) * img.width;
  const y = (bbox.top / scale) * img.height;
  const w = Math.max(1, ((bbox.right - bbox.left) / scale) * img.width);
  const h = Math.max(1, ((bbox.bottom - bbox.top) / scale) * img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("裁剪失败"))),
      "image/jpeg",
      0.9
    );
  });
}

/** 无 AI 时：按列数均分整张截图为网格单元 */
export async function splitScreenshotGrid(
  file: File,
  columns: number,
  rows?: number
): Promise<Blob[]> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const cols = Math.max(1, Math.min(5, columns));
  let rowCount = rows;
  if (!rowCount || rowCount < 1) {
    const cellW = img.width / cols;
    const cellH = cellW * 1.35;
    rowCount = Math.max(1, Math.ceil(img.height / cellH));
  }
  rowCount = Math.min(rowCount, 20);
  const cellW = img.width / cols;
  const cellH = img.height / rowCount;
  const out: Blob[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cellW));
      canvas.height = Math.max(1, Math.round(cellH));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(
        img,
        c * cellW,
        r * cellH,
        cellW,
        cellH,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
      );
      if (blob) out.push(blob);
    }
  }
  return out;
}
