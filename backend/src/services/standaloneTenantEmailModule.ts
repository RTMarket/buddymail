import type { Pool } from "mysql2/promise";
import { getOpenCorePlanTierId, getOpenCoreDailySendLimit } from "../lib/openCoreConfig.js";
import { setTargetTierFromSubscription } from "./tenantSendTier.js";

/**
 * 开源版：将 env 默认档位同步到 tenant_product_modules（无 LICENSE 体系）。
 */
export async function ensureStandaloneTenantEmailModule(db: Pool, tenantId: number): Promise<void> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;
  const planTierId = getOpenCorePlanTierId();
  const dailySendLimit = Math.max(1, getOpenCoreDailySendLimit());

  await db.query(
    `INSERT INTO tenant_product_modules
      (tenant_id, module, status, monthly_price_cents, simulated_paid_at, email_tier_id, daily_send_limit)
     VALUES (?, 'email', 'active', 0, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE
       status = 'active',
       simulated_paid_at = COALESCE(simulated_paid_at, NOW()),
       email_tier_id = VALUES(email_tier_id),
       daily_send_limit = VALUES(daily_send_limit)`,
    [tenantId, planTierId, dailySendLimit]
  );

  try {
    await setTargetTierFromSubscription(db, tenantId, planTierId, dailySendLimit);
  } catch (e) {
    console.warn("[standalone] setTargetTierFromSubscription:", (e as Error)?.message ?? e);
  }

  /**
   * 开源版：不走 SaaS 预热曲线，首日即按 env 配置全量日发。
   * warmup_started_at 锚定 15 天前 → computeWarmupFactor = 1.0；daily_limit 与 LICENSE 对齐。
   */
  try {
    await db.query(
      `UPDATE tenant_send_tier
          SET warmup_started_at = DATE_SUB(NOW(), INTERVAL 15 DAY),
              target_daily_limit = ?,
              daily_limit = ?
        WHERE tenant_id = ?`,
      [dailySendLimit, dailySendLimit, tenantId]
    );
  } catch (e) {
    console.warn("[standalone] full daily release:", (e as Error)?.message ?? e);
  }
}
