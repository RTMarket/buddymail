/**
 * Postfix deferred 队列监控
 * 通过解析 mailq 输出，把长期 deferred 的邮件写入 email_delivery_events
 * 并把 email_sends.status 从 'sent' 改为 'failed'
 */
import type { Pool } from "mysql2/promise";
import { execSync } from "child_process";

function parseMailqOutput(raw: string): Array<{ queueId: string; recipient: string; reason: string }> {
  const results: Array<{ queueId: string; recipient: string; reason: string }> = [];
  const lines = raw.split("\n");
  let currentQueueId = "";
  let currentReason = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const headerMatch = /^([A-F0-9]{6,})\s+\d+\s+/.exec(line);
    if (headerMatch) {
      currentQueueId = headerMatch[1]!;
      currentReason = "";
      continue;
    }
    const reasonMatch = /^\((.+)\)$/.exec(line.trim());
    if (reasonMatch && currentQueueId) {
      currentReason = reasonMatch[1]!.slice(0, 300);
      continue;
    }
    const emailMatch = /^\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*$/.exec(line);
    if (emailMatch && currentQueueId) {
      results.push({
        queueId: currentQueueId,
        recipient: emailMatch[1]!.toLowerCase(),
        reason: currentReason || "deferred"
      });
    }
  }
  return results;
}

export type DeferredQueueItem = {
  queueId: string;
  recipient: string;
  reason: string;
};

export async function applyPostfixDeferredQueueItems(
  db: Pool,
  items: DeferredQueueItem[]
): Promise<{ inserted: number; reconciled: number }> {
  if (items.length === 0) return { inserted: 0, reconciled: 0 };

  let inserted = 0;
  let reconciled = 0;

  for (const item of items.slice(0, 500)) {
    const recipient = String(item.recipient ?? "")
      .trim()
      .toLowerCase();
    if (!recipient || !recipient.includes("@")) continue;

    const [rows] = await db.query(
      `SELECT s.id, s.campaign_id, s.contact_id, c.tenant_id
         FROM email_sends s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE LOWER(TRIM(s.to_email)) = ?
          AND s.status = 'sent'
          AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY s.id DESC LIMIT 1`,
      [recipient]
    );
    const row = (rows as Array<{
      id: number;
      campaign_id: number;
      contact_id: number | null;
      tenant_id: number;
    }>)[0];
    if (!row) continue;

    const dedupKey = `postfix_deferred:${item.queueId}:${recipient}`;
    const [dups] = await db.query(
      `SELECT id FROM email_delivery_events
        WHERE event_type = 'bounced'
          AND email = ?
          AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.dedupKey')) = ?
        LIMIT 1`,
      [recipient, dedupKey]
    );
    if ((dups as Array<{ id: number }>)[0]) continue;

    await db.query(
      `INSERT INTO email_delivery_events
       (tenant_id, campaign_id, contact_id, email_send_id, email, event_type, provider, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'bounced', 'postfix_deferred', CAST(? AS JSON), NOW())`,
      [
        Number(row.tenant_id),
        Number(row.campaign_id),
        row.contact_id,
        Number(row.id),
        recipient,
        JSON.stringify({ reason: item.reason, queueId: item.queueId, source: "postfix_deferred", dedupKey })
      ]
    );
    inserted++;

    const [upd] = await db.query(
      `UPDATE email_sends SET status = 'failed', error = ?
        WHERE id = ? AND status = 'sent'`,
      [`Postfix deferred: ${item.reason}`.slice(0, 500), Number(row.id)]
    );
    if (Number((upd as { affectedRows?: number })?.affectedRows ?? 0) > 0) reconciled++;
  }

  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[postfix-deferred] inserted=${inserted} reconciled=${reconciled}`);
  }
  return { inserted, reconciled };
}

export async function runPostfixDeferredSync(db: Pool): Promise<{ inserted: number; reconciled: number }> {
  let mailqOutput = "";
  try {
    mailqOutput = execSync("mailq 2>/dev/null || sendmail -bp 2>/dev/null || echo ''", {
      timeout: 10000,
      encoding: "utf8"
    });
  } catch {
    return { inserted: 0, reconciled: 0 };
  }

  const deferred = parseMailqOutput(mailqOutput);
  return applyPostfixDeferredQueueItems(db, deferred);
}
