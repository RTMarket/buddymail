import React, { useState } from "react";
import { SectionCard } from "../SectionCard";

type Props = {
  locale: string;
};

export function StandaloneApiV1DocPanel(props: Props) {
  const en = props.locale === "en";
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || doc !== null) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/docs/api-v1-email.md", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDoc(await res.text());
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title={en ? "API documentation" : "API 文档"}
      description={
        en
          ? "Expand to read endpoint list and examples on this page (no download)."
          : "在本页展开查看端点说明与示例，无需下载文件。"
      }
    >
      <button
        type="button"
        className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        onClick={() => void toggle()}
      >
        {open ? (en ? "Hide API docs" : "收起 API 文档") : en ? "Show API docs" : "打开 API 文档"}
      </button>
      {open ? (
        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-slate-600">{en ? "Loading…" : "加载中…"}</p>
          ) : err ? (
            <p className="text-sm text-red-700">{err}</p>
          ) : (
            <pre className="max-h-[min(70vh,560px)] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
              {doc}
            </pre>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
