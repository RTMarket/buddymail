import type { NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { authenticateTenantApiKey, isTenantApiKey } from "../services/tenantApiKeys.js";

export type AuthIdentity = {
  userId: number;
  tenantId: number;
  role: "super_admin" | "tenant_admin" | "member" | "api_key";
  email: string;
  nickname: string;
  isSuperAdmin: boolean;
  apiKeyId?: number;
  apiKeyName?: string;
  apiKeyScopes?: string[];
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthIdentity;
  }
}

function tokenFromReq(req: Request): string | null {
  const raw = req.header("authorization");
  if (!raw) return null;
  const [type, token] = raw.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

async function authenticateSession(db: Pool, token: string): Promise<AuthIdentity | null> {
  const [rows] = await db.query(
    `SELECT s.user_id, s.tenant_id, s.role, s.access_expires_at, s.revoked_at,
            u.email, u.nickname, u.is_super_admin
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.access_token = ?
      LIMIT 1`,
    [token]
  );
  const row = (rows as any[])[0];
  if (!row || row.revoked_at) return null;
  const exp = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (Date.now() >= exp) return null;
  return {
    userId: Number(row.user_id),
    tenantId: Number(row.tenant_id),
    role: String(row.role) as AuthIdentity["role"],
    email: String(row.email),
    nickname: String(row.nickname),
    isSuperAdmin: Boolean(row.is_super_admin)
  };
}

export function requireAuth(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = tokenFromReq(req);
    if (!token) return res.status(401).json({ ok: false, message: "Unauthorized" });

    try {
      if (isTenantApiKey(token)) {
        if (!req.path.startsWith("/v1/")) {
          return res.status(403).json({
            ok: false,
            code: "FORBIDDEN",
            message: "API Key 仅可访问 /api/v1/*"
          });
        }
        const key = await authenticateTenantApiKey(db, token);
        if (!key) {
          return res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "Invalid API Key" });
        }
        req.auth = {
          userId: 0,
          tenantId: key.tenantId,
          role: "api_key",
          email: "",
          nickname: key.name,
          isSuperAdmin: false,
          apiKeyId: key.keyId,
          apiKeyName: key.name,
          apiKeyScopes: key.scopes
        };
        return next();
      }

      const session = await authenticateSession(db, token);
      if (!session) return res.status(401).json({ ok: false, message: "Unauthorized" });
      req.auth = session;
      return next();
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error("[auth] requireAuth db error", e);
      return res.status(503).json({ ok: false, message: "数据库暂时不可用，请检查 MYSQL 配置后重启后端。" });
    }
  };
}

export function requireRole(...roles: AuthIdentity["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (req.auth.isSuperAdmin) return next();
    if (roles.includes(req.auth.role)) return next();
    return res.status(403).json({ ok: false, message: "Forbidden" });
  };
}

export function resolveTenantId(req: Request): number {
  if (!req.auth) return 1;
  if (req.auth.isSuperAdmin) {
    const q = Number(req.query.tenantId);
    if (Number.isFinite(q) && q > 0) return Math.floor(q);
  }
  return req.auth.tenantId;
}
