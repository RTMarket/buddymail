-- 正式服务周期精确到测试通过时刻（DATETIME），不再仅用 CURDATE()
ALTER TABLE tenant_product_modules
  MODIFY COLUMN service_effective_start DATETIME NULL,
  MODIFY COLUMN service_effective_end DATETIME NULL;
