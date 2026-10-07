/**
 * 单组 VPS 实时监控 · 最近 N 封展示池与逐封露出（与 poll 解耦，避免一次 poll 涌入多行）
 */

import {
  syncLaneLiveRowsDripFromPoll,
  syncLaneLiveRowsFromPoll,
  type LaneLiveRow
} from "./laneSendLiveRows";
import { FORMAL_SEND_LIVE_DRIP_ROWS_PER_TICK, FORMAL_SEND_LIVE_RECENT_ROWS } from "./formalSendLivePoll";

export const FORMAL_SEND_LIVE_POOL_CAP = 32;

export function mergeFormalSendLivePool(prev: LaneLiveRow[], incoming: LaneLiveRow[]): LaneLiveRow[] {
  return syncLaneLiveRowsFromPoll(prev, incoming, FORMAL_SEND_LIVE_POOL_CAP);
}

export function tickFormalSendLiveDripDisplay(
  displayed: LaneLiveRow[],
  pool: LaneLiveRow[],
  maxRows = FORMAL_SEND_LIVE_RECENT_ROWS,
  maxNewPerTick = FORMAL_SEND_LIVE_DRIP_ROWS_PER_TICK
): LaneLiveRow[] {
  /** 首封：池里已有行时立刻露出第一行，勿等下一档 drip tick */
  if (displayed.length === 0) {
    const first = pool
      .filter((r) => r.id > 0 && String(r.email ?? "").trim())
      .sort((a, b) => a.id - b.id)[0];
    if (first) {
      return [first];
    }
  }
  const dripped = syncLaneLiveRowsDripFromPoll(displayed, pool, maxRows, maxNewPerTick);
  const poolById = new Map<number, LaneLiveRow>();
  for (const row of pool) {
    if (row.id > 0) poolById.set(row.id, row);
  }
  return dripped.map((row) => (row.id > 0 ? (poolById.get(row.id) ?? row) : row));
}

/** poll 一次返回多行时，将展示池追平到池内最新 N 行（监控表已移除，仍维护 ref 供计数/收尾） */
export function catchUpFormalSendLiveDripDisplay(
  displayed: LaneLiveRow[],
  pool: LaneLiveRow[],
  maxRows = FORMAL_SEND_LIVE_RECENT_ROWS
): LaneLiveRow[] {
  const sorted = pool
    .filter((r) => r.id > 0 && String(r.email ?? "").trim())
    .sort((a, b) => a.id - b.id);
  if (sorted.length === 0) return displayed;
  const tail = sorted.slice(-maxRows);
  const poolById = new Map<number, LaneLiveRow>();
  for (const row of pool) {
    if (row.id > 0) poolById.set(row.id, row);
  }
  return tail.map((row) => poolById.get(row.id) ?? row);
}

export function formalSendLiveDripChanged(prev: LaneLiveRow[], next: LaneLiveRow[]): boolean {
  if (prev.length !== next.length) return true;
  return next.some(
    (r, i) =>
      r.id !== prev[i]?.id ||
      r.status !== prev[i]?.status ||
      r.error !== prev[i]?.error ||
      r.email !== prev[i]?.email
  );
}
