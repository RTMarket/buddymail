import { useEffect, useMemo, useState } from "react";
import {
  buildCampaignRoundChartPoints,
  chartDomainFromPoints,
  clampViewWindow,
  formatChartAxisLabel,
  formatChartTooltipTime,
  viewSpanFromZoom,
  type CampaignRoundChartPoint
} from "../../../lib/campaignRoundChartSeries";

export function CampaignRoundSuccessTimeChart(props: {
  points: CampaignRoundChartPoint[];
  campaignCode?: string;
}) {
  const points = props.points;
  const domain = useMemo(() => chartDomainFromPoints(points), [points]);
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState(50);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fullSpan = domain.maxMs - domain.minMs;

  const viewWindow = useMemo(() => {
    const span = viewSpanFromZoom(zoom, fullSpan);
    const maxStart = domain.maxMs - span;
    const minStart = domain.minMs;
    const startRange = Math.max(0, maxStart - minStart);
    const start = minStart + (pan / 100) * startRange;
    return clampViewWindow(start, start + span, domain.minMs, domain.maxMs);
  }, [zoom, pan, domain.minMs, domain.maxMs, fullSpan]);

  useEffect(() => {
    setZoom(0);
    setPan(50);
  }, [props.campaignCode, points.length]);

  const visible = useMemo(() => {
    const { viewStartMs, viewEndMs } = viewWindow;
    return points.filter((p) => p.startedAtMs >= viewStartMs && p.startedAtMs <= viewEndMs);
  }, [points, viewWindow]);

  const w = 720;
  const h = 220;
  const brushH = 36;
  const padL = 44;
  const padR = 16;
  const padT = 20;
  const padB = 44;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const viewSpan = Math.max(1, viewWindow.viewEndMs - viewWindow.viewStartMs);

  const maxY = useMemo(() => {
    let m = 1;
    for (const p of visible) m = Math.max(m, p.success);
    return m;
  }, [visible]);

  const xAt = (ms: number) =>
    padL + ((ms - viewWindow.viewStartMs) / viewSpan) * innerW;
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

  const linePoints = visible.map((p) => `${xAt(p.startedAtMs)},${yAt(p.success)}`).join(" ");

  const tickCount = viewSpan <= 3600_000 * 6 ? 6 : viewSpan <= 86400000 * 2 ? 5 : 4;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      const t = viewWindow.viewStartMs + (i / Math.max(1, tickCount - 1)) * viewSpan;
      out.push(t);
    }
    return out;
  }, [viewWindow.viewStartMs, viewSpan, tickCount]);

  const hoverPoint = hoverIdx != null ? visible[hoverIdx] : null;

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[11px] text-slate-400">
        暂无各轮次发送数据
      </div>
    );
  }

  return (
    <div>
      <svg
        className="h-auto w-full max-w-full text-slate-600"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="各轮次发信成功趋势"
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
        {linePoints ? (
          <polyline fill="none" stroke="#16a34a" strokeWidth="2.5" points={linePoints} />
        ) : null}
        {visible.map((p, i) => (
          <g key={p.sendRunId}>
            <circle
              cx={xAt(p.startedAtMs)}
              cy={yAt(p.success)}
              r={5}
              fill="#16a34a"
              stroke="#fff"
              strokeWidth={1.5}
              onMouseEnter={() => setHoverIdx(i)}
            />
          </g>
        ))}
        {ticks.map((t, i) => (
          <text
            key={i}
            x={xAt(t)}
            y={h - 12}
            textAnchor="middle"
            fill="#64748b"
            style={{ fontSize: "9px" }}
          >
            {formatChartAxisLabel(t, viewSpan)}
          </text>
        ))}
      </svg>

      <div className="mt-2 space-y-2 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
          <span className="font-medium text-slate-700">时间缩放</span>
          <span className="text-slate-400">左=月/全览</span>
          <span className="text-slate-400">右=小时</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-violet-600"
          aria-label="时间缩放"
        />
        {zoom > 5 ? (
          <div>
            <div className="mb-1 text-[10px] text-slate-600">左右滑动查看时段</div>
            <input
              type="range"
              min={0}
              max={100}
              value={pan}
              onChange={(e) => setPan(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-slate-500"
              aria-label="时间平移"
            />
          </div>
        ) : null}
        <svg viewBox={`0 0 ${w} ${brushH}`} className="h-8 w-full text-slate-400">
          <line x1={padL} y1={brushH / 2} x2={padL + innerW} y2={brushH / 2} stroke="currentColor" strokeOpacity={0.25} />
          {points.map((p) => {
            const fx = padL + ((p.startedAtMs - domain.minMs) / fullSpan) * innerW;
            const inView =
              p.startedAtMs >= viewWindow.viewStartMs && p.startedAtMs <= viewWindow.viewEndMs;
            return (
              <circle
                key={p.sendRunId}
                cx={fx}
                cy={brushH / 2}
                r={3}
                fill={inView ? "#16a34a" : "#94a3b8"}
              />
            );
          })}
          <rect
            x={padL + ((viewWindow.viewStartMs - domain.minMs) / fullSpan) * innerW}
            y={4}
            width={Math.max(4, (viewSpan / fullSpan) * innerW)}
            height={brushH - 8}
            fill="#8b5cf6"
            fillOpacity={0.15}
            stroke="#7c3aed"
            strokeOpacity={0.5}
            rx={2}
          />
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-green-600" />
          各轮发信成功（已扣退回）
        </span>
        {props.campaignCode ? <span className="text-slate-400">活动 {props.campaignCode}</span> : null}
        <span className="text-slate-400">共 {points.length} 个轮次点位</span>
      </div>

      {hoverPoint ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-800">
          <div className="font-semibold text-slate-900">
            第 {hoverPoint.roundNo} 轮 · 发信成功 {hoverPoint.success} · 投递 {hoverPoint.attempts} 次
          </div>
          <p className="mt-1 text-slate-600">开始：{formatChartTooltipTime(hoverPoint.startedAtMs)}</p>
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-slate-400">
          将鼠标移到圆点查看该轮成功数与发送时间；拖动上方滑条收窄/放宽时间范围
        </p>
      )}
    </div>
  );
}
