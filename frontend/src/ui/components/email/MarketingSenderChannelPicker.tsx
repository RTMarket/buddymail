import React, { useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsWorkbenchStrings } from "../../../i18n/emailCampaignsWorkbenchI18n";
import {
  buildCampaignStatsSenderGroups,
  CAMPAIGN_STATS_CHANNEL_LABELS,
  CAMPAIGN_STATS_CHANNEL_ORDER,
  firstSenderEmailInChannel
} from "../../../lib/campaignStatsSenderChannels";
import type { EmailChannelKind } from "../../../lib/dedicatedEntitlements";
import type { MarketingSesAddressRow, MarketingSmtpRow } from "../../../lib/emailMarketingSenderPicklist";
import {
  defaultChannelForGroups,
  fromEmailForMarketingSenderKey,
  inferChannelForSenderKey,
  marketingSenderKeyForChannelEmail
} from "../../../lib/marketingSenderChannelPick";
import { standaloneOmitPackageChannelPicker } from "../../../lib/standaloneDeploy";

type DedicatedServerRow = {
  id?: number;
  subscriptionTierId?: string | null;
  subscription_tier_id?: string | null;
};

type FromEmailMode = {
  mode: "fromEmail";
  fromEmail: string;
  onFromEmailChange: (email: string) => void;
};

type SenderKeyMode = {
  mode: "senderKey";
  senderKey: string;
  onSenderKeyChange: (key: string) => void;
};

function normEmail(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function filterGroupsByAllowlist(
  groups: ReturnType<typeof buildCampaignStatsSenderGroups>,
  allowedFromEmails: string[] | undefined
) {
  if (!allowedFromEmails?.length) return groups;
  const allow = new Set(allowedFromEmails.map(normEmail));
  const out = { ...groups };
  for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
    out[ch] = (groups[ch] ?? []).filter((fe) => allow.has(normEmail(fe)));
  }
  return out;
}

