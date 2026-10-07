import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLinkedInFixedPromoAboveHashtags } from "../lib/linkedinFixedPromo.js";

const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202602";
const LINKEDIN_UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads", "linkedin-publisher");
const LINKEDIN_VIDEO_MIN_BYTES = 75 * 1024;
const LINKEDIN_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

export type LinkedInPublishMedia = {
  type: "image" | "video";
  name: string;
  url?: string;
};

export type LinkedInPublishInput = {
  accessToken: string;
  memberUrn: string;
  title: string;
  body: string;
  url?: string;
  /** og:image from article import; server may fetch from url when omitted */
  articleThumbnailUrl?: string;
  media?: LinkedInPublishMedia[];
  publicOrigin: string;
};

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

function normalizeMemberUrn(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return v.startsWith("urn:li:person:") ? v : `urn:li:person:${v.replace(/^urn:li:person:/, "")}`;
}

function absoluteAssetUrl(publicOrigin: string, maybeUrl?: string): string {
  const u = String(maybeUrl ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const base = publicOrigin.replace(/\/$/, "");
  return `${base}${u.startsWith("/") ? u : `/${u}`}`;
}

const LITTLE_TEXT_RESERVED = /[\\|{}\@\[\]<>*_~]/g;

/** Clean plaintext before LinkedIn little-text escaping (visible in feed). */
export function normalizeLinkedInPostPlaintext(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\{hashtag\|#\|([^}]+)\}/gi, "#$1")
    .replace(/\\([()])/g, "$1")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）");
}

/**
 * LinkedIn Posts API uses little-text format for commentary.
 * ASCII ( ) * # etc. can truncate or render wrong; use fullwidth parens + plain #tags.
 */
export function formatLinkedInCommentary(raw: string): string {
  let text = normalizeLinkedInPostPlaintext(raw);

  const hashtags: string[] = [];
  text = text.replace(/#([\w\u00C0-\u024F\u0900-\u097F\u4e00-\u9fff_-]+)/gu, (full) => {
    const idx = hashtags.length;
    hashtags.push(full);
    return `\x00H${idx}\x00`;
  });

  text = text.replace(LITTLE_TEXT_RESERVED, (ch) => `\\${ch}`);

  text = text.replace(/\x00H(\d+)\x00/g, (_m, idx: string) => hashtags[Number(idx)] ?? "");

  return text.slice(0, 3000);
}

/** Remove duplicate article URL lines from commentary when link card is attached separately. */
function stripArticleUrlFromCommentary(body: string, articleUrl: string): string {
  const norm = articleUrl.trim().replace(/\/$/, "");
  if (!norm) return body;
  return body
    .split("\n")
    .filter((line) => {
      const t = line.trim().replace(/\/$/, "");
      return t !== norm && !t.startsWith(`${norm}?`) && !t.startsWith(`${norm}#`);
    })
    .join("\n")
    .trim();
}

/** Short teaser for article link card — not the full post body. */
function articleCardDescription(body: string): string {
  const para = body.split(/\n\n+/).map((p) => p.trim()).find(Boolean) ?? body.trim();
  return para.slice(0, 260);
}

function guessContentType(fileName: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(fileName).toLowerCase();
  if ([".png"].includes(ext)) return "image/png";
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".m4v") return "video/x-m4v";
  if (ext === ".mp4") return "video/mp4";
  return fallback;
}

async function fetchBytes(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`素材下载失败 ${resp.status}: ${url}`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  return { bytes, contentType };
}

