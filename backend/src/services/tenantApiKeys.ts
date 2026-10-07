import crypto from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

const API_KEY_PREFIX = "bss_live_";
const API_KEY_RANDOM_BYTES = 32;

export type TenantApiKeyRecord = {
  id: number;
  tenantId: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function hashApiKey(secret: string): string {
  const pepper = process.env.BSS_API_KEY_PEPPER || "bss-standalone-api-v1";
  return crypto.createHash("sha256").update(`${pepper}:${secret}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapApiKeyRow(row: RowDataPacket): TenantApiKeyRecord {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    name: String(row.name ?? ""),
    keyPrefix: String(row.key_prefix ?? ""),
    scopes: normalizeScopes(row.scopes_json),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
  };
}

export function isTenantApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

export async function createTenantApiKey(
  db: Pool,
  tenantId: number,
  input: { name: string; scopes?: string[] }
): Promise<{ secret: string; record: TenantApiKeyRecord }> {
  const suffix = crypto.randomBytes(API_KEY_RANDOM_BYTES).toString("base64url");
  const secret = `${API_KEY_PREFIX}${suffix}`;
  const keyPrefix = secret.slice(0, 20);
  const scopes = input.scopes?.length ? input.scopes : ["email:read", "email:send", "webhook:write"];
  const [result] = await db.query(
    `INSERT INTO tenant_api_keys (tenant_id, name, key_prefix, key_hash, scopes_json)
     VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
    [tenantId, input.name.trim(), keyPrefix, hashApiKey(secret), JSON.stringify(scopes)]
  );
  const id = Number((result as { insertId?: number }).insertId ?? 0);
  const record = await getTenantApiKeyById(db, tenantId, id);
  if (!record) throw new Error("API Key 创建失败");
  return { secret, record };
}

export async function listTenantApiKeys(db: Pool, tenantId: number): Promise<TenantApiKeyRecord[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, name, key_prefix, scopes_json, last_used_at, revoked_at, created_at
       FROM tenant_api_keys
      WHERE tenant_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC, id DESC`,
    [tenantId]
  );
  return rows.map(mapApiKeyRow);
}

export async function getTenantApiKeyById(
  db: Pool,
  tenantId: number,
  id: number
): Promise<TenantApiKeyRecord | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, name, key_prefix, scopes_json, last_used_at, revoked_at, created_at
       FROM tenant_api_keys
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, id]
  );
  return rows[0] ? mapApiKeyRow(rows[0]) : null;
}

export async function revokeTenantApiKey(db: Pool, tenantId: number, id: number): Promise<boolean> {
  const [result] = await db.query(
    `DELETE FROM tenant_api_keys WHERE tenant_id = ? AND id = ?`,
    [tenantId, id]
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function authenticateTenantApiKey(
  db: Pool,
  token: string
): Promise<{ tenantId: number; keyId: number; name: string; scopes: string[] } | null> {
  if (!isTenantApiKey(token)) return null;
  const keyPrefix = token.slice(0, 20);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, name, key_hash, scopes_json
       FROM tenant_api_keys
      WHERE key_prefix = ? AND revoked_at IS NULL
      LIMIT 1`,
    [keyPrefix]
  );
  const row = rows[0];
  if (!row) return null;
  if (!safeEqualHex(String(row.key_hash ?? ""), hashApiKey(token))) return null;
  void db
    .query(`UPDATE tenant_api_keys SET last_used_at = NOW() WHERE id = ?`, [Number(row.id)])
    .catch((e) => console.warn("[tenant-api-keys] update last_used_at:", (e as Error)?.message ?? e));
  return {
    tenantId: Number(row.tenant_id),
    keyId: Number(row.id),
    name: String(row.name ?? ""),
    scopes: normalizeScopes(row.scopes_json)
  };
}
