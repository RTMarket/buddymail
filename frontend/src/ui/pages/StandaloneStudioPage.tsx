import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  fetchStudioStatus,
  fetchStudioVideoJob,
  postStudioChat,
  postStudioTxt2Img,
  postStudioVideo,
  type StudioAsset,
  type StudioChatTurn,
  type StudioImagePick,
  type StudioStatus,
  type StudioVideoJob
} from "../../lib/standaloneStudioApi";
import {
  blobStudioDocx,
  blobStudioPdf,
  blobStudioXlsx,
  downloadUrlAsFile,
  studioCopyFileName,
  triggerBlobDownload,
  type StudioCopyDoc
} from "../../lib/standaloneStudioCopyExport";

type ChatRow = { role: "user" | "assistant"; content: string; imagePreview?: string };
type CopyItem = StudioCopyDoc & { id: string; selected: boolean };
type MediaItem = { asset: StudioAsset; selected: boolean; pick?: StudioImagePick };
type ImageChoice = "auto" | "kolors" | "turbo" | "qwen";

const IMAGE_MODELS: Array<{
  id: ImageChoice;
  name: string;
  cost: string;
  note: string;
}> = [
  { id: "auto", name: "自动推荐", cost: "按内容选模", note: "偏实拍走免费 Kolors，海报走 Turbo，字多信息图走 Qwen" },
  { id: "kolors", name: "Kolors", cost: "¥0 / 张", note: "硅基流动 · Kwai-Kolors/Kolors，免费" },
  { id: "turbo", name: "Z-Image-Turbo", cost: "约 ¥0.10 / 张", note: "硅基流动 · Tongyi-MAI/Z-Image-Turbo" },
  { id: "qwen", name: "Qwen-Image", cost: "约 ¥0.30 / 张", note: "硅基流动 · Qwen/Qwen-Image，适合字多/信息图" }
];

function formatPickCost(pick?: StudioImagePick) {
  if (!pick) return "";
  if (pick.estimatedCny <= 0) return "¥0";
  return `约 ¥${pick.estimatedCny.toFixed(2)}`;
}

const MEMORY_KEY = "bss_studio_ali_memory_v1";
const MEMORY_MAX = 40;
const GALLERY_MAX = 5;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读图失败"));
    reader.readAsDataURL(file);
  });
}

function compressDataUri(dataUri: string, maxEdge = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUri);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

function newId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadMemory(): { messages: ChatRow[]; images: MediaItem[]; videos: MediaItem[]; copies: CopyItem[] } {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { messages: [], images: [], videos: [], copies: [] };
    const parsed = JSON.parse(raw) as {
      messages?: ChatRow[];
      images?: StudioAsset[];
      videos?: StudioAsset[];
      copies?: StudioCopyDoc[];
    };
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MEMORY_MAX) : [],
      images: Array.isArray(parsed.images)
        ? parsed.images.slice(-GALLERY_MAX).map((asset) => ({ asset, selected: true }))
        : [],
      videos: Array.isArray(parsed.videos)
        ? parsed.videos.slice(-GALLERY_MAX).map((asset) => ({ asset, selected: true }))
        : [],
      copies: Array.isArray(parsed.copies)
        ? parsed.copies.slice(-GALLERY_MAX).map((c) => ({ ...c, id: newId(), selected: true }))
        : []
    };
  } catch {
    return { messages: [], images: [], videos: [], copies: [] };
  }
}

function saveMemory(opts: { messages: ChatRow[]; images: MediaItem[]; videos: MediaItem[]; copies: CopyItem[] }) {
  const slimMessages = opts.messages.slice(-MEMORY_MAX).map((m) => ({
    role: m.role,
    content: m.content,
    imagePreview: m.imagePreview && m.imagePreview.length < 160000 ? m.imagePreview : undefined
  }));
  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify({
      messages: slimMessages,
      images: opts.images.slice(-GALLERY_MAX).map((x) => x.asset),
      videos: opts.videos.slice(-GALLERY_MAX).map((x) => x.asset),
      copies: opts.copies.slice(-GALLERY_MAX).map(({ title, body, table }) => ({ title, body, table }))
    })
  );
}

