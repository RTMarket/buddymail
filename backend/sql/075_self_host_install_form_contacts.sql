-- 独立部署 · 人工安装需求单：联系邮箱 / 手机 / LinkedIn

SET @dbname = DATABASE();

SET @columnname = 'contact_email';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_email VARCHAR(255) NULL AFTER contact_whatsapp'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'phone_country_code';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN phone_country_code VARCHAR(8) NULL AFTER contact_email'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'contact_phone';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_phone VARCHAR(32) NULL AFTER phone_country_code'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'contact_linkedin';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_linkedin VARCHAR(512) NULL AFTER contact_phone'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
