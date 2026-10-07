-- 对外展示的 6 位活动编号（与自增 id 并存）
SET @dbname = DATABASE();

SET @columnname = 'campaign_code';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN campaign_code VARCHAR(6) NULL UNIQUE COMMENT ''6位活动编号'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
