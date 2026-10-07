/**
 * 为邮件正文 Quill 注册 HTML5 &lt;video&gt; 嵌入（本地/站内上传地址）。
 * 须在首次 `new Quill()` 之前执行；由 EmailTemplatesPage 最先 import 本模块。
 */
import Quill from "quill";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill 1.3 无完整类型
const BlockEmbed = Quill.import("blots/block/embed") as any;

const SIZE_ATTRS = ["width", "height"] as const;

class EmailHtmlVideoBlot extends BlockEmbed {
  static create(value: unknown) {
    const node = super.create() as HTMLVideoElement;
    const src = typeof value === "string" ? value.trim() : "";
    node.setAttribute("controls", "");
    node.setAttribute("playsinline", "true");
    node.setAttribute("preload", "metadata");
    if (src) node.setAttribute("src", src);
    node.setAttribute(
      "style",
      "display:block;max-width:100%;width:auto;height:auto;border-radius:6px;vertical-align:middle;background:#0f172a;"
    );
    return node;
  }

  static formats(domNode: HTMLElement) {
    const out: Record<string, string> = {};
    for (const a of SIZE_ATTRS) {
      const v = domNode.getAttribute(a);
      if (v) out[a] = v;
    }
    return out;
  }

  static value(domNode: HTMLElement) {
    return domNode.getAttribute("src") || "";
  }

  format(name: string, value: unknown) {
    if (name === "width" || name === "height") {
      const s = value != null && value !== false ? String(value).trim() : "";
      if (s) {
        this.domNode.setAttribute(name, s);
        const n = parseInt(s, 10);
        if (!Number.isNaN(n) && n > 0) {
          (this.domNode as HTMLVideoElement).style.setProperty(name, `${n}px`);
        }
        if (name === "width") {
          (this.domNode as HTMLVideoElement).style.setProperty("max-width", "none");
        }
      } else {
        this.domNode.removeAttribute(name);
        (this.domNode as HTMLVideoElement).style.removeProperty(name);
        if (name === "width") {
          (this.domNode as HTMLVideoElement).style.setProperty("max-width", "100%");
        }
      }
      return;
    }
    super.format(name, value);
  }
}

EmailHtmlVideoBlot.blotName = "emailHtmlVideo";
EmailHtmlVideoBlot.className = "ql-email-html-video";
EmailHtmlVideoBlot.tagName = "VIDEO";

Quill.register(EmailHtmlVideoBlot, true);
