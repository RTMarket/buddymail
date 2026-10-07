import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { getVisionAiCredentials } from "./emailVisionAiConfig.js";

export const EMAIL_TEMPLATE_TRANSLATE_LANGUAGE_CODES = [
  "en",
  "ja",
  "ko",
  "es",
  "de",
  "fr",
  "pt",
  "it",
  "ru",
  "zh-CN",
  "zh-TW",
  "ar",
  "th",
  "vi",
  "id",
  "nl",
  "pl",
  "tr"
] as const;

export type EmailTemplateTranslateLanguageCode = (typeof EMAIL_TEMPLATE_TRANSLATE_LANGUAGE_CODES)[number];

const LANGUAGE_LABELS: Record<EmailTemplateTranslateLanguageCode, string> = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  de: "German",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  ar: "Arabic",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish"
};

export function parseEmailTemplateTranslateLanguage(raw: unknown): EmailTemplateTranslateLanguageCode | null {
  const code = String(raw ?? "").trim();
  if (!code) return null;
  return (EMAIL_TEMPLATE_TRANSLATE_LANGUAGE_CODES as readonly string[]).includes(code)
    ? (code as EmailTemplateTranslateLanguageCode)
    : null;
}

function stripAiFences(text: string): string {
  let s = text.trim();
  const fenced = /^```(?:html|htm)?\s*([\s\S]*?)```$/i.exec(s);
  if (fenced) s = fenced[1]!.trim();
  return s;
}

function extractOpenAiCompatibleAssistantText(data: unknown): string {
  const d = data as Record<string, unknown> | null;
  const choices = d?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const choice = choices[0] as Record<string, unknown> | undefined;
  const msg = (choice?.message ?? choice) as Record<string, unknown> | undefined;
  if (!msg) return "";
  const raw = msg.content;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const joined = raw
      .map((p: unknown) => {
        if (typeof p === "string") return p;
        const o = p as Record<string, unknown>;
        if (typeof o?.text === "string") return o.text;
        if (typeof o?.content === "string") return o.content;
        return "";
      })
      .join("");
    if (joined.trim()) return joined.trim();
  }
  return "";
}

async function openAiCompatibleChat(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.3,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user }
    ]
  };
  if (opts.maxTokens != null) body.max_tokens = opts.maxTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = (await resp.json()) as unknown;
    if (!resp.ok) {
      const err = data as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `AI request failed: HTTP ${resp.status}`);
    }
    const text = extractOpenAiCompatibleAssistantText(data);
    if (!text) throw new Error("AI 未返回翻译结果，请换用支持文本输出的模型后重试。");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTranslateCredentials(
  db: Pool,
  tenantId: number,
  env: Env
): Promise<{ apiKey: string; baseUrl: string; model: string }> {
  const creds = await getVisionAiCredentials(db, tenantId);
  if (creds?.apiKey?.trim()) {
    return {
      apiKey: creds.apiKey.trim(),
      baseUrl: creds.baseUrl.trim(),
      model: creds.model.trim() || env.OPENAI_MODEL
    };
  }
  if (env.AI_PROVIDER === "deepseek") {
    throw new Error("正文翻译需 OpenAI 兼容文本模型；请在模版页「Vision AI 设置」保存 API Key，或配置 OPENAI_API_KEY。");
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未配置 AI：请在模版页保存 Vision AI 的 API Key，或在服务器设置 OPENAI_API_KEY。");
  }
  return {
    apiKey,
    baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim(),
    model: (env.OPENAI_MODEL || "gpt-4o-mini").trim()
  };
}

export async function translateEmailTemplateBody(opts: {
  db: Pool;
  tenantId: number;
  env: Env;
  targetLanguage: EmailTemplateTranslateLanguageCode;
  mode: "full" | "selection";
  html?: string;
  plainText?: string;
}): Promise<{ html: string }> {
  const targetName = LANGUAGE_LABELS[opts.targetLanguage];
  const creds = await resolveTranslateCredentials(opts.db, opts.tenantId, opts.env);

  const system =
    "You are a professional email marketing translator. " +
    "Preserve ALL HTML tags, attributes, inline styles, class names, URLs, merge tags like {{name}}, and document structure exactly. " +
    "Only translate human-readable visible text. Do not add explanations or markdown fences. " +
    "Return ONLY the translated content in the same format (HTML fragment or plain text) as the input.";

  if (opts.mode === "selection") {
    const fragment = (opts.html?.trim() || opts.plainText?.trim() || "").trim();
    if (!fragment) throw new Error("请先选中正文中的文字，或选择翻译全文。");
    const user =
      `Translate the following email body fragment to ${targetName} (${opts.targetLanguage}).\n\n` +
      fragment;
    const raw = await openAiCompatibleChat({
      ...creds,
      system,
      user,
      maxTokens: 4096,
      temperature: 0.25
    });
    const translated = stripAiFences(raw);
    if (!translated.trim()) throw new Error("翻译结果为空，请重试。");
    return { html: translated };
  }

  const html = (opts.html ?? "").trim();
  if (!html) throw new Error("正文为空，请先输入邮件内容。");
  const user =
    `Translate the following HTML email body to ${targetName} (${opts.targetLanguage}). ` +
    "Keep all markup and styles; translate visible text only.\n\n" +
    html;
  const raw = await openAiCompatibleChat({
    ...creds,
    system,
    user,
    maxTokens: 8192,
    temperature: 0.25
  });
  const translated = stripAiFences(raw);
  if (!translated.trim()) throw new Error("翻译结果为空，请重试。");
  return { html: translated };
}
