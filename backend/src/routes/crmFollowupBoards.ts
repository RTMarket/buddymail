import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import { resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };

const categorySchema = z.string().min(1).max(50);
const stageSchema = z.enum(["cold", "intent", "deal", "won"]);

// ---- 公司 ----
const createCompanyBody = z.object({
  category: categorySchema,
  company: z.string().min(1).max(200),
  tag: z.string().max(100).optional().default(""),
  website: z.string().max(300).optional().default(""),
  companyIntro: z.string().max(5000).optional().default(""),
  owner: z.string().max(50).optional().default(""),
  stage: stageSchema.optional().default("cold"),
  nextFollowupAt: z.string().optional().nullable(),
  note: z.string().max(5000).optional().default(""),
});

const updateCompanyBody = z.object({
  company: z.string().min(1).max(200).optional(),
  tag: z.string().max(100).optional(),
  website: z.string().max(300).optional(),
  companyIntro: z.string().max(5000).optional(),
  owner: z.string().max(50).optional(),
  nextFollowupAt: z.union([z.string(), z.null()]).optional(),
});

// ---- 联系人 ----
const createContactBody = z.object({
  name: z.string().min(1).max(100),
  position: z.string().max(100).optional().default(""),
  email: z.string().max(200).optional().default(""),
  phone: z.string().max(50).optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

const updateContactBody = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.string().max(100).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  isPrimary: z.boolean().optional(),
  status: z.enum(["active", "rejected", "won"]).optional(),
});

// ---- 跟进记录 ----
const createRecordBody = z.object({
  followupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actionType: z.string().max(50).optional().default(""),
  content: z.string().min(1).max(10000),
  owner: z.string().max(50).optional().default(""),
  hasReply: z.boolean().optional().default(false),
});

