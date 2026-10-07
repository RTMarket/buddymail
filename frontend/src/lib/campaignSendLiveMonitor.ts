/** 实时监控栏：剩余时间文案、进度条分档颜色 */

export function formatRemainHms(sec: number): string {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h} 小时 ${m} 分 ${s} 秒`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

/** 每 20% 一档进度条颜色 */
export function sendProgressBarColorClass(progressPct: number): string {
  const p = Math.max(0, Math.min(100, Math.floor(progressPct)));
  if (p >= 100) return "bg-emerald-600";
  if (p >= 80) return "bg-lime-500";
  if (p >= 60) return "bg-amber-500";
  if (p >= 40) return "bg-yellow-500";
  if (p >= 20) return "bg-sky-500";
  return "bg-slate-400";
}

export function sendProgressStatusLabel(progressPct: number, isSending: boolean): string {
  const p = Math.max(0, Math.min(100, Math.floor(progressPct)));
  if (p >= 100) return "✅ 已完成";
  if (!isSending) return p > 0 ? "已结束" : "未在发送";
  if (p <= 0) return "发送中…";
  return `发送中… ${p}%`;
}

/**
 * 显示计划发送人数。
 * @param planned 计划发送的邮箱总数（去重后）
 * @param totalContacts 可选受众联系人总数（去重前），有值则显示两者区别
 */
export function formatPlannedAudienceLine(planned: number, totalContacts?: number | null): string {
  const n = Math.max(0, Math.floor(planned));
  if (n <= 0) return "计划发送：计算中…";
  const total = totalContacts != null && Number.isFinite(totalContacts) ? Math.max(0, Math.floor(totalContacts)) : 0;
  if (total > 0 && total !== n) {
    return `计划发送 ${total.toLocaleString()} 个联系人 · ${n.toLocaleString()} 个唯一邮箱`;
  }
  return `计划发送 ${n.toLocaleString()} 个联系人（${n.toLocaleString()} 个邮箱）`;
}
