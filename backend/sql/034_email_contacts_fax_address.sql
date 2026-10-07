SET @col_fax_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_contacts'
    AND COLUMN_NAME = 'fax'
);
SET @sql_fax := IF(
  @col_fax_exists = 0,
  'ALTER TABLE email_contacts ADD COLUMN fax VARCHAR(64) NULL AFTER phone',
  'SELECT 1'
);
PREPARE stmt_fax FROM @sql_fax;
EXECUTE stmt_fax;
DEALLOCATE PREPARE stmt_fax;

SET @col_address_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_contacts'
    AND COLUMN_NAME = 'address'
);
SET @sql_address := IF(
  @col_address_exists = 0,
  'ALTER TABLE email_contacts ADD COLUMN address VARCHAR(1024) NULL AFTER fax',
  'SELECT 1'
);
PREPARE stmt_address FROM @sql_address;
EXECUTE stmt_address;
DEALLOCATE PREPARE stmt_address;
