-- 邮件合规与可观测（MVP）

CREATE TABLE IF NOT EXISTS email_unsubscribe_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  campaign_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NULL,
  user_agent TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_unsub_campaign_contact (campaign_id, contact_id),
  KEY idx_unsub_campaign_time (campaign_id, created_at),
  KEY idx_unsub_tenant_time (tenant_id, created_at)
);

CREATE TABLE IF NOT EXISTS email_delivery_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  campaign_id BIGINT NULL,
  contact_id BIGINT NULL,
  email VARCHAR(255) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NULL,
  provider_message_id VARCHAR(255) NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_delivery_campaign_time (campaign_id, created_at),
  KEY idx_delivery_type_time (event_type, created_at),
  KEY idx_delivery_tenant_time (tenant_id, created_at)
);

CREATE TABLE IF NOT EXISTS email_domain_auth_checks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  domain VARCHAR(255) NOT NULL,
  spf_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  dkim_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  dmarc_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  notes TEXT NULL,
  last_checked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_domain_auth_tenant (tenant_id)
);
