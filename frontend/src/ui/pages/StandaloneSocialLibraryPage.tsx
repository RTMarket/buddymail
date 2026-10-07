import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChannelConnectBoard, ChannelMark } from "./ChannelConnectBoard";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { apiJson } from "../../lib/api";
import {
  readTikTokJson,
  TIKTOK_LS_ACCOUNTS,
  TIKTOK_LS_LIBRARY_LOGGED,
  TIKTOK_LS_QUEUE,
  writeTikTokJson
} from "../../lib/tiktokPublisherStorage";
import {
  appendTikTokLibraryLogs,
  deleteSocialLibraryAsset,
  deleteSocialLibraryNamedDraft,
  loadChannelAccounts,
  loadSocialLibrary,
  loadSocialLibraryNamedDraft,
  publishNostrChannel,
  publishSlackChannel,
  publishTelegramChannel,
  publishSocialLibrary,
  saveSocialLibraryDraft,
  saveSocialLibraryNamedDraft,
  saveSocialLibrarySettings,
  uploadSocialLibraryAsset,
  type ChannelAccount,
  type SocialLibraryAsset,
  type SocialLibraryDraft,
  type SocialLibraryNamedDraft,
  type SocialLibraryPlatform,
  type SocialLibraryPublishLog,
  type SocialPlatformStatus,
  type SocialPublishResult
} from "../../lib/standaloneSocialLibraryApi";

const CHANNEL_PICK_KEY = "bss_social_channel_picked_v1";

function readSavedChannelPicks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CHANNEL_PICK_KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSavedChannelPicks(ids: string[]) {
  localStorage.setItem(CHANNEL_PICK_KEY, JSON.stringify(ids));
}

const LIBRARY_ACCOUNT_ROW1: SocialLibraryPlatform[] = ["devto", "mastodon", "bluesky"];
const LIBRARY_ACCOUNT_ROW2: SocialLibraryPlatform[] = ["linkedin_member"];
const PLATFORM_ORDER: SocialLibraryPlatform[] = [...LIBRARY_ACCOUNT_ROW1, ...LIBRARY_ACCOUNT_ROW2];
function libraryTikTokSandboxHint(_slot: number): string {
  return "点接入后会打开 TikTok 登录页。当前浏览器若已登录非 Target 号，会直接报 non_sandbox_target，请用无痕窗口或先退出 TikTok。";
}
const LIBRARY_TIKTOK_SLOTS = [1, 2, 3, 4] as const;
const LIBRARY_TIKTOK_ROW_WITH_LINKEDIN = [1, 2] as const;
const LIBRARY_TIKTOK_ROW_BELOW = [3, 4] as const;

type PublishMediaRule = {
  title: boolean;
  copy: boolean;
  image: boolean;
  video: boolean;
  noteZh: string;
  noteEn: string;
};

const PUBLISH_MEDIA_RULES: Record<string, PublishMediaRule> = {
  devto: {
    title: true,
    copy: true,
    image: true,
    video: false,
    noteZh: "选图后发布，自动把图片链接接到文案后面，不用自己写链接。视频也只附链接。",
    noteEn: "On publish, selected images are appended as links. Video is a link too."
  },
  mastodon: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "一次可发：文案 + 最多 4 张图或视频",
    noteEn: "One post: copy + up to 4 images or videos"
  },
  bluesky: {
    title: false,
    copy: true,
    image: true,
    video: false,
    noteZh: "一次可发：文案 + 最多 4 张图。不能带视频。",
    noteEn: "One post: copy + up to 4 images. No video."
  },
  linkedin_member: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "已授权个人账号，可发文案+图",
    noteEn: "Authorized personal account. Copy and images."
  },
  tiktok: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "发视频或图文。标题和文案一起提交。",
    noteEn: "Video or photo post. Title and copy are submitted together."
  },
  threads: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "文案最多 500 字，可发图、视频、轮播。没有标题栏。",
    noteEn: "Copy up to 500 characters, plus image, video, or carousel. No title."
  },
  nostr: {
    title: false,
    copy: true,
    image: true,
    video: false,
    noteZh: "图片以链接写进正文，不用自己贴链接。不传视频文件。",
    noteEn: "Images are written into the post as links. No video file."
  },
  lens: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "链上帖。文案可带图或视频，没有标题栏。",
    noteEn: "On-chain post. Copy with image or video. No title."
  },
  wordpress: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "如果开通，仍需成立平台网站，每月最低 4 美金。",
    noteEn: "Enabling it still needs your own site, from $4 a month."
  },
  ghost: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "文章必须有标题。图片可做特色图，视频嵌入正文。",
    noteEn: "Title required. Image as feature image, video embedded."
  },
  blogger: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "博文要标题和正文。图片、视频放进正文。",
    noteEn: "Blog post needs title and body. Image and video go in the body."
  },
  tumblr: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "可发图文或视频。标题可以不填。",
    noteEn: "Photo, text, or video post. Title is optional."
  },
  youtube: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "上传视频必须带视频。标题和描述一起交，图片做封面。",
    noteEn: "Video upload needs a video. Title, description, and thumbnail."
  },
  pinterest: {
    title: true,
    copy: true,
    image: true,
    video: true,
    noteZh: "创建 Pin。图片或视频至少一种，可带标题和描述。",
    noteEn: "Create a Pin. Image or video required, title and description optional."
  },
  telegram: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "Bot 发到频道。文案可带图或视频，没有标题栏。",
    noteEn: "Bot posts to a channel. Copy with image or video. No title."
  },
  discord: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "Webhook 发到频道。文案可带图或视频文件。",
    noteEn: "Webhook to a channel. Copy with an image or video file."
  },
  slack: {
    title: false,
    copy: true,
    image: true,
    video: true,
    noteZh: "文案发出去。图片和视频以链接写进正文，不上传文件。",
    noteEn: "Copy is posted. Images and videos are links in the message. Files are not uploaded."
  },
  google_business: {
    title: false,
    copy: true,
    image: true,
    video: false,
    noteZh: "本地帖。文案可带图片，不传视频文件。",
    noteEn: "Local post. Copy and image. No video file."
  }
};

const PUBLISH_CHANNEL_ORDER = [
  "threads",
  "nostr",
  "lens",
  "blogger",
  "tumblr",
  "youtube",
  "pinterest",
  "telegram",
  "discord",
  "slack",
  "google_business",
  "ghost",
  "wordpress"
] as const;

