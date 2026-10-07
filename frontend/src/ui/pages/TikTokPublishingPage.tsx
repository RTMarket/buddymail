import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFormUpload, apiJson, apiJsonWithTimeout } from "../../lib/api";
import { appendTikTokLibraryLogs } from "../../lib/standaloneSocialLibraryApi";
import {
  tiktokPublisherAccountLimit,
  TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS
} from "../../lib/tiktokPublisherEntitlement";
import {
  readTikTokJson,
  TIKTOK_LS_ACCOUNTS,
  TIKTOK_LS_LIBRARY,
  TIKTOK_LS_LIBRARY_LOGGED,
  TIKTOK_LS_QUEUE,
  writeTikTokJson
} from "../../lib/tiktokPublisherStorage";
import { PageShell } from "../components/PageShell";

type Account = {
  slot: number;
  name: string;
  /** TikTok @username（有则优先展示） */
  username?: string;
  /** TikTok 头像 URL */
  avatarUrl?: string;
  openId: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  /** 公开数据：粉丝数（同步给日报统计用） */
  followerCount?: number | null;
  /** 公开数据：作品数（同步给日报统计用） */
  videoCount?: number | null;
};

type LibraryItem = {
  id: string;
  name: string;
  type: "image" | "video";
  url: string;
  mime?: string;
  sizeBytes?: number;
  createdAt: string;
};

type QueueItem = {
  id: string;
  accountSlot: number;
  title: string;
  body: string;
  mediaIds: string[];
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  status: "draft" | "queued" | "publishing" | "published" | "failed";
  publishId?: string;
  error?: string;
  warnings?: string[];
  createdAt: string;
  updatedAt: string;
};

type View = "accounts" | "queue" | "compose" | "library";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function blankAccountSlot(slot: number): Account {
  return {
    slot,
    name: "",
    username: "",
    avatarUrl: "",
    openId: "",
    accessToken: "",
    refreshToken: "",
    scope: ""
  };
}

function emptyAccounts(limit: number): Account[] {
  return Array.from({ length: Math.max(0, limit) }, (_, i) => blankAccountSlot(i + 1));
}

function pendingAccountLabel(slot: number): string {
  return `待授权 TikTok ${slot}号`;
}

function accountReady(a?: Account): boolean {
  return Boolean(a?.accessToken && a.accessToken.length >= 20 && a.openId);
}

function looksLikeOpenId(value: string, openId?: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (openId && v === openId) return true;
  return /^[0-9A-Za-z_-]{18,}$/.test(v) && !/\s/.test(v);
}

function accountNeedsProfileRefresh(a: Account): boolean {
  if (!accountReady(a)) return false;
  if (!a.avatarUrl) return true;
  if (!a.username && looksLikeOpenId(a.name || "", a.openId)) return true;
  return false;
}

/** OAuth 返回的 scope 字符串里是否含直发所需 video.publish */
function accountHasPublishScope(a?: Account): boolean {
  const s = (a?.scope || "").toLowerCase();
  if (!s) return false;
  return s.split(/[,\s]+/).includes("video.publish");
}

function accountTitle(a: Account): string {
  if (a.username) return `@${a.username.replace(/^@/, "")}`;
  if (a.name && !looksLikeOpenId(a.name, a.openId)) return a.name;
  return "已授权账号";
}

function accountSubtitle(a: Account): string {
  if (a.username && a.name && !looksLikeOpenId(a.name, a.openId) && a.name !== a.username) {
    return a.name;
  }
  if (a.name && !looksLikeOpenId(a.name, a.openId)) return a.name;
  return a.avatarUrl ? "资料已同步" : "可点「编辑」或重新授权同步头像";
}

function TikTokBrandIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M33.5 12.2c1.9 1.7 4.2 2.9 6.8 3.3v6.1c-2.3-.1-4.5-.7-6.5-1.8v11.6c0 7.2-5.8 13-13 13S7.8 38.6 7.8 31.4s5.8-13 13-13c.7 0 1.4.1 2.1.2v6.4c-.7-.3-1.4-.4-2.1-.4-3.7 0-6.7 3-6.7 6.7s3 6.7 6.7 6.7 6.7-3 6.7-6.7V8h6.5c.1 1.5.5 2.9 1.5 4.2z"
        fill="currentColor"
      />
    </svg>
  );
}

