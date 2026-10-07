import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import {
  listRecentImapBounceCampaignIds,
  reconcileTouchedCampaignsAfterImapIngest
} from "./emailBounceReconcile.js";
import { decryptSecret } from "../cryptoSecret.js";
import { isMailTlsAllowSelfSigned } from "../smtpTransportConfig.js";

type MatchedSend = {
  send_id: number;
  campaign_id: number;
  contact_id: number | null;
  tenant_id: number;
};

type ImapCursorRow = {
  source_id: string;
  mailbox: string;
  uid_validity: number;
  last_uid: number;
};

/** 限定退信只归属该专线 SMTP / 发信域，避免全局 env 邮箱误绑其它域活动 */
type ImapSendScope = {
  smtpProfileId?: number;
  senderDomain?: string;
};

type ImapSource = {
  sourceId: string;
  tenantIdHint: number;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailbox: string;
  markSeen: boolean;
  sendScope?: ImapSendScope;
};

function parseSenderDomainFromMailbox(username: string, explicitDomain?: string): string {
  const fromDb = String(explicitDomain ?? "").trim().toLowerCase();
  if (fromDb) return fromDb;
  const addr = String(username ?? "").trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 0) return "";
  const host = addr.slice(at + 1);
  if (host.startsWith("mail.")) return host.slice(5);
  return host;
}

function imapSendScopeSql(scope: ImapSendScope | undefined): { sql: string; params: unknown[] } {
  const smtpId = Math.floor(Number(scope?.smtpProfileId ?? 0));
  const domain = String(scope?.senderDomain ?? "").trim().toLowerCase();
  if (smtpId <= 0 && !domain) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  if (smtpId > 0) {
    parts.push(`c.smtp_profile_id = ?`);
    params.push(smtpId);
  }
  if (domain) {
    parts.push(`LOWER(TRIM(s.from_email)) LIKE ?`);
    params.push(`%@${domain}`);
    parts.push(`LOWER(TRIM(s.from_email)) LIKE ?`);
    params.push(`%@mail.${domain}`);
  }
  return { sql: ` AND (${parts.join(" OR ")})`, params };
}

export function resolveImapSendScopeFromSource(src: ImapSource): ImapSendScope | undefined {
  if (src.sendScope && (src.sendScope.smtpProfileId || src.sendScope.senderDomain)) {
    return src.sendScope;
  }
  const m = /^dedicated-smtp:(\d+)$/.exec(String(src.sourceId ?? ""));
  if (m) {
    const id = Math.floor(Number(m[1]));
    if (id > 0) {
      const domain = parseSenderDomainFromMailbox(src.username);
      return { smtpProfileId: id, senderDomain: domain || undefined };
    }
  }
  const m2 = /^smtp:(\d+)$/.exec(String(src.sourceId ?? ""));
  if (m2) {
    const id = Math.floor(Number(m2[1]));
    if (id > 0) {
      const domain = parseSenderDomainFromMailbox(src.username);
      return { smtpProfileId: id, senderDomain: domain || undefined };
    }
  }
  if (src.sourceId === "env:fallback") {
    const domain = parseSenderDomainFromMailbox(src.username);
    return domain ? { senderDomain: domain } : undefined;
  }
  return undefined;
}

type BounceImapHealthSnapshot = {
  running: boolean;
  intervalSeconds: number;
  lastTickStartedAt: string | null;
  lastTickFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastInsertedCount: number;
  lastSourcesCount: number;
  totalInsertedCount: number;
};

const bounceImapHealth: BounceImapHealthSnapshot = {
  running: false,
  intervalSeconds: 90,
  lastTickStartedAt: null,
  lastTickFinishedAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastInsertedCount: 0,
  lastSourcesCount: 0,
  totalInsertedCount: 0
};
let bounceImapTickRunning = false;

