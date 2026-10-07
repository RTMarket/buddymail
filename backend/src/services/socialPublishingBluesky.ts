import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { blueskyShortLinkFor } from "./socialPublishingGo.js";

export type SocialPublishStatus = "queued" | "published" | "failed" | "skipped";

export type BlueskyPublishItem = {
  id: number;
  platform: "bluesky";
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
  segmentIndex: number;
  segmentTotal: number;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  platformArticleId: string | null;
  platformUrl: string | null;
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
  frontmatter: Record<string, unknown>;
  body: string;
};

type BlueskySession = {
  accessJwt: string;
  did: string;
  handle: string;
};

const BLUESKY_MAX_POST_LENGTH = 300;
const BLUESKY_SEGMENTS_MIN = 3;
const BLUESKY_SEGMENTS_MAX = 5;
const BLUESKY_WINDOW_START_HOUR = 10;
const BLUESKY_WINDOW_START_MINUTE = 30;
const BLUESKY_WINDOW_END_HOUR = 16;
const BLUESKY_WINDOW_END_MINUTE = 0;
const DEFAULT_PDS_URL = "https://bsky.social";

type BlueskySegmentPlan = {
  hook: string;
  bullets: string[];
};

let schemaReady = false;
let localEnvLoaded = false;

export async function ensureBlueskyPublishingSchema(db: Pool): Promise<void> {
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
      instance_url VARCHAR(512) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db
    .query(`ALTER TABLE social_platform_settings ADD COLUMN instance_url VARCHAR(512) NULL AFTER api_key_hint`)
    .catch(() => {});
  await db
    .query(`ALTER TABLE social_publish_items ADD COLUMN segment_index INT NOT NULL DEFAULT 0 AFTER queue_order`)
    .catch(() => {});
  await db
    .query(`ALTER TABLE social_publish_items ADD COLUMN segment_total INT NOT NULL DEFAULT 1 AFTER segment_index`)
    .catch(() => {});
  await db
    .query(`ALTER TABLE social_publish_items ADD COLUMN scheduled_publish_at DATETIME NULL AFTER published_at`)
    .catch(() => {});
  await db.query(`ALTER TABLE social_publish_items DROP INDEX uniq_social_platform_source`).catch(() => {});
  await db
    .query(
      `ALTER TABLE social_publish_items ADD UNIQUE KEY uniq_social_platform_source_seg (platform, source_slug, segment_index)`
    )
    .catch(() => {});
  await db
    .query(
      `ALTER TABLE social_publish_items ADD KEY idx_social_platform_scheduled (platform, status, scheduled_publish_at, segment_index)`
    )
    .catch(() => {});
  schemaReady = true;
}

export function blueskyConfigured(): boolean {
  loadBlogLocalEnvIfNeeded();
  return Boolean(process.env.BLUESKY_APP_PASSWORD?.trim() && normalizeHandle(process.env.BLUESKY_HANDLE));
}

