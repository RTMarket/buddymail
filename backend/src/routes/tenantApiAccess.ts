import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { requireRole, resolveTenantId } from "../middleware/auth.js";
import {
  createTenantApiKey,
  listTenantApiKeys,
  revokeTenantApiKey
} from "../services/tenantApiKeys.js";
import {
  createTenantWebhookEndpoint,
  deleteTenantWebhookEndpoint,
  listTenantWebhookEndpoints,
  updateTenantWebhookEndpoint
} from "../services/tenantWebhooks.js";

const webhookEventSchema = z.enum([
  "email.send.completed",
  "email.send.daily_limit_reached",
  "email.campaign.stopped"
]);

export function registerTenantApiAccessRoutes(app: Express, ctx: { db: Pool }) {
  const tenantAdmin = requireRole("tenant_admin", "super_admin");

  app.get("/api/tenant/api-keys", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const keys = await listTenantApiKeys(ctx.db, tenantId);
      return res.json({ ok: true, keys });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/tenant/api-keys", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const body = z
        .object({
          name: z.string().trim().min(1).max(120),
          scopes: z.array(z.string().trim().min(1).max(80)).max(20).optional()
        })
        .parse(req.body ?? {});
      const created = await createTenantApiKey(ctx.db, tenantId, body);
      return res.json({ ok: true, key: created.record, secret: created.secret });
    } catch (e) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/tenant/api-keys/:id", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const ok = await revokeTenantApiKey(ctx.db, tenantId, id);
      return res.json({ ok, revoked: ok });
    } catch (e) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/tenant/webhooks", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const endpoints = await listTenantWebhookEndpoints(ctx.db, tenantId);
      return res.json({ ok: true, endpoints });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/tenant/webhooks", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const body = z
        .object({
          url: z.string().url().max(1000),
          events: z.array(webhookEventSchema).max(10).optional(),
          enabled: z.boolean().optional()
        })
        .parse(req.body ?? {});
      const created = await createTenantWebhookEndpoint(ctx.db, tenantId, body);
      return res.json({ ok: true, endpoint: created.endpoint, secret: created.secret });
    } catch (e) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.patch("/api/tenant/webhooks/:id", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const body = z
        .object({
          url: z.string().url().max(1000).optional(),
          events: z.array(webhookEventSchema).max(10).optional(),
          enabled: z.boolean().optional()
        })
        .parse(req.body ?? {});
      const endpoint = await updateTenantWebhookEndpoint(ctx.db, tenantId, id, body);
      if (!endpoint) return res.status(404).json({ ok: false, message: "Webhook 不存在" });
      return res.json({ ok: true, endpoint });
    } catch (e) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/tenant/webhooks/:id", tenantAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const ok = await deleteTenantWebhookEndpoint(ctx.db, tenantId, id);
      return res.json({ ok, deleted: ok });
    } catch (e) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
}
