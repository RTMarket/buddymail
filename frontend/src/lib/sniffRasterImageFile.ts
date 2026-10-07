/** MIME 或扩展名判断（系统有时把照片标成 application/octet-stream） */
export function isImageFileByMimeOrName(f: File): boolean {
  const t = f.type.toLowerCase();
  if (t.startsWith("image/")) return true;
  const lower = f.name.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)$/i.test(lower);
}

/**
 * 读取文件头判断常见栅格图（不依赖 MIME/扩展名）。
 */
export async function fileAppearsToBeRasterImage(file: File): Promise<boolean> {
  if (file.size < 12) return false;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return true;
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return true;
  }
  if (head[0] === 0x42 && head[1] === 0x4d) return true;

  return false;
}

export async function fileIsRasterImageForConversion(f: File): Promise<boolean> {
  if (isImageFileByMimeOrName(f)) return true;
  return fileAppearsToBeRasterImage(f);
}

export async function everyFileIsRasterImage(files: File[]): Promise<boolean> {
  if (files.length === 0) return false;
  for (const f of files) {
    if (!(await fileIsRasterImageForConversion(f))) return false;
  }
  return true;
}
