-- 区分用户自建通道与后台代配的官方防封通道；官方通道前端只读（可重复执行，避免 ER_DUP_FIELDNAME）
SET @dbname = DATABASE();

SET @columnname = 'managed_by';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_outbound_ip_pools' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_outbound_ip_pools ADD COLUMN managed_by VARCHAR(16) NOT NULL DEFAULT ''user'' AFTER tenant_id'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'period_start';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_outbound_ip_pools' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_outbound_ip_pools ADD COLUMN period_start DATE NULL AFTER managed_by'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'period_end';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_outbound_ip_pools' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_outbound_ip_pools ADD COLUMN period_end DATE NULL AFTER period_start'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'package_label';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_outbound_ip_pools' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_outbound_ip_pools ADD COLUMN package_label VARCHAR(128) NULL AFTER period_end'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
