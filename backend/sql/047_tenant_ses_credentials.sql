-- BYO SES（Bring-Your-Own AWS SES）：高级用户自带 AWS SES 凭证。
-- 默认所有租户都用平台 SES（我们的 AWS 账号）；这张表存"凭证已绑定的租户"覆盖项。
--
-- 设计要点：
--   * 一行一租户（PRIMARY KEY tenant_id），简化运行期查找。
--   * 凭证字段使用既有 cryptoSecret encryptSecret 加密；列宽预留 4096 容纳 4KB AES-GCM 输出。
--   * region 明确存储，避免和平台默认 AWS_REGION 互相覆盖产生隐性 bug。
--   * is_enabled = 0 时即使有 row 也不切换路由（用户暂时禁用 BYOD 时常用）。
--   * configuration_set / sns_topic_arn 可选；不填则发送时不挂 configuration set，
--     但这样租户自己的 AWS 端就拿不到 bounce/complaint 回调，建议都填。
--
-- 这张表本身不会被自动读：sesIdentityService 当前默认走平台凭证，
-- 等运行时 BYOD 路由开关打开后再接入（plan 阶段 5）。

CREATE TABLE IF NOT EXISTS tenant_ses_credentials (
  tenant_id BIGINT PRIMARY KEY,
  /** AWS region，例 us-east-1 / ap-northeast-1。必填，避免回退到平台默认导致跨区错发 */
  aws_region VARCHAR(32) NOT NULL,
  /** 加密后的 access key id（cryptoSecret.encryptSecret）；明文不存 */
  access_key_id_enc VARCHAR(4096) NOT NULL,
  /** 加密后的 secret access key */
  secret_access_key_enc VARCHAR(4096) NOT NULL,
  /** 该租户在自家 AWS 创建的 Configuration Set 名（通常我们建议命名 bss-tenant-{id}） */
  configuration_set VARCHAR(128) NULL,
  /** 该租户在自家 AWS 上挂在 Configuration Set 上的 SNS Topic ARN（用于 bounce/complaint 回调） */
  sns_topic_arn VARCHAR(500) NULL,
  /** 0=禁用（即使配置存在也走平台 SES）；1=启用 */
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  /** 健康自检：最近一次 GetAccount/SendingEnabled 的结果 */
  last_health_status VARCHAR(32) NULL,
  last_health_message VARCHAR(500) NULL,
  last_health_check_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
