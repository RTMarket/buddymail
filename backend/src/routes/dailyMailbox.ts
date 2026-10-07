import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import nodemailer from "nodemailer";
import { z } from "zod";
import { resolveTenantId } from "../middleware/auth.js";
import { decryptSecret } from "../cryptoSecret.js";
import { env } from "../env.js";
import { resolveDedicatedSmtpPlainPassword } from "../services/dedicatedSmtpCredentials.js";
import { syncSmtpCredentialsViaSshForServer } from "../services/emailDedicatedProvisionSsh.js";
import { nodemailerTransportFromSmtpRow } from "../smtpTransportConfig.js";

/** 企业邮箱地址：env DAILY_MAILBOX_ADDRESSES 逗号分隔，默认空（用户自行配置） */
function parseMailboxList(raw: string | undefined): readonly string[] {
  return (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const DAILY_MAILBOX_ADDRESSES: readonly string[] = parseMailboxList(
  process.env.DAILY_MAILBOX_ADDRESSES
);

/** 员工邮箱地址：env STAFF_MAILBOX_ADDRESSES 逗号分隔，默认空 */
export const STAFF_MAILBOX_ADDRESSES: readonly string[] = parseMailboxList(
  process.env.STAFF_MAILBOX_ADDRESSES
);

/** 员工邮箱名称映射：env STAFF_MAILBOX_META_JSON，如 {"a@x.com":{"name":"...","enName":"..."}} */
function parseStaffMeta(): Record<string, { name: string; enName: string }> {
  try {
    const raw = (process.env.STAFF_MAILBOX_META_JSON ?? "").trim();
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, { name?: string; enName?: string }>;
    const out: Record<string, { name: string; enName: string }> = {};
    for (const [k, v] of Object.entries(o)) {
      const name = String(v?.name ?? k.split("@")[0] ?? k);
      out[k.toLowerCase()] = { name, enName: String(v?.enName ?? name) };
    }
    return out;
  } catch {
    return {};
  }
}

export const STAFF_MAILBOX_META: Record<string, { name: string; enName: string }> = parseStaffMeta();

type DailyAddr = string;

function isDailyAddr(s: string): boolean {
  return (DAILY_MAILBOX_ADDRESSES as readonly string[]).includes(s.trim().toLowerCase());
}

function isStaffAddr(s: string): boolean {
  return (STAFF_MAILBOX_ADDRESSES as readonly string[]).includes(s.trim().toLowerCase());
}

function isAllowedMailboxAddr(s: string): s is DailyAddr {
  const v = s.trim().toLowerCase();
  return isDailyAddr(v) || isStaffAddr(v);
}

export type MailboxConn = {
  serverId: number | null;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  password: string;
};

function formatImapError(e: unknown): string {
  const x = e as { message?: string; responseText?: string; responseStatus?: string; code?: string };
  const base = String(x?.message ?? e);
  const bits = [x?.responseStatus, x?.responseText, x?.code].filter(
    (s) => s && String(s) !== base
  ) as string[];
  if (bits.length) return `${base}（${bits.join(" — ")}）`;
  if (base === "Command failed") {
    return "IMAP 认证或打开收件箱失败（Mail 机还没有这个用户，或密码与装机 SMTP 不一致）";
  }
  return base;
}

async function ensureDailyMailboxUserOnMailVps(
  db: Pool,
  serverId: number,
  mailbox: string,
  smtpPassword: string
) {
  await syncSmtpCredentialsViaSshForServer(db, env, serverId, {
    smtpUsername: mailbox,
    smtpPassword
  });
}

export async function loadMailboxConn(db: Pool, tenantId: number): Promise<MailboxConn> {
  const envSmtp = (process.env.DAILY_MAILBOX_SMTP_HOST ?? "").trim();
  const envImap = (process.env.DAILY_MAILBOX_IMAP_HOST ?? "").trim();
  const envPass = (process.env.DAILY_MAILBOX_PASSWORD ?? "").trim();
  const smtpPort = Number(process.env.DAILY_MAILBOX_SMTP_PORT ?? 587) || 587;
  const imapPort = Number(process.env.DAILY_MAILBOX_IMAP_PORT ?? 993) || 993;

  const [rows] = await db.query(
    `SELECT id, relay_ip, ptr_ip, smtp_profile_id
       FROM email_dedicated_servers
      WHERE tenant_id = ? AND status <> 'cancelled' AND status <> 'deleted'
      ORDER BY id DESC
      LIMIT 1`,
    [tenantId]
  );
  const row = (rows as Array<{
    id: number;
    relay_ip: string | null;
    ptr_ip: string | null;
    smtp_profile_id: number | null;
  }>)[0];

  let smtpHost = envSmtp;
  let imapHost = envImap;
  if (row) {
    if (!smtpHost) smtpHost = String(row.relay_ip ?? "").trim();
    if (!imapHost) imapHost = String(row.ptr_ip ?? row.relay_ip ?? "").trim();
    if (!smtpHost && row.smtp_profile_id) {
      const [pRows] = await db.query(`SELECT host FROM smtp_profiles WHERE id = ? LIMIT 1`, [
        row.smtp_profile_id
      ]);
      smtpHost = String((pRows as Array<{ host?: string }>)[0]?.host ?? "").trim();
    }
  }
  if (!smtpHost) smtpHost = envSmtp;
  if (!imapHost) imapHost = smtpHost;

  let password = envPass;
  if (!password && row?.id) {
    const resolved = await resolveDedicatedSmtpPlainPassword(db, row.id, { allowAutoGenerate: false });
    password = resolved.password;
  }
  if (!password && row?.smtp_profile_id) {
    const [pRows] = await db.query(`SELECT password_enc FROM smtp_profiles WHERE id = ? LIMIT 1`, [
      row.smtp_profile_id
    ]);
    const enc = (pRows as Array<{ password_enc?: string | null }>)[0]?.password_enc;
    if (enc?.trim()) password = decryptSecret(enc);
  }

  if (!smtpHost || !password) {
    throw new Error("未找到可用的专线 SMTP（请先在装机工作台保存发信域并生成 SMTP 密码）。");
  }
  return { serverId: row?.id ?? null, smtpHost, smtpPort, imapHost, imapPort, password };
}

export const DAILY_FOLDER_KEYS = ["inbox", "starred", "drafts", "sent", "trash", "junk"] as const;
export type DailyFolderKey = (typeof DAILY_FOLDER_KEYS)[number];

function isFolderKey(s: string): s is DailyFolderKey {
  return (DAILY_FOLDER_KEYS as readonly string[]).includes(s);
}

export type ImapClient = {
  connect: () => Promise<void>;
  logout: () => Promise<void>;
  list: () => Promise<Array<{ path: string; specialUse?: string; name?: string; delimiter?: string }>>;
  mailboxCreate: (path: string) => Promise<unknown>;
  getMailboxLock: (path: string) => Promise<{ release: () => void }>;
  mailbox?: { exists?: number };
  fetch: (
    range: string,
    query: object,
    opts?: { uid?: boolean }
  ) => AsyncIterable<{
    uid?: number;
    seq?: number;
    internalDate?: Date;
    flags?: Set<string> | string[];
    envelope?: {
      date?: Date;
      subject?: string;
      from?: Array<{ name?: string; address?: string }>;
      to?: Array<{ name?: string; address?: string }>;
      cc?: Array<{ name?: string; address?: string }>;
    };
    source?: Buffer;
    headers?: Buffer;
    bodyParts?: Map<string, Buffer> | Record<string, Buffer>;
  }>;
  search: (query: object, opts?: { uid?: boolean }) => Promise<number[]>;
  messageFlagsAdd: (uid: number, flags: string[], opts?: { uid?: boolean }) => Promise<unknown>;
  messageFlagsRemove: (uid: number, flags: string[], opts?: { uid?: boolean }) => Promise<unknown>;
  messageMove: (uid: number, dest: string, opts?: { uid?: boolean }) => Promise<unknown>;
  messageDelete: (uid: number, opts?: { uid?: boolean }) => Promise<unknown>;
  append: (path: string, raw: string | Buffer, flags?: string[]) => Promise<unknown>;
  status: (
    path: string,
    query: { messages?: boolean; unseen?: boolean }
  ) => Promise<{ messages?: number; unseen?: number }>;
};

export type FolderMap = Record<Exclude<DailyFolderKey, "starred">, string>;

function decodeRfc2047(input: string): string {
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, cs, enc, body) => {
    try {
      const bytes =
        String(enc).toUpperCase() === "B"
          ? Buffer.from(String(body).replace(/\s/g, ""), "base64")
          : Buffer.from(
              String(body)
                .replace(/_/g, " ")
                .replace(/=\r?\n/g, "")
                .replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))),
              "binary"
            );
      return bytes.toString((String(cs).toLowerCase().includes("utf") ? "utf8" : "utf8") as BufferEncoding);
    } catch {
      return input;
    }
  });
}

