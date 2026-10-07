import { useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsPageStrings } from "../../../i18n/emailCampaignStatsPageI18n";

export type CampaignSuccessSeriesPoint = {
  label: string;
  success: number;
  /** 接口仍可能带 fail，折线图仅展示 success */
  fail?: number;
  date?: string;
  segments?: Array<{ timeRange: string; success: number }>;
};

const SLOT_ENDS = ["02:59", "05:59", "08:59", "11:59", "14:59", "17:59", "20:59", "23:59"];

function segmentLabelFromBucket(label: string): string {
  const h = parseInt(label.slice(0, 2), 10);
  if (Number.isNaN(h)) return label;
  const bi = Math.floor(h / 3);
  const start = label;
  const end = SLOT_ENDS[Math.min(7, bi)] ?? "23:59";
  return `${start}–${end}`;
}

export function CampaignSuccessLineChart(props: {
  series: CampaignSuccessSeriesPoint[];
  campaignCode?: string;
  /** 折线图说明（默认展示单活动编号） */
  scopeLabel?: string;
  emptyHint?: string;
}) {
  const { locale } = useSiteLocale();
  const statsUi = useMemo(() => getEmailCampaignStatsPageStrings(locale), [locale]);
  const series = Array.isArray(props.series) ? props.series : [];
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const w = 720;
  const h = 220;
  const padL = 44;
  const padR = 16;
  const padT = 20;
  const padB = 40;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = Math.max(1, series.length);

  const maxY = useMemo(() => {
    let m = 1;
    for (const p of series) m = Math.max(m, p.success);
    return m;
  }, [series]);

  const xAt = (i: number) => {
    if (n <= 1) return padL + innerW / 2;
    return padL + (i / (n - 1)) * innerW;
  };
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

  const linePoints = series.map((p, i) => `${xAt(i)},${yAt(p.success)}`).join(" ");
  const labelStep = n <= 14 ? 1 : Math.ceil(n / 12);
  const hoverPoint = hoverIdx != null ? series[hoverIdx] : null;

  const hoverSegments = useMemo(() => {
    if (!hoverPoint) return [];
    if (hoverPoint.segments && hoverPoint.segments.length > 0) {
      return hoverPoint.segments.filter((s) => s.success > 0);
    }
    if (hoverPoint.success > 0 && /^\d{2}:\d{2}$/.test(hoverPoint.label)) {
      return [{ timeRange: segmentLabelFromBucket(hoverPoint.label), success: hoverPoint.success }];
    }
    return [];
  }, [hoverPoint]);

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[11px] text-slate-400">
        {props.emptyHint ?? statsUi.chartEmptyDefault}
      </div>
    );
  }

  const scopeNote =
    props.scopeLabel ??
    (props.campaignCode ? statsUi.chartScopeCampaign(props.campaignCode) : null);

  return (
    <div>
      <svg
        className="h-auto w-full max-w-full text-slate-600"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={scopeNote ? statsUi.chartAriaScopeTrend(scopeNote) : statsUi.chartAriaTrend}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
          const gy = padT + innerH * (1 - t);
          return (
            <line
              key={idx}
              x1={padL}
              y1={gy}
              x2={padL + innerW}
              y2={gy}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="4 4"
            />
          );
        })}
        <text x={4} y={padT + 4} fill="#94a3b8" style={{ fontSize: "10px" }}>
          {maxY}
        </text>
        <text x={4} y={padT + innerH} fill="#94a3b8" style={{ fontSize: "10px" }}>
          0
        </text>
        <polyline fill="none" stroke="#16a34a" strokeWidth="2.5" points={linePoints} />
        {series.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <rect
              x={
                n <= 1
                  ? padL
                  : i === 0
                    ? padL
                    : i === n - 1
                      ? (xAt(i - 1) + xAt(i)) / 2
                      : (xAt(i - 1) + xAt(i + 1)) / 2
              }
              y={padT}
              width={
                n <= 1
                  ? innerW
                  : i === 0
                    ? (xAt(1) - xAt(0)) / 2 + (xAt(1) - xAt(0)) / 2
                    : i === n - 1
                      ? xAt(i) - (xAt(i - 1) + xAt(i)) / 2
                      : (xAt(i + 1) - xAt(i - 1)) / 2
              }
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
            {p.success > 0 ? <circle cx={xAt(i)} cy={yAt(p.success)} r={3.5} fill="#16a34a" /> : null}
            {(i % labelStep === 0 || i === n - 1) && (
              <text x={xAt(i)} y={h - 10} textAnchor="middle" fill="#64748b" style={{ fontSize: "9px" }}>
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-green-600" />
          {statsUi.chartLegendSuccess}
        </span>
        {scopeNote ? <span className="text-slate-400">{scopeNote}</span> : null}
      </div>

      {hoverPoint ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-800">
          <div className="font-semibold text-slate-900">
            {statsUi.chartHoverBucket(hoverPoint.label, hoverPoint.success)}
          </div>
          {hoverSegments.length > 0 ? (
            <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto">
              {hoverSegments.map((s, idx) => (
                <li key={idx} className="flex justify-between gap-3 tabular-nums">
                  <span className="text-slate-600">{s.timeRange}</span>
                  <span className="font-medium text-emerald-800">+{s.success}</span>
                </li>
              ))}
            </ul>
          ) : hoverPoint.success > 0 ? (
            <p className="mt-1 text-slate-500">{statsUi.chartHoverPeriodSuccess(hoverPoint.success)}</p>
          ) : (
            <p className="mt-1 text-slate-500">{statsUi.chartHoverNoSuccessDay}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
