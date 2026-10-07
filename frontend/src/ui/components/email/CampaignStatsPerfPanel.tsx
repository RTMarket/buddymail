import React, { useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings } from "../../../i18n/emailCampaignStatsListI18n";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";
import { clearStatsPerfLog, getStatsPerfLog, subscribeStatsPerf, type StatsPerfEntry } from "../../../lib/campaignStatsPerfLog";

const FILTER_TEST_CMD = "cd backend && npm run test:send-contacts";

function formatEntry(e: StatsPerfEntry, stepLabel: (step: string) => string) {
  const ms = e.ms != null ? ` ${e.ms}ms` : "";
  const detail = e.detail ? ` · ${e.detail}` : "";
  return `${e.at} · ${stepLabel(e.step)}${ms}${detail}`;
}

/** 右侧栏：统计页加载诊断 + 名单筛选逻辑自测说明 */
export function CampaignStatsPerfPanel(props: { campaignId: number | null }) {
  const { campaignId } = props;
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const [entries, setEntries] = useState<StatsPerfEntry[]>(() => getStatsPerfLog());
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeStatsPerf(() => setEntries(getStatsPerfLog())), []);

  const filtered =
    campaignId == null ? entries : entries.filter((e) => e.campaignId == null || e.campaignId === campaignId);

  async function copyLog() {
    const lines = [
      listUi.perfCopyLogTitle(campaignId),
      listUi.perfExportTimeLine(new Date().toLocaleString(intlLocaleTag(locale))),
      "",
      ...filtered.map((e) => formatEntry(e, listUi.perfStepLabel))
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-semibold text-slate-900">{listUi.perfTitle}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => setEntries(getStatsPerfLog())}
        >
          {listUi.perfRefresh}
        </button>
        <button
          type="button"
          disabled={filtered.length === 0}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => void copyLog()}
        >
          {copied ? listUi.perfCopied : listUi.perfCopy}
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
          onClick={() => {
            clearStatsPerfLog();
            setEntries([]);
          }}
        >
          {listUi.perfClear}
        </button>
      </div>
      <ul className="mt-2 max-h-36 space-y-0.5 overflow-y-auto rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5 font-mono text-[9px] leading-snug text-slate-700">
        {filtered.length === 0 ? (
          <li className="text-slate-500">{listUi.perfEmpty}</li>
        ) : (
          filtered
            .slice()
            .reverse()
            .map((e, i) => <li key={`${e.at}-${i}`}>{formatEntry(e, listUi.perfStepLabel)}</li>)
        )}
      </ul>

      <div className="mt-3 border-t border-slate-100 pt-2">
        <div className="text-[10px] font-semibold text-slate-800">{listUi.perfFilterTestTitle}</div>
        <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500">{listUi.perfFilterTestDesc}</p>
        <pre className="mt-1 overflow-x-auto rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] text-slate-800">
          {FILTER_TEST_CMD}
        </pre>
      </div>
    </div>
  );
}
