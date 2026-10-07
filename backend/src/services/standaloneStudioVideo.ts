import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { env } from "../env.js";
import {
  extractSocialLibraryVideoPoster,
  getSocialLibraryAssetsByIds,
  socialLibraryUploadDir,
  type SocialLibraryAsset
} from "./standaloneSocialLibrary.js";
import { runAgentBrainChat } from "./aiChat.js";
import {
  autodlArtConfigured,
  fetchGpu,
  minimaxConfigured,
  resolveStudioChatCreds,
  resolveVideoProvider,
  saveStudioBytesToLibrary,
  type StudioVideoProvider
} from "./standaloneStudio.js";

const execFileAsync = promisify(execFile);

export type StudioVideoJobStatus = "queued" | "running" | "succeeded" | "failed";

export type StudioVideoJob = {
  id: string;
  tenantId: number;
  status: StudioVideoJobStatus;
  message: string;
  provider: StudioVideoProvider;
  durationSec: number;
  prompt: string;
  asset?: SocialLibraryAsset;
  createdAt: number;
};

const jobs = new Map<string, StudioVideoJob>();
const MAX_JOBS = 40;

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 6 * 3600_000) jobs.delete(id);
  }
  if (jobs.size > MAX_JOBS) {
    const ordered = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const extra of ordered.slice(0, jobs.size - MAX_JOBS)) jobs.delete(extra.id);
  }
}

export function getStudioVideoJob(id: string, tenantId: number): StudioVideoJob | null {
  const job = jobs.get(id);
  if (!job || job.tenantId !== tenantId) return null;
  return job;
}

export function splitClipDurations(totalSec: number, maxClip = 15, minClip = 1): number[] {
  const total = Math.max(minClip, Math.min(300, Math.round(totalSec)));
  if (total <= maxClip) return [total];
  const n = Math.ceil(total / maxClip);
  const base = Math.floor(total / n);
  const rem = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.max(minClip, Math.min(maxClip, base + (i < rem ? 1 : 0))));
  }
  return out;
}

function toDataUri(buf: Buffer, mime: string): string {
  const kind = mime.includes("jpeg") ? "image/jpeg" : mime.includes("webp") ? "image/webp" : "image/png";
  return `data:${kind};base64,${buf.toString("base64")}`;
}

async function readAttachedImage(opts: {
  db: Pool;
  imageAssetId?: number;
  imageBase64?: string;
}): Promise<{ dataUri: string; buf: Buffer } | null> {
  const raw = (opts.imageBase64 || "").trim();
  if (raw) {
    const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const b64 = (m ? m[2] : raw).replace(/\s/g, "");
    const mime = m ? m[1] : "image/png";
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 400) throw new Error("参考图太小。");
    if (buf.length > 12 * 1024 * 1024) throw new Error("参考图请小于 12MB。");
    return { dataUri: toDataUri(buf, mime), buf };
  }
  const id = Number(opts.imageAssetId || 0);
  if (!id) return null;
  const [asset] = await getSocialLibraryAssetsByIds(opts.db, [id]);
  if (!asset || asset.kind !== "image") throw new Error("参考图不在文件库里。");
  const filePath = path.join(socialLibraryUploadDir(), path.basename(asset.storedName));
  if (!fs.existsSync(filePath)) throw new Error("参考图文件已丢失。");
  const buf = fs.readFileSync(filePath);
  return { dataUri: toDataUri(buf, asset.mime || "image/png"), buf };
}

async function splitShotPrompts(opts: {
  db: Pool;
  tenantId: number;
  prompt: string;
  durations: number[];
}): Promise<string[]> {
  const n = opts.durations.length;
  if (n <= 1) return [opts.prompt];
  try {
    const creds = await resolveStudioChatCreds(opts.db, opts.tenantId);
    if (!creds) return opts.durations.map((_, i) => `${opts.prompt}. Shot ${i + 1} of ${n}, continuous cinematic sequence.`);
    const reply = await runAgentBrainChat({
      creds,
      systemPrompt: "You split a video brief into consecutive shot prompts. Return JSON only: an array of English strings.",
      messages: [
        {
          role: "user",
          content: `Split this into ${n} consecutive shots (durations seconds: ${opts.durations.join(", ")}). Keep the same subject and style.\n\n${opts.prompt}`
        }
      ],
      maxTokens: 1600
    });
    const jsonText = reply.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonText) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string") && parsed.length >= n) {
      return parsed.slice(0, n).map((s) => String(s).trim()).filter(Boolean);
    }
  } catch {
    /* fall through */
  }
  return opts.durations.map((_, i) => `${opts.prompt}. Shot ${i + 1} of ${n}, continuous cinematic sequence.`);
}

