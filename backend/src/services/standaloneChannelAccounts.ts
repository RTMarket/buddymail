import type { Pool } from "mysql2/promise";
import WebSocket from "ws";
import { getPublicKey } from "nostr-tools/pure";
import { decode, npubEncode } from "nostr-tools/nip19";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { getDevtoSettings } from "./socialPublishingDevto.js";

export type ChannelFieldKey = "account" | "secret" | "extra";

export type ChannelAccountPublic = {
  id: string;
  label: string;
  method: string;
  configured: boolean;
  account: string;
  extra: string;
  hint: string;
  subscribers?: number | null;
  notes?: number | null;
  followers?: number | null;
  displayName?: string;
};

type ChannelSpec = {
  id: string;
  label: string;
  method: string;
  ready: (fields: Record<ChannelFieldKey, string>) => boolean;
};

const CHANNELS: ChannelSpec[] = [
  {
    id: "nostr",
    label: "Nostr（ Primal ）",
    method: "",
    ready: (f) => f.secret.startsWith("nsec1") && f.extra.includes("wss://")
  },
  {
    id: "lens",
    label: "Lens Protocol",
    method: "链上社交图谱 API",
    ready: (f) => f.account.length > 2 && f.secret.length > 8
  },
  {
    id: "blogger",
    label: "Blogger",
    method: "Google Blogger API",
    ready: (f) => f.account.length > 2 && f.secret.length > 8
  },
  {
    id: "tumblr",
    label: "Tumblr",
    method: "Tumblr API",
    ready: (f) => f.account.length > 1 && f.secret.length > 8
  },
  {
    id: "youtube",
    label: "YouTube",
    method: "Data API 上传视频与社区帖",
    ready: (f) => f.secret.length > 8
  },
  {
    id: "pinterest",
    label: "Pinterest",
    method: "API v5 创建 Pin",
    ready: (f) => f.secret.length > 8
  },
  {
    id: "telegram",
    label: "Telegram",
    method: "Bot API 向频道发图文",
    ready: (f) => /^\d+:[A-Za-z0-9_-]{20,}$/.test(f.secret) && f.account.length > 1
  },
  {
    id: "discord",
    label: "Discord",
    method: "Webhook / Bot 发频道",
    ready: (f) => /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(f.secret)
  },
  {
    id: "slack",
    label: "Slack",
    method: "Webhook / Bot 发频道",
    ready: (f) => /^https:\/\/hooks\.slack\.com\//i.test(slackWebhookUrl(f.secret))
  },
  {
    id: "google_business",
    label: "Google Business",
    method: "API 发本地 Posts",
    ready: (f) => f.account.length > 2 && f.secret.length > 8
  },
  {
    id: "threads",
    label: "Threads",
    method: "Meta Threads API，OAuth 2.0",
    ready: (f) => f.secret.length > 8
  },
  {
    id: "ghost",
    label: "Ghost",
    method: "Admin API（API key）",
    ready: (f) => /^https?:\/\//i.test(f.account) && f.secret.includes(":")
  },
  {
    id: "wordpress",
    label: "WordPress",
    method: "如果开通，仍需成立平台网站，每月最低 4 美金。",
    ready: (f) => /^https?:\/\//i.test(f.account) && f.secret.length >= 8 && f.extra.length >= 2
  }
];

async function telegramPublic(db: Pool): Promise<{ subscribers: number | null; displayName: string }> {
  const fields = await readStored(db, "telegram");
  const token = fields.secret.trim();
  const chatId = fields.account.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) || chatId.length < 2) {
    return { subscribers: null, displayName: "" };
  }
  const call = (method: string) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
      signal: AbortSignal.timeout(8000)
    }).then((resp) => resp.json() as Promise<{ ok?: boolean; result?: unknown }>);
  try {
    const [countJson, chatJson] = await Promise.all([call("getChatMemberCount"), call("getChat")]);
    const subscribers = countJson.ok && typeof countJson.result === "number" ? countJson.result : null;
    const chat =
      chatJson.ok && chatJson.result && typeof chatJson.result === "object"
        ? (chatJson.result as { title?: unknown; username?: unknown })
        : {};
    const title = String(chat.title ?? "").trim();
    const username = String(chat.username ?? "").trim().replace(/^@/, "");
    const displayName = [title, username ? `@${username}` : ""].filter(Boolean).join(" · ");
    return { subscribers, displayName };
  } catch {
    return { subscribers: null, displayName: "" };
  }
}

