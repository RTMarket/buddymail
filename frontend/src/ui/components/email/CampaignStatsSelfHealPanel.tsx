import React, { useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings } from "../../../i18n/emailCampaignStatsListI18n";
import { getEmailCampaignStatsPageStrings } from "../../../i18n/emailCampaignStatsPageI18n";
import { intlLocaleTag } from "../../../i18n/siteLocaleTypes";
import { getStatsPerfLog, pushStatsPerf } from "../../../lib/campaignStatsPerfLog";
import {
  postStatsSelfHeal,
  purgeLocalStatsCachesForSelfHeal,
  type StatsSelfHealServerStep
} from "../../../lib/campaignStatsSelfHealClient";

type UiStep = {
  key: string;
  label: string;
  ok: boolean | null;
  detail?: string;
};

export function CampaignStatsSelfHealPanel(props: {
  campaignId: number | null;
  campaignCode: string;
  onClientRefresh: () => Promise<void>;
}) {
  const { campaignId, campaignCode, onClientRefresh } = props;
  const { locale } = useSiteLocale();
  const statsUi = useMemo(() => getEmailCampaignStatsPageStrings(locale), [locale]);
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const [running, setRunning] = useState(false);
  const [uiSteps, setUiSteps] = useState<UiStep[]>([]);
  const [overallOk, setOverallOk] = useState<boolean | null>(null);
  const [packageText, setPackageText] = useState("");
  const [copied, setCopied] = useState(false);

  function buildDiagnosticLines(extraLines: string[] = []) {
    const perfEntries = getStatsPerfLog();
    const filtered =
      campaignId == null
        ? perfEntries
        : perfEntries.filter((e) => e.campaignId == null || e.campaignId === campaignId);
    return [
      statsUi.selfHealPackageTitle(campaignCode, campaignId),
      statsUi.diagnosticExportTime(new Date().toLocaleString(intlLocaleTag(locale))),
      "",
      statsUi.selfHealSectionLoadLog,
      ...filtered.map((e) => {
        const ms = e.ms != null ? ` ${e.ms}ms` : "";
        const detail = e.detail ? ` · ${e.detail}` : "";
        return `${e.at} · ${listUi.perfStepLabel(e.step)}${ms}${detail}`;
      }),
      "",
      ...extraLines
    ];
  }

  function serverStepLines(steps: StatsSelfHealServerStep[]) {
    return [
      statsUi.selfHealSectionServer,
      ...steps.map((s) => {
        const ms = s.ms != null ? ` ${s.ms}ms` : "";
        const detail = s.detail ? ` · ${s.detail}` : "";
        const mark = s.ok ? "OK" : "FAIL";
        return `[${mark}] ${s.step}${ms}${detail}`;
      })
    ];
  }

  async function runSelfHeal() {
    if (running || campaignId == null) return;
    setRunning(true);
    setOverallOk(null);
    setPackageText("");
    const steps: UiStep[] = [
      { key: "export", label: statsUi.selfHealStepExport, ok: null },
      { key: "server", label: statsUi.selfHealStepServer, ok: null },
      { key: "client", label: statsUi.selfHealStepClient, ok: null },
      { key: "result", label: statsUi.selfHealStepResult, ok: null }
    ];
    setUiSteps(steps);

    const extra: string[] = [];
    let serverOk = false;
    let clientOk = false;

    try {
      steps[0] = { ...steps[0]!, ok: true, detail: statsUi.selfHealStepExportDone };
      setUiSteps([...steps]);

      let serverSteps: StatsSelfHealServerStep[] = [];
      try {
        const res = await postStatsSelfHeal(campaignId);
        serverSteps = res.steps ?? [];
        serverOk = Boolean(res.ok);
        extra.push(...serverStepLines(serverSteps));
        steps[1] = {
          ...steps[1]!,
          ok: serverOk,
          detail: serverOk ? statsUi.selfHealStepServerDone : statsUi.selfHealStepServerFail
        };
      } catch (e: unknown) {
        serverOk = false;
        extra.push(statsUi.selfHealSectionServer, String((e as Error)?.message ?? e));
        steps[1] = {
          ...steps[1]!,
          ok: false,
          detail: String((e as Error)?.message ?? e)
        };
      }
      setUiSteps([...steps]);
      pushStatsPerf({
        campaignId,
        step: "self-heal-server",
        detail: serverOk ? "ok" : "fail"
      });

      try {
        purgeLocalStatsCachesForSelfHeal(campaignId);
        await onClientRefresh();
        clientOk = true;
        extra.push("", statsUi.selfHealSectionClient, statsUi.selfHealStepClientDone);
        steps[2] = { ...steps[2]!, ok: true, detail: statsUi.selfHealStepClientDone };
      } catch (e: unknown) {
        clientOk = false;
        extra.push("", statsUi.selfHealSectionClient, String((e as Error)?.message ?? e));
        steps[2] = {
          ...steps[2]!,
          ok: false,
          detail: String((e as Error)?.message ?? e)
        };
      }
      setUiSteps([...steps]);
      pushStatsPerf({
        campaignId,
        step: "self-heal-client",
        detail: clientOk ? "ok" : "fail"
      });

      const ok = serverOk && clientOk;
      setOverallOk(ok);
      steps[3] = {
        ...steps[3]!,
        ok,
        detail: ok ? statsUi.selfHealResultOk : statsUi.selfHealResultFail
      };
      setUiSteps([...steps]);

      const pkg = buildDiagnosticLines(extra).join("\n");
      setPackageText(pkg);
      pushStatsPerf({
        campaignId,
        step: "self-heal-finish",
        detail: ok ? "ok" : "fail"
      });
    } finally {
      setRunning(false);
    }
  }

  async function copyPackage() {
    const text =
      packageText ||
      buildDiagnosticLines([
        statsUi.selfHealSectionResult,
        overallOk ? statsUi.selfHealResultOk : statsUi.selfHealResultFail
      ]).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{statsUi.selfHealTitle}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{statsUi.selfHealDesc}</p>
        </div>
        <button
          type="button"
          disabled={running || campaignId == null}
          onClick={() => void runSelfHeal()}
          className="rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-60"
        >
          {running ? statsUi.selfHealRunning : statsUi.selfHealRun}
        </button>
      </div>

      {uiSteps.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-xs text-slate-700">
          {uiSteps.map((s) => (
            <li key={s.key} className="flex flex-wrap items-baseline gap-2">
              <span
                className={
                  s.ok === true
                    ? "font-semibold text-emerald-700"
                    : s.ok === false
                      ? "font-semibold text-red-700"
                      : "font-semibold text-slate-500"
                }
              >
                {s.ok === true ? "✓" : s.ok === false ? "✗" : "…"}
              </span>
              <span>{s.label}</span>
              {s.detail ? <span className="text-slate-500">— {s.detail}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {overallOk === false ? (
        <p className="mt-3 text-xs leading-relaxed text-red-800">{statsUi.selfHealSupportHint}</p>
      ) : null}

      {packageText || overallOk != null ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyPackage()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {copied ? statsUi.selfHealPackageCopied : statsUi.selfHealCopyPackage}
          </button>
        </div>
      ) : null}
    </div>
  );
}
