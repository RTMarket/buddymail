/** 专线实时监控：最近 3 封邮箱列表（按 id 递增合并，避免首屏拉出历史邮件） */

import { laneFailedCountFromPoll, laneSessionLiveCountFloor } from "./laneSendSession";

export type LaneLiveRow = {
  id: number;
  email: string;
  status: string;
  /** SMTP/对账错误文案（拒收 vs 其它失败） */
  error?: string | null;
  openCount?: number;
  clickCount?: number;
  bounceEventCount?: number;
};

export function mapSendProgressRecentRows(
  recent: Array<{
    id?: number | null;
    email?: string | null;
    status?: string | null;
    error?: string | null;
    openCount?: number | null;
    clickCount?: number | null;
    bounceEventCount?: number | null;
  }>
): LaneLiveRow[] {
  return recent.map((x) => ({
    id: Number(x.id ?? 0),
    email: String(x.email ?? ""),
    status: String(x.status ?? ""),
    error: x.error != null ? String(x.error).trim() || null : null,
    openCount: Number(x.openCount ?? 0),
    clickCount: Number(x.clickCount ?? 0),
    bounceEventCount: Number(x.bounceEventCount ?? 0)
  }));
}

/** 最近 N 封里可见的失败/退回条数（托底 poll 尚未对账的退信） */
export function laneLiveFailedHintFromRows(rows: LaneLiveRow[]): number {
  let n = 0;
  for (const r of rows) {
    const s = String(r.status ?? "").toLowerCase();
    if (s === "failed" || s === "suppressed") n += 1;
    else if (s === "sent" && Math.max(0, Number(r.bounceEventCount ?? 0)) > 0) n += 1;
  }
  return n;
}

export type LaneMonitorBreakdown = {
  smtpFailed: number;
  bounced: number;
  suppressed: number;
  /** 去重后的投递异常人数（监控主栏「投递异常」） */
  deliveryIssues: number;
};

/**
 * 监控五栏分项：API 聚合 + 最近列表即时托底 + 会话内单调不减。
 * 真实 failed/suppressed/退信 写入 DB 后，下一次 poll（约 800ms）即应反映；勿把 sending 算进失败。
 */
export function laneMonitorBreakdownCounts(opts: {
  poll: {
    failed?: number | null;
    smtpFailed?: number | null;
    bounceFailures?: number | null;
    suppressedCount?: number | null;
  };
  liveRows: LaneLiveRow[];
  prev?: Partial<LaneMonitorBreakdown>;
}): LaneMonitorBreakdown {
  const pollFailedUnique = laneFailedCountFromPoll(opts.poll);
  const smtpFailedRaw = Math.max(0, Math.floor(Number(opts.poll.smtpFailed) || 0));
  const suppressedPoll = Math.max(0, Math.floor(Number(opts.poll.suppressedCount) || 0));
  const bouncedPoll = Math.max(0, Math.floor(Number(opts.poll.bounceFailures) || 0));
  const live = laneSessionLiveCountFloor(opts.liveRows);
  const bounced = Math.max(bouncedPoll, live.bounced, opts.prev?.bounced ?? 0);
  const suppressed = Math.max(suppressedPoll, live.suppressed, opts.prev?.suppressed ?? 0);
  const smtpFailed = Math.max(
    smtpFailedRaw,
    live.failed,
    Math.max(0, pollFailedUnique - bounced - suppressed),
    opts.prev?.smtpFailed ?? 0
  );
  const liveDeliveryHint = Math.max(
    live.failed + live.bounced + live.suppressed,
    laneLiveFailedHintFromRows(opts.liveRows)
  );
  const deliveryIssues = Math.max(
    pollFailedUnique,
    liveDeliveryHint,
    opts.prev?.deliveryIssues ?? 0
  );
  return { smtpFailed, bounced, suppressed, deliveryIssues };
}

/**
 * 专线栏「最近 N 封」：以本轮 poll 的 recent 为准合并同 id 状态（sending→sent），
 * 再按 id 取最近 N 条。勿用 sinceId _floor 过滤，否则首封卡在 sending、后两格永远「等待」。
 */
export function syncLaneLiveRowsFromPoll(prev: LaneLiveRow[], incoming: LaneLiveRow[], maxRows = 3): LaneLiveRow[] {
  const cap = Math.max(1, Math.floor(maxRows));
  /** 无 recent 时保留 prev；有 recent 时必须合并以刷新 sending→sent/failed */
  if (incoming.length === 0) return prev.slice(-cap);
  const byId = new Map<number, LaneLiveRow>();
  for (const row of prev) {
    if (row.id > 0) byId.set(row.id, row);
  }
  for (const row of incoming) {
    if (row.id <= 0) continue;
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...row } : row);
  }
  return Array.from(byId.values())
    .sort((a, b) => a.id - b.id)
    .slice(-cap);
}

/**
 * 正式发送页 · 最近 5 封逐封露出：每轮 poll 最多新增 maxNewPerTick 行（默认 1），
 * 已展示行的 sending→sent/failed 仍即时合并；避免一次 poll 涌入 8～10 行。
 */
export function syncLaneLiveRowsDripFromPoll(
  prev: LaneLiveRow[],
  incoming: LaneLiveRow[],
  maxRows = 5,
  maxNewPerTick = 1
): LaneLiveRow[] {
  const cap = Math.max(1, Math.floor(maxRows));
  const limitNew = Math.max(1, Math.floor(maxNewPerTick));

  if (incoming.length === 0) {
    return prev.slice(-cap);
  }

  const pool = syncLaneLiveRowsFromPoll(prev, incoming, Math.max(cap * 4, 32));
  const poolById = new Map<number, LaneLiveRow>();
  for (const row of pool) {
    if (row.id > 0) poolById.set(row.id, row);
  }

  const displayedSet = new Set(prev.map((r) => r.id).filter((id) => id > 0));
  let next: LaneLiveRow[] = prev.map((r) => poolById.get(r.id) ?? r);

  const toReveal = pool
    .filter((r) => r.id > 0 && !displayedSet.has(r.id))
    .sort((a, b) => a.id - b.id);

  for (let i = 0; i < Math.min(limitNew, toReveal.length); i++) {
    const row = toReveal[i]!;
    next.push(row);
    displayedSet.add(row.id);
  }

  return next
    .sort((a, b) => a.id - b.id)
    .slice(-cap);
}

/** @deprecated 正式发送页等仍可用；专线栏请用 syncLaneLiveRowsFromPoll */
export function mergeLaneSessionLiveRows(
  prev: LaneLiveRow[],
  incoming: LaneLiveRow[],
  opts: { sessionStartLastId: number; maxRows?: number }
): LaneLiveRow[] {
  void opts.sessionStartLastId;
  return syncLaneLiveRowsFromPoll(prev, incoming, opts.maxRows ?? 3);
}
