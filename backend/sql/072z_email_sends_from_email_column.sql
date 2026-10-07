-- email_sends.from_email：统计页按发信邮箱筛活动；须在 073 建索引之前存在。
-- 主站 server 启动时 ensureEmailSendsFromEmailColumn 也会补列；全新库须靠本迁移。

SET @db = DATABASE();

SET @col_from_email = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND COLUMN_NAME = 'from_email') = 0,
    'ALTER TABLE email_sends ADD COLUMN from_email VARCHAR(320) NULL',
    'SELECT 1'
  )
);
PREPARE st FROM @col_from_email; EXECUTE st; DEALLOCATE PREPARE st;
