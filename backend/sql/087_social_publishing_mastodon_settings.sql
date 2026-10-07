ALTER TABLE social_platform_settings
  ADD COLUMN instance_url VARCHAR(512) NULL AFTER api_key_hint;
