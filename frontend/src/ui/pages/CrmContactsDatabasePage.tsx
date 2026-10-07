import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SectionCard } from "../components/SectionCard";
import { apiJson, resolveApiUrl } from "../../lib/api";
import { useAuth, getCachedAuthUserEmail } from "../../auth/AuthContext";
import { subscribeEmailContactsChanged } from "../../lib/emailCrmContactsSync";
import {
  buildCrmContactsListCacheKey,
  clearCrmContactsListCacheForUser,
  readCrmContactsIndustryCountsCache,
  readCrmContactsListCache,
  writeCrmContactsIndustryCountsCache,
  writeCrmContactsListCache
} from "../../lib/crmContactsDatabaseListCache";
import {
  loadScopedIndustryTagLists,
  subscribeIndustryTagsChanged
} from "../../lib/emailIndustryTagStorage";
import { removeIndustryTagAndCrmContacts } from "../../lib/emailIndustryTagRemove";
import { bulkDeleteCrmDatabaseContacts } from "../../lib/crmContactsDatabaseBulkDelete";
import { downloadCrmDatabaseContactsCsv } from "../../lib/crmContactsDatabaseCsv";
import {
  CRM_DATABASE_EXPORT_MAX_ROWS,
  estimateCrmDatabaseExportRowCount,
  fetchCrmDatabaseContactsForPageExport,
  resolveCrmDatabaseExportPageRange
} from "../../lib/crmContactsDatabaseExportFetch";
import { mergeIndustryTagOptions, type IndustryCountRow } from "../../lib/emailIndustryCounts";
import { loadIndustryTagOptionsFromServer, type IndustryTagOptionsLoadResult } from "../../lib/loadIndustryTagOptions";
import { readIndustryCatalogCache } from "../../lib/industryTagCatalogCache";
import { IndustryTagListRemoveIconButton } from "../components/email/IndustryTagListRemoveIconButton";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { buildDbColumns, getCrmContactsDatabasePageStrings } from "../../i18n/crmContactsDatabasePageI18n";

/** 代理 502、未启动后端、file:// 等 */
function looksLikeBackendUnreachable(message: string): boolean {
  const s = message;
  return (
    s.includes("后端未响应") ||
    s.includes("Failed to fetch") ||
    s.includes("fetch。") ||
    s.includes("502") ||
    s.includes("NetworkError") ||
    s.includes("ECONNREFUSED") ||
    s.includes("Load failed") ||
    s.includes("网络异常") ||
    /connection.*refused/i.test(s)
  );
}

type DbContactRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  industry: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  job_title: string | null;
  website: string | null;
  main_business: string | null;
  linkedin: string | null;
  instagram: string | null;
  facebook: string | null;
  email_status: "valid" | "invalid" | "risky" | "unverified" | "none" | null;
  created_at?: string | null;
};

function contactName(r: DbContactRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
}

function SocialCell({ url, openLabel }: { url: string | null | undefined; openLabel: string }) {
  if (!url?.trim()) return <span className="text-slate-400">—</span>;
  return (
    <a className="text-[11px] text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer">
      {openLabel}
    </a>
  );
}

const LIST_PAGE_SIZE = 50;
/** 列表可视区最多 25 行，超出纵向滚动；每页仍加载 50 条 */
const LIST_VISIBLE_MAX_ROWS = 25;

