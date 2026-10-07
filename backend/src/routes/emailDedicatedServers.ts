import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { lookup as dnsLookup } from "node:dns";
import * as dns from "node:dns/promises";
import nodemailer from "nodemailer";
import { z } from "zod";
import {
  parseDnsRecords,
  type DnsRecordItem
} from "../services/emailDedicatedDnsRecords.js";
import { enrichDnsRecordsForPanel } from "../services/dedicatedDnsPanelLabels.js";
import { prepareDedicatedDnsRecordsForDisplay } from "../services/dedicatedMailServerGroup.js";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { getOpenCorePlanTierId, getOpenCoreDailySendLimit } from "../lib/openCoreConfig.js";
import { resolveTenantId } from "../middleware/auth.js";
import { ensureStandaloneTenantEmailModule } from "../services/standaloneTenantEmailModule.js";
import { nodemailerTransportFromSmtpRow, resolveSmtpAuthUser } from "../smtpTransportConfig.js";
import {
  resolveDedicatedSmtpPlainPassword,
  syncDedicatedPasswordToSmtpProfile
} from "../services/dedicatedSmtpCredentials.js";
/** 开源版：管理通知为 no-op（商业版写入管理通知表） */
async function insertAdminNotification(_db: unknown, _n: Record<string, unknown>): Promise<void> {
  return;
}
import { notifyAllTenantMembers } from "../services/userNotifications.js";
import { sqlDedicatedVisibleToTenant } from "../services/dedicatedDomainSlotStatus.js";
import {
  assertLaneDomainSlotsAvailable,
  attachDedicatedServerToVpsGroup,
  attachNewDedicatedServerToDefaultVpsGroup,
  buildDedicatedEntitlementsSnapshotForTenant,
  formatDedicatedQuotaDenyMessage,
  resolveVpsGroupIdForLaneIndex
} from "../services/dedicatedEntitlements.js";
import { listDedicatedLanesForTenant } from "../services/dedicatedLanes.js";
import { formatDomainOverQuotaBlockMessage } from "../services/dedicatedDomainQuotaCompliance.js";
import { precheckDedicatedSenderDomainDns } from "../services/dedicatedSenderDomainPrecheck.js";
import { validateDedicatedSenderProfile } from "../services/dedicatedMailServerGroup.js";

/**
 * 「邮件营销服务开通」业务路由（旧称：独立发信服务器）。
 *
 * 产品定位：用户订阅邮件营销套餐之后，提交一次开通申请；平台后台
 * 工程师在 1-2 个工作日内为该用户匹配独立 VPS、配置 PTR / SPF /
 * DKIM / DMARC，并把该 VPS 的 SMTP 入口绑回到 smtp_profiles 表里。
 * 用户不感知 VPS / IP / 主机名等技术细节。
 *
 * 状态流转（用户层面）：
 *   - requested      已收到申请，待平台处理
 *   - provisioning   开通中（平台正在分配 VPS / 部署 MTA）
 *   - awaiting_dns   等待用户补充必要的 DNS 记录
 *   - ready          服务已开通，可正常发送
 *   - paused         暂停（投诉率过高 / 欠费 / 主动暂停）
 *   - failed         开通失败，平台介入
 *   - cancelled      已取消（仅 requested 状态可自助取消）
 */

type Ctx = { db: Pool };

/** MySQL datetime → ISO（本地实现） */
function mysqlDateTimeToIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const t = new Date(String(v).replace(" ", "T"));
  return isNaN(t.getTime()) ? null : t.toISOString();
}

/** 通用的"可空字符串"字段：空字符串 / undefined 都视为 null */
const optionalNullableString = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v));

/** 与中量邮箱配置页可售档一致 */
const MEDIUM_DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS = new Set([
  "email-send-1000",
  "email-send-3000",
  "email-send-5000",
  "email-send-10000",
  "email-send-20000",
  "email-send-30000"
]);

/** 与巨量邮箱配置页可售档一致 */
const BULK_DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS = new Set([
  "email-send-35000",
  "email-send-40000",
  "email-send-45000",
  "email-send-50000",
  "email-send-60000",
  "email-send-80000",
  "email-send-100000",
  "email-send-120000"
]);

const DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS = new Set([
  ...MEDIUM_DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS,
  ...BULK_DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS
]);

