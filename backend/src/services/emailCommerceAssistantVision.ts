import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { formatVisionApiError } from "./emailLayoutReplicaParse.js";
import { resolveProvider } from "./providerRouter.js";
import { unwrapFetchError } from "./visionApiShared.js";

export type CommerceVisionProduct = {
  title: string;
  price: string;
  comparePrice: string;
  bbox: { left: number; top: number; right: number; bottom: number };
};

export type CommerceVisionParseResult = {
  products: CommerceVisionProduct[];
  notes?: string;
};

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!.trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("AI 未返回可解析的商品 JSON");
}

function clampBbox(raw: Record<string, unknown>): CommerceVisionProduct["bbox"] | null {
  const n = (k: string) => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const left = n("left") ?? n("x");
  const top = n("top") ?? n("y");
  const right = n("right") ?? (typeof raw.width === "number" && left != null ? left + raw.width : null);
  const bottom = n("bottom") ?? (typeof raw.height === "number" && top != null ? top + raw.height : null);
  if (left == null || top == null || right == null || bottom == null) return null;
  const l = Math.max(0, Math.min(1000, left));
  const t = Math.max(0, Math.min(1000, top));
  const r = Math.max(l + 8, Math.min(1000, right));
  const b = Math.max(t + 8, Math.min(1000, bottom));
  return { left: l, top: t, right: r, bottom: b };
}

export function normalizeProducts(data: unknown): CommerceVisionParseResult {
  const root = data as Record<string, unknown>;
  const list = Array.isArray(root?.products) ? root.products : Array.isArray(data) ? data : [];
  const products: CommerceVisionProduct[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const bbox = clampBbox((o.bbox as Record<string, unknown>) ?? o);
    if (!bbox) continue;
    products.push({
      title: String(o.title ?? o.name ?? "").trim(),
      price: String(o.price ?? o.salePrice ?? "").trim(),
      comparePrice: String(o.comparePrice ?? o.originalPrice ?? o.wasPrice ?? "").trim(),
      bbox
    });
  }
  return {
    products,
    notes: typeof root?.notes === "string" ? root.notes : undefined
  };
}

function extractAssistantText(msg: Record<string, unknown> | undefined): string {
  if (!msg) return "";
  const content = msg.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((p: unknown) => {
        if (typeof p === "string") return p;
        const o = p as Record<string, unknown>;
        return typeof o?.text === "string" ? o.text : "";
      })
      .join("");
    if (joined.trim()) return joined.trim();
  }
  const reasoning = msg.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning.trim();
  return "";
}

export async function openAiCompatibleVisionChat(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  userText: string;
  imageBase64: string;
  maxTokens?: number;
  /** 默认 180s；探针测试建议 45s */
  timeoutMs?: number;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const imageUrl = opts.imageBase64.startsWith("data:")
    ? opts.imageBase64
    : `data:image/jpeg;base64,${opts.imageBase64}`;
  const host = opts.baseUrl.toLowerCase();
  const isSilicon = host.includes("siliconflow");
  const userContent = isSilicon
    ? [
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        { type: "text", text: opts.userText }
      ]
    : [
        { type: "text", text: opts.userText },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
      ];
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.15,
    max_tokens: opts.maxTokens ?? 4096,
    stream: false,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent }
    ]
  };
  if (isSilicon) {
    body.enable_thinking = false;
  }
  const timeoutMs = Math.max(5000, Math.min(180_000, opts.timeoutMs ?? 180_000));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e: unknown) {
    const name = (e as Error)?.name;
    if (name === "AbortError") {
      const sec = Math.round(timeoutMs / 1000);
      throw new Error(`识图请求超时（${sec}s）。请检查 Base URL / 模型名 / 网络，或换更快视觉模型。`);
    }
    throw new Error(unwrapFetchError(e));
  } finally {
    clearTimeout(timer);
  }
  const respText = await resp.text();
  let data: Record<string, unknown> = {};
  if (respText.trim()) {
    try {
      data = JSON.parse(respText) as Record<string, unknown>;
    } catch {
      if (!resp.ok) {
        throw new Error(`识图接口返回非 JSON（HTTP ${resp.status}）：${respText.trim().slice(0, 320)}`);
      }
    }
  }
  if (!resp.ok) {
    const errMsg = formatVisionApiError(data, resp.status, respText);
    if (/image|vision|multimodal|modalities|does not support|unsupported/i.test(errMsg)) {
      throw new Error(
        "当前模型不支持图片输入（非视觉模型）。请在设置中换 gpt-4o-mini、豆包视觉、硅基 Nex-N2-Pro 等识图模型。"
      );
    }
    throw new Error(errMsg);
  }
  const choices = data?.choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error("模型返回为空，请检查模型是否支持识图。");
  const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
  const text = extractAssistantText(msg);
  if (text) return text;
  const errHint = String(
    (data?.error as Record<string, unknown> | undefined)?.message ??
      (typeof data?.message === "string" ? data.message : "")
  ).toLowerCase();
  if (
    errHint.includes("image") ||
    errHint.includes("vision") ||
    errHint.includes("multimodal") ||
    errHint.includes("modalities")
  ) {
    throw new Error(
      "当前模型不支持图片输入（非视觉模型）。请在设置中换 gpt-4o-mini、豆包视觉、硅基 Nex-N2-Pro 等识图模型。"
    );
  }
  throw new Error("模型未返回可解析文本。请确认模型支持 image_url 视觉输入（如 gpt-4o-mini、nex-agi/Nex-N2-Pro）。");
}

