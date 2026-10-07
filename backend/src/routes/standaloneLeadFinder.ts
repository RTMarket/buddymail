/**
 * 独立站 · Lead Finder 网页版代理 + 自动任务
 * 搜索/CSV 前端冻结；CRM/总库入库在 Core 的 leads-sync 之后。
 */
import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { resolveTenantId } from "../middleware/auth.js";
import {
  getAutoStatus,
  getJobCsv,
  loadAutoSettings,
  publicSettings,
  saveAutoSettings,
  startAutoJob,
  stopAutoJob
} from "../services/leadFinderAutoRunner.js";
import { registerStandaloneLeadFinderCore } from "./standaloneLeadFinderCore.js";

export function registerStandaloneLeadFinderRoutes(app: Express, ctx: { db: Pool; env: Env }) {
  const { env, db } = ctx;
  registerStandaloneLeadFinderCore(app, ctx);

  app.get("/api/standalone/lead-finder/auto/settings", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const s = await loadAutoSettings(db, tenantId, env);
    return res.json({ ok: true, settings: publicSettings(s) });
  });

  app.put("/api/standalone/lead-finder/auto/settings", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const body = (req.body || {}) as Record<string, unknown>;
    const countries = Array.isArray(body.countries)
      ? body.countries.map((x) => String(x).toUpperCase())
      : undefined;
    await saveAutoSettings(db, tenantId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      countries,
      dailyQuota: body.dailyQuota != null ? Number(body.dailyQuota) : undefined,
      runHour: body.runHour != null ? Number(body.runHour) : undefined
    });
    const s = await loadAutoSettings(db, tenantId, env);
    return res.json({ ok: true, settings: publicSettings(s) });
  });

  app.get("/api/standalone/lead-finder/auto/status", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const status = await getAutoStatus(db, tenantId);
    return res.json({ ok: true, ...status });
  });

  app.post("/api/standalone/lead-finder/auto/start", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = await startAutoJob(db, env, tenantId, true);
    return res.json({ ok: true, jobId });
  });

  app.post("/api/standalone/lead-finder/auto/stop", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    await stopAutoJob(db, tenantId);
    return res.json({ ok: true });
  });

  app.get("/api/standalone/lead-finder/auto/jobs/:id/csv", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const jobId = Number(req.params.id);
    const csv = await getJobCsv(db, tenantId, jobId);
    if (!csv) return res.status(404).json({ ok: false, message: "CSV 尚未生成" });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lead-finder-auto-${jobId}.csv"`);
    return res.send(csv);
  });
}
