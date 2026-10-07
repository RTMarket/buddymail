/** 专线配额纯函数（无 DB），供 dedicatedLanes 与单测共用 */

/** 混元～日发 4 万前：每条专线发送总数（sent+failed）硬闸 */
export const DEDICATED_LINE_SENT_CAP = 20_000;

/** 日发 4 万（含）起：每条专线发送总数硬闸 */
export const DEDICATED_LINE_SENT_CAP_HIGH = 25_000;

/** 混元（3 万/日）及以上：多线发送 UI / 每线固定 cap（不按套餐÷组数分摊） */
export const MULTI_LANE_PACKAGE_DAILY_MIN = 30_000;

/** 日发达到此值起，多线套餐每线 cap 升为 {@link DEDICATED_LINE_SENT_CAP_HIGH} */
export const HIGH_LINE_CAP_PACKAGE_DAILY_MIN = 40_000;

/** 多专线并行发信：仅当 LICENSE/套餐 专线名额 ≥2（单 IP 3 万与 3k 同为单机组，不按日发阈值升格） */
export function usesMultiLaneSendPackage(_dailyLimit: number, vpsGroupSlots: number): boolean {
  const slots = Math.max(1, Math.floor(Number(vpsGroupSlots) || 0));
  return slots >= 2;
}

/** 多线套餐下每线固定发送总数上限（不含送达成功套餐池） */
export function lineSentCapForMultiLanePackage(dailyLimit: number): number {
  const limit = Math.max(0, Math.floor(Number(dailyLimit) || 0));
  return limit >= HIGH_LINE_CAP_PACKAGE_DAILY_MIN
    ? DEDICATED_LINE_SENT_CAP_HIGH
    : DEDICATED_LINE_SENT_CAP;
}

/** 每条 VPS 专线组「发送总数」硬闸（sent+failed 尝试次数；与套餐送达成功日上限分开） */
export function computeLineSentCap(dailyLimit: number, _vpsGroupSlots?: number): number {
  return lineSentCapForMultiLanePackage(dailyLimit);
}
