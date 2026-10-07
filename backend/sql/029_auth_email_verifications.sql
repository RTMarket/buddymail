-- 注册邮箱验证码（腾讯云邮件推送等 SMTP 发送）
CREATE TABLE IF NOT EXISTS auth_email_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'register',
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_purpose_created (email(191), purpose, created_at),
  KEY idx_active_code (email(191), purpose, code, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
