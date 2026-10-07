-- AWS SES BYOD（用户自带域名/邮箱，平台方持有 SES 账号）相关表。
-- 整体架构与 smtp_profiles / sender_profiles 完全解耦：旧 SMTP 通道继续使用 smtp_profiles，
-- 新建立的"AWS SES 专用发件配置"使用 email_sender_domains + email_sender_addresses。
-- 兼容性策略：营销活动 email_campaigns 仍可绑定老 smtp_profile_id（旧通道），未来再新增
-- ses_sender_address_id 字段做新通道路由，本迁移先建好基础表。

-- ============================================================
-- 1. email_sender_domains : 用户在自家 DNS 完成 DKIM 校验后用作发件方的"域名"
--    一个租户可有多个域名（推荐子域名 mail.acme.com 用于群发，主域名留给事务邮件）
-- ============================================================
CREATE TABLE IF NOT EXISTS email_sender_domains (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  domain VARCHAR(253) NOT NULL,
  /** 当前总状态：pending=刚创建等用户加 DNS  verifying=已加 DNS 后台轮询中  verified=DKIM 通过
   *  failed=多次轮询失败/手动标记失败  deleted=逻辑删除（保留发送审计） */
  status ENUM('pending','verifying','verified','failed','deleted') NOT NULL DEFAULT 'pending',
  /** SES Identity 的 ARN（mock 模式下也写一个伪 ARN 占位，方便后续替换） */
  ses_identity_arn VARCHAR(500) NULL,
  /** SES 返回的 3 个 DKIM token，JSON array：["abc1","abc2","abc3"]，
   *  对应 CNAME：<token>._domainkey.<domain> -> <token>.dkim.amazonses.com */
  dkim_tokens_json JSON NULL,
  /** 自定义 MAIL FROM（可选，提升送达率） */
  mail_from_domain VARCHAR(253) NULL,
  /** DKIM 实际检测状态（独立显示，不与 status 合并） */
  dkim_status ENUM('unknown','pass','fail') NOT NULL DEFAULT 'unknown',
  /** SPF 推荐但非必须 */
  spf_status ENUM('unknown','pass','fail','missing') NOT NULL DEFAULT 'unknown',
  /** DMARC 推荐但非必须 */
  dmarc_status ENUM('unknown','pass','fail','missing') NOT NULL DEFAULT 'unknown',
  last_checked_at DATETIME NULL,
  verified_at DATETIME NULL,
  failure_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_domain (tenant_id, domain),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. email_sender_addresses : 挂在已验证域名下的"具体发件邮箱"
--    info@mail.acme.com / sales@mail.acme.com / 任意前缀
--    每个邮箱独立配 display_name + reply_to，发件人资料 sender_profiles 不变（向后兼容）
-- ============================================================
CREATE TABLE IF NOT EXISTS email_sender_addresses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  domain_id BIGINT NOT NULL,
  /** 完整邮箱地址（小写存储），例 info@mail.acme.com */
  from_email VARCHAR(320) NOT NULL,
  /** 收件人在客户端看到的发件人显示名，例 "Acme Sales" */
  display_name VARCHAR(128) NULL,
  /** 用户回复时邮件 To 字段的地址；可与 from_email 不同（例 sales@acme.com）。
   *  reply_to 不需要 SES 验证，仅用作收件方点"回复"的目标 */
  reply_to VARCHAR(320) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_email (tenant_id, from_email),
  KEY idx_domain (domain_id),
  KEY idx_tenant_default (tenant_id, is_default),
  CONSTRAINT fk_sender_addr_domain FOREIGN KEY (domain_id)
    REFERENCES email_sender_domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. ses_suppression_log : SES 抑制列表镜像 + 我们自己的抑制记录
--    AWS SES 自身有 account-level suppression list（hard bounce / complaint 自动加入）
--    我们这里既镜像 SES 的，也写入"租户主动加黑"，让租户级和平台级都能用
-- ============================================================
CREATE TABLE IF NOT EXISTS ses_suppression_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  /** NULL = 平台级（来自 SES 全局抑制列表，所有租户都不应再发） */
  tenant_id BIGINT NULL,
  email VARCHAR(320) NOT NULL,
  reason ENUM('hard_bounce','complaint','manual','spam_report') NOT NULL,
  /** 来源标识：ses_sns_webhook / ses_api_pull / admin_manual / tenant_manual */
  source VARCHAR(64) NOT NULL DEFAULT 'unknown',
  /** 完整事件（SES SNS 通知 raw payload，便于排查） */
  raw_event_json JSON NULL,
  /** 软删除：当用户从 SES 抑制列表移除时标记为 1，避免误发但保留审计 */
  removed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME NULL,
  KEY idx_tenant_email (tenant_id, email),
  KEY idx_email (email),
  KEY idx_reason (reason),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. tenant_send_tier : 租户发送等级 + 每日配额 + 健康度统计
--    新户初始 bronze（200/日），稳定 7 天升 silver（2000/日），稳定 30 天升 gold（10000/日），
--    付费高档 manual 升 platinum（不限/独立 IP）。
--    熔断/解封状态也记在这张表里，避免发送循环里反复 join。
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_send_tier (
  tenant_id BIGINT PRIMARY KEY,
  tier ENUM('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
  daily_limit INT NOT NULL DEFAULT 200,
  /** 累计稳定天数（自动按熔断引擎递增；若期间触发任意一次熔断，归零） */
  stable_days INT NOT NULL DEFAULT 0,
  /** 当前是否被熔断（自动或人工）；被熔断时 send 路由必须直接拒绝 */
  is_suspended TINYINT(1) NOT NULL DEFAULT 0,
  suspension_reason VARCHAR(500) NULL,
  suspended_at DATETIME NULL,
  /** 解封次数计数（业务侧"第一次自助、第二次人工"的判定依据） */
  self_unsuspend_count INT NOT NULL DEFAULT 0,
  /** 滚动窗口统计快照（熔断引擎每分钟刷新；前端展示这些字段，无需实时聚合） */
  recent_attempted_100 INT NOT NULL DEFAULT 0,
  recent_bounce_100 INT NOT NULL DEFAULT 0,
  recent_complaint_100 INT NOT NULL DEFAULT 0,
  recent_attempted_1000 INT NOT NULL DEFAULT 0,
  recent_bounce_1000 INT NOT NULL DEFAULT 0,
  recent_complaint_1000 INT NOT NULL DEFAULT 0,
  last_metric_refresh_at DATETIME NULL,
  /** 升级判定锚点：连续稳定起始时间，若期间被熔断则置 NULL 重新开始 */
  stability_streak_started_at DATETIME NULL,
  last_promoted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. email_campaigns 增列：ses_sender_address_id，标记本活动用 SES BYOD 通道
--    （旧 smtp_profile_id 保留，两个字段同时存在时优先级 ses_sender_address_id > smtp_profile_id）
-- ============================================================
SET @db = DATABASE();

SET @col_sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_campaigns'
        AND COLUMN_NAME = 'ses_sender_address_id') = 0,
    'ALTER TABLE email_campaigns ADD COLUMN ses_sender_address_id BIGINT NULL ',
    'SELECT 1'
  )
);
PREPARE col_stmt FROM @col_sql; EXECUTE col_stmt; DEALLOCATE PREPARE col_stmt;

SET @idx_sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_campaigns'
        AND INDEX_NAME = 'idx_ses_sender_address_id') = 0,
    'CREATE INDEX idx_ses_sender_address_id ON email_campaigns (ses_sender_address_id)',
    'SELECT 1'
  )
);
PREPARE idx_stmt FROM @idx_sql; EXECUTE idx_stmt; DEALLOCATE PREPARE idx_stmt;
