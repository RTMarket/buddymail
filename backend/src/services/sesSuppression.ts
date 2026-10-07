import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * SES 抑制列表（suppression list）薄封装。
 *
 * 我们维护两层：
 *   - 平台级（tenant_id IS NULL）：来自 SES 全局 suppression（hard bounce / complaint），
 *     任何租户都不该再发；实际是镜像 SES 自身的 account-level list。
 *   - 租户级（tenant_id 非空）：仅该租户不发；用于租户主动拉黑、或租户自己活动里
 *     收到的退信投诉（避免一个租户的脏数据连累其他租户的发送速率）。
 *
 * 发送前 isSuppressed 会两层都查；只要任意一层命中即跳过。
 *
 * 关于 removed：用户可在 SES 控制台手动移除抑制；我们的 webhook 也会监听
 * removeFromSuppressionList 事件，把对应记录置 removed=1（保留审计）。
 * isSuppressed 读 removed=0 的记录。
 */

export type SuppressionReason = "hard_bounce" | "complaint" | "manual" | "spam_report";
export type SuppressionSource = "ses_sns_webhook" | "ses_api_pull" | "admin_manual" | "tenant_manual";

interface AddSuppressionInput {
  tenantId: number | null;
  email: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  rawEvent?: unknown;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 发送前调用：判断给定邮箱是否被抑制（平台级或租户级任一命中即返回 true）。
 *
 * 性能要求：每封邮件都会调用一次，必须走 idx_email + idx_tenant_email 索引。
 * 现表已建好这两个索引，单次查询 < 1ms。若量上来后想再快，可以在 send-loop
 * 上层一次性 JOIN 进 contactRows 查询，但目前保持简单。
 */
export async function isSuppressed(
  db: Pool,
  tenantId: number,
  email: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT 1
       FROM ses_suppression_log
      WHERE email = ?
        AND removed = 0
        AND (tenant_id IS NULL OR tenant_id = ?)
      LIMIT 1`,
    [normalized, tenantId]
  );
  return rows.length > 0;
}

/**
 * 把一封邮件加入抑制列表。
 *   - hard_bounce / complaint：建议同时写平台级（tenant_id=null）+ 当前租户级，
 *     这样既保护了所有人，也保留了"这条命中是哪个租户先发现的"审计信息。
 *   - manual / spam_report：只写租户级即可。
 *
 * 幂等：使用 INSERT … ON DUPLICATE KEY UPDATE 风格不优，因为我们没有
 * 唯一键 (tenant_id, email)；改为先查再写。重复写会被合并成 removed=0
 * 的同一条逻辑记录（原 raw_event_json 不覆盖，仅扩展 removed 状态）。
 */
export async function addSuppression(db: Pool, input: AddSuppressionInput): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!email) return;
  const [existing] = await db.query<RowDataPacket[]>(
    `SELECT id, removed FROM ses_suppression_log
      WHERE email = ?
        AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)
        AND reason = ?
      ORDER BY id DESC
      LIMIT 1`,
    [email, input.tenantId, input.tenantId, input.reason]
  );
  const exists = (existing as Array<{ id: number; removed: number }>)[0];
  if (exists) {
    /** 已存在同 (tenant, email, reason)；若被标 removed 则复活，否则什么都不做 */
    if (Number(exists.removed) === 1) {
      await db.query(
        `UPDATE ses_suppression_log
            SET removed = 0,
                removed_at = NULL,
                source = ?,
                raw_event_json = COALESCE(raw_event_json, CAST(? AS JSON))
          WHERE id = ?`,
        [input.source, JSON.stringify(input.rawEvent ?? null), exists.id]
      );
    }
    return;
  }
  await db.query(
    `INSERT INTO ses_suppression_log (tenant_id, email, reason, source, raw_event_json)
     VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
    [input.tenantId, email, input.reason, input.source, JSON.stringify(input.rawEvent ?? null)]
  );
}

/**
 * 移除抑制：用户/管理员主动从平台抑制列表里把某个邮箱"放出来"。
 * 软删（removed=1）保留审计；isSuppressed 不会再命中此条。
 */
export async function removeSuppression(
  db: Pool,
  tenantId: number | null,
  email: string
): Promise<{ affected: number }> {
  const normalized = normalizeEmail(email);
  const [r] = await db.query(
    `UPDATE ses_suppression_log
        SET removed = 1, removed_at = NOW()
      WHERE email = ?
        AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)
        AND removed = 0`,
    [normalized, tenantId, tenantId]
  );
  return { affected: Number((r as { affectedRows?: number })?.affectedRows ?? 0) };
}

/**
 * 列出某租户当前生效的抑制条目（用于"邮件健康"页面展示与导出）。
 * 返回平台级 + 该租户级所有 removed=0 的条目。
 */
export async function listActiveSuppressions(
  db: Pool,
  tenantId: number,
  opts: { limit?: number; offset?: number; reason?: SuppressionReason | null } = {}
): Promise<Array<{
  id: number; tenantId: number | null; email: string; reason: string; source: string; createdAt: string;
}>> {
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);
  const offset = Math.max(0, opts.offset ?? 0);
  const params: Array<unknown> = [tenantId];
  const reasonClause = opts.reason ? "AND reason = ?" : "";
  if (opts.reason) params.push(opts.reason);
  params.push(limit, offset);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, email, reason, source, created_at
       FROM ses_suppression_log
      WHERE removed = 0
        AND (tenant_id IS NULL OR tenant_id = ?)
        ${reasonClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    params
  );
  return (rows as Array<{ id: unknown; tenant_id: unknown; email: unknown; reason: unknown; source: unknown; created_at: unknown }>).map((r) => ({
    id: Number(r.id),
    tenantId: r.tenant_id == null ? null : Number(r.tenant_id),
    email: String(r.email),
    reason: String(r.reason),
    source: String(r.source),
    createdAt: String(r.created_at)
  }));
}
