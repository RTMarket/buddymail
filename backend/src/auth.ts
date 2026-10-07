import crypto from "node:crypto";

const ACCESS_TTL_MS = 1000 * 60 * 60 * 8;
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

export function issueAccessToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function issueRefreshToken(): string {
  return crypto.randomBytes(40).toString("base64url");
}

export function accessExpireAt(now = Date.now()): Date {
  return new Date(now + ACCESS_TTL_MS);
}

export function refreshExpireAt(now = Date.now()): Date {
  return new Date(now + REFRESH_TTL_MS);
}
