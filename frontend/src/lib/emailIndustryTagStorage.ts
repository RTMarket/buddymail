/** 主站各页（邮件营销 / CRM 客户新增 / CRM 数据库）共用行业标签 localStorage 键 */
export const CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY = "bss_email_custom_import_industry_tags_v1";
export const HIDDEN_INDUSTRY_TAGS_STORAGE_KEY = "bss_email_hidden_industry_tags_v1";

/** 同一登录邮箱下各页共享；不含 single/multi 后缀，避免标签串页或不互通 */
export function emailIndustryTagScopedStorageKey(baseKey: string, userEmail: string | null | undefined): string {
  const email = String(userEmail ?? "")
    .trim()
    .toLowerCase();
  return email ? `${baseKey}__${email}` : baseKey;
}

/** 旧版邮件营销页曾用 __single__ / __multi__ 后缀，读取时合并进当前键 */
export function industryTagLegacyStorageKeys(baseKey: string, userEmail: string | null | undefined): string[] {
  const email = String(userEmail ?? "")
    .trim()
    .toLowerCase();
  if (!email) return [];
  return [`${baseKey}__single__${email}`, `${baseKey}__multi__${email}`];
}

export function readScopedStringListFromStorage(primaryKey: string, legacyKeys: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushAll = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    for (const x of raw) {
      const s = String(x ?? "").trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  };
  for (const key of [primaryKey, ...legacyKeys]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      pushAll(JSON.parse(raw));
    } catch {
      // ignore
    }
  }
  return out;
}

export function writeScopedStringListToStorage(key: string, values: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // ignore
  }
}

/** 各页行业标签 localStorage 变更（创建 / 从列表隐藏） */
export const BSS_INDUSTRY_TAGS_CHANGED = "bss-industry-tags-changed";

export function notifyIndustryTagsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BSS_INDUSTRY_TAGS_CHANGED));
}

export function subscribeIndustryTagsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(BSS_INDUSTRY_TAGS_CHANGED, handler);
  return () => window.removeEventListener(BSS_INDUSTRY_TAGS_CHANGED, handler);
}

export function loadScopedIndustryTagLists(userEmail: string | null | undefined): {
  custom: string[];
  hidden: string[];
} {
  const legacyCustom = industryTagLegacyStorageKeys(CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const customKey = emailIndustryTagScopedStorageKey(CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const hiddenKey = emailIndustryTagScopedStorageKey(HIDDEN_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  return {
    custom: readScopedStringListFromStorage(customKey, legacyCustom),
    hidden: readScopedStringListFromStorage(hiddenKey, [])
  };
}

/** 新建或再次选用：置顶 custom 列表；若曾隐藏则恢复显示 */
export function prependCustomIndustryTag(userEmail: string | null | undefined, name: string): string[] {
  const t = String(name ?? "").trim();
  if (!t) return loadScopedIndustryTagLists(userEmail).custom;
  const customKey = emailIndustryTagScopedStorageKey(CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const hiddenKey = emailIndustryTagScopedStorageKey(HIDDEN_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const { custom, hidden } = loadScopedIndustryTagLists(userEmail);
  const nextCustom = custom.includes(t) ? [t, ...custom.filter((x) => x !== t)] : [t, ...custom];
  const nextHidden = hidden.filter((x) => x !== t);
  writeScopedStringListToStorage(customKey, nextCustom);
  if (nextHidden.length !== hidden.length) {
    writeScopedStringListToStorage(hiddenKey, nextHidden);
  }
  notifyIndustryTagsChanged();
  return nextCustom;
}

/** 从各页行业下拉隐藏（内部用；对外移除请走 removeIndustryTagAndCrmContacts） */
export function hideIndustryTagFromLists(userEmail: string | null | undefined, tag: string): void {
  const t = String(tag ?? "").trim();
  if (!t) return;
  const customKey = emailIndustryTagScopedStorageKey(CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const hiddenKey = emailIndustryTagScopedStorageKey(HIDDEN_INDUSTRY_TAGS_STORAGE_KEY, userEmail);
  const { custom, hidden } = loadScopedIndustryTagLists(userEmail);
  const nextCustom = custom.filter((x) => x !== t);
  const nextHidden = hidden.includes(t) ? hidden : [...hidden, t];
  writeScopedStringListToStorage(customKey, nextCustom);
  writeScopedStringListToStorage(hiddenKey, nextHidden);
  notifyIndustryTagsChanged();
}
