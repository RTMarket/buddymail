import { resolveIpIdentity, type IpIdentityCategory } from "./ipIdentityLabel.js";

const PRIVATE_IP =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost$)/i;

export type IpGeoIdentity = {
  city: string;
  identityLabel: string;
  identityCategory: IpIdentityCategory;
  identityHint: string;
};

type IpApiGeo = {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  org?: string;
  reverse?: string;
  hosting?: boolean;
  proxy?: boolean;
};

const geoCache = new Map<string, { at: number; data: IpGeoIdentity }>();
const CACHE_MS = 60 * 60 * 1000;

function isPrivateIp(ip: string): boolean {
  const t = ip.trim();
  if (!t) return true;
  return PRIVATE_IP.test(t);
}

function cityLabelFromGeo(j: IpApiGeo): string {
  if (j.status !== "success") return "未知";
  const region = j.regionName?.trim();
  const city = j.city?.trim();
  const country = j.country?.trim();
  if (country === "中国" || country === "China") {
    const parts = [region, city].filter(Boolean);
    return parts.join("·") || "未知";
  }
  const parts = [country, region, city].filter(Boolean);
  return parts.join("·") || "未知";
}

async function fetchIpGeoIdentity(ip: string): Promise<IpGeoIdentity> {
  const raw = ip.trim();
  if (!raw || isPrivateIp(raw)) {
    return {
      city: "内网/本机",
      identityLabel: "内网",
      identityCategory: "private",
      identityHint: ""
    };
  }

  const cached = geoCache.get(raw);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(raw)}?fields=status,country,regionName,city,isp,org,reverse,hosting,proxy&lang=zh-CN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) {
      return { city: "未知", identityLabel: "—", identityCategory: "unknown", identityHint: "" };
    }
    const j = (await res.json()) as IpApiGeo;
    const city = cityLabelFromGeo(j);
    const identity = resolveIpIdentity(raw, j);
    const data: IpGeoIdentity = { city, ...identity };
    geoCache.set(raw, { at: Date.now(), data });
    return data;
  } catch {
    const identity = resolveIpIdentity(raw);
    return { city: "未知", ...identity, identityCategory: "unknown" as const };
  }
}

/** 城市 + 归属称呼（爬虫/VPS 等），一次查询带缓存 */
export async function lookupIpGeoIdentity(ip: string): Promise<IpGeoIdentity> {
  return fetchIpGeoIdentity(ip);
}

/** 管理后台统计：将访问 IP 解析为「省·市」展示名 */
export async function lookupIpCityLabel(ip: string): Promise<string> {
  const info = await lookupIpGeoIdentity(ip);
  return info.city;
}

/** 按已聚合的 IP 次数解析城市（避免拉全表逐条 IP） */
export async function aggregateVisitIpsByCityFromCounts(
  rows: Array<{ ip: string; count: number }>,
  opts?: { maxUniqueIps?: number }
): Promise<Array<{ city: string; count: number }>> {
  const maxUnique = opts?.maxUniqueIps ?? 60;
  const sorted = [...rows]
    .filter((r) => r.ip.trim() && r.count > 0)
    .sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, maxUnique);
  const rest = sorted.slice(maxUnique);
  const restCount = rest.reduce((s, r) => s + r.count, 0);

  const cityTotals = new Map<string, number>();
  const batchSize = 10;
  for (let i = 0; i < top.length; i += batchSize) {
    const chunk = top.slice(i, i + batchSize);
    const labels = await Promise.all(chunk.map((r) => lookupIpCityLabel(r.ip)));
    chunk.forEach((r, idx) => {
      const city = labels[idx] ?? "未知";
      cityTotals.set(city, (cityTotals.get(city) ?? 0) + r.count);
    });
  }
  if (restCount > 0) {
    cityTotals.set("其他 IP", (cityTotals.get("其他 IP") ?? 0) + restCount);
  }
  return [...cityTotals.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);
}

/** @deprecated 优先使用 aggregateVisitIpsByCityFromCounts */
export async function aggregateVisitIpsByCity(
  ips: string[]
): Promise<Array<{ city: string; count: number }>> {
  const byIp = new Map<string, number>();
  for (const ip of ips) {
    const k = ip.trim();
    if (!k) continue;
    byIp.set(k, (byIp.get(k) ?? 0) + 1);
  }
  return aggregateVisitIpsByCityFromCounts(
    [...byIp.entries()].map(([ip, count]) => ({ ip, count }))
  );
}

export type VisitIpDetailRow = {
  ip: string;
  city: string;
  identityLabel: string;
  identityCategory: IpIdentityCategory;
  count: number;
};

/** 按 IP 聚合访问次数，并解析城市与归属（管理后台 IP 明细） */
export async function aggregateVisitIpDetails(
  ips: string[],
  opts?: { maxUniqueIps?: number }
): Promise<VisitIpDetailRow[]> {
  const maxUnique = opts?.maxUniqueIps ?? 200;
  const byIp = new Map<string, number>();
  for (const ip of ips) {
    const k = ip.trim();
    if (!k) continue;
    byIp.set(k, (byIp.get(k) ?? 0) + 1);
  }
  const entries = [...byIp.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxUnique);
  const batchSize = 8;
  const rows: VisitIpDetailRow[] = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    const infos = await Promise.all(chunk.map(([ip]) => lookupIpGeoIdentity(ip)));
    chunk.forEach(([ip, count], idx) => {
      const info = infos[idx];
      rows.push({
        ip,
        city: info?.city ?? "未知",
        identityLabel: info?.identityLabel ?? "—",
        identityCategory: info?.identityCategory ?? "unknown",
        count
      });
    });
  }
  return rows;
}