function jsonError(json: Record<string, unknown> | null, text: string, status: number): string {
  const err = json?.error as { message?: string } | string | undefined;
  const msg =
    (typeof err === "object" && err?.message) ||
    (typeof err === "string" ? err : "") ||
    (json?.message as string) ||
    text;
  return String(msg || `HTTP ${status}`).slice(0, 280);
}

type H3ClipOpts = {
  prompt: string;
  duration: number;
  ratio: string;
  imageDataUri?: string;
  resolution: string;
};

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  text: string;
}> {
  const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await resp.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { ok: resp.ok, status: resp.status, json, text };
}

function h3Content(opts: H3ClipOpts): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: opts.prompt.slice(0, 7000) }];
  if (opts.imageDataUri) {
    content.push({
      type: "image_url",
      image_url: { url: opts.imageDataUri },
      role: "first_frame"
    });
  }
  return content;
}

async function pollUntilVideoUrl(opts: {
  queryUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<string> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const q = await fetchJson(opts.queryUrl, { method: "GET", headers: opts.headers }, 30000);
    const task = (q.json?.task as Record<string, unknown> | undefined) || q.json || {};
    const status = String(task.status || q.json?.status || "").toLowerCase();
    const content = (task.content as Record<string, unknown> | undefined) || {};
    const url = String(content.url || task.video_url || q.json?.url || q.json?.video_url || "");
    if (status === "succeeded" || status === "success" || (url && (status === "complete" || status === "completed"))) {
      if (!url) throw new Error("视频任务成功但没有下载地址。");
      return url;
    }
    if (status === "failed" || status === "cancelled" || status === "canceled" || status === "expired") {
      throw new Error(jsonError(q.json, q.text, q.status) || `视频任务 ${status}`);
    }
    if (!q.ok && q.status !== 200) {
      throw new Error(`查询视频任务失败：${jsonError(q.json, q.text, q.status)}`);
    }
  }
  throw new Error("视频生成超时。");
}

