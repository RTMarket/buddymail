import dns from "node:dns";
import nodemailer from "nodemailer";
import type { Pool } from "mysql2/promise";
import { nodemailerTransportFromSmtpRow, resolveSmtpAuthUser } from "../smtpTransportConfig.js";
import {
  resolveDedicatedSmtpPlainPassword,
  syncDedicatedPasswordToSmtpProfile
} from "./dedicatedSmtpCredentials.js";
import { loadVpsGroupInfrastructure } from "./dedicatedVpsGroup.js";

const dnsLookup = (
  hostname: string,
  _opts: object,
  cb: (err: NodeJS.ErrnoException | null, address: string, family?: number) => void
) => {
  dns.lookup(hostname, { family: 4 }, cb);
};

export type DedicatedSmtpVerifyResult = {
  ok: boolean;
  authUser: string;
  host: string;
  port: number;
  message: string;
  smtpProfileId: number | null;
};

type SmtpEndpoint = {
  host: string;
  port: number;
  secure?: unknown;
  authUser: string;
  smtpProfileId: number | null;
};

async function resolveAuthoritativeRelayHost(
  db: Pool,
  row: {
    tenant_id: number;
    relay_ip: string | null;
    ip_address: string | null;
    vps_group_id: number | null;
  }
): Promise<string> {
  let host = String(row.relay_ip ?? row.ip_address ?? "").trim();
  if (!host && row.vps_group_id) {
    const infra = await loadVpsGroupInfrastructure(db, Number(row.tenant_id), Number(row.vps_group_id));
    host = infra?.relayIp ?? "";
  }
  return host;
}

async function resolveSmtpEndpointForVerify(
  db: Pool,
  row: {
    id: number;
    tenant_id: number;
    smtp_profile_id: number | null;
    from_email: string | null;
    relay_ip: string | null;
    ip_address: string | null;
    vps_group_id: number | null;
  }
): Promise<SmtpEndpoint | DedicatedSmtpVerifyResult> {
  const relayHost = await resolveAuthoritativeRelayHost(db, row);

  if (row.smtp_profile_id) {
    const [smtpRows] = await db.query(`SELECT * FROM smtp_profiles WHERE id = ? LIMIT 1`, [
      row.smtp_profile_id
    ]);
    const smtp = (smtpRows as Record<string, unknown>[])[0];
    if (!smtp) {
      return {
        ok: false,
        authUser: "",
        host: "",
        port: 587,
        message: "smtp_profiles 记录不存在",
        smtpProfileId: Number(row.smtp_profile_id)
      };
    }
    const authUser = resolveSmtpAuthUser(smtp as { username?: unknown; from_email?: unknown });
    if (!authUser) {
      return {
        ok: false,
        authUser: "",
        host: relayHost || String(smtp.host ?? ""),
        port: Number(smtp.port) || 587,
        message: "SMTP 登录名为空",
        smtpProfileId: Number(row.smtp_profile_id)
      };
    }
    return {
      host: relayHost || String(smtp.host ?? "").trim(),
      port: Number(smtp.port) || 587,
      secure: smtp.secure,
      authUser,
      smtpProfileId: Number(row.smtp_profile_id)
    };
  }

  const authUser = String(row.from_email ?? "").trim().toLowerCase();
  if (!authUser) {
    return {
      ok: false,
      authUser: "",
      host: "",
      port: 587,
      message: "发件人邮箱未填写，无法测试 587 认证。",
      smtpProfileId: null
    };
  }

  const host = relayHost;
  if (!host) {
    return {
      ok: false,
      authUser,
      host: "",
      port: 587,
      message: "尚未填写发信机 IP。请先在「编辑机组」保存 Relay IP，再 SSH 同步 SMTP。",
      smtpProfileId: null
    };
  }

  return {
    host,
    port: 587,
    secure: 0,
    authUser,
    smtpProfileId: null
  };
}

/**
 * 管理端 / 运维：用与租户 test-send 相同凭据校验 587 AUTH（verify，不发信）。
 * 推送 DNS 前无 smtp_profiles 时，回退到专线 relay_ip + 管理端已存密码（与 SSH 同步一致）。
 */
export async function verifyDedicatedSmtpAuth(
  db: Pool,
  serverId: number
): Promise<DedicatedSmtpVerifyResult> {
  const [rows] = await db.query(
    `SELECT e.id, e.tenant_id, e.smtp_profile_id, e.from_email,
            COALESCE(NULLIF(TRIM(g.relay_ip), ''), NULLIF(TRIM(e.relay_ip), '')) AS relay_ip,
            e.ip_address, e.vps_group_id
       FROM email_dedicated_servers e
       LEFT JOIN email_dedicated_vps_groups g ON g.id = e.vps_group_id
      WHERE e.id = ?
      LIMIT 1`,
    [serverId]
  );
  const row = (rows as Array<{
    id: number;
    tenant_id: number;
    smtp_profile_id: number | null;
    from_email: string | null;
    relay_ip: string | null;
    ip_address: string | null;
    vps_group_id: number | null;
  }>)[0];
  if (!row) {
    return {
      ok: false,
      authUser: "",
      host: "",
      port: 587,
      message: "记录不存在",
      smtpProfileId: null
    };
  }

  const endpoint = await resolveSmtpEndpointForVerify(db, row);
  if ("ok" in endpoint) {
    return endpoint;
  }

  const { host, port, secure, authUser, smtpProfileId } = endpoint;

  let pass: string;
  try {
    ({ password: pass } = await resolveDedicatedSmtpPlainPassword(db, serverId, {
      allowAutoGenerate: false
    }));
    if (smtpProfileId) {
      await syncDedicatedPasswordToSmtpProfile(db, serverId, pass);
    }
  } catch (e: unknown) {
    return {
      ok: false,
      authUser,
      host,
      port,
      message: String((e as Error)?.message ?? e),
      smtpProfileId
    };
  }

  const transporter = nodemailer.createTransport(
    nodemailerTransportFromSmtpRow(
      { host, port, secure },
      { user: authUser, pass },
      {
        connectionTimeout: 20_000,
        socketTimeout: 30_000,
        lookup: dnsLookup
      }
    )
  );

  try {
    await transporter.verify();
    return {
      ok: true,
      authUser,
      host,
      port,
      message: `587 认证成功（${host}:${port}，用户 ${authUser}）`,
      smtpProfileId
    };
  } catch (e: unknown) {
    let msg = String((e as Error)?.message ?? e);
    if (/535|authentication failed|Invalid login/i.test(msg)) {
      msg +=
        `。请确认已「SSH 同步 SMTP」。在发信机 ${host} 执行 postconf -h smtpd_sasl_type：若为 dovecot 则 grep ${authUser} /etc/dovecot/users；若为 cyrus 则 sasldblistusers2 -f /etc/postfix/sasldb2 | grep ${authUser}`;
    }
    return {
      ok: false,
      authUser,
      host,
      port,
      message: msg,
      smtpProfileId
    };
  }
}
