-- 联系人 ↔ 分组（多对多），用于邮件营销按分组发信
CREATE TABLE IF NOT EXISTS email_contact_groups (
  contact_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  PRIMARY KEY (contact_id, group_id),
  KEY idx_ecg_group (group_id),
  CONSTRAINT fk_ecg_contact FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ecg_group FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
);

SET @dbname = DATABASE();

SET @columnname = 'template_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN template_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'target_group_ids';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_campaigns' AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN target_group_ids JSON NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