export async function getBlueskySettings(
  db: Pool
): Promise<{ configured: boolean; hint: string; handle: string; updatedAt: string | null }> {
  await ensureBlueskyPublishingSchema(db);
  loadBlogLocalEnvIfNeeded();
  const envPassword = process.env.BLUESKY_APP_PASSWORD?.trim();
  const envHandle = normalizeHandle(process.env.BLUESKY_HANDLE);
  if (envPassword && envHandle) {
    return { configured: true, hint: hintForSecret(envPassword), handle: envHandle, updatedAt: null };
  }
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint, instance_url, updated_at
       FROM social_platform_settings
      WHERE platform = 'bluesky'
      LIMIT 1`
  );
  const row = (
    rows as Array<{
      api_key_enc: string | null;
      api_key_hint: string | null;
      instance_url: string | null;
      updated_at: Date | string | null;
    }>
  )[0];
  return {
    configured: Boolean(row?.api_key_enc),
    hint: row?.api_key_hint ?? "",
    handle: normalizeHandle(row?.instance_url) || "",
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function saveBlueskySettings(
  db: Pool,
  handle: string,
  appPassword?: string
): Promise<{ configured: boolean; hint: string; handle: string }> {
  await ensureBlueskyPublishingSchema(db);
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) throw new Error("Bluesky handle cannot be empty.");

  const password = appPassword?.trim() ?? "";
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint FROM social_platform_settings WHERE platform = 'bluesky' LIMIT 1`
  );
  const existing = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null }>)[0];
  if (!password) {
    if (!existing?.api_key_enc) throw new Error("App password cannot be empty.");
    await db.query(`UPDATE social_platform_settings SET instance_url = ? WHERE platform = 'bluesky'`, [
      normalizedHandle
    ]);
    return { configured: true, hint: existing.api_key_hint ?? "", handle: normalizedHandle };
  }

  const enc = encryptSecret(password);
  const hint = hintForSecret(password);
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint, instance_url)
     VALUES ('bluesky', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       api_key_enc = VALUES(api_key_enc),
       api_key_hint = VALUES(api_key_hint),
       instance_url = VALUES(instance_url)`,
    [enc, hint, normalizedHandle]
  );
  return { configured: true, hint, handle: normalizedHandle };
}

export async function syncBlueskyQueue(db: Pool): Promise<{ added: number; updated: number; totalEnglish: number }> {
  await ensureBlueskyPublishingSchema(db);
  const articles = (await loadBlogArticles()).filter((a) => a.frontmatter.locale === "en");
  let added = 0;
  let updated = 0;

  for (const article of articles) {
    const publishedAt = String(article.frontmatter.publishedAt ?? "");
    const queueOrder = queueOrderFromPublishedAt(publishedAt, article.slug);
    const canonicalUrl = canonicalUrlFor(article.slug);
    const tags = sanitizeTags(article.frontmatter.tags);
    const articleTitle = String(article.frontmatter.title ?? article.slug).slice(0, 512);
    const articleDescription = String(article.frontmatter.description ?? "").slice(0, 2000);
    const segments = buildBlueskySegmentPlans(article.body, articleDescription, articleTitle);
    const segmentTotal = segments.length;

    await db.query(
      `DELETE FROM social_publish_items
        WHERE platform = 'bluesky' AND source_slug = ? AND segment_index = 0 AND status = 'queued'`,
      [article.slug]
    );

    for (let i = 0; i < segments.length; i += 1) {
      const segmentIndex = i + 1;
      const segment = segments[i]!;
      const trackingUrl = trackingUrlFor(article.slug, `${article.slug}-seg${segmentIndex}`);
      const [result] = await db.query(
        `INSERT INTO social_publish_items
           (platform, source_slug, source_locale, source_path, title, description, canonical_url, tracking_url, tags_json, status, queue_order, segment_index, segment_total)
         VALUES ('bluesky', ?, 'en', ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           source_path = VALUES(source_path),
           title = VALUES(title),
           description = VALUES(description),
           canonical_url = VALUES(canonical_url),
           tracking_url = VALUES(tracking_url),
           tags_json = VALUES(tags_json),
           segment_total = VALUES(segment_total),
           queue_order = CASE WHEN status = 'queued' THEN VALUES(queue_order) ELSE queue_order END`,
        [
          article.slug,
          article.path,
          articleTitle,
          segment.hook.slice(0, 2000),
          canonicalUrl,
          trackingUrl,
          JSON.stringify(tags),
          queueOrder,
          segmentIndex,
          segmentTotal
        ]
      );
      const info = result as { affectedRows?: number; changedRows?: number };
      if (info.affectedRows === 1) added += 1;
      else if ((info.changedRows ?? 0) > 0) updated += 1;
    }

    await db.query(
      `DELETE FROM social_publish_items
        WHERE platform = 'bluesky' AND source_slug = ? AND segment_index > ? AND status = 'queued'`,
      [article.slug, segmentTotal]
    );
  }

  await ensureBlueskySchedules(db);
  return { added, updated, totalEnglish: articles.length };
}

export async function listBlueskyItems(db: Pool): Promise<BlueskyPublishItem[]> {
  await ensureBlueskyPublishingSchema(db);
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
          WHERE utm_source = 'bluesky'
          GROUP BY utm_campaign
       ) v ON v.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS registration_count
           FROM marketing_user_attributions
          WHERE utm_source = 'bluesky'
          GROUP BY utm_campaign
       ) r ON r.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS paid_conversion_count, COALESCE(SUM(amount_cents), 0) AS paid_amount_cents
           FROM marketing_pay_attributions
          WHERE utm_source = 'bluesky' AND amount_cents > 0
          GROUP BY utm_campaign
       ) p ON p.utm_campaign = s.source_slug
      WHERE s.platform = 'bluesky'
      ORDER BY
        CASE s.status WHEN 'queued' THEN 0 WHEN 'failed' THEN 1 WHEN 'published' THEN 2 ELSE 3 END,
        s.queue_order ASC,
        s.segment_index ASC,
        s.id ASC`
  );
  return attachEstimatedPublishTimes((rows as Record<string, unknown>[]).map(mapItemRow));
}