function isoNow() {
  return new Date().toISOString();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** tenantIdHint <= 0 表示不按租户过滤（env 全局退信邮箱应对所有租户活动） */
function imapTenantScope(tenantIdHint: number): number | undefined {
  const n = Math.floor(Number(tenantIdHint));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function resolveTenantIdForBounceInsert(
  db: Pool,
  matched: MatchedSend | null,
  src: ImapSource,
  campaignIdHint?: number
): Promise<number> {
  if (matched?.tenant_id && matched.tenant_id > 0) return matched.tenant_id;
  const cid = Math.floor(Number(campaignIdHint ?? 0));
  if (Number.isFinite(cid) && cid > 0) {
    const [rows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [cid]);
    const tid = Number((rows as Array<{ tenant_id?: unknown }>)[0]?.tenant_id ?? 0);
    if (tid > 0) return tid;
  }
  const scoped = imapTenantScope(src.tenantIdHint);
  return scoped ?? 1;
}

/** 连接抖动、超时类错误：可重试同一文件夹一次 */
function isTransientImapFailure(err: unknown): boolean {
  if (isDeadImapFlowClientError(err)) return false;
  const msg = String((err as Error)?.message ?? err);
  const code = String((err as NodeJS.ErrnoException)?.code ?? "");
  const s = `${msg} ${code}`;
  return /ETIMEDOUT|ETIMEOUT|ECONNRESET|EPIPE|ECONNREFUSED|NoConnection|not available|Command timed out/i.test(s);
}

/** ImapFlow 每个实例只能 connect() 一次；失败后必须新建实例 */
function isDeadImapFlowClientError(err: unknown): boolean {
  return /Can not re-use ImapFlow instance/i.test(String((err as Error)?.message ?? err));
}

async function safeImapLogout(client: { logout: () => Promise<void> } | null | undefined) {
  if (!client) return;
  try {
    await client.logout();
  } catch {
    /* logout 失败可忽略 */
  }
}

type ImapFlowCtor = typeof import("imapflow").ImapFlow;
type ImapFlowClient = InstanceType<ImapFlowCtor>;

function attachImapClientErrorHandlers(client: ImapFlowClient, sourceId: string) {
  const onClientError = (err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn("[imap-bounce] client error:", sourceId, formatImapTickError(err));
  };
  client.on("error", onClientError);
  client.on("close", () => {
    /* noop */
  });
}

async function connectImapFlowWithRetries(
  ImapFlow: ImapFlowCtor,
  src: ImapSource,
  opts: {
    connectionTimeoutMs: number;
    greetingTimeoutMs: number;
    socketTimeoutMs: number;
    connectAttempts: number;
  }
): Promise<ImapFlowClient> {
  let lastErr: unknown = new Error("IMAP connect failed");
  const allowSelfSigned = isMailTlsAllowSelfSigned();
  for (let ca = 1; ca <= opts.connectAttempts; ca++) {
    const client = new ImapFlow({
      host: src.host,
      port: src.port,
      secure: src.secure,
      auth: {
        user: src.username,
        pass: src.password
      },
      connectionTimeout: opts.connectionTimeoutMs,
      greetingTimeout: opts.greetingTimeoutMs,
      socketTimeout: opts.socketTimeoutMs,
      ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
      logger: false
    });
    attachImapClientErrorHandlers(client, src.sourceId);
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      await safeImapLogout(client);
      if (ca >= opts.connectAttempts) break;
      await delay(1000 * ca);
    }
  }
  throw lastErr;
}

/** 先扫 INBOX，再扫其它，最后扫 Spam/Junk，减少「首文件夹拖死连接」对后续的影响 */
function sortMailboxesForScan(primaryMailbox: string, extras: string[]): string[] {
  const raw = Array.from(
    new Set(
      [primaryMailbox, ...extras]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    )
  );
  const score = (m: string) => {
    const u = m.toUpperCase();
    if (u === "INBOX") return 0;
    if (/SPAM|JUNK|垃圾箱|广告邮件/.test(m)) return 4;
    return 2;
  };
  return [...raw].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

type PartialImapCursor = {
  sourceId: string;
  mailbox: string;
  uidValidity: number;
  lastUid: number;
};

async function persistPartialImapCursor(
  db: Pool,
  partial: PartialImapCursor | null,
  baselineLastUid: number
): Promise<void> {
  if (!partial || partial.lastUid <= baselineLastUid) return;
  try {
    await saveImapCursor(db, partial.sourceId, partial.mailbox, partial.uidValidity, partial.lastUid);
  } catch {
    /* ignore */
  }
}

/** IMAP SEARCH 只取疑似退信 UID，避免对最近 N 封全量 FETCH 信封导致 90s 超时 */
async function searchBounceUidsInRange(
  client: ImapFlowClient,
  startUid: number,
  fetchWindow: number
): Promise<number[] | null> {
  try {
    const fromUid = Math.max(1, startUid);
    const raw = await client.search(
      {
        uid: `${fromUid}:*`,
        or: [
          { from: "mailer-daemon" },
          { from: "postmaster" },
          { subject: "undelivered" },
          { subject: "delivery status" },
          { subject: "delivery failure" },
          { subject: "returned mail" },
          { subject: "mail delivery failed" },
          { subject: "failure notice" },
          { subject: "退信" },
          { subject: "无法送达" },
          { subject: "未送达" }
        ]
      },
      { uid: true }
    );
    if (raw === false) return [];
    const uids = (Array.isArray(raw) ? raw : [])
      .map((u) => Number(u))
      .filter((u) => Number.isFinite(u) && u >= fromUid)
      .sort((a, b) => a - b);
    return uids.slice(-fetchWindow);
  } catch {
    return null;
  }
}

export function getEmailBounceImapIngestorHealthSnapshot(): BounceImapHealthSnapshot {
  return { ...bounceImapHealth };
}

/** ImapFlow 对 NO/BAD 常把 message 固定为 "Command failed"，可读说明在 responseText */
/** 退信原文里常见邮局系统地址，勿当成「失败收件人」 */
function isBounceNoiseEmail(email: string): boolean {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!e) return true;
  if (/^(postmaster|mailer-daemon|mail-daemon|bounce|bounces|noreply|no-reply|daemon|doublebounce)@/i.test(e)) return true;
  if (e.includes("mailer-daemon@")) return true;
  return false;
}

/** 排除 Message-ID、退信邮箱自身、邮局系统账号等误当收件人 */
function isPlausibleBounceRecipientEmail(email: string, bounceMailboxHint?: string): boolean {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!e || isBounceNoiseEmail(e)) return false;
  if (bounceMailboxHint && e === bounceMailboxHint.trim().toLowerCase()) return false;
  if (/^(info|root|admin|hostmaster|abuse|webmaster)@/i.test(e)) return false;
  if (/^[0-9]{8,}\.[a-f0-9]{4,}@/i.test(e)) return false;
  if (/^<[^>]+>$/.test(e)) return false;
  const at = e.indexOf("@");
  if (at < 1 || at >= e.length - 3) return false;
  const local = e.slice(0, at);
  if (local.length > 64 || /^[0-9a-f]{16,}$/i.test(local)) return false;
  return true;
}

