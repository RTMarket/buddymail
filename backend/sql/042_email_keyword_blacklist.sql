-- 邮件内容关键词黑名单：用于
--   (a) 邮件模板编辑器实时提示（高/中/低危）
--   (b) 模板保存时报告
--   (c) 营销活动发送前最终拦截（高危必须改、中低危需用户确认）
--
-- 设计要点：
--   1) 关键词分级别（high/medium/low），高危直接拦截，低危只提示
--   2) 平台级关键词由超管在 admin console 维护（tenant_id IS NULL）
--   3) 租户可在自己作用域内追加关键词（tenant_id = X），不可改动平台级
--   4) match_kind = 'plain'（子串）/ 'word'（整词）/ 'regex'（高级，仅超管可用）
--   5) 多语言友好：term 不规范化大小写，匹配时统一 lowercase 处理

CREATE TABLE IF NOT EXISTS email_keyword_blacklist (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  /** NULL = 平台级关键词（所有租户生效）；非 NULL = 该租户额外关键词 */
  tenant_id BIGINT NULL,
  term VARCHAR(255) NOT NULL,
  match_kind ENUM('plain','word','regex') NOT NULL DEFAULT 'plain',
  severity ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  /** 命中后给用户看的解释/建议，例 "可改为 'Quick intro from <name>' 减少促销感" */
  hint VARCHAR(512) NULL,
  /** 适用范围 ：subject 主题、body 正文、both 全文 */
  scope ENUM('subject','body','both') NOT NULL DEFAULT 'both',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_scope_term (tenant_id, scope, term, match_kind),
  KEY idx_enabled_severity (enabled, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 默认平台级关键词种子（tenant_id = NULL）
-- 这些都是反垃圾过滤模型公认会显著拉低送达率的"高危词"。
-- 用 INSERT IGNORE，配合上面的唯一索引，重复迁移不会插入两次。

INSERT IGNORE INTO email_keyword_blacklist (tenant_id, term, match_kind, severity, scope, hint) VALUES
  -- ========= 高危：腾讯/阿里/Gmail/Outlook 任一过滤模型几乎必拦 =========
  (NULL, '告别风控',       'plain', 'high',   'both',
    '此短语会被识别为帮助用户对抗平台合规检测，腾讯/阿里反垃圾几乎必拦。请删除或重写为合规中性表达。'),
  (NULL, '绕过风控',       'plain', 'high',   'both',
    '同"告别风控"，建议直接删除整段相关内容。'),
  (NULL, '一键多账号',     'plain', 'high',   'both',
    '"多账号"+"一键"组合命中工具号灰产指纹，请改为"统一管理多个授权账号"等中性表达。'),
  (NULL, '账号矩阵',       'plain', 'high',   'both',
    '建议改为"多渠道协同"或"内容分发管理"。'),
  (NULL, '批量导出线索',   'plain', 'high',   'both',
    '"批量"+"线索"组合命中爬虫指纹，建议改为"高效整理客户资料"。'),
  (NULL, '群发垃圾',       'plain', 'high',   'both', NULL),
  (NULL, '获客神器',       'plain', 'high',   'both', '建议改为"获客工具"或"营销助手"。'),
  (NULL, '一键群发',       'plain', 'high',   'both', NULL),
  -- 英文常见高危
  (NULL, 'click here',     'plain', 'high',   'both',
    '"click here" 是 spam 过滤的经典标志，建议改为有上下文的具体说明，如 "View our pricing"。'),
  (NULL, '100% free',      'plain', 'high',   'both', NULL),
  (NULL, 'risk free',      'plain', 'high',   'both', NULL),
  (NULL, 'free money',     'plain', 'high',   'both', NULL),
  (NULL, 'make money fast','plain', 'high',   'both', NULL),
  (NULL, 'lottery',        'plain', 'high',   'both', NULL),
  (NULL, 'congratulations you have won', 'plain', 'high', 'both', NULL),
  (NULL, 'viagra',         'plain', 'high',   'both', NULL),

  -- ========= 中危：单独不致命，多个组合会拉低送达率 =========
  (NULL, '免费',           'plain', 'medium', 'both',
    '建议把"免费"放在具体上下文，如"免费 7 天试用"，不要全文反复出现。'),
  (NULL, '一键',           'plain', 'medium', 'both',
    '建议改为"快速""高效"等具体描述。'),
  (NULL, '翻倍',           'plain', 'medium', 'both', '改为具体数字效果，如"提升约 60%"。'),
  (NULL, '零门槛',         'plain', 'medium', 'both', NULL),
  (NULL, '限时',           'plain', 'medium', 'both', NULL),
  (NULL, '抢购',           'plain', 'medium', 'both', NULL),
  (NULL, '优惠',           'plain', 'medium', 'both', NULL),
  (NULL, '中奖',           'plain', 'medium', 'both', NULL),
  (NULL, '大降价',         'plain', 'medium', 'both', NULL),
  (NULL, '一站式',         'plain', 'medium', 'both', NULL),
  (NULL, '全流程',         'plain', 'medium', 'both', NULL),
  -- 英文中危
  (NULL, 'limited time',   'plain', 'medium', 'both', NULL),
  (NULL, 'act now',        'plain', 'medium', 'both', NULL),
  (NULL, 'urgent',         'plain', 'medium', 'subject',
    '主题里 urgent / important 这种词会显著降低送达率，请改为具体业务相关的主题。'),
  (NULL, 'free trial',     'plain', 'medium', 'both', NULL),
  (NULL, 'best price',     'plain', 'medium', 'both', NULL),
  (NULL, 'guaranteed',     'plain', 'medium', 'both', NULL),
  (NULL, 'no obligation',  'plain', 'medium', 'both', NULL),
  (NULL, 'cash bonus',     'plain', 'medium', 'both', NULL),

  -- ========= 低危：单一出现可接受，过多堆叠才提示 =========
  (NULL, 'dear sir',       'plain', 'low',    'both',
    '过于模板化的开头，建议尽量带上对方姓名。'),
  (NULL, 'dear madam',     'plain', 'low',    'both', NULL),
  (NULL, 'we are a',       'plain', 'low',    'both',
    '冷发邮件最忌讳上来就介绍自己，建议先一句和对方业务相关的话。'),
  (NULL, '我们是一家',     'plain', 'low',    'both', NULL),

  -- ========= 主题专项 =========
  (NULL, 'Re:',            'plain', 'medium', 'subject',
    '伪造 Re: 前缀骗打开率会被反垃圾过滤直接判垃圾。'),
  (NULL, 'Fwd:',           'plain', 'medium', 'subject', '同"Re:"。'),
  (NULL, '你好',           'plain', 'low',    'subject',
    '主题如果只有"你好"会显得没诚意，建议带上具体业务点。');

-- 索引补充：扫描时按 enabled+severity 走
SET @db = DATABASE();
SET @idx_sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_keyword_blacklist'
        AND INDEX_NAME = 'idx_tenant_enabled') = 0,
    'CREATE INDEX idx_tenant_enabled ON email_keyword_blacklist (tenant_id, enabled)',
    'SELECT 1'
  )
);
PREPARE idx_stmt FROM @idx_sql; EXECUTE idx_stmt; DEALLOCATE PREPARE idx_stmt;
