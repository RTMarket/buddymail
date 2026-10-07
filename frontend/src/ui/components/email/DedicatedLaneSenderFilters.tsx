import React, { useEffect, useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import {
  CAMPAIGN_STATS_CHANNEL_ORDER,
  buildCampaignStatsSenderGroups,
  firstSenderEmailInChannel,
  statsFilterSelectListSize
} from "../../../lib/campaignStatsSenderChannels";
import type { DedicatedLaneDomain } from "../../../lib/dedicatedLanes";
import type { EmailChannelKind } from "../../../lib/dedicatedEntitlements";
import {
  findLaneByIndex,
  laneFromEmails,
  readLaneSenderSelectionPref,
  writeLaneSenderSelectionPref,
  type DedicatedLaneSnapshot
} from "../../../lib/dedicatedLanes";
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

const LANE_BOX =
  "rounded-lg border border-violet-200/90 bg-gradient-to-b from-violet-50/95 to-violet-50/40 px-2.5 py-2 shadow-sm";
const CHANNEL_BOX =
  "rounded-lg border border-sky-200/90 bg-gradient-to-b from-sky-50/95 to-sky-50/40 px-2.5 py-2 shadow-sm";
const DOMAIN_BOX =
  "rounded-lg border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-emerald-50/40 px-2.5 py-2 shadow-sm";

const SELECT_CLASS =
  "mt-1 w-full rounded-md border border-white/80 bg-white/95 px-2 text-[12px] outline-none ring-0 focus:border-slate-300 focus:ring-2 focus:ring-slate-200/80 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function filterSelectClass(listSize: number | undefined): string {
  return listSize != null
    ? `${SELECT_CLASS} min-h-0 py-1`
    : `${SELECT_CLASS} h-8`;
}

function resolveDomainOptionMeta(
  email: string,
  laneDomains: DedicatedLaneDomain[],
  smtpItems: MarketingSmtpRow[]
): { serverId: number | null; smtpProfileId: number | null } {
  const fe = normEmail(email);
  const dom = laneDomains.find((d) => normEmail(String(d.fromEmail ?? "")) === fe);
  if (dom) {
    return {
      serverId: Number(dom.serverId) > 0 ? Number(dom.serverId) : null,
      smtpProfileId: dom.smtpProfileId != null && Number(dom.smtpProfileId) > 0 ? Number(dom.smtpProfileId) : null
    };
  }
  const smtp = smtpItems.find((s) => normEmail(String(s.from_email ?? "")) === fe);
  if (smtp) {
    return {
      serverId:
        smtp.dedicated_server_id != null && Number(smtp.dedicated_server_id) > 0
          ? Number(smtp.dedicated_server_id)
          : null,
      smtpProfileId: Number(smtp.id) > 0 ? Number(smtp.id) : null
    };
  }
  return { serverId: null, smtpProfileId: null };
}

function formatDomainOptionLabel(
  email: string,
  meta: { serverId: number | null; smtpProfileId: number | null },
  channelLabel: string | undefined,
  dedicatedServerTag: (id: number) => string
): string {
  const idParts: string[] = [];
  if (meta.serverId != null) idParts.push(dedicatedServerTag(meta.serverId));
  if (meta.smtpProfileId != null) idParts.push(`SMTP#${meta.smtpProfileId}`);
  const prefix = idParts.length > 0 ? `${idParts.join(" ")} · ` : "";
  const ch = channelLabel ? `${channelLabel} · ` : "";
  return `${prefix}${ch}${email}`;
}

