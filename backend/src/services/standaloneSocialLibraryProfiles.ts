import type { Pool } from "mysql2/promise";
import { decryptSecret } from "../cryptoSecret.js";
import type { SocialLibraryPlatform } from "./standaloneSocialLibrary.js";

export type SocialLibraryProfile = {
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type LibraryPublicCounts = {
  posts?: number;
  followers?: number;
  following?: number;
  reactions?: number;
  comments?: number;
  views?: number;
};

const CACHE_MS = 12 * 60 * 60 * 1000;
const FETCH_MS = 6000;

type CachedProfile = SocialLibraryProfile & { fetchedAt: string };

export async function resolveSocialLibraryProfile(
  db: Pool,
  platform: SocialLibraryPlatform
): Promise<SocialLibraryProfile> {
  const cached = await readCachedProfile(db, platform);
  const cacheFresh =
    Boolean(cached?.avatarUrl) && Date.now() - Date.parse(cached!.fetchedAt) < CACHE_MS;
  if (cached && cacheFresh) {
    return withDisplayAvatar(platform, cached);
  }
  try {
    const live = await fetchLiveProfile(db, platform);
    if (live.displayName || live.username || live.avatarUrl) {
      await writeCachedProfile(db, platform, live);
      return withDisplayAvatar(platform, live);
    }
  } catch {
    /* keep cached / empty */
  }
  return cached
    ? withDisplayAvatar(platform, cached)
    : { displayName: "", username: "", avatarUrl: "" };
}

async function fetchLiveProfile(db: Pool, platform: SocialLibraryPlatform): Promise<SocialLibraryProfile> {
  if (platform === "devto") return fetchDevtoProfile(db);
  if (platform === "mastodon") return fetchMastodonProfile(db);
  if (platform === "bluesky") return fetchBlueskyProfile(db);
  if (platform === "linkedin_member") return fetchLinkedInProfile(db);
  return fetchWechatProfile(db);
}

async function fetchDevtoProfile(db: Pool): Promise<SocialLibraryProfile> {
  const key = await readSecret(db, "devto", "DEVTO_API_KEY");
  if (!key) return emptyProfile();
  const json = await fetchJson("https://dev.to/api/users/me", {
    headers: { "api-key": key, Accept: "application/json" }
  });
  return {
    displayName: String(json.name ?? "").trim(),
    username: String(json.username ?? "").trim(),
    avatarUrl: String(json.profile_image_90 || json.profile_image || "").trim()
  };
}

async function fetchMastodonProfile(db: Pool): Promise<SocialLibraryProfile> {
  const token = await readSecret(db, "mastodon", "MASTODON_ACCESS_TOKEN");
  if (!token) return emptyProfile();
  const instance = resolveHttpUrl((await readSettingColumn(db, "mastodon")) || process.env.MASTODON_INSTANCE_URL || "https://mastodon.social");
  const json = await fetchJson(`${instance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  return {
    displayName: String(json.display_name || json.username || "").trim(),
    username: String(json.acct || json.username || "").trim(),
    avatarUrl: String(json.avatar_static || json.avatar || "").trim()
  };
}

async function fetchBlueskyProfile(db: Pool): Promise<SocialLibraryProfile> {
  const password = await readSecret(db, "bluesky", "BLUESKY_APP_PASSWORD");
  const handle = normalizeHandle((await readSettingColumn(db, "bluesky")) || process.env.BLUESKY_HANDLE || "");
  if (!password || !handle) return emptyProfile();
  const session = await fetchJson("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password })
  });
  const jwt = String(session.accessJwt ?? "").trim();
  if (!jwt) return { displayName: handle, username: handle, avatarUrl: "" };
  const profile = await fetchJson(
    `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  return {
    displayName: String(profile.displayName || handle).trim(),
    username: String(profile.handle || handle).trim(),
    avatarUrl: String(profile.avatar ?? "").trim()
  };
}

async function fetchLinkedInProfile(db: Pool): Promise<SocialLibraryProfile> {
  const token = await readSecret(db, "linkedin_member", "LINKEDIN_MEMBER_ACCESS_TOKEN");
  if (!token) return emptyProfile();
  const json = await fetchJson("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const given = String(json.given_name ?? "").trim();
  const family = String(json.family_name ?? "").trim();
  const name = String(json.name ?? "").trim() || `${given} ${family}`.trim();
  return {
    displayName: name,
    username: String(json.email ?? json.sub ?? "").trim(),
    avatarUrl: String(json.picture ?? "").trim()
  };
}

export async function fetchLibraryPublicCounts(
  db: Pool,
  platform: SocialLibraryPlatform
): Promise<LibraryPublicCounts> {
  try {
    if (platform === "devto") return await devtoCounts(db);
    if (platform === "mastodon") return await mastodonCounts(db);
    if (platform === "bluesky") return await blueskyCounts(db);
    if (platform === "linkedin_member") return await linkedinCounts(db);
  } catch {
    /* public counters are optional */
  }
  return {};
}

function countOf(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.trunc(n);
}

async function fetchAny(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return text ? (JSON.parse(text) as unknown) : null;
  } finally {
    clearTimeout(timer);
  }
}

async function devtoCounts(db: Pool): Promise<LibraryPublicCounts> {
  const key = await readSecret(db, "devto", "DEVTO_API_KEY");
  if (!key) return {};
  const list = await fetchAny("https://dev.to/api/articles/me/published?per_page=1000", {
    headers: { "api-key": key, Accept: "application/json" }
  });
  if (!Array.isArray(list)) return {};
  let reactions = 0;
  let comments = 0;
  let views = 0;
  let viewsKnown = false;
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    reactions += countOf(item.public_reactions_count) ?? 0;
    comments += countOf(item.comments_count) ?? 0;
    const viewCount = countOf(item.page_views_count);
    if (viewCount !== undefined) {
      views += viewCount;
      viewsKnown = true;
    }
  }
  return { posts: list.length, reactions, comments, ...(viewsKnown ? { views } : {}) };
}

async function mastodonCounts(db: Pool): Promise<LibraryPublicCounts> {
  const token = await readSecret(db, "mastodon", "MASTODON_ACCESS_TOKEN");
  if (!token) return {};
  const instance = resolveHttpUrl(
    (await readSettingColumn(db, "mastodon")) || process.env.MASTODON_INSTANCE_URL || "https://mastodon.social"
  );
  const json = (await fetchAny(`${instance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  })) as Record<string, unknown>;
  const posts = countOf(json?.statuses_count);
  const followers = countOf(json?.followers_count);
  const following = countOf(json?.following_count);
  return {
    ...(posts !== undefined ? { posts } : {}),
    ...(followers !== undefined ? { followers } : {}),
    ...(following !== undefined ? { following } : {})
  };
}

async function blueskyCounts(db: Pool): Promise<LibraryPublicCounts> {
  const password = await readSecret(db, "bluesky", "BLUESKY_APP_PASSWORD");
  const handle = normalizeHandle((await readSettingColumn(db, "bluesky")) || process.env.BLUESKY_HANDLE || "");
  if (!password || !handle) return {};
  const session = (await fetchAny("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password })
  })) as Record<string, unknown>;
  const jwt = String(session?.accessJwt ?? "").trim();
  if (!jwt) return {};
  const profile = (await fetchAny(
    `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  )) as Record<string, unknown>;
  const posts = countOf(profile?.postsCount);
  const followers = countOf(profile?.followersCount);
  const following = countOf(profile?.followsCount);
  return {
    ...(posts !== undefined ? { posts } : {}),
    ...(followers !== undefined ? { followers } : {}),
    ...(following !== undefined ? { following } : {})
  };
}

async function linkedinCounts(db: Pool): Promise<LibraryPublicCounts> {
  const token = await readSecret(db, "linkedin_member", "LINKEDIN_MEMBER_ACCESS_TOKEN");
  if (!token) return {};
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": process.env.LINKEDIN_VERSION || "202606"
  };
  const out: LibraryPublicCounts = {};
  try {
    const json = (await fetchAny("https://api.linkedin.com/rest/memberFollowersCount?q=me", { headers })) as Record<
      string,
      unknown
    >;
    const elements = Array.isArray(json?.elements) ? json.elements : [];
    const first =
      elements[0] && typeof elements[0] === "object" ? (elements[0] as Record<string, unknown>) : json || {};
    const followers = countOf(first.memberFollowersCount ?? first.followerCount ?? json?.memberFollowersCount);
    if (followers !== undefined) out.followers = followers;
  } catch {
    /* personal follower totals are often closed */
  }
  try {
    const cfg = await readConfig(db, "linkedin_member");
    const urn = String(cfg.memberUrn || process.env.LINKEDIN_MEMBER_URN || "").trim();
    if (urn) {
      const json = (await fetchAny(
        `https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(urn)}&count=1&start=0`,
        { headers }
      )) as Record<string, unknown>;
      const paging =
        json?.paging && typeof json.paging === "object" ? (json.paging as Record<string, unknown>) : {};
      const posts = countOf(paging.total);
      if (posts !== undefined) out.posts = posts;
    }
  } catch {
    /* personal post totals are often closed */
  }
  return out;
}

