import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiFormUpload, apiJson } from "../../lib/api";
import { plainTextToDocxBlob } from "../../lib/plainTextToDocxBlob";
import { plainTextToPdfBlob } from "../../lib/plainTextToPdfBlob";
import { downloadBlob } from "../../lib/imageStudioShared";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  getCrmFollowupDetailBuilderStrings,
  type CrmFollowupDetailBuilderStrings
} from "../../i18n/crmFollowupDetailBuilderPageI18n";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";

type FieldType = "shortText" | "longText" | "fileList";
type Field = { id: string; label: string; type: FieldType; value: string };
type Section = { id: string; title: string; fields: Field[] };
type TemplatePage = { id: string; title: string; sections: Section[] };
type TemplateFile = { id: number; fieldId: string; name: string; mime: string; sizeBytes: number; url: string };

/** 单页最多 10 排；可视区约 3 排，其余纵向滚动 */
const MAX_SECTIONS_PER_PAGE = 10;
const SECTIONS_VISIBLE_ROWS = 3;
const ACTIVE_PAGE_STORAGE_KEY = "bss-crm-followup-active-page-id";
/** 页面选择列表一次最多可见条数，超出纵向滚动 */
const PAGE_PICKER_VISIBLE_MAX = 15;
/** 选择列表里页面名称最多展示汉字数 */
const PAGE_PICKER_TITLE_MAX_CHARS = 10;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeField(type: FieldType, ui: CrmFollowupDetailBuilderStrings): Field {
  const label =
    type === "shortText" ? ui.fieldShortText : type === "longText" ? ui.fieldLongText : ui.fieldAttachment;
  return { id: makeId("field"), label, type, value: "" };
}

function makeSection(ui: CrmFollowupDetailBuilderStrings): Section {
  return {
    id: makeId("section"),
    title: ui.defaultSectionTitle,
    fields: [makeField("shortText", ui), makeField("fileList", ui)]
  };
}

function makePage(index: number, ui: CrmFollowupDetailBuilderStrings): TemplatePage {
  return {
    id: makeId("page"),
    title: index <= 1 ? ui.defaultPageTitle : ui.pageTitleFallback(index),
    sections: []
  };
}

function truncateDisplayChars(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}

function pagePickerLabel(page: TemplatePage, index: number, ui: CrmFollowupDetailBuilderStrings): string {
  const raw = page.title.trim() || ui.pageTitleFallback(index + 1);
  const name = truncateDisplayChars(raw, PAGE_PICKER_TITLE_MAX_CHARS);
  return `${index + 1}. ${name}`;
}

function cloneSection(section: Section): Section {
  return {
    ...section,
    id: makeId("section"),
    fields: section.fields.map((f) => ({ ...f, id: makeId("field") }))
  };
}

function sanitizeExportBaseName(title: string, fallback: string): string {
  const t = title.trim() || fallback;
  return t.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "Word";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "Excel";
  return "FILE";
}

function normalizePagesFromApi(
  raw: unknown,
  fallbackTitle: string,
  ui: CrmFollowupDetailBuilderStrings
): TemplatePage[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p, idx) => ({
      id: String((p as TemplatePage).id ?? makeId("page")),
      title: String((p as TemplatePage).title ?? ui.pageTitleFallback(idx + 1)),
      sections: Array.isArray((p as TemplatePage).sections) ? (p as TemplatePage).sections : []
    }));
  }
  return [makePage(1, ui)];
}

export function CrmFollowupDetailBuilderPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getCrmFollowupDetailBuilderStrings(locale), [locale]);

  const [pages, setPages] = useState<TemplatePage[]>([]);
  const [activePageId, setActivePageId] = useState("");
  const [files, setFiles] = useState<TemplateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyField, setBusyField] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const pagePickerRef = useRef<HTMLDivElement | null>(null);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) ?? pages[0] ?? null,
    [pages, activePageId]
  );
  const activePageIndex = useMemo(
    () => (activePage ? pages.findIndex((p) => p.id === activePage.id) : 0),
    [pages, activePage]
  );
  const sections = activePage?.sections ?? [];

  const filesByField = useMemo(() => {
    const map = new Map<string, TemplateFile[]>();
    for (const f of files) {
      const arr = map.get(f.fieldId) ?? [];
      arr.push(f);
      map.set(f.fieldId, arr);
    }
    return map;
  }, [files]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        template: { title: string; pages?: TemplatePage[]; sections?: Section[] };
        files: TemplateFile[];
      }>("/api/email/followup-detail-template");
      const fallback = res.template?.title || ui.defaultPageTitle;
      let nextPages = normalizePagesFromApi(res.template?.pages, fallback, ui);
      if (!res.template?.pages?.length && Array.isArray(res.template?.sections)) {
        nextPages = [{ id: makeId("page"), title: fallback, sections: res.template.sections }];
      }
      setPages(nextPages);
      const storedId = sessionStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
      const preferredId =
        storedId && nextPages.some((p) => p.id === storedId) ? storedId : (nextPages[0]?.id ?? "");
      setActivePageId(preferredId);
      setFiles(Array.isArray(res.files) ? res.files : []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pagePickerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const root = pagePickerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setPagePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pagePickerOpen]);

  function selectPage(pageId: string) {
    if (!pages.some((p) => p.id === pageId)) return;
    setActivePageId(pageId);
    sessionStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, pageId);
  }

  function selectPageFromPicker(pageId: string) {
    selectPage(pageId);
    setPagePickerOpen(false);
  }

  function selectPageByIndex(index: number) {
    const p = pages[index];
    if (p) selectPage(p.id);
  }

  async function savePages(nextPages: TemplatePage[]) {
    try {
      await apiJson("/api/email/followup-detail-template", {
        method: "PUT",
        body: JSON.stringify({ pages: nextPages })
      });
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    }
  }

  function updatePages(next: TemplatePage[]) {
    setPages(next);
    void savePages(next);
  }

  function patchActivePage(patch: (page: TemplatePage) => TemplatePage) {
    if (!activePage) return;
    const next = pages.map((p) => (p.id === activePage.id ? patch(p) : p));
    updatePages(next);
  }

  function toExportRows(pageSections: Section[]): Record<string, string>[] {
    return pageSections.map((section, idx) => {
      const row: Record<string, string> = {
        [ui.exportFollowupItem]: section.title || ui.exportItemN(idx + 1)
      };
      for (const f of section.fields) {
        if (f.type === "fileList") {
          const names = (filesByField.get(f.id) ?? []).map((x) => x.name).join("；");
          row[f.label || ui.fieldAttachment] = names;
        } else {
          row[f.label || ui.fieldGeneric] = f.value || "";
        }
      }
      return row;
    });
  }

  function toExportText(pageSections: Section[], pageTitle: string): string {
    const head = pageTitle.trim() || ui.defaultPageTitle;
    const body = pageSections
      .map((section, idx) => {
        const lines = [`${idx + 1}. ${section.title || ui.defaultSectionTitle}`];
        for (const f of section.fields) {
          if (f.type === "fileList") {
            const names = (filesByField.get(f.id) ?? []).map((x) => x.name).join("；") || ui.exportNone;
            lines.push(`- ${f.label || ui.fieldAttachment}：${names}`);
          } else {
            lines.push(`- ${f.label || ui.fieldGeneric}：${f.value || ""}`);
          }
        }
        return lines.join("\n");
      })
      .join("\n\n");
    return `${head}\n\n${body}`;
  }

  function exportBaseName(): string {
    return sanitizeExportBaseName(activePage?.title ?? ui.defaultPageTitle, ui.defaultPageTitle);
  }

  async function exportXlsx() {
    const rows = toExportRows(sections);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, ui.exportSheetName);
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${exportBaseName()}.xlsx`
    );
  }

  async function exportDocx() {
    const blob = await plainTextToDocxBlob(toExportText(sections, activePage?.title ?? ""));
    downloadBlob(blob, `${exportBaseName()}.docx`);
  }

  async function exportPdf() {
    const blob = await plainTextToPdfBlob(toExportText(sections, activePage?.title ?? ""));
    downloadBlob(blob, `${exportBaseName()}.pdf`);
  }

  async function uploadFieldFile(fieldId: string, file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!/\.(pdf|doc|docx|xls|xlsx)$/i.test(lower)) {
      alert(ui.alertFileTypes);
      return;
    }
    setBusyField(fieldId);
    try {
      const fd = new FormData();
      fd.append("fieldId", fieldId);
      fd.append("file", file);
      const resp = await apiFormUpload<{ ok: boolean; file: TemplateFile }>(
        "/api/email/followup-detail-template/files",
        fd
      );
      setFiles((prev) => [resp.file, ...prev]);
    } catch (e: unknown) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setBusyField("");
    }
  }

  function onDropFieldFiles(fieldId: string, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = e.dataTransfer.files;
    if (!dropped?.length) return;
    for (const f of Array.from(dropped)) {
      void uploadFieldFile(fieldId, f);
    }
  }

  async function removeFile(fileId: number) {
    await apiJson(`/api/email/followup-detail-template/files/${fileId}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  function addPage(copyFromCurrent = false) {
    const newPage: TemplatePage = copyFromCurrent && activePage
      ? {
          id: makeId("page"),
          title: `${activePage.title.trim() || ui.pageTitleFallback(1)}${ui.pageCopySuffix}`,
          sections: activePage.sections.map(cloneSection)
        }
      : makePage(pages.length + 1, ui);
    const next = [...pages, newPage];
    updatePages(next);
    selectPage(newPage.id);
  }

  function removeActivePage() {
    if (pages.length <= 1) {
      alert(ui.alertMinOnePage);
      return;
    }
    if (!activePage) return;
    if (!window.confirm(ui.confirmDeletePage(activePage.title))) {
      return;
    }
    const next = pages.filter((p) => p.id !== activePage.id);
    updatePages(next);
    selectPage(next[0]?.id ?? "");
  }

  function addSectionRow() {
    if (!activePage) return;
    if (sections.length >= MAX_SECTIONS_PER_PAGE) {
      alert(ui.alertSectionLimit(MAX_SECTIONS_PER_PAGE));
      return;
    }
    patchActivePage((p) => ({ ...p, sections: [...p.sections, makeSection(ui)] }));
  }

  const atSectionLimit = sections.length >= MAX_SECTIONS_PER_PAGE;

  const activePagePickerText = activePage
    ? pagePickerLabel(activePage, activePageIndex >= 0 ? activePageIndex : 0, ui)
    : "";

  return (
    <PageShell
      title={ui.pageTitle}
      description={ui.pageDescription}
      actions={
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => void exportXlsx()}>
            {ui.exportExcel}
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => void exportPdf()}>
            {ui.exportPdf}
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => void exportDocx()}>
            {ui.exportWord}
          </button>
        </div>
      }
    >
      <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="text-slate-700">{ui.templateNameLabel}</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={activePage?.title ?? ""}
            maxLength={255}
            placeholder={ui.templateNamePh}
            disabled={!activePage}
            onChange={(e) => {
              const nextTitle = e.target.value;
              patchActivePage((p) => ({ ...p, title: nextTitle }));
            }}
          />
        </label>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-800">
              {ui.pageProgress(
                activePageIndex + 1,
                pages.length,
                activePage?.sections.length ?? 0
              )}
            </span>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={activePageIndex <= 0}
              onClick={() => selectPageByIndex(0)}
            >
              {ui.firstPage}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={activePageIndex <= 0}
              onClick={() => selectPageByIndex(activePageIndex - 1)}
            >
              {ui.prevPage}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={activePageIndex >= pages.length - 1}
              onClick={() => selectPageByIndex(activePageIndex + 1)}
            >
              {ui.nextPage}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{ui.pageNavHint(PAGE_PICKER_VISIBLE_MAX)}</p>
          <div className="relative mt-2 border-t border-slate-200/80 pt-2" ref={pagePickerRef}>
            <div className="mb-1.5 text-xs font-medium text-slate-700">{ui.pickPageLabel}</div>
            <button
              type="button"
              aria-expanded={pagePickerOpen}
              aria-haspopup="listbox"
              className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm hover:border-slate-400"
              onClick={() => setPagePickerOpen((open) => !open)}
            >
              <span className={activePagePickerText ? "truncate" : "text-slate-400"}>
                {activePagePickerText || ui.pickPagePlaceholder}
              </span>
              <span className="shrink-0 text-xs text-slate-400" aria-hidden>
                {pagePickerOpen ? "▲" : "▼"}
              </span>
            </button>
            {pagePickerOpen ? (
              <div
                className="absolute left-0 right-0 z-20 mt-1 max-h-[calc(1.75rem*15+0.25rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-lg [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
                role="listbox"
                aria-label={ui.pageListAria}
              >
                {pages.map((p, idx) => {
                  const selected = p.id === activePage?.id;
                  const fullTitle = p.title.trim() || ui.pageTitleFallback(idx + 1);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${
                        selected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => selectPageFromPicker(p.id)}
                      title={ui.pageRowTitle(fullTitle, p.sections.length)}
                    >
                      <span className="truncate">{pagePickerLabel(p, idx, ui)}</span>
                      <span className={`shrink-0 tabular-nums ${selected ? "text-slate-300" : "text-slate-400"}`}>
                        {ui.sectionCount(p.sections.length)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-2">
            <button
              type="button"
              className="shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
              onClick={() => addPage(false)}
            >
              {ui.addPage}
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => addPage(true)}
              disabled={!activePage || sections.length === 0}
              title={sections.length === 0 ? ui.copyPageDisabledTitle : ui.copyPageTitle}
            >
              {ui.copyPage}
            </button>
            {pages.length > 1 ? (
              <button
                type="button"
                className="shrink-0 rounded-md border border-rose-300 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50"
                onClick={() => removeActivePage()}
              >
                {ui.deletePage}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={atSectionLimit}
            onClick={addSectionRow}
          >
            {ui.addSection}
          </button>
          <span className="text-xs text-slate-500">
            {ui.sectionQuota(sections.length, MAX_SECTIONS_PER_PAGE, SECTIONS_VISIBLE_ROWS)}
          </span>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-500">{ui.loading}</div> : null}
      {error ? (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>
      ) : null}

      <div
        className="max-h-[min(78rem,calc(14rem*3+2rem))] space-y-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
      >
        {sections.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {ui.emptySections(MAX_SECTIONS_PER_PAGE)}
          </p>
        ) : null}
        {sections.map((section, secIndex) => (
          <SectionCard
            key={section.id}
            title={ui.sectionTitle(secIndex + 1)}
            right={
              <div className="flex gap-2">
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  onClick={() =>
                    patchActivePage((p) => {
                      const idx = p.sections.findIndex((s) => s.id === section.id);
                      if (idx < 0) return p;
                      if (p.sections.length >= MAX_SECTIONS_PER_PAGE) {
                        alert(ui.alertSectionLimitCopy(MAX_SECTIONS_PER_PAGE));
                        return p;
                      }
                      const nextSections = [...p.sections];
                      nextSections.splice(idx + 1, 0, cloneSection(section));
                      return { ...p, sections: nextSections };
                    })
                  }
                >
                  {ui.copySection}
                </button>
                <button
                  className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-600"
                  onClick={() =>
                    patchActivePage((p) => ({
                      ...p,
                      sections: p.sections.filter((s) => s.id !== section.id)
                    }))
                  }
                >
                  {ui.delete}
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={section.title}
                placeholder={ui.sectionTitlePh}
                onChange={(e) => {
                  patchActivePage((p) => ({
                    ...p,
                    sections: p.sections.map((s) =>
                      s.id === section.id ? { ...s, title: e.target.value } : s
                    )
                  }));
                }}
              />
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {section.fields.map((field) => (
                  <div key={field.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        value={field.label}
                        onChange={(e) => {
                          patchActivePage((p) => ({
                            ...p,
                            sections: p.sections.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id ? { ...f, label: e.target.value } : f
                                    )
                                  }
                                : s
                            )
                          }));
                        }}
                      />
                      <button
                        className="shrink-0 rounded border border-rose-300 px-2 py-1 text-xs text-rose-600"
                        onClick={() => {
                          patchActivePage((p) => ({
                            ...p,
                            sections: p.sections.map((s) =>
                              s.id === section.id
                                ? { ...s, fields: s.fields.filter((f) => f.id !== field.id) }
                                : s
                            )
                          }));
                        }}
                      >
                        {ui.delete}
                      </button>
                    </div>

                    {field.type === "longText" ? (
                      <textarea
                        className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={field.value}
                        onChange={(e) => {
                          patchActivePage((p) => ({
                            ...p,
                            sections: p.sections.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id ? { ...f, value: e.target.value } : f
                                    )
                                  }
                                : s
                            )
                          }));
                        }}
                      />
                    ) : null}

                    {field.type === "shortText" ? (
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={field.value}
                        onChange={(e) => {
                          patchActivePage((p) => ({
                            ...p,
                            sections: p.sections.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id ? { ...f, value: e.target.value } : f
                                    )
                                  }
                                : s
                            )
                          }));
                        }}
                      />
                    ) : null}

                    {field.type === "fileList" ? (
                      <div
                        className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDropFieldFiles(field.id, e)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">{ui.fileDropHint}</span>
                          <label className="inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
                            {ui.chooseFile}
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                              multiple
                              onChange={(e) => {
                                const selected = e.target.files ? Array.from(e.target.files) : [];
                                for (const f of selected) {
                                  void uploadFieldFile(field.id, f);
                                }
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>
                        {busyField === field.id ? <div className="text-xs text-slate-500">{ui.uploading}</div> : null}
                        <div className="max-h-52 space-y-2 overflow-auto">
                          {(filesByField.get(field.id) ?? []).map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-xs"
                            >
                              <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-sky-700">
                                [{fileEmoji(f.name)}] {f.name} ({formatSize(f.sizeBytes)})
                              </a>
                              <button
                                className="ml-2 shrink-0 rounded border border-rose-300 px-2 py-0.5 text-rose-600"
                                onClick={() => void removeFile(f.id)}
                              >
                                {ui.removeFile}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  onClick={() => {
                    patchActivePage((p) => ({
                      ...p,
                      sections: p.sections.map((s) =>
                        s.id === section.id ? { ...s, fields: [...s.fields, makeField("shortText", ui)] } : s
                      )
                    }));
                  }}
                >
                  {ui.addShortText}
                </button>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  onClick={() => {
                    patchActivePage((p) => ({
                      ...p,
                      sections: p.sections.map((s) =>
                        s.id === section.id ? { ...s, fields: [...s.fields, makeField("longText", ui)] } : s
                      )
                    }));
                  }}
                >
                  {ui.addLongText}
                </button>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  onClick={() => {
                    patchActivePage((p) => ({
                      ...p,
                      sections: p.sections.map((s) =>
                        s.id === section.id ? { ...s, fields: [...s.fields, makeField("fileList", ui)] } : s
                      )
                    }));
                  }}
                >
                  {ui.addAttachment}
                </button>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </PageShell>
  );
}
