import type { Pool } from "mysql2/promise";

type RangeBits = { clause: string; params: unknown[] };

/**
 * 与 send-contacts 名单一致：按 contact_id 统计至少打开过一次的联系人数。
 * 避免仅查 delivery_events.campaign_id 时漏掉未回填 campaign_id 的像素事件。
 */
export async function countCampaignDistinctOpeners(
  db: Pool,
  campaignId: number,
  sendRange: RangeBits,
  fromClause: string,
  fromParams: unknown[]
): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT s.contact_id
           FROM email_sends s
           INNER JOIN email_delivery_events e
             ON e.event_type = 'opened' AND e.email_send_id = s.id
          WHERE s.campaign_id = ?${sendRange.clause}${fromClause}
            AND s.contact_id IS NOT NULL
          GROUP BY s.contact_id
       ) t`,
    [campaignId, ...sendRange.params, ...fromParams]
  );
  return Number((rows as { c?: unknown }[])[0]?.c ?? 0);
}

export async function countCampaignDistinctClickers(
  db: Pool,
  campaignId: number,
  sendRange: RangeBits,
  fromClause: string,
  fromParams: unknown[]
): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT s.contact_id
           FROM email_sends s
           INNER JOIN email_delivery_events e
             ON e.event_type = 'clicked' AND e.email_send_id = s.id
          WHERE s.campaign_id = ?${sendRange.clause}${fromClause}
            AND s.contact_id IS NOT NULL
          GROUP BY s.contact_id
       ) t`,
    [campaignId, ...sendRange.params, ...fromParams]
  );
  return Number((rows as { c?: unknown }[])[0]?.c ?? 0);
}

export async function countCampaignSubscribes(
  db: Pool,
  campaignId: number,
  subRange: RangeBits
): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(s.email))) AS sub_cnt
       FROM email_subscribe_events s
       WHERE s.campaign_id = ?
         AND TRIM(COALESCE(s.email, '')) <> ''${subRange.clause}`,
    [campaignId, ...subRange.params]
  );
  return Number((rows as { sub_cnt?: unknown }[])[0]?.sub_cnt ?? 0);
}

/** 用户投诉（含无 email_send_id 的表单事件），按 campaign_id 计数 */
export async function countCampaignComplaints(
  db: Pool,
  campaignId: number,
  opts?: { createdAtRange?: RangeBits; sendRunId?: number | null }
): Promise<number> {
  let clause = "";
  const params: unknown[] = [campaignId];
  const sendRunId = opts?.sendRunId != null ? Number(opts.sendRunId) : 0;
  if (sendRunId > 0) {
    clause += ` AND (
      EXISTS (SELECT 1 FROM email_sends s WHERE s.id = e.email_send_id AND s.send_run_id = ?)
      OR e.campaign_id = ?
    )`;
    params.push(sendRunId, campaignId);
  }
  const created = opts?.createdAtRange;
  if (created?.clause) {
    clause += created.clause.replace(/\bcreated_at\b/g, "e.created_at");
    params.push(...created.params);
  }
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_delivery_events e
      WHERE e.campaign_id = ?
        AND e.event_type = 'complaint'${clause}`,
    params
  );
  return Number((rows as { c?: unknown }[])[0]?.c ?? 0);
}

export async function loadCampaignEngagementSummary(
  db: Pool,
  campaignId: number,
  opts: {
    sendRange: RangeBits;
    subRange: RangeBits;
    fromClause: string;
    fromParams: unknown[];
    unsubRange: RangeBits;
    evtRange: RangeBits;
  }
): Promise<{
  openedCount: number;
  clickedCount: number;
  subscribeCount: number;
  unsubscribeCount: number;
  complaintCount: number;
}> {
  const evtComplaintClause = opts.evtRange.clause
    ? opts.evtRange.clause.replace(/\bcreated_at\b/g, "e.created_at")
    : "";
  const [unsubRows, complaintRows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS unsub_cnt
         FROM email_unsubscribe_events u
         WHERE u.campaign_id = ?${opts.unsubRange.clause}`,
      [campaignId, ...opts.unsubRange.params]
    ),
    db.query(
      `SELECT COUNT(*) AS c
         FROM email_delivery_events e
         INNER JOIN email_sends s ON s.id = e.email_send_id
        WHERE s.campaign_id = ?
          AND e.event_type = 'complaint'${evtComplaintClause}`,
      [campaignId, ...opts.evtRange.params]
    )
  ]);

  const [openedCount, clickedCount, subscribeCount] = await Promise.all([
    countCampaignDistinctOpeners(db, campaignId, opts.sendRange, opts.fromClause, opts.fromParams),
    countCampaignDistinctClickers(db, campaignId, opts.sendRange, opts.fromClause, opts.fromParams),
    countCampaignSubscribes(db, campaignId, opts.subRange).catch(() => 0)
  ]);

  return {
    openedCount,
    clickedCount,
    subscribeCount,
    unsubscribeCount: Number((unsubRows as { unsub_cnt?: unknown }[])[0]?.unsub_cnt ?? 0),
    complaintCount: Number((complaintRows as { c?: unknown }[])[0]?.c ?? 0)
  };
}
