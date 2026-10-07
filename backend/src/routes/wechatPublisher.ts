import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import multer from "multer";
import { z } from "zod";
import {
  buildWechatVideoEmbedHtml,
  createWechatScheduledPublish,
  createWechatDraftFromHtml,
  debugWechatPublishedSync,
  deleteRemoteWechatDraft,
  diagnoseWechatDraftForPublish,
  getRemoteWechatDraftDetail,
  getWechatPublishStatus,
  getWechatAccessTokenForDatacube,
  getWechatSettings,
  getWechatVideoMaterialStatus,
  importWechatPublishedArticleUrl,
  listWechatScheduledPublishes,
  listRemoteWechatDrafts,
  listRemoteWechatPublishedArticles,
  saveWechatSettings,
  submitWechatDraftByMediaId,
  testWechatConnection,
  updateRemoteWechatDraft,
  uploadWechatContentImage,
  uploadWechatThumbMaterial,
  uploadWechatVideoMaterial
} from "../services/socialPublishingWechat.js";
import { loadWechatArticleEmailStatsByTemplateIds } from "../services/wechatArticleEmailStats.js";
import {
  buildWechatArticleGoUrl,
  loadWechatArticleStatsBatch,
  logWechatArticleGoClick,
  resolveWechatArticleGoRedirect,
  upsertWechatArticleRegistry
} from "../services/wechatArticleStats.js";
import { resolveTenantId } from "../middleware/auth.js";

function formatWechatSettingsError(e: unknown): string {
  if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const labels: Record<string, string> = {
      appId: "AppID",
      appSecret: "AppSecret",
      thumbMediaId: "封面 thumb_media_id",
      author: "作者名"
    };
    return (e as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
      .map((issue) => {
        const key = String(issue.path[0] ?? "");
        const label = labels[key] ?? key;
        if (issue.message.includes("too_small") || issue.message.includes("at least 1")) {
          return `${label} 不能为空`;
        }
        return `${label}：${issue.message}`;
      })
      .join("；");
  }
  return String((e as Error)?.message ?? e);
}

const wechatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

function isAllowedWechatImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return host === "mmbiz.qpic.cn" || host.endsWith(".qpic.cn") || host.endsWith(".qq.com");
  } catch {
    return false;
  }
}