function headerValue(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const m = raw.match(re);
  if (!m?.[1]) return "";
  return decodeRfc2047(m[1].replace(/\r?\n[ \\t]+/g, " ").trim());
}

function formatAddresses(
  list?: Array<{ name?: string; address?: string }>
): string {
  return (
    list
      ?.map((a) => {
        const name = decodeRfc2047(String(a.name ?? "").trim());
        const addr = String(a.address ?? "").trim();
        if (addr && name) return `${name} <${addr}>`;
        return addr || name;
      })
      .filter(Boolean)
      .join(", ") || ""
  );
}

function flagsHas(flags: Set<string> | string[] | undefined, name: string): boolean {
  if (!flags) return false;
  const n = name.toLowerCase();
  const arr = flags instanceof Set ? [...flags] : flags;
  return arr.some((f) => String(f).replace(/^\\/, "").toLowerCase() === n.replace(/^\\/, ""));
}

function encodeMimeHeader(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function parseEmailList(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map((x) => String(x))
    : String(raw ?? "").split(/[,;]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const e = p.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= 20) break;
  }
  return out;
}

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(120),
  contentBase64: z.string().min(1).max(4_500_000),
  cid: z.string().trim().max(80).optional(),
  inline: z.boolean().optional(),
  width: z.number().int().min(80).max(1200).optional()
});

type InFile = z.infer<typeof attachmentSchema>;

function decodeAttachments(files: InFile[]) {
  let bytes = 0;
  return files.map((f) => {
    const content = Buffer.from(f.contentBase64, "base64");
    bytes += content.length;
    if (bytes > 4_000_000) throw new Error("附件总大小不能超过 4MB");
    return {
      filename: f.filename.replace(/[^\w.\-\u4e00-\u9fff]+/g, "_").slice(0, 180),
      content,
      contentType: f.contentType,
      cid: f.inline ? f.cid || undefined : undefined,
      contentDisposition: f.inline ? ("inline" as const) : ("attachment" as const)
    };
  });
}

function textToHtml(text: string, inlines: Array<{ cid: string; width?: number }>): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br/>");
  const imgs = inlines
    .map((img) => {
      const w = img.width ?? 360;
      return `<p><img src="cid:${img.cid}" width="${w}" style="width:${w}px;max-width:100%;height:auto;" alt="" /></p>`;
    })
    .join("");
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${esc}${imgs}</div>`;
}

function buildRfc822(opts: { from: string; to: string; cc?: string; subject: string; text: string }): string {
  const ccLine = opts.cc?.trim() ? [`Cc: ${opts.cc.trim()}`] : [];
  return [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    ...ccLine,
    `Subject: ${encodeMimeHeader(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.text.replace(/\r?\n/g, "\r\n")
  ].join("\r\n");
}

async function compileMailRaw(mail: Record<string, unknown>): Promise<Buffer | null> {
  try {
    const mod = (await import("nodemailer/lib/mail-composer.js")) as {
      default?: new (m: unknown) => { compile: () => { build: () => Promise<Buffer> } };
    };
    const MailComposer = mod.default;
    if (!MailComposer) return null;
    return await new MailComposer(mail).compile().build();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function charsetOf(headers: string): string {
  const m = /charset\s*=\s*"?([^";\s]+)"?/i.exec(headers);
  let cs = (m?.[1] || "utf-8").trim().toLowerCase();
  if (cs === "gb2312") cs = "gbk";
  return cs;
}

