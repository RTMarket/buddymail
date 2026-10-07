ALTER TABLE social_publish_items
  ADD COLUMN segment_index INT NOT NULL DEFAULT 0 AFTER queue_order,
  ADD COLUMN segment_total INT NOT NULL DEFAULT 1 AFTER segment_index,
  ADD COLUMN scheduled_publish_at DATETIME NULL AFTER published_at;

ALTER TABLE social_publish_items
  DROP INDEX uniq_social_platform_source;

ALTER TABLE social_publish_items
  ADD UNIQUE KEY uniq_social_platform_source_seg (platform, source_slug, segment_index);

ALTER TABLE social_publish_items
  ADD KEY idx_social_platform_scheduled (platform, status, scheduled_publish_at, segment_index);