function queryNostrProfile(url: string, pubkey: string): Promise<{ name: string; at: number } | null> {
  return new Promise((resolve) => {
    let best: { name: string; at: number } | null = null;
    let settled = false;
    const ws = new WebSocket(url);
    const finish = (value: { name: string; at: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(best), 4000);
    ws.on("open", () => {
      ws.send(JSON.stringify(["REQ", "meta", { kinds: [0], authors: [pubkey], limit: 1 }]));
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as unknown[];
        if (msg[0] === "EVENT" && msg[1] === "meta") {
          const event = msg[2] as { content?: string; created_at?: number };
          const content = JSON.parse(String(event?.content || "{}")) as { name?: string; display_name?: string };
          const name = String(content.display_name || content.name || "").trim();
          const at = Number(event?.created_at || 0);
          if (name && (!best || at >= best.at)) best = { name, at };
        }
        if (msg[0] === "EOSE") finish(best);
      } catch {
        /* 忽略非 JSON */
      }
    });
    ws.on("error", () => finish(best));
  });
}

async function nostrAccountLabel(db: Pool): Promise<string> {
  const fields = await readStored(db, "nostr");
  const secret = fields.secret.trim();
  if (!secret.startsWith("nsec1")) return "";
  let pubkey = "";
  try {
    const decoded = decode(secret);
    if (decoded.type !== "nsec") return "";
    pubkey = getPublicKey(decoded.data);
  } catch {
    return "";
  }
  const npub = npubEncode(pubkey);
  const relays = nostrRelays(fields.extra);
  if (!relays.length) return npub;
  const found = await Promise.all(relays.map((url) => queryNostrProfile(url, pubkey)));
  const best = found.filter((item): item is { name: string; at: number } => Boolean(item)).sort((a, b) => b.at - a.at)[0];
  return best?.name || npub;
}

function nostrRelays(raw: string): string[] {
  const parts = raw.split(/[\s,，;；]+/).map((item) => item.trim()).filter((item) => /^wss?:\/\//i.test(item));
  return [...new Set(parts)].slice(0, 8);
}

function queryNostrRelay(
  url: string,
  pubkey: string
): Promise<{ notes: Set<string>; followers: Set<string> } | null> {
  return new Promise((resolve) => {
    const notes = new Set<string>();
    const followers = new Set<string>();
    const done = new Set<string>();
    let settled = false;
    const ws = new WebSocket(url);
    const finish = (value: { notes: Set<string>; followers: Set<string> } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(done.size ? { notes, followers } : null), 6000);
    ws.on("open", () => {
      ws.send(JSON.stringify(["REQ", "notes", { kinds: [1], authors: [pubkey], limit: 100 }]));
      ws.send(JSON.stringify(["REQ", "follows", { kinds: [3], "#p": [pubkey], limit: 200 }]));
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as unknown[];
        const event = msg[2] as { id?: string; pubkey?: string } | undefined;
        if (msg[0] === "EVENT" && msg[1] === "notes" && event?.id) notes.add(event.id);
        if (msg[0] === "EVENT" && msg[1] === "follows" && event?.pubkey && event.pubkey !== pubkey) {
          followers.add(event.pubkey);
        }
        if (msg[0] === "EOSE") {
          done.add(String(msg[1]));
          if (done.has("notes") && done.has("follows")) finish({ notes, followers });
        }
      } catch {
        /* 忽略非 JSON */
      }
    });
    ws.on("error", () => finish(done.size ? { notes, followers } : null));
  });
}

async function nostrChannelStats(db: Pool): Promise<{ notes: number; followers: number } | null> {
  const fields = await readStored(db, "nostr");
  const secret = fields.secret.trim();
  if (!secret.startsWith("nsec1")) return null;
  let pubkey = "";
  try {
    const decoded = decode(secret);
    if (decoded.type !== "nsec") return null;
    pubkey = getPublicKey(decoded.data);
  } catch {
    return null;
  }
  const relays = nostrRelays(fields.extra);
  if (!relays.length || !pubkey) return null;
  const settled = await Promise.all(relays.map((url) => queryNostrRelay(url, pubkey)));
  const notes = new Set<string>();
  const followers = new Set<string>();
  let ok = false;
  for (const item of settled) {
    if (!item) continue;
    ok = true;
    item.notes.forEach((id) => notes.add(id));
    item.followers.forEach((id) => followers.add(id));
  }
  return ok ? { notes: notes.size, followers: followers.size } : null;
}

