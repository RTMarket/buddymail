-- P2：租户删除发信域（status=deleted，释放名额，管理端保留统计）
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
    'rejected',
    'deleted'
  ) NOT NULL DEFAULT 'requested';

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'tenant_deleted_at'
);
SET @sql := IF(
  @has_col = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN tenant_deleted_at DATETIME NULL COMMENT ''租户删除发信域时间'' AFTER application_rejected_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
