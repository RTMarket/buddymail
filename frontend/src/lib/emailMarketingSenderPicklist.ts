import { excludeDedicatedSmtpItems, filterDedicatedSmtpItems } from "./emailSmtpDedicatedFilter";

/** 与 GET /api/email/smtp 行对齐（仅挑选单所需字段） */
export type MarketingSmtpRow = {
  id: number;
  name: string;
  from_email: string;
  display_name?: string | null;
  reply_to?: string | null;
  is_default: number;
  host?: string | null;
  port?: number | null;
  secure?: number | null;
  dedicated_server_id?: number | null;
};

/** 与 GET /api/email/ses/sender-addresses 行对齐 */
export type MarketingSesAddressRow = {
  id: number;
  domain: string;
  fromEmail: string;
  displayName: string | null;
  replyTo: string | null;
  domainStatus: string;
  isDefault?: boolean;
};

export type SenderPickRow =
  | {
      kind: "smtp";
      channel: "light" | "dedicated";
      key: string;
      smtpId: number;
      fromEmail: string;
      displayName: string | null;
      replyTo: string | null;
      isDefault: boolean;
      hostPort: string;
    }
  | {
      kind: "ses";
      channel: "ses";
      key: string;
      sesId: number;
      fromEmail: string;
      displayName: string | null;
      replyTo: string | null;
      isDefault: boolean;
      domainLabel: string;
    };

function sortSmtpRows<T extends { is_default: number; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = Number(a.is_default) === 1 ? 0 : 1;
    const db = Number(b.is_default) === 1 ? 0 : 1;
    if (da !== db) return da - db;
    return b.id - a.id;
  });
}

function smtpHostPortLabel(r: MarketingSmtpRow): string {
  const host = String(r.host ?? "").trim();
  const port = Number(r.port ?? 0);
  if (!host) return "SMTP";
  const p = Number.isFinite(port) && port > 0 ? port : Number(r.secure) === 1 ? 465 : 587;
  return `${host}:${p}`;
}

function toSmtpPick(r: MarketingSmtpRow, channel: "light" | "dedicated"): SenderPickRow {
  return {
    kind: "smtp",
    channel,
    key: `smtp:${r.id}`,
    smtpId: r.id,
    fromEmail: r.from_email,
    displayName: r.display_name ?? null,
    replyTo: r.reply_to ?? null,
    isDefault: Number(r.is_default) === 1,
    hostPort: smtpHostPortLabel(r)
  };
}

/**
 * 合并轻量 SMTP、中量/巨量专线 SMTP，供营销/模版页下拉使用。
 * （遗留）ses 通道仅当后端仍返回 SES BYOD 地址时使用；当前巨量走 dedicated SMTP。
 */
export function buildMarketingSenderPicklist(
  smtpItems: MarketingSmtpRow[] | null | undefined,
  sesAddresses: MarketingSesAddressRow[] | null | undefined
): SenderPickRow[] {
  const smtpList = Array.isArray(smtpItems) ? smtpItems : [];
  const lightRows = sortSmtpRows(excludeDedicatedSmtpItems(smtpList));
  const dedicatedRows = sortSmtpRows(filterDedicatedSmtpItems(smtpList));
  const sesList = (Array.isArray(sesAddresses) ? sesAddresses : []).filter(
    (a) => String(a.domainStatus ?? "").toLowerCase() === "verified"
  );
  const sesSorted = [...sesList].sort((a, b) => {
    const da = a.isDefault ? 0 : 1;
    const db = b.isDefault ? 0 : 1;
    if (da !== db) return da - db;
    return b.id - a.id;
  });
  const sesPicks: SenderPickRow[] = sesSorted.map(
    (a): SenderPickRow => ({
      kind: "ses",
      channel: "ses",
      key: `ses:${a.id}`,
      sesId: a.id,
      fromEmail: a.fromEmail,
      displayName: a.displayName,
      replyTo: a.replyTo,
      isDefault: Boolean(a.isDefault),
      domainLabel: a.domain
    })
  );
  return [
    ...lightRows.map((r) => toSmtpPick(r, "light")),
    ...dedicatedRows.map((r) => toSmtpPick(r, "dedicated")),
    ...sesPicks
  ];
}

/** 默认：中量默认 → 中量首条 → 轻量默认 → 轻量首条 → SES 默认 → 列表首条 */
export function defaultMarketingSenderKey(rows: SenderPickRow[]): string {
  if (!rows.length) return "";
  const pick =
    rows.find((r) => r.kind === "smtp" && r.channel === "dedicated" && r.isDefault) ??
    rows.find((r) => r.kind === "smtp" && r.channel === "dedicated") ??
    rows.find((r) => r.kind === "smtp" && r.channel === "light" && r.isDefault) ??
    rows.find((r) => r.kind === "smtp" && r.channel === "light") ??
    rows.find((r) => r.kind === "ses" && r.isDefault) ??
    rows[0];
  return pick.key;
}

export function parseMarketingSenderKey(key: string): { smtpId: number } | { sesId: number } | null {
  const m = String(key).trim().match(/^(smtp|ses):(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (m[1] === "smtp") return { smtpId: id };
  return { sesId: id };
}

export function optgroupLabelForChannel(ch: SenderPickRow["channel"]): string {
  switch (ch) {
    case "light":
      return "轻量 · SMTP（自建邮箱）";
    case "dedicated":
      return "中量 · 独立专线 SMTP";
    case "ses":
      return "巨量 · 专线 SMTP";
    default:
      return "";
  }
}
