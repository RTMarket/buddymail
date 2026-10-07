ALTER TABLE social_platform_settings
  ADD COLUMN config_json TEXT NULL AFTER instance_url;
