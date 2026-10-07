import express, { type Express, type Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";
import type { Pool, PoolConnection } from "mysql2/promise";
import { resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };
const TEMPLATE_OWNER_ADMIN_EMAIL = "2415022172@qq.com";

const assetItemSchema = z.object({
  url: z.string().min(1),
  name: z.string().min(1),
  mime: z.string().optional(),
  size: z.number().optional()
});

const categorySchema = z.preprocess(
  (val) => {
    if (val == null || val === "") return undefined;
    const t = String(val).trim();
    return t === "" ? undefined : t;
  },
  z.string().max(15, "模版标签最多 15 个字").optional()
);

const templateUpsertSchema = z.object({
  name: z.string().min(1),
  category: categorySchema,
  businessLine: z.enum(["partner", "factory", "company_register", "all"]).optional(),
  subjectTemplate: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  fontStack: z.string().min(1),
  groupIds: z.array(z.number().int().positive()).optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduledAt: z.union([z.string(), z.null()]).optional(),
  signatureMode: z.enum(["custom", "preset"]).optional(),
  signaturePresetKey: z.string().nullable().optional(),
  signatureHtml: z.string().nullable().optional(),
  assets: z
    .object({
      documents: z.array(assetItemSchema).max(3).optional(),
      attachmentImages: z.array(assetItemSchema).max(3).optional(),
      images: z
        .array(
          z.object({
            url: z.string().min(1),
            name: z.string().optional()
          })
        )
        .optional(),
      attachments: z
        .array(
          z.object({
            url: z.string().min(1),
            name: z.string().min(1),
            mime: z.string().optional()
          })
        )
        .optional()
    })
    .optional()
});

/** 独立站/主站：上传文件对外 URL（收件人须能访问；优先 .env PUBLIC_BASE_URL） */
function resolvePublicUploadUrl(req: Request, filename: string): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL ?? process.env.EMAIL_UNSUBSCRIBE_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (fromEnv) return `${fromEnv}/uploads/${filename}`;
  const proto = String(req.get("x-forwarded-proto") ?? req.protocol ?? "http")
    .split(",")[0]
    .trim();
  const host = String(req.get("x-forwarded-host") ?? req.get("host") ?? "").trim();
  if (host) return `${proto}://${host}/uploads/${filename}`;
  return `/uploads/${filename}`;
}

