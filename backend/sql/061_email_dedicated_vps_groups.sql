/*
 * 061_email_dedicated_vps_groups.sql — R13
 *
 * 一组双机（Relay + PTR）= 一条 email_dedicated_vps_groups；
 * 多条 email_dedicated_servers（多域）可挂同一 vps_group_id。
 *
 * 现网：每个有专线记录的租户先建 group_index=1，并回填 vps_group_id。
 * 不删、不改 relay_* 等列（仍保留在行上，R15 再逐步收敛到组表）。
 */

SET @db = DATABASE();

CREATE TABLE IF NOT EXISTS email_dedicated_vps_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  group_index INT NOT NULL DEFAULT 1 COMMENT '租户内第几组双机，从 1 起',
  label VARCHAR(128) NULL COMMENT '运维备注，如 组 1 / LA 双机',
  relay_ip VARCHAR(45) NULL,
  ptr_ip VARCHAR(45) NULL,
  ptr_hostname VARCHAR(253) NULL,
  relay_vps_username VARCHAR(128) NULL,
  relay_vps_password_enc TEXT NULL,
  ptr_vps_username VARCHAR(128) NULL,
  ptr_vps_password_enc TEXT NULL,
  relay_ip_registered_at DATETIME NULL,
  ptr_ip_registered_at DATETIME NULL,
  relay_ip_renewal_due_at DATETIME NULL,
  ptr_ip_renewal_due_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_group_index (tenant_id, group_index),
  KEY idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_vps_group_id = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_dedicated_servers'
        AND COLUMN_NAME = 'vps_group_id') = 0,
    'ALTER TABLE email_dedicated_servers ADD COLUMN vps_group_id BIGINT NULL COMMENT ''FK → email_dedicated_vps_groups.id'' AFTER tenant_id, ADD KEY idx_vps_group (vps_group_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @col_vps_group_id; EXECUTE st; DEALLOCATE PREPARE st;

-- 每个租户至少一组（组 1）
INSERT INTO email_dedicated_vps_groups (tenant_id, group_index, label)
SELECT DISTINCT e.tenant_id, 1, '组 1'
FROM email_dedicated_servers e
WHERE e.status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM email_dedicated_vps_groups g
    WHERE g.tenant_id = e.tenant_id AND g.group_index = 1
  );

-- 用该租户最早一条非 cancelled 专线记录填充组级 IP/运维字段
UPDATE email_dedicated_vps_groups g
INNER JOIN email_dedicated_servers e ON e.id = (
  SELECT MIN(e2.id)
  FROM email_dedicated_servers e2
  WHERE e2.tenant_id = g.tenant_id AND e2.status <> 'cancelled'
)
SET
  g.relay_ip = NULLIF(TRIM(e.relay_ip), ''),
  g.ptr_ip = NULLIF(TRIM(e.ptr_ip), ''),
  g.ptr_hostname = NULLIF(TRIM(e.ptr_hostname), ''),
  g.relay_vps_username = NULLIF(TRIM(e.relay_vps_username), ''),
  g.relay_vps_password_enc = e.relay_vps_password_enc,
  g.ptr_vps_username = NULLIF(TRIM(e.ptr_vps_username), ''),
  g.ptr_vps_password_enc = e.ptr_vps_password_enc,
  g.relay_ip_registered_at = e.relay_ip_registered_at,
  g.ptr_ip_registered_at = e.ptr_ip_registered_at,
  g.relay_ip_renewal_due_at = e.relay_ip_renewal_due_at,
  g.ptr_ip_renewal_due_at = e.ptr_ip_renewal_due_at
WHERE g.group_index = 1;

-- 现网行挂到组 1
UPDATE email_dedicated_servers e
INNER JOIN email_dedicated_vps_groups g
  ON g.tenant_id = e.tenant_id AND g.group_index = 1
SET e.vps_group_id = g.id
WHERE e.status <> 'cancelled'
  AND (e.vps_group_id IS NULL OR e.vps_group_id = 0);
