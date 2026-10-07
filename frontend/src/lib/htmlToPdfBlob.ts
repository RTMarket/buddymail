import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/**
 * 将 HTML（含颜色、粗体、表格、换行空格）渲染为 PDF。
 * Word .docx 经 mammoth 转出的 HTML 走这里，避免先抽成纯文本导致丢样式。
 */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const body = (html ?? "").trim();
  if (!body) return pdf.output("blob");

  const wrap = document.createElement("div");
  wrap.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:720px",
    "box-sizing:border-box",
    "padding:28px 32px",
    "background:#ffffff",
    'font:14px/1.75 system-ui,-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    "color:#111827",
    "white-space:normal",
    "word-break:break-word"
  ].join(";");

  const style = document.createElement("style");
  style.textContent = `
    .bss-html-pdf, .bss-html-pdf * { box-sizing: border-box; }
    .bss-html-pdf p { margin: 0 0 0.7em; white-space: pre-wrap; }
    .bss-html-pdf div, .bss-html-pdf span, .bss-html-pdf li { white-space: pre-wrap; }
    .bss-html-pdf h1,.bss-html-pdf h2,.bss-html-pdf h3,.bss-html-pdf h4 { margin: 0.4em 0 0.5em; line-height: 1.35; }
    .bss-html-pdf ul, .bss-html-pdf ol { margin: 0 0 0.7em; padding-left: 1.4em; }
    .bss-html-pdf table { border-collapse: collapse; width: 100%; margin: 0 0 0.8em; }
    .bss-html-pdf td, .bss-html-pdf th { border: 1px solid #94a3b8; padding: 4px 8px; vertical-align: top; }
    .bss-html-pdf img { max-width: 100%; height: auto; }
    .bss-html-pdf a { color: inherit; }
    .bss-html-pdf .bss-page-break { height: 18px; border: 0; border-top: 1px dashed #cbd5e1; margin: 10px 0; }
  `;

  wrap.className = "bss-html-pdf";
  if (looksLikeHtml(body)) wrap.innerHTML = body;
  else wrap.textContent = body;
  wrap.prepend(style);
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 720
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
