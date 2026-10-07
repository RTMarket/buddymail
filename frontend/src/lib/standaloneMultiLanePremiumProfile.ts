import { standaloneLicensePlanTierId } from "./standaloneDeploy";

/** 每条专线当日成功送达硬顶（与面板/工作台展示一致） */
export const PREMIUM_LANE_DELIVERED_CAP = 25_000;

/** 多机组 5 万 · 2 专线 · 每线 3 发信域 */
export function isStandaloneMultiLane50kPack(): boolean {
  return standaloneLicensePlanTierId() === "email-send-50000";
}

/** 多机组 10 万 · 4 专线 · 每线 3 发信域 */
export function isStandaloneMultiLane100kPack(): boolean {
  return standaloneLicensePlanTierId() === "email-send-100000";
}

export function isStandaloneMultiLanePremiumPack(): boolean {
  return isStandaloneMultiLane50kPack() || isStandaloneMultiLane100kPack();
}

export function premiumMultiLaneCount(): number {
  if (isStandaloneMultiLane50kPack()) return 2;
  if (isStandaloneMultiLane100kPack()) return 4;
  return 0;
}
