import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Env } from "../env.js";
import { discoverEmailMarketingCompanies, type DiscoveredCompany } from "./leadFinderAutoDiscover.js";
import { ensureLeadFinderAutoSchema } from "./leadFinderAutoSchema.js";
import { guessEmailsFromName } from "./leadFinderEmailGuessLocal.js";
import { verifyPersonCombosOneByOne, smtpProbeHealth } from "./leadFinderSmtpProbe.js";

const INSTALL_RE = /^LFI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const TICK_MS = 30_000;
const VERIFY_PEOPLE_CAP = 24;

let tickHandle: ReturnType<typeof setInterval> | null = null;
let runnerBusy = false;

type AutoSettings = {
  tenantId: number;
  enabled: boolean;
  countries: string[];
  dailyQuota: number;
  runHour: number;
  timezone: string;
  apiBaseUrl: string;
  apiModel: string;
  apiKey: string;
};

type JobRow = {
  id: number;
  tenant_id: number;
  run_date: string;
  status: string;
  quota: number;
  processed: number;
  imported: number;
  skipped: number;
  crm_tag: string;
  csv_text: string | null;
};

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function todayInTz(tz: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

function resolveInstallId(): string {
  const fromEnv = String(process.env.LEAD_FINDER_INSTALL_ID || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return INSTALL_RE.test(fromEnv) ? fromEnv : "";
}

function upstreamBase(env: Env): string {
  return String(process.env.LEAD_FINDER_UPSTREAM_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const bits = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!bits.length) return { firstName: null, lastName: null };
  if (bits.length === 1) return { firstName: bits[0] || null, lastName: null };
  return { firstName: bits[0] || null, lastName: bits.slice(1).join(" ") };
}

function maskKey(key: string): string | null {
  const t = key.trim();
  if (!t) return null;
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}${"•".repeat(8)}${t.slice(-4)}`;
}

export async function loadAutoSettings(db: Pool, tenantId: number, env: Env): Promise<AutoSettings> {
  await ensureLeadFinderAutoSchema(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM lead_finder_auto_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  const row = rows[0];
  const envKey = String(process.env.LEAD_FINDER_AUTO_API_KEY || env.OPENAI_API_KEY || "").trim();
  const envBase = String(process.env.LEAD_FINDER_AUTO_BASE_URL || "https://api.moonshot.cn/v1");
  const envModel = String(process.env.LEAD_FINDER_AUTO_MODEL || "moonshot-v1-128k");
  const countries = String(row?.countries || "US,SG")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s === "US" || s === "SG");
  return {
    tenantId,
    enabled: Number(row?.enabled ?? 0) === 1,
    countries: countries.length ? countries : ["US", "SG"],
    dailyQuota: Math.max(1, Math.min(500, Number(row?.daily_quota ?? 30) || 30)),
    runHour: Math.max(0, Math.min(23, Number(row?.run_hour ?? 5) || 5)),
    timezone: String(row?.timezone || "Asia/Shanghai"),
    apiBaseUrl: envBase,
    apiModel: envModel,
    apiKey: envKey || String(row?.api_key_enc || "").trim()
  };
}

export async function saveAutoSettings(
  db: Pool,
  tenantId: number,
  input: {
    enabled?: boolean;
    countries?: string[];
    dailyQuota?: number;
    runHour?: number;
    apiBaseUrl?: string;
    apiModel?: string;
    apiKey?: string;
  }
): Promise<void> {
  await ensureLeadFinderAutoSchema(db);
  const cur = await loadAutoSettings(db, tenantId, {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL
  } as Env);
  const key =
    input.apiKey && !input.apiKey.includes("•") ? input.apiKey.trim() : cur.apiKey;
  const countries = (input.countries || cur.countries).filter((s) => s === "US" || s === "SG");
  await db.query(
    `INSERT INTO lead_finder_auto_settings
      (tenant_id, enabled, countries, daily_quota, run_hour, timezone, api_base_url, api_model, api_key_enc)
     VALUES (?, ?, ?, ?, ?, 'Asia/Shanghai', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       countries = VALUES(countries),
       daily_quota = VALUES(daily_quota),
       run_hour = VALUES(run_hour),
       api_base_url = VALUES(api_base_url),
       api_model = VALUES(api_model),
       api_key_enc = VALUES(api_key_enc)`,
    [
      tenantId,
      input.enabled === false ? 0 : input.enabled === true || cur.enabled ? 1 : 0,
      (countries.length ? countries : ["US", "SG"]).join(","),
      input.dailyQuota ?? cur.dailyQuota,
      input.runHour ?? cur.runHour,
      (input.apiBaseUrl || cur.apiBaseUrl).trim(),
      (input.apiModel || cur.apiModel).trim(),
      key
    ]
  );
}

export function publicSettings(s: AutoSettings) {
  return {
    enabled: s.enabled,
    countries: s.countries,
    dailyQuota: s.dailyQuota,
    runHour: s.runHour,
    timezone: s.timezone,
    apiBaseUrl: s.apiBaseUrl,
    apiModel: s.apiModel,
    hasApiKey: Boolean(s.apiKey),
    apiKeyMasked: maskKey(s.apiKey)
  };
}

async function appendEvent(
  db: Pool,
  jobId: number,
  tenantId: number,
  domain: string | null,
  status: string,
  note: string
) {
  await db.query(
    `INSERT INTO lead_finder_auto_events (job_id, tenant_id, domain, status, note) VALUES (?, ?, ?, ?, ?)`,
    [jobId, tenantId, domain, status, note.slice(0, 1000)]
  );
  await db.query(
    `UPDATE lead_finder_auto_jobs SET current_domain = ?, current_note = ? WHERE id = ?`,
    [domain, note.slice(0, 500), jobId]
  );
}

async function seenRecently(db: Pool, tenantId: number, domain: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT last_seen_date FROM lead_finder_auto_seen
      WHERE tenant_id = ? AND domain = ? AND last_seen_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      LIMIT 1`,
    [tenantId, domain]
  );
  return rows.length > 0;
}

async function markSeen(db: Pool, tenantId: number, domain: string) {
  await db.query(
    `INSERT INTO lead_finder_auto_seen (tenant_id, domain, last_seen_date)
     VALUES (?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE last_seen_date = CURDATE()`,
    [tenantId, domain]
  );
}

async function loadExcludeDomains(db: Pool, tenantId: number): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT domain FROM lead_finder_auto_seen
      WHERE tenant_id = ? AND last_seen_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      ORDER BY last_seen_date DESC LIMIT 400`,
    [tenantId]
  );
  return rows.map((r) => String(r.domain));
}

async function proxyFinder(env: Env, path: string, body: Record<string, unknown>, timeoutMs: number) {
  const installId = resolveInstallId();
  if (!installId) throw new Error("未配置 LEAD_FINDER_INSTALL_ID");
  const url = `${upstreamBase(env)}/api/public/domain-finder/${path}`;
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
    if (!res.ok || data.ok === false) {
      throw new Error(String(data.message || `Lead Finder HTTP ${res.status}`));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

type Person = { name: string; title: string | null; email: string; status: string; kind: string };

function collectPeople(packs: Array<Record<string, unknown> | null>): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  for (const pack of packs) {
    if (!pack) continue;
    const hints = Array.isArray(pack.peopleHints) ? pack.peopleHints : [];
    for (const h of hints) {
      const rec = h as Record<string, unknown>;
      const name = String(rec.name || "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({
        name,
        title: rec.title ? String(rec.title) : null,
        email: "",
        status: "unverified",
        kind: "decision_makers"
      });
    }
    const items = Array.isArray(pack.items) ? pack.items : [];
    for (const it of items) {
      const rec = it as Record<string, unknown>;
      const name = String(rec.contact_name || rec.name || "").trim();
      const email = String(rec.email || "").trim();
      const kind = String(rec.kind || (email.startsWith("info@") ? "generic" : "people"));
      if (kind === "generic" && email) {
        const key = `e:${email.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: name || email,
          title: rec.title ? String(rec.title) : null,
          email,
          status: String(rec.email_status || "unverified"),
          kind: "generic"
        });
        continue;
      }
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({
        name,
        title: rec.title ? String(rec.title) : null,
        email,
        status: String(rec.email_status || "unverified"),
        kind: kind || "people"
      });
    }
  }
  return out;
}

