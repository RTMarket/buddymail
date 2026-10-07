import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { requireAuth, resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };

type TemplateField = {
  id: string;
  label: string;
  type: "shortText" | "longText" | "fileList";
  value?: string;
};
type TemplateSection = { id: string; title: string; fields: TemplateField[] };
type TemplatePage = { id: string; title: string; sections: TemplateSection[] };

const MAX_SECTIONS_PER_PAGE = 10;
const MAX_PAGES_PER_USER = 100;

const allowedExt = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);

function makePageId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePagesFromLayout(raw: string, fallbackTitle: string): TemplatePage[] {
  try {
    const parsed = JSON.parse(raw || "{}") as { pages?: TemplatePage[]; sections?: TemplateSection[] };
    if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
      return parsed.pages.slice(0, MAX_PAGES_PER_USER).map((p, idx) => ({
        id: String(p.id ?? makePageId()),
        title: String(p.title ?? `跟进页 ${idx + 1}`).slice(0, 255),
        sections: Array.isArray(p.sections) ? p.sections.slice(0, MAX_SECTIONS_PER_PAGE) : []
      }));
    }
    if (Array.isArray(parsed.sections)) {
      return [
        {
          id: makePageId(),
          title: fallbackTitle,
          sections: parsed.sections.slice(0, MAX_SECTIONS_PER_PAGE)
        }
      ];
    }
  } catch {
    /* ignore */
  }
  return [{ id: makePageId(), title: fallbackTitle, sections: [] }];
}

function normalizeUploadName(rawName: string): string {
  if (!rawName) return "file";
  // 浏览器 multipart 在部分环境会把 UTF-8 文件名按 latin1 传入；这里转回 UTF-8，避免中文乱码。
  return Buffer.from(rawName, "latin1").toString("utf8");
}

const templateSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(100),
  fields: z.array(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().min(1).max(100),
      type: z.enum(["shortText", "longText", "fileList"]),
      value: z.string().max(5000).optional()
    })
  )
});

const templatePageSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(255),
  sections: z.array(templateSectionSchema).max(MAX_SECTIONS_PER_PAGE)
});

const templatePayloadSchema = z.object({
  pages: z.array(templatePageSchema).min(1).max(MAX_PAGES_PER_USER)
});

export function registerFollowupDetailBuilderRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;
  const auth = requireAuth(db);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadDir = path.join(__dirname, "..", "..", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = normalizeUploadName(file.originalname).replace(/[^\w.\-()+@]/g, "_");
        cb(null, `${Date.now()}_${safe}`);
      }
    }),
    limits: { fileSize: 20 * 1024 * 1024 }
  });

  async function ensureTemplate(tenantId: number, userId: number) {
    const emptySections: TemplateSection[] = [];
    await db.query(
      `INSERT IGNORE INTO followup_detail_templates (tenant_id, user_id, title, layout_json)
       VALUES (?, ?, '客户跟进详情', ?)`,
      [tenantId, userId, JSON.stringify({ sections: emptySections })]
    );
  }

  app.get("/api/email/followup-detail-template", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    try {
      await ensureTemplate(tenantId, userId);
      const [templateRows] = await db.query<RowDataPacket[]>(
        `SELECT id, title, layout_json, updated_at
           FROM followup_detail_templates
          WHERE tenant_id = ? AND user_id = ?
          LIMIT 1`,
        [tenantId, userId]
      );
      const row = templateRows[0];
      const templateId = Number(row.id);
      const fallbackTitle = String(row.title ?? "客户跟进详情");
      const pages = normalizePagesFromLayout(String(row.layout_json ?? "{}"), fallbackTitle);
      const [fileRows] = await db.query<RowDataPacket[]>(
        `SELECT id, field_id, original_name, mime, size_bytes, public_url, created_at
           FROM followup_detail_template_files
          WHERE tenant_id = ? AND user_id = ? AND template_id = ?
          ORDER BY id DESC`,
        [tenantId, userId, templateId]
      );
      return res.json({
        ok: true,
        template: {
          id: templateId,
          title: pages[0]?.title ?? fallbackTitle,
          pages,
          updatedAt: row.updated_at ? String(row.updated_at) : null
        },
        files: (fileRows ?? []).map((f) => ({
          id: Number(f.id),
          fieldId: String(f.field_id ?? ""),
          name: String(f.original_name ?? ""),
          mime: String(f.mime ?? ""),
          sizeBytes: Number(f.size_bytes ?? 0),
          url: String(f.public_url ?? ""),
          createdAt: f.created_at ? String(f.created_at) : null
        }))
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("followup_detail_templates")) {
        return res.status(503).json({
          ok: false,
          message: "请先执行数据库迁移 sql/033_followup_detail_builder.sql。"
        });
      }
      throw e;
    }
  });

  app.put("/api/email/followup-detail-template", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const body = templatePayloadSchema.parse(req.body ?? {});
    const firstTitle = body.pages[0]?.title?.trim() || "客户跟进详情";
    try {
      await ensureTemplate(tenantId, userId);
      await db.query(
        `UPDATE followup_detail_templates
            SET title = ?, layout_json = ?
          WHERE tenant_id = ? AND user_id = ?`,
        [firstTitle, JSON.stringify({ pages: body.pages }), tenantId, userId]
      );
      return res.json({ ok: true });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("followup_detail_templates")) {
        return res.status(503).json({
          ok: false,
          message: "请先执行数据库迁移 sql/033_followup_detail_builder.sql。"
        });
      }
      throw e;
    }
  });

  app.post("/api/email/followup-detail-template/files", auth, upload.single("file"), async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const fieldId = String(req.body?.fieldId ?? "").trim();
    const file = req.file;
    if (!fieldId || fieldId.length > 64) {
      return res.status(400).json({ ok: false, message: "缺少 fieldId 或格式不正确" });
    }
    if (!file) {
      return res.status(400).json({ ok: false, message: "请选择上传文件" });
    }
    const originalName = normalizeUploadName(file.originalname ?? "");
    const ext = path.extname(originalName).toLowerCase();
    if (!allowedExt.has(ext)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ ok: false, message: "仅支持 Word/Excel/PDF 文件" });
    }
    try {
      await ensureTemplate(tenantId, userId);
      const [templateRows] = await db.query<RowDataPacket[]>(
        `SELECT id FROM followup_detail_templates WHERE tenant_id = ? AND user_id = ? LIMIT 1`,
        [tenantId, userId]
      );
      const templateId = Number(templateRows[0]?.id ?? 0);
      const publicUrl = `/uploads/${file.filename}`;
      const [result] = await db.query(
        `INSERT INTO followup_detail_template_files
          (tenant_id, user_id, template_id, field_id, original_name, stored_name, mime, size_bytes, public_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, userId, templateId, fieldId, originalName, file.filename, file.mimetype, file.size, publicUrl]
      );
      const id = Number((result as { insertId?: number }).insertId ?? 0);
      return res.json({
        ok: true,
        file: {
          id,
          fieldId,
          name: originalName,
          mime: file.mimetype,
          sizeBytes: file.size,
          url: publicUrl
        }
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("followup_detail_template")) {
        return res.status(503).json({
          ok: false,
          message: "请先执行数据库迁移 sql/033_followup_detail_builder.sql。"
        });
      }
      throw e;
    }
  });

  app.delete("/api/email/followup-detail-template/files/:id", auth, async (req, res) => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth!.userId;
    const fileId = Number(req.params.id);
    if (!Number.isFinite(fileId) || fileId <= 0) {
      return res.status(400).json({ ok: false, message: "无效文件 id" });
    }
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, stored_name
         FROM followup_detail_template_files
        WHERE id = ? AND tenant_id = ? AND user_id = ?
        LIMIT 1`,
      [fileId, tenantId, userId]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ ok: false, message: "文件不存在" });

    await db.query(`DELETE FROM followup_detail_template_files WHERE id = ?`, [fileId]);
    const diskPath = path.join(uploadDir, String(row.stored_name ?? ""));
    fs.unlink(diskPath, () => {});
    return res.json({ ok: true });
  });
}
