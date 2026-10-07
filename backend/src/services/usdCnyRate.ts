import type { Env } from "../env.js";

let cache: { rate: number; at: number } | null = null;
const CACHE_MS = 55 * 60 * 1000;

/**
 * 美元兑人民币中间价（1 USD = rate CNY），用于邮件套餐支付宝 PC 支付金额。
 * 优先读环境变量 ALIPAY_USD_CNY_RATE；否则请求 Frankfurter 公共接口并短时缓存。
 */
export async function getUsdToCnyRate(env: Pick<Env, "ALIPAY_USD_CNY_RATE">): Promise<number> {
  const fixed = env.ALIPAY_USD_CNY_RATE;
  if (typeof fixed === "number" && Number.isFinite(fixed) && fixed > 0) {
    return fixed;
  }

  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.rate;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=CNY", { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`Frankfurter HTTP ${res.status}`);
    }
    const j = (await res.json()) as { rates?: { CNY?: number } };
    const r = j.rates?.CNY;
    if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) {
      throw new Error("Frankfurter missing CNY rate");
    }
    cache = { rate: r, at: now };
    return r;
  } catch {
    if (cache) return cache.rate;
    throw new Error(usdCnyRateErrorMessage());
  } finally {
    clearTimeout(timer);
  }
}

export function usdCnyRateErrorMessage(): string {
  return (
    "无法获取美元兑人民币汇率，请稍后重试；或在服务器 backend/.env 设置 ALIPAY_USD_CNY_RATE（正数，例如 7.20）作为固定汇率。"
  );
}
