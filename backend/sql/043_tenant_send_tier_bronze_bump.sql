/*
 * 043_tenant_send_tier_bronze_bump.sql
 *
 * 把 Bronze 等级（新会员默认）的每日配额从 100 升到 200，与
 * services/tenantSendTier.ts 中 TIER_CONFIG.bronze.dailyLimit 对齐。
 *
 * 背景：041 创建表时新行通过 ensureTierState() 写入；早期版本将 bronze 默认值
 * 设为 100/日，本次产品决定调整为 200/日。已经在表里的 bronze 行不会被
 * ensureTierState 自动修正，需要这条一次性 UPDATE 拉齐。
 *
 * 设计：
 *   - 仅修改 tier='bronze' 且 daily_limit < 200 的行；
 *   - 不影响超管手动设置的更高配额（不向下覆盖）；
 *   - 不影响 silver/gold/platinum；
 *   - 多次执行也是幂等的：第二次跑时已经全部 ≥ 200，不会再 UPDATE。
 */

UPDATE tenant_send_tier
   SET daily_limit = 200
 WHERE tier = 'bronze'
   AND daily_limit < 200;
