import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TikTokMediaItem = {
  type: "image" | "video";
  name: string;
  url?: string;
};

export type TikTokPublishInput = {
  accessToken: string;
  openId: string;
  refreshToken?: string;
  title: string;
  body: string;
  /** DIRECT_POST = 直发；MEDIA_UPLOAD = 推到草稿/收件箱 */
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  /** 未过 App Audit 时建议 SELF_ONLY */
  privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  disableComment?: boolean;
  media: TikTokMediaItem[];
  publicOrigin: string;
};

export type TikTokPublishResult = {
  publishId: string;
  mode: "video" | "photo";
  warnings: string[];
  status?: string;
  failReason?: string;
  accessToken?: string;
  refreshToken?: string;
};

export type TikTokPublishStatus = {
  ok: boolean;
  status: string;
  failReason?: string;
  downloadedBytes?: number;
  uploadedBytes?: number;
  message?: string;
};

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function uploadsRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "..", "..", "uploads", "tiktok-publisher");
}

function socialLibraryUploadsRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "..", "..", "uploads", "standalone-social-library");
}

function resolveLocalUploadPath(mediaUrl: string): string | null {
  const u = mediaUrl.trim();
  const pairs: Array<{ marker: string; root: string }> = [
    { marker: "/uploads/tiktok-publisher/", root: uploadsRoot() },
    { marker: "/uploads/standalone-social-library/", root: socialLibraryUploadsRoot() }
  ];
  for (const { marker, root } of pairs) {
    const idx = u.indexOf(marker);
    if (idx < 0) continue;
    const filename = u.slice(idx + marker.length).split(/[?#]/)[0] ?? "";
    if (!filename || filename.includes("..") || filename.includes("/")) continue;
    const full = path.join(root, filename);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function toAbsoluteUrl(url: string, publicOrigin: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = publicOrigin.replace(/\/$/, "");
  if (!origin) return u;
  return u.startsWith("/") ? `${origin}${u}` : `${origin}/${u}`;
}

async function tiktokJson(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      ...(init?.headers ?? {})
    }
  });
  const text = await resp.text();
  const json = parseJson(text);
  const err = json.error as Record<string, unknown> | undefined;
  const code = valueAsString(err?.code);
  const ok = resp.ok && (!code || code === "ok");
  return { ok, status: resp.status, json, text };
}

function tiktokErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const err = json.error as Record<string, unknown> | undefined;
  const code = valueAsString(err?.code);
  const message =
    valueAsString(err?.message) ||
    valueAsString(json.message) ||
    code ||
    fallback;
  if (code === "unaudited_client_can_only_post_to_private_accounts") {
    return `${message}（Sandbox/未过审：请把该 TikTok 账号设为「私密账号」，且隐私选 SELF_ONLY；或改用「推到草稿箱」模式）`;
  }
  if (code === "url_ownership_unverified") {
    return `${message}（请在 TikTok 开发者后台 → App → URL properties 验证 https://你的域名/ 或 /uploads/tiktok-publisher/ 前缀）`;
  }
  if (code === "privacy_level_option_mismatch") {
    return `${message}（隐私选项与创作者账号不匹配：公开号通常没有 SELF_ONLY；私密号才有。请在 TikTok App 把账号改为私密后再发）`;
  }
  if (code === "access_token_invalid") {
    return `${message}（登录票据已过期或已失效。沙箱 access token 大约 24 小时失效。请对该号重新点「接入授权」，或等系统用 refresh token 自动续期后再发。）`;
  }
  return code && code !== "ok" && !message.includes(code) ? `[${code}] ${message}` : message;
}

function tiktokPostingClientKey(): string {
  return String(process.env.TIKTOK_POSTING_CLIENT_KEY ?? "").trim();
}

function tiktokPostingClientSecret(): string {
  try {
    const fromFile = fs.readFileSync("/app/.tiktok-posting-secret", "utf8").trim();
    if (fromFile) return fromFile;
  } catch {
    /* fall through */
  }
  return String(process.env.TIKTOK_POSTING_CLIENT_SECRET ?? "").trim();
}

