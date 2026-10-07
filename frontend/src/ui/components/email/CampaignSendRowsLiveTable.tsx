import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "../../../lib/api";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings } from "../../../i18n/emailCampaignStatsListI18n";

type SendRowItem = {
  sendId: number;
  toEmail: string;
  status: string;
  createdAt: string;
  fromEmail: string;
  providerMessageId: string;
  error: string;
  contactId: number | null;
  openCount: number;
  clickCount: number;
  bounceEventCount: number;
  complaintCount: number;
};

type ApiResponse = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: SendRowItem[];
};

const PAGE_SIZE = 50;
const LIST_SCROLL_BOX =
  "mt-3 max-h-[22.75rem] overflow-y-auto overflow-x-auto rounded-md border border-slate-100 bg-white [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:shadow-[0_1px_0_0_rgba(226,232,240,1)]";

/**
 * 按 email_sends 一行一封展示，带打开/点击/退信/投诉事件计数；发送中 2s、其余 4s 轮询。
 */
export function CampaignSendRowsLiveTable(props: {
  campaignId: number | null;
  campaignIdLabel: string;
  campaignStatus: string;
  sendRunId?: number | null;
  fromDate: string;
  toDate: string;
  fromEmail: string;
  listPullKey?: number;
  statsReady?: boolean;
}) {
  const {
    campaignId,
    campaignStatus,
    sendRunId = null,
    fromDate,
    toDate,
    fromEmail,
    listPullKey = 0,
    statsReady = true
  } = props;
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasRowsSnapshotRef = useRef(false);

  const statusLabel = useCallback(
    (s: string): string => {
      const x = String(s ?? "").toLowerCase();
      if (x === "sent") return listUi.statusAccepted;
      if (x === "failed") return listUi.statusFailedLabel;
      if (x === "delivered") return listUi.statusDelivered;
      return s || "—";
    },
    [listUi]
  );

  useEffect(() => {
    hasRowsSnapshotRef.current = false;
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId]);

  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    if (campaignId == null) return;
    const silent = hasRowsSnapshotRef.current;
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        from: fromDate,
        to: toDate
      });
      if (fromEmail && fromEmail !== "all") q.set("fromEmail", fromEmail);
      const runId = Math.floor(Number(sendRunId) || 0);
      if (runId > 0) q.set("sendRunId", String(runId));
      const res = await apiJson<ApiResponse>(`/api/email/campaigns/${campaignId}/send-rows?${q.toString()}`);
      setData(res);
      hasRowsSnapshotRef.current = true;
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
      setData(null);
      hasRowsSnapshotRef.current = false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [campaignId, page, fromDate, toDate, fromEmail, sendRunId]);

  loadRef.current = load;

  useEffect(() => {
    setPage(1);
  }, [campaignId, fromDate, toDate, fromEmail, sendRunId]);

  useEffect(() => {
    if (!statsReady) return;
    void load();
  }, [load, listPullKey, statsReady]);

  const sending = String(campaignStatus ?? "").toLowerCase() === "sending";
  const pollMs = sending ? 2000 : 4000;

  useEffect(() => {
    if (campaignId == null || !statsReady) return undefined;
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadRef.current();
    }, pollMs);
    return () => clearInterval(iv);
  }, [campaignId, pollMs, statsReady]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const rows = data?.items ?? [];

  if (campaignId == null) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{listUi.liveTableTitle}</div>
        </div>
        {loading && !data ? <span className="text-xs text-slate-400">{listUi.liveLoading}</span> : null}
      </div>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      <div className={LIST_SCROLL_BOX}>
        <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-2 py-2 font-medium">{listUi.colIndex}</th>
              <th className="px-2 py-2 font-medium">{listUi.liveSendId}</th>
              <th className="px-2 py-2 font-medium">{listUi.liveRecipient}</th>
              <th className="px-2 py-2 font-medium">{listUi.liveSmtpStatus}</th>
              <th className="px-2 py-2 font-medium">{listUi.liveFromEmail}</th>
              <th className="px-2 py-2 text-right font-medium">{listUi.colOpens}</th>
              <th className="px-2 py-2 text-right font-medium">{listUi.liveClicks}</th>
              <th className="px-2 py-2 text-right font-medium">{listUi.liveBounceEvents}</th>
              <th className="px-2 py-2 text-right font-medium">{listUi.liveComplaintsCol}</th>
              <th className="px-2 py-2 font-medium">{listUi.liveTime}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-slate-500">
                  {listUi.liveEmpty}
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.sendId} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums text-slate-800">{r.sendId}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono text-slate-800" title={r.toEmail}>
                    {r.toEmail}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-800">{statusLabel(r.status)}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-slate-600" title={r.fromEmail}>
                    {r.fromEmail || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{r.openCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{r.clickCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{r.bounceEventCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-800">{r.complaintCount}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                    {r.createdAt ? String(r.createdAt).replace("T", " ").slice(0, 19) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{listUi.livePagerTotal(total, page, totalPages)}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {listUi.prevPage}
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {listUi.nextPage}
          </button>
        </div>
      </div>
    </div>
  );
}
