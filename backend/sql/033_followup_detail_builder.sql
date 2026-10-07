-- 客户跟进详情页（全局模板）与附件元数据
CREATE TABLE IF NOT EXISTS followup_detail_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '客户跟进详情',
  layout_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_followup_detail_template_tenant_user (tenant_id, user_id),
  KEY idx_followup_detail_template_tenant (tenant_id),
  CONSTRAINT fk_followup_detail_template_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_followup_detail_template_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS followup_detail_template_files (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  field_id VARCHAR(64) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  public_url VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_followup_detail_files_tenant_user (tenant_id, user_id),
  KEY idx_followup_detail_files_template (template_id),
  KEY idx_followup_detail_files_field (field_id),
  CONSTRAINT fk_followup_detail_files_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_followup_detail_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_followup_detail_files_template FOREIGN KEY (template_id) REFERENCES followup_detail_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
