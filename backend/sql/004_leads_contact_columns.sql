-- Optional columns for leads (search/import contact fields)
SET @dbname = DATABASE();

SET @columnname = 'contact_name';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'leads' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE leads ADD COLUMN contact_name VARCHAR(255) NULL AFTER company_name'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'job_title';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'leads' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE leads ADD COLUMN job_title VARCHAR(255) NULL AFTER contact_name'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'phone';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'leads' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE leads ADD COLUMN phone VARCHAR(64) NULL AFTER job_title'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

CREATE TABLE IF NOT EXISTS email_contact_groups (
  contact_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  PRIMARY KEY (contact_id, group_id),
  KEY idx_ecg_group (group_id),
  CONSTRAINT fk_ecg_contact FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ecg_group FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
);
