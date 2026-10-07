/**
 * 邮件营销页 · 发信区实时监控（与专线栏逻辑对齐，独立模块便于维护）
 */

import {
  mapSendProgressRecentRows,
  syncLaneLiveRowsFromPoll,
  type LaneLiveRow
} from "./laneSendLiveRows";
import type { SiteLocale } from "../i18n/siteLocaleTypes";
import {
  formatLaneSendDurationSec,
  formatLaneSendFinishedAt,
  type LaneSendSessionSummary
} from "./laneSendSession";

export { mapSendProgressRecentRows, syncLaneLiveRowsFromPoll };
export type { LaneLiveRow };

export type FormalSendCompletionKind = "done" | "pause" | "stop";

/** 发送结束绿色/琥珀汇报快照 */
export type FormalSendReportSnapshot = {
  campaignId: number;
  kind: FormalSendCompletionKind;
  campaignCode: string;
  campaignName: string;
  industryLabels: string;
  plannedRecipients: number;
  fromEmails: string;
  attempted: number;
  sent: number;
  failed: number;
  durationSec: number;
  /** 展示用：本次发送完成时刻 */
  finishedAtMs: number;
  /** 展示用：活动计划/实际发送时间说明 */
  sendTimeLabel: string;
};

export function formatFormalIndustryLabels(tags: string[]): string {
  const list = tags.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (list.length === 0) return "未限定行业（按活动受众）";
  if (list.length <= 4) return list.join("、");
  return `${list.slice(0, 4).join("、")} 等 ${list.length} 个`;
}

/** 绿色汇报多行文案（活动 ID、行业、人数、邮箱、成功/失败、用时、发送时间） */
export function formatFormalSendCompletionLines(s: FormalSendReportSnapshot): string[] {
  const code = s.campaignCode.trim() || String(s.campaignId).padStart(6, "0");
  const name = s.campaignName.trim() || "未命名活动";
  const industries = s.industryLabels.trim() || "—";
  const emails = s.fromEmails.trim() || "—";
  const planned = Math.max(0, Math.floor(s.plannedRecipients));
  const attempted = Math.max(0, Math.floor(s.attempted));
  const sent = Math.max(0, Math.floor(s.sent));
  const failed = Math.max(0, Math.floor(s.failed));
  const time = formatLaneSendDurationSec(s.durationSec);
  const finishedAt = formatLaneSendFinishedAt(s.finishedAtMs);
  const sendTime = s.sendTimeLabel.trim() || finishedAt;

  const head =
    s.kind === "done"
      ? `活动 ID ${code} · ${name} · 已完成 ✅`
      : s.kind === "stop"
        ? `活动 ID ${code} · ${name} · 已停止发送`
        : `活动 ID ${code} · ${name} · 已暂停发送`;

  if (s.kind === "stop") {
    return [
      head,
      `发送行业：${industries}`,
      `计划人数 ${planned.toLocaleString()} · 发信邮箱 ${emails}`,
      `实际发送 ${attempted.toLocaleString()} 封`,
      `用时 ${time} · 活动发送时间 ${sendTime}`
    ];
  }

  return [
    head,
    `发送行业：${industries}`,
    `计划人数 ${planned.toLocaleString()} · 发信邮箱 ${emails}`,
    `实际发送 ${attempted.toLocaleString()} 封 · 成功 ${sent.toLocaleString()} 封 · 失败 ${failed.toLocaleString()} 封`,
    `用时 ${time} · 活动发送时间 ${sendTime}`
  ];
}

