CREATE TABLE IF NOT EXISTS admin_user_deletion_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  nickname VARCHAR(255) NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(64) NOT NULL DEFAULT 'admin',
  KEY idx_admin_user_deletion_log_time (deleted_at),
  KEY idx_admin_user_deletion_log_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
