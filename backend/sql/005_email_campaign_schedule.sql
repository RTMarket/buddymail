-- 邮件营销活动：定时发送、重复间隔、预计收件人数
SET @dbname = DATABASE();

SET @columnname = 'schedule_start_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN schedule_start_at DATETIME NULL COMMENT ''首次计划发送时间（可选）'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'repeat_every_days';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN repeat_every_days INT NOT NULL DEFAULT 0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'repeat_every_hours';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN repeat_every_hours INT NOT NULL DEFAULT 0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'next_run_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN next_run_at DATETIME NULL COMMENT ''下次定时发送时间'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'recipient_count';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN recipient_count INT NULL COMMENT ''保存时预计收件人数（去重）'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
