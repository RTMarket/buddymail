import type { Pool } from "mysql2/promise";

const VISION_MODULE = "vision";
const VISION_PROVIDER = "default";

export type VisionAiConfigPublic = {
  configured: boolean;
  preset: string | null;
  providerLabel: string | null;
  baseUrl: string | null;
  model: string | null;
  apiKeyMasked: string | null;
  hasKey: boolean;
};

export type VisionAiConfigSave = {
  preset: string;
  providerLabel?: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}${"•".repeat(Math.min(12, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

function isMaskedPlaceholder(apiKey: string | undefined): boolean {
  if (!apiKey?.trim()) return true;
  return /^[•*.\s]+$/.test(apiKey.trim()) || apiKey.includes("•••");
}

export async function getVisionAiConfig(db: Pool, tenantId: number): Promise<VisionAiConfigPublic> {
  const [rows] = await db.query(
    `SELECT base_url, model, api_key_enc, extra_json
       FROM api_provider_configs
      WHERE tenant_id = ? AND module = ? AND provider = ?
      LIMIT 1`,
    [tenantId, VISION_MODULE, VISION_PROVIDER]
  );
  const row = (rows as any[])[0];
  if (!row) {
    return {
      configured: false,
      preset: null,
      providerLabel: null,
      baseUrl: null,
      model: null,
      apiKeyMasked: null,
      hasKey: false
    };
  }
  const key = row.api_key_enc ? String(row.api_key_enc) : "";
  const extra = (row.extra_json ?? {}) as Record<string, unknown>;
  return {
    configured: Boolean(key.trim() && row.model),
    preset: typeof extra.preset === "string" ? extra.preset : null,
    providerLabel: typeof extra.providerLabel === "string" ? extra.providerLabel : null,
    baseUrl: row.base_url ? String(row.base_url) : null,
    model: row.model ? String(row.model) : null,
    apiKeyMasked: key.trim() ? maskApiKey(key) : null,
    hasKey: Boolean(key.trim())
  };
}

export async function getVisionAiCredentials(
  db: Pool,
  tenantId: number
): Promise<{ apiKey: string; baseUrl: string; model: string } | null> {
  const [rows] = await db.query(
    `SELECT base_url, model, api_key_enc
       FROM api_provider_configs
      WHERE tenant_id = ? AND module = ? AND provider = ? AND is_enabled = 1
      LIMIT 1`,
    [tenantId, VISION_MODULE, VISION_PROVIDER]
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  const apiKey = row.api_key_enc ? String(row.api_key_enc).trim() : "";
  const baseUrl = row.base_url ? String(row.base_url).trim() : "";
  const model = row.model ? String(row.model).trim() : "";
  if (!apiKey || !baseUrl || !model) return null;
  return { apiKey, baseUrl, model };
}

export async function saveVisionAiConfig(db: Pool, tenantId: number, input: VisionAiConfigSave): Promise<void> {
  const [rows] = await db.query(
    `SELECT api_key_enc FROM api_provider_configs
      WHERE tenant_id = ? AND module = ? AND provider = ?
      LIMIT 1`,
    [tenantId, VISION_MODULE, VISION_PROVIDER]
  );
  const existingKey = (rows as any[])[0]?.api_key_enc ? String((rows as any[])[0].api_key_enc) : "";
  const nextKey = !isMaskedPlaceholder(input.apiKey) ? String(input.apiKey).trim() : existingKey;
  if (!nextKey) {
    throw new Error("请填写大模型 API Key");
  }
  if (!input.model?.trim()) {
    throw new Error("请填写模型名称");
  }
  if (!input.baseUrl?.trim()) {
    throw new Error("请填写 API 地址（Base URL）");
  }
  const extraJson = JSON.stringify({
    preset: input.preset,
    providerLabel: input.providerLabel?.trim() || input.preset
  });
  const keyUpdate = !isMaskedPlaceholder(input.apiKey);
  if (keyUpdate) {
    await db.query(
      `INSERT INTO api_provider_configs
        (tenant_id, module, provider, base_url, model, api_key_enc, is_enabled, priority_rank, extra_json)
       VALUES (?, ?, ?, ?, ?, ?, 1, 10, ?)
       ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         model = VALUES(model),
         api_key_enc = VALUES(api_key_enc),
         extra_json = VALUES(extra_json),
         is_enabled = 1`,
      [tenantId, VISION_MODULE, VISION_PROVIDER, input.baseUrl.trim(), input.model.trim(), nextKey, extraJson]
    );
  } else {
    await db.query(
      `INSERT INTO api_provider_configs
        (tenant_id, module, provider, base_url, model, api_key_enc, is_enabled, priority_rank, extra_json)
       VALUES (?, ?, ?, ?, ?, ?, 1, 10, ?)
       ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         model = VALUES(model),
         extra_json = VALUES(extra_json),
         is_enabled = 1`,
      [tenantId, VISION_MODULE, VISION_PROVIDER, input.baseUrl.trim(), input.model.trim(), nextKey, extraJson]
    );
  }
}
