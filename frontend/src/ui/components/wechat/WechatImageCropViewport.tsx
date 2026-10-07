import React, { useEffect, useRef, useState } from "react";
import { loadImage } from "../../../lib/wechatCoverExport";
import {
  computeDrawRect,
  CROP_SCALE_MAX,
  CROP_SCALE_MIN,
  type ImageCropState
} from "../../../lib/wechatImageCrop";

type Props = {
  cropSrc: string;
  crop: ImageCropState;
  onCropChange: (next: ImageCropState) => void;
  disabled?: boolean;
  aspectRatio: number;
  viewportRef: React.RefObject<HTMLDivElement>;
  hint?: string;
};

export function WechatImageCropViewport(props: Props) {
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [layout, setLayout] = useState({ drawW: 0, drawH: 0, sx: 0, sy: 0 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const img = await loadImage(props.cropSrc);
      const el = props.viewportRef.current;
      if (!el || cancelled) return;
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const rect = computeDrawRect(props.crop, img.width, img.height, vw, vh);
      setLayout(rect);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.cropSrc, props.crop, props.viewportRef]);

  function onPointerDown(e: React.PointerEvent) {
    if (props.disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: props.crop.offsetX, oy: props.crop.offsetY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    props.onCropChange({
      ...props.crop,
      offsetX: d.ox + (e.clientX - d.startX),
      offsetY: d.oy + (e.clientY - d.startY)
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="space-y-2">
      <div
        ref={props.viewportRef}
        className="relative mx-auto w-full cursor-grab overflow-hidden rounded-md border border-emerald-200 bg-neutral-900 active:cursor-grabbing"
        style={{ aspectRatio: `${props.aspectRatio}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {layout.drawW > 0 ? (
          <img
            src={props.cropSrc}
            alt=""
            draggable={false}
            className="absolute select-none"
            style={{
              left: layout.sx,
              top: layout.sy,
              width: layout.drawW,
              height: layout.drawH
            }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-emerald-400/80" />
        <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          框内为最终裁剪区域
        </div>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="shrink-0">缩小 ← 缩放 → 放大</span>
        <input
          type="range"
          min={CROP_SCALE_MIN}
          max={CROP_SCALE_MAX}
          step={0.02}
          value={props.crop.scale}
          disabled={props.disabled}
          className="min-w-[140px] flex-1"
          onChange={(e) => props.onCropChange({ ...props.crop, scale: Number(e.target.value) })}
        />
        <span className="text-[11px] text-slate-400">{Math.round(props.crop.scale * 100)}%</span>
      </label>
      {props.hint ? <p className="text-[11px] text-slate-400">{props.hint}</p> : null}
    </div>
  );
}

export function CropScaleSlider(props: {
  crop: ImageCropState;
  onCropChange: (next: ImageCropState) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span className="shrink-0">缩小 ← 缩放 → 放大</span>
      <input
        type="range"
        min={CROP_SCALE_MIN}
        max={CROP_SCALE_MAX}
        step={0.02}
        value={props.crop.scale}
        disabled={props.disabled}
        className="min-w-[140px] flex-1"
        onChange={(e) => props.onCropChange({ ...props.crop, scale: Number(e.target.value) })}
      />
      <span className="text-[11px] text-slate-400">{Math.round(props.crop.scale * 100)}%</span>
    </label>
  );
}
