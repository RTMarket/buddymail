/** 与图片「加文字」弹窗共用的字体、符号与 HTML 内联样式生成 */

export type SkewMode = "none" | "left" | "right";

export const FONT_CHOICES: { id: string; label: string; value: string }[] = [
  { id: "sans", label: "系统 UI · 通用无衬线", value: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "pingfang", label: "苹方 / PingFang SC", value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { id: "yahei", label: "微软雅黑", value: '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif' },
  { id: "heiti", label: "黑体 · 华文黑 / 黑体-简", value: '"STHeiti", "SimHei", "Heiti SC", "PingFang SC", sans-serif' },
  { id: "round", label: "圆体感 · 冬青 / 雅黑", value: '"Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "yuanti", label: "圆体 · 幼圆 / 圆体-简", value: '"Yuanti SC", "YouYuan", "Microsoft YaHei UI", sans-serif' },
  { id: "serif", label: "衬线 · 系统默认", value: 'ui-serif, "Songti SC", "SimSun", "Times New Roman", serif' },
  { id: "songti", label: "宋体 · 华文宋 / 新宋体", value: '"Songti SC", "SimSun", "NSimSun", "STSong", serif' },
  { id: "kaiti", label: "楷体", value: '"Kaiti SC", "KaiTi", "STKaiti", "SimKai", serif' },
  { id: "fangsong", label: "仿宋", value: '"FangSong", "STFangsong", "SimFang", serif' },
  { id: "lishu", label: "隶书（本机有则显示）", value: '"STLiti", "LiSu", "SimLi", serif' },
  { id: "xingkai", label: "行楷（本机有则显示）", value: '"Xingkai SC", "STXingkai", "KaiTi", serif' },
  { id: "noto-sans", label: "思源黑体系（Noto / 源黑）", value: '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", sans-serif' },
  { id: "noto-serif", label: "思源宋体系（Noto / 源宋）", value: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", serif' },
  { id: "impact", label: "海报英文 · Impact", value: 'Impact, "Arial Black", "PingFang SC", sans-serif' },
  { id: "arial", label: "Arial / Helvetica", value: 'Helvetica, Arial, "PingFang SC", sans-serif' },
  { id: "times", label: "Times New Roman", value: '"Times New Roman", Times, "Songti SC", serif' },
  { id: "georgia", label: "Georgia", value: 'Georgia, "Songti SC", serif' },
  { id: "verdana", label: "Verdana", value: 'Verdana, Geneva, "Microsoft YaHei", sans-serif' },
  { id: "trebuchet", label: "Trebuchet MS", value: '"Trebuchet MS", "Microsoft YaHei", sans-serif' },
  { id: "tahoma", label: "Tahoma", value: 'Tahoma, "Microsoft YaHei", Verdana, sans-serif' },
  { id: "courier", label: "Courier New · 打字机", value: '"Courier New", Courier, monospace' },
  { id: "mono", label: "系统等宽（UI Mono）", value: 'ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace' },
  { id: "comic", label: "Comic Sans · 手写感（西文）", value: '"Comic Sans MS", "Microsoft YaHei", cursive, sans-serif' }
];

/** Canvas transform 用水平剪切系数（与图片加文字弹窗一致） */
export const CANVAS_SHEAR = 0.24;

/** 文案区 HTML 内联样式用 skew，与画布视觉接近 */
const SKEW_DEG = 14;

export const SYMBOL_PRESETS: { char: string; title: string }[] = [
  { char: "★", title: "星形" },
  { char: "☆", title: "空心星" },
  { char: "●", title: "实心圆" },
  { char: "○", title: "空心圆" },
  { char: "■", title: "方块" },
  { char: "▲", title: "三角" },
  { char: "▼", title: "倒三角" },
  { char: "◇", title: "菱形" },
  { char: "◎", title: "双圆" },
  { char: "※", title: "花号" },
  { char: "✓", title: "对勾" },
  { char: "✕", title: "叉" },
  { char: "→", title: "右箭头" },
  { char: "←", title: "左箭头" },
  { char: "↑", title: "上箭头" },
  { char: "↓", title: "下箭头" },
  { char: "♥", title: "心形" },
  { char: "✨", title: "闪光" },
  { char: "🔥", title: "火焰" },
  { char: "©", title: "版权" },
  { char: "®", title: "注册商标" },
  { char: "™", title: "商标" }
];

export type TextOverlayStyleInput = {
  fontSize: number;
  lineHeight: number;
  color: string;
  bold: boolean;
  italic: boolean;
  fontFamilyStack: string;
  strokeOn: boolean;
  strokeColor: string;
  strokeWidth: number;
  underline: boolean;
  underlineColor: string;
  underlineMatchText: boolean;
  skew: SkewMode;
};

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 生成可放入 HTML style="" 的字符串（双引号属性安全） */
export function buildInlineStyleAttribute(o: TextOverlayStyleInput): string {
  const parts: string[] = [];
  parts.push("display:inline-block");
  parts.push(`font-size:${o.fontSize}px`);
  parts.push(`line-height:${o.lineHeight}`);
  parts.push(`color:${o.color}`);
  parts.push(`font-weight:${o.bold ? "700" : "400"}`);
  parts.push(`font-style:${o.italic ? "italic" : "normal"}`);
  const ff = o.fontFamilyStack.replace(/"/g, "'");
  parts.push(`font-family:${ff}`);
  if (o.strokeOn && o.strokeWidth > 0) {
    parts.push(`-webkit-text-stroke:${o.strokeWidth}px ${o.strokeColor}`);
    parts.push("paint-order:stroke fill");
  }
  if (o.underline) {
    parts.push("text-decoration:underline");
    const uc = o.underlineMatchText || !o.underlineColor ? o.color : o.underlineColor;
    parts.push(`text-decoration-color:${uc}`);
  }
  if (o.skew === "left") parts.push(`transform:skewX(-${SKEW_DEG}deg)`);
  else if (o.skew === "right") parts.push(`transform:skewX(${SKEW_DEG}deg)`);
  parts.push("white-space:pre-wrap");
  return parts.map((p) => p.replace(/"/g, "'")).join(";");
}

/** 将纯文本包一层带内联样式的 span，插入文案区（预览需支持 HTML） */
export function wrapPlainTextAsStyledSpan(plain: string, o: TextOverlayStyleInput): string {
  const style = buildInlineStyleAttribute(o).replace(/"/g, "&quot;");
  return `<span style="${style}">${escapeHtmlText(plain)}</span>`;
}
