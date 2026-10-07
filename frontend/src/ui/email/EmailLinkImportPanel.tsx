import { useState } from "react";
import { apiJsonWithTimeout } from "../../lib/api";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";

export function EmailLinkImportPanel(props: {
  ui: EmailTemplatesPageStrings;
  onInsertHtml: (html: string, replace: boolean) => void;
  onSubjectSuggestion?: (subject: string) => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const { ui, onInsertHtml, onSubjectSuggestion, onError, onSuccess } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [replaceBody, setReplaceBody] = useState(true);
  const [fillSubject, setFillSubject] = useState(true);

  async function importFromUrl() {
    const url = pageUrl.trim();
    if (!url) {
      onError(ui.linkImportErrUrlRequired);
      return;
    }
    setBusy(true);
    try {
      const data = await apiJsonWithTimeout<{
        ok: boolean;
        subjectSuggestion?: string;
        bodyHtml?: string;
        notes?: string;
        message?: string;
      }>(
        "/api/email/import-page-url",
        {
          method: "POST",
          body: JSON.stringify({ url })
        },
        120_000
      );
      if (!data.ok || !data.bodyHtml?.trim()) {
        throw new Error(data.message ?? ui.linkImportErrEmpty);
      }
      onInsertHtml(data.bodyHtml, replaceBody);
      if (fillSubject && data.subjectSuggestion?.trim()) {
        onSubjectSuggestion?.(data.subjectSuggestion.trim());
      }
      onSuccess?.(data.notes?.trim() || ui.linkImportSuccess);
    } catch (e: unknown) {
      onError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/80">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-violet-900">{ui.linkImportTitle}</p>
          <p className="text-[11px] leading-snug text-violet-800/90">{ui.linkImportHint}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? ui.commerceCollapse : ui.commerceOpen}
        </button>
      </div>
      {open ? (
        <div className="space-y-2 border-t border-violet-200/80 px-3 pb-3 pt-2">
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !pageUrl.trim()}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50"
              onClick={() => void importFromUrl()}
            >
              {busy ? ui.linkImportBusy : ui.linkImportButton}
            </button>
          </div>
          <p className="text-[11px] text-slate-600">{ui.linkImportNote}</p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={replaceBody}
                onChange={(e) => setReplaceBody(e.target.checked)}
              />
              {ui.linkImportReplaceBody}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fillSubject}
                onChange={(e) => setFillSubject(e.target.checked)}
              />
              {ui.linkImportFillSubject}
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