async function importCrmRows(
  db: Pool,
  tenantId: number,
  rows: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string;
    country: string;
    industry: string;
    jobTitle: string | null;
    website: string;
    mainBusiness: string;
  }>
): Promise<number> {
  let n = 0;
  for (const c of rows) {
    try {
      await db.query(
        `INSERT INTO email_contacts (tenant_id, email, first_name, last_name, company, country, industry, job_title, website, main_business, email_status, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?)
         ON DUPLICATE KEY UPDATE
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           company = VALUES(company),
           country = VALUES(country),
           industry = VALUES(industry),
           job_title = VALUES(job_title),
           website = VALUES(website),
           main_business = VALUES(main_business),
           email_status = 'valid',
           tags_json = VALUES(tags_json)`,
        [
          tenantId,
          c.email,
          c.firstName,
          c.lastName,
          c.company,
          c.country,
          c.industry,
          c.jobTitle,
          c.website,
          c.mainBusiness,
          JSON.stringify(["lead_finder_auto", c.industry])
        ]
      );
      n += 1;
    } catch {
      /* skip row */
    }
  }
  return n;
}

async function processCompany(
  db: Pool,
  env: Env,
  job: JobRow,
  co: DiscoveredCompany
): Promise<{ imported: number; csvLines: string[] }> {
  const scrape = await proxyFinder(
    env,
    "scrape",
    { query: co.domain, sources: ["emails", "linkedin"], forceRefresh: true, skipWebEnrich: true },
    180_000
  ).catch(() => null);
  const [news, titles, linkedin] = await Promise.all([
    proxyFinder(env, "discover-lane", { query: co.domain, lane: "news", companyName: co.name }, 200_000).catch(
      () => null
    ),
    proxyFinder(env, "discover-lane", { query: co.domain, lane: "titles", companyName: co.name }, 200_000).catch(
      () => null
    ),
    proxyFinder(env, "discover-lane", { query: co.domain, lane: "linkedin_web", companyName: co.name }, 200_000).catch(
      () => null
    )
  ]);
  const people = collectPeople([scrape, news, titles, linkedin]);
  const named = people.filter((p) => p.kind !== "generic").slice(0, VERIFY_PEOPLE_CAP);
  const probeOn = await smtpProbeHealth();
  for (const person of named) {
    if (person.status === "valid" && person.email) continue;
    try {
      if (probeOn) {
        const guesses = guessEmailsFromName(person.name, co.domain);
        const hit = await verifyPersonCombosOneByOne(person.name, co.domain, guesses);
        if (hit) {
          person.email = hit;
          person.status = "valid";
        } else {
          person.status = "no_email";
        }
      } else {
        const res = await proxyFinder(
          env,
          "guess-verify-batch",
          { domain: co.domain, people: [{ name: person.name, title: person.title }], knownEmails: [] },
          90_000
        );
        const hit = Array.isArray(res.results) ? (res.results[0] as Record<string, unknown> | undefined) : undefined;
        const email = hit?.email ? String(hit.email) : "";
        const st = String(hit?.email_status || "").toLowerCase();
        if (email && st === "valid") {
          person.email = email;
          person.status = "valid";
        } else {
          person.status = "no_email";
        }
      }
    } catch {
      person.status = "no_email";
    }
  }
  const valid = [...named, ...people.filter((p) => p.kind === "generic" && p.email)].filter(
    (p) => p.email && (p.kind === "generic" || p.status === "valid")
  );
  const crmTag = job.crm_tag;
  const imported = await importCrmRows(
    db,
    job.tenant_id,
    valid.map((p) => {
      const { firstName, lastName } = splitName(p.kind === "generic" ? "" : p.name);
      return {
        email: p.email,
        firstName,
        lastName,
        company: co.name,
        country: co.country === "SG" ? "Singapore" : "United States",
        industry: crmTag,
        jobTitle: p.title,
        website: co.website,
        mainBusiness: co.mainBusiness
      };
    })
  );
  const csvLines = valid.map((p) =>
    [
      csvCell(co.name),
      csvCell(co.website),
      csvCell(co.domain),
      csvCell(co.country),
      csvCell(p.kind === "generic" ? "" : p.name),
      csvCell(p.title || ""),
      csvCell(p.email),
      csvCell(co.mainBusiness),
      csvCell(crmTag)
    ].join(",")
  );
  return { imported, csvLines };
}

