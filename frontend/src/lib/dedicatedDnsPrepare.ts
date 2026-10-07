/** 与后端 prepareDedicatedDnsRecordsForDisplay 口径一致（SPF 推断 PTR IP + 补 A） */

import type { DedicatedDnsRecordInput } from "./dedicatedDnsPanelDisplay";

export type LooseDnsRecord = DedicatedDnsRecordInput;

function sortKey(rec: LooseDnsRecord): string {
  const type = rec.type.trim().toUpperCase();
  const host = rec.host.trim().toLowerCase();
  if (type === "TXT" && host.includes("_domainkey.")) return "02-dkim";
  if (type === "TXT" && host.startsWith("_dmarc.")) return "03-dmarc";
  if (type === "TXT") return "01-spf";
  if (type === "A") return "04-a";
  if (type === "MX") return "05-mx";
  return `99-${type}-${host}`;
}

function sortRecords(records: LooseDnsRecord[]): LooseDnsRecord[] {
  return [...records].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** 后端 enrichDnsRecordsForPanel 已补全 hostRecord/dnsZone 时勿再二次 prepare（会误清 verified） */
export function dnsRecordsAlreadyPreparedForPanel(
  records: Array<{ hostRecord?: string; dnsZone?: string }>
): boolean {
  return (
    records.length > 0 &&
    records.every((r) => Boolean(String(r.hostRecord ?? "").trim() && String(r.dnsZone ?? "").trim()))
  );
}

export function sortDedicatedDnsRecordsForUi(records: LooseDnsRecord[]): LooseDnsRecord[] {
  return sortRecords(records);
}

function extractIpv4FromSpfValue(spfValue: string): string[] {
  return [...spfValue.matchAll(/ip4:([\d.]+)/gi)].map((m) => m[1] ?? "").filter(Boolean);
}

function resolvePtrIp(
  records: LooseDnsRecord[],
  opts: { ptrIp?: string; relayIp?: string }
): string {
  const direct = (opts.ptrIp ?? "").trim();
  if (direct) return direct;
  const spfRec = records.find((r) => {
    if (r.type.trim().toUpperCase() !== "TXT") return false;
    const host = r.host.trim().toLowerCase();
    return !host.includes("_domainkey.") && !host.startsWith("_dmarc.");
  });
  if (!spfRec) return "";
  const ips = extractIpv4FromSpfValue(spfRec.value);
  const relay = (opts.relayIp ?? "").trim();
  if (ips.length >= 2) return ips[1] ?? "";
  if (ips.length === 1 && relay && ips[0] !== relay) return ips[0] ?? "";
  if (ips.length === 1 && !relay) return ips[0] ?? "";
  return "";
}

function dnsZoneFromSender(senderDomain: string): string {
  const parts = senderDomain.trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  if (last2 === "it.com" && parts.length >= 3) return parts.slice(-3).join(".");
  return last2;
}

function isLikelyIpv4Host(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value ?? "").trim());
}

function isPtrHostPlausibleForSender(ptrHost: string, senderDomain: string): boolean {
  const host = ptrHost.trim().toLowerCase().replace(/\.$/, "");
  const domain = senderDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !domain || isLikelyIpv4Host(host)) return false;
  if (host === domain) return true;
  const zone = dnsZoneFromSender(domain);
  return host === zone || host.endsWith(`.${zone}`);
}

function normalizePtrHost(ptrHostname: string | null | undefined, senderDomain: string): string {
  const domain = senderDomain.trim().toLowerCase().replace(/\.$/, "");
  const raw = (ptrHostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!raw || isLikelyIpv4Host(raw) || !isPtrHostPlausibleForSender(raw, domain)) return domain;
  return raw;
}

