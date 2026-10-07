/**
 * 邮件正文 / 签名档共用富文本编辑器（Snow 工具栏）
 * 硬性锁定：未经需求方明确允许，禁止改动 Quill 初始化、theme、modules、formats、卸载与工具栏相关逻辑。
 * 见 .cursor/rules/email-template-quill-toolbar-lock.mdc
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Quill from "quill";
import {
  buildEmailTemplateQuillModules,
  EMAIL_QUILL_FORMATS_ARR
} from "./emailTemplateQuillConfig";

/** Quill 1.3 运行时必有 container；官方包无完整 TS 声明 */
type QuillEditorInstance = Quill & { container: HTMLElement };

const SOURCE_SILENT = "silent";

export type EmailTemplateQuillFieldHandle = { getEditor: () => Quill };

export type EmailTemplateQuillFieldProps = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  /** 工具栏「图片」按钮：触发本页隐藏 file input */
  triggerImagePicker: () => void;
  /** 在 Snow 工具栏末尾挂载扩展行（如正文翻译）；卸载时自动移除 */
  onToolbarExtensionMount?: (host: HTMLDivElement) => void;
};

/**
 * 使用原生 Quill 在 useEffect 内挂载，避免 react-quill 在 React 18 Strict Mode 下工具栏丢失等问题。
 * 工具栏插在容器子节点前，卸载时移除 .ql-toolbar 并清空编辑根节点。
 */
export const EmailTemplateQuillField = forwardRef<EmailTemplateQuillFieldHandle, EmailTemplateQuillFieldProps>(
  function EmailTemplateQuillField(props, ref) {
    const editorHostRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<Quill | null>(null);
    const onChangeRef = useRef(props.onChange);
    onChangeRef.current = props.onChange;
    const triggerImageRef = useRef(props.triggerImagePicker);
    triggerImageRef.current = props.triggerImagePicker;

    const onToolbarExtensionMountRef = useRef(props.onToolbarExtensionMount);
    onToolbarExtensionMountRef.current = props.onToolbarExtensionMount;

    useImperativeHandle(
      ref,
      () => ({
        getEditor: () => {
          const q = quillRef.current;
          if (!q) throw new Error("Quill 尚未就绪");
          return q;
        }
      }),
      []
    );

    useEffect(() => {
      const host = editorHostRef.current;
      if (!host) return;

      const quill = new Quill(host, {
        theme: "snow",
        modules: buildEmailTemplateQuillModules(() => triggerImageRef.current()),
        formats: EMAIL_QUILL_FORMATS_ARR
      }) as QuillEditorInstance;
      quillRef.current = quill;

      quill.on("text-change", () => {
        onChangeRef.current(quill.root.innerHTML);
      });

      const toolbarRoot = quill.container.parentElement;
      toolbarRoot
        ?.querySelector<HTMLElement>(".ql-picker.ql-color")
        ?.setAttribute("title", "字体颜色");
      toolbarRoot
        ?.querySelector<HTMLElement>(".ql-picker.ql-background")
        ?.setAttribute("title", "背景色");

      let translateHost: HTMLDivElement | null = null;
      if (toolbarRoot) {
        translateHost = document.createElement("div");
        translateHost.className = "ql-formats bss-quill-translate-toolbar";
        toolbarRoot.appendChild(translateHost);
        onToolbarExtensionMountRef.current?.(translateHost);
      }

      const html = props.value?.trim() ? props.value : "<p><br></p>";
      quill.clipboard.dangerouslyPasteHTML(html, SOURCE_SILENT);

      return () => {
        quillRef.current = null;
        const container = quill.container;
        const parent = container.parentElement;
        if (parent) {
          const tb = parent.querySelector(":scope > .ql-toolbar");
          tb?.remove();
        }
        translateHost?.remove();
        delete (container as HTMLElement & { __quill?: Quill }).__quill;
        container.classList.remove("ql-container", "ql-snow", "ql-disabled");
        container.removeAttribute("data-gramm");
        container.innerHTML = "";
      };
      // 仅挂载一次；切换模版用父级 key 强制重建
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const q = quillRef.current as QuillEditorInstance | null;
      if (!q) return;
      const next = props.value ?? "";
      if (next === q.root.innerHTML) return;
      q.clipboard.dangerouslyPasteHTML(next.trim() ? next : "<p><br></p>", SOURCE_SILENT);
    }, [props.value]);

    return (
      <div className={props.className ? `quill ${props.className}` : "quill"}>
        <div ref={editorHostRef} />
      </div>
    );
  }
);
