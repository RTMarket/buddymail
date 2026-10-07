import React, { useMemo, useState } from "react";
import { apiJson, apiJsonWithTimeout } from "../../../lib/api";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";

type DeliveryDiagnosticResponse = {
  ok: boolean;
  lite?: boolean;
  campaignId: number;
  totals: {
    attempts: number;
    sentRecorded: number;
    failedRecorded: number;
    sendingNow?: number;
    bouncedEvents: number;
    bouncedMatchedSends: number;
    deliveredCorrected: number;
    failedCorrected: number;
  };
  samples: Array<{
    sendId: number;
    email: string;
    sendStatus: string;
    sendError: string;
    providerMessageId: string;
    sendCreatedAt: string;
    lastBouncedAt: string | null;
  }>;
};

export function CampaignDeliveryDiagnosticLog(props: {
  campaignId: number | null;
  campaignCode: string;
  compact?: boolean;
  laneLabel?: string;
  /** 专线发信域：仅统计/样本限定这些 from_email（各专线独立诊断） */
  fromEmails?: string[];
}) {
  const { campaignId, campaignCode, compact = false, laneLabel, fromEmails = [] } = props;
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const [data, setData] = useState<DeliveryDiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    if (campaignId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (compact) q.set("lite", "1");
      const scoped = fromEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (scoped.length > 0) q.set("fromEmails", scoped.join(","));
      const qs = q.toString();
      const r = await apiJsonWithTimeout<DeliveryDiagnosticResponse>(
        `/api/email/campaigns/${campaignId}/delivery-diagnostics${qs ? `?${qs}` : ""}`,
        undefined,
        compact ? 40_000 : 60_000
      );
      setData(r);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!data || campaignId == null) return;
    const scopedDomains =
      fromEmails.length > 0
        ? fromEmails.join(locale === "en" ? ", " : "、")
        : undefined;
    const lines = [
      childUi.diagnosticClipHeader({
        campaignCode,
        campaignId,
        laneLabel,
        scopedDomains,
        lite: data.lite
      }),
      childUi.diagnosticClipGeneratedAt(new Date().toLocaleString(intlLocaleTag(locale))),
      "",
      childUi.diagnosticClipSummaryTitle,
      `${childUi.diagnosticClipAttempts}：${data.totals.attempts}`,
      `${childUi.diagnosticClipAccepted}：${data.totals.sentRecorded}`,
      `${childUi.diagnosticClipSyncFailed}：${data.totals.failedRecorded}`,
      ...(data.totals.sendingNow != null && data.totals.sendingNow > 0
        ? [`${childUi.diagnosticClipSendingNow}：${data.totals.sendingNow}`]
        : []),
      `${childUi.diagnosticClipBounceEvents}：${data.totals.bouncedEvents}`,
      `${childUi.diagnosticClipBounceMatched}：${data.totals.bouncedMatchedSends}`,
      `${childUi.diagnosticClipDeliveredCorrected}：${data.totals.deliveredCorrected}`,
      `${childUi.diagnosticClipFailedCorrected}：${data.totals.failedCorrected}`,
      "",
      childUi.diagnosticClipSamplesTitle,
      ...data.samples.slice(0, 20).map((s) =>
        [
          `#${s.sendId}`,
          s.email,
          `status=${s.sendStatus}`,
          s.providerMessageId ? `messageId=${s.providerMessageId}` : "",
          s.lastBouncedAt ? `bouncedAt=${s.lastBouncedAt}` : "",
          s.sendError ? `error=${s.sendError}` : ""
        ]
          .filter(Boolean)
          .join(" | ")
      )
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const titleCls = compact ? "text-[11px] font-semibold text-slate-900" : "text-sm font-semibold text-slate-900";
  const descCls = compact ? "mt-0.5 text-[10px] text-slate-500" : "mt-1 text-xs text-slate-500";
  const btnCls = compact
    ? "rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";
  const btnPrimaryCls = compact
    ? "rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
    : "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60";

  return (
    <div className={compact ? "rounded border border-slate-200 bg-white p-2" : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={titleCls}>{childUi.diagnosticTitle(laneLabel)}</div>
          <p className={descCls}>
            {childUi.diagnosticDesc}
            {fromEmails.length > 0 ? (
              <span className="mt-0.5 block text-slate-600">
                {childUi.diagnosticScopedDomains(fromEmails.join(locale === "en" ? ", " : "、"))}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={campaignId == null || loading}
            onClick={() => void load()}
            className={btnCls}
          >
            {loading ? childUi.diagnosticGenerating : childUi.diagnosticGenerate}
          </button>
          <button type="button" disabled={!data} onClick={() => void copy()} className={btnPrimaryCls}>
            {copied ? childUi.diagnosticCopied : childUi.diagnosticCopy}
          </button>
        </div>
      </div>

      {campaignId == null ? (
        <p className={`${compact ? "mt-1.5 text-[10px]" : "mt-2 text-xs"} text-slate-500`}>
          {childUi.diagnosticSelectCampaign}
        </p>
      ) : null}

      {err ? (
        <div
          className={`${compact ? "mt-1.5 text-[10px]" : "mt-2 text-xs"} rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-800`}
        >
          {err}
        </div>
      ) : null}

      {data ? (
        <div className={`${compact ? "mt-2" : "mt-3"} grid gap-2 ${compact ? "" : "lg:grid-cols-[18rem_minmax(0,1fr)]"}`}>
          <div
            className={`rounded-md border border-slate-200 bg-slate-50 p-2 ${compact ? "text-[10px]" : "p-3 text-xs"} text-slate-700`}
          >
            <div className="font-semibold text-slate-900">{childUi.diagnosticSummary}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span>{childUi.diagnosticAttempts}</span>
              <span className="text-right font-mono">{data.totals.attempts}</span>
              <span>{childUi.diagnosticAccepted}</span>
              <span className="text-right font-mono text-emerald-700">{data.totals.sentRecorded}</span>
              <span>{childUi.diagnosticSyncFailed}</span>
              <span className="text-right font-mono text-rose-700">{data.totals.failedRecorded}</span>
              <span>{childUi.diagnosticBounces}</span>
              <span className="text-right font-mono text-amber-700">{data.totals.bouncedEvents}</span>
            </div>
          </div>
          {!compact ? (
            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="border-b px-2 py-1.5 text-left">ID</th>
                    <th className="border-b px-2 py-1.5 text-left">{childUi.diagnosticColRecipient}</th>
                    <th className="border-b px-2 py-1.5 text-left">{childUi.diagnosticColStatus}</th>
                    <th className="border-b px-2 py-1.5 text-left">MessageId</th>
                    <th className="border-b px-2 py-1.5 text-left">{childUi.diagnosticColError}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.samples.slice(0, 30).map((s) => (
                    <tr key={s.sendId} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-mono">{s.sendId}</td>
                      <td className="px-2 py-1.5 font-mono">{s.email}</td>
                      <td className="px-2 py-1.5">{s.sendStatus}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 font-mono" title={s.providerMessageId}>
                        {s.providerMessageId || "—"}
                      </td>
                      <td
                        className="max-w-[300px] truncate px-2 py-1.5"
                        title={s.sendError || String(s.lastBouncedAt ?? "")}
                      >
                        {s.sendError || (s.lastBouncedAt ? childUi.diagnosticBounceAt(s.lastBouncedAt) : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
