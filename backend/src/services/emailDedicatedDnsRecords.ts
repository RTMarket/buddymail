/** 专线 DNS 记录 JSON 解析与付款后重置（与 emailDedicatedServers 路由共用） */

import { enrichDnsRecordsForPanel } from "./dedicatedDnsPanelLabels.js";

export type DnsRecordItem = {
  /** 完整主机名（FQDN），用于程序做 DNS 查询验证 */
  host: string;
  type: string;
  value: string;
  verified: boolean;
  note?: string;
  /** 腾讯云等「主机记录」框应填写的子域前缀（不含根域后缀） */
  hostRecord?: string;
  /** DNS 控制台根域，如 bigsocialboss.top */
  dnsZone?: string;
  /** MX 优先级（记录值仅填邮件服务器主机名） */
  mxPriority?: number;
};

export function parseDnsRecords(raw: unknown): DnsRecordItem[] {
  if (!raw) return [];
  let val: unknown = raw;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  return (val as Array<Record<string, unknown>>)
    .filter((r) => r && typeof r === "object" && typeof r.host === "string" && typeof r.value === "string")
    .map((r) => ({
      host: String(r.host),
      type: String(r.type ?? "TXT"),
      value: String(r.value),
      verified: Boolean(r.verified ?? false),
      note: typeof r.note === "string" ? r.note : undefined,
      hostRecord: typeof r.hostRecord === "string" ? r.hostRecord : undefined,
      dnsZone: typeof r.dnsZone === "string" ? r.dnsZone : undefined,
      mxPriority:
        r.mxPriority != null && Number.isFinite(Number(r.mxPriority))
          ? Number(r.mxPriority)
          : undefined
    }));
}

export function unverifyAllDnsRecords(raw: unknown): DnsRecordItem[] {
  return parseDnsRecords(raw).map((r) => ({ ...r, verified: false }));
}

export function dnsRecordsToJson(records: DnsRecordItem[]): string | null {
  if (records.length === 0) return null;
  return JSON.stringify(records);
}

/** 用户 DNS 面板展示：拆分 MX 优先级与邮件服务器主机名 */
export function parseDnsRecordsForPanel(raw: unknown, senderDomain?: string | null): DnsRecordItem[] {
  return enrichDnsRecordsForPanel(parseDnsRecords(raw), senderDomain);
}
