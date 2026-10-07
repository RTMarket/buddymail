/**
 * 发送目标「行业标签」人数：标签名与 CRM `email_contacts.industry` 对齐（含常见别名）
 */

export type IndustryCountMatchKind = "exact" | "alias" | "none";

export type ResolvedIndustryCount = {
  industry: string;
  /** 可发受众去重邮箱数（与正式发送筛选一致） */
  count: number;
  /** CRM 库内该行业去重邮箱总数（不含退订/投诉过滤，用于下拉目录） */
  crmCount?: number;
  matchedIndustry: string | null;
  matchKind: IndustryCountMatchKind;
  /** 标签显示 0 时，库内名称相近的行业（便于核对是否写错字） */
  similarInDb: string[];
};

/** 预设标签 → CRM 中曾出现的异名（双向会在 resolve 时尝试） */
export const EMAIL_INDUSTRY_TAG_ALIASES: Record<string, string[]> = {
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

export function normalizeIndustryLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function collectAliasKeys(tag: string): string[] {
  const trimmed = String(tag ?? "").trim();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  const direct = EMAIL_INDUSTRY_TAG_ALIASES[trimmed] ?? [];
  for (const a of direct) keys.add(a);
  for (const [canonical, aliases] of Object.entries(EMAIL_INDUSTRY_TAG_ALIASES)) {
    if (aliases.includes(trimmed)) {
      keys.add(canonical);
      for (const a of aliases) keys.add(a);
    }
  }
  return [...keys];
}

function similarityScore(a: string, b: string): number {
  const na = normalizeIndustryLabel(a);
  const nb = normalizeIndustryLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const minLen = Math.min(na.length, nb.length);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  let same = 0;
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) same++;
  }
  return same / maxLen;
}

export function findSimilarIndustriesInDb(
  tag: string,
  countMap: Map<string, number>,
  limit = 2
): string[] {
  const n = normalizeIndustryLabel(tag);
  if (!n) return [];
  const scored: Array<{ name: string; score: number; count: number }> = [];
  for (const [name, count] of countMap.entries()) {
    if (normalizeIndustryLabel(name) === n) continue;
    const score = similarityScore(tag, name);
    if (score >= 0.55 && count > 0) scored.push({ name, score, count });
  }
  scored.sort((a, b) => b.score - a.score || b.count - a.count);
  return scored.slice(0, limit).map((x) => x.name);
}

export function resolveIndustryCountForTag(
  tag: string,
  countMap: Map<string, number>
): ResolvedIndustryCount {
  const industry = String(tag ?? "").trim();
  if (!industry) {
    return { industry: "", count: 0, matchedIndustry: null, matchKind: "none", similarInDb: [] };
  }

  if (countMap.has(industry)) {
    const exact = Math.max(0, Number(countMap.get(industry) ?? 0));
    if (exact > 0) {
      return {
        industry,
        count: exact,
        matchedIndustry: industry,
        matchKind: "exact",
        similarInDb: []
      };
    }
  }

  for (const key of collectAliasKeys(industry)) {
    if (!countMap.has(key)) continue;
    const n = Math.max(0, Number(countMap.get(key) ?? 0));
    if (n > 0) {
      return {
        industry,
        count: n,
        matchedIndustry: key,
        matchKind: "alias",
        similarInDb: []
      };
    }
  }

  const similarInDb = findSimilarIndustriesInDb(industry, countMap);
  return {
    industry,
    count: 0,
    matchedIndustry: null,
    matchKind: "none",
    similarInDb
  };
}

export function buildIndustryCountItems(
  requestedTags: string[],
  countMap: Map<string, number>
): ResolvedIndustryCount[] {
  return requestedTags.map((tag) => resolveIndustryCountForTag(tag, countMap));
}

export function attachCrmCountsToIndustryItems(
  items: ResolvedIndustryCount[],
  catalogMap: Map<string, number>
): ResolvedIndustryCount[] {
  return items.map((item) => {
    const key = String(item.matchedIndustry ?? item.industry ?? "").trim();
    const crmCount = key ? Number(catalogMap.get(key) ?? catalogMap.get(item.industry) ?? 0) : 0;
    return { ...item, crmCount };
  });
}

/** 合并 CRM 目录与可发受众计数，供 industry-counts 全量列表 */
export function buildIndustryCatalogListItems(
  catalogMap: Map<string, number>,
  sendableMap: Map<string, number>
): ResolvedIndustryCount[] {
  const keys = new Set<string>([...catalogMap.keys(), ...sendableMap.keys()]);
  return [...keys]
    .map((industry) => ({
      industry,
      count: Math.max(0, Number(sendableMap.get(industry) ?? 0)),
      crmCount: Math.max(0, Number(catalogMap.get(industry) ?? 0)),
      matchedIndustry: industry,
      matchKind: "exact" as const,
      similarInDb: [] as string[]
    }))
    .sort(
      (a, b) =>
        (b.crmCount ?? 0) - (a.crmCount ?? 0) ||
        b.count - a.count ||
        a.industry.localeCompare(b.industry, "zh-CN")
    );
}