const requestSchema = z.object({
  label: z.string().trim().min(1, "请填写服务标签").max(128),
  /**
   * 用户期望使用的发件域名（admin 后台凭这个为该用户的独立 VPS 配
   * PTR / SPF / DKIM / DMARC）。
   */
  senderDomain: optionalNullableString(253),
  /** 默认发件人显示名 */
  fromName: optionalNullableString(128),
  /** 默认发件邮箱（建议 = "name"@senderDomain） */
  fromEmail: optionalNullableString(254),
  /** 默认回信地址 */
  replyTo: optionalNullableString(254),
  /**
   * 用户在前端选择的套餐 tierId（例 'email-send-3000'）。
   * 与前端的"档位卡片网格"一一对应；admin 后台凭这个判断
   * 应该为用户匹配多大规格的 VPS。
   */
  subscriptionTierId: optionalNullableString(64),
  notesFromUser: optionalNullableString(500),
  /** 多专线套餐：在哪个专线下新增（1-based）；绑定到对应 vps_group */
  laneIndex: z.coerce.number().int().min(1).max(99).optional(),
  /** 已废弃：SMTP 密码由管理端生成并同步，租户申请无需填写 */
  smtpPassword: z.string().trim().min(6).max(512).optional()
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(128).optional(),
  senderDomain: optionalNullableString(253),
  fromName: optionalNullableString(128),
  fromEmail: optionalNullableString(254),
  replyTo: optionalNullableString(254),
  notesFromUser: optionalNullableString(500)
});

interface DbServerRow {
  id: number;
  tenant_id: number;
  label: string;
  sender_domain: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  dns_records: unknown;
  ptr_ip?: string | null;
  ptr_hostname?: string | null;
  subscription_tier_id: string | null;
  status:
    | "requested"
    | "provisioning"
    | "awaiting_dns"
    | "ready"
    | "paused"
    | "failed"
    | "cancelled"
    | "rejected"
    | "deleted";
  application_rejection_reason?: string | null;
  application_rejected_at?: Date | string | null;
  tenant_deleted_at?: Date | string | null;
  ip_address: string | null;
  hostname: string | null;
  region: string | null;
  smtp_profile_id: number | null;
  notes_from_user: string | null;
  tenant_submitted_smtp_password_enc?: string | null;
  /** admin_notes 不返回给用户，仅 admin 端可见 */
  billing_started_at: Date | string | null;
  billing_period_end_at: Date | string | null;
  domain_change_status?: string | null;
  pending_sender_domain?: string | null;
  pending_from_name?: string | null;
  pending_from_email?: string | null;
  pending_reply_to?: string | null;
  domain_change_requested_at?: Date | string | null;
  vps_group_id?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function normDnsValue(s: string): string {
  return s
    .trim()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function txtRowsToStrings(rows: string[][]): string[] {
  return rows.map((parts) => parts.join(""));
}

async function verifyDnsRecord(record: DnsRecordItem): Promise<{ ok: boolean; message?: string }> {
  const host = record.host.trim();
  const type = record.type.trim().toUpperCase();
  const expected = normDnsValue(record.value);
  try {
    if (type === "TXT") {
      const txt = txtRowsToStrings(await dns.resolveTxt(host)).map(normDnsValue);
      return {
        ok: txt.some((v) => v === expected || v.includes(expected) || expected.includes(v)),
        message: txt.length ? `TXT 当前值：${txt.join(" | ")}` : "TXT 未返回记录"
      };
    }
    if (type === "CNAME") {
      const rows = (await dns.resolveCname(host)).map(normDnsValue);
      return { ok: rows.includes(expected), message: rows.length ? `CNAME 当前值：${rows.join(" | ")}` : "CNAME 未返回记录" };
    }
    if (type === "A") {
      const rows = await dns.resolve4(host);
      return { ok: rows.includes(record.value.trim()), message: rows.length ? `A 当前值：${rows.join(" | ")}` : "A 未返回记录" };
    }
    if (type === "MX") {
      const rows = await dns.resolveMx(host);
      const expectedExchange = normDnsValue(record.value);
      const values = rows.map((r) => normDnsValue(r.exchange));
      const ok = values.some((v) => v === expectedExchange || v === `${expectedExchange}.`);
      return {
        ok,
        message: rows.length
          ? `MX 当前值：${rows.map((r) => `${r.priority} ${r.exchange}`).join(" | ")}`
          : "MX 未返回记录"
      };
    }
    return { ok: false, message: `暂不支持自动验证 ${type} 记录，请联系平台客服人工确认。` };
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message ?? e) };
  }
}

/**
 * 返回给前端用户的 shape。
 * 注意：故意不返回 ip_address / hostname / region，
 * 因为产品定位是「平台代管」，用户层面不需要看到这些 VPS 技术细节，
 * 只看到「申请已收到 / 开通中 / 已开通」即可；
 * 但 DNS 记录是用户必须自己粘贴到 DNS 后台的，必须暴露。
 */
function toIsoDateTime(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? s : dt.toISOString();
}

function dedicatedDnsRecordsForClient(r: {
  dns_records: unknown;
  sender_domain: string | null;
  ptr_ip?: string | null;
  ptr_hostname?: string | null;
}) {
  const records = prepareDedicatedDnsRecordsForDisplay(parseDnsRecords(r.dns_records), {
    senderDomain: r.sender_domain,
    ptrIp: r.ptr_ip,
    relayIp: r.relay_ip,
    ptrHostname: r.ptr_hostname
  });
  return enrichDnsRecordsForPanel(records, r.sender_domain);
}

