/*
 * 055_email_ultra_custom_applications.sql
 *
 * 超量邮箱配置：大客户定制申请（非自助 SES / 专线开通）。
 */

CREATE TABLE IF NOT EXISTS email_ultra_custom_applications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NULL,

  company_name VARCHAR(256) NOT NULL,
  contact_name VARCHAR(128) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  wechat VARCHAR(128) NOT NULL,
  feishu VARCHAR(128) NULL,
  telegram VARCHAR(128) NULL,

  daily_volume_band ENUM(
    '15-30万',
    '30-50万',
    '50-80万',
    '80-100万',
    '100万+'
  ) NOT NULL,

  domains_brands JSON NOT NULL,

  status ENUM('requested', 'contacted', 'in_progress', 'closed', 'cancelled')
    NOT NULL DEFAULT 'requested',

  admin_notes VARCHAR(1000) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_tenant_status (tenant_id, status),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
