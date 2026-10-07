import React, { useEffect, useState } from "react";
import { loadChannelAccounts, saveChannelAccount, type ChannelAccount } from "../../lib/standaloneSocialLibraryApi";

type FieldKey = "account" | "secret" | "extra";

type ChannelField = {
  key: FieldKey;
  label: string;
  secret?: boolean;
  placeholder?: string;
};

type ChannelForm = {
  id: string;
  label: string;
  method: string;
  fields: ChannelField[];
};

const CHANNEL_FORMS: ChannelForm[] = [
  {
    id: "nostr",
    label: "Nostr（ Primal ）",
    method: "",
    fields: [
      { key: "secret", label: "私钥 nsec", secret: true, placeholder: "nsec1…" },
      { key: "extra", label: "Relays", placeholder: "wss://relay.damus.io,wss://nos.lol" }
    ]
  },
  {
    id: "lens",
    label: "Lens Protocol",
    method: "链上社交图谱 API",
    fields: [
      { key: "account", label: "Profile / 地址", placeholder: "lens/你的名字" },
      { key: "secret", label: "Access token", secret: true }
    ]
  },
  {
    id: "blogger",
    label: "Blogger",
    method: "Google Blogger API",
    fields: [
      { key: "account", label: "Blog ID 或网址" },
      { key: "secret", label: "OAuth access token", secret: true }
    ]
  },
  {
    id: "tumblr",
    label: "Tumblr",
    method: "Tumblr API",
    fields: [
      { key: "account", label: "博客名", placeholder: "myblog" },
      { key: "secret", label: "OAuth token", secret: true }
    ]
  },
  {
    id: "youtube",
    label: "YouTube",
    method: "Data API 上传视频与社区帖",
    fields: [
      { key: "account", label: "频道名（可空）" },
      { key: "secret", label: "OAuth access token", secret: true }
    ]
  },
  {
    id: "pinterest",
    label: "Pinterest",
    method: "API v5 创建 Pin",
    fields: [
      { key: "secret", label: "Access token", secret: true },
      { key: "extra", label: "Board ID（可空）" }
    ]
  },
  {
    id: "telegram",
    label: "Telegram",
    method: "Bot API 向频道发图文",
    fields: [
      { key: "secret", label: "Bot token", secret: true, placeholder: "123456:ABC…" },
      { key: "account", label: "频道", placeholder: "@channel 或 chat id" }
    ]
  },
  {
    id: "discord",
    label: "Discord",
    method: "Webhook 发频道",
    fields: [
      { key: "account", label: "频道名（可空）" },
      { key: "secret", label: "Webhook URL", secret: true, placeholder: "https://discord.com/api/webhooks/…" }
    ]
  },
  {
    id: "slack",
    label: "Slack",
    method: "Webhook 发频道",
    fields: [
      { key: "account", label: "频道名（可空）" },
      { key: "secret", label: "Webhook URL", secret: true, placeholder: "https://hooks.slack.com/…" }
    ]
  },
  {
    id: "google_business",
    label: "Google Business",
    method: "API 发本地 Posts",
    fields: [
      { key: "account", label: "Location ID" },
      { key: "secret", label: "OAuth access token", secret: true }
    ]
  },
  {
    id: "threads",
    label: "Threads",
    method: "Meta Threads API，OAuth 2.0",
    fields: [
      { key: "account", label: "用户名（可空）" },
      { key: "secret", label: "Access token", secret: true }
    ]
  },
  {
    id: "ghost",
    label: "Ghost",
    method: "Admin API（API key）",
    fields: [
      { key: "account", label: "站点地址", placeholder: "https://example.com" },
      { key: "secret", label: "Admin API Key", secret: true, placeholder: "id:secret" }
    ]
  },
  {
    id: "wordpress",
    label: "WordPress",
    method: "如果开通，仍需成立平台网站，每月最低 4 美金。",
    fields: [
      { key: "account", label: "站点地址", placeholder: "https://example.com" },
      { key: "extra", label: "用户名" },
      { key: "secret", label: "Application Password", secret: true }
    ]
  }
];

