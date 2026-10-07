import {
  type CommerceVisionProduct,
  normalizeProducts
} from "./emailCommerceAssistantVision.js";

const BODY_START = "---BODY_HTML_START---";
const BODY_END = "---BODY_HTML_END---";
const PRODUCTS_START = "---PRODUCTS_JSON---";

export type ParsedLayoutReplica = {
  bodyHtml: string;
  products: CommerceVisionProduct[];
  notes?: string;
};

function tryParseDelimiterFormat(raw: string): ParsedLayoutReplica | null {
  const s = raw.indexOf(BODY_START);
  const e = raw.indexOf(BODY_END);
  if (s < 0 || e <= s) return null;
  const bodyHtml = raw.slice(s + BODY_START.length, e).trim();
  if (!bodyHtml) return null;
  let products: CommerceVisionProduct[] = [];
  const pj = raw.indexOf(PRODUCTS_START);
  if (pj >= 0) {
    const chunk = raw.slice(pj + PRODUCTS_START.length).trim();
    const start = chunk.indexOf("{");
    const end = chunk.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        products = normalizeProducts(JSON.parse(chunk.slice(start, end + 1))).products;
      } catch {
        /* products optional */
      }
    }
  }
  return { bodyHtml, products };
}

/** 从畸形 JSON 中尽力抽出 bodyHtml 字符串字段 */
function extractJsonStringField(raw: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"`, "i");
  const m = re.exec(raw);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = "";
  let escaped = false;
  while (i < raw.length) {
    const c = raw[i]!;
    if (escaped) {
      if (c === "n") out += "\n";
      else if (c === "t") out += "\t";
      else if (c === "r") out += "\r";
      else out += c;
      escaped = false;
    } else if (c === "\\") {
      escaped = true;
    } else if (c === '"') {
      break;
    } else {
      out += c;
    }
    i++;
  }
  if (!out.trim() && i >= raw.length) {
    const rest = raw.slice(m.index + m[0].length);
    const endMarkers = ['",\n  "products"', '",\n"products"', '", "products"', '"}'];
    let cut = rest.length;
    for (const mark of endMarkers) {
      const p = rest.indexOf(mark);
      if (p > 0) cut = Math.min(cut, p);
    }
    out = rest.slice(0, cut).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return out.trim() ? out : null;
}

function extractHtmlFragmentFromText(raw: string): string | null {
  const fenced = raw.match(/```html?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const p = raw.match(/(<p[\s\S]{20,})/i);
  if (p?.[1]) return p[1].trim();
  return null;
}

function tryParseJsonFormat(raw: string): ParsedLayoutReplica | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0) return null;
  const slice = end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
  try {
    const parsed = JSON.parse(slice) as Record<string, unknown>;
    return {
      bodyHtml: String(parsed?.bodyHtml ?? "").trim(),
      products: normalizeProducts(parsed).products,
      notes: typeof parsed?.notes === "string" ? parsed.notes : undefined
    };
  } catch {
    const bodyHtml = extractJsonStringField(raw, "bodyHtml");
    if (!bodyHtml) return null;
    let products: CommerceVisionProduct[] = [];
    try {
      if (end > start) {
        products = normalizeProducts(JSON.parse(slice)).products;
      }
    } catch {
      const prodStart = raw.indexOf('"products"');
      if (prodStart >= 0) {
        const sub = raw.slice(prodStart);
        const ps = sub.indexOf("[");
        const pe = sub.lastIndexOf("]");
        if (ps >= 0 && pe > ps) {
          try {
            products = normalizeProducts({ products: JSON.parse(sub.slice(ps, pe + 1)) }).products;
          } catch {
            /* ignore */
          }
        }
      }
    }
    return { bodyHtml, products };
  }
}

export function parseLayoutReplicaResponse(raw: string): ParsedLayoutReplica {
  const text = String(raw ?? "").trim();
  if (!text) {
    throw new Error("识图模型返回为空，请检查模型是否支持视觉输入。");
  }

  const delim = tryParseDelimiterFormat(text);
  if (delim?.bodyHtml) return delim;

  const json = tryParseJsonFormat(text);
  if (json?.bodyHtml) return json;

  const htmlOnly = extractHtmlFragmentFromText(text);
  if (htmlOnly) {
    return { bodyHtml: htmlOnly, products: [] };
  }

  throw new Error(
    "识图结果无法解析（JSON 不完整）。请换 gpt-4o-mini / 硅基 Nex-N2-Pro 等模型后重试，或改用「上传图片」。"
  );
}

export function formatVisionApiError(data: unknown, status: number, rawText?: string): string {
  if (!data || typeof data !== "object") {
    return rawText?.trim()
      ? `识图接口错误（HTTP ${status}）：${rawText.trim().slice(0, 320)}`
      : `识图接口错误（HTTP ${status}）`;
  }
  const o = data as Record<string, unknown>;
  const topMsg = typeof o.message === "string" ? o.message.trim() : "";
  const topCode = o.code;
  if (topMsg) {
    const codePart =
      topCode !== undefined && topCode !== null ? `code ${String(topCode)}` : `HTTP ${status}`;
    if (/^unknown error$/i.test(topMsg)) {
      return `识图接口错误（${codePart}）：${topMsg}。请检查 API Key、模型名是否支持识图、账户余额。`;
    }
    return `识图接口错误（${codePart}）：${topMsg}`;
  }
  const err = o.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const eo = err as Record<string, unknown>;
    const em = eo.message;
    if (typeof em === "string" && em.trim()) {
      const ec = eo.code;
      return ec !== undefined ? `识图接口错误（${String(ec)}）：${em.trim()}` : em.trim();
    }
    if (em && typeof em === "object") {
      try {
        return JSON.stringify(em).slice(0, 400);
      } catch {
        /* fall through */
      }
    }
  }
  for (const k of ["detail", "msg", "error_message", "reason"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  try {
    const s = JSON.stringify(o);
    if (s && s !== "{}") return `识图接口错误（HTTP ${status}）：${s.slice(0, 400)}`;
  } catch {
    /* ignore */
  }
  return `识图接口错误（HTTP ${status}）`;
}
