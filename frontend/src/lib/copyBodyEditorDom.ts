function selectionInsideEditor(editor: HTMLElement, node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  return Boolean(el && editor.contains(el));
}

/** 在文案编辑区当前选区插入片段（可替换选区）；支持多行纯文本与 HTML 片段 */
export function insertSnippetInCopyEditor(editor: HTMLElement, snippet: string): void {
  editor.focus();
  const sel = window.getSelection();
  let range: Range;
  if (sel && sel.rangeCount > 0 && selectionInsideEditor(editor, sel.anchorNode)) {
    range = sel.getRangeAt(0);
    range.deleteContents();
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  const trim = snippet.trim();
  const asHtml = /<[a-z][\s/>]/i.test(trim);

  if (asHtml) {
    const tpl = document.createElement("template");
    tpl.innerHTML = trim;
    const frag = document.createDocumentFragment();
    while (tpl.content.firstChild) frag.appendChild(tpl.content.firstChild);
    range.insertNode(frag);
    const last = frag.lastChild;
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
    }
  } else {
    const lines = snippet.split("\n");
    const frag = document.createDocumentFragment();
    lines.forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement("br"));
      frag.appendChild(document.createTextNode(line));
    });
    range.insertNode(frag);
    const last = frag.lastChild;
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
    }
  }

  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** 用 before/after 包裹当前选中文本（字面量，如 Markdown **） */
export function wrapSelectionTextInCopyEditor(editor: HTMLElement, before: string, after: string): boolean {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !selectionInsideEditor(editor, sel.anchorNode)) return false;
  const r = sel.getRangeAt(0);
  if (r.collapsed) return false;
  const t = r.toString();
  r.deleteContents();
  const node = document.createTextNode(before + t + after);
  r.insertNode(node);
  const nr = document.createRange();
  nr.setStart(node, before.length);
  nr.setEnd(node, before.length + t.length);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}

/** 不可包在 &lt;span&gt; 内的块级标签（否则浏览器会拆 DOM，中文段落常丢样式） */
const FONT_BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
  "FIGURE",
  "HEADER",
  "FOOTER",
  "NAV",
  "ASIDE",
  "UL",
  "OL"
]);

function isFontBlockElement(el: Element): boolean {
  return FONT_BLOCK_TAGS.has(el.tagName.toUpperCase());
}

function setFontFamilyImportant(el: HTMLElement, stack: string) {
  el.style.setProperty("font-family", stack, "important");
}

/**
 * 将完整 font-family 栈（与「加文字」FONT_CHOICES 一致）套到当前选区。
 * 选区含块级节点时直接写在 &lt;p&gt;/&lt;li&gt; 等上；纯行内片段用 &lt;span&gt;。
 * 使用 !important 避免与 Tailwind / 继承字体抢中文显示。
 * 折叠选区时在光标处插入零宽占位以便后续输入沿用该字体。
 */
export function applyFontFamilyToSelectionInCopyEditor(editor: HTMLElement, fontFamilyStack: string): boolean {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !selectionInsideEditor(editor, sel.anchorNode)) {
    alert("请先在下方文案编辑区内点击或选中文字。");
    return false;
  }
  const r = sel.getRangeAt(0);

  if (r.collapsed) {
    const span = document.createElement("span");
    setFontFamilyImportant(span, fontFamilyStack);
    const z = document.createTextNode("\u200b");
    span.appendChild(z);
    r.insertNode(span);
    r.setStart(z, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }

  const frag = r.extractContents();
  const top = Array.from(frag.childNodes);
  const hasTopLevelBlock = top.some(
    (n) => n.nodeType === Node.ELEMENT_NODE && isFontBlockElement(n as Element)
  );

  if (hasTopLevelBlock) {
    for (const n of top) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        setFontFamilyImportant(n as HTMLElement, fontFamilyStack);
      } else if (n.nodeType === Node.TEXT_NODE && n.textContent?.replace(/\s/g, "").length) {
        const sp = document.createElement("span");
        setFontFamilyImportant(sp, fontFamilyStack);
        frag.insertBefore(sp, n);
        sp.appendChild(n);
      }
    }
    r.insertNode(frag);
    return true;
  }

  const span = document.createElement("span");
  setFontFamilyImportant(span, fontFamilyStack);
  while (frag.firstChild) span.appendChild(frag.firstChild);
  r.insertNode(span);
  const nr = document.createRange();
  nr.selectNodeContents(span);
  nr.collapse(false);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}

export function applyInlineCommandInCopyEditor(editor: HTMLElement, command: "bold" | "italic"): boolean {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || !selectionInsideEditor(editor, sel.anchorNode)) {
    alert("请先在下方文案编辑区内点击，将光标放在要编辑的位置。");
    return false;
  }
  const ok = document.execCommand(command, false);
  if (!ok) {
    alert("当前浏览器无法应用该格式，请换用 Chrome / Edge / Safari 最新版再试。");
    return false;
  }
  return true;
}

export function insertBrAtSelectionInCopyEditor(editor: HTMLElement): void {
  editor.focus();
  const sel = window.getSelection();
  let range: Range;
  if (sel && sel.rangeCount > 0 && selectionInsideEditor(editor, sel.anchorNode)) {
    range = sel.getRangeAt(0);
    range.deleteContents();
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const br = document.createElement("br");
  range.insertNode(br);
  range.setStartAfter(br);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}
