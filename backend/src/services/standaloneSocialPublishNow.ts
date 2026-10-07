import fs from "node:fs";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import { decryptSecret } from "../cryptoSecret.js";
import { env } from "../env.js";
import {
  createWechatDraftFromHtml,
  getWechatSettings,
  saveWechatSettings,
  submitWechatDraftByMediaId,
  uploadWechatContentImage,
  uploadWechatThumbMaterial,
  uploadWechatVideoMaterial,
  getWechatVideoMaterialStatus,
  buildWechatVideoEmbedHtml
} from "./socialPublishingWechat.js";
import { saveDevtoApiKey, getDevtoSettings } from "./socialPublishingDevto.js";
import { saveMastodonSettings, getMastodonSettings } from "./socialPublishingMastodon.js";
import { saveBlueskySettings, getBlueskySettings } from "./socialPublishingBluesky.js";
import { getLinkedInMemberSettings, saveLinkedInMemberSettings } from "./socialPublishingLinkedIn.js";
import {
  getSocialLibraryAssetsByIds,
  insertSocialLibraryLog,
  resolveSocialLibraryFilePath,
  saveSocialLibraryDraft,
  type SocialLibraryAsset,
  type SocialLibraryPlatform
} from "./standaloneSocialLibrary.js";
import {
  bustSocialLibraryProfileCache,
  fetchLibraryPublicCounts,
  resolveSocialLibraryProfile
} from "./standaloneSocialLibraryProfiles.js";

export type SocialPlatformStatus = {
  platform: SocialLibraryPlatform;
  label: string;
  configured: boolean;
  hint: string;
  account: string;
  displayName: string;
  avatarUrl: string;
  posts?: number;
  followers?: number;
  following?: number;
  reactions?: number;
  comments?: number;
  views?: number;
};

export type SocialPublishResult = {
  platform: SocialLibraryPlatform;
  ok: boolean;
  message: string;
  url?: string;
};

const PLATFORM_LABEL: Record<SocialLibraryPlatform, string> = {
  devto: "dev.to",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  linkedin_member: "LinkedIn 个人",
  wechat_official: "微信公众号"
};