export async function moveBlueskyItem(db: Pool, id: number, direction: "up" | "down"): Promise<void> {
  await ensureBlueskyPublishingSchema(db);
  const slugOrder = await listQueuedBlueskySlugOrder(db);
  const item = (await listBlueskyItems(db)).find((x) => x.id === id);
  if (!item || item.status !== "queued") return;
  const idx = slugOrder.indexOf(item.sourceSlug);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= slugOrder.length) return;
  const aSlug = slugOrder[idx]!;
  const bSlug = slugOrder[swapIdx]!;
  const items = await listBlueskyItems(db);
  const aOrder = items.find((x) => x.sourceSlug === aSlug)?.queueOrder ?? 0;
  const bOrder = items.find((x) => x.sourceSlug === bSlug)?.queueOrder ?? 0;
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE platform = 'bluesky' AND source_slug = ?`, [
    bOrder,
    aSlug
  ]);
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE platform = 'bluesky' AND source_slug = ?`, [
    aOrder,
    bSlug
  ]);
  await db.query(
    `UPDATE social_publish_items SET scheduled_publish_at = NULL WHERE platform = 'bluesky' AND status = 'queued'`
  );
  await ensureBlueskySchedules(db);
}

export async function publishDueBluesky(db: Pool): Promise<{ item: BlueskyPublishItem | null; message: string }> {
  return publishBlueskySegment(db, { respectSchedule: true });
}

export async function publishNextBluesky(db: Pool): Promise<{ item: BlueskyPublishItem | null; message: string }> {
  return publishBlueskySegment(db, { respectSchedule: false });
}

