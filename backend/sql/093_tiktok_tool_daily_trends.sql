-- TikTok 爆款工具 · 服务端日更热榜（Creative Center 同步）
CREATE TABLE IF NOT EXISTS tiktok_tool_daily_trends (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trend_date DATE NOT NULL,
  kind VARCHAR(16) NOT NULL COMMENT 'hashtag|music|category',
  region VARCHAR(8) NOT NULL DEFAULT 'US',
  rank_pos SMALLINT UNSIGNED NOT NULL,
  external_id VARCHAR(128) NULL,
  title VARCHAR(512) NOT NULL,
  subtitle VARCHAR(512) NULL,
  metric_bigint BIGINT UNSIGNED NULL,
  metric_label VARCHAR(32) NULL,
  meta_json JSON NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tiktok_daily_trend (trend_date, kind, region, rank_pos),
  KEY idx_tiktok_daily_kind_date (kind, trend_date, region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
