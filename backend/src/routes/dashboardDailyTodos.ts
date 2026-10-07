import type { Express } from "express";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { requireAuth, resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_LEN = 50;

function normalizeBody(raw: string): string {
  const s = raw.replace(/\r\n/g, "\n").trim();
  const arr = [...s];
  return arr.length > MAX_BODY_LEN ? arr.slice(0, MAX_BODY_LEN).join("") : s;
}

export function registerDashboardDailyTodosRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;
  const auth = requireAuth(ctx.db);

  app.get("/api/me/dashboard-daily-todos", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const q = z
      .object({
        forDate: z
          .string()
          .regex(DATE_RE)
          .optional()
      })
      .parse(req.query);
    const forDate = q.forDate ?? new Date().toISOString().slice(0, 10);
    try {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, body, is_done, created_at, updated_at
           FROM user_dashboard_daily_todos
          WHERE tenant_id = ? AND user_id = ? AND for_date = ?
          ORDER BY id ASC`,
        [tenantId, userId, forDate]
      );
      return res.json({
        ok: true,
        forDate,
        items: rows.map((r) => ({
          id: Number(r.id),
          body: String(r.body ?? ""),
          isDone: Boolean(Number(r.is_done)),
          createdAt: r.created_at ? String(r.created_at) : null,
          updatedAt: r.updated_at ? String(r.updated_at) : null
        }))
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("user_dashboard_daily_todos")) {
        return res.status(503).json({
          ok: false,
          message: "请在数据库执行迁移 sql/031_user_dashboard_daily_todos.sql 后重试。"
        });
      }
      throw e;
    }
  });

  app.post("/api/me/dashboard-daily-todos", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const body = z
      .object({
        forDate: z.string().regex(DATE_RE).optional(),
        text: z.string().max(500).optional().default("")
      })
      .parse(req.body ?? {});
    const forDate = body.forDate ?? new Date().toISOString().slice(0, 10);
    const text = normalizeBody(body.text ?? "");
    try {
      const [r] = await db.query(
        `INSERT INTO user_dashboard_daily_todos (tenant_id, user_id, for_date, body, is_done)
         VALUES (?, ?, ?, ?, 0)`,
        [tenantId, userId, forDate, text]
      );
      const insertId = Number((r as { insertId?: number }).insertId ?? 0);
      return res.json({ ok: true, id: insertId });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("user_dashboard_daily_todos")) {
        return res.status(503).json({
          ok: false,
          message: "请在数据库执行迁移 sql/031_user_dashboard_daily_todos.sql 后重试。"
        });
      }
      throw e;
    }
  });

  app.patch("/api/me/dashboard-daily-todos/:id", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "无效的 id" });
    }
    const patch = z
      .object({
        text: z.string().max(500).optional(),
        isDone: z.boolean().optional()
      })
      .parse(req.body ?? {});
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.text !== undefined) {
      sets.push(`body = ?`);
      params.push(normalizeBody(patch.text));
    }
    if (patch.isDone !== undefined) {
      sets.push(`is_done = ?`);
      params.push(patch.isDone ? 1 : 0);
    }
    if (!sets.length) {
      return res.status(400).json({ ok: false, message: "无更新字段" });
    }
    params.push(tenantId, userId, id);
    try {
      const [result] = await db.query(
        `UPDATE user_dashboard_daily_todos SET ${sets.join(", ")} WHERE tenant_id = ? AND user_id = ? AND id = ?`,
        params
      );
      const affected = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      if (!affected) {
        return res.status(404).json({ ok: false, message: "事项不存在" });
      }
      return res.json({ ok: true });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("user_dashboard_daily_todos")) {
        return res.status(503).json({
          ok: false,
          message: "请在数据库执行迁移 sql/031_user_dashboard_daily_todos.sql 后重试。"
        });
      }
      throw e;
    }
  });

  app.post("/api/me/dashboard-daily-todos/bulk-delete", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const { ids } = z.object({ ids: z.array(z.coerce.number().int().positive()).max(200) }).parse(req.body ?? {});
    if (!ids.length) {
      return res.json({ ok: true, deleted: 0 });
    }
    const placeholders = ids.map(() => "?").join(",");
    try {
      const [result] = await db.query(
        `DELETE FROM user_dashboard_daily_todos WHERE tenant_id = ? AND user_id = ? AND id IN (${placeholders})`,
        [tenantId, userId, ...ids]
      );
      const deleted = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      return res.json({ ok: true, deleted });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("user_dashboard_daily_todos")) {
        return res.status(503).json({
          ok: false,
          message: "请在数据库执行迁移 sql/031_user_dashboard_daily_todos.sql 后重试。"
        });
      }
      throw e;
    }
  });
}
