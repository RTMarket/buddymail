import type { Pool } from "mysql2/promise";
import { env } from "../env.js";

/**
 * 开源版通用 AI 对话客户端（OpenAI 兼容接口）。
 * 替代商业版 Agent Brain：凭证只从 env 读取（AI_PROVIDER=openai|deepseek）。
 */

export type AgentBrainCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerLabel: string;
};

export type AgentBrainChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function extractAssistantText(data: unknown): string {
  const d = data as Record<string, unknown> | null;
  const choices = d?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const choice = choices[0] as Record<string, unknown> | undefined;
  const msg = (choice?.message ?? choice) as Record<string, unknown> | undefined;
  const raw = msg?.content;
  if (typeof raw === "string") return raw.trim();
  return "";
}

export async function runAgentBrainChat(opts: {
  creds: AgentBrainCredentials;
  messages: AgentBrainChatMessage[];
  systemPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  const { creds, messages, systemPrompt, maxTokens = 2000 } = opts;
  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const payloadMessages: AgentBrainChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-24)
  ];
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: creds.model,
      temperature: 0.45,
      max_tokens: maxTokens,
      messages: payloadMessages
    }),
    signal: AbortSignal.timeout(120000)
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`AI 请求失败（HTTP ${resp.status}）：${text.slice(0, 240)}`);
  }
  const parsed = JSON.parse(text) as unknown;
  const out = extractAssistantText(parsed);
  if (!out) throw new Error("AI 返回为空");
  return out;
}

/** 开源版：凭证只从 env 读取；未配置返回 null（调用方应降级处理） */
export async function getAgentBrainCredentials(
  _db: Pool,
  _tenantId: number
): Promise<AgentBrainCredentials | null> {
  if (env.AI_PROVIDER === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      apiKey,
      baseUrl: env.DEEPSEEK_BASE_URL.trim(),
      model: env.DEEPSEEK_MODEL.trim(),
      providerLabel: "DeepSeek (.env)"
    };
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL.trim(),
    model: env.OPENAI_MODEL.trim(),
    providerLabel: "OpenAI (.env)"
  };
}
