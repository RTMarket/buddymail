function parseEnvInt(value: unknown): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

let licenseAccountLimit = 0;

export function applyWechatOfficialLicenseAccountLimit(n: unknown): void {
  licenseAccountLimit = parseEnvInt(n);
}

export function wechatOfficialAccountLimit(): number {
  const build = parseEnvInt(import.meta.env.VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS);
  return Math.max(build, licenseAccountLimit);
}

export function hasWechatOfficialEntitlement(): boolean {
  return wechatOfficialAccountLimit() > 0;
}
