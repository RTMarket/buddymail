function parseEnvInt(value: unknown): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** 独立站：/api/standalone/license 返回的账号槽（构建 env 为 0 时仍可通过 .env 打开侧栏） */
let licenseAccountLimit = 0;

/** 当前 UI 仅展示 1 个 LinkedIn 账号槽（license/env 仍控制模块是否开通） */
export const LINKEDIN_PUBLISHER_UI_ACCOUNT_SLOTS = 1;

export function applyLinkedInPublisherLicenseAccountLimit(n: unknown): void {
  licenseAccountLimit = parseEnvInt(n);
}

/** license / 构建 env 原始槽位数（侧栏开通判断用） */
export function linkedinPublisherEntitlementSlots(): number {
  const build = parseEnvInt(import.meta.env.VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS);
  return Math.max(build, licenseAccountLimit);
}

/** 页面实际展示的账号槽数量 */
export function linkedinPublisherAccountLimit(): number {
  const licensed = linkedinPublisherEntitlementSlots();
  if (licensed <= 0) return 0;
  return Math.min(licensed, LINKEDIN_PUBLISHER_UI_ACCOUNT_SLOTS);
}

export function hasLinkedInPublisherEntitlement(): boolean {
  return linkedinPublisherEntitlementSlots() > 0;
}
