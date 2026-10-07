-- 部署方式（SaaS / 自备机）、意向下拉、联系方式（可重复执行）
SET @dbname = DATABASE();

SET @columnname = 'deployment_choice';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  "ALTER TABLE tenant_server_provisioning ADD COLUMN deployment_choice VARCHAR(16) NULL COMMENT 'saas|self_hosted' AFTER tenant_id"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'deploy_intent';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN deploy_intent VARCHAR(64) NULL AFTER deploy_status'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'contact_wechat';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_wechat VARCHAR(128) NULL AFTER mysql_creds_enc'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'contact_telegram';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_telegram VARCHAR(128) NULL AFTER contact_wechat'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'contact_whatsapp';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN contact_whatsapp VARCHAR(128) NULL AFTER contact_telegram'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
