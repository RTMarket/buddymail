import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { resolveProvider } from "./providerRouter.js";
import {
  type CommerceVisionProduct,
  openAiCompatibleVisionChat
} from "./emailCommerceAssistantVision.js";
import {
  ensureReplicaVisualAssets,
  sanitizeReplicaNotes
} from "./emailLayoutReplicaEnrich.js";
import { parseLayoutReplicaResponse } from "./emailLayoutReplicaParse.js";

export type LayoutReplicaResult = {
  bodyHtml: string;
  products: CommerceVisionProduct[];
  notes?: string;
};

const LAYOUT_SYSTEM_ZH = `你是邮件模版排版复刻助手。根据截图生成邮件正文 HTML（约 600px 宽）。

【输出格式 — 必须严格遵守，不要用单个 JSON 包裹 HTML】
---BODY_HTML_START---
（这里直接写 HTML 片段，不要转义引号）
---BODY_HTML_END---
---PRODUCTS_JSON---
{"products":[{"title":"页头横幅","price":"","comparePrice":"","bbox":{"left":0,"top":0,"right":1000,"bottom":180}}],"notes":"可选"}

要求：
- 必须写出截图中「主内容区」全部可见文字（标题、段落、表单标签、按钮文字、价格等），不少于 8 个 <p> 或 <span> 块
- 禁止只输出页头图 + "..." 或省略号；登录页须写出 Username/Password 等标签与 Login 按钮样式
- 复刻排版：顶栏背景色、居中对齐、分栏、文字层级；每个文字块 style="color:#RRGGBB"
- 图片用占位符 {{IMG_0}}、{{IMG_1}}…（与 products 一一对应，bbox 相对整图 0~1000）
- 视频区域用 {{VIDEO_0}}…
- 省略：多列导航链接列表、页脚法律链接、SEO 隐藏文案
- 保留：Logo/横幅、正文图片位、主标题、正文、按钮外观（用 <span style="background:#色;color:#色;padding:8px 16px;">按钮文字</span>）
- 禁止 <html><body><table><input><button><form>
- 用 <p>、<span style="...">、<a>、<img> 占位符`;

function sanitizeReplicaHtml(html: string): string {
  let h = String(html ?? "").trim();
  h = h.replace(/^```html?\s*/i, "").replace(/```\s*$/i, "");
  h = h.replace(/<script[\s\S]*?<\/script>/gi, "");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, "");
  if (!h.includes("<p") && !h.includes("<img") && !h.includes("<span") && !h.includes("{{IMG_")) {
    return `<p>${h.replace(/</g, "&lt;")}</p>`;
  }
  return h;
}

export async function replicateEmailTemplateFromScreenshot(opts: {
  env: Env;
  db: Pool;
  tenantId: number;
  imageBase64: string;
  layoutHint?: string;
}): Promise<LayoutReplicaResult> {
  const resolved = await resolveProvider(opts.db, opts.env, opts.tenantId, "vision");
  const apiKey = resolved.apiKey?.trim();
  if (!apiKey) {
    throw new Error("请先在「大模型设置」中保存支持识图的大模型 API Key。");
  }
  const baseUrl = (resolved.baseUrl || opts.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  const model = (resolved.model || "gpt-4o-mini").trim();

  const baseHint = opts.layoutHint?.trim() ? `补充：${opts.layoutHint.trim()}` : "";
  async function callVision(extra?: string): Promise<string> {
    const userText = [
      "快速按分隔符输出：截图中全部可见文字+排版+{{IMG_N}}，与网页主内容提取同等要求，不要省略号。",
      baseHint,
      extra ?? ""
    ]
      .filter(Boolean)
      .join("\n");
    return openAiCompatibleVisionChat({
      apiKey,
      baseUrl,
      model,
      system: LAYOUT_SYSTEM_ZH,
      userText,
      imageBase64: opts.imageBase64,
      maxTokens: 2048,
      timeoutMs: 90_000
    });
  }

  const raw = await callVision();
  const parsed = parseLayoutReplicaResponse(raw);
  let bodyHtml = sanitizeReplicaHtml(parsed.bodyHtml);
  let products = parsed.products;

  const enriched = ensureReplicaVisualAssets(bodyHtml, products);
  bodyHtml = enriched.bodyHtml;
  products = enriched.products;

  const visible = bodyHtml.replace(/<[^>]+>/g, "").trim();
  if (visible.length < 4 && !bodyHtml.includes("{{IMG_") && !bodyHtml.includes("{{VIDEO_") && !products.length) {
    throw new Error("未能从截图复刻出足够内容，请换更清晰图片或更换识图模型。");
  }

  return {
    bodyHtml,
    products,
    notes: sanitizeReplicaNotes(parsed.notes) ?? "已复刻页面排版、文字与图片位。"
  };
}
