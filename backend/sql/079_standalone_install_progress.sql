-- 授权安装 · 进度与日志（第 3 步轮询）

ALTER TABLE standalone_deploy_install_sessions
  ADD COLUMN install_progress_json JSON NULL AFTER status,
  ADD COLUMN install_log_tail TEXT NULL AFTER install_progress_json,
  ADD COLUMN install_started_at DATETIME NULL AFTER install_log_tail,
  ADD COLUMN install_finished_at DATETIME NULL AFTER install_started_at;