async function publishBlueskySegment(
  db: Pool,
  options: { respectSchedule: boolean }
): Promise<{ item: BlueskyPublishItem | null; message: string }> {
  await syncBlueskyQueue(db);
  loadBlogLocalEnvIfNeeded();
  const appPassword = await getBlueskyAppPassword(db);
  const handle = await getBlueskyHandle(db);
  if (!appPassword) throw new Error("Missing Bluesky app password.");
  if (!handle) throw new Error("Missing Bluesky handle.");

  const activeSlug = await resolveActiveBlueskySlug(db);
  if (!activeSlug) return { item: null, message: "No queued Bluesky articles." };

  await ensureBlueskySchedules(db, activeSlug);

  const [rows] = await db.query(
    options.respectSchedule
      ? `SELECT * FROM social_publish_items
          WHERE platform = 'bluesky' AND source_slug = ? AND status = 'queued'
            AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= NOW()
          ORDER BY segment_index ASC, id ASC
          LIMIT 1`
      : `SELECT * FROM social_publish_items
          WHERE platform = 'bluesky' AND source_slug = ? AND status = 'queued'
          ORDER BY segment_index ASC, id ASC
          LIMIT 1`,
    [activeSlug]
  );
  const row = (rows as Record<string, unknown>[])[0];
  if (!row) {
    return {
      item: null,
      message: options.respectSchedule
        ? "No Bluesky segment is due yet (10:30–16:00 Beijing, random slots)."
        : "No queued Bluesky segments for the active article."
    };
  }

  const article = await loadBlogArticleBySlug(String(row.source_slug));
  if (!article) {
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [
      "Source markdown file not found.",
      row.id
    ]);
    throw new Error("Source markdown file not found.");
  }

  const itemId = Number(row.id);
  const segmentIndex = Math.max(1, Number(row.segment_index ?? 1));
  const trackingUrl = trackingUrlFor(article.slug, `${article.slug}-seg${segmentIndex}`);
  const plans = buildBlueskySegmentPlans(
    article.body,
    String(article.frontmatter.description ?? ""),
    String(article.frontmatter.title ?? article.slug)
  );
  const plan = plans[segmentIndex - 1] ?? {
    hook: String(row.description ?? article.frontmatter.title ?? article.slug),
    bullets: []
  };
  const postText = buildBlueskySegmentPostText({
    hook: plan.hook,
    bullets: plan.bullets,
    trackingUrl
  });

  try {
    const pdsUrl = resolvePdsUrl();
    const session = await createBlueskySession(handle, appPassword, pdsUrl);
    const record = await createBlueskyPost(session, pdsUrl, postText);
    const platformUrl = blueskyPostUrl(session.handle, record.uri);

    await db.query(
      `UPDATE social_publish_items
          SET status = 'published',
              published_at = NOW(),
              platform_article_id = ?,
              platform_url = ?,
              tracking_url = ?,
              last_error = NULL
        WHERE id = ?`,
      [record.uri, platformUrl, trackingUrl, row.id]
    );
  } catch (e: unknown) {
    const message = String((e as Error)?.message ?? e);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [
      message.slice(0, 4000),
      row.id
    ]);
    throw e;
  }

  const items = await listBlueskyItems(db);
  return { item: items.find((x) => x.id === itemId) ?? null, message: "Published." };
}

export function buildBlueskySegmentPostText(params: {
  hook: string;
  bullets: string[];
  trackingUrl: string;
  maxLength?: number;
}): string {
  const maxLength = params.maxLength ?? BLUESKY_MAX_POST_LENGTH;
  const hook = params.hook.trim();
  const trackingUrl = params.trackingUrl.trim();
  const linkBlock = `\n\n${trackingUrl}`;
  const bulletLines = params.bullets
    .slice(0, 2)
    .map((b) => `• ${shortenPoint(b, 100)}`)
    .filter((line) => line.length > 2);

  for (const useHook of [Boolean(hook), false]) {
    const header = useHook ? `${truncateAtWord(hook, 90)}\n\n` : "";
    for (let count = bulletLines.length; count >= 0; count -= 1) {
      const lines = bulletLines.slice(0, count);
      const points = lines.join("\n");
      const body = points ? `${header}${points}` : header.trim();
      const text = body ? `${body}${linkBlock}` : linkBlock.trim();
      if (text.length <= maxLength) return text;
      const overhead = linkBlock.length + (body ? 2 : 0);
      const budget = maxLength - overhead - header.length;
      if (budget > 0 && lines.length > 0) {
        const trimmed = lines
          .map((line) => truncateAtWord(line.replace(/^•\s*/, ""), Math.max(20, Math.floor(budget / lines.length))))
          .map((line) => `• ${line}`);
        const retry = `${header}${trimmed.join("\n")}${linkBlock}`;
        if (retry.length <= maxLength) return retry;
      }
    }
  }

  return linkBlock.trim().slice(0, maxLength);
}

export function buildBlueskyPostText(params: {
  title: string;
  description: string;
  body: string;
  trackingUrl: string;
  maxLength?: number;
}): string {
  const plans = buildBlueskySegmentPlans(params.body, params.description, params.title);
  const first = plans[0] ?? { hook: params.title, bullets: [params.description].filter(Boolean) };
  return buildBlueskySegmentPostText({
    hook: first.hook,
    bullets: first.bullets,
    trackingUrl: params.trackingUrl,
    maxLength: params.maxLength
  });
}

