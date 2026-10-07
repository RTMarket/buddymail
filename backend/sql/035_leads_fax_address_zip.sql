SET @col_fax_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads'
    AND COLUMN_NAME = 'fax'
);
SET @sql_fax := IF(
  @col_fax_exists = 0,
  'ALTER TABLE leads ADD COLUMN fax VARCHAR(64) NULL AFTER phone',
  'SELECT 1'
);
PREPARE stmt_fax FROM @sql_fax;
EXECUTE stmt_fax;
DEALLOCATE PREPARE stmt_fax;

SET @col_address_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads'
    AND COLUMN_NAME = 'address'
);
SET @sql_address := IF(
  @col_address_exists = 0,
  'ALTER TABLE leads ADD COLUMN address VARCHAR(1024) NULL AFTER city',
  'SELECT 1'
);
PREPARE stmt_address FROM @sql_address;
EXECUTE stmt_address;
DEALLOCATE PREPARE stmt_address;

SET @col_zip_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads'
    AND COLUMN_NAME = 'zip'
);
SET @sql_zip := IF(
  @col_zip_exists = 0,
  'ALTER TABLE leads ADD COLUMN zip VARCHAR(32) NULL AFTER state',
  'SELECT 1'
);
PREPARE stmt_zip FROM @sql_zip;
EXECUTE stmt_zip;
DEALLOCATE PREPARE stmt_zip;
