/** 单组正式发送：刷新/返回页后保留「本页已收尾」与绿色汇报，避免 resume 轮询二次收尾、计数被 API 盖回 0 */

export const FORMAL_LOCALLY_FINISHED_STORAGE_KEY = "bss_formal_locally_finished_v1";
export const FORMAL_POLL_FINISHED_STORAGE_KEY = "bss_formal_poll_finished_v1";
export const FORMAL_COMPLETION_NOTES_STORAGE_KEY = "bss_formal_completion_notes_v1";

export type StoredFormalCompletionNote = {
  campaignId: number;
  kind: "done" | "stop";
  sent: number;
  failed: number;
  attempted: number;
  planned: number;
  paceHint?: string;
  campaignCode?: string;
  campaignName?: string;
  industryLabels?: string;
  durationSec?: number;
  finishedAtMs?: number;
  fromEmails?: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privacy mode / quota */
  }
}

export function readFormalLocallyFinishedIds(scopedKey: string): number[] {
  const arr = readJson<number[]>(scopedKey, []);
  return arr.map((x) => Math.floor(Number(x) || 0)).filter((x) => x > 0);
}

export function persistFormalLocallyFinishedIds(scopedKey: string, ids: readonly number[]): void {
  const uniq = [...new Set(ids.map((x) => Math.floor(Number(x) || 0)).filter((x) => x > 0))];
  writeJson(scopedKey, uniq);
}

export function readFormalPollFinishedIds(scopedKey: string): Set<number> {
  return new Set(readFormalLocallyFinishedIds(scopedKey));
}

export function persistFormalPollFinishedIds(scopedKey: string, ids: Iterable<number>): void {
  persistFormalLocallyFinishedIds(scopedKey, [...ids]);
}

export function readFormalCompletionNotesByCampaign(
  scopedKey: string
): Record<string, StoredFormalCompletionNote> {
  const raw = readJson<Record<string, StoredFormalCompletionNote>>(scopedKey, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function readFormalCompletionNoteForCampaign(
  scopedKey: string,
  campaignId: number
): StoredFormalCompletionNote | null {
  const id = Math.floor(Number(campaignId) || 0);
  if (id <= 0) return null;
  const note = readFormalCompletionNotesByCampaign(scopedKey)[String(id)];
  return note && Number(note.campaignId) === id ? note : null;
}

export function persistFormalCompletionNote(
  scopedKey: string,
  note: StoredFormalCompletionNote
): void {
  const id = Math.floor(Number(note.campaignId) || 0);
  if (id <= 0) return;
  const all = readFormalCompletionNotesByCampaign(scopedKey);
  all[String(id)] = note;
  writeJson(scopedKey, all);
}

export function clearFormalCompletionNote(scopedKey: string, campaignId: number): void {
  const id = Math.floor(Number(campaignId) || 0);
  if (id <= 0) return;
  const all = readFormalCompletionNotesByCampaign(scopedKey);
  delete all[String(id)];
  writeJson(scopedKey, all);
}

export function applyStoredCompletionNoteToUi(
  note: StoredFormalCompletionNote,
  apply: {
    setCompletionNote: (n: StoredFormalCompletionNote) => void;
    setAttempted: (n: number) => void;
    setSent: (n: number) => void;
    setFailed: (n: number) => void;
    setRemain: (n: number) => void;
    setProgress: (n: number) => void;
    setRemainSec: (n: number) => void;
  }
): void {
  const sent = Math.max(0, Math.floor(Number(note.sent) || 0));
  const failed = Math.max(0, Math.floor(Number(note.failed) || 0));
  const planned = Math.max(0, Math.floor(Number(note.planned) || 0));
  let attempted = Math.max(0, Math.floor(Number(note.attempted) || 0));
  attempted = Math.max(attempted, sent + failed);
  if (planned > 0) attempted = Math.max(attempted, planned);
  const attemptedCap = attempted;
  const sentOut = Math.min(sent, attemptedCap);
  const failedOut = Math.min(failed, Math.max(0, attemptedCap - sentOut));
  const normalized = { ...note, attempted: attemptedCap, sent: sentOut, failed: failedOut };
  apply.setCompletionNote(normalized);
  apply.setAttempted(attemptedCap);
  apply.setSent(sentOut);
  apply.setFailed(failedOut);
  apply.setRemain(0);
  apply.setProgress(100);
  apply.setRemainSec(0);
}