function toDateTime(s: string | null | undefined): string | null {
  if (s == null || String(s).trim() === "") return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t} 09:00:00`;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function okId(id: number, res: Response) {
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id 非法" });
    return false;
  }
  return true;
}

// 联系人同步到 CRM 数据库（email_contacts），有邮箱才同步，已存在不重复
async function syncContactToCrm(
  db: Pool,
  tenantId: number,
  followupId: number,
  name: string,
  position: string,
  email: string,
  phone: string
): Promise<void> {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) return;
  // 查公司名
  const [companyRows] = await db.query(
    `SELECT company, website FROM bigsocialboss.crm_followups WHERE id = ?`,
    [followupId]
  );
  const company = (companyRows as { company?: string; website?: string }[])[0];
  // 已存在则不重复
  const [exists] = await db.query(
    `SELECT id FROM bigsocialboss.email_contacts WHERE tenant_id = ? AND LOWER(email) = ? LIMIT 1`,
    [tenantId, cleanEmail]
  );
  if ((exists as unknown[]).length > 0) return;
  await db.query(
    `INSERT INTO bigsocialboss.email_contacts
       (email, first_name, company, job_title, phone, website, email_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, NOW(), NOW())`,
    [
      cleanEmail,
      (name ?? "").trim(),
      (company?.company ?? "").trim(),
      (position ?? "").trim(),
      (phone ?? "").trim(),
      (company?.website ?? "").trim(),
      tenantId,
    ]
  );
}

export function registerCrmFollowupBoards(app: Express, ctx: Ctx) {
  // ===== 公司列表（按板块+阶段，带主联系人）=====
  app.get("/api/crm/followup-boards", async (req: Request, res: Response) => {
    try {
      const category = String(req.query.category ?? "");
      if (!category) {
        return res.status(400).json({ ok: false, message: "category 非法" });
      }
      const stage = String(req.query.stage ?? "");
      const page = Math.max(1, Number(req.query.page ?? 1) || 1);
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize ?? 10) || 10));
      const offset = (page - 1) * pageSize;

      const where = ["f.category = ?"];
      const vals: unknown[] = [category];
      if (["cold", "intent", "deal", "won"].includes(stage)) {
        where.push("f.stage = ?");
        vals.push(stage);
      }

      const [countRows] = await ctx.db.query(
        `SELECT COUNT(*) AS total FROM bigsocialboss.crm_followups f WHERE ${where.join(" AND ")}`,
        vals
      );
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [rows] = await ctx.db.query(
        `SELECT f.id, f.category, f.stage, f.tag, f.company, f.website, f.company_intro AS companyIntro,
                f.owner, f.note, f.industry, f.country, f.city, f.state, f.address, f.next_followup_at AS nextFollowupAt,
                f.stage_updated_at AS stageUpdatedAt, f.created_at AS createdAt, f.updated_at AS updatedAt,
                (SELECT COUNT(*) FROM bigsocialboss.crm_followup_contacts c WHERE c.followup_id = f.id) AS contactCount,
                (SELECT COUNT(*) FROM bigsocialboss.crm_followup_records r WHERE r.followup_id = f.id) AS recordCount,
                (SELECT r.followup_date FROM bigsocialboss.crm_followup_records r WHERE r.followup_id = f.id ORDER BY r.followup_date DESC, r.id DESC LIMIT 1) AS lastFollowupDate,
                (SELECT COUNT(*) FROM bigsocialboss.crm_followup_records r WHERE r.followup_id = f.id AND r.has_reply = 1) AS replyCount,
                pc.id AS primaryContactId, pc.name AS primaryContactName, pc.position AS primaryContactPosition,
                pc.email AS primaryContactEmail, pc.phone AS primaryContactPhone, pc.status AS primaryContactStatus
         FROM bigsocialboss.crm_followups f
         LEFT JOIN bigsocialboss.crm_followup_contacts pc ON pc.followup_id = f.id AND pc.is_primary = 1
         WHERE ${where.join(" AND ")}
         ORDER BY (f.next_followup_at IS NULL), f.next_followup_at ASC, f.updated_at DESC
         LIMIT ? OFFSET ?`,
        [...vals, pageSize, offset]
      );
      return res.json({ ok: true, items: rows, total, page, pageSize });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 各阶段计数 =====
  app.get("/api/crm/followup-boards/stage-counts", async (req: Request, res: Response) => {
    try {
      const category = String(req.query.category ?? "");
      if (!category) {
        return res.status(400).json({ ok: false, message: "category 非法" });
      }
      const [rows] = await ctx.db.query(
        `SELECT stage, COUNT(*) AS cnt FROM bigsocialboss.crm_followups WHERE category = ? GROUP BY stage`,
        [category]
      );
      const counts: Record<string, number> = { cold: 0, intent: 0, deal: 0, won: 0 };
      for (const r of rows as { stage: string; cnt: number }[]) {
        counts[r.stage] = Number(r.cnt);
      }
      return res.json({ ok: true, counts });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 公司详情（含所有联系人）=====
  app.get("/api/crm/followup-boards/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const [rows] = await ctx.db.query(
        `SELECT f.id, f.category, f.stage, f.tag, f.company, f.website, f.company_intro AS companyIntro,
                f.owner, f.note, f.industry, f.country, f.city, f.state, f.address, f.next_followup_at AS nextFollowupAt,
                f.stage_updated_at AS stageUpdatedAt, f.created_at AS createdAt, f.updated_at AS updatedAt
         FROM bigsocialboss.crm_followups f WHERE f.id = ?`,
        [id]
      );
      const company = (rows as unknown[])[0];
      if (!company) return res.status(404).json({ ok: false, message: "公司不存在" });
      const [contacts] = await ctx.db.query(
        `SELECT c.id, c.name, c.position, c.email, c.phone, c.status, c.is_primary AS isPrimary,
                (SELECT COUNT(*) FROM bigsocialboss.crm_followup_records r WHERE r.contact_id = c.id) AS recordCount,
                (SELECT r.followup_date FROM bigsocialboss.crm_followup_records r WHERE r.contact_id = c.id ORDER BY r.followup_date DESC, r.id DESC LIMIT 1) AS lastFollowupDate
         FROM bigsocialboss.crm_followup_contacts c WHERE c.followup_id = ? ORDER BY c.is_primary DESC, c.id ASC`,
        [id]
      );
      return res.json({ ok: true, company, contacts });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 新建公司 =====
  app.post("/api/crm/followup-boards", async (req: Request, res: Response) => {
    try {
      const body = createCompanyBody.parse(req.body ?? {});
      const [result] = await ctx.db.query(
        `INSERT INTO bigsocialboss.crm_followups
           (category, stage, tag, company, website, company_intro, owner, note, next_followup_at, stage_updated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          body.category,
          body.stage,
          (body.tag ?? "").trim(),
          body.company.trim(),
          (body.website ?? "").trim(),
          (body.companyIntro ?? "").trim(),
          (body.owner ?? "").trim(),
          (body.note ?? "").trim(),
          toDateTime(body.nextFollowupAt),
        ]
      );
      const insertId = (result as { insertId?: number }).insertId ?? 0;
      return res.json({ ok: true, id: insertId });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 更新公司 =====
  app.put("/api/crm/followup-boards/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const body = updateCompanyBody.parse(req.body ?? {});
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (body.company !== undefined) { sets.push("company = ?"); vals.push(body.company.trim()); }
      if (body.tag !== undefined) { sets.push("tag = ?"); vals.push(body.tag.trim()); }
      if (body.website !== undefined) { sets.push("website = ?"); vals.push(body.website.trim()); }
      if (body.companyIntro !== undefined) { sets.push("company_intro = ?"); vals.push(body.companyIntro.trim()); }
      if (body.owner !== undefined) { sets.push("owner = ?"); vals.push(body.owner.trim()); }
      if (body.nextFollowupAt !== undefined) { sets.push("next_followup_at = ?"); vals.push(toDateTime(body.nextFollowupAt)); }
      if (body.note !== undefined) { sets.push("note = ?"); vals.push(body.note.trim()); }
      if (!sets.length) return res.json({ ok: true });
      sets.push("updated_at = NOW()");
      vals.push(id);
      await ctx.db.query(`UPDATE bigsocialboss.crm_followups SET ${sets.join(", ")} WHERE id = ?`, vals);
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 阶段流转 =====
  app.post("/api/crm/followup-boards/:id/move-stage", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const { stage } = z.object({ stage: stageSchema }).parse(req.body ?? {});
      await ctx.db.query(
        `UPDATE bigsocialboss.crm_followups SET stage = ?, stage_updated_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [stage, id]
      );
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 删除公司 =====
  app.delete("/api/crm/followup-boards/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      await ctx.db.query("DELETE FROM bigsocialboss.crm_followups WHERE id = ?", [id]);
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 联系人列表 =====
  app.get("/api/crm/followup-boards/:id/contacts", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const [rows] = await ctx.db.query(
        `SELECT c.id, c.name, c.position, c.email, c.phone, c.status, c.is_primary AS isPrimary,
                (SELECT COUNT(*) FROM bigsocialboss.crm_followup_records r WHERE r.contact_id = c.id) AS recordCount
         FROM bigsocialboss.crm_followup_contacts c WHERE c.followup_id = ? ORDER BY c.is_primary DESC, c.id ASC`,
        [id]
      );
      return res.json({ ok: true, items: rows });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 新建联系人 =====
  app.post("/api/crm/followup-boards/:id/contacts", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const body = createContactBody.parse(req.body ?? {});
      if (body.isPrimary) {
        await ctx.db.query("UPDATE bigsocialboss.crm_followup_contacts SET is_primary = 0 WHERE followup_id = ?", [id]);
      }
      const [result] = await ctx.db.query(
        `INSERT INTO bigsocialboss.crm_followup_contacts (followup_id, name, position, email, phone, status, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
        [id, body.name.trim(), (body.position ?? "").trim(), (body.email ?? "").trim(), (body.phone ?? "").trim(), body.isPrimary ? 1 : 0]
      );
      const insertId = (result as { insertId?: number }).insertId ?? 0;
      // 同步到 CRM 数据库
      try {
        await syncContactToCrm(ctx.db, resolveTenantId(req), id, body.name.trim(), (body.position ?? "").trim(), (body.email ?? "").trim(), (body.phone ?? "").trim());
      } catch { /* 同步失败不影响主流程 */ }
      return res.json({ ok: true, id: insertId });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 更新联系人 =====
  app.put("/api/crm/followup-boards/:id/contacts/:cid", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cid = Number(req.params.cid);
      if (!okId(id, res) || !okId(cid, res)) return;
      const body = updateContactBody.parse(req.body ?? {});
      if (body.isPrimary) {
        await ctx.db.query("UPDATE bigsocialboss.crm_followup_contacts SET is_primary = 0 WHERE followup_id = ?", [id]);
      }
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (body.name !== undefined) { sets.push("name = ?"); vals.push(body.name.trim()); }
      if (body.position !== undefined) { sets.push("position = ?"); vals.push(body.position.trim()); }
      if (body.email !== undefined) { sets.push("email = ?"); vals.push(body.email.trim()); }
      if (body.phone !== undefined) { sets.push("phone = ?"); vals.push(body.phone.trim()); }
      if (body.isPrimary !== undefined) { sets.push("is_primary = ?"); vals.push(body.isPrimary ? 1 : 0); }
      if (body.status !== undefined) { sets.push("status = ?"); vals.push(body.status); }
      if (!sets.length) return res.json({ ok: true });
      sets.push("updated_at = NOW()");
      vals.push(cid, id);
      await ctx.db.query(`UPDATE bigsocialboss.crm_followup_contacts SET ${sets.join(", ")} WHERE id = ? AND followup_id = ?`, vals);
      // 邮箱有更新时同步到 CRM 数据库
      if (body.email !== undefined) {
        try {
          const [cur] = await ctx.db.query(
            `SELECT name, position, email, phone FROM bigsocialboss.crm_followup_contacts WHERE id = ?`,
            [cid]
          );
          const c = (cur as { name?: string; position?: string; email?: string; phone?: string }[])[0];
          if (c) {
            await syncContactToCrm(ctx.db, resolveTenantId(req), id, c.name ?? "", c.position ?? "", c.email ?? "", c.phone ?? "");
          }
        } catch { /* 同步失败不影响主流程 */ }
      }
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 删除联系人 =====
  app.delete("/api/crm/followup-boards/:id/contacts/:cid", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cid = Number(req.params.cid);
      if (!okId(id, res) || !okId(cid, res)) return;
      await ctx.db.query("DELETE FROM bigsocialboss.crm_followup_contacts WHERE id = ? AND followup_id = ?", [cid, id]);
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 某联系人的跟进记录 =====
  app.get("/api/crm/followup-boards/:id/contacts/:cid/records", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cid = Number(req.params.cid);
      if (!okId(id, res) || !okId(cid, res)) return;
      const [rows] = await ctx.db.query(
        `SELECT r.id, r.followup_date AS followupDate, r.action_type AS actionType, r.content, r.owner,
                r.has_reply AS hasReply, r.created_at AS createdAt
         FROM bigsocialboss.crm_followup_records r
         WHERE r.followup_id = ? AND r.contact_id = ?
         ORDER BY r.followup_date DESC, r.id DESC LIMIT 200`,
        [id, cid]
      );
      return res.json({ ok: true, items: rows });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 新增跟进记录（针对联系人）=====
  app.post("/api/crm/followup-boards/:id/contacts/:cid/records", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cid = Number(req.params.cid);
      if (!okId(id, res) || !okId(cid, res)) return;
      const body = createRecordBody.parse(req.body ?? {});
      const [result] = await ctx.db.query(
        `INSERT INTO bigsocialboss.crm_followup_records (followup_id, contact_id, followup_date, action_type, content, owner, has_reply, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id, cid, body.followupDate, (body.actionType ?? "").trim(), body.content.trim(), (body.owner ?? "").trim(), body.hasReply ? 1 : 0]
      );
      await ctx.db.query("UPDATE bigsocialboss.crm_followups SET updated_at = NOW() WHERE id = ?", [id]);
      const insertId = (result as { insertId?: number }).insertId ?? 0;
      return res.json({ ok: true, id: insertId });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 删除跟进记录 =====
  app.delete("/api/crm/followup-boards/:id/contacts/:cid/records/:rid", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cid = Number(req.params.cid);
      const rid = Number(req.params.rid);
      if (!okId(id, res) || !okId(cid, res) || !okId(rid, res)) return;
      await ctx.db.query(
        "DELETE FROM bigsocialboss.crm_followup_records WHERE id = ? AND followup_id = ? AND contact_id = ?",
        [rid, id, cid]
      );
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // ===== 兼容旧接口：公司级跟进记录（按主联系人）=====
  app.get("/api/crm/followup-boards/:id/records", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!okId(id, res)) return;
      const [rows] = await ctx.db.query(
        `SELECT r.id, r.followup_date AS followupDate, r.action_type AS actionType, r.content, r.owner,
                r.has_reply AS hasReply, r.created_at AS createdAt, c.name AS contactName
         FROM bigsocialboss.crm_followup_records r
         LEFT JOIN bigsocialboss.crm_followup_contacts c ON c.id = r.contact_id
         WHERE r.followup_id = ?
         ORDER BY r.followup_date DESC, r.id DESC LIMIT 200`,
        [id]
      );
      return res.json({ ok: true, items: rows });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
}

// ===== 跟进渠道管理 =====
export function registerCrmFollowupChannels(app: Express, ctx: Ctx) {
  // 渠道列表
  app.get("/api/crm/followup-channels", async (_req: Request, res: Response) => {
    try {
      const [rows] = await ctx.db.query(
        `SELECT id, channel_key AS channelKey, label, sort_order AS sortOrder
         FROM bigsocialboss.crm_followup_channels ORDER BY sort_order ASC, id ASC`
      );
      return res.json({ ok: true, items: rows });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // 新增渠道
  app.post("/api/crm/followup-channels", async (req: Request, res: Response) => {
    try {
      const body = z.object({
        label: z.string().min(1).max(100),
      }).parse(req.body ?? {});
      const key = `ch_${Date.now().toString(36)}`;
      const [maxRow] = await ctx.db.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM bigsocialboss.crm_followup_channels`
      );
      const sortOrder = ((maxRow as { m: number }[])[0]?.m ?? 0) + 1;
      const [result] = await ctx.db.query(
        `INSERT INTO bigsocialboss.crm_followup_channels (channel_key, label, sort_order) VALUES (?, ?, ?)`,
        [key, body.label.trim(), sortOrder]
      );
      const insertId = (result as { insertId?: number }).insertId ?? 0;
      return res.json({ ok: true, id: insertId, channelKey: key });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // 重命名渠道
  app.put("/api/crm/followup-channels/:key", async (req: Request, res: Response) => {
    try {
      const key = String(req.params.key);
      const body = z.object({
        label: z.string().min(1).max(100),
      }).parse(req.body ?? {});
      await ctx.db.query(
        `UPDATE bigsocialboss.crm_followup_channels SET label = ? WHERE channel_key = ?`,
        [body.label.trim(), key]
      );
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // 删除渠道（含该渠道所有客户数据）
  app.get("/api/crm/followup-channels/:key/count", async (req: Request, res: Response) => {
    try {
      const key = String(req.params.key);
      const [rows] = await ctx.db.query(
        `SELECT COUNT(*) AS n FROM bigsocialboss.crm_followups WHERE category = ?`, [key]
      ) as unknown as [{ n: number }][];
      return res.json({ ok: true, count: rows?.[0]?.n ?? 0 });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/crm/followup-channels/:key", async (req: Request, res: Response) => {
    try {
      const key = String(req.params.key);
      // 先查该渠道下有多少客户，返回给前端做警告
      const [countRows] = await ctx.db.query(
        `SELECT COUNT(*) AS n FROM bigsocialboss.crm_followups WHERE category = ?`, [key]
      ) as unknown as [{ n: number }][];
      const n = countRows?.[0]?.n ?? 0;
      // 级联删除：先删跟进记录和联系人，再删公司，最后删渠道
      await ctx.db.query(
        `DELETE r FROM bigsocialboss.crm_followup_records r
         JOIN bigsocialboss.crm_followup_contacts c ON r.contact_id = c.id
         JOIN bigsocialboss.crm_followups f ON c.followup_id = f.id
         WHERE f.category = ?`, [key]);
      await ctx.db.query(
        `DELETE c FROM bigsocialboss.crm_followup_contacts c
         JOIN bigsocialboss.crm_followups f ON c.followup_id = f.id
         WHERE f.category = ?`, [key]);
      await ctx.db.query(`DELETE FROM bigsocialboss.crm_followups WHERE category = ?`, [key]);
      await ctx.db.query(`DELETE FROM bigsocialboss.crm_followup_channels WHERE channel_key = ?`, [key]);
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
}
