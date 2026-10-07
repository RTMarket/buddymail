import type { Pool } from "mysql2/promise";
import { getOpenCoreDailySendLimit } from "../lib/openCoreConfig.js";
import { isStandaloneMultiLanePremiumPack } from "../lib/standaloneMultiLanePremiumProfile.js";
import { countTenantDeliveredToday } from "./emailDeliveredCount.js";
import { ensureTierState } from "./tenantSendTier.js";

/** 开源版日发上限（.env OPEN_CORE_DAILY_SEND_LIMIT，默认 3000） */
export function standaloneLicenseDailyCap(): number {
  return Math.max(0, getOpenCoreDailySendLimit());
}

function applyStandaloneLicenseCeiling(cap: number): number {
  const lic = standaloneLicenseDailyCap();
  if (lic <= 0) return Math.max(0, cap);
  if (cap <= 0) return lic;
  return Math.min(cap, lic);
}

/** 租户当日送达成功（与营销活动统计页口径一致；不含 SMTP 失败与已匹配退信） */
export async function countTenantEmailSentToday(db: Pool, tenantId: number): Promise<number> {
  return countTenantDeliveredToday(db, tenantId);
}

/**
 * 当日发送上限：取「订阅套餐 tenant_product_modules.daily_send_limit」与
 * 「成长计划 tenant_send_tier.daily_limit（含免费 7 日试用 / 预热曲线）」的较小值。
 * 返回 0 表示当日不可再发（含试用期满未订阅）；返回 null 表示不应在此处限制（一般不会：
 * ensureTierState 总会给出 tier 行）。
 */
export async function getTenantEmailDailySendLimit(db: Pool, tenantId: number): Promise<number | null> {
  /** 多机组 5 万/10 万：套餐日发无上限，仅每专线 2.5 万送达封顶 */
  if (isStandaloneMultiLanePremiumPack()) {
    return null;
  }

  let tierCap = 0;
  try {
    const t = await ensureTierState(db, tenantId);
    tierCap = Math.max(0, Number(t.daily_limit ?? 0));
  } catch {
    tierCap = 0;
  }

  let subRow: {
    daily_send_limit: number | null;
    simulated_paid_at: unknown;
    email_tier_id: string | null;
    status: string;
  } | null = null;
  try {
    const [rows] = await db.query(
      `SELECT daily_send_limit, simulated_paid_at, email_tier_id, status
         FROM tenant_product_modules WHERE tenant_id = ? AND module = 'email' LIMIT 1`,
      [tenantId]
    );
    subRow = (rows as typeof subRow[])[0] ?? null;
  } catch {
    subRow = null;
  }

  let subCap: number | null = null;
  const v = subRow?.daily_send_limit;
  if (v != null) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) subCap = n;
  }

  let resolved: number;
  if (subCap == null) {
    resolved = tierCap > 0 ? tierCap : 0;
  } else {
    resolved = Math.min(subCap, tierCap > 0 ? tierCap : subCap);
  }
  return applyStandaloneLicenseCeiling(resolved);
}
