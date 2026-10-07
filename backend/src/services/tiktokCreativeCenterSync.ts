import type { Pool } from "mysql2/promise";

const DEFAULT_REGION = "US";
const SYNC_LIMIT = 15;

export type TrendKind = "hashtag" | "music" | "category";

export type TrendRowInput = {
  rank: number;
  externalId: string | null;
  title: string;
  subtitle: string | null;
  metricValue: number | null;
  metricLabel: string | null;
  meta: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Creative Center 返回非 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    throw new Error(`Creative Center HTTP ${res.status}`);
  }
  return body as T;
}

type BaseResp = { StatusCode?: number; StatusMessage?: string };

type HashtagListResponse = {
  BaseResp?: BaseResp;
  items?: Array<Record<string, unknown>>;
  pagination?: {
    totalCount?: number;
    hasMore?: boolean;
    page?: number;
  };
};

type VideoOverviewResponse = {
  BaseResp?: BaseResp;
  lastDailyEndTimestamp?: string | number;
  lastWeeklyEndTimestamp?: string | number;
  lastMonthlyEndTimestamp?: string | number;
};

type VideoListResponse = {
  BaseResp?: BaseResp;
  entityInfos?: Array<Record<string, unknown>>;
  pagination?: {
    totalCount?: number;
    hasMore?: boolean;
    page?: number;
  };
};

function assertBaseRespOk(resp: BaseResp | undefined, label: string) {
  const code = Number(resp?.StatusCode ?? 0);
  if (code !== 0) {
    throw new Error(`${label} 失败：${resp?.StatusMessage || `StatusCode=${code}`}`);
  }
}

function resolveAdsReportBase(region: string): string {
  const upper = region.trim().toUpperCase();
  if (upper === "US") return "https://ads.us.tiktok.com";
  return "https://ads.tiktok.com";
}

function toPeriodDimension(periodDays: number): number {
  if (periodDays <= 7) return 3;
  return 5;
}

export async function fetchCreativeCenterHashtags(
  region = DEFAULT_REGION,
  page = 1,
  limit = SYNC_LIMIT
): Promise<TrendRowInput[]> {
  const data = await fetchJson<HashtagListResponse>(
    "https://ads.tiktok.com/CreativeOne/KnowledgeAPI/GetHashtagList",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeRange: 7,
        countryCode: region,
        page,
        limit
      })
    }
  );
  assertBaseRespOk(data.BaseResp, "官方标签热榜");
  return (data.items ?? []).map((raw, index) => {
    const row = asRecord(raw) ?? {};
    const title =
      pickString(row.hashtagName, row.hashtag_name, row.title, row.name) ??
      `#item-${index + 1}`;
    const views = pickNumber(row.vv, row.video_views, row.view_count, row.views);
    const posts = pickNumber(row.publishCnt, row.publish_cnt, row.post_count, row.posts);
    const topCreator = Array.isArray(row.topCreators) ? asRecord(row.topCreators[0]) : null;
    return {
      rank: pickNumber(row.rankIndex, row.rank, row.rank_pos) ?? index + 1,
      externalId: pickString(row.hashtagID, row.hashtag_id, row.id),
      title: title.startsWith("#") ? title : `#${title}`,
      subtitle: pickString(topCreator?.nickname, topCreator?.handleName, row.industry_name),
      metricValue: views,
      metricLabel: "播放量",
      meta: {
        postCount: posts,
        topCreator: pickString(topCreator?.nickname, topCreator?.handleName)
      }
    };
  });
}

export async function fetchCreativeCenterMusic(
  region = DEFAULT_REGION,
  page = 1,
  limit = SYNC_LIMIT
): Promise<TrendRowInput[]> {
  void region;
  void page;
  void limit;
  return [];
}

export async function fetchCreativeCenterCategories(
  region = DEFAULT_REGION,
  page = 1,
  limit = SYNC_LIMIT
): Promise<TrendRowInput[]> {
  const reportBase = resolveAdsReportBase(region);
  const overview = await fetchJson<VideoOverviewResponse>(
    `${reportBase}/CreativeOne/Report/GetTopContentsOverview`
  );
  assertBaseRespOk(overview.BaseResp, "官方品类/视频概览");
  const periodEndTimestamp = String(overview.lastDailyEndTimestamp ?? "");
  const params = new URLSearchParams({
    contentLabelIDs: "",
    countryCode: region,
    limit: String(limit),
    orderByMetric: "1",
    organicOnly: "false",
    page: String(page),
    periodDimension: String(toPeriodDimension(7)),
    periodEndTimestamp
  });
  const data = await fetchJson<VideoListResponse>(
    `${reportBase}/CreativeOne/Report/CreativeCenterGetTopContentsList?${params.toString()}`
  );
  assertBaseRespOk(data.BaseResp, "官方品类/视频热榜");
  return (data.entityInfos ?? []).map((raw, index) => {
    const row = asRecord(raw) ?? {};
    const itemInfo = asRecord(row.itemInfo);
    const authorInfo = asRecord(row.itemAuthorInfo);
    const metrics = asRecord(row.itemMetrics);
    const title =
      pickString(
        itemInfo?.title,
        itemInfo?.description,
        row.title,
        row.item_title,
        row.desc,
        row.video_title
      ) ??
      `热门主题 ${index + 1}`;
    const industry = pickString(authorInfo?.nickName, authorInfo?.handlerName);
    const views = pickNumber(
      metrics?.videoViews,
      metrics?.videoViewsLifeTime,
      metrics?.vv,
      row.vv,
      row.play_count,
      row.video_views,
      row.views
    );
    return {
      rank: index + 1,
      externalId: pickString(itemInfo?.itemID, row.item_id, row.video_id, row.id),
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      subtitle: industry,
      metricValue: views,
      metricLabel: "播放量",
      meta: {
        author: pickString(authorInfo?.nickName, authorInfo?.handlerName),
        coverUrl: pickString(itemInfo?.coverURL, row.cover_url, row.cover)
      }
    };
  });
}

function trendDateKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

async function replaceDailyRows(
  db: Pool,
  kind: TrendKind,
  region: string,
  rows: TrendRowInput[]
): Promise<number> {
  const dateKey = trendDateKey();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM tiktok_tool_daily_trends WHERE trend_date = ? AND kind = ? AND region = ?`,
      [dateKey, kind, region]
    );
    for (const row of rows.slice(0, SYNC_LIMIT)) {
      await conn.query(
        `INSERT INTO tiktok_tool_daily_trends
         (trend_date, kind, region, rank_pos, external_id, title, subtitle, metric_bigint, metric_label, meta_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          dateKey,
          kind,
          region,
          row.rank,
          row.externalId,
          row.title,
          row.subtitle,
          row.metricValue,
          row.metricLabel,
          row.meta ? JSON.stringify(row.meta) : null
        ]
      );
    }
    await conn.commit();
    return rows.length;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function fetchAllCreativeCenterTrends(region = DEFAULT_REGION): Promise<{
  hashtags: TrendRowInput[];
  music: TrendRowInput[];
  categories: TrendRowInput[];
}> {
  const hashtags = await fetchCreativeCenterHashtags(region);
  const music = await fetchCreativeCenterMusic(region);
  const categories = await fetchCreativeCenterCategories(region);
  return { hashtags, music, categories };
}

export async function probeCreativeCenterTrends(region = DEFAULT_REGION) {
  try {
    const [hashtags, music, categories] = await Promise.all([
      fetchCreativeCenterHashtags(region, 1, 3),
      fetchCreativeCenterMusic(region, 1, 3),
      fetchCreativeCenterCategories(region, 1, 3)
    ]);
    return {
      region,
      hashtag: { ok: true, count: hashtags.length, sample: hashtags[0] ?? null },
      music: {
        ok: true,
        count: music.length,
        note: "TikTok 当前公开趋势页未暴露音乐排行榜，暂返回 0 条"
      },
      category: { ok: true, count: categories.length, sample: categories[0] ?? null }
    };
  } catch (error) {
    return {
      region,
      ok: false,
      error: error instanceof Error ? error.message : "probe failed"
    };
  }
}

export async function saveTrendRowsToDb(
  db: Pool,
  region: string,
  payload: {
    hashtags: TrendRowInput[];
    music: TrendRowInput[];
    categories: TrendRowInput[];
  }
): Promise<Record<TrendKind, number>> {
  return {
    hashtag: await replaceDailyRows(db, "hashtag", region, payload.hashtags),
    music: await replaceDailyRows(db, "music", region, payload.music),
    category: await replaceDailyRows(db, "category", region, payload.categories)
  };
}

export async function syncTiktokDailyTrends(
  db: Pool,
  region = DEFAULT_REGION
): Promise<{ ok: true; region: string; counts: Record<TrendKind, number> }> {
  const fetched = await fetchAllCreativeCenterTrends(region);
  const counts = await saveTrendRowsToDb(db, region, fetched);

  const total = counts.hashtag + counts.music + counts.category;
  if (total === 0) {
    throw new Error(
      "Creative Center 返回 0 条热榜，请检查 TikTok 公共趋势页是否变化"
    );
  }

  return { ok: true, region, counts };
}

export async function importTiktokDailyTrends(
  db: Pool,
  region: string,
  payload: {
    hashtags: TrendRowInput[];
    music: TrendRowInput[];
    categories: TrendRowInput[];
  }
): Promise<{ ok: true; region: string; counts: Record<TrendKind, number> }> {
  const counts = await saveTrendRowsToDb(db, region.toUpperCase(), payload);
  const total = counts.hashtag + counts.music + counts.category;
  if (total === 0) {
    throw new Error("导入热榜为空");
  }
  return { ok: true, region: region.toUpperCase(), counts };
}
