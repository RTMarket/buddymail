/**
 * 「中量」专线：`smtp_profiles.dedicated_server_id` 指向 `email_dedicated_servers`。
 * 与轻量（纯 SMTP rows）区分：营销与模版测试发件列出专线 profile（中量/巨量）。
 */
export function isDedicatedSmtpProfile(row: { dedicated_server_id?: number | null }): boolean {
  const v = row.dedicated_server_id;
  return v != null && Number(v) > 0;
}

export function filterDedicatedSmtpItems<T extends { dedicated_server_id?: number | null }>(
  items: T[] | null | undefined
): T[] {
  return (Array.isArray(items) ? items : []).filter(isDedicatedSmtpProfile);
}

/** 轻量 SMTP 配置页：排除中量专线自动生成的 profile，避免与中量页重复展示同一发件地址 */
export function excludeDedicatedSmtpItems<T extends { dedicated_server_id?: number | null }>(
  items: T[] | null | undefined
): T[] {
  return (Array.isArray(items) ? items : []).filter((row) => !isDedicatedSmtpProfile(row));
}
