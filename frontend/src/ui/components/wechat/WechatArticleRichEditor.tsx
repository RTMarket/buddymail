import React, { useCallback, useEffect, useRef, useState } from "react";
import { buildWechatArticlePreviewHtml, buildWechatListHtml, buildWechatTableHtml, type WechatListStyle } from "../../../lib/wechatArticleHtml";
import { WECHAT_EDITOR_COMPONENTS } from "../../../lib/wechatOfficialComponents";
import {
  WechatImageInsertDialog,
  WechatLinkInsertDialog,
  WechatListInsertDialog,
  WechatTableInsertDialog,
  WechatVideoInsertDialog
} from "./WechatEditorMediaDialogs";

const EDITOR_SCROLL_CLASS =
  "max-h-[min(420px,50vh)] min-h-[280px] overflow-y-auto overflow-x-hidden rounded-md border border-slate-300 bg-white px-3 py-3 text-[15px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

const PREVIEW_SCROLL_CLASS =
  "max-h-[min(420px,50vh)] min-h-[280px] overflow-y-auto overflow-x-hidden rounded-md border border-slate-200 bg-slate-50/50 p-3 text-[15px] leading-relaxed text-slate-800";

function captureEditorSelection(editor: HTMLDivElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function restoreEditorSelection(editor: HTMLDivElement, saved: Range | null): Range | null {
  if (!saved) return null;
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return null;
  try {
    sel.removeAllRanges();
    sel.addRange(saved);
    return sel.getRangeAt(0);
  } catch {
    return null;
  }
}

function applyWechatLinkAttrs(a: HTMLAnchorElement) {
  a.target = "_blank";
  a.rel = "noopener noreferrer";
}

function insertLinkAtRange(editor: HTMLDivElement, range: Range, href: string, linkText: string) {
  const sel = window.getSelection();
  if (!sel) return;

  const style = "color:#059669;text-decoration:underline;";

  if (!range.collapsed) {
    const a = document.createElement("a");
    a.href = href;
    applyWechatLinkAttrs(a);
    a.setAttribute("style", style);
    try {
      range.surroundContents(a);
    } catch {
      const extracted = range.extractContents();
      a.appendChild(extracted);
      range.insertNode(a);
    }
    range.setStartAfter(a);
    range.collapse(true);
  } else {
    const a = document.createElement("a");
    a.href = href;
    applyWechatLinkAttrs(a);
    a.setAttribute("style", style);
    a.textContent = linkText.trim() || href;
    range.insertNode(a);
    range.setStartAfter(a);
    range.collapse(true);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

function insertHtmlAtCursor(editor: HTMLDivElement, html: string, savedRange?: Range | null) {
  const sel = window.getSelection();
  let range = savedRange && editor.contains(savedRange.commonAncestorContainer)
    ? savedRange
    : null;

  if (!range) {
    editor.focus();
    if (!sel) {
      editor.insertAdjacentHTML("beforeend", html);
      appendEditableParagraphAfter(editor, editor.lastElementChild);
      return;
    }
    if (sel.rangeCount === 0) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.addRange(range);
    } else {
      range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  } else {
    editor.focus();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  range.deleteContents();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const insertedNodes = Array.from(tpl.content.childNodes);
  const frag = document.createDocumentFragment();
  insertedNodes.forEach((node) => frag.appendChild(node));
  range.insertNode(frag);

  const anchor = insertedNodes[insertedNodes.length - 1] ?? null;
  const afterP = appendEditableParagraphAfter(editor, anchor);
  const caret = document.createRange();
  caret.selectNodeContents(afterP);
  caret.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(caret);
}

function appendEditableParagraphAfter(editor: HTMLDivElement, anchor: ChildNode | Element | null): HTMLParagraphElement {
  const afterP = document.createElement("p");
  afterP.innerHTML = "<br>";
  if (anchor && anchor.parentNode && editor.contains(anchor)) {
    anchor.parentNode.insertBefore(afterP, anchor.nextSibling);
  } else {
    editor.appendChild(afterP);
  }
  return afterP;
}

function replaceHtmlAtCursor(editor: HTMLDivElement, html: string, replaceNode?: HTMLElement | null) {
  if (replaceNode && editor.contains(replaceNode)) {
    replaceNode.outerHTML = html;
    return;
  }
  insertHtmlAtCursor(editor, html);
}

function exec(cmd: string, value?: string) {
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(cmd, false, value);
}

function execInEditor(editor: HTMLDivElement | null, cmd: string, value?: string) {
  if (!editor) return;
  editor.focus();
  exec(cmd, value);
}

function getSelectedText(): string {
  const sel = window.getSelection();
  return sel?.toString().trim() ?? "";
}

type TextAlign = "left" | "center" | "right" | "justify";

const FONT_OPTIONS = [
  { label: "默认字体", value: "" },
  { label: "微软雅黑", value: "Microsoft YaHei" },
  { label: "苹方", value: "PingFang SC" },
  { label: "宋体", value: "SimSun" },
  { label: "黑体", value: "SimHei" },
  { label: "楷体", value: "KaiTi" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" }
];

const FONT_SIZE_OPTIONS = [
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "15px", value: "15px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" }
];

const COLOR_OPTIONS = [
  "#111827",
  "#374151",
  "#64748b",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899"
];

const BACKGROUND_OPTIONS = [
  "#ffffff",
  "#f8fafc",
  "#fef3c7",
  "#ffedd5",
  "#dcfce7",
  "#dbeafe",
  "#ede9fe",
  "#fce7f3",
  "#fee2e2"
];

const EMOJI_OPTIONS = ["😀", "😊", "👍", "🎉", "✨", "🔥", "💡", "✅", "⭐", "❤️", "🙏", "📌"];

function applyInlineStyle(editor: HTMLDivElement, stylePatch: Partial<CSSStyleDeclaration>, savedRange?: Range | null) {
  const range = savedRange ? restoreEditorSelection(editor, savedRange) : captureEditorSelection(editor);
  if (!range) return false;
  editor.focus();

  const span = document.createElement("span");
  Object.assign(span.style, stylePatch);

  if (range.collapsed) {
    span.appendChild(document.createTextNode("\u200b"));
    range.insertNode(span);
    const caret = document.createRange();
    caret.setStart(span.firstChild ?? span, 1);
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
    return true;
  }

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  const caret = document.createRange();
  caret.setStartAfter(span);
  caret.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(caret);
  return true;
}

function collectBlocksInRange(editor: HTMLDivElement, range: Range): HTMLElement[] {
  const selector = "p, h1, h2, h3, li, blockquote, td, th";
  const blocks: HTMLElement[] = [];
  editor.querySelectorAll(selector).forEach((el) => {
    if (el instanceof HTMLElement && range.intersectsNode(el)) {
      blocks.push(el);
    }
  });
  if (blocks.length > 0) return blocks;

  editor.querySelectorAll(":scope > div").forEach((el) => {
    if (el instanceof HTMLElement && range.intersectsNode(el)) {
      blocks.push(el);
    }
  });
  return blocks;
}

function applyBlockAlign(editor: HTMLDivElement, align: TextAlign) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  const blocks = collectBlocksInRange(editor, range);
  if (blocks.length > 0) {
    blocks.forEach((el) => {
      el.style.textAlign = align;
    });
    return true;
  }

  const cmdMap: Record<TextAlign, string> = {
    left: "justifyLeft",
    center: "justifyCenter",
    right: "justifyRight",
    justify: "justifyFull"
  };
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(cmdMap[align], false);
  return true;
}

function saveSelectionOnMouseDown(
  e: React.MouseEvent,
  editorRef: React.RefObject<HTMLDivElement | null>,
  savedSelectionRef: React.MutableRefObject<Range | null>
) {
  e.preventDefault();
  const el = editorRef.current;
  if (el) savedSelectionRef.current = captureEditorSelection(el);
}

export function WechatArticleRichEditor(props: {
  editorKey: string;
  title: string;
  digest: string;
  coverPreviewUrl?: string;
  html: string;
  onChange: (html: string) => void;
  onFlushRef?: React.MutableRefObject<(() => string) | null>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastExternalHtml = useRef<string | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  const [dialog, setDialog] = useState<"image" | "link" | "video" | "list" | "table" | null>(null);
  const [replaceImg, setReplaceImg] = useState<HTMLImageElement | null>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [linkInitialText, setLinkInitialText] = useState("");
  const [listInitialLines, setListInitialLines] = useState("");
  const [previewBodyHtml, setPreviewBodyHtml] = useState(props.html?.trim() ? props.html : "<p><br></p>");

  const syncFromEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = el.innerHTML.trim() || "<p><br></p>";
    lastExternalHtml.current = next;
    onChangeRef.current(next);
    return next;
  }, []);

  useEffect(() => {
    if (props.onFlushRef) {
      props.onFlushRef.current = () => syncFromEditor() ?? props.html;
    }
    return () => {
      if (props.onFlushRef) props.onFlushRef.current = null;
    };
  }, [props.onFlushRef, syncFromEditor, props.html]);

  useEffect(() => {
    lastExternalHtml.current = null;
    setSelectedImg(null);
    setReplaceImg(null);
  }, [props.editorKey]);

  useEffect(() => {
    setPreviewBodyHtml(props.html?.trim() ? props.html : "<p><br></p>");
  }, [props.editorKey]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = props.html?.trim() ? props.html : "<p><br></p>";
    if (lastExternalHtml.current === incoming) return;
    const current = el.innerHTML.trim() || "<p><br></p>";
    if (current === incoming) {
      lastExternalHtml.current = incoming;
      return;
    }
    el.innerHTML = incoming;
    lastExternalHtml.current = incoming;
  }, [props.html, props.editorKey]);

  function insertComponent(html: string) {
    const el = editorRef.current;
    if (!el) return;
    insertHtmlAtCursor(el, html);
    syncFromEditor();
  }

  function insertLink(href: string, linkText: string) {
    const el = editorRef.current;
    if (!el) return;
    const saved = savedSelectionRef.current;
    savedSelectionRef.current = null;

    let range = saved ? restoreEditorSelection(el, saved) : null;
    if (!range) {
      el.focus();
      const sel = window.getSelection();
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    insertLinkAtRange(el, range, href, linkText);
    syncFromEditor();
  }

  function insertMediaHtml(html: string) {
    const el = editorRef.current;
    if (!el) return;
    replaceHtmlAtCursor(el, html, replaceImg);
    setReplaceImg(null);
    setSelectedImg(null);
    syncFromEditor();
  }

  function openListDialog() {
    const el = editorRef.current;
    if (el) savedSelectionRef.current = captureEditorSelection(el);
    const selected = getSelectedText();
    setListInitialLines(selected.includes("\n") ? selected : selected || "");
    setDialog("list");
  }

  function openTableDialog() {
    const el = editorRef.current;
    if (el) savedSelectionRef.current = captureEditorSelection(el);
    setDialog("table");
  }

  function insertList(lines: string[], listStyle: WechatListStyle) {
    const el = editorRef.current;
    if (!el) return;
    const saved = savedSelectionRef.current;
    savedSelectionRef.current = null;
    insertHtmlAtCursor(el, buildWechatListHtml(lines, listStyle), saved);
    syncFromEditor();
  }

  function insertTable(rows: number, cols: number) {
    const el = editorRef.current;
    if (!el) return;
    const saved = savedSelectionRef.current;
    savedSelectionRef.current = null;
    insertHtmlAtCursor(el, buildWechatTableHtml(rows, cols), saved);
    syncFromEditor();
  }

  function applyAlign(align: TextAlign) {
    const el = editorRef.current;
    if (!el) return;
    applyBlockAlign(el, align);
    syncFromEditor();
  }

  function applyStyle(stylePatch: Partial<CSSStyleDeclaration>) {
    const el = editorRef.current;
    if (!el) return;
    const saved = savedSelectionRef.current;
    savedSelectionRef.current = null;
    applyInlineStyle(el, stylePatch, saved);
    syncFromEditor();
  }

  function insertEmoji(emoji: string) {
    const el = editorRef.current;
    if (!el) return;
    insertHtmlAtCursor(el, emoji, savedSelectionRef.current);
    savedSelectionRef.current = null;
    syncFromEditor();
  }

  function openLinkDialog() {
    const el = editorRef.current;
    if (el) savedSelectionRef.current = captureEditorSelection(el);
    setLinkInitialText(getSelectedText());
    setDialog("link");
  }

  function openImageDialog(replace?: HTMLImageElement | null) {
    setReplaceImg(replace ?? null);
    setDialog("image");
  }

  function onEditorClick(e: React.MouseEvent) {
    const target = e.target;
    if (target instanceof HTMLAnchorElement && editorRef.current?.contains(target)) {
      e.preventDefault();
      if (target.href) window.open(target.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (!(target instanceof HTMLImageElement)) {
      setSelectedImg(null);
      return;
    }
    if (editorRef.current?.contains(target)) {
      setSelectedImg(target);
    }
  }

  function deleteSelectedImage() {
    if (!selectedImg) return;
    selectedImg.closest("p")?.remove();
    if (selectedImg.parentElement?.tagName === "P" && selectedImg.parentElement.childElementCount === 0) {
      selectedImg.parentElement.remove();
    } else {
      selectedImg.remove();
    }
    setSelectedImg(null);
    syncFromEditor();
  }

  function setSelectedImageWidth(pct: number) {
    if (!selectedImg) return;
    const width = Math.min(100, Math.max(40, Math.round(pct)));
    selectedImg.style.width = `${width}%`;
    selectedImg.style.maxWidth = "100%";
    selectedImg.dataset.width = String(width);
    syncFromEditor();
  }

  const selectedWidth = selectedImg ? Number(selectedImg.dataset.width ?? 100) : 100;
  const previewHtml = buildWechatArticlePreviewHtml(props.title, props.digest, previewBodyHtml, props.coverPreviewUrl);

  function saveEditorToPreview() {
    const next = syncFromEditor() ?? props.html;
    setPreviewBodyHtml(next?.trim() ? next : "<p><br></p>");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
        <span className="mr-1 text-[11px] font-medium text-slate-500">文字格式</span>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"
          title="字体"
          defaultValue=""
          onMouseDown={() => {
            const el = editorRef.current;
            if (el) savedSelectionRef.current = captureEditorSelection(el);
          }}
          onChange={(e) => {
            if (e.target.value) applyStyle({ fontFamily: e.target.value });
            e.currentTarget.value = "";
          }}
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"
          title="字号"
          defaultValue=""
          onMouseDown={() => {
            const el = editorRef.current;
            if (el) savedSelectionRef.current = captureEditorSelection(el);
          }}
          onChange={(e) => {
            if (e.target.value) applyStyle({ fontSize: e.target.value });
            e.currentTarget.value = "";
          }}
        >
          <option value="">字号</option>
          {FONT_SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button type="button" className="wechat-ed-btn" title="加粗" onMouseDown={(e) => e.preventDefault()} onClick={() => { execInEditor(editorRef.current, "bold"); syncFromEditor(); }}>
          加粗
        </button>
        <button type="button" className="wechat-ed-btn" title="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => { execInEditor(editorRef.current, "italic"); syncFromEditor(); }}>
          斜体
        </button>
        <button type="button" className="wechat-ed-btn" title="下划线" onMouseDown={(e) => e.preventDefault()} onClick={() => { execInEditor(editorRef.current, "underline"); syncFromEditor(); }}>
          下划线
        </button>
        <button type="button" className="wechat-ed-btn" title="删除线" onMouseDown={(e) => e.preventDefault()} onClick={() => { execInEditor(editorRef.current, "strikeThrough"); syncFromEditor(); }}>
          删除线
        </button>
        <label className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700" title="字体颜色">
          字色
          <select
            className="h-5 w-6 rounded border-0 bg-transparent p-0"
            defaultValue=""
            onMouseDown={() => {
              const el = editorRef.current;
              if (el) savedSelectionRef.current = captureEditorSelection(el);
            }}
            onChange={(e) => {
              if (e.target.value) applyStyle({ color: e.target.value });
              e.currentTarget.value = "";
            }}
          >
            <option value="">A</option>
            {COLOR_OPTIONS.map((color) => (
              <option key={color} value={color} style={{ color }}>{color}</option>
            ))}
          </select>
        </label>
        <label className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700" title="字体背景色">
          底色
          <select
            className="h-5 w-6 rounded border-0 bg-transparent p-0"
            defaultValue=""
            onMouseDown={() => {
              const el = editorRef.current;
              if (el) savedSelectionRef.current = captureEditorSelection(el);
            }}
            onChange={(e) => {
              if (e.target.value) applyStyle({ backgroundColor: e.target.value });
              e.currentTarget.value = "";
            }}
          >
            <option value="">■</option>
            {BACKGROUND_OPTIONS.map((color) => (
              <option key={color} value={color} style={{ backgroundColor: color }}>{color}</option>
            ))}
          </select>
        </label>
        <button type="button" className="wechat-ed-btn" title="清除格式" onMouseDown={(e) => e.preventDefault()} onClick={() => { execInEditor(editorRef.current, "removeFormat"); syncFromEditor(); }}>
          清除格式
        </button>
        <span className="mx-0.5 h-4 w-px bg-slate-300" />
        <button type="button" className="wechat-ed-btn" title="左对齐" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("left")}>左对齐</button>
        <button type="button" className="wechat-ed-btn" title="居中对齐" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("center")}>居中</button>
        <button type="button" className="wechat-ed-btn" title="右对齐" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("right")}>右对齐</button>
        <button type="button" className="wechat-ed-btn" title="两端对齐" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("justify")}>两端对齐</button>
        <span className="mx-0.5 h-4 w-px bg-slate-300" />
        <button
          type="button"
          className="wechat-ed-btn"
          title="序号或图形标记列表"
          onMouseDown={(e) => saveSelectionOnMouseDown(e, editorRef, savedSelectionRef)}
          onClick={openListDialog}
        >
          列表
        </button>
        <button
          type="button"
          className="wechat-ed-btn"
          title="插入表格"
          onMouseDown={(e) => saveSelectionOnMouseDown(e, editorRef, savedSelectionRef)}
          onClick={openTableDialog}
        >
          表格
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <span className="text-[11px] font-medium text-slate-500">媒体</span>
        <button type="button" className="wechat-ed-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => openImageDialog(null)}>
          插入图片
        </button>
        <button
          type="button"
          className="wechat-ed-btn"
          onMouseDown={(e) => {
            e.preventDefault();
            const el = editorRef.current;
            if (el) savedSelectionRef.current = captureEditorSelection(el);
          }}
          onClick={openLinkDialog}
        >
          公众号链接
        </button>
        <button type="button" className="wechat-ed-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setDialog("video")}>
          插入视频
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <span className="text-[11px] font-medium text-slate-500">表情</span>
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="wechat-ed-emoji-btn"
            title={`插入 ${emoji}`}
            onMouseDown={(e) => saveSelectionOnMouseDown(e, editorRef, savedSelectionRef)}
            onClick={() => insertEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      {selectedImg ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] text-sky-900">
          <span className="font-semibold">已选中图片</span>
          <label className="flex items-center gap-1">
            宽度 {selectedWidth}%
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={selectedWidth}
              onChange={(e) => setSelectedImageWidth(Number(e.target.value))}
            />
          </label>
          <button type="button" className="wechat-ed-btn" onClick={() => openImageDialog(selectedImg)}>替换</button>
          <button type="button" className="wechat-ed-btn wechat-ed-btn-danger" onClick={deleteSelectedImage}>删除</button>
          <button type="button" className="wechat-ed-btn" onClick={() => setSelectedImg(null)}>取消选中</button>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-600">排版组件（点击插入到光标位置，插入后直接改文字即可）</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WECHAT_EDITOR_COMPONENTS.map((c) => (
            <button
              key={c.key}
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50/40"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertComponent(c.html)}
            >
              <span className="block text-xs font-semibold text-slate-900">{c.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{c.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>正文编辑</span>
            <span className="font-normal text-slate-400">点击正文图片可调整宽度 / 替换 / 删除</span>
          </div>
          <div
            key={props.editorKey}
            ref={editorRef}
            className={EDITOR_SCROLL_CLASS}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline
            data-placeholder="在这里撰写公众号正文…"
            onInput={syncFromEditor}
            onBlur={syncFromEditor}
            onClick={onEditorClick}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>草稿预览</span>
            <button
              type="button"
              className="wechat-ed-btn wechat-ed-btn-primary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveEditorToPreview}
            >
              保存编辑到预览
            </button>
          </div>
          <div className={PREVIEW_SCROLL_CLASS} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>

      {dialog === "image" ? (
        <WechatImageInsertDialog
          replaceMode={Boolean(replaceImg)}
          onClose={() => { setDialog(null); setReplaceImg(null); }}
          onInsert={insertMediaHtml}
        />
      ) : null}
      {dialog === "link" ? (
        <WechatLinkInsertDialog
          initialText={linkInitialText}
          onClose={() => {
            setDialog(null);
            savedSelectionRef.current = null;
          }}
          onInsert={(href, text) => {
            insertLink(href, text);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "list" ? (
        <WechatListInsertDialog
          initialLines={listInitialLines}
          onClose={() => {
            setDialog(null);
            savedSelectionRef.current = null;
          }}
          onInsert={(lines, listStyle) => {
            insertList(lines, listStyle);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "table" ? (
        <WechatTableInsertDialog
          onClose={() => {
            setDialog(null);
            savedSelectionRef.current = null;
          }}
          onInsert={(rows, cols) => {
            insertTable(rows, cols);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "video" ? (
        <WechatVideoInsertDialog onClose={() => setDialog(null)} onInsert={insertMediaHtml} />
      ) : null}

      <style>{`
        .wechat-ed-btn {
          height: 28px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 600;
          color: #334155;
        }
        .wechat-ed-btn:hover { background: #f8fafc; }
        .wechat-ed-emoji-btn {
          display: inline-flex;
          height: 28px;
          min-width: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 0 6px;
          font-size: 15px;
        }
        .wechat-ed-emoji-btn:hover { background: #f8fafc; }
        .wechat-ed-btn-primary { background: #047857; border-color: #047857; color: #fff; }
        .wechat-ed-btn-primary:hover { background: #065f46; }
        .wechat-ed-btn-danger { color: #b91c1c; border-color: #fecaca; background: #fff1f2; }
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        [contenteditable] blockquote {
          margin: 18px 0;
          padding: 12px 16px;
          border-left: 4px solid #10b981;
          background: #f8fafc;
          color: #334155;
        }
        [contenteditable] h3 {
          font-size: 17px;
          font-weight: 700;
          margin: 16px 0 8px;
          color: #0f172a;
        }
        [contenteditable] ul {
          margin: 14px 0;
          padding-left: 28px;
        }
        [contenteditable] ol {
          margin: 14px 0;
          padding-left: 28px;
        }
        [contenteditable] li {
          margin: 6px 0;
        }
        [contenteditable] table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
          table-layout: fixed;
        }
        [contenteditable] td,
        [contenteditable] th {
          border: 1px solid #dfe6ee;
          padding: 8px 10px;
          vertical-align: top;
          min-height: 28px;
        }
        [contenteditable] img[data-wechat-img] {
          cursor: pointer;
          outline: 2px solid transparent;
          transition: outline-color 0.15s;
        }
        [contenteditable] img[data-wechat-img]:hover {
          outline-color: #38bdf8;
        }
      `}</style>
    </div>
  );
}
