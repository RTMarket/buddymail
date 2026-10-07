import type { IndustryCountRow } from "./emailIndustryCounts";

export type CrmContactsListCachePayload = {
  items: unknown[];
  total: number;
  pageSize: number;
};

type CrmContactsListCacheEntry = CrmContactsListCachePayload & { savedAt: number };

type IndustryCountsCacheEntry = {
  rows: IndustryCountRow[];
  savedAt: number;
};

const listCacheByKey = new Map<string, CrmContactsListCacheEntry>();
const industryCountsCacheByUser = new Map<string, IndustryCountsCacheEntry>();

function scopedUserKey(userEmail: string | null | undefined): string {
  return String(userEmail ?? "")
    .trim()
    .toLowerCase();
}

export function buildCrmContactsListCacheKey(
  userEmail: string | null | undefined,
  q: string,
  industry: string,
  page: number,
  pageSize: number,
  source?: string
): string {
  return `${scopedUserKey(userEmail)}\0${q.trim()}\0${industry.trim()}\0${page}\0${pageSize}\0${(source ?? "").trim()}`;
}

export function readCrmContactsListCache(key: string): CrmContactsListCachePayload | null {
  const hit = listCacheByKey.get(key);
  if (!hit) return null;
  return { items: hit.items, total: hit.total, pageSize: hit.pageSize };
}

export function writeCrmContactsListCache(key: string, payload: CrmContactsListCachePayload): void {
  listCacheByKey.set(key, { ...payload, savedAt: Date.now() });
}

export function clearCrmContactsListCacheForUser(userEmail: string | null | undefined): void {
  const userKey = scopedUserKey(userEmail);
  if (!userKey) {
    listCacheByKey.clear();
    industryCountsCacheByUser.clear();
    return;
  }
  const prefix = `${userKey}\0`;
  for (const key of listCacheByKey.keys()) {
    if (key.startsWith(prefix)) listCacheByKey.delete(key);
  }
  industryCountsCacheByUser.delete(userKey);
}

export function readCrmContactsIndustryCountsCache(userEmail: string | null | undefined): IndustryCountRow[] | null {
  const hit = industryCountsCacheByUser.get(scopedUserKey(userEmail));
  return hit ? hit.rows : null;
}

export function writeCrmContactsIndustryCountsCache(
  userEmail: string | null | undefined,
  rows: IndustryCountRow[]
): void {
  industryCountsCacheByUser.set(scopedUserKey(userEmail), { rows, savedAt: Date.now() });
}
