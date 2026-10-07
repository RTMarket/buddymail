-- 多租户 SES 通道接入：在 email_sends 上新增 provider / send_uuid 列，
-- 让 SNS 退信/投诉/送达回调可以用 send_uuid 精确反查到行（不依赖 SMTP MessageId）。
--
-- 设计要点：
--   * provider：标记本封邮件实际走的发送通道（smtp / ses / 兼容历史值）；
--     旧数据默认 'smtp'，避免现有报表口径变化。
--   * send_uuid：每封 SES 邮件随机一个 36 字符 UUIDv4（包含连字符），
--     作为 SES EmailTags 的 bss_send_id，SNS 通知里可读到。前端做活动详情下钻时
--     也按这个 id 关联 email_delivery_events.payload_json.bss_send_id。
--   * 同步在 email_delivery_events 加一列 send_uuid，供 SNS webhook 直接写入。
--     之前的 email_send_id（数字外键）保留，向前兼容。
--
-- 幂等：列/索引可能由 ensureEmailSendsProviderColumns 先创建，这里再做一次防御。

SET @db = DATABASE();

-- email_sends.provider
SET @col_provider = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND COLUMN_NAME = 'provider') = 0,
    "ALTER TABLE email_sends ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'smtp'",
    'SELECT 1'
  )
);
PREPARE st FROM @col_provider; EXECUTE st; DEALLOCATE PREPARE st;

-- email_sends.send_uuid
SET @col_uuid = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND COLUMN_NAME = 'send_uuid') = 0,
    'ALTER TABLE email_sends ADD COLUMN send_uuid VARCHAR(40) NULL',
    'SELECT 1'
  )
);
PREPARE st FROM @col_uuid; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx_uuid = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND INDEX_NAME = 'idx_email_sends_send_uuid') = 0,
    'CREATE UNIQUE INDEX idx_email_sends_send_uuid ON email_sends (send_uuid)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_uuid; EXECUTE st; DEALLOCATE PREPARE st;

-- email_sends.ses_sender_address_id（运行时存活：知道这封邮件出自哪个 SES sender）
SET @col_sa = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND COLUMN_NAME = 'ses_sender_address_id') = 0,
    'ALTER TABLE email_sends ADD COLUMN ses_sender_address_id BIGINT NULL',
    'SELECT 1'
  )
);
PREPARE st FROM @col_sa; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx_sa = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_sends'
        AND INDEX_NAME = 'idx_email_sends_ses_sender_address_id') = 0,
    'CREATE INDEX idx_email_sends_ses_sender_address_id ON email_sends (ses_sender_address_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_sa; EXECUTE st; DEALLOCATE PREPARE st;

-- email_delivery_events.send_uuid（与 email_sends.send_uuid 对齐，便于 SNS 直接关联）
SET @col_uuid2 = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_delivery_events'
        AND COLUMN_NAME = 'send_uuid') = 0,
    'ALTER TABLE email_delivery_events ADD COLUMN send_uuid VARCHAR(40) NULL',
    'SELECT 1'
  )
);
PREPARE st FROM @col_uuid2; EXECUTE st; DEALLOCATE PREPARE st;

SET @idx_uuid2 = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_delivery_events'
        AND INDEX_NAME = 'idx_delivery_send_uuid') = 0,
    'CREATE INDEX idx_delivery_send_uuid ON email_delivery_events (send_uuid)',
    'SELECT 1'
  )
);
PREPARE st FROM @idx_uuid2; EXECUTE st; DEALLOCATE PREPARE st;
