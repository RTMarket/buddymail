/**
 * 专线栏 · 末封展示口径（验收切片）
 * 12/13 + 末封在途（≤1）→ 展示 13/13 +「发送完成 ✅」，不等待 DB 末行终态。
 * 中途（如 5/13）仍按 processed 逐封递增，禁止跳满。
 */

export type LaneAcceptedDisplay = {
  /** 面板「已受理 X / 计划 Y」的 X */
  accepted: number;
  remain: number;
  progressPct: number;
  /** 触达计划：展示发送完成 ✅ */
  showSendComplete: boolean;
};

export function resolveLaneAcceptedDisplay(opts: {
  planned: number;
  /** 后端 processed_count（不含 sending） */
  processed: number;
  inFlight: number;
}): LaneAcceptedDisplay {
  const planned = Math.max(0, Math.floor(opts.planned));
  const processed = Math.max(0, Math.floor(opts.processed));
  const inFlight = Math.max(0, Math.floor(opts.inFlight));

  if (planned <= 0) {
    return {
      accepted: processed,
      remain: 0,
      progressPct: processed > 0 ? 100 : 0,
      showSendComplete: processed > 0 && inFlight === 0
    };
  }

  /**
   * 串行 SMTP 最多 1 封在途：中途也计 processed+在途，首封 INSERT 后即可显示 1；
   * 末封 12+1 → 13/13。禁止跳满（仍 cap 到 planned）。
   */
  const inFlightCounted = Math.min(inFlight, 1);
  const atTail = inFlight <= 1 && processed >= planned - 1;
  const accepted = Math.min(planned, processed + (atTail ? inFlight : inFlightCounted));
  const remain = Math.max(0, planned - accepted);
  const showSendComplete = accepted >= planned;
  const progressPct = showSendComplete ? 100 : Math.min(99, Math.round((accepted / planned) * 100));

  return { accepted, remain, progressPct, showSendComplete };
}
