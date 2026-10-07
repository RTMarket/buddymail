CREATE TABLE IF NOT EXISTS tenant_ip_addon_orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  tier_id VARCHAR(64) NOT NULL,
  ref_code VARCHAR(64) NOT NULL,
  amount_cents INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  period_start DATE NULL,
  period_end DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tio_tenant (tenant_id, tier_id),
  UNIQUE KEY uk_tio_ref (ref_code)
);
