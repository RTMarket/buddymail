-- TikTok 爆款工具 · 续费单（关联插件安装编号或原激活码）
ALTER TABLE tiktok_tool_pay_intents
  ADD COLUMN renew_install_id VARCHAR(128) NULL AFTER valid_days,
  ADD COLUMN renew_license_key VARCHAR(64) NULL AFTER renew_install_id;
