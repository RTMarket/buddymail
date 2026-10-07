import "../loadEnv.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { env } from "../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable(conn: mysql.Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function isMigrationApplied(conn: mysql.Connection, filename: string): Promise<boolean> {
  const [rows] = await conn.query(
    "SELECT 1 AS ok FROM schema_migrations WHERE filename = ? LIMIT 1",
    [filename]
  );
  return Array.isArray(rows) && (rows as { ok?: number }[]).length > 0;
}

async function markMigrationApplied(conn: mysql.Connection, filename: string) {
  await conn.query("INSERT IGNORE INTO schema_migrations (filename) VALUES (?)", [filename]);
}

async function main() {
  const sqlDir = path.join(__dirname, "..", "..", "sql");
  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    multipleStatements: true,
    /** 大表 ADD INDEX 可能跑很久，避免 wait_timeout 中途断连 */
    connectTimeout: 60_000
  });

  await conn.query("SET SESSION wait_timeout = 28800");
  await conn.query("SET SESSION net_read_timeout = 28800");
  await conn.query("SET SESSION net_write_timeout = 28800");
  await conn.query("SET SESSION innodb_lock_wait_timeout = 7200");

  await ensureMigrationsTable(conn);

  let applied = 0;
  let skipped = 0;

  for (const f of files) {
    if (await isMigrationApplied(conn, f)) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.log(`[db:migrate] skip ${f} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(sqlDir, f), "utf8");
    await conn.query(sql);
    await markMigrationApplied(conn, f);
    applied += 1;
    // eslint-disable-next-line no-console
    console.log(`[db:migrate] applied ${f}`);
  }
  await conn.end();

  // eslint-disable-next-line no-console
  console.log(
    `[db:migrate] DONE — applied=${applied}, skipped=${skipped}, database=${env.MYSQL_DATABASE}`
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[db:migrate] failed", e);
  process.exit(1);
});