export async function refreshTikTokAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresIn?: number;
}> {
  const token = refreshToken.trim();
  if (!token) throw new Error("缺少 refresh_token，请重新授权 TikTok。");
  const body = new URLSearchParams();
  body.set("client_key", tiktokPostingClientKey());
  body.set("client_secret", tiktokPostingClientSecret());
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", token);
  const resp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = parseJson(await resp.text());
  const err = json.error;
  if (!resp.ok || (typeof err === "string" && err) || (err && typeof err === "object")) {
    const msg =
      valueAsString((json as { error_description?: unknown }).error_description) ||
      (typeof err === "string" ? err : tiktokErrorMessage(json, "refresh_token 换票失败"));
    throw new Error(`TikTok 续期失败：${msg}。请对该号重新点「接入授权」。`);
  }
  const accessToken = valueAsString(json.access_token);
  const nextRefresh = valueAsString(json.refresh_token) || token;
  const openId = valueAsString(json.open_id);
  if (!accessToken) throw new Error("TikTok 续期未返回 access_token，请重新授权。");
  return {
    accessToken,
    refreshToken: nextRefresh,
    openId,
    expiresIn: Number(json.expires_in ?? 0) || undefined
  };
}

function isInvalidAccessTokenMessage(msg: string): boolean {
  return /access_token_invalid|invalid or not found in the request/i.test(msg);
}

