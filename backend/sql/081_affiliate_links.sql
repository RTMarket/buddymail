-- 代理推广链接：点击统计、订单归因、佣金结算（独立部署 40% 一次性；SaaS 月付 20% 每笔）
CREATE TABLE IF NOT EXISTS affiliate_links (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  agent_nickname VARCHAR(128) NOT NULL DEFAULT '',
  agent_note TEXT NULL,
  started_on DATE NULL,
  landing_path VARCHAR(512) NOT NULL DEFAULT '/',
  disabled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_aff_slug (slug),
  KEY idx_aff_links_created (created_at)
);

CREATE TABLE IF NOT EXISTS affiliate_visits (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  link_id BIGINT NOT NULL,
  visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash VARCHAR(64) NULL,
  landing_path VARCHAR(512) NULL,
  referrer VARCHAR(1024) NULL,
  user_agent VARCHAR(512) NULL,
  KEY idx_aff_visit_link_time (link_id, visited_at),
  CONSTRAINT fk_aff_visit_link FOREIGN KEY (link_id) REFERENCES affiliate_links(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS affiliate_page_views (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  link_id BIGINT NOT NULL,
  path VARCHAR(512) NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aff_pv_link_time (link_id, viewed_at),
  CONSTRAINT fk_aff_pv_link FOREIGN KEY (link_id) REFERENCES affiliate_links(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS affiliate_pay_attributions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  link_id BIGINT NOT NULL,
  ref_code VARCHAR(32) NOT NULL,
  order_kind VARCHAR(32) NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_aff_attr_ref (ref_code),
  KEY idx_aff_attr_link (link_id),
  CONSTRAINT fk_aff_attr_link FOREIGN KEY (link_id) REFERENCES affiliate_links(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  link_id BIGINT NOT NULL,
  ref_code VARCHAR(32) NOT NULL,
  tenant_id BIGINT NULL,
  order_kind VARCHAR(32) NOT NULL,
  package_label VARCHAR(256) NOT NULL DEFAULT '',
  amount_cents INT NOT NULL DEFAULT 0,
  commission_rate_pct DECIMAL(5, 2) NOT NULL,
  commission_cents INT NOT NULL DEFAULT 0,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_aff_conv_ref (ref_code),
  KEY idx_aff_conv_link_paid (link_id, paid_at),
  CONSTRAINT fk_aff_conv_link FOREIGN KEY (link_id) REFERENCES affiliate_links(id) ON DELETE CASCADE
);
