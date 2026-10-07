import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  columnIdForStage,
  getCrmFollowupsPageStrings,
  labelFollowupKind,
  labelFollowupStage,
  type CrmFollowupsPageStrings
} from "../../i18n/crmFollowupsPageI18n";

type FollowupRow = {
  id: number;
  contact_id: number;
  follow_kind: string;
  stage: string;
  next_followup_at: string | null;
  last_note: string | null;
  owner_user_id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  job_title: string | null;
  group_labels: string | null;
};

type ContactPick = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
};

function contactName(r: Pick<FollowupRow, "first_name" | "last_name">): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return d.slice(0, 10);
}

function rowOverdue(next: string | null): boolean {
  if (!next) return false;
  const t = next.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return t < today;
}

function rowToday(next: string | null): boolean {
  if (!next) return false;
  return next.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

const DND_MIME = "application/x-followup-id";

export function CrmFollowupsPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getCrmFollowupsPageStrings(locale), [locale]);

  const [items, setItems] = useState<FollowupRow[]>([]);
  const [stats, setStats] = useState({ total: 0, overdue: 0, todayDue: 0, weekAhead: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dueFilter, setDueFilter] = useState<"" | "overdue" | "today" | "week">("");
  const [kindFilter, setKindFilter] = useState<"" | "short" | "long">("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");

  const [view, setView] = useState<"board" | "list">("board");
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<FollowupRow | null>(null);
  const [drawerRow, setDrawerRow] = useState<FollowupRow | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dueFilter) params.set("due", dueFilter);
      if (kindFilter) params.set("kind", kindFilter);
      if (stageFilter) params.set("stage", stageFilter);
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();

      const [sRes, lRes] = await Promise.all([
        apiJson<{ ok: boolean; total: number; overdue: number; todayDue: number; weekAhead: number }>(
          "/api/email/followups/stats"
        ),
        apiJson<{ ok: boolean; items: FollowupRow[] }>(`/api/email/followups${qs ? `?${qs}` : ""}`)
      ]);
      setStats({
        total: sRes.total,
        overdue: sRes.overdue,
        todayDue: sRes.todayDue,
        weekAhead: sRes.weekAhead
      });
      setItems(Array.isArray(lRes.items) ? lRes.items : []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dueFilter, kindFilter, stageFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawerRow((prev) => {
      if (!prev) return null;
      const u = items.find((i) => i.id === prev.id);
      return u ?? prev;
    });
  }, [items]);

  useEffect(() => {
    const id = setTimeout(() => setQ(qDraft), 350);
    return () => clearTimeout(id);
  }, [qDraft]);

  const boardGroups = useMemo(() => {
    const map: Record<string, FollowupRow[]> = {};
    for (const c of ui.kanbanColumns) map[c.id] = [];
    for (const r of items) {
      const cid = columnIdForStage(ui.kanbanColumns, r.stage);
      if (map[cid]) map[cid].push(r);
      else map.pool.push(r);
    }
    for (const c of ui.kanbanColumns) {
      map[c.id].sort((a, b) => {
        const an = a.next_followup_at?.slice(0, 10) ?? "9999";
        const bn = b.next_followup_at?.slice(0, 10) ?? "9999";
        return an.localeCompare(bn);
      });
    }
    return map;
  }, [items, ui.kanbanColumns]);

  const subtitle = useMemo(() => {
    if (loading) return ui.subtitleLoading;
    if (error) return error;
    return ui.subtitleDraft;
  }, [loading, error, ui]);

  async function patchStage(followupId: number, stage: string) {
    setMovingId(followupId);
    try {
      await apiJson(`/api/email/followups/${followupId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage })
      });
      await load();
    } catch (e: unknown) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setMovingId(null);
    }
  }

  function onColumnDrop(colId: string, e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND_MIME);
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return;
    const col = ui.kanbanColumns.find((c) => c.id === colId);
    if (!col) return;
    void patchStage(id, col.dropStage);
  }

  return (
    <PageShell
      title={ui.pageTitle}
      description={ui.pageDescription}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/email/contacts/database"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            {ui.crmDatabaseLink}
          </Link>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={() => setAddOpen(true)}
          >
            {ui.addFollowup}
          </button>
        </div>
      }
    >
      {/* 顶部检索条（方案：全局搜索位） */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            className="min-w-[12rem] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder={ui.globalSearchPlaceholder}
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 lg:gap-3">
        <button
          type="button"
          onClick={() => setDueFilter((d) => (d === "today" ? "" : "today"))}
          className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition-colors ${
            dueFilter === "today"
              ? "border-amber-400 bg-amber-50"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className="text-xs text-slate-500">{ui.statToday}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{stats.todayDue}</div>
        </button>
        <button
          type="button"
          onClick={() => setDueFilter((d) => (d === "week" ? "" : "week"))}
          className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition-colors ${
            dueFilter === "week"
              ? "border-sky-400 bg-sky-50"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className="text-xs text-slate-500">{ui.statWeek}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{stats.weekAhead}</div>
        </button>
        <button
          type="button"
          onClick={() => setDueFilter((d) => (d === "overdue" ? "" : "overdue"))}
          className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition-colors ${
            dueFilter === "overdue"
              ? "border-rose-400 bg-rose-50"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className="text-xs text-slate-500">{ui.statOverdue}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-700">{stats.overdue}</div>
        </button>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm shadow-sm">
          <div className="text-xs text-slate-500">{ui.statTotal}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{stats.total}</div>
        </div>
        <div className="col-span-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-3 py-3 text-left text-sm shadow-sm lg:col-span-1">
          <div className="text-xs font-medium text-violet-800">{ui.funnelTitle}</div>
          <div className="mt-1 text-xs leading-snug text-violet-900/80">{ui.funnelHint}</div>
        </div>
      </div>

      <SectionCard title={ui.filterSectionTitle} description={ui.filterSectionDescription}>
        <div className="flex flex-wrap gap-2">
          {ui.tagChips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag((t) => (t === tag ? null : tag))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeTag === tag
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              🏷 {tag}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-800">{ui.kindFilterLabel}</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as "" | "short" | "long")}
            >
              <option value="">{ui.kindFilterAll}</option>
              {ui.kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                  {ui.kindFilterSuffix}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-800">{ui.stageFilterLabel}</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="">{ui.stageFilterAll}</option>
              {ui.stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {dueFilter ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setDueFilter("")}
            >
              {ui.clearDateFilter}
            </button>
          ) : null}
        </div>
      </SectionCard>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{ui.workspaceTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${view === "board" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setView("board")}
            >
              {ui.viewBoard}
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setView("list")}
            >
              {ui.viewList}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500">{ui.subtitleLoading}</div>
        ) : error ? (
          <div className="px-4 py-12 text-center text-sm text-red-600">{error}</div>
        ) : view === "board" ? (
          <div className="overflow-x-auto p-3">
            {items.length === 0 ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">{ui.boardEmptyTitle}</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">{ui.boardEmptyHint}</p>
                <button
                  type="button"
                  className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  onClick={() => setAddOpen(true)}
                >
                  {ui.addFollowup}
                </button>
              </div>
            ) : null}
            <div
              className={`flex min-h-[22rem] gap-3 pb-2 ${items.length === 0 ? "hidden" : ""}`}
              style={{ minWidth: "56rem" }}
            >
              {ui.kanbanColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/80"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onColumnDrop(col.id, e)}
                >
                  <div className="border-b border-slate-200/80 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-900">{col.title}</div>
                    <div className="text-[11px] text-slate-500">{col.subtitle}</div>
                    <div className="mt-1 text-xs tabular-nums text-slate-600">
                      {boardGroups[col.id]?.length ?? 0} {ui.peopleUnit}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {(boardGroups[col.id] ?? []).map((r) => (
                      <KanbanCard
                        key={r.id}
                        row={r}
                        ui={ui}
                        moving={movingId === r.id}
                        onOpen={() => setDrawerRow(r)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {items.length > 0 ? (
              <p className="mt-2 px-1 text-[11px] text-slate-400">{ui.boardDragHint}</p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colNextFollowup}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colKind}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colStage}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colContact}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colCompany}</th>
                  <th className="min-w-[10rem] px-3 py-2 font-medium">{ui.colEmail}</th>
                  <th className="min-w-[8rem] px-3 py-2 font-medium">{ui.colGroups}</th>
                  <th className="min-w-[10rem] px-3 py-2 font-medium">{ui.colLastNote}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{ui.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-600">
                      <p className="font-medium text-slate-800">{ui.listEmptyTitle}</p>
                      <p className="mt-2 text-xs text-slate-500">{ui.listEmptyHint}</p>
                      <button
                        type="button"
                        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        onClick={() => setAddOpen(true)}
                      >
                        {ui.addFollowup}
                      </button>
                    </td>
                  </tr>
                ) : (
                  items.map((r) => {
                    const overdue = rowOverdue(r.next_followup_at);
                    const today = rowToday(r.next_followup_at);
                    return (
                      <tr
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        className={`cursor-pointer border-b border-slate-100 ${
                          overdue
                            ? "bg-rose-50/80"
                            : today
                              ? "bg-amber-50/60"
                              : "hover:bg-slate-50/60"
                        }`}
                        onClick={() => setDrawerRow(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDrawerRow(r);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-900">
                          {formatDate(r.next_followup_at)}
                          {overdue ? (
                            <span className="ml-1 text-xs font-normal text-rose-700">{ui.overdue}</span>
                          ) : null}
                          {today && !overdue ? (
                            <span className="ml-1 text-xs font-normal text-amber-800">{ui.today}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {labelFollowupKind(ui.kinds, r.follow_kind)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {labelFollowupStage(ui.stages, r.stage)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-800">
                          {contactName(r) || "—"}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2 text-slate-800">
                          {(r.company ?? "").trim() || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            className="break-all text-blue-600 hover:underline"
                            href={`mailto:${encodeURIComponent(r.email)}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.email}
                          </a>
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-xs text-slate-600">
                          {(r.group_labels ?? "").trim() || "—"}
                        </td>
                        <td
                          className="max-w-[12rem] truncate px-3 py-2 text-xs text-slate-600"
                          title={r.last_note ?? ""}
                        >
                          {(r.last_note ?? "").trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="text-xs font-medium text-emerald-700 hover:underline"
                            onClick={() => setEditRow(r)}
                          >
                            {ui.edit}
                          </button>
                          <span className="mx-1 text-slate-300">|</span>
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-600 hover:underline"
                            onClick={async () => {
                              if (!confirm(ui.removeConfirm)) return;
                              try {
                                await apiJson(`/api/email/followups/${r.id}`, { method: "DELETE" });
                                await load();
                              } catch (e: unknown) {
                                alert(String((e as Error)?.message ?? e));
                              }
                            }}
                          >
                            {ui.remove}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen ? (
        <AddFollowupModal
          ui={ui}
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      ) : null}

      {editRow ? (
        <EditFollowupModal
          ui={ui}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={async () => {
            setEditRow(null);
            await load();
          }}
        />
      ) : null}

      {drawerRow ? (
        <FollowupDetailDrawer
          ui={ui}
          row={drawerRow}
          onClose={() => setDrawerRow(null)}
          onOpenFullEdit={() => {
            setEditRow(drawerRow);
            setDrawerRow(null);
          }}
          onAfterSave={load}
        />
      ) : null}
    </PageShell>
  );
}

