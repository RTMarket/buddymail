import dns from "node:dns/promises";
import type { Env } from "../env.js";

export async function mxExists(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

/** Abstract Email Validation API（与 leads 校验逻辑一致） */
export async function abstractValidate(email: string, apiKey: string) {
  const url = new URL("https://emailvalidation.abstractapi.com/v1/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);

  const resp = await fetch(url.toString());
  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    return { ok: false as const, error: data };
  }

  const deliverability = String(data?.deliverability ?? "");
  const isMx = Boolean(data?.is_mx_found);
  const isSmtp = data?.is_smtp_valid;

  let status: "valid" | "invalid" | "risky" | "unverified" = "risky";
  if (deliverability === "DELIVERABLE" && isMx) status = "valid";
  if (deliverability === "UNDELIVERABLE" || data?.is_valid_format === false) status = "invalid";

  return {
    ok: true as const,
    status,
    meta: {
      provider: "abstract",
      deliverability,
      quality_score: data?.quality_score ?? null,
      is_mx_found: isMx,
      is_smtp_valid: isSmtp ?? null,
      raw: data
    }
  };
}

/**
 * 无邮箱验证码注册：要求域名有 MX；若配置了 ABSTRACT_EMAIL_VALIDATION_KEY 则须 Abstract 判定为 deliverable。
 */
export async function assertRegisterEmailReachable(email: string, env: Env): Promise<void> {
  const em = email.trim().toLowerCase();
  const domain = em.split("@")[1];
  if (!domain) {
    throw new Error("邮箱格式不正确");
  }
  if (env.AUTH_REGISTER_EMAIL_MX_REQUIRED) {
    if (!(await mxExists(domain))) {
      throw new Error("该邮箱域名无有效收信记录（MX），请填写真实常用邮箱");
    }
  }
  const key = env.ABSTRACT_EMAIL_VALIDATION_KEY?.trim();
  if (key) {
    const r = await abstractValidate(em, key);
    if (!r.ok) {
      throw new Error("邮箱有效性校验服务暂不可用，请稍后重试");
    }
    if (r.status !== "valid") {
      throw new Error("邮箱可能无效或无法投递，请更换其他常用邮箱");
    }
  }
}
