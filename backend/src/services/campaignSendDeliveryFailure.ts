/** 当场投递失败：SMTP 拒信 + 抑制列表跳过（未真正发出） */

export function sqlEmailSendIsSmtpFailure(alias = "s"): string {
  return `${alias}.status IN ('failed', 'suppressed')`;
}

/** 与单组实时监控 lite 一致：skipped 计入失败栏，勿只在 send-progress 统计、7 栏漏计 */
export function sqlEmailSendCountsAsDeliveryFailure(alias = "s"): string {
  return `${alias}.status IN ('failed', 'suppressed', 'skipped')`;
}

export function sqlSumEmailSendSmtpFailures(alias = "s"): string {
  return `SUM(CASE WHEN ${sqlEmailSendIsSmtpFailure(alias)} THEN 1 ELSE 0 END)`;
}

/** 与单组监控 lite / 7 栏一致：含 skipped */
export function sqlSumEmailSendDeliveryFailures(alias = "s"): string {
  return `SUM(CASE WHEN ${sqlEmailSendCountsAsDeliveryFailure(alias)} THEN 1 ELSE 0 END)`;
}
