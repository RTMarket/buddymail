export const LINKEDIN_LS_ACCOUNTS = "bss_linkedin_accounts_v1";
export const LINKEDIN_LS_LIBRARY = "bss_linkedin_library_v1";
export const LINKEDIN_LS_QUEUE = "bss_linkedin_queue_v1";

export function readLinkedInJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLinkedInJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function linkedinPublisherLocalStorageBytes(): number {
  try {
    return [LINKEDIN_LS_ACCOUNTS, LINKEDIN_LS_LIBRARY, LINKEDIN_LS_QUEUE].reduce((sum, key) => {
      const raw = window.localStorage.getItem(key) ?? "";
      return sum + new Blob([raw]).size;
    }, 0);
  } catch {
    return 0;
  }
}

export function formatLinkedInStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
