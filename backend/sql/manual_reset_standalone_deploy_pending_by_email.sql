-- 清理指定邮箱「未完成授权安装」的独立部署订单（主站可重新下单）
-- 不动 users / tenant_members / 登录与其它业务表。
--
-- 用法：改邮箱 → 跑预览 SELECT → 确认后跑「执行」段（建议 START TRANSACTION … COMMIT）

SET NAMES utf8mb4;

SET @email1 := '2415022172@qq.com';
SET @email2 := 'onlineiching@163.com';

-- ---------- 预览 ----------
SELECT u.email, tm.tenant_id, pi.id AS intent_id, pi.ref_code, pi.status, pi.modules_csv,
       d.id AS download_id, d.install_completed_at, s.id AS session_id, s.status AS session_status
  FROM users u
  JOIN tenant_members tm ON tm.user_id = u.id AND tm.status = 'active'
  JOIN tenant_module_pay_intents pi
    ON pi.tenant_id = tm.tenant_id AND pi.status = 'paid' AND pi.modules_csv LIKE '%standalone-pack%'
  LEFT JOIN standalone_deploy_downloads d
    ON d.tenant_id = pi.tenant_id AND d.ref_code = pi.ref_code
  LEFT JOIN standalone_deploy_install_sessions s
    ON s.tenant_id = pi.tenant_id AND s.ref_code = pi.ref_code
 WHERE (
   LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email1) COLLATE utf8mb4_unicode_ci
   OR LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email2) COLLATE utf8mb4_unicode_ci
 )
 ORDER BY u.email, pi.id DESC;

-- ---------- 执行（仅清理 install_completed_at 为空的失败单）----------
START TRANSACTION;

DELETE s
  FROM standalone_deploy_install_sessions s
  JOIN users u ON (
    LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email1) COLLATE utf8mb4_unicode_ci
    OR LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email2) COLLATE utf8mb4_unicode_ci
  )
  JOIN tenant_members tm ON tm.user_id = u.id AND tm.tenant_id = s.tenant_id AND tm.status = 'active'
  JOIN tenant_module_pay_intents pi
    ON pi.tenant_id = s.tenant_id AND pi.ref_code = s.ref_code
   AND pi.status = 'paid' AND pi.modules_csv LIKE '%standalone-pack%'
  JOIN standalone_deploy_downloads d
    ON d.tenant_id = s.tenant_id AND d.ref_code = s.ref_code AND d.install_completed_at IS NULL;

DELETE d
  FROM standalone_deploy_downloads d
  JOIN users u ON (
    LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email1) COLLATE utf8mb4_unicode_ci
    OR LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email2) COLLATE utf8mb4_unicode_ci
  )
  JOIN tenant_members tm ON tm.user_id = u.id AND tm.tenant_id = d.tenant_id AND tm.status = 'active'
  JOIN tenant_module_pay_intents pi
    ON pi.tenant_id = d.tenant_id AND d.ref_code = pi.ref_code
   AND pi.status = 'paid' AND pi.modules_csv LIKE '%standalone-pack%'
 WHERE d.install_completed_at IS NULL;

UPDATE tenant_module_pay_intents pi
  JOIN users u ON (
    LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email1) COLLATE utf8mb4_unicode_ci
    OR LOWER(u.email) COLLATE utf8mb4_unicode_ci = LOWER(@email2) COLLATE utf8mb4_unicode_ci
  )
  JOIN tenant_members tm ON tm.user_id = u.id AND tm.tenant_id = pi.tenant_id AND tm.status = 'active'
  LEFT JOIN standalone_deploy_downloads d
    ON d.tenant_id = pi.tenant_id AND d.ref_code = pi.ref_code
   SET pi.status = 'cancelled'
 WHERE pi.status = 'paid'
   AND pi.modules_csv LIKE '%standalone-pack%'
   AND d.id IS NULL;

COMMIT;

-- 执行后：让用户用无痕窗口打开部署套餐页，或清除 sessionStorage 键 bssStandaloneDeployOrderRef
