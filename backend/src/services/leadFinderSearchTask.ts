import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Env } from "../env.js";
import { discoverCompaniesFromWebNews, brandFromHost, keepLiveCompanyWebsites, type WebFoundCompany } from "./leadFinderKeywordCompanySearch.js";
import { findPeopleOnTheWeb } from "./leadFinderLocalPeopleSearch.js";
import {
  cleanLeadJobTitle,
  cleanLeadPersonName,
  isPlausibleLeadJobTitle,
  isPlausibleLeadPersonName
} from "./leadFinderPersonNameGate.js";
import { loadAutoSettings } from "./leadFinderAutoRunner.js";
import { guessEmailsFromName } from "./leadFinderEmailGuessLocal.js";
import { verifyPersonCombosOneByOne, smtpProbeHealth, smtpProbeRemote } from "./leadFinderSmtpProbe.js";
import { ingestLeadFinderResearch } from "./leadFinderResearchIngest.js";
import { getLeadSearchProfile } from "./leadFinderProfile.js";
import {
  buildCompanyProfile,
  gradeCompanies,
  localGrade,
  suggestCompaniesByKimi,
  type AiSettings,
  type CompanyGrade,
  type CompanyProfile,
  type GradeInput,
  type GradeTarget
} from "./leadFinderSearchAi.js";

const INSTALL_RE = /^LFI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const VERIFY_CAP = 24;

export type SearchFields = {
  companyName: boolean;
  website: boolean;
  address: boolean;
  mainBusiness: boolean;
  phone: boolean;
  email: boolean;
  titles: boolean;
};

export type SearchTaskInput = {
  keywords: string;
  limit: number;
  countryNameEn: string;
  city: string;
  province?: string;
  industry: string;
  titles: string;
  roleTiers?: string[];
  fields: SearchFields;
  apiKey?: string;
  apiBaseUrl?: string;
  mode?: "industry" | "single";
  relatedKeywords?: string[];
  syncCrm?: boolean;
  /** 目标企业数（10~200，默认 50），discover 阶段尽量凑满 */
  targetCount?: number;
};

/** 每轮统计：discover/深度搜索每完成一轮 push 一条 */
export type RoundStat = {
  at: string;
  stage: "discover" | "research";
  companies: number;
  contacts: number;
  emails: number;
  validEmails: number;
  /** discover: 本轮新增企业域名；research: 本轮深度搜索的企业域名 */
  domains: string[];
};

/** 断点续跑：心跳超过 5 分钟没更新且状态还是 running/queued，视为卡住 */
export const STUCK_MS = 5 * 60 * 1000;

export function clampTargetCount(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(10, n));
}

type CsvRow = Record<string, string>;

function hostFromSite(website: string, company: string): string {
  const raw = String(website || "").trim();
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw || "invalid.local"}`);
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (h && h !== "invalid.local") return h;
  } catch {
    /* ignore */
  }
  const slug = String(company || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "company"}.invalid`;
}

