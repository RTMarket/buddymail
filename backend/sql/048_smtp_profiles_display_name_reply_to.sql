-- 把"显示名 / 回信地址"内嵌到 SMTP 邮箱本身，去掉对独立 sender_profiles 的强依赖。
--
-- 背景：
--   * 在多租户 SES 通道里，每个 ses_sender_addresses 已经自带 display_name + reply_to。
--   * 老 SMTP 通道的 smtp_profiles 没有这两个字段，必须搭配独立的 sender_profiles 才能
--     在邮件 From / Reply-To 头里写显示名与回信邮箱。这就导致了"邮件配置页"上
--     需要同时维护「邮件服务商配置」（smtp_profiles）和「发件人资料」（sender_profiles），
--     用户体验割裂。
--   * 本迁移为 smtp_profiles 加上 display_name / reply_to，让 SMTP 邮箱跟 SES 邮箱
--     设计对齐，从而前端可以下掉「发件人资料」卡。
--
-- 兼容性：
--   * 两列均为 NULL，不影响存量数据；存量 SMTP 邮箱会回退到旧逻辑（继续读 sender_profiles）。
--   * 路由侧改为：smtp.display_name 优先，再回退 sender.display_name；reply_to 同理。
--
-- 幂等：使用 information_schema 探测，列已存在则跳过。

SET @db = DATABASE();

SET @col_display_name = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'smtp_profiles'
        AND COLUMN_NAME = 'display_name') = 0,
    'ALTER TABLE smtp_profiles ADD COLUMN display_name VARCHAR(255) NULL AFTER from_email',
    'SELECT 1'
  )
);
PREPARE st FROM @col_display_name; EXECUTE st; DEALLOCATE PREPARE st;

SET @col_reply_to = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'smtp_profiles'
        AND COLUMN_NAME = 'reply_to') = 0,
    'ALTER TABLE smtp_profiles ADD COLUMN reply_to VARCHAR(255) NULL AFTER display_name',
    'SELECT 1'
  )
);
PREPARE st FROM @col_reply_to; EXECUTE st; DEALLOCATE PREPARE st;
