export type StudioCopyDoc = {
  title: string;
  body: string;
  table: string[][];
};

export function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2500);
}

export function studioCopyFileName(title: string, ext: string) {
  const base = title.replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40) || "copy";
  return `${base}.${ext}`;
}

export async function blobStudioDocx(doc: StudioCopyDoc): Promise<Blob> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const paras = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
    ...doc.body.split(/\n/).map((line) => new Paragraph({ children: [new TextRun(line || " ")] }))
  ];
  const file = new Document({ sections: [{ children: paras }] });
  return Packer.toBlob(file);
}

export async function blobStudioXlsx(doc: StudioCopyDoc): Promise<Blob> {
  const XLSX = await import("xlsx");
  const aoa = doc.table.length
    ? doc.table
    : [[doc.title], ...doc.body.split(/\n/).filter(Boolean).map((line) => [line])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

export async function blobStudioPdf(doc: StudioCopyDoc): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:-9999px;top:0;width:720px;padding:40px;background:#fff;color:#111;font:16px/1.7 system-ui,'PingFang SC',sans-serif;white-space:pre-wrap;";
  const h = document.createElement("h1");
  h.style.fontSize = "22px";
  h.style.margin = "0 0 16px";
  h.textContent = doc.title;
  const body = document.createElement("div");
  body.textContent = doc.body;
  wrap.appendChild(h);
  wrap.appendChild(body);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(img, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(img, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    return pdf.output("blob");
  } finally {
    document.body.removeChild(wrap);
  }
}

export async function downloadUrlAsFile(url: string, filename: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  triggerBlobDownload(await resp.blob(), filename);
}
