/** 与后端 adminEmailOnboardingListFilters 保持一致 */
export const ADMIN_ONBOARDING_OPS_FILTERS = [
  { value: "first_pending", label: "待审首次申请" },
  { value: "domain_change_pending", label: "换域待审核" },
  { value: "dns_not_pushed", label: "DNS 未推送" },
  { value: "smtp_sync_pending", label: "SMTP 未同步" },
  { value: "smtp_587_pending", label: "587 未通过" },
  { value: "stale_3d", label: "卡停 ≥3 天" }
] as const;

export type AdminOnboardingOpsFilterValue =
  (typeof ADMIN_ONBOARDING_OPS_FILTERS)[number]["value"];
