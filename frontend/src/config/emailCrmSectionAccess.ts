/**
 * 已登录租户默认隐藏侧栏「CRM 管理」「邮件与营销」并拦截直链；仅白名单邮箱可见。
 */
export const EMAIL_CRM_SECTION_HIDDEN_FOR_TENANTS = true;

export const EMAIL_CRM_SECTION_ALLOWED_EMAILS: readonly string[] = ["2415022172@qq.com"];

const HIDDEN_SECTION_TITLES = new Set(["CRM 管理", "邮件与营销", "邮件营销"]);

export function isEmailCrmSectionHiddenForTenants(): boolean {
  return EMAIL_CRM_SECTION_HIDDEN_FOR_TENANTS && EMAIL_CRM_SECTION_ALLOWED_EMAILS.length > 0;
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

export function canAccessEmailCrmSections(email: string | null | undefined): boolean {
  if (!isEmailCrmSectionHiddenForTenants()) return true;
  const key = normalizeEmailKey(email);
  if (!key) return false;
  return EMAIL_CRM_SECTION_ALLOWED_EMAILS.some((a) => normalizeEmailKey(a) === key);
}

export function filterEmailCrmNavSections<T extends { title: string }>(
  sections: T[],
  email: string | null | undefined
): T[] {
  if (canAccessEmailCrmSections(email)) return sections;
  return sections.filter((s) => !HIDDEN_SECTION_TITLES.has(s.title));
}
