CREATE TABLE IF NOT EXISTS security_risk_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  ip VARCHAR(64) NULL,
  event_type VARCHAR(64) NOT NULL,
  path VARCHAR(512) NULL,
  score_delta INT NOT NULL DEFAULT 0,
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sre_user_created (user_id, created_at),
  KEY idx_sre_ip_created (ip, created_at),
  KEY idx_sre_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
