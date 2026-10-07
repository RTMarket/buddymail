-- 活动发送名单：按活动+联系人聚合与筛选

ALTER TABLE email_sends
  ADD INDEX idx_email_sends_campaign_contact (campaign_id, contact_id);

ALTER TABLE email_sends
  ADD INDEX idx_email_sends_campaign_status_contact (campaign_id, status, contact_id);
