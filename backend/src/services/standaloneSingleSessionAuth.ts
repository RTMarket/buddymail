import type { Pool } from "mysql2/promise";

export const STANDALONE_SESSION_ALREADY_ACTIVE_MSG =
  "该账号已有有效登录会话，请先在已登录的浏览器或标签页中退出后再登录。";

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  const raw = authorizationHeader?.trim();
  if (!raw) return null;
  const [type, token] = raw.split(/\s+/, 2);
  if (type?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

/** 独立站：同一用户仅允许一条未撤销且未过期的 access session */
export async function userHasActiveAuthSession(db: Pool, userId: number): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM auth_sessions
      WHERE user_id = ?
        AND revoked_at IS NULL
        AND access_expires_at > NOW()
      LIMIT 1`,
    [userId]
  );
  return (rows as Array<{ ok?: number }>).length > 0;
}

export async function isActiveSessionTokenForUser(
  db: Pool,
  userId: number,
  accessToken: string
): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM auth_sessions
      WHERE user_id = ?
        AND access_token = ?
        AND revoked_at IS NULL
        AND access_expires_at > NOW()
      LIMIT 1`,
    [userId, accessToken]
  );
  return (rows as Array<{ ok?: number }>).length > 0;
}

const PET_AGENT_PREFIX = "BSB-Desktop-Pet/";

export function isPetUserAgent(userAgent: string | null | undefined): boolean {
  return String(userAgent || "").startsWith(PET_AGENT_PREFIX);
}

/**
 * 撤销该用户仍有效的 access session（登录前清理孤儿会话）。
 * 网页登录与桌宠登录互不踢：网页只清网页会话；桌宠只清同一只桌宠（同 User-Agent）的旧会话。
 */
export async function revokeActiveAuthSessionsForUser(
  db: Pool,
  userId: number,
  userAgent?: string | null
): Promise<void> {
  if (isPetUserAgent(userAgent)) {
    await db.query(
      `UPDATE auth_sessions
          SET revoked_at = NOW()
        WHERE user_id = ?
          AND revoked_at IS NULL
          AND access_expires_at > NOW()
          AND user_agent = ?`,
      [userId, String(userAgent)]
    );
    return;
  }
  await db.query(
    `UPDATE auth_sessions
        SET revoked_at = NOW()
      WHERE user_id = ?
        AND revoked_at IS NULL
        AND access_expires_at > NOW()
        AND (user_agent IS NULL OR user_agent NOT LIKE 'BSB-Desktop-Pet/%')`,
    [userId]
  );
}

/**
 * 登录前会话策略：
 * - 请求带「本账号仍有效」的 Bearer → 拒绝重复登录（同浏览器/标签页仍在线）
 * - 否则撤销库内旧会话再签发新 token（修复前端已掉线但 DB 仍占坑的孤儿会话）
 */
export async function prepareStandaloneLoginSession(
  db: Pool,
  userId: number,
  bearerToken: string | null,
  userAgent?: string | null
): Promise<"blocked_active" | "ready"> {
  if (bearerToken && (await isActiveSessionTokenForUser(db, userId, bearerToken))) {
    return "blocked_active";
  }
  await revokeActiveAuthSessionsForUser(db, userId, userAgent);
  return "ready";
}
