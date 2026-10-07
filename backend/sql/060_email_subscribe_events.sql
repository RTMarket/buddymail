-- 邮件订阅确认事件（收件人点击邮件内「订阅」链接）

CREATE TABLE IF NOT EXISTS email_subscribe_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  campaign_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NULL,
  user_agent TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sub_campaign_contact (campaign_id, contact_id),
  KEY idx_sub_campaign_time (campaign_id, created_at),
  KEY idx_sub_tenant_time (tenant_id, created_at)
);
