/**
 * 创建开源版首个租户管理员（安装时执行一次）
 * 用法：npx tsx src/scripts/seedStandaloneAdmin.ts admin@example.com 'YourPass123'
 */
import "../loadEnv.js";
import { db } from "../db.js";
import { hashPassword } from "../auth.js";
import { ensureStandaloneTenantEmailModule } from "../services/standaloneTenantEmailModule.js";

const emailRaw = (process.argv[2] ?? "").trim().toLowerCase();
const password = (process.argv[3] ?? "").trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
  console.error("用法: npx tsx src/scripts/seedStandaloneAdmin.ts admin@example.com 'YourPass123'");
  console.error("第一个参数须为邮箱地址");
  process.exit(1);
}
if (password.length < 8 || password.length > 64) {
  console.error("密码须 8-64 位");
  process.exit(1);
}

const email = emailRaw;
const nickname = "管理员";

async function main() {
  const [exists] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if ((exists as any[]).length > 0) {
    await db.query(`UPDATE users SET password_hash = ?, status = 'active', nickname = ? WHERE email = ?`, [
      hashPassword(password),
      nickname,
      email
    ]);
    console.log(`[seed] 已更新已有管理员密码: ${email}`);
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tenantRows] = await conn.query(`SELECT id FROM tenants WHERE slug = 'standalone' LIMIT 1`);
    let tenantId = Number((tenantRows as { id?: number }[])[0]?.id ?? 0);
    if (!tenantId) {
      const [tenantResult] = await conn.query(
        `INSERT INTO tenants (slug, name, status, seat_limit) VALUES ('standalone', '独立部署', 'active', 50)`
      );
      tenantId = Number((tenantResult as { insertId?: number }).insertId);
    }
    const [userResult] = await conn.query(
      `INSERT INTO users (email, nickname, password_hash, status, is_super_admin) VALUES (?, ?, ?, 'active', 1)`,
      [email, nickname, hashPassword(password)]
    );
    const userId = Number((userResult as any).insertId);
    await conn.query(
      `INSERT INTO tenant_members (tenant_id, user_id, role, status) VALUES (?, ?, 'tenant_admin', 'active')`,
      [tenantId, userId]
    );
    for (const mod of ["crm", "email"] as const) {
      await conn.query(
        `INSERT INTO tenant_product_modules
          (tenant_id, module, status, monthly_price_cents, simulated_paid_at, period_start, period_end)
         VALUES (?, ?, 'active', 0, NOW(), NOW(), NULL)
         ON DUPLICATE KEY UPDATE status = 'active'`,
        [tenantId, mod]
      );
    }
    await conn.commit();
    await ensureStandaloneTenantEmailModule(db, tenantId);
    console.log(`[seed] 管理员已创建: ${email} (tenant_id=${tenantId})`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] failed:", (e as Error)?.message ?? e);
  process.exit(1);
});
