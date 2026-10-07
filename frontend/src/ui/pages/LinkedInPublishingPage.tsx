import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiFormUpload, apiJson, apiJsonWithTimeout } from "../../lib/api";
import { linkedinPublisherAccountLimit } from "../../lib/linkedinPublisherEntitlement";
import { formatLinkedInAliReviseError } from "../../lib/linkedinAliReviseError";
import { postAgentBrainLinkedInReviseQueueCopy } from "../../lib/standaloneAgentBrainApi";
import {
  LINKEDIN_LS_ACCOUNTS,
  LINKEDIN_LS_LIBRARY,
  LINKEDIN_LS_QUEUE,
  formatLinkedInStorageSize,
  readLinkedInJson,
  writeLinkedInJson
} from "../../lib/linkedinPublisherStorage";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { useStandaloneAgentBrainOptional } from "../../state/StandaloneAgentBrainContext";
import { LinkedInQueueAliCopyPanel } from "../components/linkedin/LinkedInQueueAliCopyPanel";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";

type View = "accounts" | "queue" | "compose" | "website" | "library";
type Account = { slot: number; name: string; token: string; memberUrn: string; enabled: boolean };
type LibraryItem = {
  id: string;
  title: string;
  type: string;
  tags: string[];
  fileName: string;
  createdAt: string;
  url: string;
  sizeBytes?: number;
};
type MediaAsset = {
  source: "library";
  type: "image" | "video";
  name: string;
  libraryId?: string;
  url: string;
};
type LibraryCategory = "image" | "video";
type QueueItem = {
  id: string;
  title: string;
  body: string;
  url: string;
  /** og:image from website import — LinkedIn article card left thumbnail */
  thumbnailUrl?: string;
  media: MediaAsset[];
  accountSlots: number[];
  scheduledAt: string;
  mode: "manual" | "auto";
  status: "queued" | "draft" | "publishing" | "published" | "failed";
  publishedAt?: string;
  publishError?: string;
  platformPostId?: string;
  aliRevised?: boolean;
  aliRevisedAt?: string;
  aliRevisionNote?: string;
  aliRevisionError?: string;
};

const LIBRARY_ASSET_SELECT_ROWS = 10;
const LIBRARY_CARD_LIST_MAX_CLASS = "max-h-[32rem]";

function useLinkedInText() {
  const { locale } = useSiteLocale();
  return (zh: string, en: string) => (locale === "en" ? en : zh);
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowLocalInputValue(offsetHours = 1): string {
  const d = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function inferMediaType(fileName: string): "图片" | "视频" | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "图片";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "视频";
  return null;
}

function inferDocType(fileName: string): string {
  return inferMediaType(fileName) ?? "文件";
}

function docTypeLabel(type: string, t: (zh: string, en: string) => string): string {
  if (type === "文档") return t("文档", "Document");
  if (type === "图片") return t("图片", "Image");
  if (type === "视频") return t("视频", "Video");
  return t("文件", "File");
}

function assetCategory(type: string): LibraryCategory | "document" {
  if (type === "图片") return "image";
  if (type === "视频") return "video";
  return "document";
}

function isPublishableLibraryType(type: string): boolean {
  const cat = assetCategory(type);
  return cat === "image" || cat === "video";
}

function compactUrlTitle(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").slice(0, 90);
  } catch {
    return url.slice(0, 90);
  }
}

/** 修复 localStorage 里卡住的 publishing / 缺失 status */
function normalizeQueueItem(item: QueueItem): QueueItem {
  let status = item.status ?? "queued";
  if (status === "publishing") status = "queued";
  return { ...item, status };
}

type ArticleDraft = {
  url: string;
  title: string;
  body: string;
  summary?: string;
  insights?: string[];
  copyLocale?: "zh" | "en";
  thumbnailUrl?: string;
};

type CopyLocale = "zh" | "en";

