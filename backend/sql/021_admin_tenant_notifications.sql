CREATE TABLE IF NOT EXISTS admin_tenant_notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  body_json JSON NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_notif_t (tenant_id, created_at),
  KEY idx_admin_notif_read (is_read, created_at)
);
