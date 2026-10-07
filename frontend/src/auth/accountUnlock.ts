/** 主站全功能白名单：套餐门禁、云端月付流程页、Leads 等对该邮箱全部开放 */
export const BSS_FULL_ACCESS_EMAILS: readonly string[] = ["2415022172@qq.com"];

export function normalizeBssAccountEmail(e: string | null | undefined): string {
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

/** 指定账号始终视为已开通全部产品模块（用于联调/指定客户） */
export function isBssFullAccessDemoEmail(email: string | null | undefined): boolean {
  const key = normalizeBssAccountEmail(email);
  if (!key) return false;
  return BSS_FULL_ACCESS_EMAILS.some((a) => normalizeBssAccountEmail(a) === key);
}
