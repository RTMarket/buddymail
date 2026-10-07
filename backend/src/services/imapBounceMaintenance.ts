import type { Pool } from "mysql2/promise";

/** 删除无法关联真实发送记录的 IMAP 误解析退信，并修正被误标 failed 的 sends */
export async function purgeInvalidImapBounceEvents(db: Pool): Promise<{
  deletedEvents: number;
  revertedSends: number;
}> {
  const [del] = await db.query(
    `DELETE FROM email_delivery_events
      WHERE event_type = 'bounced'
        AND provider = 'imap_bounce'
        AND (
          email_send_id IS NULL
          OR campaign_id IS NULL
          OR campaign_id = 0
          OR email REGEXP '^[0-9]{8,}\\\\.[a-f0-9]{4,}@'
          OR email IN ('root@localhost')
          OR email LIKE 'info@%'
          OR email LIKE 'root@%'
        )`
  );
  const deletedEvents = Number((del as { affectedRows?: number })?.affectedRows ?? 0);

  const [rev] = await db.query(
    `UPDATE email_sends s
        SET s.status = 'sent',
            s.error = CASE
              WHEN TRIM(COALESCE(s.error, '')) LIKE '系统自动校正：%' THEN NULL
              ELSE s.error
            END
      WHERE s.status = 'failed'
        AND NOT EXISTS (
          SELECT 1 FROM email_delivery_events e
           WHERE e.event_type = 'bounced'
             AND e.email_send_id = s.id
        )`
  );
  const revertedSends = Number((rev as { affectedRows?: number })?.affectedRows ?? 0);

  return { deletedEvents, revertedSends };
}
