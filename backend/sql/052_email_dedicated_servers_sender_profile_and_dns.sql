/*
 * 052_email_dedicated_servers_sender_profile_and_dns.sql
 *
 * 给 email_dedicated_servers 表追加 4 列，承载用户提交开通申请时填的
 * 「发件人资料」与平台后台部署完成后回填的「DNS 记录推送清单」。
 *
 * 字段：
 *   - from_name     :  默认发件人显示名（如「BigSocialBoss 运营组」）
 *   - from_email    :  默认发件邮箱（如 marketing@yourcompany.com）
 *   - reply_to      :  默认回信地址（可与 from_email 不同）
 *   - dns_records   :  JSON 数组，平台部署完后由 admin 写入；
 *                      用户在前端「DNS 记录」区域看到列表并去自家 DNS 后台
 *                      复制粘贴，添加完毕后点「验证」让后台用 DNS lookup 校验。
 *                      结构：[{ host, type, value, verified, note? }]
 *
 * 为什么用 JSON 列而非新建一张表：
 *   - 单条申请的 DNS 记录数量小（通常 3–5 条：SPF / DKIM*1 / DMARC，
 *     MX 由用户自行决定是否需要 inbound）
 *   - 这些记录只跟该条申请绑定，无跨记录查询需求
 *   - 用 JSON 列让 admin 端可以一次性覆盖式写入（admin 在后台粘贴完
 *     整 JSON 即可），不必维护额外的 CRUD 接口
 */

SET @db = DATABASE();

SET @col_from_name = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'from_name') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN from_name VARCHAR(128) NULL AFTER sender_domain',
    'SELECT 1'
  )
);
PREPARE st FROM @col_from_name; EXECUTE st; DEALLOCATE PREPARE st;

SET @col_from_email = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'from_email') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN from_email VARCHAR(254) NULL AFTER from_name',
    'SELECT 1'
  )
);
PREPARE st FROM @col_from_email; EXECUTE st; DEALLOCATE PREPARE st;

SET @col_reply_to = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'reply_to') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN reply_to VARCHAR(254) NULL AFTER from_email',
    'SELECT 1'
  )
);
PREPARE st FROM @col_reply_to; EXECUTE st; DEALLOCATE PREPARE st;

SET @col_dns = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'dns_records') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN dns_records JSON NULL AFTER reply_to',
    'SELECT 1'
  )
);
PREPARE st FROM @col_dns; EXECUTE st; DEALLOCATE PREPARE st;
