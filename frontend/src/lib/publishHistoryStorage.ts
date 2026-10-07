import type { SocialPlatformId } from "../ui/components/social/SocialPlatformLogo";
import { ALL_PLATFORM_IDS } from "./socialAccountsMatrixStorage";

export const PUBLISH_HISTORY_STORAGE_KEY = "bss_publish_history_v1";

export const PUBLISH_HISTORY_CHANGED_EVENT = "bss-publish-history-changed";

export type PublishRecordStatus = "running" | "scheduled" | "success" | "failed";

export type PublishRecord = {
  id: string;
  createdAt: string;
  platformId: SocialPlatformId;
  platformName: string;
  accountKey: string;
  accountNickname: string;
  mode: "now" | "schedule";
  scheduleSummary: string | null;
  status: PublishRecordStatus;
  summary: string;
  finishedAt?: string;
};

function bump() {
  window.dispatchEvent(new Event(PUBLISH_HISTORY_CHANGED_EVENT));
}

function isRecord(x: unknown): x is PublishRecord {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const pid = o.platformId;
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "string" &&
    typeof pid === "string" &&
    ALL_PLATFORM_IDS.includes(pid as SocialPlatformId) &&
    typeof o.platformName === "string" &&
    typeof o.accountKey === "string" &&
    typeof o.accountNickname === "string" &&
    (o.mode === "now" || o.mode === "schedule") &&
    (o.scheduleSummary === null || typeof o.scheduleSummary === "string") &&
    (o.status === "running" || o.status === "scheduled" || o.status === "success" || o.status === "failed") &&
    typeof o.summary === "string"
  );
}

export function loadPublishRecords(): PublishRecord[] {
  try {
    const raw = localStorage.getItem(PUBLISH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function savePublishRecords(list: PublishRecord[]) {
  try {
    localStorage.setItem(PUBLISH_HISTORY_STORAGE_KEY, JSON.stringify(list));
    bump();
  } catch {
    /* quota */
  }
}

export function updatePublishRecord(id: string, patch: Partial<PublishRecord>) {
  const list = loadPublishRecords();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx]!, ...patch };
  savePublishRecords(list);
}

/** 进行中优先：running → scheduled → 其余按创建时间倒序 */
export function sortPublishRecordsForDisplay(a: PublishRecord, b: PublishRecord): number {
  const rank = (s: PublishRecordStatus) => (s === "running" ? 0 : s === "scheduled" ? 1 : 2);
  const d = rank(a.status) - rank(b.status);
  if (d !== 0) return d;
  return b.createdAt.localeCompare(a.createdAt);
}

export type PublishJobInput = {
  platformId: SocialPlatformId;
  platformName: string;
  accountKey: string;
  accountNickname: string;
  mode: "now" | "schedule";
  scheduleSummary: string | null;
  summary: string;
};

/**
 * 写入发布记录并做前端演示态流转：立即 → 先「发布中」再「已完成」；定时 → 先「待定时」再「已完成」。
 */
export function appendPublishJobs(jobs: PublishJobInput[]) {
  if (jobs.length === 0) return;
  const list = loadPublishRecords();
  const createdAt = new Date().toISOString();
  const newRows: PublishRecord[] = jobs.map((j, i) => ({
    id: `pub-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    platformId: j.platformId,
    platformName: j.platformName,
    accountKey: j.accountKey,
    accountNickname: j.accountNickname,
    mode: j.mode,
    scheduleSummary: j.scheduleSummary,
    summary: j.summary,
    status: j.mode === "schedule" ? "scheduled" : "running",
    finishedAt: undefined
  }));
  const next = [...newRows, ...list].slice(0, 500);
  savePublishRecords(next);

  newRows.forEach((row, i) => {
    const delay = row.mode === "schedule" ? 2200 + i * 400 : 1400 + i * 500;
    window.setTimeout(() => {
      updatePublishRecord(row.id, {
        status: "success",
        finishedAt: new Date().toISOString()
      });
    }, delay);
  });
}
