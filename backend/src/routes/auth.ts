import crypto from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import {
  accessExpireAt,
  hashPassword,
  issueAccessToken,
  issueRefreshToken,
  refreshExpireAt,
  verifyPassword
} from "../auth.js";
import { requireAuth, resolveTenantId } from "../middleware/auth.js";
import { strictRateLimiter } from "../middleware/rateLimiter.js";
import { isAuthEmailOtpConfigured, sendAuthEmailOtp } from "../services/authEmailOtp.js";
import { assertRegisterEmailReachable } from "../services/emailDeliverability.js";
import {
  marketingUtmFromReq,
  recordMarketingRegistration
} from "../services/marketingAttribution.js";

type Ctx = { db: Pool; env: Env };

const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "";
const DEFAULT_ADMIN_NICKNAME = "BigSocialBoss Admin";
const AUTH_EMAIL_OTP_TTL_MINUTES = 30;

async function ensureAdminLoginAccount(db: Pool, env: Env, email: string, password: string): Promise<boolean> {
  const adminEmail = (env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL).toLowerCase();
  const adminPassword = env.ADMIN_LOGIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("必须设置 ADMIN_LOGIN_PASSWORD（.env），开源版无默认管理员密码。");
  }
  const adminNickname = env.ADMIN_LOGIN_NICKNAME?.trim() || DEFAULT_ADMIN_NICKNAME;
  if (email !== adminEmail || password !== adminPassword) return false;

  const [rows] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [adminEmail]);
  const existing = (rows as any[])[0];
  if (existing?.id) {
    await db.query(
      `UPDATE users
          SET nickname = COALESCE(NULLIF(?, ''), nickname),
              password_hash = ?,
              status = 'active',
              is_super_admin = 1
        WHERE id = ?`,
      [adminNickname, hashPassword(adminPassword), Number(existing.id)]
    );
    return true;
  }

  await db.query(
    `INSERT INTO users (email, nickname, password_hash, status, is_super_admin)
     VALUES (?, ?, ?, 'active', 1)`,
    [adminEmail, adminNickname, hashPassword(adminPassword)]
  );
  return true;
}

/**
 * 注册验证码发送频控：**仅针对当前邮箱**（SQL 中均有 `WHERE email = ?`），不同邮箱互不影响。
 * 规则：同一邮箱两次「注册」发码间隔至少 60 秒，防止连点刷信；不设「每小时总次数」上限，避免正常用户反复尝试注册被误伤。
 */
async function assertCanSendRegisterOtp(db: Pool, email: string): Promise<void> {
  const [lastRows] = await db.query(
    `SELECT created_at FROM auth_email_verifications
      WHERE email = ? AND purpose = 'register' ORDER BY id DESC LIMIT 1`,
    [email]
  );
  const last = (lastRows as any[])[0]?.created_at;
  if (last) {
    const diffMs = Date.now() - new Date(last).getTime();
    if (diffMs < 60_000) {
      throw Object.assign(new Error("发送过于频繁，请 60 秒后再试"), { statusCode: 429 });
    }
  }
}

