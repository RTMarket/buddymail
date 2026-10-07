import { apiFormUploadWithTimeout, apiJson } from "./api";

export const SOCIAL_LIBRARY_PLATFORMS = [
  "devto",
  "mastodon",
  "bluesky",
  "linkedin_member",
  "wechat_official"
] as const;

export type SocialLibraryPlatform = (typeof SOCIAL_LIBRARY_PLATFORMS)[number];

export type SocialLibraryAsset = {
  id: number;
  kind: "image" | "video";
  fileName: string;
  storedName: string;
  mime: string;
  sizeBytes: number;
  url: string;
  posterUrl?: string;
  createdAt: string | null;
};

export type SocialLibraryDraft = {
  title: string;
  body: string;
  selectedAssetIds: number[];
  selectedPlatforms: SocialLibraryPlatform[];
  updatedAt: string | null;
};

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
  platform: SocialLibraryPlatform | "tiktok" | string;
  ok: boolean;
  message: string;
  url?: string;
};

export type SocialLibraryPublishLog = {
  id: number;
  title: string;
  platforms: SocialLibraryPlatform[];
  status: "ok" | "partial" | "failed";
  results: SocialPublishResult[];
  createdAt: string | null;
};

export type SocialLibraryNamedDraft = SocialLibraryDraft & { id: number };

export type SocialLibrarySnapshot = {
  ok: true;
  assets: SocialLibraryAsset[];
  draft: SocialLibraryDraft;
  namedDrafts?: SocialLibraryNamedDraft[];
  platforms: SocialPlatformStatus[];
  logs: SocialLibraryPublishLog[];
};

export function loadSocialLibrary(): Promise<SocialLibrarySnapshot> {
  return apiJson<SocialLibrarySnapshot>("/api/standalone/social-library");
}

export function uploadSocialLibraryAsset(
  file: File,
  poster?: Blob | null
): Promise<{ ok: true; asset?: SocialLibraryAsset; id?: number }> {
  const form = new FormData();
  const name = file.name && pathHasExt(file.name) ? file.name : suggestFileName(file);
  form.append("originalName", name);
  form.append("file", file, name);
  if (poster && poster.size > 400) form.append("poster", poster, "poster.jpg");
  return apiFormUploadWithTimeout<{ ok: true; asset?: SocialLibraryAsset; id?: number }>(
    "/api/standalone/social-library/assets",
    form,
    6 * 60 * 1000
  );
}

function pathHasExt(name: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(name);
}

function suggestFileName(file: File): string {
  const mime = String(file.type || "").toLowerCase();
  if (mime.includes("mp4") || mime.startsWith("video/")) return "video.mp4";
  if (mime.includes("quicktime")) return "video.mov";
  if (mime.includes("webm")) return "video.webm";
  if (mime.includes("png")) return "image.png";
  if (mime.includes("webp")) return "image.webp";
  if (mime.includes("gif")) return "image.gif";
  return "image.jpg";
}

export function deleteSocialLibraryAsset(id: number): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/api/standalone/social-library/assets/${id}`, { method: "DELETE" });
}

export function saveSocialLibraryDraft(input: {
  title?: string;
  body?: string;
  selectedAssetIds?: number[];
  selectedPlatforms?: SocialLibraryPlatform[];
}): Promise<{ ok: true; draft: SocialLibraryDraft }> {
  return apiJson("/api/standalone/social-library/draft", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function saveSocialLibraryNamedDraft(input: {
  title: string;
  body?: string;
  selectedAssetIds?: number[];
  selectedPlatforms?: SocialLibraryPlatform[];
}): Promise<{
  ok: true;
  draft: SocialLibraryDraft;
  named: SocialLibraryNamedDraft;
  namedDrafts: SocialLibraryNamedDraft[];
}> {
  return apiJson("/api/standalone/social-library/named-drafts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function loadSocialLibraryNamedDraft(id: number): Promise<{ ok: true; draft: SocialLibraryDraft }> {
  return apiJson(`/api/standalone/social-library/named-drafts/${id}/load`, { method: "POST" });
}

export function deleteSocialLibraryNamedDraft(id: number): Promise<{ ok: true; namedDrafts: SocialLibraryNamedDraft[] }> {
  return apiJson(`/api/standalone/social-library/named-drafts/${id}`, { method: "DELETE" });
}

export function saveSocialLibrarySettings(input: {
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
}): Promise<{ ok: true; platforms: SocialPlatformStatus[] }> {
  return apiJson("/api/standalone/social-library/settings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function appendTikTokLibraryLogs(entries: Array<{ title: string; results: SocialPublishResult[] }>): Promise<{
  ok: true;
  logs: SocialLibraryPublishLog[];
} | null> {
  const payload = entries
    .map((entry) => ({
      title: entry.title,
      results: entry.results
        .filter((row) => row.platform === "tiktok")
        .map((row) => ({
          platform: "tiktok" as const,
          ok: row.ok,
          message: row.message.slice(0, 800),
          url: row.url
        }))
    }))
    .filter((entry) => entry.results.length > 0);
  if (!payload.length) return Promise.resolve(null);
  return apiJson("/api/standalone/social-library/logs", {
    method: "POST",
    body: JSON.stringify({ entries: payload })
  });
}

export type ChannelAccount = {
  id: string;
  label: string;
  method: string;
  configured: boolean;
  account: string;
  extra?: string;
  hint: string;
  subscribers?: number | null;
  notes?: number | null;
  followers?: number | null;
  displayName?: string;
};

export function loadChannelAccounts(): Promise<{ ok: true; channels: ChannelAccount[] }> {
  return apiJson("/api/standalone/social-library/channels");
}

export function saveChannelAccount(input: {
  id: string;
  account?: string;
  secret?: string;
  extra?: string;
}): Promise<{ ok: true; channel: ChannelAccount }> {
  return apiJson("/api/standalone/social-library/channels", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function publishTelegramChannel(input: {
  title: string;
  body: string;
  assetIds: number[];
}): Promise<{ ok: true; result: SocialPublishResult }> {
  return apiJson("/api/standalone/social-library/channels/telegram/publish", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function publishSlackChannel(input: {
  title: string;
  body: string;
  assetIds: number[];
}): Promise<{ ok: true; result: SocialPublishResult }> {
  return apiJson("/api/standalone/social-library/channels/slack/publish", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function publishNostrChannel(input: {
  title: string;
  body: string;
  assetIds: number[];
}): Promise<{ ok: true; result: SocialPublishResult }> {
  return apiJson("/api/standalone/social-library/channels/nostr/publish", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function publishSocialLibrary(input: {
  title: string;
  body: string;
  assetIds: number[];
  platforms: SocialLibraryPlatform[];
}): Promise<{ ok: true; status: "ok" | "partial" | "failed"; results: SocialPublishResult[] }> {
  return apiJson("/api/standalone/social-library/publish", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
