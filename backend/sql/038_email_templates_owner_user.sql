SET @dbname = DATABASE();

SET @tablename = 'email_templates';
SET @columnname = 'owner_user_id';
SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
    'SELECT 1',
    'ALTER TABLE email_templates ADD COLUMN owner_user_id BIGINT NULL AFTER tenant_id'
  )
);
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @idxname = 'idx_email_templates_owner';
SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
    'SELECT 1',
    'ALTER TABLE email_templates ADD INDEX idx_email_templates_owner (owner_user_id)'
  )
);
PREPARE addIdxIfMissing FROM @preparedStatement;
EXECUTE addIdxIfMissing;
DEALLOCATE PREPARE addIdxIfMissing;
