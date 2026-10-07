/** 判断字符串是否像已含 HTML 标签（区别于纯文本/Markdown 字面量） */
export function copyBodyLooksLikeHtml(s: string): boolean {
  return /<[a-z][\s/>]/i.test(s);
}

/** 将纯文本（按行）转为简单段落 HTML，供可视化文案区使用 */
export function plainLinesToCopyHtml(s: string): string {
  if (!s) return "<p><br></p>";
  if (copyBodyLooksLikeHtml(s)) return s;
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s
    .split("\n")
    .map((line) => `<p>${line ? esc(line) : "<br>"}</p>`)
    .join("");
}
