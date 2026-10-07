import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFormUploadWithTimeout } from "../../../lib/api";
import { formatWechatClientError } from "../../../lib/wechatApiErrors";
import { computeWechatCoverPicCrops } from "../../../lib/wechatCoverPicCrop";
import {
  WECHAT_COVER_ASPECT_WIDE,
  WECHAT_COVER_EXPORT_WIDE_H,
  WECHAT_COVER_EXPORT_WIDE_W,
  coverAspectForMode,
  dataUrlFromBlob,
  exportWechatCoverBlob,
  exportWechatCoverSquareFromWideCrop,
  exportWechatCoverWideFromSquareCrop,
  exportWechatThumbSourceBlob,
  fileToDataUrl,
  initImageCropState,
  previewWechatCoverPair,
  type CoverCropState,
  type WechatCoverCropMode
} from "../../../lib/wechatCoverExport";
import { defaultCropViewportSize } from "../../../lib/wechatImageCrop";
import { WechatImageCropViewport } from "./WechatImageCropViewport";

export type WechatCoverChangePatch = {
  coverThumbMediaId?: string;
  coverPreviewUrl?: string;
  coverSquarePreviewUrl?: string;
  coverCropMode?: WechatCoverCropMode;
  coverPicCrop2351?: string;
  coverPicCrop11?: string;
};

type Props = {
  thumbMediaId?: string;
  previewUrl?: string;
  squarePreviewUrl?: string;
  cropMode?: WechatCoverCropMode;
  onChange: (patch: WechatCoverChangePatch) => void;
  disabled?: boolean;
};

