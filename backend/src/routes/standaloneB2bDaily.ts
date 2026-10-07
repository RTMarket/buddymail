/**
 * 开源版 · 每日日报 + 可选同步到外部 AI 助手
 * 日报数据给「每日日报总结」页；pet-sync 保存外部 AI 助手 API Key（用户自填），
 * 立即同步 = 让外部助手从工作台拉取今日日报。
 */
import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { resolveTenantId } from "../middleware/auth.js";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { loadDailyReport, shanghaiToday, todayCampaignStats } from "../services/standaloneDailyReport.js";
import { generateDailyReview, getDailySectionsCached } from "../services/standaloneDailySections.js";
import { refreshTikTokAccessToken } from "../services/tiktokPostPublish.js";

const DEFAULT_PET_API_URL = (process.env.PET_API_URL || "").trim();
const AUTO_SYNC_MS = 30 * 60 * 1000;
const PET_SKILL_NAME = "独立站日报同步";
const PET_SKILL_INSTRUCTION =
  "用户问今天独立站 / 工作台的获客、搜索企业数、国家、验证邮箱、开发信、营销发送（成功、失败、打开、订阅、退订、投诉）等数据时，" +
  "以日历里「工作台日报」的数字为准回答，不要编造；数字由独立站「每日日报总结」页同步过来。" +
  "如果日历里还没有今天的数字，提醒用户在独立站日报页点「立即同步今日日报」。";

type SyncRow = {
  tenant_id: number;
  pet_url: string | null;
  api_key_enc: string | null;
  key_tail: string | null;
  last_sync_at: number | string | null;
  last_sync_ok: number | null;
  last_sync_message: string | null;
};

let schemaReady: Promise<void> | null = null;

