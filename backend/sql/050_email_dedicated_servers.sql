/*
 * 050_email_dedicated_servers.sql
 *
 * 「独立发信服务器（独立 IP）」业务模块。
 *
 * 产品定位：平台为高发量客户代购 / 代管一台独立 VPS，每台独享公网 IP，
 *  避免共享 IP 池信誉污染。
 *
 * 关键架构：
 *  - 用户在前端提交申请 → status='requested'
 *  - 平台管理员人工分配 / 部署服务器（Postfix + DKIM + Rspamd 等）→ status='provisioning'
 *  - 部署完成后管理员在 smtp_profiles 创建一条对应 SMTP 记录，回填 smtp_profile_id
 *    → email_dedicated_servers.status='ready'
 *    → smtp_profiles.dedicated_server_id 也会被回填，营销活动选这条 SMTP 即走独立服务器
 *  - 营销活动 / 退信统计沿用现有 smtp_profiles 链路，零改造
 *
 * 与 $199 一次性「自备服务器独立部署」档的区别：
 *  - $199 一次性：用户自己买服务器 + 一次性部署费，BillionMail 模式私有部署
 *  - 月付独立 IP：平台代购 + 代管，跟用户当前邮件发送套餐（白银 ~ 传说）绑定
 */

SET @db = DATABASE();

-- ============================================================
-- 1. 主表：每个租户的独立发信服务器记录
-- ============================================================
CREATE TABLE IF NOT EXISTS email_dedicated_servers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,

  /** 用户给的标签，例 "主营销服务器" / "海外活动 A" */
  label VARCHAR(128) NOT NULL,

  /** 与该服务器绑定的邮件发送套餐 tierId（如 'email-send-1000'）。可空 = 用户当前未订阅，需先订阅再分配。 */
  subscription_tier_id VARCHAR(64) NULL,

  /** 状态流转：
   *    requested      用户已提交申请，等待平台分配（必经第一步）
   *    provisioning   平台已确认申请，正在采购 / 部署服务器
   *    awaiting_dns   服务器装好了，等用户在自己域名 DNS 加 PTR / SPF / DKIM 等记录
   *    ready          一切就绪，营销活动可走这台机器发件
   *    paused         临时停用（用户欠费 / 投诉率过高 / 主动暂停）
   *    failed         分配 / 部署失败，需要平台介入
   *    cancelled      用户取消申请（仅 requested 状态可自助取消）
   */
  status ENUM('requested','provisioning','awaiting_dns','ready','paused','failed','cancelled')
    NOT NULL DEFAULT 'requested',

  /** 公网 IPv4，平台分配完才有 */
  ip_address VARCHAR(45) NULL,
  /** 主机名 / PTR 反向解析，例 mail1.bigsocialboss.com */
  hostname VARCHAR(253) NULL,
  /** 机房 / 区域，便于客户支持，例 "US-West / Vultr" */
  region VARCHAR(64) NULL,

  /** 部署完成后，平台在 smtp_profiles 创建一条对应记录，回填这里。
   *  营销活动选这条 SMTP profile 即走独立服务器；统计、退信沿用现有逻辑 */
  smtp_profile_id BIGINT NULL,

  /** 用户备注：期望区域、发送场景等，提交申请时填 */
  notes_from_user VARCHAR(500) NULL,
  /** 平台内部备注：分配进度、备忘等，仅 admin 可见 */
  admin_notes VARCHAR(500) NULL,

  /** 计费起算时间：服务器 ready 之日起 */
  billing_started_at DATETIME NULL,
  /** 当前计费周期结束时间，到期前需续费；为 NULL 时由月套餐自动续费驱动 */
  billing_period_end_at DATETIME NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_tenant_status (tenant_id, status),
  KEY idx_status (status),
  KEY idx_smtp_profile (smtp_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. smtp_profiles 加 dedicated_server_id 列：标记该 SMTP 记录是
--    某台独立发信服务器的发送入口；用于前端列表里加「独立 IP」徽章
--    避免老 SMTP 记录与独立服务器记录视觉混淆
-- ============================================================
SET @col_ded = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'smtp_profiles'
        AND COLUMN_NAME = 'dedicated_server_id') = 0,
    'ALTER TABLE smtp_profiles ADD COLUMN dedicated_server_id BIGINT NULL AFTER reply_to, ADD KEY idx_ded_server (dedicated_server_id)',
    'SELECT 1'
  )
);
PREPARE st FROM @col_ded; EXECUTE st; DEALLOCATE PREPARE st;
