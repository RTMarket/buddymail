/** 域名归一化：去协议/路径/端口，转小写 */
function normalizeWebsiteDomainInput(raw: string): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const noProto = s.replace(/^[a-z]+:\/\//, "");
  const host = noProto.split("/")[0].split(":")[0].trim();
  if (!host || !host.includes(".")) return null;
  return host;
}

export const STANDALONE_DEFAULT_FRONTEND_PORT = 8080;
export const STANDALONE_STANDARD_HTTP_PORT = 80;

const STANDALONE_SINGLE_IP_PACK_TIERS = new Set(["email-send-3000", "email-send-30000"]);
const STANDALONE_SINGLE_IP_PACK_VARIANTS = new Set(["single-ip-3k", "single-ip-30k"]);

/**
 * 对外 URL 是否使用标准 HTTP 80（浏览器地址栏不带 :8080）。
 * - 单 IP 日发 3k / 3 万（$39 / $99）专用包：保持既有逻辑。
 * - 通用多机组安装包及其余档位：授权安装完成后为 http://IP 或 http://域名。
 */
export function standaloneUsesStandardHttpPort(
  packVariant?: string | null,
  planTierId?: string | null
): boolean {
  const variant = (packVariant ?? "").trim();
  if (STANDALONE_SINGLE_IP_PACK_VARIANTS.has(variant)) return true;
  const tier = (planTierId ?? "").trim();
  if (STANDALONE_SINGLE_IP_PACK_TIERS.has(tier)) return true;
  if (variant === "default") return true;
  if (tier.startsWith("email-send-")) return true;
  return false;
}

export function standaloneFrontendPortForPack(
  packVariant?: string | null,
  planTierId?: string | null
): number {
  return standaloneUsesStandardHttpPort(packVariant, planTierId)
    ? STANDALONE_STANDARD_HTTP_PORT
    : STANDALONE_DEFAULT_FRONTEND_PORT;
}

/** http://host 或 http://host:8080（port 为 80 时省略 :80） */
export function buildStandaloneHttpOrigin(host: string, frontendPort = STANDALONE_DEFAULT_FRONTEND_PORT): string {
  const h = host.trim().replace(/\/+$/, "");
  if (!h) return "";
  const port = Math.max(1, Math.floor(frontendPort) || STANDALONE_DEFAULT_FRONTEND_PORT);
  if (port === STANDALONE_STANDARD_HTTP_PORT) return `http://${h}`;
  return `http://${h}:${port}`;
}

export type StandaloneSiteEnv = {
  corsOrigin: string;
  publicBaseUrl: string;
  emailUnsubscribeBaseUrl: string;
  frontendPort: number;
};

export function resolveStandaloneSiteEnv(
  serverHost: string,
  domainName: string | null,
  opts?: { packVariant?: string | null; planTierId?: string | null }
): StandaloneSiteEnv {
  const frontendPort = standaloneFrontendPortForPack(opts?.packVariant, opts?.planTierId);
  const domain = domainName ? normalizeWebsiteDomainInput(domainName) : null;
  const host = serverHost.trim();

  if (domain) {
    const domainHttp = buildStandaloneHttpOrigin(domain, frontendPort);
    const ipHttp = buildStandaloneHttpOrigin(host, frontendPort);
    const corsOrigin = host === domain ? domainHttp : `${domainHttp},${ipHttp}`;
    return {
      corsOrigin,
      publicBaseUrl: domainHttp,
      emailUnsubscribeBaseUrl: domainHttp,
      frontendPort
    };
  }

  const ipUrl = buildStandaloneHttpOrigin(host, frontendPort);
  return {
    corsOrigin: ipUrl,
    publicBaseUrl: ipUrl,
    emailUnsubscribeBaseUrl: ipUrl,
    frontendPort
  };
}

export function buildSiteUrl(
  serverHost: string,
  domainName: string | null,
  opts?: { packVariant?: string | null; planTierId?: string | null }
): string {
  const { corsOrigin } = resolveStandaloneSiteEnv(serverHost, domainName, opts);
  return corsOrigin.split(",")[0]!.trim();
}