async function runJob(db: Pool, env: Env, jobId: number) {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT * FROM lead_finder_auto_jobs WHERE id = ? LIMIT 1`, [jobId]);
  const job = rows[0] as JobRow | undefined;
  if (!job) return;
  const settings = await loadAutoSettings(db, job.tenant_id, env);
  await db.query(`UPDATE lead_finder_auto_jobs SET status='running', started_at=NOW() WHERE id=?`, [jobId]);
  await appendEvent(db, jobId, job.tenant_id, null, "running", "开始用网页/新闻搜索 ESP 用户企业（不编造域名）");

  const header = "company,website,domain,country,contact,title,email,main_business,tag";
  let csv = job.csv_text || `${header}\n`;
  let processed = Number(job.processed) || 0;
  let imported = Number(job.imported) || 0;
  let skipped = Number(job.skipped) || 0;
      const quota = Number(job.quota) || 30;
  const exclude = await loadExcludeDomains(db, job.tenant_id);

  try {
    while (processed < quota) {
      const [fresh] = await db.query<RowDataPacket[]>(
        `SELECT status FROM lead_finder_auto_jobs WHERE id=? LIMIT 1`,
        [jobId]
      );
      if (String(fresh[0]?.status) === "stopped") {
        await appendEvent(db, jobId, job.tenant_id, null, "stopped", "用户停止任务");
        return;
      }
      const need = Math.min(25, quota - processed);
      const batch = await discoverEmailMarketingCompanies({
        apiKey: settings.apiKey,
        baseUrl: settings.apiBaseUrl,
        model: settings.apiModel,
        countries: settings.countries,
        excludeDomains: exclude,
        want: need
      });
      if (!batch.length) {
        await appendEvent(db, jobId, job.tenant_id, null, "error", "本轮网页搜索未找到可打开的新官网");
        break;
      }
      for (const co of batch) {
        if (processed >= quota) break;
        if (await seenRecently(db, job.tenant_id, co.domain)) {
          skipped += 1;
          exclude.push(co.domain);
          continue;
        }
        await appendEvent(db, jobId, job.tenant_id, co.domain, "running", `正在搜索 ${co.name}`);
        try {
          const result = await processCompany(db, env, { ...job, crm_tag: job.crm_tag }, co);
          imported += result.imported;
          if (result.csvLines.length) csv += `${result.csvLines.join("\n")}\n`;
          await markSeen(db, job.tenant_id, co.domain);
          exclude.push(co.domain);
          processed += 1;
          await db.query(
            `UPDATE lead_finder_auto_jobs SET processed=?, imported=?, skipped=?, csv_text=? WHERE id=?`,
            [processed, imported, skipped, csv, jobId]
          );
          await appendEvent(
            db,
            jobId,
            job.tenant_id,
            co.domain,
            "done",
            `${co.name} 完成 · 导入 ${result.imported} 条`
          );
        } catch (e) {
          skipped += 1;
          processed += 1;
          await markSeen(db, job.tenant_id, co.domain);
          await db.query(`UPDATE lead_finder_auto_jobs SET processed=?, skipped=? WHERE id=?`, [
            processed,
            skipped,
            jobId
          ]);
          await appendEvent(
            db,
            jobId,
            job.tenant_id,
            co.domain,
            "error",
            `${co.name} 失败：${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }
    await db.query(
      `UPDATE lead_finder_auto_jobs
          SET status='done', processed=?, imported=?, skipped=?, csv_text=?, current_note='完成', finished_at=NOW()
        WHERE id=?`,
      [processed, imported, skipped, csv, jobId]
    );
    await appendEvent(db, jobId, job.tenant_id, null, "done", `任务完成 · 处理 ${processed} 家 · 导入 ${imported}`);
  } catch (e) {
    await db.query(`UPDATE lead_finder_auto_jobs SET status='failed', error_message=?, finished_at=NOW() WHERE id=?`, [
      e instanceof Error ? e.message : String(e),
      jobId
    ]);
    await appendEvent(db, jobId, job.tenant_id, null, "error", e instanceof Error ? e.message : String(e));
  }
}

