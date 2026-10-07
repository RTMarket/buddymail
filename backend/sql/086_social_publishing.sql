CREATE TABLE IF NOT EXISTS social_publish_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(32) NOT NULL,
  source_slug VARCHAR(256) NOT NULL,
  source_locale VARCHAR(16) NOT NULL DEFAULT 'en',
  source_path VARCHAR(1024) NOT NULL DEFAULT '',
  title VARCHAR(512) NOT NULL DEFAULT '',
  description TEXT NULL,
  canonical_url VARCHAR(1024) NOT NULL DEFAULT '',
  tracking_url VARCHAR(1200) NOT NULL DEFAULT '',
  tags_json TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  queue_order BIGINT NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  platform_article_id VARCHAR(128) NULL,
  platform_url VARCHAR(1024) NULL,
  devto_page_views INT NOT NULL DEFAULT 0,
  devto_public_reactions INT NOT NULL DEFAULT 0,
  devto_comments_count INT NOT NULL DEFAULT 0,
  devto_positive_reactions INT NOT NULL DEFAULT 0,
  devto_reading_time_minutes INT NOT NULL DEFAULT 0,
  last_stats_synced_at DATETIME NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_social_platform_source (platform, source_slug),
  KEY idx_social_platform_queue (platform, status, queue_order, id),
  KEY idx_social_platform_article (platform, platform_article_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE social_publish_items
  MODIFY COLUMN queue_order BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS social_platform_settings (
  platform VARCHAR(32) PRIMARY KEY,
  api_key_enc TEXT NULL,
  api_key_hint VARCHAR(32) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
