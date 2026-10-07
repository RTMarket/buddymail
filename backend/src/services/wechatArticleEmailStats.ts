import type { Pool } from "mysql2/promise";

export type WechatTemplateEmailStats = {
  templateId: number;
  sent: number;
  opened: number;
  clicked: number;
  subscribed: number;
};

/** 按邮件模版 ID 汇总发送/打开（口径与营销活动统计「已打开」一致：按 contact 去重） */
export async function loadWechatArticleEmailStatsByTemplateIds(
  db: Pool,
  tenantId: number,
  templateIds: number[]
): Promise<WechatTemplateEmailStats[]> {
  const ids = [...new Set(templateIds.map((id) => Math.floor(Number(id))).filter((id) => id > 0))];
  if (!ids.length || tenantId <= 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const baseParams = [tenantId, ...ids];

  const [sentRows] = await db.query(
    `SELECT c.template_id AS template_id, COUNT(DISTINCT s.id) AS sent_count
       FROM email_campaigns c
       INNER JOIN email_sends s ON s.campaign_id = c.id
      WHERE c.tenant_id = ? AND c.template_id IN (${placeholders})
      GROUP BY c.template_id`,
    baseParams
  );

  const [openedRows] = await db.query(
    `SELECT c.template_id AS template_id, COUNT(*) AS opened_count
       FROM (
         SELECT c.template_id, s.contact_id
           FROM email_campaigns c
           INNER JOIN email_sends s ON s.campaign_id = c.id
           INNER JOIN email_delivery_events e
             ON e.event_type = 'opened' AND e.email_send_id = s.id
          WHERE c.tenant_id = ? AND c.template_id IN (${placeholders})
            AND s.contact_id IS NOT NULL
          GROUP BY c.template_id, s.contact_id
       ) t
      GROUP BY template_id`,
    baseParams
  );

  const [clickedRows] = await db.query(
    `SELECT c.template_id AS template_id, COUNT(*) AS clicked_count
       FROM (
         SELECT c.template_id, s.contact_id
           FROM email_campaigns c
           INNER JOIN email_sends s ON s.campaign_id = c.id
           INNER JOIN email_delivery_events e
             ON e.event_type = 'clicked' AND e.email_send_id = s.id
          WHERE c.tenant_id = ? AND c.template_id IN (${placeholders})
            AND s.contact_id IS NOT NULL
          GROUP BY c.template_id, s.contact_id
       ) t
      GROUP BY template_id`,
    baseParams
  );

  const [subRows] = await db.query(
    `SELECT c.template_id AS template_id, COUNT(DISTINCT LOWER(TRIM(se.email))) AS sub_count
       FROM email_campaigns c
       INNER JOIN email_subscribe_events se ON se.campaign_id = c.id
      WHERE c.tenant_id = ? AND c.template_id IN (${placeholders})
        AND TRIM(COALESCE(se.email, '')) <> ''
      GROUP BY c.template_id`,
    baseParams
  );

  const sentMap = new Map<number, number>();
  for (const r of sentRows as Array<{ template_id: unknown; sent_count: unknown }>) {
    sentMap.set(Number(r.template_id), Number(r.sent_count ?? 0));
  }
  const openedMap = new Map<number, number>();
  for (const r of openedRows as Array<{ template_id: unknown; opened_count: unknown }>) {
    openedMap.set(Number(r.template_id), Number(r.opened_count ?? 0));
  }
  const clickedMap = new Map<number, number>();
  for (const r of clickedRows as Array<{ template_id: unknown; clicked_count: unknown }>) {
    clickedMap.set(Number(r.template_id), Number(r.clicked_count ?? 0));
  }
  const subMap = new Map<number, number>();
  for (const r of subRows as Array<{ template_id: unknown; sub_count: unknown }>) {
    subMap.set(Number(r.template_id), Number(r.sub_count ?? 0));
  }

  return ids.map((templateId) => ({
    templateId,
    sent: sentMap.get(templateId) ?? 0,
    opened: openedMap.get(templateId) ?? 0,
    clicked: clickedMap.get(templateId) ?? 0,
    subscribed: subMap.get(templateId) ?? 0
  }));
}