export function CrmContactsDatabasePage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getCrmContactsDatabasePageStrings(locale), [locale]);
  const DB_COLUMNS = useMemo(() => buildDbColumns(ui), [ui]);

  const { user } = useAuth();
  const scopeEmail = (user?.email ?? getCachedAuthUserEmail() ?? "").trim();
  const [searchParams, setSearchParams] = useSearchParams();
  const industryFilter = (searchParams.get("industry") ?? "").trim();
  const sourceFilter = (searchParams.get("source") ?? "").trim();
  const pageRaw = searchParams.get("page");
  const listPage = pageRaw && /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;
  const [sourceCounts, setSourceCounts] = useState<{ total: number; deep_search: number; bulk_import: number } | null>(null);

  useEffect(() => {
    if (!scopeEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const [rAll, rDeep, rBulk] = await Promise.all([
          apiJson<{ ok: boolean; total?: number }>(`/api/email/contacts?page=1&pageSize=1`),
          apiJson<{ ok: boolean; total?: number }>(`/api/email/contacts?source=deep_search&page=1&pageSize=1`),
          apiJson<{ ok: boolean; total?: number }>(`/api/email/contacts?source=bulk_import&page=1&pageSize=1`),
        ]);
        if (cancelled) return;
        setSourceCounts({
          total: typeof rAll.total === "number" ? rAll.total : 0,
          deep_search: typeof rDeep.total === "number" ? rDeep.total : 0,
          bulk_import: typeof rBulk.total === "number" ? rBulk.total : 0,
        });
      } catch {
        // 忽略计数加载失败
      }
    })();
    return () => { cancelled = true; };
  }, [scopeEmail]);

  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [items, setItems] = useState<DbContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [listSettled, setListSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = 尚未完成首次检测 */
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [customIndustryTags, setCustomIndustryTags] = useState<string[]>([]);
  const [hiddenIndustryTags, setHiddenIndustryTags] = useState<string[]>([]);
  const [crmIndustryCountRows, setCrmIndustryCountRows] = useState<IndustryCountRow[]>([]);
  const [industryCatalogLoadError, setIndustryCatalogLoadError] = useState<string | null>(null);
  const [industryMenuOpen, setIndustryMenuOpen] = useState(false);
  const [industryTagRemoveBusy, setIndustryTagRemoveBusy] = useState<string | null>(null);
  const [pageJumpDraft, setPageJumpDraft] = useState("1");
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [pageDeleteBusy, setPageDeleteBusy] = useState(false);
  const [pageDeleteConfirm, setPageDeleteConfirm] = useState(false);
  const [pageActionMsg, setPageActionMsg] = useState<string | null>(null);
  const [exportFromPageDraft, setExportFromPageDraft] = useState("1");
  const [exportToPageDraft, setExportToPageDraft] = useState("1");
  const [exportRangeBusy, setExportRangeBusy] = useState(false);
  const industryMenuRef = useRef<HTMLDivElement | null>(null);
  const loadGenRef = useRef(0);
  const listFilterKeyRef = useRef<string | null>(null);
  /** 顶部横向滑条（与表格滚动区双向同步，列名太多时不用拉到底就能左右滑） */
  const topHScrollRef = useRef<HTMLDivElement | null>(null);
  const tableHScrollRef = useRef<HTMLDivElement | null>(null);
  const hSyncingRef = useRef(false);
  const [topHSpacerWidth, setTopHSpacerWidth] = useState(0);

  const syncHScroll = useCallback((from: "top" | "table") => {
    if (hSyncingRef.current) return;
    const top = topHScrollRef.current;
    const table = tableHScrollRef.current;
    if (!top || !table) return;
    hSyncingRef.current = true;
    if (from === "top") table.scrollLeft = top.scrollLeft;
    else top.scrollLeft = table.scrollLeft;
    requestAnimationFrame(() => {
      hSyncingRef.current = false;
    });
  }, []);

  /** 表格内容宽度变化时，同步顶部滑条的占位宽度 */
  useLayoutEffect(() => {
    const measure = () => {
      const table = tableHScrollRef.current;
      if (table) setTopHSpacerWidth(table.scrollWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [items, DB_COLUMNS.length]);

  const listFilterKey = useMemo(
    () => `${q.trim()}\0${industryFilter}\0${listPage}\0${LIST_PAGE_SIZE}`,
    [q, industryFilter, listPage]
  );

  const listQueryKey = useMemo(
    () => buildCrmContactsListCacheKey(scopeEmail, q, industryFilter, listPage, LIST_PAGE_SIZE, sourceFilter),
    [scopeEmail, q, industryFilter, listPage, sourceFilter]
  );

  useLayoutEffect(() => {
    if (!scopeEmail) return;
    const cached = readCrmContactsListCache(listQueryKey);
    if (cached) {
      setItems(cached.items as DbContactRow[]);
      setTotal(cached.total);
      setPageSize(cached.pageSize);
      setError(null);
      setListSettled(true);
    } else if (listFilterKeyRef.current !== null && listFilterKeyRef.current !== listFilterKey) {
      setItems([]);
      setListSettled(false);
    }
    listFilterKeyRef.current = listFilterKey;
  }, [listQueryKey, listFilterKey, scopeEmail]);


  const qPrev = useRef<string | null>(null);
  useEffect(() => {
    if (qPrev.current !== null && qPrev.current !== q) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("page");
          return n;
        },
        { replace: true }
      );
    }
    qPrev.current = q;
  }, [q, setSearchParams]);

  const checkBackendHealth = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(resolveApiUrl("/api/health"), { method: "GET" });
      if (!r.ok) {
        setBackendOk(false);
        return false;
      }
      const j = (await r.json()) as { ok?: boolean };
      const ok = j.ok === true;
      setBackendOk(ok);
      return ok;
    } catch {
      setBackendOk(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void checkBackendHealth();
  }, [checkBackendHealth]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!scopeEmail) return;
    const silent = opts?.silent === true;
    const gen = ++loadGenRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (industryFilter) params.set("industry", industryFilter);
      if (sourceFilter === "deep_search" || sourceFilter === "bulk_import") params.set("source", sourceFilter);
      params.set("page", String(listPage));
      params.set("pageSize", String(LIST_PAGE_SIZE));
      const qs = params.toString();

      const cRes = await apiJson<{ ok: boolean; items: DbContactRow[]; total?: number; page?: number; pageSize?: number }>(
        `/api/email/contacts?${qs}`
      );
      if (gen !== loadGenRef.current) return;
      const nextItems = Array.isArray(cRes.items) ? cRes.items : [];
      const nextTotal = typeof cRes.total === "number" ? cRes.total : nextItems.length ?? 0;
      const nextPageSize = typeof cRes.pageSize === "number" ? cRes.pageSize : LIST_PAGE_SIZE;
      setItems(nextItems);
      setTotal(nextTotal);
      setPageSize(nextPageSize);
      writeCrmContactsListCache(
        buildCrmContactsListCacheKey(scopeEmail, q, industryFilter, listPage, LIST_PAGE_SIZE, sourceFilter),
        { items: nextItems, total: nextTotal, pageSize: nextPageSize }
      );
    } catch (e: unknown) {
      if (gen !== loadGenRef.current) return;
      setError(String((e as Error)?.message ?? e));
      if (!silent) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setListSettled(true);
      }
    }
  }, [q, industryFilter, listPage, scopeEmail]);

  useEffect(() => {
    if (!scopeEmail) return;
    void load({ silent: true });
    return () => {
      loadGenRef.current += 1;
    };
  }, [load, scopeEmail]);

  const syncIndustryTagsFromStorage = useCallback(() => {
    const { custom, hidden } = loadScopedIndustryTagLists(user?.email);
    setCustomIndustryTags(custom);
    setHiddenIndustryTags(hidden);
  }, [user?.email]);

  useEffect(() => {
    syncIndustryTagsFromStorage();
  }, [syncIndustryTagsFromStorage]);

  useEffect(() => subscribeIndustryTagsChanged(syncIndustryTagsFromStorage), [syncIndustryTagsFromStorage]);

  useEffect(() => {
    const emailKey = scopeEmail || user?.email || "";
    const cached = readCrmContactsIndustryCountsCache(emailKey);
    if (cached) setCrmIndustryCountRows(cached);
    const sessionCached = readIndustryCatalogCache(emailKey);
    if (sessionCached?.length) setCrmIndustryCountRows(sessionCached);
    let cancelled = false;
    setIndustryCatalogLoadError(null);

    const applyRows = (rows: IndustryCountRow[], error: string | null) => {
      if (cancelled) return;
      setCrmIndustryCountRows(rows);
      if (emailKey) writeCrmContactsIndustryCountsCache(emailKey, rows);
      setIndustryCatalogLoadError(error);
    };

    void loadIndustryTagOptionsFromServer(customIndustryTags, hiddenIndustryTags, {
      userScope: emailKey,
      onPartial: (result) => {
        applyRows(result.crmRows, result.ready ? result.error : result.error);
      }
    }).then((result) => {
      if (!cancelled) {
        applyRows(result.crmRows, result.ready ? result.error : result.error);
        if (!result.ready && !cached && !sessionCached?.length) setCrmIndustryCountRows([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scopeEmail, user?.email, customIndustryTags, hiddenIndustryTags]);

  useEffect(() => {
    return subscribeEmailContactsChanged(() => {
      const emailKey = scopeEmail || user?.email || "";
      clearCrmContactsListCacheForUser(emailKey);
      setListSettled(false);
      void load({ silent: true });
      void loadIndustryTagOptionsFromServer(customIndustryTags, hiddenIndustryTags, {
        userScope: emailKey
      }).then((result) => {
        setCrmIndustryCountRows(result.crmRows);
        if (emailKey) writeCrmContactsIndustryCountsCache(emailKey, result.crmRows);
        setIndustryCatalogLoadError(result.ready ? result.error : result.error);
      });
    });
  }, [load, scopeEmail, user?.email, customIndustryTags, hiddenIndustryTags]);

  useEffect(() => {
    if (!listSettled || total <= 0) return;
    const tp = Math.max(1, Math.ceil(total / (pageSize || LIST_PAGE_SIZE)));
    if (listPage > tp) {
      setListPageInUrl(tp);
    }
  }, [total, listPage, pageSize, listSettled]);

  useEffect(() => {
    const id = setTimeout(() => setQ(qDraft), 350);
    return () => clearTimeout(id);
  }, [qDraft]);

  useEffect(() => {
    if (!industryMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = industryMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIndustryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [industryMenuOpen]);

  const totalPages = Math.max(1, Math.ceil(total / (pageSize || LIST_PAGE_SIZE)));
  const crmIndustryOptions = useMemo(
    () => mergeIndustryTagOptions(customIndustryTags, crmIndustryCountRows, hiddenIndustryTags),
    [customIndustryTags, crmIndustryCountRows, hiddenIndustryTags]
  );

  useEffect(() => {
    setPageJumpDraft(String(listPage));
    setSelectedContactIds([]);
    setPageDeleteConfirm(false);
    setPageActionMsg(null);
    setExportFromPageDraft(String(listPage));
    setExportToPageDraft(String(listPage));
  }, [listPage]);

  useEffect(() => {
    setSelectedContactIds((prev) => prev.filter((id) => items.some((r) => r.id === id)));
  }, [items]);

  const unreachable = backendOk === false || (!!error && looksLikeBackendUnreachable(error));
  const currentIndustryLabel = industryFilter || ui.allIndustryTags;

  const listPending = (!listSettled || loading) && items.length === 0 && !error;

  const subtitle = useMemo(() => {
    if (listPending) return ui.subtitleLoading;
    if (unreachable) return ui.subtitleUnreachable;
    if (error) return error.length > 200 ? `${error.slice(0, 200)}…` : error;
    return ui.subtitleSummary(total, pageSize, listPage, totalPages);
  }, [listPending, error, unreachable, total, pageSize, listPage, totalPages, ui]);

  async function recheckBackendAndReload() {
    setBackendOk(null);
    const ok = await checkBackendHealth();
    if (ok) await load();
  }

  const hideIndustryTagFromDropdown = useCallback(
    async (tag: string) => {
      const t = tag.trim();
      if (!t || industryTagRemoveBusy === t) return;
      setIndustryTagRemoveBusy(t);
      try {
        await removeIndustryTagAndCrmContacts(user?.email, t);
        if (industryFilter === t) setIndustryInUrl("");
        setIndustryMenuOpen(false);
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setIndustryTagRemoveBusy(null);
      }
    },
    [industryFilter, industryTagRemoveBusy, user?.email]
  );

  const selectedIdSet = useMemo(() => new Set(selectedContactIds), [selectedContactIds]);
  const pageAllSelected = items.length > 0 && items.every((r) => selectedIdSet.has(r.id));
  const tableColSpan = DB_COLUMNS.length + 1;

  function toggleContactSelected(id: number) {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPageDeleteConfirm(false);
    setPageActionMsg(null);
  }

  function toggleSelectAllOnPage() {
    if (pageAllSelected) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(items.map((r) => r.id));
    }
    setPageDeleteConfirm(false);
    setPageActionMsg(null);
  }

  function rowsForPageExport(): DbContactRow[] {
    if (selectedContactIds.length === 0) return items;
    const pick = new Set(selectedContactIds);
    return items.filter((r) => pick.has(r.id));
  }

  function exportCurrentPageCsv() {
    const rows = rowsForPageExport();
    if (rows.length === 0) {
      setPageActionMsg(ui.errNoExport);
      return;
    }
    const suffix =
      selectedContactIds.length > 0 ? `selected-${rows.length}` : `page-${listPage}`;
    downloadCrmDatabaseContactsCsv(`crm-contacts-${suffix}.csv`, rows);
    setPageActionMsg(ui.exportedCsv(rows.length));
  }

  async function exportPageRangeCsv() {
    const fromRaw = exportFromPageDraft.trim();
    const toRaw = exportToPageDraft.trim();
    if (!/^\d+$/.test(fromRaw) || !/^\d+$/.test(toRaw)) {
      setPageActionMsg(ui.errInvalidPageRange);
      return;
    }
    const resolved = resolveCrmDatabaseExportPageRange(Number(fromRaw), Number(toRaw), totalPages);
    if (resolved.error) {
      setPageActionMsg(resolved.error);
      return;
    }
    setExportRangeBusy(true);
    setPageActionMsg(null);
    try {
      const result = await fetchCrmDatabaseContactsForPageExport({
        fromPage: resolved.fromPage,
        toPage: resolved.toPage,
        q,
        industry: industryFilter,
        source: sourceFilter
      });
      if (result.items.length === 0) {
        setPageActionMsg(ui.errNoContactsInRange);
        return;
      }
      downloadCrmDatabaseContactsCsv(
        `crm-contacts-p${result.fromPage}-${result.toPage}.csv`,
        result.items
      );
      setPageActionMsg(ui.exportedRange(result.fromPage, result.toPage, result.exported, result.capped));
      setExportFromPageDraft(String(result.fromPage));
      setExportToPageDraft(String(result.toPage));
    } catch (e: unknown) {
      setPageActionMsg(String((e as Error)?.message ?? e));
    } finally {
      setExportRangeBusy(false);
    }
  }

  const exportRangeEstimate = useMemo(() => {
    const fromRaw = exportFromPageDraft.trim();
    const toRaw = exportToPageDraft.trim();
    if (!/^\d+$/.test(fromRaw) || !/^\d+$/.test(toRaw) || total <= 0) return null;
    const resolved = resolveCrmDatabaseExportPageRange(Number(fromRaw), Number(toRaw), totalPages);
    if (resolved.error) return null;
    return estimateCrmDatabaseExportRowCount(resolved.fromPage, resolved.toPage, total);
  }, [exportFromPageDraft, exportToPageDraft, total, totalPages]);

  async function deleteSelectedOnPage() {
    if (selectedContactIds.length === 0) {
      setPageActionMsg(ui.errSelectToDelete);
      return;
    }
    if (!pageDeleteConfirm) {
      setPageDeleteConfirm(true);
      return;
    }
    setPageDeleteBusy(true);
    setPageActionMsg(null);
    try {
      const deleted = await bulkDeleteCrmDatabaseContacts(selectedContactIds);
      clearCrmContactsListCacheForUser(scopeEmail || user?.email);
      setSelectedContactIds([]);
      setPageDeleteConfirm(false);
      setListSettled(false);
      await load({ silent: true });
      setPageActionMsg(ui.deletedCount(deleted));
    } catch (e: unknown) {
      setPageActionMsg(String((e as Error)?.message ?? e));
      setPageDeleteConfirm(false);
    } finally {
      setPageDeleteBusy(false);
    }
  }

  function jumpToPageFromInput() {
    const raw = pageJumpDraft.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      setPageJumpDraft(String(listPage));
      return;
    }
    const target = Math.min(totalPages, Math.max(1, Number(raw)));
    setListPageInUrl(target);
    setPageJumpDraft(String(target));
  }

  function setIndustryInUrl(industry: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("page");
        const trimmed = industry.trim();
        if (!trimmed) next.delete("industry");
        else next.set("industry", trimmed);
        return next;
      },
      { replace: true }
    );
  }

  function setListPageInUrl(p: number) {
    const safe = Math.max(1, p);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (safe <= 1) next.delete("page");
        else next.set("page", String(safe));
        return next;
      },
      { replace: true }
    );
  }

  function cell(r: DbContactRow, key: (typeof DB_COLUMNS)[number]["key"]): React.ReactNode {
    if (key === "created_at") {
      const raw = String(r.created_at || "").trim();
      if (!raw) return "—";
      return <span className="whitespace-nowrap text-slate-700">{raw.slice(0, 10)}</span>;
    }
    if (key === "contact") {
      const t = contactName(r);
      return t ? <span className="whitespace-nowrap text-slate-800">{t}</span> : "—";
    }
    if (key === "website") {
      const w = r.website?.trim();
      if (!w) return "—";
      const href = /^https?:\/\//i.test(w) ? w : `https://${w}`;
      return (
        <a className="break-all text-blue-600 hover:underline" href={href} target="_blank" rel="noreferrer">
          {w}
        </a>
      );
    }
    if (key === "company") {
      return <span className="font-medium text-slate-900">{(r.company ?? "").trim() || "—"}</span>;
    }
    if (key === "email") {
      return <span className="max-w-[180px] break-all">{(r.email ?? "").trim() || "—"}</span>;
    }
    if (key === "email_status") {
      const st = (r.email_status ?? "").trim().toLowerCase();
      if (!st || st === "none") return "—";
      if (st === "valid") return <span className="text-emerald-700">{ui.emailStatusValidDb}</span>;
      if (st === "invalid") return <span className="text-rose-700">{ui.emailStatusInvalidDb}</span>;
      if (st === "no_email") return <span className="text-slate-500">{ui.emailStatusNoEmailDb}</span>;
      return <span className="text-amber-800">{ui.emailStatusRiskyDb}</span>;
    }
    if (key === "job_title") {
      return <span className="whitespace-nowrap">{(r.job_title ?? "").trim() || "—"}</span>;
    }
    if (key === "main_business") {
      const t = (r.main_business ?? "").trim();
      if (!t) return "—";
      return <span className="max-w-[280px] whitespace-pre-wrap break-words text-slate-800">{t}</span>;
    }
    if (key === "linkedin") return <SocialCell url={r.linkedin} openLabel={ui.openLink} />;
    if (key === "instagram") return <SocialCell url={r.instagram} openLabel={ui.openLink} />;
    if (key === "facebook") return <SocialCell url={r.facebook} openLabel={ui.openLink} />;
    const v = r[key];
    if (v == null || String(v).trim() === "") return "—";
    return String(v);
  }

  return (
    <div className="space-y-3 text-[11px] leading-snug text-slate-700 [&_.rounded-lg>.border-b_.text-sm]:text-[11px] [&_.rounded-lg>.border-b_.text-xs]:text-[10px] [&_.rounded-lg>.border-b]:px-3 [&_.rounded-lg>.border-b]:py-2 [&_.rounded-lg>.p-4]:p-3">
      <h1 className="text-base font-semibold text-slate-900">{ui.pageTitle}</h1>
      <div className="flex gap-2">
        {[
          { key: "", label: "总数", count: sourceCounts?.total },
          { key: "deep_search", label: "精搜", count: sourceCounts?.deep_search },
          { key: "bulk_import", label: "普搜", count: sourceCounts?.bulk_import },
        ].map((tab) => {
          const active = sourceFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (tab.key) next.set("source", tab.key);
                else next.delete("source");
                next.delete("page");
                setSearchParams(next);
              }}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                active
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" ? ` (${tab.count.toLocaleString()})` : ""}
            </button>
          );
        })}
      </div>
      <SectionCard title={ui.filterTitle} description={ui.filterDescription}>
        <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
          <label className="flex min-w-[11rem] flex-col gap-0.5 text-[11px] text-slate-700">
            <span className="font-medium text-slate-800">{ui.industryLabel}</span>
            {industryCatalogLoadError ? (
              <p className="text-[10px] text-red-600">
                行业标签列表加载失败：{industryCatalogLoadError}（请刷新或重新登录后再试）
              </p>
            ) : null}
            <div className="relative" ref={industryMenuRef}>
              <button
                type="button"
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11px] outline-none focus:border-emerald-500"
                onClick={() => setIndustryMenuOpen((v) => !v)}
                aria-expanded={industryMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="inline-block max-w-[16rem] truncate align-middle">{currentIndustryLabel}</span>
                <span className="float-right text-slate-400">{industryMenuOpen ? "▲" : "▼"}</span>
              </button>
              {industryMenuOpen ? (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  <ul
                    className="max-h-[calc(2.25rem*15+0.25rem)] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
                    role="listbox"
                    aria-label={ui.industryFilterList}
                  >
                    <li>
                      <button
                        type="button"
                        className={`block w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-emerald-50 ${
                          industryFilter === "" ? "bg-emerald-50 text-emerald-900" : "text-slate-700"
                        }`}
                        onClick={() => {
                          setIndustryInUrl("");
                          setIndustryMenuOpen(false);
                        }}
                      >
                        {ui.allIndustryTags}
                      </button>
                    </li>
                    {crmIndustryOptions.map((x) => (
                      <li key={x} className="flex items-center gap-1.5 py-0.5 pl-0.5 pr-1.5">
                        <button
                          type="button"
                          className={`min-w-0 flex-1 px-2 py-1 text-left text-[11px] hover:bg-emerald-50 ${
                            industryFilter === x ? "bg-emerald-50 text-emerald-900" : "text-slate-700"
                          }`}
                          onClick={() => {
                            setIndustryInUrl(x);
                            setIndustryMenuOpen(false);
                          }}
                        >
                          {x}
                        </button>
                        <IndustryTagListRemoveIconButton
                          tag={x}
                          disabled={industryTagRemoveBusy === x}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void hideIndustryTagFromDropdown(x);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </label>

          <div className="flex min-w-[8.5rem] flex-col gap-0.5 sm:min-w-[9.5rem]">
            <span className="text-[10px] font-medium text-slate-600">{ui.countStats}</span>
            <div
              className={`flex min-h-[2rem] flex-col justify-center rounded-md border px-2.5 py-1.5 text-[11px] shadow-sm ${
                unreachable
                  ? "border-amber-300 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50/90"
              }`}
            >
              {backendOk === null ? (
                <span className="text-slate-500">{ui.checkingBackend}</span>
              ) : unreachable ? (
                <span className="text-[11px] font-medium text-amber-900">{ui.backendDisconnected}</span>
              ) : loading ? (
                <span className="text-slate-500">{ui.loadingData}</span>
              ) : error ? (
                <span className="text-[10px] text-red-700">{ui.apiFailed}</span>
              ) : (
                <div className="whitespace-nowrap tabular-nums text-slate-800">
                  {ui.currentListCountPrefix}{" "}
                  <span className="text-xs font-semibold text-emerald-800">{total}</span> {ui.currentListCountSuffix}
                </div>
              )}
            </div>
          </div>

          <label className="flex min-w-[11rem] flex-1 flex-col gap-0.5 text-[11px] text-slate-700">
            <span className="font-medium text-slate-800">{ui.keywordLabel}</span>
            <input
              className="h-8 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] outline-none focus:border-emerald-500"
              placeholder={ui.keywordPlaceholder}
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
            />
          </label>
        </div>

        {unreachable && !loading ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/95 p-3 text-[11px] text-amber-950">
            <p className="font-semibold text-amber-950">{ui.backendUnreachableTitle}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
              {ui.backendUnreachableSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <button
              type="button"
              className="mt-3 rounded-md bg-amber-700 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-800"
              onClick={() => void recheckBackendAndReload()}
            >
              {ui.recheckBackend}
            </button>
          </div>
        ) : null}

        {error && !loading && !unreachable ? (
          <p className="mt-2 text-[10px] text-red-600">
            {ui.loadFailedWithBackend}
            {error}
          </p>
        ) : null}
      </SectionCard>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/90 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold text-slate-900">{ui.contactListTitle}</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
        </div>
        {/* 顶部横向滑条：与下方表格左右同步 */}
        <div
          ref={topHScrollRef}
          onScroll={() => syncHScroll("top")}
          className="overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-slate-50/60 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
        >
          <div style={{ width: topHSpacerWidth > 0 ? topHSpacerWidth : "100%", height: 1 }} />
        </div>
        <div className="flex min-h-0 border-b border-slate-200">
          <div
            ref={tableHScrollRef}
            onScroll={() => syncHScroll("table")}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
            style={{ maxHeight: `calc(2.25rem * ${LIST_VISIBLE_MAX_ROWS} + 0.25rem)` }}
          >
            <table className="w-max min-w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="w-8 min-w-[2rem] px-1 py-1.5 text-center">
                    <span className="sr-only">{ui.selectColumn}</span>
                  </th>
                  {DB_COLUMNS.map((col) => (
                    <th key={String(col.key)} className={`px-2 py-1.5 text-[10px] font-medium text-slate-700 ${col.thClass}`}>
                      {col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listPending ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-3 py-8 text-center text-[11px] text-slate-500">
                      {ui.loading}
                    </td>
                  </tr>
                ) : error && unreachable ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-12 text-center text-slate-600">
                      <p className="text-[11px] font-medium text-slate-800">{ui.listNoBackend}</p>
                      <p className="mt-1.5 text-[10px] text-slate-500">{ui.listNoBackendHint}</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-12 text-center text-slate-600">
                      <p className="text-[11px] font-medium text-red-800">{ui.loadFailed}</p>
                      <p className="mt-1.5 max-w-lg text-[10px] text-red-700">{error}</p>
                      <button
                        type="button"
                        className="mt-3 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 hover:bg-slate-50"
                        onClick={() => void load()}
                      >
                        {ui.retryLoad}
                      </button>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-12 text-center text-slate-500">
                      <p className="text-[11px] font-medium text-slate-700">{ui.noContacts}</p>
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-1 py-1.5 text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={selectedIdSet.has(r.id)}
                          aria-label={ui.selectContact(r.email)}
                          onChange={() => toggleContactSelected(r.id)}
                        />
                      </td>
                      {DB_COLUMNS.map((col) => (
                        <td key={String(col.key)} className="px-2 py-1.5 align-middle text-slate-800">
                          {cell(r, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <aside className="flex w-[10.5rem] shrink-0 flex-col gap-2 border-l border-slate-200 bg-slate-50/90 p-2.5">
            <div className="text-[10px] font-semibold text-slate-800">{ui.pageActions}</div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={pageAllSelected}
                disabled={items.length === 0 || listPending}
                onChange={toggleSelectAllOnPage}
              />
              {ui.selectAllPage}
            </label>
            <p className="text-[10px] tabular-nums text-slate-600">
              {ui.selectedLabel}{" "}
              <span className="font-medium text-slate-900">{selectedContactIds.length}</span> {ui.selectedOf}{" "}
              {items.length}
            </p>
            {pageDeleteConfirm ? (
              <div className="space-y-1.5 rounded-md border border-red-200 bg-red-50 p-2">
                <p className="text-[10px] leading-snug text-red-800">{ui.confirmDelete(selectedContactIds.length)}</p>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={pageDeleteBusy}
                    onClick={() => void deleteSelectedOnPage()}
                  >
                    {pageDeleteBusy ? ui.deleting : ui.confirmDeleteBtn}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-50"
                    disabled={pageDeleteBusy}
                    onClick={() => setPageDeleteConfirm(false)}
                  >
                    {ui.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="rounded border border-red-200 bg-white px-2 py-1.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedContactIds.length === 0 || pageDeleteBusy || listPending}
                onClick={() => void deleteSelectedOnPage()}
              >
                {ui.deleteSelected}
              </button>
            )}
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={items.length === 0 || listPending}
              onClick={exportCurrentPageCsv}
            >
              {selectedContactIds.length > 0 ? ui.exportSelectedCsv : ui.exportPageCsv}
            </button>
            <div className="border-t border-slate-200 pt-2">
              <div className="text-[10px] font-semibold text-slate-800">{ui.exportByPageTitle}</div>
              <p className="mt-0.5 text-[9px] leading-snug text-slate-500">
                {ui.exportByPageHint(CRM_DATABASE_EXPORT_MAX_ROWS, LIST_PAGE_SIZE)}
              </p>
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-700">
                <span>{ui.exportFrom}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-7 w-10 rounded border border-slate-200 bg-white px-1 text-center text-[10px] tabular-nums outline-none focus:border-emerald-500"
                  value={exportFromPageDraft}
                  aria-label={ui.exportStartPage}
                  disabled={exportRangeBusy || listPending || total <= 0}
                  onChange={(e) => setExportFromPageDraft(e.target.value.replace(/\D/g, ""))}
                />
                <span>{ui.exportTo}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-7 w-10 rounded border border-slate-200 bg-white px-1 text-center text-[10px] tabular-nums outline-none focus:border-emerald-500"
                  value={exportToPageDraft}
                  aria-label={ui.exportEndPage}
                  disabled={exportRangeBusy || listPending || total <= 0}
                  onChange={(e) => setExportToPageDraft(e.target.value.replace(/\D/g, ""))}
                />
                <span>{ui.exportPageUnit}</span>
              </div>
              {exportRangeEstimate != null ? (
                <p className="mt-1 text-[9px] tabular-nums text-slate-600">{ui.exportEstRows(exportRangeEstimate)}</p>
              ) : null}
              <button
                type="button"
                className="mt-1.5 w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={exportRangeBusy || listPending || total <= 0}
                onClick={() => void exportPageRangeCsv()}
              >
                {exportRangeBusy ? ui.exporting : ui.exportByPage}
              </button>
            </div>
            {pageActionMsg ? (
              <p className="text-[10px] leading-snug text-slate-600">{pageActionMsg}</p>
            ) : null}
          </aside>
        </div>
        {!loading && !error && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-2.5 py-2">
            <p className="text-[10px] text-slate-600">{ui.pagination(listPage, totalPages, LIST_PAGE_SIZE, total)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <span>{ui.jumpTo}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-7 w-12 rounded border border-slate-200 bg-white px-1.5 text-center text-[10px] tabular-nums outline-none focus:border-emerald-500"
                  value={pageJumpDraft}
                  aria-label={ui.jumpPage}
                  onChange={(e) => setPageJumpDraft(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") jumpToPageFromInput();
                  }}
                />
                <span>{ui.pageUnit}</span>
                <button
                  type="button"
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-800 hover:bg-slate-50"
                  onClick={jumpToPageFromInput}
                >
                  {ui.jump}
                </button>
              </label>
              <button
                type="button"
                className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={listPage <= 1}
                onClick={() => setListPageInUrl(listPage - 1)}
              >
                {ui.prevPage}
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={listPage >= totalPages}
                onClick={() => setListPageInUrl(listPage + 1)}
              >
                {ui.nextPage}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
