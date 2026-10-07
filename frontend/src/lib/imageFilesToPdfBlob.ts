import { jsPDF } from "jspdf";

const MAX_IMAGES = 40;
const MAX_BYTES_PER_FILE = 15 * 1024 * 1024;

function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

/**
 * 将多张位图逐页写入 A4 PDF（等比缩放居中，统一转 JPEG 写入以兼容常见格式）。
 */
export async function imageFilesToPdfBlob(files: File[]): Promise<Blob> {
  if (files.length === 0) throw new Error("无图片");
  if (files.length > MAX_IMAGES) {
    throw new Error(`一次最多选择 ${MAX_IMAGES} 张图片，请分批处理。`);
  }
  for (const f of files) {
    if (f.size > MAX_BYTES_PER_FILE) {
      throw new Error(`单张图片请小于 ${MAX_BYTES_PER_FILE / 1024 / 1024}MB：${f.name}`);
    }
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  for (let i = 0; i < files.length; i++) {
    if (i > 0) pdf.addPage();
    const f = files[i]!;
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(f);
    } catch {
      throw new Error(`无法解码图片（格式可能不受支持）：${f.name}`);
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建画布");
      ctx.drawImage(bmp, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      const iwMm = pxToMm(bmp.width);
      const ihMm = pxToMm(bmp.height);
      if (!iwMm || !ihMm) throw new Error(`无效尺寸：${f.name}`);

      const scale = Math.min(availW / iwMm, availH / ihMm, 1);
      const dw = iwMm * scale;
      const dh = ihMm * scale;
      const x = margin + (availW - dw) / 2;
      const y = margin + (availH - dh) / 2;

      pdf.addImage(dataUrl, "JPEG", x, y, dw, dh);
    } finally {
      bmp.close?.();
    }
  }

  return pdf.output("blob");
}