export function DedicatedLaneSenderFilters(
  props: {
    lanes: DedicatedLaneSnapshot[];
    selectedLaneIndex: number | "";
    onSelectLaneIndex: (laneIndex: number | "") => void;
    smtpItems: MarketingSmtpRow[];
    dedicatedServers?: DedicatedServerRow[];
    sesAddresses?: MarketingSesAddressRow[];
    channel?: EmailChannelKind;
    onChannelChange?: (ch: EmailChannelKind) => void;
    compact?: boolean;
    listAllChannelEmails?: boolean;
    /** 未选专线时禁用通道/邮箱（统计页） */
    requireLane?: boolean;
    /** 首项为「全部专线」，不强制选择 */
    allowAllLane?: boolean;
    /** 右侧栏：每行一栏纵向排列 */
    layout?: "grid" | "stacked";
    /** 记住租户最近选用的专线 / 通道 / 发信域 */
    preferenceStorageKey?: string;
    /** 独立站：隐藏「套餐通道」，直接选发信域名 */
    hidePackageChannel?: boolean;
  } & (FromEmailMode | SenderKeyMode)
) {
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const {
    lanes,
    selectedLaneIndex,
    onSelectLaneIndex,
    smtpItems,
    dedicatedServers = [],
    sesAddresses = [],
    channel: channelProp,
    onChannelChange,
    compact = false,
    listAllChannelEmails = false,
    requireLane = false,
    allowAllLane = false,
    layout = "grid",
    preferenceStorageKey,
    hidePackageChannel: hidePackageChannelProp
  } = props;

  const hidePackageChannel = hidePackageChannelProp ?? standaloneOmitPackageChannelPicker();

  const selectedLane = useMemo(
    () => findLaneByIndex(lanes, selectedLaneIndex),
    [lanes, selectedLaneIndex]
  );
  const allowedFromEmails = useMemo(() => laneFromEmails(selectedLane), [selectedLane]);
  const laneHasDomains = allowedFromEmails.length > 0;
  const laneBlocksPicker = requireLane && selectedLaneIndex === "";
  const pickerDisabled = laneBlocksPicker || (requireLane && !laneHasDomains);

  const groups = useMemo(() => {
    const base = buildCampaignStatsSenderGroups(smtpItems, dedicatedServers, sesAddresses);
    return filterGroupsByAllowlist(base, laneBlocksPicker ? [] : laneHasDomains ? allowedFromEmails : undefined);
  }, [smtpItems, dedicatedServers, sesAddresses, allowedFromEmails, laneBlocksPicker, laneHasDomains]);

  const channel =
    channelProp ??
    defaultChannelForGroups(groups);
  const setChannel = onChannelChange ?? (() => {});

  const channelEmails = groups[channel] ?? [];

  const laneDomains = selectedLane?.domains ?? [];

  /** 本专线下全部发信域（含专服 / SMTP 配置 ID），可按通道筛选 */
  const domainPickerOptions = useMemo(() => {
    if (!laneHasDomains || laneBlocksPicker) return [];
    const rows: Array<{ email: string; channel: EmailChannelKind; channelLabel: string; meta: ReturnType<typeof resolveDomainOptionMeta> }> = [];
    const seen = new Set<string>();
    const pushEmail = (fe: string, ch: EmailChannelKind) => {
      const email = normEmail(fe);
      if (!email || seen.has(email)) return;
      if (!allowedFromEmails.includes(email)) return;
      seen.add(email);
      rows.push({
        email,
        channel: ch,
        channelLabel: childUi.channelLabel(ch),
        meta: resolveDomainOptionMeta(email, laneDomains, smtpItems)
      });
    };
    if (listAllChannelEmails || hidePackageChannel) {
      if (hidePackageChannel) {
        for (const fe of allowedFromEmails) {
          const ch =
            CAMPAIGN_STATS_CHANNEL_ORDER.find((c) => (groups[c] ?? []).includes(fe)) ?? "medium";
          pushEmail(fe, ch);
        }
      } else {
        for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
          for (const fe of groups[ch] ?? []) pushEmail(fe, ch);
        }
      }
    } else {
      for (const fe of channelEmails) pushEmail(fe, channel);
    }
    return rows.sort((a, b) => a.email.localeCompare(b.email));
  }, [
    laneHasDomains,
    laneBlocksPicker,
    allowedFromEmails,
    listAllChannelEmails,
    hidePackageChannel,
    groups,
    channel,
    channelEmails,
    laneDomains,
    smtpItems,
    childUi
  ]);

  const laneOptionCount = lanes.length + (allowAllLane ? 1 : 0);
  const channelOptionCount = CAMPAIGN_STATS_CHANNEL_ORDER.length;
  const domainOptionCount =
    domainPickerOptions.length +
    (pickerDisabled && laneBlocksPicker ? 1 : 0) +
    (!laneHasDomains ? 1 : 0);
  const laneListSize = statsFilterSelectListSize(laneOptionCount);
  const channelListSize = statsFilterSelectListSize(channelOptionCount);
  const domainListSize = statsFilterSelectListSize(domainOptionCount);

  const selectedEmail =
    props.mode === "fromEmail"
      ? props.fromEmail
      : fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);

  useEffect(() => {
    if (laneBlocksPicker) return;
    if (allowAllLane && selectedLaneIndex === "") return;
    if (!selectedLane) return;

    if (!laneHasDomains) {
      if (props.mode === "fromEmail") props.onFromEmailChange("");
      return;
    }

    const pref = preferenceStorageKey ? readLaneSenderSelectionPref(preferenceStorageKey) : null;
    if (
      pref &&
      pref.laneIndex === selectedLaneIndex &&
      pref.fromEmail &&
      allowedFromEmails.includes(pref.fromEmail) &&
      (hidePackageChannel || (groups[pref.channel] ?? []).includes(pref.fromEmail))
    ) {
      onChannelChange?.(pref.channel);
      if (props.mode === "fromEmail") {
        if (normEmail(props.fromEmail) !== normEmail(pref.fromEmail)) props.onFromEmailChange(pref.fromEmail);
      } else {
        const key = marketingSenderKeyForChannelEmail(
          pref.channel,
          pref.fromEmail,
          smtpItems,
          dedicatedServers,
          sesAddresses
        );
        if (props.senderKey !== key) props.onSenderKeyChange(key);
      }
      return;
    }

    if (props.mode === "fromEmail") {
      if (props.fromEmail && allowedFromEmails.includes(props.fromEmail)) return;
      const first = allowedFromEmails[0];
      if (first) {
        const ch =
          CAMPAIGN_STATS_CHANNEL_ORDER.find((c) => (groups[c] ?? []).includes(first)) ?? "medium";
        if (channelProp !== ch) onChannelChange?.(ch);
        if (normEmail(props.fromEmail) !== normEmail(first)) props.onFromEmailChange(first);
        return;
      }
      props.onFromEmailChange("");
      return;
    }

    if (hidePackageChannel) {
      const fe = fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);
      if (fe && allowedFromEmails.includes(fe)) return;
      const first = allowedFromEmails[0];
      if (first) {
        const ch =
          CAMPAIGN_STATS_CHANNEL_ORDER.find((c) => (groups[c] ?? []).includes(first)) ?? "medium";
        if (channelProp !== ch) onChannelChange?.(ch);
        const next = marketingSenderKeyForChannelEmail(
          ch,
          first,
          smtpItems,
          dedicatedServers,
          sesAddresses
        );
        if (props.senderKey !== next) props.onSenderKeyChange(next);
      }
      return;
    }

    const fe = fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);
    if (
      fe &&
      allowedFromEmails.includes(fe) &&
      inferChannelForSenderKey(props.senderKey, smtpItems, dedicatedServers, sesAddresses) === channel
    ) {
      return;
    }
    for (const ch of CAMPAIGN_STATS_CHANNEL_ORDER) {
      const nextFe = firstSenderEmailInChannel(groups, ch);
      if (nextFe) {
        onChannelChange?.(ch);
        const next = marketingSenderKeyForChannelEmail(
          ch,
          nextFe,
          smtpItems,
          dedicatedServers,
          sesAddresses
        );
        if (props.senderKey !== next) props.onSenderKeyChange(next);
        return;
      }
    }
  }, [
    selectedLaneIndex,
    allowedFromEmails.join("|"),
    laneBlocksPicker,
    laneHasDomains,
    smtpItems,
    dedicatedServers,
    sesAddresses,
    preferenceStorageKey,
    channelProp
  ]);

  useEffect(() => {
    if (!preferenceStorageKey || selectedLaneIndex === "" || !laneHasDomains) return;
    const fromEmail =
      props.mode === "fromEmail"
        ? props.fromEmail
        : fromEmailForMarketingSenderKey(props.senderKey, smtpItems, sesAddresses);
    if (!fromEmail) return;
    writeLaneSenderSelectionPref(preferenceStorageKey, {
      laneIndex: Number(selectedLaneIndex),
      channel,
      fromEmail
    });
  }, [
    preferenceStorageKey,
    selectedLaneIndex,
    channel,
    props.mode,
    props.mode === "fromEmail" ? props.fromEmail : props.senderKey,
    smtpItems,
    sesAddresses,
    laneHasDomains
  ]);

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

  const rowClass =
    layout === "stacked"
      ? "flex flex-col gap-2"
      : compact
        ? hidePackageChannel
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
          : "grid grid-cols-1 gap-2 sm:grid-cols-3"
        : hidePackageChannel
          ? "mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2"
          : "mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3";

  const labelClass = compact ? "text-[9px] font-semibold uppercase tracking-wide" : "text-[10px] font-semibold";

  const shellClass = compact
    ? ""
    : "rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm";

  const titleClass = compact ? "text-[10px] font-semibold text-slate-800" : "text-xs font-semibold text-slate-900";

  return (
    <div className={shellClass}>
      {!compact ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className={titleClass}>{childUi.laneFiltersTitle}</div>
          <p className="text-[10px] text-slate-500">
            {hidePackageChannel
              ? locale === "en"
                ? "Lane → sending domain (standalone)"
                : "顺序：发信专线 → 发信域名"
              : childUi.laneFiltersHint}
          </p>
        </div>
      ) : null}

      <div className={rowClass}>
        <div className={LANE_BOX}>
          <span className={`${labelClass} text-violet-800`}>{childUi.selectLane}</span>
          <select
            className={filterSelectClass(laneListSize)}
            size={laneListSize}
            value={selectedLaneIndex === "" ? "" : String(selectedLaneIndex)}
            onChange={(e) => {
              const v = e.target.value;
              onSelectLaneIndex(v ? Number(v) : "");
            }}
          >
            <option value="">{allowAllLane ? childUi.allLanes : childUi.selectLanePlaceholder}</option>
            {lanes.map((lane) => {
              const domainCount = laneFromEmails(lane).length;
              const sending = (lane.domains ?? []).some((d) => d.sendingCampaignId != null);
              const vps =
                lane.vpsGroupId != null && Number(lane.vpsGroupId) > 0 ? ` · VPS#${lane.vpsGroupId}` : "";
              return (
                <option key={lane.laneIndex} value={String(lane.laneIndex)}>
                  {childUi.laneOption(lane.laneIndex, lane.label, domainCount, sending)}
                  {vps}
                </option>
              );
            })}
          </select>
          {selectedLane ? (
            <p className="mt-1 truncate text-[9px] leading-snug text-violet-700/90">
              {laneHasDomains
                ? childUi.laneDomainsSummary(
                    allowedFromEmails.length,
                    selectedLane.relayIp ? ` · ${selectedLane.relayIp}` : ""
                  )
                : childUi.laneNoDomains}
            </p>
          ) : null}
        </div>

        {!hidePackageChannel ? (
        <div className={CHANNEL_BOX}>
          <span className={`${labelClass} text-sky-800`}>{childUi.packageChannelLabel}</span>
          <select
            className={filterSelectClass(channelListSize)}
            size={channelListSize}
            value={laneHasDomains && !pickerDisabled ? channel : ""}
            onChange={(e) => setChannel(e.target.value as EmailChannelKind)}
            disabled={pickerDisabled || !laneHasDomains}
          >
            {pickerDisabled && laneBlocksPicker ? (
              <option value="">{childUi.selectLaneFirst}</option>
            ) : !laneHasDomains ? (
              <option value="">—</option>
            ) : (
              CAMPAIGN_STATS_CHANNEL_ORDER.map((ch) => {
                const count = (groups[ch] ?? []).length;
                return (
                  <option key={ch} value={ch} disabled={count === 0 && !listAllChannelEmails}>
                    {childUi.channelOption(ch, count)}
                  </option>
                );
              })
            )}
          </select>
          {laneHasDomains && !pickerDisabled ? (
            <p className="mt-1 text-[9px] text-sky-700/85">
              {childUi.channelLabel(channel)}
              {childUi.channelEmailCount(channelEmails.length)}
            </p>
          ) : (
            <p className="mt-1 text-[9px] text-sky-600/70">—</p>
          )}
        </div>
        ) : null}

        <div className={DOMAIN_BOX}>
          <span className={`${labelClass} text-emerald-800`}>{childUi.senderDomain}</span>
          <select
            className={`${filterSelectClass(domainListSize)} font-mono text-[11px]`}
            size={domainListSize}
            value={laneHasDomains && !pickerDisabled ? selectedEmail : ""}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={pickerDisabled || !laneHasDomains || domainPickerOptions.length === 0}
          >
            {pickerDisabled && laneBlocksPicker ? (
              <option value="">{childUi.selectLaneFirst}</option>
            ) : !laneHasDomains ? (
              <option value="">—</option>
            ) : domainPickerOptions.length === 0 ? (
              <option value="">{childUi.channelNoDomains}</option>
            ) : (
              domainPickerOptions.map((row) => (
                <option key={`${row.channel}-${row.email}`} value={row.email}>
                  {formatDomainOptionLabel(
                    row.email,
                    row.meta,
                    listAllChannelEmails ? childUi.channelLabel(row.channel) : undefined,
                    childUi.dedicatedServerTag
                  )}
                </option>
              ))
            )}
          </select>
          {laneHasDomains && selectedEmail ? (
            <p className="mt-1 truncate font-mono text-[9px] text-emerald-800/90" title={selectedEmail}>
              {selectedEmail}
            </p>
          ) : (
            <p className="mt-1 text-[9px] text-emerald-600/70">—</p>
          )}
        </div>
      </div>

      {!compact && layout !== "stacked" ? (
        <p className="mt-2 text-[10px] leading-snug text-slate-500">{childUi.laneFiltersOrderHint}</p>
      ) : null}
    </div>
  );
}
