-- 发件设置：即时(1轮) / 循环(1-5轮)，轮次计数
SET @dbname = DATABASE();

SET @columnname = 'send_mode';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN send_mode VARCHAR(16) NOT NULL DEFAULT ''immediate'' COMMENT ''immediate=即时1轮 recurring=循环多轮'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'send_rounds_total';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN send_rounds_total TINYINT NOT NULL DEFAULT 1'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'send_rounds_done';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN send_rounds_done INT NOT NULL DEFAULT 0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
