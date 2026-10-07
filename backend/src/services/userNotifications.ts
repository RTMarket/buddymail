import type { Pool } from "mysql2/promise";

export type NotifyTenantInput = {
  kind: string;
  title: string;
  bodyText?: string;
  linkPath?: string | null;
  meta?: Record<string, unknown> | null;
};

/** 向租户内所有 active 成员各写一条站内信 */
export async function notifyAllTenantMembers(db: Pool, tenantId: number, input: NotifyTenantInput): Promise<number> {
  const [rows] = await db.query(
    `SELECT user_id FROM tenant_members WHERE tenant_id = ? AND status = 'active'`,
    [tenantId]
  );
  const members = rows as { user_id: number }[];
  let n = 0;
  const metaStr = input.meta ? JSON.stringify(input.meta) : null;
  for (const m of members) {
    await db.query(
      `INSERT INTO user_notifications (tenant_id, user_id, kind, title, body_text, link_path, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        Number(m.user_id),
        input.kind.slice(0, 64),
        input.title.slice(0, 500),
        input.bodyText ?? null,
        input.linkPath ?? null,
        metaStr
      ]
    );
    n += 1;
  }
  return n;
}

/** 仅通知当前用户（例如与操作人一致时） */
export async function notifyUser(
  db: Pool,
  tenantId: number,
  userId: number,
  input: NotifyTenantInput
): Promise<void> {
  const metaStr = input.meta ? JSON.stringify(input.meta) : null;
  await db.query(
    `INSERT INTO user_notifications (tenant_id, user_id, kind, title, body_text, link_path, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      userId,
      input.kind.slice(0, 64),
      input.title.slice(0, 500),
      input.bodyText ?? null,
      input.linkPath ?? null,
      metaStr
    ]
  );
}
