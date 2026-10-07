-- 独立部署 · 人工远程安装：扩展接入表单与预约时段

SET @dbname = DATABASE();

SET @columnname = 'deploy_fee_paid_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN deploy_fee_paid_at DATETIME NULL AFTER deploy_fee_ref_code'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'website_server_ip';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN website_server_ip VARCHAR(64) NULL AFTER server_public_ip'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'relay_ip';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN relay_ip VARCHAR(64) NULL AFTER website_server_ip'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'mail_ptr_ip';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN mail_ptr_ip VARCHAR(64) NULL AFTER relay_ip'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'vps_access_notes_enc';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN vps_access_notes_enc TEXT NULL AFTER mysql_creds_enc'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'remote_tool';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN remote_tool VARCHAR(32) NULL AFTER contact_whatsapp'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'remote_tool_account';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN remote_tool_account VARCHAR(255) NULL AFTER remote_tool'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'appointment_slot_1_start';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN appointment_slot_1_start DATETIME NULL AFTER remote_tool_account'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'appointment_slot_2_start';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN appointment_slot_2_start DATETIME NULL AFTER appointment_slot_1_start'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'admin_accepted_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN admin_accepted_at DATETIME NULL AFTER appointment_slot_2_start'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'admin_install_notes';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'tenant_server_provisioning' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE tenant_server_provisioning ADD COLUMN admin_install_notes TEXT NULL AFTER admin_accepted_at'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
