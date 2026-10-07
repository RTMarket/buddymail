-- 专线双机运维登记：VPS 登录凭据（加密）、IP 首次登记时间、线下续费提醒日
ALTER TABLE email_dedicated_servers
  ADD COLUMN relay_vps_username VARCHAR(128) NULL COMMENT '发信机 SSH/面板登录名' AFTER ptr_hostname,
  ADD COLUMN relay_vps_password_enc TEXT NULL COMMENT '发信机登录密码（加密）' AFTER relay_vps_username,
  ADD COLUMN ptr_vps_username VARCHAR(128) NULL COMMENT 'PTR 机 SSH/面板登录名' AFTER relay_vps_password_enc,
  ADD COLUMN ptr_vps_password_enc TEXT NULL COMMENT 'PTR 机登录密码（加密）' AFTER ptr_vps_username,
  ADD COLUMN relay_ip_registered_at DATETIME NULL COMMENT '发信 IP 首次登记时间（运维续费参考）' AFTER ptr_vps_password_enc,
  ADD COLUMN ptr_ip_registered_at DATETIME NULL COMMENT 'PTR IP 首次登记时间' AFTER relay_ip_registered_at,
  ADD COLUMN relay_ip_renewal_due_at DATETIME NULL COMMENT '发信机 IP 线下续费到期提醒' AFTER ptr_ip_registered_at,
  ADD COLUMN ptr_ip_renewal_due_at DATETIME NULL COMMENT 'PTR 机 IP 线下续费到期提醒' AFTER relay_ip_renewal_due_at;
