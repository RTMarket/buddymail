import { PDFDocument } from "pdf-lib";

function toUint8(bytes: ArrayBuffer): Uint8Array {
  return new Uint8Array(bytes);
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * 从单个 PDF 中按 1-based 页码顺序复制页面（去重后按页码升序，与勾选顺序无关）。
 */
export async function buildPdfFromSelectedPages(
  bytes: ArrayBuffer,
  oneBasedPages: number[]
): Promise<Uint8Array> {
  const src = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const n = src.getPageCount();
  const uniqueSorted = [
    ...new Set(oneBasedPages.map((p) => p).filter((p) => Number.isInteger(p) && p >= 1 && p <= n))
  ].sort((a, b) => a - b);
  if (uniqueSorted.length === 0) {
    throw new Error(`请至少勾选一页，有效范围为 1–${n}。`);
  }
  const zeroBased = uniqueSorted.map((p) => p - 1);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, zeroBased);
  copied.forEach((page) => out.addPage(page));
  return out.save();
}

export type MergePdfItem = { bytes: ArrayBuffer; oneBasedPages: number[] };

/**
 * 按 items 数组顺序合并：每个文件内所选页按页码升序拼接，再接到下一文件。
 */
export async function mergePdfSelections(items: MergePdfItem[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const item of items) {
    const src = await PDFDocument.load(toUint8(item.bytes), { ignoreEncryption: true });
    const n = src.getPageCount();
    const uniqueSorted = [
      ...new Set(item.oneBasedPages.map((p) => p).filter((p) => Number.isInteger(p) && p >= 1 && p <= n))
    ].sort((a, b) => a - b);
    if (uniqueSorted.length === 0) continue;
    const zeroBased = uniqueSorted.map((p) => p - 1);
    const copied = await merged.copyPages(src, zeroBased);
    copied.forEach((page) => merged.addPage(page));
  }
  if (merged.getPageCount() === 0) {
    throw new Error("请至少在一个 PDF 中勾选一页。");
  }
  return merged.save();
}
