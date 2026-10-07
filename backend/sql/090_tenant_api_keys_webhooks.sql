-- Standalone Email API v1 · tenant API keys + webhook endpoints/deliveries

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  key_prefix VARCHAR(20) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes_json JSON NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_api_key_prefix (key_prefix),
  KEY idx_tenant_api_keys_tenant (tenant_id, revoked_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_webhook_endpoints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  url VARCHAR(1000) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  events_json JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_error TEXT NULL,
  last_delivered_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tenant_webhook_endpoints_tenant (tenant_id, enabled, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_webhook_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  endpoint_id BIGINT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload_json JSON NULL,
  attempts INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  next_retry_at DATETIME NULL,
  delivered_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenant_webhook_deliveries_endpoint (endpoint_id, status, created_at),
  KEY idx_tenant_webhook_deliveries_tenant (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
