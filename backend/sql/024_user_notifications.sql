-- 租户成员站内信（开通、部署、IP 到期提醒等）
CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  body_text TEXT NULL,
  link_path VARCHAR(255) NULL,
  meta_json JSON NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_un_user_unread (user_id, read_at, id),
  KEY idx_un_tenant (tenant_id, created_at)
);
