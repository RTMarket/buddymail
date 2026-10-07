import fs from "node:fs";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import { loadChannelFields } from "./standaloneChannelAccounts.js";
import {
  getSocialLibraryAssetsByIds,
  resolveSocialLibraryFilePath,
  type SocialLibraryAsset
} from "./standaloneSocialLibrary.js";

const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;
const FILE_LIMIT = 49 * 1024 * 1024;

type TgMessage = {
  message_id: number;
  chat?: { id?: number; username?: string };
};

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeChat(raw: string): string {
  const input = raw.trim();
  if (!input) throw new Error("请填写频道，例如 @频道名。");
  if (/\s/.test(input) && !/t\.me/i.test(input)) {
    throw new Error("频道请填公开用户名，例如 @bigsocialboss，不要填显示名称。");
  }
  const privateLink = input.match(/t\.me\/c\/(\d+)/i);
  if (privateLink) return `-100${privateLink[1]}`;
  const publicLink = input.match(/t\.me\/([A-Za-z][A-Za-z0-9_]{3,})/i);
  const name = (publicLink?.[1] || input).replace(/^@/, "");
  if (/^-?\d+$/.test(name)) return name;
  if (!/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(name)) {
    throw new Error("频道格式不对。公开频道填 @用户名，私密频道填 chat id。");
  }
  if (/bot$/i.test(name)) {
    throw new Error("频道填成了机器人自己。请新建一个频道，把 Bot 加为管理员，频道栏填这个频道的 @用户名。");
  }
  return `@${name}`;
}

function humanize(description: string, token: string): string {
  const clean = String(description || "")
    .split(token)
    .join("")
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "")
    .trim()
    .slice(0, 240);
  if (/unauthorized/i.test(clean)) return "Bot token 无效，请重新保存授权。";
  if (/can't send messages to the bot|chat not found/i.test(clean)) {
    return "频道填成了机器人自己，或找不到这个频道。请新建一个频道，把 Bot 加为管理员，频道栏填频道的 @用户名。";
  }
  if (/not enough rights|have no rights|need administrator|bot is not a member|CHAT_WRITE_FORBIDDEN/i.test(clean)) {
    return "Bot 还不能在这个频道发消息。请把它加为管理员，并允许发消息。";
  }
  if (/message is too long/i.test(clean)) return "文案太长，Telegram 最多 4096 字。";
  if (/file is too big|request entity too large/i.test(clean)) return "文件太大，Telegram 机器人最多约 50MB。";
  return clean ? `Telegram 没有发出去：${clean}` : "Telegram 没有发出去。";
}

async function callTelegram(token: string, method: string, body: BodyInit, headers?: Record<string, string>): Promise<TgMessage> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(90_000)
  });
  const json = (await resp.json().catch(() => null)) as { ok?: boolean; description?: string; result?: TgMessage | TgMessage[] } | null;
  if (!json?.ok) throw new Error(humanize(json?.description || `HTTP ${resp.status}`, token));
  const result = Array.isArray(json.result) ? json.result[0] : json.result;
  if (!result?.message_id) throw new Error("Telegram 没有返回消息。");
  return result;
}

function messageUrl(msg: TgMessage): string {
  const username = msg.chat?.username;
  if (username) return `https://t.me/${username}/${msg.message_id}`;
  const chatId = String(msg.chat?.id ?? "");
  const internal = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace(/^-/, "");
  if (!internal) return "";
  return `https://t.me/c/${internal}/${msg.message_id}`;
}

function readFile(asset: SocialLibraryAsset): { bytes: Buffer; name: string; mime: string } {
  const filePath = resolveSocialLibraryFilePath(asset);
  if (!fs.existsSync(filePath)) throw new Error(`素材文件不存在：${asset.fileName || "未命名"}`);
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > FILE_LIMIT) throw new Error(`「${asset.fileName || "文件"}」太大，Telegram 机器人最多约 50MB。`);
  return {
    bytes,
    name: path.basename(asset.fileName || filePath),
    mime: asset.mime || (asset.kind === "video" ? "video/mp4" : "image/jpeg")
  };
}

function appendFile(form: FormData, field: string, file: { bytes: Buffer; name: string; mime: string }) {
  form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name);
}

export async function publishTelegramChannel(
  db: Pool,
  input: { title: string; body: string; assetIds: number[] }
): Promise<{ platform: "telegram"; ok: true; message: string; url: string }> {
  const fields = await loadChannelFields(db, "telegram");
  const token = fields.secret.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Telegram 还没保存 Bot token。");
  const chatId = normalizeChat(fields.account);
  const text = truncate([String(input.title ?? "").trim(), String(input.body ?? "").trim()].filter(Boolean).join("\n\n"), TEXT_LIMIT);
  const assets = await getSocialLibraryAssetsByIds(db, input.assetIds || []);
  const media = assets.filter((asset) => asset.kind === "image" || asset.kind === "video").slice(0, 10);
  const skipped = assets.length - media.length;
  if (!text && !media.length) throw new Error("请先填写文案。");

  let sent: TgMessage;
  let extra = "";
  if (!media.length) {
    sent = await callTelegram(token, "sendMessage", JSON.stringify({ chat_id: chatId, text }), {
      "content-type": "application/json"
    });
  } else if (text.length > CAPTION_LIMIT) {
    sent = await callTelegram(token, "sendMessage", JSON.stringify({ chat_id: chatId, text }), {
      "content-type": "application/json"
    });
    await sendMedia(token, chatId, media, "");
    extra = "文案较长，图片和视频单独发出。";
  } else if (media.length === 1) {
    const asset = media[0]!;
    const file = readFile(asset);
    const form = new FormData();
    form.append("chat_id", chatId);
    if (text) form.append("caption", text);
    appendFile(form, asset.kind === "video" ? "video" : "photo", file);
    sent = await callTelegram(token, asset.kind === "video" ? "sendVideo" : "sendPhoto", form);
  } else {
    sent = await sendMedia(token, chatId, media, text);
  }

  if (assets.length > 10) extra = `${extra} 超过 10 个的素材没有发出去。`.trim();
  if (skipped > 0) extra = `${extra} 有 ${skipped} 个非图片视频文件没有发出去。`.trim();
  return {
    platform: "telegram",
    ok: true,
    message: `已发到频道。${extra}`.trim(),
    url: messageUrl(sent)
  };
}

async function sendMedia(token: string, chatId: string, assets: SocialLibraryAsset[], caption: string): Promise<TgMessage> {
  if (assets.length === 1) {
    const asset = assets[0]!;
    const file = readFile(asset);
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption);
    appendFile(form, asset.kind === "video" ? "video" : "photo", file);
    return callTelegram(token, asset.kind === "video" ? "sendVideo" : "sendPhoto", form);
  }
  const form = new FormData();
  form.append("chat_id", chatId);
  const spec = assets.map((asset, index) => {
    const file = readFile(asset);
    const field = `file${index}`;
    appendFile(form, field, file);
    const item: Record<string, string> = {
      type: asset.kind === "video" ? "video" : "photo",
      media: `attach://${field}`
    };
    if (index === 0 && caption) item.caption = caption;
    return item;
  });
  form.append("media", JSON.stringify(spec));
  return callTelegram(token, "sendMediaGroup", form);
}
