import type { Pool } from "mysql2/promise";

export type UsageModule = "leads" | "copy" | "image" | "video";

const PLAN_COL: Record<UsageModule, string> = {
  leads: "leads_quota_monthly",
  copy: "copy_quota_monthly",
  image: "image_quota_monthly",
  video: "video_quota_monthly"
};

export async function recordUsage(db: Pool, input: {
  tenantId: number;
  module: UsageModule;
  action: string;
  units?: number;
  refId?: string | null;
  meta?: unknown;
}) {
  const units = Math.max(1, Math.floor(input.units ?? 1));
  await db.query(
    `INSERT INTO usage_events (tenant_id, module, action, units, ref_id, meta_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), NOW())`,
    [
      input.tenantId,
      input.module,
      input.action,
      units,
      input.refId ?? null,
      JSON.stringify(input.meta ?? null)
    ]
  );
}

export async function enforceQuota(db: Pool, tenantId: number, module: UsageModule, nextUnits = 1) {
  const [planRows] = await db.query(
    `SELECT p.${PLAN_COL[module]} AS quota
       FROM tenant_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ?
      LIMIT 1`,
    [tenantId]
  );
  const quota = Number((planRows as any[])[0]?.quota ?? 0);
  if (quota <= 0) return { ok: true as const };

  const [usedRows] = await db.query(
    `SELECT COALESCE(SUM(units), 0) AS used
       FROM usage_events
      WHERE tenant_id = ?
        AND module = ?
        AND DATE_FORMAT(occurred_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`,
    [tenantId, module]
  );
  const used = Number((usedRows as any[])[0]?.used ?? 0);
  if (used + nextUnits > quota) {
    return { ok: false as const, message: `套餐额度不足：${module} 本月已用 ${used}/${quota}` };
  }
  return { ok: true as const };
}
