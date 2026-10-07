import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";
// 自定义 worker 入口：在 worker 全局先打 polyfill，再加载 pdfjs 官方 worker。
import workerUrl from "./pdfWorkerEntry?worker&url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_BYTES = 20 * 1024 * 1024;

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
 * 从上传文件提取纯文本，供文案区载入。支持 .txt、.pdf、.docx（不支持旧版 .doc）。
 */
export async function extractCopyDocumentText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error(`文件过大，请限制在 ${MAX_BYTES / 1024 / 1024}MB 以内`);
  }

  const lower = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === "text/plain" || lower.endsWith(".txt")) {
    return (await file.text()).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  }

  if (type === "application/pdf" || lower.endsWith(".pdf")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const doc = await openPdfWithFallback(buf);
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const line = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      parts.push(line);
    }
    return parts.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }

  if (
    lower.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  }

  if (lower.endsWith(".doc")) {
    throw new Error("暂不支持旧版 Word（.doc），请另存为 .docx 或导出为 PDF 后再上传");
  }

  throw new Error("不支持的格式，请上传 .txt、.pdf 或 .docx");
}
