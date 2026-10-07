import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { GeoSelect } from "../components/GeoSelect";
import { apiJson } from "../../lib/api";
import {
  CONTINENT_OPTIONS,
  getCityOptionsForCountry,
  getCountryOptionsZhFiltered,
  getProvinceOptionsForCountry
} from "../../data/leadsGeoOptions";
import {
  INDUSTRY_CUSTOM_VALUE,
  INDUSTRY_OPTIONS,
  effectiveIndustryLabel
} from "../../data/leadsIndustryOptions";
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
  columnsToSearchFields,
  CompanyDetail,
  countryNameEn,
  GRADE_STYLE,
  hostOf,
  isLive,
  KEYWORD_COLORS,
  ProgressBar,
  type CompanyCard,
  type CompanyHit,
  type Grade,
  type GradeStat,
  type Job
} from "./leadFinderShared";

const TARGET_COUNTS = [10, 30, 50, 100, 200];
const MAX_DEEP = 50;
const DEEP_BATCH_SIZES = [10, 30, 50];
const GRADE_ORDER: Grade["grade"][] = ["A", "B", "C", "D"];
const GRADE_SUB: Record<Grade["grade"], string> = {
  A: "最贴合画像",
  B: "次级精准",
  C: "延伸相关",
  D: "顺带"
};

type BizProfile = { intro: string; business: string; audience: string };
type AiMsg = { role: "user" | "ai"; text: string };

const EMPTY_STAT: GradeStat = {
  companies: 0,
  contacts: 0,
  emails: 0,
  validEmails: 0,
  newCompanies: 0,
  newContacts: 0,
  newValidEmails: 0
};

