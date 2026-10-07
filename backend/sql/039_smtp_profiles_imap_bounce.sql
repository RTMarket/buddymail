SET @dbname = DATABASE();
SET @tablename = 'smtp_profiles';

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_enabled') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER is_default'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_host') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_host VARCHAR(255) NULL AFTER imap_enabled'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_port') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_port INT NULL AFTER imap_host'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_secure') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_secure TINYINT(1) NOT NULL DEFAULT 1 AFTER imap_port'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_username') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_username VARCHAR(255) NULL AFTER imap_secure'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_password_enc') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_password_enc TEXT NULL AFTER imap_username'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'imap_mailbox') > 0,
    'SELECT 1',
    'ALTER TABLE smtp_profiles ADD COLUMN imap_mailbox VARCHAR(255) NULL AFTER imap_password_enc'
  )
);
PREPARE alterIfMissing FROM @preparedStatement;
EXECUTE alterIfMissing;
DEALLOCATE PREPARE alterIfMissing;

