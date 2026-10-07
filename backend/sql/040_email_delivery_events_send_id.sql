-- 退信与单次发送记录精确对齐（避免同一邮箱多活动下 campaign_id 误归属导致统计为 0）
-- 幂等：列/索引可能已由 ensureEmailDeliveryEventsSendIdColumn 先创建，避免重复执行报错

SET @db = DATABASE();

SET @col_sql = (
  SELECT IF(
    (SELECT COUNT(*)
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'email_delivery_events'
        AND COLUMN_NAME = 'email_send_id') = 0,
    'ALTER TABLE email_delivery_events ADD COLUMN email_send_id BIGINT NULL',
    'SELECT 1'
  )
);
PREPARE col_stmt FROM @col_sql;
EXECUTE col_stmt;
DEALLOCATE PREPARE col_stmt;

SET @idx_sql = (
  SELECT IF(
    (SELECT COUNT(*)
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'email_delivery_events'
        AND INDEX_NAME = 'idx_delivery_email_send_id') = 0,
    'CREATE INDEX idx_delivery_email_send_id ON email_delivery_events (email_send_id)',
    'SELECT 1'
  )
);
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

-- 尽力回填：按活动+收件人邮箱取该组合下最新一条发送 id（与旧版 IMAP 匹配逻辑一致）
UPDATE email_delivery_events e
INNER JOIN (
  SELECT MAX(s.id) AS mid, s.campaign_id AS cid, LOWER(TRIM(s.to_email)) AS em
  FROM email_sends s
  GROUP BY s.campaign_id, LOWER(TRIM(s.to_email))
) m
  ON m.cid = e.campaign_id AND m.em = LOWER(TRIM(e.email))
SET e.email_send_id = m.mid
WHERE e.event_type = 'bounced'
  AND e.email_send_id IS NULL
  AND e.campaign_id IS NOT NULL;
