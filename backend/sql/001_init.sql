CREATE TABLE IF NOT EXISTS smtp_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  secure TINYINT(1) NOT NULL DEFAULT 0,
  username VARCHAR(255) NOT NULL,
  password_enc TEXT NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sender_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  display_name VARCHAR(255) NOT NULL,
  website VARCHAR(512) NULL,
  phone VARCHAR(64) NULL,
  telegram VARCHAR(128) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_contacts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  company VARCHAR(255) NULL,
  country VARCHAR(128) NULL,
  industry VARCHAR(128) NULL,
  business_line VARCHAR(64) NULL,
  tags_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email (email),
  KEY idx_business_line (business_line),
  KEY idx_status (status)
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  business_line VARCHAR(64) NULL,
  subject VARCHAR(512) NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status (status)
);

CREATE TABLE IF NOT EXISTS email_sends (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT NOT NULL,
  contact_id BIGINT NULL,
  to_email VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  error TEXT NULL,
  provider_message_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_campaign (campaign_id),
  KEY idx_contact (contact_id),
  KEY idx_status (status),
  CONSTRAINT fk_email_sends_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_sends_contact FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_name VARCHAR(255) NULL,
  website VARCHAR(512) NULL,
  country VARCHAR(128) NULL,
  state VARCHAR(128) NULL,
  city VARCHAR(128) NULL,
  industry VARCHAR(128) NULL,
  primary_email VARCHAR(255) NULL,
  emails_json JSON NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'manual',
  search_query VARCHAR(512) NULL,
  email_status VARCHAR(32) NOT NULL DEFAULT 'unverified',
  email_reason VARCHAR(255) NULL,
  email_verified_at DATETIME NULL,
  email_meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_country (country),
  KEY idx_industry (industry),
  KEY idx_email_status (email_status),
  KEY idx_primary_email (primary_email)
);
