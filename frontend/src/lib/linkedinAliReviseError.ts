export function formatLinkedInAliReviseError(message: string): string {
  const msg = message.trim();
  if (msg.includes("404") || msg.includes("Cannot POST") || msg.includes("非 JSON")) {
    return "AI 优化接口未部署或不可用，请执行热更并 restart backend。";
  }
  if (msg.includes("AbortError") || msg.includes("超时") || msg.includes("timeout")) {
    return "AI 优化超时，请稍后点「重新优化」重试。";
  }
  if (msg.includes("激活") || msg.includes("API Key")) return msg;
  return msg || "AI 优化失败";
}
