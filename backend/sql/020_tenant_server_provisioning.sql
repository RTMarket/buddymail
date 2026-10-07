-- 自备服务器部署：费用、表单、部署状态（CRM+邮件数据在客户侧时需先完成部署）
CREATE TABLE IF NOT EXISTS tenant_server_provisioning (
  tenant_id BIGINT PRIMARY KEY,
  deploy_fee_paid TINYINT(1) NOT NULL DEFAULT 0,
  deploy_fee_ref_code VARCHAR(32) NULL,
  deploy_status VARCHAR(32) NOT NULL DEFAULT 'none',
  server_public_ip VARCHAR(64) NULL,
  ssh_port INT NULL,
  ssh_user VARCHAR(64) NULL,
  ssh_secret_enc TEXT NULL,
  domain_name VARCHAR(255) NULL,
  mysql_creds_enc TEXT NULL,
  form_submitted_at DATETIME NULL,
  deploy_completed_at DATETIME NULL,
  deploy_notified_user_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
