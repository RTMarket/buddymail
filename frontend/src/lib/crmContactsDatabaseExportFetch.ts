import { apiJson } from "./api";
import type { CrmDatabaseCsvRow } from "./crmContactsDatabaseCsv";

/** 与 CRM 数据库列表分页一致 */
export const CRM_DATABASE_EXPORT_PAGE_SIZE = 50;
/** 单次按页导出上限 */
export const CRM_DATABASE_EXPORT_MAX_ROWS = 10_000;

export const CRM_DATABASE_EXPORT_MAX_PAGES = CRM_DATABASE_EXPORT_MAX_ROWS / CRM_DATABASE_EXPORT_PAGE_SIZE;

export type CrmDatabasePageExportResult = {
  items: CrmDatabaseCsvRow[];
  fromPage: number;
  toPage: number;
  exported: number;
  capped: boolean;
  total: number;
};

export function resolveCrmDatabaseExportPageRange(
  fromPageRaw: number,
  toPageRaw: number,
  totalPages: number
): { fromPage: number; toPage: number; error?: string } {
  const tp = Math.max(1, totalPages);
  let fromPage = Math.max(1, Math.floor(fromPageRaw));
  let toPage = Math.max(1, Math.floor(toPageRaw));
  if (toPage < fromPage) {
    const t = fromPage;
    fromPage = toPage;
    toPage = t;
  }
  fromPage = Math.min(fromPage, tp);
  toPage = Math.min(toPage, tp);
  if (toPage < fromPage) toPage = fromPage;
  const span = toPage - fromPage + 1;
  if (span > CRM_DATABASE_EXPORT_MAX_PAGES) {
    return {
      fromPage,
      toPage,
      error: `页码跨度最多 ${CRM_DATABASE_EXPORT_MAX_PAGES} 页（约 ${CRM_DATABASE_EXPORT_MAX_ROWS.toLocaleString()} 条）`
    };
  }
  return { fromPage, toPage };
}

export function estimateCrmDatabaseExportRowCount(fromPage: number, toPage: number, total: number): number {
  const spanPages = Math.max(0, toPage - fromPage + 1);
  const byPages = spanPages * CRM_DATABASE_EXPORT_PAGE_SIZE;
  const remainingFromStart = Math.max(0, total - (fromPage - 1) * CRM_DATABASE_EXPORT_PAGE_SIZE);
  return Math.min(CRM_DATABASE_EXPORT_MAX_ROWS, byPages, remainingFromStart);
}

export async function fetchCrmDatabaseContactsForPageExport(opts: {
  fromPage: number;
  toPage: number;
  q: string;
  industry: string;
  source?: string;
}): Promise<CrmDatabasePageExportResult> {
  const params = new URLSearchParams();
  params.set("fromPage", String(opts.fromPage));
  params.set("toPage", String(opts.toPage));
  if (opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.industry.trim()) params.set("industry", opts.industry.trim());
  if (opts.source === "deep_search" || opts.source === "bulk_import") params.set("source", opts.source);
  const res = await apiJson<{
    ok: boolean;
    items?: CrmDatabaseCsvRow[];
    fromPage?: number;
    toPage?: number;
    exported?: number;
    capped?: boolean;
    total?: number;
    message?: string;
  }>(`/api/email/contacts/export-range?${params.toString()}`);
  if (!res.ok) {
    throw new Error(res.message ?? "导出数据拉取失败");
  }
  return {
    items: Array.isArray(res.items) ? res.items : [],
    fromPage: typeof res.fromPage === "number" ? res.fromPage : opts.fromPage,
    toPage: typeof res.toPage === "number" ? res.toPage : opts.toPage,
    exported: typeof res.exported === "number" ? res.exported : 0,
    capped: res.capped === true,
    total: typeof res.total === "number" ? res.total : 0
  };
}
