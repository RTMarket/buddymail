import { getOpenCorePlanTierId } from "./openCoreConfig.js";

/** 每条专线当日成功送达硬顶 */
export const PREMIUM_LANE_DELIVERED_CAP = 25_000;

export function isStandaloneMultiLane50kPack(): boolean {
  return getOpenCorePlanTierId() === "email-send-50000";
}

export function isStandaloneMultiLane100kPack(): boolean {
  return getOpenCorePlanTierId() === "email-send-100000";
}

export function isStandaloneMultiLanePremiumPack(): boolean {
  return isStandaloneMultiLane50kPack() || isStandaloneMultiLane100kPack();
}
