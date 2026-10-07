export const TIKTOK_LS_ACCOUNTS = "bss_tiktok_accounts_v1";
export const TIKTOK_LS_LIBRARY = "bss_tiktok_library_v1";
export const TIKTOK_LS_QUEUE = "bss_tiktok_queue_v1";
export const TIKTOK_LS_LIBRARY_LOGGED = "bss_tiktok_recent_logged_ids";

export function readTikTokJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeTikTokJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
