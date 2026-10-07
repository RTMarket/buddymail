/** 统计页 panel=1 时裁剪响应，其它页面仍用完整 stats JSON */

export type CampaignStatsSummaryPayload = Record<string, unknown>;

export function pickCampaignStatsPanelSummary(summary: CampaignStatsSummaryPayload) {
  return {
    deliveredPct: summary.deliveredPct,
    openedPct: summary.openedPct,
    bouncedPct: summary.bouncedPct,
    unsubscribeCount: summary.unsubscribeCount,
    unsubscribePct: summary.unsubscribePct,
    subscribeCount: summary.subscribeCount,
    subscribePct: summary.subscribePct,
    complaintCount: summary.complaintCount,
    openedCount: summary.openedCount,
    successCount: summary.successCount,
    failCount: summary.failCount,
    successRatePct: summary.successRatePct,
    subscribeTodayCount: summary.subscribeTodayCount,
    subscribeTodayDate: summary.subscribeTodayDate,
    subscribeTodayBySendingDomain: summary.subscribeTodayBySendingDomain
  };
}

export function buildCampaignStatsHttpBody(opts: {
  campaignId: number;
  panel: boolean;
  fromY: string;
  toY: string;
  statsScope: string;
  campaignSendFirstYmd: string | null;
  campaignSendLastYmd: string | null;
  summary: CampaignStatsSummaryPayload;
  roundSummary?: CampaignStatsSummaryPayload | null;
  selectedSendRunId?: number | null;
  selectedRoundNo?: number | null;
  series: Array<{
    label: string;
    success: number;
    fail: number;
    date?: string;
    segments?: Array<{ timeRange: string; success: number }>;
  }>;
  senderEmails?: unknown;
}) {
  const base = {
    ok: true as const,
    campaignId: opts.campaignId,
    range: { from: opts.fromY, to: opts.toY },
    statsScope: opts.statsScope,
    campaignSendFirstYmd: opts.campaignSendFirstYmd,
    campaignSendLastYmd: opts.campaignSendLastYmd,
    summary: opts.panel ? pickCampaignStatsPanelSummary(opts.summary) : opts.summary,
    roundSummary:
      opts.roundSummary != null
        ? opts.panel
          ? pickCampaignStatsPanelSummary(opts.roundSummary)
          : opts.roundSummary
        : undefined,
    selectedSendRunId: opts.selectedSendRunId ?? undefined,
    selectedRoundNo: opts.selectedRoundNo ?? undefined,
    series: opts.series
  };
  if (opts.panel) return base;
  return {
    ...base,
    senderEmails: opts.senderEmails
  };
}
