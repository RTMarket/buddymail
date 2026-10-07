import type { EmailChannelKind } from "./dedicatedEntitlements";

/** 开源版：档位 → 通道映射（通用逻辑） */
const MEDIUM_TIER_IDS: readonly string[] = ["email-send-30000", "email-send-500"];
const BULK_TIER_IDS: readonly string[] = ["email-send-50000", "email-send-100000"];

export type EmailSubscriptionChannel = EmailChannelKind | "unknown";

/** 根据邮件 tierId 判断轻量 / 中量 / 巨量 */
export function resolveEmailSubscriptionChannel(
  tierId: string | null | undefined,
  dailySendLimit?: number | null
): EmailSubscriptionChannel {
  if (tierId) {
    if ((MEDIUM_TIER_IDS as readonly string[]).includes(tierId)) return "medium";
    if ((BULK_TIER_IDS as readonly string[]).includes(tierId)) return "bulk";
    if (tierId === "email-send-500") return "medium";
  }
  const cap = dailySendLimit != null ? Number(dailySendLimit) : 0;
  if (cap >= 35_000) return "bulk";
  if (cap >= 1_000) return "medium";
  if (cap > 0) return "light";
  return "unknown";
}

export function emailSubscriptionChannelLabel(ch: EmailSubscriptionChannel): string {
  switch (ch) {
    case "light":
      return "轻量";
    case "medium":
      return "中量";
    case "bulk":
      return "巨量";
    case "ultra":
      return "超量";
    default:
      return "—";
  }
}

export function isTierAllowedForDedicatedVariant(
  tierId: string | null | undefined,
  variant: "medium" | "bulk"
): boolean {
  if (!tierId) return false;
  const allowed = variant === "medium" ? MEDIUM_TIER_IDS : BULK_TIER_IDS;
  return (allowed as readonly string[]).includes(tierId);
}