function extractDeliveryHeadersForBounce(parsed: unknown): string {
  try {
    const p = parsed as { headers?: { get?: (k: string) => string | undefined } };
    const h = p?.headers;
    if (!h || typeof h.get !== "function") return "";
    const keys = [
      "final-recipient",
      "original-recipient",
      "x-failed-recipients",
      "x-original-to",
      "delivered-to",
      "x-remark"
    ];
    const lines: string[] = [];
    for (const k of keys) {
      const v = h.get(k);
      if (v != null && String(v).trim()) lines.push(`${k}: ${String(v)}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

function formatImapTickError(e: unknown): string {
  if (!e || typeof e !== "object") return String(e ?? "unknown");
  const x = e as {
    message?: string;
    responseText?: string;
    responseStatus?: string;
    code?: string;
  };
  const base = String(x.message ?? e);
  const bits: string[] = [];
  if (x.responseStatus) bits.push(x.responseStatus);
  if (x.responseText) bits.push(x.responseText);
  if (x.code && x.code !== base) bits.push(String(x.code));
  if (bits.length) return `${base} (${bits.join(" — ")})`;
  if (base === "Command failed") {
    return "IMAP Command failed（服务器未返回详细文案；常见于收件箱无邮件时仍请求序号范围，或文件夹名/权限不符）。请确认「IMAP 文件夹」为 INBOX 且邮箱里至少有一封邮件后再观察。";
  }
  return base;
}

function extractFailedEmail(rawText: string): string | null {
  const txt = String(rawText ?? "");
  const checks = [
    /(?:无法送达到|无法送达|未能送达|投递失败|收件人)[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /message you sent to\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /recipient[^a-zA-Z0-9._%+-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Final-Recipient:[^\n]*?;\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Original-Recipient:[^\n]*?;\s*rfc822;\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /X-Failed-Recipients:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  ];
  for (const re of checks) {
    const m = re.exec(txt);
    if (m?.[1]) {
      const em = String(m[1]).trim().toLowerCase();
      if (isPlausibleBounceRecipientEmail(em)) return em;
    }
  }
  return null;
}

function extractFailedEmailCandidates(rawText: string, opts?: { allowBroadBodyScan?: boolean }): string[] {
  const txt = String(rawText ?? "");
  const out: string[] = [];
  const pushUnique = (v: string | null | undefined) => {
    const t = String(v ?? "").trim().toLowerCase();
    if (!t) return;
    if (!out.includes(t)) out.push(t);
  };

  const checks = [
    /(?:无法送达到|无法送达|未能送达|投递失败)[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /message you sent to\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /recipient[^a-zA-Z0-9._%+-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /Final-Recipient:[^\n]*?;\s*(?:rfc822;\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /Original-Recipient:[^\n]*?;\s*rfc822;\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /X-Failed-Recipients:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /X-Original-To:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
  ];
  for (const re of checks) {
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(txt))) {
      const v = String(m?.[1] ?? "").trim().toLowerCase();
      if (v && isPlausibleBounceRecipientEmail(v)) pushUnique(v);
    }
  }
  if (opts?.allowBroadBodyScan) {
    const all = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
    for (const em of all) {
      const v = String(em).trim().toLowerCase();
      if (isPlausibleBounceRecipientEmail(v)) pushUnique(v);
    }
  }
  return out;
}

/** 解析 message/delivery-status 附件里的 DSN 标准字段 */
function extractDsnFields(text: string): {
  failedEmail: string | null;
  status: string | null;
  action: string | null;
  diagnosticCode: string | null;
} {
  const finalRecipient = /^Final-Recipient:\s*[^;]*;\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/im.exec(text);
  const statusMatch = /^Status:\s*([\d]\.\d+\.\d+)/im.exec(text);
  const actionMatch = /^Action:\s*(failed|delayed|delivered|relayed|expanded)/im.exec(text);
  const diagMatch = /^Diagnostic-Code:\s*(.{1,300})/im.exec(text);
  return {
    failedEmail: finalRecipient?.[1]?.toLowerCase().trim() ?? null,
    status: statusMatch?.[1] ?? null,
    action: actionMatch?.[1]?.toLowerCase() ?? null,
    diagnosticCode: diagMatch?.[1]?.trim() ?? null
  };
}

function extractBounceReason(rawText: string): string {
  const dsn = extractDsnFields(rawText);
  if (dsn.status && dsn.action === "failed") {
    const diag = dsn.diagnosticCode ? ` — ${dsn.diagnosticCode}` : "";
    return `DSN ${dsn.status}${diag}`.slice(0, 500);
  }
  if (dsn.diagnosticCode) return dsn.diagnosticCode.slice(0, 500);
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const picked = lines.find((x) =>
    /(?:rejected|denied|unauthenticated|undeliver|退信|拒绝|invalid|5\.\d\.\d|Action:\s*failed)/i.test(x)
  );
  return (picked || lines[0] || "bounce report").slice(0, 500);
}

function normalizeMsgId(v: string): string {
  return String(v ?? "")
    .trim()
    .replace(/^<+|>+$/g, "")
    .toLowerCase();
}

function extractMessageIdCandidates(rawText: string): string[] {
  const txt = String(rawText ?? "");
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    const n = normalizeMsgId(String(v ?? ""));
    if (!n || !n.includes("@")) return;
    if (!out.includes(n)) out.push(n);
  };
  const res = [
    /Original-Message-ID:\s*<?([^>\s]+@[^>\s]+)>?/gi,
    /Message-ID:\s*<?([^>\s]+@[^>\s]+)>?/gi,
    /In-Reply-To:\s*<?([^>\s]+@[^>\s]+)>?/gi,
    /References:\s*([^\n\r]+)/gi
  ];
  for (const re of res) {
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(txt))) {
      if (!m?.[1]) continue;
      if (/^References:/i.test(m[0])) {
        const ids = String(m[1])
          .match(/<?([^>\s]+@[^>\s]+)>?/g)
          ?.map((x) => x.replace(/[<>]/g, ""));
        for (const id of ids ?? []) push(id);
      } else {
        push(m[1]);
      }
    }
  }
  return out.slice(0, 20);
}

/** 从「同步退信」传入活动 id 时优先使用：避免全局按收件人命中到别的活动旧记录 */
/** 退信归属：优先活动 id，再 Message-ID，再近期同邮箱发送记录（避免 env 全局邮箱误绑租户 1） */
async function pickMatchedSendForBounce(
  db: Pool,
  bouncedEmail: string,
  opts: {
    tenantScope?: number;
    campaignIdHint?: number;
    messageIds?: string[];
    sendScope?: ImapSendScope;
  }
): Promise<MatchedSend | null> {
  const email = String(bouncedEmail ?? "")
    .trim()
    .toLowerCase();
  if (!email) return null;

  const cid = Math.floor(Number(opts.campaignIdHint ?? 0));
  const scope = opts.sendScope;
  if (Number.isFinite(cid) && cid > 0) {
    const byCamp = await pickMatchedSendByRecipientAndCampaign(db, email, cid, undefined, scope);
    if (byCamp) return byCamp;
  }

  const mids = (opts.messageIds ?? []).filter(Boolean);
  if (mids.length > 0) {
    const byMid = await pickMatchedSendByMessageIds(db, mids, opts.tenantScope, scope);
    if (byMid && byMid.matchedEmail === email) return byMid;
  }

  const tenantOk = opts.tenantScope != null && Number.isFinite(opts.tenantScope) && Number(opts.tenantScope) > 0;
  const scopeClause = imapSendScopeSql(scope);
  const [rows] = await db.query(
    `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
      WHERE LOWER(TRIM(s.to_email)) = ?
        AND s.created_at >= DATE_SUB(NOW(), INTERVAL 21 DAY)
        ${tenantOk ? "AND c.tenant_id = ?" : ""}
        ${scopeClause.sql}
      ORDER BY s.id DESC
      LIMIT 1`,
    tenantOk ? [email, Number(opts.tenantScope), ...scopeClause.params] : [email, ...scopeClause.params]
  );
  const row = (rows as Array<{
    send_id: number;
    campaign_id: number;
    contact_id: number | null;
    tenant_id: number;
  }>)[0];
  if (!row) return null;
  return {
    send_id: Number(row.send_id),
    campaign_id: Number(row.campaign_id),
    contact_id: row.contact_id == null ? null : Number(row.contact_id),
    tenant_id: Number(row.tenant_id)
  };
}

function isLikelyBounceMessage(subject: string, bodyText: string): boolean {
  const blob = `${subject}\n${bodyText}`.slice(0, 8000);
  return /mail delivery failed|undelivered|undeliverable|delivery status notification|returned mail|failure notice|delivery failure|message not delivered|退信|未送达|无法送达|mailer-daemon|postmaster@|delivery has failed/i.test(
    blob
  );
}

/** 先读信封筛退信，避免对最近 N 封全部下载正文导致 90s 超时 */
function isLikelyBounceEnvelopeQuick(subject: string, fromAddresses: string[]): boolean {
  const sub = String(subject ?? "");
  const from = fromAddresses.join(" ").toLowerCase();
  return (
    /mail delivery|undelivered|undeliverable|delivery status|returned mail|failure notice|delivery failure|message not delivered|退信|未送达|无法送达|mailer-daemon|postmaster/i.test(
      sub
    ) ||
    from.includes("mailer-daemon") ||
    from.includes("postmaster")
  );
}

async function pickMatchedSendByRecipientAndCampaign(
  db: Pool,
  bouncedEmail: string,
  campaignId: number,
  tenantScope?: number,
  sendScope?: ImapSendScope
): Promise<MatchedSend | null> {
  const cid = Math.floor(Number(campaignId));
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const tenantOk = tenantScope != null && Number.isFinite(tenantScope) && Number(tenantScope) > 0;
  const scopeClause = imapSendScopeSql(sendScope);
  const [rows] = await db.query(
    `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
      WHERE LOWER(TRIM(s.to_email)) = ?
        AND s.campaign_id = ?
      ${tenantOk ? "AND c.tenant_id = ?" : ""}
      ${scopeClause.sql}
      ORDER BY s.id DESC
      LIMIT 1`,
    tenantOk
      ? [bouncedEmail, cid, Number(tenantScope), ...scopeClause.params]
      : [bouncedEmail, cid, ...scopeClause.params]
  );
  const row = (rows as Array<{
    send_id: number;
    campaign_id: number;
    contact_id: number | null;
    tenant_id: number;
  }>)[0];
  if (!row) return null;
  return {
    send_id: Number(row.send_id),
    campaign_id: Number(row.campaign_id),
    contact_id: row.contact_id == null ? null : Number(row.contact_id),
    tenant_id: Number(row.tenant_id)
  };
}

async function pickMatchedSendByRecipient(
  db: Pool,
  bouncedEmail: string,
  tenantScope?: number
): Promise<MatchedSend | null> {
  const tenantOk = tenantScope != null && Number.isFinite(tenantScope) && Number(tenantScope) > 0;
  const [rows] = await db.query(
    `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
      WHERE LOWER(TRIM(s.to_email)) = ?
      ${tenantOk ? "AND c.tenant_id = ?" : ""}
      ORDER BY s.id DESC
      LIMIT 1`,
    tenantOk ? [bouncedEmail, Number(tenantScope)] : [bouncedEmail]
  );
  const row = (rows as Array<{
    send_id: number;
    campaign_id: number;
    contact_id: number | null;
    tenant_id: number;
  }>)[0];
  if (!row) return null;
  return {
    send_id: Number(row.send_id),
    campaign_id: Number(row.campaign_id),
    contact_id: row.contact_id == null ? null : Number(row.contact_id),
    tenant_id: Number(row.tenant_id)
  };
}

async function pickMatchedSendByRecipients(
  db: Pool,
  bouncedEmails: string[],
  tenantScope?: number
): Promise<(MatchedSend & { matchedEmail: string }) | null> {
  const cleaned = bouncedEmails.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const uniq = Array.from(new Set(cleaned)).slice(0, 50);
  const ph = uniq.map(() => "?").join(",");
  const tenantOk = tenantScope != null && Number.isFinite(tenantScope) && Number(tenantScope) > 0;
  const [rows] = await db.query(
    `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id, LOWER(TRIM(s.to_email)) AS matched_email
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
      WHERE LOWER(TRIM(s.to_email)) IN (${ph})
      ${tenantOk ? "AND c.tenant_id = ?" : ""}
      ORDER BY s.id DESC
      LIMIT 1`,
    tenantOk ? [...uniq, Number(tenantScope)] : uniq
  );
  const row = (rows as Array<{
    send_id: number;
    campaign_id: number;
    contact_id: number | null;
    tenant_id: number;
    matched_email: string;
  }>)[0];
  if (!row) return null;
  return {
    send_id: Number(row.send_id),
    campaign_id: Number(row.campaign_id),
    contact_id: row.contact_id == null ? null : Number(row.contact_id),
    tenant_id: Number(row.tenant_id),
    matchedEmail: String(row.matched_email ?? "").trim().toLowerCase()
  };
}

async function pickMatchedSendByMessageIds(
  db: Pool,
  messageIds: string[],
  tenantScope?: number,
  sendScope?: ImapSendScope
): Promise<(MatchedSend & { matchedMessageId: string; matchedEmail: string }) | null> {
  const cleaned = messageIds.map((x) => normalizeMsgId(x)).filter(Boolean);
  if (cleaned.length === 0) return null;
  const uniq = Array.from(new Set(cleaned)).slice(0, 20);
  const ph = uniq.map(() => "?").join(",");
  const idParams = [...uniq, ...uniq];
  const tenantOk = tenantScope != null && Number.isFinite(tenantScope) && Number(tenantScope) > 0;
  const scopeClause = imapSendScopeSql(sendScope);
  const [rows] = await db.query(
    `SELECT
        s.id AS send_id,
        s.campaign_id,
        s.contact_id,
        c.tenant_id,
        LOWER(TRIM(s.provider_message_id)) AS matched_message_id,
        LOWER(TRIM(s.to_email)) AS matched_email
       FROM email_sends s
       INNER JOIN email_campaigns c ON c.id = s.campaign_id
      WHERE (
        LOWER(TRIM(s.provider_message_id)) IN (${ph})
        OR LOWER(TRIM(REPLACE(REPLACE(TRIM(s.provider_message_id), '<', ''), '>', ''))) IN (${ph})
      )
      ${tenantOk ? "AND c.tenant_id = ?" : ""}
      ${scopeClause.sql}
      ORDER BY s.id DESC
      LIMIT 1`,
    tenantOk ? [...idParams, Number(tenantScope), ...scopeClause.params] : [...idParams, ...scopeClause.params]
  );
  const row = (rows as Array<{
    send_id: number;
    campaign_id: number;
    contact_id: number | null;
    tenant_id: number;
    matched_message_id: string;
    matched_email: string;
  }>)[0];
  if (!row) return null;
  return {
    send_id: Number(row.send_id),
    campaign_id: Number(row.campaign_id),
    contact_id: row.contact_id == null ? null : Number(row.contact_id),
    tenant_id: Number(row.tenant_id),
    matchedMessageId: normalizeMsgId(String(row.matched_message_id ?? "")),
    matchedEmail: String(row.matched_email ?? "").trim().toLowerCase()
  };
}

async function insertBounceEvent(db: Pool, input: {
  tenantId: number;
  campaignId: number | null;
  contactId: number | null;
  emailSendId: number | null;
  email: string;
  providerMessageId: string;
  reason: string;
  rawText: string;
  createdAt: Date | null;
}) {
  const dedupKey = `imap:${input.providerMessageId}:${input.email}:${input.tenantId}`;
  const [dups] = await db.query(
    `SELECT id
       FROM email_delivery_events
      WHERE event_type = 'bounced'
        AND (
          (provider = 'imap_bounce' AND provider_message_id = ?)
          OR (
            email = ?
            AND payload_json IS NOT NULL
            AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.dedupKey')) = ?
          )
        )
      LIMIT 1`,
    [input.providerMessageId, input.email, dedupKey]
  );
  if ((dups as Array<{ id: number }>)[0]?.id) return false;

  if (!input.emailSendId || !input.campaignId) return false;

  await db.query(
    `INSERT INTO email_delivery_events
     (tenant_id, campaign_id, contact_id, email_send_id, email, event_type, provider, provider_message_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'bounced', 'imap_bounce', ?, CAST(? AS JSON), COALESCE(?, NOW()))`,
    [
      input.tenantId,
      input.campaignId,
      input.contactId,
      input.emailSendId,
      input.email,
      input.providerMessageId,
      JSON.stringify({
        reason: input.reason,
        source: "imap_bounce",
        dedupKey,
        rawText: input.rawText.slice(0, 12000)
      }),
      input.createdAt
    ]
  );
  // 退信仅用于投递失败统计与后续清洗，不自动把 CRM 联系人状态改为 unsubscribed。
  // 否则会导致联系人从分组/活动可选目标中“消失”，与运营预期不一致。
  return true;
}

async function ensureImapCursorTable(db: Pool) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS email_bounce_imap_cursors (
      source_id VARCHAR(128) NOT NULL,
      mailbox VARCHAR(255) NOT NULL,
      uid_validity BIGINT NOT NULL DEFAULT 0,
      last_uid BIGINT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id, mailbox)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function loadImapCursor(db: Pool, sourceId: string, mailbox: string): Promise<ImapCursorRow | null> {
  const [rows] = await db.query(
    `SELECT source_id, mailbox, uid_validity, last_uid
       FROM email_bounce_imap_cursors
      WHERE source_id = ? AND mailbox = ?
      LIMIT 1`,
    [sourceId, mailbox]
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    source_id: String(row.source_id ?? sourceId),
    mailbox: String(row.mailbox ?? mailbox),
    uid_validity: Number(row.uid_validity ?? 0),
    last_uid: Number(row.last_uid ?? 0)
  };
}

async function saveImapCursor(
  db: Pool,
  sourceId: string,
  mailbox: string,
  uidValidity: number,
  lastUid: number
) {
  await db.query(
    `INSERT INTO email_bounce_imap_cursors (source_id, mailbox, uid_validity, last_uid)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       uid_validity = VALUES(uid_validity),
       last_uid = VALUES(last_uid)`,
    [sourceId, mailbox, Math.max(0, uidValidity), Math.max(0, lastUid)]
  );
}

async function runBounceImapTick(
  db: Pool,
  env: Env,
  opts?: { forceRescanRecent?: boolean; campaignIdHint?: number }
): Promise<{ inserted: number; sources: number }> {
  const sources = await loadImapSources(db, env);
  if (sources.length === 0) return { inserted: 0, sources: 0 };
  await ensureImapCursorTable(db);
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const perSourceTimeoutMs = Math.max(20_000, Number(process.env.BOUNCE_IMAP_SOURCE_TIMEOUT_MS || 75_000));
  const socketTimeoutMs = Math.max(45_000, Number(process.env.BOUNCE_IMAP_SOCKET_TIMEOUT_MS || 90_000));
  const connectionTimeoutMs = Math.max(15_000, Number(process.env.BOUNCE_IMAP_CONNECTION_TIMEOUT_MS || 30_000));
  const greetingTimeoutMs = Math.max(15_000, Number(process.env.BOUNCE_IMAP_GREETING_TIMEOUT_MS || 25_000));
  const connectAttempts = Math.max(1, Math.min(6, Number(process.env.BOUNCE_IMAP_CONNECT_RETRIES || 3)));

  let inserted = 0;
  const touchedCampaignIds = new Set<number>();
  for (const src of sources) {
    let client: ImapFlowClient | null = null;
    let partialCursor: PartialImapCursor | null = null;
    try {
      await withTimeout(
        (async () => {
          client = await connectImapFlowWithRetries(ImapFlow, src, {
            connectionTimeoutMs,
            greetingTimeoutMs,
            socketTimeoutMs,
            connectAttempts
          });

          const campaignPull = Math.floor(Number(opts?.campaignIdHint ?? 0)) > 0;
          const extraMailboxes = String(
            process.env.BOUNCE_IMAP_EXTRA_MAILBOXES || "INBOX,Spam,Junk,INBOX.Spam,INBOX.Junk"
          )
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const imapSendScope = resolveImapSendScopeFromSource(src);
          const sortedMailboxes = sortMailboxesForScan(src.mailbox, extraMailboxes);
          const mailboxAttempts = Math.max(1, Math.min(4, Number(process.env.BOUNCE_IMAP_MAILBOX_RETRIES || 2)));

          for (const mailbox of sortedMailboxes) {
            for (let ma = 1; ma <= mailboxAttempts; ma++) {
              let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
              let lastUid = 0;
              try {
                lock = await client.getMailboxLock(mailbox);
                const exists = Number(client.mailbox.exists ?? 0);
                if (exists < 1) {
                  // eslint-disable-next-line no-console
                  console.log("[imap-bounce] mailbox empty:", src.sourceId, mailbox);
                  break;
                }
                const forceRescan = Boolean(opts?.forceRescanRecent);
                const currentUidValidity = Number(client.mailbox.uidValidity ?? 0);
                const cursor = await loadImapCursor(db, src.sourceId, mailbox);
                const cursorValid =
                  Boolean(cursor) && Number(cursor!.uid_validity) === currentUidValidity;
                lastUid = cursorValid ? Math.max(0, Number(cursor!.last_uid ?? 0)) : 0;
                if (cursor && !cursorValid && Number(cursor.last_uid ?? 0) > 0) {
                  // eslint-disable-next-line no-console
                  console.log(
                    "[imap-bounce] uid_validity changed:",
                    src.sourceId,
                    mailbox,
                    `stored=${cursor.uid_validity}`,
                    `current=${currentUidValidity}`,
                    `last_uid=${cursor.last_uid}`
                  );
                }
                let maxSeenUid = lastUid;
                const lightQuery = { uid: true, envelope: true, internalDate: true } as const;
                const fullQuery = { uid: true, envelope: true, source: true, internalDate: true } as const;
                const defaultRescan = campaignPull ? 120 : 40;
                const fetchWindow = Math.min(
                  120,
                  Math.max(
                    15,
                    Number(
                      campaignPull
                        ? process.env.BOUNCE_IMAP_CAMPAIGN_RESCAN_WINDOW || process.env.BOUNCE_IMAP_RESCAN_WINDOW || defaultRescan
                        : process.env.BOUNCE_IMAP_RESCAN_WINDOW || defaultRescan
                    )
                  )
                );
                /**
                 * 每轮最多扫 fetchWindow 封。
                 * 游标落后时 `${lastUid+1}:*` 会一次拉上万封 → 90s 超时且游标永不前进。
                 */
                const startUid =
                  forceRescan || lastUid < 1
                    ? Math.max(1, exists - fetchWindow + 1)
                    : Math.max(lastUid + 1, Math.max(1, exists - fetchWindow + 1));
                const fetchRange = `${startUid}:*`;
                const scanApprox = Math.max(0, exists - startUid + 1);
                // eslint-disable-next-line no-console
                console.log(
                  "[imap-bounce] scan:",
                  src.sourceId,
                  mailbox,
                  `lastUid=${lastUid}`,
                  `exists=${exists}`,
                  `range=${fetchRange}`,
                  `~${scanApprox}`
                );
                const rangeEndUid = Math.min(exists, startUid + scanApprox - 1);
                const touchCursor = async () => {
                  if (maxSeenUid > lastUid) {
                    partialCursor = {
                      sourceId: src.sourceId,
                      mailbox,
                      uidValidity: currentUidValidity,
                      lastUid: maxSeenUid
                    };
                    await persistPartialImapCursor(db, partialCursor, lastUid);
                  }
                };

                const bounceUidList = await searchBounceUidsInRange(client, startUid, fetchWindow);
                const uidWorkList: number[] = [];

                if (bounceUidList !== null) {
                  if (bounceUidList.length === 0) {
                    maxSeenUid = Math.max(maxSeenUid, rangeEndUid);
                    await touchCursor();
                  } else {
                    for (const uid of bounceUidList) {
                      uidWorkList.push(uid);
                      if (uid > maxSeenUid) maxSeenUid = uid;
                    }
                    await touchCursor();
                  }
                }

                const fetchOptions = forceRescan ? undefined : ({ uid: true } as const);
                let msgBatchCount = 0;
                if (bounceUidList === null) {
                  for await (const msg of client.fetch(fetchRange, lightQuery, fetchOptions)) {
                    const msgUid = Number(msg.uid ?? 0);
                    if (msgUid > maxSeenUid) maxSeenUid = msgUid;
                    msgBatchCount++;
                    if (msgBatchCount % 5 === 0) await touchCursor();
                    const subjectLine = String(msg.envelope?.subject ?? "");
                    const fromAddrs = (msg.envelope?.from ?? [])
                      .map((a) => String((a as { address?: string }).address ?? ""))
                      .filter(Boolean);
                    if (!isLikelyBounceEnvelopeQuick(subjectLine, fromAddrs)) continue;
                    uidWorkList.push(msgUid);
                  }
                  await touchCursor();
                }

                for (const msgUid of uidWorkList) {
                if (msgUid < 1) continue;

                const fullMsg = await client.fetchOne(
                  String(msgUid),
                  fullQuery,
                  { uid: true }
                );
                if (!fullMsg?.source) continue;

                const subjectLine = String(fullMsg.envelope?.subject ?? "");

                const messageId = String(fullMsg.envelope?.messageId ?? `${src.sourceId}-uid-${msgUid}`);
                const parsed = await simpleParser(fullMsg.source);
                const hdrBlob = extractDeliveryHeadersForBounce(parsed);
                const rawSourceText =
                  typeof fullMsg.source === "string"
                    ? fullMsg.source
                    : Buffer.isBuffer(fullMsg.source)
                      ? fullMsg.source.toString("utf8")
                      : String(fullMsg.source ?? "");
                let dsnAttachmentText = "";
                const attachmentText = (parsed.attachments ?? [])
                  .map((a) => {
                    const ct = String(a.contentType ?? "").toLowerCase();
                    if (!Buffer.isBuffer(a.content)) return "";
                    const content = a.content.toString("utf8");
                    if (ct.includes("message/delivery-status")) {
                      dsnAttachmentText = content;
                      return content;
                    }
                    if (ct.includes("message/rfc822") || ct.startsWith("text/")) {
                      return content;
                    }
                    return "";
                  })
                  .filter(Boolean)
                  .join("\n");
                const text = `${hdrBlob}\n${parsed.subject ?? ""}\n${parsed.text ?? ""}\n${parsed.html ?? ""}\n${attachmentText}\n${rawSourceText}`;
                const msgIdCandidates = extractMessageIdCandidates(text);
                const tenantScope = imapTenantScope(src.tenantIdHint);
                const bounceMailboxHint = String(src.username ?? "").trim().toLowerCase();
                const dsnFields = extractDsnFields(dsnAttachmentText || text);
                const dsnConfirmed =
                  dsnFields.action === "failed" || (dsnFields.status?.startsWith("5") ?? false);
                const candidates = extractFailedEmailCandidates(text, {
                  allowBroadBodyScan: dsnConfirmed && !dsnFields.failedEmail
                });
                if (candidates.length === 0) {
                  const one = extractFailedEmail(text);
                  if (one && isPlausibleBounceRecipientEmail(one, bounceMailboxHint)) candidates.push(one);
                }
                if (dsnFields.failedEmail && isPlausibleBounceRecipientEmail(dsnFields.failedEmail, bounceMailboxHint)) {
                  if (dsnConfirmed) {
                    if (!candidates.includes(dsnFields.failedEmail)) {
                      candidates.unshift(dsnFields.failedEmail);
                    }
                  }
                }
                const likelyBounce = isLikelyBounceMessage(subjectLine, text);
                const matchedByMsgIdGlobal =
                  msgIdCandidates.length > 0
                    ? await pickMatchedSendByMessageIds(db, msgIdCandidates, tenantScope, imapSendScope)
                    : null;
                if (candidates.length === 0 && !matchedByMsgIdGlobal && !likelyBounce) continue;
                const recipientEmails = Array.from(
                  new Set(
                    candidates
                      .map((x) => String(x ?? "").trim().toLowerCase())
                      .filter((x) => isPlausibleBounceRecipientEmail(x, bounceMailboxHint))
                  )
                ).slice(0, 50);
                const rcptList =
                  recipientEmails.length > 0
                    ? recipientEmails
                    : matchedByMsgIdGlobal
                      ? [matchedByMsgIdGlobal.matchedEmail]
                      : [];
                if (rcptList.length === 0) continue;
                for (let ri = 0; ri < rcptList.length; ri++) {
                  const bouncedEmail = rcptList[ri]!;
                  let matched: MatchedSend | null = null;
                  if (matchedByMsgIdGlobal && matchedByMsgIdGlobal.matchedEmail === bouncedEmail) {
                    matched = matchedByMsgIdGlobal;
                  }
                  if (!matched) {
                    matched = await pickMatchedSendForBounce(db, bouncedEmail, {
                      tenantScope,
                      campaignIdHint: opts?.campaignIdHint,
                      messageIds: msgIdCandidates,
                      sendScope: imapSendScope
                    });
                  }
                  if (!matched) continue;

                  const tenantId = await resolveTenantIdForBounceInsert(
                    db,
                    matched,
                    src,
                    opts?.campaignIdHint
                  );
                  const campaignId = matched?.campaign_id ?? null;
                  const contactId = matched?.contact_id ?? null;
                  const emailSendId = matched != null && Number.isFinite(Number(matched.send_id)) ? Number(matched.send_id) : null;
                  const reason = extractBounceReason(text);
                  const providerMessageId = `${src.sourceId}:${messageId}:rcpt:${bouncedEmail}:${ri}`;
                  const ok = await insertBounceEvent(db, {
                    tenantId,
                    campaignId,
                    contactId,
                    emailSendId,
                    email: bouncedEmail,
                    providerMessageId,
                    reason,
                    rawText: text,
                    createdAt: fullMsg.internalDate ?? null
                  });
                  if (ok) {
                    inserted += 1;
                    const cid = Number(campaignId ?? 0);
                    if (Number.isFinite(cid) && cid > 0) touchedCampaignIds.add(cid);
                  }
                }
                if (src.markSeen) {
                  await client.messageFlagsAdd({ uid: msgUid }, ["\\Seen"]);
                }
              }
                maxSeenUid = Math.max(maxSeenUid, rangeEndUid);
                partialCursor = {
                  sourceId: src.sourceId,
                  mailbox,
                  uidValidity: currentUidValidity,
                  lastUid: maxSeenUid
                };
                await saveImapCursor(db, src.sourceId, mailbox, currentUidValidity, maxSeenUid);
                break;
              } catch (mailboxErr) {
                await persistPartialImapCursor(db, partialCursor, lastUid);
                if (isDeadImapFlowClientError(mailboxErr)) break;
                if (ma < mailboxAttempts && isTransientImapFailure(mailboxErr)) {
                  await delay(1200 * ma);
                  continue;
                }
                // 文件夹不存在/无权限不应阻断其他文件夹扫描
                // eslint-disable-next-line no-console
                console.warn("[imap-bounce] mailbox skipped:", src.sourceId, mailbox, formatImapTickError(mailboxErr));
                break;
              } finally {
                try {
                  lock?.release();
                } catch {
                  // ignore lock release error
                }
              }
            }
          }
        })(),
        perSourceTimeoutMs,
        `IMAP source ${src.sourceId}`
      );
    } catch (e) {
      await persistPartialImapCursor(db, partialCursor, 0);
      // 单来源失败不阻断全轮，保证 health 的 lastTickFinishedAt 始终可更新
      // eslint-disable-next-line no-console
      console.warn("[imap-bounce] source failed:", src.sourceId, formatImapTickError(e));
    } finally {
      await persistPartialImapCursor(db, partialCursor, 0);
      await safeImapLogout(client);
    }
  }

  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[imap-bounce] inserted ${inserted} bounced events`);
  }

  const reconcileIds =
    touchedCampaignIds.size > 0
      ? [...touchedCampaignIds]
      : inserted > 0
        ? await listRecentImapBounceCampaignIds(db, 15)
        : [];
  if (reconcileIds.length > 0) {
    try {
      await reconcileTouchedCampaignsAfterImapIngest(db, reconcileIds);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[imap-bounce] post-insert reconcile failed:", (e as Error)?.message ?? e);
    }
  }

  return { inserted, sources: sources.length };
}

export function startEmailBounceImapIngestor(db: Pool, env: Env) {
  // 默认 20 秒轮询，提升“退信入库→统计可见”的实时性
  const intervalMs = Math.max(15, Number(env.BOUNCE_IMAP_POLL_SECONDS || 20)) * 1000;
  bounceImapHealth.intervalSeconds = Math.floor(intervalMs / 1000);

  const tick = async () => {
    if (bounceImapTickRunning) return;
    bounceImapTickRunning = true;
    bounceImapHealth.running = true;
    bounceImapHealth.lastTickStartedAt = isoNow();
    try {
      const ret = await runBounceImapTick(db, env);
      bounceImapHealth.lastSourcesCount = ret.sources;
      bounceImapHealth.lastInsertedCount = ret.inserted;
      bounceImapHealth.totalInsertedCount += Math.max(0, ret.inserted);
      bounceImapHealth.lastSuccessAt = isoNow();
      bounceImapHealth.lastErrorMessage = null;
    } catch (e) {
      const msg = formatImapTickError(e);
      bounceImapHealth.lastErrorAt = isoNow();
      bounceImapHealth.lastErrorMessage = msg;
      try {
        const n = (await loadImapSources(db, env)).length;
        bounceImapHealth.lastSourcesCount = n;
      } catch {
        /* keep previous */
      }
      if (
        msg.includes("Cannot find package 'imapflow'") ||
        msg.includes("Cannot find package \"imapflow\"") ||
        msg.includes("Cannot find package 'mailparser'") ||
        msg.includes("Cannot find package \"mailparser\"")
      ) {
        // eslint-disable-next-line no-console
        console.warn("[imap-bounce] dependency missing: install imapflow and mailparser in backend");
      } else {
        // eslint-disable-next-line no-console
        const ex = e as { responseText?: string; responseStatus?: string; stack?: string };
        console.warn("[imap-bounce] tick failed:", msg, ex?.responseStatus, ex?.responseText, (e as Error)?.stack);
      }
    } finally {
      bounceImapTickRunning = false;
      bounceImapHealth.running = false;
      bounceImapHealth.lastTickFinishedAt = isoNow();
    }
  };
  setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
}

export async function triggerEmailBounceImapIngestorNow(
  db: Pool,
  env: Env,
  opts?: { forceRescanRecent?: boolean; campaignIdHint?: number }
): Promise<{
  started: boolean;
  inserted: number;
  sources: number;
  message?: string;
}> {
  if (bounceImapTickRunning) {
    return { started: false, inserted: 0, sources: 0, message: "退信同步任务正在运行中，请稍后再试。" };
  }
  bounceImapTickRunning = true;
  bounceImapHealth.running = true;
  bounceImapHealth.lastTickStartedAt = isoNow();
  try {
    const ret = await runBounceImapTick(db, env, opts);
    bounceImapHealth.lastSourcesCount = ret.sources;
    bounceImapHealth.lastInsertedCount = ret.inserted;
    bounceImapHealth.totalInsertedCount += Math.max(0, ret.inserted);
    bounceImapHealth.lastSuccessAt = isoNow();
    bounceImapHealth.lastErrorMessage = null;
    return { started: true, inserted: ret.inserted, sources: ret.sources };
  } catch (e) {
    const msg = formatImapTickError(e);
    bounceImapHealth.lastErrorAt = isoNow();
    bounceImapHealth.lastErrorMessage = msg;
    return { started: false, inserted: 0, sources: 0, message: msg };
  } finally {
    bounceImapTickRunning = false;
    bounceImapHealth.running = false;
    bounceImapHealth.lastTickFinishedAt = isoNow();
  }
}

function pushImapSourceUnique(out: ImapSource[], seen: Set<string>, src: ImapSource) {
  const key = `${src.host}|${src.username}|${src.mailbox}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(src);
}

/** 运维：列出将参与退信扫描的 IMAP 来源（不连网） */
export async function listImapBounceSources(db: Pool, env: Env): Promise<
  Array<{
    sourceId: string;
    username: string;
    host: string;
    mailbox: string;
    sendScope?: ImapSendScope;
  }>
> {
  const sources = await loadImapSources(db, env);
  return sources.map((s) => ({
    sourceId: s.sourceId,
    username: s.username,
    host: s.host,
    mailbox: s.mailbox,
    sendScope: s.sendScope ?? resolveImapSendScopeFromSource(s)
  }));
}

async function loadImapSources(db: Pool, env: Env): Promise<ImapSource[]> {
  const out: ImapSource[] = [];
  const seen = new Set<string>();

  /** 业务机 .env 优先：DB 里 SMTP 密码未与 Dovecot 同步时仍能拉退信 */
  if (env.BOUNCE_IMAP_HOST && env.BOUNCE_IMAP_USER && env.BOUNCE_IMAP_PASS) {
    const envTenantHint = Math.floor(Number(env.BOUNCE_IMAP_TENANT_ID ?? 0));
    const envUser = String(env.BOUNCE_IMAP_USER);
    const envDomain = parseSenderDomainFromMailbox(envUser);
    pushImapSourceUnique(out, seen, {
      sourceId: "env:fallback",
      /** 0 = 不按租户过滤，匹配全库最近发送；专线多租户共用同一退信邮箱时必须为 0 */
      tenantIdHint: Number.isFinite(envTenantHint) && envTenantHint > 0 ? envTenantHint : 0,
      host: String(env.BOUNCE_IMAP_HOST),
      port: Number(env.BOUNCE_IMAP_PORT),
      secure: Boolean(env.BOUNCE_IMAP_SECURE),
      username: envUser,
      password: String(env.BOUNCE_IMAP_PASS),
      mailbox: String(env.BOUNCE_IMAP_MAILBOX || "INBOX"),
      markSeen: Boolean(env.BOUNCE_IMAP_MARK_SEEN),
      sendScope: envDomain ? { senderDomain: envDomain } : undefined
    });
  }

  const [rows] = await db.query(
    `SELECT id, tenant_id, imap_host, imap_port, imap_secure, imap_username, imap_password_enc, imap_mailbox
       FROM smtp_profiles
      WHERE imap_enabled = 1
      ORDER BY tenant_id ASC, id DESC`
  );
  for (const r of rows as Array<Record<string, unknown>>) {
    const host = String(r.imap_host ?? "").trim();
    const username = String(r.imap_username ?? "").trim();
    const enc = String(r.imap_password_enc ?? "").trim();
    if (!host || !username || !enc) continue;
    let pwd = "";
    try {
      pwd = decryptSecret(enc);
    } catch {
      continue;
    }
    const smtpId = Number(r.id ?? 0);
    pushImapSourceUnique(out, seen, {
      sourceId: `smtp:${smtpId}`,
      tenantIdHint: Number(r.tenant_id ?? 0) || 1,
      host,
      port: Number(r.imap_port ?? 993),
      secure: Number(r.imap_secure ?? 1) === 1,
      username,
      password: pwd,
      mailbox: String(r.imap_mailbox ?? "").trim() || "INBOX",
      markSeen: true,
      sendScope: {
        smtpProfileId: smtpId,
        senderDomain: parseSenderDomainFromMailbox(username) || undefined
      }
    });
  }

  /**
   * 专线发信：退信进发件邮箱 INBOX（如 info@mail.bigsocialboss.online）。
   * 即使用户未在 smtp_profiles 勾选 imap_enabled，也用 SMTP 同机同账号拉退信，避免 .env 仍指向旧 .top 域名。
   */
  const [dedRows] = await db.query(
    `SELECT sp.id, sp.tenant_id, sp.host, sp.port, sp.username, sp.password_enc, sp.from_email,
            e.sender_domain
       FROM email_dedicated_servers e
       INNER JOIN smtp_profiles sp ON sp.id = e.smtp_profile_id
      WHERE e.status IN ('ready', 'awaiting_dns', 'provisioning')
        AND sp.password_enc IS NOT NULL
        AND TRIM(sp.password_enc) <> ''
      ORDER BY e.id DESC`
  );
  const allowDbAlongsideEnv =
    String(process.env.BOUNCE_IMAP_ALLOW_DB_SOURCES ?? "1").trim() === "1";
  for (const r of dedRows as Array<Record<string, unknown>>) {
    const host = String(r.host ?? "").trim();
    const username = String(r.username ?? r.from_email ?? "").trim().toLowerCase();
    const enc = String(r.password_enc ?? "").trim();
    if (!host || !username || !enc) continue;
    let pwd = "";
    try {
      pwd = decryptSecret(enc);
    } catch {
      continue;
    }
    const dedSmtpId = Number(r.id ?? 0);
    const senderDomain = parseSenderDomainFromMailbox(username, String(r.sender_domain ?? ""));
    pushImapSourceUnique(out, seen, {
      sourceId: `dedicated-smtp:${dedSmtpId}`,
      tenantIdHint: Number(r.tenant_id ?? 0) || 0,
      host,
      port: 993,
      secure: true,
      username,
      password: pwd,
      mailbox: "INBOX",
      markSeen: true,
      sendScope: {
        smtpProfileId: dedSmtpId,
        senderDomain: senderDomain || undefined
      }
    });
  }

  /**
   * 一台 VPS 多发信域：各专线 smtp（info@mail.<域>）与 .env 兜底并存；同 host 不同 username 由 pushImapSourceUnique 去重。
   * 若仅需单邮箱可设 BOUNCE_IMAP_ALLOW_DB_SOURCES=0（不推荐多域 VPS）。
   */
  if (
    out.some((s) => s.sourceId === "env:fallback") &&
    !allowDbAlongsideEnv
  ) {
    return out.filter((s) => s.sourceId === "env:fallback");
  }

  return out;
}

