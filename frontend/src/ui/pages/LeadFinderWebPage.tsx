import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { apiJson } from "../../lib/api";
import {
  DEFAULT_LEAD_FINDER_COLUMNS,
  LEAD_FINDER_COLUMNS,
  LEAD_FINDER_EMAIL_FILTERS,
  MAX_DOMAINS_PER_PAGE,
  type LeadFinderColumnId
} from "../../lib/leadFinderColumns";
import {
  DEFAULT_LEAD_FINDER_ROLES,
  LEAD_FINDER_ROLE_TIERS,
  type LeadFinderRoleTierId
} from "../../lib/leadFinderRoleTiers";
import {
  getOrCreateLeadFinderInstallId,
  leadFinderCapability
} from "../../lib/leadFinderWebApi";
import {
  leadFinderBlockToCsv,
  runLeadFinderWebSearch,
  splitContactName,
  verifyLeadFinderBlockPeople
} from "../../lib/leadFinderWebSearch";
import type { LeadFinderCompanyBlock, ProgressItemState } from "../../lib/leadFinderWebTypes";

import { LeadFinderAutoPanel } from "./LeadFinderAutoPanel";

type TabId = "search" | "results" | "settings" | "auto";
type ResultSubTab = "emails" | "tech" | "signals";
type EmailFilter = "all" | "people" | "decision_makers" | "generic";

const COLUMNS_KEY = "bss_standalone_lf_columns_v1";
const ROLES_KEY = "bss_standalone_lf_roles_v1";

function loadColumns(): LeadFinderColumnId[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return [...DEFAULT_LEAD_FINDER_COLUMNS];
    const arr = JSON.parse(raw) as string[];
    const allowed = new Set(LEAD_FINDER_COLUMNS.map((c) => c.id));
    const filtered = arr.filter((id): id is LeadFinderColumnId => allowed.has(id as LeadFinderColumnId));
    return filtered.length ? filtered : [...DEFAULT_LEAD_FINDER_COLUMNS];
  } catch {
    return [...DEFAULT_LEAD_FINDER_COLUMNS];
  }
}

