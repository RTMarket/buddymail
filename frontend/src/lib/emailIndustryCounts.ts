/**
 * 与 backend emailIndustryTagResolve 保持一致的客户端解析（仅展示用）
 */

export type IndustryCountRow = {
  industry: string;
  /** 可发受众去重邮箱数 */
  count: number;
  /** CRM 库内该行业联系人总数（下拉目录口径） */
  crmCount?: number;
  matchedIndustry?: string | null;
  matchKind?: "exact" | "alias" | "none";
  similarInDb?: string[];
};

const EMAIL_INDUSTRY_TAG_ALIASES: Record<string, string[]> = {
  大型机械及设备: ["大型机械设备", "大型机械", "大型机械和设备"],
  电子电气产品: ["电子电气", "电子电器产品", "电子及电气产品"],
  化工产品制品: ["化工产品", "化工制品"],
  体育及旅游休闲产品: ["体育及旅游休闲", "体育旅游休闲产品"],
  医疗器械及保健品: ["医疗器械", "医疗保健品"],
  箱包及皮具制品: ["箱包及皮具", "箱包皮具制品"],
  食品及保健品: ["食品保健品", "食品与保健品"],
  小型机械产品: ["小型机械", "小型机械及设备"],
  电子消费品: ["消费电子", "消费电子产品"]
};

function normalizeIndustryLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function collectAliasKeys(tag: string): string[] {
  const trimmed = String(tag ?? "").trim();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  for (const a of EMAIL_INDUSTRY_TAG_ALIASES[trimmed] ?? []) keys.add(a);
  for (const [canonical, aliases] of Object.entries(EMAIL_INDUSTRY_TAG_ALIASES)) {
    if (aliases.includes(trimmed)) {
      keys.add(canonical);
      for (const a of aliases) keys.add(a);
    }
  }
  return [...keys];
}

export function crmRowsToCountMap(rows: IndustryCountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.industry ?? "").trim();
    if (!key) continue;
    map.set(key, Math.max(0, Number(row.count ?? 0)));
  }
  return map;
}

export function resolveIndustryCountClient(tag: string, countMap: Map<string, number>): IndustryCountRow {
  const industry = String(tag ?? "").trim();
  if (!industry) {
    return { industry: "", count: 0, matchKind: "none", matchedIndustry: null, similarInDb: [] };
  }
  const exact = countMap.get(industry);
  if (exact != null && exact > 0) {
    return { industry, count: exact, matchKind: "exact", matchedIndustry: industry, similarInDb: [] };
  }
  for (const key of collectAliasKeys(industry)) {
    const n = countMap.get(key);
    if (n != null && n > 0) {
      return { industry, count: n, matchKind: "alias", matchedIndustry: key, similarInDb: [] };
    }
  }
  return { industry, count: countMap.get(industry) ?? 0, matchKind: "none", matchedIndustry: null, similarInDb: [] };
}

/** 合并本页自建行业标签与 CRM 库内行业（按人数降序附加）；hiddenTags 为本机已从列表隐藏的名称 */
export function mergeIndustryTagOptions(
  customTags: string[],
  crmRows: IndustryCountRow[],
  hiddenTags: string[] = []
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const hiddenSet = new Set(hiddenTags.map((t) => String(t ?? "").trim()).filter(Boolean));
  const push = (t: string) => {
    const s = String(t ?? "").trim();
    if (!s || seen.has(s) || hiddenSet.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  for (const t of customTags) push(t);
  const crmOnly = crmRows
    .filter((r) => {
      const name = String(r.industry ?? "").trim();
      if (!name || seen.has(name) || hiddenSet.has(name)) return false;
      const crmN = Math.max(0, Number(r.crmCount ?? r.count ?? 0));
      const sendableN = Math.max(0, Number(r.count ?? 0));
      return crmN > 0 || sendableN > 0;
    })
    .sort(
      (a, b) =>
        Math.max(0, Number(b.crmCount ?? b.count ?? 0)) - Math.max(0, Number(a.crmCount ?? a.count ?? 0)) ||
        Number(b.count ?? 0) - Number(a.count ?? 0) ||
        a.industry.localeCompare(b.industry, "zh-CN")
    );
  for (const r of crmOnly) push(r.industry);
  return out;
}

/**
 * 正式发送旁「人数」即时估算：单行业与下拉括号一致；多行业为各标签人数之和（去重前上界），
 * 待 preview-count 返回后会替换为去重并集精确值。
 */
export function estimateFormalAudienceQuick(
  selectedTags: string[],
  resolved: Record<string, IndustryCountRow>,
  countsReady: boolean
): number | null {
  if (selectedTags.length === 0 || !countsReady) return null;
  let sum = 0;
  for (const tag of selectedTags) {
    const key = String(tag ?? "").trim();
    if (!key) continue;
    sum += Math.max(0, Number(resolved[key]?.count ?? 0));
  }
  return sum;
}

export function formatIndustryTagWithCountDetail(
  tag: string,
  resolved: IndustryCountRow,
  countsReady: boolean
): string {
  if (!countsReady) return tag;
  const sendable = Math.max(0, Number(resolved.count ?? 0));
  const crmTotal = Math.max(0, Number(resolved.crmCount ?? sendable));
  let suffix = ` (可发 ${sendable}`;
  if (crmTotal > sendable) {
    suffix += ` · CRM ${crmTotal}`;
  }
  suffix += ")";
  if (resolved.matchKind === "alias" && resolved.matchedIndustry && resolved.matchedIndustry !== tag) {
    suffix += ` ·库内「${resolved.matchedIndustry}」`;
  } else if (sendable === 0 && crmTotal > 0) {
    suffix += " ·暂不可发（退订/投诉等）";
  } else if (sendable === 0 && resolved.similarInDb && resolved.similarInDb.length > 0) {
    suffix += ` ·库内近似：${resolved.similarInDb.join("、")}`;
  } else if (sendable === 0 && crmTotal === 0) {
    suffix += " ·CRM 无匹配";
  }
  return `${tag}${suffix}`;
}
