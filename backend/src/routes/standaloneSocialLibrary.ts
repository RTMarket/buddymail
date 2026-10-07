import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";
import express from "express";
import multer from "multer";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import {
  deleteSocialLibraryAsset,
  deleteSocialLibraryNamedDraft,
  getSocialLibraryDraft,
  insertSocialLibraryAsset,
  insertSocialLibraryLog,
  listSocialLibraryAssets,
  listSocialLibraryLogs,
  listSocialLibraryNamedDrafts,
  saveSocialLibraryDraft,
  upsertSocialLibraryNamedDraft,
  extractSocialLibraryVideoPoster,
  saveSocialLibraryPosterFile,
  socialLibraryPosterPath,
  socialLibraryPublicUrl,
  socialLibraryUploadDir,
  SOCIAL_LIBRARY_PLATFORMS,
  type SocialLibraryAssetKind
} from "../services/standaloneSocialLibrary.js";
import {
  listSocialLibraryPlatformStatus,
  publishSocialLibraryNow,
  saveSocialLibraryPlatformSettings
} from "../services/standaloneSocialPublishNow.js";
import { listChannelAccounts, saveChannelAccount } from "../services/standaloneChannelAccounts.js";
import { publishNostrChannel } from "../services/standaloneNostrPublish.js";
import { publishSlackChannel } from "../services/standaloneSlackPublish.js";
import { publishTelegramChannel } from "../services/standaloneTelegramPublish.js";

async function rememberChannelPublish(
  db: Pool,
  title: string,
  result: { platform: string; ok: boolean; message: string; url?: string }
): Promise<void> {
  await insertSocialLibraryLog(db, {
    title: title.trim().slice(0, 200) || result.platform,
    platforms: [],
    status: result.ok ? "ok" : "failed",
    results: [result]
  });
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const VIDEO_EXT = new Set([".mp4"]);
const ALLOWED_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

function normalizeUploadName(rawName: string): string {
  if (!rawName) return "file";
  if (/[^\u0000-\u00ff]/.test(rawName)) return rawName;
  try {
    const decoded = Buffer.from(rawName, "latin1").toString("utf8");
    return decoded || rawName;
  } catch {
    return rawName;
  }
}

function extFromUpload(name: string, mime: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return ext;
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("bmp")) return ".bmp";
  return ext;
}

function ensureDisplayName(name: string, ext: string): string {
  const trimmed = String(name || "").trim() || "file";
  const current = path.extname(trimmed).toLowerCase();
  if (current === ext) return trimmed;
  const stem = current ? trimmed.slice(0, -current.length) : trimmed;
  return `${stem}${ext}`;
}

function kindFromName(name: string): SocialLibraryAssetKind {
  const ext = path.extname(name).toLowerCase();
  return [".mp4", ".mov", ".webm", ".m4v"].includes(ext) ? "video" : "image";
}

