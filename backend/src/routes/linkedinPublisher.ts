import type { Express } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";

import {
  buildLinkedInDraftBatch,
  buildLinkedInDraftFromArticleUrl,
  discoverLinkedInArticleUrls
} from "../services/linkedinArticleImport.js";

const detectSchema = z.object({
  accessToken: z.string().trim().min(20).max(4096)
});

const allowedUploadExt = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".webm",
  ".m4v"
]);

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 与主站 socialPublishingLinkedIn.detectLinkedInMemberUrnFromToken 同序：userinfo → /v2/me */
async function detectLinkedInProfile(accessToken: string): Promise<
  | { ok: true; memberUrn: string; name: string; source: "userinfo" | "me" }
  | { ok: false; message: string; errors: Array<{ endpoint: string; status: number; message: string }> }
> {
  const errors: Array<{ endpoint: string; status: number; message: string }> = [];

  const userinfoResp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const userinfoText = await userinfoResp.text();
  const userinfoJson = parseJson(userinfoText);
  const sub = valueAsString(userinfoJson.sub);
  if (userinfoResp.ok && sub) {
    const name =
      valueAsString(userinfoJson.name) ||
      `${valueAsString(userinfoJson.given_name)} ${valueAsString(userinfoJson.family_name)}`.trim();
    return {
      ok: true,
      memberUrn: sub.startsWith("urn:li:person:") ? sub : `urn:li:person:${sub}`,
      name,
      source: "userinfo"
    };
  }
  if (!userinfoResp.ok) {
    errors.push({
      endpoint: "userinfo",
      status: userinfoResp.status,
      message: valueAsString(userinfoJson.message) || userinfoText.slice(0, 200) || `HTTP ${userinfoResp.status}`
    });
  }

  const meResp = await fetch("https://api.linkedin.com/v2/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0"
    }
  });
  const meText = await meResp.text();
  const meJson = parseJson(meText);
  const id = valueAsString(meJson.id);
  if (meResp.ok && id) {
    const localizedFirst = valueAsString(meJson.localizedFirstName);
    const localizedLast = valueAsString(meJson.localizedLastName);
    const name = `${localizedFirst} ${localizedLast}`.trim();
    return {
      ok: true,
      memberUrn: id.startsWith("urn:li:person:") ? id : `urn:li:person:${id}`,
      name,
      source: "me"
    };
  }
  if (!meResp.ok) {
    errors.push({
      endpoint: "me",
      status: meResp.status,
      message: valueAsString(meJson.message) || meText.slice(0, 200) || `HTTP ${meResp.status}`
    });
  }

  if (userinfoResp.status === 401 || meResp.status === 401) {
    return {
      ok: false,
      message: "LinkedIn Access Token 无效或已过期，请重新生成 OAuth Access Token。",
      errors
    };
  }
  if (userinfoResp.status === 403 && meResp.status === 403) {
    return {
      ok: false,
      message:
        "Token 无法读取 Member URN。请在 LinkedIn 开发者后台启用 Sign In with LinkedIn (OpenID Connect)，并勾选 openid、profile、email 与 w_member_social 后重新生成 Token。",
      errors
    };
  }

  return {
    ok: false,
    message:
      "LinkedIn 未返回个人 ID。请重新生成同时包含 w_member_social 与 profile/openid 权限的 token，或确认 token 未过期。",
    errors
  };
}

function normalizeUploadName(rawName: string): string {
  if (!rawName) return "file";
  return Buffer.from(rawName, "latin1").toString("utf8");
}

function publicUploadUrl(filename: string): string {
  return `/uploads/linkedin-publisher/${filename}`;
}

