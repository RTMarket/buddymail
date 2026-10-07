-- 邮件套餐：记录 tierId 与每日群发上限（可重复执行）
SET @dbname = DATABASE();

SET @columnname = 'email_tier_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_product_modules' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_product_modules ADD COLUMN email_tier_id VARCHAR(64) NULL AFTER period_end'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'daily_send_limit';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_product_modules' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_product_modules ADD COLUMN daily_send_limit INT NULL AFTER email_tier_id'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
