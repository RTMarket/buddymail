import crypto from "node:crypto";
import type { Pool } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { parseDnsRecords } from "./emailDedicatedDnsRecords.js";

const SMTP_PASSWORD_CHARS =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";

/** 管理端生成 SMTP 密码（20 位，避开易混淆字符） */
export function generateDedicatedSmtpPassword(length = 20): string {
  const n = Math.max(12, Math.min(64, length));
  let out = "";
  const bytes = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) {
    out += SMTP_PASSWORD_CHARS[bytes[i]! % SMTP_PASSWORD_CHARS.length];
  }
  return out;
}

export function extractDkimPublicKeyFromDnsRecords(records: { host: string; type: string; value: string }[]): string {
  const dkim = records.find((r) => {
    const host = r.host.trim().toLowerCase();
    const type = r.type.trim().toUpperCase();
    return type === "TXT" && host.includes("_domainkey.");
  });
  if (!dkim) return "";
  const m = dkim.value.match(/p=([A-Za-z0-9+/=]+)/i);
  return (m?.[1] ?? "").trim();
}

type ServerCredRow = {
  admin_smtp_password_enc: string | null;
  tenant_submitted_smtp_password_enc: string | null;
  smtp_profile_id: number | null;
  dkim_public_key: string | null;
  dns_records: unknown;
};

export async function loadDedicatedServerCredentials(
  db: Pool,
  serverId: number
): Promise<ServerCredRow | null> {
  const [rows] = await db.query(
    `SELECT admin_smtp_password_enc, tenant_submitted_smtp_password_enc,
            smtp_profile_id, dkim_public_key, dns_records
       FROM email_dedicated_servers WHERE id = ? LIMIT 1`,
    [serverId]
  );
  return (rows as ServerCredRow[])[0] ?? null;
}

export function resolveStoredDkimPublicKey(row: ServerCredRow | null | undefined): string {
  const direct = (row?.dkim_public_key ?? "").trim();
  if (direct) return direct;
  if (!row?.dns_records) return "";
  return extractDkimPublicKeyFromDnsRecords(parseDnsRecords(row.dns_records));
}

export async function saveDedicatedDkimPublicKey(
  db: Pool,
  serverId: number,
  dkimPublicKey: string | null
): Promise<void> {
  const key = (dkimPublicKey ?? "").trim().replace(/\s+/g, "");
  await db.query(
    `UPDATE email_dedicated_servers SET dkim_public_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [key || null, serverId]
  );
}

export async function saveAdminSmtpPasswordEnc(
  db: Pool,
  serverId: number,
  plainPassword: string
): Promise<void> {
  const enc = encryptSecret(plainPassword.trim());
  await db.query(
    `UPDATE email_dedicated_servers
        SET admin_smtp_password_enc = ?,
            relay_smtp_synced_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [enc, serverId]
  );
}