export async function listSocialLibraryPlatformStatus(db: Pool): Promise<SocialPlatformStatus[]> {
  const [devto, mastodon, bluesky, linkedin, wechat] = await Promise.all([
    getDevtoSettings(db).catch(() => ({ configured: false, hint: "" })),
    getMastodonSettings(db).catch(() => ({ configured: false, hint: "", instanceUrl: "" })),
    getBlueskySettings(db).catch(() => ({ configured: false, hint: "", handle: "" })),
    getLinkedInMemberSettings(db).catch(() => ({ configured: false, hint: "", memberUrn: "" })),
    getWechatSettings(db).catch(() => ({ configured: false, hint: "", appId: "", accountName: "" }))
  ]);
  const linkedinEnv = Boolean(process.env.LINKEDIN_MEMBER_ACCESS_TOKEN?.trim());
  const wechatAppId = "appId" in wechat ? String(wechat.appId ?? "") : "";
  const wechatName = "accountName" in wechat ? String(wechat.accountName ?? "") : "";
  const mastodonUrl = "instanceUrl" in mastodon ? String(mastodon.instanceUrl ?? "") : "";
  const blueskyHandle = "handle" in bluesky ? String(bluesky.handle ?? "") : process.env.BLUESKY_HANDLE?.trim() || "";
  const linkedinUrn = "memberUrn" in linkedin ? String(linkedin.memberUrn ?? "") : process.env.LINKEDIN_MEMBER_URN?.trim() || "";
  const base: SocialPlatformStatus[] = [
    {
      platform: "devto",
      label: PLATFORM_LABEL.devto,
      configured: Boolean(devto.configured || process.env.DEVTO_API_KEY?.trim()),
      hint: "hint" in devto ? String(devto.hint ?? "") : "",
      account: "",
      displayName: "",
      avatarUrl: ""
    },
    {
      platform: "mastodon",
      label: PLATFORM_LABEL.mastodon,
      configured: Boolean(mastodon.configured || process.env.MASTODON_ACCESS_TOKEN?.trim()),
      hint: "hint" in mastodon ? String(mastodon.hint ?? "") : "",
      account: mastodonUrl || (process.env.MASTODON_INSTANCE_URL?.trim() ?? ""),
      displayName: "",
      avatarUrl: ""
    },
    {
      platform: "bluesky",
      label: PLATFORM_LABEL.bluesky,
      configured: Boolean(bluesky.configured || process.env.BLUESKY_APP_PASSWORD?.trim()),
      hint: "hint" in bluesky ? String(bluesky.hint ?? "") : "",
      account: blueskyHandle,
      displayName: "",
      avatarUrl: ""
    },
    {
      platform: "linkedin_member",
      label: PLATFORM_LABEL.linkedin_member,
      configured: Boolean(linkedin.configured || linkedinEnv),
      hint: "hint" in linkedin ? String(linkedin.hint ?? "") : "",
      account: linkedinUrn,
      displayName: "",
      avatarUrl: ""
    },
    {
      platform: "wechat_official",
      label: PLATFORM_LABEL.wechat_official,
      configured: Boolean(wechatAppId),
      hint: wechatAppId ? wechatName || wechatAppId : "",
      account: wechatAppId ? wechatName || wechatAppId : "",
      displayName: "",
      avatarUrl: ""
    }
  ];
  return Promise.all(
    base.map(async (item) => {
      if (!item.configured) return item;
      const [profile, counts] = await Promise.all([
        resolveSocialLibraryProfile(db, item.platform).catch(() => ({
          displayName: "",
          username: "",
          avatarUrl: ""
        })),
        fetchLibraryPublicCounts(db, item.platform).catch(() => ({}))
      ]);
      const displayName = profile.displayName || profile.username || item.account;
      return {
        ...item,
        displayName,
        avatarUrl: profile.avatarUrl,
        account: displayName || item.account,
        hint: profile.username || item.hint,
        ...counts
      };
    })
  );
}

export async function saveSocialLibraryPlatformSettings(
  db: Pool,
  input: {
    devtoApiKey?: string;
    mastodonInstanceUrl?: string;
    mastodonAccessToken?: string;
    blueskyHandle?: string;
    blueskyAppPassword?: string;
    linkedinAccessToken?: string;
    linkedinMemberUrn?: string;
    wechatAppId?: string;
    wechatAppSecret?: string;
    wechatThumbMediaId?: string;
  }
): Promise<SocialPlatformStatus[]> {
  if (input.devtoApiKey?.trim()) {
    await saveDevtoApiKey(db, input.devtoApiKey.trim());
    await bustSocialLibraryProfileCache(db, "devto").catch(() => {});
  }
  if (input.mastodonInstanceUrl?.trim() || input.mastodonAccessToken?.trim()) {
    await saveMastodonSettings(
      db,
      input.mastodonInstanceUrl?.trim() || process.env.MASTODON_INSTANCE_URL || "https://mastodon.social",
      input.mastodonAccessToken?.trim()
    );
    await bustSocialLibraryProfileCache(db, "mastodon").catch(() => {});
  }
  if (input.blueskyHandle?.trim() || input.blueskyAppPassword?.trim()) {
    await saveBlueskySettings(db, input.blueskyHandle?.trim() || process.env.BLUESKY_HANDLE || "", input.blueskyAppPassword?.trim());
    await bustSocialLibraryProfileCache(db, "bluesky").catch(() => {});
  }
  if (input.linkedinAccessToken?.trim() || input.linkedinMemberUrn?.trim()) {
    await saveLinkedInMemberSettings(db, {
      accessToken: input.linkedinAccessToken?.trim(),
      memberUrn: input.linkedinMemberUrn?.trim() || "",
      defaultCoverImageUrl: ""
    });
    await bustSocialLibraryProfileCache(db, "linkedin_member").catch(() => {});
  }
  if (input.wechatAppId?.trim() || input.wechatAppSecret?.trim() || input.wechatThumbMediaId?.trim()) {
    await saveWechatSettings(db, {
      appId: input.wechatAppId?.trim() || (await getWechatSettings(db)).appId,
      appSecret: input.wechatAppSecret?.trim(),
      thumbMediaId: input.wechatThumbMediaId?.trim()
    });
    await bustSocialLibraryProfileCache(db, "wechat_official").catch(() => {});
  }
  return listSocialLibraryPlatformStatus(db);
}

