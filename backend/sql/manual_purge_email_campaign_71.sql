-- 一次性清理：营销活动 id=71 的发送与投递历史，并解除该活动所属租户的熔断快照。
-- 使用前请备份；在 mysql 客户端中执行：
--   mysql -h... -u... -p... your_database < backend/sql/manual_purge_email_campaign_71.sql
-- 或在客户端里 SOURCE 本文件。

SET NAMES utf8mb4;
SET @campaign_id = 71;

SELECT id, tenant_id, name, status, COALESCE(send_rounds_done, 0) AS send_rounds_done
  FROM email_campaigns WHERE id = @campaign_id;

START TRANSACTION;

/* 先按发送行删事件，再按活动 id 删孤儿事件 */
DELETE e FROM email_delivery_events e
 INNER JOIN email_sends s ON s.id = e.email_send_id
 WHERE s.campaign_id = @campaign_id;

DELETE FROM email_delivery_events WHERE campaign_id = @campaign_id;

DELETE FROM email_unsubscribe_events WHERE campaign_id = @campaign_id;

DELETE FROM email_sends WHERE campaign_id = @campaign_id;

UPDATE email_campaigns
   SET send_rounds_done = 0,
       next_run_at = NULL,
       status = CASE
         WHEN LOWER(COALESCE(status, '')) IN ('completed', 'sending', 'stopped') THEN 'paused'
         ELSE status
       END
 WHERE id = @campaign_id;

UPDATE tenant_send_tier t
 INNER JOIN email_campaigns c ON c.tenant_id = t.tenant_id AND c.id = @campaign_id
   SET t.is_suspended = 0,
       t.suspension_reason = NULL,
       t.suspended_at = NULL,
       t.circuit_window_floor_at = NOW(),
       t.recent_attempted_100 = 0,
       t.recent_bounce_100 = 0,
       t.recent_complaint_100 = 0,
       t.recent_attempted_1000 = 0,
       t.recent_bounce_1000 = 0,
       t.recent_complaint_1000 = 0,
       t.last_metric_refresh_at = NOW();

COMMIT;

SELECT 'done: campaign' AS step, id, tenant_id, status, COALESCE(send_rounds_done, 0) AS send_rounds_done
  FROM email_campaigns WHERE id = @campaign_id;
SELECT 'done: sends_remaining' AS step, COUNT(*) AS n FROM email_sends WHERE campaign_id = @campaign_id;
