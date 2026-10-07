-- 博客 / 外链 UTM 营销归因（与 affiliate 并行；utm_source=blog 等）
ALTER TABLE site_visit_events
  ADD COLUMN utm_source VARCHAR(128) NULL AFTER user_id,
  ADD COLUMN utm_medium VARCHAR(128) NULL AFTER utm_source,
  ADD COLUMN utm_campaign VARCHAR(256) NULL AFTER utm_medium,
  ADD COLUMN utm_content VARCHAR(256) NULL AFTER utm_campaign;

CREATE TABLE IF NOT EXISTS marketing_user_attributions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT NULL,
  utm_source VARCHAR(128) NOT NULL DEFAULT '',
  utm_medium VARCHAR(128) NOT NULL DEFAULT '',
  utm_campaign VARCHAR(256) NOT NULL DEFAULT '',
  utm_content VARCHAR(256) NOT NULL DEFAULT '',
  landing_referrer VARCHAR(1024) NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_mkt_user (user_id),
  KEY idx_mkt_campaign_reg (utm_source, utm_campaign, registered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketing_pay_attributions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_code VARCHAR(32) NOT NULL,
  tenant_id BIGINT NULL,
  utm_source VARCHAR(128) NOT NULL DEFAULT '',
  utm_medium VARCHAR(128) NOT NULL DEFAULT '',
  utm_campaign VARCHAR(256) NOT NULL DEFAULT '',
  utm_content VARCHAR(256) NOT NULL DEFAULT '',
  order_kind VARCHAR(32) NOT NULL DEFAULT '',
  amount_cents INT NOT NULL DEFAULT 0,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_mkt_pay_ref (ref_code),
  KEY idx_mkt_pay_campaign (utm_campaign, paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
