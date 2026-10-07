import Quill from "quill";

const HANDLE = 18;
const MIN_W = 120;

function removeNodeIfAttached(node: Node | null) {
  if (node?.parentNode) {
    node.parentNode.removeChild(node);
  }
}

/**
 * 邮件正文 Quill：在编辑器内为 `.ql-email-html-video` 提供右下角拖拽缩放（同步到 embed 的 width 格式）。
 */
export function attachQuillVideoResize(quill: Quill): () => void {
  const container = quill.container as HTMLElement;
  const savedPosition = container.style.position;
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const layer = document.createElement("div");
  layer.className = "ql-email-html-video-resize-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:3;overflow:visible;";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "ql-email-html-video-resize-handle";
  handle.title = "拖拽调整视频显示宽度";
  handle.style.cssText =
    "display:none;position:absolute;width:18px;height:18px;padding:0;margin:0;" +
    "border:none;border-radius:4px;pointer-events:auto;cursor:nwse-resize;" +
    "background:rgba(124,58,237,0.92);box-shadow:0 1px 3px rgba(0,0,0,0.25);z-index:4;";

  layer.appendChild(handle);
  container.appendChild(layer);

  let hoverVideo: HTMLVideoElement | null = null;
  let drag: { video: HTMLVideoElement; startX: number; startW: number } | null = null;

  function videoInResizeZone(e: MouseEvent, v: HTMLVideoElement): boolean {
    const r = v.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
    return e.clientX >= r.right - HANDLE && e.clientY >= r.bottom - HANDLE;
  }

  function pickVideoAtPoint(e: MouseEvent): HTMLVideoElement | null {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of stack) {
      if (!(el instanceof HTMLVideoElement) || !el.classList.contains("ql-email-html-video")) continue;
      if (!quill.root.contains(el)) continue;
      if (videoInResizeZone(e, el)) return el;
    }
    return null;
  }

  function maxVideoWidth(): number {
    return Math.max(MIN_W, Math.round(quill.root.getBoundingClientRect().width - 8));
  }

  function placeHandle(v: HTMLVideoElement | null) {
    if (!v) {
      handle.style.display = "none";
      hoverVideo = null;
      return;
    }
    hoverVideo = v;
    const cr = container.getBoundingClientRect();
    const vr = v.getBoundingClientRect();
    const left = vr.right - cr.left - HANDLE;
    const top = vr.bottom - cr.top - HANDLE;
    handle.style.left = `${Math.max(0, left)}px`;
    handle.style.top = `${Math.max(0, top)}px`;
    handle.style.display = "block";
  }

  function onEditorMouseMove(e: MouseEvent) {
    if (drag) return;
    const v = pickVideoAtPoint(e);
    placeHandle(v);
  }

  function onEditorMouseLeave() {
    if (!drag) placeHandle(null);
  }

  function onHandleMouseDown(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const v = hoverVideo;
    if (!v) return;
    drag = { video: v, startX: e.clientX, startW: v.offsetWidth };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (!drag) return;
    e.preventDefault();
    const maxW = maxVideoWidth();
    const dw = e.clientX - drag.startX;
    const w = Math.min(maxW, Math.max(MIN_W, Math.round(drag.startW + dw)));
    drag.video.style.width = `${w}px`;
    drag.video.style.maxWidth = "none";
    if (drag.video.hasAttribute("height")) {
      drag.video.removeAttribute("height");
      drag.video.style.height = "auto";
    }
  }

  function onWindowMouseUp() {
    if (!drag) return;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const v = drag.video;
    drag = null;
    const w = Math.round(v.offsetWidth);
    const found = (Quill as unknown as { find: (n: Node) => unknown }).find(v) as
      | { format?: (a: string, b: string) => void }
      | undefined;
    if (found) {
      try {
        const index = quill.getIndex(found as never);
        quill.formatText(index, 1, "width", String(w), "user");
      } catch {
        found.format?.("width", String(w));
      }
    }
    placeHandle(null);
  }

  function onScroll() {
    if (hoverVideo && !drag) placeHandle(hoverVideo);
  }

  quill.root.addEventListener("mousemove", onEditorMouseMove);
  quill.root.addEventListener("mouseleave", onEditorMouseLeave);
  quill.root.addEventListener("scroll", onScroll, { passive: true });
  handle.addEventListener("mousedown", onHandleMouseDown);
  window.addEventListener("mousemove", onWindowMouseMove, true);
  window.addEventListener("mouseup", onWindowMouseUp, true);

  return () => {
    quill.root.removeEventListener("mousemove", onEditorMouseMove);
    quill.root.removeEventListener("mouseleave", onEditorMouseLeave);
    quill.root.removeEventListener("scroll", onScroll);
    handle.removeEventListener("mousedown", onHandleMouseDown);
    window.removeEventListener("mousemove", onWindowMouseMove, true);
    window.removeEventListener("mouseup", onWindowMouseUp, true);
    removeNodeIfAttached(layer);
    container.style.position = savedPosition;
  };
}
