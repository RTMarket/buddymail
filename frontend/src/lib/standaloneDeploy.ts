/** 开源版部署常量：无 LICENSE 体系，档位与日发上限由 env 配置 */
export const IS_STANDALONE_DEPLOY = true;

/** 档位 id：env VITE_OPEN_CORE_PLAN_TIER_ID，默认 email-send-3000 */
export function standaloneLicensePlanTierId(): string {
  const raw = String(import.meta.env.VITE_OPEN_CORE_PLAN_TIER_ID ?? "").trim();
  return raw || "email-send-3000";
}

/** 日发上限：env VITE_OPEN_CORE_DAILY_SEND_LIMIT，默认 3000 */
export function standaloneLicenseDailySendLimit(): number {
  const n = Number(import.meta.env.VITE_OPEN_CORE_DAILY_SEND_LIMIT ?? 3000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3000;
}

export function standaloneLicenseDomainSlots(): number | null {
  return null;
}

export function standaloneLicenseVpsGroupSlots(): number | null {
  return null;
}

/** 开源版：隐藏「套餐通道」选择器 */
export function standaloneOmitPackageChannelPicker(): boolean {
  return IS_STANDALONE_DEPLOY;
}
