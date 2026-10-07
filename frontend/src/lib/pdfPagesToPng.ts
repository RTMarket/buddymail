import * as pdfjs from "pdfjs-dist";
// 自定义 worker 入口：在 worker 全局先打 polyfill，再加载 pdfjs 官方 worker。
import workerUrl from "./pdfWorkerEntry?worker&url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PDF_PAGES = 80;

async function openPdfWithFallback(buf: Uint8Array) {
  try {
    return await pdfjs.getDocument({ data: buf }).promise;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes("failed to fetch dynamically imported module")) {
      throw new Error(
        "PDF worker 资源加载失败。请先强制刷新页面（Ctrl/Cmd+Shift+R）后重试；若仍失败，请确认前端 dist/assets 下的 pdf.worker.min-*.mjs 已随版本一起部署。"
      );
    }
    throw e;
  }
}

/**
 * 将 PDF 每一页渲染为 PNG（浏览器内 pdf.js），按顺序返回 Blob。
 */
export async function pdfFileToPngBlobs(file: File, scale = 2): Promise<Blob[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await openPdfWithFallback(buf);
  if (doc.numPages > MAX_PDF_PAGES) {
    throw new Error(`页数过多（${doc.numPages}），请限制在 ${MAX_PDF_PAGES} 页以内后再试，或分批导出 PDF。`);
  }
  const blobs: Blob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const task = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
      background: "#ffffff"
    });
    await task.promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 编码失败"))), "image/png");
    });
    blobs.push(blob);
  }
  return blobs;
}
