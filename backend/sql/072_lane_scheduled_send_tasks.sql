-- 072_lane_scheduled_send_tasks.sql
-- 专线特定时间发送任务表
-- 每个租户每条专线最多 3 个待执行任务

CREATE TABLE IF NOT EXISTS lane_scheduled_send_tasks (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id      INT UNSIGNED NOT NULL,
  lane_index     TINYINT UNSIGNED NOT NULL COMMENT '专线索引（从 1 开始）',
  campaign_id    INT UNSIGNED DEFAULT NULL COMMENT '执行时自动分配的活动 ID；创建时为空',
  campaign_name  VARCHAR(255) NOT NULL COMMENT '创建时填写的活动名称',
  target_industries JSON NOT NULL COMMENT '发送目标行业标签数组',
  audience_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '目标行业人数',
  scheduled_at   DATETIME NOT NULL COMMENT '预定发送时间（北京时间 UTC+8）',
  status         ENUM('pending','running','completed','cancelled') NOT NULL DEFAULT 'pending',
  executed_at    DATETIME DEFAULT NULL COMMENT '实际开始执行时间',
  completed_at   DATETIME DEFAULT NULL COMMENT '实际完成时间',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tenant_lane_status (tenant_id, lane_index, status),
  INDEX idx_scheduled_at (scheduled_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
