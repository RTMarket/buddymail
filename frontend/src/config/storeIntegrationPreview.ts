/**
 * 开发期：仅白名单邮箱可见侧栏「独立站电商推送」并访问对应路由；其他登录用户不展示、直链回总览。
 */
export const STORE_INTEGRATION_DEV_PREVIEW_ONLY = true;

export const STORE_INTEGRATION_PREVIEW_EMAILS: readonly string[] = ["2415022172@qq.com"];

export function isStoreIntegrationPreviewEnforced(): boolean {
  return STORE_INTEGRATION_DEV_PREVIEW_ONLY && STORE_INTEGRATION_PREVIEW_EMAILS.length > 0;
}

function normalizeEmailKey(e: string | null | undefined): string {
  try {
    return (e ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/＠/g, "@");
  } catch {
    return (e ?? "").trim().toLowerCase();
  }
}

export function canAccessStoreIntegrationFeatures(email: string | null | undefined): boolean {
  if (!isStoreIntegrationPreviewEnforced()) return true;
  const key = normalizeEmailKey(email);
  if (!key) return false;
  return STORE_INTEGRATION_PREVIEW_EMAILS.some((a) => normalizeEmailKey(a) === key);
}

const STORE_INTEGRATION_ROOT = "/email/store-integration";

/** 侧栏过滤：非白名单用户隐藏「独立站电商推送」整组 */
export function filterStoreIntegrationNavItems<T extends { to: string }>(items: T[], email: string | null | undefined): T[] {
  if (canAccessStoreIntegrationFeatures(email)) return items;
  return items.filter((item) => {
    if (item.to === STORE_INTEGRATION_ROOT) return false;
    if (item.to.startsWith(`${STORE_INTEGRATION_ROOT}/`)) return false;
    return true;
  });
}