function toClientShape(r: DbServerRow) {
  return {
    id: Number(r.id),
    label: String(r.label),
    senderDomain: r.sender_domain ?? null,
    fromName: r.from_name ?? null,
    fromEmail: r.from_email ?? null,
    replyTo: r.reply_to ?? null,
    dnsRecords: dedicatedDnsRecordsForClient(r),
    subscriptionTierId: r.subscription_tier_id ?? null,
    status: String(r.status),
    /** smtpProfileId !== null 表示 admin 已把独立服务器接到 SMTP 链路上 */
    smtpProfileId: r.smtp_profile_id != null ? Number(r.smtp_profile_id) : null,
    vpsGroupId: r.vps_group_id != null ? Number(r.vps_group_id) : null,
    notesFromUser: r.notes_from_user ?? null,
    hasTenantSubmittedSmtpPassword: Boolean(r.tenant_submitted_smtp_password_enc?.trim()),
    /** 专线行 billing 与租户正式周期对齐（起算见 tenant_product_modules，自首次推送 DNS） */
    billingStartedAt: toIsoDateTime(r.billing_started_at),
    billingPeriodEndAt: toIsoDateTime(r.billing_period_end_at),
    domainChangeStatus: String(r.domain_change_status ?? "none"),
    pendingSenderDomain: r.pending_sender_domain ?? null,
    pendingFromName: r.pending_from_name ?? null,
    pendingFromEmail: r.pending_from_email ?? null,
    pendingReplyTo: r.pending_reply_to ?? null,
    domainChangeRequestedAt: toIsoDateTime(r.domain_change_requested_at),
    applicationRejectionReason: r.application_rejection_reason?.trim() || null,
    applicationRejectedAt: toIsoDateTime(r.application_rejected_at),
    tenantDeletedAt: toIsoDateTime(r.tenant_deleted_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export function registerEmailDedicatedServersRoutes(app: Express, ctx: Ctx) {
  const { db } = ctx;

  /** R16a：专线工作台 — 送达成功/套餐日发、各线尝试数/2万(2.5万)暗闸、域列表、是否在发 */
  app.get("/api/email/dedicated-lanes", async (req, res) => {
    const tenantId = resolveTenantId(req);
    try {
      const payload = await listDedicatedLanesForTenant(db, tenantId);
      res.json({ ok: true, ...payload });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 列出当前租户的开通申请（不含 admin 视图字段） */
  app.get("/api/email/dedicated-servers", async (req, res) => {
    const tenantId = resolveTenantId(req);
    /* 开源版：无计费对账 */
    const [rows] = await db.query(
      `SELECT id, tenant_id, label, sender_domain, from_name, from_email, reply_to,
              dns_records, ptr_ip, ptr_hostname, subscription_tier_id, status,
              vps_group_id, ip_address, hostname, region, smtp_profile_id,
              tenant_submitted_smtp_password_enc, notes_from_user, billing_started_at, billing_period_end_at,
              domain_change_status, pending_sender_domain, pending_from_name,
              pending_from_email, pending_reply_to, domain_change_requested_at,
              application_rejection_reason, application_rejected_at, tenant_deleted_at,
              created_at, updated_at
         FROM email_dedicated_servers
        WHERE tenant_id = ? AND ${sqlDedicatedVisibleToTenant()}
        ORDER BY id DESC`,
      [tenantId]
    );
    const items = (rows as DbServerRow[]).map(toClientShape);
    const entitlements = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
    res.json({ ok: true, items, entitlements });
  });

  /** P3-2：发信域 DNS 预检（格式硬校验 + MX 软提示） */
  app.get("/api/email/dedicated-servers/precheck-sender-domain", async (req, res) => {
    const senderDomain = z.string().trim().min(1).max(253).parse(req.query.domain ?? "");
    const fromEmail =
      typeof req.query.fromEmail === "string" && req.query.fromEmail.trim()
        ? req.query.fromEmail.trim()
        : undefined;
    try {
      const result = await precheckDedicatedSenderDomainDns(senderDomain, fromEmail);
      res.json({ ok: true, ...result });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 提交申请：进入 'requested' 状态，等管理员后台处理 */
  app.post("/api/email/dedicated-servers", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = requestSchema.parse(req.body ?? {});

    const senderCheck = validateDedicatedSenderProfile(body.senderDomain, body.fromEmail);
    if (!senderCheck.ok) {
      return res.status(400).json({ ok: false, message: senderCheck.message });
    }

    /** 与个人中心「邮件与营销」已购 tier 对齐；超管跳过便于联调 */
    if (!req.auth?.isSuperAdmin) {
      const entBefore = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
      if (entBefore.blocksDedicatedSend) {
        return res.status(403).json({
          ok: false,
          message: formatDomainOverQuotaBlockMessage(entBefore)
        });
      }
      if (body.senderDomain?.trim() && entBefore.usedDomains >= entBefore.domainSlots) {
        return res.status(429).json({
          ok: false,
          message: formatDedicatedQuotaDenyMessage("domain_slots", entBefore)
        });
      }
    }

    if (!req.auth?.isSuperAdmin) {
      /** 开源版：以 env 配置为准；不走 SaaS 个人中心套餐校验 */
      const licenseTier = getOpenCorePlanTierId();
      const licenseDaily = Math.max(1, getOpenCoreDailySendLimit());
      await ensureStandaloneTenantEmailModule(db, tenantId);

      const requestedTier = String(body.subscriptionTierId ?? "").trim() || licenseTier;
      if (!DEDICATED_ALLOWED_EMAIL_SEND_TIER_IDS.has(requestedTier)) {
        return res.status(400).json({
          ok: false,
          message: `发送档位无效。本机配置：${licenseTier}（日发 ${licenseDaily.toLocaleString()} 封）。`
        });
      }
      if (requestedTier !== licenseTier) {
        return res.status(400).json({
          ok: false,
          message: `所选档位与本机配置（${licenseTier}，日发 ${licenseDaily.toLocaleString()}）不一致。请刷新页面后重试。`
        });
      }
    }

    const subscriptionTierIdForInsert =
      !req.auth?.isSuperAdmin
        ? getOpenCorePlanTierId()
        : body.subscriptionTierId;

    const [r] = await db.query(
      `INSERT INTO email_dedicated_servers
         (tenant_id, label, sender_domain, from_name, from_email, reply_to,
          subscription_tier_id, status, notes_from_user)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
      [
        tenantId,
        body.label,
        body.senderDomain,
        body.fromName,
        body.fromEmail,
        body.replyTo,
        subscriptionTierIdForInsert,
        body.notesFromUser
      ]
    );
    const newId = Number((r as any)?.insertId ?? 0);
    try {
      const laneIndex =
        body.laneIndex != null && Number.isFinite(Number(body.laneIndex))
          ? Math.max(1, Math.floor(Number(body.laneIndex)))
          : 0;
      if (laneIndex > 0) {
        const entSnap = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
        const vpsGroupId = await resolveVpsGroupIdForLaneIndex(db, tenantId, laneIndex);
        await assertLaneDomainSlotsAvailable(db, tenantId, vpsGroupId, entSnap);
        await attachDedicatedServerToVpsGroup(db, tenantId, newId, vpsGroupId);
      } else {
        await attachNewDedicatedServerToDefaultVpsGroup(db, tenantId, newId);
      }
    } catch (e: unknown) {
      await db.query(`DELETE FROM email_dedicated_servers WHERE id = ? AND tenant_id = ?`, [
        newId,
        tenantId
      ]);
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("专线") || msg.includes("发信域")) {
        return res.status(429).json({ ok: false, message: msg });
      }
      throw e;
    }
    await insertAdminNotification(db, {
      tenantId,
      kind: "email_onboarding_requested",
      title: "新的邮件营销服务开通申请",
      body: {
        onboardingId: newId,
        tenantId,
        label: body.label,
        senderDomain: body.senderDomain,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        replyTo: body.replyTo,
        subscriptionTierId: body.subscriptionTierId,
        notesFromUser: body.notesFromUser,
        linkPath: "/admin-console/modules/email-onboarding"
      }
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[email-dedicated-servers] admin notification skipped", e);
    });
    res.json({ ok: true, id: newId });
  });

  /** 用户修改 label / notes；发件域名仅在未提交或换域审核驳回后可改 */
  app.put("/api/email/dedicated-servers/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = updateSchema.parse(req.body ?? {});

    const [existRows] = await db.query(
      `SELECT status, domain_change_status FROM email_dedicated_servers
        WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const exist = (existRows as Array<{ status: string; domain_change_status: string }>)[0];
    if (!exist) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    const lockedProfile =
      String(exist.status) !== "requested" &&
      String(exist.domain_change_status ?? "none") !== "rejected";
    if (
      lockedProfile &&
      (body.senderDomain !== undefined ||
        body.fromName !== undefined ||
        body.fromEmail !== undefined ||
        body.replyTo !== undefined)
    ) {
      return res.status(409).json({
        ok: false,
        message: "发件域名资料已锁定。如需更换请在本页使用「申请更换发件域名」。"
      });
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    if (body.label !== undefined) {
      sets.push("label = ?");
      args.push(body.label);
    }
    if (body.senderDomain !== undefined) {
      sets.push("sender_domain = ?");
      args.push(body.senderDomain);
    }
    if (body.fromName !== undefined) {
      sets.push("from_name = ?");
      args.push(body.fromName);
    }
    if (body.fromEmail !== undefined) {
      sets.push("from_email = ?");
      args.push(body.fromEmail);
    }
    if (body.replyTo !== undefined) {
      sets.push("reply_to = ?");
      args.push(body.replyTo);
    }
    if (body.notesFromUser !== undefined) {
      sets.push("notes_from_user = ?");
      args.push(body.notesFromUser);
    }
    if (sets.length === 0) return res.json({ ok: true, noChange: true });

    args.push(id, tenantId);
    const [r] = await db.query(
      `UPDATE email_dedicated_servers SET ${sets.join(", ")}
        WHERE id = ? AND tenant_id = ?`,
      args
    );
    const affected = Number((r as any)?.affectedRows ?? 0);
    if (affected === 0) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    res.json({ ok: true });
  });

  /** 已提交专线且已付款：申请更换发件域名（待管理员审核并重新推送 DNS） */
  app.post("/api/email/dedicated-servers/:id/request-domain-change", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        senderDomain: z.string().trim().min(1).max(253),
        fromName: z.string().trim().min(1).max(128),
        fromEmail: z.string().trim().min(1).max(254),
        replyTo: z.string().trim().max(254).optional().nullable(),
        notesFromUser: z.string().trim().max(500).optional().nullable()
      })
      .parse(req.body ?? {});

    const senderCheck = validateDedicatedSenderProfile(body.senderDomain, body.fromEmail);
    if (!senderCheck.ok) {
      return res.status(400).json({ ok: false, message: senderCheck.message });
    }

    const [modRows] = await db.query(
      `SELECT status, simulated_paid_at, email_tier_id
         FROM tenant_product_modules WHERE tenant_id = ? AND module = 'email' LIMIT 1`,
      [tenantId]
    );
    const mr = (modRows as { status?: unknown; simulated_paid_at?: unknown; email_tier_id?: unknown }[])[0];
    const emailRow = mr
      ? {
          status: String(mr.status ?? ""),
          simulated_paid_at: mr.simulated_paid_at as string | Date | null,
          email_tier_id: mr.email_tier_id != null ? String(mr.email_tier_id) : null
        }
      : null;

    /* 开源版：无计费对账 */

    const [modTierRows] = await db.query(
      `SELECT email_tier_id FROM tenant_product_modules WHERE tenant_id = ? AND module = 'email' LIMIT 1`,
      [tenantId]
    );
    const moduleTierId = (modTierRows as Array<{ email_tier_id: string | null }>)[0]?.email_tier_id;

    const [rows] = await db.query(
      `SELECT id, status, sender_domain, domain_change_status, relay_ip, ptr_ip,
              billing_started_at, billing_period_end_at
         FROM email_dedicated_servers WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const row = (rows as Array<{
      id: number;
      status: string;
      sender_domain: string | null;
      domain_change_status: string;
      relay_ip: string | null;
      ptr_ip: string | null;
      billing_started_at: Date | string | null;
      billing_period_end_at: Date | string | null;
    }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    /* 开源版：无套餐门控，允许更换域名 */
    if (
      String(row.status) === "requested" ||
      String(row.status) === "cancelled" ||
      String(row.status) === "rejected"
    ) {
      return res.status(409).json({
        ok: false,
        message: "首次开通请直接修改表单并提交申请，无需走更换域名流程。"
      });
    }
    if (String(row.domain_change_status) === "pending_admin") {
      return res.status(409).json({
        ok: false,
        message: "您已提交更换域名申请，请等待平台审核。"
      });
    }
    const nextDomain = body.senderDomain.trim().toLowerCase();
    const curDomain = String(row.sender_domain ?? "").trim().toLowerCase();
    if (nextDomain === curDomain) {
      return res.status(400).json({
        ok: false,
        message: "新发件域名与当前域名相同，无需更换。"
      });
    }

    await db.query(
      `UPDATE email_dedicated_servers
          SET domain_change_status = 'pending_admin',
              pending_sender_domain = ?,
              pending_from_name = ?,
              pending_from_email = ?,
              pending_reply_to = ?,
              notes_from_user = COALESCE(?, notes_from_user),
              domain_change_requested_at = CURRENT_TIMESTAMP,
              subscription_tier_id = COALESCE(?, subscription_tier_id),
              dns_records = NULL,
              billing_started_at = NULL,
              billing_period_end_at = NULL,
              status = 'awaiting_dns',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      [
        nextDomain,
        body.fromName.trim(),
        body.fromEmail.trim().toLowerCase(),
        body.replyTo?.trim() || null,
        body.notesFromUser?.trim() || null,
        moduleTierId != null ? String(moduleTierId).trim() : null,
        id,
        tenantId
      ]
    );

    await insertAdminNotification(db, {
      tenantId,
      kind: "email_domain_change_requested",
      title: "用户申请更换发件域名",
      body: {
        onboardingId: id,
        tenantId,
        previousDomain: row.sender_domain,
        pendingDomain: nextDomain,
        hasServerGroup: Boolean(row.relay_ip && row.ptr_ip),
        linkPath: "/admin-console/modules/email-onboarding"
      }
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[email-dedicated-servers] domain-change admin notify skipped", e);
    });

    res.json({
      ok: true,
      message: "更换域名申请已提交。平台审核通过后将推送新的 DNS 解析记录，请留意本页与站内私信。"
    });
  });

  /** 租户可自助删除（标记 deleted，释放名额；管理端保留记录供统计） */
  const TENANT_DELETABLE_STATUSES = new Set([
    "requested",
    "rejected",
    "provisioning",
    "awaiting_dns",
    "ready",
    "paused",
    "failed"
  ]);

  app.delete("/api/email/dedicated-servers/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const [rows] = await db.query(
      `SELECT id, status, label, sender_domain FROM email_dedicated_servers
        WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const row = (rows as Array<{
      id: number;
      status: string;
      label: string;
      sender_domain: string | null;
    }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    const st = String(row.status);
    if (!TENANT_DELETABLE_STATUSES.has(st)) {
      return res.status(409).json({
        ok: false,
        message:
          st === "ready" || st === "paused"
            ? "该发信域已开通或正在服务中，无法自助删除。如需停用请联系平台客服。"
            : "当前状态无法自助删除，请联系平台客服。"
      });
    }
    await db.query(
      `UPDATE email_dedicated_servers
          SET status = 'deleted',
              tenant_deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );
    const msgByStatus: Record<string, string> = {
      rejected: "已移除该驳回记录。",
      ready: "已删除该发信域配置，名额已释放。若曾用于营销活动，请改选其他发信域。",
      paused: "已删除该发信域配置，名额已释放。"
    };
    res.json({
      ok: true,
      message:
        msgByStatus[st] ?? "已删除该发信域名配置，名额已释放，可重新申请。"
    });
  });

  /** 驳回后继续编辑：恢复为 requested，清空驳回字段 */
  app.post("/api/email/dedicated-servers/:id/reopen-application", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const [rows] = await db.query(
      `SELECT id, status FROM email_dedicated_servers
        WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const row = (rows as Array<{ id: number; status: string }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    if (String(row.status) !== "rejected") {
      return res.status(409).json({
        ok: false,
        message: "仅「申请未通过」的记录可继续编辑。"
      });
    }

    await db.query(
      `UPDATE email_dedicated_servers
          SET status = 'requested',
              application_rejection_reason = NULL,
              application_rejected_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ ok: true, message: "已恢复为待审核申请，请修改资料后等待平台处理。" });
  });

  /**
   * 用户点「我已添加 DNS，验证」按钮触发的接口。
   *
   * 当前阶段（前端 UI 优先）：暂作为最小可用 stub —— 立刻读出 dns_records，
   * 给每一条设 verified=true 写回。等接入真正的 DNS lookup（建议用 Node
   * 自带 dns.promises.resolveTxt / resolveCname）后再替换内部实现，对前端
   * 接口形状不变。
   *
   * 真实验证 TODO：
   *   - 按 type 分发 resolveTxt / resolveCname / resolveMx
   *   - 比对 value（注意 SPF / DMARC 等需要忽略大小写、去末尾分号）
   *   - 全部通过后自动把 email_dedicated_servers.status 推进到 'ready'
   */
  app.post("/api/email/dedicated-servers/:id/verify-dns", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const [rows] = await db.query(
      `SELECT id, dns_records, status, sender_domain, ptr_ip, ptr_hostname
         FROM email_dedicated_servers
        WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const row = (rows as Array<{
      id: unknown;
      dns_records: unknown;
      status: unknown;
      sender_domain: string | null;
      ptr_ip: string | null;
      ptr_hostname: string | null;
    }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    const records = dedicatedDnsRecordsForClient(row);
    if (records.length === 0) {
      return res.status(409).json({
        ok: false,
        message: "平台尚未推送 DNS 记录，请稍候。"
      });
    }
    const checked = await Promise.all(
      records.map(async (r) => {
        const result = await verifyDnsRecord(r);
        return {
          ...r,
          verified: result.ok,
          note: result.ok ? r.note : (result.message ?? r.note)
        };
      })
    );
    const allVerified = checked.length > 0 && checked.every((r) => r.verified);
    await db.query(
      `UPDATE email_dedicated_servers SET dns_records = ? WHERE id = ?`,
      [JSON.stringify(checked), id]
    );
    if (allVerified) {
      await insertAdminNotification(db, {
        tenantId,
        kind: "email_onboarding_dns_verified",
        title: "用户 DNS 已验证通过",
        body: {
          onboardingId: id,
          tenantId,
          status: "awaiting_dns",
          message: "用户已点击验证 DNS，所有记录均解析通过，请进行最终 SMTP 测试或等待用户测试发送。"
        }
      }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("[email-dedicated-servers] admin dns-verified notification skipped", e);
      });
      await notifyAllTenantMembers(db, tenantId, {
        kind: "email_onboarding_dns_verified",
        title: "DNS 记录已验证通过",
        bodyText:
          "您的邮件营销服务 DNS 记录已验证通过。套餐正式周期自平台推送 DNS 起算；有效期内可随时发送测试邮件自检通道。",
        linkPath: "/settings/email",
        meta: { onboardingId: id }
      }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("[email-dedicated-servers] user dns-verified notification skipped", e);
      });
    }
    res.json({
      ok: true,
      records: checked,
      allVerified,
      message: allVerified
        ? "DNS 全部记录验证通过，请继续发送测试邮件。"
        : "部分 DNS 记录尚未生效，请核对后等待解析传播。"
    });
  });

  /**
   * 用户点「发送测试邮件」按钮 —— 经绑定的 smtp_profiles 真实发信。
   */
  app.post("/api/email/dedicated-servers/:id/test-send", async (req, res) => {
    const tenantId = resolveTenantId(req);
    /* 开源版：无计费对账 */

    const id = z.coerce.number().int().positive().parse(req.params.id);
    let body: { recipient: string };
    try {
      body = z
        .object({
          recipient: z.string().trim().email("收件人邮箱格式不正确")
        })
        .parse(req.body ?? {});
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join("; ") : String(e);
      return res.status(400).json({ ok: false, message: msg });
    }

    const [rows] = await db.query(
      `SELECT e.id, e.status, e.smtp_profile_id, e.dns_records,
              e.label, e.sender_domain, e.from_name, e.from_email, e.reply_to,
              e.billing_started_at, e.billing_period_end_at,
              tpm.period_end AS subscription_period_end
         FROM email_dedicated_servers e
         LEFT JOIN tenant_product_modules tpm
                ON tpm.tenant_id = e.tenant_id AND tpm.module = 'email'
        WHERE e.id = ? AND e.tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const row = (rows as Array<{
      id: unknown;
      status: unknown;
      smtp_profile_id: unknown;
      dns_records: unknown;
      label: string | null;
      sender_domain: string | null;
      from_name: string | null;
      from_email: string | null;
      reply_to: string | null;
      billing_started_at: Date | string | null;
      billing_period_end_at: Date | string | null;
      subscription_period_end: Date | string | null;
    }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }

    if (!req.auth?.isSuperAdmin) {
      const ent = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
      if (ent.blocksDedicatedSend) {
        return res.status(403).json({
          ok: false,
          message: formatDomainOverQuotaBlockMessage(ent)
        });
      }
    }

    const [modRows] = await db.query(
      `SELECT status, simulated_paid_at, email_tier_id, service_effective_start, service_effective_end, period_end
         FROM tenant_product_modules WHERE tenant_id = ? AND module = 'email' LIMIT 1`,
      [tenantId]
    );
    const emailMod = (modRows as any[])[0] ?? null;

    if (String(row.status) === "cancelled") {
      return res.status(409).json({
        ok: false,
        message: "申请已取消，无法发送测试邮件。"
      });
    }
    if (String(row.status) === "paused") {
      return res.status(403).json({
        ok: false,
        message: "服务已暂停或套餐已到期，请续费后再发送测试邮件。"
      });
    }

    /* 开源版：无套餐门控 */
    if (!row.smtp_profile_id) {
      return res.status(409).json({
        ok: false,
        message: "服务已开通但 SMTP 入口未关联，请联系平台客服。"
      });
    }
    const [dcRows] = await db.query(
      `SELECT domain_change_status FROM email_dedicated_servers WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    const dcStatus = String(
      (dcRows as Array<{ domain_change_status?: string }>)[0]?.domain_change_status ?? "none"
    );
    if (dcStatus === "pending_admin") {
      return res.status(409).json({
        ok: false,
        message: "您已申请更换发件域名，请等待平台审核并推送新的 DNS 记录后再测试。"
      });
    }

    const records = parseDnsRecords(row.dns_records);
    if (records.length === 0) {
      return res.status(409).json({
        ok: false,
        message: "平台尚未推送 DNS 记录，请等待工程师配置完成后再测试。"
      });
    }
    if (records.some((r) => !r.verified)) {
      return res.status(409).json({
        ok: false,
        message: "DNS 记录尚未全部验证通过，请先点击「验证 DNS」。"
      });
    }

    const [smtpRows] = await db.query(
      `SELECT *
         FROM smtp_profiles
        WHERE id = ? AND tenant_id = ?
        LIMIT 1`,
      [Number(row.smtp_profile_id), tenantId]
    );
    const smtp = (smtpRows as any[])[0];
    if (!smtp) {
      return res.status(409).json({
        ok: false,
        message: "SMTP 入口不存在或不属于当前租户，请联系平台客服重新绑定。"
      });
    }

    let pass: string;
    try {
      ({ password: pass } = await resolveDedicatedSmtpPlainPassword(db, id, {
        allowAutoGenerate: false
      }));
      await syncDedicatedPasswordToSmtpProfile(db, id, pass).catch(() => undefined);
    } catch (e: unknown) {
      const hint = String((e as Error)?.message ?? e);
      return res.status(409).json({
        ok: false,
        message:
          hint.includes("请在本页") || hint.includes("随机生成")
            ? `SMTP 密码未配置：${hint}`
            : `SMTP 密码不可用：${hint}`
      });
    }

    const authUser = resolveSmtpAuthUser(smtp);
    if (!authUser) {
      return res.status(409).json({
        ok: false,
        message:
          "SMTP 登录名为空：请在管理后台填写「SMTP 登录名」（完整邮箱，与 Dovecot 一致），或确保 smtp_profiles.from_email 已填写。"
      });
    }

    const displayName = String(row.from_name ?? smtp.display_name ?? "").trim();
    const fromEmail = String(row.from_email ?? smtp.from_email ?? "").trim() || String(smtp.from_email ?? "").trim();
    const replyTo = String(row.reply_to ?? smtp.reply_to ?? "").trim();
    const from = displayName ? `${displayName} <${fromEmail}>` : fromEmail;

    /** 部分网络环境下 IPv6 路由黑洞会导致连接长时间挂起；强制 IPv4 解析 */
    const lookupIpv4 = (hostname: string, _opts: object, cb: (err: NodeJS.ErrnoException | null, address: string, family?: number) => void) => {
      dnsLookup(hostname, { family: 4 }, cb);
    };

    const transporter = nodemailer.createTransport(
      nodemailerTransportFromSmtpRow(smtp, { user: authUser, pass }, {
        connectionTimeout: 20_000,
        socketTimeout: 45_000,
        lookup: lookupIpv4
      })
    );

    const SEND_DEADLINE_MS = 75_000;
    let info: Awaited<ReturnType<typeof transporter.sendMail>>;
    try {
      // eslint-disable-next-line no-console
      console.log(
        "[dedicated-servers/test-send] connecting SMTP %s:%s authUser=%s tenant=%s profileId=%s",
        smtp.host,
        smtp.port,
        authUser,
        tenantId,
        smtp.id
      );
      info = await Promise.race([
        transporter.sendMail({
          from,
          ...(replyTo ? { replyTo } : {}),
          to: body.recipient,
          subject: "BigSocialBoss 邮件营销服务开通测试",
          text:
            "如果您收到这封邮件，说明 BigSocialBoss 专属邮件营销发送通道已经完成连通测试，可以正式开通。",
          html:
            "<p>如果您收到这封邮件，说明 <b>BigSocialBoss 专属邮件营销发送通道</b> 已经完成连通测试，可以正式开通。</p>"
        }),
        new Promise<never>((_, rej) =>
          setTimeout(
            () =>
              rej(
                new Error(
                  `SMTP 在 ${SEND_DEADLINE_MS / 1000}s 内未完成（${smtp.host}:${smtp.port}）。请检查本机网络、VPS 防火墙是否放行 587，或稍后重试。`
                )
              ),
            SEND_DEADLINE_MS
          )
        )
      ]);
    } catch (e: unknown) {
      let msg = String((e as Error)?.message ?? e);
      if (/535|authentication failed|Invalid login/i.test(msg)) {
        msg +=
          ` — 本次 AUTH 用户「${authUser}」，主机 ${smtp.host}:${Number(smtp.port) || 587}。请在管理后台：保存密码 → SSH 同步 SMTP → 测试 587 认证通过后再测。若发信机 postconf -h smtpd_sasl_type 为 dovecot，请检查 /etc/dovecot/users 而非 sasldb。`;
      }
      // eslint-disable-next-line no-console
      console.error("[dedicated-servers/test-send] sendMail failed:", e);
      return res.status(500).json({
        ok: false,
        message: `测试发送失败：${msg}`
      });
    }

    await db.query(
      `UPDATE email_dedicated_servers
          SET status = 'ready',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    const [modAfterRows] = await db.query(
      `SELECT service_effective_start, service_effective_end
         FROM tenant_product_modules
        WHERE tenant_id = ? AND module = 'email'
        LIMIT 1`,
      [tenantId]
    );
    const modAfter = (modAfterRows as Array<{
      service_effective_start: Date | string | null;
      service_effective_end: Date | string | null;
    }>)[0];
    const formalStart = mysqlDateTimeToIso(modAfter?.service_effective_start);
    const formalEnd = mysqlDateTimeToIso(modAfter?.service_effective_end);

    await notifyAllTenantMembers(db, tenantId, {
      kind: "email_onboarding_ready",
      title: "测试邮件发送成功",
      bodyText: `测试邮件已成功送达（${row.sender_domain ?? "发信域"}）。套餐正式有效期自平台首次推送 DNS 起算；到期前请留意续费。`,
      linkPath: "/settings/email",
      meta: { onboardingId: id, messageId: info.messageId, billingPeriodEnd: formalEnd }
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[email-dedicated-servers] user test-send notification skipped", e);
    });

    await insertAdminNotification(db, {
      tenantId,
      kind: "email_onboarding_test_send_passed",
      title: "专线测试邮件发送成功",
      body: {
        onboardingId: id,
        tenantId,
        recipient: body.recipient,
        messageId: info.messageId,
        status: "ready"
      }
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[email-dedicated-servers] admin test-send notification skipped", e);
    });

    res.json({
      ok: true,
      recipient: body.recipient,
      messageId: info.messageId,
      serviceActivatedAt: formalStart,
      serviceEffectiveStart: formalStart,
      serviceEffectiveEnd: formalEnd,
      formalPeriodStart: formalStart,
      formalPeriodEnd: formalEnd,
      note:
        "测试发送成功。套餐正式有效期自平台首次推送 DNS 记录时起算；验证 DNS 与测试发信均在有效期内完成即可。"
    });
  });
}
