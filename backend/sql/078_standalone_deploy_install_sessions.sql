-- 独立部署 · 授权安装向导（协议、服务器信息、SSH 加密保留 7 天）

ALTER TABLE standalone_deploy_downloads
  ADD COLUMN install_completed_at DATETIME NULL AFTER downloaded_at;

CREATE TABLE IF NOT EXISTS standalone_deploy_install_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  ref_code VARCHAR(64) NOT NULL,
  download_id BIGINT UNSIGNED NULL,
  agreement_version VARCHAR(64) NOT NULL,
  agreed_at DATETIME NOT NULL,
  server_ready_json JSON NULL,
  server_host VARCHAR(255) NULL,
  ssh_port INT UNSIGNED NOT NULL DEFAULT 22,
  ssh_username VARCHAR(128) NULL,
  ssh_secret_enc TEXT NULL,
  domain_name VARCHAR(255) NULL,
  dns_ready TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'agreement',
  site_url VARCHAR(512) NULL,
  admin_account VARCHAR(32) NULL,
  admin_password_enc TEXT NULL,
  error_message TEXT NULL,
  secret_expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_standalone_install_ref_tenant (ref_code, tenant_id),
  KEY idx_standalone_install_tenant (tenant_id),
  KEY idx_standalone_install_secret_expires (secret_expires_at),
  KEY idx_standalone_install_download (download_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
