import { apiJson } from "./api";
import type { WechatDraftRecord } from "./wechatPublisherStorage";

export function buildWechatTrackedGoUrl(draftId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "";
  const path = `/api/wechat-official/article-go?d=${encodeURIComponent(draftId)}`;
  return origin ? `${origin}${path}` : path;
}

export async function registerWechatArticleLink(article: WechatDraftRecord): Promise<string | null> {
  try {
    const resp = await apiJson<{ ok: boolean; trackedGoUrl?: string; message?: string }>(
      "/api/wechat-official/article-registry",
      {
        method: "POST",
        body: JSON.stringify({
          draftId: article.id,
          title: article.title,
          publishId: article.publishId,
          publishedArticleUrl: article.publishedArticleUrl,
          linkedEmailTemplateId: article.linkedEmailTemplateId,
          publishedAt: article.publishedAt
        })
      }
    );
    if (!resp.ok) return null;
    return resp.trackedGoUrl ?? buildWechatTrackedGoUrl(article.id);
  } catch {
    return buildWechatTrackedGoUrl(article.id);
  }
}
