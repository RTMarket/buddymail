-- P1：首次发信域申请驳回（status=rejected + 租户可见原因）
SET @db := DATABASE();

ALTER TABLE email_dedicated_servers
  MODIFY COLUMN status ENUM(
    'requested',
    'provisioning',
    'awaiting_dns',
    'ready',
    'paused',
    'failed',
    'cancelled',
    'rejected'
  ) NOT NULL DEFAULT 'requested';

SET @has_reason := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'application_rejection_reason'
);
SET @sql := IF(
  @has_reason = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN application_rejection_reason VARCHAR(500) NULL COMMENT ''首次申请驳回原因（租户可见）'' AFTER admin_notes',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'application_rejected_at'
);
SET @sql := IF(
  @has_at = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN application_rejected_at DATETIME NULL COMMENT ''首次申请驳回时间'' AFTER application_rejection_reason',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