export async function publishSocialLibraryNow(
  db: Pool,
  input: {
    title: string;
    body: string;
    assetIds: number[];
    platforms: SocialLibraryPlatform[];
  }
): Promise<{ results: SocialPublishResult[]; status: "ok" | "partial" | "failed" }> {
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!title && !body) throw new Error("请先填写标题或文案并保存。");
  const platforms = [...new Set(input.platforms)];
  if (!platforms.length) throw new Error("请至少选择一个平台。");

  await saveSocialLibraryDraft(db, {
    title,
    body,
    selectedAssetIds: input.assetIds,
    selectedPlatforms: platforms
  });
  const assets = await getSocialLibraryAssetsByIds(db, input.assetIds);
  const results: SocialPublishResult[] = [];
  for (const platform of platforms) {
    try {
      results.push(await publishOne(db, platform, title, body, assets));
    } catch (e: unknown) {
      results.push({
        platform,
        ok: false,
        message: String((e as Error)?.message ?? e).slice(0, 800)
      });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === results.length ? "ok" : okCount > 0 ? "partial" : "failed";
  await insertSocialLibraryLog(db, { title: title || body.slice(0, 40), platforms, status, results });
  return { results, status };
}

async function publishOne(
  db: Pool,
  platform: SocialLibraryPlatform,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  if (platform === "devto") return publishDevtoNow(db, title, body, assets);
  if (platform === "mastodon") return publishMastodonNow(db, title, body, assets);
  if (platform === "bluesky") return publishBlueskyNow(db, title, body, assets);
  if (platform === "linkedin_member") return publishLinkedInMemberNow(db, title, body, assets);
  return publishWechatNow(db, title, body, assets);
}

async function publishDevtoNow(
  db: Pool,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  const apiKey = await readSecret(db, "devto", "DEVTO_API_KEY");
  if (!apiKey) throw new Error("dev.to 未接通：请填写 API Key。");
  const articleTitle = title || body.slice(0, 48) || "Untitled";
  const images = assets.filter((a) => a.kind === "image").map((a) => `![${escapeMd(a.fileName)}](${absoluteUrl(a.url)})`);
  const videos = assets.filter((a) => a.kind === "video").map((a) => `[视频 ${a.fileName}](${absoluteUrl(a.url)})`);
  const markdown = [body, ...images, ...videos].filter(Boolean).join("\n\n");
  const response = await fetch(process.env.DEVTO_API_URL || "https://dev.to/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      article: {
        title: articleTitle.slice(0, 128),
        published: true,
        body_markdown: markdown || articleTitle,
        tags: ["writing"]
      }
    })
  });
  const text = await response.text();
  const json = parseJson(text);
  if (!response.ok) throw new Error(`dev.to 发布失败：${response.status} ${text.slice(0, 400)}`);
  return {
    platform: "devto",
    ok: true,
    message: "已发布到 dev.to",
    url: String(json?.url ?? "")
  };
}

