SET @dbname = DATABASE();

SET @uniq_idx = (
  SELECT INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'email_contacts'
    AND NON_UNIQUE = 0
    AND COLUMN_NAME = 'email'
  LIMIT 1
);

SET @drop_sql = IF(
  @uniq_idx IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE email_contacts DROP INDEX ', @uniq_idx)
);
PREPARE dropIfExists FROM @drop_sql;
EXECUTE dropIfExists;
DEALLOCATE PREPARE dropIfExists;

SET @idx_name = 'idx_email_contacts_tenant_email';
SET @add_idx_sql = (
  SELECT IF(
    (SELECT COUNT(*)
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = 'email_contacts'
        AND INDEX_NAME = @idx_name) > 0,
    'SELECT 1',
    'ALTER TABLE email_contacts ADD INDEX idx_email_contacts_tenant_email (tenant_id, email)'
  )
);
PREPARE addIdxIfMissing FROM @add_idx_sql;
EXECUTE addIdxIfMissing;
DEALLOCATE PREPARE addIdxIfMissing;
