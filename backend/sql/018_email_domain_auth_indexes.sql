-- 多域名发信认证：email_domain_auth_checks 唯一约束由 (tenant_id) 改为 (tenant_id, domain)
-- 幂等：按 information_schema 判断后再 DROP / ADD，可重复执行。

-- 删除旧版「每租户一条」唯一索引（若存在且名为 uniq_domain_auth_tenant）
SET @idx_drop_name := 'uniq_domain_auth_tenant';
SET @idx_drop_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'email_domain_auth_checks'
    AND index_name = @idx_drop_name
);
SET @sql_drop := IF(@idx_drop_exists > 0,
  CONCAT('ALTER TABLE email_domain_auth_checks DROP INDEX ', @idx_drop_name),
  'SELECT 1'
);
PREPARE stmt_drop FROM @sql_drop;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

-- 新唯一键：同一租户 + 域名 唯一
SET @idx_add_uniq := 'uniq_domain_auth_tenant_domain';
SET @idx_add_uniq_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'email_domain_auth_checks'
    AND index_name = @idx_add_uniq
);
SET @sql_add_uniq := IF(@idx_add_uniq_exists > 0,
  'SELECT 1',
  'ALTER TABLE email_domain_auth_checks ADD UNIQUE KEY uniq_domain_auth_tenant_domain (tenant_id, domain)'
);
PREPARE stmt_add_uniq FROM @sql_add_uniq;
EXECUTE stmt_add_uniq;
DEALLOCATE PREPARE stmt_add_uniq;

SET @idx_add_tenant := 'idx_domain_auth_tenant';
SET @idx_add_tenant_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'email_domain_auth_checks'
    AND index_name = @idx_add_tenant
);
SET @sql_add_tenant := IF(@idx_add_tenant_exists > 0,
  'SELECT 1',
  'ALTER TABLE email_domain_auth_checks ADD KEY idx_domain_auth_tenant (tenant_id)'
);
PREPARE stmt_add_tenant FROM @sql_add_tenant;
EXECUTE stmt_add_tenant;
DEALLOCATE PREPARE stmt_add_tenant;

SET @idx_add_domain := 'idx_domain_auth_domain';
SET @idx_add_domain_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'email_domain_auth_checks'
    AND index_name = @idx_add_domain
);
SET @sql_add_domain := IF(@idx_add_domain_exists > 0,
  'SELECT 1',
  'ALTER TABLE email_domain_auth_checks ADD KEY idx_domain_auth_domain (domain)'
);
PREPARE stmt_add_domain FROM @sql_add_domain;
EXECUTE stmt_add_domain;
DEALLOCATE PREPARE stmt_add_domain;
