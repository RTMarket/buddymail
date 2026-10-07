import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsWorkbenchStrings } from "../../../i18n/emailCampaignsWorkbenchI18n";
import type { DedicatedLaneSnapshot } from "../../../lib/dedicatedLanes";
import { laneFromEmails } from "../../../lib/dedicatedLanes";
import { isStandaloneSingleIp30kPack } from "../../../lib/standaloneSingleIp30kProfile";
import {
  isStandaloneMultiLanePremiumPack,
  PREMIUM_LANE_DELIVERED_CAP
} from "../../../lib/standaloneMultiLanePremiumProfile";

function formatLaneUsage(sent: number, cap: number, wb: ReturnType<typeof getEmailCampaignsWorkbenchStrings>): string {
  if (cap <= 0) return wb.formatSentCap(sent);
  return `${sent.toLocaleString()} / ${cap.toLocaleString()}`;
}

export function DedicatedLanesWorkbench(props: {
  lanes: DedicatedLaneSnapshot[];
  selectedLaneIndex: number | "";
  onSelectLaneIndex: (laneIndex: number) => void;
  className?: string;
  /** 单组页可改为「今日工作台」等；默认「专线工作台」 */
  headingTitle?: string;
  headingDescription?: string;
  hideHeading?: boolean;
}) {
  const {
    lanes,
    selectedLaneIndex,
    onSelectLaneIndex,
    className,
    headingTitle = "专线工作台",
    headingDescription = "先选发信专线，再选该线下的发信邮箱。进度条按今日送达成功占套餐日发上限；下方小字为本线发送尝试总数（含失败）。",
    hideHeading = false
  } = props;
  const { locale } = useSiteLocale();
  const wb = useMemo(() => getEmailCampaignsWorkbenchStrings(locale), [locale]);
  const singleIp30k = isStandaloneSingleIp30kPack();
  const premiumMultiLane = isStandaloneMultiLanePremiumPack();
  const resolvedHeadingTitle = headingTitle ?? wb.defaultHeadingTitle;
  const resolvedHeadingDescription = headingDescription ?? wb.defaultHeadingDescription;
  if (!lanes.length) return null;

  return (
    <div className={className}>
      {!hideHeading ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-900">{resolvedHeadingTitle}</div>
            {resolvedHeadingDescription ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{resolvedHeadingDescription}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={`flex gap-2 overflow-x-auto pb-1 ${hideHeading ? "" : "mt-3"}`}>
        {lanes.map((lane) => {
          const emails = laneFromEmails(lane);
          const selected = selectedLaneIndex === lane.laneIndex;
          const packageCap = premiumMultiLane
            ? PREMIUM_LANE_DELIVERED_CAP
            : Math.max(0, Number(lane.packageDailyLimit ?? 0));
          const delivered = premiumMultiLane
            ? Math.max(0, Number(lane.deliveredToday ?? 0))
            : packageCap > 0
              ? Math.max(0, Number(lane.tenantDeliveredToday ?? lane.deliveredToday ?? 0))
              : Math.max(0, Number(lane.deliveredToday ?? lane.sentToday ?? 0));
          const packageRemaining = premiumMultiLane
            ? Math.max(0, PREMIUM_LANE_DELIVERED_CAP - delivered)
            : Math.max(
                0,
                Number(lane.packageDeliveredRemaining ?? (packageCap > 0 ? packageCap - delivered : 0))
              );
          const pct =
            packageCap > 0 ? Math.min(100, Math.round((delivered / packageCap) * 100)) : 0;
          const packageAtCap = packageCap > 0 && delivered >= packageCap;
          const attemptsAtCap = !premiumMultiLane && lane.lineSentCap > 0 && lane.sentToday >= lane.lineSentCap;
          const domainSendingCount = (lane.domains ?? []).filter((d) => d.sendingCampaignId != null).length;
          const sending = domainSendingCount > 0 || lane.sendingCampaignId != null;

          return (
            <button
              key={lane.laneIndex}
              type="button"
              onClick={() => onSelectLaneIndex(lane.laneIndex)}
              className={`min-w-[11.5rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-violet-400 bg-violet-50/90 ring-2 ring-violet-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">{lane.label}</span>
                {sending ? (
                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800">
                    {domainSendingCount > 0 ? wb.domainsSending(domainSendingCount) : wb.sending}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-600">
                {wb.domainCount(emails.length)}
                {lane.relayIp ? (
                  <span className="block truncate font-mono text-[9px] text-slate-400" title={lane.relayIp}>
                    {lane.relayIp}
                  </span>
                ) : null}
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between gap-1 text-[10px]">
                  <span className="text-slate-500">{wb.deliveredVsCap}</span>
                  <span
                    className={`tabular-nums font-medium ${packageAtCap ? "text-amber-800" : "text-slate-800"}`}
                  >
                    {formatLaneUsage(delivered, packageCap > 0 ? packageCap : delivered, wb)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${packageAtCap ? "bg-amber-400" : "bg-violet-400/80"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {packageAtCap ? (
                  <p className="mt-1 text-[9px] leading-snug text-amber-800">
                    {wb.capReachedToday}
                  </p>
                ) : packageCap > 0 && packageRemaining > 0 ? (
                  <p className="mt-1 text-[9px] text-slate-400">
                    {wb.remainingDeliveries(packageRemaining)}
                  </p>
                ) : null}
                {!singleIp30k && !premiumMultiLane ? (
                  <>
                    <div className="mt-1.5 flex items-baseline justify-between gap-1 text-[9px] text-slate-400">
                      <span>{wb.laneAttempts}</span>
                      <span className={`tabular-nums ${attemptsAtCap ? "text-amber-700" : ""}`}>
                        {formatLaneUsage(lane.sentToday, lane.lineSentCap, wb)}
                      </span>
                    </div>
                    {attemptsAtCap ? (
                      <p className="mt-0.5 text-[9px] leading-snug text-amber-800">
                        {wb.laneAttemptCapReached(lane.lineSentCap)}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
              {emails.length > 0 ? (
                <ul className="mt-2 max-h-16 space-y-0.5 overflow-y-auto text-[9px] font-mono text-slate-600">
                  {(lane.domains ?? [])
                    .filter((d) => d.fromEmail)
                    .slice(0, 4)
                    .map((d) => {
                      const fe = String(d.fromEmail ?? "").trim();
                      return (
                        <li key={fe} className="truncate" title={fe}>
                          {fe}
                          {d.sendingCampaignId ? (
                            <span className="ml-1 text-emerald-700">{wb.domainSendingSuffix}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  {emails.length > 4 ? (
                    <li className="text-slate-400">{wb.moreDomains(emails.length - 4)}</li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-2 text-[9px] text-slate-400">{wb.noDomainsHint}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
