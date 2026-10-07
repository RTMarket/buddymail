function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 从网页 HTML 提取主区可见文字（导航/页脚已尽量跳过） */
export function extractVisibleMainTextBlocks(pageHtml: string): string[] {
  const cleaned = pageHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const region =
    cleaned.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    cleaned.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    cleaned.match(/<form[\s\S]*?<\/form>/i)?.[0] ??
    cleaned.match(
      /<div[^>]+(?:id|class)=["'][^"']*(?:content|main|login|body|page)[^"']*["'][\s\S]*?<\/div>/i
    )?.[0] ??
    cleaned;

  const blocks: string[] = [];
  const tagRe = /<(h[1-3]|p|label|button|legend|figcaption|a)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(region))) {
    const text = stripTags(m[2]!);
    if (!text || text.length < 2) continue;
    if (/^(home|menu|nav|©|copyright|privacy|terms|services|blog|support|account)/i.test(text)) continue;
    if (/^(client area|affiliates|datacenters)$/i.test(text)) continue;
    if (text.length > 320) continue;
    blocks.push(text);
  }
  return [...new Set(blocks)].slice(0, 28);
}

/** 识图正文过薄时，用网页主区文字补充（保留已有图片位） */
export function supplementReplicaHtmlWithPageText(bodyHtml: string, pageHtml: string): string {
  const visible = bodyHtml.replace(/<[^>]+>/g, "").replace(/\{\{IMG_\d+\}\}/g, "").replace(/\s+/g, "").trim();
  if (visible.length >= 36) return bodyHtml;
  const blocks = extractVisibleMainTextBlocks(pageHtml);
  if (!blocks.length) return bodyHtml;
  const extra = blocks
    .map(
      (t) =>
        `<p style="margin:10px 0;text-align:center;line-height:1.5;"><span style="color:#1e293b;font-size:15px;">${escapeHtml(t)}</span></p>`
    )
    .join("");
  return `${bodyHtml}${extra}`;
}
