import type { Pool } from "mysql2/promise";

export type DedicatedSmtpOpsStatus = {
  hasAdminPassword: boolean;
  relaySync: {
    syncedAt: string | null;
    smtpUser: string | null;
    /** 密码保存后尚未重新同步 */
    needsResync: boolean;
  };
  lastVerify: {
    at: string | null;
    ok: boolean;
    message: string | null;
    authUser: string | null;
    host: string | null;
  } | null;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function isMissingColumnError(e: unknown, column: string): boolean {
  const msg = String((e as { sqlMessage?: string; message?: string })?.sqlMessage ?? (e as Error)?.message ?? e);
  return msg.includes("Unknown column") && msg.includes(column);
}

async function loadLastRelaySmtpOkAudit(
  db: Pool,
  serverId: number
): Promise<{ at: string | null; smtpUser: string | null } | null> {
  try {
    const [sRows] = await db.query(
      `SELECT detail_json, created_at
         FROM email_dedicated_provision_audit_log
        WHERE dedicated_server_id = ? AND action = 'ssh_relay_smtp_ok'
        ORDER BY id DESC
        LIMIT 1`,
      [serverId]
    );
    const row = (sRows as Array<{ detail_json: string | null; created_at: Date | string }>)[0];
    if (!row) return null;
    let smtpUser: string | null = null;
    if (row.detail_json) {
      try {
        const d = JSON.parse(row.detail_json) as { smtpUser?: string };
        smtpUser = d.smtpUser ?? null;
      } catch {
        smtpUser = null;
      }
    }
    return { at: toIso(row.created_at), smtpUser };
  } catch {
    return null;
  }
}

export async function loadDedicatedSmtpOpsStatus(
  db: Pool,
  serverId: number
): Promise<DedicatedSmtpOpsStatus> {
  let row: {
    admin_smtp_password_enc: string | null;
    relay_smtp_synced_at?: Date | string | null;
    from_email: string | null;
  } | undefined;

  try {
    const [rows] = await db.query(
      `SELECT admin_smtp_password_enc, relay_smtp_synced_at, from_email
         FROM email_dedicated_servers WHERE id = ? LIMIT 1`,
      [serverId]
    );
    row = (rows as typeof row[])[0];
  } catch (e: unknown) {
    if (!isMissingColumnError(e, "relay_smtp_synced_at")) throw e;
    const [rows] = await db.query(
      `SELECT admin_smtp_password_enc, from_email
         FROM email_dedicated_servers WHERE id = ? LIMIT 1`,
      [serverId]
    );
    row = (rows as Array<{
      admin_smtp_password_enc: string | null;
      from_email: string | null;
    }>)[0];
  }

  let lastVerify: DedicatedSmtpOpsStatus["lastVerify"] = null;
  try {
    const [vRows] = await db.query(
      `SELECT action, detail_json, created_at
         FROM email_dedicated_provision_audit_log
        WHERE dedicated_server_id = ?
          AND action IN ('smtp_verify_ok', 'smtp_verify_fail')
        ORDER BY id DESC
        LIMIT 1`,
      [serverId]
    );
    const v = (vRows as Array<{
      action: string;
      detail_json: string | null;
      created_at: Date | string;
    }>)[0];
    if (v) {
      let detail: Record<string, unknown> = {};
      if (v.detail_json) {
        try {
          detail = JSON.parse(v.detail_json) as Record<string, unknown>;
        } catch {
          detail = {};
        }
      }
      lastVerify = {
        at: toIso(v.created_at),
        ok: v.action === "smtp_verify_ok",
        message: (detail.message as string) ?? null,
        authUser: (detail.authUser as string) ?? null,
        host: (detail.host as string) ?? null
      };
    }
  } catch {
    /* 审计表未迁移时忽略 */
  }

  const auditSync = await loadLastRelaySmtpOkAudit(db, serverId);
  const lastSyncUser = auditSync?.smtpUser ?? null;

  let syncedAt = toIso(row?.relay_smtp_synced_at);
  if (!syncedAt && auditSync?.at) {
    syncedAt = auditSync.at;
  }
  const hasAdminPassword = Boolean(row?.admin_smtp_password_enc?.trim());

  return {
    hasAdminPassword,
    relaySync: {
      syncedAt,
      smtpUser: lastSyncUser ?? row?.from_email ?? null,
      needsResync: hasAdminPassword && !syncedAt
    },
    lastVerify
  };
}
