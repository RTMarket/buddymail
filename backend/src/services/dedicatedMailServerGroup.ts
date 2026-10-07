import type { DnsRecordItem } from "./emailDedicatedDnsRecords.js";
import {
  dnsZoneRootFromSenderDomain,
  hostRecordLabelForDnsPanel
} from "./dedicatedDnsPanelLabels.js";

export type DedicatedDnsRecord = DnsRecordItem;

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** 不宜作为发信子域的第一段标签（P3-2） */
const RESERVED_SENDER_LABELS = new Set([
  "www",
  "ftp",
  "smtp",
  "mx",
  "imap",
  "pop",
  "pop3",
  "mail",
  "webmail",
  "autodiscover",
  "cdn",
  "api"
]);

export type DedicatedSenderValidation = { ok: true } | { ok: false; message: string };

/** 发件域名须为子域（至少两段），如 mail.example.com */
export function validateDedicatedSenderDomain(senderDomain: string): DedicatedSenderValidation {
  const d = senderDomain.trim().toLowerCase();
  if (!d) return { ok: false, message: "请填写发件域名" };
  if (!DOMAIN_RE.test(d)) {
    return { ok: false, message: "发件域名格式不正确，请使用子域名，例如 mail.yourcompany.com" };
  }
  const labels = d.split(".");
  if (labels.length < 3) {
    return {
      ok: false,
      message:
        "发件域名须为独立子域（至少三段），例如 mail.yourcompany.com，不要直接填主域 example.com"
    };
  }
  const first = labels[0] ?? "";
  if (RESERVED_SENDER_LABELS.has(first)) {
    if (first === "mail") {
      return { ok: true };
    }
    return {
      ok: false,
      message: `请使用专用发信子域（推荐 mail.主域.com），不要使用 ${first}. 等系统保留子域`
    };
  }
  if (labels.some((l) => !l || l.length > 63)) {
    return { ok: false, message: "域名标签长度不合法，请检查是否含连续点或非法字符" };
  }
  if (d.includes("..") || d.startsWith(".") || d.endsWith(".")) {
    return { ok: false, message: "发件域名格式不正确" };
  }
  return { ok: true };
}

/** 发件邮箱须为 本地部分@发件域名，例如 info@mail.example.com */
export function validateDedicatedFromEmail(
  fromEmail: string,
  senderDomain: string
): DedicatedSenderValidation {
  const email = fromEmail.trim().toLowerCase();
  const domain = senderDomain.trim().toLowerCase();
  if (!email) return { ok: false, message: "请填写发件邮箱" };
  if (!EMAIL_RE.test(email)) return { ok: false, message: "发件邮箱格式不正确" };
  const at = email.lastIndexOf("@");
  const emailDomain = email.slice(at + 1);
  if (emailDomain !== domain) {
    return {
      ok: false,
      message: `发件邮箱必须使用发件域名：请填写 名称@${domain} 格式（例如 marketing@${domain}）`
    };
  }
  const local = email.slice(0, at);
  if (!local || local.length > 64) {
    return { ok: false, message: "发件邮箱 @ 前的名称不能为空且不宜过长" };
  }
  return { ok: true };
}

export function validateDedicatedSenderProfile(
  senderDomain: string | null | undefined,
  fromEmail: string | null | undefined
): DedicatedSenderValidation {
  if (!senderDomain?.trim()) return { ok: false, message: "请填写发件域名" };
  if (!fromEmail?.trim()) return { ok: false, message: "请填写发件邮箱" };
  const d = validateDedicatedSenderDomain(senderDomain);
  if (!d.ok) return d;
  return validateDedicatedFromEmail(fromEmail, senderDomain);
}

export function defaultPtrHostname(senderDomain: string): string {
  return senderDomain.trim().toLowerCase();
}

/** PTR/A 记录主机名不能是 IPv4（常见误把发信机 IP 填进 PTR 主机名） */
export function isLikelyIpv4Host(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value ?? "").trim());
}

/** A/PTR 主机名须为本发信域或其主域下的 FQDN（排除平台其它域、误填 IP） */
export function isPtrHostPlausibleForSender(ptrHost: string, senderDomain: string): boolean {
  const host = ptrHost.trim().toLowerCase().replace(/\.$/, "");
  const domain = senderDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !domain || isLikelyIpv4Host(host)) return false;
  if (host === domain) return true;
  const zone = dnsZoneRootFromSenderDomain(domain);
  return host === zone || host.endsWith(`.${zone}`);
}

export function normalizePtrHostnameForDns(
  ptrHostname: string | null | undefined,
  senderDomain: string
): string {
  const domain = senderDomain.trim().toLowerCase().replace(/\.$/, "");
  const raw = (ptrHostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!raw || isLikelyIpv4Host(raw) || !isPtrHostPlausibleForSender(raw, domain)) {
    return defaultPtrHostname(domain);
  }
  return raw;
}

