-- Contact groups (user-defined); templates target one or many groups.
CREATE TABLE IF NOT EXISTS contact_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_contact_group_name (name)
);

CREATE TABLE IF NOT EXISTS email_template_groups (
  template_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  PRIMARY KEY (template_id, group_id),
  KEY idx_etg_group (group_id),
  CONSTRAINT fk_etg_template FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_etg_group FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
);

-- Idempotent column adds (safe if migrate runs multiple times)
SET @dbname = DATABASE();

SET @columnname = 'schedule_enabled';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN schedule_enabled TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'scheduled_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN scheduled_at DATETIME NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'signature_mode';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN signature_mode VARCHAR(16) NULL DEFAULT ''preset'''
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'signature_preset_key';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN signature_preset_key VARCHAR(64) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'signature_html';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN signature_html MEDIUMTEXT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