/** 极简 markdown 渲染：加粗 / 无序列表 / 有序列表 / 换行，不引入新库 */
function renderInlineMd(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

function renderSimpleMarkdown(md: string): ReactNode {
  const blocks: ReactNode[] = [];
  let list: string[] | null = null;
  let ordered = false;
  const flush = () => {
    if (!list || !list.length) return;
    const items = list;
    const isOrdered = ordered;
    list = null;
    blocks.push(
      isOrdered ? (
        <ol key={blocks.length} className="list-decimal space-y-0.5 pl-5">
          {items.map((t, i) => (
            <li key={i}>{renderInlineMd(t)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">
          {items.map((t, i) => (
            <li key={i}>{renderInlineMd(t)}</li>
          ))}
        </ul>
      )
    );
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const ulm = /^[-*]\s+(.*)$/.exec(line);
    const olm = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ulm) {
      if (!list || ordered) {
        flush();
        list = [];
        ordered = false;
      }
      list.push(ulm[1]);
    } else if (olm) {
      if (!list || !ordered) {
        flush();
        list = [];
        ordered = true;
      }
      list.push(olm[1]);
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length} className="mb-1">{renderInlineMd(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-1">{blocks}</div>;
}

/** 每分级栏下载 Excel：企业名称/官网/国家/省州/城市/分级/分级理由 */
function downloadGradeXlsx(
  grade: Grade["grade"],
  companies: CompanyHit[],
  grades: Record<string, Grade> | undefined,
  jobId: number | undefined
) {
  const rows = companies.map((c) => {
    const g = grades?.[c.domain];
    return {
      企业名称: c.name || c.domain,
      官网: c.website || `https://${c.domain}`,
      国家: c.country || "",
      省州: c.province || "",
      城市: c.city || "",
      分级: g?.grade || "",
      分级理由: g?.reason || ""
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${grade}类`);
  XLSX.writeFile(wb, `industry-leads-${jobId || "search"}-${grade}.xlsx`);
}

/** 深度搜索总结果下载 Excel：联系人/职位/邮箱明细，一个分级一个 sheet */
function downloadDeepXlsx(
  cards: CompanyCard[],
  grades: Record<string, Grade> | undefined,
  jobId: number | undefined
) {
  const wb = XLSX.utils.book_new();
  const order: Grade["grade"][] = ["A", "B", "C", "D"];
  let total = 0;
  for (const g of order) {
    const list = cards.filter((c) => (grades?.[c.domain]?.grade || "D") === g);
    if (!list.length) continue;
    const rows: Record<string, string>[] = [];
    for (const c of list) {
      const rowsOf = c.rows && c.rows.length ? c.rows : [];
      if (!rowsOf.length) {
        rows.push({
          企业名称: c.name || c.domain,
          官网: c.website || `https://${c.domain}`,
          分级: g,
          联系人: "",
          职位: "",
          邮箱: "",
          邮箱状态: ""
        });
        continue;
      }
      for (const p of rowsOf) {
        rows.push({
          企业名称: c.name || c.domain,
          官网: c.website || `https://${c.domain}`,
          分级: g,
          联系人: p.contact || "",
          职位: p.title || "",
          邮箱: p.email || "",
          邮箱状态: p.email_status || ""
        });
      }
    }
    total += rows.length;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `${g}类`);
  }
  if (!total) return;
  XLSX.writeFile(wb, `industry-deep-${jobId || "search"}.xlsx`);
}

/** 深度搜索总结果下载 CSV：联系人/职位/邮箱明细（带 BOM，Excel 打开中文不乱码） */
function downloadDeepCsv(
  cards: CompanyCard[],
  grades: Record<string, Grade> | undefined,
  jobId: number | undefined
) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["企业名称", "官网", "分级", "联系人", "职位", "邮箱", "邮箱状态"].map(esc).join(",")];
  for (const c of cards) {
    const g = grades?.[c.domain]?.grade || c.grade?.grade || "D";
    const rowsOf = c.rows && c.rows.length ? c.rows : [];
    if (!rowsOf.length) {
      lines.push(
        [c.name || c.domain, c.website || `https://${c.domain}`, g, "", "", "", ""].map(esc).join(",")
      );
      continue;
    }
    for (const p of rowsOf) {
      lines.push(
        [
          c.name || c.domain,
          c.website || `https://${c.domain}`,
          g,
          p.contact || "",
          p.title || "",
          p.email || "",
          p.email_status || ""
        ]
          .map(esc)
          .join(",")
      );
    }
  }
  if (lines.length <= 1) return;
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `industry-deep-${jobId || "search"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function IndustrySearchPage() {
  // ---------- 一、业务画像 ----------
  const [profile, setProfile] = useState<BizProfile>({ intro: "", business: "", audience: "" });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [aiClearAsk, setAiClearAsk] = useState(false);

  // ---------- 二、搜索筛选 ----------
  const [targetCount, setTargetCount] = useState(50);
  const [continent, setContinent] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [industryKey, setIndustryKey] = useState("");
  const [industryCustom, setIndustryCustom] = useState("");
  const [keywordList, setKeywordList] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const keywordsText = keywordList.join(" ");
  function addKeyword() {
    const v = kwInput.trim();
    if (!v) return;
    if (!keywordList.includes(v)) setKeywordList((prev) => [...prev, v]);
    setKwInput("");
  }
  function removeKeyword(v: string) {
    setKeywordList((prev) => prev.filter((k) => k !== v));
  }
  const [roles, setRoles] = useState<LeadFinderRoleTierId[]>([...DEFAULT_LEAD_FINDER_ROLES]);
  const [columns, setColumns] = useState<LeadFinderColumnId[]>([...DEFAULT_LEAD_FINDER_COLUMNS]);

  const [related, setRelated] = useState<string[]>([]);
  const [relatedOn, setRelatedOn] = useState<string[]>([]);
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [syncCrm, setSyncCrm] = useState(true);
  const [verifyEmail, setVerifyEmail] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  // ---------- 四、深度搜索结果区勾选（删除/下载用） ----------
  const [resultPicked, setResultPicked] = useState<string[]>([]);

  // ---------- 任务 ----------
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [gradingMissing, setGradingMissing] = useState(false);
  const autoGradedRef = useRef<string | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const countries = useMemo(() => getCountryOptionsZhFiltered(continent), [continent]);
  const provinces = useMemo(() => getProvinceOptionsForCountry(countryCode), [countryCode]);
  const cities = useMemo(() => getCityOptionsForCountry(countryCode, province), [countryCode, province]);
  const industry = effectiveIndustryLabel(industryKey, industryCustom);

  const running = isLive(job);
  const discovering = running && (job?.stage === "discover" || !job?.stage);
  const deepRunning = running && !discovering;
  const companies = job?.companies || [];
  const canPick = Boolean(job) && !running && companies.length > 0;
  const stuck = Boolean(job?.stuck) && running;
  const found = Number(job?.companyCount || companies.length || 0);
  const target = Number(job?.targetCount || targetCount || 50);
  const needMore = Boolean(job) && !running && found < target;

  const loadCap = useCallback(async () => {
    try {
      await apiJson<{ ok: boolean }>("/api/leads/capability");
    } catch {
      /* 忽略 */
    }
  }, []);

  const loadTask = useCallback(async (id?: number | null) => {
    const q = id ? `?jobId=${id}` : "?mode=industry";
    const r = await apiJson<{ ok: boolean; job: Job | null }>(`/api/leads/search-task${q}`);
    setJob(r.job || null);
  }, []);

  // 画像回填
  useEffect(() => {
    (async () => {
      try {
        const r = await apiJson<{ ok: boolean; profile?: Partial<BizProfile> }>("/api/leads/profile");
        if (r && r.profile) {
          setProfile({
            intro: String(r.profile.intro || ""),
            business: String(r.profile.business || ""),
            audience: String(r.profile.audience || "")
          });
        }
      } catch {
        /* 后端未 ready 时保持空白，不报错 */
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    void loadCap();
    void loadTask();
  }, [loadCap, loadTask]);

  useEffect(() => {
    if (!running || !job?.id) return;
    const id = job.id;
    const t = window.setInterval(() => void loadTask(id), 2500);
    return () => window.clearInterval(t);
  }, [running, job?.id, loadTask]);

  useEffect(() => {
    setPicked([]);
  }, [job?.id]);

  const gradeMissing = useCallback(
    async (id: number) => {
      setGradingMissing(true);
      try {
        await apiJson<{ ok: boolean; graded?: number; message?: string }>(
          "/api/leads/search-task/grade-missing",
          { method: "POST", body: JSON.stringify({ jobId: id }) }
        );
      } catch {
        /* 失败可点按钮重试 */
      } finally {
        setGradingMissing(false);
        await loadTask(id);
      }
    },
    [loadTask]
  );

  // 自动补分级 effect 移到 discoveryGroups 声明之后

  useEffect(() => {
    setProvince("");
    setCity("");
  }, [countryCode]);

  useEffect(() => {
    setCity("");
  }, [province]);

  const relatedCache = useRef(new Map<string, string[]>());
  useEffect(() => {
    const kw = keywordsText.trim();
    if (!kw) {
      setRelated([]);
      setRelatedOn([]);
      return;
    }
    const cacheKey = `${industry.trim()}|${kw}|${countryNameEn(countryCode)}`;
    const hit = relatedCache.current.get(cacheKey);
    if (hit) {
      setRelated(hit);
      setRelatedOn(hit);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setRelatedBusy(true);
      try {
        const r = await apiJson<{ ok: boolean; items?: string[] }>("/api/leads/related-keywords", {
          method: "POST",
          body: JSON.stringify({ industry, keywords: kw, country: countryNameEn(countryCode) })
        });
        if (cancelled) return;
        const items = (r.items || []).slice(0, 15);
        relatedCache.current.set(cacheKey, items);
        setRelated(items);
        setRelatedOn(items);
      } catch {
        if (!cancelled) setRelated([]);
      } finally {
        if (!cancelled) setRelatedBusy(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [keywordsText, industry, countryCode]);

  const toggleColumn = (id: LeadFinderColumnId) =>
    setColumns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleRole = (id: LeadFinderRoleTierId) =>
    setRoles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleRelated = (k: string) =>
    setRelatedOn((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const removeRelated = (k: string) => {
    setRelated((prev) => prev.filter((x) => x !== k));
    setRelatedOn((prev) => prev.filter((x) => x !== k));
  };
  const togglePick = (d: string) => setPicked((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

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

  async function saveProfile() {
    setProfileSaving(true);
    setErr("");
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>("/api/leads/profile", {
        method: "POST",
        body: JSON.stringify(profile)
      });
      if (!r.ok) throw new Error(r.message || "保存失败");
    } catch (e: unknown) {
      setErr(`画像保存失败：${String((e as Error)?.message ?? e)}`);
    } finally {
      setProfileSaving(false);
    }
  }

  async function callAi(question: string | undefined, userLabel: string) {
    if (aiBusy) return;
    setAiBusy(true);
    setAiInput("");
    setAiMsgs((prev) => [...prev, { role: "user", text: userLabel }]);
    try {
      const r = await apiJson<{ ok: boolean; markdown?: string; message?: string }>("/api/leads/profile/analyze", {
        method: "POST",
        body: JSON.stringify({ ...profile, question: question || undefined })
      });
      if (r.ok && r.markdown) {
        setAiMsgs((prev) => [...prev, { role: "ai", text: String(r.markdown) }]);
      } else {
        setAiMsgs((prev) => [...prev, { role: "ai", text: r.message || "AI 暂不可用，请稍后再试。" }]);
      }
    } catch (e: unknown) {
      setAiMsgs((prev) => [...prev, { role: "ai", text: `请求失败：${String((e as Error)?.message ?? e)}` }]);
    } finally {
      setAiBusy(false);
    }
  }

  function analyzeProfile() {
    void callAi(undefined, "请分析我的业务画像");
  }

  function sendAiChat() {
    const q = aiInput.trim();
    if (!q) return;
    void callAi(q, q);
  }

  async function startSearch() {
    setErr("");
    setBusy(true);
    try {
      const provinceLabel = provinces.find((p) => p.value === province)?.label || province;
      const r = await apiJson<{ ok: boolean; jobId?: number; message?: string }>("/api/leads/search-task", {
        method: "POST",
        body: JSON.stringify({
          keywords: keywordsText.trim(),
          limit: 400,
          targetCount,
          countryNameEn: countryNameEn(countryCode) || countryCode,
          city,
          province: provinceLabel,
          industry,
          titles: titleText || "CEO, Founder",
          roleTiers: roles,
          fields: columnsToSearchFields(columns, roles.length > 0),
          relatedKeywords: related.filter((k) => relatedOn.includes(k)),
          syncCrm
        })
      });
      if (!r.ok) throw new Error(r.message || "启动失败");
      await loadCap();
      await loadTask(r.jobId);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function continueDiscover() {
    if (!job?.id) return;
    setErr("");
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>("/api/leads/search-task/continue-discover", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id })
      });
      if (!r.ok) throw new Error(r.message || "继续搜索失败");
      await loadTask(job.id);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** 按 A→B→C→D 优先级取前 n 家域名（待分级排最后） */
  function pickByPriority(n: number): string[] {
    const out: string[] = [];
    for (const g of GRADE_ORDER) {
      for (const c of discoveryGroups.groups[g]) {
        if (out.length >= n) break;
        out.push(c.domain);
      }
      if (out.length >= n) break;
    }
    for (const c of discoveryGroups.ungraded) {
      if (out.length >= n) break;
      out.push(c.domain);
    }
    return out;
  }

  async function startDeep() {
    if (!job?.id || busy) return;
    setErr("");
    setNotice("");
    if (!checkPicks(setErr)) return;
    let domains = picked;
    if (!domains.length) {
      // 不勾选默认全部进入深度搜索（按 A→B→C→D 优先级，上限 50 家）
      domains = pickByPriority(MAX_DEEP);
      setPicked(domains);
      if (!domains.length) {
        setErr("没有可深度搜索的企业");
        return;
      }
    }
    domains = domains.slice(0, MAX_DEEP);
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>("/api/leads/search-task/continue", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id, pickLimit: domains.length, domains, verifyEmail, syncCrm })
      });
      if (!r.ok) throw new Error(r.message || "无法开始深度搜索");
      await loadTask(job.id);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** 继续深度搜索剩余未搜的公司：不传 domains，后端按 onlyUndug 自动挑没搜过的，已搜过的不重搜 */
  async function continueDeepRemaining() {
    if (!job?.id || busy) return;
    setErr("");
    setNotice("");
    const n = job?.undugCount || 0;
    if (!n) {
      setErr("没有剩余未搜索的企业");
      return;
    }
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>("/api/leads/search-task/continue", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          pickLimit: Math.min(n, MAX_DEEP),
          onlyUndug: true,
          verifyEmail,
          syncCrm
        })
      });
      if (!r.ok) throw new Error(r.message || "无法继续深度搜索");
      setNotice(r.message || "");
      await loadTask(job.id);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** 删除勾选的企业（按域名），删完刷新任务，统计数字自动更新；CRM 里同域名的联系人同步删除 */
  async function removePicked(domains: string[]) {
    if (!job?.id || !domains.length) return;
    if (!window.confirm(`确定删除勾选的 ${domains.length} 家企业吗？相关的分级、联系人数据，以及已入库 CRM 的同企业联系人会一并清除。`)) return;
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; removed?: number; crmDeleted?: number; message?: string }>(
        "/api/leads/search-task/remove-companies",
        { method: "POST", body: JSON.stringify({ jobId: job.id, domains }) }
      );
      if (!r.ok) throw new Error(r.message || "删除失败");
      setPicked((prev) => prev.filter((d) => !domains.includes(d)));
      setNotice(
        `已删除 ${r.removed ?? domains.length} 家企业` +
          (Number(r.crmDeleted) > 0 ? `，同步删除 CRM 联系人 ${r.crmDeleted} 条。` : "。")
      );
      await loadTask(job.id);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function resumeStuck() {    if (!job?.id) return;
    setErr("");
    setBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>("/api/leads/search-task/resume", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id })
      });
      if (!r.ok) throw new Error(r.message || "恢复失败");
      await loadTask(job.id);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
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

  // ---------- 三、企业发现结果：按画像分级 ----------
  const discoveryGroups = useMemo(() => {
    const groups: Record<Grade["grade"], CompanyHit[]> = { A: [], B: [], C: [], D: [] };
    const ungraded: CompanyHit[] = [];
    for (const c of companies) {
      const g = job?.grades?.[c.domain]?.grade;
      if (g && groups[g]) groups[g].push(c);
      else ungraded.push(c);
    }
    return { groups, ungraded };
  }, [companies, job?.grades]);

  const statOf = (g: Grade["grade"]): GradeStat => ({ ...EMPTY_STAT, ...(job?.stats?.[g] || {}) });

  // 任务不在运行时若还有待分级企业，自动补一次分级（每个任务+状态只自动触发一次）
  useEffect(() => {
    if (!job?.id || gradingMissing) return;
    const key = `${job.id}:${job.status}`;
    if (autoGradedRef.current === key) return;
    if (discoveryGroups.ungraded.length === 0) {
      autoGradedRef.current = key;
      return;
    }
    if (job.status === "running" || job.status === "queued") return;
    autoGradedRef.current = key;
    void gradeMissing(job.id);
  }, [job?.id, job?.status, discoveryGroups.ungraded.length, gradingMissing, gradeMissing]);

  // ---------- 四、深度搜索结果 ----------
  const doneCards = useMemo(() => {
    if (!job) return [];
    const rows = job.resultRows || [];
    const domains = [...new Set(rows.map(hostOf).filter(Boolean))];
    return buildCards(job, domains, rows);
  }, [job]);

  const liveCards = useMemo(() => {
    if (!job || !deepRunning) return [];
    const queued = job.queuedDomains || [];
    const rows = job.researchRows || [];
    const withRows = new Set(rows.map(hostOf));
    return buildCards(
      job,
      queued.filter((d) => withRows.has(d.replace(/^www\./i, "").toLowerCase())),
      rows
    );
  }, [job, deepRunning]);

  const gradeGroups = useMemo(() => {
    const out: Record<Grade["grade"], CompanyCard[]> = { A: [], B: [], C: [], D: [] };
    for (const c of doneCards) {
      if (deepRunning && (job?.queuedDomains || []).includes(c.domain)) continue;
      out[c.grade?.grade || "D"].push(c);
    }
    return out;
  }, [doneCards, deepRunning, job?.queuedDomains]);

  /** 结果区所有卡片域名（去重），供勾选全部用 */
  const allResultDomains = useMemo(() => {
    const ds = [...liveCards, ...doneCards].map((c) => c.domain).filter(Boolean);
    return [...new Set(ds)];
  }, [liveCards, doneCards]);

  function toggleResultPick(domain: string) {
    setResultPicked((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }

  /** 结果区要下载的卡片：有勾选就下勾选的，否则下全部 */
  function resultCardsForDownload(): CompanyCard[] {
    const all = [...liveCards, ...doneCards];
    if (!resultPicked.length) return all;
    const set = new Set(resultPicked);
    return all.filter((c) => set.has(c.domain));
  }

  const discoverPct =
    job && Number(job.discoverFound) > 0
      ? Math.min(100, Math.round((Number(job.discoverChecked || 0) / Number(job.discoverFound)) * 100))
      : 0;
  const deepPct =
    job && Number(job.quota) > 0 ? Math.min(100, Math.round((Number(job.processed) / Number(job.quota)) * 100)) : 0;

  function CompanyPickRow({ c }: { c: CompanyHit }) {
    const loc = [c.country, c.province, c.city].filter(Boolean).join(" · ");
    const dug = Number(c.deepCount || 0);
    return (
      <li className="flex items-center gap-2 border-b border-slate-100 px-2 py-1 last:border-0">
        <input
          type="checkbox"
          disabled={!canPick}
          checked={picked.includes(c.domain)}
          onChange={() => togglePick(c.domain)}
        />
        <span className="truncate font-medium text-slate-800">{c.name || c.domain}</span>
        <a
          className="truncate text-blue-700 hover:underline"
          href={c.website || `https://${c.domain}`}
          target="_blank"
          rel="noreferrer"
        >
          {c.website || c.domain}
        </a>
        {dug > 0 ? (
          <span className="shrink-0 rounded bg-emerald-700 px-1 py-px text-[10px] text-white">已深搜</span>
        ) : null}
        {loc ? <span className="ml-auto shrink-0 text-[11px] text-slate-500">{loc}</span> : null}
      </li>
    );
  }

  /** 深度搜索结果区：每家卡片前加勾选框 */
  function ResultCardRow({ c }: { c: CompanyCard }) {
    return (
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-3 shrink-0"
          title="勾选"
          checked={resultPicked.includes(c.domain)}
          onChange={() => toggleResultPick(c.domain)}
        />
        <div className="min-w-0 flex-1">
          <CompanyDetail card={c} />
        </div>
      </div>
    );
  }

  const ungradedAllPicked =
    discoveryGroups.ungraded.length > 0 && discoveryGroups.ungraded.every((c) => picked.includes(c.domain));

  return (
    <PageShell
      title="行业企业搜索"
      description="先描述你的业务画像 → 按行业/地区/关键词找企业 → 按画像分成 A / B / C / D 类 → 勾选后深度搜索联系人与邮箱。刷新页面不会丢掉进行中的任务。"
    >
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        <Link className="text-blue-600 hover:underline" to="/leads/exports">
          导出记录
        </Link>
        <Link className="text-blue-600 hover:underline" to="/leads/search">
          单企业精搜
        </Link>
      </div>

      {/* 一、业务画像 */}
      <SectionCard
        title="一、我的业务画像"
        description="描述得越详细，搜索筛选越精准。画像会保存，下次打开自动带入。"
        right={
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600"
            onClick={() => setProfileOpen((v) => !v)}
          >
            {profileOpen ? "收起 ▲" : "展开 ▼"}
          </button>
        }
      >
        {profileOpen ? (
        <>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-700">企业介绍</span>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              value={profile.intro}
              onChange={(e) => setProfile((p) => ({ ...p, intro: e.target.value }))}
              placeholder="例如：我们是一家位于深圳的智能家居方案商，成立 8 年，团队 60 人…"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-700">业务介绍</span>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              value={profile.business}
              onChange={(e) => setProfile((p) => ({ ...p, business: e.target.value }))}
              placeholder="例如：外贸出口 / 品牌代工 / 采购 / 代理分销 / 生产制造…做什么产品、什么模式"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-700">目标客群画像</span>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              value={profile.audience}
              onChange={(e) => setProfile((p) => ({ ...p, audience: e.target.value }))}
              placeholder="例如：欧美中型连锁零售商，年采购额 50 万美元以上，想找采购总监 / 创始人…"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            disabled={profileSaving || !profileLoaded}
            onClick={() => void saveProfile()}
          >
            {profileSaving ? "保存中…" : "保存画像"}
          </button>
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            disabled={aiBusy}
            onClick={analyzeProfile}
          >
            AI 分析画像
          </button>
          <span className="text-[11px] text-slate-400">AI 会诊断画像、给找客建议和执行 SOP</span>
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">AI 顾问（桌宠大模型）</span>
            <div className="flex items-center gap-2">
              {aiMsgs.length > 0 ? (
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                  onClick={() => setAiClearAsk(true)}
                >
                  清除
                </button>
              ) : null}
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                onClick={() => setAiOpen((v) => !v)}
              >
                {aiOpen ? "收起 ▲" : "展开 ▼"}
              </button>
            </div>
          </div>
          {aiOpen ? (
            <>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {aiMsgs.length ? (
              aiMsgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] rounded px-2 py-1.5 text-xs ${
                      m.role === "user" ? "bg-blue-600 text-white" : "bg-white text-slate-800 shadow-sm"
                    }`}
                  >
                    {m.role === "ai" ? renderSimpleMarkdown(m.text) : m.text}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">
                点「AI 分析画像」，让 AI 帮你诊断画像、给找客建议和执行 SOP，也可以直接在下面追问。
              </p>
            )}
            {aiBusy ? <p className="text-xs text-slate-400">AI 思考中…</p> : null}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendAiChat();
              }}
              placeholder="追问，例如：医美行业在美国应该怎么找客户？"
            />
            <button
              type="button"
              className="rounded bg-violet-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              disabled={aiBusy || !aiInput.trim()}
              onClick={sendAiChat}
            >
              发送
            </button>
          </div>
            </>
          ) : null}
          {aiClearAsk ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="w-64 rounded-lg bg-white p-4 shadow-xl">
                <p className="text-xs text-slate-700">确定清除 AI 顾问的对话内容吗？</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600"
                    onClick={() => setAiClearAsk(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded bg-red-600 px-3 py-1 text-xs text-white"
                    onClick={() => {
                      setAiMsgs([]);
                      setAiClearAsk(false);
                    }}
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        </>
        ) : null}
      </SectionCard>

      {/* 二、搜索筛选 */}
      <div className="mt-4">
        <SectionCard title="二、搜索筛选" description="按行业、关键词、地区找出真实官网。先定目标企业数，再开始搜索。">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-700">目标企业数</span>
            {TARGET_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTargetCount(n)}
                disabled={running}
                className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                  targetCount === n ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {n} 家
              </button>
            ))}
            <span className="text-[11px] text-slate-400">一次最多找 200 家企业，不够可继续补足</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs">
              <span className="mb-1 block text-slate-600">大洲</span>
              <select
                className="w-full rounded border border-slate-300 px-2 py-1.5"
                value={continent}
                onChange={(e) => {
                  setContinent(e.target.value);
                  setCountryCode("");
                }}
              >
                {CONTINENT_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-600">国家</span>
              <select
                className="w-full rounded border border-slate-300 px-2 py-1.5"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                <option value="">不限</option>
                {countries.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-600">州/省</span>
              <GeoSelect
                value={province}
                options={provinces}
                onChange={setProvince}
                placeholder="不限"
                disabled={!countryCode || !provinces.length}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-600">城市</span>
              {cities.length ? (
                <GeoSelect
                  value={city}
                  options={cities}
                  onChange={setCity}
                  placeholder="不限"
                />
              ) : (
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={countryCode ? "可填写城市" : "先选国家"}
                />
              )}
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-600">行业</span>
              <select
                className="w-full rounded border border-slate-300 px-2 py-1.5"
                value={industryKey}
                onChange={(e) => setIndustryKey(e.target.value)}
              >
                <option value="">不限 / 邮件营销企业</option>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value={INDUSTRY_CUSTOM_VALUE}>自定义</option>
              </select>
            </label>
            {industryKey === INDUSTRY_CUSTOM_VALUE ? (
              <label className="text-xs">
                <span className="mb-1 block text-slate-600">自定义行业</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                  value={industryCustom}
                  onChange={(e) => setIndustryCustom(e.target.value)}
                  placeholder="输入行业标签，例如：宠物智能穿戴"
                />
              </label>
            ) : null}
            <div className="text-xs md:col-span-2">
              <span className="mb-1 block text-slate-600">关键词（选填，逐个添加，可点 × 删除）</span>
              <div className="flex flex-wrap items-center gap-2">
                {keywordList.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-white"
                  >
                    {k}
                    <button
                      type="button"
                      onClick={() => removeKeyword(k)}
                      className="ml-0.5 leading-none text-white/70 hover:text-white"
                      title="删除该关键词"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="flex min-w-44 flex-1 gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5"
                    value={kwInput}
                    onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="输入关键词后回车添加，例如 packaging"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="shrink-0 rounded bg-slate-700 px-3 py-1.5 text-xs text-white"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-600">
              相关关键词
              {relatedBusy ? <span className="ml-2 text-[11px] text-slate-400">正在生成…</span> : null}
            </div>
            {related.length ? (
              <div className="flex flex-wrap gap-2">
                {related.map((k, i) => {
                  const color = KEYWORD_COLORS[i % KEYWORD_COLORS.length];
                  const on = relatedOn.includes(k);
                  return (
                    <span
                      key={k}
                      className="inline-flex items-center rounded-full text-[11px]"
                      style={{
                        border: `1px solid ${color}`,
                        background: on ? color : "#fff",
                        color: on ? "#fff" : color
                      }}
                    >
                      <button
                        type="button"
                        className="rounded-l-full px-3 py-1"
                        style={{ color: "inherit" }}
                        title="点一下取消或加入搜索"
                        onClick={() => toggleRelated(k)}
                      >
                        {k}
                      </button>
                      <button
                        type="button"
                        aria-label={`删除 ${k}`}
                        title="删除"
                        className="rounded-r-full py-1 pl-0.5 pr-2 leading-none opacity-70 hover:opacity-100"
                        style={{ color: "inherit" }}
                        onClick={() => removeRelated(k)}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">{relatedBusy ? "" : "输入关键词后，这里会列出相关关键词"}</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded bg-slate-900 px-4 py-2 text-xs text-white disabled:opacity-50"
              disabled={busy || running}
              onClick={() => void startSearch()}
            >
              {busy ? "正在提交…" : discovering ? "正在搜索企业…" : "开始搜索企业"}
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-4 py-2 text-xs disabled:opacity-50"
              disabled={!running}
              onClick={() => void stopJob(job?.id, loadTask, setErr)}
            >
              停止
            </button>
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={syncCrm} onChange={(e) => setSyncCrm(e.target.checked)} />
              同步入 CRM 数据库
            </label>
          </div>
          {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
          {notice ? <p className="mt-2 text-xs text-emerald-700">{notice}</p> : null}

          {job ? (
            <div className="mt-4">
              {discovering ? (
                <>
                  <p className="text-xs text-slate-700">
                    正在搜索企业 · 已找到 <strong>{found}</strong> / 目标 {target} 家
                    {Number(job.discoverFound) > 0
                      ? ` · 已核验 ${job.discoverChecked || 0} / ${job.discoverFound} 个候选`
                      : " · 正在翻搜索页"}
                  </p>
                  <ProgressBar pct={discoverPct} indeterminate={!Number(job.discoverFound)} />
                  <button
                    type="button"
                    className="mt-2 rounded border border-rose-300 bg-white px-3 py-1 text-xs text-rose-600"
                    onClick={() => void stopJob(job?.id, loadTask, setErr)}
                  >
                    停止搜索
                  </button>
                </>
              ) : job.status === "failed" ? (
                <p className="text-xs text-rose-600">{job.error_message || job.current_note}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-slate-700">
                    搜索完成，已找到 <strong>{found}</strong> / 目标 {target} 家企业
                    {typeof job.undugCount === "number" && job.undugCount < found
                      ? ` · 尚未深度搜索 ${job.undugCount} 家`
                      : ""}
                  </p>
                  {needMore ? (
                    <button
                      type="button"
                      className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void continueDiscover()}
                    >
                      {busy ? "正在提交…" : `继续搜索补足（已找到 ${found} / 目标 ${target}）`}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">定好目标企业数，点「开始搜索企业」后，找到的企业会按画像分级列在下面。</p>
          )}
        </SectionCard>
      </div>

      {/* 三、企业发现结果 */}
      <div className="mt-4">
        <SectionCard
          title="三、企业发现结果"
          description="A 类最贴合你的客群画像。每栏可单独全选、勾选删除、下载 Excel。深度搜索上限 50 家。"
        >
          {job ? (
            <>
              {discoveryGroups.ungraded.length > 0 ? (
                <div className="mb-3 rounded border border-dashed border-slate-300 bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      待分级（{discoveryGroups.ungraded.length} 家）
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                        disabled={busy || gradingMissing || !job?.id}
                        onClick={() => job?.id && void gradeMissing(job.id)}
                      >
                        {gradingMissing ? "分级中…" : "一键分级"}
                      </button>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          disabled={!canPick}
                          checked={ungradedAllPicked}
                          onChange={(e) => {
                            const ds = discoveryGroups.ungraded.map((c) => c.domain);
                            setPicked((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, ...ds])]
                                : prev.filter((d) => !ds.includes(d))
                            );
                          }}
                        />
                        全选
                      </label>
                      <button
                        type="button"
                        className="rounded bg-red-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                        disabled={busy || !discoveryGroups.ungraded.some((c) => picked.includes(c.domain))}
                        onClick={() =>
                          void removePicked(
                            discoveryGroups.ungraded.filter((c) => picked.includes(c.domain)).map((c) => c.domain)
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <ul className="max-h-28 overflow-y-auto rounded border border-slate-200 bg-white text-xs">
                    {discoveryGroups.ungraded.map((c) => (
                      <CompanyPickRow key={c.domain} c={c} />
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {GRADE_ORDER.map((g) => {
                  const st = GRADE_STYLE[g];
                  const list = discoveryGroups.groups[g];
                  const s = statOf(g);
                  const allIn = list.length > 0 && list.every((c) => picked.includes(c.domain));
                  return (
                    <div
                      key={g}
                      className="rounded-lg border-2 p-2"
                      style={{
                        borderColor: st.border,
                        background: st.bg,
                        boxShadow: g === "A" ? `0 0 0 2px ${st.border}44` : undefined
                      }}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold" style={{ color: st.head }}>
                            {g} 类 · {GRADE_SUB[g]}（{list.length} 家）
                          </div>
                          <div className="text-[10px] leading-4 text-slate-500">
                            累计：企业{s.companies} · 联系人{s.contacts} · 邮箱{s.emails}（有效{s.validEmails}）
                          </div>
                          <div className="text-[10px] leading-4 text-slate-500">
                            本轮新增：+{s.newCompanies} · +{s.newContacts} · +{s.newValidEmails}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            <input
                              type="checkbox"
                              disabled={!canPick || !list.length}
                              checked={allIn}
                              onChange={(e) => {
                                const ds = list.map((c) => c.domain);
                                setPicked((prev) =>
                                  e.target.checked
                                    ? [...new Set([...prev, ...ds])]
                                    : prev.filter((d) => !ds.includes(d))
                                );
                              }}
                            />
                            全选
                          </label>
                          <button
                            type="button"
                            className="rounded bg-red-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                            disabled={busy || !list.some((c) => picked.includes(c.domain))}
                            onClick={() =>
                              void removePicked(list.filter((c) => picked.includes(c.domain)).map((c) => c.domain))
                            }
                          >
                            删除
                          </button>
                          <button
                            type="button"
                            className="rounded bg-slate-700 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                            disabled={!list.length}
                            onClick={() => downloadGradeXlsx(g, list, job?.grades, job?.id)}
                          >
                            下载 Excel
                          </button>
                        </div>
                      </div>
                      {list.length ? (
                        <ul className="max-h-60 overflow-y-auto rounded border border-white/70 bg-white/80 text-xs">
                          {list.map((c) => (
                            <CompanyPickRow key={c.domain} c={c} />
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded bg-white/60 px-2 py-4 text-center text-[11px] text-slate-400">暂无</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                每栏最多展示 15 家，多余的在栏内下拉查看。每家企业后的"已深搜"表示已完成深度搜索。
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">开始搜索后，找到的企业会按 A / B / C / D 类显示在这里。</p>
          )}
        </SectionCard>
      </div>

      {/* 四、深度搜索 */}
      <div className="mt-4">
        <SectionCard title="四、深度搜索" description="对勾选的企业逐家找联系人、职位、邮箱。一家入库后自动下一家，上限 50 家。">
          {stuck ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <span className="text-xs text-amber-800">任务可能已卡住（超过 5 分钟无进展），可从断点恢复，已完成的企业不会重跑。</span>
              <button
                type="button"
                className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void resumeStuck()}
              >
                从断点恢复
              </button>
            </div>
          ) : null}

          <p className="text-[11px] text-slate-400">
            在「三、企业发现结果」各栏勾选要深度搜索的企业（可按栏全选），再点「开始深度搜索」；不勾选默认按 A→B→C→D 跑前 50 家。已选 {picked.length} 家。
          </p>

          <div className="mt-4 rounded border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 text-xs font-medium text-slate-800">深度搜索配置 · 引用企业精搜（找联系人/职位/邮箱的字段与职位）</div>
            <div className="mb-3">
              <div className="mb-1.5 text-[11px] text-slate-600">要查找 / 展示的字段</div>
              <div className="grid max-h-36 grid-cols-2 gap-x-3 gap-y-1.5 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs sm:grid-cols-3">
                {LEAD_FINDER_COLUMNS.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={columns.includes(c.id)} onChange={() => toggleColumn(c.id)} />
                    {c.zh}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] text-slate-600">目标职位 · 勾选后只保留匹配层级（可多选）</div>
              <div className="max-h-40 space-y-1.5 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs">
                {LEAD_FINDER_ROLE_TIERS.map((r) => (
                  <label key={r.id} className="flex items-start gap-2">
                    <input type="checkbox" checked={roles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                    <span>{r.zh}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">快捷勾选：</span>
            {DEEP_BATCH_SIZES.map((n) => {
              const active = picked.length === n && n > 0;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!canPick}
                  onClick={() => setPicked(pickByPriority(n))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40 ${
                    active
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
                  }`}
                >
                  {n} 家
                </button>
              );
            })}
            <span className="text-[11px] text-slate-400">
              按 A→B→C→D 优先级勾选；不勾选默认全部进入深度搜索（上限 50 家）。已选 {picked.length} 家
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={syncCrm} onChange={(e) => setSyncCrm(e.target.checked)} />
              默认同步入库 CRM 数据库
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={verifyEmail} onChange={(e) => setVerifyEmail(e.target.checked)} />
              验证邮箱
            </label>
            <button
              type="button"
              className="rounded bg-emerald-700 px-4 py-2 text-xs text-white disabled:opacity-50"
              disabled={busy || !canPick || (!picked.length && !companies.length)}
              onClick={() => void startDeep()}
            >
              {deepRunning ? "正在深度搜索…" : "开始深度搜索"}
            </button>
          </div>
          {deepRunning ? (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-emerald-800">
                  深度搜索 {job?.processed || 0} / {job?.quota || 0} 家
                </p>
                <button
                  type="button"
                  className="rounded border border-rose-300 bg-white px-3 py-1 text-xs text-rose-600 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void stopJob(job?.id, loadTask, setErr)}
                >
                  {busy ? "正在停止…" : "停止搜索"}
                </button>
              </div>
              <ProgressBar pct={deepPct} indeterminate={deepPct === 0} />
              <p className="mt-1 text-xs text-slate-600" key={job?.current_note || "idle"}>
                <span className="text-slate-400">当前动态：</span>
                {job?.current_note || "排队中…"}
              </p>
            </div>
          ) : null}
          {!deepRunning && job?.status === "stopped" && (job?.stage === "research" || job?.stage === "verify") ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-amber-700">
                深度搜索已停止，进度已保存（已完成 {job?.processed || 0} / {job?.quota || 0}{" "}
                家），已完成的企业不会重搜。
              </p>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void startDeep()}
              >
                {busy ? "正在提交…" : "继续搜索（从断点继续）"}
              </button>
            </div>
          ) : null}
          {!deepRunning && (job?.status === "awaiting_pick" || job?.status === "done") && (job?.undugCount || 0) > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-600">
                还有 {job?.undugCount} 家没深度搜索，已完成的不会重搜。
              </p>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void continueDeepRemaining()}
              >
                {busy ? "正在提交…" : `继续深度搜索剩余 ${job?.undugCount} 家`}
              </button>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">
                总结果展示（{doneCards.length + liveCards.length} 家）
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    disabled={!allResultDomains.length}
                    checked={
                      allResultDomains.length > 0 &&
                      allResultDomains.every((d) => resultPicked.includes(d))
                    }
                    onChange={(e) => setResultPicked(e.target.checked ? [...allResultDomains] : [])}
                  />
                  勾选全部
                </label>
                <button
                  type="button"
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 disabled:opacity-40"
                  disabled={!resultPicked.length}
                  onClick={() => setResultPicked([])}
                >
                  清空
                </button>
                <button
                  type="button"
                  className="rounded bg-red-600 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  disabled={busy || !resultPicked.length}
                  onClick={() => void removePicked(resultPicked).then(() => setResultPicked([]))}
                >
                  删除
                </button>
                <button
                  type="button"
                  className="rounded bg-slate-500 px-3 py-1 text-xs text-white disabled:opacity-40"
                  disabled={!doneCards.length && !liveCards.length}
                  onClick={() => downloadDeepCsv(resultCardsForDownload(), job?.grades, job?.id)}
                >
                  下载
                </button>
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1 text-xs text-white disabled:opacity-40"
                  disabled={!doneCards.length}
                  onClick={() => downloadDeepXlsx(resultCardsForDownload(), job?.grades, job?.id)}
                >
                  下载 Excel
                </button>
              </div>
            </div>
            {liveCards.length || doneCards.length ? (
              <div className="max-h-[40rem] space-y-4 overflow-y-auto rounded border border-slate-200 p-2">
                {liveCards.length ? (
                  <div className="rounded border-2 border-amber-400 bg-amber-50 p-2">
                    <div className="mb-2 text-xs font-semibold text-amber-800">
                      正在深度搜索（{liveCards.length} 家已出结果）
                    </div>
                    <div className="space-y-2">
                      {liveCards.map((c) => (
                        <ResultCardRow key={c.domain} c={c} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {GRADE_ORDER.map((g) => {
                  const list = gradeGroups[g];
                  if (!list.length) return null;
                  const st = GRADE_STYLE[g];
                  return (
                    <div key={g} className="rounded border p-2" style={{ borderColor: st.border, background: st.bg }}>
                      <div className="mb-2 text-xs font-semibold" style={{ color: st.head }}>
                        {st.title}（{list.length} 家）
                      </div>
                      <div className="space-y-2">
                        {list.map((c) => (
                          <ResultCardRow key={c.domain} c={c} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                在「三、企业发现结果」勾选企业后点「开始深度搜索」，结果会显示在这里。
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
