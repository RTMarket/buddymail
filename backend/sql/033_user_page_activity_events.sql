CREATE TABLE IF NOT EXISTS user_page_activity_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  path VARCHAR(512) NULL,
  nav_section VARCHAR(64) NULL,
  duration_sec INT NOT NULL DEFAULT 0,
  entered_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_upa_user_entered (user_id, entered_at),
  KEY idx_upa_entered (entered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
