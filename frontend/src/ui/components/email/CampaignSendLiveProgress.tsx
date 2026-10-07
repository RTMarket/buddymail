import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import { sendProgressBarColorClass } from "../../../lib/campaignSendLiveMonitor";

type Props = {
  planned: number;
  remainCount: number;
  remainSec: number;
  progressPct: number;
  isSending: boolean;
  avgSecPerMail?: number | null;
  compact?: boolean;
  className?: string;
  /** 专线栏完成动画等场景覆盖左侧状态文案 */
  statusLabelOverride?: string;
  /** 点击发送后立即展示（0% 时也显示计划/剩余/时间） */
  alwaysShow?: boolean;
  /** 发送目标行业标签说明（便于回看选了哪组受众） */
  audienceIndustryNote?: string | null;
  /** 去重前受众联系人总数（用于显示「N 个联系人 · M 个唯一邮箱」） */
  totalContacts?: number | null;
};

/** 发送实时监控：计划人数、剩余时间、分档进度条 */
export function CampaignSendLiveProgress({
  planned,
  remainCount,
  remainSec,
  progressPct,
  isSending,
  avgSecPerMail,
  compact = false,
  className = "",
  statusLabelOverride,
  alwaysShow = false,
  audienceIndustryNote = null,
  totalContacts = null
}: Props) {
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const show = alwaysShow || planned > 0 || isSending || progressPct > 0;
  if (!show) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  const barClass = sendProgressBarColorClass(pct);
  const status = statusLabelOverride ?? childUi.sendProgressStatus(pct, isSending);
  const textSize = compact ? "text-[10px]" : "text-xs";

  return (
    <div className={`mt-2 space-y-1.5 ${className}`.trim()}>
      <div className={`${textSize} leading-relaxed text-slate-600`}>
        <div className="font-medium text-slate-800">{childUi.plannedAudienceLine(planned, totalContacts)}</div>
        {planned > 0 ? (
          <div className="mt-0.5 tabular-nums">
            {isSending || remainCount > 0 ? (
              <span>
                {childUi.liveProgressRemain(
                  remainCount,
                  childUi.formatRemainHms(remainSec),
                  avgSecPerMail ?? undefined
                )}
              </span>
            ) : (
              <span className="text-emerald-700">{childUi.liveProgressFinished}</span>
            )}
          </div>
        ) : (
          <div className="mt-0.5 text-slate-500">{childUi.liveProgressCounting}</div>
        )}
        {audienceIndustryNote ? (
          <div className="mt-1 text-slate-600">{audienceIndustryNote}</div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-medium text-slate-700`}>{status}</span>
        <span className={`tabular-nums ${compact ? "text-[10px]" : "text-[11px]"} text-slate-600`}>{pct}%</span>
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-slate-200 ${compact ? "h-1.5" : "h-2"}`}>
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