function stripInvalidARecords(
  records: LooseDnsRecord[],
  opts: { canonicalPtrHost?: string; senderDomain?: string }
): LooseDnsRecord[] {
  const canonical = (opts.canonicalPtrHost ?? "").trim().toLowerCase().replace(/\.$/, "");
  const domain = (opts.senderDomain ?? "").trim().toLowerCase().replace(/\.$/, "");
  return records.filter((r) => {
    if (r.type.trim().toUpperCase() !== "A") return true;
    const host = r.host.trim().toLowerCase().replace(/\.$/, "");
    if (isLikelyIpv4Host(host)) return false;
    if (canonical) return host === canonical;
    if (domain) return isPtrHostPlausibleForSender(host, domain);
    return true;
  });
}

function hostRecordLabel(fqdnHost: string, dnsZone: string): string {
  const h = fqdnHost.trim().toLowerCase().replace(/\.$/, "");
  const z = dnsZone.trim().toLowerCase().replace(/\.$/, "");
  if (!h || !z) return h;
  if (h === z) return "@";
  const suffix = `.${z}`;
  if (h.endsWith(suffix)) return h.slice(0, -suffix.length) || "@";
  return h;
}

export function parseDnsRecordsJson(text: string): LooseDnsRecord[] {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const val = JSON.parse(raw) as unknown;
    if (!Array.isArray(val)) return [];
    return val
      .filter((r) => r && typeof r === "object")
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          host: String(row.host ?? ""),
          type: String(row.type ?? "TXT"),
          value: String(row.value ?? ""),
          verified: Boolean(row.verified ?? false),
          note: typeof row.note === "string" ? row.note : undefined,
          hostRecord: typeof row.hostRecord === "string" ? row.hostRecord : undefined,
          dnsZone: typeof row.dnsZone === "string" ? row.dnsZone : undefined,
          mxPriority:
            row.mxPriority != null && Number.isFinite(Number(row.mxPriority))
              ? Number(row.mxPriority)
              : undefined
        };
      })
      .filter((r) => r.host && r.value);
  } catch {
    return [];
  }
}

/** 管理端 JSON 预览 / 生成按钮右侧表格：保证 5 条（含 A） */
export function prepareDedicatedDnsRecordsForUi(
  records: LooseDnsRecord[],
  opts: {
    senderDomain?: string | null;
    ptrIp?: string | null;
    relayIp?: string | null;
    ptrHostname?: string | null;
  }
): LooseDnsRecord[] {
  const domain = (opts.senderDomain ?? "").trim().toLowerCase();
  if (!domain) return sortRecords(records);

  const ptrHost = normalizePtrHost(opts.ptrHostname, domain);
  const cleaned = stripInvalidARecords(records, {
    canonicalPtrHost: ptrHost,
    senderDomain: domain
  });
  const ptrIp = resolvePtrIp(cleaned, {
    ptrIp: opts.ptrIp ?? undefined,
    relayIp: opts.relayIp ?? undefined
  });
  if (!ptrIp) return sortRecords(cleaned);

  const dnsZone = dnsZoneFromSender(domain);

  const existingIdx = cleaned.findIndex(
    (r) => r.type.trim().toUpperCase() === "A" && r.host.trim().toLowerCase() === ptrHost
  );
  if (existingIdx >= 0) {
    const next = [...cleaned];
    const cur = next[existingIdx]!;
    if (cur.value.trim() !== ptrIp) {
      next[existingIdx] = { ...cur, value: ptrIp };
    }
    return sortRecords(next);
  }

  const aRecord: LooseDnsRecord = {
    host: ptrHost,
    hostRecord: hostRecordLabel(ptrHost, dnsZone),
    dnsZone,
    type: "A",
    value: ptrIp,
    verified: false,
    note: `A：${ptrHost} → ${ptrIp}`
  };
  const merged = [...cleaned];
  const mxIdx = merged.findIndex((r) => r.type.trim().toUpperCase() === "MX");
  if (mxIdx >= 0) merged.splice(mxIdx, 0, aRecord);
  else merged.push(aRecord);
  return sortRecords(merged);
}
