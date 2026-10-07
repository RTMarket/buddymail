import fs from "node:fs";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import { env } from "../env.js";
import {
  getAgentBrainCredentials,
  type AgentBrainCredentials
} from "./aiChat.js";
import { runAgentBrainChat } from "./aiChat.js";
import {
  insertSocialLibraryAsset,
  socialLibraryPublicUrl,
  socialLibraryUploadDir,
  type SocialLibraryAsset
} from "./standaloneSocialLibrary.js";
import {
  pickStudioImageModel,
  type StudioImageChoice,
  type StudioImagePick
} from "./standaloneStudioImagePick.js";

const STUDIO_SYSTEM = [
  "你是独立站「创作区」助手，名字叫 Ali。用中文自然回复，可自称 Ali。",
  "用户可能发图：结合识图内容回答，不要假装没看见。",
  "判断这一轮要不要立刻执行：出图、出视频、写文案、导出文档，或只聊天。",
  "只返回 JSON，不要 markdown 围栏。",
  '格式：{"reply":"给用户看的话","action":"chat|image|video|copy|docs","prompt":"用于生成的描述","count":1,"durationSec":15,"formats":["docx"],"title":"","body":"","table":[]}',
  "action=image：用户要图。count 为张数 1～5。reply 简短确认，如「好的，我这就出图」。不要假装图已经生成完。",
  "action=video：用户要视频。count 1～5，durationSec 按用户说的秒数（默认 15）。reply 简短确认。",
  "action=copy：用户要文案。reply 必须是完整文案（可分段）。title/body 同步填，table 有表格才填。",
  "action=docs：用户要把已有文案做成 Word/Excel/PDF。formats 从 docx,xlsx,pdf 里选。reply 说明正在出文件。",
  "action=chat：只聊天、改需求、提问，不生成。",
  "会收到最近最多 40 轮对话：结合上文理解「再来一张」「改成蓝色」等指代，不要假装没有历史。",
  "不要编造未提供的品牌细节。"
].join("\n");

const STUDIO_COPY_SYSTEM = [
  "你根据用户要求写中文文案。只返回 JSON，不要 markdown 围栏。",
  '格式：{"title":"标题","body":"分段正文，用换行分隔","table":[["列1","列2"],["值1","值2"]]}',
  "table 给 Excel 用：有表格/报价/清单就填，否则 table 为 []。body 不要太短。"
].join("\n");

export type StudioVideoProvider = "autodl-art" | "minimax" | "gpu" | "none";

export type StudioStatus = {
  chatReady: boolean;
  chatSource: "agent-brain" | "deepseek-env" | "none";
  imageReady: boolean;
  imageMessage: string;
  videoReady: boolean;
  videoProvider: StudioVideoProvider;
  videoMessage: string;
  gpuReady: boolean;
  gpuMessage: string;
};

export function gpuWorkerUrl(): string {
  return (env.BSS_GPU_WORKER_URL ?? "").replace(/\/$/, "");
}

export function studioGpuConfigured(): boolean {
  return Boolean(gpuWorkerUrl());
}

export function siliconflowConfigured(): boolean {
  return Boolean(env.SILICONFLOW_API_KEY?.trim());
}

export function minimaxConfigured(): boolean {
  return Boolean(env.MINIMAX_API_KEY?.trim());
}

export function autodlArtConfigured(): boolean {
  return Boolean(env.AUTODL_ART_API_KEY?.trim());
}

export function resolveVideoProvider(): StudioVideoProvider {
  if (autodlArtConfigured()) return "autodl-art";
  if (minimaxConfigured()) return "minimax";
  if (studioGpuConfigured()) return "gpu";
  return "none";
}

function envDeepseekCreds(): AgentBrainCredentials | null {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
    model: env.DEEPSEEK_MODEL || "deepseek-chat",
    providerLabel: "DeepSeek (.env)"
  };
}

export async function resolveStudioChatCreds(
  db: Pool,
  tenantId: number
): Promise<AgentBrainCredentials | null> {
  const brain = await getAgentBrainCredentials(db, tenantId);
  if (brain) return brain;
  return envDeepseekCreds();
}

export type GpuFetch = {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  text: string;
  buf?: Buffer;
};

