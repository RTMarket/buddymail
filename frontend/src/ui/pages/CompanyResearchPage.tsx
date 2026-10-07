import React, { useMemo, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  chatCompanyResearch,
  fetchCompanyResearchTranscript,
  testCompanyResearchAi,
  type ResearchChatMsg,
  type ResearchTasks
} from "../../lib/companyResearchApi";
import { blobStudioDocx, studioCopyFileName, triggerBlobDownload } from "../../lib/standaloneStudioCopyExport";

const LS_KEY = "bss_company_research_ai_v1";
const URL_RE = /https?:\/\/[^\s<>"'）)】\]]+/g;

type SavedCreds = { apiKey: string; baseUrl: string; model: string };
type WordDoc = { name: string; title: string; body: string; selected: boolean };

function loadSaved(): SavedCreds {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };
    const p = JSON.parse(raw) as Partial<SavedCreds>;
    return {
      apiKey: String(p.apiKey ?? ""),
      baseUrl: String(p.baseUrl ?? "https://api.openai.com/v1"),
      model: String(p.model ?? "gpt-4o-mini")
    };
  } catch {
    return { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };
  }
}

const STARTER_ZH =
  "告诉我你的调研需求：你需要研究什么行业的公司？关注什么业务、什么市场、要解决什么决策问题？";
const STARTER_EN =
  "Tell me your research need: which industry, what business, and what decision you want help with.";

function collectUrls(text: string): string[] {
  return [...new Set(text.match(URL_RE) ?? [])];
}

function MessageWithLinks(props: { text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const urls = collectUrls(props.text);
  const parts = props.text.split(URL_RE);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap break-words text-sm leading-6">
        {parts.map((part, i) => (
          <React.Fragment key={`p-${i}`}>
            {part}
            {urls[i] ? (
              <span className="inline-flex max-w-full items-center gap-1 align-middle">
                <a
                  href={urls[i]}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline decoration-slate-400 underline-offset-2"
                >
                  {urls[i]}
                </a>
                <button
                  type="button"
                  className="shrink-0 rounded border border-current/30 px-1 py-0.5 text-[10px] leading-none"
                  onClick={() => void copy(urls[i])}
                >
                  {copied === urls[i] ? props.copiedLabel : props.copyLabel}
                </button>
              </span>
            ) : null}
          </React.Fragment>
        ))}
      </div>
      {urls.length > 1 ? (
        <button
          type="button"
          className="text-[11px] underline opacity-80"
          onClick={() => void copy(urls.join("\n"))}
        >
          {copied === urls.join("\n") ? props.copiedLabel : `${props.copyLabel} (${urls.length})`}
        </button>
      ) : null}
    </div>
  );
}