export function slackWebhookUrl(raw: string): string {
  const found = raw.match(/https:\/\/hooks\.slack\.com\/\S+/i);
  if (!found) return raw.trim();
  return found[0].replace(/['")\],.;]+$/g, "");
}

function specOf(id: string): ChannelSpec | undefined {
  return CHANNELS.find((item) => item.id === id);
}

function blankFields(): Record<ChannelFieldKey, string> {
  return { account: "", secret: "", extra: "" };
}

function readFields(raw: string): Record<ChannelFieldKey, string> {
  const out = blankFields();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ChannelFieldKey, string>>;
    out.account = String(parsed.account ?? "").trim().slice(0, 300);
    out.secret = String(parsed.secret ?? "").trim().slice(0, 4000);
    out.extra = String(parsed.extra ?? "").trim().slice(0, 1000);
  } catch {
    /* empty */
  }
  return out;
}

export async function loadChannelFields(db: Pool, id: string): Promise<Record<ChannelFieldKey, string>> {
  return readStored(db, id);
}

async function readStored(db: Pool, id: string): Promise<Record<ChannelFieldKey, string>> {
  const [rows] = await db.query(
    `SELECT api_key_enc FROM social_platform_settings WHERE platform = ? LIMIT 1`,
    [id]
  );
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  if (!enc) return blankFields();
  try {
    return readFields(decryptSecret(enc));
  } catch {
    return blankFields();
  }
}

export async function listChannelAccounts(db: Pool): Promise<ChannelAccountPublic[]> {
  await getDevtoSettings(db).catch(() => null);
  const rows = await Promise.all(CHANNELS.map(async (spec) => {
    const fields = await readStored(db, spec.id);
    const configured = spec.ready(fields);
    return {
      id: spec.id,
      label: spec.label,
      method: spec.method,
      configured,
      account: fields.account,
      extra: fields.extra,
      hint: configured ? spec.method : ""
    };
  }));
  const telegram = rows.find((row) => row.id === "telegram" && row.configured);
  const nostr = rows.find((row) => row.id === "nostr" && row.configured);
  await Promise.all([
    telegram
      ? telegramPublic(db).then((info) => {
          telegram.subscribers = info.subscribers;
          if (info.displayName) telegram.displayName = info.displayName;
        })
      : Promise.resolve(),
    nostr
      ? Promise.all([nostrChannelStats(db), nostrAccountLabel(db)]).then(([stats, label]) => {
          nostr.notes = stats?.notes ?? null;
          nostr.followers = stats?.followers ?? null;
          if (label) nostr.displayName = label;
        })
      : Promise.resolve()
  ]);
  return rows;
}

export async function saveChannelAccount(
  db: Pool,
  id: string,
  input: Partial<Record<ChannelFieldKey, string>>
): Promise<ChannelAccountPublic> {
  const spec = specOf(id);
  if (!spec) throw new Error("没有这个平台");
  await getDevtoSettings(db).catch(() => null);
  const prev = await readStored(db, id);
  const next = blankFields();
  const accountIn = String(input.account ?? "").trim();
  const extraIn = String(input.extra ?? "").trim();
  const secretIn = String(input.secret ?? "").trim();
  next.account = (accountIn || prev.account).slice(0, 300);
  next.extra = (extraIn || prev.extra).slice(0, 1000);
  next.secret = (secretIn || prev.secret).slice(0, 4000);
  if (spec.id === "slack") next.secret = slackWebhookUrl(next.secret);
  if (!spec.ready(next)) throw new Error(`${spec.label} 还没填完整，授权没有保存`);
  const hint = next.account ? next.account.slice(0, 32) : spec.label.slice(0, 32);
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE api_key_enc = VALUES(api_key_enc), api_key_hint = VALUES(api_key_hint)`,
    [spec.id, encryptSecret(JSON.stringify(next)), hint]
  );
  const telegramInfo = spec.id === "telegram" ? await telegramPublic(db) : null;
  const nostrStats = spec.id === "nostr" ? await nostrChannelStats(db) : null;
  const nostrLabel = spec.id === "nostr" ? await nostrAccountLabel(db) : "";
  return {
    id: spec.id,
    label: spec.label,
    method: spec.method,
    configured: true,
    account: next.account,
    extra: next.extra,
    hint: spec.method,
    displayName: telegramInfo?.displayName || nostrLabel || undefined,
    subscribers: telegramInfo ? telegramInfo.subscribers : undefined,
    notes: spec.id === "nostr" ? nostrStats?.notes ?? null : undefined,
    followers: spec.id === "nostr" ? nostrStats?.followers ?? null : undefined
  };
}
