import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Env } from "../env.js";
import { resolveTenantId } from "../middleware/auth.js";
import type { ApolloLeadRow } from "../services/apolloLeadsClient.js";
import { upsertLeads } from "../services/leadsIngest.js";
import { recordUsage, enforceQuota } from "../services/usageMeter.js";
import { discoverLeadsWithKimi } from "../services/leadFinderAutoDiscover.js";
import { loadAutoSettings } from "../services/leadFinderAutoRunner.js";
import {
  getLeadSearchCsv,
  getLeadSearchTask,
  startLeadSearchTask,
  stopLeadSearchTask,
  continueLeadSearchTask,
  continueDiscoverTask,
  resumeLeadSearchTask,
  removeCompaniesFromTask,
  gradeMissingGrades,
  startSingleCompanyTask,
  type SearchFields
} from "../services/leadFinderSearchTask.js";
import { suggestRelatedKeywords } from "../services/leadFinderSearchAi.js";
import {
  getLeadSearchProfile,
  saveLeadSearchProfile,
  analyzeProfileWithPet,
  EMPTY_LEAD_SEARCH_PROFILE
} from "../services/leadFinderProfile.js";

type Ctx = { db: Pool; env: Env };

const COMPLIANCE_FOOTER =
  "本数据均来源于企业公开公示商务信息，仅限合法商务邀约使用；采购方须自行遵守当地个人信息保护法规，严禁发送垃圾营销信息、倒卖个人隐私数据。";

function csvEscape(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function buildCsv(rows: Array<Record<string, string>>): string {
  const headers = [
    "企业名称",
    "联系人",
    "职位",
    "电话",
    "邮箱",
    "官网",
    "地址",
    "城市",
    "州/省",
    "国家",
    "行业",
    "邮箱状态",
    "数据来源"
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.company_name,
        r.contact_name,
        r.title,
        r.phone,
        r.email,
        r.website,
        r.address,
        r.city,
        r.state,
        r.country,
        r.industry,
        r.email_status,
        r.source
      ]
        .map((x) => csvEscape(x ?? ""))
        .join(",")
    ),
    "",
    csvEscape(COMPLIANCE_FOOTER)
  ];
  return `\ufeff${lines.join("\n")}`;
}

