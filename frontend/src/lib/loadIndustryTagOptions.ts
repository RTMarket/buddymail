import { apiJson } from "./api";
import {
  crmRowsToCountMap,
  mergeIndustryTagOptions,
  resolveIndustryCountClient,
  type IndustryCountRow
} from "./emailIndustryCounts";
import { readIndustryCatalogCache, writeIndustryCatalogCache } from "./industryTagCatalogCache";

export type IndustryTagOptionsLoadResult = {
  crmRows: IndustryCountRow[];
  options: string[];
  resolvedMap: Record<string, IndustryCountRow>;
  ready: boolean;
  error: string | null;
};

export type IndustryTagOptionsLoadOpts = {
  /** 登录邮箱或租户作用域，用于 session 缓存 */
  userScope?: string | null;
  /** lite 目录返回后立刻回调，先展示 CRM 行业与人数 */
  onPartial?: (result: IndustryTagOptionsLoadResult) => void;
};

function rowsToResolvedMap(rows: IndustryCountRow[]): Record<string, IndustryCountRow> {
  const map: Record<string, IndustryCountRow> = {};
  for (const item of rows) {
    const key = String(item.industry ?? "").trim();
    if (key) map[key] = item;
  }
  return map;
}

/** GET 全量目录已有 count/crmCount */
function buildResolvedFromCatalog(
  options: string[],
  crmRows: IndustryCountRow[]
): Record<string, IndustryCountRow> {
  const countMap = crmRowsToCountMap(crmRows);
  const catalogByIndustry = rowsToResolvedMap(crmRows);
  const out: Record<string, IndustryCountRow> = {};
  for (const tag of options) {
    const direct = catalogByIndustry[tag];
    if (direct) {
      out[tag] = direct;
      continue;
    }
    const resolved = resolveIndustryCountClient(tag, countMap);
    const crmCount = crmRows.reduce((max, row) => {
      const name = String(row.industry ?? "").trim();
      if (!name) return max;
      if (name === tag || row.matchedIndustry === tag) {
        return Math.max(max, Math.max(0, Number(row.crmCount ?? row.count ?? 0)));
      }
      return max;
    }, 0);
    out[tag] = { ...resolved, crmCount: crmCount > 0 ? crmCount : resolved.crmCount };
  }
  return out;
}

export function buildIndustryTagOptionsLoadResult(
  crmRows: IndustryCountRow[],
  customTags: string[],
  hiddenTags: string[],
  ready = true,
  error: string | null = null
): IndustryTagOptionsLoadResult {
  const options = mergeIndustryTagOptions(customTags, crmRows, hiddenTags);
  return {
    crmRows,
    options,
    resolvedMap: buildResolvedFromCatalog(options, crmRows),
    ready,
    error
  };
}

/** 从服务器拉 CRM 行业目录 + 可发人数（先 lite 快显，再全量；无冗余 POST） */
export async function loadIndustryTagOptionsFromServer(
  customTags: string[],
  hiddenTags: string[],
  opts?: IndustryTagOptionsLoadOpts
): Promise<IndustryTagOptionsLoadResult> {
  const userScope = opts?.userScope ?? null;
  const cached = readIndustryCatalogCache(userScope);
  if (cached?.length) {
    const fromCache = buildIndustryTagOptionsLoadResult(cached, customTags, hiddenTags, true, null);
    opts?.onPartial?.(fromCache);
  }

  let crmRows: IndustryCountRow[] = [];
  try {
    const lite = await apiJson<{ ok: boolean; items: IndustryCountRow[] }>(
      "/api/email/contacts/industry-counts?lite=1"
    );
    crmRows = Array.isArray(lite.items) ? lite.items : [];
    const partial = buildIndustryTagOptionsLoadResult(crmRows, customTags, hiddenTags, true, null);
    writeIndustryCatalogCache(userScope, crmRows);
    opts?.onPartial?.(partial);
  } catch (e: unknown) {
    if (!cached?.length) {
      return {
        crmRows: [],
        options: mergeIndustryTagOptions(customTags, [], hiddenTags),
        resolvedMap: {},
        ready: false,
        error: String((e as Error)?.message ?? e)
      };
    }
    return buildIndustryTagOptionsLoadResult(cached, customTags, hiddenTags, true, String((e as Error)?.message ?? e));
  }

  try {
    const full = await apiJson<{ ok: boolean; items: IndustryCountRow[] }>("/api/email/contacts/industry-counts");
    crmRows = Array.isArray(full.items) ? full.items : crmRows;
    writeIndustryCatalogCache(userScope, crmRows);
  } catch (e: unknown) {
    return buildIndustryTagOptionsLoadResult(
      crmRows,
      customTags,
      hiddenTags,
      true,
      String((e as Error)?.message ?? e)
    );
  }

  return buildIndustryTagOptionsLoadResult(crmRows, customTags, hiddenTags, true, null);
}
