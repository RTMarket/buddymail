CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  seat_limit INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_slug (slug)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  nickname VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_email (email)
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_user (tenant_id, user_id),
  KEY idx_tm_tenant_role (tenant_id, role),
  CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  role VARCHAR(32) NOT NULL,
  access_token VARCHAR(128) NOT NULL,
  refresh_token VARCHAR(128) NOT NULL,
  access_expires_at DATETIME NOT NULL,
  refresh_expires_at DATETIME NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_access_token (access_token),
  UNIQUE KEY uniq_refresh_token (refresh_token),
  KEY idx_session_user_tenant (user_id, tenant_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  monthly_price_cents INT NOT NULL DEFAULT 0,
  leads_quota_monthly INT NOT NULL DEFAULT 500,
  copy_quota_monthly INT NOT NULL DEFAULT 200,
  image_quota_monthly INT NOT NULL DEFAULT 200,
  video_quota_monthly INT NOT NULL DEFAULT 80,
  seats_included INT NOT NULL DEFAULT 3,
  stripe_price_id VARCHAR(128) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plan_code (code)
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'trialing',
  billing_mode VARCHAR(32) NOT NULL DEFAULT 'stripe',
  stripe_customer_id VARCHAR(128) NULL,
  stripe_subscription_id VARCHAR(128) NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  trial_ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_subscription (tenant_id),
  KEY idx_sub_status (status),
  CONSTRAINT fk_sub_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  module VARCHAR(32) NOT NULL,
  action VARCHAR(64) NOT NULL,
  units INT NOT NULL DEFAULT 1,
  ref_id VARCHAR(128) NULL,
  meta_json JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usage_tenant_module_time (tenant_id, module, occurred_at),
  CONSTRAINT fk_usage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_provider_configs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  module VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  base_url VARCHAR(512) NULL,
  model VARCHAR(255) NULL,
  api_key_enc TEXT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  priority_rank INT NOT NULL DEFAULT 100,
  extra_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_provider_cfg (tenant_id, module, provider),
  KEY idx_provider_lookup (tenant_id, module, is_enabled, priority_rank),
  CONSTRAINT fk_provider_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NULL,
  actor_user_id BIGINT NULL,
  action VARCHAR(128) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_tenant_time (tenant_id, created_at),
  KEY idx_audit_actor_time (actor_user_id, created_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

SET @dbname = DATABASE();

SET @tablename = 'leads';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE leads ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'email_contacts';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_contacts ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'email_campaigns';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_campaigns ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'email_sends';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_sends ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'smtp_profiles';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE smtp_profiles ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'sender_profiles';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE sender_profiles ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'contact_groups';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE contact_groups ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'email_contact_groups';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_contact_groups ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'email_templates';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE email_templates ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @tablename = 'crm_contact_followups';
SET @columnname = 'tenant_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE crm_contact_followups ADD COLUMN tenant_id BIGINT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

INSERT INTO tenants (id, slug, name, status, seat_limit)
VALUES (1, 'default', 'Default Workspace', 'active', 50)
ON DUPLICATE KEY UPDATE name = VALUES(name), seat_limit = VALUES(seat_limit);

UPDATE leads SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE email_contacts SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE email_campaigns SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE email_sends SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE smtp_profiles SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE sender_profiles SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE contact_groups SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE email_contact_groups SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE email_templates SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE crm_contact_followups SET tenant_id = 1 WHERE tenant_id IS NULL;

ALTER TABLE leads MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE email_contacts MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE email_campaigns MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE email_sends MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE smtp_profiles MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE sender_profiles MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE contact_groups MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE email_contact_groups MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE email_templates MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE crm_contact_followups MODIFY COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;

INSERT INTO plans (id, code, name, monthly_price_cents, leads_quota_monthly, copy_quota_monthly, image_quota_monthly, video_quota_monthly, seats_included)
VALUES
  (1, 'standard', '标准版', 1999, 2000, 1000, 800, 200, 5),
  (2, 'advanced', '进阶版', 4999, 10000, 5000, 3000, 1000, 15),
  (3, 'premium', '高级版', 9999, 30000, 15000, 8000, 3000, 50)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  monthly_price_cents = VALUES(monthly_price_cents),
  seats_included = VALUES(seats_included);

INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_mode)
VALUES (1, 3, 'active', 'manual')
ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), status = VALUES(status);
