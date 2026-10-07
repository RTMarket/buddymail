import type { Pool } from "mysql2/promise";

export async function ensureLeadFinderAutoSchema(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_finder_auto_settings (
      tenant_id INT NOT NULL PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      countries VARCHAR(64) NOT NULL DEFAULT 'US,SG',
      daily_quota INT NOT NULL DEFAULT 200,
      run_hour TINYINT NOT NULL DEFAULT 5,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
      api_base_url VARCHAR(512) NULL,
      api_model VARCHAR(128) NULL,
      api_key_enc TEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_finder_auto_jobs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      run_date DATE NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      countries VARCHAR(64) NOT NULL,
      quota INT NOT NULL DEFAULT 200,
      processed INT NOT NULL DEFAULT 0,
      imported INT NOT NULL DEFAULT 0,
      skipped INT NOT NULL DEFAULT 0,
      crm_tag VARCHAR(64) NOT NULL,
      current_domain VARCHAR(255) NULL,
      current_note VARCHAR(512) NULL,
      csv_text LONGTEXT NULL,
      error_message TEXT NULL,
      started_at DATETIME NULL,
      finished_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lf_auto_job (tenant_id, run_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_finder_auto_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      job_id BIGINT NOT NULL,
      tenant_id INT NOT NULL,
      domain VARCHAR(255) NULL,
      status VARCHAR(24) NOT NULL,
      note VARCHAR(1024) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_lf_auto_ev_job (job_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_finder_auto_seen (
      tenant_id INT NOT NULL,
      domain VARCHAR(255) NOT NULL,
      last_seen_date DATE NOT NULL,
      PRIMARY KEY (tenant_id, domain),
      KEY idx_lf_auto_seen_date (tenant_id, last_seen_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
