import { useCallback, useEffect, useRef, useState } from "react";

export type InlineActionFeedback =
  | { phase: "idle" }
  | { phase: "confirm"; message: string }
  | { phase: "busy" }
  | { phase: "ok"; message: string }
  | { phase: "err"; message: string };

export const INLINE_FEEDBACK_IDLE: InlineActionFeedback = { phase: "idle" };

export type PageFeedback = { kind: "ok" | "err"; text: string };

export function scheduleFeedbackClear(
  timerRef: React.MutableRefObject<number | null>,
  clear: () => void,
  ms: number
) {
  if (timerRef.current != null) window.clearTimeout(timerRef.current);
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    clear();
  }, ms);
}

export function usePageFeedback(defaultClearMs: { ok?: number; err?: number } = {}) {
  const okMs = defaultClearMs.ok ?? 4500;
  const errMs = defaultClearMs.err ?? 6500;
  const [feedback, setFeedback] = useState<PageFeedback | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const show = useCallback(
    (kind: "ok" | "err", text: string, autoClearMs?: number) => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setFeedback({ kind, text });
      const ms = autoClearMs ?? (kind === "ok" ? okMs : errMs);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setFeedback(null);
      }, ms);
    },
    [okMs, errMs]
  );

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFeedback(null);
  }, []);

  return { feedback, showOk: (text: string, ms?: number) => show("ok", text, ms), showErr: (text: string, ms?: number) => show("err", text, ms), clear };
}

export function useInlineActionFeedback() {
  const [ui, setUi] = useState<InlineActionFeedback>(INLINE_FEEDBACK_IDLE);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setUi(INLINE_FEEDBACK_IDLE);
  }, []);

  const show = useCallback(
    (next: InlineActionFeedback, autoClearMs?: number) => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setUi(next);
      if (
        autoClearMs != null &&
        autoClearMs > 0 &&
        (next.phase === "ok" || next.phase === "err")
      ) {
        scheduleFeedbackClear(timerRef, () => setUi(INLINE_FEEDBACK_IDLE), autoClearMs);
      }
    },
    []
  );

  const showOk = useCallback((message: string, ms = 4000) => show({ phase: "ok", message }, ms), [show]);
  const showErr = useCallback((message: string, ms = 6500) => show({ phase: "err", message }, ms), [show]);
  const beginConfirm = useCallback((message: string) => show({ phase: "confirm", message }), [show]);

  return { ui, setUi, show, showOk, showErr, beginConfirm, clear };
}
