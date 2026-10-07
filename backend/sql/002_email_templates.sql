CREATE TABLE IF NOT EXISTS email_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NULL,
  business_line VARCHAR(64) NULL,
  subject_template VARCHAR(512) NOT NULL,
  body_html MEDIUMTEXT NOT NULL,
  body_text MEDIUMTEXT NULL,
  font_stack VARCHAR(512) NOT NULL DEFAULT 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  assets_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_category (category),
  KEY idx_business_line (business_line)
);