function CoverPreviewPair(props: { wideUrl?: string; squareUrl?: string; compact?: boolean }) {
  if (!props.wideUrl && !props.squareUrl) return null;
  return (
    <div className={`grid gap-2 ${props.compact ? "grid-cols-2" : "sm:grid-cols-2"}`}>
      <div className="rounded-md border border-slate-200 bg-white p-2">
        <div className="mb-1 text-[10px] font-semibold text-slate-600">2.35:1 预览（头条列表）</div>
        <div className="overflow-hidden rounded border border-slate-100 bg-slate-50">
          {props.wideUrl ? (
            <img src={props.wideUrl} alt="2.35:1 封面预览" referrerPolicy="no-referrer" className="aspect-[2.35/1] w-full object-cover" />
          ) : (
            <div className="flex aspect-[2.35/1] items-center justify-center text-[10px] text-slate-400">暂无</div>
          )}
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-2">
        <div className="mb-1 text-[10px] font-semibold text-slate-600">1:1 预览（分享/会话）</div>
        <div className="mx-auto max-w-[140px] overflow-hidden rounded border border-slate-100 bg-slate-50">
          {props.squareUrl ? (
            <img src={props.squareUrl} alt="1:1 封面预览" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-[10px] text-slate-400">暂无</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WechatArticleCoverField(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CoverCropState | null>(null);
  const [cropMode, setCropMode] = useState<WechatCoverCropMode>(props.cropMode ?? "wide");
  const [livePreview, setLivePreview] = useState<{ wideUrl: string; squareUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const hasCover = Boolean(props.thumbMediaId && props.previewUrl);
  const editing = Boolean(cropSrc && crop);
  const editAspect = coverAspectForMode(cropMode);

  const pickFile = useCallback(() => {
    if (props.disabled) return;
    fileRef.current?.click();
  }, [props.disabled]);

  useEffect(() => {
    if (props.cropMode) setCropMode(props.cropMode);
  }, [props.cropMode]);

  useEffect(() => {
    if (!cropSrc) return;
    let cancelled = false;
    const { width, height } = defaultCropViewportSize(editAspect);
    void initImageCropState(cropSrc, width, height, "cover").then((state) => {
      if (!cancelled) setCrop(state);
    });
    return () => {
      cancelled = true;
    };
  }, [cropSrc, editAspect]);

  useEffect(() => {
    if (!cropSrc || !crop) {
      setLivePreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 10) return;
      void previewWechatCoverPair(cropSrc, crop, rect.width, rect.height, cropMode).then((pair) => {
        if (!cancelled) setLivePreview(pair);
      });
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cropSrc, crop, cropMode]);

  async function onFileSelected(file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      setErr("请选择 JPG / PNG 图片。");
      return;
    }
    setErr("");
    try {
      setCrop(null);
      setLivePreview(null);
      setCropSrc(await fileToDataUrl(file));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  function removeCover() {
    setCropSrc(null);
    setCrop(null);
    setLivePreview(null);
    props.onChange({
      coverThumbMediaId: undefined,
      coverPreviewUrl: undefined,
      coverSquarePreviewUrl: undefined,
      coverCropMode: undefined,
      coverPicCrop2351: undefined,
      coverPicCrop11: undefined
    });
    setErr("");
  }

  function switchCropMode(mode: WechatCoverCropMode) {
    if (mode === cropMode || !cropSrc) {
      setCropMode(mode);
      return;
    }
    setCropMode(mode);
    setCrop(null);
    setLivePreview(null);
  }

  async function uploadCover() {
    if (!cropSrc || !crop || !viewportRef.current) return;
    setBusy(true);
    setErr("");
    try {
      const rect = viewportRef.current.getBoundingClientRect();
      let wideBlob: Blob;
      let squareBlob: Blob;
      if (cropMode === "wide") {
        wideBlob = await exportWechatCoverBlob(cropSrc, crop, rect.width, rect.height, cropMode);
        squareBlob = await exportWechatCoverSquareFromWideCrop(cropSrc, crop, rect.width, rect.height);
      } else {
        squareBlob = await exportWechatCoverBlob(cropSrc, crop, rect.width, rect.height, cropMode);
        wideBlob = await exportWechatCoverWideFromSquareCrop(cropSrc, crop, rect.width, rect.height);
      }
      const thumbBlob = await exportWechatThumbSourceBlob(cropSrc);

      const fd = new FormData();
      fd.append("file", thumbBlob, "wechat-cover.jpg");
      const resp = await apiFormUploadWithTimeout<{ ok: boolean; thumbMediaId?: string; url?: string; message?: string }>(
        "/api/wechat-official/cover/upload",
        fd,
        90_000
      );
      if (!resp.ok || !resp.thumbMediaId) throw new Error(formatWechatClientError(resp.message || "封面上传失败"));

      const picCrops = await computeWechatCoverPicCrops(cropSrc, crop, rect.width, rect.height, cropMode);

      props.onChange({
        coverThumbMediaId: resp.thumbMediaId,
        coverPreviewUrl: await dataUrlFromBlob(wideBlob),
        coverSquarePreviewUrl: await dataUrlFromBlob(squareBlob),
        coverCropMode: cropMode,
        coverPicCrop2351: picCrops.picCrop2351,
        coverPicCrop11: picCrops.picCrop11
      });
      setCropSrc(null);
      setCrop(null);
      setLivePreview(null);
    } catch (e: unknown) {
      setErr(formatWechatClientError(String((e as Error)?.message ?? e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">文章封面</div>
          <div className="text-[11px] text-slate-500">
            与微信公众号一致：2.35:1（{WECHAT_COVER_EXPORT_WIDE_W}×{WECHAT_COVER_EXPORT_WIDE_H}）+ 1:1 方图；拖拽图片移动裁剪框
          </div>
        </div>
        {hasCover && !editing ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="wechat-cover-btn" disabled={props.disabled || busy} onClick={pickFile}>
              替换图片
            </button>
            <button type="button" className="wechat-cover-btn wechat-cover-btn-danger" disabled={props.disabled || busy} onClick={removeCover}>
              删除封面
            </button>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={(e) => {
          void onFileSelected(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {hasCover && !editing ? (
        <div className="space-y-2">
          <CoverPreviewPair wideUrl={props.previewUrl} squareUrl={props.squarePreviewUrl} />
          <div className="border-t border-slate-100 px-1 py-1.5 text-[10px] text-slate-500">
            已上传微信素材 ID：{props.thumbMediaId?.slice(0, 24)}…
          </div>
        </div>
      ) : editing && crop ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`wechat-cover-btn ${cropMode === "wide" ? "wechat-cover-btn-active" : ""}`}
              disabled={busy}
              onClick={() => switchCropMode("wide")}
            >
              2.35:1 裁剪框
            </button>
            <button
              type="button"
              className={`wechat-cover-btn ${cropMode === "square" ? "wechat-cover-btn-active" : ""}`}
              disabled={busy}
              onClick={() => switchCropMode("square")}
            >
              1:1 裁剪框
            </button>
          </div>
          <WechatImageCropViewport
            cropSrc={cropSrc!}
            crop={crop}
            onCropChange={setCrop}
            disabled={props.disabled || busy}
            aspectRatio={editAspect}
            viewportRef={viewportRef}
            hint="拖拽图片移动位置；切换 2.35:1 / 1:1 可调整不同展示比例的裁剪区域"
          />
          {livePreview ? (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-slate-600">封面效果预览（与公众号双比例一致）</div>
              <CoverPreviewPair wideUrl={livePreview.wideUrl} squareUrl={livePreview.squareUrl} compact />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="wechat-cover-btn wechat-cover-btn-primary" disabled={props.disabled || busy} onClick={() => void uploadCover()}>
              {busy ? "上传中…" : "确认封面并上传"}
            </button>
            <button
              type="button"
              className="wechat-cover-btn"
              disabled={busy}
              onClick={() => {
                setCropSrc(null);
                setCrop(null);
                setLivePreview(null);
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : cropSrc && !crop ? (
        <div className="py-6 text-center text-sm text-slate-500">正在加载裁剪预览…</div>
      ) : (
        <button
          type="button"
          disabled={props.disabled || busy}
          onClick={pickFile}
          className="flex w-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white py-8 text-sm text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/30"
        >
          <span className="font-medium text-slate-700">点击上传封面图</span>
          <span className="mt-1 text-[11px]">支持 JPG / PNG · 可切换 2.35:1 / 1:1 裁剪并双比例预览</span>
        </button>
      )}

      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}

      <style>{`
        .wechat-cover-btn {
          height: 32px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 0 12px;
          font-size: 11px;
          font-weight: 600;
          color: #334155;
        }
        .wechat-cover-btn:hover:not(:disabled) { background: #f8fafc; }
        .wechat-cover-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wechat-cover-btn-active {
          border-color: #047857;
          background: #ecfdf5;
          color: #047857;
        }
        .wechat-cover-btn-primary {
          background: #047857;
          border-color: #047857;
          color: #fff;
        }
        .wechat-cover-btn-primary:hover:not(:disabled) { background: #065f46; }
        .wechat-cover-btn-danger { color: #b91c1c; border-color: #fecaca; background: #fff1f2; }
      `}</style>
    </div>
  );
}
