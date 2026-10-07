import {
  buildCampaignStatsSenderGroups,
  dedicatedServerMatchesVariant,
  type CampaignStatsSenderGroups
} from "./campaignStatsSenderChannels";
import type { EmailChannelKind } from "./dedicatedEntitlements";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "./emailMarketingSenderPicklist";
import { excludeDedicatedSmtpItems, filterDedicatedSmtpItems } from "./emailSmtpDedicatedFilter";

type DedicatedServerRow = {
  id?: number;
  subscriptionTierId?: string | null;
  subscription_tier_id?: string | null;
};

function normEmail(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** 通道 + 发信邮箱 → 营销/模版页用的 smtp:ID 或 ses:ID */
export function marketingSenderKeyForChannelEmail(
  channel: EmailChannelKind,
  fromEmail: string,
  smtpItems: MarketingSmtpRow[],
  dedicatedServers: DedicatedServerRow[],
  sesAddresses: MarketingSesAddressRow[]
): string {
  const fe = normEmail(fromEmail);
  if (!fe) return "";
  const groups = buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses);
  if (!groups[channel].includes(fe)) return "";

  if (channel === "ultra") {
    const ses = (Array.isArray(sesAddresses) ? sesAddresses : []).find(
      (a) => normEmail(a.fromEmail) === fe
    );
    return ses ? `ses:${ses.id}` : "";
  }

  const smtp = Array.isArray(smtpItems) ? smtpItems : [];
  const ded = Array.isArray(dedicatedServers) ? dedicatedServers : [];

  if (channel === "light") {
    const row = excludeDedicatedSmtpItems(smtp).find((r) => normEmail(r.from_email) === fe);
    return row ? `smtp:${row.id}` : "";
  }

  const variant = channel === "bulk" ? "bulk" : "medium";
  for (const sp of filterDedicatedSmtpItems(smtp)) {
    if (normEmail(sp.from_email) !== fe) continue;
    const sid = Number(sp.dedicated_server_id ?? 0);
    const ds = ded.find((d) => Number(d.id) === sid);
    if (!ds || !dedicatedServerMatchesVariant(ds, variant)) continue;
    return `smtp:${sp.id}`;
  }
  return "";
}

export function fromEmailForMarketingSenderKey(
  key: string,
  smtpItems: MarketingSmtpRow[],
  sesAddresses: MarketingSesAddressRow[]
): string {
  const m = String(key).match(/^(smtp|ses):(\d+)$/);
  if (!m) return "";
  const id = Number(m[2]);
  if (m[1] === "ses") {
    const row = sesAddresses.find((a) => a.id === id);
    return row ? normEmail(row.fromEmail) : "";
  }
  const row = smtpItems.find((s) => s.id === id);
  return row ? normEmail(row.from_email) : "";
}

export function defaultChannelForGroups(groups: CampaignStatsSenderGroups): EmailChannelKind {
  for (const ch of ["light", "medium", "bulk", "ultra"] as const) {
    if (groups[ch].length > 0) return ch;
  }
  return "light";
}

export function inferChannelForSenderKey(
  key: string,
  smtpItems: MarketingSmtpRow[],
  dedicatedServers: DedicatedServerRow[],
  sesAddresses: MarketingSesAddressRow[]
): EmailChannelKind {
  if (key.startsWith("ses:")) return "ultra";
  const fe = fromEmailForMarketingSenderKey(key, smtpItems, sesAddresses);
  if (!fe) return "light";
  const groups = buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses);
  if (groups.bulk.includes(fe)) return "bulk";
  if (groups.medium.includes(fe)) return "medium";
  if (groups.ultra.includes(fe)) return "ultra";
  return "light";
}
