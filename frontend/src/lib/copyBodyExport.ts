import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Document, ImageRun, Packer, Paragraph, TextRun } from "docx";

const EXPORT_BASE_STYLE = `
  body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.65;color:#0f172a;}
  img,video{max-width:100%;height:auto;border-radius:8px;}
  p{margin:0.75em 0;}
`;

/** 从文案 HTML 得到纯文本（用于 .txt） */
export function copyHtmlToPlainText(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  const t = d.innerText ?? d.textContent ?? "";
  return t.replace(/\u00a0/g, " ").trim() || "";
}

/** 独立可双击打开的 HTML 文档（保留 img / video 等标签与 data URL） */
export function buildStandaloneCopyHtml(innerHtml: string): string {
  const body = innerHtml?.trim() ? innerHtml : "<p></p>";
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>文案导出</title>
<style>${EXPORT_BASE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/(\w+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m?.[2]) return null;
  try {
    const bin = atob(m[2]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function imageTypeFromDataUrl(dataUrl: string): "png" | "jpg" | "gif" | "bmp" {
  const m = /^data:image\/(\w+);/i.exec(dataUrl);
  const t = (m?.[1] ?? "png").toLowerCase();
  if (t === "jpeg" || t === "jpg") return "jpg";
  if (t === "gif") return "gif";
  if (t === "bmp") return "bmp";
  return "png";
}

/** 在克隆文档里把 video 换成当前帧截图（与源节点按顺序对应） */
function patchVideosInClone(clonedRoot: HTMLElement, sourceRoot: HTMLElement) {
  const srcVideos = sourceRoot.querySelectorAll("video");
  const cloneVideos = clonedRoot.querySelectorAll("video");
  srcVideos.forEach((orig, i) => {
    const cloneV = cloneVideos[i];
    if (!cloneV?.parentNode) return;
    try {
      const w = Math.max(1, orig.videoWidth || orig.clientWidth || 640);
      const h = Math.max(1, orig.videoHeight || orig.clientHeight || 360);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.drawImage(orig, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/png");
      const img = cloneV.ownerDocument.createElement("img");
      img.src = dataUrl;
      const style = cloneV.getAttribute("style");
      if (style) img.setAttribute("style", style);
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.borderRadius = "8px";
      img.alt = "视频当前画面";
      cloneV.parentNode.replaceChild(img, cloneV);
    } catch {
      const p = cloneV.ownerDocument.createElement("p");
      p.textContent = "【视频当前帧无法导出（可能受跨域限制），请改用 HTML 导出】";
      p.style.color = "#64748b";
      p.style.fontSize = "13px";
      cloneV.parentNode.replaceChild(p, cloneV);
    }
  });
}

export type VisualExportOptions = {
  /** 缩放；内容很高时建议 1，避免画布过大失败 */
  scale?: number;
};

/** 将编辑区渲染为 canvas（视频用当前帧替代） */
export async function renderCopyEditorToCanvas(
  editorEl: HTMLElement,
  options: VisualExportOptions = {}
): Promise<HTMLCanvasElement> {
  const tall = editorEl.scrollHeight > 2400;
  const scale = options.scale ?? (tall ? 1 : 1.15);
  const canvas = await html2canvas(editorEl, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: editorEl.scrollWidth,
    windowHeight: editorEl.scrollHeight,
    onclone: (_doc, cloned) => {
      const el = cloned as HTMLElement;
      patchVideosInClone(el, editorEl);
      el.style.height = "auto";
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
    }
  });
  return canvas;
}

export async function exportCopyEditorAsPngBlob(
  editorEl: HTMLElement,
  options?: VisualExportOptions
): Promise<Blob> {
  const canvas = await renderCopyEditorToCanvas(editorEl, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法生成 PNG"))), "image/png", 0.92);
  });
}

/** 多页 PDF（整页为一张长图按 A4 高度切开） */
export async function exportCopyEditorAsPdfBlob(
  editorEl: HTMLElement,
  options?: VisualExportOptions
): Promise<Blob> {
  const canvas = await renderCopyEditorToCanvas(editorEl, options);
  const imgData = canvas.toDataURL("image/png", 0.92);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
}

function scaleToMaxWidth(w: number, h: number, maxW: number): { width: number; height: number } {
  if (w <= maxW) return { width: Math.round(w), height: Math.round(h) };
  const ratio = maxW / w;
  return { width: Math.round(maxW), height: Math.round(h * ratio) };
}

async function imgToRuns(img: HTMLImageElement): Promise<(TextRun | ImageRun)[]> {
  const src = img.getAttribute("src") || "";
  if (!src.startsWith("data:image")) {
    return [
      new TextRun({
        text: `[图片] ${src.length > 200 ? `${src.slice(0, 200)}…` : src}`,
        italics: true
      })
    ];
  }
  const data = dataUrlToUint8Array(src);
  if (!data) {
    return [new TextRun({ text: "[图片数据无效]", italics: true })];
  }
  const nw = img.naturalWidth || img.width || 400;
  const nh = img.naturalHeight || img.height || 300;
  const { width, height } = scaleToMaxWidth(nw, nh, 520);
  const type = imageTypeFromDataUrl(src);
  return [
    new ImageRun({
      type,
      data,
      transformation: { width, height }
    })
  ];
}

async function videoToRuns(video: HTMLVideoElement): Promise<(TextRun | ImageRun)[]> {
  try {
    const w = Math.max(1, video.videoWidth || video.clientWidth || 640);
    const h = Math.max(1, video.videoHeight || video.clientHeight || 360);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/png");
    const data = dataUrlToUint8Array(dataUrl);
    if (!data) throw new Error("no frame");
    const { width, height } = scaleToMaxWidth(w, h, 520);
    return [
      new TextRun({ text: "【视频 · 当前画面】", bold: true }),
      new ImageRun({
        type: "png",
        data,
        transformation: { width, height }
      })
    ];
  } catch {
    const src = video.getAttribute("src") || "";
    return [
      new TextRun({
        text: `【视频】${
          src ? (src.length > 100 ? `${src.slice(0, 100)}…` : src) : "（无地址）"
        } — 无法用当前帧写入 Word，请改用 HTML 或长图导出。`,
        italics: true
      })
    ];
  }
}

type ParaChild = TextRun | ImageRun;

async function collectInlineChildren(node: Node): Promise<ParaChild[]> {
  const out: ParaChild[] = [];
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent ?? "";
    if (t) out.push(new TextRun(t));
    return out;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return out;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") {
    out.push(new TextRun({ break: 1 }));
    return out;
  }
  if (tag === "img") {
    out.push(...(await imgToRuns(el as HTMLImageElement)));
    return out;
  }
  if (tag === "video") {
    out.push(...(await videoToRuns(el as HTMLVideoElement)));
    return out;
  }
  for (const c of Array.from(el.childNodes)) {
    out.push(...(await collectInlineChildren(c)));
  }
  return out;
}

/** 将编辑区导出为 Word（.docx）；内嵌图用 data URL，视频插入当前帧截图 */
export async function exportCopyEditorToDocxBlob(root: HTMLElement): Promise<Blob> {
  const paragraphs: Paragraph[] = [];

  const blocks =
    root.children.length > 0 ? Array.from(root.children) : [root as unknown as HTMLElement];

  for (const block of blocks) {
    const kids = await collectInlineChildren(block);
    if (kids.length === 0) continue;
    paragraphs.push(new Paragraph({ children: kids }));
  }

  if (paragraphs.length === 0) {
    paragraphs.push(
      new Paragraph({ children: [new TextRun(copyHtmlToPlainText(root.innerHTML) || "（空）")] })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  return Packer.toBlob(doc);
}
