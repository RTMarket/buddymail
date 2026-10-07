-- 支付宝 PC 支付：记录渠道与支付宝交易号
ALTER TABLE tenant_module_pay_intents
  ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'manual_qr' AFTER status,
  ADD COLUMN alipay_trade_no VARCHAR(64) NULL DEFAULT NULL AFTER provider;
