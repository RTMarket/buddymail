import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * 将纯文本渲染为 PDF（通过离屏 DOM + html2canvas，可正确显示中文等 Unicode）。
 */
export async function plainTextToPdfBlob(plain: string): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const trimmed = plain.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!trimmed.trim()) {
    return pdf.output("blob");
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:720px",
    "box-sizing:border-box",
    "padding:24px",
    "background:#ffffff",
    'font:14px/1.65 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
    "color:#0f172a",
    "white-space:pre-wrap",
    "word-break:break-word"
  ].join(";");

  wrap.textContent = trimmed;
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff"
    });

    const imgData = canvas.toDataURL("image/png", 0.92);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let y = margin;

    pdf.addImage(imgData, "PNG", margin, y, imgW, imgH, undefined, "FAST");
    heightLeft -= pageH - margin * 2;

    while (heightLeft > 0.5) {
      y = -(imgH - heightLeft - margin);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, y, imgW, imgH, undefined, "FAST");
      heightLeft -= pageH - margin * 2;
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(wrap);
  }
}