async function waitMastodonMediaReady(instance: string, token: string, mediaId: string, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const resp = await fetch(`${instance}/api/v1/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await resp.text();
    const json = parseJson(text);
    if (resp.status === 200 && (json?.url || json?.preview_url)) return;
    if (resp.status === 404) throw new Error("Mastodon 媒体已失效，请重新发布。");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Mastodon 附件仍在转码，请稍后再点发布。");
}

async function publishMastodonNow(
  db: Pool,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  const token = await readSecret(db, "mastodon", "MASTODON_ACCESS_TOKEN");
  const instance = resolveHttpUrl(
    process.env.MASTODON_INSTANCE_URL || (await readSettingColumn(db, "mastodon", "instance_url")) || "https://mastodon.social"
  );
  if (!token) throw new Error("Mastodon 未接通：请填写 Access Token。");
  const mediaIds: string[] = [];
  for (const asset of assets.slice(0, 4)) {
    const file = readAssetFile(asset);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.mime }), asset.fileName || "media");
    const mediaResp = await fetch(`${instance}/api/v2/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const mediaText = await mediaResp.text();
    const mediaJson = parseJson(mediaText);
    if (!mediaResp.ok || !mediaJson?.id) {
      throw new Error(`Mastodon 素材上传失败：${mediaResp.status} ${mediaText.slice(0, 300)}`);
    }
    const mediaId = String(mediaJson.id);
    if (mediaResp.status === 202 || !mediaJson.url) {
      const waitMs = asset.kind === "video" ? 240_000 : 90_000;
      await waitMastodonMediaReady(instance, token, mediaId, waitMs);
    }
    mediaIds.push(mediaId);
  }
  const statusText = truncateText([title, body].filter(Boolean).join("\n\n"), 490);
  const response = await fetch(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: statusText, visibility: "public", media_ids: mediaIds })
  });
  const text = await response.text();
  const json = parseJson(text);
  if (!response.ok) throw new Error(`Mastodon 发布失败：${response.status} ${text.slice(0, 400)}`);
  return {
    platform: "mastodon",
    ok: true,
    message: "已发布到 Mastodon",
    url: String(json?.url ?? "")
  };
}

async function publishBlueskyNow(
  db: Pool,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  const password = await readSecret(db, "bluesky", "BLUESKY_APP_PASSWORD");
  const handle = normalizeHandle(process.env.BLUESKY_HANDLE || (await readSettingColumn(db, "bluesky", "instance_url")));
  if (!password || !handle) throw new Error("Bluesky 未接通：请填写 Handle 和 App Password。");
  const pds = resolveHttpUrl(process.env.BLUESKY_PDS_URL || "https://bsky.social");
  const sessionResp = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password })
  });
  const sessionText = await sessionResp.text();
  const session = parseJson(sessionText);
  if (!sessionResp.ok || !session?.accessJwt || !session?.did) {
    throw new Error(`Bluesky 登录失败：${sessionResp.status} ${sessionText.slice(0, 300)}`);
  }
  const images: Array<{ alt: string; image: unknown }> = [];
  for (const asset of assets.filter((a) => a.kind === "image").slice(0, 4)) {
    const file = readAssetFile(asset);
    const blobResp = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": file.mime || "image/jpeg"
      },
      body: file.bytes
    });
    const blobText = await blobResp.text();
    const blobJson = parseJson(blobText);
    if (!blobResp.ok || !blobJson?.blob) {
      throw new Error(`Bluesky 图片上传失败：${blobResp.status} ${blobText.slice(0, 300)}`);
    }
    images.push({ alt: asset.fileName || title || "image", image: blobJson.blob });
  }
  const videoNote = assets.some((a) => a.kind === "video")
    ? `\n${assets.filter((a) => a.kind === "video").map((a) => absoluteUrl(a.url)).join("\n")}`
    : "";
  const text = truncateText([title, body, videoNote].filter(Boolean).join("\n\n"), 300);
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString().replace("+00:00", "Z")
  };
  if (images.length) {
    record.embed = { $type: "app.bsky.embed.images", images };
  }
  const postResp = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record
    })
  });
  const postText = await postResp.text();
  const postJson = parseJson(postText);
  if (!postResp.ok || !postJson?.uri) throw new Error(`Bluesky 发布失败：${postResp.status} ${postText.slice(0, 400)}`);
  const rkey = String(postJson.uri).split("/").pop() ?? "";
  return {
    platform: "bluesky",
    ok: true,
    message: "已发布到 Bluesky",
    url: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`
  };
}

async function publishLinkedInMemberNow(
  db: Pool,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  const token =
    process.env.LINKEDIN_MEMBER_ACCESS_TOKEN?.trim() || (await readSecret(db, "linkedin_member"));
  const settings = await getLinkedInMemberSettings(db).catch(() => ({ memberUrn: "" }));
  const memberUrn = normalizeMemberUrn(process.env.LINKEDIN_MEMBER_URN || settings.memberUrn);
  if (!token || !memberUrn) throw new Error("LinkedIn 个人未接通：请填写 Access Token 和 Member URN。");
  const commentary = truncateText([title, body].filter(Boolean).join("\n\n"), 2900);
  const image = assets.find((a) => a.kind === "image");
  const video = assets.find((a) => a.kind === "video");
  let content: Record<string, unknown> | undefined;
  if (video) {
    const videoUrn = await uploadLinkedInVideo(token, memberUrn, video);
    content = { media: { title: title || video.fileName, id: videoUrn } };
  } else if (image) {
    const imageUrn = await uploadLinkedInImage(token, memberUrn, image);
    content = { media: { id: imageUrn } };
  }
  const payload: Record<string, unknown> = {
    author: memberUrn,
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
  if (!resp.ok) throw new Error(`LinkedIn 发布失败：${resp.status} ${text.slice(0, 400)}`);
  const postId = resp.headers.get("x-restli-id") || "";
  return {
    platform: "linkedin_member",
    ok: true,
    message: "已发布到 LinkedIn 个人",
    url: postId ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}` : undefined
  };
}