/** 优先读本机 linkedin-publisher 目录，避免 backend 经 nginx 自请求 /uploads */
async function fetchMediaBytes(
  publicOrigin: string,
  maybeUrl: string
): Promise<{ bytes: Buffer; contentType: string }> {
  const rel = String(maybeUrl ?? "").trim();
  const m = rel.match(/^\/uploads\/linkedin-publisher\/([^?#]+)$/);
  if (m?.[1]) {
    const base = path.basename(m[1]);
    const localPath = path.join(LINKEDIN_UPLOAD_DIR, base);
    if (fs.existsSync(localPath)) {
      return { bytes: fs.readFileSync(localPath), contentType: guessContentType(base) };
    }
  }
  return fetchBytes(absoluteAssetUrl(publicOrigin, rel));
}

type LinkedInVideoUploadInstruction = {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
};

async function waitLinkedInVideoReady(token: string, videoUrn: string, maxWaitMs = 120_000): Promise<void> {
  const encodedUrn = encodeURIComponent(videoUrn);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const resp = await fetch(`https://api.linkedin.com/rest/videos/${encodedUrn}`, {
      headers: linkedInHeaders(token)
    });
    const text = await resp.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }
    if (!resp.ok) {
      throw new Error(`LinkedIn 视频状态查询失败: ${resp.status} ${text.slice(0, 300)}`);
    }
    const status = String(json.status ?? "");
    if (status === "AVAILABLE") return;
    if (status === "PROCESSING_FAILED" || status === "FAILED") {
      throw new Error(`LinkedIn 视频处理失败（${status}）`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("LinkedIn 视频处理超时，请稍后重试");
}

async function uploadLinkedInVideo(token: string, owner: string, videoUrl: string, publicOrigin: string): Promise<string> {
  const { bytes } = await fetchMediaBytes(publicOrigin, videoUrl);
  const fileSizeBytes = bytes.length;
  if (fileSizeBytes < LINKEDIN_VIDEO_MIN_BYTES) {
    throw new Error("LinkedIn 视频须大于 75 KB");
  }
  if (fileSizeBytes > LINKEDIN_VIDEO_MAX_BYTES) {
    throw new Error("LinkedIn 视频不能超过 500 MB");
  }

  const initResp = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false
      }
    })
  });
  const initText = await initResp.text();
  let initJson: Record<string, unknown> = {};
  try {
    initJson = initText ? (JSON.parse(initText) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }
  if (!initResp.ok) throw new Error(`LinkedIn 视频初始化失败: ${initResp.status} ${initText.slice(0, 300)}`);

  const value = (initJson.value ?? {}) as Record<string, unknown>;
  const videoUrn = String(value.video ?? "");
  const uploadToken = String(value.uploadToken ?? "");
  const instructions = (value.uploadInstructions ?? []) as LinkedInVideoUploadInstruction[];
  if (!videoUrn || !instructions.length) {
    throw new Error("LinkedIn 未返回视频 uploadInstructions");
  }

  const uploadedPartIds: string[] = [];
  for (const part of instructions) {
    const uploadUrl = String(part.uploadUrl ?? "");
    const firstByte = Number(part.firstByte ?? 0);
    const lastByte = Number(part.lastByte ?? bytes.length - 1);
    if (!uploadUrl) throw new Error("LinkedIn 视频分片缺少 uploadUrl");
    const chunk = bytes.subarray(firstByte, lastByte + 1);
    const uploadResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk
    });
    if (!uploadResp.ok) {
      throw new Error(`LinkedIn 视频分片上传失败: ${uploadResp.status} ${(await uploadResp.text()).slice(0, 200)}`);
    }
    const etag = uploadResp.headers.get("etag") || uploadResp.headers.get("ETag");
    if (!etag) throw new Error("LinkedIn 视频上传未返回 ETag");
    uploadedPartIds.push(etag);
  }

  const finalizeResp = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken,
        uploadedPartIds
      }
    })
  });
  const finalizeText = await finalizeResp.text();
  if (!finalizeResp.ok) {
    throw new Error(`LinkedIn 视频 finalize 失败: ${finalizeResp.status} ${finalizeText.slice(0, 300)}`);
  }

  await waitLinkedInVideoReady(token, videoUrn);
  return videoUrn;
}

async function uploadLinkedInImage(
  token: string,
  owner: string,
  imageUrl: string,
  publicOrigin: string
): Promise<string> {
  const initResp = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } })
  });
  const initText = await initResp.text();
  let initJson: Record<string, unknown> = {};
  try {
    initJson = initText ? (JSON.parse(initText) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }
  if (!initResp.ok) throw new Error(`LinkedIn 图片初始化失败: ${initResp.status} ${initText.slice(0, 300)}`);
  const value = (initJson.value ?? {}) as Record<string, unknown>;
  const uploadUrl = String(value.uploadUrl ?? "");
  const imageUrn = String(value.image ?? "");
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn 未返回图片 uploadUrl / URN");

  const { bytes, contentType } = await fetchMediaBytes(publicOrigin, imageUrl);
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes
  });
  if (!uploadResp.ok) {
    throw new Error(`LinkedIn 图片上传失败: ${uploadResp.status} ${(await uploadResp.text()).slice(0, 300)}`);
  }
  return imageUrn;
}