const SYSTEM_ZH = `你是电商店铺截图分析助手（淘宝/天猫/拼多多/抖音小店/亚马逊列表页等）。
任务：从一张「含多个商品卡片」的店铺截图中，识别每个独立商品卡片，提取可见标题、售价、划线原价（如有），并给出商品主图+标题+价格所在区域的矩形框。

只输出 JSON，不要 markdown，不要解释：
{
  "products": [
    {
      "title": "商品标题",
      "price": "¥99",
      "comparePrice": "¥199",
      "bbox": { "left": 0, "top": 0, "right": 500, "bottom": 400 }
    }
  ],
  "notes": "可选，识别说明"
}

规则：
- bbox 坐标系：相对整张截图，0~1000，left/top 为左上，right/bottom 为右下。
- 每个 bbox 应包住该商品的图片+标题+价格，不要多个商品合并成一个框。
- 跳过顶部导航、底部 Tab、纯广告横幅；只保留可售商品卡片。
- 看不清的价格留空字符串；标题尽量完整。
- 按从上到下、从左到右排序。`;

export async function parseCommerceScreenshotVision(opts: {
  env: Env;
  db: Pool;
  tenantId: number;
  imageBase64: string;
  columnsHint?: number;
  layoutHint?: string;
}): Promise<CommerceVisionParseResult> {
  const resolved = await resolveProvider(opts.db, opts.env, opts.tenantId, "vision");
  const apiKey = resolved.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "请先在「智能识图」设置中保存支持识图的大模型 API Key（OpenAI 兼容接口），或使用电商邮件助手的「按列网格拆分」。"
    );
  }
  const baseUrl = (resolved.baseUrl || opts.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  const model = (resolved.model || "gpt-4o-mini").trim();
  const cols = opts.columnsHint && opts.columnsHint >= 1 && opts.columnsHint <= 5 ? opts.columnsHint : 3;
  const hint = opts.layoutHint?.trim();
  const userText = [
    `这是一张电商店铺商品列表截图。用户希望邮件排版约每行 ${cols} 个商品。`,
    hint ? `用户补充说明：${hint}` : "",
    "请识别图中每个商品卡片，返回 JSON。"
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openAiCompatibleVisionChat({
    apiKey,
    baseUrl,
    model,
    system: SYSTEM_ZH,
    userText,
    imageBase64: opts.imageBase64
  });
  const parsed = normalizeProducts(extractJsonObject(raw));
  if (!parsed.products.length) {
    throw new Error("未识别到商品区域，请换更清晰截图，或使用「按列网格拆分」。");
  }
  return parsed;
}