function AccountAvatar({ account, ready }: { account: Account; ready: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = ready && Boolean(account.avatarUrl) && !imgFailed;
  if (showPhoto) {
    return (
      <img
        src={account.avatarUrl}
        alt={accountTitle(account)}
        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-black/10"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${
        ready ? "bg-black" : "bg-slate-300"
      }`}
      title="TikTok"
    >
      {ready ? (
        <>
          <span className="absolute translate-x-[0.5px] translate-y-[0.5px] text-[#25F4EE] opacity-80">
            <TikTokBrandIcon className="h-4 w-4" />
          </span>
          <span className="absolute -translate-x-[0.5px] -translate-y-[0.5px] text-[#FE2C55] opacity-80">
            <TikTokBrandIcon className="h-4 w-4" />
          </span>
          <span className="relative text-white">
            <TikTokBrandIcon className="h-4 w-4" />
          </span>
        </>
      ) : (
        <span className="text-xs font-bold">{account.slot}</span>
      )}
    </div>
  );
}

function useTikTokState(limit: number) {
  const [accounts, setAccountsState] = useState<Account[]>(() => {
    const saved = readTikTokJson<Account[]>(TIKTOK_LS_ACCOUNTS, []);
    const base = emptyAccounts(limit || TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS);
    return base.map((slotAcc) => {
      const hit = saved.find((s) => s.slot === slotAcc.slot);
      return hit ? { ...slotAcc, ...hit, slot: slotAcc.slot } : slotAcc;
    });
  });
  const [library, setLibraryState] = useState<LibraryItem[]>(() =>
    readTikTokJson<LibraryItem[]>(TIKTOK_LS_LIBRARY, [])
  );
  const [queue, setQueueState] = useState<QueueItem[]>(() =>
    readTikTokJson<QueueItem[]>(TIKTOK_LS_QUEUE, [])
  );

  useEffect(() => {
    setAccountsState((prev) => {
      const next = emptyAccounts(limit);
      return next.map((slotAcc) => {
        const hit = prev.find((s) => s.slot === slotAcc.slot);
        return hit ? { ...slotAcc, ...hit, slot: slotAcc.slot } : slotAcc;
      });
    });
  }, [limit]);

  const setAccounts = (next: Account[] | ((p: Account[]) => Account[])) => {
    setAccountsState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeTikTokJson(TIKTOK_LS_ACCOUNTS, value);
      return value;
    });
  };

  // 已接通 TikTok 账号的公开资料同步到后端，供「每日日报总结」统计用（只传公开字段，不传 token）。
  // 为避免新浏览器（本地无账号）误清空后端数据：从未见过已接通账号时不下发空同步。
  const tiktokSyncTouchedRef = useRef(false);
  useEffect(() => {
    const ready = accounts.filter(accountReady);
    if (ready.length > 0) tiktokSyncTouchedRef.current = true;
    if (ready.length === 0 && !tiktokSyncTouchedRef.current) return;
    const timer = window.setTimeout(() => {
      apiJson("/api/standalone/tiktok/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: ready.map((a) => ({
            slot: a.slot,
            username: a.username || "",
            name: a.name || "",
            avatarUrl: a.avatarUrl || "",
            openId: a.openId || "",
            followerCount: a.followerCount ?? null,
            videoCount: a.videoCount ?? null
          }))
        })
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [accounts]);
  const setLibrary = (next: LibraryItem[] | ((p: LibraryItem[]) => LibraryItem[])) => {
    setLibraryState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeTikTokJson(TIKTOK_LS_LIBRARY, value);
      return value;
    });
  };
  const setQueue = (next: QueueItem[] | ((p: QueueItem[]) => QueueItem[])) => {
    setQueueState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeTikTokJson(TIKTOK_LS_QUEUE, value);
      return value;
    });
  };

  return { accounts, library, queue, setAccounts, setLibrary, setQueue };
}

function PageFrame({ view, children }: { view: View; children: ReactNode }) {
  const limit = tiktokPublisherAccountLimit() || TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS;
  const titles: Record<View, string> = {
    accounts: "TikTok 账号管理",
    queue: "TikTok 发布队列",
    compose: "创建 TikTok 发布",
    library: "TikTok 文件库"
  };
  const desc: Record<View, string> = {
    accounts: `绑定最多 ${limit} 个 TikTok 账号；每个槽位可单独点「接入授权」。`,
    queue: "查看待发布内容与当前状态。",
    compose: "创建图文/视频文案并发布到已授权账号。",
    library: "上传图片、视频到服务器，发布时可直接选用。"
  };
  return (
    <PageShell title={titles[view]} description={desc[view]}>
      {children}
    </PageShell>
  );
}

function SectionCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TikTokPublishingPage() {
  return <TikTokAccountsPage />;
}

export function TikTokAccountsPage() {
  const limit = tiktokPublisherAccountLimit();
  const { accounts, queue, setAccounts } = useTikTokState(limit);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const profileRefreshTriedRef = useRef<Set<string>>(new Set());

  async function refreshAccountProfile(slot: number) {
    const acc = accountsRef.current.find((a) => a.slot === slot);
    if (!acc?.accessToken) return;
    try {
      const profile = await apiJson<{
        ok: boolean;
        name?: string;
        username?: string;
        avatarUrl?: string;
        creatorOk?: boolean;
        followerCount?: number | null;
        videoCount?: number | null;
        message?: string;
      }>("/api/tiktok/profile-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: acc.accessToken })
      });
      if (!profile.ok) {
        setOauthMsg(profile.message || "刷新资料失败");
        return;
      }
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.slot !== slot) return a;
          let scope = a.scope || "";
          if (profile.creatorOk && !scope.toLowerCase().includes("video.publish")) {
            scope = scope ? `${scope},video.publish` : "video.publish";
          }
          return {
            ...a,
            name: profile.name || a.name,
            username: profile.username || a.username || "",
            avatarUrl: profile.avatarUrl || a.avatarUrl || "",
            followerCount: profile.followerCount ?? a.followerCount ?? null,
            videoCount: profile.videoCount ?? a.videoCount ?? null,
            scope
          };
        })
      );
      const label = profile.username
        ? `@${profile.username.replace(/^@/, "")}`
        : profile.name || accountTitle({ ...acc, name: profile.name || "", username: profile.username || "" });
      setOauthMsg(
        profile.creatorOk
          ? `#${slot} 资料已更新：${label}（可发帖）`
          : `#${slot} 资料已更新：${label}，但仍无发帖权限 — 请重新授权`
      );
    } catch (e) {
      setOauthMsg(String((e as Error)?.message ?? e));
    }
  }

  // 已授权但缺头像/昵称时自动补拉一次（修复历史只存了 open_id 的槽）
  useEffect(() => {
    const stale = accounts.filter((a) => {
      if (!accountNeedsProfileRefresh(a)) return false;
      const key = `${a.slot}:${a.openId}`;
      if (profileRefreshTriedRef.current.has(key)) return false;
      return true;
    });
    if (stale.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const acc of stale) {
        if (cancelled) break;
        const key = `${acc.slot}:${acc.openId}`;
        profileRefreshTriedRef.current.add(key);
        try {
          const profile = await apiJson<{
            ok: boolean;
            name?: string;
            username?: string;
            avatarUrl?: string;
          }>("/api/tiktok/profile-detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: acc.accessToken })
          });
          if (!profile.ok || cancelled) continue;
          setAccounts((prev) =>
            prev.map((a) =>
              a.slot === acc.slot
                ? {
                    ...a,
                    name: profile.name || a.name,
                    username: profile.username || a.username || "",
                    avatarUrl: profile.avatarUrl || a.avatarUrl || ""
                  }
                : a
            )
          );
        } catch {
          /* ignore one slot */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, setAccounts]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const slot = Number(searchParams.get("slot") ?? 0);
    if (!oauth || !slot) return;
    if (oauth === "err") {
      setOauthMsg(searchParams.get("msg") || "授权失败");
      setSearchParams({}, { replace: true });
      return;
    }
    if (oauth === "ok") {
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
          if (!pending.ok || !pending.accessToken || !pending.openId) {
            // 二次进入 / 刷新时 pending 可能已领过：若本槽已有 token 则不当成失败
            const existing = accountsRef.current.find((a) => a.slot === slot);
            if (existing && accountReady(existing)) {
              setOauthMsg(`#${slot} 已授权：${accountTitle(existing)}`);
            } else {
              setOauthMsg(pending.message || "领取授权失败，请再点一次 OAuth");
            }
            return;
          }
          let name = pending.displayName || "";
          let username = pending.username || "";
          let avatarUrl = pending.avatarUrl || "";
          let scope = pending.scope || "";
          let creatorOk = false;
          let followerCount: number | null = null;
          let videoCount: number | null = null;
          // 始终再拉一次资料，并探测是否已获 video.publish（creator_info）
          try {
            const profile = await apiJson<{
              ok: boolean;
              name?: string;
              username?: string;
              avatarUrl?: string;
              creatorOk?: boolean;
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
              creatorOk = Boolean(profile.creatorOk);
              followerCount = profile.followerCount ?? null;
              videoCount = profile.videoCount ?? null;
            }
          } catch {
            /* keep pending fields */
          }
          if (creatorOk && !scope.toLowerCase().includes("video.publish")) {
            scope = scope ? `${scope},video.publish` : "video.publish";
          }
          if (!name || looksLikeOpenId(name, pending.openId)) {
            name = username ? `@${username.replace(/^@/, "")}` : `TikTok #${slot}`;
          }
          setAccounts((prev) =>
            prev.map((a) =>
              a.slot === slot
                ? {
                    ...a,
                    accessToken: pending.accessToken!,
                    refreshToken: pending.refreshToken || "",
                    openId: pending.openId!,
                    name,
                    username,
                    avatarUrl,
                    followerCount,
                    videoCount,
                    scope
                  }
                : a
            )
          );
          const label = username ? `@${username.replace(/^@/, "")}` : name;
          if (creatorOk || scope.toLowerCase().includes("video.publish")) {
            setOauthMsg(`#${slot} 授权成功：${label}（已含发帖权限）`);
          } else {
            setOauthMsg(
              `#${slot} 已登录：${label}，但 TikTok 未授予 video.publish。请确认授权链接含发帖权限，或到开发者后台为 Sandbox App 开启 Content Posting / Direct Post 后再 OAuth。`
            );
          }
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          const existing = accountsRef.current.find((a) => a.slot === slot);
          if (existing && accountReady(existing) && /没有待领取|404|过期/.test(msg)) {
            setOauthMsg(`#${slot} 已授权：${accountTitle(existing)}`);
          } else {
            setOauthMsg(msg);
          }
        } finally {
          setSearchParams({}, { replace: true });
        }
      })();
    }
  }, [searchParams, setAccounts, setSearchParams]);

  const slotLimit = limit || TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS;
  const readyCount = accounts.filter(accountReady).length;
  const queuedCount = queue.filter((q) => q.status === "queued" || q.status === "draft").length;
  const publishedCount = queue.filter((q) => q.status === "published").length;

  function removeAccountAuthorization(slot: number) {
    const acc = accounts.find((a) => a.slot === slot);
    const label = acc && accountReady(acc) ? accountTitle(acc) : pendingAccountLabel(slot);
    if (!window.confirm(`确认移除「${label}」的授权？移除后该槽位将恢复为灰色「待授权 TikTok ${slot}号」。`)) {
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.slot === slot ? blankAccountSlot(slot) : a)));
    if (editingSlot === slot) setEditingSlot(null);
  }

  return (
    <PageFrame view="accounts">
      {oauthMsg ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">{oauthMsg}</div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <SectionCard
          title={`${slotLimit} 个 TikTok 账号槽`}
          description="每个槽位可单独接入或移除授权；已授权显示账号名称，未授权显示灰色「待授权 TikTok N号」。"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((acc) => {
              const ready = accountReady(acc);
              return (
                <div
                  key={acc.slot}
                  className={`rounded-xl border p-3 ${
                    ready ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <AccountAvatar account={acc} ready={ready} />
                      {ready ? (
                        <span className="absolute -left-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[9px] font-semibold text-white">
                          {acc.slot}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-bold ${ready ? "text-slate-950" : "text-slate-400"}`}>
                        {ready ? accountTitle(acc) : pendingAccountLabel(acc.slot)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {ready ? accountSubtitle(acc) : "尚未接入授权"}
                      </p>
                      {ready ? (
                        <span className="mt-1.5 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          已授权
                          {accountHasPublishScope(acc) ? " · 可发帖" : " · 缺发帖权限"}
                        </span>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ready ? (
                          <>
                            <button
                              type="button"
                              className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                              onClick={() => setEditingSlot(acc.slot)}
                            >
                              编辑
                            </button>
                            <a
                              href={`/api/tiktok/oauth/authorize?slot=${acc.slot}&disable_auto_auth=1`}
                              className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              授权
                            </a>
                            <button
                              type="button"
                              className="h-8 rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                              onClick={() => removeAccountAuthorization(acc.slot)}
                            >
                              移除
                            </button>
                          </>
                        ) : (
                          <a
                            href={`/api/tiktok/oauth/authorize?slot=${acc.slot}&disable_auto_auth=1`}
                            className="inline-flex h-8 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            接入授权
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link
              to="/tiktok/publishing/compose"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              创建发布
            </Link>
            <Link
              to="/tiktok/publishing/library"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              文件库
            </Link>
            <Link
              to="/tiktok/publishing/queue"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              发布队列
            </Link>
          </div>
        </SectionCard>
        <aside className="space-y-4">
          <SectionCard title="概况" description="当前发布状态">
            <dl className="grid gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">已授权 / 总槽位</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">
                  {readyCount}/{slotLimit}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">待发布</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">{queuedCount}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">已发布</dt>
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
            setAccounts((prev) => prev.map((a) => (a.slot === editingSlot ? { ...a, ...patch } : a)));
            setEditingSlot(null);
          }}
        />
      ) : null}
    </PageFrame>
  );
}

function AccountModal({
  account,
  onClose,
  onSave
}: {
  account: Account;
  onClose: () => void;
  onSave: (patch: Partial<Account>) => void;
}) {
  const [name, setName] = useState(account.name);
  const [username, setUsername] = useState(account.username || "");
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl || "");
  const [openId, setOpenId] = useState(account.openId);
  const [accessToken, setAccessToken] = useState(account.accessToken);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function detect() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiJson<{
        ok: boolean;
        openId?: string;
        name?: string;
        username?: string;
        avatarUrl?: string;
        message?: string;
      }>("/api/tiktok/profile-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken })
      });
      if (!r.ok) {
        setErr(r.message || "检测失败");
        return;
      }
      setOpenId(r.openId || "");
      if (r.name) setName(r.name);
      if (r.username) setUsername(r.username);
      if (r.avatarUrl) setAvatarUrl(r.avatarUrl);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold">接入账号 #{account.slot}</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">显示名</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Access Token</span>
            <textarea
              className="mt-1 h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">open_id</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
            />
          </label>
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || accessToken.trim().length < 20}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void detect()}
          >
            {busy ? "检测中…" : "自动检测 open_id"}
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            onClick={() =>
              onSave({
                name: name.trim() || `TikTok #${account.slot}`,
                username: username.trim(),
                avatarUrl: avatarUrl.trim(),
                openId: openId.trim(),
                accessToken: accessToken.trim()
              })
            }
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export function TikTokLibraryPage() {
  const limit = tiktokPublisherAccountLimit();
  const { library, setLibrary } = useTikTokState(limit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiFormUpload<{
        ok: boolean;
        asset?: { name: string; url: string; mime?: string; sizeBytes?: number };
        message?: string;
      }>("/api/tiktok/assets/upload", form);
      if (!r.ok || !r.asset) throw new Error(r.message || "上传失败");
      const type: "image" | "video" = (r.asset.mime || file.type || "").startsWith("video")
        ? "video"
        : "image";
      setLibrary((prev) => [
        {
          id: uid("lib"),
          name: r.asset!.name,
          type,
          url: r.asset!.url,
          mime: r.asset!.mime,
          sizeBytes: r.asset!.sizeBytes,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame view="library">
      <SectionCard
        title="文件库"
        description="视频：mp4/mov 等。图片：仅 jpg/jpeg/webp（TikTok 不接受 PNG，否则会受理后失败、手机看不到）。"
      >
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          {busy ? "上传中…" : "上传图片/视频"}
          <input
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.webp,.mp4,.mov,.webm,.m4v,image/jpeg,image/webp,video/*"
            disabled={busy}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
        </label>
        {err ? <p className="mt-3 text-sm text-rose-600">{err}</p> : null}
        <ul className="mt-4 space-y-2">
          {library.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {item.type} · {item.url}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-rose-600"
                onClick={() => setLibrary((prev) => prev.filter((x) => x.id !== item.id))}
              >
                删除
              </button>
            </li>
          ))}
          {library.length === 0 ? <li className="text-sm text-slate-500">暂无素材</li> : null}
        </ul>
      </SectionCard>
    </PageFrame>
  );
}

export function TikTokComposePage() {
  const limit = tiktokPublisherAccountLimit();
  const { accounts, library, queue, setQueue } = useTikTokState(limit);
  const readyAccounts = accounts.filter(accountReady);
  const [accountSlot, setAccountSlot] = useState(readyAccounts[0]?.slot ?? 1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [postMode, setPostMode] = useState<"DIRECT_POST" | "MEDIA_UPLOAD">("DIRECT_POST");
  const [privacyLevel, setPrivacyLevel] =
    useState<"PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY">("SELF_ONLY");
  const [msg, setMsg] = useState<string | null>(null);

  function toggleMedia(id: string) {
    setMediaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 35)));
  }

  function addToQueue() {
    if (!readyAccounts.some((a) => a.slot === accountSlot)) {
      setMsg("请先在账号管理授权至少一个 TikTok 账号");
      return;
    }
    if (mediaIds.length < 1) {
      setMsg("TikTok 不支持纯文字：请至少选 1 个视频或图片");
      return;
    }
    const item: QueueItem = {
      id: uid("q"),
      accountSlot,
      title: title.trim(),
      body: body.trim(),
      mediaIds: [...mediaIds],
      postMode,
      privacyLevel,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setQueue([item, ...queue]);
    setMsg("已加入发布队列");
    setTitle("");
    setBody("");
    setMediaIds([]);
  }

  return (
    <PageFrame view="compose">
      <SectionCard
        title="创建发布"
        description="文案 + 视频/图片。Sandbox 直发：TikTok 账号须设为「私密」+ 隐私「仅自己」；图片域名须在开发者后台 URL properties 验证。"
      >
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
          若报 integration guidelines / unaudited：到 TikTok App → 设置 → 隐私 → 将账号设为<strong>私密</strong>后再发。图片失败时检查开发者后台是否已验证{" "}
          <code className="rounded bg-white/80 px-1">https://socialedm.email/</code> 的 URL 属性。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-semibold">发布账号</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={accountSlot}
              onChange={(e) => setAccountSlot(Number(e.target.value))}
            >
              {readyAccounts.length === 0 ? <option value={1}>暂无已授权账号</option> : null}
              {readyAccounts.map((a) => (
                <option key={a.slot} value={a.slot}>
                  #{a.slot} · {accountTitle(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">发布模式</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={postMode}
              onChange={(e) => setPostMode(e.target.value as "DIRECT_POST" | "MEDIA_UPLOAD")}
            >
              <option value="DIRECT_POST">直发（Direct Post）</option>
              <option value="MEDIA_UPLOAD">推到草稿箱/收件箱</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">隐私</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={privacyLevel}
              onChange={(e) =>
                setPrivacyLevel(e.target.value as "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY")
              }
            >
              <option value="SELF_ONLY">仅自己（推荐联调）</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">好友可见</option>
              <option value="PUBLIC_TO_EVERYONE">公开（需 App 过审）</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-semibold">标题</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="短标题 / 视频标题"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-semibold">文案描述</span>
            <textarea
              className="mt-1 h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="正文、话题标签等"
            />
          </label>
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold">从文件库选择素材</p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {library.map((item) => {
              const on = mediaIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? "bg-sky-50" : "hover:bg-slate-50"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggleMedia(item.id)} />
                  <span className="font-medium">{item.type}</span>
                  <span className="truncate">{item.name}</span>
                </label>
              );
            })}
            {library.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">
                文件库为空，请先去 <Link className="underline" to="/tiktok/publishing/library">文件库</Link> 上传
              </p>
            ) : null}
          </div>
        </div>
        {msg ? <p className="mt-3 text-sm text-sky-800">{msg}</p> : null}
        <button
          type="button"
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={addToQueue}
        >
          加入发布队列
        </button>
      </SectionCard>
    </PageFrame>
  );
}

const QUEUE_PAGE_SIZE = 50;
/** 可视区域大约露出 15 条，其余用滚动条查看 */
const QUEUE_VIEWPORT_MAX_H = "max-h-[58rem]";

export function TikTokQueuePage() {
  const limit = tiktokPublisherAccountLimit();
  const { accounts, library, queue, setQueue } = useTikTokState(limit);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [queuePage, setQueuePage] = useState(1);
  const libMap = useMemo(() => new Map(library.map((x) => [x.id, x])), [library]);

  const queuePageCount = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
  const safeQueuePage = Math.min(queuePage, queuePageCount);
  const pageItems = useMemo(() => {
    const start = (safeQueuePage - 1) * QUEUE_PAGE_SIZE;
    return queue.slice(start, start + QUEUE_PAGE_SIZE);
  }, [queue, safeQueuePage]);

  useEffect(() => {
    if (queuePage > queuePageCount) setQueuePage(queuePageCount);
  }, [queuePage, queuePageCount]);

  async function publishNow(item: QueueItem) {
    const acc = accounts.find((a) => a.slot === item.accountSlot);
    if (!accountReady(acc)) {
      setFeedback("账号未授权");
      return;
    }
    if (item.postMode === "DIRECT_POST" && !accountHasPublishScope(acc)) {
      setFeedback(
        `#${item.accountSlot} 缺少 video.publish。请回账号管理对该号重新点 OAuth（授权页须同意发帖），成功后角标会显示「可发帖」。`
      );
      return;
    }
    if (item.privacyLevel === "PUBLIC_TO_EVERYONE") {
      setFeedback(
        "未过 TikTok App Audit 时公开可见通常会被拒。请回「创建发布」改隐私为「仅自己」后重新入队。"
      );
      return;
    }
    const media = item.mediaIds
      .map((id) => libMap.get(id))
      .filter(Boolean)
      .map((m) => ({ type: m!.type, name: m!.name, url: m!.url }));
    if (media.length < 1) {
      setFeedback("素材缺失：请确认文件库仍有对应图片/视频");
      return;
    }
    setPublishingId(item.id);
    setFeedback(null);
    setQueue((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, status: "publishing", updatedAt: new Date().toISOString() } : x))
    );
    try {
      const r = await apiJsonWithTimeout<{
        ok: boolean;
        publishId?: string;
        status?: string | null;
        warnings?: string[];
        message?: string;
      }>(
        "/api/tiktok/posts/publish-now",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: acc!.accessToken,
            openId: acc!.openId,
            title: item.title,
            body: item.body,
            postMode: item.postMode,
            privacyLevel: item.privacyLevel,
            media
          })
        },
        180_000
      );
      if (!r.ok) throw new Error(r.message || "发布失败");
      const done = r.status === "PUBLISH_COMPLETE" || r.status === "SEND_TO_USER_INBOX";
      const submittedMessage = r.publishId
        ? `已提交发布 TikTok ${item.accountSlot} ${r.publishId}`
        : `已提交 TikTok ${item.accountSlot} 发布`;
      await appendTikTokLibraryLogs([
        { title: item.title || `TikTok ${item.accountSlot}`, results: [{ platform: "tiktok", ok: true, message: submittedMessage }] }
      ]).catch(() => null);
      writeTikTokJson(TIKTOK_LS_LIBRARY_LOGGED, [
        ...readTikTokJson<string[]>(TIKTOK_LS_LIBRARY_LOGGED, []),
        item.id
      ]);
      setQueue((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: done ? "published" : "publishing",
                publishId: r.publishId,
                warnings: r.warnings,
                error: undefined,
                updatedAt: new Date().toISOString()
              }
            : x
        )
      );
      setFeedback(
        `${done ? "TikTok 已确认" : "已受理，处理中"}：status=${r.status || "?"} publish_id=${r.publishId || "-"}${(r.warnings || []).length ? `；${(r.warnings || []).join(" ")}` : ""}`
      );
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      await appendTikTokLibraryLogs([
        {
          title: item.title || `TikTok ${item.accountSlot}`,
          results: [{ platform: "tiktok", ok: false, message: `TikTok ${item.accountSlot}：${message.slice(0, 800)}` }]
        }
      ]).catch(() => null);
      writeTikTokJson(TIKTOK_LS_LIBRARY_LOGGED, [
        ...readTikTokJson<string[]>(TIKTOK_LS_LIBRARY_LOGGED, []),
        item.id
      ]);
      setQueue((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, status: "failed", error: message, updatedAt: new Date().toISOString() }
            : x
        )
      );
      setFeedback(message);
    } finally {
      setPublishingId(null);
    }
  }

  async function checkPublishStatus(item: QueueItem) {
    const acc = accounts.find((a) => a.slot === item.accountSlot);
    if (!item.publishId || !acc?.accessToken) {
      setFeedback("缺少 publish_id 或账号 Token");
      return;
    }
    try {
      const r = await apiJson<{
        ok: boolean;
        status?: string;
        failReason?: string | null;
        message?: string;
      }>("/api/tiktok/posts/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: acc.accessToken, publishId: item.publishId })
      });
      if (!r.ok) throw new Error(r.message || "查询失败");
      if (r.status === "FAILED") {
        setQueue((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: "failed",
                  error: `TikTok 终态 FAILED${r.failReason ? `：${r.failReason}` : ""}`,
                  updatedAt: new Date().toISOString()
                }
              : x
          )
        );
        setFeedback(`publish_id=${item.publishId} → FAILED${r.failReason ? `（${r.failReason}）` : ""}。PNG 请改传 jpg/webp 后重发。`);
        return;
      }
      if (r.status === "PUBLISH_COMPLETE" || r.status === "SEND_TO_USER_INBOX") {
        setQueue((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? { ...x, status: "published", error: undefined, updatedAt: new Date().toISOString() }
              : x
          )
        );
      }
      setFeedback(`publish_id=${item.publishId} → ${r.status}${r.failReason ? ` / ${r.failReason}` : ""}`);
    } catch (e) {
      setFeedback(String((e as Error)?.message ?? e));
    }
  }

  return (
    <PageFrame view="queue">
      <SectionCard
        title="发布队列"
        description="一页最多 50 条；列表可视约 15 条，其余下拉滚动。即时发送后会轮询 TikTok 终态。"
      >
        {feedback ? <p className="mb-3 text-sm text-slate-800">{feedback}</p> : null}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            共 {queue.length} 条 · 第 {safeQueuePage}/{queuePageCount} 页（每页 {QUEUE_PAGE_SIZE}）
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safeQueuePage <= 1}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
              onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              disabled={safeQueuePage >= queuePageCount}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
              onClick={() => setQueuePage((p) => Math.min(queuePageCount, p + 1))}
            >
              下一页
            </button>
          </div>
        </div>
        <ul className={`${QUEUE_VIEWPORT_MAX_H} space-y-3 overflow-y-auto overscroll-contain pr-1`}>
          {pageItems.map((item) => {
            const acc = accounts.find((a) => a.slot === item.accountSlot);
            return (
              <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{item.title || item.body.slice(0, 40) || "（无标题）"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      #{item.accountSlot} · {acc ? accountTitle(acc) : "未知账号"} · {item.postMode} ·{" "}
                      {item.privacyLevel} · 素材 {item.mediaIds.length} · {item.status}
                    </p>
                    {item.publishId ? (
                      <p className="mt-1 font-mono text-xs text-emerald-700">publish_id: {item.publishId}</p>
                    ) : null}
                    {item.error ? <p className="mt-1 text-xs text-rose-600">{item.error}</p> : null}
                    {item.warnings?.length ? (
                      <p className="mt-1 text-xs text-amber-700">{item.warnings.join(" ")}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={publishingId === item.id || item.status === "published"}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => void publishNow(item)}
                    >
                      {item.status === "published"
                        ? "已发送"
                        : publishingId === item.id
                          ? "发送中…"
                          : "即时发送"}
                    </button>
                    {item.publishId ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800"
                        onClick={() => void checkPublishStatus(item)}
                      >
                        查询状态
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-rose-600"
                      onClick={() => setQueue((prev) => prev.filter((x) => x.id !== item.id))}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {queue.length === 0 ? <li className="text-sm text-slate-500">队列为空，请先去「创建发布」</li> : null}
        </ul>
      </SectionCard>
    </PageFrame>
  );
}

export default TikTokPublishingPage;
