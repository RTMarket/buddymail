-- 管理端 SMTP 密码与 DKIM 公钥持久化（租户申请不再提交 SMTP 密码）
SET @db := DATABASE();

SET @has_admin_smtp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'admin_smtp_password_enc'
);
SET @sql_admin_smtp := IF(
  @has_admin_smtp = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN admin_smtp_password_enc TEXT NULL COMMENT ''管理端 SMTP 密码（加密）'' AFTER tenant_submitted_smtp_password_enc',
  'SELECT 1'
);
PREPARE stmt FROM @sql_admin_smtp;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dkim := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
     AND COLUMN_NAME = 'dkim_public_key'
);
SET @sql_dkim := IF(
  @has_dkim = 0,
  'ALTER TABLE email_dedicated_servers ADD COLUMN dkim_public_key VARCHAR(4096) NULL COMMENT ''DKIM 公钥 p= 段'' AFTER admin_smtp_password_enc',
  'SELECT 1'
);
PREPARE stmt FROM @sql_dkim;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