function ensureSchema(db: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS standalone_pet_sync (
           tenant_id BIGINT NOT NULL PRIMARY KEY,
           pet_url VARCHAR(255) NULL,
           api_key_enc TEXT NULL,
           key_tail VARCHAR(16) NULL,
           last_sync_at BIGINT NULL,
           last_sync_ok TINYINT NULL,
           last_sync_message VARCHAR(500) NULL,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

function petApiBase(row: SyncRow | null): string {
  const raw = String(row?.pet_url || process.env.BSS_PET_API_URL || DEFAULT_PET_API_URL).trim();
  return raw.replace(/\/+$/, "");
}

function maskKey(tail: string | null): string {
  return tail ? `pet_****${tail}` : "";
}

function isoOrNull(v: number | string | null): string | null {
  const ms = Number(v);
  if (!v || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function syncView(row: SyncRow | null) {
  const configured = Boolean(row?.api_key_enc);
  return {
    configured,
    maskedKey: configured ? maskKey(row?.key_tail ?? null) : "",
    petUrl: petApiBase(row),
    lastSyncAt: isoOrNull(row?.last_sync_at ?? null),
    lastSyncOk: row?.last_sync_ok == null ? null : Number(row.last_sync_ok) === 1,
    lastSyncMessage: row?.last_sync_message || ""
  };
}

async function loadSync(db: Pool, tenantId: number): Promise<SyncRow | null> {
  await ensureSchema(db);
  const [rows] = await db.query(`SELECT * FROM standalone_pet_sync WHERE tenant_id = ? LIMIT 1`, [tenantId]);
  return ((rows as SyncRow[])[0] as SyncRow | undefined) ?? null;
}

async function petCall(
  base: string,
  key: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = 20000
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}

function petError(status: number, data: Record<string, unknown> | null): string {
  if (status === 401) return "外部助手 Key 无效，请检查配置";
  if (status === 502 || status === 503 || status === 504) return "连不上外部助手，请确认服务地址与网络";
  const msg = typeof data?.message === "string" ? data.message : "";
  return msg || `外部助手返回 ${status}`;
}

async function recordSync(db: Pool, tenantId: number, ok: boolean, message: string) {
  await db.query(
    `UPDATE standalone_pet_sync SET last_sync_at = ?, last_sync_ok = ?, last_sync_message = ? WHERE tenant_id = ?`,
    [Date.now(), ok ? 1 : 0, message.slice(0, 500), tenantId]
  );
}

async function pushToPet(db: Pool, tenantId: number): Promise<{ ok: boolean; message: string; facts?: string }> {
  const row = await loadSync(db, tenantId);
  if (!row?.api_key_enc) return { ok: false, message: "还没有保存外部助手 Key" };
  const key = decryptSecret(row.api_key_enc);
  const base = petApiBase(row);
  let result: { ok: boolean; message: string; facts?: string };
  try {
    const { status, data } = await petCall(base, key, "POST", "/v1/workbench/report/refresh", {}, 90000);
    if (status >= 200 && status < 300 && data?.ok !== false) {
      const facts = typeof data?.facts === "string" ? data.facts : "";
      result = { ok: true, message: "已同步到桌宠日历「工作台日报」", facts };
    } else {
      result = { ok: false, message: petError(status, data) };
    }
  } catch {
    result = { ok: false, message: "连不上桌宠：请确认那台电脑开着、AI 桌宠 3.0 在运行" };
  }
  await recordSync(db, tenantId, result.ok, result.message);
  return result;
}

let autoTimer: NodeJS.Timeout | null = null;

function startAutoSync(db: Pool) {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    void (async () => {
      try {
        await ensureSchema(db);
        const [rows] = await db.query(`SELECT tenant_id FROM standalone_pet_sync WHERE api_key_enc IS NOT NULL`);
        for (const r of rows as Array<{ tenant_id: number }>) {
          await pushToPet(db, Number(r.tenant_id)).catch(() => {});
        }
      } catch (e) {
        console.warn("[pet-sync] auto sync", (e as Error)?.message ?? e);
      }
    })();
  }, AUTO_SYNC_MS);
  autoTimer.unref?.();
}

const TIKTOK_STATS_TTL_MS = 15 * 60 * 1000;
const TIKTOK_USER_FIELDS = "open_id,display_name,username,follower_count,following_count,likes_count,video_count";

type TikTokRow = {
  tenant_id: number;
  slot: number;
  open_id: string;
  name: string | null;
  username: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  videos: number | null;
  stats_at: number | string | null;
  stats_ok: number | null;
  stats_message: string | null;
};

let tiktokSchemaReady: Promise<void> | null = null;

function ensureTikTokSchema(db: Pool): Promise<void> {
  if (!tiktokSchemaReady) {
    tiktokSchemaReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS standalone_tiktok_account_stats (
           tenant_id BIGINT NOT NULL,
           slot INT NOT NULL,
           open_id VARCHAR(128) NOT NULL,
           name VARCHAR(255) NULL,
           username VARCHAR(255) NULL,
           access_token_enc TEXT NULL,
           refresh_token_enc TEXT NULL,
           followers BIGINT NULL,
           following BIGINT NULL,
           likes BIGINT NULL,
           videos BIGINT NULL,
           stats_at BIGINT NULL,
           stats_ok TINYINT NULL,
           stats_message VARCHAR(500) NULL,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (tenant_id, slot)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .then(() => undefined)
      .catch((e) => {
        tiktokSchemaReady = null;
        throw e;
      });
  }
  return tiktokSchemaReady;
}

function tiktokCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

async function fetchTikTokStats(
  accessToken: string
): Promise<{ ok: true; user: Record<string, unknown> } | { ok: false; invalidToken: boolean; message: string }> {
  try {
    const res = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(TIKTOK_USER_FIELDS)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000)
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const err = (json.error ?? {}) as Record<string, unknown>;
    const code = String(err.code ?? "");
    if (!res.ok || (code && code !== "ok")) {
      const message = String(err.message || code || `HTTP ${res.status}`).slice(0, 300);
      return { ok: false, invalidToken: res.status === 401 || /access_token_invalid|invalid|expired/i.test(`${code} ${message}`), message };
    }
    const data = (json.data ?? {}) as Record<string, unknown>;
    return { ok: true, user: (data.user ?? data) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, invalidToken: false, message: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

async function refreshOneTikTok(db: Pool, row: TikTokRow): Promise<void> {
  if (!row.access_token_enc) return;
  let accessToken = decryptSecret(row.access_token_enc);
  let result = await fetchTikTokStats(accessToken);
  if (!result.ok && result.invalidToken && row.refresh_token_enc) {
    try {
      const next = await refreshTikTokAccessToken(decryptSecret(row.refresh_token_enc));
      accessToken = next.accessToken;
      await db.query(
        `UPDATE standalone_tiktok_account_stats SET access_token_enc = ?, refresh_token_enc = ? WHERE tenant_id = ? AND slot = ?`,
        [encryptSecret(next.accessToken), encryptSecret(next.refreshToken), row.tenant_id, row.slot]
      );
      result = await fetchTikTokStats(accessToken);
    } catch (e) {
      result = { ok: false, invalidToken: true, message: String((e as Error)?.message ?? e).slice(0, 300) };
    }
  }
  if (result.ok) {
    const u = result.user;
    await db.query(
      `UPDATE standalone_tiktok_account_stats
          SET followers = ?, following = ?, likes = ?, videos = ?,
              name = COALESCE(NULLIF(?, ''), name), username = COALESCE(NULLIF(?, ''), username),
              stats_at = ?, stats_ok = 1, stats_message = NULL
        WHERE tenant_id = ? AND slot = ?`,
      [
        tiktokCount(u.follower_count),
        tiktokCount(u.following_count),
        tiktokCount(u.likes_count),
        tiktokCount(u.video_count),
        String(u.display_name ?? ""),
        String(u.username ?? ""),
        Date.now(),
        row.tenant_id,
        row.slot
      ]
    );
  } else {
    await db.query(
      `UPDATE standalone_tiktok_account_stats SET stats_at = ?, stats_ok = 0, stats_message = ? WHERE tenant_id = ? AND slot = ?`,
      [Date.now(), result.message, row.tenant_id, row.slot]
    );
  }
}

async function loadTikTokRows(db: Pool, tenantId: number): Promise<TikTokRow[]> {
  await ensureTikTokSchema(db);
  const [rows] = await db.query(`SELECT * FROM standalone_tiktok_account_stats WHERE tenant_id = ? ORDER BY slot`, [tenantId]);
  return rows as TikTokRow[];
}

async function refreshTikTokStats(db: Pool, tenantId: number, force: boolean): Promise<TikTokRow[]> {
  const rows = await loadTikTokRows(db, tenantId);
  const stale = rows.filter((r) => force || !Number(r.stats_at) || Date.now() - Number(r.stats_at) > TIKTOK_STATS_TTL_MS);
  if (stale.length) {
    await Promise.all(stale.map((r) => refreshOneTikTok(db, r).catch(() => {})));
    return loadTikTokRows(db, tenantId);
  }
  return rows;
}

function shanghaiDayOf(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function utcSqlOfShanghaiMidnight(day: string): string {
  return new Date(`${day}T00:00:00+08:00`).toISOString().slice(0, 19).replace("T", " ");
}

function parseJsonText(raw: unknown): Record<string, unknown> {
  try {
    const v = JSON.parse(String(raw ?? ""));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type PublishCount = { total: number; today: number; failedToday: number };

async function publishCounts(db: Pool, today: string) {
  const byPlatform: Record<string, PublishCount> = {};
  const bySlot: Record<string, PublishCount> = {};
  const bump = (map: Record<string, PublishCount>, key: string, ok: boolean, isToday: boolean) => {
    const c = (map[key] ||= { total: 0, today: 0, failedToday: 0 });
    if (ok) c.total += 1;
    if (ok && isToday) c.today += 1;
    if (!ok && isToday) c.failedToday += 1;
  };
  try {
    const [rows] = await db.query(
      `SELECT title, results_json, created_at FROM standalone_social_library_logs ORDER BY id DESC LIMIT 20000`
    );
    for (const row of rows as Array<{ title: string | null; results_json: unknown; created_at: unknown }>) {
      const isToday = shanghaiDayOf(row.created_at) === today;
      let results: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(String(row.results_json ?? "[]"));
        if (Array.isArray(parsed)) results = parsed;
      } catch {
        /* skip */
      }
      for (const r of results) {
        const platform = String(r?.platform ?? "");
        if (!platform) continue;
        const ok = Boolean(r?.ok);
        bump(byPlatform, platform, ok, isToday);
        if (platform === "tiktok") {
          const m = /TikTok\s*(\d+)/i.exec(String(r?.message ?? "")) || /TikTok\s*(\d+)/i.exec(String(row.title ?? ""));
          if (m) bump(bySlot, m[1], ok, isToday);
        }
      }
    }
  } catch (e) {
    console.warn("[daily-sheet] social logs", (e as Error)?.message ?? e);
  }
  return { byPlatform, bySlot };
}

async function leadStats(db: Pool, tenantId: number, today: string) {
  const since = utcSqlOfShanghaiMidnight(today);
  const leadFinder = { searches: 0, companies: 0, contacts: 0, validEmails: 0, crm: 0, domains: [] as string[] };
  const industry = { searches: 0, keywords: [] as string[], companiesFound: 0, companiesDug: 0, validEmails: 0, crm: 0 };
  const autoDaily = { runs: 0, processed: 0, imported: 0 };
  let crmToday = 0;
  try {
    const [jobs] = await db.query(
      `SELECT id,
              CASE WHEN JSON_VALID(input_json) THEN JSON_UNQUOTE(JSON_EXTRACT(input_json, '$.mode')) END AS mode,
              CASE WHEN JSON_VALID(input_json) THEN JSON_UNQUOTE(JSON_EXTRACT(input_json, '$.keywords')) END AS keywords,
              CASE WHEN JSON_VALID(progress_json) THEN JSON_LENGTH(progress_json, '$.companies') END AS companies
         FROM lead_search_jobs
        WHERE tenant_id = ? AND created_at >= ?`,
      [tenantId, since]
    );
    const kw = new Set<string>();
    for (const j of jobs as Array<{ mode: string | null; keywords: string | null; companies: number | null }>) {
      if (j.mode === "industry") {
        industry.searches += 1;
        industry.companiesFound += Number(j.companies) || 0;
        const k = String(j.keywords || "").trim();
        if (k) kw.add(k);
      } else {
        leadFinder.searches += 1;
      }
    }
    industry.keywords = [...kw].slice(0, 10);
    const [events] = await db.query(
      `SELECT e.note,
              CASE WHEN JSON_VALID(j.input_json) THEN JSON_UNQUOTE(JSON_EXTRACT(j.input_json, '$.mode')) END AS mode,
              CASE WHEN JSON_VALID(j.input_json) THEN JSON_UNQUOTE(JSON_EXTRACT(j.input_json, '$.keywords')) END AS keywords
         FROM lead_search_events e
         JOIN lead_search_jobs j ON j.id = e.job_id
        WHERE j.tenant_id = ? AND e.created_at >= ?
          AND (e.note LIKE '单企业精搜完成%' OR e.note LIKE '深度搜索完成%')`,
      [tenantId, since]
    );
    const doms = new Set<string>();
    for (const ev of events as Array<{ note: string; mode: string | null; keywords: string | null }>) {
      const note = String(ev.note || "");
      const crm = Number(/CRM\s+(\d+)/.exec(note)?.[1] || 0);
      const valid = Number(/有效邮箱\s+(\d+)/.exec(note)?.[1] || 0);
      if (note.startsWith("单企业精搜完成")) {
        leadFinder.companies += 1;
        leadFinder.contacts += Number(/联系人\s+(\d+)/.exec(note)?.[1] || 0);
        leadFinder.validEmails += valid;
        leadFinder.crm += crm;
        const d = String(ev.keywords || "").trim();
        if (d) doms.add(d);
      } else {
        industry.companiesDug += Number(/深度搜索完成\s*·\s*(\d+)\s*家/.exec(note)?.[1] || 0);
        industry.validEmails += valid;
        industry.crm += crm;
      }
    }
    leadFinder.domains = [...doms].slice(0, 20);
  } catch (e) {
    console.warn("[daily-sheet] lead search", (e as Error)?.message ?? e);
  }
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS runs, COALESCE(SUM(processed), 0) AS processed, COALESCE(SUM(imported), 0) AS imported
         FROM lead_finder_auto_jobs WHERE tenant_id = ? AND run_date = ?`,
      [tenantId, today]
    );
    const r = (rows as Array<{ runs: number; processed: number; imported: number }>)[0];
    if (r) {
      autoDaily.runs = Number(r.runs) || 0;
      autoDaily.processed = Number(r.processed) || 0;
      autoDaily.imported = Number(r.imported) || 0;
    }
  } catch {
    /* table may not exist yet */
  }
  try {
    const [rows] = await db.query(`SELECT COUNT(*) AS n FROM email_contacts WHERE tenant_id = ? AND created_at >= ?`, [
      tenantId,
      since
    ]);
    crmToday = Number((rows as Array<{ n: number }>)[0]?.n) || 0;
  } catch {
    /* ignore */
  }
  return { leadFinder, industry, autoDaily, crmToday };
}

function tiktokView(rows: TikTokRow[], bySlot: Record<string, PublishCount>) {
  const slots = new Set<number>(rows.map((r) => Number(r.slot)));
  for (const k of Object.keys(bySlot)) slots.add(Number(k));
  return [...slots]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
    .map((slot) => {
      const r = rows.find((x) => Number(x.slot) === slot);
      const c = bySlot[String(slot)] || { total: 0, today: 0, failedToday: 0 };
      return {
        slot,
        connected: Boolean(r?.access_token_enc),
        name: r?.name || "",
        username: r?.username || "",
        followers: tiktokCount(r?.followers),
        following: tiktokCount(r?.following),
        likes: tiktokCount(r?.likes),
        videos: tiktokCount(r?.videos),
        statsAt: r?.stats_at ? new Date(Number(r.stats_at)).toISOString() : null,
        statsOk: r?.stats_ok == null ? null : Number(r.stats_ok) === 1,
        statsMessage: r?.stats_message || "",
        today: c.today,
        failedToday: c.failedToday,
        total: c.total
      };
    });
}

export function registerStandaloneB2bDailyRoutes(app: Express, ctx: { db: Pool; env: Env }) {
  const { db, env } = ctx;

  app.get("/api/standalone/b2b/daily-sheet", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const today = shanghaiToday();
      const [leads, counts, tiktokRows] = await Promise.all([
        leadStats(db, tenantId, today),
        publishCounts(db, today),
        refreshTikTokStats(db, tenantId, String(req.query.refresh ?? "") === "1").catch(() => [] as TikTokRow[])
      ]);
      return res.json({
        ok: true,
        date: today,
        ...leads,
        socialTotals: counts.byPlatform,
        tiktok: tiktokView(tiktokRows, counts.bySlot)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `读取日报统计失败：${(e as Error)?.message ?? e}` });
    }
  });

  app.post("/api/standalone/b2b/tiktok-accounts", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const list = Array.isArray((req.body as { accounts?: unknown } | undefined)?.accounts)
      ? ((req.body as { accounts: unknown[] }).accounts as Array<Record<string, unknown>>)
      : [];
    const accounts = list
      .map((a) => ({
        slot: Math.floor(Number(a?.slot)),
        openId: String(a?.openId ?? "").trim().slice(0, 128),
        accessToken: String(a?.accessToken ?? "").trim(),
        refreshToken: String(a?.refreshToken ?? "").trim(),
        name: String(a?.name ?? "").trim().slice(0, 255),
        username: String(a?.username ?? "").trim().replace(/^@/, "").slice(0, 255)
      }))
      .filter((a) => a.slot >= 1 && a.slot <= 50 && a.openId && a.accessToken.length >= 20 && a.accessToken.length <= 8192)
      .slice(0, 50);
    try {
      await ensureTikTokSchema(db);
      const existing = await loadTikTokRows(db, tenantId);
      for (const a of accounts) {
        const old = existing.find((r) => Number(r.slot) === a.slot);
        const keepServerToken =
          old && old.open_id === a.openId && Number(old.stats_ok) === 1 && Date.now() - Number(old.stats_at) < 12 * 3600 * 1000;
        if (keepServerToken) {
          await db.query(
            `UPDATE standalone_tiktok_account_stats
                SET name = COALESCE(NULLIF(?, ''), name), username = COALESCE(NULLIF(?, ''), username)
              WHERE tenant_id = ? AND slot = ?`,
            [a.name, a.username, tenantId, a.slot]
          );
          continue;
        }
        await db.query(
          `INSERT INTO standalone_tiktok_account_stats
             (tenant_id, slot, open_id, name, username, access_token_enc, refresh_token_enc, stats_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE open_id = VALUES(open_id), name = VALUES(name), username = VALUES(username),
             access_token_enc = VALUES(access_token_enc), refresh_token_enc = VALUES(refresh_token_enc), stats_at = NULL`,
          [
            tenantId,
            a.slot,
            a.openId,
            a.name || null,
            a.username || null,
            encryptSecret(a.accessToken),
            a.refreshToken ? encryptSecret(a.refreshToken) : null
          ]
        );
      }
      if (accounts.length) {
        const keep = accounts.map((a) => a.slot);
        await db.query(
          `DELETE FROM standalone_tiktok_account_stats WHERE tenant_id = ? AND slot NOT IN (${keep.map(() => "?").join(",")})`,
          [tenantId, ...keep]
        );
      }
      const rows = await refreshTikTokStats(db, tenantId, false);
      const counts = await publishCounts(db, shanghaiToday());
      return res.json({ ok: true, tiktok: tiktokView(rows, counts.bySlot) });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `保存 TikTok 账号失败：${(e as Error)?.message ?? e}` });
    }
  });

  app.get("/api/standalone/b2b/daily-report", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const runDate = shanghaiToday();
      const [report, campaign, sections] = await Promise.all([
        loadDailyReport(db, tenantId, runDate),
        todayCampaignStats(db, tenantId, runDate),
        getDailySectionsCached(db, tenantId).catch((e) => {
          console.warn("[daily-report] sections failed:", (e as Error)?.message || e);
          return null;
        })
      ]);
      const summary =
        report?.summary ||
        "今天的自动获客还没跑完。到「企业leads精搜 → 自动日搜」打开每日搜索后，这里会自动总结：搜了多少家、哪些国家、SMTP 验邮后有多少有效邮箱、模版和专线发送，以及日常邮箱第 1 个发出的开发信。";
      return res.json({
        ok: true,
        report,
        sendStats: campaign.stats,
        sections,
        messages: [{ role: "assistant", content: `${summary}\n\n${campaign.text}`, at: report?.updatedAt || null }]
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `读取日报失败：${(e as Error)?.message ?? e}` });
    }
  });

  // 智能复盘：固定走 AI 桌宠的大模型（pet-api）生成，桌宠不可用时走模板
  app.post("/api/standalone/b2b/daily-report/review", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const review = await generateDailyReview(db, tenantId);
      return res.json({ ok: true, review, date: shanghaiToday() });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `生成复盘失败：${(e as Error)?.message ?? e}` });
    }
  });


  app.get("/api/standalone/b2b/pet-sync", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      return res.json({ ok: true, ...syncView(await loadSync(db, tenantId)) });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/b2b/pet-sync", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const body = (req.body ?? {}) as { key?: unknown; url?: unknown };
    const key = String(body.key ?? "").trim();
    if (!/^pet_[A-Za-z0-9_-]{8,200}$/.test(key)) {
      return res.status(400).json({ ok: false, message: "Key 格式不对：应以 pet_ 开头（在 AI 桌宠 3.0 设置 → AI 桌宠开发者应用里复制）" });
    }
    const urlRaw = String(body.url ?? "").trim();
    if (urlRaw && !/^https?:\/\/[^\s]+$/i.test(urlRaw)) {
      return res.status(400).json({ ok: false, message: "桌宠接口地址不对" });
    }
    try {
      const existing = await loadSync(db, tenantId);
      const base = (urlRaw || petApiBase(existing)).replace(/\/+$/, "");
      let check: { status: number; data: Record<string, unknown> | null };
      try {
        check = await petCall(base, key, "GET", "/v1");
      } catch {
        return res.status(400).json({ ok: false, message: "连不上桌宠：请确认那台电脑开着、AI 桌宠 3.0 在运行" });
      }
      if (check.status < 200 || check.status >= 300) {
        return res.status(400).json({ ok: false, message: petError(check.status, check.data) });
      }
      await db.query(
        `INSERT INTO standalone_pet_sync (tenant_id, pet_url, api_key_enc, key_tail)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pet_url = VALUES(pet_url), api_key_enc = VALUES(api_key_enc), key_tail = VALUES(key_tail)`,
        [tenantId, urlRaw || null, encryptSecret(key), key.slice(-4)]
      );
      let skillNote = "已给桌宠装好日报同步 skill";
      try {
        const skill = await petCall(base, key, "POST", "/v1/skills", {
          name: PET_SKILL_NAME,
          instruction: PET_SKILL_INSTRUCTION
        });
        if (skill.status < 200 || skill.status >= 300) skillNote = `skill 没装上：${petError(skill.status, skill.data)}`;
      } catch {
        skillNote = "skill 没装上：连不上桌宠";
      }
      const petName = typeof check.data?.name === "string" ? check.data.name : "桌宠";
      const view = syncView(await loadSync(db, tenantId));
      return res.json({ ok: true, ...view, message: `已保存，Key 验证通过（${petName}）。${skillNote}。` });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `保存失败：${(e as Error)?.message ?? e}` });
    }
  });

  app.post("/api/standalone/b2b/pet-sync/push", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const result = await pushToPet(db, tenantId);
      const sync = syncView(await loadSync(db, tenantId));
      if (!result.ok) return res.status(400).json({ ok: false, message: result.message, sync });
      return res.json({ ok: true, message: result.message, facts: result.facts || "", sync });
    } catch (e) {
      return res.status(500).json({ ok: false, message: `同步失败：${(e as Error)?.message ?? e}` });
    }
  });

  startAutoSync(db);
}