async function generateH3OfficialClip(opts: H3ClipOpts): Promise<Buffer> {
  const apiKey = env.MINIMAX_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 MINIMAX_API_KEY。");
  const base = (env.MINIMAX_BASE_URL || "https://api.minimaxi.com").replace(/\/$/, "");
  const model = env.MINIMAX_VIDEO_MODEL || "MiniMax-H3";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const body: Record<string, unknown> = {
    model,
    content: h3Content(opts),
    resolution: opts.resolution,
    duration: opts.duration
  };
  if (!opts.imageDataUri) body.ratio = opts.ratio;
  else body.ratio = "adaptive";
  const created = await fetchJson(`${base}/v2/video_generation`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }, 60000);
  if (!created.ok) throw new Error(`MiniMax-H3 提交失败：${jsonError(created.json, created.text, created.status)}`);
  const taskId = String(created.json?.task_id || (created.json?.task as { id?: string } | undefined)?.id || "");
  if (!taskId) throw new Error("MiniMax-H3 没有返回 task_id。");
  const url = await pollUntilVideoUrl({
    queryUrl: `${base}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
    headers,
    timeoutMs: 12 * 60_000
  });
  const got = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!got.ok) throw new Error(`下载 MiniMax 视频失败 HTTP ${got.status}`);
  return Buffer.from(await got.arrayBuffer());
}

function autodlArtAuthHeader(token: string): string {
  return /^bearer\s+/i.test(token) ? token : token;
}

function firstAutodlResultUrl(results: unknown): string {
  if (typeof results === "string" && /^https?:\/\//i.test(results)) return results;
  if (!Array.isArray(results)) return "";
  for (const item of results) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const u = String(o.url || o.video_url || o.file_url || o.src || o.output || "");
      if (/^https?:\/\//i.test(u)) return u;
    }
  }
  return "";
}

async function generateAutodlArtClip(opts: H3ClipOpts): Promise<Buffer> {
  const apiKey = env.AUTODL_ART_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未配置 AUTODL_ART_API_KEY。到 autodl.art → 令牌管理，创建分组为 ComfyUI 的令牌。");
  }
  const root = (env.AUTODL_ART_BASE_URL || "https://www.autodl.art/api/v1").replace(/\/$/, "");
  const workflow = opts.imageDataUri
    ? env.AUTODL_ART_I2V_WORKFLOW || "minimax_h3_lightx2v_v5"
    : env.AUTODL_ART_T2V_WORKFLOW || "minimax_h3_lightx2v_no_pic";
  const headers = {
    Authorization: autodlArtAuthHeader(apiKey),
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const body: Record<string, unknown> = {
    prompt: opts.prompt.slice(0, 200000),
    duration: Math.max(1, Math.min(10, Math.round(opts.duration))),
    resolution: env.AUTODL_ART_RESOLUTION || "768p竖"
  };
  if (opts.imageDataUri) body.ref_image_0 = opts.imageDataUri;

  const created = await fetchJson(`${root}/comfyui/comfyui_workflow/${encodeURIComponent(workflow)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }, 60000);
  if (!created.ok) {
    throw new Error(`AutoDL.art 提交失败：${jsonError(created.json, created.text, created.status)}`);
  }
  const createdData = (created.json?.data as Record<string, unknown> | undefined) || {};
  const taskId = String(createdData.task_id || created.json?.task_id || "");
  if (!taskId) throw new Error("AutoDL.art 没有返回 task_id。请确认令牌分组是 ComfyUI。");

  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const q = await fetchJson(
      `${root}/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`,
      { method: "GET", headers },
      30000
    );
    const data = (q.json?.data as Record<string, unknown> | undefined) || {};
    const status = String(data.status || "").toUpperCase();
    if (status === "SUCCESS") {
      const url = firstAutodlResultUrl(data.results);
      if (!url) throw new Error("AutoDL.art 任务成功但没有视频地址。");
      const got = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!got.ok) throw new Error(`下载 AutoDL.art 视频失败 HTTP ${got.status}`);
      return Buffer.from(await got.arrayBuffer());
    }
    if (status === "FAILED") {
      throw new Error(String(data.message || q.json?.msg || "AutoDL.art 任务失败"));
    }
    if (!q.ok && q.status >= 400) {
      throw new Error(`查询 AutoDL.art 任务失败：${jsonError(q.json, q.text, q.status)}`);
    }
  }
  throw new Error("AutoDL.art 视频超时。");
}

async function generateGpuClip(opts: {
  prompt: string;
  duration: number;
  imageBase64?: string;
  negative?: string;
}): Promise<Buffer> {
  const submit = await fetchGpu(
    "/v1/video/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        prompt: opts.prompt,
        negative: opts.negative || "",
        duration_sec: opts.duration,
        image_base64: opts.imageBase64 || ""
      })
    },
    30000
  );
  if (!submit.ok) {
    throw new Error(`4090 提交失败：${String(submit.json?.message || submit.text || `HTTP ${submit.status}`)}`);
  }
  const jobId = String(submit.json?.job_id || submit.json?.id || "");
  if (!jobId) throw new Error("4090 没有返回 job_id。");
  const deadline = Date.now() + 25 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetchGpu(`/v1/video/status?id=${encodeURIComponent(jobId)}`, { method: "GET" }, 15000);
    const status = String(st.json?.status || "").toLowerCase();
    if (status === "failed") {
      throw new Error(String(st.json?.message || "4090 视频失败"));
    }
    if (status === "succeeded" || status === "success" || status === "done") {
      const file = await fetchGpu(`/v1/video/file?id=${encodeURIComponent(jobId)}`, { method: "GET" }, 120000);
      if (file.buf && file.buf.length > 800) return file.buf;
      const b64 = String(st.json?.video_base64 || "").replace(/\s/g, "");
      if (b64) return Buffer.from(b64, "base64");
      throw new Error("4090 没有返回视频文件。");
    }
  }
  throw new Error("4090 视频超时。");
}

