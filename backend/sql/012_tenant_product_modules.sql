-- 三大板块（租户级）开通状态：社交媒体 / 获客与管理 / 邮件与营销
-- 月度价默认 3000 分（30 元），模拟付款后写入有效期

CREATE TABLE IF NOT EXISTS tenant_product_modules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  module VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'inactive',
  monthly_price_cents INT NOT NULL DEFAULT 3000,
  simulated_paid_at DATETIME NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_module (tenant_id, module),
  KEY idx_tpm_tenant (tenant_id),
  CONSTRAINT fk_tpm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
