-- 090_lane_scheduled_tasks_failed_status.sql
-- Keep scheduled-task failures on the task itself, with a readable reason.

ALTER TABLE lane_scheduled_send_tasks
  MODIFY COLUMN status ENUM('pending','pending_confirm','running','completed','cancelled','failed')
  NOT NULL DEFAULT 'pending';

SET @bss_090_last_error := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'lane_scheduled_send_tasks'
     AND COLUMN_NAME = 'last_error'
);
SET @bss_090_sql := IF(
  @bss_090_last_error = 0,
  'ALTER TABLE lane_scheduled_send_tasks ADD COLUMN last_error TEXT NULL AFTER completed_at',
  'SELECT 1'
);
PREPARE bss_090_stmt FROM @bss_090_sql;
EXECUTE bss_090_stmt;
DEALLOCATE PREPARE bss_090_stmt;
