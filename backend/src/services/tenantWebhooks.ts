import crypto from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

export type WebhookEventType =
  | "email.send.completed"
  | "email.send.daily_limit_reached"
  | "email.campaign.stopped";

export type TenantWebhookEndpoint = {
  id: number;
  tenantId: number;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  lastError: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_EVENTS: WebhookEventType[] = [
  "email.send.completed",
  "email.send.daily_limit_reached",
  "email.campaign.stopped"
];

function normalizeEvents(raw: unknown): WebhookEventType[] {
  if (!raw) return DEFAULT_EVENTS;
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })()
      : [];
  const allowed = new Set(DEFAULT_EVENTS);
  const events = (Array.isArray(arr) ? arr : []).map(String).filter((x): x is WebhookEventType => allowed.has(x as WebhookEventType));
  return events.length ? events : DEFAULT_EVENTS;
}

function mapEndpoint(row: RowDataPacket): TenantWebhookEndpoint {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    url: String(row.url ?? ""),
    events: normalizeEvents(row.events_json),
    enabled: Boolean(row.enabled),
    lastError: row.last_error ? String(row.last_error) : null,
    lastDeliveredAt: row.last_delivered_at ? new Date(row.last_delivered_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ""
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(secret: string, payload: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export async function listTenantWebhookEndpoints(db: Pool, tenantId: number): Promise<TenantWebhookEndpoint[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, url, events_json, enabled, last_error, last_delivered_at, created_at, updated_at
       FROM tenant_webhook_endpoints
      WHERE tenant_id = ?
      ORDER BY created_at DESC, id DESC`,
    [tenantId]
  );
  return rows.map(mapEndpoint);
}

export async function createTenantWebhookEndpoint(
  db: Pool,
  tenantId: number,
  input: { url: string; events?: WebhookEventType[]; enabled?: boolean }
): Promise<{ endpoint: TenantWebhookEndpoint; secret: string }> {
  const secret = generateWebhookSecret();
  const events = normalizeEvents(input.events);
  const [result] = await db.query(
    `INSERT INTO tenant_webhook_endpoints (tenant_id, url, secret, events_json, enabled)
     VALUES (?, ?, ?, CAST(? AS JSON), ?)`,
    [tenantId, input.url.trim(), secret, JSON.stringify(events), input.enabled === false ? 0 : 1]
  );
  const id = Number((result as { insertId?: number }).insertId ?? 0);
  const endpoints = await listTenantWebhookEndpoints(db, tenantId);
  const endpoint = endpoints.find((x) => x.id === id);
  if (!endpoint) throw new Error("Webhook 创建失败");
  return { endpoint, secret };
}

export async function updateTenantWebhookEndpoint(
  db: Pool,
  tenantId: number,
  id: number,
  input: { url?: string; events?: WebhookEventType[]; enabled?: boolean }
): Promise<TenantWebhookEndpoint | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.url !== undefined) {
    sets.push("url = ?");
    params.push(input.url.trim());
  }
  if (input.events !== undefined) {
    sets.push("events_json = CAST(? AS JSON)");
    params.push(JSON.stringify(normalizeEvents(input.events)));
  }
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (!sets.length) {
    const endpoints = await listTenantWebhookEndpoints(db, tenantId);
    return endpoints.find((x) => x.id === id) ?? null;
  }
  params.push(tenantId, id);
  await db.query(
    `UPDATE tenant_webhook_endpoints SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ?`,
    params
  );
  const endpoints = await listTenantWebhookEndpoints(db, tenantId);
  return endpoints.find((x) => x.id === id) ?? null;
}

export async function deleteTenantWebhookEndpoint(db: Pool, tenantId: number, id: number): Promise<boolean> {
  const [result] = await db.query(
    `DELETE FROM tenant_webhook_endpoints WHERE tenant_id = ? AND id = ?`,
    [tenantId, id]
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function emitTenantWebhookEvent(
  db: Pool,
  tenantId: number,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  if (tenantId <= 0) return;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, url, secret, events_json
       FROM tenant_webhook_endpoints
      WHERE tenant_id = ? AND enabled = 1`,
    [tenantId]
  );
  const endpoints = rows.filter((row) => normalizeEvents(row.events_json).includes(eventType));
  if (!endpoints.length) return;
  const payload = JSON.stringify({
    id: `evt_${crypto.randomBytes(12).toString("base64url")}`,
    type: eventType,
    createdAt: new Date().toISOString(),
    tenantId,
    data
  });
  for (const endpoint of endpoints) {
    void deliverWebhook(db, tenantId, Number(endpoint.id), String(endpoint.url), String(endpoint.secret), eventType, payload);
  }
}

async function deliverWebhook(
  db: Pool,
  tenantId: number,
  endpointId: number,
  url: string,
  secret: string,
  eventType: WebhookEventType,
  payload: string
) {
  let deliveryId = 0;
  try {
    const [result] = await db.query(
      `INSERT INTO tenant_webhook_deliveries (tenant_id, endpoint_id, event_type, payload_json, attempts)
       VALUES (?, ?, ?, CAST(? AS JSON), 1)`,
      [tenantId, endpointId, eventType, payload]
    );
    deliveryId = Number((result as { insertId?: number }).insertId ?? 0);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BSS-Event": eventType,
        "X-BSS-Signature": signWebhookPayload(secret, payload)
      },
      body: payload,
      signal: AbortSignal.timeout(10_000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    await db.query(
      `UPDATE tenant_webhook_deliveries SET status = 'delivered', delivered_at = NOW() WHERE id = ?`,
      [deliveryId]
    );
    await db.query(
      `UPDATE tenant_webhook_endpoints SET last_delivered_at = NOW(), last_error = NULL WHERE id = ?`,
      [endpointId]
    );
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    if (deliveryId > 0) {
      await db.query(
        `UPDATE tenant_webhook_deliveries
            SET status = 'failed', last_error = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
          WHERE id = ?`,
        [msg, deliveryId]
      );
    }
    await db.query(`UPDATE tenant_webhook_endpoints SET last_error = ? WHERE id = ?`, [msg, endpointId]);
  }
}
