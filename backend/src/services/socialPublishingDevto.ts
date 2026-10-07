import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";

export type SocialPublishStatus = "queued" | "published" | "failed" | "skipped";

export type SocialPublishItem = {
  id: number;
  platform: "devto";
  sourceSlug: string;
  sourceLocale: string;
  sourcePath: string;
  title: string;
  description: string | null;
  canonicalUrl: string;
  trackingUrl: string;
  tags: string[];
  status: SocialPublishStatus;
  queueOrder: number;
  publishedAt: string | null;
  platformArticleId: string | null;
  platformUrl: string | null;
  devtoPageViews: number;
  devtoPublicReactions: number;
  devtoCommentsCount: number;
  devtoPositiveReactions: number;
  devtoReadingTimeMinutes: number;
  lastStatsSyncedAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  estimatedPublishAt: string | null;
  mainVisitCount: number;
  uniqueIpCount: number;
  registrationCount: number;
  paidConversionCount: number;
  paidAmountCents: number;
};

type BlogArticle = {
  slug: string;
  path: string;
  frontmatter: Record<string, any>;
  body: string;
};

let schemaReady = false;
let localEnvLoaded = false;

export async function ensureSocialPublishingSchema(db: Pool): Promise<void> {
  if (schemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS social_publish_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      platform VARCHAR(32) NOT NULL,
      source_slug VARCHAR(256) NOT NULL,
      source_locale VARCHAR(16) NOT NULL DEFAULT 'en',
      source_path VARCHAR(1024) NOT NULL DEFAULT '',
      title VARCHAR(512) NOT NULL DEFAULT '',
      description TEXT NULL,
      canonical_url VARCHAR(1024) NOT NULL DEFAULT '',
      tracking_url VARCHAR(1200) NOT NULL DEFAULT '',
      tags_json TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      queue_order BIGINT NOT NULL DEFAULT 0,
      published_at DATETIME NULL,
      platform_article_id VARCHAR(128) NULL,
      platform_url VARCHAR(1024) NULL,
      devto_page_views INT NOT NULL DEFAULT 0,
      devto_public_reactions INT NOT NULL DEFAULT 0,
      devto_comments_count INT NOT NULL DEFAULT 0,
      devto_positive_reactions INT NOT NULL DEFAULT 0,
      devto_reading_time_minutes INT NOT NULL DEFAULT 0,
      last_stats_synced_at DATETIME NULL,
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_social_platform_source (platform, source_slug),
      KEY idx_social_platform_queue (platform, status, queue_order, id),
      KEY idx_social_platform_article (platform, platform_article_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`ALTER TABLE social_publish_items MODIFY COLUMN queue_order BIGINT NOT NULL DEFAULT 0`).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS social_platform_settings (
      platform VARCHAR(32) PRIMARY KEY,
      api_key_enc TEXT NULL,
      api_key_hint VARCHAR(32) NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  schemaReady = true;
}

export function resolveBlogDir(): string {
  return resolve(process.cwd(), process.env.BSB_BLOG_DIR || "../blog");
}

export function devtoConfigured(): boolean {
  loadBlogLocalEnvIfNeeded();
  return Boolean(process.env.DEVTO_API_KEY?.trim());
}

export async function getDevtoSettings(db: Pool): Promise<{ configured: boolean; hint: string; updatedAt: string | null }> {
  await ensureSocialPublishingSchema(db);
  const envKey = process.env.DEVTO_API_KEY?.trim();
  if (envKey) {
    return { configured: true, hint: hintForSecret(envKey), updatedAt: null };
  }
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint, updated_at FROM social_platform_settings WHERE platform = 'devto' LIMIT 1`
  );
  const row = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null; updated_at: Date | string | null }>)[0];
  return {
    configured: Boolean(row?.api_key_enc),
    hint: row?.api_key_hint ?? "",
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function saveDevtoApiKey(db: Pool, apiKey: string): Promise<{ configured: boolean; hint: string }> {
  await ensureSocialPublishingSchema(db);
  const key = apiKey.trim();
  if (!key) throw new Error("API key cannot be empty.");
  const enc = encryptSecret(key);
  const hint = hintForSecret(key);
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint)
     VALUES ('devto', ?, ?)
     ON DUPLICATE KEY UPDATE api_key_enc = VALUES(api_key_enc), api_key_hint = VALUES(api_key_hint)`,
    [enc, hint]
  );
  return { configured: true, hint };
}

export async function syncDevtoQueue(db: Pool): Promise<{ added: number; updated: number; totalEnglish: number }> {
  await ensureSocialPublishingSchema(db);
  const articles = (await loadBlogArticles()).filter((a) => a.frontmatter.locale === "en");
  let added = 0;
  let updated = 0;

  for (const article of articles) {
    const publishedAt = String(article.frontmatter.publishedAt ?? "");
    const queueOrder = queueOrderFromPublishedAt(publishedAt, article.slug);
    const canonicalUrl = canonicalUrlFor(article.slug);
    const trackingUrl = trackingUrlFor(article.slug);
    const tags = sanitizeTags(article.frontmatter.tags);
    const [result] = await db.query(
      `INSERT INTO social_publish_items
         (platform, source_slug, source_locale, source_path, title, description, canonical_url, tracking_url, tags_json, status, queue_order)
       VALUES ('devto', ?, 'en', ?, ?, ?, ?, ?, ?, 'queued', ?)
       ON DUPLICATE KEY UPDATE
         source_path = VALUES(source_path),
         title = VALUES(title),
         description = VALUES(description),
         canonical_url = VALUES(canonical_url),
         tracking_url = VALUES(tracking_url),
         tags_json = VALUES(tags_json),
         queue_order = CASE WHEN status = 'queued' THEN VALUES(queue_order) ELSE queue_order END`,
      [
        article.slug,
        article.path,
        String(article.frontmatter.title ?? article.slug).slice(0, 512),
        String(article.frontmatter.description ?? "").slice(0, 2000),
        canonicalUrl,
        trackingUrl,
        JSON.stringify(tags),
        queueOrder
      ]
    );
    const info = result as { affectedRows?: number; changedRows?: number };
    if (info.affectedRows === 1) added += 1;
    else if ((info.changedRows ?? 0) > 0) updated += 1;
  }

  await importLegacyDevtoState(db);

  return { added, updated, totalEnglish: articles.length };
}

export async function listDevtoItems(db: Pool): Promise<SocialPublishItem[]> {
  await ensureSocialPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT s.*,
            COALESCE(v.visit_count, 0) AS main_visit_count,
            COALESCE(v.unique_ip_count, 0) AS unique_ip_count,
            COALESCE(r.registration_count, 0) AS registration_count,
            COALESCE(p.paid_conversion_count, 0) AS paid_conversion_count,
            COALESCE(p.paid_amount_cents, 0) AS paid_amount_cents
       FROM social_publish_items s
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS visit_count,
                COUNT(DISTINCT CASE WHEN ip IS NOT NULL AND ip != '' THEN ip END) AS unique_ip_count
           FROM site_visit_events
          WHERE utm_source = 'devto'
          GROUP BY utm_campaign
       ) v ON v.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS registration_count
           FROM marketing_user_attributions
          WHERE utm_source = 'devto'
          GROUP BY utm_campaign
       ) r ON r.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS paid_conversion_count, COALESCE(SUM(amount_cents), 0) AS paid_amount_cents
           FROM marketing_pay_attributions
          WHERE utm_source = 'devto' AND amount_cents > 0
          GROUP BY utm_campaign
       ) p ON p.utm_campaign = s.source_slug
      WHERE s.platform = 'devto'
      ORDER BY
        CASE s.status WHEN 'queued' THEN 0 WHEN 'failed' THEN 1 WHEN 'published' THEN 2 ELSE 3 END,
        s.queue_order ASC,
        s.id ASC`
  );
  return attachEstimatedPublishTimes((rows as any[]).map(mapItemRow));
}

export async function moveDevtoItem(db: Pool, id: number, direction: "up" | "down"): Promise<void> {
  await ensureSocialPublishingSchema(db);
  const items = (await listDevtoItems(db)).filter((x) => x.status === "queued");
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx]!;
  const b = items[swapIdx]!;
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [b.queueOrder, a.id]);
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [a.queueOrder, b.id]);
}

export async function publishNextDevto(db: Pool): Promise<{ item: SocialPublishItem | null; message: string }> {
  await syncDevtoQueue(db);
  loadBlogLocalEnvIfNeeded();
  const apiKey = await getDevtoApiKey(db);
  if (!apiKey) throw new Error("Missing DEVTO_API_KEY in backend environment.");

  const [rows] = await db.query(
    `SELECT * FROM social_publish_items
      WHERE platform = 'devto' AND status IN ('queued', 'failed')
      ORDER BY queue_order ASC, id ASC
      LIMIT 1`
  );
  const row = (rows as any[])[0];
  if (!row) return { item: null, message: "No queued dev.to articles." };

  const article = await loadBlogArticleBySlug(String(row.source_slug));
  if (!article) {
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [
      "Source markdown file not found.",
      row.id
    ]);
    throw new Error("Source markdown file not found.");
  }

  const payload = buildDevtoPayload(article);
  const response = await fetch(process.env.DEVTO_API_URL || "https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = typeof body === "string" ? body : JSON.stringify(body);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [
      message.slice(0, 4000),
      row.id
    ]);
    throw new Error(`dev.to publish failed: ${response.status} ${message.slice(0, 500)}`);
  }

  await db.query(
    `UPDATE social_publish_items
        SET status = 'published',
            published_at = NOW(),
            platform_article_id = ?,
            platform_url = ?,
            devto_page_views = ?,
            devto_public_reactions = ?,
            devto_comments_count = ?,
            devto_positive_reactions = ?,
            devto_reading_time_minutes = ?,
            last_stats_synced_at = NOW(),
            last_error = NULL
      WHERE id = ?`,
    [
      String(body?.id ?? ""),
      String(body?.url ?? ""),
      numberFrom(body?.page_views_count),
      numberFrom(body?.public_reactions_count),
      numberFrom(body?.comments_count),
      numberFrom(body?.positive_reactions_count),
      numberFrom(body?.reading_time_minutes),
      row.id
    ]
  );

  const items = await listDevtoItems(db);
  return { item: items.find((x) => x.id === Number(row.id)) ?? null, message: "Published." };
}

export async function syncDevtoStats(db: Pool): Promise<{ updated: number }> {
  await ensureSocialPublishingSchema(db);
  loadBlogLocalEnvIfNeeded();
  const apiKey = await getDevtoApiKey(db);
  if (!apiKey) throw new Error("Missing DEVTO_API_KEY in backend environment.");

  const devtoArticles = await fetchAllDevtoArticles(apiKey);
  let updated = 0;
  for (const article of devtoArticles) {
    const canonical = String(article?.canonical_url ?? "");
    const id = String(article?.id ?? "");
    if (!id && !canonical) continue;
    const slug = canonical.match(/\/en\/([^/?#]+)/)?.[1] ?? "";
    const params = [
      id,
      String(article?.url ?? ""),
      numberFrom(article?.page_views_count),
      numberFrom(article?.public_reactions_count),
      numberFrom(article?.comments_count),
      numberFrom(article?.positive_reactions_count),
      numberFrom(article?.reading_time_minutes)
    ];
    if (slug) {
      const [result] = await db.query(
        `UPDATE social_publish_items
            SET status = 'published',
                published_at = COALESCE(published_at, ?),
                platform_article_id = COALESCE(NULLIF(?, ''), platform_article_id),
                platform_url = COALESCE(NULLIF(?, ''), platform_url),
                devto_page_views = ?,
                devto_public_reactions = ?,
                devto_comments_count = ?,
                devto_positive_reactions = ?,
                devto_reading_time_minutes = ?,
                last_stats_synced_at = NOW()
          WHERE platform = 'devto' AND source_slug = ?`,
        [devtoPublishedAt(article), ...params, slug]
      );
      if (((result as any).affectedRows ?? 0) > 0) updated += 1;
    }
  }
  return { updated };
}

async function fetchAllDevtoArticles(apiKey: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://dev.to/api/articles/me/all");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const resp = await fetch(url, {
      headers: {
        "api-key": apiKey,
        "accept": "application/vnd.forem.api-v1+json"
      }
    });
    if (!resp.ok) throw new Error(`dev.to stats sync failed: ${resp.status}`);
    const rows = (await resp.json()) as any[];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

function buildDevtoPayload(article: BlogArticle) {
  const slug = article.slug;
  const canonicalUrl = canonicalUrlFor(slug);
  const trackingUrl = trackingUrlFor(slug);
  const body = rewriteBodyLinksForDevto(article.body, slug);
  return {
    article: {
      title: String(article.frontmatter.title ?? slug),
      published: true,
      body_markdown: `${body.trim()}\n\n---\n\nOriginally published at [BigSocialBoss Email Insights](${trackingUrl}).\n`,
      canonical_url: canonicalUrl,
      description: String(article.frontmatter.description ?? ""),
      tags: sanitizeTags(article.frontmatter.tags)
    }
  };
}

function rewriteBodyLinksForDevto(body: string, slug: string): string {
  return body
    .replaceAll("utm_source=blog", "utm_source=devto")
    .replaceAll("utm_medium=article", "utm_medium=social")
    .replaceAll(`utm_campaign=${slug}`, `utm_campaign=${slug}`);
}

async function loadBlogArticleBySlug(slug: string): Promise<BlogArticle | null> {
  const path = resolve(resolveBlogDir(), "src/content/articles", `${slug}.md`);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const { frontmatter, body } = parseMarkdown(raw);
  return { slug, path, frontmatter, body };
}

async function loadBlogArticles(): Promise<BlogArticle[]> {
  const articlesDir = resolve(resolveBlogDir(), "src/content/articles");
  const filenames = (await readdir(articlesDir)).filter((name) => name.endsWith(".md"));
  const articles: BlogArticle[] = [];
  for (const filename of filenames) {
    const path = resolve(articlesDir, filename);
    const raw = await readFile(path, "utf8");
    const { frontmatter, body } = parseMarkdown(raw);
    articles.push({ slug: filename.replace(/\.md$/, ""), path, frontmatter, body });
  }
  return articles;
}

async function importLegacyDevtoState(db: Pool): Promise<void> {
  const legacyPath = resolve(resolveBlogDir(), "scripts/.devto-published.json");
  if (!existsSync(legacyPath)) return;
  try {
    const raw = await readFile(legacyPath, "utf8");
    const legacy = JSON.parse(raw) as {
      published?: Record<string, { articleId?: number | string; url?: string; canonicalUrl?: string; createdAt?: string }>;
    };
    for (const [slug, item] of Object.entries(legacy.published ?? {})) {
      await db.query(
        `UPDATE social_publish_items
            SET status = 'published',
                published_at = COALESCE(published_at, ?),
                platform_article_id = COALESCE(platform_article_id, ?),
                platform_url = COALESCE(platform_url, ?),
                canonical_url = COALESCE(NULLIF(canonical_url, ''), ?),
                last_error = NULL
          WHERE platform = 'devto' AND source_slug = ? AND status != 'published'`,
        [
          item.createdAt ? new Date(item.createdAt) : new Date(),
          item.articleId == null ? null : String(item.articleId),
          item.url ?? null,
          item.canonicalUrl ?? canonicalUrlFor(slug),
          slug
        ]
      );
    }
  } catch {
    /* ignore legacy import errors */
  }
}

function parseMarkdown(raw: string): { frontmatter: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Article is missing frontmatter");
  return { frontmatter: parseFrontmatter(match[1]!), body: match[2] ?? "" };
}

function parseFrontmatter(source: string): Record<string, any> {
  const data: Record<string, any> = {};
  const lines = source.split("\n");
  let currentArrayKey: string | null = null;
  for (const line of lines) {
    const arrayItem = line.match(/^\s*-\s*(.*)$/);
    if (arrayItem && currentArrayKey) {
      data[currentArrayKey].push(parseScalar(arrayItem[1] ?? ""));
      continue;
    }
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValue) {
      currentArrayKey = null;
      continue;
    }
    const [, key, rawValue = ""] = keyValue;
    if (rawValue === "") {
      data[key] = [];
      currentArrayKey = key;
      continue;
    }
    data[key] = parseScalar(rawValue);
    currentArrayKey = null;
  }
  return data;
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sanitizeTags(tags: unknown): string[] {
  const fallback = ["emailmarketing", "selfhosted", "marketing", "saas"];
  const raw = Array.isArray(tags) ? tags : fallback;
  const cleaned = raw
    .map((tag) => String(tag).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return [...new Set(cleaned.length > 0 ? cleaned : fallback)].slice(0, 4);
}

function siteOrigin(): string {
  loadBlogLocalEnvIfNeeded();
  return (process.env.BLOG_SITE_ORIGIN || "https://www.bigsocialboss.top").replace(/\/$/, "");
}

function canonicalUrlFor(slug: string): string {
  return `${siteOrigin()}/en/${slug}`;
}

function trackingUrlFor(slug: string): string {
  const url = new URL(canonicalUrlFor(slug));
  url.searchParams.set("utm_source", "devto");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", slug);
  url.searchParams.set("utm_content", "en");
  return url.toString();
}

function queueOrderFromPublishedAt(publishedAt: string, slug: string): number {
  const normalized = publishedAt.replace(/-/g, "");
  const base = /^\d{8}$/.test(normalized) ? Number(normalized) * 1000 : 99991231000;
  let hash = 0;
  for (const ch of slug) hash = (hash + ch.charCodeAt(0)) % 997;
  return base + hash;
}

function devtoPublishedAt(article: any): Date {
  const raw = article?.published_at || article?.created_at || article?.edited_at;
  const d = raw ? new Date(String(raw)) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function attachEstimatedPublishTimes(items: SocialPublishItem[]): SocialPublishItem[] {
  const queued = items.filter((item) => item.status === "queued");
  const first = nextBeijingSlot();
  queued.forEach((item, index) => {
    const d = new Date(first.getTime() + index * 24 * 60 * 60 * 1000);
    item.estimatedPublishAt = d.toISOString();
  });
  return items;
}

function nextBeijingSlot(): Date {
  const hour = Math.max(0, Math.min(23, Number(process.env.SOCIAL_PUBLISH_DAILY_HOUR || 9)));
  const minute = Math.max(0, Math.min(59, Number(process.env.SOCIAL_PUBLISH_DAILY_MINUTE || 0)));
  const now = new Date();
  const beijingNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const slotBeijing = new Date(beijingNow);
  slotBeijing.setHours(hour, minute, 0, 0);
  if (slotBeijing.getTime() <= beijingNow.getTime()) {
    slotBeijing.setDate(slotBeijing.getDate() + 1);
  }
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(slotBeijing.getTime() - offsetMs);
}

function numberFrom(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

async function getDevtoApiKey(db: Pool): Promise<string> {
  const envKey = process.env.DEVTO_API_KEY?.trim();
  if (envKey) return envKey;
  await ensureSocialPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT api_key_enc FROM social_platform_settings WHERE platform = 'devto' LIMIT 1`
  );
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  if (!enc) return "";
  return decryptSecret(enc).trim();
}

