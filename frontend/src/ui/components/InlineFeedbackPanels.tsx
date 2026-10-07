import React, { useMemo } from "react";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getShellConfirmStrings } from "../../i18n/shellI18n";
import type { InlineActionFeedback, PageFeedback } from "../../lib/inlineFeedback";

export function PageFeedbackLine(props: { feedback: PageFeedback | null; className?: string }) {
  if (!props.feedback) return null;
  return (
    <p
      className={`text-xs ${props.feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"} ${props.className ?? ""}`}
      role="status"
    >
      {props.feedback.text}
    </p>
  );
}

export function InlineConfirmBar(props: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  const { locale } = useSiteLocale();
  const shellUi = useMemo(() => getShellConfirmStrings(locale), [locale]);
  return (
    <div
      className={`space-y-1.5 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950 ${props.className ?? ""}`}
      role="status"
    >
      <p className="whitespace-pre-wrap">{props.message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-rose-300 bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          disabled={props.busy}
          onClick={props.onConfirm}
        >
          {props.confirmLabel ?? shellUi.confirm}
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          {props.cancelLabel ?? shellUi.cancel}
        </button>
      </div>
    </div>
  );
}

export function InlineActionFeedbackBlock(props: {
  ui: InlineActionFeedback;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  const { ui } = props;
  if (ui.phase === "confirm" && props.onConfirm && props.onCancel) {
    return (
      <InlineConfirmBar
        message={ui.message}
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
        confirmLabel={props.confirmLabel}
        busy={props.busy}
        className={props.className}
      />
    );
  }
  if (ui.phase === "ok") {
    return (
      <p className={`text-[11px] text-emerald-700 ${props.className ?? ""}`} role="status">
        {ui.message}
      </p>
    );
  }
  if (ui.phase === "err") {
    return (
      <p className={`text-[11px] text-rose-700 ${props.className ?? ""}`} role="status">
        {ui.message}
      </p>
    );
  }
  return null;
}
