import type { Pool } from "mysql2/promise";

const MAX_CAMPAIGNS = 100;

export type BlogArticleViewRow = {
  campaign: string;
  viewCount: number;
};

function countQuery(campaignMarks: string, pathMarks: string): string {
  return `SELECT campaign_key AS campaign, COUNT(*) AS view_count
         FROM (
           SELECT utm_campaign AS campaign_key, id
             FROM site_visit_events
            WHERE utm_medium = 'article_view'
              AND utm_campaign IN (${campaignMarks})
           UNION ALL
           SELECT SUBSTRING_INDEX(path, '/', -1) AS campaign_key, id
             FROM site_visit_events
            WHERE (utm_medium IS NULL OR utm_medium != 'article_view')
              AND path IN (${pathMarks})
              AND SUBSTRING_INDEX(path, '/', -1) IN (${campaignMarks})
         ) merged
        WHERE campaign_key IS NOT NULL AND campaign_key != ''
        GROUP BY campaign_key`;
}

/** 博客文章阅读量：每次 article_view 事件计 1 次（按页面打开次数，非 UV）。 */
export async function fetchBlogArticleViewCounts(db: Pool, campaigns: string[]): Promise<BlogArticleViewRow[]> {
  const keys = [...new Set(campaigns.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_CAMPAIGNS);
  if (!keys.length) return [];

  const paths = keys.flatMap((c) => [`/zh/${c}`, `/en/${c}`]);
  const campaignMarks = keys.map(() => "?").join(",");
  const pathMarks = paths.map(() => "?").join(",");

  try {
    const [rows] = await db.query(countQuery(campaignMarks, pathMarks), [...keys, ...paths, ...keys]);
    return (rows as { campaign?: string; view_count?: number }[])
      .map((row) => ({
        campaign: String(row.campaign ?? ""),
        viewCount: Math.max(0, Number(row.view_count ?? 0))
      }))
      .filter((row) => row.campaign);
  } catch {
    return [];
  }
}

export async function countBlogArticleViews(db: Pool, campaign: string): Promise<number> {
  const rows = await fetchBlogArticleViewCounts(db, [campaign]);
  return rows.find((r) => r.campaign === campaign)?.viewCount ?? 0;
}

/** 记录一次文章页打开，并返回最新阅读总数。 */
export async function recordBlogArticleView(
  db: Pool,
  input: {
    campaign: string;
    path: string | null;
    referrer: string | null;
    userAgent: string | null;
    ip: string | null;
    locale?: string | null;
    articleTitle?: string | null;
  }
): Promise<number> {
  const campaign = input.campaign.trim().slice(0, 128);
  if (!campaign) return 0;

  const path = input.path?.slice(0, 512) ?? null;
  const locale = input.locale?.slice(0, 16) ?? null;

  try {
    await db.query(
      `INSERT INTO site_visit_events (path, referrer, user_agent, ip, utm_source, utm_medium, utm_campaign, utm_content)
       VALUES (?, ?, ?, ?, 'blog', 'article_view', ?, ?)`,
      [path, input.referrer, input.userAgent, input.ip, campaign, locale]
    );
  } catch {
    return countBlogArticleViews(db, campaign);
  }

  return countBlogArticleViews(db, campaign);
}
