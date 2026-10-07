import type { Express } from "express";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import { resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };

/** 含汉字等：≤30 字；纯英文等：≤120 词 */
export function validateContactGroupName(name: string): { ok: true } | { ok: false; message: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "分组名称不能为空" };
  const hasCjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u9fff\uf900-\ufaff]/.test(trimmed);
  if (hasCjk) {
    const n = [...trimmed].length;
    if (n > 30) return { ok: false, message: "含中文时分组名称请控制在 30 个字以内" };
  } else {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 120) return { ok: false, message: "纯英文分组名称请控制在 120 个单词以内" };
  }
  return { ok: true };
}

function insertIdToNumber(insertId: unknown): number {
  if (typeof insertId === "bigint") return Number(insertId);
  if (typeof insertId === "number" && Number.isFinite(insertId)) return insertId;
  const n = Number(insertId);
  return Number.isFinite(n) ? n : 0;
}

export function registerContactGroupRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  app.get("/api/email/contact-groups", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(
      `SELECT cg.id, cg.name, cg.created_at, cg.updated_at,
        (SELECT COUNT(*) FROM email_contact_groups ecg WHERE ecg.group_id = cg.id) AS contact_count
       FROM contact_groups cg
       WHERE cg.tenant_id = ?
       ORDER BY cg.id DESC LIMIT 500`
      ,
      [tenantId]
    );
    // BIGINT 等字段在部分 mysql2 配置下可能无法被 JSON 序列化；统一转成可序列化形状
    const items = (
      rows as {
        id: unknown;
        name: unknown;
        created_at?: unknown;
        updated_at?: unknown;
        contact_count?: unknown;
      }[]
    ).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      contact_count: Number(r.contact_count ?? 0),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
    res.json({ ok: true, items });
  });

  app.post("/api/email/contact-groups", async (req, res, next) => {
    try {
      const tenantId = resolveTenantId(req);
      const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "请填写分组名称" });
      }
      const v = validateContactGroupName(parsed.data.name);
      if (!v.ok) return res.status(400).json({ ok: false, message: v.message });

      const [result] = await db.query(`INSERT INTO contact_groups (tenant_id, name) VALUES (?, ?)`, [
        tenantId,
        parsed.data.name.trim()
      ]);
      const id = insertIdToNumber((result as { insertId?: unknown }).insertId);
      // BigInt 等不可被 JSON.stringify，必须转成 number
      res.json({ ok: true, id });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (String(err?.code) === "ER_DUP_ENTRY") {
        return res.status(400).json({ ok: false, message: "已存在同名分组" });
      }
      next(e);
    }
  });

  app.put("/api/email/contact-groups/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const v = validateContactGroupName(body.name);
    if (!v.ok) return res.status(400).json({ ok: false, message: v.message });

    try {
      const [result] = await db.query(`UPDATE contact_groups SET name = ? WHERE id = ? AND tenant_id = ?`, [
        body.name.trim(),
        id,
        tenantId
      ]);
      res.json({ ok: true, affected: (result as any).affectedRows });
    } catch (e: any) {
      if (String(e?.code) === "ER_DUP_ENTRY") {
        return res.status(400).json({ ok: false, message: "已存在同名分组" });
      }
      throw e;
    }
  });

  app.delete("/api/email/contact-groups/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await db.query(`DELETE FROM contact_groups WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    res.json({ ok: true, affected: (result as any).affectedRows });
  });
}
