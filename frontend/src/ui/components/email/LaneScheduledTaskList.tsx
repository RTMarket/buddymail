import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";
import { apiJson } from "../../../lib/api";

type ScheduledTask = {
  id: number;
  lane_index: number;
  campaign_id: number | null;
  campaign_name: string;
  target_industries: string;
  audience_count: number;
  scheduled_at: string;
  status: "pending" | "pending_confirm" | "running" | "completed" | "cancelled" | "failed";
  executed_at: string | null;
  completed_at: string | null;
  last_error?: string | null;
  created_at: string;
};

type CampaignOption = {
  id: number;
  campaign_code: string | null;
  name: string;
  status?: string | null;
  recipient_count?: number | null;
  has_sent?: boolean;
};

function formatBeijingTime(iso: string, locale: ReturnType<typeof useSiteLocale>["locale"]): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intlLocaleTag(locale), {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type Props = {
  laneIndex: number;
  disabledLane: boolean;
  campaigns: CampaignOption[];
  selectedCampaignId: number | null;
  formalSelectedIndustries: string[];
  formalAudienceCount: number | null;
};

export function LaneScheduledTaskList(props: Props) {
  const { laneIndex, disabledLane, campaigns, selectedCampaignId, formalSelectedIndustries, formalAudienceCount } = props;
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const industryJoin = locale === "en" ? ", " : "、";
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskDate, setTaskDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    return now.toISOString().slice(0, 10);
  });
  const [taskHour, setTaskHour] = useState(9);
  const [taskMinute, setTaskMinute] = useState(0);
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeCount = tasks.filter((t) => t.status === "pending" || t.status === "pending_confirm" || t.status === "running").length;
  const canCreate = activeCount < 3;

  const fetchTasks = async () => {
    if (disabledLane) return;
    try {
      const data = await apiJson<{ ok: boolean; tasks: ScheduledTask[] }>(`/api/email/lane-scheduled-tasks?laneIndex=${laneIndex}`);
      if (data?.ok && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (disabledLane) return;
    void fetchTasks();
    pollRef.current = setInterval(() => void fetchTasks(), 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [laneIndex, disabledLane]);

  const handleCreate = async () => {
    if (!taskName.trim()) {
      setCreateMsg(childUi.scheduledErrName);
      return;
    }
    if (!formalSelectedIndustries.length) {
      setCreateMsg(childUi.scheduledErrIndustries);
      return;
    }
    if (formalAudienceCount == null || formalAudienceCount <= 0) {
      setCreateMsg(childUi.scheduledErrAudience);
      return;
    }
    if (selectedCampaignId == null || selectedCampaignId <= 0 || !campaigns.some((c) => Number(c.id) === selectedCampaignId)) {
      setCreateMsg(childUi.scheduledErrCampaign);
      return;
    }
    setCreateBusy(true);
    setCreateMsg(null);
    try {
      const scheduledAt = `${taskDate} ${String(taskHour).padStart(2, "0")}:${String(taskMinute).padStart(2, "0")}:00`;
      const data = await apiJson<{ ok: boolean; message?: string; estimatedHours?: number }>("/api/email/lane-scheduled-tasks", {
        method: "POST",
        body: JSON.stringify({
          laneIndex,
          campaignId: selectedCampaignId,
          campaignName: taskName.trim(),
          targetIndustries: formalSelectedIndustries,
          audienceCount: formalAudienceCount,
          scheduledAt
        })
      });
      if (data?.ok) {
        setCreateMsg(childUi.scheduledCreated(data.message ?? ""));
        setTaskName("");
        setShowCreateForm(false);
        void fetchTasks();
      } else {
        setCreateMsg(data?.message ?? childUi.scheduledCreateFailed);
      }
    } catch (e: unknown) {
      setCreateMsg(String((e as Error)?.message ?? e));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleCancel = async (taskId: number) => {
    try {
      const data = await apiJson<{ ok: boolean; message?: string }>(`/api/email/lane-scheduled-tasks/${taskId}`, { method: "DELETE" });
      if (data?.ok) {
        void fetchTasks();
      }
    } catch { /* ignore */ }
  };

  const confirmTasks = tasks.filter((t) => t.status === "pending_confirm");
  const hoursHint =
    formalAudienceCount != null && formalAudienceCount > 0
      ? childUi.scheduledHoursHint(Math.ceil(formalAudienceCount / 1000) * 2)
      : "";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">{childUi.scheduledTitle}</span>
        <span className="text-xs text-slate-400">（{activeCount}/3）</span>
        {disabledLane ? (
          <span className="text-xs text-slate-400">{childUi.scheduledLaneDisabled}</span>
        ) : canCreate ? (
          <button
            type="button"
            className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? childUi.scheduledCollapse : childUi.scheduledExpand}
          </button>
        ) : (
          <span className="text-xs text-amber-700">{childUi.scheduledFull}</span>
        )}
      </div>

      {!disabledLane ? (
        <>
      {showCreateForm ? (
        <div className="rounded border border-violet-200 bg-violet-50/50 p-2 text-[11px]">
          <div className="mb-1.5 font-medium text-violet-900">{childUi.scheduledNewTitle}</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="col-span-2">
              <span className="text-xs text-slate-500">{childUi.scheduledNameLabel}</span>
              <input
                className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] outline-none"
                placeholder={childUi.scheduledNamePlaceholder}
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
              />
            </div>
            <div>
              <span className="text-xs text-slate-500">{childUi.scheduledDateLabel}</span>
              <input
                type="date"
                className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] outline-none"
                value={taskDate}
                onChange={(e) => setTaskDate(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              <div className="flex-1">
                <span className="text-xs text-slate-500">{childUi.scheduledHour}</span>
                <select
                  className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white text-[11px] outline-none"
                  value={taskHour}
                  onChange={(e) => setTaskHour(Number(e.target.value))}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <span className="text-xs text-slate-500">{childUi.scheduledMinute}</span>
                <select
                  className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white text-[11px] outline-none"
                  value={taskMinute}
                  onChange={(e) => setTaskMinute(Number(e.target.value))}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {formalAudienceCount != null && formalAudienceCount > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {childUi.scheduledTarget(
                formalSelectedIndustries.join(industryJoin),
                formalAudienceCount,
                hoursHint
              )}
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              disabled={createBusy}
              className="rounded bg-violet-600 px-2 py-0.5 text-[11px] text-white hover:bg-violet-700 disabled:opacity-60"
              onClick={() => void handleCreate()}
            >
              {createBusy ? childUi.scheduledCreating : childUi.scheduledCreate}
            </button>
            <button
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
              onClick={() => { setShowCreateForm(false); setCreateMsg(null); }}
            >
              {childUi.scheduledCancel}
            </button>
          </div>
          {createMsg ? (
            <p className={`mt-1 text-xs ${createMsg.startsWith("✅") ? "text-emerald-700" : "text-rose-700"}`}>
              {createMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      {confirmTasks.map((t) => (
        <div key={t.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs leading-relaxed text-amber-950">
          {childUi.scheduledConflict(t.campaign_name, formatBeijingTime(t.scheduled_at, locale))}
          <br />
          {childUi.scheduledConflictWait}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white"
              onClick={() => handleCancel(t.id)}
            >
              {childUi.scheduledCancelTask}
            </button>
          </div>
        </div>
      ))}

      {(() => {
        const visibleTasks = tasks.filter((t) => t.status === "pending" || t.status === "pending_confirm" || t.status === "running" || t.status === "failed");
        if (visibleTasks.length === 0) return null;
        const statusLabel: Record<string, string> = {
          pending: childUi.scheduledStatusPending,
          pending_confirm: childUi.scheduledStatusConfirm,
          running: childUi.scheduledStatusRunning,
          failed: locale === "en" ? "Failed" : "失败"
        };
        const statusColor: Record<string, string> = {
          pending: "text-slate-600",
          pending_confirm: "text-amber-700",
          running: "text-emerald-700",
          failed: "text-rose-700"
        };
        return (
          <div className="space-y-1">
            {visibleTasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-slate-100 bg-slate-50/80 px-2 py-1 text-xs"
              >
                <span className={`font-medium ${statusColor[t.status] ?? "text-slate-600"}`}>
                  {statusLabel[t.status] ?? t.status}
                </span>
                <span className="font-mono text-slate-800">{t.campaign_name}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{childUi.scheduledAudience(t.audience_count ?? 0)}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{formatBeijingTime(t.scheduled_at, locale)}</span>
                {t.status === "pending" ? (
                  <button
                    type="button"
                    className="ml-auto rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700 hover:bg-rose-100"
                    onClick={() => handleCancel(t.id)}
                  >
                    {childUi.scheduledCancel}
                  </button>
                ) : null}
                {t.status === "failed" && t.last_error ? (
                  <span className="basis-full text-[11px] text-rose-700">{t.last_error}</span>
                ) : null}
              </div>
            ))}
          </div>
        );
      })()}
        </>
      ) : null}
    </div>
  );
}