export function registerStandaloneSocialLibraryRoutes(app: Express, ctx: { db: Pool }) {
  const uploadDir = socialLibraryUploadDir();
  const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads", "standalone-social-library");
  fs.mkdirSync(staticDir, { recursive: true });
  app.use("/uploads/standalone-social-library", express.static(staticDir));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = normalizeUploadName(file.originalname || "file").replace(/[^\w.\-()+@]/g, "_");
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
      }
    }),
    limits: { fileSize: 512 * 1024 * 1024 }
  }).any();

  const runUpload: typeof upload = (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      const anyErr = err as { code?: string; message?: string };
      const message =
        anyErr.code === "LIMIT_FILE_SIZE"
          ? "视频/图片不能超过 512MB。"
          : String(anyErr.message || "上传失败。");
      return res.status(400).json({ ok: false, message });
    });
  };

  app.get("/api/standalone/social-library", async (_req: Request, res: Response) => {
    try {
      const [assets, draft, platforms, logs, namedDrafts] = await Promise.all([
        listSocialLibraryAssets(ctx.db),
        getSocialLibraryDraft(ctx.db),
        listSocialLibraryPlatformStatus(ctx.db),
        listSocialLibraryLogs(ctx.db),
        listSocialLibraryNamedDrafts(ctx.db)
      ]);
      return res.json({ ok: true, assets, draft, platforms, logs, namedDrafts });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/assets", runUpload, async (req: Request, res: Response) => {
    try {
      const uploadedFiles = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
      const poster = uploadedFiles.find((f) => f.fieldname === "poster");
      const file = uploadedFiles.find((f) => f.fieldname !== "poster") ?? uploadedFiles[0];
      if (!file) return res.status(400).json({ ok: false, message: "请选择图片或视频。" });
      const originalNameRaw = String((req.body as { originalName?: string } | undefined)?.originalName ?? "").trim();
      const originalName = originalNameRaw || normalizeUploadName(file.originalname ?? file.filename ?? "video.mp4");
      const ext = extFromUpload(originalName, file.mimetype);
      if (!ALLOWED_EXT.has(ext)) {
        fs.unlink(file.path, () => {});
        if (poster) fs.unlink(poster.path, () => {});
        return res.status(400).json({ ok: false, message: "图片请用 png/jpg/jpeg/webp/gif，视频请用 mp4。" });
      }
      const kind: SocialLibraryAssetKind = VIDEO_EXT.has(ext) ? "video" : "image";
      if (kind === "video" && poster?.path) {
        saveSocialLibraryPosterFile(file.filename, poster.path);
        fs.unlink(poster.path, () => {});
      } else if (poster?.path) {
        fs.unlink(poster.path, () => {});
      }
      if (kind === "video" && !fs.existsSync(socialLibraryPosterPath(file.filename))) {
        void extractSocialLibraryVideoPoster(file.filename, file.path);
      }
      const asset = await insertSocialLibraryAsset(ctx.db, {
        kind,
        fileName: ensureDisplayName(originalName, ext),
        storedName: file.filename,
        mime: file.mimetype,
        sizeBytes: file.size,
        url: socialLibraryPublicUrl(file.filename)
      });
      const id = Number(asset.id);
      console.info("[social-library] uploaded", { id, kind, name: asset.fileName, bytes: asset.sizeBytes });
      return res.json({
        ok: true,
        id,
        asset: {
          id,
          kind: asset.kind,
          fileName: asset.fileName,
          storedName: asset.storedName,
          mime: asset.mime,
          sizeBytes: Number(asset.sizeBytes) || 0,
          url: asset.url,
          posterUrl: asset.posterUrl || "",
          createdAt: asset.createdAt
        }
      });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/standalone/social-library/assets/:id", async (req: Request, res: Response) => {
    try {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      await deleteSocialLibraryAsset(ctx.db, params.id);
      return res.json({ ok: true });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.put("/api/standalone/social-library/draft", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().max(200).optional(),
          body: z.string().max(20000).optional(),
          selectedAssetIds: z.array(z.number().int().positive()).max(12).optional(),
          selectedPlatforms: z.array(z.enum(SOCIAL_LIBRARY_PLATFORMS)).max(5).optional()
        })
        .parse(req.body ?? {});
      const draft = await saveSocialLibraryDraft(ctx.db, body);
      return res.json({ ok: true, draft });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/named-drafts", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().min(1).max(200),
          body: z.string().max(20000).optional(),
          selectedAssetIds: z.array(z.number().int().positive()).max(12).optional(),
          selectedPlatforms: z.array(z.enum(SOCIAL_LIBRARY_PLATFORMS)).max(5).optional()
        })
        .parse(req.body ?? {});
      const working = await saveSocialLibraryDraft(ctx.db, body);
      const named = await upsertSocialLibraryNamedDraft(ctx.db, {
        title: working.title,
        body: working.body,
        selectedAssetIds: working.selectedAssetIds,
        selectedPlatforms: working.selectedPlatforms
      });
      const namedDrafts = await listSocialLibraryNamedDrafts(ctx.db);
      return res.json({ ok: true, draft: working, named, namedDrafts });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/named-drafts/:id/load", async (req: Request, res: Response) => {
    try {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const list = await listSocialLibraryNamedDrafts(ctx.db);
      const named = list.find((row) => row.id === params.id);
      if (!named) return res.status(404).json({ ok: false, message: "草稿不存在。" });
      const draft = await saveSocialLibraryDraft(ctx.db, {
        title: named.title,
        body: named.body,
        selectedAssetIds: named.selectedAssetIds,
        selectedPlatforms: named.selectedPlatforms
      });
      return res.json({ ok: true, draft });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/standalone/social-library/named-drafts/:id", async (req: Request, res: Response) => {
    try {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      await deleteSocialLibraryNamedDraft(ctx.db, params.id);
      const namedDrafts = await listSocialLibraryNamedDrafts(ctx.db);
      return res.json({ ok: true, namedDrafts });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/standalone/social-library/channels", async (_req: Request, res: Response) => {
    try {
      const channels = await listChannelAccounts(ctx.db);
      return res.json({ ok: true, channels });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/channels/nostr/publish", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().max(300).optional().default(""),
          body: z.string().max(8000).optional().default(""),
          assetIds: z.array(z.number().int().positive()).max(20).optional().default([])
        })
        .parse(req.body ?? {});
      const result = await publishNostrChannel(ctx.db, body);
      await rememberChannelPublish(ctx.db, body.title, result).catch(() => undefined);
      return res.json({ ok: true, result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e).slice(0, 800);
      const title = String((req.body as { title?: string } | null)?.title ?? "");
      await rememberChannelPublish(ctx.db, title, { platform: "nostr", ok: false, message }).catch(() => undefined);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/social-library/channels/telegram/publish", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().max(300).optional().default(""),
          body: z.string().max(8000).optional().default(""),
          assetIds: z.array(z.number().int().positive()).max(20).optional().default([])
        })
        .parse(req.body ?? {});
      const result = await publishTelegramChannel(ctx.db, body);
      await rememberChannelPublish(ctx.db, body.title, result).catch(() => undefined);
      return res.json({ ok: true, result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e).slice(0, 800);
      const title = String((req.body as { title?: string } | null)?.title ?? "");
      await rememberChannelPublish(ctx.db, title, { platform: "telegram", ok: false, message }).catch(() => undefined);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/social-library/channels/slack/publish", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().max(300).optional().default(""),
          body: z.string().max(8000).optional().default(""),
          assetIds: z.array(z.number().int().positive()).max(20).optional().default([])
        })
        .parse(req.body ?? {});
      const result = await publishSlackChannel(ctx.db, body);
      await rememberChannelPublish(ctx.db, body.title, result).catch(() => undefined);
      return res.json({ ok: true, result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e).slice(0, 800);
      const title = String((req.body as { title?: string } | null)?.title ?? "");
      await rememberChannelPublish(ctx.db, title, { platform: "slack", ok: false, message }).catch(() => undefined);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/social-library/channels", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          id: z.string().max(32),
          account: z.string().max(300).optional(),
          secret: z.string().max(4000).optional(),
          extra: z.string().max(1000).optional()
        })
        .parse(req.body ?? {});
      const channel = await saveChannelAccount(ctx.db, body.id, {
        account: body.account,
        secret: body.secret,
        extra: body.extra
      });
      return res.json({ ok: true, channel });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/settings", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          devtoApiKey: z.string().max(512).optional(),
          mastodonInstanceUrl: z.string().max(512).optional(),
          mastodonAccessToken: z.string().max(1024).optional(),
          blueskyHandle: z.string().max(256).optional(),
          blueskyAppPassword: z.string().max(256).optional(),
          linkedinAccessToken: z.string().max(4096).optional(),
          linkedinMemberUrn: z.string().max(128).optional(),
          wechatAppId: z.string().max(128).optional(),
          wechatAppSecret: z.string().max(256).optional(),
          wechatThumbMediaId: z.string().max(256).optional()
        })
        .parse(req.body ?? {});
      const platforms = await saveSocialLibraryPlatformSettings(ctx.db, body);
      return res.json({ ok: true, platforms });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/logs", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          entries: z
            .array(
              z.object({
                title: z.string().max(200).optional().default(""),
                results: z
                  .array(
                    z.object({
                      platform: z.literal("tiktok"),
                      ok: z.boolean(),
                      message: z.string().max(800),
                      url: z.string().max(2048).optional()
                    })
                  )
                  .min(1)
                  .max(8)
              })
            )
            .min(1)
            .max(40)
        })
        .parse(req.body ?? {});
      for (const entry of body.entries) {
        const okCount = entry.results.filter((row) => row.ok).length;
        const status = okCount === entry.results.length ? "ok" : okCount > 0 ? "partial" : "failed";
        await insertSocialLibraryLog(ctx.db, {
          title: entry.title.trim() || "TikTok",
          platforms: [],
          status,
          results: entry.results
        });
      }
      const logs = await listSocialLibraryLogs(ctx.db);
      return res.json({ ok: true, logs });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/social-library/publish", async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          title: z.string().max(200).optional(),
          body: z.string().max(20000).optional(),
          assetIds: z.array(z.number().int().positive()).max(12).optional(),
          platforms: z.array(z.enum(SOCIAL_LIBRARY_PLATFORMS)).min(1).max(5)
        })
        .parse(req.body ?? {});
      const result = await publishSocialLibraryNow(ctx.db, {
        title: body.title ?? "",
        body: body.body ?? "",
        assetIds: body.assetIds ?? [],
        platforms: body.platforms
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
}