/** @returns false 表示列未迁移（065），SSH 仍可能已成功，列表靠审计判断 */
export async function markRelaySmtpSynced(db: Pool, serverId: number): Promise<boolean> {
  try {
    await db.query(
      `UPDATE email_dedicated_servers
          SET relay_smtp_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [serverId]
    );
    return true;
  } catch (e: unknown) {
    const msg = String((e as { sqlMessage?: string })?.sqlMessage ?? (e as Error)?.message ?? e);
    if (msg.includes("Unknown column") && msg.includes("relay_smtp_synced_at")) {
      return false;
    }
    throw e;
  }
}

/** 将明文密码同步到绑定的 smtp_profiles（测试发信读此表） */
export async function syncDedicatedPasswordToSmtpProfile(
  db: Pool,
  serverId: number,
  plainPassword: string
): Promise<boolean> {
  const row = await loadDedicatedServerCredentials(db, serverId);
  const profileId = row?.smtp_profile_id;
  if (!profileId) return false;
  const enc = encryptSecret(plainPassword.trim());
  const [r] = await db.query(
    `UPDATE smtp_profiles SET password_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [enc, profileId]
  );
  return Number((r as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** 机组/专线换发信机 IP 后，同步 smtp_profiles.host（正式发信与 587 测试均读此表） */
export async function syncDedicatedRelayHostToSmtpProfile(
  db: Pool,
  serverId: number,
  relayHost: string
): Promise<boolean> {
  const host = relayHost.trim();
  if (!host) return false;
  const row = await loadDedicatedServerCredentials(db, serverId);
  const profileId = row?.smtp_profile_id;
  if (!profileId) return false;
  const [r] = await db.query(
    `UPDATE smtp_profiles SET host = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND host <> ?`,
    [host, profileId, host]
  );
  return Number((r as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** 组级 relay IP 变更后，批量同步组内各发信域绑定的 smtp_profiles.host */
export async function syncSmtpProfileHostsForVpsGroup(
  db: Pool,
  tenantId: number,
  groupId: number,
  relayHost: string
): Promise<number> {
  const host = relayHost.trim();
  if (!host) return 0;
  const [r] = await db.query(
    `UPDATE smtp_profiles sp
      INNER JOIN email_dedicated_servers e
              ON e.smtp_profile_id = sp.id AND e.tenant_id = sp.tenant_id
        SET sp.host = ?, sp.updated_at = CURRENT_TIMESTAMP
      WHERE e.vps_group_id = ? AND e.tenant_id = ? AND sp.host <> ?`,
    [host, groupId, tenantId, host]
  );
  return Number((r as { affectedRows?: number }).affectedRows ?? 0);
}

/**
 * 解析专线 SMTP 明文密码：管理端填写 > 任务密文 > 管理端存库 > smtp_profiles > 自动生成。
 * 不再使用租户提交的 tenant_submitted_smtp_password_enc。
 */
export async function resolveDedicatedSmtpPlainPassword(
  db: Pool,
  serverId: number,
  opts?: {
    bodyPassword?: string | null;
    jobPasswordEnc?: string | null;
    allowAutoGenerate?: boolean;
  }
): Promise<{ password: string; generated: boolean }> {
  const body = opts?.bodyPassword?.trim();
  if (body) return { password: body, generated: false };

  if (opts?.jobPasswordEnc?.trim()) {
    try {
      return { password: decryptSecret(opts.jobPasswordEnc), generated: false };
    } catch (e: unknown) {
      throw new Error(`解密任务 SMTP 密码失败：${String((e as Error)?.message ?? e)}`);
    }
  }

  const row = await loadDedicatedServerCredentials(db, serverId);
  if (row?.admin_smtp_password_enc?.trim()) {
    try {
      return { password: decryptSecret(row.admin_smtp_password_enc), generated: false };
    } catch (e: unknown) {
      throw new Error(`解密管理端 SMTP 密码失败：${String((e as Error)?.message ?? e)}`);
    }
  }

  if (row?.smtp_profile_id) {
    const [pRows] = await db.query(
      `SELECT password_enc FROM smtp_profiles WHERE id = ? LIMIT 1`,
      [row.smtp_profile_id]
    );
    const enc = (pRows as Array<{ password_enc: string | null }>)[0]?.password_enc;
    if (enc?.trim()) {
      try {
        return { password: decryptSecret(enc), generated: false };
      } catch (e: unknown) {
        throw new Error(`解密 smtp_profiles 密码失败：${String((e as Error)?.message ?? e)}`);
      }
    }
  }

  if (opts?.allowAutoGenerate) {
    const generated = generateDedicatedSmtpPassword();
    await saveAdminSmtpPasswordEnc(db, serverId, generated);
    return { password: generated, generated: true };
  }

  throw new Error(
    "请在本页点击「随机生成 SMTP 密码」并保存，或填写密码后点「SSH 同步 SMTP」写入发信机。"
  );
}
