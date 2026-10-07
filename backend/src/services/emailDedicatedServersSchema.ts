import type { Pool } from "mysql2/promise";

/**
 * 防御式建表 / 补列：即使 SQL 050 未跑，启动期也补齐 email_dedicated_servers
 * 与 smtp_profiles.dedicated_server_id，让接口不至于因为 schema 缺失整体挂掉。
 *
 * 跟手写 migration 的关系：SQL 050 是源头；这里是兜底，确保升级顺序错乱时也能起服务。
 */
export async function ensureEmailDedicatedServersSchema(db: Pool): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS email_dedicated_servers (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       tenant_id BIGINT NOT NULL,
       label VARCHAR(128) NOT NULL,
       sender_domain VARCHAR(253) NULL,
       from_name VARCHAR(128) NULL,
       from_email VARCHAR(254) NULL,
       reply_to VARCHAR(254) NULL,
       dns_records JSON NULL,
       subscription_tier_id VARCHAR(64) NULL,
       status ENUM('requested','provisioning','awaiting_dns','ready','paused','failed','cancelled','rejected','deleted')
         NOT NULL DEFAULT 'requested',
       ip_address VARCHAR(45) NULL,
       hostname VARCHAR(253) NULL,
       region VARCHAR(64) NULL,
       smtp_profile_id BIGINT NULL,
       notes_from_user VARCHAR(500) NULL,
       admin_notes VARCHAR(500) NULL,
       billing_started_at DATETIME NULL,
       billing_period_end_at DATETIME NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       KEY idx_tenant_status (tenant_id, status),
       KEY idx_status (status),
       KEY idx_smtp_profile (smtp_profile_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  /**
   * 老库可能已经建好 email_dedicated_servers 但还没 sender_domain /
   * from_name / from_email / reply_to / dns_records 列，这里逐一补上（防御式）。
   *
   * 顺序与依赖：sender_domain 先，from_* / dns_records 跟在 sender_domain 后。
   */
  type ColDef = { name: string; ddl: string };
  const colDefs: ColDef[] = [
    { name: "sender_domain", ddl: "ADD COLUMN sender_domain VARCHAR(253) NULL AFTER label" },
    { name: "from_name", ddl: "ADD COLUMN from_name VARCHAR(128) NULL AFTER sender_domain" },
    { name: "from_email", ddl: "ADD COLUMN from_email VARCHAR(254) NULL AFTER from_name" },
    { name: "reply_to", ddl: "ADD COLUMN reply_to VARCHAR(254) NULL AFTER from_email" },
    { name: "dns_records", ddl: "ADD COLUMN dns_records JSON NULL AFTER reply_to" },
    { name: "relay_ip", ddl: "ADD COLUMN relay_ip VARCHAR(45) NULL AFTER ip_address" },
    { name: "ptr_ip", ddl: "ADD COLUMN ptr_ip VARCHAR(45) NULL AFTER relay_ip" },
    { name: "ptr_hostname", ddl: "ADD COLUMN ptr_hostname VARCHAR(253) NULL AFTER ptr_ip" },
    {
      name: "domain_change_status",
      ddl: "ADD COLUMN domain_change_status ENUM('none','pending_admin','rejected') NOT NULL DEFAULT 'none' AFTER admin_notes"
    },
    {
      name: "pending_sender_domain",
      ddl: "ADD COLUMN pending_sender_domain VARCHAR(253) NULL AFTER domain_change_status"
    },
    { name: "pending_from_name", ddl: "ADD COLUMN pending_from_name VARCHAR(128) NULL AFTER pending_sender_domain" },
    { name: "pending_from_email", ddl: "ADD COLUMN pending_from_email VARCHAR(254) NULL AFTER pending_from_name" },
    { name: "pending_reply_to", ddl: "ADD COLUMN pending_reply_to VARCHAR(254) NULL AFTER pending_from_email" },
    {
      name: "domain_change_requested_at",
      ddl: "ADD COLUMN domain_change_requested_at DATETIME NULL AFTER pending_reply_to"
    },
    { name: "relay_vps_username", ddl: "ADD COLUMN relay_vps_username VARCHAR(128) NULL AFTER ptr_hostname" },
    { name: "relay_vps_password_enc", ddl: "ADD COLUMN relay_vps_password_enc TEXT NULL AFTER relay_vps_username" },
    { name: "ptr_vps_username", ddl: "ADD COLUMN ptr_vps_username VARCHAR(128) NULL AFTER relay_vps_password_enc" },
    { name: "ptr_vps_password_enc", ddl: "ADD COLUMN ptr_vps_password_enc TEXT NULL AFTER ptr_vps_username" },
    {
      name: "relay_ip_registered_at",
      ddl: "ADD COLUMN relay_ip_registered_at DATETIME NULL AFTER ptr_vps_password_enc"
    },
    { name: "ptr_ip_registered_at", ddl: "ADD COLUMN ptr_ip_registered_at DATETIME NULL AFTER relay_ip_registered_at" },
    {
      name: "relay_ip_renewal_due_at",
      ddl: "ADD COLUMN relay_ip_renewal_due_at DATETIME NULL AFTER ptr_ip_registered_at"
    },
    { name: "ptr_ip_renewal_due_at", ddl: "ADD COLUMN ptr_ip_renewal_due_at DATETIME NULL AFTER relay_ip_renewal_due_at" },
    {
      name: "tenant_submitted_smtp_password_enc",
      ddl: "ADD COLUMN tenant_submitted_smtp_password_enc TEXT NULL AFTER reply_to"
    },
    {
      name: "admin_smtp_password_enc",
      ddl: "ADD COLUMN admin_smtp_password_enc TEXT NULL AFTER tenant_submitted_smtp_password_enc"
    },
    {
      name: "dkim_public_key",
      ddl: "ADD COLUMN dkim_public_key VARCHAR(4096) NULL AFTER admin_smtp_password_enc"
    },
    {
      name: "relay_smtp_synced_at",
      ddl: "ADD COLUMN relay_smtp_synced_at DATETIME NULL AFTER dkim_public_key"
    },
    {
      name: "application_rejection_reason",
      ddl: "ADD COLUMN application_rejection_reason VARCHAR(500) NULL COMMENT '首次申请驳回原因（租户可见）' AFTER admin_notes"
    },
    {
      name: "application_rejected_at",
      ddl: "ADD COLUMN application_rejected_at DATETIME NULL AFTER application_rejection_reason"
    },
    {
      name: "tenant_deleted_at",
      ddl: "ADD COLUMN tenant_deleted_at DATETIME NULL AFTER application_rejected_at"
    }
  ];
  try {
    await db.query(
      `ALTER TABLE email_dedicated_servers MODIFY COLUMN status ENUM(
         'requested','provisioning','awaiting_dns','ready','paused','failed','cancelled','rejected','deleted'
       ) NOT NULL DEFAULT 'requested'`
    );
  } catch (e) {
    if (!/Duplicate|already/i.test(String((e as Error)?.message ?? ""))) {
      // eslint-disable-next-line no-console
      console.warn("[ensureEmailDedicatedServersSchema] status enum rejected:", (e as Error)?.message);
    }
  }

  for (const c of colDefs) {
    const [existing] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'email_dedicated_servers'
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [c.name]
    );
    if ((existing as Array<unknown>).length === 0) {
      try {
        await db.query(`ALTER TABLE email_dedicated_servers ${c.ddl}`);
      } catch (e) {
        if (!/Duplicate column/i.test(String((e as Error)?.message ?? ""))) throw e;
      }
    }
  }

  /** smtp_profiles 表存在时才补列；若 smtp_profiles 不存在（极少情况），跳过即可 */
  const [tbls] = await db.query(
    `SELECT 1 AS exist FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'smtp_profiles' LIMIT 1`
  );
  if ((tbls as Array<unknown>).length === 0) return;

  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'smtp_profiles'
        AND COLUMN_NAME = 'dedicated_server_id'
      LIMIT 1`
  );
  if ((cols as Array<unknown>).length === 0) {
    /**
     * 防御性 try：并行启动可能并发尝试 ADD COLUMN，第二个会报 Duplicate column；忽略即可。
     */
    try {
      await db.query(
        `ALTER TABLE smtp_profiles ADD COLUMN dedicated_server_id BIGINT NULL`
      );
    } catch (e) {
      if (!/Duplicate column/i.test(String((e as Error)?.message ?? ""))) throw e;
    }
    try {
      await db.query(
        `ALTER TABLE smtp_profiles ADD KEY idx_ded_server (dedicated_server_id)`
      );
    } catch (e) {
      if (!/Duplicate key/i.test(String((e as Error)?.message ?? ""))) {
        // 索引创建失败不致命，记录即可
        // eslint-disable-next-line no-console
        console.warn("[ensureEmailDedicatedServersSchema] add idx_ded_server failed:", (e as Error)?.message);
      }
    }
  }
}
