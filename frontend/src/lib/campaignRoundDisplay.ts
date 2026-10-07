/** 活动 6 位编号展示（已取消轮次，仅编号 + 名称） */

export function campaignPickerCode(c: { id: number; campaign_code?: string | null }): string {
  return String(c.campaign_code ?? "").trim() || String(c.id).padStart(6, "0");
}

export function campaignSendPickerCodeText(code: string, _latestRoundNo?: number | null): string {
  return String(code ?? "").trim();
}

/** @deprecated 轮次已取消，保留兼容旧调用 */
export function campaignSendPickerRoundNo(_latestRoundNo?: number | null): number {
  return 1;
}

/** @deprecated 轮次已取消 */
export function campaignStatsDisplayRoundNo(_latestRoundNo?: number | null): number | null {
  return null;
}

/** @deprecated 轮次已取消 */
export function campaignCodeWithRoundText(code: string, _roundNo?: number | null): string {
  return String(code ?? "").trim();
}
