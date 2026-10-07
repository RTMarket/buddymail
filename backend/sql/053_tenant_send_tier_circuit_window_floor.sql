/*
 * 053_tenant_send_tier_circuit_window_floor.sql
 *
 * 自助/人工解封后，熔断引擎仍按「全租户最近 N 封」统计，会把解封前的退信算进去，
 * 导致用户一解封又立刻被二次熔断。增加 circuit_window_floor_at：
 * 解封时设为 NOW()，滚动窗口聚合仅统计 created_at >= floor 的发件记录；
 * NULL 表示不按时间裁剪（与历史行为一致）。
 */

SET @db = DATABASE();

SET @sql_floor = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'circuit_window_floor_at') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN circuit_window_floor_at DATETIME NULL AFTER self_unsuspend_count',
    'SELECT 1'
  )
);
PREPARE scf FROM @sql_floor; EXECUTE scf; DEALLOCATE PREPARE scf;
