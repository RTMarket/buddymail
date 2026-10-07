import { apiJson } from "./api";

export type TenantApiKeyRecord = {
  id: number;
  tenantId: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type TenantWebhookEndpoint = {
  id: number;
  tenantId: number;
  url: string;
  events: string[];
  enabled: boolean;
  lastError: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listTenantApiKeys(): Promise<TenantApiKeyRecord[]> {
  const res = await apiJson<{ ok: true; keys: TenantApiKeyRecord[] }>("/api/tenant/api-keys");
  return res.keys;
}

export async function createTenantApiKey(name: string): Promise<{ key: TenantApiKeyRecord; secret: string }> {
  return apiJson<{ ok: true; key: TenantApiKeyRecord; secret: string }>("/api/tenant/api-keys", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function revokeTenantApiKey(id: number): Promise<void> {
  await apiJson<{ ok: boolean }>(`/api/tenant/api-keys/${id}`, { method: "DELETE" });
}

export async function listTenantWebhooks(): Promise<TenantWebhookEndpoint[]> {
  const res = await apiJson<{ ok: true; endpoints: TenantWebhookEndpoint[] }>("/api/tenant/webhooks");
  return res.endpoints;
}

export async function createTenantWebhook(url: string): Promise<{ endpoint: TenantWebhookEndpoint; secret: string }> {
  return apiJson<{ ok: true; endpoint: TenantWebhookEndpoint; secret: string }>("/api/tenant/webhooks", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

export async function toggleTenantWebhook(id: number, enabled: boolean): Promise<TenantWebhookEndpoint> {
  const res = await apiJson<{ ok: true; endpoint: TenantWebhookEndpoint }>(`/api/tenant/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
  return res.endpoint;
}

export async function deleteTenantWebhook(id: number): Promise<void> {
  await apiJson<{ ok: boolean }>(`/api/tenant/webhooks/${id}`, { method: "DELETE" });
}
