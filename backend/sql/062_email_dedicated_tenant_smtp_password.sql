/*
 * 062 — R26c：租户在申请/新增发信域名时提交的 SMTP 密码（加密存库，仅 admin provision 使用）
 */

SET @db = DATABASE();

SET @col = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'tenant_submitted_smtp_password_enc') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN tenant_submitted_smtp_password_enc TEXT NULL COMMENT ''租户提交的 SMTP 密码（加密）'' AFTER reply_to',
    'SELECT 1'
  )
);
PREPARE st FROM @col; EXECUTE st; DEALLOCATE PREPARE st;
