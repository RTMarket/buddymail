/**
 * 邮件模版页 Quill Snow 工具栏配置
 * 硬性锁定：未经需求方明确允许，禁止改动本文件（含工具栏项、formats、handlers）。
 * 见 .cursor/rules/email-template-quill-toolbar-lock.mdc
 */

/** Snow 默认 35 色；显式列出以保证工具栏色板可点选（与 Quill base theme 一致） */
export const EMAIL_QUILL_COLOR_PALETTE = [
  "#000000",
  "#e60000",
  "#ff9900",
  "#ffff00",
  "#008a00",
  "#0066cc",
  "#9933ff",
  "#ffffff",
  "#facccc",
  "#ffebcc",
  "#ffffcc",
  "#cce8cc",
  "#cce0f5",
  "#ebd6ff",
  "#bbbbbb",
  "#f06666",
  "#ffc266",
  "#ffff66",
  "#66b966",
  "#66a3e0",
  "#c285ff",
  "#888888",
  "#a10000",
  "#b26b00",
  "#b2b200",
  "#006100",
  "#0047b2",
  "#6b24b2",
  "#444444",
  "#5c0000",
  "#663d00",
  "#666600",
  "#003700",
  "#002966",
  "#3d1466"
] as const;

export const EMAIL_TEMPLATE_QUILL_FORMATS = [
  "header",
  "font",
  "size",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "indent",
  "align",
  "blockquote",
  "link",
  "image",
  /** HTML5 视频块（由正文区「本地视频」插入，非工具栏按钮） */
  "emailHtmlVideo",
  /** 电商助手商品横排行（table，非工具栏按钮） */
  "emailCommerceRow",
  "clean"
] as const;

export const EMAIL_QUILL_TOOLBAR = [
  /** 去掉 header 下拉，避免工具栏出现两个 “Normal” 选项 */
  [{ font: [] }, { size: ["small", false, "large", "huge"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [...EMAIL_QUILL_COLOR_PALETTE] }, { background: [...EMAIL_QUILL_COLOR_PALETTE] }],
  [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
  ["blockquote"],
  ["link", "image"],
  ["clean"]
];

export const EMAIL_QUILL_FORMATS_ARR: string[] = [...EMAIL_TEMPLATE_QUILL_FORMATS];

/** 仅覆盖图片：打开隐藏 file input；其余由 Snow 主题默认 handlers 深度合并 */
export function buildEmailTemplateQuillModules(openImagePicker: () => void) {
  return {
    toolbar: {
      container: EMAIL_QUILL_TOOLBAR,
      handlers: {
        image: () => openImagePicker()
      }
    }
  };
}