export function registerLinkedInPublisherRoutes(app: Express) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadDir = path.join(__dirname, "..", "..", "uploads", "linkedin-publisher");
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use("/uploads/linkedin-publisher", express.static(uploadDir));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = normalizeUploadName(file.originalname).replace(/[^\w.\-()+@]/g, "_");
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
      }
    }),
    limits: { fileSize: 220 * 1024 * 1024 }
  });

  app.post("/api/linkedin/profile-detect", async (req, res) => {
    try {
      const { accessToken } = detectSchema.parse(req.body);
      const result = await detectLinkedInProfile(accessToken);
      if (result.ok) {
        return res.json({ ok: true, memberUrn: result.memberUrn, name: result.name, source: result.source });
      }
      return res.json({ ok: false, message: result.message, errors: result.errors });
    } catch (e) {
      const message = e instanceof z.ZodError ? "Access Token 格式不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/linkedin/articles/discover", async (req, res) => {
    try {
      const body = z
        .object({
          siteUrl: z.string().trim().min(8).max(2048),
          articleLocale: z.enum(["zh", "en"]).optional()
        })
        .parse(req.body ?? {});
      const result = await discoverLinkedInArticleUrls(body.siteUrl, body.articleLocale);
      return res.json(result);
    } catch (e) {
      const message = e instanceof z.ZodError ? "网站 URL 格式不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/linkedin/articles/draft-from-url", async (req, res) => {
    try {
      const body = z
        .object({
          url: z.string().trim().min(8).max(2048),
          copyLocale: z.enum(["zh", "en"]).optional()
        })
        .parse(req.body ?? {});
      const draft = await buildLinkedInDraftFromArticleUrl(body.url, body.copyLocale);
      return res.json({ ok: true, draft });
    } catch (e) {
      const message = e instanceof z.ZodError ? "文章 URL 格式不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/linkedin/articles/draft-batch", async (req, res) => {
    try {
      const body = z
        .object({
          urls: z.array(z.string().trim().min(8).max(2048)).min(1).max(30),
          copyLocale: z.enum(["zh", "en"]).optional()
        })
        .parse(req.body ?? {});
      const drafts = await buildLinkedInDraftBatch(body.urls, body.copyLocale);
      return res.json({ ok: true, drafts });
    } catch (e) {
      const message = e instanceof z.ZodError ? "文章 URL 列表格式不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/linkedin/assets/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, message: "请选择上传文件" });
    const originalName = normalizeUploadName(file.originalname ?? "");
    const ext = path.extname(originalName).toLowerCase();
    if (!allowedUploadExt.has(ext)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ ok: false, message: "文件类型不支持" });
    }
    return res.json({
      ok: true,
      asset: {
        name: originalName,
        storedName: file.filename,
        mime: file.mimetype,
        sizeBytes: file.size,
        url: publicUploadUrl(file.filename)
      }
    });
  });

  app.post("/api/linkedin/posts/publish-now", async (req, res) => {
    try {
      const body = z
        .object({
          accessToken: z.string().trim().min(20).max(4096),
          memberUrn: z.string().trim().min(8).max(256),
          title: z.string().max(500).optional().default(""),
          body: z.string().max(3000),
          url: z.string().max(2048).optional().default(""),
          articleThumbnailUrl: z.string().max(2048).optional().default(""),
          media: z
            .array(
              z.object({
                type: z.enum(["image", "video"]),
                name: z.string().max(500),
                url: z.string().max(2048).optional()
              })
            )
            .max(20)
            .optional()
            .default([])
        })
        .parse(req.body ?? {});

      const forwardedProto = String(req.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
      const host = String(req.get("x-forwarded-host") ?? req.get("host") ?? "").trim();
      const publicOrigin =
        (process.env.PUBLIC_BASE_URL ?? process.env.EMAIL_UNSUBSCRIBE_BASE_URL ?? "").trim().replace(/\/$/, "") ||
        (host ? `${forwardedProto}://${host}` : "");

      const { publishLinkedInMemberPost } = await import("../services/linkedinPostPublish.js");
      const result = await publishLinkedInMemberPost({
        accessToken: body.accessToken,
        memberUrn: body.memberUrn,
        title: body.title,
        body: body.body,
        url: body.url,
        articleThumbnailUrl: body.articleThumbnailUrl,
        media: body.media,
        publicOrigin
      });
      return res.json({ ok: true, postId: result.postId, warnings: result.warnings });
    } catch (e) {
      const message = e instanceof z.ZodError ? "发布参数不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });
}
