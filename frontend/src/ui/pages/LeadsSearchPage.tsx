import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";
import {
  DEFAULT_LEAD_FINDER_COLUMNS,
  LEAD_FINDER_COLUMNS,
  type LeadFinderColumnId
} from "../../lib/leadFinderColumns";
import {
  DEFAULT_LEAD_FINDER_ROLES,
  LEAD_FINDER_ROLE_TIERS,
  type LeadFinderRoleTierId
} from "../../lib/leadFinderRoleTiers";
import {
  buildCards,
  CompanyDetail,
  downloadCardsCsv,
  EventLog,
  isLive,
  ProgressBar,
  StatusTag,
  type EventRow,
  type Job
} from "./leadFinderShared";

export function LeadsSearchPage() {
  const [domainQuery, setDomainQuery] = useState("");
  const [roles, setRoles] = useState<LeadFinderRoleTierId[]>([...DEFAULT_LEAD_FINDER_ROLES]);
  const [columns, setColumns] = useState<LeadFinderColumnId[]>([...DEFAULT_LEAD_FINDER_COLUMNS]);

  const [singleVerify, setSingleVerify] = useState(true);
  const [singleSync, setSingleSync] = useState(true);
  const [singleJob, setSingleJob] = useState<Job | null>(null);
  const [singleEvents, setSingleEvents] = useState<EventRow[]>([]);
  const [singleErr, setSingleErr] = useState("");
  const [busy, setBusy] = useState(false);

  const singleRunning = isLive(singleJob);
  const singlePct =
    singleJob && Number(singleJob.quota) > 0
      ? Math.min(100, Math.round((Number(singleJob.processed) / Number(singleJob.quota)) * 100))
      : 0;

  const loadSingle = useCallback(async (id?: number | null) => {
    const q = id ? `?jobId=${id}` : "?mode=single";
    const r = await apiJson<{ ok: boolean; job: Job | null; events: EventRow[] }>(`/api/leads/search-task${q}`);
    setSingleJob(r.job || null);
    setSingleEvents(r.events || []);
  }, []);

  useEffect(() => {
    void loadSingle();
  }, [loadSingle]);

  useEffect(() => {
    if (!singleRunning || !singleJob?.id) return;
    const id = singleJob.id;
    const t = window.setInterval(() => void loadSingle(id), 2500);
    return () => window.clearInterval(t);
  }, [singleRunning, singleJob?.id, loadSingle]);

  const toggleColumn = (id: LeadFinderColumnId) =>
    setColumns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleRole = (id: LeadFinderRoleTierId) =>
    setRoles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const titleText = LEAD_FINDER_ROLE_TIERS.filter((t) => roles.includes(t.id))
    .map((t) => t.en)
    .join(", ");

  function checkPicks(setE: (s: string) => void): boolean {
    if (!columns.length) {
      setE("请至少勾选一个要查找 / 展示的字段");
      return false;
    }
    if (!roles.length) {
      setE("请至少勾选一类目标职位");
      return false;
    }
    return true;
  }

  async function startSingle() {
    setSingleErr("");
    if (!domainQuery.trim()) {
      setSingleErr("请输入企业官网或域名");
      return;
    }
    if (!checkPicks(setSingleErr)) return;
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; jobId?: number; message?: string }>("/api/leads/search-task/single", {
        method: "POST",
        body: JSON.stringify({
          domain: domainQuery.trim(),
          titles: titleText || "CEO, Founder",
          roleTiers: roles,
          verifyEmail: singleVerify,
          syncCrm: singleSync
        })
      });
      if (!r.ok) throw new Error(r.message || "启动失败");
      await loadSingle(r.jobId);
    } catch (e: unknown) {
      setSingleErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function stopJob(id: number | undefined, reload: (id?: number | null) => Promise<void>, setE: (s: string) => void) {
    if (!id) return;
    setBusy(true);
    try {
      await apiJson("/api/leads/search-task/stop", { method: "POST", body: JSON.stringify({ jobId: id }) });
      await reload(id);
    } catch (e: unknown) {
      setE(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const singleCard = useMemo(() => {
    if (!singleJob) return null;
    const d = singleJob.companies?.[0]?.domain;
    if (!d) return null;
    const rows = (singleJob.resultRows || []).length ? singleJob.resultRows || [] : singleJob.researchRows || [];
    return buildCards(singleJob, [d], rows)[0] || null;
  }, [singleJob]);

  const singleStats = useMemo(() => {
    if (!singleCard) return { contacts: 0, validMails: 0 };
    return {
      contacts: singleCard.rows.filter((r) => String(r.contact || "").trim()).length,
      validMails: singleCard.rows.filter((r) => r.email && r.email_status === "valid").length
    };
  }, [singleCard]);

  return (
    <PageShell
      title="企业leads精搜"
      titleClassName="text-xs font-semibold"
    >
      {/* 描述文案与导出记录/行业企业搜索入口已去掉（Watson 2026-09-27） */}

      <SectionCard title="单企业精搜" titleClassName="text-xs">
        <label className="block text-xs">
          <span className="mb-1 block text-slate-600">企业官网或域名</span>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            value={domainQuery}
            onChange={(e) => setDomainQuery(e.target.value)}
            placeholder="example.com 或 https://www.example.com/"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mt-1 block text-xs text-slate-500">
            只搜这一家：企业介绍、人数、成立时间、融资、搜到的人和职位、邮箱、公共联系邮箱。
          </span>
        </label>

        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-slate-800">Columns · 要查找 / 展示的字段</div>
          <div className="grid max-h-56 grid-cols-2 gap-x-3 gap-y-1.5 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs sm:grid-cols-3">
            {LEAD_FINDER_COLUMNS.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={columns.includes(c.id)} onChange={() => toggleColumn(c.id)} />
                {c.zh}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-slate-800">目标职位 · 勾选后只保留匹配层级（可多选）</div>
          <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
            {LEAD_FINDER_ROLE_TIERS.map((r) => (
              <label key={r.id} className="flex items-start gap-2">
                <input type="checkbox" checked={roles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                <span>{r.zh}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-xs text-white disabled:opacity-50"
            disabled={busy || singleRunning}
            onClick={() => void startSingle()}
          >
            {singleRunning ? "正在精搜…" : "开始单企业精搜"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-xs disabled:opacity-50"
            disabled={busy || !singleRunning}
            onClick={() => void stopJob(singleJob?.id, loadSingle, setSingleErr)}
          >
            停止
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={singleVerify} onChange={(e) => setSingleVerify(e.target.checked)} />
            验证邮箱
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={singleSync} onChange={(e) => setSingleSync(e.target.checked)} />
            同步入 CRM 数据库
          </label>
        </div>
        {singleErr ? <p className="mt-2 text-xs text-rose-600">{singleErr}</p> : null}
      </SectionCard>

      <div className="mt-4">
        <SectionCard title="搜索结果" titleClassName="text-xs">
          {!singleJob ? (
            <p className="text-xs text-slate-500">
              输入企业官网并点「开始单企业精搜」，搜到的企业信息、联系人和邮箱会显示在这里。
            </p>
          ) : singleRunning ? (
            <>
              <p className="text-xs text-emerald-800">
                {singlePct > 0 ? `正在搜索… ${singlePct}%` : "排队中…"}
                {singleJob.current_note ? ` · ${singleJob.current_note}` : ""}
              </p>
              <ProgressBar pct={singlePct} indeterminate={singlePct === 0} />
            </>
          ) : singleJob.error_message ? (
            <p className="text-xs text-rose-600">{singleJob.error_message}</p>
          ) : singleCard && (singleCard.rows.length || singleCard.profile.intro) ? (
            <div className="rounded border-2 p-3" style={{ borderColor: "#10b981", background: "#ecfdf5" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">
                  ✓ 搜索完成 · 联系人 {singleStats.contacts} · 有效邮箱 {singleStats.validMails}
                </span>
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-3 py-1 text-xs text-white"
                  onClick={() => downloadCardsCsv([singleCard], `lead-${singleCard.domain}.csv`, columns)}
                >
                  导出 CSV
                </button>
              </div>
              <div className="mb-2 text-xs font-semibold text-emerald-800">企业信息</div>
              <CompanyDetail card={singleCard} columns={columns} />
              {singleCard.rows.length ? (
                <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-800">
                    搜索结果明细（{singleCard.rows.length} 条）
                  </div>
                  <div
                    className={`overflow-x-auto${
                      singleCard.rows.length > 15 ? " max-h-96 overflow-y-auto" : ""
                    }`}
                  >
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className="py-1.5 pr-3 font-medium">姓名</th>
                          <th className="py-1.5 pr-3 font-medium">职位</th>
                          <th className="py-1.5 pr-3 font-medium">邮箱</th>
                          <th className="py-1.5 pr-3 font-medium">验证状态</th>
                          <th className="py-1.5 pr-3 font-medium">电话</th>
                        </tr>
                      </thead>
                      <tbody>
                        {singleCard.rows.map((r, i) => (
                          <tr key={`${r.contact || r.email || i}`} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-800">{r.contact || "—"}</td>
                            <td className="py-1.5 pr-3 text-slate-600">
                              {r.contact ? r.title || "—" : "公共邮箱"}
                            </td>
                            <td className="py-1.5 pr-3 text-slate-800">{r.email || "—"}</td>
                            <td className="py-1.5 pr-3">
                              <StatusTag status={r.email_status} />
                            </td>
                            <td className="py-1.5 pr-3 text-slate-600">{r.phone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">暂未搜到结果，换个官网或域名再试。</p>
          )}
          {singleRunning ? <EventLog events={singleEvents} /> : null}
        </SectionCard>
      </div>
    </PageShell>
  );
}
