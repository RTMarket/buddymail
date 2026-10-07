-- 加速按联系人批量清理投递事件（退回/失败名单删除）

ALTER TABLE email_delivery_events
  ADD INDEX idx_delivery_tenant_contact (tenant_id, contact_id);
