import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 40;

/**
 * 在原有 PDF 每页上叠加可填写的 AcroForm 文本框（横线式单行域 + 底部多行备注域）。
 * 不识别印刷表格线位置，域为通用排版；填写后可用 Adobe Acrobat Reader / 福昕等「另存为」保存已填内容。
 */
export async function staticPdfToFillablePdfBlob(file: File): Promise<Blob> {
  if (file.size > MAX_BYTES) {
    throw new Error(`文件过大，请限制在 ${MAX_BYTES / 1024 / 1024}MB 以内`);
  }

  let pdfDoc: PDFDocument;
  try {
    const raw = await file.arrayBuffer();
    pdfDoc = await PDFDocument.load(raw, { ignoreEncryption: false });
  } catch {
    throw new Error("无法读取该 PDF（可能已加密或已损坏）。请用阅读器「另存为」新 PDF 后再试。");
  }

  const numPages = pdfDoc.getPageCount();
  if (numPages > MAX_PAGES) {
    throw new Error(`页数过多（${numPages}），请限制在 ${MAX_PAGES} 页以内后再试。`);
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  for (let pi = 0; pi < numPages; pi++) {
    const page = pdfDoc.getPage(pi);
    const { width, height } = page.getSize();
    const marginX = 44;
    const innerW = Math.max(72, width - 2 * marginX);

    const topReserve = 52;
    const remBottom = 48;
    const remH = Math.min(72, Math.max(48, height * 0.12));
    const lineGap = 22;
    const fieldH = 14;
    const lineBottomMin = remBottom + remH + 8;

    let y = height - topReserve - fieldH;
    let li = 0;
    while (y >= lineBottomMin && li < 20) {
      const tf = form.createTextField(`bsb_p${pi + 1}_ln${li + 1}`);
      tf.addToPage(page, {
        x: marginX,
        y,
        width: innerW,
        height: fieldH,
        borderWidth: 0.6,
        borderColor: rgb(0.55, 0.55, 0.62),
        backgroundColor: rgb(0.99, 0.99, 1),
        textColor: rgb(0.05, 0.05, 0.08),
        font,
      });
      li++;
      y -= lineGap;
    }

    const rem = form.createTextField(`bsb_p${pi + 1}_rem`);
    rem.enableMultiline();
    rem.addToPage(page, {
      x: marginX,
      y: remBottom,
      width: innerW,
      height: remH,
      borderWidth: 0.7,
      borderColor: rgb(0.38, 0.44, 0.68),
      backgroundColor: rgb(1, 1, 1),
      textColor: rgb(0.05, 0.05, 0.08),
      font,
    });
  }

  form.updateFieldAppearances(font);

  const out = await pdfDoc.save();
  return new Blob([new Uint8Array(out)], { type: "application/pdf" });
}