export function registerWechatPublisherRoutes(app: Express, ctx: { db: Pool }) {
  const parseSlot = (v: unknown): number => (Number(v) === 2 ? 2 : 1);
  /** 每日文章（cron 写的 Markdown 草稿，草稿箱页直接按账号分区展示） */
  app.get("/api/wechat-official/cron-drafts", async (_req, res) => {
    try {
      const [rows] = await ctx.db.query(
        "SELECT id, filename, title, account_name AS accountName, slot, created_at AS createdAt, " +
          "updated_at AS updatedAt, status, submitted_at AS submittedAt, media_id AS mediaId, " +
          "CHAR_LENGTH(content_md) AS chars " +
          "FROM bigsocialboss.wechat_cron_drafts ORDER BY created_at DESC LIMIT 60"
      );
      return res.json({ ok: true, drafts: rows });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
  app.post("/api/wechat-official/cron-drafts", async (req, res) => {
    try {
      const body = z
        .object({
          slot: z.number().int().min(1).max(2),
          title: z.string().min(1).max(200),
          contentMd: z.string().min(1).max(500000)
        })
        .parse(req.body ?? {});
      const slot = body.slot === 2 ? 2 : 1;
      const accountName = slot === 2 ? "跨境电商服务商" : "BigSocialBoss";
      const filename = `manual-${Date.now()}.md`;
      const [result] = await ctx.db.query(
        "INSERT INTO bigsocialboss.wechat_cron_drafts (filename, title, account_name, slot, content_md, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 'local')",
        [filename, body.title.trim(), accountName, slot, body.contentMd]
      );
      const insertId = (result as { insertId?: number }).insertId ?? 0;
      return res.json({ ok: true, id: insertId, message: "已保存到草稿箱。" });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
  app.get("/api/wechat-official/cron-drafts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ ok: false, message: "id 非法" });
      const [rows] = await ctx.db.query(
        "SELECT id, filename, title, account_name AS accountName, slot, content_md AS contentMd, " +
          "created_at AS createdAt, updated_at AS updatedAt, status, submitted_at AS submittedAt, media_id AS mediaId " +
          "FROM bigsocialboss.wechat_cron_drafts WHERE id = ?",
        [id]
      );
      const list = rows as Array<Record<string, unknown>>;
      if (!list.length) return res.status(404).json({ ok: false, message: "文章不存在" });
      return res.json({ ok: true, draft: list[0] });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
  /** 更新草稿（标题/正文），保存后更新 updated_at */
  app.put("/api/wechat-official/cron-drafts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ ok: false, message: "id 非法" });
      const body = z
        .object({
          title: z.string().min(1).max(200),
          contentMd: z.string().min(1).max(500000)
        })
        .parse(req.body ?? {});
      const [result] = await ctx.db.query(
        "UPDATE bigsocialboss.wechat_cron_drafts SET title = ?, content_md = ?, updated_at = NOW() WHERE id = ?",
        [body.title.trim(), body.contentMd, id]
      );
      const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
      if (!affected) return res.status(404).json({ ok: false, message: "文章不存在" });
      return res.json({ ok: true, message: "已保存。" });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
  /** 提交草稿到微信公众号草稿箱（前端传已转好的 HTML），成功后更新 status/submitted_at/media_id */
  app.post("/api/wechat-official/cron-drafts/:id/submit", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ ok: false, message: "id 非法" });
      const body = z
        .object({
          slot: z.number().int().min(1).max(2).optional(),
          title: z.string().min(1).max(64),
          contentHtml: z.string().min(1).max(120000),
          digest: z.string().max(120).optional(),
          author: z.string().max(128).optional(),
          thumbMediaId: z.string().max(256).optional()
        })
        .parse(req.body ?? {});
      const slot = parseSlot(body.slot);
      const [rows] = await ctx.db.query(
        "SELECT media_id AS mediaId FROM bigsocialboss.wechat_cron_drafts WHERE id = ?",
        [id]
      );
      const list = rows as Array<{ mediaId?: string | null }>;
      if (!list.length) return res.status(404).json({ ok: false, message: "文章不存在" });
      const existingMediaId = list[0].mediaId?.trim() || "";
      let mediaId: string;
      if (existingMediaId) {
        await updateRemoteWechatDraft(ctx.db, existingMediaId, {
          title: body.title,
          contentHtml: body.contentHtml,
          digest: body.digest ?? "",
          author: body.author ?? "",
          thumbMediaId: body.thumbMediaId ?? ""
        }, slot);
        mediaId = existingMediaId;
      } else {
        const result = await createWechatDraftFromHtml(ctx.db, {
          title: body.title,
          contentHtml: body.contentHtml,
          digest: body.digest ?? "",
          author: body.author ?? "",
          thumbMediaId: body.thumbMediaId ?? ""
        }, slot);
        mediaId = result.mediaId;
      }
      await ctx.db.query(
        "UPDATE bigsocialboss.wechat_cron_drafts SET status = 'submitted', submitted_at = NOW(), media_id = ? WHERE id = ?",
        [mediaId, id]
      );
      return res.json({ ok: true, mediaId, message: "已提交到微信公众号草稿箱。" });
    } catch (e: unknown) {
      try {
        const id = Number(req.params.id);
        if (Number.isInteger(id) && id > 0) {
          await ctx.db.query(
            "UPDATE bigsocialboss.wechat_cron_drafts SET status = 'failed' WHERE id = ?",
            [id]
          );
        }
      } catch { /* 忽略状态回写失败 */ }
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });
  app.get("/api/wechat-official/image-proxy", async (req, res) => {
    const url = String(req.query.url ?? "").trim();
    if (!url || !isAllowedWechatImageUrl(url)) {
      return res.status(400).send("invalid image url");
    }
    try {
      const upstream = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Referer: "https://mp.weixin.qq.com/"
        }
      });
      if (!upstream.ok) return res.status(upstream.status).send("image fetch failed");
      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) return res.status(415).send("not an image");
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(bytes);
    } catch (e: unknown) {
      return res.status(502).send(String((e as Error)?.message ?? e));
    }
  });

  app.get("/api/wechat-official/settings", async (req, res) => {
    try {
      const settings = await getWechatSettings(ctx.db, parseSlot(req.query.slot));
      return res.json({ ok: true, settings });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/settings", async (req, res) => {
    try {
      const body = z
        .object({
          slot: z.number().int().min(1).max(2).optional(),
          appId: z.string().min(1, "AppID 不能为空").max(128),
          appSecret: z.string().max(512).optional(),
          accountName: z.string().max(128).optional(),
          author: z.string().max(128).optional(),
          thumbMediaId: z.string().max(256).optional()
        })
        .parse(req.body ?? {});
      const settings = await saveWechatSettings(ctx.db, body, parseSlot(body.slot));
      return res.json({ ok: true, settings });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: formatWechatSettingsError(e) });
    }
  });

  app.post("/api/wechat-official/test-connection", async (req, res) => {
    try {
      const result = await testWechatConnection(ctx.db, parseSlot(req.body?.slot));
      return res.json({ ok: result.ok, message: result.message });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/drafts/remote", async (req, res) => {
    try {
      const drafts = await listRemoteWechatDrafts(ctx.db, parseSlot(req.query.slot));
      return res.json({ ok: true, drafts });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/drafts/remote/:mediaId", async (req, res) => {
    try {
      const mediaId = String(req.params.mediaId ?? "").trim();
      if (!mediaId) return res.status(400).json({ ok: false, message: "缺少 media_id。" });
      const draft = await getRemoteWechatDraftDetail(ctx.db, mediaId, parseSlot(req.query.slot));
      return res.json({ ok: true, draft });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.delete("/api/wechat-official/drafts/remote/:mediaId", async (req, res) => {
    try {
      const mediaId = String(req.params.mediaId ?? "").trim();
      if (!mediaId) return res.status(400).json({ ok: false, message: "缺少 media_id。" });
      const result = await deleteRemoteWechatDraft(ctx.db, mediaId, parseSlot(req.query.slot));
      return res.json({ ok: true, message: result.message });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/published/remote", async (req, res) => {
    try {
      const articles = await listRemoteWechatPublishedArticles(ctx.db, parseSlot(req.query.slot));
      return res.json({ ok: true, articles });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/published/debug", async (req, res) => {
    try {
      const debug = await debugWechatPublishedSync(ctx.db, parseSlot(req.query.slot));
      return res.json({ ok: true, debug });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/published/import-url", async (req, res) => {
    try {
      const body = z
        .object({
          url: z.string().min(1).max(2000),
          title: z.string().max(256).optional(),
          accountName: z.string().max(128).optional(),
          publishedAt: z.string().max(64).optional()
        })
        .parse(req.body ?? {});
      const article = await importWechatPublishedArticleUrl(body);
      return res.json({ ok: true, article });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/cover/upload", wechatUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer?.length) return res.status(400).json({ ok: false, message: "请选择封面图片。" });
      const result = await uploadWechatThumbMaterial(ctx.db, file.buffer, file.originalname || "cover.jpg", parseSlot(req.query.slot ?? req.body?.slot));
      return res.json({ ok: true, thumbMediaId: result.thumbMediaId, url: result.url });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/content/upload-image", wechatUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer?.length) return res.status(400).json({ ok: false, message: "请选择图片。" });
      const result = await uploadWechatContentImage(ctx.db, file.buffer, file.originalname || "content.jpg", parseSlot(req.query.slot ?? req.body?.slot));
      return res.json({ ok: true, url: result.url });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/content/upload-video", wechatUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer?.length) return res.status(400).json({ ok: false, message: "请选择 MP4 视频。" });
      const title = String(req.body?.title ?? "视频").trim() || "视频";
      const introduction = String(req.body?.introduction ?? title).trim();
      const result = await uploadWechatVideoMaterial(ctx.db, file.buffer, file.originalname || "video.mp4", {
        title,
        introduction
      }, parseSlot(req.body?.slot));
      return res.json({ ok: true, mediaId: result.mediaId, message: "视频已上传，微信后台正在转码，请稍候查询状态。" });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/content/video-status", async (req, res) => {
    try {
      const mediaId = String(req.query.mediaId ?? "").trim();
      if (!mediaId) return res.status(400).json({ ok: false, message: "缺少 mediaId。" });
      const status = await getWechatVideoMaterialStatus(ctx.db, mediaId, parseSlot(req.query.slot));
      const embedHtml = status.ready && status.downUrl ? buildWechatVideoEmbedHtml(status.title, status.downUrl) : null;
      return res.json({ ok: true, ...status, embedHtml });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/drafts/sync", async (req, res) => {
    try {
      const PIC_CROP_PATTERN = /^(\d+(?:\.\d+)?_){3}\d+(?:\.\d+)?$/;

      const body = z
        .object({
          slot: z.number().int().min(1).max(2).optional(),
          title: z.string().min(1).max(64),
          digest: z.string().max(120).optional(),
          contentHtml: z.string().min(1).max(120000),
          author: z.string().max(128).optional(),
          contentSourceUrl: z.string().max(512).optional(),
          thumbMediaId: z.string().max(256).optional(),
          mediaId: z.string().max(256).optional(),
          picCrop2351: z.string().max(64).regex(PIC_CROP_PATTERN).optional(),
          picCrop11: z.string().max(64).regex(PIC_CROP_PATTERN).optional()
        })
        .parse(req.body ?? {});
      const slot = parseSlot(body.slot);
      if (body.mediaId) {
        await updateRemoteWechatDraft(ctx.db, body.mediaId, body, slot);
        return res.json({ ok: true, mediaId: body.mediaId, message: "草稿已更新到微信公众号草稿箱。" });
      }
      const result = await createWechatDraftFromHtml(ctx.db, body, slot);
      return res.json({ ok: true, mediaId: result.mediaId, message: result.message });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/publish", async (req, res) => {
    try {
      const body = z.object({ mediaId: z.string().min(1).max(256), slot: z.number().int().min(1).max(2).optional() }).parse(req.body ?? {});
      const result = await submitWechatDraftByMediaId(ctx.db, body.mediaId, parseSlot(body.slot));
      return res.json({ ok: true, publishId: result.publishId, message: result.message, publishedAt: new Date().toISOString() });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/publish/diagnose", async (req, res) => {
    try {
      const body = z.object({ mediaId: z.string().min(1).max(256) }).parse(req.body ?? {});
      const diagnostic = await diagnoseWechatDraftForPublish(ctx.db, body.mediaId, parseSlot(req.body?.slot));
      return res.json({ ok: true, diagnostic });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/publish/status/:publishId", async (req, res) => {
    try {
      const publishId = String(req.params.publishId ?? "").trim();
      if (!publishId) return res.status(400).json({ ok: false, message: "缺少 publish_id。" });
      const status = await getWechatPublishStatus(ctx.db, publishId);
      return res.json({ ok: true, status });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/wechat-official/publish/scheduled", async (_req, res) => {
    try {
      const tasks = await listWechatScheduledPublishes(ctx.db);
      return res.json({ ok: true, tasks });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/publish/scheduled", async (req, res) => {
    try {
      const body = z
        .object({
          mediaId: z.string().min(1).max(256),
          localId: z.string().max(128).optional(),
          title: z.string().max(512).optional(),
          scheduledAt: z.string().min(1).max(64)
        })
        .parse(req.body ?? {});
      const tasks = await createWechatScheduledPublish(ctx.db, body);
      return res.json({ ok: true, tasks, message: "已创建定时正式发布任务。" });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 邮件内「阅读原文」追踪跳转（免登录） */
  app.get("/api/wechat-official/article-go", async (req, res) => {
    try {
      const draftId = String(req.query.d ?? "").trim();
      if (!draftId) return res.status(400).send("缺少文章标识。");
      const resolved = await resolveWechatArticleGoRedirect(ctx.db, draftId);
      if (!resolved) return res.status(404).send("文章链接未登记，请在微信公众号页保存文章链接。");
      const ip =
        String(req.headers["x-forwarded-for"] ?? "")
          .split(",")[0]
          ?.trim() || req.socket.remoteAddress || "";
      await logWechatArticleGoClick(
        ctx.db,
        resolved.tenantId,
        draftId,
        resolved.templateId,
        ip,
        String(req.headers["user-agent"] ?? "")
      );
      return res.redirect(302, resolved.redirectUrl);
    } catch (e: unknown) {
      return res.status(500).send(String((e as Error)?.message ?? e));
    }
  });

  app.get("/api/wechat-official/tracked-go-url", async (req, res) => {
    const draftId = String(req.query.d ?? "").trim();
    if (!draftId) return res.status(400).json({ ok: false, message: "缺少 d 参数。" });
    return res.json({ ok: true, url: buildWechatArticleGoUrl(draftId) });
  });

  app.post("/api/wechat-official/article-registry", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z
        .object({
          draftId: z.string().min(1).max(64),
          title: z.string().max(512).optional(),
          publishId: z.string().max(128).optional(),
          publishedArticleUrl: z.string().max(1200).optional(),
          linkedEmailTemplateId: z.number().int().positive().optional(),
          publishedAt: z.string().max(64).optional()
        })
        .parse(req.body ?? {});
      const result = await upsertWechatArticleRegistry(ctx.db, tenantId, body);
      return res.json({ ok: true, trackedGoUrl: result.trackedGoUrl });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/article-stats", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z
        .object({
          articles: z
            .array(
              z.object({
                draftId: z.string().min(1).max(64),
                publishId: z.string().max(128).optional(),
                publishedAt: z.string().max(64).optional(),
                linkedEmailTemplateId: z.number().int().positive().optional()
              })
            )
            .max(50)
        })
        .parse(req.body ?? {});
      const rows = await loadWechatArticleStatsBatch(ctx.db, tenantId, body.articles, () =>
        getWechatAccessTokenForDatacube(ctx.db)
      );
      const byDraftId: Record<
        string,
        {
          wechatOfficialReads: number | null;
          emailDrivenReads: number;
          emailSent: number;
          emailOpened: number;
          emailClicked: number;
          statsNote?: string;
        }
      > = {};
      for (const row of rows) {
        byDraftId[row.draftId] = {
          wechatOfficialReads: row.wechatOfficialReads,
          emailDrivenReads: row.emailDrivenReads,
          emailSent: row.emailSent,
          emailOpened: row.emailOpened,
          emailClicked: row.emailClicked,
          statsNote: row.statsNote
        };
      }
      return res.json({ ok: true, byDraftId });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/wechat-official/article-email-stats", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(401).json({ ok: false, message: "未登录" });
    }
    try {
      const body = z
        .object({
          templateIds: z.array(z.number().int().positive()).max(50)
        })
        .parse(req.body ?? {});
      const rows = await loadWechatArticleEmailStatsByTemplateIds(ctx.db, tenantId, body.templateIds);
      const byTemplateId: Record<string, { sent: number; opened: number; clicked: number; subscribed: number }> = {};
      for (const row of rows) {
        byTemplateId[String(row.templateId)] = {
          sent: row.sent,
          opened: row.opened,
          clicked: row.clicked,
          subscribed: row.subscribed
        };
      }
      return res.json({ ok: true, byTemplateId });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  }