export function MarketingSenderChannelPicker(
  props: {
    smtpItems: MarketingSmtpRow[];
    dedicatedServers?: DedicatedServerRow[];
    sesAddresses?: MarketingSesAddressRow[];
    channel?: EmailChannelKind;
    onChannelChange?: (ch: EmailChannelKind) => void;
    compact?: boolean;
    /** 发信邮箱下拉列出全部套餐通道：无邮箱的通道显示空行占位 */
    listAllChannelEmails?: boolean;
    /** 仅展示这些发信邮箱（专线筛选） */
    allowedFromEmails?: string[];
    pickerDisabled?: boolean;
    pickerDisabledHint?: string;
    /** 通道与发信邮箱各占一行（右侧栏） */
    stackedRows?: boolean;
    /** 两栏并排、独立底色（无专线时） */
    inlineRow?: boolean;
  } & (FromEmailMode | SenderKeyMode)
) {
  const {
    smtpItems,
    dedicatedServers = [],
    sesAddresses = [],
    channel: channelProp,
    onChannelChange,
    compact = false,
    listAllChannelEmails = false,
    allowedFromEmails,
    pickerDisabled = false,
    pickerDisabledHint,
    stackedRows = false,
    inlineRow = false
  } = props;

  const { locale } = useSiteLocale();
  const wb = useMemo(() => getEmailCampaignsWorkbenchStrings(locale), [locale]);
  const omitPackageChannel = standaloneOmitPackageChannelPicker();
  const listAllEmails = listAllChannelEmails || omitPackageChannel;

  const groups = useMemo(() => {
    const base = buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses);
    return filterGroupsByAllowlist(base, allowedFromEmails);
  }, [smtpItems, dedicatedServers, sesAddresses, allowedFromEmails]);

  const [channelInternal, setChannelInternal] = useState<EmailChannelKind>(() =>
    defaultChannelForGroups(groups)
  );
  const channel = channelProp ?? channelInternal;
  const setChannel = onChannelChange ?? setChannelInternal;

  const channelEmails = groups[channel] ?? [];
  const hasAnySenderEmail = CAMPAIGN_STATS_CHANNEL_ORDER.some((ch) => (groups[ch] ?? []).length > 0);

  const selectedEmail =
    props.mode === "fromEmail"
      ? props.fromEmail
      : fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);

  useEffect(() => {
    const emails = groups[channel] ?? [];
    if (props.mode === "fromEmail") {
      if (props.fromEmail && emails.includes(props.fromEmail)) return;
      props.onFromEmailChange(firstSenderEmailInChannel(groups, channel));
      return;
    }
    const fe = fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);
    if (fe && emails.includes(fe) && inferChannelForSenderKey(props.senderKey, smtpItems, dedicatedServers, sesAddresses) === channel) {
      return;
    }
    const next = marketingSenderKeyForChannelEmail(
      channel,
      firstSenderEmailInChannel(groups, channel),
      smtpItems,
      dedicatedServers,
      sesAddresses
    );
    if (next !== props.senderKey) props.onSenderKeyChange(next);
  }, [channel, groups, smtpItems, dedicatedServers, sesAddresses]);

  function onEmailChange(email: string) {
    if (!email) return;
    if (listAllChannelEmails) {
      for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
        if ((groups[ch] ?? []).includes(email)) {
          setChannel(ch);
          break;
        }
      }
    }
    if (props.mode === "fromEmail") {
      props.onFromEmailChange(email);
      return;
    }
    const chForKey = listAllChannelEmails
      ? CAMPAIGN_STATS_CHANNEL_ORDER.find((ch) => (groups[ch] ?? []).includes(email)) ?? channel
      : channel;
    props.onSenderKeyChange(
      marketingSenderKeyForChannelEmail(chForKey, email, smtpItems, dedicatedServers, sesAddresses)
    );
  }

  const gridClass = omitPackageChannel
    ? "mt-3 grid max-w-[640px] grid-cols-1 gap-2"
    : inlineRow
      ? "mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
      : stackedRows || compact
        ? "flex flex-col gap-2"
        : "mt-3 grid max-w-[640px] grid-cols-1 gap-2 sm:grid-cols-2";

  const channelBoxClass = inlineRow
    ? "rounded-lg border border-sky-200/90 bg-gradient-to-b from-sky-50/95 to-sky-50/40 px-2.5 py-2 shadow-sm"
    : "flex flex-col gap-1";
  const emailBoxClass = inlineRow
    ? "rounded-lg border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-emerald-50/40 px-2.5 py-2 shadow-sm"
    : "flex flex-col gap-1";
  const inlineLabel = inlineRow ? "text-[10px] font-semibold" : "text-[10px] text-slate-500";
  const inlineSelect =
    "mt-1 h-8 w-full rounded-md border border-white/80 bg-white/95 px-2 text-[12px] outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200/80 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className={compact && !inlineRow ? "" : inlineRow ? "rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm" : "rounded-md border border-slate-200 bg-slate-50 p-3"}>
      {!compact ? <div className="text-xs font-semibold text-slate-800">{wb.senderEmailTitle}</div> : null}
      <div className={gridClass}>
        {!omitPackageChannel ? (
          <div className={channelBoxClass}>
            <span className={`${inlineLabel} ${inlineRow ? "text-sky-800" : ""}`}>{wb.packageChannelLabel}</span>
            <select
              className={inlineRow ? inlineSelect : "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400"}
              value={channel}
              onChange={(e) => setChannel(e.target.value as EmailChannelKind)}
            >
              {CAMPAIGN_STATS_CHANNEL_ORDER.map((ch) => (
                <option key={ch} value={ch}>
                  {CAMPAIGN_STATS_CHANNEL_LABELS[ch]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={emailBoxClass}>
          <span className={`${inlineLabel} ${inlineRow || omitPackageChannel ? "text-emerald-800" : ""}`}>
            {inlineRow || omitPackageChannel
              ? wb.senderDomainLabel
              : wb.boundSenderEmail(CAMPAIGN_STATS_CHANNEL_LABELS[channel])}
          </span>
          <select
            className={
              inlineRow || omitPackageChannel
                ? `${inlineSelect} font-mono text-[11px]`
                : "h-9 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-sm outline-none focus:border-slate-400"
            }
            value={selectedEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={
              pickerDisabled || (listAllEmails ? !hasAnySenderEmail : channelEmails.length === 0)
            }
          >
            {pickerDisabled && pickerDisabledHint ? (
              <option value="">{pickerDisabledHint}</option>
            ) : null}
            {listAllEmails ? (
              CAMPAIGN_STATS_CHANNEL_ORDER.map((ch) => {
                const emails = groups[ch] ?? [];
                const label = CAMPAIGN_STATS_CHANNEL_LABELS[ch];
                if (emails.length === 0) {
                  return (
                    <option key={`${ch}-empty`} value="" disabled>
                      {wb.noSenderForChannel(label)}
                    </option>
                  );
                }
                return emails.map((fe) => (
                  <option key={`${ch}-${fe}`} value={fe}>
                    {label} · {fe}
                  </option>
                ));
              })
            ) : channelEmails.length === 0 ? (
              <option value="">{wb.channelNoSenderOption}</option>
            ) : (
              channelEmails.map((fe) => (
                <option key={fe} value={fe}>
                  {fe}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
      {!compact && !omitPackageChannel ? (
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          {wb.channelPickerHint}
        </p>
      ) : null}
    </div>
  );
}
