-- 营销活动「发送轮次」：同一 campaign_id 每次新的正式发送一条记录，round_no 从 1 自增。
-- email_sends.send_run_id 关联当次发送产生的投递行；历史数据保持 NULL。
--
-- 步骤 1 仅建表/加列，不改现有统计 SQL。
-- 幂等：列/索引/表可能由 ensureEmailCampaignSendRunsSchema 先创建。

SET @db = DATABASE();

-- ---------------------------------------------------------------------------
-- email_campaign_send_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_campaign_send_runs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  round_no INT UNSIGNED NOT NULL COMMENT '该活动下第几次正式发送，从 1 递增',
  status VARCHAR(32) NOT NULL DEFAULT 'sending' COMMENT 'sending|completed|stopped|failed',
  trigger_source VARCHAR(32) NOT NULL DEFAULT 'page_manual' COMMENT 'lane_manual|page_manual|scheduler',
  lane_index INT NULL COMMENT '混元多栏专线序号，可空',
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
  KEY idx_send_run_status (status),
  CONSTRAINT fk_send_run_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_send_run_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- email_sends.send_run_id
-- ---------------------------------------------------------------------------
SET @col_send_run = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND COLUMN_NAME = 'send_run_id') = 0,
    'ALTER TABLE email_sends ADD COLUMN send_run_id BIGINT NULL COMMENT ''所属发送轮次 email_campaign_send_runs.id'' AFTER campaign_id',
    'SELECT 1'
  )
);
PREPARE st FROM @col_send_run; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx_send_run = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND INDEX_NAME = 'idx_email_sends_send_run_id') = 0,
    'CREATE INDEX idx_email_sends_send_run_id ON email_sends (send_run_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_send_run; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx_camp_run = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND INDEX_NAME = 'idx_email_sends_campaign_send_run') = 0,
    'CREATE INDEX idx_email_sends_campaign_send_run ON email_sends (campaign_id, send_run_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_camp_run; EXECUTE st; DEALLOCATE PREPARE st;

-- 外键：删除轮次记录时保留 email_sends 行，仅清空 send_run_id
SET @fk_send_run = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND CONSTRAINT_NAME = 'fk_email_sends_send_run') = 0,
    'ALTER TABLE email_sends ADD CONSTRAINT fk_email_sends_send_run FOREIGN KEY (send_run_id) REFERENCES email_campaign_send_runs (id) ON DELETE SET NULL',
    'SELECT 1'
  )
);
PREPARE st FROM @fk_send_run; EXECUTE st; DEALLOCATE PREPARE st;
