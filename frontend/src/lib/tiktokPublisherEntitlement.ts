function parseEnvInt(value: unknown): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** 独立站：/api/standalone/license 返回的 TikTok 账号槽 */
let licenseAccountLimit = 0;

/** 矩阵版 UI：最多展示 15 个 TikTok 账号槽 */
export const TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS = 50;

export function applyTikTokPublisherLicenseAccountLimit(n: unknown): void {
  licenseAccountLimit = parseEnvInt(n);
}

export function tiktokPublisherEntitlementSlots(): number {
  const build = parseEnvInt(import.meta.env.VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS);
  return Math.max(build, licenseAccountLimit);
}

export function tiktokPublisherAccountLimit(): number {
  const licensed = tiktokPublisherEntitlementSlots();
  if (licensed <= 0) return 0;
  return Math.min(licensed, TIKTOK_PUBLISHER_UI_ACCOUNT_SLOTS);
}

export function hasTikTokPublisherEntitlement(): boolean {
  return tiktokPublisherEntitlementSlots() > 0;
}