/** 重置密码验证码：同样仅按邮箱；仅 60 秒间隔，不限制每小时总次数。 */
async function assertCanSendResetOtp(db: Pool, email: string): Promise<void> {
  const [lastRows] = await db.query(
    `SELECT created_at FROM auth_email_verifications WHERE email = ? AND purpose = 'reset_password' ORDER BY id DESC LIMIT 1`,
    [email]
  );
  const last = (lastRows as any[])[0]?.created_at;
  if (last) {
    const diffMs = Date.now() - new Date(last).getTime();
    if (diffMs < 60_000) {
      throw Object.assign(new Error("发送过于频繁，请 60 秒后再试"), { statusCode: 429 });
    }
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** SMTP 发信失败时把英文栈信息换成可操作说明；验证码走 AokSend 时不套用 SMTP 535 文案，避免误导 */
function authEmailOtpFailureMessage(raw: unknown, env?: { AUTH_EMAIL_OTP_CHANNEL?: string }): string {
  const msg = String((raw as { message?: unknown })?.message ?? raw ?? "");
  const ch = String(env?.AUTH_EMAIL_OTP_CHANNEL ?? "").toLowerCase();
  if (ch === "aoksend") {
    return msg || "发送失败";
  }
  if (/535|Invalid login|not exist in redis|EAUTH|authentication failed/i.test(msg)) {
    return (
      "发信邮箱 SMTP 登录失败（535）：请核对服务器 backend/.env 中的 AUTH_EMAIL_SMTP_USER（一般为完整发件邮箱）、AUTH_EMAIL_SMTP_PASS（须在腾讯云「邮件推送」控制台获取 SMTP 发信密码，而非控制台登录密码）。端口与 AUTH_EMAIL_SMTP_SECURE 须与官方文档一致（常见：465 + true，或 587 + false）。修改后执行 pm2 restart bss-backend；可在服务器运行：cd backend && npm run check:auth-email 做自检。"
    );
  }
  return msg || "发送失败";
}

export function registerAuthRoutes(app: Express, ctx: Ctx) {
  const { db, env } = ctx;

  app.post("/api/auth/bootstrap-super-admin", async (req, res) => {
    const schema = z.object({
      bootstrapKey: z.string().min(1),
      email: z.string().email(),
      nickname: z.string().min(1).max(120),
      password: z.string().min(6).max(64)
    });
    const body = schema.parse(req.body ?? {});
    if (!env.ADMIN_BOOTSTRAP_KEY || body.bootstrapKey !== env.ADMIN_BOOTSTRAP_KEY) {
      return res.status(403).json({ ok: false, message: "Invalid bootstrap key" });
    }
    const [rows] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [body.email.toLowerCase()]);
    if ((rows as any[]).length > 0) {
      await db.query(`UPDATE users SET is_super_admin = 1, status='active' WHERE email = ?`, [body.email.toLowerCase()]);
      return res.json({ ok: true, message: "existing user promoted" });
    }
    const [result] = await db.query(
      `INSERT INTO users (email, nickname, password_hash, status, is_super_admin) VALUES (?, ?, ?, 'active', 1)`,
      [body.email.toLowerCase(), body.nickname.trim(), hashPassword(body.password)]
    );
    return res.json({ ok: true, userId: Number((result as any).insertId) });
  });

  /** 注册：向邮箱发送 6 位数字验证码（腾讯云邮件推送 SMTP） */
  app.post("/api/auth/send-register-code", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email() });
      const body = schema.parse(req.body ?? {});
      const email = body.email.trim().toLowerCase();
      if (!isAuthEmailOtpConfigured(env)) {
        return res.status(503).json({
          ok: false,
          message:
            "未配置注册发码：smtp 请设置 AUTH_EMAIL_SMTP_*；AokSend 请设 AUTH_EMAIL_OTP_CHANNEL=aoksend 与 AOKSEND_APP_KEY、AOKSEND_TEMPLATE_ID；腾讯云请设 AUTH_EMAIL_OTP_CHANNEL=tencent_template 及 TENCENT_SES_*、AUTH_EMAIL_OTP_TEMPLATE_ID（见 backend/.env.example）。"
        });
      }
      const [exists] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      if ((exists as any[]).length > 0) {
        return res.status(400).json({ ok: false, message: "该邮箱已注册，请直接登录" });
      }
      try {
        await assertCanSendRegisterOtp(db, email);
      } catch (e: any) {
        if (Number(e?.statusCode) === 429) {
          return res.status(429).json({ ok: false, message: String(e?.message ?? e) });
        }
        throw e;
      }
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(Date.now() + AUTH_EMAIL_OTP_TTL_MINUTES * 60_000);
      await db.query(`INSERT INTO auth_email_verifications (email, purpose, code, expires_at) VALUES (?, 'register', ?, ?)`, [
        email,
        otp,
        expiresAt
      ]);
      await sendAuthEmailOtp(env, email, otp, "register", AUTH_EMAIL_OTP_TTL_MINUTES);
      return res.json({ ok: true, message: "验证码已发送，请到邮箱查收（含垃圾箱）。" });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("ER_NO_SUCH_TABLE") && msg.toLowerCase().includes("auth_email")) {
        return res.status(503).json({
          ok: false,
          message: "请先执行数据库迁移：cd backend && npm run db:migrate（含 029_auth_email_verifications.sql）。"
        });
      }
      // eslint-disable-next-line no-console
      console.error("[auth/send-register-code]", e);
      return res.status(500).json({ ok: false, message: authEmailOtpFailureMessage(e, env) });
    }
  });

  app.get("/api/auth/register-options", (_req, res) => {
    res.json({
      ok: true as const,
      emailOtpRequired: env.AUTH_REGISTER_EMAIL_OTP_REQUIRED,
      emailMxRequired: env.AUTH_REGISTER_EMAIL_MX_REQUIRED,
      abstractEnabled: Boolean(env.ABSTRACT_EMAIL_VALIDATION_KEY?.trim())
    });
  });

  /** 无验证码注册：预检邮箱是否未注册且 MX/Abstract 通过（供注册页绿色状态） */
  app.post("/api/auth/precheck-register-email", async (req, res) => {
    try {
      if (env.AUTH_REGISTER_EMAIL_OTP_REQUIRED) {
        return res.json({
          ok: true as const,
          emailOtpRequired: true,
          ready: false,
          message: "当前为验证码注册流程，无需预检。"
        });
      }
      const schema = z.object({ email: z.string().email() });
      const parsed = schema.parse(req.body ?? {});
      const em = parsed.email.trim().toLowerCase();
      const [exists] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [em]);
      if ((exists as any[]).length > 0) {
        return res.json({
          ok: true as const,
          emailOtpRequired: false,
          ready: false,
          reason: "registered" as const,
          message: "该邮箱已注册，请直接登录"
        });
      }
      try {
        await assertRegisterEmailReachable(em, env);
      } catch (e: any) {
        return res.json({
          ok: true as const,
          emailOtpRequired: false,
          ready: false,
          message: String(e?.message ?? e)
        });
      }
      return res.json({
        ok: true as const,
        emailOtpRequired: false,
        ready: true,
        message: "该邮箱通过校验，可注册"
      });
    } catch (e: any) {
      return res.status(400).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({
      tenantName: z.string().min(2).max(120),
      nickname: z.string().min(1).max(120),
      email: z.string().email(),
      password: z.string().min(6).max(64),
      verificationCode: z.string().optional().default("")
    });
    const body = schema.parse(req.body ?? {});
    const email = body.email.trim().toLowerCase();

    if (env.AUTH_REGISTER_EMAIL_OTP_REQUIRED) {
      if (!/^\d{6}$/.test(body.verificationCode.trim())) {
        return res.status(400).json({ ok: false, message: "须为 6 位数字验证码" });
      }
    } else {
      try {
        await assertRegisterEmailReachable(email, env);
      } catch (e: any) {
        return res.status(400).json({ ok: false, message: String(e?.message ?? e) });
      }
    }

    const [tenantCountRows] = await db.query(`SELECT COUNT(*) AS c FROM tenants`);
    const tenantCount = Number((tenantCountRows as any[])[0]?.c ?? 0);
    if (tenantCount >= 50) {
      return res.status(400).json({ ok: false, message: "组织数量已达上限（50）" });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [userExistsRows] = await conn.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      if ((userExistsRows as any[]).length > 0) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "邮箱已注册" });
      }
      let vrow: { id: number } | undefined;
      if (env.AUTH_REGISTER_EMAIL_OTP_REQUIRED) {
        const [vRows] = await conn.query(
          `SELECT id FROM auth_email_verifications
         WHERE email = ? AND purpose = 'register' AND code = ? AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
          [email, body.verificationCode.trim()]
        );
        vrow = (vRows as any[])[0];
        if (!vrow?.id) {
          await conn.rollback();
          return res.status(400).json({ ok: false, message: "验证码无效或已过期，请重新获取" });
        }
      }
      const baseSlug = slugify(body.tenantName) || `tenant-${Date.now()}`;
      let slug = baseSlug;
      let i = 1;
      while (true) {
        const [slugRows] = await conn.query(`SELECT id FROM tenants WHERE slug = ? LIMIT 1`, [slug]);
        if ((slugRows as any[]).length === 0) break;
        slug = `${baseSlug}-${i++}`;
      }
      const [tenantResult] = await conn.query(`INSERT INTO tenants (slug, name, status, seat_limit) VALUES (?, ?, 'active', 50)`, [
        slug,
        body.tenantName.trim()
      ]);
      const tenantId = Number((tenantResult as any).insertId);
      const [userResult] = await conn.query(
        `INSERT INTO users (email, nickname, password_hash, status, is_super_admin) VALUES (?, ?, ?, 'active', 0)`,
        [email, body.nickname.trim(), hashPassword(body.password)]
      );
      const userId = Number((userResult as any).insertId);
      await conn.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role, status) VALUES (?, ?, 'tenant_admin', 'active')`,
        [tenantId, userId]
      );
      await conn.query(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_mode) VALUES (?, 1, 'trialing', 'stripe')
         ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), status = VALUES(status)`,
        [tenantId]
      );
      for (const mod of ["social", "leads", "crm", "email"] as const) {
        await conn.query(
          `INSERT INTO tenant_product_modules
            (tenant_id, module, status, monthly_price_cents, simulated_paid_at, period_start, period_end)
           VALUES (?, ?, 'inactive', 3000, NULL, NULL, NULL)`,
          [tenantId, mod]
        );
      }
      if (vrow?.id) {
        await conn.query(`UPDATE auth_email_verifications SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL`, [
          vrow.id
        ]);
      }
      await conn.commit();
      const mktUtm = marketingUtmFromReq(req);
      const landingReferrer = typeof req.headers.referer === "string" ? req.headers.referer : null;
      await recordMarketingRegistration(db, {
        userId,
        tenantId,
        utm: mktUtm,
        landingReferrer
      });
      return res.json({ ok: true, tenantId, userId });
    } catch (e: any) {
      await conn.rollback();
      if (String(e?.code) === "ER_DUP_ENTRY") {
        return res.status(400).json({ ok: false, message: "组织或邮箱已存在" });
      }
      return res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  /** 忘记密码：向已注册邮箱发送 6 位验证码 */
  app.post("/api/auth/send-reset-code", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email() });
      const body = schema.parse(req.body ?? {});
      const email = body.email.trim().toLowerCase();
      if (!isAuthEmailOtpConfigured(env)) {
        return res.status(503).json({
          ok: false,
          message:
            "未配置重置密码发码：smtp 请设置 AUTH_EMAIL_SMTP_*；AokSend 请设 AUTH_EMAIL_OTP_CHANNEL=aoksend 与 AOKSEND_APP_KEY、AOKSEND_TEMPLATE_ID；腾讯云请设 AUTH_EMAIL_OTP_CHANNEL=tencent_template 及 TENCENT_SES_*、AUTH_EMAIL_OTP_TEMPLATE_ID（见 backend/.env.example）。"
        });
      }
      const [exists] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      if ((exists as any[]).length === 0) {
        return res.status(400).json({ ok: false, message: "该邮箱未注册，请先注册" });
      }
      try {
        await assertCanSendResetOtp(db, email);
      } catch (e: any) {
        if (Number(e?.statusCode) === 429) {
          return res.status(429).json({ ok: false, message: String(e?.message ?? e) });
        }
        throw e;
      }
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(Date.now() + AUTH_EMAIL_OTP_TTL_MINUTES * 60_000);
      await db.query(
        `INSERT INTO auth_email_verifications (email, purpose, code, expires_at) VALUES (?, 'reset_password', ?, ?)`,
        [email, otp, expiresAt]
      );
      await sendAuthEmailOtp(env, email, otp, "reset_password", AUTH_EMAIL_OTP_TTL_MINUTES);
      return res.json({ ok: true, message: "验证码已发送，请到邮箱查收（含垃圾箱）。" });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("ER_NO_SUCH_TABLE") && msg.toLowerCase().includes("auth_email")) {
        return res.status(503).json({
          ok: false,
          message: "请先执行数据库迁移：cd backend && npm run db:migrate（含 029_auth_email_verifications.sql）。"
        });
      }
      // eslint-disable-next-line no-console
      console.error("[auth/send-reset-code]", e);
      return res.status(500).json({ ok: false, message: authEmailOtpFailureMessage(e, env) });
    }
  });

  /** 忘记密码：验证码通过后重置密码 */
  app.post("/api/auth/verify-reset-code", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        verificationCode: z.string().regex(/^\d{6}$/)
      });
      const body = schema.parse(req.body ?? {});
      const email = body.email.trim().toLowerCase();
      const [rows] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      const u = (rows as any[])[0];
      if (!u?.id) {
        return res.status(400).json({ ok: false, message: "该邮箱未注册，请先注册" });
      }
      const [vRows] = await db.query(
        `SELECT id FROM auth_email_verifications
         WHERE email = ? AND purpose = 'reset_password' AND code = ? AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
        [email, body.verificationCode.trim()]
      );
      const vrow = (vRows as any[])[0];
      if (!vrow?.id) {
        return res.status(400).json({ ok: false, message: "验证码无效或已过期，请重新获取" });
      }
      return res.json({ ok: true, message: "验证码校验通过" });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return res.status(500).json({ ok: false, message: msg || "校验失败" });
    }
  });

  /** 忘记密码：验证码通过后重置密码 */
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        verificationCode: z.string().regex(/^\d{6}$/),
        newPassword: z.string().min(6).max(64)
      });
      const body = schema.parse(req.body ?? {});
      const email = body.email.trim().toLowerCase();
      const [rows] = await db.query(`SELECT id, password_hash FROM users WHERE email = ? LIMIT 1`, [email]);
      const u = (rows as any[])[0];
      if (!u?.id) {
        return res.status(400).json({ ok: false, message: "该邮箱未注册，请先注册" });
      }
      const [vRows] = await db.query(
        `SELECT id FROM auth_email_verifications
         WHERE email = ? AND purpose = 'reset_password' AND code = ? AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
        [email, body.verificationCode.trim()]
      );
      const vrow = (vRows as any[])[0];
      if (!vrow?.id) {
        return res.status(400).json({ ok: false, message: "验证码无效或已过期，请重新获取" });
      }
      if (verifyPassword(body.newPassword, String(u.password_hash))) {
        return res.status(400).json({ ok: false, message: "新密码不能与当前密码相同" });
      }
      await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(body.newPassword), Number(u.id)]);
      await db.query(`UPDATE auth_email_verifications SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL`, [vrow.id]);
      return res.json({ ok: true, message: "密码已重置，请使用新密码登录" });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // eslint-disable-next-line no-console
      console.error("[auth/reset-password]", e);
      return res.status(500).json({ ok: false, message: msg || "重置失败" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().min(1).optional(),
        account: z.string().min(1).optional(),
        password: z.string().min(1),
        tenantId: z.coerce.number().int().positive().optional()
      });
      const body = schema.parse(req.body ?? {});
      const accountInput = (body.account ?? body.email ?? "").trim();
      const emailLower = accountInput.toLowerCase();
      await ensureAdminLoginAccount(db, env, emailLower, body.password);
      const [rows] = await db.query(`SELECT id, email, nickname, password_hash, is_super_admin FROM users WHERE email = ? OR nickname = ? LIMIT 1`, [
        emailLower, accountInput
      ]);
      const user = (rows as any[])[0];
      if (!user || !verifyPassword(body.password, String(user.password_hash))) {
        return res.status(401).json({ ok: false, message: "账号或密码错误" });
      }

      let tenantId = body.tenantId ?? 0;
      let role: "super_admin" | "tenant_admin" | "member" = "member";
      if (Number(user.is_super_admin) === 1) {
        role = "super_admin";
        if (!tenantId) tenantId = 1;
      } else {
        const [memberRows] = await db.query(
          `SELECT tenant_id, role FROM tenant_members WHERE user_id = ? AND status = 'active' ORDER BY id ASC`,
          [user.id]
        );
        const members = memberRows as any[];
        if (members.length === 0) return res.status(403).json({ ok: false, message: "账号未加入任何组织" });
        const selected =
          members.find((m) => Number(m.tenant_id) === tenantId) ??
          members[0];
        tenantId = Number(selected.tenant_id);
        role = String(selected.role) as typeof role;
      }

      const accessToken = issueAccessToken();
      const refreshToken = issueRefreshToken();
      await db.query(
        `INSERT INTO auth_sessions
       (user_id, tenant_id, role, access_token, refresh_token, access_expires_at, refresh_expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          tenantId,
          role,
          accessToken,
          refreshToken,
          accessExpireAt(),
          refreshExpireAt(),
          req.get("user-agent") ?? null,
          req.ip ?? null
        ]
      );
      return res.json({
        ok: true,
        accessToken,
        refreshToken,
        user: {
          id: Number(user.id),
          email: String(user.email),
          nickname: String(user.nickname),
          tenantId,
          role
        }
      });
    } catch (e: any) {
      const code = String(e?.code ?? "");
      const msg = String(e?.message ?? e);
      if (
        code === "ER_ACCESS_DENIED_ERROR" ||
        code === "ER_ACCESS_DENIED_NO_PASSWORD_ERROR" ||
        msg.includes("Access denied")
      ) {
        // eslint-disable-next-line no-console
        console.error("[auth/login] MySQL", e);
        return res.status(503).json({
          ok: false,
          message:
            "数据库连接失败（常见：MYSQL_USER/MYSQL_PASSWORD 与 MySQL 中账号不一致，或 Ubuntu 下 root 仅允许 socket 登录）。请修正服务器 backend/.env 后重启 bss-backend。"
        });
      }
      // eslint-disable-next-line no-console
      console.error("[auth/login]", e);
      return res.status(500).json({ ok: false, message: msg || "登录失败" });
    }
  });

  app.post("/api/auth/logout", requireAuth(db), async (req, res) => {
    const raw = req.header("authorization");
    const token = raw?.split(" ")?.[1] ?? "";
    if (token) {
      await db.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE access_token = ?`, [token]);
    }
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth(db), async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT id, name, slug, status FROM tenants WHERE id = ? LIMIT 1`, [tenantId]);
    const tenant = (tenantRows as any[])[0] ?? null;
    return res.json({
      ok: true,
      user: req.auth,
      tenant
    });
  });

  /** 修改登录密码：需已登录（个人中心无需再填写当前密码） */
  app.put("/api/me/password", requireAuth(db), async (req, res) => {
    const schema = z.object({
      newPassword: z.string().min(6).max(64)
    });
    const body = schema.parse(req.body ?? {});
    const userId = req.auth!.userId;
    const [rows] = await db.query(`SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`, [userId]);
    const u = (rows as any[])[0];
    if (!u) {
      return res.status(400).json({ ok: false, message: "用户不存在" });
    }
    if (verifyPassword(body.newPassword, String(u.password_hash))) {
      return res.status(400).json({ ok: false, message: "新密码不能与当前密码相同" });
    }
    await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(body.newPassword), userId]);
    return res.json({ ok: true });
  });
}
