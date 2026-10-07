/** 图片创作 / 多图创作共用：槽位、下载、模版库扩展名等 */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadObjectUrl(objectUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  a.click();
}

export function defaultLocalBasename() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

export const MAX_IMAGE_SLOTS = 40;
export const MAX_IMAGE_UNDO = 20;

export type ImageSnapshot = { url: string; file: File | null };

/** 多槽位：每张独立 url/file */
export type ImageSlot = { id: string; url: string; file: File | null };

export function makeImageSlot(url: string, file: File | null): ImageSlot {
  return { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, url, file };
}

export function buildEditedImageName(file: File | null): string {
  const rawStem = (file?.name ?? "image").replace(/\.[^.]+$/i, "");
  const stem = rawStem.replace(/-编辑$/i, "") || "image";
  return `${stem}-编辑.png`;
}

/** 单张槽位下载到本机；网络图可能因 CORS 失败 */
export async function downloadImageSlotToLocal(slot: ImageSlot, fallbackStem: string): Promise<boolean> {
  const { url, file } = slot;
  if (file && url.startsWith("blob:")) {
    const name = (file.name && file.name.trim()) || `${fallbackStem}.png`;
    downloadObjectUrl(url, name);
    return true;
  }
  if (/^https?:\/\//i.test(url)) {
    let fallback = `${fallbackStem}.png`;
    try {
      const path = new URL(url).pathname.split("/").filter(Boolean).pop();
      if (path) fallback = path;
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      downloadBlob(blob, fallback);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** 写入模版库时按槽位推断扩展名（多图命名为 1.ext、2.ext …） */
export function fileExtForStudioImage(slot: ImageSlot): string {
  const mime = slot.file?.type ?? "";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  const name = slot.file?.name ?? "";
  const nm = /\.([a-z0-9]+)$/i.exec(name);
  if (nm) {
    const e = nm[1]!.toLowerCase();
    if (e === "jpeg" || e === "jpg") return ".jpg";
    if (e === "png" || e === "webp" || e === "gif") return `.${e}`;
  }
  if (/^https?:\/\//i.test(slot.url)) {
    try {
      const path = new URL(slot.url).pathname;
      const um = /\.(jpe?g|png|webp|gif)(?:$|[?#])/i.exec(path);
      if (um) {
        const ext = um[1]!.toLowerCase();
        return ext.startsWith("jp") ? ".jpg" : `.${ext}`;
      }
    } catch {
      /* ignore */
    }
  }
  return ".png";
}
