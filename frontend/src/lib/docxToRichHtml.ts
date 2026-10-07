import JSZip from "jszip";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hexColor(val: string | undefined): string | null {
  if (!val) return null;
  const v = val.trim().replace(/^#/, "");
  if (/^auto$/i.test(v)) return null;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
}

function twipToPx(twips: string | undefined, fallback = 0): number {
  const n = Number(twips);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n / 15));
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`(?:w:)?${name}="([^"]*)"`, "i");
  return re.exec(tag)?.[1];
}

function runToHtml(runXml: string): string {
  const pr = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/i.exec(runXml)?.[1] ?? "";
  const styles: string[] = [];
  const color = hexColor(attr(/<w:color\b[^/]*\/?>/i.exec(pr)?.[0] ?? "", "val"));
  if (color) styles.push(`color:${color}`);
  if (/<w:b\b/i.test(pr) && !/w:val="(?:0|false)"/i.test(/<w:b\b[^/]*\/?>/i.exec(pr)?.[0] ?? "")) {
    styles.push("font-weight:700");
  }
  if (/<w:i\b/i.test(pr) && !/w:val="(?:0|false)"/i.test(/<w:i\b[^/]*\/?>/i.exec(pr)?.[0] ?? "")) {
    styles.push("font-style:italic");
  }
  if (/<w:u\b/i.test(pr) && !/w:val="(?:none|0|false)"/i.test(/<w:u\b[^/]*\/?>/i.exec(pr)?.[0] ?? "")) {
    styles.push("text-decoration:underline");
  }
  const sz = attr(/<w:sz\b[^/]*\/?>/i.exec(pr)?.[0] ?? "", "val");
  if (sz && Number(sz) > 0) styles.push(`font-size:${Number(sz) / 2}pt`);

  const parts: string[] = [];
  const tokenRe = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:tab\b[^/]*\/>|<w:br\b([^/]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(runXml)) !== null) {
    if (m[0].startsWith("<w:t")) {
      parts.push(esc((m[2] ?? "").replace(/\r\n/g, "\n")));
    } else if (m[0].startsWith("<w:tab")) {
      parts.push("\t");
    } else {
      const br = m[3] ?? "";
      parts.push(/type="page"/i.test(br) ? '<span class="bss-page-break"></span>' : "<br/>");
    }
  }
  const inner = parts.join("");
  if (!inner) return "";
  const style = styles.length ? ` style="${styles.join(";")}"` : "";
  return `<span${style}>${inner}</span>`;
}

function paraToHtml(pXml: string): string {
  const pr = /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/i.exec(pXml)?.[1] ?? "";
  const styles: string[] = ["white-space:pre-wrap"];
  const jc = attr(/<w:jc\b[^/]*\/?>/i.exec(pr)?.[0] ?? "", "val");
  if (jc === "center") styles.push("text-align:center");
  else if (jc === "right") styles.push("text-align:right");
  else if (jc === "both") styles.push("text-align:justify");
  const spacing = /<w:spacing\b[^/]*\/?>/i.exec(pr)?.[0] ?? "";
  const before = twipToPx(attr(spacing, "before"), 0);
  const after = twipToPx(attr(spacing, "after"), 8);
  styles.push(`margin:${Math.min(before, 28)}px 0 ${Math.min(after, 24)}px`);
  const bottom = /<w:bottom\b[^/]*\/?>/i.exec(pr)?.[0] ?? "";
  const bColor = hexColor(attr(bottom, "color"));
  if (bColor) styles.push(`border-bottom:2px solid ${bColor}`, "padding-bottom:6px");

  const runs: string[] = [];
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = runRe.exec(pXml)) !== null) {
    runs.push(runToHtml(rm[0]));
  }
  const inner = runs.join("");
  if (!inner.trim() && /type="page"/i.test(pXml)) {
    return '<div class="bss-page-break"></div>';
  }
  return `<p style="${styles.join(";")}">${inner || "&nbsp;"}</p>`;
}

/** 从 .docx 抽出带颜色/加粗/对齐的 HTML（mammoth 默认不输出 w:color） */
export async function docxToRichHtml(file: File | ArrayBuffer): Promise<string> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("无法读取 Word 文档内容");
  const xml = await entry.async("string");
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i.exec(xml)?.[1] ?? xml;
  const paras: string[] = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(body)) !== null) {
    paras.push(paraToHtml(pm[0]));
  }
  return `<div class="bss-docx">${paras.join("\n")}</div>`;
}
