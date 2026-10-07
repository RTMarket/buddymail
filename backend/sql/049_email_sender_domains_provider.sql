/*
 * 049_email_sender_domains_provider.sql
 *
 * 给 email_sender_domains 增加 provider 列，用于多通道（AWS SES / 腾讯云邮件推送 / 后续其他 ESP）。
 *
 * 设计：每条域名记录创建时确定使用哪个 provider，绑死不可变（DNS 记录跨厂商不能共用）。
 * 已有历史数据全部按 'aws_ses' 处理。
 */

SET @db = DATABASE();

SET @sql_provider = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sender_domains'
        AND COLUMN_NAME = 'provider') = 0,
    'ALTER TABLE email_sender_domains ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT ''aws_ses'' AFTER tenant_id',
    'SELECT 1'
  )
);
PREPARE st FROM @sql_provider; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE email_sender_domains
   SET provider = 'aws_ses'
 WHERE provider IS NULL OR provider = '';