export function buildBlueskySegmentPlans(
  body: string,
  articleDescription: string,
  articleTitle: string
): BlueskySegmentPlan[] {
  const sections = parseArticleSections(body);
  let plans: BlueskySegmentPlan[] = sections.map((section) => ({
    hook: section.hook,
    bullets: section.bullets.slice(0, 2)
  }));

  if (plans.length === 0 && articleDescription.trim()) {
    plans.push({ hook: articleTitle, bullets: [articleDescription.trim()] });
  }

  while (plans.length < BLUESKY_SEGMENTS_MIN) {
    const filler = sections[plans.length % Math.max(sections.length, 1)];
    if (filler) {
      plans.push({ hook: filler.hook, bullets: filler.bullets.slice(0, 1) });
    } else {
      plans.push({
        hook: articleTitle,
        bullets: [articleDescription.trim() || "Read the full article on our blog."]
      });
    }
  }

  if (plans.length > BLUESKY_SEGMENTS_MAX) {
    plans = plans.slice(0, BLUESKY_SEGMENTS_MAX);
  }

  return plans;
}

function parseArticleSections(body: string): Array<{ hook: string; bullets: string[] }> {
  const sections: Array<{ hook: string; bullets: string[] }> = [];
  let current: { hook: string; bullets: string[] } | null = null;

  for (const line of body.split("\n")) {
    const heading = line.match(/^###\s+\d+\.\s+(.+)$/);
    if (heading?.[1]) {
      if (current) sections.push(current);
      current = { hook: heading[1].trim(), bullets: [] };
      continue;
    }
    if (!current) continue;
    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet?.[1]) continue;
    const text = bullet[1]
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.endsWith(":")) continue;
    current.bullets.push(shortenPoint(text, 120));
    if (current.bullets.length >= 2) {
      sections.push(current);
      current = null;
    }
  }
  if (current && (current.bullets.length > 0 || current.hook)) sections.push(current);
  return sections;
}