async function fetchWechatProfile(db: Pool): Promise<SocialLibraryProfile> {
  const secret = await readSecret(db, "wechat_official");
  const cfg = await readConfig(db, "wechat_official");
  const appId = String(cfg.appId ?? "").trim();
  if (!secret || !appId) return emptyProfile();
  const tokenJson = await fetchJson("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid: appId, secret, force_refresh: false })
  });
  const accessToken = String(tokenJson.access_token ?? "").trim();
  if (!accessToken) return emptyProfile();
  const info = await fetchJson(
    `https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo?access_token=${encodeURIComponent(accessToken)}`
  );
  return {
    displayName: pickWechatName(info, String(cfg.accountName ?? "")),
    username: String(info.alias || appId).trim(),
    avatarUrl: pickWechatAvatar(info)
  };
}

async function readCachedProfile(db: Pool, platform: string): Promise<CachedProfile | null> {
  const cfg = await readConfig(db, platform);
  const raw = cfg.libraryProfile;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    displayName: String(obj.displayName ?? "").trim(),
    username: String(obj.username ?? "").trim(),
    avatarUrl: String(obj.avatarUrl ?? "").trim(),
    fetchedAt: String(obj.fetchedAt ?? "")
  };
}

async function writeCachedProfile(db: Pool, platform: string, profile: SocialLibraryProfile): Promise<void> {
  const cfg = await readConfig(db, platform);
  cfg.libraryProfile = { ...profile, fetchedAt: new Date().toISOString() };
  await db.query(`UPDATE social_platform_settings SET config_json = ? WHERE platform = ?`, [
    JSON.stringify(cfg),
    platform
  ]);
}

