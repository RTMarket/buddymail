export type DownloadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

function parseEstimatedLength(resp: Response): number | null {
  const raw =
    resp.headers.get("Content-Length") ??
    resp.headers.get("X-Estimated-Content-Length");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 流式拉取为 Blob，并回调下载进度（用于大文件安装包） */
export async function fetchBlobWithProgress(
  url: string,
  init: RequestInit,
  onProgress: (p: DownloadProgress) => void
): Promise<{ blob: Blob; filename: string | null }> {
  const resp = await fetch(url, { ...init, credentials: init.credentials ?? "include" });
  if (!resp.ok) {
    let message = `下载失败（${resp.status}）`;
    try {
      const j = (await resp.json()) as { message?: string };
      if (j.message) message = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const total = parseEstimatedLength(resp);
  const dispo = resp.headers.get("Content-Disposition") ?? "";
  const starMatch = /filename\*=UTF-8''([^;\s]+)/i.exec(dispo);
  const asciiMatch = /filename="([^"]+)"/i.exec(dispo);
  const filename = starMatch?.[1]
    ? decodeURIComponent(starMatch[1])
    : asciiMatch?.[1] ?? null;

  const body = resp.body;
  if (!body) {
    const blob = await resp.blob();
    onProgress({ loaded: blob.size, total: blob.size, percent: 100 });
    return { blob, filename };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      chunks.push(value);
      loaded += value.length;
      const percent =
        total != null && total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : null;
      onProgress({ loaded, total, percent });
    }
  }

  const blob = new Blob(chunks as BlobPart[], { type: resp.headers.get("Content-Type") ?? "application/zip" });
  onProgress({ loaded: blob.size, total: total ?? blob.size, percent: 100 });
  return { blob, filename };
}

export function formatDownloadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function triggerBrowserFileDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
