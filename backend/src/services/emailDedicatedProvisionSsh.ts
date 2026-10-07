import { Client } from "ssh2";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { decryptSecret } from "../cryptoSecret.js";
import {
  loadDedicatedServerCredentials,
  resolveDedicatedSmtpPlainPassword,
  resolveStoredDkimPublicKey,
  markRelaySmtpSynced,
  saveAdminSmtpPasswordEnc,
  saveDedicatedDkimPublicKey,
  syncDedicatedPasswordToSmtpProfile,
  syncDedicatedRelayHostToSmtpProfile
} from "./dedicatedSmtpCredentials.js";
/** 开源版：审计日志为 no-op（商业版写入审计表） */
async function logProvisionAudit(_db: unknown, _entry: Record<string, unknown>): Promise<void> {
  return;
}
import {
  resolveMailVpsScriptDirs,
  syncMailVpsScriptsToHost,
  tailSshOutput
} from "./mailVpsRemoteScripts.js";

export type DkimAutomationMeta = {
  attempted: boolean;
  dkimFetched: boolean;
  relaySmtpConfigured: boolean;
  mailUserConfigured: boolean;
  messages: string[];
};

export function isProvisionSshEnabled(env: Env): boolean {
  return Boolean(env.EMAIL_DEDICATED_PROVISION_SSH_ENABLED);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type SshTarget = {
  host: string;
  port: number;
  username: string;
  password: string;
};

function sshExec(
  target: SshTarget,
  command: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH 超时（${timeoutMs}ms）: ${target.host}`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }
          stream
            .on("close", (code: number | null) => {
              clearTimeout(timer);
              conn.end();
              resolve({ stdout, stderr, code });
            })
            .on("data", (d: Buffer) => {
              stdout += d.toString("utf8");
            });
          stream.stderr.on("data", (d: Buffer) => {
            stderr += d.toString("utf8");
          });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      })
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: Math.min(timeoutMs, 25_000),
        hostVerifier: () => true
      });
  });
}

function extractDkimPFromText(text: string): string | null {
  const compact = text.replace(/\s+/g, "");
  const m = compact.match(/p=([A-Za-z0-9+/=]{40,})/);
  return m?.[1] ?? null;
}

async function loadServerContext(db: Pool, serverId: number) {
  const [rows] = await db.query(
    `SELECT e.id, e.tenant_id, e.sender_domain, e.from_email, e.vps_group_id,
            COALESCE(NULLIF(TRIM(g.relay_ip), ''), NULLIF(TRIM(e.relay_ip), '')) AS relay_ip,
            COALESCE(NULLIF(TRIM(g.relay_vps_username), ''), NULLIF(TRIM(e.relay_vps_username), '')) AS relay_vps_username,
            COALESCE(g.relay_vps_password_enc, e.relay_vps_password_enc) AS relay_vps_password_enc,
            COALESCE(NULLIF(TRIM(g.ptr_ip), ''), NULLIF(TRIM(e.ptr_ip), '')) AS ptr_ip,
            COALESCE(NULLIF(TRIM(g.ptr_vps_username), ''), NULLIF(TRIM(e.ptr_vps_username), '')) AS ptr_vps_username,
            COALESCE(g.ptr_vps_password_enc, e.ptr_vps_password_enc) AS ptr_vps_password_enc
       FROM email_dedicated_servers e
       LEFT JOIN email_dedicated_vps_groups g ON g.id = e.vps_group_id
      WHERE e.id = ?
      LIMIT 1`,
    [serverId]
  );
  return (
    rows as Array<{
      id: number;
      tenant_id: number;
      sender_domain: string | null;
      from_email: string | null;
      vps_group_id: number | null;
      relay_ip: string | null;
      relay_vps_username: string | null;
      relay_vps_password_enc: string | null;
      ptr_ip: string | null;
      ptr_vps_username: string | null;
      ptr_vps_password_enc: string | null;
    }>
  )[0];
}

function buildDkimRemoteCommand(scriptDir: string, domain: string): string {
  const qDomain = shellQuote(domain);
  const qDir = shellQuote(scriptDir);
  /** 避免 SSH 远程 bash 中嵌套双引号；统一从 default.txt 用 grep 提取 p= */
  return `
DOMAIN=${qDomain}
SELECTOR=default
SCRIPT_DIR=${qDir}
KEY_DIR=/etc/opendkim/keys/${domain}
if [ -f "$SCRIPT_DIR/dkim-genkey.sh" ]; then
  cd "$SCRIPT_DIR" && (sudo -n bash dkim-genkey.sh "$DOMAIN" "$SELECTOR" 2>&1 || sudo bash dkim-genkey.sh "$DOMAIN" "$SELECTOR" 2>&1) || true
else
  sudo mkdir -p "$KEY_DIR"
  if [ ! -f "$KEY_DIR/$SELECTOR.private" ]; then
    sudo opendkim-genkey -b 1024 -d "$DOMAIN" -s "$SELECTOR" -D "$KEY_DIR" || exit 1
    sudo chown opendkim:opendkim "$KEY_DIR/$SELECTOR.private" 2>/dev/null || true
  fi
fi
TXT="$KEY_DIR/$SELECTOR.txt"
echo BSS_DKIM_P_START
sudo tr -d '\\n\\r\\t ' < "$TXT" 2>/dev/null | tr -d '"' | grep -oE 'p=[A-Za-z0-9+/=]+' | head -1 | cut -c3-
echo BSS_DKIM_P_END
`.trim();
}

function buildRelaySmtpCommand(scriptDir: string, smtpUser: string, smtpPassword: string): string {
  const qUser = shellQuote(smtpUser);
  const qPass = shellQuote(smtpPassword);
  const qDir = shellQuote(scriptDir);
  return `
set -e
REMOTE=${qDir}
if [ ! -f "$REMOTE/relay-smtp-sync.sh" ]; then
  echo "BSS_SCRIPT_MISSING=$REMOTE/relay-smtp-sync.sh" >&2
  exit 1
fi
cd "$REMOTE" && sudo bash relay-smtp-sync.sh ${qUser} ${qPass}
`.trim();
}

function buildMailUserCommand(scriptDir: string, mailUser: string, mailPassword: string): string {
  const qUser = shellQuote(mailUser);
  const qPass = shellQuote(mailPassword);
  const qDir = shellQuote(scriptDir);
  return `
set -e
REMOTE=${qDir}
if [ ! -f "$REMOTE/dovecot-user-add.sh" ]; then
  echo "BSS_SCRIPT_MISSING=$REMOTE/dovecot-user-add.sh" >&2
  exit 1
fi
cd "$REMOTE" && sudo bash dovecot-user-add.sh ${qUser} ${qPass}
`.trim();
}

async function uploadMailVpsScriptsForHost(
  env: Env,
  target: SshTarget,
  timeoutMs: number
): Promise<string> {
  const { localDir, remoteDir } = resolveMailVpsScriptDirs(env);
  await syncMailVpsScriptsToHost(target, localDir, remoteDir, timeoutMs);
  return remoteDir;
}

function parseRelaySmtpSyncFailure(
  combined: string,
  relayIp: string,
  remoteDir: string,
  smtpUser: string
): string | null {
  const saslType = combined.match(/BSS_RELAY_SASL_TYPE=(\S+)/)?.[1] ?? "unknown";
  const saslUserOk = combined.includes("BSS_SASL_USER_OK");
  const doveAuthOk = combined.includes("BSS_DOVECOT_AUTH_OK");
  const testsaslOk = combined.includes("BSS_SASL_AUTH_OK");

  if (saslType === "dovecot") {
    if (!doveAuthOk && !testsaslOk) {
      return `发信机 ${relayIp} 的 Postfix 使用 Dovecot SASL。请在机上执行：sudo bash ${remoteDir}/relay-smtp-sync.sh '${smtpUser}' '<密码>'`;
    }
    return null;
  }
  if (!saslUserOk && !testsaslOk) {
    return `发信机 ${relayIp} sasldb 未找到用户 ${smtpUser}，且 SASL 自测未通过。请 SSH 登录后执行：cd ${remoteDir} && sudo bash relay-smtp-sync.sh '${smtpUser}' '<密码>'`;
  }
  return null;
}

async function runRelaySmtpSyncOnHost(
  env: Env,
  relayTarget: SshTarget,
  smtpUser: string,
  smtpPassword: string,
  timeoutMs: number
): Promise<{ combined: string; remoteDir: string }> {
  const remoteDir = await uploadMailVpsScriptsForHost(env, relayTarget, timeoutMs);
  const relayOut = await sshExec(
    relayTarget,
    buildRelaySmtpCommand(remoteDir, smtpUser, smtpPassword),
    timeoutMs
  );
  const combined = `${relayOut.stdout}\n${relayOut.stderr}`;
  if (relayOut.code !== 0) {
    throw new Error(tailSshOutput(relayOut.stdout, relayOut.stderr) || `SSH 远程 exit ${relayOut.code ?? "?"}`);
  }
  const fail = parseRelaySmtpSyncFailure(combined, relayTarget.host, remoteDir, smtpUser);
  if (fail) {
    throw new Error(fail);
  }
  return { combined, remoteDir };
}

/**
 * R21：仅 SSH 拉取 DKIM 公钥（供后台「SSH 生成」按钮；不写入 DNS）。
 */
export async function fetchDkimViaSshForServer(
  db: Pool,
  env: Env,
  serverId: number,
  opts?: {
    relayIp?: string;
    jobId?: number | null;
    actorUserId?: number | null;
    /** 为 true 时忽略库内已保存的 DKIM，强制 SSH 重新生成 */
    forceRegenerate?: boolean;
  }
): Promise<{
  senderDomain: string;
  dkimPublicKey: string | null;
  automation: DkimAutomationMeta;
}> {
  const automation: DkimAutomationMeta = {
    attempted: false,
    dkimFetched: false,
    relaySmtpConfigured: false,
    mailUserConfigured: false,
    messages: []
  };

  if (!isProvisionSshEnabled(env)) {
    throw new Error("SSH 自动化未开启，请在业务机设置 EMAIL_DEDICATED_PROVISION_SSH_ENABLED=1");
  }

  const ctx = await loadServerContext(db, serverId);
  if (!ctx) {
    throw new Error("记录不存在");
  }

  const senderDomain = String(ctx.sender_domain ?? "").trim().toLowerCase();
  if (!senderDomain) {
    throw new Error("缺少发件子域");
  }

  if (!opts?.forceRegenerate) {
    const cred = await loadDedicatedServerCredentials(db, serverId);
    const stored = resolveStoredDkimPublicKey(cred);
    if (stored) {
      automation.messages.push("使用已保存的 DKIM 公钥（如需重新生成请点「重新生成 DKIM」）");
      return { senderDomain, dkimPublicKey: stored, automation };
    }
  }

  const relayIp = (opts?.relayIp ?? ctx.relay_ip ?? "").trim();
  const relayPassEnc = ctx.relay_vps_password_enc;
  if (!relayIp || !relayPassEnc?.trim()) {
    throw new Error("请先在「机组 VPS」保存发信机 IP 与 SSH 密码");
  }

  let relayPassword: string;
  try {
    relayPassword = decryptSecret(relayPassEnc);
  } catch (e: unknown) {
    throw new Error(`解密发信机 SSH 密码失败：${String((e as Error)?.message ?? e)}`);
  }

  automation.attempted = true;
  await logProvisionAudit(db, {
    dedicatedServerId: serverId,
    tenantId: ctx.tenant_id,
    jobId: opts?.jobId ?? null,
    action: "ssh_automation_start",
    detail: { senderDomain, relayIp, mode: "fetch_dkim_only" },
    actorUserId: opts?.actorUserId ?? null
  });

  const sshPort = env.EMAIL_DEDICATED_SSH_PORT ?? 22;
  const timeoutMs = env.EMAIL_DEDICATED_SSH_TIMEOUT_MS ?? 90_000;
  const relayUser = (ctx.relay_vps_username ?? "root").trim() || "root";
  const relayTarget: SshTarget = {
    host: relayIp,
    port: sshPort,
    username: relayUser,
    password: relayPassword
  };

  try {
    const remoteDir = await uploadMailVpsScriptsForHost(env, relayTarget, timeoutMs);
    const dkimOut = await sshExec(relayTarget, buildDkimRemoteCommand(remoteDir, senderDomain), timeoutMs);
    const combined = `${dkimOut.stdout}\n${dkimOut.stderr}`;
    const p =
      extractDkimPFromText(combined) ??
      (() => {
        const m = combined.match(/BSS_DKIM_P_START\s*([\s\S]*?)\s*BSS_DKIM_P_END/);
        return m?.[1]?.trim().replace(/\s+/g, "") || null;
      })();
    if (!p) {
      const tail = `${dkimOut.stderr}\n${dkimOut.stdout}`.trim().slice(-1200);
      throw new Error(
        tail
          ? `未解析到 DKIM p= 段。远程输出：${tail}`
          : "未解析到 DKIM p= 段（远程无输出，请检查 Relay 是否已装 opendkim）"
      );
    }
    automation.dkimFetched = true;
    automation.messages.push(`已从 Relay ${relayIp} 获取 DKIM 公钥`);
    await logProvisionAudit(db, {
      dedicatedServerId: serverId,
      tenantId: ctx.tenant_id,
      jobId: opts?.jobId ?? null,
      action: "ssh_dkim_ok",
      detail: { senderDomain, selector: "default", mode: "fetch_dkim_only" },
      actorUserId: opts?.actorUserId ?? null
    });
    await saveDedicatedDkimPublicKey(db, serverId, p);
    return { senderDomain, dkimPublicKey: p, automation };
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    automation.messages.push(`DKIM SSH 失败：${msg}`);
    await logProvisionAudit(db, {
      dedicatedServerId: serverId,
      tenantId: ctx.tenant_id,
      jobId: opts?.jobId ?? null,
      action: "ssh_dkim_fail",
      detail: { error: msg.slice(0, 500), mode: "fetch_dkim_only" },
      actorUserId: opts?.actorUserId ?? null
    });
    return { senderDomain, dkimPublicKey: null, automation };
  }
}

/**
 * R21：经 SSH 在 Relay 生成 DKIM、配置 SASL；在 Mail 机配置退信用户（不重装整机）。
 */
export async function syncSmtpCredentialsViaSshForServer(
  db: Pool,
  env: Env,
  serverId: number,
  opts?: {
    smtpPassword?: string;
    smtpUsername?: string;
    relayIp?: string;
    actorUserId?: number | null;
    jobId?: number | null;
  }
): Promise<{ smtpUser: string; automation: DkimAutomationMeta }> {
  const automation: DkimAutomationMeta = {
    attempted: true,
    dkimFetched: false,
    relaySmtpConfigured: false,
    mailUserConfigured: false,
    messages: []
  };

  if (!isProvisionSshEnabled(env)) {
    throw new Error("SSH 自动化未开启（EMAIL_DEDICATED_PROVISION_SSH_ENABLED）");
  }

  const ctx = await loadServerContext(db, serverId);
  if (!ctx) {
    throw new Error("记录不存在");
  }

  const smtpUser = (opts?.smtpUsername ?? ctx.from_email ?? "").trim().toLowerCase();
  if (!smtpUser) {
    throw new Error("缺少发件邮箱（SMTP 登录名），请先填写 from_email。");
  }

  const relayIp = (opts?.relayIp ?? ctx.relay_ip ?? "").trim();
  const relayPassEnc = ctx.relay_vps_password_enc;
  if (!relayIp || !relayPassEnc?.trim()) {
    throw new Error("请先在机组 VPS 保存发信机 IP 与 SSH 密码。");
  }

  const { password: smtpPassword } = await resolveDedicatedSmtpPlainPassword(db, serverId, {
    bodyPassword: opts?.smtpPassword
  });
  if (opts?.smtpPassword?.trim()) {
    await saveAdminSmtpPasswordEnc(db, serverId, opts.smtpPassword.trim());
  }

  let relayPassword: string;
  try {
    relayPassword = decryptSecret(relayPassEnc);
  } catch (e: unknown) {
    throw new Error(`解密发信机 SSH 密码失败：${String((e as Error)?.message ?? e)}`);
  }

  const sshPort = env.EMAIL_DEDICATED_SSH_PORT ?? 22;
  const timeoutMs = env.EMAIL_DEDICATED_SSH_TIMEOUT_MS ?? 90_000;
  const relayUser = (ctx.relay_vps_username ?? "root").trim() || "root";

  const relayTarget: SshTarget = {
    host: relayIp,
    port: sshPort,
    username: relayUser,
    password: relayPassword
  };

  try {
    const { combined, remoteDir } = await runRelaySmtpSyncOnHost(
      env,
      relayTarget,
      smtpUser,
      smtpPassword,
      timeoutMs
    );
    const saslType = combined.match(/BSS_RELAY_SASL_TYPE=(\S+)/)?.[1] ?? "unknown";
    const doveAuthOk = combined.includes("BSS_DOVECOT_AUTH_OK");
    const testsaslOk = combined.includes("BSS_SASL_AUTH_OK");
    automation.messages.push(`发信机 smtpd_sasl_type=${saslType}`);
    if (doveAuthOk) automation.messages.push("Dovecot SASL：doveadm auth test 通过");
    else if (testsaslOk) automation.messages.push("testsaslauthd 认证自测通过");
    automation.relaySmtpConfigured = true;
    automation.messages.push(`已在发信机 ${relayIp} 写入 SASL 用户 ${smtpUser}（脚本目录 ${remoteDir}）`);
    await syncDedicatedPasswordToSmtpProfile(db, serverId, smtpPassword);
    const hostSynced = await syncDedicatedRelayHostToSmtpProfile(db, serverId, relayIp);
    if (hostSynced) {
      automation.messages.push(`已同步 smtp_profiles 发信机 host → ${relayIp}`);
    }
    const marked = await markRelaySmtpSynced(db, serverId);
    automation.messages.push("已同步 smtp_profiles 密码（与测试发信一致）");
    if (!marked) {
      automation.messages.push(
        "提示：数据库尚未有 relay_smtp_synced_at 列，请在业务机执行 npm run db:migrate（065）。列表「未同步」将依审计记录判断。"
      );
    }
    await logProvisionAudit(db, {
      dedicatedServerId: serverId,
      tenantId: ctx.tenant_id,
      jobId: opts?.jobId ?? null,
      action: "ssh_relay_smtp_ok",
      detail: { smtpUser, mode: "sync_smtp" },
      actorUserId: opts?.actorUserId ?? null
    });
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    automation.messages.push(`发信机 SMTP 用户失败：${msg}`);
    await logProvisionAudit(db, {
      dedicatedServerId: serverId,
      tenantId: ctx.tenant_id,
      jobId: opts?.jobId ?? null,
      action: "ssh_relay_smtp_fail",
      detail: { error: msg.slice(0, 500), mode: "sync_smtp" },
      actorUserId: opts?.actorUserId ?? null
    });
    throw new Error(`发信机 SASL 同步失败：${msg}`);
  }

  const ptrIp = (ctx.ptr_ip ?? "").trim();
  const ptrPassEnc = ctx.ptr_vps_password_enc;
  if (ptrIp && ptrPassEnc?.trim()) {
    try {
      const ptrPassword = decryptSecret(ptrPassEnc);
      const ptrUser = (ctx.ptr_vps_username ?? "root").trim() || "root";
      const ptrTarget: SshTarget = {
        host: ptrIp,
        port: sshPort,
        username: ptrUser,
        password: ptrPassword
      };
      const remoteDir = await uploadMailVpsScriptsForHost(env, ptrTarget, timeoutMs);
      await sshExec(ptrTarget, buildMailUserCommand(remoteDir, smtpUser, smtpPassword), timeoutMs);
      automation.mailUserConfigured = true;
      automation.messages.push(`已在 Mail 机 ${ptrIp} 写入 Dovecot 用户`);
      await logProvisionAudit(db, {
        dedicatedServerId: serverId,
        tenantId: ctx.tenant_id,
        jobId: opts?.jobId ?? null,
        action: "ssh_mail_user_ok",
        detail: { mailUser: smtpUser, mode: "sync_smtp" },
        actorUserId: opts?.actorUserId ?? null
      });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      automation.messages.push(`Mail 机用户（退信 IMAP）失败：${msg}（不影响 587 发信，可稍后重试）`);
      await logProvisionAudit(db, {
        dedicatedServerId: serverId,
        tenantId: ctx.tenant_id,
        jobId: opts?.jobId ?? null,
        action: "ssh_mail_user_fail",
        detail: { error: msg.slice(0, 500), mode: "sync_smtp" },
        actorUserId: opts?.actorUserId ?? null
      });
    }
  }

  return { smtpUser, automation };
}
