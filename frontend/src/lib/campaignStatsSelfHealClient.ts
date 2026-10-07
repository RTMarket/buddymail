import { apiJson } from "./api";
import {
  purgeCampaignStatsCache,
  purgeLegacyCampaignStatsCache
} from "./campaignActivityStatsCache";
import { invalidateSendListCacheForCampaign } from "./campaignSendListCache";
import { purgeTenantRangeLocalCache } from "./campaignStatsCache";
import { invalidateCachedTodaySummary } from "./campaignTodaySummaryCache";

export type StatsSelfHealServerStep = {
  step: string;
  ok: boolean;
  ms?: number;
  detail?: string;
};

export type StatsSelfHealServerResult = {
  ok: boolean;
  tenantId: number;
  campaignId: number | null;
  steps: StatsSelfHealServerStep[];
};

export function purgeLocalStatsCachesForSelfHeal(campaignId: number) {
  purgeCampaignStatsCache(campaignId);
  purgeLegacyCampaignStatsCache();
  invalidateSendListCacheForCampaign(campaignId);
  invalidateCachedTodaySummary();
  purgeTenantRangeLocalCache();
}

export async function postStatsSelfHeal(campaignId: number | null): Promise<StatsSelfHealServerResult> {
  return apiJson<StatsSelfHealServerResult>("/api/email/stats-self-heal", {
    method: "POST",
    body: JSON.stringify(campaignId != null ? { campaignId } : {})
  });
}
