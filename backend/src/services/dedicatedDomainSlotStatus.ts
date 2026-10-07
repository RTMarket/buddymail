/** 不计入发信域名名额、不参与租户「在办」域列表的状态 */
export const DEDICATED_DOMAIN_SLOT_EXCLUDED_STATUSES = [
  "cancelled",
  "rejected",
  "deleted"
] as const;

/** 租户前台不展示（管理端可保留统计） */
export const DEDICATED_TENANT_HIDDEN_STATUSES = ["cancelled", "deleted"] as const;

function sqlDedicatedStatusColumn(alias?: string): string {
  const raw = (alias ?? "").trim().replace(/\.+$/, "");
  return raw ? `${raw}.status` : "status";
}

export function sqlDedicatedDomainCountsTowardSlot(alias?: string): string {
  return `${sqlDedicatedStatusColumn(alias)} NOT IN ('cancelled','rejected','deleted')`;
}

export function sqlDedicatedVisibleToTenant(alias?: string): string {
  return `${sqlDedicatedStatusColumn(alias)} NOT IN ('cancelled','deleted')`;
}