function inferQueueCopyLocale(item: { url?: string; title?: string; body?: string }, siteLocale: CopyLocale): CopyLocale {
  const fromUrl = item.url ? inferCopyLocaleFromSiteUrl(item.url) : undefined;
  if (fromUrl) return fromUrl;
  const sample = `${item.title ?? ""}\n${item.body ?? ""}`;
  const cjk = (sample.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (sample.match(/[a-zA-Z]/g) ?? []).length;
  if (latin > cjk) return "en";
  if (cjk > latin) return "zh";
  return siteLocale === "zh" ? "zh" : "en";
}

function inferCopyLocaleFromSiteUrl(siteUrl: string): CopyLocale | undefined {
  try {
    const parts = new URL(siteUrl.trim()).pathname.split("/").filter(Boolean);
    if (parts[0] === "zh" || parts[0] === "en") return parts[0];
  } catch {
    /* ignore */
  }
  return undefined;
}

async function fetchArticleDraftFromUrl(url: string, copyLocale?: CopyLocale): Promise<ArticleDraft> {
  const resp = await apiJsonWithTimeout<{ ok: boolean; draft?: ArticleDraft; message?: string }>(
    "/api/linkedin/articles/draft-from-url",
    { method: "POST", body: JSON.stringify({ url, copyLocale }) },
    45_000
  );
  if (!resp.ok || !resp.draft) throw new Error(resp.message || "未能从 URL 生成文案");
  return resp.draft;
}

async function fetchArticleDraftBatch(urls: string[], copyLocale?: CopyLocale): Promise<ArticleDraft[]> {
  const resp = await apiJsonWithTimeout<{ ok: boolean; drafts?: ArticleDraft[]; message?: string }>(
    "/api/linkedin/articles/draft-batch",
    { method: "POST", body: JSON.stringify({ urls, copyLocale }) },
    120_000
  );
  if (!resp.ok || !resp.drafts?.length) throw new Error(resp.message || "未能批量生成文案");
  return resp.drafts;
}


function mediaTypeLabel(type: MediaAsset["type"], t: (zh: string, en: string) => string): string {
  if (type === "image") return t("图片", "Image");
  return t("视频", "Video");
}

function libraryItemToMediaAsset(item: LibraryItem): MediaAsset | null {
  if (!item.url?.trim() || !isPublishableLibraryType(item.type)) return null;
  const cat = assetCategory(item.type);
  if (cat === "document") return null;
  return {
    source: "library",
    type: cat,
    name: item.fileName,
    libraryId: item.id,
    url: item.url
  };
}

function resolveQueueMediaForPublish(item: QueueItem, library: LibraryItem[]): Array<{ type: MediaAsset["type"]; name: string; url?: string }> {
  return item.media.map((m) => {
    if (m.url) return { type: m.type, name: m.name, url: m.url };
    const lib = m.libraryId ? library.find((x) => x.id === m.libraryId) : library.find((x) => x.fileName === m.name);
    return { type: m.type, name: m.name, url: lib?.url };
  });
}

const LINKEDIN_MEDIA_REUPLOAD_HINT =
  "所选素材无法发布，请在「LinkedIn 文件库」重新上传（旧版仅本地缓存的素材已不可用）。";

async function publishQueueItemToLinkedIn(
  item: QueueItem,
  accounts: Account[],
  library: LibraryItem[]
): Promise<{ warnings: string[] }> {
  const targets = accounts.filter(
    (a) => item.accountSlots.includes(a.slot) && a.enabled && a.token.trim() && a.memberUrn.trim()
  );
  if (!targets.length) {
    throw new Error("未找到已授权的 LinkedIn 账号，请先在「账号管理」接入授权。");
  }
  const media = resolveQueueMediaForPublish(item, library);
  if (media.some((m) => !String(m.url ?? "").trim())) {
    throw new Error(LINKEDIN_MEDIA_REUPLOAD_HINT);
  }
  const hasVideo = media.some((m) => m.type === "video");
  const hasHeavyMedia = media.some((m) => m.type === "video");
  const publishTimeoutMs = hasVideo ? 600_000 : hasHeavyMedia ? 300_000 : 120_000;
  const allWarnings: string[] = [];
  for (const account of targets) {
    const resp = await apiJsonWithTimeout<{ ok: boolean; postId?: string; warnings?: string[]; message?: string }>(
      "/api/linkedin/posts/publish-now",
      {
        method: "POST",
        body: JSON.stringify({
          accessToken: account.token.trim(),
          memberUrn: account.memberUrn.trim(),
          title: item.title,
          body: item.body,
          url: item.url,
          articleThumbnailUrl: item.thumbnailUrl ?? "",
          media
        })
      },
      publishTimeoutMs
    );
    if (!resp.ok) throw new Error(resp.message || "LinkedIn 发布失败");
    if (resp.warnings?.length) allWarnings.push(...resp.warnings);
  }
  return { warnings: allWarnings };
}

function formatPublishError(e: unknown, t: (zh: string, en: string) => string): string {
  const msg = String((e as Error)?.message ?? e);
  if (msg.includes("404") || msg.includes("Cannot POST /api/linkedin/posts/publish-now")) {
    return t(
      "发帖 API 尚未部署到本服务器（与账号授权无关）。请执行 LinkedIn 后端热更（含 linkedinPostPublish.ts）并 restart backend。",
      "Publish API is not deployed on this server (not an auth issue). Run the LinkedIn backend hotfix with linkedinPostPublish.ts and restart backend."
    );
  }
  return msg;
}

function queueStatusLabel(status: QueueItem["status"], t: (zh: string, en: string) => string): string {
  if (status === "published") return t("已发布", "Published");
  if (status === "publishing") return t("发布中", "Publishing");
  if (status === "failed") return t("发布失败", "Failed");
  if (status === "draft") return t("草稿", "Draft");
  return t("待发布", "Queued");
}

function nowLocalInputImmediate(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultAccountName(slot: number, t?: (zh: string, en: string) => string): string {
  if (slot === 1 && linkedinPublisherAccountLimit() === 1) {
    return t ? t("LinkedIn 账号", "LinkedIn account") : "LinkedIn 账号";
  }
  return `LinkedIn #${slot}`;
}

function normalizeQueueAccountSlots(slots: number[], accountLimit: number): number[] {
  const valid = slots.filter((s) => s >= 1 && s <= accountLimit);
  return valid.length ? [...new Set(valid)].sort() : [1];
}

function useLinkedInPublisherState(accountLimit: number) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const saved = readLinkedInJson<Account[]>(LINKEDIN_LS_ACCOUNTS, []);
    return Array.from({ length: accountLimit }, (_, idx) => {
      const slot = idx + 1;
      const found = saved.find((a) => a.slot === slot);
      return found
        ? { ...found, name: found.name || defaultAccountName(slot) }
        : {
            slot,
            name: defaultAccountName(slot),
            token: "",
            memberUrn: "",
            enabled: false
          };
    });
  });
  const [library, setLibrary] = useState<LibraryItem[]>(() => readLinkedInJson<LibraryItem[]>(LINKEDIN_LS_LIBRARY, []));
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    readLinkedInJson<QueueItem[]>(LINKEDIN_LS_QUEUE, []).map((item) => ({
      ...normalizeQueueItem(item),
      accountSlots: normalizeQueueAccountSlots(item.accountSlots ?? [1], accountLimit)
    }))
  );

  return {
    accounts,
    library,
    queue,
    setAccounts: (next: Account[]) => {
      setAccounts(next);
      writeLinkedInJson(LINKEDIN_LS_ACCOUNTS, next);
    },
    setLibrary: (next: LibraryItem[]) => {
      setLibrary(next);
      writeLinkedInJson(LINKEDIN_LS_LIBRARY, next);
    },
    setQueue: (next: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
      setQueue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        writeLinkedInJson(LINKEDIN_LS_QUEUE, resolved);
        return resolved;
      });
    }
  };
}

function PageFrame(props: { view: View; children: React.ReactNode }) {
  const t = useLinkedInText();
  const accountLimit = linkedinPublisherAccountLimit();
  if (accountLimit <= 0) return <Navigate to="/email/campaigns" replace />;
  const titles: Record<View, string> = {
    accounts: t("LinkedIn 账号管理", "LinkedIn accounts"),
    queue: t("LinkedIn 发布队列", "LinkedIn queue"),
    compose: t("创建 LinkedIn 发布", "Compose LinkedIn post"),
    website: t("网站文章导入", "Website article import"),
    library: t("LinkedIn 文件库", "LinkedIn library")
  };
  const desc: Record<View, string> = {
    accounts: t(
      "绑定 1 个 LinkedIn 个人账号，用于发布队列与自动化任务。",
      "Connect one LinkedIn personal account for the publishing queue and automation tasks."
    ),
    queue: t("查看待发布内容、发送时间和当前状态。", "Review queued posts, send time, and status."),
    compose: t("手动创建 LinkedIn 文案并安排发布时间。", "Create a LinkedIn post and schedule the send time."),
    website: t("输入博客文章 URL，一键生成摘要文案并加入发布队列。", "Enter blog article URLs, generate summary copy, and add them to the queue."),
    library: t("上传图片、视频到服务器，发布时可直接选用。", "Upload images and videos to the server for use when publishing.")
  };
  return (
    <PageShell title={titles[props.view]} description={desc[props.view]}>
      {props.children}
    </PageShell>
  );
}

function accountIsReady(account: Account | undefined): boolean {
  return Boolean(account?.enabled && account.token.trim() && account.memberUrn.trim());
}

function LinkedInAccountBadge(props: { account: Account | undefined; compact?: boolean }) {
  const t = useLinkedInText();
  const ready = accountIsReady(props.account);
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border ${
        props.compact ? "px-3 py-2.5" : "px-4 py-3.5"
      } ${ready ? "border-emerald-200/80 bg-emerald-50/70" : "border-amber-200/80 bg-amber-50/50"}`}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg font-bold text-white ${
          props.compact ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm"
        } ${ready ? "bg-[#0A66C2]" : "bg-slate-300"}`}
      >
        in
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold text-slate-900 ${props.compact ? "text-sm" : "text-base"}`}>
          {props.account?.name || t("LinkedIn 账号", "LinkedIn account")}
        </p>
        <p className={`text-slate-600 ${props.compact ? "text-[11px]" : "text-xs"}`}>
          {ready
            ? t("已授权 · 发布时使用此账号", "Authorized · posts use this account")
            : t("未授权 · 请先在账号管理接入", "Not authorized · connect under Accounts first")}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
        }`}
      >
        {ready ? t("已连接", "Connected") : t("待接入", "Pending")}
      </span>
    </div>
  );
}

function resolveDefaultAccountSlots(accounts: Account[]): number[] {
  const ready = accounts.filter((a) => accountIsReady(a)).map((a) => a.slot);
  return ready.length ? ready : [1];
}

function formatQueueAccountLabel(slots: number[], accounts: Account[], t: (zh: string, en: string) => string): string {
  const names = slots
    .map((slot) => accounts.find((a) => a.slot === slot)?.name || `#${slot}`)
    .filter(Boolean);
  if (names.length === 1 && linkedinPublisherAccountLimit() === 1) {
    return accountIsReady(accounts[0]) ? names[0]! : t("未授权", "Not authorized");
  }
  return names.join(", ");
}