function decodeBytes(buf: Buffer, headers: string): string {
  try {
    return new TextDecoder(charsetOf(headers), { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

function applyTransferEncoding(headers: string, body: string): string {
  let out = body.replace(/--\s*$/, "").trim();
  if (/base64/i.test(headers)) {
    try {
      return decodeBytes(Buffer.from(out.replace(/\s/g, ""), "base64"), headers);
    } catch {
      return out;
    }
  }
  if (/quoted-printable/i.test(headers)) {
    const bytes: number[] = [];
    const s = out.replace(/=\r?\n/g, "");
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
        bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(s.charCodeAt(i) & 0xff);
      }
    }
    try {
      return decodeBytes(Buffer.from(bytes), headers);
    } catch {
      return out;
    }
  }
  return out;
}

function looksLikeRawMime(s: string): boolean {
  return /This is a multi-part message|Content-Type:\s*multipart|Content-Transfer-Encoding:\s*base64|------=_NextPart/i.test(
    s
  );
}

function extractPlainText(source: Buffer | undefined): string {
  if (!source?.length) return "";
  const raw = source.toString("utf8");
  if (looksLikeRawMime(raw) || /boundary=/i.test(raw) || /Content-Type:\s*text\//i.test(raw)) {
    const chunks = raw.split(/\r?\n--[^\r\n]*\r?\n/);
    let html = "";
    for (const part of chunks) {
      const idx = part.search(/\r?\n\r?\n/);
      const headers = idx >= 0 ? part.slice(0, idx) : "";
      let body = idx >= 0 ? part.slice(idx).replace(/^\r?\n\r?\n/, "") : part;
      if (!/Content-Type:/i.test(headers)) continue;
      body = applyTransferEncoding(headers, body);
      if (/text\/plain/i.test(headers)) {
        return decodeEntities(body).trim().slice(0, 20000);
      }
      if (/text\/html/i.test(headers)) html = body;
    }
    if (html) return decodeEntities(stripHtml(html)).trim().slice(0, 20000);
  }
  const split = raw.split(/\r?\n\r?\n/);
  const headers = split[0] ?? "";
  // 2026-10-01 修复：IMAP BODY[TEXT] 返回的是不带邮件头的纯正文，
  // 若第一段首行不是 "Key:" 格式的 MIME 头，则整段都是正文，不得丢掉第一段
  if (!/^[A-Za-z0-9-]+:/m.test(headers)) {
    return decodeEntities(raw).trim().slice(0, 20000);
  }
  let body = applyTransferEncoding(headers, split.slice(1).join("\n\n"));
  if (/Content-Type:\s*text\/html/i.test(headers)) return decodeEntities(stripHtml(body)).slice(0, 20000);
  return decodeEntities(body).trim().slice(0, 20000);
}

async function parseRfc822(source: Buffer | undefined): Promise<{
  from: string;
  to: string;
  cc: string;
  subject: string;
  text: string;
}> {
  if (source?.length) {
    try {
      const { simpleParser } = await import("mailparser");
      const parsed = await simpleParser(source);
      const from = parsed.from?.text || "";
      const to = parsed.to?.text || (Array.isArray(parsed.to) ? parsed.to.map((x) => x.text).join(", ") : "");
      const cc = parsed.cc?.text || "";
      const subject = String(parsed.subject ?? "").trim() || "(无主题)";
      const text = String(parsed.text || stripHtml(String(parsed.html || ""))).trim().slice(0, 20000);
      if (from || text) return { from, to: String(to), cc: String(cc), subject, text };
    } catch {
      /* fall through */
    }
  }
  const raw = source?.toString("utf8") ?? "";
  const head = raw.split(/\r?\n\r?\n/)[0] ?? "";
  return {
    from: headerValue(head, "from"),
    to: headerValue(head, "to"),
    cc: headerValue(head, "cc"),
    subject: headerValue(head, "subject") || "(无主题)",
    text: extractPlainText(source)
  };
}

async function openImap(conn: MailboxConn, account: string): Promise<ImapClient> {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: conn.imapHost,
    port: conn.imapPort,
    secure: conn.imapPort === 993,
    auth: { user: account, pass: conn.password },
    tls: { rejectUnauthorized: false },
    logger: false
  }) as unknown as ImapClient;
  await client.connect();
  return client;
}

type ImapPoolEntry = {
  client: ImapClient;
  chain: Promise<unknown>;
  idle: ReturnType<typeof setTimeout> | null;
};

const imapPool = new Map<string, ImapPoolEntry>();
const messageMemo = new Map<string, { at: number; row: Record<string, unknown>; text: string }>();

function imapPoolKey(conn: MailboxConn, account: string): string {
  return `${conn.imapHost}:${conn.imapPort}:${account}`;
}

function scheduleImapIdle(key: string, entry: ImapPoolEntry) {
  if (entry.idle) clearTimeout(entry.idle);
  entry.idle = setTimeout(() => {
    const cur = imapPool.get(key);
    if (cur !== entry) return;
    imapPool.delete(key);
    void entry.client.logout().catch(() => undefined);
  }, 90_000);
}

