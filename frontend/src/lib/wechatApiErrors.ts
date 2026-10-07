/** 将微信 API 原始错误转为用户可读提示（前端兜底，后端也会格式化） */

export function formatWechatClientError(raw: string): string {
  const text = raw.trim();
  if (!text) return "操作失败，请稍后重试。";

  if (text.includes("40164") || text.includes("not in whitelist") || text.includes("invalid ip")) {
    const ipMatch = text.match(/invalid ip\s+([\d.a-f:]+)/i) ?? text.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    const ip = ipMatch?.[1] ?? "本服务器公网 IP";
    return `微信 API 拒绝连接：服务器 IP（${ip}）未加入公众号 IP 白名单。请登录微信公众平台 → 开发 → 基本配置 → IP 白名单，添加该 IP 后重试上传。`;
  }

  if (text.includes("access_token 获取失败") && text.includes("40164")) {
    return formatWechatClientError(text.slice(text.indexOf("{")));
  }

  if (text.startsWith("微信 API 拒绝")) return text;

  return text;
}
