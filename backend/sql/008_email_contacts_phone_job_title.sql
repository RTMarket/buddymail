-- 邮件联系人：电话、职位（与 Leads / 快速新增一致）
SET @dbname = DATABASE();

SET @columnname = 'phone';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_contacts' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_contacts ADD COLUMN phone VARCHAR(64) NULL AFTER industry'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'job_title';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_contacts' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_contacts ADD COLUMN job_title VARCHAR(255) NULL AFTER phone'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
