import type { Express } from "express";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { requireAuth, resolveTenantId } from "../middleware/auth.js";

type Ctx = { db: Pool };
type RangeId = "today" | "7d" | "30d" | "custom";

function rangeStart(range: RangeId): Date {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function registerDashboardRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  app.get("/api/dashboard/overview", requireAuth(db), async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const parsed = z
        .object({
          range: z.enum(["today", "7d", "30d", "custom"]).optional().default("today"),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
        .parse(req.query);
      const range = parsed.range as RangeId;
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const hasCustom = range === "custom";
      if (hasCustom) {
        if (!parsed.startDate || !parsed.endDate || !dateRe.test(parsed.startDate) || !dateRe.test(parsed.endDate)) {
          return res
            .status(400)
            .json({ ok: false, message: "自定义时间段需要 startDate/endDate，格式为 YYYY-MM-DD" });
        }
      }

      const startAt = hasCustom ? new Date(`${parsed.startDate}T00:00:00`) : rangeStart(range as Exclude<RangeId, "custom">);
      const endAtExclusive = hasCustom ? new Date(`${parsed.endDate}T00:00:00`) : null;
      if (endAtExclusive) {
        endAtExclusive.setDate(endAtExclusive.getDate() + 1);
        if (startAt.getTime() >= endAtExclusive.getTime()) {
          return res.status(400).json({ ok: false, message: "自定义时间段错误：开始日期需早于结束日期" });
        }
      }

      const createdAtWhere = hasCustom ? "created_at >= ? AND created_at < ?" : "created_at >= ?";
      const createdAtParams = hasCustom ? [startAt, endAtExclusive] : [startAt];

      const [[healthDb]] = await db.query<RowDataPacket[]>("SELECT 1 as ok");
      const [[leadRow]] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM leads WHERE tenant_id = ? AND ${createdAtWhere}`,
        [tenantId, ...createdAtParams]
      );
      const [[mailSendRow]] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS sent_total, SUM(status='sent') AS sent_ok FROM email_sends WHERE tenant_id = ? AND ${createdAtWhere}`,
        [tenantId, ...createdAtParams]
      );
      const [[campaignRow]] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM email_campaigns WHERE tenant_id = ? AND ${createdAtWhere}`,
        [tenantId, ...createdAtParams]
      );
      const [[followupPendingRow]] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS c FROM crm_contact_followups WHERE tenant_id = ? AND next_followup_at IS NOT NULL AND next_followup_at <= CURDATE()",
        [tenantId]
      );
      const [recentCampaignRows] = await db.query<RowDataPacket[]>(
        "SELECT id, name, status, updated_at FROM email_campaigns WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 5",
        [tenantId]
      );
      const [recentLeadRows] = await db.query<RowDataPacket[]>(
        "SELECT id, company_name, primary_email, email_status, created_at FROM leads WHERE tenant_id = ? ORDER BY id DESC LIMIT 5",
        [tenantId]
      );

      // 发布中心当前仍以本地存储演示为主，先保留占位为 0，后续接服务端落库。
      const publishTotal = 0;
      const publishSuccessRate = 0;
      const errorCount1h = 0;

      const sentTotal = Number(mailSendRow?.sent_total ?? 0);
      const sentOk = Number(mailSendRow?.sent_ok ?? 0);
      const emailDeliverRate = sentTotal > 0 ? sentOk / sentTotal : 0;

      return res.json({
        ok: true,
        range,
        generatedAt: new Date().toISOString(),
        health: {
          api: "ok",
          db: Number(healthDb?.ok ?? 0) === 1 ? "ok" : "error",
          errorCount1h,
          missingConfigs: []
        },
        kpis: {
          publishTotal,
          publishSuccessRate,
          leadsNew: Number(leadRow?.c ?? 0),
          emailSent: sentTotal,
          emailDeliverRate,
          alertsPending: Number(followupPendingRow?.c ?? 0)
        },
        publish: {
          running: 0,
          scheduled: 0,
          failed: 0,
          byPlatform: [],
          recent: []
        },
        leads: {
          newCount: Number(leadRow?.c ?? 0),
          pendingFollowups: Number(followupPendingRow?.c ?? 0),
          recent: recentLeadRows.map((r) => ({
            id: String(r.id),
            companyName: String(r.company_name ?? "未命名"),
            primaryEmail: r.primary_email ? String(r.primary_email) : null,
            emailStatus: String(r.email_status ?? "unverified"),
            createdAt: String(r.created_at)
          }))
        },
        email: {
          campaigns: Number(campaignRow?.c ?? 0),
          sent: sentTotal,
          deliverRate: emailDeliverRate,
          recentCampaigns: recentCampaignRows.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? "未命名活动"),
            status: String(r.status ?? "draft"),
            updatedAt: String(r.updated_at)
          }))
        }
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    }
  });
}

