import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { resolveTenantId } from "../middleware/auth.js";
import { getStudioStatus, runStudioChat, runStudioCopy, runStudioTxt2Img } from "../services/standaloneStudio.js";
import { getStudioVideoJob, startStudioVideoJob } from "../services/standaloneStudioVideo.js";

function publicJob(job: ReturnType<typeof getStudioVideoJob>) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    provider: job.provider,
    durationSec: job.durationSec,
    asset: job.asset || null
  };
}

export function registerStandaloneStudioRoutes(app: Express, ctx: { db: Pool }) {
  app.get("/api/standalone/studio/status", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const status = await getStudioStatus(ctx.db, tenantId);
      return res.json({ ok: true, ...status });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/standalone/studio/chat", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z
        .object({
          messages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1).max(8000)
              })
            )
            .min(1)
            .max(40),
          imageBase64: z.string().max(18_000_000).optional()
        })
        .parse(req.body ?? {});
      const turn = await runStudioChat({
        db: ctx.db,
        tenantId,
        messages: body.messages,
        imageBase64: body.imageBase64
      });
      return res.json({ ok: true, ...turn });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status = message.includes("请先") || message.includes("未") ? 400 : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/studio/txt2img", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z
        .object({
          prompt: z.string().max(4000).optional(),
          negative: z.string().max(2000).optional(),
          imageChoice: z.enum(["auto", "kolors", "turbo", "qwen"]).optional(),
          styleImageBase64: z.string().max(18_000_000).optional()
        })
        .parse(req.body ?? {});
      const result = await runStudioTxt2Img({
        db: ctx.db,
        tenantId,
        prompt: body.prompt || "",
        negative: body.negative,
        imageChoice: body.imageChoice,
        styleImageBase64: body.styleImageBase64
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("请填写") || message.includes("未配置") || message.includes("失败") ? 400 : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/studio/copy", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z.object({ prompt: z.string().min(1).max(4000) }).parse(req.body ?? {});
      const result = await runStudioCopy({ db: ctx.db, tenantId, prompt: body.prompt });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status = message.includes("请先") || message.includes("请填写") ? 400 : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.post("/api/standalone/studio/video", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    try {
      const body = z
        .object({
          prompt: z.string().min(1).max(7000),
          durationSec: z.coerce.number().int().min(1).max(300),
          ratio: z.enum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]).optional(),
          imageAssetId: z.coerce.number().int().positive().optional(),
          imageBase64: z.string().max(18_000_000).optional(),
          negative: z.string().max(2000).optional()
        })
        .parse(req.body ?? {});
      const job = await startStudioVideoJob({
        db: ctx.db,
        tenantId,
        prompt: body.prompt,
        durationSec: body.durationSec,
        ratio: body.ratio,
        imageAssetId: body.imageAssetId,
        imageBase64: body.imageBase64,
        negative: body.negative
      });
      return res.json({ ok: true, job: publicJob(job) });
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      const status =
        message.includes("请填写") || message.includes("未配置") || message.includes("参考图") ? 400 : 500;
      return res.status(status).json({ ok: false, message });
    }
  });

  app.get("/api/standalone/studio/video/:id", async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) return res.status(401).json({ ok: false, message: "未登录" });
    const job = getStudioVideoJob(String(req.params.id || ""), tenantId);
    if (!job) return res.status(404).json({ ok: false, message: "任务不存在或已过期。" });
    return res.json({ ok: true, job: publicJob(job) });
  });
}
