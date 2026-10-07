/*
 * 044_tenant_send_tier_warmup_9tiers.sql
 *
 * 把 4 档老体系（bronze/silver/gold/platinum）扩展为 9 档"成长计划 + 预热曲线"：
 *
 *   bronze_apprentice     200/d   免费档（注册即用，需先 BYOD 配置 1 个已验证域名）
 *   silver                500/d   付费档 email-send-500     ($3.9/月)
 *   gold                1,000/d   付费档 email-send-1000    ($6.9/月)
 *   platinum            3,000/d   付费档 email-send-3000    ($9.9/月)
 *   diamond             5,000/d   付费档 email-send-5000    ($14.9/月)
 *   master             10,000/d   付费档 email-send-10000   ($23.9/月)
 *   king               30,000/d   付费档 email-send-30000   ($29.9/月)
 *   supreme            50,000/d   付费档 email-send-50000   ($35.9/月)
 *   legendary         100,000/d   付费档 email-send-100000  ($49.9/月)
 *
 * 设计要点：
 *   - 付费即解锁档位上限（target_tier / target_daily_limit）；
 *   - 实际每日限额按预热曲线 D1=30% / D3=50% / D7=80% / D14=100%（warmup_started_at 锚点）；
 *   - 行为异常时 tenant_send_tier.warmup_started_at 会被推回，等同重置预热进度；
 *   - 此迁移幂等，重复执行不会二次改 schema 也不会破坏老用户的 target_tier/target_daily_limit。
 */

-- ============================================================
-- 1. 把 tier 字段从 ENUM 改为 VARCHAR，允许 9 档命名
-- ============================================================
ALTER TABLE tenant_send_tier
  MODIFY COLUMN tier VARCHAR(32) NOT NULL DEFAULT 'bronze_apprentice';

-- ============================================================
-- 2. 加新列：target_tier / target_daily_limit / warmup_started_at / warmup_reset_count
--    （IF NOT EXISTS 用 information_schema 检测，保证幂等）
-- ============================================================
SET @db = DATABASE();

SET @sql_target_tier = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'target_tier') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN target_tier VARCHAR(32) NULL AFTER tier',
    'SELECT 1'
  )
);
PREPARE s1 FROM @sql_target_tier; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @sql_target_limit = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'target_daily_limit') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN target_daily_limit INT NULL AFTER daily_limit',
    'SELECT 1'
  )
);
PREPARE s2 FROM @sql_target_limit; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @sql_warmup_started = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'warmup_started_at') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN warmup_started_at DATETIME NULL AFTER stability_streak_started_at',
    'SELECT 1'
  )
);
PREPARE s3 FROM @sql_warmup_started; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @sql_warmup_reset = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenant_send_tier'
        AND COLUMN_NAME = 'warmup_reset_count') = 0,
    'ALTER TABLE tenant_send_tier ADD COLUMN warmup_reset_count INT NOT NULL DEFAULT 0 AFTER warmup_started_at',
    'SELECT 1'
  )
);
PREPARE s4 FROM @sql_warmup_reset; EXECUTE s4; DEALLOCATE PREPARE s4;

-- ============================================================
-- 3. 把老的 4 档值翻译到新名字
--    （'bronze'→'bronze_apprentice'；旧 silver/gold/platinum 不是付费产物，也归并到免费档，
--     等它通过 tenant_product_modules 重新认定 target_tier 才能升档）
-- ============================================================
UPDATE tenant_send_tier SET tier = 'bronze_apprentice'
 WHERE tier IN ('bronze', 'silver', 'gold', 'platinum');

-- 同步把 daily_limit 拉回 200（免费档）
UPDATE tenant_send_tier SET daily_limit = 200
 WHERE tier = 'bronze_apprentice' AND daily_limit > 200;

-- ============================================================
-- 4. 已经付费过 email 模块的租户：从 tenant_product_modules.daily_send_limit
--    反推 target_tier，并把 warmup_started_at 锚定到付费时间。
--    简化策略：所有已付费用户被视为"刚激活"，重新走预热曲线一次（更安全）。
-- ============================================================
UPDATE tenant_send_tier t
   JOIN tenant_product_modules m
     ON m.tenant_id = t.tenant_id AND m.module = 'email'
    AND m.status = 'active' AND m.daily_send_limit IS NOT NULL
    AND m.daily_send_limit > 200
   SET t.target_tier = (
         CASE
           WHEN m.daily_send_limit >= 100000 THEN 'legendary'
           WHEN m.daily_send_limit >= 50000  THEN 'supreme'
           WHEN m.daily_send_limit >= 30000  THEN 'king'
           WHEN m.daily_send_limit >= 10000  THEN 'master'
           WHEN m.daily_send_limit >= 5000   THEN 'diamond'
           WHEN m.daily_send_limit >= 3000   THEN 'platinum'
           WHEN m.daily_send_limit >= 1000   THEN 'gold'
           WHEN m.daily_send_limit >= 500    THEN 'silver'
           ELSE 'bronze_apprentice'
         END
       ),
       t.target_daily_limit = m.daily_send_limit,
       /** 没有 paid_at 时回退到 created_at；都为 NULL 则回退到 NOW() */
       t.warmup_started_at = COALESCE(m.simulated_paid_at, m.created_at, NOW());