async function publishWechatNow(
  db: Pool,
  title: string,
  body: string,
  assets: SocialLibraryAsset[]
): Promise<SocialPublishResult> {
  const settings = await getWechatSettings(db);
  if (!settings.appId) throw new Error("微信公众号未接通：请在通道设置填写 AppID / AppSecret。");
  const articleTitle = (title || body.slice(0, 32) || "未命名").slice(0, 64);
  const images = assets.filter((a) => a.kind === "image");
  const videos = assets.filter((a) => a.kind === "video");
  let thumbMediaId = settings.thumbMediaId;
  const contentParts: string[] = [];
  contentParts.push(
    ...body
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
  );
  if (images[0]) {
    const file = readAssetFile(images[0]);
    const uploaded = await uploadWechatThumbMaterial(db, file.bytes, images[0].fileName || "cover.jpg");
    thumbMediaId = uploaded.thumbMediaId;
  }
  for (const image of images.slice(images[0] ? 1 : 0)) {
    const file = readAssetFile(image);
    const uploaded = await uploadWechatContentImage(db, file.bytes, image.fileName || "image.jpg");
    contentParts.push(`<p><img src="${escapeHtml(uploaded.url)}" alt="${escapeHtml(image.fileName)}" /></p>`);
  }
  for (const video of videos) {
    const file = readAssetFile(video);
    const uploaded = await uploadWechatVideoMaterial(db, file.bytes, video.fileName || "video.mp4", {
      title: articleTitle,
      introduction: body.slice(0, 120)
    });
    const status = await getWechatVideoMaterialStatus(db, uploaded.mediaId);
    if (status.downUrl) {
      contentParts.push(buildWechatVideoEmbedHtml(articleTitle, status.downUrl));
    } else {
      contentParts.push(`<p>视频已上传，微信正在转码：${escapeHtml(video.fileName)}</p>`);
    }
  }
  const contentHtml = contentParts.join("") || `<p>${escapeHtml(articleTitle)}</p>`;
  const draft = await createWechatDraftFromHtml(db, {
    title: articleTitle,
    digest: body.slice(0, 120),
    contentHtml,
    thumbMediaId
  });
  const published = await submitWechatDraftByMediaId(db, draft.mediaId);
  return {
    platform: "wechat_official",
    ok: true,
    message: published.message,
    url: undefined
  };
}

async function uploadLinkedInImage(token: string, owner: string, asset: SocialLibraryAsset): Promise<string> {
  const initResp = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } })
  });
  const initText = await initResp.text();
  const initJson = parseJson(initText);
  if (!initResp.ok) throw new Error(`LinkedIn 图片初始化失败：${initResp.status} ${initText.slice(0, 300)}`);
  const uploadUrl = String(initJson?.value?.uploadUrl ?? "");
  const imageUrn = String(initJson?.value?.image ?? "");
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn 未返回图片 uploadUrl。");
  const file = readAssetFile(asset);
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.mime || "image/jpeg" },
    body: file.bytes
  });
  if (!uploadResp.ok) throw new Error(`LinkedIn 图片上传失败：${uploadResp.status} ${(await uploadResp.text()).slice(0, 300)}`);
  return imageUrn;
}

