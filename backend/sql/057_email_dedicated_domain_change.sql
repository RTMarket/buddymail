-- 用户申请更换发件域名：待管理员审核后重新生成 DNS
ALTER TABLE email_dedicated_servers
  ADD COLUMN domain_change_status ENUM('none', 'pending_admin', 'rejected') NOT NULL DEFAULT 'none'
    COMMENT 'none=无换域申请; pending_admin=待审核; rejected=已驳回' AFTER admin_notes,
  ADD COLUMN pending_sender_domain VARCHAR(253) NULL AFTER domain_change_status,
  ADD COLUMN pending_from_name VARCHAR(128) NULL AFTER pending_sender_domain,
  ADD COLUMN pending_from_email VARCHAR(254) NULL AFTER pending_from_name,
  ADD COLUMN pending_reply_to VARCHAR(254) NULL AFTER pending_from_email,
  ADD COLUMN domain_change_requested_at DATETIME NULL AFTER pending_reply_to;
