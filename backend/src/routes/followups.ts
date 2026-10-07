import type { Express } from "express";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import { resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };

const followKindSchema = z.enum(["short", "long"]);
const stageSchema = z.enum(["none", "contacted", "awaiting_reply", "quoted", "nurturing", "paused"]);

const createBody = z.object({
  contactId: z.coerce.number().int().positive(),
  followKind: followKindSchema.default("short"),
  stage: stageSchema.default("none"),
  nextFollowupAt: z.string().optional().nullable(),
  lastNote: z.string().max(4000).optional().nullable()
});

const patchBody = z.object({
  followKind: followKindSchema.optional(),
  stage: stageSchema.optional(),
  nextFollowupAt: z.union([z.string(), z.null()]).optional(),
  lastNote: z.union([z.string().max(4000), z.null()]).optional()
});

function normalizeDate(s: string | null | undefined): string | null {
  if (s == null || String(s).trim() === "") return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function registerFollowupRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  app.get("/api/email/followups/stats", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN next_followup_at IS NOT NULL AND next_followup_at < CURDATE() THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN next_followup_at = CURDATE() THEN 1 ELSE 0 END) AS today_due,
        SUM(CASE
          WHEN next_followup_at IS NOT NULL
            AND next_followup_at > CURDATE()
            AND next_followup_at <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          THEN 1 ELSE 0 END) AS week_ahead
       FROM crm_contact_followups
       WHERE tenant_id = ?`,
      [tenantId]
    );
    const r = (rows as Record<string, unknown>[])[0] ?? {};
    res.json({
      ok: true,
      total: Number(r.total ?? 0),
      overdue: Number(r.overdue ?? 0),
      todayDue: Number(r.today_due ?? 0),
      weekAhead: Number(r.week_ahead ?? 0)
    });
  });

  app.get("/api/email/followups", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const kind = typeof req.query.kind === "string" ? req.query.kind : "";
    const stage = typeof req.query.stage === "string" ? req.query.stage : "";
    const due = typeof req.query.due === "string" ? req.query.due : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: string[] = ["f.tenant_id = ?", "c.tenant_id = ?"];
    const params: unknown[] = [tenantId, tenantId];

    if (kind === "short" || kind === "long") {
      where.push(`f.follow_kind = ?`);
      params.push(kind);
    }
    if (stage && stage !== "all") {
      where.push(`f.stage = ?`);
      params.push(stage);
    }
    if (due === "overdue") {
      where.push(`f.next_followup_at IS NOT NULL AND f.next_followup_at < CURDATE()`);
    } else if (due === "today") {
      where.push(`f.next_followup_at = CURDATE()`);
    } else if (due === "week") {
      where.push(
        `f.next_followup_at IS NOT NULL AND f.next_followup_at > CURDATE() AND f.next_followup_at <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
      );
    }
    if (q) {
      where.push(
        `(c.email LIKE ? OR c.company LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR f.last_note LIKE ?)`
      );
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql =
      `SELECT f.id, f.contact_id, f.follow_kind, f.stage, f.next_followup_at, f.last_note, f.owner_user_id,
        f.created_at, f.updated_at,
        c.email, c.first_name, c.last_name, c.company, c.phone, c.job_title,
        (SELECT GROUP_CONCAT(cg.name ORDER BY cg.name SEPARATOR '、')
         FROM email_contact_groups ecgf
         JOIN contact_groups cg ON cg.id = ecgf.group_id
         WHERE ecgf.contact_id = c.id AND ecgf.tenant_id = ? AND cg.tenant_id = ?) AS group_labels
       FROM crm_contact_followups f
       INNER JOIN email_contacts c ON c.id = f.contact_id
       ${whereSql}
       ORDER BY
         CASE WHEN f.next_followup_at IS NULL THEN 1 ELSE 0 END ASC,
         f.next_followup_at ASC,
         f.id DESC`;

    const [rows] = await db.query(sql, [tenantId, tenantId, ...params]);
    res.json({ ok: true, items: rows });
  });

  app.post("/api/email/followups", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = createBody.parse(req.body);
    const nextAt = normalizeDate(body.nextFollowupAt ?? undefined);
    try {
      const [result] = await db.query(
        `INSERT INTO crm_contact_followups (tenant_id, contact_id, follow_kind, stage, next_followup_at, last_note, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [
          tenantId,
          body.contactId,
          body.followKind,
          body.stage,
          nextAt,
          body.lastNote?.trim() || null
        ]
      );
      const insertId = Number((result as { insertId?: unknown }).insertId);
      res.json({ ok: true, id: insertId });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (String(err?.code) === "ER_DUP_ENTRY") {
        return res.status(409).json({ ok: false, message: "该联系人已在跟进列表中" });
      }
      if (String(err?.code) === "ER_NO_REFERENCED_ROW_2" || String(err?.code) === "1452") {
        return res.status(400).json({ ok: false, message: "联系人不存在，请先在 CRM 数据库中创建" });
      }
      throw e;
    }
  });

  app.patch("/api/email/followups/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = patchBody.parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.followKind != null) {
      sets.push(`follow_kind = ?`);
      params.push(body.followKind);
    }
    if (body.stage != null) {
      sets.push(`stage = ?`);
      params.push(body.stage);
    }
    if (body.nextFollowupAt !== undefined) {
      sets.push(`next_followup_at = ?`);
      params.push(normalizeDate(body.nextFollowupAt ?? undefined));
    }
    if (body.lastNote !== undefined) {
      sets.push(`last_note = ?`);
      params.push(body.lastNote == null ? null : String(body.lastNote).trim() || null);
    }
    if (sets.length === 0) {
      return res.status(400).json({ ok: false, message: "无更新字段" });
    }
    params.push(id, tenantId);
    const [result] = await db.query(
      `UPDATE crm_contact_followups SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params
    );
    const affected = Number((result as { affectedRows?: unknown }).affectedRows ?? 0);
    if (affected === 0) return res.status(404).json({ ok: false, message: "记录不存在" });
    res.json({ ok: true });
  });

  app.delete("/api/email/followups/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await db.query(`DELETE FROM crm_contact_followups WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    const affected = Number((result as { affectedRows?: unknown }).affectedRows ?? 0);
    if (affected === 0) return res.status(404).json({ ok: false, message: "记录不存在" });
    res.json({ ok: true });
  });
}