function hintForSecret(secret: string): string {
  const clean = secret.trim();
  if (clean.length <= 8) return "已保存";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function loadBlogLocalEnvIfNeeded(): void {
  if (localEnvLoaded) return;
  localEnvLoaded = true;
  for (const path of [resolve(resolveBlogDir(), ".env.local"), resolve(resolveBlogDir(), ".env")]) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (!key || process.env[key] !== undefined) continue;
        process.env[key] = (rawValue ?? "").replace(/^["']|["']$/g, "");
      }
    } catch {
      /* ignore local env read errors */
    }
  }
}

function mapItemRow(row: any): SocialPublishItem {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags_json || "[]");
  } catch {
    tags = [];
  }
  return {
    id: Number(row.id),
    platform: "devto",
    sourceSlug: String(row.source_slug ?? ""),
    sourceLocale: String(row.source_locale ?? "en"),
    sourcePath: String(row.source_path ?? ""),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    canonicalUrl: String(row.canonical_url ?? ""),
    trackingUrl: String(row.tracking_url ?? ""),
    tags,
    status: String(row.status ?? "queued") as SocialPublishStatus,
    queueOrder: Number(row.queue_order ?? 0),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    platformArticleId: row.platform_article_id == null ? null : String(row.platform_article_id),
    platformUrl: row.platform_url == null ? null : String(row.platform_url),
    devtoPageViews: Number(row.devto_page_views ?? 0),
    devtoPublicReactions: Number(row.devto_public_reactions ?? 0),
    devtoCommentsCount: Number(row.devto_comments_count ?? 0),
    devtoPositiveReactions: Number(row.devto_positive_reactions ?? 0),
    devtoReadingTimeMinutes: Number(row.devto_reading_time_minutes ?? 0),
    lastStatsSyncedAt: row.last_stats_synced_at ? new Date(row.last_stats_synced_at).toISOString() : null,
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    estimatedPublishAt: null,
    mainVisitCount: Number(row.main_visit_count ?? 0),
    uniqueIpCount: Number(row.unique_ip_count ?? 0),
    registrationCount: Number(row.registration_count ?? 0),
    paidConversionCount: Number(row.paid_conversion_count ?? 0),
    paidAmountCents: Number(row.paid_amount_cents ?? 0)
  };
}
