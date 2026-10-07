-- 为已有租户一次性开通各功能板块（演示期默认全开；后续可按业务改回「未开通」）
-- 依赖 012_tenant_product_modules.sql 已执行
--
-- 注意：INSERT ... SELECT ... FROM ... JOIN ... 后直接写 ON DUPLICATE KEY UPDATE 时，
-- 部分 MySQL 版本会把 ON 误解析成 JOIN 的 ON 条件（ER_PARSE_ERROR）。
-- 用外层 SELECT 包一层即可避免。

INSERT INTO tenant_product_modules (tenant_id, module, status, monthly_price_cents, simulated_paid_at, period_start, period_end)
SELECT
  v.tenant_id,
  v.module,
  v.status,
  v.monthly_price_cents,
  v.simulated_paid_at,
  v.period_start,
  v.period_end
FROM (
  SELECT
    t.id AS tenant_id,
    m.module,
    'active' AS status,
    3000 AS monthly_price_cents,
    NOW() AS simulated_paid_at,
    CURDATE() AS period_start,
    DATE_ADD(CURDATE(), INTERVAL 1 MONTH) AS period_end
  FROM tenants t
  CROSS JOIN (
    SELECT 'social' AS module
    UNION ALL SELECT 'leads'
    UNION ALL SELECT 'crm'
    UNION ALL SELECT 'email'
  ) m
) AS v
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  monthly_price_cents = VALUES(monthly_price_cents),
  simulated_paid_at = VALUES(simulated_paid_at),
  period_start = VALUES(period_start),
  period_end = VALUES(period_end),
  updated_at = CURRENT_TIMESTAMP;
