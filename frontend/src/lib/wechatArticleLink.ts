/** 公众号正文链接 · 微信仅允许已群发/已发布文章链接（mp.weixin.qq.com） */

export function isWechatPublishedArticleUrl(raw: string): boolean {
  const input = raw.trim();
  if (!input) return false;
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = u.hostname.toLowerCase();
    if (host !== "mp.weixin.qq.com" && host !== "www.mp.weixin.qq.com") return false;
    const path = u.pathname.toLowerCase();
    return path === "/s" || path.startsWith("/s/") || path.startsWith("/mp/appmsg/show");
  } catch {
    return false;
  }
}

export function normalizeWechatArticleUrl(raw: string): string {
  const input = raw.trim();
  const withProto = input.startsWith("http") ? input : `https://${input}`;
  const u = new URL(withProto);
  return u.toString();
}

export function wechatArticleLinkHint(): string {
  return "仅支持已发布的微信公众号文章链接，例如 https://mp.weixin.qq.com/s/xxxx 。外部网站链接同步后会被微信过滤。";
}