async function ensureExportTable(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS leads_export_jobs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id BIGINT NOT NULL,
      filename VARCHAR(255) NOT NULL,
      row_count INT NOT NULL DEFAULT 0,
      filter_json JSON NULL,
      csv_text MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_leads_export_tenant_created (tenant_id, created_at)
    )
  `);
}

function leadToCsvRow(x: ApolloLeadRow & { email_status: string }): Record<string, string> {
  return {
    company_name: x.company_name ?? "",
    contact_name: x.contact_name ?? "",
    title: x.title ?? "",
    phone: x.phone ?? "",
    email: x.email ?? "",
    website: x.website ?? "",
    address: x.address ?? "",
    city: x.city ?? "",
    state: x.state ?? "",
    country: x.country ?? "",
    industry: x.industry ?? "",
    email_status: x.email_status ?? "",
    source: x.source ?? "apollo"
  };
}

/** 独立站 · Leads 搜索 / 导出 / 用量（Apollo + Hunter） */
export function registerLeadsSearchRoutes(app: Express, ctx: { db: Pool; env: Env }) {
  const { db, env } = ctx;

  app.get("/api/leads/capability", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const settings = await loadAutoSettings(db, tenantId, env);
    const kimi = Boolean(settings.apiKey);
    return res.json({
      ok: true,
      kimiConfigured: kimi,
      apolloConfigured: false,
      hunterConfigured: false,
      message: kimi
        ? "搜索按页面勾选与行业/关键词执行；Kimi 仅作服务器备用，不编造公司名单。"
        : "搜索按页面勾选与行业/关键词执行（网页/新闻，不编造公司）。"
    });
  });

  app.post("/api/leads/search-task", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const schema = z.object({
      keywords: z.string().max(512).optional().default(""),
      limit: z.coerce.number().int().min(1).max(400).default(10),
      countryNameEn: z.string().max(128).optional().default(""),
      city: z.string().max(128).optional().default(""),
      province: z.string().max(128).optional().default(""),
      industry: z.string().max(256).optional().default(""),
      titles: z.string().max(512).optional().default("CEO, Founder, Marketing Manager"),
      roleTiers: z.array(z.string().max(32)).max(16).optional(),
      relatedKeywords: z.array(z.string().max(64)).max(15).optional(),
      syncCrm: z.boolean().optional().default(true),
      targetCount: z.coerce.number().int().min(10).max(200).optional().default(50),
      fields: z
        .object({
          companyName: z.boolean().optional().default(true),
          website: z.boolean().optional().default(true),
          address: z.boolean().optional().default(true),
          mainBusiness: z.boolean().optional().default(true),
          phone: z.boolean().optional().default(true),
          email: z.boolean().optional().default(true),
          titles: z.boolean().optional().default(true)
        })
        .optional()
    });
    const body = schema.parse(req.body ?? {});
    const fields: SearchFields = {
      companyName: body.fields?.companyName !== false,
      website: body.fields?.website !== false,
      address: body.fields?.address !== false,
      mainBusiness: body.fields?.mainBusiness !== false,
      phone: body.fields?.phone !== false,
      email: body.fields?.email !== false,
      titles: body.fields?.titles !== false
    };
    const jobId = await startLeadSearchTask(db, env, tenantId, {
      keywords: body.keywords,
      limit: body.limit,
      countryNameEn: body.countryNameEn,
      city: body.city,
      province: body.province,
      industry: body.industry,
      titles: body.titles,
      roleTiers: body.roleTiers,
      fields,
      mode: "industry",
      relatedKeywords: body.relatedKeywords || [],
      syncCrm: body.syncCrm,
      targetCount: body.targetCount
    });
    return res.json({ ok: true, jobId, message: "已开始搜索企业，名单会边搜边出现" });
  });

  /* 业务画像：存取 */
  app.get("/api/leads/profile", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const profile = await getLeadSearchProfile(db, tenantId);
    return res.json({ ok: true, profile: profile || { ...EMPTY_LEAD_SEARCH_PROFILE } });
  });

  app.post("/api/leads/profile", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const schema = z.object({
      companyIntro: z.string().max(4000).optional().default(""),
      businessDesc: z.string().max(4000).optional().default(""),
      customerProfile: z.string().max(4000).optional().default("")
    });
    const body = schema.parse(req.body ?? {});
    await saveLeadSearchProfile(db, tenantId, {
      companyIntro: body.companyIntro,
      businessDesc: body.businessDesc,
      customerProfile: body.customerProfile
    });
    return res.json({ ok: true });
  });

  /* 业务画像：AI 分析（桌宠大模型，无状态，聊天历史前端维护） */
  app.post("/api/leads/profile/analyze", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    // 前端把当前表单值直接传过来；body 里没有才 fallback 查已保存的画像
    const schema = z.object({
      intro: z.string().max(4000).optional().default(""),
      business: z.string().max(4000).optional().default(""),
      audience: z.string().max(4000).optional().default(""),
      question: z.string().max(2000).optional().default("")
    });
    const body = schema.parse(req.body ?? {});
    let profile = {
      companyIntro: String(body.intro || ""),
      businessDesc: String(body.business || ""),
      customerProfile: String(body.audience || "")
    };
    if (!profile.companyIntro && !profile.businessDesc && !profile.customerProfile) {
      const saved = await getLeadSearchProfile(db, tenantId);
      if (saved) profile = saved;
    }
    const out = await analyzeProfileWithPet(db, tenantId, profile, body.question || undefined);
    return res.json(out);
  });

  app.post("/api/leads/search-task/single", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const schema = z.object({
      domain: z.string().min(3).max(256),
      titles: z.string().max(512).optional().default("CEO, Founder"),
      roleTiers: z.array(z.string().max(32)).max(16).optional(),
      verifyEmail: z.boolean().optional().default(true),
      syncCrm: z.boolean().optional().default(true)
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ ok: false, message: "请输入官网或域名" });
    const body = parsed.data;
    const out = await startSingleCompanyTask(db, env, tenantId, {
      domain: body.domain,
      titles: body.titles,
      roleTiers: body.roleTiers,
      fields: { companyName: true, website: true, address: true, mainBusiness: true, phone: true, email: true, titles: true },
      verifyEmail: body.verifyEmail,
      syncCrm: body.syncCrm
    });
    return res.json(out);
  });

  app.post("/api/leads/related-keywords", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const schema = z.object({
      industry: z.string().max(256).optional().default(""),
      keywords: z.string().max(512).optional().default(""),
      country: z.string().max(128).optional().default("")
    });
    const body = schema.parse(req.body ?? {});
    const settings = await loadAutoSettings(db, tenantId, env);
    const out = await suggestRelatedKeywords(settings, body);
    return res.json({ ok: true, ...out });
  });

  app.post("/api/leads/search-task/continue", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const schema = z.object({
      jobId: z.coerce.number().int().positive(),
      pickLimit: z.coerce.number().int().min(1).max(400).optional().default(10),
      pickAll: z.boolean().optional().default(false),
      onlyUndug: z.boolean().optional().default(true),
      domains: z.array(z.string().max(256)).max(400).optional(),
      verifyEmail: z.boolean().optional(),
      syncCrm: z.boolean().optional()
    });
    const body = schema.parse(req.body ?? {});
    const out = await continueLeadSearchTask(db, env, tenantId, body.jobId, body.pickLimit, {
      pickAll: body.pickAll,
      onlyUndug: body.onlyUndug,
      domains: body.domains,
      verifyEmail: body.verifyEmail,
      syncCrm: body.syncCrm
    });
    return res.json(out);
  });

  app.post("/api/leads/search-task/continue-discover", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = Number((req.body ?? {}).jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return res.status(400).json({ ok: false, message: "缺少 jobId" });
    const out = await continueDiscoverTask(db, env, tenantId, jobId);
    return res.json(out);
  });

  app.post("/api/leads/search-task/resume", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = Number((req.body ?? {}).jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return res.status(400).json({ ok: false, message: "缺少 jobId" });
    const out = await resumeLeadSearchTask(db, env, tenantId, jobId);
    return res.json(out);
  });

  app.post("/api/leads/search-task/remove-companies", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const body = (req.body ?? {}) as { jobId?: unknown; domains?: unknown };
    const jobId = Number(body.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return res.status(400).json({ ok: false, message: "缺少 jobId" });
    const out = await removeCompaniesFromTask(db, tenantId, jobId, body.domains as string[]);
    return res.json(out);
  });

  app.post("/api/leads/search-task/grade-missing", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = Number((req.body ?? {}).jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return res.status(400).json({ ok: false, message: "缺少 jobId" });
    const out = await gradeMissingGrades(db, env, tenantId, jobId);
    return res.json(out);
  });

  app.get("/api/leads/search-task", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const mode = req.query.mode === "single" ? "single" : req.query.mode === "industry" ? "industry" : undefined;
    const status = await getLeadSearchTask(db, tenantId, Number.isFinite(jobId) ? jobId : undefined, mode);
    return res.json({ ok: true, ...status });
  });

  app.post("/api/leads/search-task/stop", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = Number((req.body ?? {}).jobId);
    await stopLeadSearchTask(db, tenantId, Number.isFinite(jobId) && jobId > 0 ? jobId : undefined);
    return res.json({ ok: true });
  });

  app.get("/api/leads/search-task/:id/csv", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const csv = await getLeadSearchCsv(db, tenantId, Number(req.params.id));
    if (!csv) return res.status(404).json({ ok: false, message: "CSV 尚未生成" });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads-search-${req.params.id}.csv"`);
    return res.send(csv);
  });

  app.get("/api/leads/industries", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT TRIM(name) AS industry
           FROM leads_industry_catalog
          WHERE (tenant_id = ? OR tenant_id = 1) AND TRIM(name) <> ''
          ORDER BY industry ASC
          LIMIT 500`,
        [tenantId]
      );
      return res.json({
        ok: true,
        items: (rows as any[]).map((r) => String(r.industry ?? "")).filter(Boolean)
      });
    } catch {
      return res.json({ ok: true, items: [] });
    }
  });

  app.post("/api/leads/search", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });

      const schema = z.object({
        keywords: z.string().max(512).default(""),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        requireEmail: z.boolean().default(false),
        continent: z.string().max(64).optional().default(""),
        country: z.string().max(8).optional().default(""),
        countryNameEn: z.string().max(128).optional().default(""),
        province: z.string().max(128).optional().default(""),
        provinceNameEn: z.string().max(128).optional().default(""),
        city: z.string().max(128).optional().default(""),
        industry: z.string().max(256).optional().default(""),
        titles: z.string().max(512).optional().default(""),
        enrich: z.boolean().default(true),
        verifyEmail: z.boolean().default(true)
      });
      const body = schema.parse(req.body ?? {});

      const settings = await loadAutoSettings(db, tenantId, env);
      try {
        await enforceQuota(db, tenantId, "leads", 1);
      } catch {
        /* 独立站可能无套餐额度表，不拦截调研 */
      }

      const found = await discoverLeadsWithKimi({
        apiKey: settings.apiKey,
        baseUrl: settings.apiBaseUrl,
        model: settings.apiModel,
        want: body.limit,
        countryName: body.countryNameEn || body.country,
        city: body.city,
        industry: body.industry,
        keywords: body.keywords,
        titles: body.titles
      });
      let items: ApolloLeadRow[] = found.map((c) => ({
        id: c.domain,
        company_name: c.name,
        website: c.website,
        contact_name: c.contactName || null,
        title: c.title || null,
        phone: null,
        email: c.email || null,
        address: null,
        city: c.city || body.city || null,
        state: body.province || null,
        country: c.country || body.countryNameEn || body.country || null,
        industry: c.mainBusiness || body.industry || null,
        linkedin: null,
        email_status: c.email ? "unverified" : "none",
        source: "web"
      }));
      if (body.requireEmail) items = items.filter((x) => Boolean(x.email?.trim()));

      await upsertLeads(
        db,
        tenantId,
        items.map((x) => ({
          companyName: x.company_name,
          website: x.website,
          country: x.country || body.country || null,
          state: x.state || body.province || null,
          city: x.city || body.city || null,
          industry: x.industry || body.industry || null,
          contactName: x.contact_name,
          title: x.title,
          phone: x.phone,
          address: x.address,
          email: x.email,
          source: "web",
          searchQuery: [body.keywords, body.industry].filter(Boolean).join(" | ") || null
        }))
      );

      try {
        await recordUsage(db, {
          tenantId,
          module: "leads",
          action: "search_web",
          units: Math.max(1, items.length),
          meta: { count: items.length, country: body.country, industry: body.industry }
        });
      } catch {
        /* ignore */
      }

      return res.json({
        ok: true,
        items,
        source: "web",
        creditsConsumed: 0,
        enriched: 0,
        hunterVerified: false
      });
    } catch (e: any) {
      if (e?.name === "ZodError" || e?.issues) {
        return res.status(400).json({ ok: false, message: "请求参数无效", details: e?.issues });
      }
      return res.status(502).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.post("/api/leads/export-csv", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });

      const rowSchema = z.object({
        company_name: z.string().optional().nullable(),
        contact_name: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        website: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        industry: z.string().optional().nullable(),
        email_status: z.string().optional().nullable(),
        source: z.string().optional().nullable()
      });
      const schema = z.object({
        rows: z.array(rowSchema).min(1).max(500),
        filter: z.record(z.unknown()).optional()
      });
      const body = schema.parse(req.body ?? {});

      await ensureExportTable(db);
      const csvRows = body.rows.map((r) =>
        leadToCsvRow({
          id: "",
          company_name: r.company_name ?? "",
          contact_name: r.contact_name ?? null,
          title: r.title ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          website: r.website ?? null,
          address: r.address ?? null,
          city: r.city ?? null,
          state: r.state ?? null,
          country: r.country ?? null,
          industry: r.industry ?? null,
          linkedin: null,
          email_status: (r.email_status as any) || "none",
          source: (r.source as "apollo") || "kimi"
        })
      );
      const csv = buildCsv(csvRows);
      const filename = `leads-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

      const [ins] = await db.query(
        `INSERT INTO leads_export_jobs (tenant_id, filename, row_count, filter_json, csv_text)
         VALUES (?, ?, ?, CAST(? AS JSON), ?)`,
        [tenantId, filename, csvRows.length, JSON.stringify(body.filter ?? null), csv]
      );
      const id = Number((ins as any).insertId ?? 0);

      await recordUsage(db, {
        tenantId,
        module: "leads",
        action: "export_csv",
        units: csvRows.length,
        refId: String(id),
        meta: { filename, rowCount: csvRows.length }
      });

      return res.json({ ok: true, id, filename, rowCount: csvRows.length, csv });
    } catch (e: any) {
      if (e?.name === "ZodError" || e?.issues) {
        return res.status(400).json({ ok: false, message: "请求参数无效", details: e?.issues });
      }
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.get("/api/leads/exports", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      await ensureExportTable(db);
      const [rows] = await db.query(
        `SELECT id, filename, row_count AS rowCount, filter_json AS filterJson, created_at AS createdAt
           FROM leads_export_jobs
          WHERE tenant_id = ?
          ORDER BY id DESC
          LIMIT 100`,
        [tenantId]
      );
      return res.json({ ok: true, items: rows });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.get("/api/leads/exports/:id/download", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, message: "无效 id" });
    try {
      await ensureExportTable(db);
      const [rows] = await db.query(
        `SELECT filename, csv_text AS csvText FROM leads_export_jobs WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [id, tenantId]
      );
      const row = (rows as any[])[0];
      if (!row) return res.status(404).json({ ok: false, message: "导出记录不存在" });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${String(row.filename).replace(/"/g, "")}"`);
      return res.send(row.csvText);
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.get("/api/leads/usage", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const [sumRows] = await db.query(
        `SELECT action, COALESCE(SUM(units), 0) AS units, COUNT(*) AS events
           FROM usage_events
          WHERE tenant_id = ?
            AND module = 'leads'
            AND DATE_FORMAT(occurred_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
          GROUP BY action`,
        [tenantId]
      );
      const [recent] = await db.query(
        `SELECT id, action, units, meta_json AS metaJson, occurred_at AS occurredAt
           FROM usage_events
          WHERE tenant_id = ? AND module = 'leads'
          ORDER BY id DESC
          LIMIT 50`,
        [tenantId]
      );
      const byAction: Record<string, { units: number; events: number }> = {};
      let monthUnits = 0;
      for (const r of sumRows as any[]) {
        const units = Number(r.units ?? 0);
        byAction[String(r.action)] = { units, events: Number(r.events ?? 0) };
        monthUnits += units;
      }
      return res.json({
        ok: true,
        monthUnits,
        byAction,
        recent,
        kimiConfigured: Boolean((await loadAutoSettings(db, tenantId, env)).apiKey),
        apolloConfigured: false,
        hunterConfigured: false
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    }
  });
}
