/**
 * 电商邮件助手：商品横排（table 行）BlockEmbed，Quill 不会拆成竖排 blockquote。
 * 须在首次 `new Quill()` 之前执行；由 EmailTemplatesPage 最先 import。
 */
import Quill from "quill";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill 1.3 无完整类型
const BlockEmbed = Quill.import("blots/block/embed") as any;

class EmailCommerceRowBlot extends BlockEmbed {
  static create(value: unknown) {
    const node = super.create() as HTMLDivElement;
    node.setAttribute("contenteditable", "false");
    node.classList.add("ql-email-commerce-row");
    const html = typeof value === "string" ? value.trim() : "";
    if (html) node.innerHTML = html;
    return node;
  }

  static value(domNode: HTMLElement) {
    return domNode.innerHTML;
  }
}

EmailCommerceRowBlot.blotName = "emailCommerceRow";
EmailCommerceRowBlot.className = "ql-email-commerce-row";
EmailCommerceRowBlot.tagName = "DIV";

Quill.register(EmailCommerceRowBlot, true);