async function listQueuedBlueskySlugOrder(db: Pool): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT source_slug, MIN(queue_order) AS queue_order
       FROM social_publish_items
      WHERE platform = 'bluesky' AND status = 'queued'
      GROUP BY source_slug
      ORDER BY queue_order ASC, source_slug ASC`
  );
  return (rows as Array<{ source_slug: string }>).map((row) => String(row.source_slug));
}

async function resolveActiveBlueskySlug(db: Pool): Promise<string | null> {
  const [rows] = await db.query(
    `SELECT source_slug
       FROM social_publish_items
      WHERE platform = 'bluesky' AND status IN ('queued', 'failed')
      GROUP BY source_slug
      ORDER BY MIN(queue_order) ASC, source_slug ASC
      LIMIT 1`
  );
  const row = (rows as Array<{ source_slug: string }>)[0];
  return row ? String(row.source_slug) : null;
}

async function ensureBlueskySchedules(db: Pool, onlySlug?: string): Promise<void> {
  const activeSlug = onlySlug ?? (await resolveActiveBlueskySlug(db));
  if (!activeSlug) return;

  await db.query(
    `UPDATE social_publish_items
        SET scheduled_publish_at = NULL
      WHERE platform = 'bluesky' AND status = 'queued' AND source_slug != ?`,
    [activeSlug]
  );

  const [rows] = await db.query(
    `SELECT id, segment_index, scheduled_publish_at, status
       FROM social_publish_items
      WHERE platform = 'bluesky' AND source_slug = ? AND status = 'queued'
      ORDER BY segment_index ASC`,
    [activeSlug]
  );
  const queued = rows as Array<{
    id: number;
    segment_index: number;
    scheduled_publish_at: Date | string | null;
    status: string;
  }>;
  if (queued.length === 0) return;

  const needSchedule = queued.filter((row) => !row.scheduled_publish_at);
  if (needSchedule.length === 0) return;

  const slots = buildRandomBlueskyScheduleSlots(needSchedule.length, new Date());
  for (let i = 0; i < needSchedule.length; i += 1) {
    const row = needSchedule[i]!;
    const slot = slots[i]!;
    await db.query(`UPDATE social_publish_items SET scheduled_publish_at = ? WHERE id = ?`, [slot, row.id]);
  }
}

function buildRandomBlueskyScheduleSlots(count: number, minTime?: Date): Date[] {
  const day = resolveBlueskyPublishDay();
  const startH = Number(process.env.BLUESKY_WINDOW_START_HOUR ?? BLUESKY_WINDOW_START_HOUR);
  const startM = Number(process.env.BLUESKY_WINDOW_START_MINUTE ?? BLUESKY_WINDOW_START_MINUTE);
  const endH = Number(process.env.BLUESKY_WINDOW_END_HOUR ?? BLUESKY_WINDOW_END_HOUR);
  const endM = Number(process.env.BLUESKY_WINDOW_END_MINUTE ?? BLUESKY_WINDOW_END_MINUTE);
  const start = beijingTimeOnDay(day, startH, startM);
  const end = beijingTimeOnDay(day, endH, endM);
  const startMs = Math.max(start.getTime(), minTime?.getTime() ?? start.getTime());
  const endMs = end.getTime();
  if (startMs >= endMs) {
    return Array.from({ length: count }, () => new Date(endMs));
  }
  const windowMs = endMs - startMs;
  const bucketMs = windowMs / Math.max(count, 1);
  const slots: Date[] = [];

  for (let i = 0; i < count; i += 1) {
    const bucketStart = startMs + i * bucketMs;
    const bucketEnd = i === count - 1 ? endMs : startMs + (i + 1) * bucketMs;
    const offset = Math.floor(Math.random() * Math.max(bucketEnd - bucketStart - 1, 1));
    slots.push(new Date(bucketStart + offset));
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

function resolveBlueskyPublishDay(): Date {
  const now = new Date();
  const beijingNow = getBeijingDateParts(now);
  const endMinutes = BLUESKY_WINDOW_END_HOUR * 60 + BLUESKY_WINDOW_END_MINUTE;
  const nowMinutes = beijingNow.hour * 60 + beijingNow.minute;
  const day = new Date(beijingNow.year, beijingNow.month - 1, beijingNow.day);
  if (nowMinutes >= endMinutes) {
    day.setDate(day.getDate() + 1);
  }
  return day;
}

function beijingTimeOnDay(day: Date, hour: number, minute: number): Date {
  const parts = getBeijingDateParts(day);
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, minute, 0, 0);
  return new Date(utcMs);
}

function getBeijingDateParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute")
  };
}

function shortenPoint(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return truncateAtWord(clean, maxLength);
}

async function createBlueskySession(
  handle: string,
  appPassword: string,
  pdsUrl: string
): Promise<BlueskySession> {
  const response = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword })
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Bluesky session failed: ${response.status} ${message.slice(0, 500)}`);
  }
  const session = body as BlueskySession;
  if (!session.accessJwt || !session.did) {
    throw new Error("Bluesky session response missing accessJwt or did.");
  }
  return session;
}

async function createBlueskyPost(
  session: BlueskySession,
  pdsUrl: string,
  text: string
): Promise<{ uri: string; cid: string }> {
  const createdAt = new Date().toISOString().replace("+00:00", "Z");
  const response = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt
      }
    })
  });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Bluesky publish failed: ${response.status} ${message.slice(0, 500)}`);
  }
  const parsed = body as { uri?: string; cid?: string };
  if (!parsed.uri) throw new Error("Bluesky publish response missing uri.");
  return { uri: parsed.uri, cid: String(parsed.cid ?? "") };
}

function blueskyPostUrl(handle: string, uri: string): string {
  const rkey = uri.split("/").pop() ?? "";
  const normalizedHandle = normalizeHandle(handle);
  return `https://bsky.app/profile/${encodeURIComponent(normalizedHandle)}/post/${encodeURIComponent(rkey)}`;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) return `${sliced.slice(0, lastSpace)}…`;
  return `${sliced}…`;
}

function normalizeHandle(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "");
}

