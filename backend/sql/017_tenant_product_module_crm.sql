-- 为已有租户补充「客户新增与管理」产品模块（crm），月度价 3000 分（30 元）
-- 依赖 012_tenant_product_modules.sql

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
    'crm' AS module,
    'active' AS status,
    3000 AS monthly_price_cents,
    NOW() AS simulated_paid_at,
    CURDATE() AS period_start,
    DATE_ADD(CURDATE(), INTERVAL 1 MONTH) AS period_end
  FROM tenants t
) AS v
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  monthly_price_cents = VALUES(monthly_price_cents),
  simulated_paid_at = VALUES(simulated_paid_at),
  period_start = VALUES(period_start),
  period_end = VALUES(period_end),
  updated_at = CURRENT_TIMESTAMP;
