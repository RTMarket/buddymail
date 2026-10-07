/**
 * Lead Finder 网页代理 + 调研完成后写入 CRM/总库。
 * 不含 auto 定时任务（避免瘦镜像缺文件无法启动）。
 */
import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { resolveTenantId } from "../middleware/auth.js";
import { ingestLeadFinderResearch } from "../services/leadFinderResearchIngest.js";

const DEFAULT_UPSTREAM = process.env.LEAD_FINDER_UPSTREAM_URL || "";
const INSTALL_RE = /^LFI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const PROXY_PATHS = [
  "scrape",
  "discover-lane",
  "ai-enrich",
  "leads-sync",
  "verify",
  "guess-verify",
  "guess-verify-batch"
] as const;

type ProxyPath = (typeof PROXY_PATHS)[number];

function upstreamBase(_env: Env): string {
  return String(process.env.LEAD_FINDER_UPSTREAM_URL || DEFAULT_UPSTREAM)
    .trim()
    .replace(/\/+$/, "");
}

function resolveInstallId(_env: Env, body: Record<string, unknown>): string {
  const fromEnv = String(process.env.LEAD_FINDER_INSTALL_ID || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (INSTALL_RE.test(fromEnv)) return fromEnv;
  const fromBody = String(body.installId || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (INSTALL_RE.test(fromBody)) return fromBody;
  return "";
}

async function forwardPublicDomainFinder(
  env: Env,
  db: Pool,
  path: ProxyPath,
  req: Request,
  res: Response,
  timeoutMs: number
) {
  const tenantId = resolveTenantId(req);
  if (tenantId <= 0) {
    return res.status(401).json({ ok: false, message: "未登录" });
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? ({ ...(req.body as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const installId = resolveInstallId(env, body);
  if (!installId) {
    return res.status(500).json({
      ok: false,
      message:
        "独立站未配置合法 Lead Finder 插件编号（LEAD_FINDER_INSTALL_ID=LFI-XXXX-XXXX-XXXX）。请联系运维写入 .env 后重启 backend。"
    });
  }
  body.installId = installId;

  const base = upstreamBase(env);
  const url = `${base}/api/public/domain-finder/${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-BSS-Standalone-Tenant": String(tenantId)
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await upstream.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({
        ok: false,
        message: `主站 Lead Finder 返回非 JSON（HTTP ${upstream.status}）`
      });
    }
    if (
      path === "leads-sync" &&
      upstream.ok &&
      data &&
      typeof data === "object" &&
      (data as { ok?: boolean }).ok !== false
    ) {
      try {
        const r = await ingestLeadFinderResearch(db, tenantId, body, data as Record<string, unknown>);
        console.warn("[lead-finder-ingest]", { crm: r.crm, warehouse: r.warehouse, domain: body.domain });
      } catch (e) {
        console.warn("[lead-finder-ingest]", e);
      }
    }
    return res.status(upstream.status).json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = /abort/i.test(msg);
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      message: aborted
        ? "Lead Finder 上游超时，请稍后重试"
        : `无法连接主站 Lead Finder：${msg}`
    });
  } finally {
    clearTimeout(timer);
  }
}

export function registerStandaloneLeadFinderCore(app: Express, ctx: { db: Pool; env: Env }) {
  const { env, db } = ctx;

  app.get("/api/standalone/lead-finder/capability", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(401).json({ ok: false, message: "未登录" });
    }
    const installConfigured = INSTALL_RE.test(
      String(process.env.LEAD_FINDER_INSTALL_ID || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
    );
    return res.json({
      ok: true,
      upstream: upstreamBase(env),
      installConfigured,
      message: installConfigured
        ? "网页版经本机代理调用主站 Lead Finder（搜人 / 验邮 / 线索库）。AI Key 请在「自动化任务 → AI 大脑」配置。"
        : "尚未配置 LEAD_FINDER_INSTALL_ID，搜索会失败。请运维在独立站 .env 写入 LFI-XXXX-XXXX-XXXX 并在主站开通授权。"
    });
  });

  const timeoutFor = (path: ProxyPath): number => {
    if (path === "scrape") return 180_000;
    if (path === "discover-lane") return 200_000;
    if (path === "ai-enrich") return 120_000;
    if (path === "guess-verify-batch" || path === "guess-verify") return 90_000;
    return 45_000;
  };

  for (const path of PROXY_PATHS) {
    app.post(`/api/standalone/lead-finder/${path}`, async (req, res) => {
      await forwardPublicDomainFinder(env, db, path, req, res, timeoutFor(path));
    });
  }
}