export async function fetchGpu(
  pathname: string,
  init: RequestInit,
  timeoutMs: number
): Promise<GpuFetch> {
  const base = gpuWorkerUrl();
  if (!base) throw new Error("未配置 BSS_GPU_WORKER_URL");
  const headers = new Headers(init.headers);
  const token = env.BSS_GPU_WORKER_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${base}${pathname}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const ctype = resp.headers.get("content-type") || "";
  if (ctype.includes("video/") || ctype.includes("octet-stream")) {
    const buf = Buffer.from(await resp.arrayBuffer());
    return { ok: resp.ok, status: resp.status, json: null, text: "", buf };
  }
  const text = await resp.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { ok: resp.ok, status: resp.status, json, text };
}

export async function getStudioStatus(db: Pool, tenantId: number): Promise<StudioStatus> {
  const brain = await getAgentBrainCredentials(db, tenantId);
  const envCred = envDeepseekCreds();
  const chatReady = Boolean(brain || envCred);
  const chatSource: StudioStatus["chatSource"] = brain
    ? "agent-brain"
    : envCred
      ? "deepseek-env"
      : "none";

  const imageReady = siliconflowConfigured();
  const imageMessage = imageReady
    ? "硅基流动已接通：Kolors 免费 / Turbo 约¥0.10 / Qwen 约¥0.30；可丢参考图识风格再出图。"
    : "未配置硅基流动。在独立站 .env 写入 SILICONFLOW_API_KEY 后重启 backend。";

  const videoProvider = resolveVideoProvider();
  let gpuReady = false;
  let gpuMessage = studioGpuConfigured()
    ? "已配置 4090 地址，正在探测…"
    : "未配置 4090 工作机（视频备选）。需要时写入 BSS_GPU_WORKER_URL。";

  if (studioGpuConfigured()) {
    try {
      const probe = await fetchGpu("/health", { method: "GET" }, 8000);
      gpuReady = probe.ok && (probe.json?.ok === true || probe.status === 200);
      gpuMessage = gpuReady
        ? String(probe.json?.device || probe.json?.message || "4090 工作机在线")
        : `工作机无响应（HTTP ${probe.status}）：${String(probe.json?.message || probe.text).slice(0, 180)}`;
    } catch (e: unknown) {
      gpuReady = false;
      gpuMessage = `连不上 4090 工作机：${String((e as Error)?.message ?? e).slice(0, 180)}`;
    }
  }

  let videoReady = false;
  let videoMessage = "未配置视频通道。填写 AUTODL_ART_API_KEY 或 MINIMAX_API_KEY，或接通 4090。";
  if (videoProvider === "autodl-art") {
    videoReady = true;
    videoMessage =
      "视频走 AutoDL.art ComfyUI · MiniMax H3（文生视频 / 加图参考）。单段 1～10 秒，更长会拼接。单价以 AutoDL.art 为准。";
  } else if (videoProvider === "minimax") {
    videoReady = true;
    videoMessage = `视频走 MiniMax-H3（${env.MINIMAX_VIDEO_RESOLUTION || "768P"}，单段 4～15 秒）。官方刊例约 ¥0.50/秒（768P），以账单为准。`;
  } else if (videoProvider === "gpu") {
    videoReady = gpuReady;
    videoMessage = gpuReady
      ? "视频走 RTX 4090 备选（单段约 5 秒，更长会拼接）。"
      : gpuMessage;
  }

  return {
    chatReady,
    chatSource,
    imageReady,
    imageMessage,
    videoReady,
    videoProvider,
    videoMessage,
    gpuReady,
    gpuMessage
  };
}

export type StudioChatAction = "chat" | "image" | "video" | "copy" | "docs";

export type StudioChatTurn = {
  reply: string;
  action: StudioChatAction;
  prompt: string;
  count: number;
  durationSec: number;
  formats: Array<"docx" | "xlsx" | "pdf">;
  copy: StudioCopyResult | null;
};

function clampCount(n: unknown): number {
  const v = Math.round(Number(n) || 1);
  return Math.max(1, Math.min(5, Number.isFinite(v) ? v : 1));
}

function guessStudioAction(text: string): StudioChatAction {
  const t = text.toLowerCase();
  if (/(word|excel|pdf|文档|xlsx|docx)/i.test(t) && !/(出图|视频|海报图)/.test(t)) return "docs";
  if (/(视频|短片|\bvideo\b|clip)/i.test(t)) return "video";
  if (/(出图|生图|一张图|几张图|海报|配图|\bimage\b|photo)/i.test(t)) return "image";
  if (/(文案|标题|口号|广告词|写一段|写一篇)/i.test(t)) return "copy";
  return "chat";
}