export function registerEmailTemplateRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadDir = path.join(__dirname, "..", "..", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-()+@]/g, "_");
        cb(null, `${Date.now()}_${safe}`);
      }
    }),
    limits: { fileSize: 16 * 1024 * 1024 }
  });

  app.use("/uploads", express.static(uploadDir));

  /** 必须在 /:id 之前注册，否则会被当成 id */
  app.get("/api/email/templates/meta/next-name", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authEmail = String((req as any)?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const isOwnerAdmin = authEmail === TEMPLATE_OWNER_ADMIN_EMAIL;
    const [rows] = await db.query(
      `SELECT name FROM email_templates ${isOwnerAdmin ? "" : "WHERE tenant_id = ? AND owner_user_id = ?"}`,
      isOwnerAdmin ? [] : [tenantId, authUserId]
    );
    let max = 0;
    for (const r of rows as any[]) {
      const m = /^模版(\d+)$/.exec(String(r.name ?? "").trim());
      if (m) max = Math.max(max, parseInt(m[1]!, 10));
    }
    res.json({ ok: true, nextName: `模版${max + 1}` });
  });

  app.get("/api/email/templates", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authEmail = String((req as any)?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const isOwnerAdmin = authEmail === TEMPLATE_OWNER_ADMIN_EMAIL;
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const q = typeof req.query.q === "string" ? req.query.q : "";

    const where: string[] = [];
    const params: any[] = [];
    if (!isOwnerAdmin) {
      where.push("t.tenant_id = ?");
      params.push(tenantId);
      where.push("t.owner_user_id = ?");
      params.push(authUserId);
    }
    if (category) {
      where.push(`t.category = ?`);
      params.push(category);
    }
    if (q) {
      where.push(`(t.name LIKE ? OR t.subject_template LIKE ? OR IFNULL(t.category,'') LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const sql =
      `SELECT t.id, t.name, t.category, t.business_line, t.subject_template, t.font_stack,
              t.schedule_enabled, t.scheduled_at, t.created_at, t.updated_at,
              (SELECT JSON_ARRAYAGG(g.group_id) FROM email_template_groups g WHERE g.template_id = t.id) AS group_ids
       FROM email_templates t` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY t.id DESC LIMIT 200`;

    const [rows] = await db.query(sql, params);
    const items = (rows as any[]).map((row) => normalizeTemplateRow(row));
    res.json({ ok: true, items });
  });

  app.get("/api/email/templates/:id", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authEmail = String((req as any)?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const isOwnerAdmin = authEmail === TEMPLATE_OWNER_ADMIN_EMAIL;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [rows] = await db.query(
      `SELECT t.*,
              (SELECT JSON_ARRAYAGG(g.group_id) FROM email_template_groups g WHERE g.template_id = t.id) AS group_ids
       FROM email_templates t WHERE t.id = ? ${isOwnerAdmin ? "" : "AND t.tenant_id = ? AND t.owner_user_id = ?"} LIMIT 1`,
      isOwnerAdmin ? [id] : [id, tenantId, authUserId]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, item: normalizeTemplateRow(row) });
  });

  app.post("/api/email/templates", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const body = templateUpsertSchema.parse(req.body);
    const assetsJson = body.assets ? JSON.stringify(body.assets) : null;
    const sched = normalizeSchedule(body.scheduleEnabled, body.scheduledAt);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO email_templates
         (tenant_id, owner_user_id, name, category, business_line, subject_template, body_html, body_text, font_stack, assets_json,
          schedule_enabled, scheduled_at, signature_mode, signature_preset_key, signature_html)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
        [
          tenantId,
          authUserId > 0 ? authUserId : null,
          body.name,
          body.category ?? null,
          body.businessLine && body.businessLine !== "all" ? body.businessLine : null,
          body.subjectTemplate,
          wrapBodyWithFont(body.bodyHtml, body.fontStack),
          body.bodyText ?? null,
          body.fontStack,
          assetsJson,
          sched.enabled,
          sched.at,
          body.signatureMode ?? "preset",
          body.signaturePresetKey ?? null,
          body.signatureHtml ?? null
        ]
      );
      const insertId = (result as any).insertId as number;
      await replaceTemplateGroups(conn, insertId, body.groupIds);
      await conn.commit();
      res.json({ ok: true, id: insertId });
    } catch (e: any) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  app.put("/api/email/templates/:id", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authEmail = String((req as any)?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const isOwnerAdmin = authEmail === TEMPLATE_OWNER_ADMIN_EMAIL;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = templateUpsertSchema.parse(req.body);
    const assetsJson = body.assets ? JSON.stringify(body.assets) : null;
    const sched = normalizeSchedule(body.scheduleEnabled, body.scheduledAt);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `UPDATE email_templates
         SET name=?, category=?, business_line=?, subject_template=?, body_html=?, body_text=?, font_stack=?,
             assets_json=CAST(? AS JSON),
             schedule_enabled=?, scheduled_at=?, signature_mode=?, signature_preset_key=?, signature_html=?
         WHERE id=? ${isOwnerAdmin ? "" : "AND tenant_id=? AND owner_user_id=?"}`,
        [
          body.name,
          body.category ?? null,
          body.businessLine && body.businessLine !== "all" ? body.businessLine : null,
          body.subjectTemplate,
          wrapBodyWithFont(body.bodyHtml, body.fontStack),
          body.bodyText ?? null,
          body.fontStack,
          assetsJson,
          sched.enabled,
          sched.at,
          body.signatureMode ?? "preset",
          body.signaturePresetKey ?? null,
          body.signatureHtml ?? null,
          id,
          ...(isOwnerAdmin ? [] : [tenantId, authUserId])
        ]
      );
      await replaceTemplateGroups(conn, id, body.groupIds);
      await conn.commit();
      res.json({ ok: true, affected: (result as any).affectedRows });
    } catch (e: any) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  app.delete("/api/email/templates/:id", async (req, res) => {
    const tenantId = resolveTenantId(req as any);
    const authEmail = String((req as any)?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = Number((req as any)?.auth?.userId ?? 0);
    const isOwnerAdmin = authEmail === TEMPLATE_OWNER_ADMIN_EMAIL;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await db.query(
      `DELETE FROM email_templates WHERE id = ? ${isOwnerAdmin ? "" : "AND tenant_id = ? AND owner_user_id = ?"}`,
      isOwnerAdmin ? [id] : [id, tenantId, authUserId]
    );
    res.json({ ok: true, affected: (result as any).affectedRows });
  });

  app.post("/api/email/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, message: "Missing file" });
    const kind = typeof req.query.kind === "string" ? req.query.kind : "inline";

    const docMime = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]);

    const maxDoc = 5 * 1024 * 1024;
    const maxImgAttach = 2 * 1024 * 1024;
    const maxInline = 15 * 1024 * 1024;

    const reject = (msg: string) => {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ ok: false, message: msg });
    };

    if (kind === "doc") {
      if (!docMime.has(file.mimetype)) {
        return reject("仅支持 Word（.doc/.docx）、Excel（.xls/.xlsx）、PDF；单个文件建议不超过 5MB，以免影响发送速度");
      }
      if (file.size > maxDoc) {
        return reject("文档附件单个不超过 5MB，请压缩或拆分后再传");
      }
    } else if (kind === "image_attach") {
      if (!file.mimetype.startsWith("image/")) {
        return reject("请选择图片文件");
      }
      if (file.size > maxImgAttach) {
        return reject("作为附件的图片单张不超过 2MB");
      }
    } else {
      if (file.mimetype.startsWith("video/")) {
        const allowedVideo = new Set(["video/mp4", "video/webm", "video/quicktime"]);
        if (!allowedVideo.has(file.mimetype)) {
          return reject("正文视频仅支持 MP4、WebM、MOV（video/mp4、video/webm、video/quicktime）");
        }
      }
      if (file.size > maxInline) {
        return reject("正文插入的图片或视频单个不超过 15MB");
      }
    }

    const publicUrl = resolvePublicUploadUrl(req, file.filename);
    res.json({
      ok: true,
      url: publicUrl,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size
    });
  });
}

