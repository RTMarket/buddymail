import { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getStandaloneDedicatedEntitlementsStrings } from "../../../i18n/standaloneDedicatedEntitlementsI18n";
import type { DedicatedEntitlementsSnapshot } from "../../../lib/dedicatedEntitlements";
import { formatDedicatedLineQuota } from "../../../lib/dedicatedEntitlements";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";

function QuotaCell(props: {
  label: string;
  used: number;
  total: number;
  hint?: string;
  /** 租户端专线：数字后加「条」，如 1/1 条 */
  valueSuffix?: string;
}) {
  const { label, used, total, hint, valueSuffix } = props;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const atCap = total > 0 && used >= total;

  return (
    <div className="min-w-[7.5rem] flex-1 rounded-lg border border-slate-200/90 bg-white/80 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {hint ? (
          <span className="truncate text-[10px] text-slate-400" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1 tabular-nums">
        {valueSuffix ? (
          <span className={`text-lg font-semibold ${atCap ? "text-amber-700" : "text-slate-900"}`}>
            {formatDedicatedLineQuota(used, total)}
          </span>
        ) : (
          <>
            <span className={`text-lg font-semibold ${atCap ? "text-amber-700" : "text-slate-900"}`}>{used}</span>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-sm font-medium text-slate-600">{total}</span>
          </>
        )}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${atCap ? "bg-amber-400" : "bg-violet-400/80"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DedicatedEntitlementsQuota(props: {
  snapshot: DedicatedEntitlementsSnapshot | null;
  /** 表格行内一行摘要（后台） */
  compact?: boolean;
  /** 标题旁横向条（租户页） */
  inline?: boolean;
  showFootnote?: boolean;
  /** 租户页用「专线 N 条」；后台 compact 仍显示「双机组」 */
  audience?: "tenant" | "admin";
  className?: string;
}) {
  const { snapshot, compact, inline, showFootnote = true, audience = "tenant", className } = props;
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getStandaloneDedicatedEntitlementsStrings(locale), [locale]);
  if (!snapshot || snapshot.dailyLimit <= 0) return null;

  const dailyLabel = snapshot.dailyLimit.toLocaleString(intlLocaleTag(locale));
  const isTenant = audience === "tenant";
  const lineLabel = isTenant ? ui.laneLabel : ui.laneLabelAdmin;
  const lineHintSuffix = isTenant ? ui.lineHintSuffix : "";

  const domainOver = Boolean(snapshot.blocksDedicatedSend && (snapshot.domainOverBy ?? 0) > 0);

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 ${className ?? ""}`}
      >
        <span className="text-slate-500">{ui.quotaLabel}</span>
        <span className={domainOver ? "text-rose-800" : undefined}>
          {ui.domainLabel}{" "}
          <span className={`font-medium tabular-nums ${domainOver ? "text-rose-900" : "text-slate-800"}`}>
            {snapshot.usedDomains}
          </span>
          <span className="text-slate-400">/</span>
          {snapshot.domainSlots}
          {domainOver ? (
            <span className="ml-1 font-medium text-rose-700">{ui.needDelete(snapshot.domainOverBy ?? 0)}</span>
          ) : null}
        </span>
        <span className="text-slate-300">·</span>
        <span>
          {lineLabel}{" "}
          <span className="font-medium tabular-nums text-slate-800">{snapshot.usedVpsGroups}</span>
          <span className="text-slate-400">/</span>
          {snapshot.vpsGroupSlots}
        </span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">{ui.dailySend(dailyLabel)}</span>
      </div>
    );
  }

  if (inline) {
    return (
      <div className={`flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md ${className ?? ""}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
          <span className="font-medium text-slate-600">{ui.laneQuotaTitle}</span>
          <span className="text-slate-300">·</span>
          <span>{ui.dailySend(dailyLabel)}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">{ui.readOnly}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <QuotaCell
            label={ui.domainLabel}
            used={snapshot.usedDomains}
            total={snapshot.domainSlots}
            hint={snapshot.domainsRemaining > 0 ? ui.remaining(snapshot.domainsRemaining) : ui.full}
          />
          <QuotaCell
            label={ui.laneLabel}
            used={snapshot.usedVpsGroups}
            total={snapshot.vpsGroupSlots}
            valueSuffix={ui.lineHintSuffix || undefined}
            hint={
              snapshot.vpsGroupsRemaining > 0
                ? ui.remainingLanes(snapshot.vpsGroupsRemaining, lineHintSuffix)
                : ui.full
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-slate-200/80 bg-gradient-to-br from-slate-50/90 to-white px-3 py-2.5 sm:px-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-700">{ui.packageLaneQuotaTitle}</span>
        <span className="text-[10px] text-slate-500">
          {ui.dailyLimitPrefix}{" "}
          <span className="tabular-nums font-medium text-slate-700">{dailyLabel}</span>
          <span className="mx-1 text-slate-300">·</span>
          {ui.readOnlyRef}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <QuotaCell
          label={ui.sendingDomainLabel}
          used={snapshot.usedDomains}
          total={snapshot.domainSlots}
          hint={snapshot.domainsRemaining > 0 ? ui.remaining(snapshot.domainsRemaining) : ui.full}
        />
        <QuotaCell
          label={ui.laneLabel}
          used={snapshot.usedVpsGroups}
          total={snapshot.vpsGroupSlots}
          valueSuffix={ui.lineHintSuffix || undefined}
          hint={
            snapshot.vpsGroupsRemaining > 0
              ? ui.remainingLanes(snapshot.vpsGroupsRemaining, ui.lineHintSuffix)
              : ui.full
          }
        />
      </div>
      {showFootnote ? (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{ui.footnote}</p>
      ) : null}
    </div>
  );
}