function guessCount(text: string): number {
  const map: Array<[RegExp, number]> = [
    [/(五张|5\s*张|五个视频)/, 5],
    [/(四张|4\s*张)/, 4],
    [/(三张|3\s*张|三个)/, 3],
    [/(两张|二张|2\s*张|两个)/, 2]
  ];
  for (const [re, n] of map) if (re.test(text)) return n;
  return 1;
}

function guessDurationSec(text: string): number {
  const m = text.match(/(\d+)\s*秒/);
  if (m) return Math.max(1, Math.min(300, Number(m[1])));
  if (/5\s*分钟|五分钟/.test(text)) return 300;
  if (/3\s*分钟|三分钟/.test(text)) return 180;
  if (/1\s*分钟|一分钟/.test(text)) return 60;
  return 15;
}

function parseStudioAliTurn(raw: string, userText: string): StudioChatTurn {
  const fallbackAction = guessStudioAction(userText);
  const fallback: StudioChatTurn = {
    reply: raw.trim() || "我在。",
    action: fallbackAction,
    prompt: userText,
    count: guessCount(userText),
    durationSec: guessDurationSec(userText),
    formats: ["docx", "xlsx", "pdf"],
    copy: fallbackAction === "copy" ? { title: "文案", body: raw.trim(), table: [] } : null
  };
  try {
    const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return fallback;
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const reply = String(json.reply || "").trim() || fallback.reply;
    let action = String(json.action || "chat") as StudioChatAction;
    if (!["chat", "image", "video", "copy", "docs"].includes(action)) action = "chat";
    if (action === "chat" && fallbackAction !== "chat") action = fallbackAction;
    const prompt = String(json.prompt || userText).trim() || userText;
    const count = clampCount(json.count ?? guessCount(userText));
    const durationSec = Math.max(1, Math.min(300, Math.round(Number(json.durationSec) || guessDurationSec(userText))));
    const formats = Array.isArray(json.formats)
      ? json.formats
          .map((x) => String(x))
          .filter((x): x is "docx" | "xlsx" | "pdf" => x === "docx" || x === "xlsx" || x === "pdf")
      : ["docx", "xlsx", "pdf"];
    const title = String(json.title || "").trim();
    const body = String(json.body || "").trim();
    const table = Array.isArray(json.table)
      ? json.table
          .filter((row) => Array.isArray(row))
          .map((row) => (row as unknown[]).map((cell) => String(cell ?? "").slice(0, 200)))
          .slice(0, 80)
      : [];
    const copy =
      action === "copy" || action === "docs"
        ? { title: title || "文案", body: body || reply, table }
        : null;
    return { reply, action, prompt, count, durationSec, formats: formats.length ? formats : ["docx"], copy };
  } catch {
    return fallback;
  }
}

export async function runStudioChat(opts: {
  db: Pool;
  tenantId: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  imageBase64?: string;
}): Promise<StudioChatTurn> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content || "";
  let messages = opts.messages;
  const imageUri = normalizeStyleDataUri(opts.imageBase64 || "");
  if (imageUri) {
    if (imageUri.length > 16_000_000) throw new Error("图片太大，请压缩到约 8MB 以内。");
    if (!siliconflowConfigured()) {
      throw new Error("对话识图需要硅基流动：在独立站 .env 写入 SILICONFLOW_API_KEY。");
    }
    const history = opts.messages
      .slice(0, -1)
      .slice(-6)
      .map((m) => `${m.role === "user" ? "用户" : "Ali"}：${m.content}`)
      .join("\n");
    const visual = await answerStudioChatImage(imageUri, userText, history);
    messages = opts.messages.map((m, i) =>
      i === opts.messages.length - 1 && m.role === "user"
        ? { ...m, content: `${m.content}\n\n[图片内容]\n${visual}` }
        : m
    );
  }
  const creds = await resolveStudioChatCreds(opts.db, opts.tenantId);
  if (!creds) {
    throw new Error(
      "请先在「自动化任务 → AI 大脑」保存 DeepSeek Key 并激活，或在独立站 .env 填写 DEEPSEEK_API_KEY。"
    );
  }
  const raw = await runAgentBrainChat({
    creds,
    messages,
    systemPrompt: STUDIO_SYSTEM,
    maxTokens: 1800
  });
  return parseStudioAliTurn(raw, userText);
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("png")) return ".png";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return ".docx";
  if (mime.includes("spreadsheetml") || mime.includes("excel")) return ".xlsx";
  if (mime.includes("pdf")) return ".pdf";
  return ".bin";
}