function normalizeSchedule(enabled: boolean | undefined, scheduledAt: string | null | undefined) {
  const en = Boolean(enabled);
  if (!en) return { enabled: 0, at: null as Date | null };
  if (!scheduledAt) return { enabled: 0, at: null };
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return { enabled: 0, at: null };
  return { enabled: 1, at: d };
}

function normalizeTemplateRow(row: any) {
  const out = { ...row };
  if (out.assets_json != null && typeof out.assets_json === "string") {
    try {
      out.assets_json = JSON.parse(out.assets_json);
    } catch {
      /* keep */
    }
  }
  let gids = out.group_ids;
  if (gids == null) {
    out.group_ids = [];
  } else if (typeof gids === "string") {
    try {
      const p = JSON.parse(gids);
      out.group_ids = Array.isArray(p) ? p : [];
    } catch {
      out.group_ids = [];
    }
  } else if (Array.isArray(gids)) {
    out.group_ids = gids.filter((x: any) => typeof x === "number");
  } else {
    out.group_ids = [];
  }
  return out;
}

async function replaceTemplateGroups(conn: PoolConnection, templateId: number, groupIds: number[] | undefined) {
  await conn.query(`DELETE FROM email_template_groups WHERE template_id = ?`, [templateId]);
  const ids = Array.from(new Set(groupIds ?? [])).filter((n) => n > 0);
  if (!ids.length) return;
  const [grows] = await conn.query(`SELECT id FROM contact_groups WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  const ok = new Set((grows as any[]).map((r) => r.id));
  const safe = ids.filter((id) => ok.has(id));
  if (!safe.length) return;
  const values = safe.map((gid) => [templateId, gid]);
  await conn.query(`INSERT INTO email_template_groups (template_id, group_id) VALUES ?`, [values]);
}

function wrapBodyWithFont(html: string, fontStack: string) {
  const escaped = fontStack.replace(/"/g, "&quot;");
  if (html.includes(`font-family:`) && html.trim().startsWith("<")) {
    return html;
  }
  return `<div style="font-family: ${escaped}; line-height: 1.6;">${html}</div>`;
}
