import type { Pool, RowDataPacket } from "mysql2/promise";

export type TikTokAccountStat = {
  slot: number;
  username: string;
  name: string;
  avatarUrl: string;
  openId: string;
  followerCount: number | null;
  videoCount: number | null;
};

let schemaReady: Promise<void> | null = null;

export function ensureTikTokAccountsSchema(db: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS standalone_tiktok_accounts (
           tenant_id BIGINT NOT NULL,
           slot INT NOT NULL,
           username VARCHAR(64) NOT NULL DEFAULT '',
           name VARCHAR(128) NOT NULL DEFAULT '',
           avatar_url VARCHAR(512) NOT NULL DEFAULT '',
           open_id VARCHAR(128) NOT NULL DEFAULT '',
           follower_count INT NULL,
           video_count INT NULL,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (tenant_id, slot)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

/** 全量替换该租户的 TikTok 账号公开资料（不含任何 token）。 */
export async function syncTikTokAccounts(
  db: Pool,
  tenantId: number,
  accounts: Array<{
    slot: number;
    username?: string;
    name?: string;
    avatarUrl?: string;
    openId?: string;
    followerCount?: number | null;
    videoCount?: number | null;
  }>
): Promise<void> {
  await ensureTikTokAccountsSchema(db);
  const clean = accounts
    .filter((a) => Number.isInteger(a.slot) && (a.slot as number) >= 0)
    .map((a) => ({
      slot: Number(a.slot),
      username: String(a.username ?? "").slice(0, 64),
      name: String(a.name ?? "").slice(0, 128),
      avatarUrl: String(a.avatarUrl ?? "").slice(0, 512),
      openId: String(a.openId ?? "").slice(0, 128),
      followerCount:
        a.followerCount === null || a.followerCount === undefined
          ? null
          : Math.max(0, Math.floor(Number(a.followerCount) || 0)),
      videoCount:
        a.videoCount === null || a.videoCount === undefined
          ? null
          : Math.max(0, Math.floor(Number(a.videoCount) || 0))
    }));
  await db.query(`DELETE FROM standalone_tiktok_accounts WHERE tenant_id = ?`, [tenantId]);
  for (const a of clean) {
    await db.query(
      `INSERT INTO standalone_tiktok_accounts
         (tenant_id, slot, username, name, avatar_url, open_id, follower_count, video_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, a.slot, a.username, a.name, a.avatarUrl, a.openId, a.followerCount, a.videoCount]
    );
  }
}

export async function listTikTokAccounts(db: Pool, tenantId: number): Promise<TikTokAccountStat[]> {
  try {
    await ensureTikTokAccountsSchema(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT slot, username, name, avatar_url, open_id, follower_count, video_count
         FROM standalone_tiktok_accounts WHERE tenant_id = ? ORDER BY slot ASC`,
      [tenantId]
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      slot: Number(r.slot ?? 0),
      username: String(r.username ?? ""),
      name: String(r.name ?? ""),
      avatarUrl: String(r.avatar_url ?? ""),
      openId: String(r.open_id ?? ""),
      followerCount: r.follower_count === null || r.follower_count === undefined ? null : Number(r.follower_count),
      videoCount: r.video_count === null || r.video_count === undefined ? null : Number(r.video_count)
    }));
  } catch {
    return [];
  }
}
