import React, { useMemo } from "react";
import {
  buildCampaignStatsSenderGroups,
  CAMPAIGN_STATS_CHANNEL_LABELS,
  CAMPAIGN_STATS_CHANNEL_ORDER
} from "../../../lib/campaignStatsSenderChannels";
import type { EmailChannelKind } from "../../../lib/dedicatedEntitlements";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "../../../lib/emailMarketingSenderPicklist";

type DedicatedServerRow = {
  id?: number;
  subscriptionTierId?: string | null;
  subscription_tier_id?: string | null;
};

function dailyLimitWanLabel(limit: number): string {
  const n = Math.max(0, Math.floor(limit));
  if (n >= 10000 && n % 10000 === 0) return `${n / 10000}万`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}千`;
  return n > 0 ? n.toLocaleString("zh-CN") : "3万";
}

export function singleLaneChannelTabLabel(
  ch: EmailChannelKind,
  dailyLimit: number,
  hasDedicatedLanes: boolean
): string {
  if (hasDedicatedLanes && (ch === "bulk" || ch === "medium")) {
    return `单组VPS - ${dailyLimitWanLabel(dailyLimit || 30_000)}/日`;
  }
  if (ch === "light") return "轻量 SMTP";
  if (ch === "ultra") return "超量定制";
  return CAMPAIGN_STATS_CHANNEL_LABELS[ch] ?? ch;
}

/** 单组 VPS 邮件营销页 · 选择发送通道（Tab 样式，与截图一致） */
export function SingleLaneSendChannelTabs(props: {
  channel: EmailChannelKind;
  onChannelChange: (ch: EmailChannelKind) => void;
  smtpItems: MarketingSmtpRow[];
  dedicatedServers?: DedicatedServerRow[];
  sesAddresses?: MarketingSesAddressRow[];
  dailyLimit?: number;
  hasDedicatedLanes?: boolean;
}) {
  const {
    channel,
    onChannelChange,
    smtpItems,
    dedicatedServers = [],
    sesAddresses = [],
    dailyLimit = 0,
    hasDedicatedLanes = false
  } = props;

  const groups = useMemo(
    () => buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses),
    [smtpItems, dedicatedServers, sesAddresses]
  );

  const visibleChannels = useMemo(() => {
    const withEmails = CAMPAIGN_STATS_CHANNEL_ORDER.filter((ch) => (groups[ch] ?? []).length > 0);
    if (withEmails.length > 0) return withEmails;
    return CAMPAIGN_STATS_CHANNEL_ORDER.filter((ch) => ch === "medium" || ch === "bulk" || ch === "light");
  }, [groups]);

  return (
    <div className="flex flex-wrap gap-2">
      {visibleChannels.map((ch) => {
        const selected = channel === ch;
        const count = (groups[ch] ?? []).length;
        return (
          <button
            key={ch}
            type="button"
            onClick={() => onChannelChange(ch)}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
              selected
                ? "border-violet-400 bg-violet-50/90 font-semibold text-violet-950 ring-2 ring-violet-200"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="block">{singleLaneChannelTabLabel(ch, dailyLimit, hasDedicatedLanes)}</span>
            {count > 0 ? (
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{count} 个发信邮箱</span>
            ) : (
              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">暂无邮箱</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