export async function bustSocialLibraryProfileCache(db: Pool, platform: SocialLibraryPlatform): Promise<void> {
  const cfg = await readConfig(db, platform);
  if (!("libraryProfile" in cfg)) return;
  delete cfg.libraryProfile;
  await db.query(`UPDATE social_platform_settings SET config_json = ? WHERE platform = ?`, [
    JSON.stringify(cfg),
    platform
  ]);
}

async function readConfig(db: Pool, platform: string): Promise<Record<string, unknown>> {
  const [rows] = await db.query(`SELECT config_json FROM social_platform_settings WHERE platform = ? LIMIT 1`, [
    platform
  ]);
  const raw = (rows as Array<{ config_json?: string | null }>)[0]?.config_json;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function readSecret(db: Pool, platform: string, envName?: string): Promise<string> {
  if (envName && process.env[envName]?.trim()) return process.env[envName]!.trim();
  const [rows] = await db.query(`SELECT api_key_enc FROM social_platform_settings WHERE platform = ? LIMIT 1`, [
    platform
  ]);
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  return enc ? decryptSecret(enc).trim() : "";
}

async function readSettingColumn(db: Pool, platform: string): Promise<string> {
  const [rows] = await db.query(`SELECT instance_url AS value FROM social_platform_settings WHERE platform = ? LIMIT 1`, [
    platform
  ]);
  return String((rows as Array<{ value?: string | null }>)[0]?.value ?? "").trim();
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await resp.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  } finally {
    clearTimeout(timer);
  }
}

function emptyProfile(): SocialLibraryProfile {
  return { displayName: "", username: "", avatarUrl: "" };
}

function upgradeHttps(raw: string): string {
  const u = String(raw ?? "").trim();
  if (!u) return "";
  return /^http:\/\//i.test(u) ? `https://${u.slice(7)}` : u;
}

function pickWechatName(info: Record<string, unknown>, fallback: string): string {
  return String(info.nickname || info.nick_name || fallback || "").trim();
}

function pickWechatAvatar(info: Record<string, unknown>): string {
  const head = info.head_image_info;
  const nested =
    head && typeof head === "object" && !Array.isArray(head)
      ? String((head as Record<string, unknown>).head_image_url ?? "").trim()
      : "";
  return upgradeHttps(String(info.head_image_url || info.head_img || nested || "").trim());
}

function isWechatCdnAvatar(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("qlogo.cn") || host.includes("qpic.cn") || host.endsWith(".qq.com");
  } catch {
    return false;
  }
}

function withDisplayAvatar(platform: SocialLibraryPlatform, profile: SocialLibraryProfile): SocialLibraryProfile {
  const raw = upgradeHttps(profile.avatarUrl);
  if (!raw) return { ...profile, avatarUrl: "" };
  if (raw.startsWith("/api/") || raw.startsWith("/uploads/")) {
    return { ...profile, avatarUrl: raw };
  }
  if (platform === "wechat_official" && isWechatCdnAvatar(raw)) {
    return {
      ...profile,
      avatarUrl: `/api/wechat-official/image-proxy?url=${encodeURIComponent(raw)}`
    };
  }
  return { ...profile, avatarUrl: raw };
}

function resolveHttpUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/$/, "");
}

function normalizeHandle(raw: string): string {
  return String(raw ?? "").trim().replace(/^@+/, "");
}
