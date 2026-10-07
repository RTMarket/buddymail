import type { DnsRecordItem } from "./emailDedicatedDnsRecords.js";

/** 用户在 DNS 控制台管理的根域（如 mail.example.com → example.com） */
export function dnsZoneRootFromSenderDomain(senderDomain: string): string {
  const parts = senderDomain.trim().toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/**
 * 腾讯云 / 阿里云等：主机记录框只填子域前缀，面板会自动追加 `.bigsocialboss.top`。
 * 例：mail.bigsocialboss.top → `mail`；default._domainkey.mail.bigsocialboss.top → `default._domainkey.mail`
 */
export function hostRecordLabelForDnsPanel(fqdnHost: string, dnsZone: string): string {
  const h = fqdnHost.trim().toLowerCase().replace(/\.$/, "");
  const z = dnsZone.trim().toLowerCase().replace(/\.$/, "");
  if (!h || !z) return h;
  if (h === z) return "@";
  const suffix = `.${z}`;
  if (h.endsWith(suffix)) return h.slice(0, -suffix.length) || "@";
  return h;
}

export function parseMxRecordValue(
  value: string,
  mxPriority?: number | null
): { priority: number; exchange: string } {
  const raw = value.trim();
  const priFromField =
    mxPriority != null && Number.isFinite(Number(mxPriority)) ? Number(mxPriority) : null;
  const mxPrefix = raw.match(/^MX\s*(\d+)\s+(.+)$/is);
  if (mxPrefix) {
    return {
      priority: priFromField ?? Number(mxPrefix[1]),
      exchange: mxPrefix[2].trim().replace(/\.$/, "")
    };
  }
  const priSpace = raw.match(/^(\d+)\s+(.+)$/s);
  if (priSpace) {
    return {
      priority: priFromField ?? Number(priSpace[1]),
      exchange: priSpace[2].trim().replace(/\.$/, "")
    };
  }
  return {
    priority: priFromField ?? 10,
    exchange: raw.replace(/\.$/, "")
  };
}

/** MX 记录值：优先发件域 FQDN，并修正旧数据中的常见拼写错误 */
export function resolveMxExchangeForPanel(
  exchange: string,
  senderDomain?: string | null
): string {
  const sender = (senderDomain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (sender) return sender;
  let ex = exchange.trim().replace(/\.$/, "").toLowerCase();
  if (ex.includes("onlien")) ex = ex.replace(/onlien/g, "online");
  return ex;
}

/** 为面板展示补全 hostRecord / dnsZone / mxPriority（兼容旧数据） */
export function enrichDnsRecordForPanel(
  rec: DnsRecordItem,
  senderDomain?: string | null
): DnsRecordItem & { hostRecord: string; dnsZone: string } {
  const zone =
    rec.dnsZone?.trim() ||
    dnsZoneRootFromSenderDomain(senderDomain ?? rec.host);
  const hostRecord = rec.hostRecord?.trim() || hostRecordLabelForDnsPanel(rec.host, zone);
  const type = rec.type.trim().toUpperCase();
  if (type === "MX") {
    const { priority, exchange } = parseMxRecordValue(rec.value, rec.mxPriority);
    const value = resolveMxExchangeForPanel(exchange, senderDomain);
    return {
      ...rec,
      dnsZone: zone,
      hostRecord,
      mxPriority: priority,
      value,
      note: rec.note
    };
  }
  return { ...rec, dnsZone: zone, hostRecord };
}

/** 返回给前端前统一 MX 展示/复制口径（修复旧数据中 value 含「10 host」或 ptr 拼写错误） */
export function enrichDnsRecordsForPanel(
  records: DnsRecordItem[],
  senderDomain?: string | null
): Array<DnsRecordItem & { hostRecord: string; dnsZone: string }> {
  return records.map((r) => enrichDnsRecordForPanel(r, senderDomain));
}