export async function startAutoJob(db: Pool, env: Env, tenantId: number, force = false): Promise<number> {
  await ensureLeadFinderAutoSchema(db);
  const settings = await loadAutoSettings(db, tenantId, env);
  const { date } = todayInTz(settings.timezone);
  const [running] = await db.query<RowDataPacket[]>(
    `SELECT id FROM lead_finder_auto_jobs WHERE tenant_id=? AND status IN ('queued','running') LIMIT 1`,
    [tenantId]
  );
  if (running[0]?.id) return Number(running[0].id);
  if (!force) {
    const [today] = await db.query<RowDataPacket[]>(
      `SELECT id, status FROM lead_finder_auto_jobs WHERE tenant_id=? AND run_date=? LIMIT 1`,
      [tenantId, date]
    );
    if (today[0] && String(today[0].status) === "done") return Number(today[0].id);
  }
  const crmTag = date;
  const [ret] = await db.query<ResultSetHeader>(
    `INSERT INTO lead_finder_auto_jobs (tenant_id, run_date, status, countries, quota, crm_tag, processed, imported, skipped, csv_text, error_message, finished_at)
     VALUES (?, ?, 'queued', ?, ?, ?, 0, 0, 0, NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       status='queued',
       quota=VALUES(quota),
       processed=0,
       imported=0,
       skipped=0,
       csv_text=NULL,
       error_message=NULL,
       finished_at=NULL,
       current_note='queued'`
    [tenantId, date, settings.countries.join(","), settings.dailyQuota, crmTag]
  );
  let jobId = Number(ret.insertId || 0);
  if (!jobId) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM lead_finder_auto_jobs WHERE tenant_id=? AND run_date=? LIMIT 1`,
      [tenantId, date]
    );
    jobId = Number(rows[0]?.id || 0);
  }
  void runJob(db, env, jobId).catch((e) => console.warn("[lead-finder-auto]", e));
  return jobId;
}

export async function stopAutoJob(db: Pool, tenantId: number): Promise<void> {
  await db.query(
    `UPDATE lead_finder_auto_jobs SET status='stopped', finished_at=NOW()
      WHERE tenant_id=? AND status IN ('queued','running')`,
    [tenantId]
  );
}

export async function getAutoStatus(db: Pool, tenantId: number) {
  await ensureLeadFinderAutoSchema(db);
  const [jobs] = await db.query<RowDataPacket[]>(
    `SELECT id, run_date, status, quota, processed, imported, skipped, crm_tag, current_domain, current_note, error_message, started_at, finished_at,
            (csv_text IS NOT NULL AND CHAR_LENGTH(csv_text) > 20) AS has_csv
       FROM lead_finder_auto_jobs WHERE tenant_id=? ORDER BY id DESC LIMIT 8`,
    [tenantId]
  );
  const active = jobs.find((j) => j.status === "running" || j.status === "queued") || jobs[0] || null;
  let events: RowDataPacket[] = [];
  if (active?.id) {
    const [ev] = await db.query<RowDataPacket[]>(
      `SELECT domain, status, note, created_at FROM lead_finder_auto_events
        WHERE job_id=? ORDER BY id DESC LIMIT 60`,
      [active.id]
    );
    events = ev.filter(
      (row) => !/403|unsupported_country|request_forbidden|Kimi 调研失败|正在用 Kimi 查找/i.test(String(row.note || ""))
    );
  }
  return { jobs, active, events };
}

export async function getJobCsv(db: Pool, tenantId: number, jobId: number): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT csv_text FROM lead_finder_auto_jobs WHERE id=? AND tenant_id=? LIMIT 1`,
    [jobId, tenantId]
  );
  return rows[0]?.csv_text ? String(rows[0].csv_text) : null;
}

export function startLeadFinderAutoScheduler(db: Pool, env: Env) {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    void (async () => {
      if (runnerBusy) return;
      runnerBusy = true;
      try {
        await ensureLeadFinderAutoSchema(db);
        const [tenants] = await db.query<RowDataPacket[]>(
          `SELECT tenant_id FROM lead_finder_auto_settings WHERE enabled=1`
        );
        for (const t of tenants) {
          const tenantId = Number(t.tenant_id);
          const settings = await loadAutoSettings(db, tenantId, env);
          const now = todayInTz(settings.timezone);
          if (now.hour !== settings.runHour || now.minute > 8) continue;
          const [done] = await db.query<RowDataPacket[]>(
            `SELECT id, status FROM lead_finder_auto_jobs WHERE tenant_id=? AND run_date=? LIMIT 1`,
            [tenantId, now.date]
          );
          if (done[0] && ["running", "queued", "done"].includes(String(done[0].status))) continue;
          await startAutoJob(db, env, tenantId, false);
        }
      } catch (e) {
        console.warn("[lead-finder-auto] tick", e);
      } finally {
        runnerBusy = false;
      }
    })();
  }, TICK_MS);
}
