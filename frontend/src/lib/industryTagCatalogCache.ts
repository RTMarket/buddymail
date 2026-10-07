import type { IndustryCountRow } from "./emailIndustryCounts";

const STORAGE_KEY = "bss_industry_catalog_rows_v1";
const TTL_MS = 10 * 60 * 1000;

type CachePayload = {
  scope: string;
  rows: IndustryCountRow[];
  savedAt: number;
};

function scopedKey(userScope: string | null | undefined): string {
  return String(userScope ?? "")
    .trim()
    .toLowerCase();
}

export function readIndustryCatalogCache(userScope: string | null | undefined): IndustryCountRow[] | null {
  const scope = scopedKey(userScope);
  if (!scope) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed.scope !== scope) return null;
    if (!Array.isArray(parsed.rows)) return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

export function writeIndustryCatalogCache(userScope: string | null | undefined, rows: IndustryCountRow[]): void {
  const scope = scopedKey(userScope);
  if (!scope || !Array.isArray(rows)) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ scope, rows, savedAt: Date.now() } satisfies CachePayload)
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearIndustryCatalogCache(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
