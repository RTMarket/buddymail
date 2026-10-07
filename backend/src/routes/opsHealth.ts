import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { resolveTenantId } from "../middleware/auth.js";
import {
  ensureTierState,
  getRemainingDailyQuota,
  selfUnsuspendIfEligible,
  evalGrowthPlan,
  TIER_CONFIG,
  isSendCircuitBreakerEnforced,
  refreshOneTenantAndMaybeBreak,
  queryTenantSendWindow
} from "../services/tenantSendTier.js";

type Ctx = { db: Pool };

/**
 * 开源版运维健康度 API（对应前端 EmailOpsHealthPage）。
 * 仅暴露 tier 状态与自助解封；商业版 SES 身份管理/关键词检查等不在此。
 */
export function registerOpsHealthRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  app.get("/api/email/ses/tier", async (req, res) => {
    const tenantId = resolveTenantId(req);
    try {
      await refreshOneTenantAndMaybeBreak(db, tenantId);
    } catch {
      /* 指标刷新失败不阻断面板 */
    }
    const t = await ensureTierState(db, tenantId);
    const q = await getRemainingDailyQuota(db, tenantId);
    const circuitBreakerEnforced = isSendCircuitBreakerEnforced();
    const tierDef = TIER_CONFIG[t.tier];
    const targetDef = t.target_tier ? TIER_CONFIG[t.target_tier] : null;
    const growthPlan = evalGrowthPlan(t);
    const win1000 = await queryTenantSendWindow(db, tenantId, 1000);
    const win100 = await queryTenantSendWindow(db, tenantId, 100);
    const delivered1000 = Math.max(0, win1000.attempted - win1000.bounced);
    res.json({
      ok: true,
      tier: t.tier,
      tierLabel: tierDef.label,
      tierEmoji: tierDef.emoji,
      targetTier: t.target_tier,
      targetTierLabel: targetDef?.label ?? null,
      targetTierEmoji: targetDef?.emoji ?? null,
      dailyLimit: q.limit,
      targetDailyLimit: t.target_daily_limit,
      usedToday: q.usedToday,
      remainingToday: q.remaining,
      isSuspended: q.isSuspended,
      suspensionReason: q.suspensionReason,
      circuitBreakerEnforced,
      selfUnsuspendUsed: t.self_unsuspend_count >= 1,
      violationStrikeCount: t.is_suspended === 1 ? Math.min(99, Number(t.self_unsuspend_count ?? 0) + 1) : 0,
      windowRecent100: {
        attempted: win100.attempted,
        bounced: win100.bounced,
        complaint: win100.complaint,
        opened: win100.opened,
        delivered: Math.max(0, win100.attempted - win100.bounced)
      },
      windowRecent1000: {
        attempted: win1000.attempted,
        bounced: win1000.bounced,
        complaint: win1000.complaint,
        opened: win1000.opened,
        delivered: delivered1000
      },
      growthPlan,
      lastMetricRefreshAt: t.last_metric_refresh_at
    });
  });

  /** 自助解封：仅允许第一次（self_unsuspend_count = 0） */
  app.post("/api/email/ses/tier/self-unsuspend", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const r = await selfUnsuspendIfEligible(db, tenantId);
    if (!r.ok) return res.status(400).json({ ok: false, message: r.reason });
    res.json({ ok: true });
  });
}
