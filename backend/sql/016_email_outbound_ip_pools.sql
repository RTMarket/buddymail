-- 发信通道设置 - IP 池管理（代理/出口 IP）
-- 说明：
-- - direct：不走代理（本机直连/服务器出口 IP）
-- - http：HTTP 代理（CONNECT）转发 SMTP 连接
-- - socks5：SOCKS5 代理转发 SMTP 连接

CREATE TABLE IF NOT EXISTS email_outbound_ip_pools (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  label VARCHAR(64) NULL,
  type VARCHAR(16) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  username VARCHAR(255) NULL,
  password_enc TEXT NULL,
  is_enabled TINYINT NOT NULL DEFAULT 1,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_outbound_pool_tenant (tenant_id, is_enabled, last_used_at),
  KEY idx_outbound_pool_type (type),
  CONSTRAINT chk_outbound_pool_type CHECK (type IN ('direct','http','socks5'))
);

