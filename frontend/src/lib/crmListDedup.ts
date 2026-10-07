/** CRM 联系人列表去重（与 Leads 搜索「去重检查」规则一致，字段映射为联系人表） */

export type CrmDedupRuleFlags = {
  dupCompany: boolean;
  dupPerson: boolean;
  dupEmail: boolean;
  wrongIndustry: boolean;
  /** 勾选并应用后，由页面基于当前列表统计有效/无效/风险邮箱（不参与行过滤） */
  emailValidityVerify: boolean;
};

export const CRM_DEDUP_INITIAL: CrmDedupRuleFlags = {
  dupCompany: false,
  dupPerson: false,
  dupEmail: false,
  wrongIndustry: false,
  emailValidityVerify: false
};

export type CrmDedupRow = {
  email: string;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  industry: string | null;
  /** 职位，与 Leads 的 title 对应，参与行业关键词匹配 */
  job_title?: string | null;
};

function normCompanyKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function normEmailKey(s: string | null | undefined): string | null {
  const t = (s ?? "").trim().toLowerCase();
  return t || null;
}

function normPersonKey(s: string | null | undefined): string | null {
  const t = (s ?? "").trim().toLowerCase();
  return t || null;
}

function contactDisplayName(r: CrmDedupRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
}

export function tokenizeIndustryNeedles(keywords: string, industryLabel: string): string[] {
  const raw = `${keywords} ${industryLabel}`.trim();
  if (!raw) return [];
  const parts = raw
    .split(/[\s,，、;；]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const ind = industryLabel.trim();
  if (ind.length >= 2 && !parts.some((p) => p.toLowerCase() === ind.toLowerCase())) {
    parts.push(ind);
  }
  return [...new Set(parts.map((p) => p.toLowerCase()))];
}

function rowMatchesIndustry(row: CrmDedupRow, needlesLower: string[]): boolean {
  if (needlesLower.length === 0) return true;
  const blob = `${row.company ?? ""} ${row.industry ?? ""} ${contactDisplayName(row)} ${row.job_title ?? ""}`.toLowerCase();
  return needlesLower.some((n) => blob.includes(n));
}

function dedupeByKeyKeepFirst<T extends CrmDedupRow>(rows: T[], keyFn: (r: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) {
      out.push(r);
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** 顺序与 Leads「去重检查」一致：重复邮箱 → 重复公司 → 重复人名 → 行业关键词（保留匹配行） */
export function applyCrmListDedup<T extends CrmDedupRow>(
  rows: T[],
  rules: CrmDedupRuleFlags,
  ctx: { keywords: string; industryHint: string }
): T[] {
  let out = [...rows] as T[];
  if (rules.dupEmail) {
    out = dedupeByKeyKeepFirst(out, (r) => normEmailKey(r.email));
  }
  if (rules.dupCompany) {
    out = dedupeByKeyKeepFirst(out, (r) => {
      const k = normCompanyKey(r.company ?? "");
      return k ? k : null;
    });
  }
  if (rules.dupPerson) {
    out = dedupeByKeyKeepFirst(out, (r) => normPersonKey(contactDisplayName(r) || null));
  }
  if (rules.wrongIndustry) {
    const needles = tokenizeIndustryNeedles(ctx.keywords, ctx.industryHint);
    if (needles.length === 0) return out;
    out = out.filter((r) => rowMatchesIndustry(r, needles));
  }
  return out;
}
