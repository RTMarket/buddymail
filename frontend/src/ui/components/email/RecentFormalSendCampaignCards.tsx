import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsLaneStrings } from "../../../i18n/emailCampaignsLaneI18n";
import { campaignPickerCode, campaignSendPickerCodeText } from "../../../lib/campaignRoundDisplay";

export type FormalSendCampaignCard = {
  id: number;
  campaign_code: string | null;
  name: string;
  status?: string | null;
  latest_round_no?: number | null;
  created_at?: string | null;
  has_sent?: boolean;
  attempts_count?: number;
};

export function pickRecentFormalSendCampaigns(
  campaigns: FormalSendCampaignCard[],
  limit = 6
): FormalSendCampaignCard[] {
  return [...campaigns]
    .sort((a, b) => b.id - a.id)
    .slice(0, Math.max(1, Math.floor(limit)));
}

/** 未发送过、且非发送中/已完成的活动才可选（用于正式发送） */
export function isFormalSendCampaignSelectable(c: FormalSendCampaignCard): boolean {
  if (c.has_sent === true) return false;
  const attempts = Math.max(0, Number(c.attempts_count ?? 0));
  if (attempts > 0) return false;
  const s = String(c.status ?? "").toLowerCase();
  return s !== "sending" && s !== "completed" && s !== "stopped" && s !== "paused";
}

/** 活动卡片 → 下方发信栏应呈现的监控模式（仅 UI 分流，不改发送逻辑） */
export function formalSendCampaignCardMonitorMode(
  c: FormalSendCampaignCard,
  locallyFinishedIds: readonly number[]
): "sending" | "sent" | "ready" {
  const s = String(c.status ?? "").toLowerCase();
  if (s === "sending") return "sending";
  if (locallyFinishedIds.includes(c.id)) return "sent";
  if (!isFormalSendCampaignSelectable(c)) return "sent";
  return "ready";
}

function cardStatusMeta(
  c: FormalSendCampaignCard,
  locallyFinishedIds: ReadonlySet<number>,
  laneUi: ReturnType<typeof getEmailCampaignsLaneStrings>
): {
  label: string;
  tone: "ready" | "sent" | "sending";
} {
  const s = String(c.status ?? "").toLowerCase();
  if (s === "sending") return { label: laneUi.statusSending, tone: "sending" };
  if (locallyFinishedIds.has(c.id)) return { label: laneUi.statusSent, tone: "sent" };
  if (!isFormalSendCampaignSelectable(c)) return { label: laneUi.statusSent, tone: "sent" };
  return { label: laneUi.statusReady, tone: "ready" };
}

function formatCreatedHint(
  createdAt: string | null | undefined,
  laneUi: ReturnType<typeof getEmailCampaignsLaneStrings>
): string {
  const raw = String(createdAt ?? "").trim();
  if (!raw) return laneUi.newCampaign;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return laneUi.newCampaign;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return laneUi.createdToday(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
  }
  return laneUi.createdDate(d.getMonth() + 1, d.getDate());
}

export function RecentFormalSendCampaignCards(props: {
  campaigns: FormalSendCampaignCard[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  limit?: number;
  /** 本页已收尾的活动（API 仍可能短暂为 sending） */
  locallyFinishedIds?: readonly number[];
}) {
  const { campaigns, selectedId, onSelect, disabled = false, limit = 6, locallyFinishedIds = [] } = props;
  const { locale } = useSiteLocale();
  const laneUi = useMemo(() => getEmailCampaignsLaneStrings(locale), [locale]);
  const finishedSet = useMemo(
    () => new Set(locallyFinishedIds.map((id) => Math.floor(Number(id) || 0)).filter((id) => id > 0)),
    [locallyFinishedIds]
  );
  const recent = pickRecentFormalSendCampaigns(campaigns, limit);

  if (recent.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-xs text-slate-500">
        {laneUi.recentEmpty}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {recent.map((c) => {
        const idStr = String(c.id);
        const code = campaignSendPickerCodeText(campaignPickerCode(c), c.latest_round_no);
        const selected = selectedId === idStr;
        const selectable = isFormalSendCampaignSelectable(c);
        const meta = cardStatusMeta(c, finishedSet, laneUi);
        const locked = !selectable;

        const statusClass =
          meta.tone === "ready"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : meta.tone === "sending"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-100 text-slate-600";

        const shellClass = selected
          ? "border-violet-400 bg-gradient-to-br from-violet-50 to-white shadow-md shadow-violet-100 ring-2 ring-violet-200"
          : "border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm";

        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-disabled={locked}
            title={
              locked ? laneUi.cardClickSelect(code, c.name) : laneUi.cardClickSelect(code, c.name)
            }
            onClick={() => {
              if (disabled) return;
              onSelect(idStr);
            }}
            className={`group relative flex min-h-[5.5rem] flex-col rounded-xl border px-2.5 py-2 text-left transition ${shellClass} ${
              !disabled ? "cursor-pointer" : "cursor-not-allowed"
            }`}
          >
            {selected ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[9px] text-white">
                ✓
              </span>
            ) : null}
            {locked ? (
              <span
                className="absolute right-1.5 top-1.5 rounded-full border border-slate-200 bg-white/90 px-1 py-px text-[8px] font-medium text-slate-500"
                aria-hidden
              >
                🔒
              </span>
            ) : null}
            <span className="font-mono text-sm font-bold tracking-[0.12em] text-slate-900">{code}</span>
            <span className="mt-0.5 line-clamp-2 min-h-[2rem] text-[10px] leading-snug text-slate-600">{c.name}</span>
            <div className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${statusClass}`}>
                {meta.label}
              </span>
              <span className="text-[9px] text-slate-400">{formatCreatedHint(c.created_at, laneUi)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