export async function publishLinkedInMemberPost(input: LinkedInPublishInput): Promise<{ postId: string; warnings: string[] }> {
  const token = input.accessToken.trim();
  const author = normalizeMemberUrn(input.memberUrn);
  if (!token || !author) throw new Error("缺少 Access Token 或 Member URN");

  const rawBody = ensureLinkedInFixedPromoAboveHashtags(String(input.body || input.title || "").trim());
  if (!rawBody) throw new Error("发布文案不能为空");

  const warnings: string[] = [];
  const skippedDocuments = (input.media ?? []).filter((m) => (m as { type?: string }).type === "document");
  if (skippedDocuments.length) {
    warnings.push("文档附件已不再支持 LinkedIn 发布，已跳过。");
  }
  const media = (input.media ?? []).filter((m) => m.type === "image" || m.type === "video");
  const publicOrigin = input.publicOrigin.replace(/\/$/, "");

  let content: Record<string, unknown> | undefined;
  const articleUrl = String(input.url ?? "").trim();
  const title = String(input.title ?? "").trim().slice(0, 200);

  const commentaryPlain = articleUrl ? stripArticleUrlFromCommentary(rawBody, articleUrl) : rawBody;
  const commentary = formatLinkedInCommentary(commentaryPlain);

  const imageMedia = media.find((m) => m.type === "image");
  const videoMedia = media.find((m) => m.type === "video");

  const missingUrlHint =
    "素材缺少可访问 URL。请在「LinkedIn 文件库」重新上传图片或视频。";

  if (videoMedia?.url) {
    try {
      const videoUrn = await uploadLinkedInVideo(token, author, videoMedia.url, publicOrigin);
      content = { media: { id: videoUrn } };
    } catch (e) {
      warnings.push(`视频上传失败：${String((e as Error)?.message ?? e)}`);
    }
  } else if (videoMedia) {
    warnings.push(missingUrlHint);
  }

  if (!content && imageMedia?.url) {
    try {
      const imageUrn = await uploadLinkedInImage(token, author, imageMedia.url, publicOrigin);
      content = { media: { id: imageUrn } };
    } catch (e) {
      warnings.push(`图片上传失败：${String((e as Error)?.message ?? e)}`);
    }
  } else if (!content && imageMedia) {
    warnings.push(missingUrlHint);
  }

  if (!content && articleUrl) {
    const articleBlock: Record<string, unknown> = {
      source: articleUrl,
      title: title || articleUrl,
      description: formatLinkedInCommentary(articleCardDescription(rawBody)).slice(0, 4086)
    };
    let thumbUrl = String(input.articleThumbnailUrl ?? "").trim();
    if (!thumbUrl) {
      try {
        const { fetchArticleThumbnailUrl } = await import("./linkedinArticleImport.js");
        thumbUrl = await fetchArticleThumbnailUrl(articleUrl);
      } catch {
        /* no cover — LinkedIn still publishes text + link */
      }
    }
    if (thumbUrl) {
      try {
        articleBlock.thumbnail = await uploadLinkedInImage(token, author, thumbUrl, publicOrigin);
      } catch (e) {
        warnings.push(`文章配图上传失败：${String((e as Error)?.message ?? e)}`);
      }
    }
    content = { article: articleBlock };
  }

  const payload: Record<string, unknown> = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  if (content) payload.content = content;

  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`LinkedIn 发布失败: ${resp.status} ${text.slice(0, 500)}`);
  }
  const postId = resp.headers.get("x-restli-id") || "";
  if (!postId) warnings.push("已发布，但 LinkedIn 未返回帖子 ID。");
  return { postId, warnings };
}
