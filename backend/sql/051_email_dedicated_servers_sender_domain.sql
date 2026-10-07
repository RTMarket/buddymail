/*
 * 051_email_dedicated_servers_sender_domain.sql
 *
 * 给 email_dedicated_servers 加 sender_domain 列，记录用户在「申请邮件营销服务开通」
 * 弹窗里提交的发件域名（admin 后台凭这个为该用户的独立 VPS 配 PTR / DKIM / SPF / DMARC）。
 *
 * 与 email_sender_domains 表的关系：
 *  - email_sender_domains：用户在「发件域名」卡里自助走 SES BYOD 验证的域名（CNAME / TXT 自助加）
 *  - email_dedicated_servers.sender_domain：用户提交申请时填的"我希望的发件域名"，
 *    平台拿到独立 VPS 后会为该域名配置完整 DNS（PTR / SPF / DKIM / DMARC）
 *
 * 这两者可以相同（用户想用同一个域名走独立服务器），也可以不同。
 */

SET @db = DATABASE();

SET @sql_sender_domain = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'sender_domain') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN sender_domain VARCHAR(253) NULL AFTER label',
    'SELECT 1'
  )
);
PREPARE st FROM @sql_sender_domain; EXECUTE st; DEALLOCATE PREPARE st;
