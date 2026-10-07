import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import type { DedicatedLaneSnapshot } from "../../../lib/dedicatedLanes";
import {
  clearLegacyLaneCampaignSessionKeys,
  laneCampaignSessionKey,
  readLaneCampaignId,
  resolveInternalCampaignId
} from "../../../lib/laneFormalSendSession";
import {
  isStandaloneMultiLanePremiumPack,
  PREMIUM_LANE_DELIVERED_CAP
} from "../../../lib/standaloneMultiLanePremiumProfile";
import { LaneFormalSendPanel } from "./LaneFormalSendPanel";

type CampaignOption = {
  id: number;
  campaign_code: string | null;
  name: string;
  status?: string | null;
  recipient_count?: number | null;
  has_sent?: boolean;
  smtp_from_email?: string | null;
  targetIndustries?: string[];
};

export function DedicatedLaneFormalSendStack(props: {
  lanes: DedicatedLaneSnapshot[];
  campaigns: CampaignOption[];
  /** 保存活动后仅应用到对应专线栏（不同步其它栏） */
  laneCampaignApplySignal?: { token: number; laneIndex: number; campaignId: number } | null;
  campaignsLoaded?: boolean;
  /** 专线列表 API 已返回；刷新恢复监控须等 lane.sendingCampaignId 就位 */
  lanesReady?: boolean;
  formalSelectedIndustries: string[];
  formalAudienceCount: number | null;
  formalSendMinIntervalMs: number;
  sessionWatchKeyPrefix: string;
  onRefreshCampaigns: () => Promise<void>;
  onRefreshLanes?: () => Promise<void>;
  onCampaignStopped?: (campaignId: number) => void;
  onCampaignSendStarted?: (campaignId: number) => void;
  /** 多机组正式发送专页：隐藏专线栈顶部长说明 */
  hideStackHint?: boolean;
}) {
  const {
    lanes,
    campaigns,
    laneCampaignApplySignal = null,
    campaignsLoaded = false,
    lanesReady = true,
    formalSelectedIndustries,
    formalAudienceCount,
    formalSendMinIntervalMs,
    sessionWatchKeyPrefix,
    onRefreshCampaigns,
    onRefreshLanes,
    onCampaignStopped,
    onCampaignSendStarted,
    hideStackHint = false
  } = props;

  const [laneSelections, setLaneSelections] = useState<Record<number, number>>({});

  useEffect(() => {
    clearLegacyLaneCampaignSessionKeys(sessionWatchKeyPrefix, Math.max(lanes.length, 8));
  }, [sessionWatchKeyPrefix, lanes.length]);

  useEffect(() => {
    const next: Record<number, number> = {};
    const usedIds = new Set<number>();
    for (const lane of [...lanes].sort((a, b) => a.laneIndex - b.laneIndex)) {
      const key = laneCampaignSessionKey(sessionWatchKeyPrefix, lane.laneIndex);
      const id = resolveInternalCampaignId(readLaneCampaignId(key), campaigns);
      if (id > 0 && !usedIds.has(id)) {
        next[lane.laneIndex] = id;
        usedIds.add(id);
      }
    }
    setLaneSelections(next);
  }, [lanes, campaigns, sessionWatchKeyPrefix]);

  const onLaneSelectionChange = useCallback((laneIndex: number, campaignId: number) => {
    setLaneSelections((prev) => {
      const cid = campaignId > 0 ? campaignId : 0;
      if ((prev[laneIndex] ?? 0) === cid) return prev;
      const copy = { ...prev };
      if (cid > 0) copy[laneIndex] = cid;
      else delete copy[laneIndex];
      return copy;
    });
  }, []);

  const reservedByLane = useMemo(() => {
    const map = new Map<number, ReadonlySet<number>>();
    for (const lane of lanes) {
      const reserved = new Set<number>();
      for (const [li, cid] of Object.entries(laneSelections)) {
        const laneIdx = Number(li);
        if (laneIdx !== lane.laneIndex && cid > 0) reserved.add(cid);
      }
      map.set(lane.laneIndex, reserved);
    }
    return map;
  }, [lanes, laneSelections]);

  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const premiumMultiLane = isStandaloneMultiLanePremiumPack();

  return (
    <div className="space-y-3">
      {!hideStackHint ? (
        <p className="text-[11px] leading-relaxed text-slate-600">
          {premiumMultiLane
            ? childUi.premiumMultiLaneStackHint(lanes.length, PREMIUM_LANE_DELIVERED_CAP)
            : childUi.multiLaneStackHint(lanes.length)}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {lanes.map((lane) => (
          <div key={lane.laneIndex} className="relative min-w-0">
            <LaneFormalSendPanel
            key={lane.laneIndex}
            lane={lane}
            campaigns={campaigns}
            laneCampaignApplySignal={
              laneCampaignApplySignal?.laneIndex === lane.laneIndex ? laneCampaignApplySignal : null
            }
            campaignsLoaded={campaignsLoaded}
            lanesReady={lanesReady}
            formalSelectedIndustries={formalSelectedIndustries}
            formalAudienceCount={formalAudienceCount}
            formalSendMinIntervalMs={formalSendMinIntervalMs}
            sessionWatchKeyPrefix={sessionWatchKeyPrefix}
            reservedCampaignIds={reservedByLane.get(lane.laneIndex) ?? new Set()}
            onLaneSelectionChange={onLaneSelectionChange}
            onRefreshCampaigns={onRefreshCampaigns}
            onRefreshLanes={onRefreshLanes}
            onCampaignStopped={onCampaignStopped}
            onCampaignSendStarted={onCampaignSendStarted}
          />
          </div>
        ))}
      </div>
    </div>
  );
}
