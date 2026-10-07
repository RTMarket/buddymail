import type { Pool } from "mysql2/promise";

/** 退信事件与 email_sends 行对齐：优先 email_send_id；其次邮箱+campaign；再次租户内按时间与顺序兜底。 */
export function sqlBounceEventMatchesSend(eAlias = "e", sAlias = "s"): string {
  return `(
    ${eAlias}.email_send_id = ${sAlias}.id
    OR (
      (${eAlias}.email_send_id IS NULL OR ${eAlias}.email_send_id = 0)
      AND LOWER(TRIM(${eAlias}.email)) = LOWER(TRIM(${sAlias}.to_email))
      AND (${eAlias}.campaign_id IS NULL OR ${eAlias}.campaign_id = ${sAlias}.campaign_id)
    )
    OR (
      ${eAlias}.event_type = 'bounced'
      AND (${eAlias}.email_send_id IS NULL OR ${eAlias}.email_send_id = 0)
      AND LOWER(TRIM(${eAlias}.email)) = LOWER(TRIM(${sAlias}.to_email))
      AND ${eAlias}.created_at >= ${sAlias}.created_at
      AND ${eAlias}.created_at <= DATE_ADD(${sAlias}.created_at, INTERVAL 90 DAY)
      AND ${eAlias}.tenant_id = (SELECT c.tenant_id FROM email_campaigns c WHERE c.id = ${sAlias}.campaign_id LIMIT 1)
      AND NOT EXISTS (
        SELECT 1 FROM email_sends s2
        WHERE s2.campaign_id = ${sAlias}.campaign_id
          AND LOWER(TRIM(s2.to_email)) = LOWER(TRIM(${sAlias}.to_email))
          AND s2.id > ${sAlias}.id
          AND s2.created_at < ${eAlias}.created_at
      )
    )
  )`;
}

export function sqlSendRowHasBounceEvent(sAlias = "s"): string {
  return `EXISTS (
    SELECT 1
      FROM email_delivery_events e
     WHERE e.event_type = 'bounced'
       AND ${sqlBounceEventMatchesSend("e", sAlias)}
  )`;
}

export async function countCampaignDistinctBouncedEmails(db: Pool, campaignId: number): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT LOWER(TRIM(s.to_email)) AS em
           FROM email_sends s
          WHERE s.campaign_id = ?
            AND EXISTS (
              SELECT 1
                FROM email_delivery_events e
               WHERE e.event_type = 'bounced'
                 AND ${sqlBounceEventMatchesSend("e", "s")}
            )
          GROUP BY LOWER(TRIM(s.to_email))
       ) bounced_emails`,
    [campaignId]
  );
  return Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0);
}

export async function reconcileCampaignBouncedSends(
  db: Pool,
  campaignId: number,
  opts?: { apply?: boolean; limit?: number }
): Promise<{ matched: number; updated: number }> {
  const apply = Boolean(opts?.apply ?? false);
  const limit = Math.max(1, Number(opts?.limit ?? 100000) || 100000);
  const [rows] = await db.query(
    `SELECT s.id
       FROM email_sends s
      WHERE s.campaign_id = ?
        AND s.status = 'sent'
        AND EXISTS (
          SELECT 1
            FROM email_delivery_events e
           WHERE e.event_type = 'bounced'
             AND ${sqlBounceEventMatchesSend("e", "s")}
        )
      ORDER BY s.id ASC
      LIMIT ?`,
    [campaignId, limit]
  );
  const targetIds = (rows as Array<{ id?: unknown }>)
    .map((r) => Number(r.id ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  let updated = 0;
  if (apply && targetIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < targetIds.length; i += chunkSize) {
      const batch = targetIds.slice(i, i + chunkSize);
      const placeholders = batch.map(() => "?").join(", ");
      const params = [`系统自动校正：该邮箱已命中 bounced 事件`, ...batch];
      const [ret] = await db.query(
        `UPDATE email_sends
            SET status = 'failed',
                error = CASE
                  WHEN TRIM(COALESCE(error, '')) = '' THEN ?
                  ELSE error
                END
          WHERE id IN (${placeholders})`,
        params
      );
      updated += Number((ret as { affectedRows?: number })?.affectedRows ?? 0);
    }
  }
  return { matched: targetIds.length, updated };
}

export async function backfillImapBounceEventsForCampaign(db: Pool, campaignId: number): Promise<number> {
  const [r] = await db.query(
    `UPDATE email_delivery_events e
     INNER JOIN (
       SELECT MAX(s.id) AS sid, LOWER(TRIM(s.to_email)) AS em
         FROM email_sends s
        WHERE s.campaign_id = ?
        GROUP BY LOWER(TRIM(s.to_email))
     ) t ON LOWER(TRIM(e.email)) = t.em
     INNER JOIN email_sends s ON s.id = t.sid
     SET e.campaign_id = s.campaign_id,
         e.contact_id = COALESCE(e.contact_id, s.contact_id),
         e.email_send_id = COALESCE(e.email_send_id, s.id),
         e.tenant_id = (SELECT c.tenant_id FROM email_campaigns c WHERE c.id = s.campaign_id LIMIT 1)
     WHERE e.event_type = 'bounced'
       AND e.provider = 'imap_bounce'
       AND (e.campaign_id IS NULL OR e.campaign_id = 0)`,
    [campaignId]
  );
  return Number((r as { affectedRows?: number })?.affectedRows ?? 0);
}

/** 后台 IMAP 入库后：回填孤儿事件 + sent→failed，无需用户打开统计页。 */
export async function reconcileTouchedCampaignsAfterImapIngest(
  db: Pool,
  campaignIds: number[]
): Promise<{ campaigns: number; updated: number }> {
  const uniq = Array.from(new Set(campaignIds.map((id) => Math.floor(Number(id))).filter((id) => id > 0))).slice(0, 80);
  if (uniq.length === 0) return { campaigns: 0, updated: 0 };

  let updated = 0;
  for (const cid of uniq) {
    try {
      await backfillImapBounceEventsForCampaign(db, cid);
      const r = await reconcileCampaignBouncedSends(db, cid, { apply: true, limit: 5000 });
      updated += r.updated;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[imap-bounce] reconcile campaign failed:", cid, (e as Error)?.message ?? e);
    }
  }
  if (updated > 0) {
    // eslint-disable-next-line no-console
    console.log(`[imap-bounce] auto-reconciled campaigns=${uniq.length} updated_sends=${updated}`);
  }
  return { campaigns: uniq.length, updated };
}

export async function listRecentImapBounceCampaignIds(db: Pool, withinMinutes = 10): Promise<number[]> {
  const mins = Math.max(1, Math.min(120, Math.floor(withinMinutes)));
  const [rows] = await db.query(
    `SELECT DISTINCT campaign_id AS cid
       FROM email_delivery_events
      WHERE event_type = 'bounced'
        AND provider = 'imap_bounce'
        AND campaign_id IS NOT NULL
        AND campaign_id > 0
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [mins]
  );
  return (rows as Array<{ cid?: unknown }>)
    .map((r) => Number(r.cid ?? 0))
    .filter((id) => Number.isFinite(id) && id > 0);
}
