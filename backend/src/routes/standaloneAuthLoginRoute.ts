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
/** 开源版登录账号归一化：邮箱直接小写；纯账号名按昵称匹配（由 SQL 的 nickname 条件处理） */
function normalizeLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
import {
  STANDALONE_SESSION_ALREADY_ACTIVE_MSG,
  parseBearerToken,
  prepareStandaloneLoginSession
} from "../services/standaloneSingleSessionAuth.js";

type Ctx = { db: Pool; env: Env };

const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "";
const DEFAULT_ADMIN_NICKNAME = "BuddyMail Admin";

async function ensureAdminLoginAccount(db: Pool, env: Env, email: string, password: string): Promise<boolean> {
  const adminEmail = (env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL).toLowerCase();
  const adminPassword = env.ADMIN_LOGIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("必须设置 ADMIN_LOGIN_PASSWORD（.env），开源版无默认管理员密码。");
  }
  const adminNickname = env.ADMIN_LOGIN_NICKNAME?.trim() || DEFAULT_ADMIN_NICKNAME;
  if (email !== adminEmail || password !== adminPassword) return false;

  const [rows] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [adminEmail]);
  const existing = (rows as Array<{ id?: number }>)[0];
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

/** 须在 registerAuthRoutes 之前挂载，覆盖默认 login 并实现单会话策略 */
export function registerStandaloneAuthLoginRoute(app: Express, ctx: Ctx) {
  const { db, env } = ctx;

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
      const email = normalizeLoginEmail(accountInput);
      await ensureAdminLoginAccount(db, env, email, body.password);
      const [rows] = await db.query(
        `SELECT id, email, nickname, password_hash, is_super_admin FROM users WHERE email = ? OR nickname = ? LIMIT 1`,
        [email, accountInput]
      );
      const user = (rows as Array<Record<string, unknown>>)[0];
      if (!user || !verifyPassword(body.password, String(user.password_hash))) {
        return res.status(401).json({ ok: false, message: "账号或密码错误" });
      }

      const userId = Number(user.id);
      const bearerToken = parseBearerToken(req.get("authorization"));
      const sessionPrep = await prepareStandaloneLoginSession(db, userId, bearerToken, req.get("user-agent"));
      if (sessionPrep === "blocked_active") {
        return res.status(409).json({
          ok: false,
          code: "SESSION_ALREADY_ACTIVE",
          message: STANDALONE_SESSION_ALREADY_ACTIVE_MSG
        });
      }

      let tenantId = body.tenantId ?? 0;
      let role: "super_admin" | "tenant_admin" | "member" = "member";
      if (Number(user.is_super_admin) === 1) {
        role = "super_admin";
        if (!tenantId) tenantId = 1;
      } else {
        const [memberRows] = await db.query(
          `SELECT tenant_id, role FROM tenant_members WHERE user_id = ? AND status = 'active' ORDER BY id ASC`,
          [userId]
        );
        const members = memberRows as Array<{ tenant_id?: number; role?: string }>;
        if (members.length === 0) return res.status(403).json({ ok: false, message: "账号未加入任何组织" });
        const selected = members.find((m) => Number(m.tenant_id) === tenantId) ?? members[0];
        tenantId = Number(selected.tenant_id);
        role = String(selected.role) as typeof role;
      }

      const accessToken = issueAccessToken();
      const refreshToken = issueRefreshToken();
      const petAgent = String(req.get("user-agent") || "");
      const petSession = petAgent.startsWith("BSB-Desktop-Pet/");
      const accessUntil = petSession ? new Date("2036-01-01T00:00:00.000Z") : accessExpireAt();
      const refreshUntil = petSession ? new Date("2036-01-01T00:00:00.000Z") : refreshExpireAt();
      await db.query(
        `INSERT INTO auth_sessions
       (user_id, tenant_id, role, access_token, refresh_token, access_expires_at, refresh_expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          tenantId,
          role,
          accessToken,
          refreshToken,
          accessUntil,
          refreshUntil,
          petSession ? petAgent : (req.get("user-agent") ?? null),
          req.ip ?? null
        ]
      );
      return res.json({
        ok: true,
        accessToken,
        refreshToken,
        user: {
          id: userId,
          email: String(user.email),
          nickname: String(user.nickname),
          tenantId,
          role
        }
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const code = String(err?.code ?? "");
      const msg = String(err?.message ?? e);
      if (
        code === "ER_ACCESS_DENIED_ERROR" ||
        code === "ER_ACCESS_DENIED_NO_PASSWORD_ERROR" ||
        msg.includes("Access denied")
      ) {
        // eslint-disable-next-line no-console
        console.error("[standalone/auth/login] MySQL", e);
        return res.status(503).json({
          ok: false,
          message:
            "数据库连接失败（常见：MYSQL_USER/MYSQL_PASSWORD 与 MySQL 中账号不一致，或 Ubuntu 下 root 仅允许 socket 登录）。请修正服务器 backend/.env 后重启 bss-backend。"
        });
      }
      // eslint-disable-next-line no-console
      console.error("[standalone/auth/login]", e);
      return res.status(500).json({ ok: false, message: msg || "登录失败" });
    }
  });
}