/** 专线收尾摘要 → 与单发信区相同的绿色/红色汇报框 */
export function laneSummaryToFormalReport(
  s: LaneSendSessionSummary,
  opts: {
    campaignId?: number;
    fromEmails?: string;
    kind?: FormalSendCompletionKind;
    unnamedCampaign?: string;
    unscopedIndustries?: string;
    locale?: SiteLocale;
  }
): FormalSendReportSnapshot {
  const locale = opts.locale ?? "zh";
  const industries = String(s.targetIndustriesNote ?? "")
    .replace(/^发送目标行业：?/u, "")
    .trim();
  const attempted = Math.max(0, Math.floor(s.attempted));
  const kind = opts.kind ?? (s.stopped ? "stop" : "done");
  const unnamed = opts.unnamedCampaign ?? "未命名活动";
  const unscoped = opts.unscopedIndustries ?? "未限定行业（按活动受众）";
  return {
    campaignId: Math.max(0, Math.floor(Number(opts.campaignId) || 0)),
    kind,
    campaignCode: String(s.campaignCode ?? "").trim(),
    campaignName: String(s.campaignName ?? "").trim() || unnamed,
    industryLabels: industries || unscoped,
    plannedRecipients: Math.max(0, Math.floor(s.planned)),
    fromEmails: String(opts.fromEmails ?? "").trim() || "—",
    attempted,
    sent: Math.max(0, Math.floor(s.sent)),
    failed: Math.max(0, Math.floor(s.failed)),
    durationSec: Math.max(0, Math.floor(s.durationSec)),
    finishedAtMs: Math.max(0, Math.floor(Number(s.finishedAtMs) || Date.now())),
    sendTimeLabel: formatLaneSendFinishedAt(s.finishedAtMs ?? Date.now(), locale)
  };
}

/** 最近 N 行：不足 N 条时用 null 占位（发信区实时监控默认 5 行） */
export function padLiveRowsForMonitor(rows: LaneLiveRow[], maxRows = 5): Array<LaneLiveRow | null> {
  const cap = Math.max(1, Math.floor(maxRows));
  const last = rows.slice(-cap);
  const out: Array<LaneLiveRow | null> = [...last];
  while (out.length < cap) out.push(null);
  return out;
}

/** 投递终态（与营销活动统计失败栏口径一致：退信/拒收/失败均计入失败） */
export type LaneDeliveryOutcome = "success" | "fail" | "bounce" | "reject";

export function isSmtpRejectError(err: string | null | undefined): boolean {
  const t = String(err ?? "").trim();
  if (!t) return false;
  return /(?:rejected|denied|拒收|拒绝|unauthenticated|550\s|554\s|5\.7\.|5\.1\.1)/i.test(t);
}

export function classifyLaneDeliveryOutcome(row: LaneLiveRow): LaneDeliveryOutcome | null {
  const s = String(row.status ?? "").toLowerCase();
  const bounceN = Math.max(0, Number(row.bounceEventCount ?? 0));
  if (s === "sending" || s === "skipped") return null;
  if (s === "sent" && bounceN > 0) return "bounce";
  if (s === "sent") return "success";
  if (s === "suppressed") return "fail";
  if (s === "failed") {
    return isSmtpRejectError(row.error) ? "reject" : "fail";
  }
  return null;
}

export type MonitorDisplaySlot = {
  row: LaneLiveRow | null;
  queueLabel: string;
  outcome: LaneDeliveryOutcome | null;
};

export function buildMonitorDisplaySlots(liveRows: LaneLiveRow[], maxRows = 5): MonitorDisplaySlot[] {
  return padLiveRowsForMonitor(liveRows, maxRows).map((row) => {
    if (row == null) {
      return { row: null, queueLabel: "等待中", outcome: null };
    }
    const outcome = classifyLaneDeliveryOutcome(row);
    const s = String(row.status ?? "").toLowerCase();
    const queueLabel = s === "sending" ? "发送中" : outcome != null ? "已投递" : "发送中";
    return { row, queueLabel, outcome };
  });
}

export function formalSendProgressStatusLabel(progressPct: number, isSending: boolean): string {
  const p = Math.max(0, Math.min(100, Math.floor(progressPct)));
  if (p >= 100) return "已完成";
  if (!isSending) return p > 0 ? "已结束" : "未在发送";
  if (p <= 0) return "发送中… 0%";
  return `发送中… ${p}%`;
}
