import type { Pool } from "mysql2/promise";

export async function refreshLeadFreshness(db: Pool, tenantId: number) {
  await db.query(
    `UPDATE leads
        SET email_status = CASE
            WHEN primary_email IS NULL OR primary_email = '' THEN 'unverified'
            WHEN email_verified_at IS NULL THEN email_status
            WHEN TIMESTAMPDIFF(DAY, email_verified_at, NOW()) > 120 THEN 'risky'
            ELSE email_status
          END
      WHERE tenant_id = ?`,
    [tenantId]
  );
}
