import JSZip from "jszip";

/** 从 OOXML slide XML 中提取 <a:t> 文本（常见正文/标题） */
function extractATextLines(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1] ?? "";
    const decoded = raw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const t = decoded.trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * 从 .pptx 各页 slide XML 提取可见文本（用于 TXT/HTML/MD/PDF/Word 导出）。
 * 复杂排版、纯图幻灯片可能字很少或为空。
 */
export async function extractPptxPlainText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const keys = Object.keys(zip.files)
    .map((k) => k.replace(/\\/g, "/"))
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(/slide(\d+)\.xml/i.exec(a)?.[1] ?? "0", 10);
      const nb = parseInt(/slide(\d+)\.xml/i.exec(b)?.[1] ?? "0", 10);
      return na - nb;
    });

  if (keys.length === 0) {
    return "（未能读取幻灯片页 XML；文件可能损坏或非标准 .pptx）";
  }

  const sections: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const zf = zip.file(key);
    if (!zf) continue;
    const xml = await zf.async("string");
    const lines = extractATextLines(xml);
    const body = lines.length ? lines.join("\n") : "（本页未提取到文本，可能仅有图片或形状）";
    sections.push(`【第 ${i + 1} 页】\n${body}`);
  }

  return sections.join("\n\n");
}