function slackWebhookUrl(raw: string): string {
  const found = raw.match(/https:\/\/hooks\.slack\.com\/\S+/i);
  if (!found) return raw.trim();
  return found[0].replace(/['")\],.;]+$/g, "");
}

export function ChannelMark({ id, className }: { id: string; className?: string }) {
  const common = className ?? "h-10 w-10 shrink-0";
  if (id === "nostr") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#8b5cf6" />
        <path d="M12 26c4-8 12-8 16 0" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="20" cy="15" r="3.2" fill="#fff" />
      </svg>
    );
  }
  if (id === "lens") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#00501e" />
        <circle cx="20" cy="20" r="8" fill="none" stroke="#abfe2c" strokeWidth="2.4" />
        <circle cx="20" cy="20" r="3" fill="#abfe2c" />
      </svg>
    );
  }
  if (id === "wordpress") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <circle cx="20" cy="20" r="16" fill="#21759b" />
        <path d="M8 20c2 6 6 9 12 9 3 0 5-1 7-3L15 12c-3 2-6 5-7 8z" fill="#fff" />
      </svg>
    );
  }
  if (id === "ghost") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#15171a" />
        <path d="M12 28V16c0-4 3.5-7 8-7s8 3 8 7v12l-3-2-3 2-2-2-3 2-3-2-2 2z" fill="#fff" />
      </svg>
    );
  }
  if (id === "blogger") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#f57c00" />
        <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">B</text>
      </svg>
    );
  }
  if (id === "tumblr") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#001935" />
        <text x="20" y="27" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">t</text>
      </svg>
    );
  }
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#ff0033" />
        <path d="M17 14l10 6-10 6z" fill="#fff" />
      </svg>
    );
  }
  if (id === "pinterest") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <circle cx="20" cy="20" r="16" fill="#e60023" />
        <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">P</text>
      </svg>
    );
  }
  if (id === "telegram") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <circle cx="20" cy="20" r="16" fill="#2aa0d8" />
        <path d="M11 20l16-7-5 16-4-5-4 3 1-5z" fill="#fff" />
      </svg>
    );
  }
  if (id === "discord") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#5865F2" />
        <svg x="8" y="8" width="24" height="24" viewBox="0 0 24 24">
          <path
            fill="#fff"
            d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
          />
        </svg>
      </svg>
    );
  }
  if (id === "slack") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#fff" stroke="#e2e8f0" />
        <g transform="translate(7 7) scale(0.212)">
          <path fill="#36C5F0" d="M45.2 25.8A14.6 14.6 0 1 1 59.8 11.2 14.6 14.6 0 0 1 45.2 25.8m0 7.3a14.6 14.6 0 0 1 0 29.2H8.7a14.6 14.6 0 0 1 0-29.2z" />
          <path fill="#2EB67D" d="M97 45.2a14.6 14.6 0 1 1 14.6 14.6A14.6 14.6 0 0 1 97 45.2m-7.3 0a14.6 14.6 0 0 1-29.2 0V8.7a14.6 14.6 0 1 1 29.2 0z" />
          <path fill="#E01E5A" d="M25.8 77.6A14.6 14.6 0 1 1 11.2 63 14.6 14.6 0 0 1 25.8 77.6m7.3 0a14.6 14.6 0 0 1 29.2 0v36.5a14.6 14.6 0 1 1-29.2 0z" />
          <path fill="#ECB22E" d="M77.6 97a14.6 14.6 0 1 1-14.6 14.6A14.6 14.6 0 0 1 77.6 97m0-7.3a14.6 14.6 0 0 1 0-29.2h36.5a14.6 14.6 0 0 1 0 29.2z" />
        </g>
      </svg>
    );
  }
  if (id === "google_business") {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden>
        <rect width="40" height="40" rx="10" fill="#1a73e8" />
        <path d="M20 10c4 0 7 3 7 7 0 5-7 13-7 13s-7-8-7-13c0-4 3-7 7-7zm0 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className={common} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#111" />
      <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">@</text>
    </svg>
  );
}

