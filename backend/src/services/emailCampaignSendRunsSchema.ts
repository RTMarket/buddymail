import type { Pool } from "mysql2/promise";

/** 与表 email_campaign_send_runs.status 一致 */
export type EmailCampaignSendRunStatus = "sending" | "completed" | "stopped" | "failed";

/** 与表 email_campaign_send_runs.trigger_source 一致 */
export type EmailCampaignSendRunTrigger = "lane_manual" | "page_manual" | "scheduler";

export type EmailCampaignSendRunRow = {
  id: number;
  campaign_id: number;
  tenant_id: number;
  round_no: number;
  status: EmailCampaignSendRunStatus;
  trigger_source: EmailCampaignSendRunTrigger;
  lane_index: number | null;
  smtp_profile_id: number | null;
  from_email: string | null;
  target_industries_json: string | null;
  planned_count: number;
  success_count: number;
  fail_count: number;
  started_at: Date | string;
  ended_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

/**
 * 防御式建表/补列：与 sql/071_email_campaign_send_runs.sql 对齐。
 * 未跑 migrate 时启动服务仍可写入 send_run（步骤 2 起使用）。
 */
export async function ensureEmailCampaignSendRunsSchema(db: Pool): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS email_campaign_send_runs (
       id BIGINT NOT NULL AUTO_INCREMENT,
       campaign_id BIGINT NOT NULL,
       tenant_id BIGINT NOT NULL,
       round_no INT UNSIGNED NOT NULL,
       status VARCHAR(32) NOT NULL DEFAULT 'sending',
       trigger_source VARCHAR(32) NOT NULL DEFAULT 'page_manual',
       lane_index INT NULL,
       smtp_profile_id BIGINT NULL,
       from_email VARCHAR(254) NULL,
       target_industries_json JSON NULL,
       planned_count INT UNSIGNED NOT NULL DEFAULT 0,
       success_count INT UNSIGNED NOT NULL DEFAULT 0,
       fail_count INT UNSIGNED NOT NULL DEFAULT 0,
       started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       ended_at TIMESTAMP NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uniq_campaign_round (campaign_id, round_no),
       KEY idx_send_run_campaign_started (campaign_id, started_at),
       KEY idx_send_run_tenant_started (tenant_id, started_at),
       KEY idx_send_run_status (status)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  const [colRows] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_sends' AND COLUMN_NAME = 'send_run_id'`
  );
  if ((colRows as Array<{ COLUMN_NAME: string }>).length === 0) {
    await db.query(
      `ALTER TABLE email_sends
         ADD COLUMN send_run_id BIGINT NULL COMMENT '所属发送轮次'
         AFTER campaign_id`
    );
  }

  const indexes: Array<{ name: string; ddl: string }> = [
    {
      name: "idx_email_sends_send_run_id",
      ddl: "CREATE INDEX idx_email_sends_send_run_id ON email_sends (send_run_id)"
    },
    {
      name: "idx_email_sends_campaign_send_run",
      ddl: "CREATE INDEX idx_email_sends_campaign_send_run ON email_sends (campaign_id, send_run_id)"
    }
  ];
  for (const idx of indexes) {
    const [idxRows] = await db.query(
      `SELECT 1 AS ok FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_sends' AND INDEX_NAME = ?`,
      [idx.name]
    );
    if ((idxRows as unknown[]).length === 0) {
      try {
        await db.query(idx.ddl);
      } catch (e) {
        console.warn(`[ensureEmailCampaignSendRunsSchema] ${idx.name}:`, (e as Error)?.message);
      }
    }
  }
}