export async function ingestSearchRowsToCrm(
  db: Pool,
  tenantId: number,
  rows: CsvRow[],
  jobIndustry: string
): Promise<{ crm: number; warehouse: number }> {
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const key = String(r.company || r.website || "").trim() || "_";
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  let n = 0;
  let warehouse = 0;
  for (const list of groups.values()) {
    const first = list[0];
    if (!first) continue;
    // 注意：即使整组都没有联系人/邮箱，也要调 ingestLeadFinderResearch，
    // 它会给该企业插一条 research-pending@域名 的占位行（无名无姓），
    // 保证"深搜过的企业哪怕没找到人也入库"。worth 过滤已取消。
    const domain = hostFromSite(first.website || "", first.company || "");
    const r = await ingestLeadFinderResearch(
      db,
      tenantId,
      {
        domain,
        installId: resolveInstallId(),
        company: {
          name: first.company,
          website: first.website,
          description: first.mainBusiness,
          country: first.country,
          industry: jobIndustry || first.mainBusiness
        },
        contacts: list.map((row) => ({
          contact_name: row.contact,
          title: row.title,
          email: row.email,
          email_status: String(row.email_status || "").trim() || (row.email ? "valid" : "unverified")
        })),
        peopleHints: list
          .filter((row) => String(row.contact || "").trim())
          .map((row) => ({ name: String(row.contact).trim(), title: row.title || null }))
      },
      { ok: true }
    );
    n += r.crm;
    if (r.warehouse) warehouse += 1;
  }
  return { crm: n, warehouse };
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function resolveInstallId(): string {
  const fromEnv = String(process.env.LEAD_FINDER_INSTALL_ID || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return INSTALL_RE.test(fromEnv) ? fromEnv : "";
}

function upstreamBase(): string {
  return String(process.env.LEAD_FINDER_UPSTREAM_URL || "https://www.bigsocialboss.cn")
    .trim()
    .replace(/\/+$/, "");
}

export async function ensureLeadSearchTaskSchema(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_search_jobs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      quota INT NOT NULL DEFAULT 10,
      processed INT NOT NULL DEFAULT 0,
      current_note VARCHAR(512) NULL,
      csv_text LONGTEXT NULL,
      error_message TEXT NULL,
      input_json LONGTEXT NULL,
      progress_json LONGTEXT NULL,
      heartbeat_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_lead_search_tenant (tenant_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  for (const col of [
    `ALTER TABLE lead_search_jobs ADD COLUMN csv_text LONGTEXT NULL`,
    `ALTER TABLE lead_search_jobs ADD COLUMN input_json LONGTEXT NULL`,
    `ALTER TABLE lead_search_jobs ADD COLUMN progress_json LONGTEXT NULL`,
    `ALTER TABLE lead_search_jobs ADD COLUMN heartbeat_at DATETIME NULL`
  ]) {
    try {
      await db.query(col);
    } catch {
      /* already exists */
    }
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_search_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      job_id BIGINT NOT NULL,
      status VARCHAR(24) NOT NULL,
      note VARCHAR(1024) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_lead_search_ev (job_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function note(db: Pool, jobId: number, status: string, text: string) {
  await db.query(`INSERT INTO lead_search_events (job_id, status, note) VALUES (?, ?, ?)`, [
    jobId,
    status,
    text.slice(0, 1000)
  ]);
  await db.query(`UPDATE lead_search_jobs SET current_note = ?, heartbeat_at = NOW() WHERE id = ?`, [
    text.slice(0, 500),
    jobId
  ]);
}

type JobStage = "discover" | "awaiting_pick" | "research" | "verify" | "ingest" | "done";

type JobProgress = {
  stage: JobStage;
  companies: WebFoundCompany[];
  pickLimit: number;
  companyIndex: number;
  researchRows: CsvRow[];
  verifiedRows: CsvRow[];
  heartbeatMs: number;
  queuedDomains: string[];
  deepCounts: Record<string, number>;
  onlyUndug: boolean;
  discoverFound: number;
  discoverChecked: number;
  profiles: Record<string, CompanyProfile>;
  grades: Record<string, CompanyGrade>;
  resultRows: CsvRow[];
  lastBatch: string[];
  verifyEmail: boolean;
  syncCrm: boolean;
  roundStats: RoundStat[];
};

const runningJobs = new Set<number>();

function emptyProgress(): JobProgress {
  return {
    stage: "discover",
    companies: [],
    pickLimit: 0,
    companyIndex: 0,
    researchRows: [],
    verifiedRows: [],
    heartbeatMs: Date.now(),
    queuedDomains: [],
    deepCounts: {},
    onlyUndug: true,
    discoverFound: 0,
    discoverChecked: 0,
    profiles: {},
    grades: {},
    resultRows: [],
    lastBatch: [],
    verifyEmail: true,
    syncCrm: true,
    roundStats: []
  };
}

function objOf<T>(v: unknown): Record<string, T> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {};
}

function parseProgress(raw: unknown): JobProgress {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== "object") return emptyProgress();
    const p = o as Record<string, unknown>;
    return {
      stage: (["discover", "awaiting_pick", "research", "verify", "ingest", "done"].includes(String(p.stage))
        ? String(p.stage)
        : "discover") as JobStage,
      companies: Array.isArray(p.companies) ? (p.companies as WebFoundCompany[]) : [],
      pickLimit: Number(p.pickLimit) || 0,
      companyIndex: Number(p.companyIndex) || 0,
      researchRows: Array.isArray(p.researchRows) ? (p.researchRows as CsvRow[]) : [],
      verifiedRows: Array.isArray(p.verifiedRows) ? (p.verifiedRows as CsvRow[]) : [],
      heartbeatMs: Number(p.heartbeatMs) || Date.now(),
      queuedDomains: Array.isArray(p.queuedDomains) ? (p.queuedDomains as string[]) : [],
      deepCounts:
        p.deepCounts && typeof p.deepCounts === "object" ? (p.deepCounts as Record<string, number>) : {},
      onlyUndug: p.onlyUndug !== false,
      discoverFound: Number(p.discoverFound) || 0,
      discoverChecked: Number(p.discoverChecked) || 0,
      profiles: objOf<CompanyProfile>(p.profiles),
      grades: objOf<CompanyGrade>(p.grades),
      resultRows: Array.isArray(p.resultRows) ? (p.resultRows as CsvRow[]) : [],
      lastBatch: Array.isArray(p.lastBatch) ? (p.lastBatch as string[]) : [],
      verifyEmail: p.verifyEmail !== false,
      syncCrm: p.syncCrm !== false,
      roundStats: Array.isArray(p.roundStats)
        ? (p.roundStats as RoundStat[])
            .filter((r) => r && (r.stage === "discover" || r.stage === "research"))
            .map((r) => ({ ...r, domains: Array.isArray(r.domains) ? r.domains.map((d) => String(d)) : [] }))
        : []
    };
  } catch {
    return emptyProgress();
  }
}

/** 行级汇总：联系人数 / 邮箱数 / 有效邮箱数 */
function summarizeRows(rows: CsvRow[]): { contacts: number; emails: number; validEmails: number } {
  let contacts = 0;
  let emails = 0;
  let validEmails = 0;
  for (const r of rows) {
    if (String(r.contact || "").trim()) contacts++;
    if (String(r.email || "").includes("@")) emails++;
    if (String(r.email_status || "").toLowerCase() === "valid") validEmails++;
  }
  return { contacts, emails, validEmails };
}

export type TaskStats = {
  A: GradeStat;
  B: GradeStat;
  C: GradeStat;
  D: GradeStat;
  ungraded: GradeStat; // 约定里是 ungraded?，后端总是返回该键，前端可直接取
};

export type GradeStat = {
  companies: number;
  contacts: number;
  emails: number;
  validEmails: number;
  newCompanies: number;
  newContacts: number;
  newValidEmails: number;
};

function emptyGradeStat(): GradeStat {
  return {
    companies: 0,
    contacts: 0,
    emails: 0,
    validEmails: 0,
    newCompanies: 0,
    newContacts: 0,
    newValidEmails: 0
  };
}

type GradeKey = "A" | "B" | "C" | "D" | "ungraded";

/**
 * 任务统计（按 A/B/C/D 分级，前端每栏直接展示）：
 * - companies/contacts/emails/validEmails：累计
 * - newCompanies：最近一轮 discover 新增的企业（按当前分级归属）
 * - newContacts/newValidEmails：最近一轮深度搜索产出的联系人/有效邮箱（按分级归属）
 * 分级来自 progress.grades；联系人/邮箱按 domain 从 researchRows/verifiedRows/resultRows 汇总。
 */
export function buildTaskStats(progress: JobProgress): TaskStats {
  const gradeMap = new Map<string, GradeKey>();
  for (const [d, g] of Object.entries(progress.grades || {})) {
    const gg = (g as CompanyGrade | undefined)?.grade;
    gradeMap.set(normHost(d), gg === "A" || gg === "B" || gg === "C" || gg === "D" ? gg : "ungraded");
  }
  const gradeOf = (domain: string): GradeKey => gradeMap.get(normHost(domain)) || "ungraded";
  const rowDomain = (r: CsvRow): string => {
    const d = String(r.domain || "").trim();
    if (d) return normHost(d);
    return normHost(hostFromSite(String(r.website || ""), String(r.company || "")));
  };

  const stats: TaskStats = {
    A: emptyGradeStat(),
    B: emptyGradeStat(),
    C: emptyGradeStat(),
    D: emptyGradeStat(),
    ungraded: emptyGradeStat()
  };
  // 累计：企业数按分级
  for (const c of progress.companies) {
    stats[gradeOf(c.domain)].companies++;
  }
  // 累计：联系人/邮箱按 domain 归属汇总（resultRows 最终口径优先，补进行中批次）
  const seen = new Set<string>();
  for (const r of [...progress.resultRows, ...progress.verifiedRows, ...progress.researchRows]) {
    const d = rowDomain(r);
    const k = `${d}|${String(r.contact || "").toLowerCase()}|${String(r.email || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const gs = stats[gradeOf(d)];
    if (String(r.contact || "").trim()) gs.contacts++;
    if (String(r.email || "").includes("@")) gs.emails++;
    if (String(r.email_status || "").toLowerCase() === "valid") gs.validEmails++;
  }
  // 本轮新增：最近一轮 discover 的新增企业，按当前分级归属
  const rounds = progress.roundStats || [];
  const lastDiscover = [...rounds].reverse().find((r) => r.stage === "discover");
  if (lastDiscover) {
    for (const d of lastDiscover.domains || []) {
      stats[gradeOf(d)].newCompanies++;
    }
  }
  // 本轮新增：最近一轮深度搜索的联系人/有效邮箱，按分级归属
  const lastResearch = [...rounds].reverse().find((r) => r.stage === "research");
  if (lastResearch && (lastResearch.domains || []).length) {
    const batchSet = new Set(lastResearch.domains.map(normHost));
    const seenB = new Set<string>();
    for (const r of [...progress.resultRows, ...progress.verifiedRows, ...progress.researchRows]) {
      const d = rowDomain(r);
      if (!batchSet.has(d)) continue;
      const k = `${d}|${String(r.contact || "").toLowerCase()}|${String(r.email || "").toLowerCase()}`;
      if (seenB.has(k)) continue;
      seenB.add(k);
      const gs = stats[gradeOf(d)];
      if (String(r.contact || "").trim()) gs.newContacts++;
      if (String(r.email_status || "").toLowerCase() === "valid") gs.newValidEmails++;
    }
  }
  return stats;
}

function normHost(d: string): string {
  return String(d || "").replace(/^www\./i, "").toLowerCase();
}

/** 合并企业名单（按域名去重），返回合并后名单与新增数 */
function mergeCompanies(
  base: WebFoundCompany[],
  extra: WebFoundCompany[]
): { merged: WebFoundCompany[]; added: number; addedDomains: string[] } {
  const seen = new Set(base.map((c) => normHost(c.domain)));
  const merged = [...base];
  const addedDomains: string[] = [];
  let added = 0;
  for (const c of extra) {
    const h = normHost(c.domain);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    merged.push(c);
    addedDomains.push(c.domain);
    added++;
  }
  return { merged, added, addedDomains };
}

function safeParseInput(raw: unknown): SearchTaskInput | null {
  try {
    return JSON.parse(String(raw || "{}")) as SearchTaskInput;
  } catch {
    return null;
  }
}

async function saveProgress(db: Pool, jobId: number, progress: JobProgress, extra?: { status?: string; processed?: number; quota?: number; csv?: string }) {
  progress.heartbeatMs = Date.now();
  const csv = extra?.csv;
  await db.query(
    `UPDATE lead_search_jobs SET progress_json=?, heartbeat_at=NOW()
      ${extra?.status ? ", status=?" : ""}
      ${extra?.processed != null ? ", processed=?" : ""}
      ${extra?.quota != null ? ", quota=?" : ""}
      ${csv != null ? ", csv_text=?" : ""}
     WHERE id=?`,
    [
      JSON.stringify(progress),
      ...(extra?.status ? [extra.status] : []),
      ...(extra?.processed != null ? [extra.processed] : []),
      ...(extra?.quota != null ? [extra.quota] : []),
      ...(csv != null ? [csv] : []),
      jobId
    ]
  );
}

async function jobStopped(db: Pool, jobId: number): Promise<boolean> {
  const [st] = await db.query<RowDataPacket[]>(`SELECT status FROM lead_search_jobs WHERE id=?`, [jobId]);
  return String(st[0]?.status) === "stopped";
}

async function proxyFinder(path: string, body: Record<string, unknown>, timeoutMs: number) {
  const installId = resolveInstallId();
  if (!installId) throw new Error("未配置 LEAD_FINDER_INSTALL_ID");
  const url = `${upstreamBase()}/api/public/domain-finder/${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, installId }),
      signal: ctrl.signal
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`Lead Finder 非 JSON HTTP ${res.status}`);
    }
    if (!res.ok || data.ok === false) throw new Error(String(data.message || data.error || `HTTP ${res.status}`));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function pickCompany(pack: Record<string, unknown> | null): Record<string, string> {
  const co = (pack?.company && typeof pack.company === "object" ? pack.company : {}) as Record<string, unknown>;
  return {
    name: String(co.name || co.company_name || "").trim(),
    phone: String(co.phone || "").trim(),
    address: String(co.address || co.location || "").trim(),
    city: String(co.city || "").trim(),
    country: String(co.country || "").trim(),
    about: String(co.about || co.description || "").trim()
  };
}

type Person = { name: string; title: string; email: string; phone: string; emailStatus?: string };

const GENERIC_LOCAL = /^(info|sales|contact|office|hello|admin|support|enquiry|inquiry|mail|cs|export|import|purchasing|quote|quotes|marketing|orders|billing)$/i;

function isJunkMailbox(raw: string): boolean {
  const em = String(raw || "").trim().toLowerCase();
  const local = em.split("@")[0] || "";
  return /golf|unblocked|granny|wikihow|acrobat|sexual|realistic|download|install|duckmath|ragdoll/.test(
    `${local} ${em}`
  );
}

function isRealEmail(raw: string): boolean {
  const em = String(raw || "").trim().toLowerCase();
  if (!em.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return false;
  }
  if (isJunkMailbox(em)) return false;
  return true;
}

function namedPersonOk(name: string, title: string): boolean {
  if (!name || name.includes("@") || !isPlausibleLeadPersonName(name)) return false;
  if (!String(title || "").trim()) return false;
  if (/官网公开邮箱/.test(title)) return false;
  return isPlausibleLeadJobTitle(title);
}

/** title 里是否明显挂着别家公司的名头（如 "TransRe COO"），是则拦掉。brand/host 为目标公司。 */
function titleHasForeignCompany(title: string, brand: string, host: string): boolean {
  const t = String(title || "");
  const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = norm(brand);
  const h = norm(String(host || "").replace(/^www\./i, "").split(".")[0]);
  const related = (c: string) => {
    if (!c) return true;
    if (b && (c.includes(b) || b.includes(c))) return true;
    if (h && (c.includes(h) || h.includes(c))) return true;
    return false;
  };
  // "Title at Company" 结构：at 后面的公司名
  const atM = t.match(/\bat\s+([A-Z][A-Za-z0-9&.'\- ]{1,40})/);
  if (atM && !related(norm(atM[1]))) return true;
  // "TransRe COO"：职位词前面的大写词
  const preM = t.match(
    /^([A-Z][A-Za-z0-9&.'\-]{1,30})\s+(?:Co-)?(?:Founder|CEO|CTO|CFO|COO|CMO|President|Director|Manager|Partner)\b/
  );
  if (preM) {
    const w = preM[1].toLowerCase();
    if (
      !/^(the|a|an|former|ex|new|senior|junior|vice|assistant|executive)$/.test(w) &&
      !related(norm(preM[1]))
    )
      return true;
  }
  return false;
}

function harvestEmailsLoose(pack: Record<string, unknown> | null): string[] {
  if (!pack) return [];
  const junk = /sentry|wixpress|example\.com|schema\.org|placeholder|yourdomain|cloudflare|localhost|golf|unblocked|granny|wikihow|acrobat|sexual|duckmath/i;
  const found = new Set<string>();
  const text = JSON.stringify(pack);
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  for (const m of text.match(re) || []) {
    const em = m.toLowerCase();
    if (junk.test(em) || em.endsWith(".png") || em.endsWith(".jpg")) continue;
    found.add(em);
  }
  return [...found];
}

function isPlaceholderPersonName(name: string): boolean {
  return !isPlausibleLeadPersonName(name);
}

function emailsFromHtml(html: string, companyHost: string): string[] {
  const host = companyHost.replace(/^www\./i, "").toLowerCase();
  const decoded = String(html || "")
    .replace(/&#64;|&at;|\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+/gi, "@")
    .replace(/&#46;|\[\s*dot\s*\]|\(\s*dot\s*\)/gi, ".");
  const junk = /sentry|wixpress|example\.com|schema\.org|placeholder|yourdomain|cloudflare|localhost|sentry\.io|\.png$|\.jpg$/i;
  const found = new Set<string>();
  for (const m of decoded.matchAll(/mailto:([^"'?\s#>]+)/gi)) {
    try {
      found.add(decodeURIComponent(m[1] || "").split("?")[0].trim().toLowerCase());
    } catch {
      /* ignore */
    }
  }
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  for (const m of decoded.match(re) || []) {
    found.add(
      m
        .toLowerCase()
        .replace(
          /^(address|email|e-mail|mail|contact|phone|tel)(?=(info|sales|support|contact|hello|office|admin|service|orders?|help|team|enquiries|inquiries)@)/,
          ""
        )
    );
  }
  const out: string[] = [];
  for (const em of found) {
    if (!isRealEmail(em) || junk.test(em)) continue;
    const d = em.split("@")[1] || "";
    const local = em.split("@")[0] || "";
    const sameHost = d === host || d.endsWith(`.${host}`) || host.endsWith(`.${d}`);
    if (sameHost) out.push(em);
  }
  return [...new Set(out)];
}

async function scrapePublicEmails(website: string, companyHost: string): Promise<string[]> {
  const host = companyHost.replace(/^www\./i, "").toLowerCase();
  let base = String(website || "").replace(/\/+$/, "");
  if (!base && host) base = `https://${host}`;
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const urls = [
    base,
    `${base}/contact`,
    `${base}/contact-us`,
    `${base}/contactus`,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/en/contact`,
    `${base}/pages/contact`
  ];
  const found = new Set<string>();
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BSS-Leads/1.0)", Accept: "text/html" }
      });
      if (!res.ok && res.status >= 400) continue;
      const html = await res.text();
      for (const em of emailsFromHtml(html, host)) found.add(em);
    } catch {
      /* next page */
    }
  }
  return [...found].slice(0, 20);
}

function applyGuessVerify(res: Record<string, unknown>, named: Person[], publicMails: Person[]) {
  const rows = (Array.isArray(res.people) ? res.people : Array.isArray(res.results) ? res.results : []) as Array<
    Record<string, unknown>
  >;
  for (const row of rows) {
    const email = String(row.bestEmail || row.email || "")
      .trim()
      .toLowerCase();
    const st = String(row.bestStatus || row.email_status || "").toLowerCase();
    const nm = String(row.name || "").trim();
    if (!email || (st !== "valid" && st !== "risky")) continue;
    const person = named.find((p) => p.name.toLowerCase() === nm.toLowerCase());
    if (person && !isRealEmail(person.email)) {
      person.email = email;
      person.emailStatus = st;
    }
  }
  const known = Array.isArray(res.knownEmails) ? res.knownEmails : [];
  for (const k of known) {
    const rec = k as Record<string, unknown>;
    const email = String(rec.email || "")
      .trim()
      .toLowerCase();
    if (isRealEmail(email)) publicMails.push({ name: "", title: "官网公开邮箱", email, phone: "" });
  }
}

function collectPeople(packs: Array<Record<string, unknown> | null>): Person[] {
  const out: Person[] = [];
  const seenName = new Set<string>();
  const seenEmail = new Set<string>();

  const add = (name: string, title: string, email: string, phone: string) => {
    const em = isRealEmail(email) ? email.trim().toLowerCase() : "";
    const nm = String(name || "").trim();
    if (em) {
      if (seenEmail.has(em)) return;
      seenEmail.add(em);
    }
    if (nm && !nm.includes("@")) {
      if (seenName.has(nm.toLowerCase())) {
        const prev = out.find((p) => p.name.toLowerCase() === nm.toLowerCase());
        if (prev && em && !prev.email) prev.email = em;
        return;
      }
      seenName.add(nm.toLowerCase());
    } else if (!em) {
      return;
    }
    out.push({ name: nm && !nm.includes("@") ? nm : "", title: String(title || ""), email: em, phone: String(phone || "") });
  };

  const harvest = (pack: Record<string, unknown>) => {
    const lists = [pack.items, pack.contacts, pack.emails, pack.knownEmails];
    for (const h of Array.isArray(pack.peopleHints) ? pack.peopleHints : []) {
      const rec = h as Record<string, unknown>;
      add(String(rec.name || ""), String(rec.title || ""), String(rec.email || ""), String(rec.phone || ""));
    }
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        if (typeof it === "string") {
          add("", "", it, "");
          continue;
        }
        const rec = it as Record<string, unknown>;
        add(
          String(rec.contact_name || rec.name || ""),
          String(rec.title || rec.jobTitle || ""),
          String(rec.email || rec.mailbox || ""),
          String(rec.phone || "")
        );
      }
    }
    const co = pack.company && typeof pack.company === "object" ? (pack.company as Record<string, unknown>) : {};
    add("", "", String(co.email || ""), String(co.phone || ""));
    if (Array.isArray(co.emails)) {
      for (const e of co.emails) add("", "", String(e), "");
    }
  };

  for (const pack of packs) {
    if (pack) harvest(pack);
  }
  return out;
}

function buildCsv(rows: CsvRow[], fields: SearchFields): string {
  const headers = [
    fields.companyName ? "企业名称" : null,
    fields.website ? "官网" : null,
    fields.address ? "地址" : null,
    fields.mainBusiness ? "主营业务" : null,
    fields.phone ? "电话" : null,
    "邮箱",
    fields.titles ? "职称" : null,
    "联系人",
    "国家"
  ].filter(Boolean) as string[];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells: string[] = [];
    if (fields.companyName) cells.push(csvCell(r.company));
    if (fields.website) cells.push(csvCell(r.website));
    if (fields.address) cells.push(csvCell(r.address));
    if (fields.mainBusiness) cells.push(csvCell(r.mainBusiness));
    if (fields.phone) cells.push(csvCell(r.phone));
    cells.push(csvCell(r.email));
    if (fields.titles) cells.push(csvCell(r.title));
    cells.push(csvCell(r.contact), csvCell(r.country));
    lines.push(cells.join(","));
  }
  return `\ufeff${lines.join("\n")}`;
}

async function deepCompany(
  co: WebFoundCompany,
  fields: SearchFields,
  kimi: { apiKey: string; baseUrl: string; model: string; titles: string; roleTiers?: string[] },
  onNote?: (text: string) => Promise<void>,
  skipVerify = false
): Promise<CsvRow[]> {
  const scrape = await proxyFinder(
    "scrape",
    { query: co.domain, sources: ["emails", "linkedin", "phone"], forceRefresh: true, skipWebEnrich: true },
    180_000
  ).catch(async (e) => {
    if (onNote) await onNote(`官网 scrape 未通（${String((e as Error)?.message || e).slice(0, 80)}），改走本机网页搜`);
    return null;
  });
  const needPeople = fields.email || fields.titles || fields.phone;
  const bags: Array<Record<string, unknown> | null> = [scrape];
  const meta = pickCompany(scrape);
  const host = co.domain.replace(/^www\./i, "").toLowerCase();
  const brand = (co.name && co.name.length > 1 ? co.name : "") || meta.name || brandFromHost(host);
  if (onNote) await onNote(`先查官网公开邮箱与联系人 · ${brand}`);
  const siteLane = await proxyFinder(
    "discover-lane",
    { query: co.domain, lane: "website", companyName: brand, roleTiers: kimi.roleTiers },
    180_000
  ).catch(() => null);
  bags.push(siteLane);
  if (onNote) await onNote(`抓取官网公开邮箱 ${co.website || co.domain}`);
  const publicMails = await scrapePublicEmails(co.website || `https://${co.domain}`, host);
  if (needPeople) {
    if (onNote) await onNote(`并行：新闻 / 职位(Company) / LinkedIn + ${brand}`);
    const extra = await Promise.all([
      proxyFinder(
        "discover-lane",
        { query: co.domain, lane: "news", companyName: brand, roleTiers: kimi.roleTiers },
        200_000
      ).catch(() => null),
      proxyFinder(
        "discover-lane",
        { query: co.domain, lane: "titles", companyName: brand, roleTiers: kimi.roleTiers },
        200_000
      ).catch(() => null),
      proxyFinder(
        "discover-lane",
        { query: co.domain, lane: "linkedin_web", companyName: brand, roleTiers: kimi.roleTiers },
        200_000
      ).catch(() => null)
    ]);
    bags.push(...extra);
    if (extra.every((x) => !x) && onNote) {
      await onNote(`主站车道不可用，改用本机：官网团队页 + 职位多路径 + LinkedIn + 访谈`);
    }
    const local = await findPeopleOnTheWeb({
      brand,
      domain: host,
      website: co.website || `https://${host}`,
      roleTiers: kimi.roleTiers,
      onNote
    });
    bags.push({
      peopleHints: local.map((p) => ({ name: p.name, title: p.title, email: (p as { email?: string }).email || "" }))
    });
  }
  let people = collectPeople(bags).map((p) => ({
    ...p,
    name: p.name ? cleanLeadPersonName(p.name) : "",
    title: cleanLeadJobTitle(p.title)
  }));
  const siteEmails = new Set<string>();
  for (const pack of bags) {
    for (const em of harvestEmailsLoose(pack)) {
      const d = em.split("@")[1] || "";
      if (d === host || d.endsWith(`.${host}`)) siteEmails.add(em);
    }
  }
  for (const em of publicMails) siteEmails.add(em);
  if (co.email && isRealEmail(co.email)) siteEmails.add(co.email.trim().toLowerCase());
  for (const em of siteEmails) {
    people.push({ name: "", title: "官网公开邮箱", email: em, phone: "" });
  }
  if (co.email && isRealEmail(co.email)) {
    people.push({ name: "", title: "", email: co.email, phone: "" });
  }
  people = collectPeople([{ items: people.map((p) => ({ contact_name: p.name, title: p.title, email: p.email, phone: p.phone })) }]);

  people = people.filter((p) => {
    if (p.name) return namedPersonOk(p.name, p.title);
    return isRealEmail(p.email);
  });

  // 公司相关性过滤：title 里明显是别家公司的人（如 "TransRe COO"）直接拦掉
  people = people.filter((p) => {
    if (!p.name) return true;
    return !titleHasForeignCompany(p.title, brand, host);
  });

  const siteRows: Person[] = [...siteEmails].map((email) => ({
    name: "",
    title: "官网公开邮箱",
    email,
    phone: ""
  }));
  const named = people.filter((p) => namedPersonOk(p.name, p.title)).slice(0, VERIFY_CAP);

  if (fields.email && !skipVerify) {
    const probeOn = await smtpProbeHealth();
    for (const em of [...siteEmails]) {
      people.push({ name: "", title: "官网公开邮箱", email: em, phone: "" });
    }
    people = collectPeople([{ items: people.map((p) => ({ contact_name: p.name, title: p.title, email: p.email, phone: p.phone })) }]);

    const known = [...siteEmails];
    const named = people.filter((p) => namedPersonOk(p.name, p.title)).slice(0, VERIFY_CAP);
    const siteRows: Person[] = known.map((email) => ({
      name: "",
      title: "官网公开邮箱",
      email,
      phone: "",
      emailStatus: "unverified"
    }));

    for (const person of named) {
      if (isRealEmail(person.email)) continue;
      const guesses = guessEmailsFromName(person.name, co.domain);
      if (!guesses.length) continue;
      let hit = "";
      if (probeOn) {
        hit = await verifyPersonCombosOneByOne(person.name, co.domain, guesses, async (em) => {
          if (onNote) await onNote(`验邮 ${person.name} · ${em}`);
        });
      }
      if (!hit) {
        try {
          const res = await proxyFinder(
            "guess-verify-batch",
            {
              domain: co.domain,
              people: [{ name: person.name, title: person.title }],
              knownEmails: []
            },
            90_000
          );
          applyGuessVerify(res, named, siteRows);
        } catch {
          /* keep empty */
        }
      } else {
        person.email = hit;
        person.emailStatus = "valid";
      }
    }
    if (known.length && !probeOn) {
      try {
        const res = await proxyFinder(
          "guess-verify-batch",
          { domain: co.domain, people: [], knownEmails: known },
          90_000
        );
        applyGuessVerify(res, named, siteRows);
      } catch {
        /* public emails already kept */
      }
    }

    const merged: Person[] = [];
    const seenE = new Set<string>();
    const seenN = new Set<string>();
    const push = (p: Person) => {
      if (isRealEmail(p.email)) {
        const k = p.email.toLowerCase();
        if (seenE.has(k)) return;
        seenE.add(k);
      } else if (p.name) {
        if (seenN.has(p.name.toLowerCase())) return;
        seenN.add(p.name.toLowerCase());
      } else {
        return;
      }
      if (p.name) seenN.add(p.name.toLowerCase());
      merged.push(p);
    };
    for (const p of siteRows) push(p);
    for (const p of named) push(p);
    if (meta.phone && !merged.length) {
      merged.push({ name: "", title: "", email: "", phone: meta.phone });
    }
    if (!merged.length) {
      const nm = String(co.contactName || "").trim();
      const tt = String(co.title || "").trim();
      if (namedPersonOk(nm, tt) || isRealEmail(co.email || "")) {
        merged.push({
          name: namedPersonOk(nm, tt) ? nm : "",
          title: namedPersonOk(nm, tt) ? tt : isRealEmail(co.email || "") ? "官网公开邮箱" : "",
          email: isRealEmail(co.email || "") ? String(co.email).trim().toLowerCase() : "",
          phone: meta.phone
        });
      }
    }

    return dropInvalidEmails(
      merged.map((p) => ({
        company: brand,
        website: co.website,
        address: meta.address || [meta.city, co.country].filter(Boolean).join(", "),
        mainBusiness: co.mainBusiness || meta.about,
        phone: p.phone || meta.phone,
        email: p.email,
        email_status: p.emailStatus || (isRealEmail(p.email) && p.name ? "valid" : p.email ? "unverified" : ""),
        title: p.title,
        contact: p.name,
        country: meta.country || co.country
      }))
    );
  }

  const merged: Person[] = [];
  const seenE = new Set<string>();
  const seenN = new Set<string>();
  const push = (p: Person) => {
    if (isRealEmail(p.email)) {
      const k = p.email.toLowerCase();
      if (seenE.has(k)) return;
      seenE.add(k);
    } else if (p.name) {
      if (seenN.has(p.name.toLowerCase())) return;
      seenN.add(p.name.toLowerCase());
    } else {
      return;
    }
    if (p.name) seenN.add(p.name.toLowerCase());
    merged.push(p);
  };
  for (const p of siteRows) push(p);
  for (const p of named) push(p);
  if (meta.phone && !merged.length) {
    merged.push({ name: "", title: "", email: "", phone: meta.phone });
  }
  if (!merged.length) {
    const nm = String(co.contactName || "").trim();
    const tt = String(co.title || "").trim();
    if (namedPersonOk(nm, tt) || isRealEmail(co.email || "")) {
      merged.push({
        name: namedPersonOk(nm, tt) ? nm : "",
        title: namedPersonOk(nm, tt) ? tt : isRealEmail(co.email || "") ? "官网公开邮箱" : "",
        email: isRealEmail(co.email || "") ? String(co.email).trim().toLowerCase() : "",
        phone: meta.phone
      });
    }
  }

  return dropInvalidEmails(
    merged.map((p) => ({
      company: brand,
      website: co.website,
      address: meta.address || [meta.city, co.country].filter(Boolean).join(", "),
      mainBusiness: co.mainBusiness || meta.about,
      phone: p.phone || meta.phone,
      email: p.email,
      email_status: p.emailStatus || (isRealEmail(p.email) && p.name ? "valid" : p.email ? "unverified" : ""),
      title: p.title,
      contact: p.name,
      country: meta.country || co.country
    }))
  );
}

/**
 * 无效邮箱直接去掉：纯公开邮箱行整行删除；联系人行保留人名职位、清空邮箱。
 * 有效 / 可能有效 / 未验证 / 未找到 保持不变。
 */
function dropInvalidEmails(rows: CsvRow[]): CsvRow[] {
  const out: CsvRow[] = [];
  for (const r of rows) {
    const email = String(r.email || "").trim();
    const st = String(r.email_status || "").toLowerCase();
    if (email && st === "invalid") {
      if (!String(r.contact || "").trim()) continue;
      out.push({ ...r, email: "", email_status: "" });
      continue;
    }
    out.push(r);
  }
  return out;
}

function dropRepeatedStockPeople(rows: CsvRow[]): CsvRow[] {
  const companiesByName = new Map<string, Set<string>>();
  for (const r of rows) {
    const n = String(r.contact || "")
      .trim()
      .toLowerCase();
    if (!n) continue;
    if (!companiesByName.has(n)) companiesByName.set(n, new Set());
    companiesByName.get(n)!.add(String(r.company || "").toLowerCase());
  }
  return rows.filter((r) => {
    const raw = String(r.contact || "").trim();
    const n = raw.toLowerCase();
    if (!n) return true;
    if (isPlaceholderPersonName(raw)) return false;
    const co = String(r.company || "").trim().toLowerCase();
    if (co.length >= 3 && n.includes(co)) return false;
    const cos = companiesByName.get(n);
    return !cos || cos.size < 2;
  });
}

/** 深搜无有效结果时的公司占位行：没人名不代表没企业信息，有什么显示什么 */
function companyPlaceholderRow(co: WebFoundCompany): CsvRow {
  return {
    company: co.name || "",
    website: co.website || "",
    domain: String(co.domain || "")
      .replace(/^www\./i, "")
      .toLowerCase(),
    country: co.country || "",
    city: co.city || "",
    mainBusiness: co.mainBusiness || "",
    contact: "",
    title: "",
    email: "",
    email_status: "",
    phone: "",
    address: ""
  };
}

const DISCOVER_CAP = 400;

function selectDeepBatch(
  companies: WebFoundCompany[],
  deepCounts: Record<string, number>,
  pickLimit: number,
  pickAll: boolean,
  onlyUndug: boolean
): WebFoundCompany[] {
  const pool = onlyUndug ? companies.filter((c) => !deepCounts[c.domain]) : [...companies];
  if (pickAll) return pool;
  const n = Math.min(Math.max(1, pickLimit), pool.length);
  return pool.slice(0, n);
}

async function loadJobBundle(db: Pool, jobId: number): Promise<{ input: SearchTaskInput; progress: JobProgress }> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT input_json, progress_json FROM lead_search_jobs WHERE id=? LIMIT 1`,
    [jobId]
  );
  const input = JSON.parse(String(rows[0]?.input_json || "{}")) as SearchTaskInput;
  const progress = parseProgress(rows[0]?.progress_json);
  return { input, progress };
}

const TOPIC_STOP =
  /^(private|label|labels|contract|custom|manufacturers?|manufacturing|suppliers?|wholesalers?|wholesale|distributors?|factory|factories|brands?|agency|agencies|software|compan(y|ies)|services?|solutions?|online|stores?|shops?|marketing|email|products?|business|global|international|leading|quality|premium|digital|platforms?|tools?|automation|makers?|oem|odm|b2b|retailers?|exporters?|importers?)$/i;

function topicWords(keywords: string): string[] {
  const words = String(keywords || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 5 && !TOPIC_STOP.test(w));
  return [...new Set(words)].slice(0, 12);
}

export type DiscoverResult = { added: number; total: number; exhausted: boolean };

/**
 * 企业发现。默认从零开始；传 opts.baseProgress + opts.excludeDomains 时为追加模式：
 * 已有公司保留不动，新公司去重后追加，直到达到 input.targetCount 或无更多结果。
 */
async function runDiscoverOnly(
  db: Pool,
  jobId: number,
  input: SearchTaskInput,
  ai?: AiSettings,
  opts?: { excludeDomains?: string[]; baseProgress?: JobProgress; tenantId?: number }
): Promise<DiscoverResult> {
  if (runningJobs.has(jobId)) return { added: 0, total: 0, exhausted: true };
  runningJobs.add(jobId);
  const fail = (added: number, total: number): DiscoverResult => ({ added, total, exhausted: true });
  try {
    await db.query(`UPDATE lead_search_jobs SET status='running', heartbeat_at=NOW() WHERE id=?`, [jobId]);
    const geo = [input.city, input.province, input.countryNameEn].filter(Boolean).join(" / ");
    const framework = [input.industry, input.keywords, geo].filter(Boolean).join(" · ");
    const target = clampTargetCount(input.targetCount);
    const base = opts?.baseProgress;
    const baseCount = base ? base.companies.length : 0;
    await note(
      db,
      jobId,
      "running",
      base
        ? `继续搜索企业：已有 ${baseCount} 家，目标 ${target} 家，正在找更多不重复的企业…`
        : `在 ${geo || "所选国家"} 按行业「${input.industry || input.keywords || "未选"}」用 AI 联网检索 + 网页搜索找企业官网（约 1～3 分钟）`
    );
    const searchKeywords = [input.keywords, ...(input.relatedKeywords || [])]
      .map((k) => String(k || "").trim())
      .filter(Boolean)
      .join(", ");
    const live: JobProgress = base
      ? { ...base, heartbeatMs: Date.now() }
      : { ...emptyProgress(), syncCrm: input.syncCrm !== false };
    live.stage = "discover";
    const [aiFound, webFound] = await Promise.all([
      ai
        ? suggestCompaniesByKimi(ai, {
            industry: input.industry,
            keywords: searchKeywords,
            countryNameEn: input.countryNameEn,
            city: input.city,
            province: input.province,
            limit: 30
          }).catch(() => [] as WebFoundCompany[])
        : Promise.resolve([] as WebFoundCompany[]),
      discoverCompaniesFromWebNews({
        keywords: searchKeywords,
        industry: input.industry,
        countryNameEn: input.countryNameEn,
        city: input.city,
        province: input.province,
        limit: DISCOVER_CAP
      })
    ]);
    const seenHosts = new Set((opts?.excludeDomains || []).map(normHost));
    const found = [...aiFound, ...webFound].filter((c) => {
      const h = normHost(c.domain);
      if (!h || seenHosts.has(h)) return false;
      seenHosts.add(h);
      return true;
    });
    if (await jobStopped(db, jobId)) {
      const { merged } = mergeCompanies(base?.companies || [], []);
      await saveProgress(
        db,
        jobId,
        { ...live, stage: "awaiting_pick", companies: merged, discoverChecked: (base?.discoverChecked || 0) + found.length },
        { processed: 0, quota: merged.length }
      );
      await note(db, jobId, "stopped", "已停止");
      return { added: 0, total: merged.length, exhausted: false };
    }
    live.discoverFound = (base?.discoverFound || 0) + found.length;
    await saveProgress(db, jobId, live);
    await note(db, jobId, "running", `范围内命中 ${found.length} 个候选，正在打开官网核验是否属于该行业…`);
    // 分级目标（含业务画像）提前准备好，供核验过程中的增量分级和结尾补分级共用
    let profileText = "";
    if (opts?.tenantId) {
      try {
        const prof = await getLeadSearchProfile(db, opts.tenantId);
        if (prof) {
          profileText = [
            prof.companyIntro.trim() && `企业介绍：${prof.companyIntro.trim()}`,
            prof.businessDesc.trim() && `业务介绍：${prof.businessDesc.trim()}`,
            prof.customerProfile.trim() && `目标客群画像：${prof.customerProfile.trim()}`
          ]
            .filter(Boolean)
            .join("\n");
        }
      } catch {
        /* 画像读不到就按原逻辑分级 */
      }
    }
    const gradeTarget: GradeTarget = {
      industry: input.industry,
      keywords: input.keywords,
      relatedKeywords: input.relatedKeywords || [],
      geo,
      titles: input.titles,
      ...(profileText ? { profileText } : {})
    };
    const toGradeInputs = (list: WebFoundCompany[]): GradeInput[] =>
      list.map((co) => ({
        domain: co.domain,
        name: co.name,
        intro: co.evidence || live.profiles[co.domain]?.intro || "",
        mainBusiness: co.mainBusiness,
        country: co.country,
        people: 0,
        validEmails: 0,
        publicEmails: 0
      }));
    const isGraded = (domain: string): boolean => {
      const h = normHost(domain);
      return Boolean(live.grades?.[domain] || live.grades?.[h]);
    };
    let lastSave = 0;
    let pending: Promise<unknown> = Promise.resolve();
    // 停止：onProgress 里节流查库，置位后核验循环提前退出
    let stopRequested = false;
    let stopCheckAt = 0;
    // 增量分级：节流 15s 一次，不阻塞核验主流程
    let gradeInFlight: Promise<void> | null = null;
    let lastDeltaGradeAt = 0;
    const submittedHosts = new Set<string>();
    const need = Math.max(0, target - baseCount);
    const cap = base ? Math.max(10, Math.min(DISCOVER_CAP, need)) : DISCOVER_CAP;
    const kept = await keepLiveCompanyWebsites(
      found,
      cap,
      {
        industry: input.industry,
        keywords: [searchKeywords, ...topicWords(searchKeywords)].filter(Boolean).join(", "),
        countryNameEn: input.countryNameEn,
        city: input.city,
        province: input.province
      },
      (sofar, checked) => {
        const now = Date.now();
        if (!stopRequested && now - stopCheckAt > 3000) {
          stopCheckAt = now;
          void jobStopped(db, jobId)
            .then((s) => {
              if (s) stopRequested = true;
            })
            .catch(() => undefined);
        }
        if (!gradeInFlight && now - lastDeltaGradeAt > 15000) {
          const delta = sofar.filter((c) => {
            const h = normHost(c.domain);
            return h && !submittedHosts.has(h) && !isGraded(c.domain);
          });
          if (delta.length && !stopRequested) {
            lastDeltaGradeAt = now;
            delta.forEach((c) => submittedHosts.add(normHost(c.domain)));
            const inputs = toGradeInputs(delta);
            gradeInFlight = (async () => {
              try {
                const gs = ai
                  ? await gradeCompanies(ai, gradeTarget, inputs)
                  : Object.fromEntries(inputs.map((c) => [c.domain, localGrade(gradeTarget, c)]));
                if (stopRequested || (await jobStopped(db, jobId))) return;
                live.grades = { ...(live.grades || {}), ...gs };
              } catch {
                /* 忽略，结尾统一补分级 */
              }
            })().finally(() => {
              gradeInFlight = null;
            });
          }
        }
        if (now - lastSave < 2000) return;
        lastSave = now;
        const snap: JobProgress = {
          ...live,
          companies: base ? mergeCompanies(base.companies, sofar).merged : sofar.slice(0, DISCOVER_CAP),
          discoverChecked: (base?.discoverChecked || 0) + checked
        };
        pending = pending.then(() => saveProgress(db, jobId, snap)).catch(() => undefined);
      },
      () => stopRequested
    );
    await pending;
    if (gradeInFlight) {
      // 最多等 3 分钟：分级接口若长时间无响应，不阻塞任务收尾（结尾统一补分级会兜底），避免内存运行标记永久残留
      await Promise.race([
        gradeInFlight.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 180000))
      ]);
    }
    const { merged, added, addedDomains } = mergeCompanies(base?.companies || [], kept);
    const total = merged.length;
    if (await jobStopped(db, jobId)) {
      await saveProgress(
        db,
        jobId,
        { ...live, stage: "awaiting_pick", companies: merged, discoverChecked: (base?.discoverChecked || 0) + found.length },
        { processed: 0, quota: total }
      );
      await note(db, jobId, "stopped", `已停止 · 已找到 ${total} 家，可勾选后深度搜索`);
      return { added, total, exhausted: false };
    }
    if (!kept.length && !merged.length) {
      throw new Error(
        found.length
          ? `搜到 ${found.length} 个候选，打开官网后没有出现所选行业用词（如下拉「个人护理用品」应对 skincare / cosmetics / beauty）。请换行业或补英文关键词后再搜`
          : "该国家+行业翻多页后仍没有可打开的企业官网，请换行业词、补城市后再搜"
      );
    }
    const exhausted = total < target;
    // 发现即分级：新公司按画像同步分 A/B/C/D，直接进对应栏，不再堆在待分级
    // （核验过程中已做增量分级，这里只补漏）
    const toGrade = kept.filter((c) => c.domain && !isGraded(c.domain));
    if (toGrade.length) {
      await note(db, jobId, "running", `正在按目标客群给 ${toGrade.length} 家新企业分 A / B / C / D 类…`);
      try {
        const inputs = toGradeInputs(toGrade);
        const grades = ai
          ? await gradeCompanies(ai, gradeTarget, inputs)
          : Object.fromEntries(inputs.map((c) => [c.domain, localGrade(gradeTarget, c)]));
        live.grades = { ...(live.grades || {}), ...grades };
      } catch (e) {
        console.warn("[lead-search-task] discover-grade", e);
      }
    }
    live.roundStats = [
      ...(live.roundStats || []),
      {
        at: new Date().toISOString(),
        stage: "discover",
        companies: added,
        contacts: 0,
        emails: 0,
        validEmails: 0,
        domains: addedDomains
      }
    ];
    const progress: JobProgress = {
      ...live,
      stage: "awaiting_pick",
      companies: merged,
      pickLimit: 0,
      discoverChecked: (base?.discoverChecked || 0) + found.length
    };
    await saveProgress(db, jobId, progress, {
      status: "awaiting_pick",
      processed: 0,
      quota: total
    });
    await note(
      db,
      jobId,
      "awaiting_pick",
      base
        ? `继续搜索完成，新增 ${added} 家，累计 ${total} 家 / 目标 ${target} 家${exhausted ? "（已无更多不重复结果）" : ""}。请勾选企业，再点「开始深度搜索」`
        : `搜索完成，共找到 ${total} 家已核验官网的企业。请全选或勾选企业，再点「开始深度搜索」`
    );
    return { added, total, exhausted };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/unsupported_country|territory not supported|403|request_forbidden|调研失败 HTTP/i.test(msg)) msg = "";
    await db.query(`UPDATE lead_search_jobs SET status='failed', error_message=? WHERE id=?`, [msg, jobId]);
    if (msg) await note(db, jobId, "error", msg);
    return fail(0, 0);
  } finally {
    runningJobs.delete(jobId);
  }
}

async function runResearchThenVerify(db: Pool, env: Env, jobId: number, tenantId: number) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  try {
    const { input, progress } = await loadJobBundle(db, jobId);
    const settings = await loadAutoSettings(db, tenantId, env);
    const kimi = {
      apiKey: settings.apiKey,
      baseUrl: settings.apiBaseUrl,
      model: settings.apiModel,
      titles: input.titles,
      roleTiers: input.roleTiers
    };
    const picked = (progress.queuedDomains.length
      ? progress.queuedDomains
          .map((d) => progress.companies.find((c) => c.domain === d))
          .filter((c): c is WebFoundCompany => Boolean(c))
      : progress.companies.slice(0, Math.max(1, progress.pickLimit || 10)));
    await db.query(`UPDATE lead_search_jobs SET status='running', quota=?, heartbeat_at=NOW() WHERE id=?`, [
      picked.length,
      jobId
    ]);

    if (progress.stage !== "verify" && progress.stage !== "ingest") {
    progress.stage = "research";
    for (let i = progress.companyIndex; i < picked.length; i++) {
      if (await jobStopped(db, jobId)) {
        await note(db, jobId, "stopped", "已停止（进度已保存，可再点继续）");
        progress.companyIndex = i;
        await saveProgress(db, jobId, progress);
        return;
      }
      const co = picked[i];
      const tag = `[${i + 1}/${picked.length}]`;
      await note(db, jobId, "running", `深度搜索 ${tag} · ${co.name}（${co.domain}）`);
      const profileP = buildCompanyProfile(settings, co, co.name || brandFromHost(co.domain))
        .then((p) => {
          progress.profiles[co.domain] = p;
        })
        .catch(() => undefined);
      try {
        const deep = await deepCompany(co, input.fields, kimi, async (text) => note(db, jobId, "running", `${tag} ${text}`), true);
        progress.researchRows.push(...deep.map((r) => ({ ...r, domain: co.domain })));
        await note(db, jobId, "done", `${tag} ${co.name} 找到联系人/官网邮箱 ${deep.length} 条${progress.verifyEmail ? "（尚未验邮）" : ""}`);
      } catch {
        progress.researchRows.push({
          company: co.name,
          website: co.website,
          address: "",
          mainBusiness: co.mainBusiness,
          phone: "",
          email: "",
          title: "",
          contact: "",
          country: co.country,
          domain: co.domain
        });
        await note(db, jobId, "error", `${tag} ${co.name} 联系人调研失败，已保留公司`);
      }
      await profileP;
      progress.companyIndex = i + 1;
      // 每家完成后立即标记已深搜，供"停止后继续"断点续跑时跳过已完成企业
      progress.deepCounts[co.domain] = (progress.deepCounts[co.domain] || 0) + 1;
      // 出来一家入一家：该企业调研完成立即同步入库 CRM（有多少同步多少）。
      // 入库按 (tenant_id, email) 去重，断点续跑/最终汇总再次入库不会重复。
      // 无有效结果也入库一条公司占位行（ingest 内会转成 research-pending@域名），保证"搜过就有记录"。
      if (progress.syncCrm) {
        try {
          const coHost = normHost(co.domain);
          const coRows = dropRepeatedStockPeople(
            progress.researchRows.filter((r) => normHost(String(r.domain || "")) === coHost)
          );
          const toIngest = coRows.length ? coRows : [companyPlaceholderRow(co)];
          const sr = await ingestSearchRowsToCrm(db, tenantId, toIngest, input.industry);
          if (sr.crm > 0)
            await note(db, jobId, "running", `${tag} ${co.name} 已同步入库 CRM ${sr.crm} 条`);
        } catch (e) {
          console.warn("[lead-search-task] crm incremental ingest", (e as Error)?.message || e);
        }
      }
      await saveProgress(db, jobId, progress, {
        processed: i + 1,
        csv: buildCsv(progress.researchRows, input.fields)
      });
    }
    }

    const batchHosts = new Set(picked.map((c) => c.domain.replace(/^www\./i, "").toLowerCase()));
    const rowHost = (r: CsvRow) =>
      String(r.domain || hostFromSite(String(r.website || ""), String(r.company || "")))
        .replace(/^www\./i, "")
        .toLowerCase();
    const work = dropRepeatedStockPeople(progress.researchRows.filter((r) => batchHosts.has(rowHost(r))));
    const verified: CsvRow[] = [...progress.verifiedRows];
    if (progress.verifyEmail) {
    progress.stage = "verify";
    progress.companyIndex = 0;
    await note(db, jobId, "running", "开始验邮：每人估测企业邮箱组合，再逐个验证");
    const probeOn = await smtpProbeHealth();
    if (!probeOn) await note(db, jobId, "running", "发信机验邮服务暂时连不上，改用主站验邮接口");
    const seenValid = new Set(
      verified
        .filter((r) => String(r.email_status || "").toLowerCase() === "valid")
        .map((r) => String(r.email || "").toLowerCase())
    );
    const donePerson = new Set(
      verified.map((r) => `${String(r.company || "").toLowerCase()}|${String(r.contact || "").toLowerCase()}`)
    );

    for (const row of work) {
      if (await jobStopped(db, jobId)) {
        progress.verifiedRows = verified;
        await saveProgress(db, jobId, progress);
        await note(db, jobId, "stopped", "验邮已暂停，进度已保存");
        return;
      }
      const name = String(row.contact || "").trim();
      const personKey = `${String(row.company || "").toLowerCase()}|${name.toLowerCase()}`;
      if (name && donePerson.has(personKey)) continue;
      const website = String(row.website || "");
      const domain = hostFromSite(website, row.company || "");
      const existing = String(row.email || "")
        .trim()
        .toLowerCase();
      if (isRealEmail(existing) && (!name || GENERIC_LOCAL.test(existing.split("@")[0] || ""))) {
        let st = row.email_status || "unverified";
        if (probeOn && st !== "valid") {
          await note(db, jobId, "running", `验证公开邮箱 ${existing}`);
          st = await smtpProbeRemote(existing);
        }
        if (st === "invalid") {
          await note(db, jobId, "running", `公开邮箱无效，已去掉 ${existing}`);
          if (String(row.contact || "").trim()) {
            verified.push({ ...row, email: "", email_status: "" });
          }
          continue;
        }
        verified.push({ ...row, email_status: st });
        continue;
      }
      if (!name || !isPlausibleLeadPersonName(name)) {
        if (isRealEmail(existing)) verified.push({ ...row, email_status: row.email_status || "unverified" });
        continue;
      }
      if (isRealEmail(existing) && String(row.email_status || "").toLowerCase() === "valid") {
        verified.push(row);
        seenValid.add(existing);
        donePerson.add(personKey);
        continue;
      }
      const guesses = guessEmailsFromName(name, domain);
      let hit = "";
      if (probeOn && guesses.length) {
        hit = await verifyPersonCombosOneByOne(name, domain, guesses, async (em) => {
          await note(db, jobId, "running", `验邮 ${name} · ${em}`);
        });
      }
      if (!hit && guesses.length) {
        try {
          const res = await proxyFinder(
            "guess-verify-batch",
            { domain, people: [{ name, title: row.title || "" }], knownEmails: [] },
            90_000
          );
          const people = [{ name, title: String(row.title || ""), email: "", phone: "", emailStatus: "" }];
          const siteRows: Person[] = [];
          applyGuessVerify(res, people, siteRows);
          hit = people[0]?.email || "";
        } catch {
          /* keep empty */
        }
      }
      donePerson.add(personKey);
      if (hit && !seenValid.has(hit.toLowerCase())) {
        seenValid.add(hit.toLowerCase());
        const v = { ...row, email: hit, email_status: "valid" };
        verified.push(v);
        progress.verifiedRows = verified;
        await saveProgress(db, jobId, progress, { csv: buildCsv(verified, input.fields) });
        await note(db, jobId, "done", `有效邮箱 ${name} · ${hit}`);
      } else {
        verified.push({
          ...row,
          email: isRealEmail(existing) ? existing : "",
          email_status: hit ? "valid" : "no_email"
        });
      }
    }
    }

    progress.stage = "ingest";
    progress.verifiedRows = verified;
    const finalRows = dropRepeatedStockPeople(progress.verifyEmail ? (verified.length ? verified : work) : work);
    const batchRows = finalRows
      .filter((r) => batchHosts.has(rowHost(r)))
      .map((r): CsvRow => ({ ...r, domain: rowHost(r) }));
    // 搜过但无有效结果的公司：补一条公司信息占位行，"有什么显示什么"，同时保证入库 CRM
    {
      const haveHost = new Set(batchRows.map((r) => rowHost(r)));
      for (const c of picked) {
        const h = String(c.domain || "")
          .replace(/^www\./i, "")
          .toLowerCase();
        if (h && !haveHost.has(h)) {
          batchRows.push(companyPlaceholderRow(c));
          haveHost.add(h);
        }
      }
    }
    const csv = buildCsv(finalRows, input.fields);
    let crmN = 0;
    let warehouseN = 0;
    if (progress.syncCrm) {
      try {
        const sync = await ingestSearchRowsToCrm(db, tenantId, batchRows, input.industry);
        crmN = sync.crm;
        warehouseN = sync.warehouse;
      } catch (e) {
        console.warn("[lead-search-task] crm ingest", e);
      }
    }
    // deepCounts 已在调研循环里逐家递增（支持断点续跑），这里不再批量加
    progress.resultRows = [...progress.resultRows.filter((r) => !batchHosts.has(rowHost(r))), ...batchRows];
    progress.lastBatch = picked.map((c) => c.domain);
    {
      const rs = summarizeRows(batchRows);
      progress.roundStats = [
        ...(progress.roundStats || []),
        {
          at: new Date().toISOString(),
          stage: "research" as const,
          companies: picked.length,
          contacts: rs.contacts,
          emails: rs.emails,
          validEmails: rs.validEmails,
          domains: picked.map((c) => c.domain)
        }
      ];
    }
    const single = input.mode === "single";
    if (!single) {
      await note(db, jobId, "running", "正在按目标客群给企业分 A / B / C / D 类…");
      const gradeList: GradeInput[] = picked.map((co) => {
        const host = co.domain.replace(/^www\./i, "").toLowerCase();
        const rows = batchRows.filter((r) => r.domain === host);
        return {
          domain: co.domain,
          name: co.name,
          intro: progress.profiles[co.domain]?.intro || "",
          mainBusiness: co.mainBusiness,
          country: co.country,
          people: rows.filter((r) => String(r.contact || "").trim()).length,
          validEmails: rows.filter((r) => String(r.email_status || "").toLowerCase() === "valid").length,
          publicEmails: rows.filter((r) => !String(r.contact || "").trim() && isRealEmail(String(r.email || ""))).length
        };
      });
      try {
        let profileText = "";
        try {
          const prof = await getLeadSearchProfile(db, tenantId);
          if (prof) {
            profileText = [
              prof.companyIntro.trim() && `企业介绍：${prof.companyIntro.trim()}`,
              prof.businessDesc.trim() && `业务介绍：${prof.businessDesc.trim()}`,
              prof.customerProfile.trim() && `目标客群画像：${prof.customerProfile.trim()}`
            ]
              .filter(Boolean)
              .join("\n");
          }
        } catch {
          /* 画像读不到就按原逻辑分级 */
        }
        const grades = await gradeCompanies(
          settings,
          {
            industry: input.industry,
            keywords: input.keywords,
            relatedKeywords: input.relatedKeywords || [],
            geo: [input.city, input.province, input.countryNameEn].filter(Boolean).join(" / "),
            titles: input.titles,
            ...(profileText ? { profileText } : {})
          },
          gradeList
        );
        Object.assign(progress.grades, grades);
      } catch (e) {
        console.warn("[lead-search-task] grade", e);
      }
    }
    progress.queuedDomains = [];
    progress.companyIndex = 0;
    const left = progress.companies.filter((c) => !progress.deepCounts[c.domain]).length;
    progress.stage = single ? "done" : "awaiting_pick";
    await saveProgress(db, jobId, progress, {
      status: single ? "done" : "awaiting_pick",
      processed: picked.length,
      quota: picked.length,
      csv
    });
    const validN = batchRows.filter((r) => String(r.email_status || "").toLowerCase() === "valid").length;
    const crmText = progress.syncCrm ? `CRM ${crmN} · 总库 ${warehouseN} 家` : "未同步 CRM";
    await note(
      db,
      jobId,
      single ? "done" : "awaiting_pick",
      single
        ? `单企业精搜完成 · 联系人 ${batchRows.filter((r) => String(r.contact || "").trim()).length} 个 · 有效邮箱 ${validN} 条 · ${crmText}`
        : `深度搜索完成 · ${picked.length} 家 · 有效邮箱 ${validN} 条 · ${crmText} · 尚未深挖 ${left} 家`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(`UPDATE lead_search_jobs SET status='failed', error_message=? WHERE id=?`, [msg, jobId]);
    await note(db, jobId, "error", msg);
  } finally {
    runningJobs.delete(jobId);
  }
}

export async function startLeadSearchTask(db: Pool, env: Env, tenantId: number, input: SearchTaskInput): Promise<number> {
  await ensureLeadSearchTaskSchema(db);
  const discoverInput = { ...input, limit: DISCOVER_CAP };
  const [ret] = await db.query<ResultSetHeader>(
    `INSERT INTO lead_search_jobs (tenant_id, status, quota, input_json, progress_json, heartbeat_at) VALUES (?, 'queued', ?, ?, ?, NOW())`,
    [tenantId, DISCOVER_CAP, JSON.stringify(discoverInput), JSON.stringify(emptyProgress())]
  );
  const jobId = Number(ret.insertId);
  const ai = await loadAutoSettings(db, tenantId, env).catch(() => undefined);
  void runDiscoverOnly(db, jobId, discoverInput, ai, { tenantId }).catch((e) => console.warn("[lead-search-task]", e));
  return jobId;
}

export async function continueLeadSearchTask(
  db: Pool,
  env: Env,
  tenantId: number,
  jobId: number,
  pickLimit: number,
  opts?: { pickAll?: boolean; onlyUndug?: boolean; domains?: string[]; verifyEmail?: boolean; syncCrm?: boolean }
): Promise<{ ok: boolean; message: string }> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, progress_json FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) return { ok: false, message: "任务不存在" };
  const progress = parseProgress(job.progress_json);
  if (!progress.companies.length) return { ok: false, message: "还没有公司名单，请先等网页搜索结束" };
  const st = String(job.status);
  if (st === "running") return { ok: false, message: "正在深挖，请等本批结束" };
  // 停止后旧循环可能还在收尾当前企业：此时直接开新一轮会与旧循环打架，
  // 明确提示用户稍等，而不是悄悄把"已停止"又变回运行中
  if (runningJobs.has(jobId)) {
    return { ok: false, message: "上一轮搜索还在收尾当前企业，请稍等几秒再点继续" };
  }
  const onlyUndug = opts?.onlyUndug !== false;
  const pickAll = Boolean(opts?.pickAll);
  const cap = Math.min(400, Math.max(1, Math.floor(pickLimit || 10)));
  const wanted = new Set((opts?.domains || []).map((d) => String(d || "").trim().toLowerCase()).filter(Boolean));
  let batch = wanted.size
    ? progress.companies.filter((c) => wanted.has(c.domain.toLowerCase()))
    : selectDeepBatch(progress.companies, progress.deepCounts, cap, pickAll, onlyUndug);
  if (!batch.length) {
    return {
      ok: false,
      message: wanted.size ? "勾选的企业不在名单里，请刷新后重新勾选" : onlyUndug ? "未深挖的企业已经没有了，可取消「只挖未深挖」再挖，或重新找公司" : "名单是空的"
    };
  }
  // 断点续跑：从 stopped 状态继续时，只跑还没做完的企业，已完成的跳过、不重搜
  const isResume = st === "stopped" && (progress.stage === "research" || progress.stage === "verify");
  if (isResume) {
    batch = batch.filter((c) => !progress.deepCounts[c.domain]);
    if (!batch.length && progress.stage !== "verify") {
      return { ok: true, message: "本批企业已全部深搜完成，无需继续" };
    }
  }
  const batchSet = new Set(batch.map((c) => c.domain.toLowerCase()));
  progress.researchRows = progress.researchRows.filter(
    (r) => !batchSet.has(String(r.domain || hostFromSite(String(r.website || ""), String(r.company || ""))).toLowerCase())
  );
  progress.onlyUndug = onlyUndug;
  progress.pickLimit = pickAll || wanted.size ? batch.length : cap;
  // 只有还有企业要调研才替换 queuedDomains 并回到 research 阶段；
  // research 已做完、只剩验邮时保持原 queuedDomains 与 verify 阶段，直接把验邮跑完
  if (batch.length) {
    progress.queuedDomains = batch.map((c) => c.domain);
    progress.stage = "research";
  }
  progress.companyIndex = 0;
  if (typeof opts?.verifyEmail === "boolean") progress.verifyEmail = opts.verifyEmail;
  if (typeof opts?.syncCrm === "boolean") progress.syncCrm = opts.syncCrm;
  await saveProgress(db, jobId, progress, { status: "running", quota: batch.length, processed: 0 });
  void runResearchThenVerify(db, env, jobId, tenantId).catch((e) => console.warn("[lead-search-task]", e));
  return { ok: true, message: batch.length ? `继续深度搜索 ${batch.length} 家（已完成的自动跳过）` : "继续完成剩余验邮" };
}

export type ContinueDiscoverResult = {
  ok: boolean;
  message: string;
  added: number;
  total: number;
  target: number;
  exhausted: boolean;
};

/**
 * 继续发现补足：目标 N 家但只找到 M 家时，接着搜更多不重复的企业追加进来，
 * 已有的不动，直到凑满目标或无更多结果。要求 job 不在运行中。
 */
export async function continueDiscoverTask(
  db: Pool,
  env: Env,
  tenantId: number,
  jobId: number
): Promise<ContinueDiscoverResult> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, progress_json, input_json FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  const job = rows[0];
  const fail = (message: string, target = 50): ContinueDiscoverResult => ({
    ok: false,
    message,
    added: 0,
    total: 0,
    target,
    exhausted: true
  });
  if (!job) return fail("任务不存在");
  const st = String(job.status);
  // 防御：内存运行标记与数据库状态脱节（历史残留）时，以数据库为准，清掉残留标记，避免"任务正在运行中"永久卡死
  if (runningJobs.has(Number(job.id)) && st !== "running" && st !== "queued") {
    runningJobs.delete(Number(job.id));
  }
  if (st === "running" || st === "queued" || runningJobs.has(Number(job.id))) {
    return { ...fail("任务正在运行中，请稍候"), exhausted: false };
  }
  const progress = parseProgress(job.progress_json);
  const input = safeParseInput(job.input_json);
  if (!input) return fail("任务参数损坏，无法继续搜索");
  const target = clampTargetCount(input.targetCount);
  const total0 = progress.companies.length;
  if (total0 >= target) {
    return { ok: true, message: `已达到目标 ${target} 家，无需继续搜索`, added: 0, total: total0, target, exhausted: true };
  }
  const ai = await loadAutoSettings(db, tenantId, env).catch(() => undefined);
  const out = await runDiscoverOnly(db, Number(job.id), input, ai, {
    excludeDomains: progress.companies.map((c) => c.domain),
    baseProgress: progress,
    tenantId
  });
  return {
    ok: true,
    message: out.added > 0
      ? `继续搜索完成，新增 ${out.added} 家，累计 ${out.total} / ${target} 家`
      : "没有搜到更多不重复的企业",
    added: out.added,
    total: out.total,
    target,
    exhausted: out.exhausted
  };
}

/**
 * 断点续跑：仅当任务卡住（running/queued 但心跳超过 5 分钟）或失败时可调用。
 * research/verify/ingest 阶段不重置 companyIndex/processed/queuedDomains，从断点继续；
 * discover 阶段按追加模式重跑（已有公司保留）。
 */
export async function resumeLeadSearchTask(
  db: Pool,
  env: Env,
  tenantId: number,
  jobId: number,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; message: string }> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, heartbeat_at, progress_json, input_json FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) return { ok: false, message: "任务不存在" };
  const id = Number(job.id);
  if (runningJobs.has(id)) return { ok: false, message: "任务正在运行中，请稍候" };
  const status = String(job.status);
  const hb = job.heartbeat_at ? new Date(String(job.heartbeat_at)).getTime() : 0;
  const hbOk = Number.isFinite(hb) && hb > 0;
  const stuck = (status === "running" || status === "queued") && hbOk && Date.now() - hb > STUCK_MS;
  // force=true 仅用于后端启动时的自动恢复：全新进程 runningJobs 为空，
  // 此时任何 status=running/queued 的任务都不可能真的在跑，跳过 5 分钟心跳门槛直接恢复。
  if (!opts?.force && !stuck && status !== "failed") {
    return {
      ok: false,
      message: status === "running" || status === "queued" ? "任务心跳正常，无需恢复" : `当前状态（${status}）无需恢复`
    };
  }
  const progress = parseProgress(job.progress_json);
  const input = safeParseInput(job.input_json);
  if (!input) return { ok: false, message: "任务参数损坏，无法恢复" };
  await note(db, id, "running", "从断点恢复任务…");
  if (progress.stage === "discover" || status === "queued") {
    const ai = await loadAutoSettings(db, tenantId, env).catch(() => undefined);
    void runDiscoverOnly(db, id, input, ai, {
      excludeDomains: progress.companies.map((c) => c.domain),
      baseProgress: progress,
      tenantId
    }).catch((e) => console.warn("[lead-search-task] resume-discover", e));
    return { ok: true, message: "已从断点恢复企业发现，找到的企业会继续追加" };
  }
  // research/verify/ingest：runResearchThenVerify 本身从 progress.companyIndex / verifiedRows 断点继续，不重置
  void runResearchThenVerify(db, env, id, tenantId).catch((e) => console.warn("[lead-search-task] resume-research", e));
  return { ok: true, message: "已从断点恢复深度搜索，未完成的企业会继续" };
}

/**
 * 后端启动后自动恢复被中断的任务（部署重启/崩溃）。
 * 只恢复 status=running/queued 且心跳超过 60 秒未更新的任务；
 * 用户手动停止的（stopped）永远不会被自动恢复；failed 的留给手动恢复。
 */
export async function recoverInterruptedJobs(
  db: Pool,
  env: Env
): Promise<{ recovered: number; jobIds: number[] }> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id FROM lead_search_jobs
     WHERE status IN ('running','queued')
       AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL 60 SECOND)
     ORDER BY id ASC LIMIT 20`
  );
  const recovered: number[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    if (runningJobs.has(id)) continue;
    try {
      const ret = await resumeLeadSearchTask(db, env, Number(r.tenant_id), id, { force: true });
      if (ret.ok) {
        recovered.push(id);
        console.log(`[lead-search-task] auto-recovered interrupted job ${id}: ${ret.message}`);
      } else {
        console.warn(`[lead-search-task] auto-recover job ${id} skipped: ${ret.message}`);
      }
    } catch (e) {
      console.warn(`[lead-search-task] auto-recover job ${id} failed:`, (e as Error)?.message || e);
    }
  }
  return { recovered: recovered.length, jobIds: recovered };
}

export async function startSingleCompanyTask(
  db: Pool,
  env: Env,
  tenantId: number,
  opts: { domain: string; titles: string; roleTiers?: string[]; fields: SearchFields; verifyEmail: boolean; syncCrm: boolean }
): Promise<{ ok: boolean; jobId?: number; message: string }> {
  await ensureLeadSearchTaskSchema(db);
  const host = hostFromSite(opts.domain, "");
  if (!host || host.endsWith(".invalid") || !host.includes(".")) return { ok: false, message: "请输入正确的官网或域名" };
  const co: WebFoundCompany = {
    name: brandFromHost(host),
    domain: host,
    website: `https://${host}`,
    country: "",
    city: "",
    mainBusiness: ""
  };
  const input: SearchTaskInput = {
    mode: "single",
    keywords: host,
    limit: 1,
    countryNameEn: "",
    city: "",
    industry: "",
    titles: opts.titles,
    roleTiers: opts.roleTiers,
    fields: opts.fields,
    syncCrm: opts.syncCrm
  };
  const progress: JobProgress = {
    ...emptyProgress(),
    stage: "research",
    companies: [co],
    pickLimit: 1,
    queuedDomains: [host],
    verifyEmail: opts.verifyEmail,
    syncCrm: opts.syncCrm
  };
  const [ret] = await db.query<ResultSetHeader>(
    `INSERT INTO lead_search_jobs (tenant_id, status, quota, input_json, progress_json, heartbeat_at) VALUES (?, 'running', 1, ?, ?, NOW())`,
    [tenantId, JSON.stringify(input), JSON.stringify(progress)]
  );
  const jobId = Number(ret.insertId);
  await note(db, jobId, "running", `开始单企业精搜 · ${host}`);
  void runResearchThenVerify(db, env, jobId, tenantId).catch((e) => console.warn("[lead-search-task] single", e));
  return { ok: true, jobId, message: `开始精搜 ${host}` };
}

export async function resumeLeadSearchJobs(db: Pool, env: Env): Promise<void> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, status, input_json, progress_json FROM lead_search_jobs
      WHERE status IN ('queued','running') ORDER BY id DESC LIMIT 20`
  );
  for (const row of rows) {
    const id = Number(row.id);
    const tenantId = Number(row.tenant_id);
    if (runningJobs.has(id)) continue;
    const progress = parseProgress(row.progress_json);
    const input = (() => {
      try {
        return JSON.parse(String(row.input_json || "{}")) as SearchTaskInput;
      } catch {
        return null;
      }
    })();
    if (!input) continue;
    if (progress.stage === "discover" || String(row.status) === "queued") {
      const ai = await loadAutoSettings(db, tenantId, env).catch(() => undefined);
      void runDiscoverOnly(db, id, input, ai, { tenantId }).catch((e) => console.warn("[lead-search-task] resume", e));
    } else if (progress.stage === "research" || progress.stage === "verify" || progress.stage === "ingest") {
      void runResearchThenVerify(db, env, id, tenantId).catch((e) => console.warn("[lead-search-task] resume", e));
    }
  }
}

export async function getLeadSearchTask(db: Pool, tenantId: number, jobId?: number, mode?: "industry" | "single") {
  await ensureLeadSearchTaskSchema(db);
  let job: RowDataPacket | undefined;
  const cols = `id, status, quota, processed, current_note, error_message, progress_json, input_json, heartbeat_at,
              (CHAR_LENGTH(IFNULL(csv_text,'')) > 0) AS has_csv`;
  if (jobId) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ${cols} FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
      [jobId, tenantId]
    );
    job = rows[0];
  } else {
    const modeSql =
      mode === "single"
        ? `AND input_json LIKE '%"mode":"single"%'`
        : mode === "industry"
          ? `AND (input_json IS NULL OR input_json NOT LIKE '%"mode":"single"%')`
          : "";
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ${cols} FROM lead_search_jobs
        WHERE tenant_id=? AND status IN ('queued','running','awaiting_pick','done','failed','stopped') ${modeSql}
        ORDER BY id DESC LIMIT 1`,
      [tenantId]
    );
    job = rows[0];
  }
  const progress = parseProgress(job?.progress_json);
  if (job) {
    const input = (() => {
      try {
        return JSON.parse(String(job.input_json || "{}")) as SearchTaskInput;
      } catch {
        return {} as SearchTaskInput;
      }
    })();
    delete job.input_json;
    job.mode = input.mode === "single" ? "single" : "industry";
    job.relatedKeywords = input.relatedKeywords || [];
    job.discoverFound = progress.discoverFound;
    job.discoverChecked = progress.discoverChecked;
    job.profiles = progress.profiles;
    job.grades = progress.grades;
    job.resultRows = progress.resultRows;
    job.lastBatch = progress.lastBatch;
    job.verifyEmail = progress.verifyEmail;
    job.syncCrm = progress.syncCrm;
    job.has_csv = Number(job.has_csv) > 0 ? 1 : 0;
    delete job.progress_json;
    job.stage = progress.stage;
    job.companies = progress.companies.map((c) => ({
      name: c.name,
      website: c.website,
      domain: c.domain,
      deepCount: Number(progress.deepCounts[c.domain] || 0)
    }));
    job.companyCount = progress.companies.length;
    job.researchRows = progress.researchRows;
    job.verifiedRows = progress.verifiedRows.filter((r) => String(r.email_status || "").toLowerCase() === "valid");
    job.pickLimit = progress.pickLimit;
    job.onlyUndug = progress.onlyUndug;
    job.queuedDomains = progress.queuedDomains;
    job.undugCount = progress.companies.filter((c) => !progress.deepCounts[c.domain]).length;
    job.targetCount = clampTargetCount(input.targetCount);
    job.foundCount = progress.companies.length;
    job.stats = buildTaskStats(progress);
    {
      const hbRaw = job.heartbeat_at ? new Date(String(job.heartbeat_at)) : null;
      const hbMs = hbRaw && !Number.isNaN(hbRaw.getTime()) ? hbRaw.getTime() : 0;
      job.heartbeatAt = hbMs ? new Date(hbMs).toISOString() : null;
      const st = String(job.status);
      job.stuck = (st === "running" || st === "queued") && hbMs > 0 && Date.now() - hbMs > STUCK_MS;
      delete job.heartbeat_at;
    }
  }
  let events: RowDataPacket[] = [];
  if (job?.id) {
    const [ev] = await db.query<RowDataPacket[]>(
      `SELECT status, note, created_at FROM lead_search_events WHERE job_id=? ORDER BY id DESC LIMIT 80`,
      [job.id]
    );
    events = ev.filter(
      (row) =>
        !/403|unsupported_country|request_forbidden|Kimi 调研失败|正在用 Kimi 查找/i.test(String(row.note || ""))
    );
  }
  return { job: job || null, events, progress: job ? undefined : null };
}

export async function getLeadSearchCsv(db: Pool, tenantId: number, jobId: number): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT csv_text FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  return rows[0]?.csv_text ? String(rows[0].csv_text) : null;
}

export async function stopLeadSearchTask(db: Pool, tenantId: number, jobId?: number): Promise<void> {
  if (jobId) {
    await db.query(
      `UPDATE lead_search_jobs SET status='stopped' WHERE id=? AND tenant_id=? AND status IN ('queued','running')`,
      [jobId, tenantId]
    );
    return;
  }
  await db.query(
    `UPDATE lead_search_jobs SET status='stopped' WHERE tenant_id=? AND status IN ('queued','running','awaiting_pick')`,
    [tenantId]
  );
}

/** 从任务中删除企业（含分级、画像、深搜计数、结果行、轮次统计），统计数字随之变化 */
/**
 * 删除指定企业域名在 CRM 里的联系人（增量入库的逆操作）。
 * 按 email 域名（%@域名 精确后缀）+ website（https?://[www.]域名 精确匹配）定位，
 * tenant 隔离；只删本机 email_contacts，不碰总库。
 */
async function deleteCrmContactsForDomains(
  db: Pool,
  tenantId: number,
  domains: string[]
): Promise<number> {
  let total = 0;
  for (const raw of domains) {
    const d = normHost(raw);
    if (!d) continue;
    const sites = [`https://${d}`, `http://${d}`, `https://www.${d}`, `http://www.${d}`];
    try {
      const [r] = await db.query(
        `DELETE FROM email_contacts
         WHERE tenant_id = ?
           AND (email LIKE CONCAT('%@', ?)
             OR website IN (?,?,?,?)
             OR website LIKE CONCAT(?, '/%')
             OR website LIKE CONCAT(?, '/%')
             OR website LIKE CONCAT(?, '/%')
             OR website LIKE CONCAT(?, '/%'))`,
        [tenantId, d, ...sites, ...sites]
      );
      total += Number((r as { affectedRows?: number }).affectedRows || 0);
    } catch (e) {
      console.warn("[lead-search-task] crm delete sync", d, (e as Error)?.message || e);
    }
  }
  return total;
}

export async function removeCompaniesFromTask(
  db: Pool,
  tenantId: number,
  jobId: number,
  domains: string[]
): Promise<{ ok: boolean; removed: number; crmDeleted: number; message?: string }> {
  await ensureLeadSearchTaskSchema(db);
  const want = new Set(
    (Array.isArray(domains) ? domains : []).map((d) => normHost(d)).filter(Boolean)
  );
  if (!want.size) return { ok: false, removed: 0, message: "没有要删除的企业" };
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, processed, progress_json FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) return { ok: false, removed: 0, message: "任务不存在" };
  const progress = parseProgress(job.progress_json);
  const before = progress.companies.length;
  const removedDomains = new Set<string>();
  progress.companies = progress.companies.filter((c) => {
    const hit = want.has(normHost(c.domain));
    if (hit) removedDomains.add(normHost(c.domain));
    return !hit;
  });
  const removed = before - progress.companies.length;
  if (!removed) return { ok: true, removed: 0, crmDeleted: 0 };
  // 已深搜的企业：processed 计数扣减
  let deepRemoved = 0;
  for (const d of removedDomains) {
    if (Number(progress.deepCounts[d] || 0) > 0) deepRemoved++;
  }
  for (const key of Object.keys(progress.grades || {})) {
    if (want.has(normHost(key))) delete progress.grades[key];
  }
  for (const key of Object.keys(progress.profiles || {})) {
    if (want.has(normHost(key))) delete progress.profiles[key];
  }
  for (const key of Object.keys(progress.deepCounts || {})) {
    if (want.has(normHost(key))) delete progress.deepCounts[key];
  }
  progress.queuedDomains = (progress.queuedDomains || []).filter((d) => !want.has(normHost(d)));
  progress.lastBatch = (progress.lastBatch || []).filter((d) => !want.has(normHost(d)));
  const rowDomain = (r: CsvRow): string => {
    const d = String(r.domain || "").trim();
    if (d) return normHost(d);
    return normHost(hostFromSite(String(r.website || ""), String(r.company || "")));
  };
  progress.researchRows = (progress.researchRows || []).filter((r) => !want.has(rowDomain(r)));
  progress.verifiedRows = (progress.verifiedRows || []).filter((r) => !want.has(rowDomain(r)));
  progress.resultRows = (progress.resultRows || []).filter((r) => !want.has(rowDomain(r)));
  progress.roundStats = (progress.roundStats || []).map((rs) => ({
    ...rs,
    domains: (rs.domains || []).filter((d) => !want.has(normHost(d)))
  }));
  const processed = Math.max(0, Number(job.processed || 0) - deepRemoved);
  await db.query(`UPDATE lead_search_jobs SET progress_json=?, processed=? WHERE id=?`, [
    JSON.stringify(progress),
    processed,
    jobId
  ]);
  // 同步删除 CRM：这些企业已入库的联系人按域名一并删除（tenant 隔离）
  let crmDeleted = 0;
  try {
    crmDeleted = await deleteCrmContactsForDomains(db, tenantId, [...removedDomains]);
  } catch (e) {
    console.warn("[lead-search-task] crm delete sync", (e as Error)?.message || e);
  }
  return { ok: true, removed, crmDeleted };
}

/**
 * 给任务里尚未分级的企业补分级（存量任务用）。
 * 按画像调 gradeCompanies（Kimi），无 AI key 时本地规则兜底。
 */
export async function gradeMissingGrades(
  db: Pool,
  env: Env,
  tenantId: number,
  jobId: number
): Promise<{ ok: boolean; graded: number; message?: string }> {
  await ensureLeadSearchTaskSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, progress_json, input_json FROM lead_search_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) return { ok: false, graded: 0, message: "任务不存在" };
  const st = String(job.status);
  // 防御：内存运行标记与数据库状态脱节（历史残留）时，以数据库为准，清掉残留标记
  if (runningJobs.has(Number(job.id)) && st !== "running" && st !== "queued") {
    runningJobs.delete(Number(job.id));
  }
  if (st === "running" || st === "queued" || runningJobs.has(Number(job.id))) {
    return { ok: false, graded: 0, message: "任务正在运行中，请稍候" };
  }
  const progress = parseProgress(job.progress_json);
  const input = safeParseInput(job.input_json);
  if (!input) return { ok: false, graded: 0, message: "任务参数损坏" };
  const gradedHosts = new Set(Object.keys(progress.grades || {}).map(normHost));
  const todo = (progress.companies || []).filter((c) => {
    const h = normHost(c.domain);
    return h && !gradedHosts.has(h);
  });
  if (!todo.length) return { ok: true, graded: 0 };
  const ai = await loadAutoSettings(db, tenantId, env).catch(() => undefined);
  // 按域名汇总已有联系人/邮箱（深搜过的企业分级更准）
  const rowHost = (r: CsvRow): string => normHost(String(r.domain || ""));
  const peopleByHost = new Map<string, number>();
  const validByHost = new Map<string, number>();
  const publicByHost = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of [...(progress.resultRows || []), ...(progress.verifiedRows || []), ...(progress.researchRows || [])]) {
    const d = rowHost(r);
    if (!d) continue;
    const k = `${d}|${String(r.contact || "").toLowerCase()}|${String(r.email || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (String(r.contact || "").trim()) peopleByHost.set(d, (peopleByHost.get(d) || 0) + 1);
    if (String(r.email_status || "").toLowerCase() === "valid") validByHost.set(d, (validByHost.get(d) || 0) + 1);
    if (!String(r.contact || "").trim() && isRealEmail(String(r.email || "")))
      publicByHost.set(d, (publicByHost.get(d) || 0) + 1);
  }
  let profileText = "";
  try {
    const prof = await getLeadSearchProfile(db, tenantId);
    if (prof) {
      profileText = [
        prof.companyIntro.trim() && `企业介绍：${prof.companyIntro.trim()}`,
        prof.businessDesc.trim() && `业务介绍：${prof.businessDesc.trim()}`,
        prof.customerProfile.trim() && `目标客群画像：${prof.customerProfile.trim()}`
      ]
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    /* 画像读不到就按原逻辑分级 */
  }
  const geo = [input.city, input.province, input.countryNameEn].filter(Boolean).join(" / ");
  const gradeTarget: GradeTarget = {
    industry: input.industry,
    keywords: input.keywords,
    relatedKeywords: input.relatedKeywords || [],
    geo,
    titles: input.titles,
    ...(profileText ? { profileText } : {})
  };
  const gradeList: GradeInput[] = todo.map((co) => {
    const h = normHost(co.domain);
    return {
      domain: co.domain,
      name: co.name,
      intro: progress.profiles[co.domain]?.intro || "",
      mainBusiness: co.mainBusiness,
      country: co.country,
      people: peopleByHost.get(h) || 0,
      validEmails: validByHost.get(h) || 0,
      publicEmails: publicByHost.get(h) || 0
    };
  });
  try {
    const grades = ai
      ? await gradeCompanies(ai, gradeTarget, gradeList)
      : Object.fromEntries(gradeList.map((c) => [c.domain, localGrade(gradeTarget, c)]));
    progress.grades = { ...(progress.grades || {}), ...grades };
    await saveProgress(db, jobId, progress);
    return { ok: true, graded: gradeList.length };
  } catch (e) {
    console.warn("[lead-search-task] grade-missing", e);
    return { ok: false, graded: 0, message: "分级失败，请稍后重试" };
  }
}