export function LinkedInPublishingPage() {
  return <LinkedInAccountsPage />;
}

export function LinkedInAccountsPage() {
  const t = useLinkedInText();
  const accountLimit = linkedinPublisherAccountLimit();
  const { accounts, queue, setAccounts } = useLinkedInPublisherState(accountLimit);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const primaryAccount = accounts[0];
  const ready = accountIsReady(primaryAccount);
  const queuedCount = queue.filter((q) => q.status === "queued" || q.status === "draft").length;
  const publishedCount = queue.filter((q) => q.status === "published").length;

  function saveAccount(slot: number, patch: Partial<Account>) {
    setAccounts(accounts.map((a) => (a.slot === slot ? { ...a, ...patch } : a)));
  }

  return (
    <PageFrame view="accounts">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <SectionCard
          title={t("LinkedIn 账号", "LinkedIn account")}
          description={t(
            "接入 Access Token 与 Member URN 后，即可在发布队列与自动化任务中使用。",
            "After connecting your access token and Member URN, you can publish from the queue and automation tasks."
          )}
        >
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/80 to-sky-50/40 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md ${
                    ready ? "bg-[#0A66C2]" : "bg-slate-300"
                  }`}
                >
                  in
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-950">{primaryAccount?.name || t("LinkedIn 账号", "LinkedIn account")}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {ready
                      ? primaryAccount?.memberUrn
                      : t("尚未配置授权，点击下方按钮接入。", "No authorization yet — use the button below to connect.")}
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ready ? t("已授权", "Authorized") : t("未授权", "Not authorized")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={`h-10 shrink-0 rounded-lg px-4 text-sm font-semibold shadow-sm ${
                  ready
                    ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    : "bg-[#0A66C2] text-white hover:bg-[#004182]"
                }`}
                onClick={() => setEditingSlot(primaryAccount?.slot ?? 1)}
              >
                {ready ? t("编辑授权", "Edit authorization") : t("接入授权", "Connect authorization")}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link
              to="/linkedin/publishing/compose"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t("创建发布", "Compose post")}
            </Link>
            <Link
              to="/linkedin/publishing/website"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t("网站文章导入", "Website import")}
            </Link>
            <Link
              to="/linkedin/publishing/queue"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t("发布队列", "Publishing queue")}
            </Link>
          </div>
        </SectionCard>
        <aside className="space-y-4">
          <SectionCard title={t("概况", "Overview")} description={t("当前发布状态", "Publishing status")}>
            <dl className="grid gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t("账号状态", "Account")}</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">{ready ? t("已连接", "Connected") : t("待接入", "Pending")}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t("待发布", "Queued")}</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">{queuedCount}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t("已发布", "Published")}</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">{publishedCount}</dd>
              </div>
            </dl>
          </SectionCard>
        </aside>
      </div>
      {editingSlot ? (
        <AccountModal
          account={accounts.find((a) => a.slot === editingSlot)!}
          onClose={() => setEditingSlot(null)}
          onSave={(patch) => {
            saveAccount(editingSlot, patch);
            setEditingSlot(null);
          }}
        />
      ) : null}
      <SectionCard title={t("获取 LinkedIn Token 教程", "How to get a LinkedIn token")} description={t("个人账号发布需要 Access Token：同时包含 openid、profile、email（用于自动检测 LinkedIn ID）与 w_member_social（用于发帖）。", "Personal posting needs an Access Token with openid, profile, and email (to auto-detect LinkedIn ID) plus w_member_social (to publish).")}>
        <ol className="space-y-2 text-sm leading-relaxed text-slate-700">
          <li>{t("1. 登录你的 LinkedIn 个人账号，然后打开 LinkedIn Developers 网站：", "1. Log in to your LinkedIn account, then open LinkedIn Developers: ")}<span className="font-mono">https://www.linkedin.com/developers/apps</span></li>
          <li>{t("2. 进入你的 App → Products：必须已添加并启用「Sign In with LinkedIn using OpenID Connect」以及「Share on LinkedIn」（状态为 Added，不是 Pending）。然后到 Auth 页确认 OAuth scopes 里能看到 openid、profile、email、w_member_social。", "2. In your App → Products, add and enable both “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn” (Added, not Pending). On the Auth page, confirm OAuth scopes include openid, profile, email, and w_member_social.")}</li>
          <li>{t("3. 打开 App 的 Auth 页面，复制 Client ID 和 Primary Client Secret，自己妥善保存，不要发给陌生人。", "3. Open the Auth page, copy the Client ID and Primary Client Secret, and keep them private.")}</li>
          <li>{t("4. 在 Auth 页面添加 Redirect URL。使用 LinkedIn 官方 Token Generator 时通常会自动加入：", "4. Add a redirect URL on the Auth page. LinkedIn's token generator usually adds this automatically: ")}<span className="font-mono">https://www.linkedin.com/developers/tools/oauth/redirect</span></li>
          <li>{t("5. 打开 Docs and tools → OAuth Token Tools → Create OAuth 2.0 access token，选择你的 App，勾选 openid、profile、email 与 w_member_social，完成授权。若刚开通 OpenID Connect，必须重新生成新 Token（旧 Token 不会自动带上新权限）。", "5. Open Docs and tools → OAuth Token Tools → Create OAuth 2.0 access token, select your app, check openid, profile, email, and w_member_social, then authorize. After enabling OpenID Connect, you must create a new token—old tokens do not gain the new scopes.")}</li>
          <li>{t("6. 复制生成的 Access Token（不是 Client Secret，也不是 ID Token），回到本页「接入授权」，粘贴后点击「自动检测 LinkedIn ID」，成功后保存授权。", "6. Copy the Access Token (not the Client Secret or ID Token), return here, paste it into Connect authorization, click Auto-detect LinkedIn ID, then save.")}</li>
          <li>{t("7. 若自动检测提示无法读取 Member URN：先确认 Products 已启用 OpenID Connect，Auth 页有 openid/profile/email，并已用勾选上述权限的新 Token 重试。检测由本站后端请求 LinkedIn，与浏览器跨域无关。", "7. If auto-detect says it cannot read the Member URN: confirm OpenID Connect is enabled, Auth lists openid/profile/email, and retry with a newly generated token that includes those scopes. Detection runs through this site’s backend—not browser CORS.")}</li>
        </ol>
      </SectionCard>
    </PageFrame>
  );
}

export function LinkedInQueuePage() {
  const t = useLinkedInText();
  const { locale } = useSiteLocale();
  const agentCtx = useStandaloneAgentBrainOptional();
  const configLoaded = agentCtx?.configLoaded ?? false;
  const agentReady = Boolean(configLoaded && agentCtx?.config?.activated);
  const agentName = agentCtx?.config?.providerLabel ?? agentCtx?.config?.agentName ?? t("AI 智能体", "AI agent");
  const accountLimit = linkedinPublisherAccountLimit();
  const { accounts, library, queue, setQueue } = useLinkedInPublisherState(accountLimit);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const publishingIdRef = useRef<string | null>(null);
  publishingIdRef.current = publishingId;
  const [sendFeedback, setSendFeedback] = useState<{ kind: "success" | "error"; message: string; itemId?: string } | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const queueRef = useRef(queue);
  const reviewInFlightRef = useRef<Set<string>>(new Set());
  const reviewAbortByIdRef = useRef<Map<string, AbortController>>(new Map());
  const agentReadyRef = useRef(agentReady);
  const agentNameRef = useRef(agentName);
  const localeRef = useRef(locale);
  queueRef.current = queue;
  agentReadyRef.current = agentReady;
  agentNameRef.current = agentName;
  localeRef.current = locale;

  useEffect(() => {
    void agentCtx?.refreshConfig();
  }, [agentCtx?.refreshConfig]);

  const handleAliRevised = useCallback(
    (itemId: string, patch: { title: string; body: string; note: string }) => {
      setQueue((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                title: patch.title,
                body: patch.body,
                aliRevised: true,
                aliRevisedAt: new Date().toISOString(),
                aliRevisionNote: patch.note,
                aliRevisionError: undefined
              }
            : x
        )
      );
    },
    [setQueue]
  );

  const handleAliError = useCallback(
    (itemId: string, message: string) => {
      setQueue((prev) =>
        prev.map((x) => (x.id === itemId ? { ...x, aliRevisionError: message, aliRevised: false } : x))
      );
    },
    [setQueue]
  );

  const setItemRunning = useCallback((itemId: string, running: boolean) => {
    setRunningIds((prev) => {
      const next = new Set(prev);
      if (running) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const reviewItem = useCallback(
    async (itemId: string, force = false, draft?: { title?: string; body?: string }) => {
      const loc = localeRef.current;
      const displayAgent = agentNameRef.current;

      if (force) {
        reviewAbortByIdRef.current.get(itemId)?.abort();
        reviewAbortByIdRef.current.delete(itemId);
        reviewInFlightRef.current.delete(itemId);
      }

      if (!agentReadyRef.current) {
        handleAliError(itemId, "请先在「自动化任务 → AI 大脑」保存并激活智能体。");
        return;
      }

      const item = queueRef.current.find((x) => x.id === itemId);
      if (!item) {
        handleAliError(itemId, loc === "en" ? "Queue item not found." : "未找到该队列条目，请刷新页面。");
        return;
      }
      if (publishingIdRef.current === itemId) {
        handleAliError(
          itemId,
          loc === "en" ? "Sending to LinkedIn — wait until it finishes." : "正在发送到 LinkedIn，请稍后再优化。"
        );
        return;
      }

      if (reviewInFlightRef.current.has(itemId)) {
        setItemRunning(itemId, true);
        setQueue((prev) =>
          prev.map((x) =>
            x.id === itemId
              ? {
                  ...x,
                  aliRevisionNote:
                    loc === "en"
                      ? "Optimization is already running. Please wait for the result."
                      : "这条文案已经在优化中，请稍等结果。"
                }
              : x
          )
        );
        return;
      }

      const requestTitle = draft?.title?.trim() || item.title.trim() || compactUrlTitle(item.url);
      const requestBody = draft?.body?.trim() || (item.body || item.url).trim();
      if (!requestBody) {
        handleAliError(itemId, loc === "en" ? "Body is empty — add text or a URL first." : "正文为空，请先填写文案或文章链接。");
        return;
      }

      const abortCtrl = new AbortController();
      reviewAbortByIdRef.current.set(itemId, abortCtrl);
      reviewInFlightRef.current.add(itemId);
      setItemRunning(itemId, true);
      setQueue((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                title: requestTitle,
                body: requestBody,
                aliRevised: false,
                aliRevisionNote: force
                  ? loc === "en"
                    ? "Re-optimizing: 3–5 key points, article link, and industry hashtags."
                    : "正在重新优化：提炼 3–5 条观点、附上文章链接与行业标签。"
                  : loc === "en"
                    ? "Optimizing: 3–5 key points, article link, and industry hashtags…"
                    : "正在优化：提炼 3–5 条观点、附上文章链接与行业标签…",
                aliRevisedAt: undefined,
                aliRevisionError: undefined
              }
            : x
        )
      );

      try {
        const resp = await postAgentBrainLinkedInReviseQueueCopy(
          {
            title: requestTitle,
            body: requestBody,
            url: item.url?.trim() || undefined,
            copyLocale: inferQueueCopyLocale(item, loc === "zh" ? "zh" : "en")
          },
          abortCtrl.signal
        );
        if (!resp.ok) {
          throw new Error(resp.message ?? "AI 优化失败");
        }
        if (!resp.body?.trim()) {
          throw new Error(resp.message ?? "AI 返回空文案");
        }
        handleAliRevised(itemId, {
          title: (resp.title ?? item.title).trim(),
          body: resp.body.trim(),
          note: (resp.note ?? "").trim() || (loc === "en" ? "Added key points, link, and hashtags." : "已提炼要点、附上链接与行业标签")
        });
      } catch (e: unknown) {
        const name = (e as Error)?.name;
        if (name === "AbortError") return;
        handleAliError(itemId, formatLinkedInAliReviseError(String((e as Error)?.message ?? e)));
      } finally {
        if (reviewAbortByIdRef.current.get(itemId) === abortCtrl) {
          reviewAbortByIdRef.current.delete(itemId);
        }
        reviewInFlightRef.current.delete(itemId);
        setItemRunning(itemId, false);
      }
    },
    [handleAliRevised, handleAliError, setItemRunning, setQueue]
  );

  const isRevising = useCallback((itemId: string) => runningIds.has(itemId), [runningIds]);

  const updateQueueItem = useCallback(
    (itemId: string, patch: Partial<QueueItem>) => {
      setQueue((prev) => prev.map((x) => (x.id === itemId ? { ...x, ...patch } : x)));
    },
    [setQueue]
  );

  async function sendNow(itemId: string) {
    const item = queue.find((x) => x.id === itemId);
    if (!item || item.status === "publishing" || item.status === "published") return;
    setSendFeedback(null);
    setPublishingId(itemId);
    setQueue((prev) => prev.map((x) => (x.id === itemId ? { ...x, status: "publishing", publishError: undefined } : x)));
    try {
      await publishQueueItemToLinkedIn(item, accounts, library);
      const now = nowLocalInputImmediate();
      setQueue((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "published",
                scheduledAt: now,
                publishedAt: new Date().toISOString(),
                publishError: undefined
              }
            : x
        )
      );
      setSendFeedback(null);
    } catch (e) {
      const msg = formatPublishError(e, t);
      setQueue((prev) => prev.map((x) => (x.id === itemId ? { ...x, status: "failed", publishError: msg } : x)));
      setSendFeedback({ kind: "error", message: msg });
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <PageFrame view="queue">
      <SectionCard
        title={t("待发布内容", "Queued posts")}
        description={t(
          `共 ${queue.length} 条。「即时发送」将立即调用 LinkedIn API 发帖；定时发送仍按「发送时间」列展示。`,
          `${queue.length} posts. “Send now” posts immediately via the LinkedIn API; scheduled time is shown for reference.`
        )}
      >
        {sendFeedback ? (
          <div
            className={`mb-4 rounded-xl border-2 px-4 py-3 text-sm font-semibold leading-relaxed shadow-sm ${
              sendFeedback.kind === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/80"
                : "border-red-300 bg-red-50 text-red-800 ring-1 ring-red-200/80"
            }`}
            role="status"
          >
            {sendFeedback.message}
          </div>
        ) : null}
        {!agentReady && configLoaded && queue.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>
              {t(
                "AI 智能体未激活 — 须先配置 API Key 并激活，才可点「AI 优化文案」。",
                "AI agent is not activated — save your API key and activate before using “Optimize copy”."
              )}
            </p>
            <p className="mt-1.5">
              <Link to="/ops/automation-tasks" className="font-semibold text-emerald-800 underline hover:text-emerald-950">
                {t("→ 前往自动化任务 · AI 大脑", "→ Open Automation tasks · AI brain")}
              </Link>
              <span className="mx-1.5 text-amber-700">·</span>
              <button
                type="button"
                className="font-semibold text-violet-800 underline hover:text-violet-950"
                onClick={() => agentCtx?.openAgentBrain()}
              >
                {t("或点右下角 AI 智能体", "or use the AI widget (bottom-right)")}
              </button>
            </p>
          </div>
        ) : null}
        <div className="max-h-[760px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("标题", "Title")}</th>
                <th className="px-3 py-2">{t("发布账号", "Account")}</th>
                <th className="px-3 py-2">{t("发送时间", "Send time")}</th>
                <th className="px-3 py-2">{t("状态", "Status")}</th>
                <th className="px-3 py-2">{t("内容", "Content")}</th>
                <th className="px-3 py-2">{t("来源", "Source")}</th>
                <th className="px-3 py-2">{t("操作", "Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {queue.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-md px-3 py-2">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="truncate text-xs text-slate-500">{item.url || item.body}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{formatQueueAccountLabel(item.accountSlots, accounts, t)}</td>
                  <td className="px-3 py-2 text-slate-700">{item.scheduledAt}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    <span
                      className={
                        item.status === "published"
                          ? "text-emerald-700"
                          : item.status === "failed"
                            ? "text-red-600"
                            : item.status === "publishing"
                              ? "text-amber-700"
                              : "text-slate-600"
                      }
                    >
                      {queueStatusLabel(item.status, t)}
                    </span>
                    {item.publishError ? <p className="mt-0.5 text-[10px] text-red-600">{item.publishError}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="text-xs">{item.body.length}/1000</div>
                    {item.aliRevised ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {t("已优化", "Optimized")}
                        </span>
                        {item.aliRevisedAt ? (
                          <span className="text-[10px] text-slate-500">{new Date(item.aliRevisedAt).toLocaleString()}</span>
                        ) : null}
                      </div>
                    ) : isRevising(item.id) || runningIds.has(item.id) ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-violet-700">
                        <span className="inline-flex gap-0.5" aria-hidden>
                          <span className="h-1 w-1 animate-bounce rounded-full bg-violet-600 [animation-delay:-0.2s]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-violet-600 [animation-delay:-0.1s]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-violet-600" />
                        </span>
                        {t("AI 优化中…", "Optimizing…")}
                      </div>
                    ) : item.aliRevisionError ? (
                      <div className="mt-0.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700">
                        {item.aliRevisionError}
                      </div>
                    ) : null}
                    {item.aliRevisionNote ? (
                      <div className="mt-1 max-w-sm rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] leading-relaxed text-emerald-900">
                        <span className="font-semibold">{t("优化说明：", "Optimization note: ")}</span>
                        {item.aliRevisionNote}
                      </div>
                    ) : null}
                    <button
                        type="button"
                        className="mt-1 rounded-md border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                        disabled={!configLoaded || !agentReady || isRevising(item.id) || publishingId === item.id}
                        title={
                          !agentReady
                            ? t("请先在「自动化任务 → AI 大脑」激活智能体", "Activate the AI agent under Automation → AI brain first")
                            : undefined
                        }
                        onClick={() => {
                          void reviewItem(item.id, true);
                        }}
                      >
                        {isRevising(item.id) || runningIds.has(item.id) ? t("优化中…", "Optimizing…") : t("AI 优化文案", "Optimize copy")}
                      </button>
                    <div className="text-xs text-slate-500">
                      {item.media?.length
                        ? item.media.map((m) => `${mediaTypeLabel(m.type, t)}:${m.name}`).join(", ")
                        : t("以文章链接预览为主", "Use link preview image")}
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-slate-700 underline"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      {expandedId === item.id ? t("收起文案", "Hide copy") : t("查看文案", "View copy")}
                    </button>
                    <LinkedInQueueAliCopyPanel
                      locale={locale}
                      agentName={agentName}
                      agentReady={agentReady}
                      configLoaded={configLoaded}
                      expanded={expandedId === item.id}
                      revising={isRevising(item.id) || runningIds.has(item.id)}
                      aliRevised={item.aliRevised}
                      aliRevisionNote={item.aliRevisionNote}
                      aliError={item.aliRevisionError}
                      title={item.title}
                      body={item.body || item.url}
                      onBodyChange={(body) => updateQueueItem(item.id, { body })}
                      onTitleChange={(title) => updateQueueItem(item.id, { title })}
                      onSave={() => updateQueueItem(item.id, { aliRevisionError: undefined })}
                      onRequestRevise={(draft) => {
                        void reviewItem(item.id, true, draft);
                      }}
                      t={t}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{item.mode === "auto" ? t("网站导入", "Website import") : t("手动创建", "Manual")}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-600"
                        onClick={() => setQueue(queue.filter((x) => x.id !== item.id))}
                      >
                        {t("删除", "Delete")}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-900 underline disabled:opacity-50"
                        disabled={publishingId === item.id || item.status === "published" || item.status === "publishing"}
                        onClick={() => void sendNow(item.id)}
                      >
                        {publishingId === item.id
                          ? t("发送中…", "Sending…")
                          : item.status === "published"
                            ? t("已发送", "Sent")
                            : t("即时发送", "Send now")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!queue.length ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">{t("暂无队列，请从「创建发布」或「网站文章导入」添加。", "No queued posts yet. Add one from Compose or Website import.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PageFrame>
  );
}

export function LinkedInComposePage() {
  const t = useLinkedInText();
  const accountLimit = linkedinPublisherAccountLimit();
  const { accounts, library, queue, setQueue } = useLinkedInPublisherState(accountLimit);
  const primaryAccount = accounts[0];
  const targetSlots = resolveDefaultAccountSlots(accounts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [libraryMediaIds, setLibraryMediaIds] = useState<string[]>([]);
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<LibraryCategory | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => nowLocalInputValue(1));
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [articleThumbnailUrl, setArticleThumbnailUrl] = useState("");
  const [copyLocale, setCopyLocale] = useState<CopyLocale>("en");
  const selectedLibraryMedia: MediaAsset[] = library
    .filter((item) => libraryMediaIds.includes(item.id))
    .map(libraryItemToMediaAsset)
    .filter((item): item is MediaAsset => item !== null);
  const activeCategoryItems = activeLibraryCategory
    ? library.filter((item) => assetCategory(item.type) === activeLibraryCategory)
    : [];

  function selectLibraryCategory(cat: LibraryCategory) {
    setActiveLibraryCategory((prev) => (prev === cat ? prev : cat));
  }

  function toggleLibraryAsset(id: string) {
    const item = library.find((x) => x.id === id);
    if (!item?.url?.trim()) return;
    setLibraryMediaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function fillDraftFromUrl() {
    const raw = url.trim();
    if (!raw) return;
    setDraftLoading(true);
    setDraftMsg(null);
    try {
      const draft = await fetchArticleDraftFromUrl(raw, copyLocale);
      if (!title.trim()) setTitle(draft.title);
      setBody(draft.body.slice(0, 1000));
      setArticleThumbnailUrl(draft.thumbnailUrl ?? "");
      const hint =
        draft.insights?.length && draft.insights.length >= 2
          ? t(`已从文章提取 ${draft.insights.length} 条要点，可继续编辑。`, `Extracted ${draft.insights.length} key points from the article. You can still edit.`)
          : t("已生成草稿，若要点偏少请手动补充。", "Draft generated. Add more key points manually if needed.");
      setDraftMsg(hint);
    } catch (e) {
      setDraftMsg(String((e as Error)?.message ?? e));
    } finally {
      setDraftLoading(false);
    }
  }

  function addQueueItem() {
    const nextTitle = title.trim() || compactUrlTitle(url.trim());
    if (!nextTitle && !body.trim() && !url.trim()) return;
    if (selectedLibraryMedia.some((m) => !m.url?.trim())) {
      window.alert(LINKEDIN_MEDIA_REUPLOAD_HINT);
      return;
    }
    const item: QueueItem = {
      id: createId("q"),
      title: nextTitle,
      body: body.trim(),
      url: url.trim(),
      thumbnailUrl: articleThumbnailUrl.trim() || undefined,
      media: selectedLibraryMedia,
      accountSlots: targetSlots,
      scheduledAt,
      mode: "manual",
      status: "queued"
    };
    setQueue([...queue, item].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    setTitle("");
    setBody("");
    setUrl("");
    setArticleThumbnailUrl("");
    setLibraryMediaIds([]);
  }

  return (
    <PageFrame view="compose">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title={t("发布账号", "Publishing account")} description={t("当前绑定账号，发布时将自动使用。", "The connected account used for publishing.")}>
            <LinkedInAccountBadge account={primaryAccount} compact />
            {!accountIsReady(primaryAccount) ? (
              <p className="mt-3 text-xs leading-relaxed text-amber-800">
                {t("请先", "Please ")}
                <Link to="/linkedin/publishing" className="font-semibold underline">
                  {t("接入 LinkedIn 授权", "connect LinkedIn authorization")}
                </Link>
                {t("，再加入发布队列。", " before adding to the queue.")}
              </p>
            ) : null}
          </SectionCard>
          <SectionCard title={t("发送时间", "Send time")} description={t("定时参考；即时发送请在发布队列操作。", "Scheduled reference — use Send now on the queue for immediate posting.")}>
            <input type="datetime-local" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </SectionCard>
        </div>
        <SectionCard title={t("发布文案", "Post copy")} description={t("上限 1000 字；文章推荐 400-500 字，底部带 CTA 和落地页链接。", "Limit 1000 characters; article posts are best at 400-500 characters with CTA and landing URL.")}>
          <div className="space-y-3">
            <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder={t("发布标题", "Post title")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <div>
              <textarea
                className="min-h-48 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={t("LinkedIn 文案", "LinkedIn post copy")}
                maxLength={1000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className={`mt-1 text-right text-xs ${body.length > 900 ? "text-amber-700" : "text-slate-500"}`}>{body.length}/1000</div>
            </div>
            <label className="block text-sm font-semibold text-slate-900">{t("文案语言", "Copy language")}</label>
            <select
              className="mt-1 h-10 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={copyLocale}
              onChange={(e) => setCopyLocale(e.target.value as CopyLocale)}
            >
              <option value="en">{t("英文（Key ideas / Read the full article）", "English (Key ideas / Read the full article)")}</option>
              <option value="zh">{t("中文（核心观点 / 阅读原文）", "Chinese (核心观点 / 阅读原文)")}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {t("标题与要点来自文章页本身；此处只控制导语标签与 CTA 用中文还是英文。", "Title and bullets come from the page; this controls labels and CTA language only.")}
            </p>
            <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                placeholder={t("文章链接或落地页 URL", "Article or landing page URL")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="button"
                className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={draftLoading}
                onClick={() => void fillDraftFromUrl()}
              >
                {draftLoading ? t("生成中…", "Generating…") : t("从 URL 生成文案", "Generate from URL")}
              </button>
            </div>
            {draftMsg ? <p className="-mt-1 text-xs text-slate-500">{draftMsg}</p> : null}
            <p className="-mt-1 text-xs text-slate-500">
              {t("从 URL 读取文章标题与 meta 描述，并提取 2–5 条要点生成 LinkedIn 文案（参考主站社媒发布逻辑）。", "Reads the article title and meta description, extracts 2–5 key points, and builds LinkedIn copy (aligned with the main-site social publishing flow).")}
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
              <p className="text-xs font-semibold text-slate-800">{t("从文件库选择素材", "Select from library")}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {t("仅支持图片与视频附件；Word/PDF 等文档请放在正文或文章链接中。", "Only images and videos can be attached; put documents in the post copy or article link.")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    { cat: "image" as const, label: t("图片", "Images"), idle: "border-sky-200 bg-sky-50/80 text-sky-900", active: "border-sky-400 bg-sky-100 ring-2 ring-sky-200", panel: "border-sky-100 bg-sky-50/30" },
                    { cat: "video" as const, label: t("视频", "Videos"), idle: "border-indigo-200 bg-indigo-50/80 text-indigo-900", active: "border-indigo-400 bg-indigo-100 ring-2 ring-indigo-200", panel: "border-indigo-100 bg-indigo-50/30" }
                  ] as const
                ).map((opt) => {
                  const selected = activeLibraryCategory === opt.cat;
                  const count = library.filter((item) => assetCategory(item.type) === opt.cat).length;
                  return (
                    <button
                      key={opt.cat}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectLibraryCategory(opt.cat)}
                      className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition ${selected ? opt.active : `${opt.idle} hover:shadow-sm`}`}
                    >
                      <span>{opt.label}</span>
                      <span className="mt-0.5 block text-[10px] font-normal opacity-80">{count}</span>
                    </button>
                  );
                })}
              </div>
              {activeLibraryCategory ? (
                (() => {
                  const opt =
                    activeLibraryCategory === "image"
                      ? { label: t("图片", "Images"), panel: "border-sky-100 bg-sky-50/30", picked: "border-sky-400 bg-sky-50 ring-2 ring-sky-200", idle: "border-sky-100 bg-white hover:border-sky-300" }
                      : { label: t("视频", "Videos"), panel: "border-indigo-100 bg-indigo-50/30", picked: "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200", idle: "border-indigo-100 bg-white hover:border-indigo-300" };
                  return (
                    <div className={`mt-3 rounded-lg border p-2 shadow-sm ${opt.panel}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {t(`${opt.label} · 选择素材（可多选）`, `${opt.label} · pick assets (multi-select)`)}
                      </p>
                      {!activeCategoryItems.length ? (
                        <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-white/80 px-2 py-3 text-center text-[11px] text-slate-500">
                          {t("该类型暂无素材，请先到文件库上传。", "No assets for this type. Upload in Library first.")}
                        </p>
                      ) : (
                        <div
                          className="mt-2 flex flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
                          style={{
                            maxHeight: `calc(${LIBRARY_ASSET_SELECT_ROWS} * 3.25rem + ${LIBRARY_ASSET_SELECT_ROWS - 1} * 0.375rem)`
                          }}
                        >
                          {activeCategoryItems.map((item) => {
                            const picked = libraryMediaIds.includes(item.id);
                            const publishable = Boolean(item.url?.trim());
                            return (
                              <button
                                key={item.id}
                                type="button"
                                aria-pressed={picked}
                                disabled={!publishable}
                                onClick={() => toggleLibraryAsset(item.id)}
                                className={`relative flex w-full min-h-[3.25rem] flex-col justify-center rounded-lg border px-3 py-2 text-left transition ${!publishable ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-70" : picked ? opt.picked : opt.idle}`}
                              >
                                {picked ? (
                                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] text-white">
                                    ✓
                                  </span>
                                ) : null}
                                <span className="line-clamp-1 pr-6 text-[12px] font-semibold text-slate-900">{item.title}</span>
                                <span className="line-clamp-1 text-[10px] text-slate-500">{item.fileName}</span>
                                {!publishable ? (
                                  <span className="mt-0.5 text-[9px] text-amber-700">{t("须重新上传", "re-upload required")}</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="mt-2 text-[11px] text-slate-500">{t("请先点选上方素材类型（图片 / 视频）。", "Tap image or video above first.")}</p>
              )}
              {selectedLibraryMedia.length ? (
                <p className="mt-2 text-[10px] text-slate-600">
                  {t(`已选 ${selectedLibraryMedia.length} 个附件`, `${selectedLibraryMedia.length} attachment(s) selected`)}
                </p>
              ) : null}
            </div>
            <button type="button" className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white" onClick={addQueueItem}>
              {t("加入发布队列", "Add to queue")}
            </button>
          </div>
        </SectionCard>
      </div>
    </PageFrame>
  );
}

export function LinkedInWebsiteImportPage() {
  const t = useLinkedInText();
  const accountLimit = linkedinPublisherAccountLimit();
  const { accounts, setQueue } = useLinkedInPublisherState(accountLimit);
  const primaryAccount = accounts[0];
  const targetSlots = resolveDefaultAccountSlots(accounts);
  const [urls, setUrls] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => nowLocalInputValue(1));
  const [everyHours, setEveryHours] = useState(24);
  const [siteMsg, setSiteMsg] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [copyLocale, setCopyLocale] = useState<CopyLocale>(() => inferCopyLocaleFromSiteUrl("") ?? "en");

  function collectArticleUrls(): string[] {
    const fromTextarea = urls.split(/\n+/).map((u) => u.trim()).filter(Boolean);
    const pending = singleUrl.trim();
    const merged = pending ? [...fromTextarea, pending] : fromTextarea;
    return [...new Set(merged)];
  }

  function addSingleUrl() {
    const u = singleUrl.trim();
    if (!u) {
      setSiteMsg(t("请先输入文章 URL。", "Enter an article URL first."));
      return;
    }
    const inferred = inferCopyLocaleFromSiteUrl(u);
    if (inferred) setCopyLocale(inferred);
    setUrls((prev) => [...new Set([...prev.split(/\n+/).filter(Boolean), u])].join("\n"));
    setSingleUrl("");
    setSiteMsg(t("已加入待安排列表，可继续添加或点击「一键安排」。", "Added to the pending list. Add more or click Schedule.")); 
  }

  async function schedule() {
    const list = collectArticleUrls();
    if (!list.length) {
      setSiteMsg(
        t(
          "请先输入文章 URL（可直接点「一键安排」，或先「添加单篇文章」加入下方列表）。",
          "Enter at least one article URL (use Schedule directly, or Add single article first)."
        )
      );
      return;
    }
    setScheduleLoading(true);
    setSiteMsg(null);
    try {
      const drafts = await fetchArticleDraftBatch(list, copyLocale);
      const start = new Date(scheduledAt);
      const items = drafts.map((draft, idx): QueueItem => {
        const d = new Date(start.getTime() + idx * everyHours * 60 * 60 * 1000);
        return {
          id: createId("q"),
          title: draft.title,
          body: draft.body.slice(0, 1000),
          url: draft.url,
          thumbnailUrl: draft.thumbnailUrl,
          media: [],
          accountSlots: targetSlots,
          scheduledAt: new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
          mode: "auto",
          status: "queued"
        };
      });
      setQueue((prev) => [...prev, ...items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
      setUrls("");
      setSingleUrl("");
      setSiteMsg(
        t(
          `已加入 ${items.length} 条到「LinkedIn 发布队列」，请到左侧菜单「发布队列」查看文案。`,
          `Added ${items.length} posts to the queue. Open “LinkedIn queue” in the sidebar to preview copy.`
        )
      );
    } catch (e) {
      setSiteMsg(String((e as Error)?.message ?? e));
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <PageFrame view="website">
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title={t("发布账号", "Publishing account")} description={t("导入的文章将发布到此账号。", "Imported posts will publish to this account.")}>
            <LinkedInAccountBadge account={primaryAccount} compact />
          </SectionCard>
          <SectionCard title={t("安排规则", "Scheduling rules")} description={t("首条时间与每条间隔。", "First send time and interval between posts.")}>
            <label className="block text-sm font-semibold text-slate-900">{t("首条发送时间", "First send time")}</label>
            <input type="datetime-local" className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <label className="mt-4 block text-sm font-semibold text-slate-900">{t("每条间隔小时", "Hours between posts")}</label>
            <input type="number" min={1} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={everyHours} onChange={(e) => setEveryHours(Math.max(1, Number(e.target.value) || 24))} />
          </SectionCard>
        </div>
        <SectionCard
          title={t("文章 URL", "Article URLs")}
          description={t("粘贴博客文章链接，一键生成 LinkedIn 文案并加入发布队列。", "Paste blog article URLs to generate LinkedIn copy and add to the queue.")}
        >
          <div>
            <label className="block text-xs font-semibold text-slate-600">{t("文案语言", "Copy language")}</label>
            <select
              className="mt-1 h-10 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={copyLocale}
              onChange={(e) => setCopyLocale(e.target.value as CopyLocale)}
            >
              <option value="en">{t("英文导语", "English wrapper")}</option>
              <option value="zh">{t("中文导语", "Chinese wrapper")}</option>
            </select>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              placeholder={t("单篇文章 URL，例如 https://www.bigsocialboss.top/en/your-article/", "Single article URL, e.g. https://www.bigsocialboss.top/en/your-article/")}
              value={singleUrl}
              onChange={(e) => {
                const next = e.target.value;
                setSingleUrl(next);
                const inferred = inferCopyLocaleFromSiteUrl(next);
                if (inferred) setCopyLocale(inferred);
              }}
            />
            <button type="button" className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" onClick={addSingleUrl}>
              {t("添加单篇文章", "Add single article")}
            </button>
          </div>
          <textarea className="mt-4 min-h-56 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="https://example.com/blog/article-1&#10;https://example.com/blog/article-2" value={urls} onChange={(e) => setUrls(e.target.value)} />
          {siteMsg ? <p className={`mt-2 text-xs ${siteMsg.includes("已加入") || siteMsg.includes("Added") ? "text-emerald-700" : "text-slate-600"}`}>{siteMsg}</p> : null}
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {t(
              "可直接在上方输入 URL 后点「一键安排」；也可先「添加单篇文章」批量加入下方列表。生成「标题 + Key ideas + 原文链接 + CTA」，完整文案在「发布队列」中查看。",
              "Enter a URL and click Schedule, or use Add single article to build the list below. Full copy appears under “LinkedIn queue”."
            )}
          </p>
          <button
            type="button"
            className="mt-3 h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={scheduleLoading}
            onClick={() => void schedule()}
          >
            {scheduleLoading ? t("生成并入队中…", "Generating…") : t("一键安排，加入发布队列", "Schedule and add to queue")}
          </button>
        </SectionCard>
      </div>
    </PageFrame>
  );
}

export function LinkedInLibraryPage() {
  const t = useLinkedInText();
  const accountLimit = linkedinPublisherAccountLimit();
  const { library, setLibrary } = useLinkedInPublisherState(accountLimit);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const publishableLibrary = library.filter((item) => isPublishableLibraryType(item.type));
  const serverBytes = publishableLibrary.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
  const imageAssets = publishableLibrary.filter((item) => assetCategory(item.type) === "image");
  const videoAssets = publishableLibrary.filter((item) => assetCategory(item.type) === "video");
  const legacyDocumentAssets = library.filter((item) => assetCategory(item.type) === "document");

  async function addItem() {
    const nextTitle = title.trim() || fileName.trim();
    if (!nextTitle || !fileName.trim() || !selectedFile) return;
    const mediaType = inferMediaType(fileName);
    if (!mediaType) {
      setSaveMsg(t("仅支持图片与视频（png/jpg/webp/gif、mp4/mov/webm 等）。", "Only images and videos are supported (png/jpg/webp/gif, mp4/mov/webm, etc.)."));
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const resp = await apiFormUpload<{
        ok: true;
        asset: { name: string; url: string; sizeBytes: number };
      }>("/api/linkedin/assets/upload", form);
      const item: LibraryItem = {
        id: createId("lib"),
        title: nextTitle,
        type: mediaType,
        tags: tags.split(/[,\s，]+/).map((t) => t.trim()).filter(Boolean),
        fileName: fileName.trim(),
        createdAt: new Date().toISOString(),
        url: resp.asset.url,
        sizeBytes: resp.asset.sizeBytes
      };
      setLibrary([item, ...library]);
      setTitle("");
      setTags("");
      setFileName("");
      setSelectedFile(null);
      setSaveMsg(t("保存成功", "Saved"));
    } catch (e) {
      setSaveMsg(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame view="library">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <SectionCard title={t("新增素材", "Add asset")} description={t("仅支持图片与视频，上传后保存到服务器磁盘。", "Images and videos only; files are stored on server disk.")}>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" placeholder={t("自定义名称", "Custom name")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" placeholder={t("标签，用逗号分隔", "Tags, comma-separated")} value={tags} onChange={(e) => setTags(e.target.value)} />
            <input
              type="file"
              accept="image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.webm,.m4v"
              className="h-10 rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setFileName(file?.name ?? "");
              }}
            />
            <button
              type="button"
              className="h-10 min-w-20 whitespace-nowrap rounded-md bg-slate-900 px-5 text-sm font-semibold text-white disabled:bg-slate-300"
              onClick={() => void addItem()}
              disabled={saving || !selectedFile}
            >
              {saving ? t("保存中", "Saving") : t("保存", "Save")}
            </button>
          </div>
          {saveMsg ? <p className="mt-2 text-xs text-slate-500">{saveMsg}</p> : null}
        </SectionCard>
        <SectionCard title={t("空间使用", "Storage usage")} description={t("素材文件保存在服务器 uploads 卷。", "Asset files are stored in the standalone uploads volume.")}>
          <dl className="grid gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{t("文件记录", "File records")}</dt>
              <dd className="mt-1 text-xl font-bold text-slate-950">{publishableLibrary.length}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{t("服务器磁盘占用", "Server disk usage")}</dt>
              <dd className="mt-1 text-xl font-bold text-slate-950">{formatLinkedInStorageSize(serverBytes)}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
      <SectionCard title={t("素材列表", "Assets")} description={t("图片与视频可用于发布；旧版文档素材请删除。", "Images and videos are publishable; remove legacy document assets.")}>
        {legacyDocumentAssets.length ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>
              {t(
                `有 ${legacyDocumentAssets.length} 个旧版文档素材无法用于 LinkedIn 发布，建议删除。`,
                `${legacyDocumentAssets.length} legacy document asset(s) cannot be published to LinkedIn — consider deleting them.`
              )}
            </p>
            <button
              type="button"
              className="mt-2 font-semibold text-amber-950 underline"
              onClick={() => setLibrary(library.filter((item) => isPublishableLibraryType(item.type)))}
            >
              {t("一键清除旧文档", "Remove legacy documents")}
            </button>
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            { key: "images", title: t("图片", "Images"), items: imageAssets },
            { key: "videos", title: t("视频", "Videos"), items: videoAssets }
          ].map((group) => (
            <div key={group.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-800">{group.title}</h3>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{group.items.length}</span>
              </div>
              <div className={`space-y-1.5 overflow-y-auto pr-1 ${LIBRARY_CARD_LIST_MAX_CLASS}`}>
                {group.items.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-white p-2">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 truncate text-[10px] leading-snug text-slate-500">
                    {docTypeLabel(item.type, t)} · {item.fileName}
                    {!item.url?.trim() ? ` · ${t("须重新上传", "re-upload required")}` : ""}
                  </p>
                  {item.url ? <p className="mt-0.5 truncate text-[10px] text-sky-700">{item.url}</p> : null}
                </div>
                <button className="shrink-0 text-[10px] font-semibold text-red-600" onClick={() => setLibrary(library.filter((x) => x.id !== item.id))}>{t("删除", "Delete")}</button>
              </div>
              {item.tags.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tag}</span>)}
                </div>
              ) : null}
            </div>
                ))}
                {!group.items.length ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-[11px] text-slate-500">
                    {t("暂无素材", "No assets")}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageFrame>
  );
}

function AccountModal(props: { account: Account; onClose: () => void; onSave: (patch: Partial<Account>) => void }) {
  const t = useLinkedInText();
  const [name, setName] = useState(props.account.name);
  const [token, setToken] = useState(props.account.token);
  const [memberUrn, setMemberUrn] = useState(props.account.memberUrn);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const canSave = Boolean(token.trim() && memberUrn.trim());

  async function detectLinkedInProfile() {
    const accessToken = token.trim();
    if (!accessToken) {
      setDetectMsg(t("请先粘贴 Access Token。", "Paste an access token first."));
      return;
    }
    setDetecting(true);
    setDetectMsg(null);
    try {
      const detected = await apiJson<{ ok: boolean; memberUrn?: string; name?: string; message?: string }>(
        "/api/linkedin/profile-detect",
        {
          method: "POST",
          body: JSON.stringify({ accessToken })
        }
      );
      if (!detected.ok || !detected.memberUrn) {
        setDetectMsg(detected.message || t("未能自动检测。请确认 Products 已启用 OpenID Connect，并重新生成包含 openid、profile、email 与 w_member_social 的 Access Token。", "Could not auto-detect. Enable OpenID Connect on Products and regenerate an Access Token with openid, profile, email, and w_member_social."));
        return;
      }
      setMemberUrn(detected.memberUrn);
      if (detected.name) setName(detected.name);
      setDetectMsg(t("检测成功，已识别 LinkedIn 账号。", "Detected successfully. LinkedIn account identified."));
    } catch (e) {
      setDetectMsg(String((e as Error)?.message ?? e));
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              {props.account.enabled ? t("编辑 LinkedIn 授权", "Edit LinkedIn authorization") : t("接入 LinkedIn 账号", "Connect LinkedIn account")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t("保存 Access Token 与 Member URN 后即可发布。", "Save your access token and Member URN to start publishing.")}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${props.account.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {props.account.enabled ? t("已授权", "Authorized") : t("未授权", "Not authorized")}
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder={t("账号名称，检测成功后自动填写", "Account name, filled after detection")} value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="LinkedIn Access Token" value={token} onChange={(e) => setToken(e.target.value)} />
          <div className={`rounded-lg border px-3 py-2 text-sm ${memberUrn ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            {memberUrn ? t("已检测到 LinkedIn ID，保存后状态显示为已授权。", "LinkedIn ID detected. Save to mark this account as authorized.") : t("粘贴 token 后点击自动检测，检测成功才可保存授权。", "Paste a token and auto-detect. Authorization can be saved after detection succeeds.")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              disabled={detecting}
              onClick={() => void detectLinkedInProfile()}
            >
              {detecting ? t("检测中...", "Detecting...") : t("自动检测 LinkedIn ID", "Auto-detect LinkedIn ID")}
            </button>
            {detectMsg ? <span className="text-xs text-slate-500">{detectMsg}</span> : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={props.onClose}>{t("取消", "Cancel")}</button>
          <button
            type="button"
            className="h-9 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            disabled={!canSave}
            onClick={() => props.onSave({ name: name.trim() || props.account.name, token: token.trim(), memberUrn: memberUrn.trim(), enabled: Boolean(token.trim()) })}
          >
            {t("保存授权", "Save authorization")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LinkedInPublishingPage;