export type StripDedicatedARecordsOpts = {
  /** 仅保留与该 FQDN 一致的 A（展示/入库前去重） */
  canonicalPtrHost?: string | null;
  senderDomain?: string | null;
};

/** 去掉错误/多余的 A：IP 主机名、其它发信域、平台默认域残留等 */
export function stripInvalidDedicatedARecords(
  records: DnsRecordItem[],
  opts: StripDedicatedARecordsOpts = {}
): DnsRecordItem[] {
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

export function parentDomainForDmarc(senderDomain: string): string {
  const parts = senderDomain.trim().toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export type BuildDedicatedDnsInput = {
  senderDomain: string;
  fromEmail: string;
  relayIp: string;
  ptrIp: string;
  ptrHostname: string;
  /** 可选：已生成的 DKIM 公钥（不含头尾与换行） */
  dkimPublicKey?: string | null;
};

function dedicatedDnsPanelHint(dnsZone: string): string {
  return `在腾讯云等控制台只需填「主机记录」列；系统会自动补上 .${dnsZone}，请勿把完整域名重复粘贴进主机记录框。`;
}

function dedicatedDnsSortKey(rec: DnsRecordItem): string {
  const type = rec.type.trim().toUpperCase();
  const host = rec.host.trim().toLowerCase();
  if (type === "TXT" && host.includes("_domainkey.")) return "02-dkim";
  if (type === "TXT" && host.startsWith("_dmarc.")) return "03-dmarc";
  if (type === "TXT") return "01-spf";
  if (type === "A") return "04-a";
  if (type === "MX") return "05-mx";
  return `99-${type}-${host}`;
}

/** 展示顺序：SPF → DKIM → DMARC → A → MX */
export function sortDedicatedDnsRecords(records: DnsRecordItem[]): DnsRecordItem[] {
  return [...records].sort((a, b) => dedicatedDnsSortKey(a).localeCompare(dedicatedDnsSortKey(b)));
}

export type EnsureDedicatedDnsAInput = {
  senderDomain: string;
  ptrIp: string;
  ptrHostname?: string | null;
};

export type PrepareDedicatedDnsInput = {
  senderDomain?: string | null;
  ptrIp?: string | null;
  relayIp?: string | null;
  ptrHostname?: string | null;
};

/** 从 SPF TXT 解析 ip4（与 buildDedicatedDnsRecords 顺序一致：先发信机、后 PTR 机） */
export function extractIpv4FromSpfValue(spfValue: string): string[] {
  return [...spfValue.matchAll(/ip4:([\d.]+)/gi)].map((m) => m[1] ?? "").filter(Boolean);
}

/** 列里无 ptr_ip 时，从 SPF 第二条 ip4 推断 PTR 机 IP（旧数据常见） */
export function resolvePtrIpForDedicatedDns(
  records: DnsRecordItem[],
  opts: { ptrIp?: string | null; relayIp?: string | null } = {}
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

/** 租户端 / 管理端展示前：排序 + 缺 A 时补全（含从 SPF 推断 ptr_ip） */
export function prepareDedicatedDnsRecordsForDisplay(
  records: DnsRecordItem[],
  input: PrepareDedicatedDnsInput
): DnsRecordItem[] {
  const domain = (input.senderDomain ?? "").trim().toLowerCase();
  if (!domain) return sortDedicatedDnsRecords(records);

  const ptrIp = resolvePtrIpForDedicatedDns(records, {
    ptrIp: input.ptrIp,
    relayIp: input.relayIp
  });
  if (!ptrIp) return sortDedicatedDnsRecords(records);

  const ptrHost = normalizePtrHostnameForDns(input.ptrHostname, domain);
  const cleaned = stripInvalidDedicatedARecords(records, {
    canonicalPtrHost: ptrHost,
    senderDomain: domain
  });
  return ensureDedicatedDnsARecord(cleaned, {
    senderDomain: domain,
    ptrIp,
    ptrHostname: ptrHost
  });
}

/**
 * 旧数据可能只有 4 条（无 A）。有 ptrIp 时在返回租户前补全 A，避免前端只显示 4 行。
 */
export function ensureDedicatedDnsARecord(
  records: DnsRecordItem[],
  input: EnsureDedicatedDnsAInput
): DnsRecordItem[] {
  const domain = input.senderDomain.trim().toLowerCase();
  const ptrIp = input.ptrIp.trim();
  if (!domain || !ptrIp) return sortDedicatedDnsRecords(records);

  const ptrHost = normalizePtrHostnameForDns(input.ptrHostname, domain);
  const working = stripInvalidDedicatedARecords(records, {
    canonicalPtrHost: ptrHost,
    senderDomain: domain
  });
  const dnsZone = dnsZoneRootFromSenderDomain(domain);
  const panelHint = dedicatedDnsPanelHint(dnsZone);

  const existingIdx = working.findIndex(
    (r) => r.type.trim().toUpperCase() === "A" && r.host.trim().toLowerCase() === ptrHost
  );
  if (existingIdx >= 0) {
    const next = [...working];
    const cur = next[existingIdx]!;
    if (cur.value.trim() !== ptrIp) {
      next[existingIdx] = { ...cur, value: ptrIp, verified: false };
    }
    return sortDedicatedDnsRecords(next);
  }

  const aRecord: DnsRecordItem = {
    host: ptrHost,
    hostRecord: hostRecordLabelForDnsPanel(ptrHost, dnsZone),
    dnsZone,
    type: "A",
    value: ptrIp,
    verified: false,
    note:
      `A：${ptrHost} → PTR 发信机公网 IP；须与云厂商反向解析（${ptrIp} → ${ptrHost}）一致。` +
      `MX 记录值须能解析到本 IP。${panelHint}`
  };

  const merged = [...working];
  const mxIdx = merged.findIndex((r) => r.type.trim().toUpperCase() === "MX");
  if (mxIdx >= 0) merged.splice(mxIdx, 0, aRecord);
  else merged.push(aRecord);
  return sortDedicatedDnsRecords(merged);
}

export function buildDedicatedDnsRecords(input: BuildDedicatedDnsInput): DnsRecordItem[] {
  const domain = input.senderDomain.trim().toLowerCase();
  const relayIp = input.relayIp.trim();
  const ptrIp = input.ptrIp.trim();
  const ptrHost = normalizePtrHostnameForDns(input.ptrHostname, domain);
  const dmarcDomain = parentDomainForDmarc(domain);
  const dnsZone = dnsZoneRootFromSenderDomain(domain);
  const dkimKey =
    (input.dkimPublicKey ?? "").trim() ||
    "请替换为邮件 VPS 上生成的 DKIM 公钥（admin 可在生成后 PATCH 更新）";

  const panelHint = dedicatedDnsPanelHint(dnsZone);
  const spfIps =
    relayIp && ptrIp && relayIp === ptrIp ? [relayIp] : [relayIp, ptrIp].filter(Boolean);
  const spfValue = `v=spf1 ${spfIps.map((ip) => `ip4:${ip}`).join(" ")} ~all`;
  const spfNote =
    spfIps.length === 1
      ? `SPF：单机合并（发信与 rDNS/PTR 同 IP）。${panelHint}`
      : `SPF：包含发信机与 PTR 机 IP。${panelHint}`;

  const records: DnsRecordItem[] = [
    {
      host: domain,
      hostRecord: hostRecordLabelForDnsPanel(domain, dnsZone),
      dnsZone,
      type: "TXT",
      value: spfValue,
      verified: false,
      note: spfNote
    },
    {
      /** 每发信域独立 selector，同组多域时互不覆盖 */
      host: `default._domainkey.${domain}`,
      hostRecord: hostRecordLabelForDnsPanel(`default._domainkey.${domain}`, dnsZone),
      dnsZone,
      type: "TXT",
      value: `v=DKIM1; k=rsa; p=${dkimKey}`,
      verified: false,
      note: `DKIM。${panelHint}`
    },
    {
      host: `_dmarc.${dmarcDomain}`,
      hostRecord: hostRecordLabelForDnsPanel(`_dmarc.${dmarcDomain}`, dnsZone),
      dnsZone,
      type: "TXT",
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${dmarcDomain}`,
      verified: false,
      note: `DMARC（主域 ${dmarcDomain}）。${panelHint}`
    },
    {
      host: ptrHost,
      hostRecord: hostRecordLabelForDnsPanel(ptrHost, dnsZone),
      dnsZone,
      type: "A",
      value: ptrIp,
      verified: false,
      note:
        `A：${ptrHost} → PTR 发信机公网 IP；须与云厂商反向解析（${ptrIp} → ${ptrHost}）一致。` +
        `MX 记录值须能解析到本 IP。${panelHint}`
    },
    {
      host: domain,
      hostRecord: hostRecordLabelForDnsPanel(domain, dnsZone),
      dnsZone,
      type: "MX",
      /** 记录值仅填发件域 FQDN（与 A 记录主机名一致）；勿写入「10 mail…」或误拼的 ptr 主机名 */
      value: domain,
      mxPriority: 10,
      verified: false,
      note: `MX：优先级填 10，邮件服务器（记录值）仅填 ${domain}（不要带「10 」前缀，不要写成一整段）。${panelHint}`
    }
  ];

  return sortDedicatedDnsRecords(records);
}