export async function withImap<T>(
  db: Pool,
  conn: MailboxConn,
  account: DailyAddr,
  fn: (client: ImapClient) => Promise<T>
): Promise<T> {
  const key = imapPoolKey(conn, account);
  const ensureEntry = async (): Promise<ImapPoolEntry> => {
    const existing = imapPool.get(key);
    if (existing) return existing;
    const client = await openImap(conn, account);
    const created: ImapPoolEntry = { client, chain: Promise.resolve(), idle: null };
    imapPool.set(key, created);
    return created;
  };

  const runOnce = async (entry: ImapPoolEntry): Promise<T> => {
    if (entry.idle) {
      clearTimeout(entry.idle);
      entry.idle = null;
    }
    try {
      return await fn(entry.client);
    } finally {
      const cur = imapPool.get(key);
      if (cur === entry) scheduleImapIdle(key, entry);
    }
  };

  let entry = await ensureEntry();
  const queued = entry.chain.then(
    async () => {
      try {
        return await runOnce(entry);
      } catch {
        imapPool.delete(key);
        await entry.client.logout().catch(() => undefined);
        try {
          entry = await ensureEntry();
          return await runOnce(entry);
        } catch (second: unknown) {
          if (conn.serverId) {
            const msg = formatImapError(second);
            if (/认证|Command failed|AUTHENTICATION/i.test(msg)) {
              try {
                await ensureDailyMailboxUserOnMailVps(db, conn.serverId, account, conn.password);
              } catch (syncErr: unknown) {
                throw new Error(
                  `${msg}；已尝试在 Mail/Relay 创建用户失败：${String((syncErr as Error)?.message ?? syncErr)}`
                );
              }
              imapPool.delete(key);
              await entry.client.logout().catch(() => undefined);
              entry = await ensureEntry();
              return await runOnce(entry);
            }
          }
          throw second;
        }
      }
    },
    async () => runOnce(entry)
  );
  entry.chain = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

export async function resolveFolders(client: ImapClient): Promise<FolderMap> {
  const listed = await client.list();
  const bySpecial: Partial<Record<string, string>> = {};
  const byName = new Map<string, string>();
  for (const b of listed) {
    const path = String(b.path || "");
    const name = String(b.name || path.split(/[./]/).pop() || "").toLowerCase();
    byName.set(name, path);
    byName.set(path.toLowerCase(), path);
    const su = String(b.specialUse || "").toLowerCase();
    if (su.includes("draft")) bySpecial.drafts = path;
    if (su.includes("sent")) bySpecial.sent = path;
    if (su.includes("trash") || su.includes("bin")) bySpecial.trash = path;
    if (su.includes("junk") || su.includes("spam")) bySpecial.junk = path;
  }
  const pick = (key: Exclude<DailyFolderKey, "starred" | "inbox">, aliases: string[], fallback: string) => {
    if (bySpecial[key]) return bySpecial[key]!;
    for (const a of aliases) {
      const hit = byName.get(a.toLowerCase());
      if (hit) return hit;
    }
    return fallback;
  };
  const drafts = pick("drafts", ["Drafts", "INBOX.Drafts", "Draft"], "Drafts");
  const sent = pick("sent", ["Sent", "Sent Messages", "INBOX.Sent", "Sent Items"], "Sent");
  const trash = pick("trash", ["Trash", "Deleted", "Deleted Messages", "INBOX.Trash"], "Trash");
  const junk = pick("junk", ["Junk", "Spam", "INBOX.Junk", "INBOX.Spam"], "Junk");
  for (const path of [drafts, sent, trash, junk]) {
    if (![...byName.values()].includes(path)) {
      await client.mailboxCreate(path).catch(() => undefined);
    }
  }
  return { inbox: "INBOX", drafts, sent, trash, junk };
}

type MailRow = {
  uid: number;
  seq: number;
  date: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  flagged: boolean;
  seen: boolean;
  folder: DailyFolderKey;
  mailboxPath: string;
};

async function fetchRange(client: ImapClient, mailboxPath: string, folder: DailyFolderKey): Promise<MailRow[]> {
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const exists = Number(client.mailbox?.exists ?? 0);
    if (exists <= 0) return [];
    const start = Math.max(1, exists - 199);
    const items: MailRow[] = [];
    for await (const msg of client.fetch(`${start}:${exists}`, {
      envelope: true,
      flags: true,
      uid: true,
      internalDate: true,
      headers: ["from", "to", "cc", "subject"]
    })) {
      const envl = msg.envelope;
      const hdr = Buffer.isBuffer(msg.headers) ? msg.headers.toString("utf8") : "";
      items.push({
        uid: Number(msg.uid ?? msg.seq ?? 0),
        seq: Number(msg.seq ?? 0),
        date:
          (envl?.date && new Date(envl.date).toISOString()) ||
          (msg.internalDate && new Date(msg.internalDate).toISOString()) ||
          null,
        from: headerValue(hdr, "from") || formatAddresses(envl?.from),
        to: headerValue(hdr, "to") || formatAddresses(envl?.to),
        cc: headerValue(hdr, "cc") || formatAddresses(envl?.cc),
        subject: headerValue(hdr, "subject") || decodeRfc2047(String(envl?.subject ?? "(无主题)")),
        flagged: flagsHas(msg.flags, "Flagged"),
        seen: flagsHas(msg.flags, "Seen"),
        folder,
        mailboxPath
      });
    }
    items.sort((a, b) => {
      const tb = Date.parse(b.date ?? "") || 0;
      const ta = Date.parse(a.date ?? "") || 0;
      return tb - ta;
    });
    return items;
  } finally {
    lock.release();
  }
}

async function fetchStarred(client: ImapClient, folders: FolderMap): Promise<MailRow[]> {
  const out: MailRow[] = [];
  for (const [folder, path] of Object.entries(folders) as Array<[Exclude<DailyFolderKey, "starred">, string]>) {
    const lock = await client.getMailboxLock(path).catch(() => null);
    if (!lock) continue;
    try {
      const uids = await client.search({ flagged: true }, { uid: true }).catch(() => [] as number[]);
      if (!uids.length) continue;
      const range = uids.slice(-80).join(",");
      for await (const msg of client.fetch(range, { envelope: true, flags: true, uid: true }, { uid: true })) {
        const envl = msg.envelope;
        out.push({
          uid: Number(msg.uid ?? 0),
          seq: Number(msg.seq ?? 0),
          date: envl?.date ? new Date(envl.date).toISOString() : null,
          from: formatAddresses(envl?.from),
          to: formatAddresses(envl?.to),
        cc: formatAddresses(envl?.cc),
          subject: String(envl?.subject ?? "(无主题)"),
          flagged: true,
          seen: flagsHas(msg.flags, "Seen"),
          folder: folder === "inbox" ? "starred" : folder,
          mailboxPath: path
        });
      }
    } finally {
      lock.release();
    }
  }
  out.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  return out;
}

function partBuffer(parts: Map<string, Buffer> | Record<string, Buffer> | undefined, key: string): Buffer | undefined {
  if (!parts) return undefined;
  if (parts instanceof Map) return parts.get(key) || parts.get(key.toUpperCase()) || parts.get(key.toLowerCase());
  return parts[key] || parts[key.toUpperCase()] || parts[key.toLowerCase()];
}

function textFromBodyParts(parts: Map<string, Buffer> | Record<string, Buffer> | undefined): string {
  for (const key of ["TEXT", "1", "1.1", "1.2"]) {
    const buf = partBuffer(parts, key);
    if (!buf?.length) continue;
    const text = extractPlainText(buf);
    if (text && !looksLikeRawMime(text)) return text;
  }
  return "";
}