function resolvePdsUrl(): string {
  loadBlogLocalEnvIfNeeded();
  const raw = process.env.BLUESKY_PDS_URL?.trim() || DEFAULT_PDS_URL;
  return raw.replace(/\/$/, "");
}

function resolveBlogDir(): string {
  return resolve(process.cwd(), process.env.BSB_BLOG_DIR || "../blog");
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

function parseMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Article is missing frontmatter");
  return { frontmatter: parseFrontmatter(match[1]!), body: match[2] ?? "" };
}

function parseFrontmatter(source: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lines = source.split("\n");
  let currentArrayKey: string | null = null;
  for (const line of lines) {
    const arrayItem = line.match(/^\s*-\s*(.*)$/);
    if (arrayItem && currentArrayKey) {
      const arr = data[currentArrayKey];
      if (Array.isArray(arr)) arr.push(parseScalar(arrayItem[1] ?? ""));
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
  return (process.env.BLOG_SITE_ORIGIN || "").replace(/\/$/, "");
}

function canonicalUrlFor(slug: string): string {
  return `${siteOrigin()}/en/${slug}`;
}

function trackingUrlFor(slug: string, contentId: string | number): string {
  const match = String(contentId).match(/-seg(\d+)$/i);
  const segmentIndex = match ? Number(match[1]) : Number(contentId);
  if (Number.isFinite(segmentIndex) && segmentIndex > 0) {
    return blueskyShortLinkFor(slug, segmentIndex);
  }
  return blueskyShortLinkFor(slug, 1);
}

function queueOrderFromPublishedAt(publishedAt: string, slug: string): number {
  const normalized = publishedAt.replace(/-/g, "");
  const base = /^\d{8}$/.test(normalized) ? Number(normalized) * 1000 : 99991231000;
  let hash = 0;
  for (const ch of slug) hash = (hash + ch.charCodeAt(0)) % 997;
  return base + hash;
}

async function getBlueskyAppPassword(db: Pool): Promise<string> {
  const envPassword = process.env.BLUESKY_APP_PASSWORD?.trim();
  if (envPassword) return envPassword;
  await ensureBlueskyPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT api_key_enc FROM social_platform_settings WHERE platform = 'bluesky' LIMIT 1`
  );
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  if (!enc) return "";
  return decryptSecret(enc).trim();
}

async function getBlueskyHandle(db: Pool): Promise<string> {
  loadBlogLocalEnvIfNeeded();
  const envHandle = normalizeHandle(process.env.BLUESKY_HANDLE);
  if (envHandle) return envHandle;
  await ensureBlueskyPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT instance_url FROM social_platform_settings WHERE platform = 'bluesky' LIMIT 1`
  );
  return normalizeHandle((rows as Array<{ instance_url: string | null }>)[0]?.instance_url);
}

function attachEstimatedPublishTimes(items: BlueskyPublishItem[]): BlueskyPublishItem[] {
  return items.map((item) => ({
    ...item,
    estimatedPublishAt:
      item.scheduledPublishAt ??
      (item.status === "queued" ? null : item.publishedAt)
  }));
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

function mapItemRow(row: Record<string, unknown>): BlueskyPublishItem {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.tags_json || "[]"));
  } catch {
    tags = [];
  }
  return {
    id: Number(row.id),
    platform: "bluesky",
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
    segmentIndex: Number(row.segment_index ?? 0),
    segmentTotal: Number(row.segment_total ?? 1),
    scheduledPublishAt: row.scheduled_publish_at
      ? new Date(String(row.scheduled_publish_at)).toISOString()
      : null,
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
    platformArticleId: row.platform_article_id == null ? null : String(row.platform_article_id),
    platformUrl: row.platform_url == null ? null : String(row.platform_url),
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    estimatedPublishAt: null,
    mainVisitCount: Number(row.main_visit_count ?? 0),
    uniqueIpCount: Number(row.unique_ip_count ?? 0),
    registrationCount: Number(row.registration_count ?? 0),
    paidConversionCount: Number(row.paid_conversion_count ?? 0),
    paidAmountCents: Number(row.paid_amount_cents ?? 0)
  };
}
