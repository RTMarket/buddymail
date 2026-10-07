import React, { useEffect, useState } from "react";
import { agentDisplayTitle, getAgentBrainStrings } from "../../../i18n/standaloneAgentBrainI18n";
import type { SiteLocale } from "../../../i18n/siteLocaleTypes";

type Props = {
  locale: SiteLocale;
  agentName?: string | null;
  agentReady: boolean;
  configLoaded: boolean;
  expanded: boolean;
  revising: boolean;
  aliRevised?: boolean;
  aliRevisionNote?: string;
  aliError?: string;
  title: string;
  body: string;
  onBodyChange: (body: string) => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onRequestRevise: (draft: { title: string; body: string }) => void;
  t: (zh: string, en: string) => string;
};

export function LinkedInQueueAliCopyPanel(props: Props) {
  const {
    locale,
    agentName,
    agentReady,
    configLoaded,
    expanded,
    revising,
    aliRevised,
    aliRevisionNote,
    aliError,
    title,
    body,
    onBodyChange,
    onTitleChange,
    onSave,
    onRequestRevise,
    t
  } = props;

  const copy = getAgentBrainStrings(locale);
  const displayName = agentDisplayTitle(agentName, locale);
  const [draftBody, setDraftBody] = useState(body);
  const [draftTitle, setDraftTitle] = useState(title);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [retryFlash, setRetryFlash] = useState<string | null>(null);

  useEffect(() => {
    setDraftBody(body);
    setDraftTitle(title);
    setSaveFlash(null);
    setRetryFlash(null);
  }, [body, title, expanded]);

  if (!expanded) return null;

  const handleRetry = () => {
    setRetryFlash(t(`${displayName} 开始优化…`, `${displayName} is revising…`));
    onRequestRevise({ title: draftTitle.trim(), body: draftBody.trim() });
  };

  const handleSave = () => {
    const nextTitle = draftTitle.trim();
    const nextBody = draftBody.trim();
    onTitleChange(nextTitle);
    onBodyChange(nextBody);
    onSave();
    setSaveFlash(t("已保存", "Saved"));
    window.setTimeout(() => setSaveFlash(null), 2200);
  };

  return (
    <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {revising ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-900">
            <span className="inline-flex gap-0.5" aria-hidden>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600" />
            </span>
            {t("AI 优化中…", "Optimizing…")}
          </span>
        ) : null}
        {aliRevised && !revising ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            {t("已优化", "Optimized")}
          </span>
        ) : null}
        {!configLoaded ? (
          <span className="text-[10px] text-slate-500">{t("加载智能体状态…", "Loading agent…")}</span>
        ) : !agentReady ? (
          <span className="text-[10px] text-amber-800">{copy.aliNeedActivate}</span>
        ) : null}
      </div>

      {aliRevisionNote && !revising ? (
        <p className="mb-2 text-[10px] leading-relaxed text-violet-800">
          <span className="font-semibold">{t("优化说明：", "Optimization note: ")}</span>
          {aliRevisionNote}
        </p>
      ) : null}
      {aliError ? <p className="mb-2 text-[10px] font-medium text-red-700">{aliError}</p> : null}
      {saveFlash ? <p className="mb-2 text-[10px] font-semibold text-emerald-700">{saveFlash}</p> : null}
      {retryFlash && revising ? <p className="mb-2 text-[10px] font-medium text-violet-800">{retryFlash}</p> : null}

      <input
        className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-60"
        value={draftTitle}
        disabled={revising}
        onChange={(e) => setDraftTitle(e.target.value)}
      />
      <textarea
        className="min-h-40 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-800 disabled:opacity-60"
        maxLength={1000}
        value={draftBody}
        disabled={revising}
        onChange={(e) => setDraftBody(e.target.value)}
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[10px] ${draftBody.length > 900 ? "text-amber-700" : "text-slate-500"}`}>
          {draftBody.length}/1000
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
            disabled={!configLoaded || !agentReady || revising}
            title={
              !agentReady
                ? t("请先在「自动化任务 → AI 大脑」激活智能体", "Activate the AI agent under Automation → AI brain first")
                : undefined
            }
            onClick={handleRetry}
          >
            {revising ? t("优化中…", "Optimizing…") : t("AI 优化文案", "Optimize copy")}
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={revising}
            onClick={handleSave}
          >
            {t("保存", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
