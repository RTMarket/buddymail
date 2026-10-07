/** send_run_id 筛选片段（统计页单轮明细 / 发送名单） */

export function sqlSendRunFilter(alias: string, sendRunId: number | null | undefined): {
  clause: string;
  params: unknown[];
} {
  const id = Math.floor(Number(sendRunId) || 0);
  if (id <= 0) return { clause: "", params: [] };
  const a = String(alias || "s").trim() || "s";
  return { clause: ` AND ${a}.send_run_id = ?`, params: [id] };
}

export function parseSendRunQueryInput(query: {
  sendRunId?: string | number | undefined;
  roundNo?: string | number | undefined;
}): { sendRunId?: number; roundNo?: number } {
  const sendRunId = Math.floor(Number(query.sendRunId) || 0);
  const roundNo = Math.floor(Number(query.roundNo) || 0);
  return {
    sendRunId: sendRunId > 0 ? sendRunId : undefined,
    roundNo: roundNo > 0 ? roundNo : undefined
  };
}