function rowFromEnvelope(
  msg: {
    uid?: number;
    seq?: number;
    flags?: Set<string> | string[];
    envelope?: MailRow extends never ? never : {
      date?: Date;
      subject?: string;
      from?: Array<{ name?: string; address?: string }>;
      to?: Array<{ name?: string; address?: string }>;
      cc?: Array<{ name?: string; address?: string }>;
    };
  },
  uid: number,
  mailboxPath: string,
  extra?: { from?: string; to?: string; cc?: string; subject?: string }
): MailRow {
  const envl = msg.envelope;
  return {
    uid: Number(msg.uid ?? uid),
    seq: Number(msg.seq ?? 0),
    date: envl?.date ? new Date(envl.date).toISOString() : null,
    from: extra?.from || formatAddresses(envl?.from),
    to: extra?.to || formatAddresses(envl?.to),
    cc: extra?.cc || formatAddresses(envl?.cc),
    subject: extra?.subject || decodeRfc2047(String(envl?.subject ?? "(无主题)")),
    flagged: flagsHas(msg.flags, "Flagged"),
    seen: flagsHas(msg.flags, "Seen"),
    folder: "inbox",
    mailboxPath
  };
}

async function fetchOne(
  client: ImapClient,
  mailboxPath: string,
  uid: number
): Promise<{ row: MailRow; text: string } | null> {
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    let found: { row: MailRow; text: string } | null = null;
    const range = String(uid);
    const query = {
      envelope: true,
      flags: true,
      uid: true,
      bodyParts: ["TEXT", "1", "1.1"]
    };
    for await (const msg of client.fetch(range, query, { uid: true })) {
      const text = textFromBodyParts(msg.bodyParts);
      found = { row: rowFromEnvelope(msg, uid, mailboxPath), text };
    }
    if (found && (!found.text || looksLikeRawMime(found.text))) {
      for await (const msg of client.fetch(range, { source: true }, { uid: true })) {
        const decoded = extractPlainText(msg.source);
        if (decoded) found.text = decoded;
      }
    }
    if (!found) {
      for await (const msg of client.fetch(range, { envelope: true, flags: true, bodyParts: ["TEXT", "1"] })) {
        const text = textFromBodyParts(msg.bodyParts);
        found = { row: rowFromEnvelope(msg, uid, mailboxPath), text };
      }
    }
    if (found && !found.row.seen) {
      void client.messageFlagsAdd(found.row.uid, ["\\Seen"], { uid: true }).catch(() => undefined);
      found.row.seen = true;
    }
    return found;
  } finally {
    lock.release();
  }
}

type FolderCount = { total: number; unread: number };

export async function countMailbox(client: ImapClient, path: string): Promise<FolderCount> {
  try {
    const st = await client.status(path, { messages: true, unseen: true });
    const total = Number(st.messages ?? 0);
    const unread = Number(st.unseen ?? 0);
    if (total > 0) return { total, unread };
  } catch {
    /* open mailbox and count */
  }
  const lock = await client.getMailboxLock(path).catch(() => null);
  if (!lock) return { total: 0, unread: 0 };
  try {
    const total = Number(client.mailbox?.exists ?? 0);
    const unseen = await client.search({ unseen: true }, { uid: true }).catch(() => [] as number[]);
    return { total, unread: unseen.length };
  } finally {
    lock.release();
  }
}

export async function fetchFolderCounts(
  client: ImapClient,
  folders: FolderMap
): Promise<Record<DailyFolderKey, FolderCount>> {
  const out = {} as Record<DailyFolderKey, FolderCount>;
  for (const key of ["inbox", "drafts", "sent", "trash", "junk"] as const) {
    out[key] = await countMailbox(client, folders[key]);
  }
  const lock = await client.getMailboxLock(folders.inbox).catch(() => null);
  let starredTotal = 0;
  let starredUnread = 0;
  if (lock) {
    try {
      const flagged = await client.search({ flagged: true }, { uid: true }).catch(() => [] as number[]);
      starredTotal = flagged.length;
      const unseenFlagged = await client
        .search({ flagged: true, unseen: true }, { uid: true })
        .catch(() => [] as number[]);
      starredUnread = unseenFlagged.length;
    } finally {
      lock.release();
    }
  }
  out.starred = { total: starredTotal, unread: starredUnread };
  return out;
}

function requireAccount(q: unknown, res: Response): DailyAddr | null {
  const account = String(q ?? "").trim().toLowerCase();
  if (!isAllowedMailboxAddr(account)) {
    res.status(400).json({ ok: false, message: "请选择企业邮箱或员工邮箱之一" });
    return null;
  }
  return account;
}

function mailboxPathFor(folders: FolderMap, folder: DailyFolderKey, mailboxPath?: string): string {
  if (mailboxPath?.trim()) return mailboxPath.trim();
  if (folder === "starred") return folders.inbox;
  return folders[folder];
}

export async function sendDailyMailboxPlain(
  db: Pool,
  tenantId: number,
  mail: { from: string; to: string; subject: string; text: string }
): Promise<void> {
  const from = mail.from.trim().toLowerCase();
  if (!isAllowedMailboxAddr(from)) throw new Error("发件人必须是企业邮箱或员工邮箱之一");
  const text = mail.text.trim();
  if (!text) throw new Error("正文为空");
  const conn = await loadMailboxConn(db, tenantId);
  const payload = {
    from,
    to: mail.to.trim(),
    subject: mail.subject.trim(),
    text,
    html: textToHtml(text, [])
  };
  const sendOnce = async () => {
    const transporter = nodemailer.createTransport(
      nodemailerTransportFromSmtpRow(
        { host: conn.smtpHost, port: conn.smtpPort, secure: false },
        { user: from, pass: conn.password },
        { connectionTimeout: 20_000, socketTimeout: 45_000, greetingTimeout: 30_000 }
      )
    );
    return transporter.sendMail(payload);
  };
  try {
    await sendOnce();
  } catch (first: unknown) {
    if (conn.serverId) {
      await ensureDailyMailboxUserOnMailVps(db, conn.serverId, from, conn.password);
      await sendOnce();
    } else {
      throw first;
    }
  }
  await withImap(db, conn, from, async (client) => {
    const folders = await resolveFolders(client);
    const rawMime = await compileMailRaw(payload);
    await client
      .append(
        folders.sent,
        rawMime ??
          buildRfc822({
            from,
            to: payload.to,
            subject: payload.subject,
            text
          }),
        ["\\Seen"]
      )
      .catch(() => undefined);
  }).catch(() => undefined);
}

