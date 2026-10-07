/** 营销活动统计页：前端性能/加载诊断（环形缓冲，供侧栏与页面底部展示） */

export type StatsPerfEntry = {
  at: string;
  campaignId: number | null;
  step: string;
  ms?: number;
  detail?: string;
};

const MAX = 40;
const buf: StatsPerfEntry[] = [];
const listeners = new Set<() => void>();

function nowIso() {
  return new Date().toISOString().slice(11, 23);
}

export function pushStatsPerf(entry: Omit<StatsPerfEntry, "at">) {
  buf.push({ ...entry, at: nowIso() });
  while (buf.length > MAX) buf.shift();
  listeners.forEach((fn) => fn());
}

export function subscribeStatsPerf(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStatsPerfLog(): StatsPerfEntry[] {
  return [...buf];
}

export function clearStatsPerfLog() {
  buf.length = 0;
  listeners.forEach((fn) => fn());
}

export async function timedStatsPerf<T>(
  step: string,
  campaignId: number | null,
  fn: () => Promise<T>,
  detail?: string
): Promise<T> {
  const t0 = performance.now();
  try {
    const out = await fn();
    pushStatsPerf({ campaignId, step, ms: Math.round(performance.now() - t0), detail });
    return out;
  } catch (e) {
    pushStatsPerf({
      campaignId,
      step: `${step} (失败)`,
      ms: Math.round(performance.now() - t0),
      detail: String((e as Error)?.message ?? e)
    });
    throw e;
  }
}