export type StudioCopyResult = {
  title: string;
  body: string;
  table: string[][];
};

function parseStudioCopyJson(raw: string): StudioCopyResult {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as Record<string, unknown>;
    const title = String(json.title || "文案").trim().slice(0, 200) || "文案";
    const body = String(json.body || "").trim();
    const table = Array.isArray(json.table)
      ? json.table
          .filter((row) => Array.isArray(row))
          .map((row) => (row as unknown[]).map((cell) => String(cell ?? "").slice(0, 200)))
          .slice(0, 80)
      : [];
    return { title, body: body || text.slice(0, 12000), table };
  } catch {
    return { title: "文案", body: text.slice(0, 12000), table: [] };
  }
}

export async function runStudioCopy(opts: {
  db: Pool;
  tenantId: number;
  prompt: string;
}): Promise<StudioCopyResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("请填写要写的文案需求。");
  const creds = await resolveStudioChatCreds(opts.db, opts.tenantId);
  if (!creds) {
    throw new Error("请先接通 DeepSeek：在「自动化任务 → AI 大脑」填 Key，或在 .env 写 DEEPSEEK_API_KEY。");
  }
  const reply = await runAgentBrainChat({
    creds,
    systemPrompt: STUDIO_COPY_SYSTEM,
    messages: [{ role: "user", content: prompt.slice(0, 4000) }],
    maxTokens: 2200
  });
  if (!reply.trim()) throw new Error("文案没有返回内容。");
  return parseStudioCopyJson(reply);
}

