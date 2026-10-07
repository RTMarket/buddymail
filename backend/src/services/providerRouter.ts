import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";

export type ProviderModule = "copy" | "image" | "video" | "leads" | "vision";

export type ResolvedProvider = {
  provider: string;
  baseUrl?: string | null;
  model?: string | null;
  apiKey?: string | null;
  extra?: Record<string, unknown> | null;
};

export async function resolveProvider(db: Pool, env: Env, tenantId: number, module: ProviderModule): Promise<ResolvedProvider> {
  const [rows] = await db.query(
    `SELECT provider, base_url, model, api_key_enc, extra_json
       FROM api_provider_configs
      WHERE tenant_id = ? AND module = ? AND is_enabled = 1
      ORDER BY priority_rank ASC, id ASC
      LIMIT 1`,
    [tenantId, module]
  );
  const row = (rows as any[])[0];
  if (row) {
    return {
      provider: String(row.provider),
      baseUrl: row.base_url ?? null,
      model: row.model ?? null,
      apiKey: row.api_key_enc ?? null,
      extra: row.extra_json ?? null
    };
  }
  if (module === "leads") {
    return {
      provider: env.LEADS_SEARCH_API_URL ? "external" : "stub",
      baseUrl: env.LEADS_SEARCH_API_URL ?? null,
      apiKey: env.LEADS_SEARCH_API_KEY ?? null
    };
  }
  if (env.AI_PROVIDER === "deepseek") {
    return {
      provider: "deepseek",
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
      apiKey: env.DEEPSEEK_API_KEY ?? null
    };
  }
  if (module === "vision") {
    const model =
      env.OPENAI_MODEL.includes("gpt-4") || env.OPENAI_MODEL.includes("4o")
        ? env.OPENAI_MODEL
        : "gpt-4o-mini";
    return {
      provider: "openai",
      baseUrl: env.OPENAI_BASE_URL,
      model,
      apiKey: env.OPENAI_API_KEY ?? null
    };
  }
  return {
    provider: "openai",
    baseUrl: env.OPENAI_BASE_URL,
    model: module === "image" ? env.OPENAI_IMAGE_MODEL : env.OPENAI_MODEL,
    apiKey: env.OPENAI_API_KEY ?? null
  };
}
