/** 专线 DNS 在腾讯云 / 阿里云等面板上的展示与复制（与后端 dedicatedDnsPanelLabels 口径一致） */

export type DedicatedDnsRecordInput = {
  host: string;
  type: string;
  value: string;
  verified?: boolean;
  note?: string;
  hostRecord?: string;
  dnsZone?: string;
  mxPriority?: number;
};

export type DedicatedDnsPanelRow = {
  fqdnHost: string;
  hostRecord: string;
  dnsZone: string;
  type: string;
  value: string;
  mxPriority: number | null;
  note?: string;
  verified?: boolean;
};

export function dnsZoneRootFromSenderDomain(senderDomain: string): string {
  const parts = senderDomain.trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  const twoLabelPublicSuffixes = new Set([
    "it.com",
    "co.uk",
    "org.uk",
    "me.uk",
    "com.cn",
    "net.cn",
    "org.cn",
    "com.au",
    "net.au",
    "co.nz",
    "co.jp",
    "com.br",
    "com.hk",
    "com.tw",
    "co.kr",
    "co.in"
  ]);
  if (twoLabelPublicSuffixes.has(last2) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return last2;
}

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

export function toDedicatedDnsPanelRow(
  rec: DedicatedDnsRecordInput,
  senderDomain?: string | null
): DedicatedDnsPanelRow {
  const zone = dnsZoneRootFromSenderDomain(senderDomain ?? rec.host);
  const hostRecord = hostRecordLabelForDnsPanel(rec.host, zone);
  const type = rec.type.trim().toUpperCase();
  if (type === "MX") {
    const { priority, exchange } = parseMxRecordValue(rec.value, rec.mxPriority);
    const value = resolveMxExchangeForPanel(exchange, senderDomain);
    return {
      fqdnHost: rec.host,
      hostRecord,
      dnsZone: zone,
      type,
      value,
      mxPriority: priority,
      note: rec.note,
      verified: rec.verified
    };
  }
  return {
    fqdnHost: rec.host,
    hostRecord,
    dnsZone: zone,
    type,
    value: rec.value,
    mxPriority: null,
    note: rec.note,
    verified: rec.verified
  };
}
