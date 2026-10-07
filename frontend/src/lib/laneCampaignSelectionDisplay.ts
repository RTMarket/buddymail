/**
 * 专线栏：活动 ID 下拉与「已选」小字展示（无轮次；每活动编号仅可发送一次）
 */

import { campaignPickerCode } from "./campaignRoundDisplay";

export type LaneCampaignPickerSource = {
  id: number;
  campaign_code?: string | null;
  name: string;
  status?: string | null;
  has_sent?: boolean;
};

/** 下拉选项文案：编号 · 名称 */
export function laneCampaignSelectOptionLabel(c: LaneCampaignPickerSource): string {
  const code = campaignPickerCode(c);
  const name = String(c.name ?? "").trim() || "未命名活动";
  return `${code} · ${name}`;
}

export type LaneCampaignSelectionSnapshot = {
  campaignId: number;
  code: string;
  name: string;
  /** 本栏开始发送时锁定的目标行业（勿用页级共享勾选覆盖） */
  targetIndustries?: string[];
};

export function buildLaneCampaignSelectionSnapshot(
  c: LaneCampaignPickerSource,
  targetIndustries?: string[]
): LaneCampaignSelectionSnapshot {
  const industries = (targetIndustries ?? [])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean);
  return {
    campaignId: c.id,
    code: campaignPickerCode(c),
    name: String(c.name ?? "").trim() || "未命名活动",
    ...(industries.length > 0 ? { targetIndustries: industries } : {})
  };
}

export function formatLaneIndustrySendNote(industries: string[]): string | null {
  if (industries.length === 0) return null;
  const names = industries.slice(0, 5);
  const more = industries.length > names.length ? ` 等 ${industries.length} 个` : "";
  return `发送目标行业：${names.join("、")}${more}`;
}

/** 发送中/汇报：优先本栏锁定或活动上的行业，避免被其它专线切换后的页级勾选覆盖 */
export function resolveLaneDisplayIndustries(opts: {
  frozenIndustries?: string[];
  campaignIndustries?: string[];
  pageIndustries: string[];
  laneUiActive: boolean;
  ownsSending: boolean;
}): string[] {
  const frozen = (opts.frozenIndustries ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (frozen.length > 0) return frozen;
  const camp = (opts.campaignIndustries ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if ((opts.laneUiActive || opts.ownsSending) && camp.length > 0) return camp;
  return opts.pageIndustries.map((t) => String(t ?? "").trim()).filter(Boolean);
}

export type LaneSelectionHint =
  | { kind: "picker"; snap: LaneCampaignSelectionSnapshot }
  | { kind: "sending"; snap: LaneCampaignSelectionSnapshot }
  | { kind: "completed"; snap: LaneCampaignSelectionSnapshot };

export function resolveLaneSelectionHint(input: {
  campaign: LaneCampaignPickerSource | null;
  campaignId: number;
  laneUiActive: boolean;
  confirmPending?: boolean;
  frozen: LaneCampaignSelectionSnapshot | null;
  lastCompleted: LaneCampaignSelectionSnapshot | null;
}): LaneSelectionHint | null {
  const { campaign, campaignId, laneUiActive, confirmPending, frozen, lastCompleted } = input;
  if (campaignId <= 0) return null;
  if (laneUiActive && frozen) return { kind: "sending", snap: frozen };
  if (!laneUiActive && !confirmPending && lastCompleted) {
    return { kind: "completed", snap: lastCompleted };
  }
  if (campaign && campaign.id === campaignId) {
    return { kind: "picker", snap: buildLaneCampaignSelectionSnapshot(campaign) };
  }
  return null;
}
