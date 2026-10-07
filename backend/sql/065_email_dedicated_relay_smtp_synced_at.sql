-- 记录发信机 SSH SASL 同步时间（改管理端密码后清零）
SET @db := DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'relay_smtp_synced_at'
);
SET @sql := IF(
  @has_col = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN relay_smtp_synced_at DATETIME NULL COMMENT ''发信机 SASL SSH 同步时间'' AFTER dkim_public_key',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
