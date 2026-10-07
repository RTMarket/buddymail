/*
 * 064 — R21：专线 provision SSH 自动化审计（仅 superadmin 操作，不含明文密码）
 */

CREATE TABLE IF NOT EXISTS email_dedicated_provision_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dedicated_server_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NULL,
  job_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  detail_json JSON NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_edpal_server_created (dedicated_server_id, created_at),
  KEY idx_edpal_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