function loadRoles(): LeadFinderRoleTierId[] {
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    if (!raw) return [...DEFAULT_LEAD_FINDER_ROLES];
    const arr = JSON.parse(raw) as string[];
    const allowed = new Set(LEAD_FINDER_ROLE_TIERS.map((t) => t.id));
    const filtered = arr.filter((id): id is LeadFinderRoleTierId =>
      allowed.has(id as LeadFinderRoleTierId)
    );
    return filtered.length ? filtered : [...DEFAULT_LEAD_FINDER_ROLES];
  } catch {
    return [...DEFAULT_LEAD_FINDER_ROLES];
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ProgressIcon({ status }: { status: ProgressItemState["status"] }) {
  if (status === "running") {
    return <span className="lf-spinner" aria-hidden />;
  }
  if (status === "done") return <span className="lf-ok">✓</span>;
  if (status === "error") return <span className="lf-err">!</span>;
  return <span className="lf-dot">·</span>;
}

function CompanyPreviewCard({
  block,
  zh
}: {
  block: LeadFinderCompanyBlock;
  zh: boolean;
}) {
  const dms = (block.contacts || []).filter((c) => String(c.kind) === "decision_makers");
  const people = (block.contacts || []).filter((c) => String(c.kind) === "people");
  const generics = (block.contacts || []).filter((c) => String(c.kind) === "generic");

  const renderRows = (rows: typeof block.contacts, empty: string) => (
    <div className="lf-preview-table-wrap">
      <table className="lf-preview-table">
        <thead>
          <tr>
            <th>{zh ? "人名" : "Name"}</th>
            <th>{zh ? "职位" : "Title"}</th>
            <th>{zh ? "邮箱" : "Email"}</th>
            <th>{zh ? "电话" : "Phone"}</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((c, i) => (
            <tr key={`${c.kind}-${c.contact_name || c.email}-${i}`}>
              <td>{c.contact_name || "—"}</td>
              <td>{c.title || "—"}</td>
              <td>{c.email || (zh ? "待验证" : "pending")}</td>
              <td>{c.phone || block.phone || "—"}</td>
            </tr>
          ))}
          {!(rows || []).length ? (
            <tr>
              <td colSpan={4}>{empty}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="lf-preview">
      <h3 className="lf-co-name">{block.company_name}</h3>
      <p className="lf-desc">{block.description || (zh ? "（暂无公司介绍）" : "(No description yet)")}</p>
      <div className="lf-kv">
        <div>
          <div className="k">{zh ? "官网" : "Website"}</div>
          <div className="v">
            <a href={block.website || `https://${block.domain}`} target="_blank" rel="noreferrer">
              {block.website || block.domain}
            </a>
          </div>
        </div>
        <div>
          <div className="k">{zh ? "行业标签" : "Industry"}</div>
          <div className="v">
            {[block.industry, ...(block.tags || [])].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div>
          <div className="k">{zh ? "规模" : "Size"}</div>
          <div className="v">{block.size || "—"}</div>
        </div>
        <div>
          <div className="k">{zh ? "成立时间" : "Founded"}</div>
          <div className="v">{block.year_founded || "—"}</div>
        </div>
        <div>
          <div className="k">{zh ? "国家 / 城市" : "Country / City"}</div>
          <div className="v">
            {[block.country, block.city || block.location].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div>
          <div className="k">{zh ? "企业电话" : "Company phone"}</div>
          <div className="v">{block.phone || "—"}</div>
        </div>
        <div>
          <div className="k">LinkedIn</div>
          <div className="v">
            {block.linkedin ? (
              <a href={block.linkedin} target="_blank" rel="noreferrer">
                {block.linkedin}
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      <div className="lf-roster-summary">
        {zh
          ? `名单合计 ${block.contacts.length} · 决策者 ${dms.length} · People ${people.length} · Generic ${generics.length}`
          : `Total ${block.contacts.length} · DM ${dms.length} · People ${people.length} · Generic ${generics.length}`}
      </div>

      <div className="lf-sources-title" style={{ marginTop: 12 }}>
        {zh ? `决策者 Key decision makers（${dms.length}）` : `Key decision makers (${dms.length})`}
      </div>
      {renderRows(dms, zh ? "（本栏暂无）" : "(none)")}

      <div className="lf-sources-title" style={{ marginTop: 14 }}>
        {zh ? `People 个人（${people.length}）` : `People (${people.length})`}
      </div>
      {renderRows(people, zh ? "（本栏暂无）" : "(none)")}

      <div className="lf-sources-title" style={{ marginTop: 14 }}>
        {zh ? `Generic 企业公开邮箱（${generics.length}）` : `Generic company emails (${generics.length})`}
      </div>
      {renderRows(generics, zh ? "（未发现公开通用邮箱）" : "(no public generic mailboxes)")}
    </div>
  );
}

export function LeadFinderWebPage() {
  const { locale } = useSiteLocale();
  const zh = locale !== "en";

  const [tab, setTab] = useState<TabId>("search");
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<LeadFinderColumnId[]>(() => loadColumns());
  const [roles, setRoles] = useState<LeadFinderRoleTierId[]>(() => loadRoles());
  const [installId] = useState(() => getOrCreateLeadFinderInstallId());
  const [capMsg, setCapMsg] = useState("");
  const [upstream, setUpstream] = useState("");
  const [searching, setSearching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [previewBlock, setPreviewBlock] = useState<LeadFinderCompanyBlock | null>(null);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [progress, setProgress] = useState<ProgressItemState[]>([]);
  const [pages, setPages] = useState<LeadFinderCompanyBlock[][]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [resultSubTab, setResultSubTab] = useState<ResultSubTab>("emails");
  const [toast, setToast] = useState("");
  const [toastErr, setToastErr] = useState(false);
  const [agentLine, setAgentLine] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const currentPage = pages[pageIndex] || [];
  const activeBlock =
    currentPage.find((b) => b.domain === activeDomain) || currentPage[0] || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await leadFinderCapability();
        if (cancelled) return;
        setCapMsg(r.message || "");
        setUpstream(r.upstream || "");
      } catch (e: unknown) {
        if (!cancelled) setCapMsg(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiJson<{
          ok?: boolean;
          activated?: boolean;
          hasKey?: boolean;
          agentName?: string | null;
          apiKeyMasked?: string | null;
        }>("/api/standalone/agent-brain/config");
        if (cancelled) return;
        if (r.hasKey && r.activated) {
          setAgentLine(
            zh
              ? `AI 大脑已激活 · ${r.agentName || "智能体"} · ${r.apiKeyMasked || ""}`
              : `AI brain active · ${r.agentName || "agent"} · ${r.apiKeyMasked || ""}`
          );
        } else if (r.hasKey) {
          setAgentLine(zh ? "已保存 API Key，请到自动化任务页激活 AI 大脑" : "API key saved — activate AI brain on Automation tasks");
        } else {
          setAgentLine(zh ? "尚未配置 AI Key — 请到「自动化任务 → AI 大脑」" : "No AI key — configure under Automation → AI brain");
        }
      } catch {
        if (!cancelled) {
          setAgentLine(zh ? "无法读取 AI 大脑配置" : "Could not load AI brain config");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zh]);

  const toggleColumn = useCallback((id: LeadFinderColumnId) => {
    setColumns((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const final = next.length ? next : [...DEFAULT_LEAD_FINDER_COLUMNS];
      try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(final));
      } catch {
        /* ignore */
      }
      return final;
    });
  }, []);

  const toggleRole = useCallback((id: LeadFinderRoleTierId) => {
    setRoles((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const final = next.length ? next : [...DEFAULT_LEAD_FINDER_ROLES];
      try {
        localStorage.setItem(ROLES_KEY, JSON.stringify(final));
      } catch {
        /* ignore */
      }
      return final;
    });
  }, []);

  const showToast = (msg: string, err = false) => {
    setToast(msg);
    setToastErr(err);
  };

  const commitBlockToPages = useCallback(
    (block: LeadFinderCompanyBlock) => {
      setPages((prev) => {
        const copy = prev.map((p) => [...p]);
        while (copy.length <= pageIndex) copy.push([]);
        const page = [...(copy[pageIndex] || [])];
        const idx = page.findIndex((b) => b.domain === block.domain);
        if (idx >= 0) page[idx] = block;
        else page.push(block);
        copy[pageIndex] = page;
        return copy;
      });
      setActiveDomain(block.domain);
    },
    [pageIndex]
  );

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setStatus(zh ? "请输入企业官网域名或完整网址" : "Enter a company domain or URL");
      setStatusErr(true);
      return;
    }
    if (!columns.length) {
      setStatus(zh ? "请至少勾选一个展示字段" : "Select at least one column");
      setStatusErr(true);
      return;
    }
    if (!roles.length) {
      setStatus(zh ? "请至少勾选一类目标职位" : "Select at least one role tier");
      setStatusErr(true);
      return;
    }
    if (currentPage.length >= MAX_DOMAINS_PER_PAGE) {
      setStatus(
        zh
          ? `本页已满 ${MAX_DOMAINS_PER_PAGE} 个域名，请点「新结果页」`
          : `Page full (${MAX_DOMAINS_PER_PAGE}) — open a new results page`
      );
      setStatusErr(true);
      return;
    }

    setSearching(true);
    setVerifying(false);
    setPreviewBlock(null);
    setStatusErr(false);
    setStatus(zh ? "按逻辑展开搜索中…" : "Running expanded search…");
    setProgress([]);
    try {
      const block = await runLeadFinderWebSearch({
        query: q,
        installId,
        columns,
        roles,
        zh,
        onProgress: setProgress
      });
      setPreviewBlock(block);
      commitBlockToPages(block);
      setStatus(
        zh
          ? `搜索完成 · ${block.domain} · 决策者 ${block.contacts.filter((c) => c.kind === "decision_makers").length} · People ${block.contacts.filter((c) => c.kind === "people").length} · Generic ${block.contacts.filter((c) => c.kind === "generic").length} — 请核对后验邮`
          : `Search done · ${block.domain} · DM ${block.contacts.filter((c) => c.kind === "decision_makers").length} · People ${block.contacts.filter((c) => c.kind === "people").length} · Generic ${block.contacts.filter((c) => c.kind === "generic").length}`
      );
      setStatusErr(false);
      showToast(zh ? "搜索完成，尚未验邮" : "Search done — email verify not started");
    } catch (e: unknown) {
      setStatus(String((e as Error)?.message ?? e));
      setStatusErr(true);
    } finally {
      setSearching(false);
    }
  };

  const startVerify = async () => {
    if (!previewBlock || verifying) return;
    setVerifying(true);
    showToast(zh ? "正在批量验证邮箱…" : "Batch-verifying emails…");
    try {
      const verified = await verifyLeadFinderBlockPeople(previewBlock, installId, (next) => {
        setPreviewBlock(next);
        commitBlockToPages(next);
      });
      const okN = verified.contacts.filter(
        (c) => String(c.email_status).toLowerCase() === "valid" && c.email
      ).length;
      showToast(
        zh
          ? `邮箱验证完成 · ${okN}/${verified.contacts.length} 有效`
          : `Email verify done · ${okN}/${verified.contacts.length} valid`
      );
      setTab("results");
    } catch (e: unknown) {
      showToast(String((e as Error)?.message ?? e), true);
    } finally {
      setVerifying(false);
    }
  };

  const filteredContacts = useMemo(() => {
    if (!activeBlock) return [];
    return (activeBlock.contacts || []).filter((c) => {
      if (emailFilter === "all") return true;
      const kind = String(c.kind || "people");
      if (emailFilter === "generic") return kind === "generic";
      if (emailFilter === "decision_makers") return kind === "decision_makers";
      return kind === "people";
    });
  }, [activeBlock, emailFilter]);

  const countKind = (kind: string) => {
    if (kind === "all") return (activeBlock?.contacts || []).length;
    return (activeBlock?.contacts || []).filter((c) => String(c.kind || "people") === kind).length;
  };

  const exportCsv = () => {
    if (!activeBlock) return;
    const csv = leadFinderBlockToCsv(activeBlock);
    downloadText(`lead-finder-${activeBlock.domain}.csv`, csv);
    showToast(zh ? "CSV 已下载" : "CSV downloaded");
  };

  const importCrm = async () => {
    if (!activeBlock) return;
    const industry =
      (activeBlock.industry || "").trim() ||
      (activeBlock.tags || [])[0] ||
      "Lead Finder";
    const rows = (activeBlock.contacts || [])
      .filter((c) => String(c.email_status).toLowerCase() === "valid" && c.email)
      .map((c) => {
        const { firstName, lastName } = splitContactName(String(c.contact_name || ""));
        return {
          email: c.email,
          firstName,
          lastName,
          company: activeBlock.company_name,
          country: activeBlock.country || undefined,
          industry,
          phone: c.phone || undefined,
          jobTitle: c.title || undefined,
          website: activeBlock.website || `https://${activeBlock.domain}`,
          linkedin: c.linkedin || activeBlock.linkedin || undefined,
          emailStatus: "valid" as const,
          tags: ["lead_finder"]
        };
      });
    if (!rows.length) {
      showToast(zh ? "没有已验证有效邮箱可导入" : "No valid emails to import", true);
      return;
    }
    setImportBusy(true);
    try {
      const r = await apiJson<{ ok?: boolean; imported?: number; rejected?: number; message?: string }>(
        "/api/email/contacts/import",
        { method: "POST", body: JSON.stringify({ contacts: rows }) }
      );
      if (!r.ok) throw new Error(r.message || "import failed");
      showToast(
        zh
          ? `已导入 CRM ${r.imported ?? rows.length} 条 · 行业「${industry}」`
          : `Imported ${r.imported ?? rows.length} to CRM · industry “${industry}”`
      );
    } catch (e: unknown) {
      showToast(String((e as Error)?.message ?? e), true);
    } finally {
      setImportBusy(false);
    }
  };

  const newResultsPage = () => {
    setPages((prev) => [...prev, []]);
    setPageIndex(pages.length);
    setActiveDomain(null);
    setTab("results");
  };

  const showCol = (id: string) => (activeBlock?.columns || columns).includes(id);

  return (
    <PageShell
      title={zh ? "Lead Finder · 插件网页版" : "Lead Finder · web"}
      description={
        zh
          ? "与主站 Chrome 插件同款能力：按官网域名搜高管 / 验邮 / 导出 CSV，并可一键导入本站 CRM（industry 写真实行业标签）。"
          : "Same capabilities as the Chrome Lead Finder: domain search, verify, CSV, and import into this site’s CRM with real industry tags."
      }
    >
      <style>{LF_CSS}</style>

      <div className="lf-shell">
        <header className="lf-header">
          <h2 className="lf-title">{zh ? "Leads 找邮" : "Lead Finder"}</h2>
          {(
            [
              ["search", zh ? "搜索" : "Search"],
              ["auto", zh ? "自动日搜" : "Daily auto"],
              ["results", zh ? "结果" : "Results"],
              ["settings", zh ? "设置" : "Settings"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`lf-tab ${tab === id ? "on" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </header>

        {tab === "auto" ? <LeadFinderAutoPanel zh={zh} /> : null}

        {tab === "search" ? (
          <section className="lf-panel">
            <p className="lf-meta">{capMsg || (zh ? "检测上游…" : "Checking upstream…")}</p>
            {upstream ? <p className="lf-meta">Upstream: {upstream}</p> : null}

            <label className="lf-field">
              <span>{zh ? "企业官网或域名" : "Company website or domain"}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searching) void runSearch();
                }}
                placeholder="example.com or https://www.example.com/"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="lf-hint">
                {zh
                  ? "可输入官网域名或完整网址，例如 example.com / https://www.example.com/"
                  : "Enter a domain or full URL"}
              </span>
            </label>

            <div className="lf-sources">
              <div className="lf-sources-title">
                {zh ? "Columns · 要查找 / 展示的字段" : "Columns · fields to find / show"}
              </div>
              <div className="lf-columns">
                {LEAD_FINDER_COLUMNS.map((c) => (
                  <label key={c.id} className="lf-check">
                    <input
                      type="checkbox"
                      checked={columns.includes(c.id)}
                      onChange={() => toggleColumn(c.id)}
                    />
                    <span>{zh ? c.zh : c.en}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="lf-sources" style={{ marginTop: 12 }}>
              <div className="lf-sources-title">
                {zh
                  ? "目标职位 · 勾选后只保留匹配层级（可多选）"
                  : "Target roles · keep matching tiers (multi-select)"}
              </div>
              <div className="lf-roles">
                {LEAD_FINDER_ROLE_TIERS.map((r) => (
                  <label key={r.id} className="lf-check lf-role">
                    <input
                      type="checkbox"
                      checked={roles.includes(r.id)}
                      onChange={() => toggleRole(r.id)}
                    />
                    <span>{zh ? r.zh : r.en}</span>
                  </label>
                ))}
              </div>
              <p className="lf-hint" style={{ marginTop: 6 }}>
                {zh
                  ? "搜索与插件一致：官网 / 新闻访谈 / 职位多路径 / LinkedIn（及勾选的社媒）全部并行；职位勾选只影响排序，不删减名单。完成后保留 People + Decision makers + Generic 公开邮箱。"
                  : "Same as the plugin: website / news-interviews / title paths / LinkedIn (and checked social) run in parallel. Role ticks only sort — they do not drop people. Keeps People + Decision makers + Generic mailboxes."}
              </p>
            </div>

            <div className="lf-row">
              <button
                type="button"
                className="lf-btn primary"
                disabled={searching || verifying}
                onClick={() => void runSearch()}
              >
                {searching ? (zh ? "搜索中…" : "Searching…") : zh ? "搜索" : "Search"}
              </button>
            </div>

            {progress.length ? (
              <div className="lf-progress">
                <div className="lf-sources-title">
                  {zh ? "搜索进度（展开逻辑标签）" : "Search progress (expanded steps)"}
                </div>
                <ul className="lf-progress-list">
                  {progress.map((p) => (
                    <li
                      key={p.id}
                      className={`lf-progress-item is-${p.status}${p.isPhase ? " is-phase" : ""}`}
                    >
                      <ProgressIcon status={p.status} />
                      <span className="p-label">{p.label}</span>
                      <span className="p-note">{p.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className={`lf-status ${statusErr ? "err" : ""}`}>{status}</p>

            {previewBlock && !searching ? (
              <div className="lf-preview-wrap">
                <div className="lf-sources-title">
                  {zh
                    ? "搜索结果预览（验邮前核对）"
                    : "Search preview (review before email verify)"}
                </div>
                <CompanyPreviewCard block={previewBlock} zh={zh} />
                <div className="lf-row">
                  <button
                    type="button"
                    className="lf-btn primary"
                    disabled={verifying || !previewBlock.contacts.length}
                    onClick={() => void startVerify()}
                  >
                    {verifying
                      ? zh
                        ? "验证邮箱中…"
                        : "Verifying emails…"
                      : zh
                        ? "开始验证邮箱"
                        : "Start email verify"}
                  </button>
                  <button
                    type="button"
                    className="lf-btn ghost"
                    onClick={() => setTab("results")}
                  >
                    {zh ? "查看结果页" : "Open results"}
                  </button>
                </div>
              </div>
            ) : null}

            <p className="lf-crm-tip">
              {zh ? "导入 CRM 并发送开发信：使用本站" : "Import CRM & send outreach via"}{" "}
              <Link to="/email/campaigns">{zh ? "邮件营销" : "Email campaigns"}</Link>
            </p>
          </section>
        ) : null}

        {tab === "results" ? (
          <section className="lf-panel">
            <div className="lf-row between">
              <p className="lf-meta">
                {zh
                  ? `结果页 ${pageIndex + 1} · ${currentPage.length}/${MAX_DOMAINS_PER_PAGE} 个域名`
                  : `Page ${pageIndex + 1} · ${currentPage.length}/${MAX_DOMAINS_PER_PAGE} domains`}
              </p>
              <button type="button" className="lf-btn ghost" onClick={newResultsPage}>
                {zh ? "新结果页" : "New page"}
              </button>
            </div>

            <div className="lf-domain-tabs">
              {currentPage.map((b) => (
                <button
                  key={b.domain}
                  type="button"
                  className={`lf-pill ${(activeBlock?.domain || "") === b.domain ? "on" : ""}`}
                  onClick={() => setActiveDomain(b.domain)}
                >
                  {b.company_name || b.domain}
                </button>
              ))}
            </div>

            {toast ? (
              <p className={`lf-toast ${toastErr ? "err" : ""}`} aria-live="polite">
                {toast}
              </p>
            ) : null}

            {!activeBlock ? (
              <p className="lf-meta">{zh ? "暂无结果，请先搜索" : "No results yet — search first"}</p>
            ) : (
              <div className="lf-company">
                <div className="lf-co-head">
                  <div>
                    <h3 className="lf-co-name">{activeBlock.company_name}</h3>
                    <p className="lf-meta">
                      {(activeBlock.contacts || []).length} contacts · {activeBlock.domain}
                    </p>
                  </div>
                  <div className="lf-co-actions">
                    <button
                      type="button"
                      className="lf-btn ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(activeBlock.domain);
                        showToast(zh ? "已复制" : "Copied");
                      }}
                    >
                      {zh ? "复制" : "Copy"}
                    </button>
                    <Link className="lf-btn primary send" to="/email/campaigns">
                      {zh ? "发送邮件" : "Send email"}
                    </Link>
                  </div>
                </div>

                {showCol("description") ? (
                  <p className="lf-desc">{activeBlock.description || "—"}</p>
                ) : null}

                <div className="lf-kv">
                  {showCol("industry") ? (
                    <div>
                      <div className="k">Industry</div>
                      <div className="v">{activeBlock.industry || "—"}</div>
                    </div>
                  ) : null}
                  {showCol("company_type") ? (
                    <div>
                      <div className="k">Type</div>
                      <div className="v">{activeBlock.company_type || "—"}</div>
                    </div>
                  ) : null}
                  {showCol("size") ? (
                    <div>
                      <div className="k">{zh ? "规模" : "Size"}</div>
                      <div className="v">{activeBlock.size || "—"}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="k">{zh ? "成立时间" : "Founded"}</div>
                    <div className="v">{activeBlock.year_founded || "—"}</div>
                  </div>
                  <div>
                    <div className="k">{zh ? "企业电话" : "Phone"}</div>
                    <div className="v">{activeBlock.phone || "—"}</div>
                  </div>
                  {showCol("website") ? (
                    <div>
                      <div className="k">{zh ? "官网" : "Website"}</div>
                      <div className="v">
                        <a href={activeBlock.website || `https://${activeBlock.domain}`} target="_blank" rel="noreferrer">
                          {activeBlock.website || activeBlock.domain}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  {showCol("location") ? (
                    <div>
                      <div className="k">{zh ? "城市 / 地址" : "City / Address"}</div>
                      <div className="v">{activeBlock.location || "—"}</div>
                    </div>
                  ) : null}
                  {showCol("country") ? (
                    <div>
                      <div className="k">{zh ? "国家" : "Country"}</div>
                      <div className="v">{activeBlock.country || "—"}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="k">{zh ? "城市" : "City"}</div>
                    <div className="v">{activeBlock.city || "—"}</div>
                  </div>
                  <div>
                    <div className="k">LinkedIn</div>
                    <div className="v">
                      {activeBlock.linkedin ? (
                        <a href={activeBlock.linkedin} target="_blank" rel="noreferrer">
                          {activeBlock.linkedin}
                        </a>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  {showCol("tags") ? (
                    <div>
                      <div className="k">{zh ? "行业标签" : "Industry tags"}</div>
                      <div className="v">
                        {[activeBlock.industry, ...(activeBlock.tags || [])].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="lf-subtabs">
                  {(
                    [
                      ["emails", zh ? "邮箱" : "Emails"],
                      ["tech", zh ? "技术栈" : "Tech"],
                      ["signals", zh ? "信号" : "Signals"]
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`lf-pill ${resultSubTab === id ? "on" : ""}`}
                      onClick={() => setResultSubTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {resultSubTab === "emails" && showCol("emails") ? (
                  <>
                    <div className="lf-filter-row">
                      <span className="lf-meta">{zh ? "筛选" : "Filters"}</span>
                      <button
                        type="button"
                        className={`lf-pill ${emailFilter === "all" ? "on" : ""}`}
                        onClick={() => setEmailFilter("all")}
                      >
                        {zh ? "全部" : "All"} ({countKind("all")})
                      </button>
                      {LEAD_FINDER_EMAIL_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`lf-pill ${emailFilter === f.id ? "on" : ""}`}
                          onClick={() => setEmailFilter(f.id)}
                        >
                          {zh ? f.zh : f.en} ({countKind(f.id)})
                        </button>
                      ))}
                    </div>
                    <div className="lf-lead-list">
                      {filteredContacts.map((c, i) => {
                        const st = String(c.email_status || "").toLowerCase();
                        const emailShow = st === "valid" && c.email ? c.email : "";
                        return (
                          <div key={`${c.contact_name}-${i}`} className="lf-lead-row">
                            <div>
                              <strong>{c.contact_name || "—"}</strong>
                              <span className="sub">{c.title || "—"}</span>
                            </div>
                            <div className="lf-email">
                              {st === "verifying" ? (
                                <span className="lf-verify">
                                  <span className="lf-spinner" /> {zh ? "验证中…" : "Verifying…"}
                                </span>
                              ) : st === "queued" || st === "unverified" ? (
                                <span className="lf-badge queued">{zh ? "排队中…" : "queued…"}</span>
                              ) : emailShow ? (
                                <>
                                  {emailShow} <span className="lf-badge valid">{zh ? "有效" : "Valid"}</span>
                                </>
                              ) : (
                                <span className="lf-badge noemail">no email</span>
                              )}
                            </div>
                            <div className="lf-actions">
                              {emailShow ? (
                                <button
                                  type="button"
                                  className="lf-btn ghost"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(emailShow);
                                    showToast(zh ? "已复制邮箱" : "Email copied");
                                  }}
                                >
                                  {zh ? "复制" : "Copy"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {!filteredContacts.length ? <p className="lf-meta">—</p> : null}
                    </div>
                  </>
                ) : null}

                {resultSubTab === "tech" ? (
                  <div className="lf-tag-cloud">
                    {(activeBlock.technology || []).map((t) => (
                      <span key={t} className="lf-tag">
                        {t}
                      </span>
                    ))}
                    {!(activeBlock.technology || []).length ? "—" : null}
                  </div>
                ) : null}

                {resultSubTab === "signals" ? (
                  <ul className="lf-signals">
                    {(activeBlock.signals || []).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                    {!(activeBlock.signals || []).length ? <li>—</li> : null}
                  </ul>
                ) : null}
              </div>
            )}

            <div className="lf-row">
              <button
                type="button"
                className="lf-btn ghost"
                disabled={!activeBlock}
                onClick={() => {
                  if (!activeBlock) return;
                  void navigator.clipboard.writeText(leadFinderBlockToCsv(activeBlock));
                  showToast(zh ? "本页 CSV 已复制到剪贴板" : "Page CSV copied");
                }}
              >
                {zh ? "复制本页" : "Copy page"}
              </button>
              <button type="button" className="lf-btn primary" disabled={!activeBlock} onClick={exportCsv}>
                {zh ? "导出 CSV" : "Export CSV"}
              </button>
              <button
                type="button"
                className="lf-btn primary"
                disabled={!activeBlock || importBusy}
                onClick={() => void importCrm()}
              >
                {importBusy ? (zh ? "导入中…" : "Importing…") : zh ? "导入 CRM" : "Import CRM"}
              </button>
              <Link className="lf-btn primary send" to="/email/campaigns">
                {zh ? "发送邮件" : "Send email"}
              </Link>
            </div>
          </section>
        ) : null}

        {tab === "settings" ? (
          <section className="lf-panel">
            <label className="lf-field">
              <span>{zh ? "安装编号（本浏览器）" : "Install ID (this browser)"}</span>
              <input value={installId} readOnly />
            </label>
            <p className="lf-meta">
              {zh
                ? "独立站已授权用户可直接使用网页版 Lead Finder，无需再付 ¥129 插件订阅。"
                : "Standalone license includes this web Lead Finder — no extra ¥129 plugin fee."}
            </p>
            <p className={`lf-status key ${agentLine.includes("尚未") || agentLine.includes("No AI") ? "err" : "ok"}`}>
              {agentLine}
            </p>
            <div className="lf-row">
              <Link className="lf-btn primary" to="/ops/automation-tasks">
                {zh ? "前往自动化任务 · AI 大脑" : "Open Automation → AI brain"}
              </Link>
            </div>
            <p className="lf-hint" style={{ marginTop: 12 }}>
              {zh
                ? "搜人 / 验邮走主站 Lead Finder 上游；结果可导入本站 CRM（industry = 真实行业），并同步写入 BSB 线索库。"
                : "Search/verify use the main Lead Finder upstream; results import to this CRM (real industry) and sync to the BSB warehouse."}
            </p>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

const LF_CSS = `
.lf-shell { --lf: #146551; --lf-bg: #f4f7f1; --lf-bd: #d9e3d2; --lf-ink: #173127; --lf-muted: #4a6358;
  background: var(--lf-bg); border: 1px solid var(--lf-bd); border-radius: 14px; overflow: hidden; color: var(--lf-ink); }
.lf-header { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 14px; background:#fff; border-bottom:1px solid var(--lf-bd); }
.lf-title { margin:0; font-size:15px; font-weight:600; flex:1 1 auto; }
.lf-tab { border:1px solid #c5d4c0; background:#eff4ec; border-radius:8px; padding:5px 12px; cursor:pointer; font:inherit; }
.lf-tab.on { background:var(--lf); color:#fff; border-color:var(--lf); }
.lf-panel { padding:14px 16px 18px; }
.lf-meta { color:var(--lf-muted); margin:0 0 10px; font-size:12px; }
.lf-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; font-size:13px; }
.lf-field > span:first-child { font-size:11px; color:var(--lf-muted); }
.lf-field input { border:1px solid #c5d4c0; border-radius:8px; padding:8px 10px; font:inherit; background:#fff; }
.lf-hint { font-size:11px; color:#6a8578; line-height:1.4; }
.lf-sources-title { font-size:11px; color:var(--lf-muted); margin-bottom:6px; }
.lf-columns { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px 10px; max-height:220px; overflow:auto; padding:8px; border:1px solid var(--lf-bd); border-radius:10px; background:#fff; }
.lf-roles { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--lf-bd); border-radius:10px; background:#fff; }
.lf-role { align-items:flex-start; line-height:1.35; }
.lf-check { display:flex; align-items:center; gap:6px; font-size:12px; }
.lf-row { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
.lf-row.between { justify-content:space-between; }
.lf-btn { border-radius:8px; border:1px solid #c5d4c0; padding:7px 12px; cursor:pointer; font:inherit; background:#fff; text-decoration:none; color:inherit; display:inline-flex; align-items:center; }
.lf-btn.primary { background:var(--lf); color:#fff; border-color:var(--lf); }
.lf-btn.primary.send { background:#c2410c; border-color:#c2410c; }
.lf-btn.ghost { background:#fff; }
.lf-btn:disabled { opacity:.55; cursor:not-allowed; }
.lf-status { min-height:1.2em; color:var(--lf); font-size:12px; }
.lf-status.err { color:#b42318; }
.lf-status.key { margin-top:8px; padding:8px 10px; border-radius:8px; background:#eef4ec; border:1px solid var(--lf-bd); }
.lf-status.key.ok { background:#e6f6ef; border-color:#b7e0cf; }
.lf-status.key.err { background:#fdecea; border-color:#f5c2c0; color:#b42318; }
.lf-crm-tip { margin-top:12px; font-size:11px; color:var(--lf-muted); }
.lf-crm-tip a { color:var(--lf); }
.lf-progress { margin:12px 0 8px; padding:10px; border:1px solid var(--lf-bd); border-radius:10px; background:#fff; }
.lf-progress-list { list-style:none; margin:0; padding:0; max-height:420px; overflow:auto; }
.lf-progress-item { display:grid; grid-template-columns:22px 1fr auto; gap:8px; align-items:center; padding:5px 4px; border-bottom:1px solid #eef3ea; font-size:12px; }
.lf-progress-item:last-child { border-bottom:0; }
.lf-progress-item.is-phase { margin-top:6px; padding-top:8px; font-weight:700; background:#f0f6ef; border-radius:6px; border-bottom:0; }
.lf-progress-item.is-phase .p-label { font-size:13px; }
.lf-progress-item .p-note { font-size:10px; color:#6a7f74; }
.lf-preview-wrap { margin-top:14px; padding:12px; border:1px solid var(--lf-bd); border-radius:12px; background:#fff; }
.lf-preview { margin-top:6px; }
.lf-roster-summary { margin-top:10px; font-size:12px; font-weight:600; color:#1f3d2b; background:#eef6ef; border:1px solid #cfe3d4; border-radius:8px; padding:6px 10px; }
.lf-preview-table-wrap { overflow:auto; max-height:280px; border:1px solid #e8f0e6; border-radius:8px; }
.lf-preview-table { width:100%; border-collapse:collapse; font-size:12px; }
.lf-preview-table th, .lf-preview-table td { padding:6px 8px; border-bottom:1px solid #eef3ea; text-align:left; vertical-align:top; }
.lf-preview-table th { background:#f4f7f1; color:#4a6358; font-weight:600; position:sticky; top:0; }
.lf-auto-bar { height:8px; background:#e4eee0; border-radius:99px; overflow:hidden; }
.lf-auto-bar-fill { height:100%; background:var(--lf); }
.lf-spinner { width:12px; height:12px; border:2px solid #c5d4c0; border-top-color:var(--lf); border-radius:50%; display:inline-block; animation:lfspin .7s linear infinite; }
@keyframes lfspin { to { transform: rotate(360deg); } }
.lf-ok { color:#0f6b4c; font-weight:700; }
.lf-err { color:#b42318; font-weight:700; }
.lf-dot { color:#8a9a90; }
.lf-domain-tabs, .lf-subtabs, .lf-filter-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; align-items:center; }
.lf-pill { border:1px solid #c5d4c0; background:#fff; border-radius:999px; padding:4px 10px; font-size:11px; cursor:pointer; font:inherit; }
.lf-pill.on { background:var(--lf); color:#fff; border-color:var(--lf); }
.lf-toast { margin:0 0 10px; padding:8px 10px; border-radius:8px; background:#e6f6ef; border:1px solid #b7e0cf; font-size:12px; font-weight:600; color:#1f3d2b; }
.lf-toast.err { background:#fdecea; border-color:#f3c1bb; color:#8a1c12; }
.lf-company { background:#fff; border:1px solid var(--lf-bd); border-radius:12px; padding:12px; }
.lf-co-head { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
.lf-co-name { margin:0; font-size:17px; }
.lf-co-actions { display:flex; flex-direction:column; gap:6px; }
.lf-desc { margin:8px 0; font-size:12px; color:#334; }
.lf-kv { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0; }
.lf-kv .k { font-size:10px; color:#6b7f74; text-transform:uppercase; letter-spacing:.02em; }
.lf-kv .v { font-size:12px; word-break:break-word; }
.lf-lead-list { height:min(560px, 55vh); overflow:auto; }
.lf-lead-row { display:grid; grid-template-columns:1.2fr 1.2fr auto; gap:6px; padding:8px 0; border-top:1px solid #e8f0e6; font-size:12px; }
.lf-lead-row .sub { display:block; color:var(--lf-muted); font-size:11px; }
.lf-email { word-break:break-all; }
.lf-actions { display:flex; gap:4px; align-items:center; }
.lf-badge { display:inline-block; font-size:10px; padding:1px 6px; border-radius:999px; margin-left:4px; }
.lf-badge.valid { background:#d8f3e7; color:#0f6b4c; }
.lf-badge.queued { background:#eef2f7; color:#5a6b7a; }
.lf-badge.noemail { background:#eef1f0; color:#6a7f74; }
.lf-verify { display:inline-flex; align-items:center; gap:6px; color:#274690; font-weight:600; }
.lf-tag-cloud { display:flex; flex-wrap:wrap; gap:6px; }
.lf-tag { background:#eff4ec; border-radius:999px; padding:3px 8px; font-size:11px; }
.lf-signals { margin:0; padding-left:18px; font-size:12px; }
@media (max-width: 720px) {
  .lf-lead-row { grid-template-columns: 1fr; }
  .lf-kv { grid-template-columns: 1fr; }
}
`;

export default LeadFinderWebPage;
