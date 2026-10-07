-- 精选客户跟进（个人版工作台；owner_user_id 预留给企业多员工归属）
CREATE TABLE IF NOT EXISTS crm_contact_followups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  contact_id BIGINT NOT NULL,
  follow_kind VARCHAR(16) NOT NULL DEFAULT 'short',
  stage VARCHAR(32) NOT NULL DEFAULT 'none',
  next_followup_at DATE NULL,
  last_note TEXT NULL,
  owner_user_id BIGINT NULL COMMENT '企业版：归属用户；个人版为 NULL',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_followup_contact (contact_id),
  KEY idx_next_followup (next_followup_at),
  KEY idx_follow_kind (follow_kind),
  KEY idx_stage (stage),
  KEY idx_owner (owner_user_id),
  CONSTRAINT fk_crm_followup_contact FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE CASCADE
);
