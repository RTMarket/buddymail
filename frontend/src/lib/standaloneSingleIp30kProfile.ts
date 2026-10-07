import {
  standaloneLicenseDailySendLimit,
  standaloneLicenseDomainSlots,
  standaloneLicensePlanTierId,
  standaloneLicenseVpsGroupSlots
} from "./standaloneDeploy";

/** 单 IP · 日发 3 万 · $99（1 域 1 专线 · 单机组） */
export function isStandaloneSingleIp30kPack(): boolean {
  return (
    standaloneLicensePlanTierId() === "email-send-30000" &&
    standaloneLicenseDailySendLimit() === 30_000 &&
    (standaloneLicenseVpsGroupSlots() ?? 1) === 1 &&
    (standaloneLicenseDomainSlots() ?? 1) === 1
  );
}
