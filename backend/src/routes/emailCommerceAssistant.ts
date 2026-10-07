import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Env } from "../env.js";
import { resolveTenantId } from "../middleware/auth.js";
import {
  openAiCompatibleVisionChat,
  parseCommerceScreenshotVision
} from "../services/emailCommerceAssistantVision.js";
import {
  parseCommerceUrl
} from "../services/emailCommerceAssistantUrl.js";
import {
  parseEmailTemplateTranslateLanguage,
  translateEmailTemplateBody
} from "../services/emailTemplateTranslate.js";
import { importEmailBodyFromPageUrl } from "../services/emailPageUrlImport.js";
import {
  getVisionAiConfig,
  getVisionAiCredentials,
  saveVisionAiConfig
} from "../services/emailVisionAiConfig.js";
import { replicateEmailTemplateFromScreenshot } from "../services/emailLayoutReplicaVision.js";
import { unwrapFetchError, VISION_TEST_PROBE_IMAGE } from "../services/visionApiShared.js";

type Ctx = { env: Env; db: Pool };

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

export function registerEmailCommerceAssistantRoutes(app: Express, ctx: Ctx) {
  const { env, db } = ctx;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadDir = path.join(__dirname, "..", "..", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  async function handleEmailTemplateTranslateBody(req: Request, res: Response) {
    try {
      const tenantId = resolveTenantId(req as any);
      const body = z
        .object({
          mode: z.enum(["full", "selection"]),
          targetLanguage: z.string().min(2).max(16),
          html: z.string().max(200_000).optional(),
          plainText: z.string().max(50_000).optional()
        })
        .parse(req.body ?? {});

      const targetLanguage = parseEmailTemplateTranslateLanguage(body.targetLanguage);
      if (!targetLanguage) {
        return res.status(400).json({ ok: false, message: "不支持的目标语言。" });
      }

      const result = await translateEmailTemplateBody({
        db,
        tenantId,
        env,
        targetLanguage,
        mode: body.mode,
        html: body.html,
        plainText: body.plainText
      });
      return res.json({ ok: true, html: result.html });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("未配置") ||
        message.includes("请先") ||
        message.includes("为空") ||
        message.includes("不支持")
          ? 400
          : 500;
      return res.status(status).json({ ok: false, message });
    }
  }

  app.get("/api/email/vision-ai-config", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const config = await getVisionAiConfig(db, tenantId);
      return res.json({ ok: true, ...config });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.put("/api/email/vision-ai-config", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const body = z
        .object({
          preset: z.string().min(1).max(64),
          providerLabel: z.string().max(128).optional(),
          baseUrl: z.string().min(8).max(512),
          model: z.string().min(1).max(255),
          apiKey: z.string().max(512).optional()
        })
        .parse(req.body ?? {});
      await saveVisionAiConfig(db, tenantId, body);
      const config = await getVisionAiConfig(db, tenantId);
      return res.json({ ok: true, ...config });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status = message.includes("请填写") ? 400 : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  /** 1×1 像素探针 — 验证当前模型是否支持 image_url 识图 */
  app.post("/api/email/vision-ai-config/test", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const cfg = await getVisionAiConfig(db, tenantId);
      if (!cfg.hasKey) {
        return res.status(400).json({ ok: false, message: "请先保存 API Key。" });
      }
      const body = z
        .object({
          baseUrl: z.string().min(8).max(512).optional(),
          model: z.string().min(1).max(255).optional(),
          apiKey: z.string().max(512).optional()
        })
        .parse(req.body ?? {});
      const creds = await getVisionAiCredentials(db, tenantId);
      const baseUrl = (body.baseUrl ?? creds?.baseUrl ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim();
      const model = (body.model ?? creds?.model ?? "gpt-4o-mini").trim();
      let apiKey = body.apiKey?.trim();
      if (!apiKey || /^[•*.\s]+$/.test(apiKey) || apiKey.includes("•••")) {
        apiKey = creds?.apiKey ?? "";
      }
      if (!apiKey) {
        return res.status(400).json({ ok: false, message: "请先保存 API Key 并点「保存设置」。" });
      }
      await openAiCompatibleVisionChat({
        apiKey,
        baseUrl,
        model,
        system: "只回复 OK",
        userText: "看到图片就回复 OK",
        imageBase64: VISION_TEST_PROBE_IMAGE,
        maxTokens: 32,
        timeoutMs: 45_000
      });
      return res.json({ ok: true, message: "识图模型可用。" });
    } catch (e: unknown) {
      const message = unwrapFetchError(e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/email/commerce-assistant/parse-screenshot", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const body = z
        .object({
          imageBase64: z.string().min(32),
          columnsHint: z.coerce.number().int().min(1).max(5).optional(),
          layoutHint: z.string().max(500).optional()
        })
        .parse(req.body ?? {});

      const result = await parseCommerceScreenshotVision({
        env,
        db,
        tenantId,
        imageBase64: body.imageBase64,
        columnsHint: body.columnsHint,
        layoutHint: body.layoutHint
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("未配置") ||
        message.includes("不支持识图") ||
        message.includes("请先") ||
        message.includes("请填写")
          ? 400
          : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/email/vision/replicate-template", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const body = z
        .object({
          imageBase64: z.string().min(32),
          layoutHint: z.string().max(500).optional()
        })
        .parse(req.body ?? {});

      const result = await replicateEmailTemplateFromScreenshot({
        env,
        db,
        tenantId,
        imageBase64: body.imageBase64,
        layoutHint: body.layoutHint
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("请先") ||
        message.includes("请填写") ||
        message.includes("未能") ||
        message.includes("超时")
          ? 400
          : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/email/import-page-url", async (req, res) => {
    try {
      const tenantId = resolveTenantId(req as any);
      const body = z.object({ url: z.string().min(8).max(2048) }).parse(req.body ?? {});
      const result = await importEmailBodyFromPageUrl({
        env,
        db,
        tenantId,
        url: body.url,
        uploadDir,
        resolvePublicUrl: (filename) => resolvePublicUploadUrl(req, filename)
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("链接") ||
        message.includes("未能") ||
        message.includes("无法") ||
        message.includes("不允许") ||
        message.includes("页面")
          ? 400
          : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/email/commerce-assistant/parse-url", async (req, res) => {
    try {
      const body = z
        .object({
          url: z.string().min(8).max(2048),
          columnsHint: z.coerce.number().int().min(1).max(5).optional(),
          layoutHint: z.string().max(500).optional()
        })
        .parse(req.body ?? {});

      const result = await parseCommerceUrl({
        env,
        url: body.url,
        columnsHint: body.columnsHint,
        layoutHint: body.layoutHint,
        uploadDir,
        resolvePublicUrl: (filename) => resolvePublicUploadUrl(req, filename)
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("链接") ||
        message.includes("未配置") ||
        message.includes("未能") ||
        message.includes("无法") ||
        message.includes("不允许")
          ? 400
          : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/email/templates/translate-body", handleEmailTemplateTranslateBody);
  app.post("/api/email/translate-body", handleEmailTemplateTranslateBody);
}