async function uploadLinkedInVideo(token: string, owner: string, asset: SocialLibraryAsset): Promise<string> {
  const file = readAssetFile(asset);
  const initResp = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes: file.bytes.length, uploadCaptions: false, uploadThumbnail: false }
    })
  });
  const initText = await initResp.text();
  const initJson = parseJson(initText);
  if (!initResp.ok) throw new Error(`LinkedIn 视频初始化失败：${initResp.status} ${initText.slice(0, 300)}`);
  const videoUrn = String(initJson?.value?.video ?? "");
  const uploadToken = String(initJson?.value?.uploadToken ?? "");
  const instructions = (initJson?.value?.uploadInstructions ?? []) as Array<{
    uploadUrl?: string;
    firstByte?: number;
    lastByte?: number;
  }>;
  if (!videoUrn || !instructions.length) throw new Error("LinkedIn 未返回视频 uploadInstructions。");
  const uploadedPartIds: string[] = [];
  for (const part of instructions) {
    const chunk = file.bytes.subarray(Number(part.firstByte ?? 0), Number(part.lastByte ?? file.bytes.length - 1) + 1);
    const uploadResp = await fetch(String(part.uploadUrl ?? ""), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk
    });
    if (!uploadResp.ok) throw new Error(`LinkedIn 视频分片上传失败：${uploadResp.status}`);
    const etag = uploadResp.headers.get("etag") || uploadResp.headers.get("ETag");
    if (!etag) throw new Error("LinkedIn 视频上传未返回 ETag。");
    uploadedPartIds.push(etag);
  }
  const finalizeResp = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds }
    })
  });
  if (!finalizeResp.ok) {
    throw new Error(`LinkedIn 视频 finalize 失败：${finalizeResp.status} ${(await finalizeResp.text()).slice(0, 300)}`);
  }
  return videoUrn;
}

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Linkedin-Version": process.env.LINKEDIN_VERSION || "202602",
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

async function readSecret(db: Pool, platform: string, envName?: string): Promise<string> {
  if (envName && process.env[envName]?.trim()) return process.env[envName]!.trim();
  const [rows] = await db.query(
    `SELECT api_key_enc FROM social_platform_settings WHERE platform = ? LIMIT 1`,
    [platform]
  );
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  return enc ? decryptSecret(enc).trim() : "";
}

async function readSettingColumn(db: Pool, platform: string, column: "instance_url"): Promise<string> {
  const [rows] = await db.query(
    `SELECT ${column} AS value FROM social_platform_settings WHERE platform = ? LIMIT 1`,
    [platform]
  );
  return String((rows as Array<{ value?: string | null }>)[0]?.value ?? "").trim();
}

function readAssetFile(asset: SocialLibraryAsset): { bytes: Buffer; mime: string } {
  const filePath = resolveSocialLibraryFilePath(asset);
  if (!fs.existsSync(filePath)) throw new Error(`素材文件不存在：${asset.fileName}`);
  return { bytes: fs.readFileSync(filePath), mime: asset.mime || guessMime(asset.fileName) };
}

function absoluteUrl(maybeUrl: string): string {
  const raw = String(maybeUrl ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function resolveHttpUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/$/, "");
}

function normalizeHandle(raw: string): string {
  return String(raw ?? "").trim().replace(/^@+/, "");
}

function normalizeMemberUrn(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  return v.startsWith("urn:li:person:") ? v : `urn:li:person:${v.replace(/^urn:li:person:/, "")}`;
}

function truncateText(text: string, max: number): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMd(raw: string): string {
  return String(raw).replace(/[[\]]/g, "");
}

function guessMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "image/jpeg";
}

function parseJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
