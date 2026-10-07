/*
 * 045_tenant_send_tier_free_trial.sql
 *
 * 青铜免费档：自 free_trial_started_at 起连续 7 天可享受每日 200 封；期满后（未订阅付费套餐时）
 * daily_limit 由应用层算为 0，不可再免费群发，需购买邮件发送套餐。
 *
 * 老数据：用 created_at 作为试用开始时间，已注册超过 7 天的纯免费户会立即视为试用结束
 *（与产品「仅 7 天免费」一致；若需全员宽限可改 UPDATE 为 NOW()）。
 */

SET @db = DATABASE();

SET @sql_free_trial = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'free_trial_started_at') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN free_trial_started_at DATETIME NULL AFTER warmup_reset_count',
    'SELECT 1'
  )
);
PREPARE sft FROM @sql_free_trial; EXECUTE sft; DEALLOCATE PREPARE sft;

UPDATE tenant_send_tier
   SET free_trial_started_at = created_at
 WHERE free_trial_started_at IS NULL;
