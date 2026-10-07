-- 独立部署安装包 · 付款后单次下载授权
CREATE TABLE IF NOT EXISTS standalone_deploy_downloads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pay_intent_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  ref_code VARCHAR(64) NOT NULL,
  checkout_tier_ids TEXT NOT NULL,
  plan_tier_id VARCHAR(64) NOT NULL,
  license_env TEXT NOT NULL,
  download_token VARCHAR(64) NOT NULL,
  downloaded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_standalone_deploy_pay_intent (pay_intent_id),
  UNIQUE KEY uk_standalone_deploy_token (download_token),
  UNIQUE KEY uk_standalone_deploy_ref_tenant (ref_code, tenant_id),
  KEY idx_standalone_deploy_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
