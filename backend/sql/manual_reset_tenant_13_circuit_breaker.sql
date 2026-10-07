-- 一次性：将租户 #13 的自动熔断状态清零，统计窗口从「当前时刻」起重新累计。
-- 适用场景：用户 2415022172@qq.com（请以 tenant_members / users 核对实为 tenant_id=13）。
--
-- 与后端 adminResetSendCircuitWindowForRecalc(..., forceUnsuspend:true) 效果等价：
--   解除暂停、清空原因、自助解封次数归零、circuit_window_floor_at 推到 NOW()，
--   最近 100/1000 快照列归零（下一分钟定时任务或任意发送前扫描会再写回真实聚合）。
--
-- 执行前请备份；替换库名后：
--   mysql -h127.0.0.1 -uUSER -pPASS bss_db < backend/sql/manual_reset_tenant_13_circuit_breaker.sql

SET NAMES utf8mb4;

SET @tenant_id = 13;

/* 核对：该邮箱是否挂在 tenant 13（若有偏差请勿执行下面 UPDATE） */
SELECT u.id AS user_id, u.email, tm.tenant_id, tm.role, tm.status
  FROM users u
  JOIN tenant_members tm ON tm.user_id = u.id AND tm.status = 'active'
 WHERE u.email = '2415022172@qq.com';

SELECT tenant_id, is_suspended, suspension_reason, self_unsuspend_count, circuit_window_floor_at,
       recent_attempted_100, recent_bounce_100, recent_complaint_100,
       recent_attempted_1000, recent_bounce_1000, recent_complaint_1000
  FROM tenant_send_tier
 WHERE tenant_id = @tenant_id;

START TRANSACTION;

UPDATE tenant_send_tier
   SET is_suspended = 0,
       suspension_reason = NULL,
       suspended_at = NULL,
       self_unsuspend_count = 0,
       stability_streak_started_at = NOW(),
       circuit_window_floor_at = NOW(),
       recent_attempted_100 = 0,
       recent_bounce_100 = 0,
       recent_complaint_100 = 0,
       recent_attempted_1000 = 0,
       recent_bounce_1000 = 0,
       recent_complaint_1000 = 0,
       last_metric_refresh_at = NOW()
 WHERE tenant_id = @tenant_id;

COMMIT;

SELECT tenant_id, is_suspended, suspension_reason, self_unsuspend_count, circuit_window_floor_at,
       recent_attempted_100, recent_attempted_1000, last_metric_refresh_at
  FROM tenant_send_tier
 WHERE tenant_id = @tenant_id;
