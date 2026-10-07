import type { Pool } from "mysql2/promise";
import { businessYmdFromDbDatetime } from "./businessCalendar.js";
/** 开源版：极简 modules_csv 解析（原商业版 billing 逻辑已移除） */
function parsePayIntentModulesCsv(csv: string): { modKey: string; tierId: string } {
  const parts = csv.split(",").map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const [modKey, tierId] = part.split(":").map((x) => x.trim());
    if (modKey === "email" && tierId) return { modKey, tierId };
  }
  return { modKey: "", tierId: "" };
}

/**
 * 套餐统计起始日：首次开通从当日计；同档续费不重置；换档则从换档日重计。
 * 优先 paid intent 链推导，再与 tenant_product_modules.service_effective_start 对齐。
 */
export async function resolveTenantPackageStatsStartYmd(
  db: Pool,
  tenantId: number
): Promise<string | null> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;

  const [modRows] = await db.query(
    `SELECT service_effective_start, period_start, simulated_paid_at, status, email_tier_id
       FROM tenant_product_modules
      WHERE tenant_id = ? AND module = 'email'
      LIMIT 1`,
    [tenantId]
  );
  const mod = (modRows as Array<{
    service_effective_start?: unknown;
    period_start?: unknown;
    simulated_paid_at?: unknown;
    status?: string;
    email_tier_id?: string | null;
  }>)[0];

  let intentRows: Array<{ modules_csv: string; created_at: Date | string }> = [];
  try {
    const [rows] = await db.query(
      `SELECT modules_csv, created_at
         FROM tenant_module_pay_intents
        WHERE tenant_id = ? AND status = 'paid'
          AND modules_csv LIKE 'email:%'
        ORDER BY created_at ASC, id ASC
        LIMIT 200`,
      [tenantId]
    );
    intentRows = rows as typeof intentRows;
  } catch {
    intentRows = [];
  }

  let anchorYmd: string | null = null;
  let chainTier: string | null = null;
  for (const row of intentRows) {
    const { modKey, tierId } = parsePayIntentModulesCsv(String(row.modules_csv ?? ""));
    if (modKey !== "email" || !tierId) continue;
    const ymd = businessYmdFromDbDatetime(row.created_at);
    if (!ymd) continue;
    if (chainTier == null) {
      anchorYmd = ymd;
      chainTier = tierId;
      continue;
    }
    if (tierId !== chainTier) {
      anchorYmd = ymd;
      chainTier = tierId;
    }
  }

  const modStart =
    businessYmdFromDbDatetime(mod?.service_effective_start) ??
    businessYmdFromDbDatetime(mod?.period_start) ??
    businessYmdFromDbDatetime(mod?.simulated_paid_at);

  const currentTier = mod?.email_tier_id?.trim() ?? "";
  if (modStart && chainTier && currentTier && chainTier === currentTier) {
    if (!anchorYmd || modStart > anchorYmd) anchorYmd = modStart;
  } else if (modStart && !anchorYmd) {
    anchorYmd = modStart;
  } else if (modStart && anchorYmd && modStart >= anchorYmd) {
    anchorYmd = modStart;
  }

  if (anchorYmd) return anchorYmd;

  if (mod && String((mod as { status?: unknown }).status ?? "") === "active") {
    return modStart ?? businessYmdFromDbDatetime(new Date());
  }

  try {
    const [minSubRows] = await db.query(
      `SELECT MIN(s.created_at) AS min_at
         FROM email_subscribe_events s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE c.tenant_id = ?`,
      [tenantId]
    );
    return businessYmdFromDbDatetime((minSubRows as Array<{ min_at?: unknown }>)[0]?.min_at ?? null);
  } catch {
    return null;
  }
}
