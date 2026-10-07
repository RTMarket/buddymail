import JSZip from "jszip";

/** 从 zip 路径中取目录部分 */
function parentDir(zipPath: string): string {
  const n = zipPath.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i < 0 ? "" : n.slice(0, i);
}

/**
 * Relationship 的 Target 相对「含主部件的目录」解析，而非 _rels 目录。
 * 例：ppt/slides/_rels/slide1.xml.rels -> 基准为 ppt/slides
 */
function relationshipBaseDir(relsZipPath: string): string {
  const norm = relsZipPath.replace(/\\/g, "/");
  const idx = norm.toLowerCase().lastIndexOf("/_rels/");
  if (idx < 0) return parentDir(norm);
  return norm.slice(0, idx);
}

/** 相对 ppt/slides 等的 ../media/x 解析为 zip 内统一路径 */
function resolveRelativePath(baseDir: string, target: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\//, "");
  const t = norm(target);
  if (/^https?:\/\//i.test(t)) return "";
  const baseParts = norm(baseDir).split("/").filter(Boolean);
  const parts = [...baseParts];
  for (const seg of t.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

function findZipEntryKey(zip: JSZip, logicalPath: string): string | null {
  const want = logicalPath.replace(/\\/g, "/").toLowerCase();
  for (const k of Object.keys(zip.files)) {
    if (k.replace(/\\/g, "/").toLowerCase() === want) return k;
  }
  return null;
}

function parseRelationshipTags(xml: string): { type: string; target: string; targetMode?: string }[] {
  const out: { type: string; target: string; targetMode?: string }[] = [];
  const re = /<Relationship\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    const typeM = /Type="([^"]+)"/i.exec(attrs);
    const targetM = /Target="([^"]+)"/i.exec(attrs);
    const modeM = /TargetMode="([^"]+)"/i.exec(attrs);
    if (typeM && targetM) {
      out.push({ type: typeM[1], target: targetM[1], targetMode: modeM?.[1] });
    }
  }
  return out;
}

function isImageRelationshipType(type: string): boolean {
  const t = type.toLowerCase();
  // OOXML 标准图片关系类型
  if (t.includes("officeDocument/2006/relationships/image")) return true;
  if (t.includes("relationships/image")) return true;
  return /\/image$/i.test(t);
}

/** 是否像可打包的媒体文件（排除 xml/rels） */
function looksLikeMediaAsset(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml") || lower.endsWith(".rels")) return false;
  return true;
}

/**
 * 从 .pptx 尽量收集图片/媒体：ppt/media 下全部非 XML 文件 + 各 _rels 中声明的图片目标。
 * 仍无法得到「整页幻灯片截图」；纯文字/矢量排版可能没有任何媒体文件。
 */
export async function pptxEmbeddedImagesAsZipBlob(file: File): Promise<Blob> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out = new JSZip();
  const usedNames = new Set<string>();
  const pathsToPack = new Set<string>();
  let count = 0;

  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const norm = path.replace(/\\/g, "/");
    const lower = norm.toLowerCase();
    if (!lower.startsWith("ppt/media/")) continue;
    const fileName = norm.split("/").pop() ?? "";
    if (!looksLikeMediaAsset(fileName)) continue;
    const key = findZipEntryKey(zip, norm) ?? path;
    pathsToPack.add(key);
  }

  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    if (!/\/_rels\/[^/]+\.rels$/i.test(path.replace(/\\/g, "/"))) continue;
    const lower = path.replace(/\\/g, "/").toLowerCase();
    if (!lower.startsWith("ppt/")) continue;

    let xml: string;
    try {
      xml = await entry.async("text");
    } catch {
      continue;
    }
    const baseDir = relationshipBaseDir(path);
    const rels = parseRelationshipTags(xml);
    for (const r of rels) {
      if (r.targetMode && r.targetMode.toLowerCase() === "external") continue;
      if (!isImageRelationshipType(r.type)) continue;
      const resolved = resolveRelativePath(baseDir, r.target);
      if (!resolved) continue;
      const key = findZipEntryKey(zip, resolved);
      if (key && zip.files[key] && !zip.files[key].dir) {
        pathsToPack.add(key);
      }
    }
  }

  for (const key of pathsToPack) {
    const entry = zip.files[key];
    if (!entry || entry.dir) continue;
    const data = await entry.async("uint8array");
    let name = key.replace(/\\/g, "/").split("/").pop() ?? `asset-${count}`;
    if (usedNames.has(name)) {
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
      const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
      name = `${base}-${count}${ext}`;
    }
    usedNames.add(name);
    out.file(name, data);
    count++;
  }

  if (count === 0) {
    throw new Error(
      "这份演示里在压缩包中找不到可用的图片/媒体文件（常见于：只有文字、形状、表格、SmartArt，或图片全是矢量格式且未单独落在 ppt/media 下）。" +
        "浏览器无法把每一页幻灯片渲染成整页截图。请在本机用 PowerPoint / WPS / Keynote 将文件「另存为」或「导出为」PDF，再回到本页上传该 PDF，选择「PNG（ZIP）」即可按页导出整页图片。"
    );
  }

  return out.generateAsync({ type: "blob", compression: "DEFLATE" });
}
