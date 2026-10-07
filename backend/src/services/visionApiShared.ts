/** 识图探针图（64×64 PNG，避免 1×1 像素被部分视觉模型拒绝） */
export const VISION_TEST_PROBE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAARElEQVR4nO3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBxAABHgCqSQAAAABJRU5ErkJggg==";

export function unwrapFetchError(e: unknown): string {
  const err = e as Error & { cause?: unknown; code?: string };
  const parts: string[] = [];
  if (err?.message?.trim()) parts.push(err.message.trim());
  if (err?.cause) {
    const cm =
      typeof err.cause === "object" && err.cause !== null && "message" in err.cause
        ? String((err.cause as Error).message ?? "")
        : String(err.cause);
    if (cm.trim() && !parts.some((p) => p.includes(cm.trim()))) parts.push(cm.trim());
  }
  if (err?.code && !parts.some((p) => p.includes(err.code!))) parts.push(`code=${err.code}`);
  const joined = parts.filter(Boolean).join("：");
  if (!joined) return "连接大模型接口失败（网络或 DNS 错误）";
  if (/^Request failed/i.test(joined) || /Unknown error/i.test(joined) || /fetch failed/i.test(joined)) {
    return (
      `服务器连接大模型接口失败（${joined}）。请确认：① 已点「保存设置」② Base URL 正确` +
      `（硅基 https://api.siliconflow.cn/v1）③ 模型名与控制台一致 ④ 服务器可访问外网。`
    );
  }
  return joined;
}
