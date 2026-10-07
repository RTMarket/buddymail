import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { apiJson } from "./api";
import type { WechatDraftRecord } from "./wechatPublisherStorage";

type StatsResponse = {
  ok: boolean;
  byDraftId?: Record<
    string,
    {
      wechatOfficialReads: number | null;
      emailDrivenReads: number;
      emailSent: number;
      emailOpened: number;
      emailClicked: number;
      statsNote?: string;
    }
  >;
};

/** 同步微信官方阅读 + 邮件导流点击 + 邮件发送统计 */
export function useWechatArticleStatsSync(
  drafts: WechatDraftRecord[],
  setDrafts: Dispatch<SetStateAction<WechatDraftRecord[]>>,
  enabled: boolean
) {
  const syncKey = drafts
    .filter((d) => d.status === "published" || d.linkedEmailTemplateId)
    .map((d) => `${d.id}:${d.publishId ?? ""}:${d.linkedEmailTemplateId ?? ""}`)
    .join("|");
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !syncKey) return;

    async function tick() {
      if (busyRef.current) return;
      const articles = drafts
        .filter((d) => d.status === "published" || d.linkedEmailTemplateId)
        .map((d) => ({
          draftId: d.id,
          publishId: d.publishId,
          publishedAt: d.publishedAt,
          linkedEmailTemplateId: d.linkedEmailTemplateId
        }));
      if (!articles.length) return;
      busyRef.current = true;
      try {
        const resp = await apiJson<StatsResponse>("/api/wechat-official/article-stats", {
          method: "POST",
          body: JSON.stringify({ articles })
        });
        if (!resp.ok || !resp.byDraftId) return;
        setDrafts((prev) =>
          prev.map((d) => {
            const s = resp.byDraftId![d.id];
            if (!s) return d;
            return {
              ...d,
              readCount: s.wechatOfficialReads != null ? s.wechatOfficialReads : d.readCount ?? 0,
              emailDrivenReads: s.emailDrivenReads,
              emailSent: s.emailSent,
              emailOpened: s.emailOpened,
              emailClicks: s.emailClicked
            };
          })
        );
      } catch {
        /* ignore poll errors */
      } finally {
        busyRef.current = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled, syncKey, setDrafts, drafts]);
}

/** @deprecated 使用 useWechatArticleStatsSync */
export const useWechatArticleEmailStatsSync = useWechatArticleStatsSync;

type SingleArticleStats = NonNullable<StatsResponse["byDraftId"]>[string];

type ArticleStatsPayload = {
  draftId: string;
  publishId?: string;
  publishedAt?: string;
  linkedEmailTemplateId?: number;
};

export type WechatArticleStatsSnapshot = SingleArticleStats;

function articlesStatsKey(articles: ArticleStatsPayload[]): string {
  return articles.map((a) => `${a.draftId}:${a.publishId ?? ""}:${a.linkedEmailTemplateId ?? ""}`).join("|");
}

/** 涨阅读页：多篇文章看板批量轮询（独立接口，不写营销活动统计缓存） */
export function useWechatArticleStatsMap(
  articles: ArticleStatsPayload[],
  enabled: boolean,
  pollMs = 20_000
) {
  const [byDraftId, setByDraftId] = useState<Record<string, SingleArticleStats>>({});
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const busyRef = useRef(false);
  const articlesKey = articlesStatsKey(articles);

  useEffect(() => {
    if (!enabled || !articles.length) {
      setByDraftId({});
      return;
    }

    async function tick() {
      if (busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      try {
        const resp = await apiJson<StatsResponse>("/api/wechat-official/article-stats", {
          method: "POST",
          body: JSON.stringify({ articles: articles.slice(0, 50) })
        });
        if (resp.ok && resp.byDraftId) {
          setByDraftId(resp.byDraftId);
          setLastFetchedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
        }
      } catch {
        /* ignore */
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, articlesKey, pollMs, articles]);

  return { byDraftId, loading, lastFetchedAt };
}
