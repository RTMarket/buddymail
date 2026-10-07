import Quill from "quill";

const HANDLE = 18;
const MIN_W = 48;
const ZOOM_STEP = 1.12;

export type QuillImageInteractOptions = {
  labels: {
    enlarge: string;
    shrink: string;
    crop: string;
    replace: string;
    cropTitle: string;
    cropCancel: string;
    cropConfirm: string;
    cropHint: string;
  };
  uploadBlob: (blob: Blob, filename: string) => Promise<string>;
  onHtmlChange?: () => void;
};

function imgWidth(img: HTMLImageElement): number {
  const w = img.offsetWidth || parseInt(img.style.width || "", 10);
  return Number.isFinite(w) && w > 0 ? w : img.naturalWidth || MIN_W;
}

function setImgWidth(img: HTMLImageElement, w: number) {
  const maxW = Math.max(MIN_W, w);
  img.style.width = `${maxW}px`;
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  if (img.hasAttribute("width")) img.removeAttribute("width");
  if (img.hasAttribute("height")) img.removeAttribute("height");
}

function removeNodeIfAttached(node: Node | null) {
  if (node?.parentNode) {
    node.parentNode.removeChild(node);
  }
}

function pickImageAtPoint(quill: Quill, e: MouseEvent): HTMLImageElement | null {
  const stack = document.elementsFromPoint(e.clientX, e.clientY);
  for (const el of stack) {
    if (!(el instanceof HTMLImageElement)) continue;
    if (!quill.root.contains(el)) continue;
    return el;
  }
  return null;
}

function imageInResizeZone(e: MouseEvent, img: HTMLImageElement): boolean {
  const r = img.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
  return e.clientX >= r.right - HANDLE && e.clientY >= r.bottom - HANDLE;
}

/** 同域 blob 加载裁剪源图，避免 crossOrigin 导致 /uploads/ 画布空白 */
async function loadCropSourceImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  const src = img.currentSrc || img.src;
  if (!src) throw new Error("missing image src");
  try {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin) {
      const res = await fetch(url.href, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const loaded = new Image();
          loaded.onload = () => resolve(loaded);
          loaded.onerror = () => reject(new Error("blob decode failed"));
          loaded.src = objectUrl;
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  } catch {
    /* 跨域或 fetch 失败时走 CORS 回退 */
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const loaded = new Image();
    loaded.crossOrigin = "anonymous";
    loaded.onload = () => resolve(loaded);
    loaded.onerror = () => reject(new Error("image load failed"));
    loaded.src = src;
  });
}

/**
 * 邮件正文 Quill：图片拖拽缩放、放大/缩小、裁剪、点击替换。
 * 不改 Snow 工具栏，见 emailQuillVideoResize.ts 同类做法。
 */
