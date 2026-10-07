import type { Pool } from "mysql2/promise";
import WebSocket from "ws";
import { finalizeEvent } from "nostr-tools/pure";
import { decode, noteEncode } from "nostr-tools/nip19";
import { env } from "../env.js";
import { getSocialLibraryAssetsByIds } from "./standaloneSocialLibrary.js";
import { loadChannelFields } from "./standaloneChannelAccounts.js";

const NOTE_LIMIT = 4000;
const RELAY_TIMEOUT_MS = 12_000;

function parseRelays(raw: string): string[] {
  const parts = raw.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
  const urls = parts.filter((item) => /^wss?:\/\//i.test(item)).map((item) => item.replace(/\/+$/, ""));
  return [...new Set(urls)].slice(0, 8);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function absoluteUrl(maybeUrl: string): string {
  const raw = String(maybeUrl ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function publishToRelay(url: string, event: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`${hostOf(url)} 超时`));
    }, RELAY_TIMEOUT_MS);
    const finish = (err?: Error) => {
      clearTimeout(timer);
      ws.close();
      if (err) reject(err);
      else resolve();
    };
    ws.on("open", () => {
      ws.send(JSON.stringify(["EVENT", event]));
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as unknown[];
        if (msg[0] !== "OK" || msg[1] !== event.id) return;
        if (msg[2] === true) finish();
        else finish(new Error(`${hostOf(url)} 拒绝：${String(msg[3] || "").slice(0, 180)}`));
      } catch {
        /* 忽略非 JSON */
      }
    });
    ws.on("error", (err) => {
      finish(new Error(`${hostOf(url)} ${err.message}`));
    });
  });
}

export async function publishNostrChannel(
  db: Pool,
  input: { title: string; body: string; assetIds: number[] }
): Promise<{ platform: "nostr"; ok: true; message: string; url: string }> {
  const fields = await loadChannelFields(db, "nostr");
  const nsec = fields.secret.trim();
  if (!nsec.startsWith("nsec1")) throw new Error("Nostr 还没保存私钥。");
  const relays = parseRelays(fields.extra);
  if (!relays.length) throw new Error("Nostr 还没保存 Relays。");

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("Nostr 私钥格式不对。");

  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const assets = await getSocialLibraryAssetsByIds(db, input.assetIds || []);
  const images = assets.filter((asset) => asset.kind === "image").map((asset) => absoluteUrl(asset.url)).filter(Boolean);
  const videoCount = assets.filter((asset) => asset.kind === "video").length;
  const content = truncate([title, body, ...images].filter(Boolean).join("\n\n"), NOTE_LIMIT);
  if (!content) throw new Error("请先填写文案。");

  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content
    },
    decoded.data
  );

  const settled = await Promise.allSettled(relays.map((url) => publishToRelay(url, event)));
  const okHosts = settled.flatMap((item, index) => (item.status === "fulfilled" ? [hostOf(relays[index]!)] : []));
  const failed = settled.flatMap((item, index) =>
    item.status === "rejected" ? [`${hostOf(relays[index]!)}：${String(item.reason?.message || item.reason).slice(0, 120)}`] : []
  );
  if (!okHosts.length) {
    throw new Error(`Nostr 没有发出去。${failed.join("；")}`.slice(0, 800));
  }
  const note = noteEncode(event.id);
  const videoNote = videoCount ? "视频文件没有发出去。" : "";
  const failNote = failed.length ? `有 ${failed.length} 个 relay 没收下。` : "";
  return {
    platform: "nostr",
    ok: true,
    message: `已发到 ${okHosts.join("、")}。${videoNote}${failNote}`.trim(),
    url: `https://njump.me/${note}`
  };
}