export async function saveStudioBytesToLibrary(opts: {
  db: Pool;
  buf: Buffer;
  mime: string;
  kind: "image" | "video" | "file";
  prefix: string;
}): Promise<SocialLibraryAsset> {
  if (opts.buf.length < 80) throw new Error("返回的文件过小，可能生成失败。");
  const ext = extFromMime(opts.mime);
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_studio${ext}`;
  const dest = path.join(socialLibraryUploadDir(), storedName);
  fs.writeFileSync(dest, opts.buf);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  return insertSocialLibraryAsset(opts.db, {
    kind: opts.kind,
    fileName: `${opts.prefix}-${stamp}${ext}`,
    storedName,
    mime: opts.mime,
    sizeBytes: opts.buf.length,
    url: socialLibraryPublicUrl(storedName)
  });
}

export async function saveStudioUploadToLibrary(opts: {
  db: Pool;
  buf: Buffer;
  mime: string;
  fileName: string;
}): Promise<SocialLibraryAsset> {
  const name = path.basename(opts.fileName || "studio-file").replace(/[^\w.\u4e00-\u9fff-]+/g, "_");
  const ext = path.extname(name).toLowerCase() || extFromMime(opts.mime);
  const kind: "image" | "video" | "file" = [".mp4", ".mov", ".webm", ".m4v"].includes(ext)
    ? "video"
    : [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
      ? "image"
      : "file";
  return saveStudioBytesToLibrary({
    db: opts.db,
    buf: opts.buf,
    mime: opts.mime || "application/octet-stream",
    kind,
    prefix: path.basename(name, ext) || "studio-file"
  });
}

async function fetchBinary(url: string, timeoutMs: number): Promise<{ buf: Buffer; mime: string }> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get("content-type") || "application/octet-stream";
  return { buf, mime };
}

async function siliconflowVisionChat(opts: {
  dataUri: string;
  text: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置硅基流动（SILICONFLOW_API_KEY）。");
  const base = (env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const model = env.SILICONFLOW_VISION_MODEL || "Qwen/Qwen3-VL-8B-Instruct";
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: opts.dataUri, detail: "high" } },
            { type: "text", text: opts.text }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(90000)
  });
  const text = await resp.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!resp.ok) {
    const msg = String(
      (json?.error as { message?: string } | undefined)?.message || (json?.message as string) || text
    ).slice(0, 280);
    throw new Error(`识图失败：${msg || `HTTP ${resp.status}`}`);
  }
  const choices = json?.choices as Array<{ message?: { content?: string } }> | undefined;
  const out = String(choices?.[0]?.message?.content || "").trim();
  if (!out) throw new Error("识图没有返回内容。");
  return out.slice(0, 4000);
}

async function describeStudioStyleImage(dataUri: string): Promise<string> {
  return siliconflowVisionChat({
    dataUri,
    maxTokens: 700,
    text: [
      "Describe this image as an English text-to-image prompt so another model can recreate the SAME visual style.",
      "Cover: medium (photo mockup / paper-cut / infographic), color palette, layout, typography (size/weight/placement), icons, textures, lighting.",
      "If there is a brand mark, describe its shape (e.g. thumbs-up in a speech bubble) without inventing extra slogans.",
      "Do not transcribe every tiny label; capture the design system. Output the prompt only."
    ].join(" ")
  });
}

async function answerStudioChatImage(dataUri: string, userText: string, history = ""): Promise<string> {
  return siliconflowVisionChat({
    dataUri,
    maxTokens: 1400,
    text: [
      "你是独立站「创作区」助手。请先看图，再用中文回答用户。",
      "说明：画面主体、场景、风格、构图、色彩；图上的文字尽量抄录（含中英文）。",
      "若用户要改文案、出图或做视频，给出可执行建议，并附一段英文提示词。",
      "不要编造图里没有的品牌细节。",
      history ? `对话上文：\n${history.slice(0, 3500)}` : "",
      userText.trim() ? `用户说：${userText.trim().slice(0, 4000)}` : "用户没有额外文字，请描述这张图。"
    ]
      .filter(Boolean)
      .join("\n")
  });
}

function normalizeStyleDataUri(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("data:image/")) return s;
  return `data:image/png;base64,${s.replace(/\s/g, "")}`;
}

export async function runStudioTxt2Img(opts: {
  db: Pool;
  tenantId: number;
  prompt: string;
  negative?: string;
  imageChoice?: StudioImageChoice;
  styleImageBase64?: string;
}): Promise<{ asset: SocialLibraryAsset; prompt: string; pick: StudioImagePick; styleBrief?: string }> {
  const userPrompt = opts.prompt.trim();
  const styleUri = normalizeStyleDataUri(opts.styleImageBase64 || "");
  if (!userPrompt && !styleUri) throw new Error("请填写画面描述，或上传一张风格参考图。");
  const apiKey = env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置硅基流动（SILICONFLOW_API_KEY）。");

  let styleBrief = "";
  if (styleUri) {
    if (styleUri.length > 16_000_000) throw new Error("参考图太大，请压缩到约 8MB 以内。");
    styleBrief = await describeStudioStyleImage(styleUri);
  }

  const prompt = [
    userPrompt || "Create an original marketing graphic in the same visual style.",
    styleBrief ? `Match this visual style from the reference:\n${styleBrief}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const creds = await resolveStudioChatCreds(opts.db, opts.tenantId);
  const pick = await pickStudioImageModel({
    prompt,
    choice: opts.imageChoice || "auto",
    creds,
    hasStyleRef: Boolean(styleUri)
  });

  const base = (env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const body: Record<string, unknown> = {
    model: pick.model,
    prompt,
    negative_prompt: (opts.negative ?? "").trim() || undefined,
    image_size: pick.imageSize,
    batch_size: 1,
    num_inference_steps: pick.steps
  };
  if (pick.guidance > 0) body.guidance_scale = pick.guidance;

  const resp = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000)
  });
  const text = await resp.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!resp.ok) {
    const msg = String(
      (json?.message as string) || (json?.error as { message?: string } | undefined)?.message || text
    ).slice(0, 280);
    throw new Error(`文生图失败（${pick.label}）：${msg || `HTTP ${resp.status}`}`);
  }

  const images = (json?.images as Array<{ url?: string; b64_json?: string; image?: string }> | undefined) ||
    (json?.data as Array<{ url?: string; b64_json?: string }> | undefined) ||
    [];
  const first = images[0] || {};
  let buf: Buffer | null = null;
  let mime = "image/png";
  const b64 = String(first.b64_json || first.image || json?.image_base64 || "").replace(/\s/g, "");
  if (b64) {
    buf = Buffer.from(b64, "base64");
  } else if (first.url) {
    const got = await fetchBinary(String(first.url), 60000);
    buf = got.buf;
    mime = got.mime.includes("image/") ? got.mime.split(";")[0] : "image/jpeg";
  }
  if (!buf) throw new Error("硅基流动没有返回图片。");

  const asset = await saveStudioBytesToLibrary({
    db: opts.db,
    buf,
    mime,
    kind: "image",
    prefix: "studio"
  });
  return { asset, prompt, pick, styleBrief: styleBrief || undefined };
}
