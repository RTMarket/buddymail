import dns from "node:dns/promises";
import {
  validateDedicatedSenderDomain,
  validateDedicatedFromEmail
} from "./dedicatedMailServerGroup.js";

export type DedicatedSenderPrecheckResult = {
  ok: boolean;
  hardErrors: string[];
  warnings: string[];
  mxHosts: string[];
};

function apexFromSenderDomain(senderDomain: string): string {
  const parts = senderDomain.trim().toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

async function resolveMxHosts(host: string): Promise<string[]> {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return [];
  try {
    const mx = await dns.resolveMx(h);
    return mx
      .sort((a, b) => a.priority - b.priority)
      .map((r) => String(r.exchange ?? "").trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    throw e;
  }
}

/**
 * P3-2：提交前 DNS 软检查（MX 是否存在 / 是否指向常见邮局），格式校验仍走 validateDedicatedSenderProfile。
 */
export async function precheckDedicatedSenderDomainDns(
  senderDomain: string,
  fromEmail?: string | null
): Promise<DedicatedSenderPrecheckResult> {
  const hardErrors: string[] = [];
  const warnings: string[] = [];

  const domainCheck = validateDedicatedSenderDomain(senderDomain);
  if (!domainCheck.ok) {
    hardErrors.push(domainCheck.message);
    return { ok: false, hardErrors, warnings, mxHosts: [] };
  }

  const domain = senderDomain.trim().toLowerCase();
  if (fromEmail?.trim()) {
    const emailCheck = validateDedicatedFromEmail(fromEmail, domain);
    if (!emailCheck.ok) hardErrors.push(emailCheck.message);
  }

  if (hardErrors.length > 0) {
    return { ok: false, hardErrors, warnings, mxHosts: [] };
  }

  let mxHosts: string[] = [];
  try {
    mxHosts = await resolveMxHosts(domain);
  } catch {
    warnings.push(
      `暂时无法查询 ${domain} 的 MX 记录，请确认已在 DNS 控制台为该子域配置 MX（推送 DNS 后由平台生成）。`
    );
  }

  if (mxHosts.length === 0) {
    warnings.push(
      `未检测到 ${domain} 的 MX 记录。新申请可继续提交；平台推送 DNS 后请按指引补全 MX。`
    );
  } else {
    const consumerMx = /(google|gmail|outlook|microsoft|zoho|yandex|qq\.com|163\.com|126\.com)/i;
    if (mxHosts.some((h) => consumerMx.test(h))) {
      warnings.push(
        `当前 MX 指向常见第三方邮局（${mxHosts.slice(0, 2).join("、")}）。专线发信须改为您自己的 Relay/Mail 记录，请勿与现有企业邮箱 MX 冲突。`
      );
    }
  }

  const apex = apexFromSenderDomain(domain);
  if (apex && apex !== domain) {
    try {
      const apexMx = await resolveMxHosts(apex);
      if (apexMx.length > 0 && mxHosts.length === 0) {
        warnings.push(
          `主域 ${apex} 已有 MX，而子域 ${domain} 尚无 MX。推送 DNS 后请在子域添加平台提供的 MX，勿仅依赖主域 MX。`
        );
      }
    } catch {
      /* ignore apex lookup errors */
    }
  }

  return { ok: hardErrors.length === 0, hardErrors, warnings, mxHosts };
}