// 邮箱槽位：域名由 env MAILBOX_SLOT_DOMAINS 逗号分隔配置（默认空，用户在装机工作台配置发信域后填写）
const SLOT_DOMAINS: readonly string[] = parseMailboxList(process.env.MAILBOX_SLOT_DOMAINS);
export const MAILBOX_SLOTS = [1, 2, 3, 4, 5].map((slot, i) => ({
  slot,
  domain: SLOT_DOMAINS[i] ?? "",
  usage: ["直客开发", "直客开发", "客服支持", "代理分销合作", "网红/导师合作"][i] ?? ""
}));

export function registerDailyMailboxRoutes(app: Express, deps: { db: Pool }): void {
  // 获取邮箱前缀配置
  app.get("/api/daily-mailbox/config", async (req: Request, res: Response) => {
    try {
      const tenantId = Number((req as unknown as { tenantId?: number }).tenantId || 2);
      const [rows] = await deps.db.query(
        `SELECT slot1_prefix, slot2_prefix, slot3_prefix, slot4_prefix, slot5_prefix, locked
         FROM bigsocialboss.daily_mailbox_config WHERE tenant_id = ?`, [tenantId]
      ) as unknown as [{ slot1_prefix: string; slot2_prefix: string; slot3_prefix: string; slot4_prefix: string; slot5_prefix: string; locked: number }][];
      const cfg = rows?.[0];
      return res.json({
        ok: true,
        slots: MAILBOX_SLOTS,
        config: cfg ? {
          prefixes: [cfg.slot1_prefix, cfg.slot2_prefix, cfg.slot3_prefix, cfg.slot4_prefix, cfg.slot5_prefix],
          locked: !!cfg.locked,
        } : null,
      });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // 增量保存邮箱前缀（已填的锁定不重复，未填的可继续填）
  app.post("/api/daily-mailbox/config", async (req: Request, res: Response) => {
    try {
      const tenantId = Number((req as unknown as { tenantId?: number }).tenantId || 2);
      const { prefixes } = req.body as { prefixes?: (string | null)[] };
      if (!Array.isArray(prefixes) || prefixes.length !== 5) {
        return res.status(400).json({ ok: false, message: "需要5个槽位" });
      }
      // 读取现有配置
      const [rows] = await deps.db.query(
        `SELECT slot1_prefix, slot2_prefix, slot3_prefix, slot4_prefix, slot5_prefix
         FROM bigsocialboss.daily_mailbox_config WHERE tenant_id = ?`, [tenantId]
      ) as unknown as [{ slot1_prefix: string; slot2_prefix: string; slot3_prefix: string; slot4_prefix: string; slot5_prefix: string }][];
      const existing = rows?.[0];
      const cols = ["slot1_prefix", "slot2_prefix", "slot3_prefix", "slot4_prefix", "slot5_prefix"];
      const cleaned: string[] = [];
      const toCreate: string[] = [];
      for (let i = 0; i < 5; i++) {
        const oldVal = existing ? String((existing as unknown as Record<string, string>)[cols[i]] || "") : "";
        const newVal = String(prefixes[i] || "").trim().toLowerCase();
        if (oldVal) {
          // 已填的锁定，不重复
          cleaned.push(oldVal);
        } else if (newVal) {
          if (!/^[a-z0-9._-]+$/.test(newVal)) {
            return res.status(400).json({ ok: false, message: `第${i + 1}个前缀格式不正确` });
          }
          cleaned.push(newVal);
          toCreate.push(`${newVal}@${MAILBOX_SLOTS[i].domain}`);
        } else {
          cleaned.push("");
        }
      }
      // 检查重复
      const nonEmpty = cleaned.filter((p) => p);
      if (new Set(nonEmpty).size !== nonEmpty.length) {
        return res.status(400).json({ ok: false, message: "前缀不能重复" });
      }
      await deps.db.query(
        `INSERT INTO bigsocialboss.daily_mailbox_config
         (tenant_id, slot1_prefix, slot2_prefix, slot3_prefix, slot4_prefix, slot5_prefix, locked)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
         slot1_prefix = VALUES(slot1_prefix), slot2_prefix = VALUES(slot2_prefix),
         slot3_prefix = VALUES(slot3_prefix), slot4_prefix = VALUES(slot4_prefix),
         slot5_prefix = VALUES(slot5_prefix)`,
        [tenantId, ...cleaned]
      );
      // 在 Mail VPS 上创建新邮箱用户（需要时间）
      for (const email of toCreate) {
        try {
          const conn = await loadMailboxConn(deps.db, tenantId);
          await ensureDailyMailboxUserOnMailVps(deps.db, conn.serverId, email, conn.password);
        } catch {
          // 单个失败不阻断
        }
      }
      return res.json({ ok: true, created: toCreate });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  // 获取已配置的邮箱列表（导航用）
  app.get("/api/daily-mailbox/configured", async (req: Request, res: Response) => {
    try {
      const tenantId = Number((req as unknown as { tenantId?: number }).tenantId || 2);
      const [rows] = await deps.db.query(
        `SELECT slot1_prefix, slot2_prefix, slot3_prefix, slot4_prefix, slot5_prefix
         FROM bigsocialboss.daily_mailbox_config WHERE tenant_id = ?`, [tenantId]
      ) as unknown as [{ slot1_prefix: string; slot2_prefix: string; slot3_prefix: string; slot4_prefix: string; slot5_prefix: string }][];
      const cfg = rows?.[0];
      const emails: string[] = [];
      if (cfg) {
        const prefixes = [cfg.slot1_prefix, cfg.slot2_prefix, cfg.slot3_prefix, cfg.slot4_prefix, cfg.slot5_prefix];
        prefixes.forEach((p, i) => {
          if (p) emails.push(`${p}@${MAILBOX_SLOTS[i].domain}`);
        });
      }
      return res.json({ ok: true, emails });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  const { db } = deps;

  app.get("/api/email/daily-mailbox/accounts", async (req: Request, res: Response) => {
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      res.json({
        ok: true,
        accounts: [
          ...DAILY_MAILBOX_ADDRESSES.map((email) => ({ email })),
          ...STAFF_MAILBOX_ADDRESSES.map((email) => {
            const meta = STAFF_MAILBOX_META[email.toLowerCase()];
            const fallback = email.split("@")[0] || email;
            return {
              email,
              staff: true,
              name: meta?.name ?? fallback,
              enName: meta?.enName ?? fallback
            };
          })
        ],
        smtpHost: conn.smtpHost,
        imapHost: conn.imapHost,
        folders: [
          { key: "inbox", label: "收件箱" },
          { key: "starred", label: "星标邮件" },
          { key: "drafts", label: "草稿箱" },
          { key: "sent", label: "已发送" },
          { key: "trash", label: "已删除" },
          { key: "junk", label: "垃圾邮箱" }
        ]
      });
    } catch (e: unknown) {
      res.status(400).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  const listFolder = async (req: Request, res: Response) => {
    const account = requireAccount(req.query.account, res);
    if (!account) return;
    const folderRaw = String(req.query.folder ?? "inbox").trim().toLowerCase();
    const folder: DailyFolderKey = isFolderKey(folderRaw) ? folderRaw : "inbox";
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      const items = await withImap(db, conn, account, async (client) => {
        const folders = await resolveFolders(client);
        if (folder === "starred") return fetchStarred(client, folders);
        return fetchRange(client, folders[folder], folder);
      });
      return res.json({ ok: true, account, folder, count: items.length, items });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `读信失败：${formatImapError(e)}` });
    }
  };

  app.get("/api/email/daily-mailbox/messages", listFolder);
  app.get("/api/email/daily-mailbox/inbox", listFolder);

  app.get("/api/email/daily-mailbox/folder-counts", async (req: Request, res: Response) => {
    const account = requireAccount(req.query.account, res);
    if (!account) return;
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      const counts = await withImap(db, conn, account, async (client) => {
        const folders = await resolveFolders(client);
        return fetchFolderCounts(client, folders);
      });
      return res.json({ ok: true, account, counts });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `统计失败：${formatImapError(e)}` });
    }
  });

  app.get("/api/email/daily-mailbox/message", async (req: Request, res: Response) => {
    const account = requireAccount(req.query.account, res);
    if (!account) return;
    const uid = Number(req.query.uid ?? 0);
    const mailboxPath = String(req.query.mailboxPath ?? "").trim();
    const folderRaw = String(req.query.folder ?? "inbox").trim().toLowerCase();
    const folder: DailyFolderKey = isFolderKey(folderRaw) ? folderRaw : "inbox";
    if (!uid) return res.status(400).json({ ok: false, message: "缺少 uid" });
    const memoKey = `${account}|${mailboxPath}|${uid}|${folder}`;
    const memo = messageMemo.get(memoKey);
    if (memo && Date.now() - memo.at < 180_000) {
      return res.json({
        ok: true,
        account,
        item: { ...memo.row, folder, mailboxPath: memo.row.mailboxPath },
        text: memo.text
      });
    }
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      const found = await withImap(db, conn, account, async (client) => {
        const path = mailboxPath.trim()
          ? mailboxPath.trim()
          : mailboxPathFor(await resolveFolders(client), folder);
        return fetchOne(client, path, uid);
      });
      if (!found) return res.status(404).json({ ok: false, message: "找不到这封邮件" });
      messageMemo.set(memoKey, { at: Date.now(), row: found.row as unknown as Record<string, unknown>, text: found.text });
      return res.json({ ok: true, account, item: { ...found.row, folder, mailboxPath: found.row.mailboxPath }, text: found.text });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `读信失败：${formatImapError(e)}` });
    }
  });

  app.post("/api/email/daily-mailbox/flag", async (req: Request, res: Response) => {
    let body: {
      account: string;
      uid: number;
      starred?: boolean;
      seen?: boolean;
      folder?: string;
      mailboxPath?: string;
    };
    try {
      body = z
        .object({
          account: z.string().trim().email(),
          uid: z.number().int().positive(),
          starred: z.boolean().optional(),
          seen: z.boolean().optional(),
          folder: z.string().optional(),
          mailboxPath: z.string().optional()
        })
        .parse(req.body ?? {});
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }
    const account = requireAccount(body.account, res);
    if (!account) return;
    const folder: DailyFolderKey = isFolderKey(String(body.folder ?? "inbox")) ? (body.folder as DailyFolderKey) : "inbox";
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      await withImap(db, conn, account, async (client) => {
        const folders = await resolveFolders(client);
        const path = mailboxPathFor(folders, folder, body.mailboxPath);
        const lock = await client.getMailboxLock(path);
        try {
          if (typeof body.starred === "boolean") {
            if (body.starred) await client.messageFlagsAdd(body.uid, ["\\Flagged"], { uid: true });
            else await client.messageFlagsRemove(body.uid, ["\\Flagged"], { uid: true });
          }
          if (typeof body.seen === "boolean") {
            if (body.seen) await client.messageFlagsAdd(body.uid, ["\\Seen"], { uid: true });
            else await client.messageFlagsRemove(body.uid, ["\\Seen"], { uid: true });
          }
        } finally {
          lock.release();
        }
      });
      return res.json({ ok: true });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `星标失败：${formatImapError(e)}` });
    }
  });

  app.post("/api/email/daily-mailbox/move", async (req: Request, res: Response) => {
    let body: { account: string; uid: number; folder?: string; mailboxPath?: string; dest: string };
    try {
      body = z
        .object({
          account: z.string().trim().email(),
          uid: z.number().int().positive(),
          folder: z.string().optional(),
          mailboxPath: z.string().optional(),
          dest: z.enum(["inbox", "trash", "junk", "drafts", "sent"])
        })
        .parse(req.body ?? {});
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }
    const account = requireAccount(body.account, res);
    if (!account) return;
    const folder: DailyFolderKey = isFolderKey(String(body.folder ?? "inbox")) ? (body.folder as DailyFolderKey) : "inbox";
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      await withImap(db, conn, account, async (client) => {
        const folders = await resolveFolders(client);
        const fromPath = mailboxPathFor(folders, folder, body.mailboxPath);
        const destPath = folders[body.dest];
        const lock = await client.getMailboxLock(fromPath);
        try {
          await client.messageMove(body.uid, destPath, { uid: true });
        } finally {
          lock.release();
        }
      });
      return res.json({ ok: true });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `移动失败：${formatImapError(e)}` });
    }
  });

  app.post("/api/email/daily-mailbox/delete", async (req: Request, res: Response) => {
    let body: { account: string; uid: number; folder?: string; mailboxPath?: string };
    try {
      body = z
        .object({
          account: z.string().trim().email(),
          uid: z.number().int().positive(),
          folder: z.string().optional(),
          mailboxPath: z.string().optional()
        })
        .parse(req.body ?? {});
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }
    const account = requireAccount(body.account, res);
    if (!account) return;
    const folder: DailyFolderKey = isFolderKey(String(body.folder ?? "inbox")) ? (body.folder as DailyFolderKey) : "inbox";
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      await withImap(db, conn, account, async (client) => {
        const folders = await resolveFolders(client);
        const fromPath = mailboxPathFor(folders, folder, body.mailboxPath);
        const lock = await client.getMailboxLock(fromPath);
        try {
          if (folder === "trash") {
            await client.messageDelete(body.uid, { uid: true });
          } else {
            await client.messageMove(body.uid, folders.trash, { uid: true });
          }
        } finally {
          lock.release();
        }
      });
      return res.json({ ok: true });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `删除失败：${formatImapError(e)}` });
    }
  });

  app.post("/api/email/daily-mailbox/draft", async (req: Request, res: Response) => {
    let body: {
      from: string;
      to: string;
      cc: string[];
      subject: string;
      text: string;
      attachments: InFile[];
    };
    try {
      const raw = (req.body ?? {}) as Record<string, unknown>;
      body = z
        .object({
          from: z.string().trim().email(),
          to: z.string().trim(),
          subject: z.string().trim().max(200),
          text: z.string().max(20000),
          attachments: z.array(attachmentSchema).max(8).optional()
        })
        .transform((v) => ({
          ...v,
          to: v.to.trim() || "draft@local",
          cc: parseEmailList(raw.cc ?? raw.ccList),
          attachments: v.attachments ?? []
        }))
        .parse(raw);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }
    const from = body.from.toLowerCase();
    if (!isAllowedMailboxAddr(from)) {
      return res.status(400).json({ ok: false, message: "发件人必须是企业邮箱或员工邮箱之一" });
    }
    const to = body.to === "draft@local" ? from : body.to;
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      const files = decodeAttachments(body.attachments);
      const inlines = files.filter((f) => f.cid).map((f) => {
        const src = body.attachments.find((a) => a.cid === f.cid);
        return { cid: f.cid as string, width: src?.width };
      });
      const mail = {
        from,
        to,
        cc: body.cc.length ? body.cc.join(", ") : undefined,
        subject: body.subject || "(无主题)",
        text: body.text || "",
        html: textToHtml(body.text || "", inlines),
        attachments: files
      };
      await withImap(db, conn, from, async (client) => {
        const folders = await resolveFolders(client);
        const rawMime = await compileMailRaw(mail);
        await client.append(
          folders.drafts,
          rawMime ?? buildRfc822({ from, to, cc: body.cc.join(", "), subject: mail.subject, text: body.text || "" }),
          ["\\Draft"]
        );
      });
      return res.json({ ok: true });
    } catch (e: unknown) {
      res.status(502).json({ ok: false, message: `保存草稿失败：${formatImapError(e)}` });
    }
  });

  app.post("/api/email/daily-mailbox/send", async (req: Request, res: Response) => {
    let body: {
      from: string;
      to: string;
      cc: string[];
      subject: string;
      text: string;
      draftUid?: number;
      attachments: InFile[];
    };
    try {
      const raw = (req.body ?? {}) as Record<string, unknown>;
      body = z
        .object({
          from: z.string().trim().email(),
          to: z.string().trim().email(),
          subject: z.string().trim().min(1).max(200),
          text: z.string().max(20000),
          draftUid: z.number().int().positive().optional(),
          attachments: z.array(attachmentSchema).max(8).optional()
        })
        .transform((v) => ({
          ...v,
          cc: parseEmailList(raw.cc ?? raw.ccList),
          attachments: v.attachments ?? []
        }))
        .parse(raw);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }
    if (!body.text.trim() && body.attachments.length === 0) {
      return res.status(400).json({ ok: false, message: "请填写正文，或添加图片/附件" });
    }
    const from = body.from.toLowerCase();
    if (!isAllowedMailboxAddr(from)) {
      return res.status(400).json({ ok: false, message: "发件人必须是企业邮箱或员工邮箱之一" });
    }
    try {
      const tenantId = resolveTenantId(req);
      const conn = await loadMailboxConn(db, tenantId);
      const files = decodeAttachments(body.attachments);
      const inlines = files.filter((f) => f.cid).map((f) => {
        const src = body.attachments.find((a) => a.cid === f.cid);
        return { cid: f.cid as string, width: src?.width };
      });
      const mail = {
        from,
        to: body.to,
        cc: body.cc.length ? body.cc.join(", ") : undefined,
        subject: body.subject,
        text: body.text || " ",
        html: textToHtml(body.text || "", inlines),
        attachments: files
      };
      const sendOnce = async () => {
        const transporter = nodemailer.createTransport(
          nodemailerTransportFromSmtpRow(
            { host: conn.smtpHost, port: conn.smtpPort, secure: false },
            { user: from, pass: conn.password },
            { connectionTimeout: 20_000, socketTimeout: 45_000, greetingTimeout: 30_000 }
          )
        );
        return transporter.sendMail(mail);
      };
      let info;
      try {
        info = await sendOnce();
      } catch (first: unknown) {
        if (conn.serverId) {
          await ensureDailyMailboxUserOnMailVps(db, conn.serverId, from, conn.password);
          info = await sendOnce();
        } else {
          throw first;
        }
      }
      // IMAP 存已发送/删草稿改后台异步，不阻塞前端返回（之前 await 导致"处理中"转很久）
      void withImap(db, conn, from, async (client) => {
        const folders = await resolveFolders(client);
        const rawMime = await compileMailRaw(mail);
        await client
          .append(
            folders.sent,
            rawMime ??
              buildRfc822({
                from,
                to: body.to,
                cc: body.cc.join(", "),
                subject: body.subject,
                text: body.text
              }),
            ["\\Seen"]
          )
          .catch(() => undefined);
        if (body.draftUid) {
          const lock = await client.getMailboxLock(folders.drafts);
          try {
            await client.messageDelete(body.draftUid, { uid: true }).catch(() => undefined);
          } finally {
            lock.release();
          }
        }
      }).catch(() => undefined);
      return res.json({ ok: true, messageId: info.messageId });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      res.status(502).json({ ok: false, message: `发送失败：${msg}` });
    }
  });
}

