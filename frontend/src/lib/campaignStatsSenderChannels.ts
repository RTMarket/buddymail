import type { EmailChannelKind } from "./dedicatedEntitlements";
import { excludeDedicatedSmtpItems, filterDedicatedSmtpItems } from "./emailSmtpDedicatedFilter";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "./emailMarketingSenderPicklist";
import { isTierAllowedForDedicatedVariant, resolveEmailSubscriptionChannel } from "./emailTierChannel";

export const CAMPAIGN_STATS_CHANNEL_ORDER: readonly EmailChannelKind[] = [
  "light",
  "medium",
  "bulk",
  "ultra"
] as const;

export const CAMPAIGN_STATS_CHANNEL_LABELS: Record<EmailChannelKind, string> = {
  light: "轻量",
  medium: "中量",
  bulk: "巨量",
  ultra: "超量"
};

/** 营销活动统计：发信邮箱下拉最多同时展示行数（超出可滚动） */
export const CAMPAIGN_STATS_SENDER_SELECT_MAX_VISIBLE = 15;

/** 原生 select 选项超过该数量时改为固定高度列表（带滚动条） */
export const STATS_FILTER_SELECT_SCROLL_THRESHOLD = 10;

export function statsFilterSelectListSize(optionCount: number): number | undefined {
  const n = Math.max(0, Math.floor(optionCount));
  if (n <= STATS_FILTER_SELECT_SCROLL_THRESHOLD) return undefined;
  return STATS_FILTER_SELECT_SCROLL_THRESHOLD;
}

export type CampaignStatsSenderGroups = Record<EmailChannelKind, string[]>;

/** GET /api/email/dedicated-servers 为 camelCase；兼容 snake_case */
type DedicatedServerRow = {
  id?: number;
  fromEmail?: string | null;
  from_email?: string | null;
  subscriptionTierId?: string | null;
  subscription_tier_id?: string | null;
  smtpProfileId?: number | null;
  smtp_profile_id?: number | null;
};

function readDedicatedFromEmail(ds: DedicatedServerRow): string {
  return String(ds.fromEmail ?? ds.from_email ?? "").trim();
}

function readDedicatedTierId(ds: DedicatedServerRow): string | null {
  const t = String(ds.subscriptionTierId ?? ds.subscription_tier_id ?? "").trim();
  return t || null;
}

export function dedicatedServerMatchesVariant(ds: DedicatedServerRow, variant: "medium" | "bulk"): boolean {
  const tierId = readDedicatedTierId(ds);
  if (isTierAllowedForDedicatedVariant(tierId, variant)) return true;
  return resolveEmailSubscriptionChannel(tierId) === variant;
}

function normFromEmail(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function uniqueSenderEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const fe = normFromEmail(raw);
    if (!fe || seen.has(fe)) continue;
    seen.add(fe);
    out.push(fe);
  }
  return out;
}

function dedicatedEmailsForVariant(
  variant: "medium" | "bulk",
  smtpItems: MarketingSmtpRow[],
  dedicatedServers: DedicatedServerRow[]
): string[] {
  const serverIds = new Set(
    dedicatedServers
      .filter((ds) => dedicatedServerMatchesVariant(ds, variant))
      .map((ds) => Number(ds.id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const raw: string[] = [];
  for (const ds of dedicatedServers) {
    if (!dedicatedServerMatchesVariant(ds, variant)) continue;
    const fe = readDedicatedFromEmail(ds);
    if (fe) raw.push(fe);
  }
  for (const sp of filterDedicatedSmtpItems(smtpItems)) {
    const sid = Number(sp.dedicated_server_id ?? 0);
    if (!serverIds.has(sid)) continue;
    const fe = String(sp.from_email ?? "").trim();
    if (fe) raw.push(fe);
  }
  return uniqueSenderEmails(raw);
}

/** 按轻量 / 中量 / 巨量 / 超量套餐汇总租户已绑定的发信邮箱（仅地址，无 SMTP 元数据） */
export function buildCampaignStatsSenderGroups(
  smtpItems: MarketingSmtpRow[] | null | undefined,
  dedicatedServers: DedicatedServerRow[] | null | undefined,
  sesAddresses: MarketingSesAddressRow[] | null | undefined
): CampaignStatsSenderGroups {
  const smtp = Array.isArray(smtpItems) ? smtpItems : [];
  const ded = Array.isArray(dedicatedServers) ? dedicatedServers : [];
  const light = uniqueSenderEmails(
    excludeDedicatedSmtpItems(smtp).map((r) => String(r.from_email ?? ""))
  );
  const medium = dedicatedEmailsForVariant("medium", smtp, ded);
  const bulk = dedicatedEmailsForVariant("bulk", smtp, ded);
  const ultra = uniqueSenderEmails(
    (Array.isArray(sesAddresses) ? sesAddresses : [])
      .filter((a) => String(a.domainStatus ?? "").toLowerCase() === "verified")
      .map((a) => String(a.fromEmail ?? ""))
  );
  return { light, medium, bulk, ultra };
}

export function firstSenderEmailInChannel(
  groups: CampaignStatsSenderGroups,
  channel: EmailChannelKind
): string {
  return groups[channel][0] ?? "";
}
