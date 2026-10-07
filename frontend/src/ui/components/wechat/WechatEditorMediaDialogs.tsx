import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFormUploadWithTimeout, apiJson } from "../../../lib/api";
import { formatWechatClientError } from "../../../lib/wechatApiErrors";
import {
  isWechatPublishedArticleUrl,
  normalizeWechatArticleUrl,
  wechatArticleLinkHint
} from "../../../lib/wechatArticleLink";
import {
  CONTENT_IMAGE_ASPECT,
  buildWechatContentImageHtml,
  exportContentImageBlob,
  fileToDataUrl,
  initImageCropState,
  type CoverCropState
} from "../../../lib/wechatContentImageExport";
import { dataUrlFromBlob } from "../../../lib/wechatCoverExport";
import { defaultCropViewportSize } from "../../../lib/wechatImageCrop";
import {
  WECHAT_LIST_STYLE_OPTIONS,
  type WechatListStyle
} from "../../../lib/wechatArticleHtml";
import { WechatImageCropViewport } from "./WechatImageCropViewport";

type ModalShellProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

function ModalShell(props: ModalShellProps) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-950">{props.title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{props.children}</div>
        {props.footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{props.footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function WechatImageInsertDialog(props: {
  onClose: () => void;
  onInsert: (html: string) => void;
  replaceMode?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CoverCropState | null>(null);
  const [widthPct, setWidthPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickFile = useCallback(() => fileRef.current?.click(), []);

  useEffect(() => {
    if (!cropSrc) return;
    let cancelled = false;
    const { width, height } = defaultCropViewportSize(CONTENT_IMAGE_ASPECT);
    void initImageCropState(cropSrc, width, height, "contain").then((state) => {
      if (!cancelled) setCrop(state);
    });
    return () => {
      cancelled = true;
    };
  }, [cropSrc]);

  async function onFileSelected(file: File | null) {
    if (!file?.type.startsWith("image/")) {
      setErr("请选择 JPG / PNG 图片。");
      return;
    }
    setErr("");
    try {
      setCrop(null);
      setCropSrc(await fileToDataUrl(file));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  async function confirmUpload() {
    if (!cropSrc || !crop || !viewportRef.current) return;
    setBusy(true);
    setErr("");
    try {
      const rect = viewportRef.current.getBoundingClientRect();
      const blob = await exportContentImageBlob(cropSrc, crop, rect.width, rect.height);
      const previewSrc = await dataUrlFromBlob(blob);
      const fd = new FormData();
      fd.append("file", blob, "content.jpg");
      const resp = await apiFormUploadWithTimeout<{ ok: boolean; url?: string; message?: string }>(
        "/api/wechat-official/content/upload-image",
        fd,
        90_000
      );
      if (!resp.ok || !resp.url) throw new Error(formatWechatClientError(resp.message || "图片上传失败"));
      props.onInsert(buildWechatContentImageHtml(previewSrc, widthPct, resp.url));
      props.onClose();
    } catch (e: unknown) {
      setErr(formatWechatClientError(String((e as Error)?.message ?? e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={props.replaceMode ? "替换正文图片" : "插入正文图片（裁剪）"}
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="wechat-ed-btn" disabled={busy} onClick={props.onClose}>
            取消
          </button>
          {cropSrc && crop ? (
            <button type="button" className="wechat-ed-btn wechat-ed-btn-primary" disabled={busy} onClick={() => void confirmUpload()}>
              {busy ? "上传中…" : "确认并插入"}
            </button>
          ) : null}
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" onChange={(e) => { void onFileSelected(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {!cropSrc ? (
        <button type="button" onClick={pickFile} className="flex w-full flex-col items-center rounded-md border border-dashed border-slate-300 py-10 text-sm text-slate-600 hover:border-emerald-400">
          点击选择图片
        </button>
      ) : crop ? (
        <div className="space-y-3">
          <WechatImageCropViewport
            cropSrc={cropSrc}
            crop={crop}
            onCropChange={setCrop}
            disabled={busy}
            aspectRatio={CONTENT_IMAGE_ASPECT}
            viewportRef={viewportRef}
            hint="默认显示完整图片；放大可裁剪局部，缩小可看到更多背景"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="shrink-0">正文显示宽度 {widthPct}%</span>
            <input type="range" min={40} max={100} step={5} value={widthPct} className="w-full" onChange={(e) => setWidthPct(Number(e.target.value))} />
          </label>
          <button type="button" className="wechat-ed-btn" onClick={pickFile}>换一张</button>
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-slate-500">正在加载裁剪预览…</div>
      )}
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">图片会先上传到微信服务器（≤1MB），草稿箱中才能正常显示。</p>
      <DialogBtnStyles />
    </ModalShell>
  );
}

export function WechatLinkInsertDialog(props: {
  initialText?: string;
  onClose: () => void;
  onInsert: (href: string, text: string) => void;
}) {
  const [text, setText] = useState(props.initialText ?? "");
  const [href, setHref] = useState("https://mp.weixin.qq.com/s/");
  const [err, setErr] = useState("");

  function confirm() {
    const url = href.trim();
    if (!url || url === "https://" || url === "https://mp.weixin.qq.com/s/") {
      setErr("请粘贴完整的公众号文章链接。");
      return;
    }
    if (!isWechatPublishedArticleUrl(url)) {
      setErr("仅支持已发布的微信公众号文章链接（mp.weixin.qq.com/s/…）。外部链接同步后会被微信过滤。");
      return;
    }
    const normalized = normalizeWechatArticleUrl(url);
    props.onInsert(normalized, text);
    props.onClose();
  }

  return (
    <ModalShell
      title="插入公众号文章链接"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="wechat-ed-btn" onClick={props.onClose}>取消</button>
          <button type="button" className="wechat-ed-btn wechat-ed-btn-primary" onClick={confirm}>插入链接</button>
        </>
      }
    >
      <div className="space-y-2">
        <input className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="链接显示文字" value={text} onChange={(e) => setText(e.target.value)} />
        <input
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
          placeholder="https://mp.weixin.qq.com/s/..."
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setErr("");
          }}
        />
      </div>
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{wechatArticleLinkHint()}</p>
      <p className="mt-1 text-[11px] text-slate-400">可先选中正文文字再点「公众号链接」，会自动填入显示文字。</p>
      <DialogBtnStyles />
    </ModalShell>
  );
}

export function WechatListInsertDialog(props: {
  initialLines?: string;
  onClose: () => void;
  onInsert: (lines: string[], listStyle: WechatListStyle) => void;
}) {
  const [text, setText] = useState(
    props.initialLines?.trim() || "第一项\n第二项\n第三项"
  );
  const [listStyle, setListStyle] = useState<WechatListStyle>("upper-alpha");

  function confirm() {
    const lines = text
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    props.onInsert(lines, listStyle);
    props.onClose();
  }

  const orderedOptions = WECHAT_LIST_STYLE_OPTIONS.filter((o) => o.group === "ordered");
  const markerOptions = WECHAT_LIST_STYLE_OPTIONS.filter((o) => o.group === "marker");

  return (
    <ModalShell
      title="插入列表"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="wechat-ed-btn" onClick={props.onClose}>取消</button>
          <button type="button" className="wechat-ed-btn wechat-ed-btn-primary" onClick={confirm}>插入列表</button>
        </>
      }
    >
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        每行一条。可选序号（1 / ABC / 罗马）或图形标记（大圆点、小圆点、小黑点、方块），与微信公众号后台类似。
      </p>
      <label className="mb-2 block text-xs font-medium text-slate-700">
        列表样式
        <select
          className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
          value={listStyle}
          onChange={(e) => setListStyle(e.target.value as WechatListStyle)}
        >
          <optgroup label="序号">
            {orderedOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </optgroup>
          <optgroup label="图形标记">
            {markerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <textarea
        className="min-h-[140px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"第一项\n第二项\n第三项"}
      />
      <DialogBtnStyles />
    </ModalShell>
  );
}

/** @deprecated 使用 WechatListInsertDialog */
export const WechatOrderedListInsertDialog = WechatListInsertDialog;

export function WechatTableInsertDialog(props: {
  onClose: () => void;
  onInsert: (rows: number, cols: number) => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  function confirm() {
    props.onInsert(rows, cols);
    props.onClose();
  }

  return (
    <ModalShell
      title="插入表格"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="wechat-ed-btn" onClick={props.onClose}>取消</button>
          <button type="button" className="wechat-ed-btn wechat-ed-btn-primary" onClick={confirm}>插入表格</button>
        </>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        选择行数与列数，插入后可在每个单元格里直接输入或修改文字（与公众号后台表格类似）。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-700">
          行数
          <input
            type="number"
            min={1}
            max={12}
            className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
            value={rows}
            onChange={(e) => setRows(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="text-xs font-medium text-slate-700">
          列数
          <input
            type="number"
            min={1}
            max={8}
            className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
            value={cols}
            onChange={(e) => setCols(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">最多 12 行 × 8 列</p>
      <DialogBtnStyles />
    </ModalShell>
  );
}

export function WechatVideoInsertDialog(props: { onClose: () => void; onInsert: (html: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onInsertRef = useRef(props.onInsert);
  const onCloseRef = useRef(props.onClose);
  onInsertRef.current = props.onInsert;
  onCloseRef.current = props.onClose;
  const [title, setTitle] = useState("视频");
  const [busy, setBusy] = useState(false);
  const [mediaId, setMediaId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!mediaId || busy) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const resp = await apiJson<{ ok: boolean; ready?: boolean; statusMessage?: string; embedHtml?: string | null; message?: string }>(
          `/api/wechat-official/content/video-status?mediaId=${encodeURIComponent(mediaId)}`
        );
        if (cancelled) return;
        if (!resp.ok) throw new Error(formatWechatClientError(resp.message || "查询失败"));
        setStatusMsg(resp.statusMessage ?? "");
        if (resp.ready && resp.embedHtml) {
          onInsertRef.current(resp.embedHtml);
          onCloseRef.current();
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(formatWechatClientError(String((e as Error)?.message ?? e)));
      }
    };
    const id = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [mediaId, busy]);

  async function uploadVideo(file: File | null) {
    if (!file) return;
    if (!file.type.includes("mp4") && !file.name.toLowerCase().endsWith(".mp4")) {
      setErr("请上传 MP4 格式视频（≤10MB）。");
      return;
    }
    setBusy(true);
    setErr("");
    setStatusMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("title", title.trim() || "视频");
      const resp = await apiFormUploadWithTimeout<{ ok: boolean; mediaId?: string; message?: string }>(
        "/api/wechat-official/content/upload-video",
        fd,
        120_000
      );
      if (!resp.ok || !resp.mediaId) throw new Error(formatWechatClientError(resp.message || "视频上传失败"));
      setMediaId(resp.mediaId);
      setStatusMsg(resp.message ?? "视频已上传，等待微信转码…");
    } catch (e: unknown) {
      setErr(formatWechatClientError(String((e as Error)?.message ?? e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="插入视频" onClose={props.onClose} footer={<button type="button" className="wechat-ed-btn" onClick={props.onClose}>关闭</button>}>
      <div className="space-y-2">
        <input className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="视频标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input ref={fileRef} type="file" accept="video/mp4,.mp4" className="hidden" onChange={(e) => { void uploadVideo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <button type="button" className="wechat-ed-btn wechat-ed-btn-primary w-full" disabled={busy || Boolean(mediaId)} onClick={() => fileRef.current?.click()}>
          {busy ? "上传中…" : mediaId ? "已上传，转码中…" : "选择 MP4 并上传"}
        </button>
      </div>
      {statusMsg ? <p className="mt-2 text-xs text-emerald-700">{statusMsg}</p> : null}
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
        视频须先上传至微信素材库并转码；若草稿箱中无法播放，请在微信后台从素材库重新插入。
      </div>
      <DialogBtnStyles />
    </ModalShell>
  );
}

function DialogBtnStyles() {
  return (
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
      .wechat-ed-btn:hover:not(:disabled) { background: #f8fafc; }
      .wechat-ed-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .wechat-ed-btn-primary { background: #047857; border-color: #047857; color: #fff; }
      .wechat-ed-btn-primary:hover:not(:disabled) { background: #065f46; }
    `}</style>
  );
}