export function CompanyResearchPage() {
  const { locale } = useSiteLocale();
  const zh = locale !== "en";
  const t = (a: string, b: string) => (zh ? a : b);

  const [creds, setCreds] = useState<SavedCreds>(loadSaved);
  const [aiOpen, setAiOpen] = useState(() => !loadSaved().apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [connected, setConnected] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const [tasks, setTasks] = useState<ResearchTasks>({
    competitors: true,
    news: true,
    interview: true,
    decision: true
  });

  const [messages, setMessages] = useState<ResearchChatMsg[]>([
    { role: "assistant", content: zh ? STARTER_ZH : STARTER_EN }
  ]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");

  const [videoUrl, setVideoUrl] = useState("");
  const [transcriptTitle, setTranscriptTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [wordDoc, setWordDoc] = useState<WordDoc | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const credsReady = useMemo(() => creds.apiKey.trim().length > 8, [creds.apiKey]);

  function persist(next: SavedCreds) {
    setCreds(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function onTest() {
    setTestBusy(true);
    setTestMsg("");
    setConnected(false);
    try {
      const r = await testCompanyResearchAi(creds);
      if (!r.ok || !r.connected) throw new Error(r.message || t("未接通", "Not connected"));
      setConnected(true);
      setTestMsg(t(`已接通 · 模型 ${r.model}`, `Connected · model ${r.model}`));
      setAiOpen(false);
    } catch (e: unknown) {
      setTestMsg(String((e as Error)?.message ?? e));
    } finally {
      setTestBusy(false);
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text) return;
    setError("");
    setDraft("");
    const nextHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(nextHistory);
    setChatBusy(true);
    try {
      const r = await chatCompanyResearch({
        creds,
        content: text,
        history: nextHistory.slice(0, -1).filter((m) => m.content !== STARTER_ZH && m.content !== STARTER_EN),
        tasks,
        transcript: transcript || undefined
      });
      if (!r.ok || !r.reply) throw new Error(r.message || t("AI 无回复", "No reply"));
      setMessages([...nextHistory, { role: "assistant", content: r.reply }]);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
      setMessages(nextHistory);
    } finally {
      setChatBusy(false);
    }
  }

  async function onFetchVideo() {
    setVideoBusy(true);
    setError("");
    setWordDoc(null);
    try {
      const r = await fetchCompanyResearchTranscript(videoUrl.trim());
      if (!r.ok || !r.text) throw new Error(r.message || t("未能抽取文案", "Transcript failed"));
      const title = r.title || t("访谈文案", "Interview transcript");
      const body = `${r.url || videoUrl}\n\n${r.text}`;
      setTranscriptTitle(title);
      setTranscript(r.text);
      setWordDoc({
        name: studioCopyFileName(title, "docx"),
        title,
        body,
        selected: true
      });
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setVideoBusy(false);
    }
  }

  async function downloadWord() {
    if (!wordDoc?.selected) {
      setError(t("请先勾选要下载的 Word 文档", "Check the Word file first"));
      return;
    }
    setDocBusy(true);
    setError("");
    try {
      const blob = await blobStudioDocx({ title: wordDoc.title, body: wordDoc.body, table: [] });
      triggerBlobDownload(blob, wordDoc.name);
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setDocBusy(false);
    }
  }

  const taskItems = [
    ["competitors", t("竞品调研", "Competitor research")],
    ["news", t("行业新闻动态", "Industry news")],
    ["interview", t("采访/访谈视频", "Interview videos")],
    ["decision", t("帮我做决策与建议输出", "Decisions & recommendations")]
  ] as const;

  return (
    <PageShell
      title={t("企业调研", "Company research")}
      description={t(
        "与 AI 对话做深度调研。右侧勾选范围、粘贴访谈链接，生成 Word 后勾选下载。",
        "Chat with AI for research. Use the right rail for scope, video links, and Word download."
      )}
    >
      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setAiOpen((v) => !v)}
          aria-expanded={aiOpen}
        >
          <span className="text-sm font-medium">
            {t("AI 接入", "AI connection")}
            {connected ? (
              <span className="ml-2 text-xs font-normal text-emerald-700">{t("已接通", "Connected")}</span>
            ) : credsReady ? (
              <span className="ml-2 text-xs font-normal text-slate-500">{t("Key 已填写 · 未测试", "Key saved")}</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-slate-400">{t("点击展开填写", "Expand to set key")}</span>
            )}
          </span>
          <span className={`text-slate-400 transition-transform ${aiOpen ? "rotate-180" : ""}`}>▼</span>
        </button>
        {aiOpen ? (
          <div className="grid gap-3 border-t border-slate-100 px-4 py-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">API Key</span>
              <input
                type={showKey ? "text" : "password"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={creds.apiKey}
                onChange={(e) => persist({ ...creds, apiKey: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">{t("模型", "Model")}</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={creds.model}
                onChange={(e) => persist({ ...creds, model: e.target.value })}
                placeholder="gpt-4o-mini / kimi-k2 / deepseek-chat"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">API Base URL</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={creds.baseUrl}
                onChange={(e) => persist({ ...creds, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <button
                type="button"
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={!credsReady || testBusy}
                onClick={() => void onTest()}
              >
                {testBusy ? t("测试中…", "Testing…") : t("测试是否接通", "Test connection")}
              </button>
              <button type="button" className="text-xs text-slate-600 underline" onClick={() => setShowKey((v) => !v)}>
                {showKey ? t("隐藏 Key", "Hide key") : t("显示 Key", "Show key")}
              </button>
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setAiOpen(false)}>
                {t("收起", "Collapse")}
              </button>
              {connected ? (
                <span className="text-sm text-emerald-700">{testMsg}</span>
              ) : testMsg ? (
                <span className="text-sm text-rose-700">{testMsg}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[72vh] overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-800">
            {t("AI 助理对话", "AI assistant chat")}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={
                  m.role === "assistant"
                    ? "max-w-[92%] rounded-lg bg-slate-50 px-3 py-2 text-slate-800"
                    : "ml-auto max-w-[88%] rounded-lg bg-slate-800 px-3 py-2 text-white"
                }
              >
                <MessageWithLinks
                  text={m.content}
                  copyLabel={t("复制", "Copy")}
                  copiedLabel={t("已复制", "Copied")}
                />
              </div>
            ))}
            {chatBusy ? <div className="text-xs text-slate-500">{t("调研中…", "Researching…")}</div> : null}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-100 p-3">
            <textarea
              className="min-h-[140px] w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t(
                "在这里和 AI 对话。可直接粘贴新闻网页或视频链接。Ctrl/⌘ + Enter 发送。",
                "Chat here. Paste news or video links. Ctrl/⌘ + Enter to send."
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSend();
              }}
              onPaste={() => {
                /* native paste already works; keep handler for future */
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={!credsReady || chatBusy || !draft.trim()}
                onClick={() => void onSend()}
              >
                {t("发送", "Send")}
              </button>
              {error ? <span className="self-center text-sm text-rose-700">{error}</span> : null}
            </div>
          </div>
        </div>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/80">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium">{t("调研范围", "Scope")}</div>
          <div className="space-y-2 px-3 py-3 text-sm">
            {taskItems.map(([key, label]) => (
              <label key={key} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={tasks[key]}
                  onChange={(e) => setTasks((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="border-t border-slate-200 px-3 py-2 text-sm font-medium">
            {t("访谈视频链接", "Interview video URL")}
          </div>
          <div className="space-y-2 px-3 py-3">
            <textarea
              className="min-h-[88px] w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…&#10;https://www.bilibili.com/video/BV…"
            />
            <button
              type="button"
              className="w-full rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={!videoUrl.trim() || videoBusy}
              onClick={() => void onFetchVideo()}
            >
              {videoBusy ? t("生成文案中…", "Generating…") : t("生成视频文案 Word", "Generate Word")}
            </button>
          </div>

          <div className="border-t border-slate-200 px-3 py-2 text-sm font-medium">
            {t("生成文档", "Generated files")}
          </div>
          <div className="space-y-3 px-3 py-3 text-sm">
            {wordDoc ? (
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={wordDoc.selected}
                    onChange={(e) => setWordDoc({ ...wordDoc, selected: e.target.checked })}
                  />
                  <span>
                    <span className="block font-medium text-slate-800">📄 {wordDoc.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {t("Word 文档 · 访谈视频文案", "Word · interview transcript")}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50"
                  disabled={!wordDoc.selected || docBusy}
                  onClick={() => void downloadWord()}
                >
                  {docBusy ? t("准备下载…", "Preparing…") : t("点击下载", "Download")}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {t("生成文案后，这里会出现 Word 文档，勾选后即可下载。", "A Word file appears here after generation.")}
              </p>
            )}
            {transcriptTitle ? (
              <p className="text-[11px] leading-5 text-slate-500">
                {t("已抽取", "Fetched")}: {transcriptTitle}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
