/** Open-core defaults: replaces the commercial LICENSE system. Configure via env. */

export function getOpenCorePlanTierId(): string {
  const v = (process.env.OPEN_CORE_PLAN_TIER_ID ?? "").trim();
  return v || "email-send-3000";
}

export function getOpenCoreDailySendLimit(): number {
  const n = Math.floor(Number(process.env.OPEN_CORE_DAILY_SEND_LIMIT ?? 3000));
  return Number.isFinite(n) && n > 0 ? n : 3000;
}
