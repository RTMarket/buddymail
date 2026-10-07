/**
 * 营销活动统计 · 概览区：按发送轮次构建折线图序列（方案 A，数据来自 send-runs）
 */

export type CampaignSendRunForChart = {
  id: number;
  round_no: number;
  status: string;
  success_count: number;
  fail_count: number;
  started_at: string | null;
  ended_at: string | null;
};

export type CampaignRoundChartPoint = {
  sendRunId: number;
  roundNo: number;
  success: number;
  /** 该轮投递次数（成功+失败，含退回等） */
  attempts: number;
  startedAtMs: number;
  status: string;
};

const MS_HOUR = 3600_000;
const MS_DAY = 24 * MS_HOUR;
const MS_WEEK = 7 * MS_DAY;
const MS_MONTH = 30 * MS_DAY;

export function parseRunTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso).replace(" ", "T"));
  return Number.isFinite(t) ? t : null;
}

/** 按开始时间升序；无时间的轮次排在末尾并用上一有效时间 +1min 占位 */
export function buildCampaignRoundChartPoints(runs: CampaignSendRunForChart[]): CampaignRoundChartPoint[] {
  const mapped = runs.map((r) => {
    const startedAtMs =
      parseRunTimeMs(r.started_at) ?? parseRunTimeMs(r.ended_at) ?? Number.NaN;
    const success = Math.max(0, Math.floor(Number(r.success_count) || 0));
    const fail = Math.max(0, Math.floor(Number(r.fail_count) || 0));
    return {
      sendRunId: r.id,
      roundNo: r.round_no,
      success,
      attempts: success + fail,
      startedAtMs,
      status: r.status
    };
  });
  mapped.sort((a, b) => {
    const ta = Number.isFinite(a.startedAtMs) ? a.startedAtMs : Infinity;
    const tb = Number.isFinite(b.startedAtMs) ? b.startedAtMs : Infinity;
    if (ta !== tb) return ta - tb;
    return a.roundNo - b.roundNo;
  });
  let lastValid = Date.now();
  for (const p of mapped) {
    if (Number.isFinite(p.startedAtMs)) {
      lastValid = p.startedAtMs;
    } else {
      p.startedAtMs = lastValid + 60_000;
      lastValid = p.startedAtMs;
    }
  }
  return mapped;
}

export function sumRoundOverviewTotals(runs: CampaignSendRunForChart[]): {
  totalRounds: number;
  totalAttempts: number;
  totalSuccess: number;
} {
  let totalAttempts = 0;
  let totalSuccess = 0;
  for (const r of runs) {
    const success = Math.max(0, Math.floor(Number(r.success_count) || 0));
    const fail = Math.max(0, Math.floor(Number(r.fail_count) || 0));
    totalSuccess += success;
    totalAttempts += success + fail;
  }
  return {
    totalRounds: runs.length,
    totalAttempts,
    totalSuccess
  };
}

export function chartDomainFromPoints(points: CampaignRoundChartPoint[]): {
  minMs: number;
  maxMs: number;
  spanMs: number;
} {
  if (points.length === 0) {
    const now = Date.now();
    return { minMs: now - MS_DAY, maxMs: now, spanMs: MS_DAY };
  }
  let minMs = points[0]!.startedAtMs;
  let maxMs = points[0]!.startedAtMs;
  for (const p of points) {
    minMs = Math.min(minMs, p.startedAtMs);
    maxMs = Math.max(maxMs, p.startedAtMs);
  }
  const spanMs = Math.max(MS_HOUR, maxMs - minMs);
  const pad = Math.max(MS_HOUR * 0.5, spanMs * 0.05);
  return { minMs: minMs - pad, maxMs: maxMs + pad, spanMs: spanMs + pad * 2 };
}

/** zoom 0=月 … 100=小时（视窗最窄） */
export function viewSpanFromZoom(zoom: number, fullSpanMs: number): number {
  const z = Math.max(0, Math.min(100, zoom));
  const minSpan = MS_HOUR * 2;
  const maxSpan = Math.max(MS_MONTH, fullSpanMs);
  if (z <= 0) return maxSpan;
  if (z >= 100) return minSpan;
  const logMin = Math.log(minSpan);
  const logMax = Math.log(maxSpan);
  const t = z / 100;
  return Math.exp(logMax + t * (logMin - logMax));
}

export function clampViewWindow(
  viewStartMs: number,
  viewEndMs: number,
  domainMin: number,
  domainMax: number
): { viewStartMs: number; viewEndMs: number } {
  const domainSpan = Math.max(1, domainMax - domainMin);
  let span = Math.max(MS_HOUR / 2, viewEndMs - viewStartMs);
  span = Math.min(span, domainSpan);
  let start = viewStartMs;
  if (start < domainMin) start = domainMin;
  if (start + span > domainMax) start = domainMax - span;
  return { viewStartMs: start, viewEndMs: start + span };
}

export function defaultViewWindow(domainMin: number, domainMax: number): {
  viewStartMs: number;
  viewEndMs: number;
} {
  return clampViewWindow(domainMin, domainMax, domainMin, domainMax);
}

export function formatChartAxisLabel(ms: number, viewSpanMs: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (viewSpanMs <= MS_DAY * 1.5) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (viewSpanMs <= MS_WEEK * 1.5) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
  }
  if (viewSpanMs <= MS_MONTH * 1.5) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function formatChartTooltipTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