export function attachQuillImageInteract(quill: Quill, opts: QuillImageInteractOptions): () => void {
  const container = quill.container as HTMLElement;
  const savedPosition = container.style.position;
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const layer = document.createElement("div");
  layer.className = "ql-email-image-interact-layer";
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3;overflow:visible;";

  const toolbar = document.createElement("div");
  toolbar.className = "ql-email-image-toolbar";
  toolbar.style.cssText =
    "display:none;position:absolute;gap:4px;padding:4px;border-radius:6px;" +
    "background:rgba(15,23,42,0.92);box-shadow:0 2px 8px rgba(0,0,0,0.2);" +
    "pointer-events:auto;z-index:5;flex-wrap:wrap;max-width:220px;";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.title = "拖拽调整图片宽度";
  handle.style.cssText =
    "display:none;position:absolute;width:18px;height:18px;padding:0;margin:0;" +
    "border:none;border-radius:4px;pointer-events:auto;cursor:nwse-resize;" +
    "background:rgba(217,119,6,0.92);box-shadow:0 1px 3px rgba(0,0,0,0.25);z-index:4;";

  function mkBtn(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText =
      "border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;" +
      "background:#fff;color:#0f172a;white-space:nowrap;";
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const replaceInput = document.createElement("input");
  replaceInput.type = "file";
  replaceInput.accept = "image/*";
  replaceInput.style.display = "none";
  document.body.appendChild(replaceInput);

  let activeImg: HTMLImageElement | null = null;
  let drag: { img: HTMLImageElement; startX: number; startW: number } | null = null;
  let cropOverlay: HTMLElement | null = null;

  function notifyChange() {
    opts.onHtmlChange?.();
  }

  function maxImgWidth(): number {
    return Math.max(MIN_W, Math.round(quill.root.getBoundingClientRect().width - 8));
  }

  function placeToolbar(img: HTMLImageElement | null) {
    if (!img) {
      toolbar.style.display = "none";
      activeImg = null;
      return;
    }
    activeImg = img;
    const cr = container.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const left = Math.max(4, ir.left - cr.left);
    const top = Math.max(4, ir.top - cr.top - 36);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.style.display = "flex";
  }

  function placeHandle(img: HTMLImageElement | null) {
    if (!img) {
      handle.style.display = "none";
      return;
    }
    const cr = container.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    handle.style.left = `${Math.max(0, ir.right - cr.left - HANDLE)}px`;
    handle.style.top = `${Math.max(0, ir.bottom - cr.top - HANDLE)}px`;
    handle.style.display = "block";
  }

  function selectImage(img: HTMLImageElement | null) {
    placeToolbar(img);
    placeHandle(img);
  }

  function zoomImage(img: HTMLImageElement, factor: number) {
    const w = Math.min(maxImgWidth(), Math.max(MIN_W, Math.round(imgWidth(img) * factor)));
    setImgWidth(img, w);
    notifyChange();
    placeHandle(img);
    placeToolbar(img);
  }

  async function replaceImageFile(img: HTMLImageElement, file: File) {
    const up = await opts.uploadBlob(file, file.name || "replace.jpg");
    img.src = up;
    notifyChange();
    selectImage(img);
  }

  function openCropModal(img: HTMLImageElement) {
    if (cropOverlay) return;
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);" +
      "display:flex;align-items:center;justify-content:center;padding:16px;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "background:#fff;border-radius:10px;padding:12px;max-width:min(92vw,720px);" +
      "max-height:90vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);";
    const title = document.createElement("p");
    title.textContent = opts.labels.cropTitle;
    title.style.cssText = "margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;";
    const hint = document.createElement("p");
    hint.textContent = opts.labels.cropHint;
    hint.style.cssText = "margin:0 0 8px;font-size:12px;color:#64748b;";
    const status = document.createElement("p");
    status.textContent = "加载图片中…";
    status.style.cssText = "margin:0 0 8px;font-size:12px;color:#64748b;";
    const stage = document.createElement("div");
    stage.style.cssText = "position:relative;display:inline-block;user-select:none;";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;cursor:crosshair;touch-action:none;";
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;border:2px solid #d97706;background:rgba(217,119,6,0.15);" +
      "pointer-events:none;display:none;";
    stage.appendChild(canvas);
    stage.appendChild(box);
    const actions = document.createElement("div");
    actions.style.cssText = "margin-top:10px;display:flex;gap:8px;justify-content:flex-end;";
    const cancelBtn = mkBtn(opts.labels.cropCancel, () => closeCrop());
    const okBtn = mkBtn(opts.labels.cropConfirm, () => void confirmCrop());
    okBtn.style.background = "#d97706";
    okBtn.style.color = "#fff";
    okBtn.disabled = true;
    okBtn.style.opacity = "0.55";
    okBtn.style.cursor = "not-allowed";
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(status);
    panel.appendChild(stage);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    cropOverlay = overlay;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      closeCrop();
      return;
    }
    const ctx = ctx2d;

    let source: HTMLImageElement | null = null;
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let crop = { x: 0, y: 0, w: 0, h: 0 };
    let displayScale = 1;

    function closeCrop() {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      removeNodeIfAttached(overlay);
      cropOverlay = null;
    }

    function enableOk() {
      okBtn.disabled = false;
      okBtn.style.opacity = "1";
      okBtn.style.cursor = "pointer";
    }

    function fitCanvasSize(naturalW: number, naturalH: number): { cw: number; ch: number; scale: number } {
      const maxW = Math.min(680, window.innerWidth - 80);
      const maxH = Math.min(520, window.innerHeight - 160);
      const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
      return {
        cw: Math.max(1, Math.round(naturalW * scale)),
        ch: Math.max(1, Math.round(naturalH * scale)),
        scale
      };
    }

    function redrawBase() {
      if (!source) return;
      const { cw, ch, scale } = fitCanvasSize(source.naturalWidth, source.naturalHeight);
      displayScale = scale;
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.drawImage(source, 0, 0, cw, ch);
      crop = { x: 0, y: 0, w: 0, h: 0 };
      updateBox();
    }

    async function confirmCrop() {
      if (!source || okBtn.disabled || crop.w < 8 || crop.h < 8) {
        closeCrop();
        return;
      }
      const out = document.createElement("canvas");
      const srcX = crop.x / displayScale;
      const srcY = crop.y / displayScale;
      const srcW = crop.w / displayScale;
      const srcH = crop.h / displayScale;
      out.width = Math.max(1, Math.round(srcW));
      out.height = Math.max(1, Math.round(srcH));
      const octx = out.getContext("2d");
      if (!octx) {
        closeCrop();
        return;
      }
      octx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.92));
      if (!blob) {
        closeCrop();
        return;
      }
      try {
        const url = await opts.uploadBlob(blob, `crop-${Date.now()}.jpg`);
        img.src = url;
        notifyChange();
        selectImage(img);
      } finally {
        closeCrop();
      }
    }

    function updateBox() {
      if (crop.w < 2 || crop.h < 2) {
        box.style.display = "none";
        return;
      }
      box.style.display = "block";
      box.style.left = `${crop.x}px`;
      box.style.top = `${crop.y}px`;
      box.style.width = `${crop.w}px`;
      box.style.height = `${crop.h}px`;
    }

    function pointerPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const cx = "touches" in e ? e.touches[0]!.clientX : e.clientX;
      const cy = "touches" in e ? e.touches[0]!.clientY : e.clientY;
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
    }

    function onDown(e: MouseEvent | TouchEvent) {
      if (!source || okBtn.disabled) return;
      e.preventDefault();
      drawing = true;
      const p = pointerPos(e);
      startX = p.x;
      startY = p.y;
      crop = { x: p.x, y: p.y, w: 0, h: 0 };
      updateBox();
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if (!drawing) return;
      const p = pointerPos(e);
      const x = Math.min(startX, p.x);
      const y = Math.min(startY, p.y);
      const w = Math.abs(p.x - startX);
      const h = Math.abs(p.y - startY);
      crop = { x, y, w, h };
      updateBox();
    }

    function onUp() {
      drawing = false;
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCrop();
    });

    void loadCropSourceImage(img)
      .then((loaded) => {
        source = loaded;
        status.textContent = "";
        status.style.display = "none";
        redrawBase();
        enableOk();
      })
      .catch(() => {
        status.textContent = "图片加载失败，请关闭后重试。";
        status.style.color = "#dc2626";
      });
  }

  toolbar.appendChild(
    mkBtn(opts.labels.enlarge, () => {
      if (activeImg) zoomImage(activeImg, ZOOM_STEP);
    })
  );
  toolbar.appendChild(
    mkBtn(opts.labels.shrink, () => {
      if (activeImg) zoomImage(activeImg, 1 / ZOOM_STEP);
    })
  );
  toolbar.appendChild(
    mkBtn(opts.labels.crop, () => {
      if (activeImg) openCropModal(activeImg);
    })
  );
  toolbar.appendChild(
    mkBtn(opts.labels.replace, () => {
      if (!activeImg) return;
      const target = activeImg;
      replaceInput.onchange = () => {
        const file = replaceInput.files?.[0];
        replaceInput.value = "";
        if (file) void replaceImageFile(target, file);
      };
      replaceInput.click();
    })
  );

  layer.appendChild(toolbar);
  layer.appendChild(handle);
  container.appendChild(layer);

  function onEditorClick(e: MouseEvent) {
    const img = pickImageAtPoint(quill, e);
    if (img) {
      e.preventDefault();
      selectImage(img);
      return;
    }
    if (!(e.target instanceof HTMLElement) || !toolbar.contains(e.target)) {
      selectImage(null);
    }
  }

  function onEditorMouseMove(e: MouseEvent) {
    if (drag) return;
    const img = pickImageAtPoint(quill, e);
    if (img && imageInResizeZone(e, img)) {
      placeHandle(img);
      if (activeImg === img) placeToolbar(img);
    } else if (!activeImg) {
      placeHandle(null);
    }
  }

  function onHandleMouseDown(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const img = activeImg ?? pickImageAtPoint(quill, e);
    if (!img) return;
    drag = { img, startX: e.clientX, startW: imgWidth(img) };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (!drag) return;
    e.preventDefault();
    const dw = e.clientX - drag.startX;
    const w = Math.min(maxImgWidth(), Math.max(MIN_W, Math.round(drag.startW + dw)));
    setImgWidth(drag.img, w);
    placeHandle(drag.img);
    placeToolbar(drag.img);
  }

  function onWindowMouseUp() {
    if (!drag) return;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    drag = null;
    notifyChange();
  }

  function onScroll() {
    if (activeImg) {
      placeHandle(activeImg);
      placeToolbar(activeImg);
    }
  }

  quill.root.addEventListener("click", onEditorClick);
  quill.root.addEventListener("mousemove", onEditorMouseMove);
  quill.root.addEventListener("scroll", onScroll, { passive: true });
  handle.addEventListener("mousedown", onHandleMouseDown);
  window.addEventListener("mousemove", onWindowMouseMove, true);
  window.addEventListener("mouseup", onWindowMouseUp, true);

  return () => {
    quill.root.removeEventListener("click", onEditorClick);
    quill.root.removeEventListener("mousemove", onEditorMouseMove);
    quill.root.removeEventListener("scroll", onScroll);
    handle.removeEventListener("mousedown", onHandleMouseDown);
    window.removeEventListener("mousemove", onWindowMouseMove, true);
    window.removeEventListener("mouseup", onWindowMouseUp, true);
    removeNodeIfAttached(replaceInput);
    removeNodeIfAttached(cropOverlay);
    removeNodeIfAttached(layer);
    container.style.position = savedPosition;
  };
}
