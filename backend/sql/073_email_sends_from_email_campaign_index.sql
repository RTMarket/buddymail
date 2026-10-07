-- 统计页按发信邮箱筛活动：加速 email_sends.from_email → campaign_id 反查
-- 大表建索引可能需数分钟；migrate 已加长 SESSION 超时。若仍断线，请在服务器 screen 内手动执行下方 CREATE INDEX 后再 INSERT schema_migrations。

SET @db = DATABASE();

SET @idx_from_email_campaign = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND INDEX_NAME = 'idx_email_sends_from_email_campaign') = 0,
    'CREATE INDEX idx_email_sends_from_email_campaign ON email_sends (from_email(191), campaign_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_from_email_campaign; EXECUTE st; DEALLOCATE PREPARE st;