async function concatMp4(clips: Buffer[]): Promise<Buffer> {
  if (clips.length === 1) return clips[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bss-studio-vid-"));
  try {
    const listPath = path.join(dir, "list.txt");
    const lines: string[] = [];
    clips.forEach((buf, i) => {
      const p = path.join(dir, `clip${i}.mp4`);
      fs.writeFileSync(p, buf);
      lines.push(`file '${p.replace(/'/g, "'\\''")}'`);
    });
    fs.writeFileSync(listPath, lines.join("\n"));
    const outPath = path.join(dir, "out.mp4");
    const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
    try {
      await execFileAsync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], {
        timeout: 120000
      });
    } catch {
      await execFileAsync(
        ffmpeg,
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", outPath],
        { timeout: 300000 }
      );
    }
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 800) throw new Error("视频拼接失败。");
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function runVideoJob(job: StudioVideoJob, opts: {
  db: Pool;
  tenantId: number;
  ratio: string;
  imageDataUri?: string;
  imageBuf?: Buffer;
  negative?: string;
}): Promise<void> {
  job.status = "running";
  const maxClip = job.provider === "gpu" ? 6 : job.provider === "autodl-art" ? 10 : 15;
  const durations = splitClipDurations(job.durationSec, maxClip);
  job.message = durations.length > 1 ? `正在拆成 ${durations.length} 段（每段最长 ${maxClip} 秒）…` : "正在生成视频…";
  const shots = await splitShotPrompts({
    db: opts.db,
    tenantId: opts.tenantId,
    prompt: job.prompt,
    durations
  });
  const clips: Buffer[] = [];
  const resolution = env.MINIMAX_VIDEO_RESOLUTION || "768P";
  for (let i = 0; i < durations.length; i++) {
    job.message = `正在生成第 ${i + 1}/${durations.length} 段（${durations[i]} 秒）…`;
    let buf: Buffer;
    if (job.provider === "autodl-art") {
      buf = await generateAutodlArtClip({
        prompt: shots[i] || job.prompt,
        duration: durations[i],
        ratio: opts.ratio,
        imageDataUri: i === 0 ? opts.imageDataUri : undefined,
        resolution
      });
    } else if (job.provider === "minimax") {
      buf = await generateH3OfficialClip({
        prompt: shots[i] || job.prompt,
        duration: durations[i],
        ratio: opts.ratio,
        imageDataUri: i === 0 ? opts.imageDataUri : undefined,
        resolution
      });
    } else {
      buf = await generateGpuClip({
        prompt: shots[i] || job.prompt,
        duration: durations[i],
        imageBase64: i === 0 && opts.imageBuf ? opts.imageBuf.toString("base64") : undefined,
        negative: opts.negative
      });
    }
    clips.push(buf);
  }
  job.message = clips.length > 1 ? "正在拼接成片…" : "正在保存到文件库…";
  const videoBuf = await concatMp4(clips);
  const asset = await saveStudioBytesToLibrary({
    db: opts.db,
    buf: videoBuf,
    mime: "video/mp4",
    kind: "video",
    prefix: "studio-video"
  });
  await extractSocialLibraryVideoPoster(asset.storedName, path.join(socialLibraryUploadDir(), path.basename(asset.storedName)));
  job.asset = asset;
  job.status = "succeeded";
  job.message = "视频已写入文件库。";
}

export async function startStudioVideoJob(opts: {
  db: Pool;
  tenantId: number;
  prompt: string;
  durationSec: number;
  ratio?: string;
  imageAssetId?: number;
  imageBase64?: string;
  negative?: string;
}): Promise<StudioVideoJob> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("请填写画面描述。");
  const durationSec = Math.max(4, Math.min(300, Math.round(Number(opts.durationSec) || 15)));
  const provider = resolveVideoProvider();
  if (provider === "none") {
    throw new Error("未配置视频通道。填写 AUTODL_ART_API_KEY 或 MINIMAX_API_KEY，或接通 4090。");
  }
  if (provider === "minimax" && !minimaxConfigured()) throw new Error("未配置 MINIMAX_API_KEY。");
  if (provider === "autodl-art" && !autodlArtConfigured()) throw new Error("未配置 AUTODL_ART_API_KEY。");

  const image = await readAttachedImage({
    db: opts.db,
    imageAssetId: opts.imageAssetId,
    imageBase64: opts.imageBase64
  });
  const ratio = (opts.ratio || "16:9").trim() || "16:9";

  pruneJobs();
  const job: StudioVideoJob = {
    id: randomUUID(),
    tenantId: opts.tenantId,
    status: "queued",
    message: "已排队",
    provider,
    durationSec,
    prompt,
    createdAt: Date.now()
  };
  jobs.set(job.id, job);

  void runVideoJob(job, {
    db: opts.db,
    tenantId: opts.tenantId,
    ratio,
    imageDataUri: image?.dataUri,
    imageBuf: image?.buf,
    negative: opts.negative
  }).catch((e: unknown) => {
    job.status = "failed";
    job.message = String((e as Error)?.message ?? e).slice(0, 400);
  });

  return job;
}
