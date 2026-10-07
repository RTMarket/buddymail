/** 用于 HTML 属性值（src、alt 等），避免引号与 & 破坏标签 */
export function escapeHtmlAttribute(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}
