/*
 * 063 — R20：专线 provision 异步任务（queued / running / success / failed）
 */

CREATE TABLE IF NOT EXISTS email_dedicated_provision_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dedicated_server_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  status ENUM('queued', 'running', 'success', 'failed') NOT NULL DEFAULT 'queued',
  request_payload JSON NOT NULL COMMENT 'relay/ptr/dkim 等（不含明文 SMTP）',
  smtp_password_enc TEXT NULL COMMENT '管理员本次提交的 SMTP 密码（加密）；留空表示用租户 R26c 密码',
  result_payload JSON NULL,
  error_message TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_edpj_server_created (dedicated_server_id, created_at),
  KEY idx_edpj_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
