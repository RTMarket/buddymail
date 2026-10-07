-- 独立部署 · 域名与 DNS 解析信息

SET @dbname = DATABASE();

SET @columnname = 'dns_provider';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN dns_provider VARCHAR(128) NULL AFTER domain_name'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'dns_access_notes_enc';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN dns_access_notes_enc TEXT NULL AFTER dns_provider'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