async function uploadVideoFile(
  accessToken: string,
  localPath: string,
  title: string,
  privacyLevel: TikTokPublishInput["privacyLevel"],
  disableComment: boolean,
  postMode: TikTokPublishInput["postMode"]
): Promise<TikTokPublishResult> {
  const stat = fs.statSync(localPath);
  const videoSize = stat.size;
  if (videoSize < 1) throw new Error("视频文件为空");

  // TikTok 分片规则：
  // - <5MB：必须整文件上传（chunk_size = video_size, count = 1）
  // - ≤64MB：可用整文件上传（最稳，避免 ceil 导致 total_chunk_count invalid）
  // - >64MB：多分片；total_chunk_count = floor(video_size / chunk_size)，末片可吞余量
  const MIN_CHUNK = 5 * 1024 * 1024;
  const PREFERRED_CHUNK = 10 * 1024 * 1024;
  const MAX_WHOLE = 64 * 1024 * 1024;
  let chunkSize: number;
  let totalChunkCount: number;
  if (videoSize <= MAX_WHOLE) {
    chunkSize = videoSize;
    totalChunkCount = 1;
  } else {
    chunkSize = PREFERRED_CHUNK;
    totalChunkCount = Math.floor(videoSize / chunkSize);
    if (totalChunkCount < 1) {
      chunkSize = videoSize;
      totalChunkCount = 1;
    }
    // 末片过大时略增分片粒度（仍须 ≥5MB）
    const lastSize = videoSize - (totalChunkCount - 1) * chunkSize;
    if (lastSize > 128 * 1024 * 1024) {
      chunkSize = Math.max(MIN_CHUNK, Math.ceil(videoSize / 1000));
      totalChunkCount = Math.floor(videoSize / chunkSize);
    }
  }

  const sourceInfo = {
    source: "FILE_UPLOAD" as const,
    video_size: videoSize,
    chunk_size: chunkSize,
    total_chunk_count: totalChunkCount
  };

  const initBody =
    postMode === "MEDIA_UPLOAD"
      ? { source_info: sourceInfo }
      : {
          post_info: {
            title: title.slice(0, 2200),
            privacy_level: privacyLevel,
            disable_duet: false,
            disable_comment: disableComment,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000
          },
          source_info: sourceInfo
        };

  const initUrl =
    postMode === "MEDIA_UPLOAD"
      ? "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/video/init/";

  const init = await tiktokJson(initUrl, accessToken, {
    method: "POST",
    body: JSON.stringify(initBody)
  });
  if (!init.ok) {
    throw new Error(`TikTok 视频初始化失败：${tiktokErrorMessage(init.json, init.text.slice(0, 240))}`);
  }
  const data = (init.json.data ?? {}) as Record<string, unknown>;
  const publishId = valueAsString(data.publish_id);
  const uploadUrl = valueAsString(data.upload_url);
  if (!publishId || !uploadUrl) {
    throw new Error("TikTok 未返回 publish_id / upload_url");
  }

  const buf = fs.readFileSync(localPath);
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    // 最后一片吞掉余量（文档示例：末片可大于 chunk_size）
    const end = i === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    const chunk = buf.subarray(start, end + 1);
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${videoSize}`
      },
      body: chunk
    });
    if (!put.ok && put.status !== 201 && put.status !== 206) {
      const t = await put.text().catch(() => "");
      throw new Error(`TikTok 视频分片上传失败 HTTP ${put.status}: ${t.slice(0, 200)}`);
    }
  }

  const settled = await waitForPublishSettled(accessToken, publishId);
  if (settled.status === "FAILED") {
    const why = settled.failReason ? explainFailReason(settled.failReason) : "未知原因";
    throw new Error(`TikTok 视频发布未完成（publish_id=${publishId}）：${why}`);
  }
  const warnings: string[] = [];
  if (settled.status === "SEND_TO_USER_INBOX") {
    warnings.push("已推到 TikTok 收件箱，请打开手机 TikTok 通知完成编辑发布。");
  } else if (settled.status === "PUBLISH_COMPLETE") {
    warnings.push("TikTok 已确认发布完成；Sandbox/仅自己可见时，请在 App 内「我的作品」私密列表查看。");
  } else {
    warnings.push(`TikTok 仍在处理（${settled.status}），可稍后点「查询状态」。`);
  }
  if (postMode === "DIRECT_POST" && privacyLevel !== "SELF_ONLY") {
    warnings.push("若开发者 App 尚未通过 Audit，TikTok 可能仍强制仅自己可见。");
  }
  return {
    publishId,
    mode: "video",
    warnings,
    status: settled.status,
    failReason: settled.failReason
  };
}

async function publishPhotos(
  accessToken: string,
  photoUrls: string[],
  title: string,
  description: string,
  privacyLevel: TikTokPublishInput["privacyLevel"],
  disableComment: boolean,
  postMode: TikTokPublishInput["postMode"]
): Promise<TikTokPublishResult> {
  if (photoUrls.length < 1) throw new Error("图片发布至少需要 1 张图");
  assertPhotoUrlsSupported(photoUrls);
  const init = await tiktokJson("https://open.tiktokapis.com/v2/post/publish/content/init/", accessToken, {
    method: "POST",
    body: JSON.stringify({
      post_info: {
        title: title.slice(0, 90),
        description: description.slice(0, 4000),
        disable_comment: disableComment,
        privacy_level: privacyLevel,
        auto_add_music: true
      },
      source_info: {
        source: "PULL_FROM_URL",
        // 文档：cover index 从 0 起；单图必须为 0（写成 1 会报 source info empty/incorrect）
        photo_cover_index: 0,
        photo_images: photoUrls
      },
      post_mode: postMode,
      media_type: "PHOTO"
    })
  });
  if (!init.ok) {
    throw new Error(`TikTok 图片发布失败：${tiktokErrorMessage(init.json, init.text.slice(0, 240))}`);
  }
  const data = (init.json.data ?? {}) as Record<string, unknown>;
  const publishId = valueAsString(data.publish_id);
  if (!publishId) throw new Error("TikTok 未返回 publish_id");

  const settled = await waitForPublishSettled(accessToken, publishId);
  if (settled.status === "FAILED") {
    const why = settled.failReason ? explainFailReason(settled.failReason) : "未知原因";
    throw new Error(`TikTok 图片发布未完成（publish_id=${publishId}）：${why}`);
  }

  const warnings: string[] = [];
  if (settled.status === "PUBLISH_COMPLETE") {
    warnings.push("TikTok 已确认发布完成；请在手机 App「我的作品」查看（仅自己/私密不一定出现在公开页）。");
  } else if (settled.status === "SEND_TO_USER_INBOX") {
    warnings.push("已推到 TikTok 收件箱，请打开手机通知完成发布。");
  } else {
    warnings.push(`TikTok 仍在处理（${settled.status}），可稍后点「查询状态」。`);
  }
  return {
    publishId,
    mode: "photo",
    warnings,
    status: settled.status,
    failReason: settled.failReason
  };
}

/** 查询发布任务终态（受理 publish_id ≠ 已出现在 App） */
export async function fetchTikTokPublishStatus(
  accessToken: string,
  publishId: string
): Promise<TikTokPublishStatus> {
  const resp = await tiktokJson(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    accessToken,
    { method: "POST", body: JSON.stringify({ publish_id: publishId }) }
  );
  if (!resp.ok) {
    return { ok: false, status: "UNKNOWN", message: tiktokErrorMessage(resp.json, "查询发布状态失败") };
  }
  const data = (resp.json.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    status: valueAsString(data.status) || "UNKNOWN",
    failReason: valueAsString(data.fail_reason) || undefined,
    downloadedBytes: typeof data.downloaded_bytes === "number" ? data.downloaded_bytes : undefined,
    uploadedBytes: typeof data.uploaded_bytes === "number" ? data.uploaded_bytes : undefined
  };
}

function explainFailReason(reason: string): string {
  const map: Record<string, string> = {
    file_format_check_failed: "素材格式不符：图片仅支持 JPEG/WebP（不要用 PNG）；视频建议 MP4/H.264。",
    picture_size_check_failed: "图片尺寸超限：最长边建议 ≤1080p。",
    photo_pull_failed: "TikTok 拉取图片失败：请确认 URL 可公网访问且域名已 URL properties 验证。",
    video_pull_failed: "TikTok 拉取视频失败。",
    duration_check_failed: "视频时长不符合限制。",
    frame_rate_check_failed: "视频帧率不符合限制。",
    spam_risk_too_many_posts: "该账号 24 小时内 API 发帖过多。",
    spam_risk_user_banned_from_posting: "该账号被限制发帖。",
    spam_risk_text: "文案被判定风险，未发布。",
    spam_risk: "发布请求被风控拦截。",
    internal: "TikTok 服务端临时错误，可稍后重试。"
  };
  return map[reason] || `失败原因：${reason}`;
}

async function waitForPublishSettled(
  accessToken: string,
  publishId: string,
  opts?: { maxMs?: number; intervalMs?: number }
): Promise<TikTokPublishStatus> {
  const maxMs = opts?.maxMs ?? 90_000;
  const intervalMs = opts?.intervalMs ?? 2_500;
  const started = Date.now();
  let last: TikTokPublishStatus = { ok: true, status: "PROCESSING_DOWNLOAD" };
  while (Date.now() - started < maxMs) {
    last = await fetchTikTokPublishStatus(accessToken, publishId);
    if (!last.ok) return last;
    const s = last.status;
    if (s === "PUBLISH_COMPLETE" || s === "SEND_TO_USER_INBOX" || s === "FAILED") return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ...last, message: last.message || "等待 TikTok 处理超时，请稍后点「查询状态」" };
}

function assertPhotoUrlsSupported(photoUrls: string[]) {
  for (const u of photoUrls) {
    const pathOnly = u.split("?")[0]?.toLowerCase() ?? "";
    if (/\.(png|gif|bmp|tiff?)($|\/)/i.test(pathOnly)) {
      throw new Error(
        "TikTok 图片仅支持 JPEG / WebP。当前素材是 PNG/GIF 等格式：请到文件库重新上传 .jpg 或 .webp 后再发布（这也是手机上看不到帖子的常见原因——受理后异步校验失败）。"
      );
    }
  }
}

/** 查询创作者信息（直发前 UX 要求） */
export async function queryTikTokCreatorInfo(accessToken: string): Promise<{
  ok: boolean;
  username?: string;
  nickname?: string;
  privacyLevelOptions?: string[];
  message?: string;
}> {
  const resp = await tiktokJson(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    accessToken,
    { method: "POST", body: "{}" }
  );
  if (!resp.ok) {
    return { ok: false, message: tiktokErrorMessage(resp.json, "查询创作者信息失败") };
  }
  const data = (resp.json.data ?? {}) as Record<string, unknown>;
  const opts = data.privacy_level_options;
  return {
    ok: true,
    username: valueAsString(data.creator_username),
    nickname: valueAsString(data.creator_nickname),
    privacyLevelOptions: Array.isArray(opts) ? opts.map((x) => String(x)) : undefined
  };
}

async function fetchTikTokUserFields(
  accessToken: string,
  fields: string
): Promise<{ ok: true; user: Record<string, unknown> } | { ok: false; message: string }> {
  const url = `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await resp.text();
  const json = parseJson(text);
  const err = json.error as Record<string, unknown> | undefined;
  const code = valueAsString(err?.code);
  if (!resp.ok || (code && code !== "ok")) {
    return { ok: false, message: tiktokErrorMessage(json, text.slice(0, 200) || `HTTP ${resp.status}`) };
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const user = (data.user ?? data) as Record<string, unknown>;
  return { ok: true, user };
}

function asTikTokCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export async function detectTikTokUser(accessToken: string): Promise<
  | {
      ok: true;
      openId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      followerCount: number | null;
      videoCount: number | null;
    }
  | { ok: false; message: string }
> {
  // 先只拉 user.info.basic 字段。若把 username（需 user.info.profile）绑进同一次请求，
  // 在仅 basic scope 时 TikTok 会整单失败，前端就会只剩 open_id。
  const basic = await fetchTikTokUserFields(
    accessToken,
    "open_id,union_id,avatar_url,avatar_url_100,avatar_large_url,display_name"
  );
  if (!basic.ok) return basic;
  const openId = valueAsString(basic.user.open_id);
  if (!openId) return { ok: false, message: "TikTok 未返回 open_id，请确认 token 含 user.info.basic" };

  let username = "";
  const profile = await fetchTikTokUserFields(accessToken, "username");
  if (profile.ok) username = valueAsString(profile.user.username);

  let followerCount: number | null = null;
  let videoCount: number | null = null;
  const stats = await fetchTikTokUserFields(
    accessToken,
    "follower_count,following_count,likes_count,video_count"
  );
  if (stats.ok) {
    followerCount =
      asTikTokCount(stats.user.follower_count) ?? asTikTokCount(stats.user.followers_count);
    videoCount =
      asTikTokCount(stats.user.video_count) ?? asTikTokCount(stats.user.videos_count);
  }

  const displayName = valueAsString(basic.user.display_name) || username || openId;
  const avatarUrl =
    valueAsString(basic.user.avatar_url) ||
    valueAsString(basic.user.avatar_large_url) ||
    valueAsString(basic.user.avatar_url_100);
  return {
    ok: true,
    openId,
    displayName,
    username,
    avatarUrl,
    followerCount,
    videoCount
  };
}

export async function publishTikTokPost(input: TikTokPublishInput): Promise<TikTokPublishResult> {
  let accessToken = input.accessToken.trim();
  if (!accessToken) throw new Error("缺少 Access Token");
  let refreshedAccess = "";
  let refreshedRefresh = "";
  const tryRefresh = async (reason: string) => {
    const rt = String(input.refreshToken ?? "").trim();
    if (!rt || !isInvalidAccessTokenMessage(reason)) return false;
    const next = await refreshTikTokAccessToken(rt);
    accessToken = next.accessToken;
    refreshedAccess = next.accessToken;
    refreshedRefresh = next.refreshToken;
    return true;
  };
  const media = Array.isArray(input.media) ? input.media : [];
  const titleText = String(input.title || "").trim();
  const bodyText = String(input.body || "").trim();
  // 视频接口只有 title 这一栏说明。图片的长文案在 description。两边都要把正文带上。
  const caption = [titleText, bodyText].filter(Boolean).join("\n\n") || "BigSocialBoss";
  const privacyLevel = input.privacyLevel || "SELF_ONLY";
  const disableComment = Boolean(input.disableComment);
  const postMode = input.postMode || "DIRECT_POST";

  let creatorPrivacyOptions: string[] | undefined;
  if (postMode === "DIRECT_POST") {
    let creator = await queryTikTokCreatorInfo(accessToken);
    if (!creator.ok && (await tryRefresh(creator.message ?? ""))) {
      creator = await queryTikTokCreatorInfo(accessToken);
    }
    if (!creator.ok) {
      const detail = creator.message ?? "unknown";
      const scopeHint = isInvalidAccessTokenMessage(detail)
        ? " 请对该 TikTok 槽位重新点「接入授权」。改成私密账号不会让昨天的登录票据继续有效。"
        : /scope|authorize|authorized/i.test(detail)
        ? " 当前 Access Token 没有 video.publish（多半是早期只授了登录权限）。请回「账号管理」对该号重新点 OAuth，在 TikTok 授权页同意发帖权限；若仍失败，到 TikTok App → 设置 → 安全 → 管理应用权限 里撤销本 App 后再授权。"
        : " 请确认开发者后台已添加 Content Posting API、开启 Direct Post，并申请 video.publish。";
      throw new Error(`直发前查询创作者信息失败：${detail}。${scopeHint}`);
    }
    creatorPrivacyOptions = creator.privacyLevelOptions;
    if (
      Array.isArray(creatorPrivacyOptions) &&
      creatorPrivacyOptions.length > 0 &&
      !creatorPrivacyOptions.includes(privacyLevel)
    ) {
      throw new Error(
        `隐私「${privacyLevel}」不在该号可用选项（${creatorPrivacyOptions.join(", ")}）。Sandbox 直发通常要求 TikTok 账号为「私密」并选 SELF_ONLY；或把发布模式改为「推到草稿箱」。`
      );
    }
  }

  const videos = media.filter((m) => m.type === "video");
  const images = media.filter((m) => m.type === "image");

  if (videos.length > 0) {
    const v = videos[0]!;
    const abs = toAbsoluteUrl(v.url ?? "", input.publicOrigin);
    const local = resolveLocalUploadPath(v.url ?? "") || resolveLocalUploadPath(abs);
    if (!local) {
      throw new Error("视频须先上传到本站文件库，再发布。");
    }
    return withRefreshedTokens(
      await uploadVideoFile(accessToken, local, caption.slice(0, 2200), privacyLevel, disableComment, postMode)
    );
  }

  if (images.length > 0) {
    const urls = images
      .map((m) => toAbsoluteUrl(m.url ?? "", input.publicOrigin))
      .filter((u) => /^https:\/\//i.test(u));
    if (urls.length < 1) {
      throw new Error(
        "图片缺少可公网 HTTPS URL。请重新上传到文件库；并确认 PUBLIC_BASE_URL 为 https://你的域名。"
      );
    }
    // 预检：TikTok 拉取前本站必须 200 且不跳转
    for (const u of urls.slice(0, 3)) {
      try {
        const head = await fetch(u, { method: "HEAD", redirect: "manual" });
        if (head.status >= 300 && head.status < 400) {
          throw new Error(`图片 URL 发生跳转（HTTP ${head.status}），TikTok 不跟随跳转：${u}`);
        }
        if (!head.ok) {
          throw new Error(`图片 URL 不可访问（HTTP ${head.status}）：${u}`);
        }
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes("图片 URL")) throw e;
        /* HEAD 被拒时仍尝试发布，由 TikTok 侧报错 */
      }
    }
    return withRefreshedTokens(
      await publishPhotos(
        accessToken,
        urls,
        (titleText || caption).slice(0, 90),
        caption.slice(0, 4000),
        privacyLevel,
        disableComment,
        postMode
      )
    );
  }

  throw new Error("TikTok API 不支持纯文字帖：请至少选择 1 个视频或 1 张图片。");

  function withRefreshedTokens(result: TikTokPublishResult): TikTokPublishResult {
    if (!refreshedAccess) return result;
    return { ...result, accessToken: refreshedAccess, refreshToken: refreshedRefresh || undefined };
  }
}
