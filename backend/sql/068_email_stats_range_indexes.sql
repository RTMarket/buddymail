-- 租户日期范围统计 & 套餐期发送成功折线图：加速按活动+时间聚合

ALTER TABLE email_sends
  ADD INDEX idx_email_sends_campaign_created_status (campaign_id, created_at, status);

ALTER TABLE email_delivery_events
  ADD INDEX idx_ede_campaign_type_created (campaign_id, event_type, created_at);

ALTER TABLE email_campaigns
  ADD INDEX idx_email_campaigns_tenant (tenant_id);