function PublishPickCard({
  name,
  note,
  checked,
  disabled,
  onToggle,
  mark,
  rule,
  t
}: {
  name: string;
  note: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  mark: React.ReactNode;
  rule: PublishMediaRule;
  t: (zh: string, en: string) => string;
}) {
  const cells = [
    [t("标题", "Title"), rule.title],
    [t("文案", "Copy"), rule.copy],
    [t("图片", "Image"), rule.image],
    [t("视频", "Video"), rule.video]
  ] as const;
    return (
    <label
      className={`flex flex-col rounded-md border px-2 py-1.5 text-xs ${
        disabled ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <input type="checkbox" className="shrink-0" disabled={disabled} checked={checked} onChange={onToggle} />
        <span className="shrink-0">{mark}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
      </span>
      <span className="mt-1 flex gap-2 text-[10px] leading-none">
        {cells.map(([label, on]) => (
          <span key={label} className={on ? "text-slate-700" : "text-slate-300"}>
            {label}
          </span>
        ))}
      </span>
      <span className="mt-1 text-[10px] leading-snug text-slate-500">{note}</span>
    </label>
  );
}

function accountPublicStats(
  item: SocialPlatformStatus | undefined,
  t: (zh: string, en: string) => string
): string | null {
  if (!item) return null;
  const parts: string[] = [];
  if (typeof item.posts === "number") parts.push(t(`帖子 ${item.posts}`, `${item.posts} posts`));
  if (typeof item.followers === "number") parts.push(t(`关注 ${item.followers} 人`, `${item.followers} followers`));
  if (typeof item.following === "number") parts.push(t(`正在关注 ${item.following}`, `following ${item.following}`));
  if (typeof item.reactions === "number") parts.push(t(`反应 ${item.reactions}`, `${item.reactions} reactions`));
  if (typeof item.comments === "number") parts.push(t(`评论 ${item.comments}`, `${item.comments} comments`));
  if (typeof item.views === "number") parts.push(t(`阅读 ${item.views}`, `${item.views} views`));
  return parts.length ? parts.join(" · ") : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("zh-CN", { hour12: false });
}

type LibraryUploadZone = "image" | "video";

type PendingLibraryUpload = {
  key: string;
  zone: LibraryUploadZone;
  file: File;
  name: string;
};

function isAllowedImageFile(file: File): boolean {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/") && !mime.includes("svg")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

function isAllowedVideoFile(file: File): boolean {
  const mime = String(file.type || "").toLowerCase();
  if (mime === "video/mp4") return true;
  return /\.mp4$/i.test(file.name);
}

function defaultUploadName(file: File, zone: LibraryUploadZone): string {
  const raw = String(file.name || "").trim();
  if (raw) return raw;
  return zone === "video" ? "video.mp4" : "image.jpg";
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

function captureVideoPosterBlob(src: File | string, timeoutMs = 10000): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");
    const objectUrl = src instanceof File ? URL.createObjectURL(src) : "";
    const mediaSrc = src instanceof File ? objectUrl : src;
    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const grab = () => {
      if (video.videoWidth < 2) return false;
      const canvas = document.createElement("canvas");
      const maxW = 480;
      const scale = Math.min(1, maxW / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.82);
      return true;
    };
    video.addEventListener("seeked", () => {
      if (!grab()) finish(null);
    });
    video.addEventListener("loadeddata", () => {
      const t = Number.isFinite(video.duration) && video.duration > 0.4 ? 0.25 : 0.01;
      try {
        video.currentTime = t;
      } catch {
        if (!grab()) finish(null);
      }
    });
    video.addEventListener("error", () => finish(null));
    video.src = mediaSrc;
    void video
      .play()
      .then(() => {
        video.pause();
      })
      .catch(() => {});
  });
}

function SocialLibraryVideoThumb({
  url,
  posterUrl,
  label
}: {
  url: string;
  posterUrl?: string;
  label: string;
}) {
  const [poster, setPoster] = useState(posterUrl || "");
  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
      return;
    }
    let cancelled = false;
    let created = "";
    void captureVideoPosterBlob(url).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setPoster(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, posterUrl]);
  return (
    <div className="relative h-28 w-full bg-slate-900">
      {poster ? (
        <img src={poster} alt="" className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center text-xs font-semibold text-white/80">{label}</div>
      )}
      <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
      </span>
    </div>
  );
}

function PlatformMark({
  platform,
  className
}: {
  platform: SocialLibraryPlatform | "tiktok";
  className?: string;
}) {
  const cls = className ?? "h-5 w-5";
  if (platform === "devto") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#0A0A0A" />
        <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">
          DEV
        </text>
      </svg>
    );
  }
  if (platform === "mastodon") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#6364FF" />
        <path
          fill="#fff"
          d="M17.2 13.9c-.3 1.6-2.7 3.3-5.4 3.3h-.1c-2.7 0-5.1-1.7-5.4-3.3-.1-.7-.1-1.4 0-2.1.2-1.5.9-2.3 2.1-2.6.4-.1.8 0 1.1.2.4-1.3 1.4-2.1 2.8-2.1s2.4.8 2.8 2.1c.3-.2.7-.3 1.1-.2 1.2.3 1.9 1.1 2.1 2.6.1.7.1 1.4 0 2.1z"
        />
      </svg>
    );
  }
  if (platform === "bluesky") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#0085FF" />
        <path
          fill="#fff"
          d="M8.2 7.1c1.5 1.1 3.1 3.4 3.8 4.6.7-1.2 2.3-3.5 3.8-4.6 1.1-.8 2.9-1.4 2.9 1.1 0 .5-.3 4.2-.5 4.8-.6 2.1-2.7 2.7-4.6 2.3 3.3.6 4.1 2.4 2.3 4.3-3.4 3.5-4.9-.9-5.3-2-.1-.3-.2-.5-.2-.5s-.1.2-.2.5c-.4 1.1-1.9 5.5-5.3 2-1.8-1.9-1-3.7 2.3-4.3-1.9.3-4-.2-4.6-2.3-.2-.6-.5-4.3-.5-4.8 0-2.5 1.8-1.9 2.9-1.1z"
        />
      </svg>
    );
  }
  if (platform === "linkedin_member") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#0A66C2" />
        <path
          fill="#fff"
          d="M8.3 9.3H6.1V18h2.2V9.3zM7.2 6C6.4 6 5.8 6.6 5.8 7.4c0 .8.6 1.4 1.4 1.4s1.4-.6 1.4-1.4C8.6 6.6 8 6 7.2 6zM18 18h-2.2v-4.4c0-1.3-.5-2.1-1.6-2.1-1 0-1.5.7-1.7 1.3-.1.2-.1.6-.1.9V18H10.2s.1-7.5 0-8.7h2.2v1.4c.4-.6 1.2-1.6 2.9-1.6 2.1 0 3.7 1.4 3.7 4.3V18z"
        />
      </svg>
    );
  }
  if (platform === "tiktok") {
    const note =
      "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z";
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#000" />
        <path fill="#25F4EE" d={note} transform="translate(5.7 4.6) scale(0.56)" />
        <path fill="#FE2C55" d={note} transform="translate(4.4 5.4) scale(0.56)" />
        <path fill="#fff" d={note} transform="translate(5.05 5.0) scale(0.56)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#07C160" />
      <path
        fill="#fff"
        d="M9.6 8.2c2.8 0 5 1.8 5 4.1 0 2.3-2.2 4.1-5 4.1-.3 0-.7 0-1-.1l-2.1 1.1.6-1.8c-1.5-.8-2.4-2-2.4-3.3 0-2.3 2.2-4.1 4.9-4.1zm6.7 2c.2 0 .5 0 .7.1 1.6.4 2.7 1.6 2.7 3.1 0 1.1-.7 2.1-1.8 2.7l.4 1.4-1.6-.8c-.3.1-.6.1-.9.1-2.1 0-3.8-1.2-4.3-2.8 2.3-.2 4.2-1.7 4.8-3.8z"
      />
    </svg>
  );
}

type LibraryTikTokAccount = {
  slot: number;
  name?: string;
  username?: string;
  avatarUrl?: string;
  openId?: string;
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  followerCount?: number | null;
  videoCount?: number | null;
  statsChecked?: boolean;
  statsForToken?: string;
};

function formatTikTokCount(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}万`;
  return String(Math.floor(n));
}

function readLibraryTikTokSlot(slot: number): LibraryTikTokAccount {
  const rows = readTikTokJson<LibraryTikTokAccount[]>(TIKTOK_LS_ACCOUNTS, []);
  return rows.find((a) => a.slot === slot) || { slot };
}

function writeLibraryTikTokSlot(slot: number, patch: LibraryTikTokAccount) {
  const rows = readTikTokJson<LibraryTikTokAccount[]>(TIKTOK_LS_ACCOUNTS, []);
  const next = rows.some((a) => a.slot === slot)
    ? rows.map((a) => (a.slot === slot ? { ...a, ...patch } : a))
    : [...rows, { ...patch, slot }];
  writeTikTokJson(TIKTOK_LS_ACCOUNTS, next);
}

function tiktokAccountReady(a?: LibraryTikTokAccount): boolean {
  return Boolean(a?.accessToken && a.accessToken.length >= 20 && a.openId);
}

function tiktokAccountTitle(a: LibraryTikTokAccount): string {
  if (a.username) return `@${String(a.username).replace(/^@/, "")}`;
  if (a.name) return a.name;
  return "已授权账号";
}

function libraryAvatarSrc(url?: string, platform?: SocialLibraryPlatform | "tiktok"): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/") || raw.startsWith("/uploads/")) return raw;
  const https = raw.replace(/^http:\/\//i, "https://");
  if (platform === "wechat_official" || /qlogo\.cn|qpic\.cn/i.test(https)) {
    return `/api/wechat-official/image-proxy?url=${encodeURIComponent(https)}`;
  }
  if (platform === "tiktok" || /tiktokcdn|ttwstatic|muscdn|bytecdn|ibyteimg/i.test(https)) {
    return `/api/tiktok/avatar-proxy?url=${encodeURIComponent(https)}`;
  }
  return https;
}

function LibraryLinkedInAuthCard({
  t,
  item,
  onAuthorized,
  syncing,
  onSync
}: {
  t: (zh: string, en: string) => string;
  item?: SocialPlatformStatus;
  onAuthorized: () => Promise<void> | void;
  syncing: boolean;
  onSync: () => void;
}) {
  const [showAuthWin, setShowAuthWin] = useState(false);
  const [authFrame, setAuthFrame] = useState("/api/linkedin/oauth/authorize?popup=1");
  const on = Boolean(item?.configured);
  const name = item?.displayName || item?.account || "";
  const statsLine = on ? accountPublicStats(item, t) : null;

  const claimPending = useCallback(async () => {
    try {
      const pending = await apiJson<{
        ok?: boolean;
        name?: string;
        memberUrn?: string;
        message?: string;
      }>("/api/linkedin/oauth/pending");
      if (pending.ok) {
        setShowAuthWin(false);
        await onAuthorized();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }, [onAuthorized]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { source?: string; ok?: boolean; message?: string } | null;
      if (!data || data.source !== "bss-linkedin-oauth") return;
      if (data.ok) void claimPending();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [claimPending]);

  const openPopup = () => {
    const url = `/api/linkedin/oauth/authorize?popup=1&t=${Date.now()}`;
    setAuthFrame(url);
    setShowAuthWin(true);
    const w = 520;
    const h = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
    const win = window.open(url, "bss_linkedin_oauth", `width=${w},height=${h},left=${left},top=${top}`);
    if (win) {
      try {
        win.focus();
      } catch {
        /* overlay remains */
      }
    }
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        on ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <PlatformMark platform="linkedin_member" className="h-8 w-8 shrink-0" />
      {on && item?.avatarUrl ? (
        <img
          src={libraryAvatarSrc(item.avatarUrl, "linkedin_member")}
          alt=""
          referrerPolicy="no-referrer"
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            on ? "bg-white text-emerald-800" : "bg-white text-slate-400"
          }`}
        >
          in
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{item?.label ?? "LinkedIn"}</p>
        <p className={`truncate text-xs ${on ? "text-emerald-800" : "text-slate-500"}`}>
          {on ? t("已接通", "Ready") : t("未授权", "Not connected")}
          {on && name ? ` · ${name}` : ""}
        </p>
        {statsLine ? (
          <p className="mt-0.5 text-xs text-emerald-800">{statsLine}</p>
        ) : on ? null : (
          <p className="truncate text-[11px] text-slate-500">
            {t("点接入后弹出 LinkedIn 登录授权窗口", "Opens a LinkedIn login popup")}
          </p>
        )}
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={openPopup}
            className={
              on
                ? "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                : "inline-flex h-7 items-center rounded-md bg-[#0A66C2] px-2.5 text-[11px] font-semibold text-white hover:bg-[#004182]"
            }
          >
            {on ? t("重新授权", "Re-authorize") : t("接入授权", "Connect")}
          </button>
          {statsLine ? (
            <button
              type="button"
              disabled={syncing}
              onClick={onSync}
              className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {syncing ? t("同步中", "Syncing") : t("同步", "Sync")}
            </button>
          ) : null}
        </div>
      </div>
      {showAuthWin ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="flex h-[720px] w-[520px] max-h-[92vh] max-w-[96vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#0A66C2] px-3 py-2">
              <p className="text-sm font-semibold text-white">{t("LinkedIn 授权", "LinkedIn authorization")}</p>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs font-semibold text-white hover:bg-white/15"
                onClick={() => setShowAuthWin(false)}
              >
                {t("关闭", "Close")}
              </button>
            </div>
            <iframe title="LinkedIn OAuth" src={authFrame} className="min-h-0 flex-1 border-0 bg-white" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LibraryTikTokAuthCard({
  t,
  slot
}: {
  t: (zh: string, en: string) => string;
  slot: number;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [acc, setAcc] = useState<LibraryTikTokAccount>(() => readLibraryTikTokSlot(slot));
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);
  const [askTikTokLogin, setAskTikTokLogin] = useState(false);
  const accRef = useRef(acc);
  accRef.current = acc;
  const ready = tiktokAccountReady(acc);

  useEffect(() => {
    const stored = readLibraryTikTokSlot(slot);
    if (tiktokAccountReady(stored)) setAcc(stored);
  }, [slot]);

  useEffect(() => {
    if (!tiktokAccountReady(acc) || !acc.accessToken) return;
    const token = acc.accessToken;
    let cancelled = false;
    const pull = async () => {
      try {
        const profile = await apiJson<{
          ok?: boolean;
          name?: string;
          username?: string;
          avatarUrl?: string;
          followerCount?: number | null;
          videoCount?: number | null;
        }>("/api/tiktok/profile-detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token })
        });
        if (cancelled || !profile.ok) return;
        const cur = accRef.current;
        const next = {
          ...cur,
          avatarUrl: profile.avatarUrl || cur.avatarUrl,
          name: profile.name || cur.name,
          username: profile.username || cur.username,
          followerCount: typeof profile.followerCount === "number" ? profile.followerCount : cur.followerCount ?? null,
          videoCount: typeof profile.videoCount === "number" ? profile.videoCount : cur.videoCount ?? null,
          statsChecked: true,
          statsForToken: token
        };
        writeLibraryTikTokSlot(slot, next);
        setAcc(next);
      } catch {
        /* keep last shown counts */
      }
    };
    void pull();
    const onRefresh = () => {
      if (document.visibilityState === "hidden") return;
      void pull();
    };
    window.addEventListener("bss-tiktok-stats-refresh", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("bss-tiktok-stats-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [slot, acc.accessToken]);

  useEffect(() => {
    let cancelled = false;
    const oauth = searchParams.get("oauth");
    const qSlot = Number(searchParams.get("slot") ?? 0);
    if (oauth === "err" && (qSlot === slot || !qSlot)) {
      setOauthMsg(searchParams.get("msg") || t("授权失败", "Authorization failed"));
      setSearchParams({}, { replace: true });
      return;
    }
    void (async () => {
      try {
        const pending = await apiJson<{
          ok: boolean;
          accessToken?: string;
          refreshToken?: string;
          openId?: string;
          displayName?: string;
          username?: string;
          avatarUrl?: string;
          scope?: string;
          message?: string;
        }>(`/api/tiktok/oauth/pending?slot=${slot}`);
        if (cancelled) return;
        if (!pending.ok || !pending.accessToken || !pending.openId) {
          if (oauth === "ok" && qSlot === slot && !tiktokAccountReady(accRef.current)) {
            setOauthMsg(pending.message || t("领取授权失败，请再点一次接入授权", "Claim failed, try again"));
          }
          return;
        }
        let name = pending.displayName || pending.username || "";
        let username = pending.username || "";
        let avatarUrl = pending.avatarUrl || "";
        let followerCount: number | null = null;
        let videoCount: number | null = null;
        try {
          const profile = await apiJson<{
            ok: boolean;
            name?: string;
            username?: string;
            avatarUrl?: string;
            followerCount?: number | null;
            videoCount?: number | null;
          }>("/api/tiktok/profile-detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: pending.accessToken })
          });
          if (profile.ok) {
            if (profile.name) name = profile.name;
            if (profile.username) username = profile.username;
            if (profile.avatarUrl) avatarUrl = profile.avatarUrl;
            if (typeof profile.followerCount === "number") followerCount = profile.followerCount;
            if (typeof profile.videoCount === "number") videoCount = profile.videoCount;
          }
        } catch {
          /* keep pending fields */
        }
        if (cancelled) return;
        const next: LibraryTikTokAccount = {
          slot,
          accessToken: pending.accessToken,
          refreshToken: pending.refreshToken || "",
          openId: pending.openId,
          name,
          username,
          avatarUrl,
          followerCount,
          videoCount,
          statsChecked: true,
          statsForToken: pending.accessToken,
          scope: pending.scope || ""
        };
        writeLibraryTikTokSlot(slot, next);
        setAcc(next);
        const label = next.username ? `@${next.username.replace(/^@/, "")}` : next.name || "TikTok";
        setOauthMsg(`${t("授权成功", "Authorized")}：${label}`);
      } catch (e) {
        if (oauth === "ok" && qSlot === slot && !tiktokAccountReady(accRef.current)) {
          setOauthMsg(String((e as Error)?.message ?? e));
        }
      } finally {
        if (oauth === "ok" || oauth === "err") {
          setSearchParams({}, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, t]);

  return (
    <div
      data-bss-library-tiktok="1"
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <PlatformMark platform="tiktok" className="h-8 w-8 shrink-0" />
      {ready && acc.avatarUrl ? (
        <img
          src={libraryAvatarSrc(acc.avatarUrl, "tiktok")}
          alt=""
          referrerPolicy="no-referrer"
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            ready ? "bg-white text-emerald-800" : "bg-white text-slate-400"
          }`}
        >
          T
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">TikTok {slot}</p>
        <p className={`truncate text-xs ${ready ? "text-emerald-800" : "text-slate-500"}`}>
          {ready ? t("已接通", "Ready") : t("未授权", "Not connected")}
          {ready ? ` · ${tiktokAccountTitle(acc)}` : ""}
        </p>
        {ready ? (
          <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-800">
            {t("粉丝", "Followers")} {formatTikTokCount(acc.followerCount)}
            <span className="mx-1 text-slate-300">·</span>
            {t("作品", "Posts")} {formatTikTokCount(acc.videoCount)}
          </p>
        ) : (
          <p className="text-[11px] leading-4 text-slate-500">{libraryTikTokSandboxHint(slot)}</p>
        )}
        {oauthMsg ? <p className="truncate text-[11px] text-amber-800">{oauthMsg}</p> : null}
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setAskTikTokLogin(true)}
            className={
              ready
                ? "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                : "inline-flex h-7 items-center rounded-md bg-black px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
            }
          >
            {ready ? t("重新授权", "Re-authorize") : t("接入授权", "Connect")}
          </button>
        </div>
      </div>
      {askTikTokLogin ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p className="text-base font-semibold text-slate-900">
              {t("下一步应出现 TikTok 登录页", "TikTok login should open next")}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t(
                "你刚看到的「non_sandbox_target」不是登录页，是 TikTok 沙箱拒绝了当前浏览器里已经登录的账号。沙箱只能授权你在开发者后台加过的 Target users（最多 10 个）。请先退出 tiktok.com 上的账号，或改用无痕窗口打开本站，再点下面按钮；登录成功后才会出现头像和同意授权。",
                "non_sandbox_target means the TikTok account already signed in this browser is not a sandbox Target user. Log out of tiktok.com or use a private window, then continue."
              )}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                onClick={() => setAskTikTokLogin(false)}
              >
                {t("取消", "Cancel")}
              </button>
              <a
                href={`/api/tiktok/oauth/authorize?slot=${slot}&disable_auto_auth=1&return=library`}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white"
              >
                {t("打开 TikTok 登录", "Open TikTok login")}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function syncSubmittedTikTokLogs(): Promise<SocialLibraryPublishLog[] | null> {
  const queue = readTikTokJson<
    Array<{ id?: string; accountSlot?: number; title?: string; status?: string; publishId?: string; error?: string }>
  >(TIKTOK_LS_QUEUE, []);
  const logged = new Set(readTikTokJson<string[]>(TIKTOK_LS_LIBRARY_LOGGED, []));
  const pending = queue.filter(
    (item) =>
      Boolean(item?.id) &&
      !logged.has(String(item.id)) &&
      (item.status === "published" || item.status === "publishing" || item.status === "failed")
  );
  if (!pending.length) return null;
  const batch = pending.slice(0, 40);
  const saved = await appendTikTokLibraryLogs(
    batch.map((item) => ({
      title: String(item.title || `TikTok ${item.accountSlot || ""}`).trim() || "TikTok",
      results: [
        {
          platform: "tiktok",
          ok: item.status !== "failed",
          message:
            item.status === "failed"
              ? `TikTok ${item.accountSlot || ""}：${item.error || "提交失败"}`
              : item.publishId
                ? `已提交发布 TikTok ${item.accountSlot || ""} ${item.publishId}`
                : `已提交 TikTok ${item.accountSlot || ""} 发布`
        }
      ]
    }))
  );
  writeTikTokJson(TIKTOK_LS_LIBRARY_LOGGED, [...logged, ...batch.map((item) => String(item.id))]);
  return saved?.logs ?? null;
}

export function StandaloneSocialLibraryPage() {
  const { locale } = useSiteLocale();
  const t = useCallback((zh: string, en: string) => (locale === "en" ? en : zh), [locale]);

  const [assets, setAssets] = useState<SocialLibraryAsset[]>([]);
  const [draft, setDraft] = useState<SocialLibraryDraft>({
    title: "",
    body: "",
    selectedAssetIds: [],
    selectedPlatforms: [],
    updatedAt: null
  });
  const [platforms, setPlatforms] = useState<SocialPlatformStatus[]>([]);
  const [logs, setLogs] = useState<SocialLibraryPublishLog[]>([]);
  const [namedDrafts, setNamedDrafts] = useState<SocialLibraryNamedDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    devtoApiKey: "",
    mastodonInstanceUrl: "https://mastodon.social",
    mastodonAccessToken: "",
    blueskyHandle: "",
    blueskyAppPassword: "",
    linkedinAccessToken: "",
    linkedinMemberUrn: "",
  });
  const [pendingUploads, setPendingUploads] = useState<PendingLibraryUpload[]>([]);
  const [lastResults, setLastResults] = useState<SocialPublishResult[] | null>(null);
  const [tiktokPicked, setTiktokPicked] = useState<number[]>([]);
  const [channels, setChannels] = useState<ChannelAccount[]>([]);
  const [channelPicked, setChannelPicked] = useState<string[]>(() => readSavedChannelPicks());
  const tiktokWillPublish = tiktokPicked.some((slot) => tiktokAccountReady(readLibraryTikTokSlot(slot)));
  const channelWillPublish = channelPicked.some((id) => channels.some((row) => row.id === id && row.configured));

  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await loadSocialLibrary();
    setAssets(data.assets);
    setDraft({
      ...data.draft,
      selectedPlatforms: (data.draft.selectedPlatforms || []).filter((p) => p !== "wechat_official")
    });
    setNamedDrafts(data.namedDrafts ?? []);
    setPlatforms(data.platforms);
    setLogs(data.logs);
    const channelRes = await loadChannelAccounts().catch(() => null);
    if (channelRes) setChannels(channelRes.channels);
    const synced = await syncSubmittedTikTokLogs();
    if (synced) setLogs(synced);
  }, []);

  const syncPlatform = useCallback(
    async (id: string) => {
      setSyncingPlatform(id);
      try {
        await refresh();
      } finally {
        setSyncingPlatform(null);
      }
    },
    [refresh]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((e: unknown) => {
        if (!cancelled) setErr(String((e as Error)?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const selectedSet = useMemo(() => new Set(draft.selectedAssetIds), [draft.selectedAssetIds]);
  const platformSet = useMemo(() => new Set(draft.selectedPlatforms), [draft.selectedPlatforms]);
  const imageAssets = useMemo(() => assets.filter((a) => a.kind !== "video"), [assets]);
  const videoAssets = useMemo(() => assets.filter((a) => a.kind === "video"), [assets]);

  function queueUploads(zone: LibraryUploadZone, files: FileList | null) {
    if (!files?.length) return;
    const next: PendingLibraryUpload[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const ok = zone === "video" ? isAllowedVideoFile(file) : isAllowedImageFile(file);
      if (!ok) {
        rejected.push(file.name || file.type || "file");
        continue;
      }
      next.push({
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        zone,
        file,
        name: defaultUploadName(file, zone)
      });
    }
    if (rejected.length) {
      setErr(
        zone === "video"
          ? t(`视频区只支持 mp4：${rejected.join("、")}`, `Video zone accepts mp4 only: ${rejected.join(", ")}`)
          : t(`图片区请使用 png / jpg / jpeg 等图片：${rejected.join("、")}`, `Image zone accepts png/jpg/jpeg: ${rejected.join(", ")}`)
      );
    } else {
      setErr(null);
    }
    if (!next.length) return;
    setPendingUploads((prev) => [...prev, ...next]);
    setMsg(t("已填入命名区，改好名称后点保存才会进入文件库。", "Names are ready. Save to add them to the library."));
  }

  async function onSavePendingUploads() {
    if (!pendingUploads.length) {
      setErr(t("请先在图片区或视频区选择文件。", "Choose files in the image or video zone first."));
      return;
    }
    const unnamed = pendingUploads.find((row) => !row.name.trim());
    if (unnamed) {
      setErr(t("请填写名称后再保存到文件库。", "Enter a name before saving to the library."));
      return;
    }
    setBusy("upload");
    setErr(null);
    setMsg(t("正在保存到文件库…", "Saving to library…"));
    try {
      await saveSocialLibraryDraft({
        title: draft.title,
        body: draft.body,
        selectedAssetIds: draft.selectedAssetIds,
        selectedPlatforms: draft.selectedPlatforms
      });
      const uploaded: SocialLibraryAsset[] = [];
      const names: string[] = [];
      for (const row of pendingUploads) {
        const displayName = row.name.trim();
        names.push(displayName);
        const toSend =
          displayName === row.file.name
            ? row.file
            : new File([row.file], displayName, { type: row.file.type, lastModified: row.file.lastModified });
        const posted = await uploadSocialLibraryAsset(toSend, null);
        const raw = posted as { asset?: SocialLibraryAsset; id?: number; ok?: boolean; assets?: unknown };
        if (Array.isArray(raw.assets) && !raw.asset && !raw.id) {
          throw new Error(t("上传接口没有返回新素材，请刷新后重试。", "Upload did not return a new asset. Refresh and try again."));
        }
        const id = Number(raw.asset?.id ?? raw.id ?? 0);
        if (id > 0) {
          uploaded.push({
            id,
            kind: row.zone === "image" ? "image" : "video",
            fileName: displayName,
            storedName: raw.asset?.storedName ?? "",
            mime: raw.asset?.mime || row.file.type,
            sizeBytes: raw.asset?.sizeBytes ?? row.file.size,
            url: raw.asset?.url ?? "",
            posterUrl: raw.asset?.posterUrl,
            createdAt: raw.asset?.createdAt ?? null
          });
        }
      }
      const data = await loadSocialLibrary();
      if (!uploaded.length) {
        throw new Error(t("没有写入文件库。请检查格式后重新选择并保存。", "Nothing was saved. Check the format and try again."));
      }
      const uploadedIds = uploaded.map((a) => a.id);
      const nextSelected = [...uploadedIds, ...draft.selectedAssetIds.filter((id) => !uploadedIds.includes(id))].slice(
        0,
        12
      );
      const saved = await saveSocialLibraryDraft({
        title: draft.title,
        body: draft.body,
        selectedAssetIds: nextSelected,
        selectedPlatforms: draft.selectedPlatforms
      });
      const merged = [...uploaded, ...data.assets.filter((a) => !uploadedIds.includes(a.id))];
      setAssets(merged);
      setNamedDrafts(data.namedDrafts ?? []);
      setDraft({
        ...saved.draft,
        title: draft.title,
        body: draft.body,
        selectedAssetIds: nextSelected,
        selectedPlatforms: draft.selectedPlatforms
      });
      setPendingUploads([]);
      const label = uploaded.map((a) => a.fileName).filter(Boolean).join("、") || names.join("、");
      setMsg(t(`已保存到文件库并选中：${label}`, `Saved to library and selected: ${label}`));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
      setMsg(null);
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteAsset(id: number) {
    setBusy(`del-${id}`);
    setErr(null);
    try {
      await deleteSocialLibraryAsset(id);
      const nextIds = draft.selectedAssetIds.filter((x) => x !== id);
      const saved = await saveSocialLibraryDraft({ selectedAssetIds: nextIds });
      setDraft(saved.draft);
      await refresh();
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  function toggleAsset(id: number) {
    const next = selectedSet.has(id)
      ? draft.selectedAssetIds.filter((x) => x !== id)
      : [...draft.selectedAssetIds, id];
    setDraft({ ...draft, selectedAssetIds: next });
  }

  function togglePlatform(platform: SocialLibraryPlatform, configured: boolean) {
    if (!configured) return;
    const next = platformSet.has(platform)
      ? draft.selectedPlatforms.filter((x) => x !== platform)
      : [...draft.selectedPlatforms, platform];
    setDraft({ ...draft, selectedPlatforms: next });
  }

  async function onSave() {
    setBusy("save");
    setErr(null);
    try {
      if (!draft.title.trim()) {
        throw new Error(t("保存文案需要先填写标题。", "A title is required to save this copy."));
      }
      const saved = await saveSocialLibraryNamedDraft({
        title: draft.title.trim(),
        body: draft.body,
        selectedAssetIds: draft.selectedAssetIds,
        selectedPlatforms: draft.selectedPlatforms
      });
      setDraft(saved.draft);
      setNamedDrafts(saved.namedDrafts);
      setMsg(t(`已保存到文案库：${saved.named.title}`, `Saved to the copy library: ${saved.named.title}`));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onLoadNamed(id: number) {
    setBusy(`load-${id}`);
    setErr(null);
    try {
      const loaded = await loadSocialLibraryNamedDraft(id);
      setDraft(loaded.draft);
      setMsg(t("已打开这套文案。", "This copy set is open."));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteNamed(id: number) {
    setBusy(`ndel-${id}`);
    setErr(null);
    try {
      const deleted = await deleteSocialLibraryNamedDraft(id);
      setNamedDrafts(deleted.namedDrafts);
      setMsg(t("已从文案库删除。", "Removed from the copy library."));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function publishTikTokFromLibrary(slot: number): Promise<SocialPublishResult> {
    const acc = readLibraryTikTokSlot(slot);
    if (!tiktokAccountReady(acc) || !acc.accessToken || !acc.openId) {
      return { platform: "tiktok", ok: false, message: t(`TikTok ${slot} 请先授权`, `Authorize TikTok ${slot} first`) };
    }
    const selected = assets.filter((a) => draft.selectedAssetIds.includes(a.id));
    const media = selected.map((a) => ({
      type: a.kind === "video" ? ("video" as const) : ("image" as const),
      name: a.fileName,
      url: a.url
    }));
    const posted = await apiJson<{
      ok?: boolean;
      publishId?: string;
      message?: string;
      accessToken?: string | null;
      refreshToken?: string | null;
    }>("/api/tiktok/posts/publish-now", {
      method: "POST",
      body: JSON.stringify({
        accessToken: acc.accessToken,
        refreshToken: acc.refreshToken || "",
        openId: acc.openId,
        title: draft.title,
        body: draft.body,
        postMode: "DIRECT_POST",
        privacyLevel: "SELF_ONLY",
        media
      })
    });
    if (posted.accessToken) {
      writeLibraryTikTokSlot(slot, {
        ...acc,
        accessToken: posted.accessToken,
        refreshToken: posted.refreshToken || acc.refreshToken,
        statsForToken: posted.accessToken
      });
    }
    return {
      platform: "tiktok",
      ok: true,
      message: posted.publishId
        ? `${t("已提交发布", "Submitted")} TikTok ${slot} ${posted.publishId}`
        : t(`已提交 TikTok ${slot} 发布`, `TikTok ${slot} submitted`)
    };
  }

  async function onPublish() {
    setBusy("publish");
    setErr(null);
    setLastResults(null);
    try {
      if (!draft.selectedPlatforms.length && !tiktokWillPublish && !channelWillPublish) {
        throw new Error(t("请至少勾选一个账号。", "Select at least one account."));
      }
      const libraryPlatforms = draft.selectedPlatforms.filter((p) => p !== "wechat_official");
      await saveSocialLibraryDraft({
        title: draft.title,
        body: draft.body,
        selectedAssetIds: draft.selectedAssetIds,
        selectedPlatforms: libraryPlatforms
      });
      const results: SocialPublishResult[] = [];
      let othersStatus: "ok" | "partial" | "failed" | null = null;
      if (libraryPlatforms.length) {
        const published = await publishSocialLibrary({
          title: draft.title,
          body: draft.body,
          assetIds: draft.selectedAssetIds,
          platforms: libraryPlatforms
        });
        results.push(...published.results);
        othersStatus = published.status;
      }
      for (const id of channelPicked) {
        const row = channels.find((item) => item.id === id && item.configured);
        if (!row) continue;
        if (id === "nostr") {
          try {
            const published = await publishNostrChannel({
              title: draft.title,
              body: draft.body,
              assetIds: draft.selectedAssetIds
            });
            results.push(published.result);
          } catch (e: unknown) {
            results.push({
              platform: "nostr",
              ok: false,
              message: String((e as Error)?.message ?? e).slice(0, 800)
            });
          }
          continue;
        }
        if (id === "telegram") {
          try {
            const published = await publishTelegramChannel({
              title: draft.title,
              body: draft.body,
              assetIds: draft.selectedAssetIds
            });
            results.push(published.result);
          } catch (e: unknown) {
            results.push({
              platform: "telegram",
              ok: false,
              message: String((e as Error)?.message ?? e).slice(0, 800)
            });
          }
          continue;
        }
        if (id === "slack") {
          try {
            const published = await publishSlackChannel({
              title: draft.title,
              body: draft.body,
              assetIds: draft.selectedAssetIds
            });
            results.push(published.result);
          } catch (e: unknown) {
            results.push({
              platform: "slack",
              ok: false,
              message: String((e as Error)?.message ?? e).slice(0, 800)
            });
          }
          continue;
        }
        results.push({
          platform: id,
          ok: false,
          message: t("发帖接口还没接上，这次没有发出去。", "Publishing is not connected yet, so nothing was sent.")
        });
      }
      const tiktokSlots = tiktokPicked.filter((slot) => tiktokAccountReady(readLibraryTikTokSlot(slot)));
      for (const slot of tiktokSlots) {
        try {
          results.push(await publishTikTokFromLibrary(slot));
        } catch (e: unknown) {
          results.push({
            platform: "tiktok",
            ok: false,
            message: `TikTok ${slot}：${String((e as Error)?.message ?? e).slice(0, 800)}`
          });
        }
      }
      setLastResults(results);
      const tiktokResults = results.filter((row) => row.platform === "tiktok");
      if (tiktokResults.length) {
        await appendTikTokLibraryLogs([{ title: draft.title || "TikTok", results: tiktokResults }]);
      }
      window.dispatchEvent(new Event("bss-tiktok-stats-refresh"));
      await refresh();
      const okCount = results.filter((r) => r.ok).length;
      const status = okCount === results.length ? "ok" : okCount > 0 ? "partial" : "failed";
      const combined = othersStatus && othersStatus !== "ok" && status === "ok" ? othersStatus : status;
      setMsg(
        combined === "ok"
          ? t("已发布到所选平台。", "Published to selected platforms.")
          : t("部分平台发布失败，请看下方结果。", "Some platforms failed. See results below.")
      );
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onSaveSettings() {
    setBusy("settings");
    setErr(null);
    try {
      const resp = await saveSocialLibrarySettings(settings);
      setPlatforms(resp.platforms);
      setMsg(t("通道设置已保存。", "Channel settings saved."));
      setShowSettings(false);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  function renderAssetTiles(list: SocialLibraryAsset[], emptyText: string) {
    if (loading) return <p className="text-sm text-slate-500">{t("加载中…", "Loading…")}</p>;
    if (!list.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
    return (
      <div className="max-h-[calc(3*10.125rem+2*0.75rem)] overflow-y-auto overscroll-y-contain pr-1">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((asset) => {
          const selected = selectedSet.has(asset.id);
          return (
            <div
              key={asset.id}
              className={`h-[10.125rem] overflow-hidden rounded-lg border ${selected ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200"}`}
            >
              <button type="button" className="block w-full bg-slate-100" onClick={() => toggleAsset(asset.id)}>
                {asset.kind === "image" ? (
                  <img src={asset.url} alt={asset.fileName} className="h-28 w-full object-cover" />
                ) : (
                  <SocialLibraryVideoThumb url={asset.url} posterUrl={asset.posterUrl} label={t("视频", "Video")} />
                )}
              </button>
              <div className="flex items-start justify-between gap-2 p-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{asset.fileName}</p>
                  <p className="text-[10px] text-slate-500">{formatBytes(asset.sizeBytes)}</p>
                </div>
                <button
                  type="button"
                  className="text-[10px] text-rose-600"
                  disabled={busy === `del-${asset.id}`}
                  onClick={() => void onDeleteAsset(asset.id)}
                >
                  {t("删除", "Delete")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    );
  }

  return (
    <PageShell
      title={t("频道区", "Channels")}
      description={t(
        "上传图片或视频，编辑文案并保存。选中下方已接通账号后点击发布。这里只用本站文件库内容，不使用主站后台那套博客队列。",
        "Upload images or videos, edit copy, then publish to already-connected accounts. This library is local to this site."
      )}
    >
      <SectionCard
        title={t("已接通账号", "Connected accounts")}
        description={t(
          "与主站管理后台同一套通道。已接通的账号可以直接勾选发布，不必再填密钥。",
          "Same accounts as the main admin. Connected accounts can publish without re-entering keys."
        )}
        right={
          <button
            type="button"
            className="text-xs font-semibold text-slate-600 underline"
            onClick={() => setShowSettings((v) => !v)}
          >
            {showSettings ? t("收起更换通道", "Hide replace form") : t("更换通道（一般不用）", "Replace channels")}
          </button>
        }
      >
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LIBRARY_ACCOUNT_ROW1.map((id) => {
              const item = platforms.find((p) => p.platform === id);
              const on = Boolean(item?.configured);
              const name = item?.displayName || item?.account || "";
              const handle = item?.hint && item.hint !== name ? item.hint : "";
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    on ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <PlatformMark platform={id} className="h-8 w-8 shrink-0" />
                  {on && item?.avatarUrl ? (
                    <img
                      src={libraryAvatarSrc(item.avatarUrl, id)}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        on ? "bg-white text-emerald-800" : "bg-white text-slate-400"
                      }`}
                    >
                      {(item?.label ?? id).slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item?.label ?? id}</p>
                    <p className={`truncate text-xs ${on ? "text-emerald-800" : "text-slate-500"}`}>
                      {on ? t("已接通", "Ready") : t("未配置", "Not set")}
                      {on && name ? ` · ${name}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {on
                        ? handle || name || t("已授权账号", "Authorized account")
                        : t("主站后台尚未保存此通道", "Not saved on main admin")}
                    </p>
                    {on ? (
                      <p className="mt-0.5 text-xs text-emerald-800">
                        {accountPublicStats(item, t) || t("公开数据暂未返回", "No public counts returned")}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className={
                          on
                            ? "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                            : "inline-flex h-7 items-center rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        }
                      >
                        {on ? t("重新授权", "Re-authorize") : t("接入授权", "Connect")}
                      </button>
                      {on ? (
                        <button
                          type="button"
                          disabled={syncingPlatform === id}
                          onClick={() => void syncPlatform(id)}
                          className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {syncingPlatform === id ? t("同步中", "Syncing") : t("同步", "Sync")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LIBRARY_ACCOUNT_ROW2.map((id) => (
              <LibraryLinkedInAuthCard
                key={id}
                t={t}
                item={platforms.find((p) => p.platform === id)}
                onAuthorized={refresh}
                syncing={syncingPlatform === id}
                onSync={() => void syncPlatform(id)}
              />
            ))}
            {LIBRARY_TIKTOK_ROW_WITH_LINKEDIN.map((slot) => (
              <LibraryTikTokAuthCard key={slot} t={t} slot={slot} />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LIBRARY_TIKTOK_ROW_BELOW.map((slot) => (
              <LibraryTikTokAuthCard key={slot} t={t} slot={slot} />
            ))}
            <ChannelConnectBoard t={t} only={["threads"]} onChange={setChannels} />
          </div>
          <ChannelConnectBoard t={t} skip={["threads"]} onChange={setChannels} />
        </div>
      </SectionCard>

      {showSettings ? (
        <SectionCard
          title={t("更换通道", "Replace channels")}
          description={t(
            "一般不用填。只有要换账号时才在这里补。",
            "Usually unused. Fill only to replace an account."
          )}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              {t("dev.to API Key", "dev.to API Key")}
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.devtoApiKey}
                onChange={(e) => setSettings({ ...settings, devtoApiKey: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Mastodon Access Token
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.mastodonAccessToken}
                onChange={(e) => setSettings({ ...settings, mastodonAccessToken: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Mastodon Instance
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.mastodonInstanceUrl}
                onChange={(e) => setSettings({ ...settings, mastodonInstanceUrl: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Bluesky Handle
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.blueskyHandle}
                onChange={(e) => setSettings({ ...settings, blueskyHandle: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Bluesky App Password
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.blueskyAppPassword}
                onChange={(e) => setSettings({ ...settings, blueskyAppPassword: e.target.value })}
              />
            </label>
            <label className="text-sm">
              LinkedIn Access Token
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={settings.linkedinAccessToken}
                onChange={(e) => setSettings({ ...settings, linkedinAccessToken: e.target.value })}
              />
            </label>
            <label className="text-sm md:col-span-2">
              LinkedIn Member URN
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="urn:li:person:…"
                value={settings.linkedinMemberUrn}
                onChange={(e) => setSettings({ ...settings, linkedinMemberUrn: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-3">
            <button
              type="button"
              disabled={busy === "settings"}
              onClick={() => void onSaveSettings()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "settings" ? t("保存中…", "Saving…") : t("保存通道", "Save channels")}
            </button>
          </div>
        </SectionCard>
      ) : null}

      {err ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}
      {msg ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <SectionCard
        title={t("上传命名", "Upload name")}
        description={t("选择文件后自动显示名称，可修改。点保存后才会进入文件库。", "The file name appears here automatically and can be edited. Save to add it to the library.")}
        right={
          <button
            type="button"
            disabled={busy === "upload" || pendingUploads.length === 0}
            onClick={() => void onSavePendingUploads()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "upload" ? t("保存中…", "Saving…") : t("保存到文件库", "Save to library")}
          </button>
        }
      >
        {pendingUploads.length === 0 ? (
          <p className="text-sm text-slate-500">{t("还没有待保存的文件。请先在下方图片区或视频区选择。", "Nothing pending. Choose files in the image or video zone below.")}</p>
        ) : (
          <ul className="space-y-2">
            {pendingUploads.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                  {row.zone === "video" ? t("视频", "Video") : t("图片", "Image")}
                </span>
                <input
                  className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={row.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPendingUploads((prev) => prev.map((item) => (item.key === row.key ? { ...item, name: value } : item)));
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-rose-600"
                  onClick={() => setPendingUploads((prev) => prev.filter((item) => item.key !== row.key))}
                >
                  {t("移除", "Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("图片区", "Images")}
          description={t("支持 png、jpg、jpeg、webp、gif。点击可选入本次发布。", "png, jpg, jpeg, webp, gif. Click to attach.")}
          right={
            <label className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
              {t("选择图片", "Choose images")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                multiple
                className="hidden"
                disabled={busy === "upload"}
                onChange={(e) => {
                  queueUploads("image", e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          }
        >
          {renderAssetTiles(imageAssets, t("还没有图片。", "No images yet."))}
        </SectionCard>
        <SectionCard
          title={t("视频区", "Videos")}
          description={t("仅支持 mp4。点击可选入本次发布。", "mp4 only. Click to attach.")}
          right={
            <label className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
              {t("选择视频", "Choose videos")}
              <input
                type="file"
                accept="video/mp4,.mp4"
                multiple
                className="hidden"
                disabled={busy === "upload"}
                onChange={(e) => {
                  queueUploads("video", e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          }
        >
          {renderAssetTiles(videoAssets, t("还没有视频。", "No videos yet."))}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("文案", "Copy")}
          description={t("标题和正文是一套。点保存后出现在右边文案库。", "Title and body are one set. Save puts them in the library on the right.")}
          right={
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void onSave()}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "save" ? t("保存中…", "Saving…") : t("保存", "Save")}
            </button>
          }
        >
          <label className="block text-sm font-medium text-slate-700">
            {t("标题", "Title")}
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            {t("正文", "Body")}
            <textarea
              className="mt-1 min-h-[220px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            {t("已选素材", "Selected assets")}：{draft.selectedAssetIds.length} · {t("上次保存", "Saved")}{" "}
            {formatTime(draft.updatedAt)}
          </p>
        </SectionCard>
        <SectionCard
          title={t("文案库", "Copy library")}
          description={t("每条是一套标题和正文。双击打开到左边。", "Each row is one title and body. Double-click to open it on the left.")}
        >
          {namedDrafts.length === 0 ? (
            <p className="text-sm text-slate-500">{t("还没有保存的文案。", "No saved copy yet.")}</p>
          ) : (
            <ul className="h-[220px] space-y-1 overflow-y-scroll pr-1">
              {namedDrafts.map((item, index) => (
                <li key={item.id} className="flex items-start justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    disabled={Boolean(busy)}
                    title={t("双击打开", "Double-click to open")}
                    onDoubleClick={() => void onLoadNamed(item.id)}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 22,
                        height: 22,
                        flexShrink: 0,
                        borderRadius: 4,
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: "22px",
                      }}
                    >
                      {namedDrafts.length - index}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{item.title || t("未命名", "Untitled")}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.body || t("无正文", "No body")}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-rose-600"
                    disabled={busy === `ndel-${item.id}`}
                    onClick={() => void onDeleteNamed(item.id)}
                  >
                    {t("删除", "Delete")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("发布", "Publish")} description={t("勾选账号后发布当前这套文案。", "Check accounts, then publish this copy set.")}>
          <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PLATFORM_ORDER.map((id) => {
              const item = platforms.find((p) => p.platform === id);
              const configured = Boolean(item?.configured);
              const rule = PUBLISH_MEDIA_RULES[id];
              const name = item?.displayName || item?.account || item?.label || id;
              return (
                <PublishPickCard
                  key={id}
                  t={t}
                  name={name}
                  note={t(rule.noteZh, rule.noteEn)}
                  rule={rule}
                  checked={platformSet.has(id)}
                  disabled={!configured}
                  onToggle={() => togglePlatform(id, configured)}
                  mark={<PlatformMark platform={id} className="h-4 w-4" />}
                />
              );
            })}
            {LIBRARY_TIKTOK_SLOTS.map((slot) => {
              const acc = readLibraryTikTokSlot(slot);
              const ready = tiktokAccountReady(acc);
              const rule = PUBLISH_MEDIA_RULES.tiktok;
              return (
                <PublishPickCard
                  key={`tt-${slot}`}
                  t={t}
                  name={ready ? `TikTok ${slot} · ${tiktokAccountTitle(acc)}` : `TikTok ${slot}`}
                  note={t(rule.noteZh, rule.noteEn)}
                  rule={rule}
                  checked={tiktokPicked.includes(slot)}
                  disabled={!ready}
                  onToggle={() => {
                    if (!ready) return;
                    setTiktokPicked((prev) => (prev.includes(slot) ? prev.filter((n) => n !== slot) : [...prev, slot]));
                  }}
                  mark={<PlatformMark platform="tiktok" className="h-4 w-4" />}
                />
              );
            })}
            {PUBLISH_CHANNEL_ORDER.map((id) => {
              const row = channels.find((item) => item.id === id);
              const ready = Boolean(row?.configured);
              const rule = PUBLISH_MEDIA_RULES[id];
              const account = (row?.displayName || row?.account || "").trim();
              return (
                <PublishPickCard
                  key={id}
                  t={t}
                  name={account ? `${row?.label || id} · ${account}` : row?.label || id}
                  note={t(rule.noteZh, rule.noteEn)}
                  rule={rule}
                  checked={channelPicked.includes(id)}
                  disabled={!ready}
                  onToggle={() => {
                    if (!ready) return;
                    setChannelPicked((prev) => {
                      const next = prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id];
                      writeSavedChannelPicks(next);
                      return next;
                    });
                  }}
                  mark={<ChannelMark id={id} className="h-4 w-4 shrink-0" />}
                />
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || (draft.selectedPlatforms.length === 0 && !tiktokWillPublish && !channelWillPublish)}
              onClick={() => void onPublish()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "publish" ? t("发布中…", "Publishing…") : t("发布到所选平台", "Publish")}
            </button>
          </div>
        </SectionCard>

      {lastResults?.length ? (
        <SectionCard title={t("本次发布结果", "Latest result")}>
          <ul className="space-y-2 text-sm">
            {lastResults.map((row, idx) => (
              <li key={`${row.platform}-${idx}`} className={row.ok ? "text-emerald-800" : "text-rose-800"}>
                {row.platform === "tiktok"
                  ? "TikTok"
                  : platforms.find((p) => p.platform === row.platform)?.label ??
                    channels.find((item) => item.id === row.platform)?.label ??
                    row.platform}
                ：{row.message}
                {row.url ? (
                  <>
                    {" "}
                    <a className="underline" href={row.url} target="_blank" rel="noreferrer">
                      {row.url}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title={t("最近发布", "Recent publishes")}>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("还没有发布记录。", "No publish history yet.")}</p>
        ) : (
          <div className="max-h-[calc(2rem+15*2.75rem)] overflow-y-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-slate-500">
                  <th className="py-2 pr-4">{t("时间", "Time")}</th>
                  <th className="py-2 pr-4">{t("标题", "Title")}</th>
                  <th className="py-2 pr-4">{t("结果", "Result")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{formatTime(log.createdAt)}</td>
                    <td className="py-2 pr-4">{log.title || "—"}</td>
                    <td className="py-2 pr-4">
                      {log.results.map((row) => (
                        <div key={`${log.id}-${row.platform}`} className={row.ok ? "text-emerald-700" : "text-rose-700"}>
                          {row.platform === "tiktok"
                            ? "TikTok"
                            : platforms.find((p) => p.platform === row.platform)?.label ??
                              channels.find((c) => c.id === row.platform)?.label ??
                              row.platform}
                          ：{row.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
