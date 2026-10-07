-- 支付宝 PC 下单时锁定的应付人民币金额（与异步通知 total_amount 校验一致）
ALTER TABLE tenant_module_pay_intents
  ADD COLUMN alipay_total_yuan VARCHAR(32) NULL DEFAULT NULL AFTER amount_cents;
