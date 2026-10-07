-- TikTok 爆款视频工具 · 支付宝付款 + License 激活
CREATE TABLE IF NOT EXISTS tiktok_tool_pay_intents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  ref_code VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  alipay_total_yuan DECIMAL(10, 2) NOT NULL,
  max_devices TINYINT UNSIGNED NOT NULL DEFAULT 1,
  valid_days INT UNSIGNED NOT NULL DEFAULT 31,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  provider VARCHAR(16) NULL,
  alipay_trade_no VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  UNIQUE KEY uk_tiktok_tool_pay_ref (ref_code),
  KEY idx_tiktok_tool_pay_tenant (tenant_id),
  KEY idx_tiktok_tool_pay_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tiktok_tool_licenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  license_key VARCHAR(64) NOT NULL,
  pay_intent_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  max_devices TINYINT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tiktok_tool_license_key (license_key),
  KEY idx_tiktok_tool_license_tenant (tenant_id),
  KEY idx_tiktok_tool_license_pay_intent (pay_intent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tiktok_tool_device_activations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  license_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tiktok_tool_device (license_id, device_id),
  KEY idx_tiktok_tool_device_license (license_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