function keepLast<T>(list: T[], extra: T[], max: number) {
  return [...list, ...extra].slice(-max);
}

export function StandaloneStudioPage() {
  const { locale } = useSiteLocale();
  const zh = locale !== "en";
  const t = (a: string, b: string) => (zh ? a : b);
  const boot = useRef(loadMemory()).current;

  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [statusErr, setStatusErr] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>(boot.messages);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [err, setErr] = useState("");
  const [images, setImages] = useState<MediaItem[]>(boot.images);
  const [videos, setVideos] = useState<MediaItem[]>(boot.videos);
  const [copies, setCopies] = useState<CopyItem[]>(boot.copies);
  const [pendingJobs, setPendingJobs] = useState<StudioVideoJob[]>([]);
  const [chatImageB64, setChatImageB64] = useState("");
  const [chatImageName, setChatImageName] = useState("");
  const [refImageB64, setRefImageB64] = useState("");
  const [imageChoice, setImageChoice] = useState<ImageChoice>("auto");
  const listRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const memoryRef = useRef({ messages: boot.messages, images: boot.images, videos: boot.videos, copies: boot.copies });

  useEffect(() => {
    memoryRef.current = { messages, images, videos, copies };
    saveMemory(memoryRef.current);
  }, [messages, images, videos, copies]);

  useEffect(() => {
    let cancelled = false;
    fetchStudioStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatusErr(String((e as Error)?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, chatBusy]);

  useEffect(() => {
    const running = pendingJobs.filter((j) => j.status !== "succeeded" && j.status !== "failed");
    if (!running.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(running.map((job) => fetchStudioVideoJob(job.id)))
        .then((rows) => {
          setPendingJobs((prev) =>
            prev.map((old) => rows.find((r) => r.job.id === old.id)?.job || old)
          );
          const done = rows.filter((r) => r.job.status === "succeeded" && r.job.asset).map((r) => r.job.asset) as StudioAsset[];
          if (done.length) {
            setVideos((prev) => keepLast(prev, done.map((asset) => ({ asset, selected: true })), GALLERY_MAX));
          }
          if (rows.some((r) => r.job.status === "failed")) {
            const fail = rows.find((r) => r.job.status === "failed");
            if (fail) setErr(fail.job.message);
          }
          if (rows.every((r) => r.job.status === "succeeded" || r.job.status === "failed")) setVideoBusy(false);
        })
        .catch((e: unknown) => {
          setErr(String((e as Error)?.message ?? e));
          setVideoBusy(false);
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pendingJobs]);

  async function onPickChatImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr(t("请选择图片。", "Pick an image."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr(t("图片请压缩到约 8MB 以内。", "Keep the image under about 8MB."));
      return;
    }
    const data = await compressDataUri(await fileToDataUri(file));
    setChatImageB64(data);
    setChatImageName(file.name);
    setRefImageB64(data);
    setErr("");
  }

  function clearHistory() {
    setMessages([]);
    setImages([]);
    setVideos([]);
    setCopies([]);
    setPendingJobs([]);
    setErr("");
    localStorage.removeItem(MEMORY_KEY);
  }

  async function runImages(prompt: string, count: number, style?: string) {
    setGenBusy(true);
    const n = Math.max(1, Math.min(GALLERY_MAX, count || 1));
    const made: MediaItem[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const resp = await postStudioTxt2Img(prompt, "", imageChoice, style || undefined);
        made.push({ asset: resp.asset, selected: true, pick: resp.pick });
      }
      setImages((prev) => keepLast(prev, made, GALLERY_MAX));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setGenBusy(false);
    }
  }

  async function runVideos(prompt: string, count: number, durationSec: number) {
    setVideoBusy(true);
    setPendingJobs([]);
    const n = Math.max(1, Math.min(GALLERY_MAX, count || 1));
    const lastImage = images.filter((x) => x.asset.kind === "image").slice(-1)[0]?.asset;
    try {
      const jobs: StudioVideoJob[] = [];
      for (let i = 0; i < n; i++) {
        const resp = await postStudioVideo({
          prompt,
          durationSec: Math.max(1, Math.min(300, durationSec || 15)),
          imageAssetId: lastImage?.id,
          imageBase64: !lastImage && refImageB64 ? refImageB64 : undefined
        });
        if (resp.job) jobs.push(resp.job);
      }
      setPendingJobs(jobs);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
      setVideoBusy(false);
    }
  }

  async function applyTurn(turn: StudioChatTurn) {
    if (turn.action === "image") {
      await runImages(turn.prompt || draft, turn.count, refImageB64 || chatImageB64);
    } else if (turn.action === "video") {
      await runVideos(turn.prompt || draft, turn.count, turn.durationSec);
    } else if (turn.action === "copy" && turn.copy) {
      setCopies((prev) => keepLast(prev, [{ ...turn.copy!, id: newId(), selected: true }], GALLERY_MAX));
    } else if (turn.action === "docs") {
      const latest = turn.copy || copies.slice(-1)[0];
      if (latest) {
        setCopies((prev) => {
          const exists = prev.some((c) => c.body === latest.body);
          return exists ? prev : keepLast(prev, [{ ...latest, id: newId(), selected: true }], GALLERY_MAX);
        });
      }
    }
  }

  async function sendChat() {
    const attached = chatImageB64;
    const text = draft.trim() || (attached ? t("请看这张图。", "Please look at this image.") : "");
    if (!text || chatBusy) return;
    const userRow: ChatRow = { role: "user", content: text, imagePreview: attached || undefined };
    const next: ChatRow[] = [...messages, userRow].slice(-MEMORY_MAX);
    setMessages(next);
    setDraft("");
    setChatImageB64("");
    setChatImageName("");
    if (chatFileRef.current) chatFileRef.current.value = "";
    setErr("");
    setChatBusy(true);
    try {
      const payload = next.map(({ role, content }) => ({ role, content }));
      const turn = await postStudioChat(payload, attached || undefined);
      const aliRow: ChatRow = { role: "assistant", content: turn.reply };
      const withAli: ChatRow[] = [...next, aliRow].slice(-MEMORY_MAX);
      setMessages(withAli);
      setChatBusy(false);
      await applyTurn(turn);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
      setMessages(messages);
      setDraft(text);
      setChatImageB64(attached);
      setChatImageName(chatImageName);
    } finally {
      setChatBusy(false);
    }
  }

  async function downloadSelectedCopies(kind: "docx" | "xlsx" | "pdf") {
    const picked = copies.filter((c) => c.selected);
    if (!picked.length || docBusy) return;
    setDocBusy(true);
    try {
      for (const item of picked) {
        const blob =
          kind === "docx" ? await blobStudioDocx(item) : kind === "xlsx" ? await blobStudioXlsx(item) : await blobStudioPdf(item);
        triggerBlobDownload(blob, studioCopyFileName(item.title, kind === "xlsx" ? "xlsx" : kind));
      }
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setDocBusy(false);
    }
  }

  async function downloadSelectedMedia(items: MediaItem[]) {
    const picked = items.filter((x) => x.selected);
    if (!picked.length) return;
    try {
      for (const item of picked) await downloadUrlAsFile(item.asset.url, item.asset.fileName);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  const pill = (ok: boolean) =>
    ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <PageShell
      title={t("创作区", "Studio")}
      actions={
        <Link to="/social/library" className="text-sm font-semibold text-slate-700 underline">
          {t("打开文件库", "Open library")}
        </Link>
      }
    >
      <div className="grid gap-2 lg:grid-cols-3">
        <p className={`rounded-lg border px-3 py-2 text-xs ${pill(Boolean(status?.chatReady))}`}>
          {statusErr
            ? statusErr
            : status?.chatReady
              ? t("Ali 已接通，可对话、识图，并记住上下文。", "Ali is ready. Chat, vision, and memory on.")
              : t("对话未接通：请配置 DeepSeek。", "Chat is off. Set DeepSeek.")}
        </p>
        <p className={`rounded-lg border px-3 py-2 text-xs ${pill(Boolean(status?.imageReady))}`}>
          {status?.imageReady ? t("图片通道已接通", "Image ready") : t("图片未接通", "Image off")}
        </p>
        <p className={`rounded-lg border px-3 py-2 text-xs ${pill(Boolean(status?.videoReady))}`}>
          {status?.videoReady ? t("视频通道已接通", "Video ready") : t("视频未接通", "Video off")}
        </p>
      </div>

      {err ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("对话区 · Ali", "Chat · Ali")}
          right={
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs font-semibold text-slate-500 underline"
            >
              {t("清除记录", "Clear history")}
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            <div
              ref={listRef}
              className="h-[28rem] space-y-2 overflow-y-auto overscroll-contain rounded-lg bg-slate-50 p-3 text-sm"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {messages.length === 0 ? (
                <p className="text-slate-500">
                  {t(
                    "直接跟 Ali 说。例如「帮我生成一张办公室海报」。文案会回在对话里，图片/视频出现在右边。",
                    "Talk to Ali. Copy comes back in chat; images and videos appear on the right."
                  )}
                </p>
              ) : (
                messages.map((m, i) => (
                  <div key={`${m.role}-${i}`}>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">{m.role === "user" ? t("我", "Me") : "Ali"}</p>
                    <div
                      className={`rounded-lg px-3 py-2 ${m.role === "user" ? "ml-6 bg-white" : "mr-6 bg-emerald-50"}`}
                    >
                      {m.imagePreview ? (
                        <img
                          src={m.imagePreview}
                          alt=""
                          className="mb-2 max-h-28 rounded-md border border-slate-200 bg-slate-50 object-contain"
                        />
                      ) : null}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))
              )}
              {chatBusy ? <p className="text-xs text-slate-500">{t("Ali 正在回复…", "Ali is typing…")}</p> : null}
              {genBusy ? <p className="text-xs text-slate-500">{t("Ali 正在出图…", "Ali is generating images…")}</p> : null}
              {videoBusy ? <p className="text-xs text-slate-500">{t("Ali 正在出视频…", "Ali is generating video…")}</p> : null}
            </div>
            <input
              ref={chatFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickChatImage(e.target.files?.[0] || null)}
            />
            {chatImageB64 ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <img src={chatImageB64} alt="" className="h-10 w-10 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{chatImageName}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 underline"
                  onClick={() => {
                    setChatImageB64("");
                    setChatImageName("");
                    if (chatFileRef.current) chatFileRef.current.value = "";
                  }}
                >
                  {t("去掉", "Remove")}
                </button>
              </div>
            ) : null}
            <textarea
              className="min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("跟 Ali 说你的需求…", "Tell Ali what you need…")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => chatFileRef.current?.click()}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {t("上传图片", "Upload")}
              </button>
              <button
                type="button"
                onClick={() => void sendChat()}
                disabled={chatBusy || (!draft.trim() && !chatImageB64)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {t("发送", "Send")}
              </button>
              <span className="text-[11px] text-slate-400">{t("最近 40 条会记住，可上下滑动。", "Last 40 turns are remembered. Scroll the thread.")}</span>
            </div>
            {status?.imageReady ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-700">
                  {t("出图模型（已接通 · 选哪个走哪个）", "Image model (connected — your pick is used)")}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {IMAGE_MODELS.map((m) => {
                    const on = imageChoice === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setImageChoice(m.id)}
                        className={`rounded-md border px-2 py-1.5 text-left ${
                          on ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{m.name}</span>
                          <span className="text-[11px] font-semibold text-amber-800">{m.cost}</span>
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{m.note}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  {t(
                    "费用按张计（刊例，以硅基流动账单为准）。自动推荐：免费 / 约¥0.10 / 约¥0.30。指定模型后本次出图全部走该模型。",
                    "Per-image list price (SiliconFlow bill is source of truth). Auto: free / ~¥0.10 / ~¥0.30."
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-amber-800">
                {t("图片通道未接通，无法选模型出图。", "Image channel is off; model picker is unavailable.")}
              </p>
            )}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title={t("文案文件", "Copy files")}>
            {copies.length === 0 ? (
              <p className="text-sm text-slate-500">{t("文案由 Ali 在对话里发给你。需要 Word / Excel / PDF 时，文件会出现在这里。", "Ali sends copy in chat. Word / Excel / PDF files show here.")}</p>
            ) : (
              <div className="space-y-3">
                {copies.map((c, i) => (
                  <label key={c.id} className="flex gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) =>
                        setCopies((prev) => prev.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.title}</span>
                      <span className="block max-h-16 overflow-hidden text-xs text-slate-600">{c.body}</span>
                    </span>
                  </label>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={docBusy} onClick={() => void downloadSelectedCopies("docx")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
                    {t("下载 Word", "Word")}
                  </button>
                  <button type="button" disabled={docBusy} onClick={() => void downloadSelectedCopies("xlsx")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
                    {t("下载 Excel", "Excel")}
                  </button>
                  <button type="button" disabled={docBusy} onClick={() => void downloadSelectedCopies("pdf")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
                    {t("下载 PDF", "PDF")}
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={t("图片展示区（最多 5 张）", "Images (max 5)")}
            right={
              images.length ? (
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-xs font-semibold text-slate-500 underline"
                >
                  {t("清空", "Clear")}
                </button>
              ) : null
            }
          >
            {genBusy && images.length === 0 ? (
              <p className="text-sm text-slate-500">{t("正在出图…", "Generating…")}</p>
            ) : images.length === 0 ? (
              <p className="text-sm text-slate-500">{t("跟 Ali 说「帮我出一张图」，结果出现在这里。", "Ask Ali for an image.")}</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {images.map((item, i) => (
                    <div key={`${item.asset.id}-${i}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                      <label className="block">
                        <input
                          type="checkbox"
                          className="absolute left-2 top-2 z-10"
                          checked={item.selected}
                          onChange={(e) =>
                            setImages((prev) => prev.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                          }
                        />
                        <img src={item.asset.url} alt="" className="h-32 w-full object-cover" />
                      </label>
                      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                        <span className="truncate text-[10px] text-slate-500">
                          {item.pick?.label || ""}
                          {item.pick ? ` · ${formatPickCost(item.pick)}` : ""}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-[11px] font-semibold text-rose-700 underline"
                          onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        >
                          {t("删除", "Delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void downloadSelectedMedia(images)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                    {t("下载勾选图片", "Download selected")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((x) => !x.selected))}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {t("删除勾选", "Delete selected")}
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title={t("视频展示区（最多 5 条）", "Videos (max 5)")}>
            {videoBusy && videos.length === 0 ? (
              <p className="text-sm text-slate-500">{t("正在出视频…", "Generating video…")}</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-slate-500">{t("跟 Ali 说「帮我做一条视频」，结果出现在这里。", "Ask Ali for a video.")}</p>
            ) : (
              <div className="space-y-3">
                {videos.map((item, i) => (
                  <label key={`${item.asset.id}-${i}`} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2">
                    <input
                      type="checkbox"
                      className="mt-2"
                      checked={item.selected}
                      onChange={(e) =>
                        setVideos((prev) => prev.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                      }
                    />
                    <video src={item.asset.url} controls className="max-h-40 w-full rounded bg-slate-50" />
                  </label>
                ))}
                <button type="button" onClick={() => void downloadSelectedMedia(videos)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                  {t("下载勾选视频", "Download selected")}
                </button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
