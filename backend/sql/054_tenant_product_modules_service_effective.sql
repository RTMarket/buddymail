-- 邮件套餐：付款时间（simulated_paid_at）与正式服务周期（测试通过或巨量付款当日）分离
ALTER TABLE tenant_product_modules
  ADD COLUMN service_effective_start DATE NULL
    COMMENT '套餐正式生效日（中量：首次测试通过；巨量：付款当日）'
    AFTER period_end,
  ADD COLUMN service_effective_end DATE NULL
    COMMENT '套餐正式到期日'
    AFTER service_effective_start;