export function ChannelConnectBoard({
  t,
  only,
  skip,
  onChange
}: {
  t: (zh: string, en: string) => string;
  only?: string[];
  skip?: string[];
  onChange?: (rows: ChannelAccount[]) => void;
}) {
  const [rows, setRows] = useState<ChannelAccount[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<FieldKey, string>>({ account: "", secret: "", extra: "" });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadChannelAccounts()
      .then((res) => setRows(res.channels))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (rows.length) onChange?.(rows);
  }, [rows, onChange]);

  async function syncSubscribers() {
    setSyncing(true);
    try {
      const res = await loadChannelAccounts();
      setRows(res.channels);
    } catch {
      /* 保持当前人数 */
    } finally {
      setSyncing(false);
    }
  }

  const form = CHANNEL_FORMS.find((item) => item.id === openId) ?? null;
  const statusOf = (id: string) => rows.find((row) => row.id === id);

  function open(id: string) {
    const known = statusOf(id);
    setDraft({ account: known?.account ?? "", secret: "", extra: known?.extra ?? "" });
    setError("");
    setOpenId(id);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const secret = form.id === "slack" ? slackWebhookUrl(draft.secret) : draft.secret;
      const res = await saveChannelAccount({
        id: form.id,
        account: draft.account,
        secret,
        extra: draft.extra
      });
      setRows((prev) => {
        const next = prev.filter((row) => row.id !== res.channel.id);
        next.push(res.channel);
        return next;
      });
      setOpenId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  const forms = CHANNEL_FORMS.filter((item) => {
    if (only && !only.includes(item.id)) return false;
    if (skip?.includes(item.id)) return false;
    return true;
  });
  const cards = forms.map((item) => {
    const on = Boolean(statusOf(item.id)?.configured);
    const name = statusOf(item.id)?.displayName || statusOf(item.id)?.account || "";
    return (
      <div
        key={item.id}
        className={`flex gap-2 rounded-lg border p-2.5 ${
          on ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <ChannelMark id={item.id} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
          <p className={`truncate text-xs ${on ? "text-emerald-800" : "text-slate-500"}`}>
            {on ? t("已接通", "Ready") : t("未授权", "Not connected")}
            {on && name ? ` · ${name}` : ""}
          </p>
          {item.method ? <p className="text-[11px] leading-snug text-slate-500">{item.method}</p> : null}
          {item.id === "nostr" && on ? (
            <p className="mt-0.5 text-xs text-emerald-800">
              {typeof statusOf(item.id)?.notes === "number" && typeof statusOf(item.id)?.followers === "number"
                ? t(
                    `帖子 ${statusOf(item.id)?.notes} · 关注 ${statusOf(item.id)?.followers} 人`,
                    `${statusOf(item.id)?.notes} notes · ${statusOf(item.id)?.followers} followers`
                  )
                : t("帖子数暂未同步", "Note count not synced yet")}
            </p>
          ) : null}
          {item.id === "telegram" && on ? (
            <p className="mt-0.5 text-xs text-emerald-800">
              {typeof statusOf(item.id)?.subscribers === "number"
                ? t(`订阅 ${statusOf(item.id)?.subscribers} 人`, `${statusOf(item.id)?.subscribers} subscribers`)
                : t("订阅人数暂未同步", "Subscriber count not synced yet")}
            </p>
          ) : null}
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => open(item.id)}
              className={
                on
                  ? "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                  : "inline-flex h-7 items-center rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
              }
            >
              {on ? t("重新授权", "Re-authorize") : t("接入授权", "Connect")}
            </button>
            {(item.id === "telegram" || item.id === "nostr") && on ? (
              <button
                type="button"
                disabled={syncing}
                onClick={() => void syncSubscribers()}
                className="inline-flex h-7 items-center rounded-md border border-emerald-300 bg-white px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              >
                {syncing ? t("同步中", "Syncing") : t("同步", "Sync")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  });
  const modal = form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <ChannelMark id={form.id} />
              <div>
                <p className="text-sm font-semibold text-slate-900">{form.label}</p>
                {form.method ? <p className="text-xs text-slate-500">{form.method}</p> : null}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {form.fields.map((field) => (
                <label key={field.key} className="block text-sm text-slate-700">
                  {field.label}
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    type={field.secret ? "password" : "text"}
                    placeholder={
                      field.secret && statusOf(form.id)?.configured
                        ? t("已保存，留空则不修改", "Saved. Leave blank to keep it")
                        : field.placeholder
                    }
                    value={draft[field.key]}
                    autoComplete="off"
                    onChange={(ev) => setDraft((prev) => ({ ...prev, [field.key]: ev.target.value }))}
                  />
                </label>
              ))}
            </div>
            {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                onClick={() => setOpenId(null)}
              >
                {t("取消", "Cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => void save()}
              >
                {busy ? t("保存中", "Saving") : t("保存授权", "Save")}
              </button>
            </div>
          </div>
        </div>
      ) : null;
  if (only) return <>{cards}{modal}</>;
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
      {modal}
    </>
  );
}
