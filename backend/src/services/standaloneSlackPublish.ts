import type { Pool } from "mysql2/promise";
import { env } from "../env.js";
import { loadChannelFields, slackWebhookUrl } from "./standaloneChannelAccounts.js";
import { getSocialLibraryAssetsByIds, type SocialLibraryAsset } from "./standaloneSocialLibrary.js";

const TEXT_LIMIT = 3500;

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

function hideWebhook(message: string, webhook: string): string {
  return message
    .split(webhook)
    .join("")
    .replace(/https:\/\/hooks\.slack\.com\/\S+/gi, "")
    .trim()
    .slice(0, 240);
}

function assetLinks(assets: SocialLibraryAsset[], kind: "image" | "video"): string[] {
  return assets
    .filter((asset) => asset.kind === kind)
    .map((asset) => absoluteUrl(asset.url))
    .filter((url) => /^https?:\/\//i.test(url));
}

export async function publishSlackChannel(
  db: Pool,
  input: { title: string; body: string; assetIds: number[] }
): Promise<{ platform: "slack"; ok: true; message: string; url?: string }> {
  const fields = await loadChannelFields(db, "slack");
  const webhook = slackWebhookUrl(fields.secret);
  if (!/^https:\/\/hooks\.slack\.com\//i.test(webhook)) throw new Error("Slack 还没保存 Webhook URL。");
  const assets = await getSocialLibraryAssetsByIds(db, input.assetIds || []);
  const images = assetLinks(assets, "image");
  const videos = assetLinks(assets, "video");
  const text = truncate(
    [String(input.title ?? "").trim(), String(input.body ?? "").trim(), ...images, ...videos].filter(Boolean).join("\n\n"),
    TEXT_LIMIT
  );
  if (!text) throw new Error("请先填写文案。");
  let raw = "";
  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000)
    });
    raw = await resp.text();
    if (!resp.ok || raw.trim().toLowerCase() !== "ok") {
      const detail = hideWebhook(raw || `HTTP ${resp.status}`, webhook);
      throw new Error(detail ? `Slack 没有发出去：${detail}` : "Slack 没有发出去。");
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("Slack ")) throw e instanceof Error ? e : new Error(message);
    throw new Error(hideWebhook(message, webhook) || "Slack 没有发出去。");
  }
  const extra = images.length || videos.length ? "图片和视频以链接写进正文。" : "";
  return { platform: "slack", ok: true, message: `已发到 Slack 频道。${extra}`.trim() };
}