function KanbanCard(props: {
  row: FollowupRow;
  ui: CrmFollowupsPageStrings;
  moving: boolean;
  onOpen: () => void;
}) {
  const { row: r, ui, moving, onOpen } = props;
  const overdue = rowOverdue(r.next_followup_at);
  const today = rowToday(r.next_followup_at);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, String(r.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-lg border bg-white p-2.5 text-left text-sm shadow-sm transition-opacity ${
        moving ? "opacity-50" : ""
      } ${overdue ? "border-rose-200" : today ? "border-amber-200" : "border-slate-200"}`}
    >
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-1">
          <span className="line-clamp-2 font-medium text-slate-900">
            {(r.company ?? "").trim() || r.email}
          </span>
          {overdue ? (
            <span className="shrink-0 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-800">{ui.urgentBadge}</span>
          ) : today ? (
            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-900">{ui.todayBadge}</span>
          ) : null}
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">{r.email}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{labelFollowupStage(ui.stages, r.stage)}</span>
          <span className="tabular-nums text-slate-500">
            {ui.nextPrefix} {formatDate(r.next_followup_at)}
          </span>
        </div>
      </button>
    </div>
  );
}

function FollowupDetailDrawer(props: {
  ui: CrmFollowupsPageStrings;
  row: FollowupRow;
  onClose: () => void;
  onOpenFullEdit: () => void;
  onAfterSave: () => Promise<void>;
}) {
  const { ui, row, onClose, onOpenFullEdit, onAfterSave } = props;
  const [noteDraft, setNoteDraft] = useState(row.last_note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNoteDraft(row.last_note ?? "");
  }, [row.id, row.last_note]);

  async function saveNote() {
    setSaving(true);
    try {
      await apiJson(`/api/email/followups/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ lastNote: noteDraft.trim() || null })
      });
      await onAfterSave();
    } catch (e: unknown) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const timelineMock = [
    { t: ui.timelineSystem, d: ui.timelineJoined, time: "—" },
    { t: ui.timelineDraft, d: ui.timelineDraftDesc, time: "—" },
    ...(row.last_note?.trim()
      ? [{ t: ui.timelineNote, d: row.last_note.trim(), time: ui.timelineRecent }]
      : [])
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        role="presentation"
        aria-hidden
        onMouseDown={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-[61] flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-labelledby="drawer-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 id="drawer-title" className="truncate text-base font-semibold text-slate-900">
              {(row.company ?? "").trim() || contactName(row) || ui.customerDetail}
            </h2>
            <p className="truncate text-xs text-slate-500">{row.email}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label={ui.close}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              {labelFollowupKind(ui.kinds, row.follow_kind)}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {labelFollowupStage(ui.stages, row.stage)}
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              {ui.nextPrefix} {formatDate(row.next_followup_at)}
            </span>
          </div>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.basicInfo}</h3>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
              <dt className="text-slate-500">{ui.contact}</dt>
              <dd className="text-right text-slate-900">{contactName(row) || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
              <dt className="text-slate-500">{ui.jobTitle}</dt>
              <dd className="text-right text-slate-900">{(row.job_title ?? "").trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
              <dt className="text-slate-500">{ui.phone}</dt>
              <dd className="text-right">
                {(row.phone ?? "").trim() ? (
                  <a className="text-blue-600 hover:underline" href={`tel:${row.phone}`}>
                    {row.phone}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
              <dt className="text-slate-500">{ui.groups}</dt>
              <dd className="text-right text-slate-900">{(row.group_labels ?? "").trim() || "—"}</dd>
            </div>
          </dl>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.quickActions}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              href={`mailto:${encodeURIComponent(row.email)}`}
            >
              {ui.sendEmail}
            </a>
            {(row.phone ?? "").trim() ? (
              <a
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                href={`tel:${row.phone}`}
              >
                {ui.callPhone}
              </a>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              onClick={onOpenFullEdit}
            >
              {ui.fullEdit}
            </button>
          </div>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.timelineTitle}</h3>
          <p className="mt-1 text-[11px] text-slate-400">{ui.timelineHint}</p>
          <ul className="relative mt-3 space-y-0 border-l-2 border-slate-200 pl-4">
            {timelineMock.map((ev, i) => (
              <li key={i} className="relative pb-4">
                <span className="absolute -left-[calc(0.25rem+5px)] top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-white" />
                <div className="text-xs font-medium text-slate-800">{ev.t}</div>
                <div className="text-xs text-slate-600">{ev.d}</div>
                <div className="text-[10px] text-slate-400">{ev.time}</div>
              </li>
            ))}
          </ul>

          <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.writeFollowup}</h3>
          <textarea
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder={ui.notePlaceholder}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <button
            type="button"
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void saveNote()}
          >
            {saving ? ui.saving : ui.saveNote}
          </button>
        </div>
      </aside>
    </>
  );
}

function AddFollowupModal(props: {
  ui: CrmFollowupsPageStrings;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { ui } = props;
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [contacts, setContacts] = useState<ContactPick[]>([]);
  const [picked, setPicked] = useState<ContactPick | null>(null);

  const [followKind, setFollowKind] = useState<"short" | "long">("short");
  const [stage, setStage] = useState("none");
  const [nextAt, setNextAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const searchContacts = useCallback(async () => {
    setPicking(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("page", "1");
      params.set("pageSize", "40");
      const res = await apiJson<{ ok: boolean; items: ContactPick[] }>(`/api/email/contacts?${params}`);
      setContacts(Array.isArray(res.items) ? res.items : []);
    } catch {
      setContacts([]);
    } finally {
      setPicking(false);
    }
  }, [search]);

  useEffect(() => {
    const id = setTimeout(() => void searchContacts(), 300);
    return () => clearTimeout(id);
  }, [search, searchContacts]);

  async function submit() {
    if (!picked) return;
    setSaving(true);
    try {
      await apiJson("/api/email/followups", {
        method: "POST",
        body: JSON.stringify({
          contactId: picked.id,
          followKind,
          stage,
          nextFollowupAt: nextAt || null,
          lastNote: note || null
        })
      });
      await props.onSaved();
    } catch (e: unknown) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="follow-add-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="follow-add-title" className="text-lg font-semibold text-slate-900">
          {ui.addModalTitle}
        </h2>
        {step === "pick" ? (
          <>
            <p className="mt-2 text-xs text-slate-500">{ui.pickContactHint}</p>
            <input
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={ui.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-100">
              {picking ? (
                <div className="p-4 text-center text-sm text-slate-500">{ui.searching}</div>
              ) : contacts.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">{ui.noContactResults}</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {contacts.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => {
                            setPicked(c);
                            setStep("form");
                          }}
                        >
                          <div className="font-medium text-slate-900">{c.email}</div>
                          <div className="text-xs text-slate-500">
                            {name || "—"} · {c.company || "—"}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs text-slate-600">
              {ui.selectedPrefix}
              <span className="font-medium">{picked?.email}</span>
              <button type="button" className="ml-2 text-blue-600 hover:underline" onClick={() => setStep("pick")}>
                {ui.reselect}
              </button>
            </p>
            <div className="mt-4 space-y-3">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{ui.followKindLabel}</span>
                <select
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={followKind}
                  onChange={(e) => setFollowKind(e.target.value as "short" | "long")}
                >
                  <option value="short">{ui.kindShortLong}</option>
                  <option value="long">{ui.kindLongLong}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{ui.stageLabel}</span>
                <select
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  {ui.stages.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{ui.nextDateLabel}</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={nextAt}
                  onChange={(e) => setNextAt(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">{ui.noteLabel}</span>
                <textarea
                  className="min-h-[4rem] rounded-lg border border-slate-200 px-3 py-2"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={ui.notePlaceholderShort}
                />
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm"
                onClick={props.onClose}
                disabled={saving}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? ui.saving : ui.save}
              </button>
            </div>
          </>
        )}

        {step === "pick" ? (
          <div className="mt-4 flex justify-end">
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={props.onClose}>
              {ui.close}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditFollowupModal(props: {
  ui: CrmFollowupsPageStrings;
  row: FollowupRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { ui, row } = props;
  const [followKind, setFollowKind] = useState<"short" | "long">(
    row.follow_kind === "long" ? "long" : "short"
  );
  const [stage, setStage] = useState(row.stage);
  const [nextAt, setNextAt] = useState(row.next_followup_at?.slice(0, 10) ?? "");
  const [note, setNote] = useState(row.last_note ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await apiJson(`/api/email/followups/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          followKind,
          stage,
          nextFollowupAt: nextAt.trim() ? nextAt : null,
          lastNote: note
        })
      });
      await props.onSaved();
    } catch (e: unknown) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="follow-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="follow-edit-title" className="text-lg font-semibold text-slate-900">
          {ui.editModalTitle}
        </h2>
        <p className="mt-1 text-xs text-slate-500">{row.email}</p>
        <div className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm">
            <span>{ui.followKindLabel}</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={followKind}
              onChange={(e) => setFollowKind(e.target.value as "short" | "long")}
            >
              <option value="short">{ui.kindShort}</option>
              <option value="long">{ui.kindLong}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{ui.stageLabel}</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {ui.stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{ui.nextDateLabel}</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{ui.noteLabel}</span>
            <textarea
              className="min-h-[4rem] rounded-lg border border-slate-200 px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm"
            onClick={props.onClose}
            disabled={saving}
          >
            {ui.cancel}
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? ui.saving : ui.save}
          </button>
        </div>
      </div>
    </div>
  );
}
