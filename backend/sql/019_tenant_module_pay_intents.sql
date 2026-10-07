-- 企业支付宝（或其它线下）收款：生成待对账单号，便于备注与后台人工/后续自动核销
CREATE TABLE IF NOT EXISTS tenant_module_pay_intents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  modules_csv VARCHAR(100) NOT NULL,
  amount_cents INT NOT NULL,
  ref_code VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tmpi_ref (ref_code),
  KEY idx_tmpi_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_tmpi_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
