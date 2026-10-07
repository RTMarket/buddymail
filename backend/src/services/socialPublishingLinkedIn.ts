import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import {
  buildMemberArticlePost,
  buildMemberHashtags,
  linkedInMemberSlotForQueueIndex,
  pickMemberKeyPoints
} from "../lib/linkedinMemberPostCopy.js";
import type { SocialPublishStatus } from "./socialPublishingDevto.js";

export type LinkedInPublishItem = {
  id: number;
  platform: "linkedin";
  sourceSlug: string;
  title: string;
  description: string | null;
  canonicalUrl: string;
  trackingUrl: string;
  tags: string[];
  status: SocialPublishStatus;
  queueOrder: number;
  segmentIndex: number;
  segmentTotal: number;
  publishedAt: string | null;
  platformArticleId: string | null;
  platformUrl: string | null;
  lastError: string | null;
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

type LinkedInConfig = {
  organizationUrn: string;
  memberUrn: string;
  defaultCoverImageUrl: string;
};

const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202606";
const DEFAULT_COVER_PATH = "/research/research-cover-alt.jpg";
const LINKEDIN_PAGE_PLATFORM = "linkedin";
const LINKEDIN_MEMBER_PLATFORM = "linkedin_member";
let schemaReady = false;

export async function ensureLinkedInPublishingSchema(db: Pool): Promise<void> {
  if (schemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS social_platform_settings (
      platform VARCHAR(32) PRIMARY KEY,
      api_key_enc TEXT NULL,
      api_key_hint VARCHAR(32) NOT NULL DEFAULT '',
      instance_url VARCHAR(512) NULL,
      config_json TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`ALTER TABLE social_platform_settings ADD COLUMN config_json TEXT NULL AFTER instance_url`).catch(() => {});
  await db.query(`ALTER TABLE social_publish_items MODIFY COLUMN queue_order BIGINT NOT NULL DEFAULT 0`).catch(() => {});
  await db
    .query(`ALTER TABLE social_publish_items ADD COLUMN segment_index INT NOT NULL DEFAULT 0 AFTER queue_order`)
    .catch(() => {});
  await db
    .query(`ALTER TABLE social_publish_items ADD COLUMN segment_total INT NOT NULL DEFAULT 1 AFTER segment_index`)
    .catch(() => {});
  await db.query(`ALTER TABLE social_publish_items DROP INDEX uniq_social_platform_source`).catch(() => {});
  await db
    .query(
      `ALTER TABLE social_publish_items ADD UNIQUE KEY uniq_social_platform_source_seg (platform, source_slug, segment_index)`
    )
    .catch(() => {});
  schemaReady = true;
}

export async function getLinkedInSettings(
  db: Pool
): Promise<{ configured: boolean; hint: string; organizationUrn: string; defaultCoverImageUrl: string; updatedAt: string | null }> {
  await ensureLinkedInPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint, config_json, updated_at
       FROM social_platform_settings
      WHERE platform = 'linkedin'
      LIMIT 1`
  );
  const row = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null; config_json: string | null; updated_at: Date | string | null }>)[0];
  const cfg = parseConfig(row?.config_json);
  return {
    configured: Boolean(row?.api_key_enc && cfg.organizationUrn),
    hint: row?.api_key_hint ?? "",
    organizationUrn: cfg.organizationUrn,
    defaultCoverImageUrl: cfg.defaultCoverImageUrl || `${siteOrigin()}${DEFAULT_COVER_PATH}`,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function getLinkedInMemberSettings(
  db: Pool
): Promise<{ configured: boolean; hint: string; memberUrn: string; defaultCoverImageUrl: string; updatedAt: string | null }> {
  await ensureLinkedInPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint, config_json, updated_at
       FROM social_platform_settings
      WHERE platform = 'linkedin_member'
      LIMIT 1`
  );
  const row = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null; config_json: string | null; updated_at: Date | string | null }>)[0];
  const cfg = parseConfig(row?.config_json);
  return {
    configured: Boolean(row?.api_key_enc && cfg.memberUrn),
    hint: row?.api_key_hint ?? "",
    memberUrn: cfg.memberUrn,
    defaultCoverImageUrl: cfg.defaultCoverImageUrl || `${siteOrigin()}${DEFAULT_COVER_PATH}`,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function saveLinkedInSettings(
  db: Pool,
  input: { accessToken?: string; organizationUrn: string; defaultCoverImageUrl: string }
): Promise<{ configured: boolean; hint: string; organizationUrn: string; defaultCoverImageUrl: string }> {
  await ensureLinkedInPublishingSchema(db);
  const organizationUrn = normalizeOrganizationUrn(input.organizationUrn);
  if (!organizationUrn) throw new Error("LinkedIn Organization URN is required, e.g. urn:li:organization:123456.");
  const defaultCoverImageUrl = normalizeUrl(input.defaultCoverImageUrl) || `${siteOrigin()}${DEFAULT_COVER_PATH}`;
  const token = input.accessToken?.trim() ?? "";
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint FROM social_platform_settings WHERE platform = 'linkedin' LIMIT 1`
  );
  const existing = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null }>)[0];
  if (!token && !existing?.api_key_enc) throw new Error("LinkedIn access token is required.");

  const enc = token ? encryptSecret(token) : existing!.api_key_enc;
  const hint = token ? hintForSecret(token) : existing?.api_key_hint ?? "";
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint, config_json)
     VALUES ('linkedin', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       api_key_enc = VALUES(api_key_enc),
       api_key_hint = VALUES(api_key_hint),
       config_json = VALUES(config_json)`,
    [enc, hint, JSON.stringify({ organizationUrn, defaultCoverImageUrl })]
  );
  return { configured: true, hint, organizationUrn, defaultCoverImageUrl };
}

export async function saveLinkedInMemberSettings(
  db: Pool,
  input: { accessToken?: string; memberUrn: string; defaultCoverImageUrl: string }
): Promise<{ configured: boolean; hint: string; memberUrn: string; defaultCoverImageUrl: string }> {
  await ensureLinkedInPublishingSchema(db);
  const defaultCoverImageUrl = normalizeUrl(input.defaultCoverImageUrl) || `${siteOrigin()}${DEFAULT_COVER_PATH}`;
  const token = input.accessToken?.trim() ?? "";
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint FROM social_platform_settings WHERE platform = 'linkedin_member' LIMIT 1`
  );
  const existing = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null }>)[0];
  if (!token && !existing?.api_key_enc) throw new Error("LinkedIn member access token is required.");
  const effectiveToken = token || decryptSecret(existing!.api_key_enc!).trim();
  const memberUrn = normalizeMemberUrn(input.memberUrn) || (await detectLinkedInMemberUrnFromToken(effectiveToken)).memberUrn;
  if (!memberUrn) throw new Error("LinkedIn Member URN could not be detected from this token.");

  const enc = token ? encryptSecret(token) : existing!.api_key_enc;
  const hint = token ? hintForSecret(token) : existing?.api_key_hint ?? "";
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint, config_json)
     VALUES ('linkedin_member', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       api_key_enc = VALUES(api_key_enc),
       api_key_hint = VALUES(api_key_hint),
       config_json = VALUES(config_json)`,
    [enc, hint, JSON.stringify({ memberUrn, defaultCoverImageUrl })]
  );
  return { configured: true, hint, memberUrn, defaultCoverImageUrl };
}

export async function detectLinkedInMemberUrn(
  db: Pool,
  input: { accessToken?: string }
): Promise<{ memberUrn: string; source: "userinfo" | "me" }> {
  await ensureLinkedInPublishingSchema(db);
  const token = input.accessToken?.trim() || (await getAccessToken(db, LINKEDIN_MEMBER_PLATFORM));
  if (!token) throw new Error("LinkedIn member access token is required before detecting Member URN.");
  return detectLinkedInMemberUrnFromToken(token);
}

export async function syncLinkedInQueue(db: Pool): Promise<{ added: number; updated: number; totalEnglish: number }> {
  return syncLinkedInQueueForPlatform(db, LINKEDIN_PAGE_PLATFORM);
}

export async function syncLinkedInMemberQueue(
  db: Pool
): Promise<{ added: number; updated: number; totalEnglish: number; totalSegments: number }> {
  await ensureLinkedInPublishingSchema(db);
  const articles = (await loadBlogArticles()).filter((a) => a.frontmatter.locale === "en");
  let added = 0;
  let updated = 0;

  for (const article of articles) {
    const baseOrder = queueOrderFromPublishedAt(String(article.frontmatter.publishedAt ?? ""), article.slug);
    const articleTitle = String(article.frontmatter.title ?? article.slug).slice(0, 512);
    const rawInsights = extractLinkedInInsights(article);
    const keyPoints = pickMemberKeyPoints(rawInsights);
    const trackingUrl = memberTrackingUrlFor(article.slug, 1);
    const postPreview = buildMemberArticlePost(article, keyPoints, trackingUrl, rawInsights);
    const segmentTags = buildMemberHashtags(article, keyPoints);

    await db.query(
      `DELETE FROM social_publish_items
        WHERE platform = ? AND source_slug = ? AND segment_index > 1 AND status = 'queued'`,
      [LINKEDIN_MEMBER_PLATFORM, article.slug]
    );

    await db.query(
      `DELETE FROM social_publish_items
        WHERE platform = ? AND source_slug = ? AND segment_index = 0 AND status = 'queued'`,
      [LINKEDIN_MEMBER_PLATFORM, article.slug]
    );

    const [result] = await db.query(
      `INSERT INTO social_publish_items
         (platform, source_slug, source_locale, source_path, title, description, canonical_url, tracking_url, tags_json, status, queue_order, segment_index, segment_total)
       VALUES (?, ?, 'en', ?, ?, ?, ?, ?, ?, 'queued', ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         source_path = VALUES(source_path),
         title = VALUES(title),
         description = VALUES(description),
         canonical_url = VALUES(canonical_url),
         tracking_url = VALUES(tracking_url),
         tags_json = VALUES(tags_json),
         segment_total = 1,
         queue_order = CASE WHEN status = 'queued' THEN VALUES(queue_order) ELSE queue_order END`,
      [
        LINKEDIN_MEMBER_PLATFORM,
        article.slug,
        article.path,
        articleTitle,
        postPreview.slice(0, 2000),
        canonicalUrlFor(article.slug),
        trackingUrl,
        JSON.stringify(segmentTags),
        baseOrder
      ]
    );
    const info = result as { affectedRows?: number; changedRows?: number };
    if (info.affectedRows === 1) added += 1;
    else if ((info.changedRows ?? 0) > 0) updated += 1;
  }

  return { added, updated, totalEnglish: articles.length, totalSegments: articles.length };
}

async function syncLinkedInQueueForPlatform(db: Pool, platform: string): Promise<{ added: number; updated: number; totalEnglish: number }> {
  await ensureLinkedInPublishingSchema(db);
  const articles = (await loadBlogArticles()).filter((a) => a.frontmatter.locale === "en");
  let added = 0;
  let updated = 0;
  for (const article of articles) {
    const queueOrder = queueOrderFromPublishedAt(String(article.frontmatter.publishedAt ?? ""), article.slug);
    const tags = sanitizeTags(article.frontmatter.tags);
    const [result] = await db.query(
      `INSERT INTO social_publish_items
         (platform, source_slug, source_locale, source_path, title, description, canonical_url, tracking_url, tags_json, status, queue_order)
       VALUES (?, ?, 'en', ?, ?, ?, ?, ?, ?, 'queued', ?)
       ON DUPLICATE KEY UPDATE
         source_path = VALUES(source_path),
         title = VALUES(title),
         description = VALUES(description),
         canonical_url = VALUES(canonical_url),
         tracking_url = VALUES(tracking_url),
         tags_json = VALUES(tags_json),
         queue_order = CASE WHEN status = 'queued' THEN VALUES(queue_order) ELSE queue_order END`,
      [
        platform,
        article.slug,
        article.path,
        String(article.frontmatter.title ?? article.slug).slice(0, 512),
        String(article.frontmatter.description ?? "").slice(0, 2000),
        canonicalUrlFor(article.slug),
        trackingUrlFor(article.slug, platform),
        JSON.stringify(tags),
        queueOrder
      ]
    );
    const info = result as { affectedRows?: number; changedRows?: number };
    if (info.affectedRows === 1) added += 1;
    else if ((info.changedRows ?? 0) > 0) updated += 1;
  }
  return { added, updated, totalEnglish: articles.length };
}

export async function listLinkedInItems(db: Pool): Promise<LinkedInPublishItem[]> {
  return listLinkedInItemsForPlatform(db, LINKEDIN_PAGE_PLATFORM);
}

export async function listLinkedInMemberItems(db: Pool): Promise<LinkedInPublishItem[]> {
  return listLinkedInItemsForPlatform(db, LINKEDIN_MEMBER_PLATFORM);
}

async function listLinkedInItemsForPlatform(db: Pool, platform: string): Promise<LinkedInPublishItem[]> {
  await ensureLinkedInPublishingSchema(db);
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
          WHERE utm_source = ?
          GROUP BY utm_campaign
       ) v ON v.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS registration_count
           FROM marketing_user_attributions
          WHERE utm_source = ?
          GROUP BY utm_campaign
       ) r ON r.utm_campaign = s.source_slug
       LEFT JOIN (
         SELECT utm_campaign, COUNT(*) AS paid_conversion_count, COALESCE(SUM(amount_cents), 0) AS paid_amount_cents
           FROM marketing_pay_attributions
          WHERE utm_source = ? AND amount_cents > 0
          GROUP BY utm_campaign
       ) p ON p.utm_campaign = s.source_slug
      WHERE s.platform = ?
      ORDER BY
        CASE s.status WHEN 'queued' THEN 0 WHEN 'failed' THEN 1 WHEN 'published' THEN 2 ELSE 3 END,
        s.queue_order ASC,
        s.segment_index ASC,
        s.id ASC`,
    [platform, platform, platform, platform]
  );
  return attachEstimatedPublishTimes((rows as Record<string, unknown>[]).map(mapItemRow), platform);
}

export async function moveLinkedInItem(db: Pool, id: number, direction: "up" | "down"): Promise<void> {
  return moveLinkedInItemForPlatform(db, LINKEDIN_PAGE_PLATFORM, id, direction);
}

export async function moveLinkedInMemberItem(db: Pool, id: number, direction: "up" | "down"): Promise<void> {
  return moveLinkedInItemForPlatform(db, LINKEDIN_MEMBER_PLATFORM, id, direction);
}

async function moveLinkedInItemForPlatform(db: Pool, platform: string, id: number, direction: "up" | "down"): Promise<void> {
  const items = (await listLinkedInItemsForPlatform(db, platform)).filter((x) => x.status === "queued");
  const idx = items.findIndex((x) => x.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx]!;
  const b = items[swapIdx]!;
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [b.queueOrder, a.id]);
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [a.queueOrder, b.id]);
}

export async function publishNextLinkedIn(db: Pool): Promise<{ item: LinkedInPublishItem | null; message: string }> {
  await syncLinkedInQueueForPlatform(db, LINKEDIN_PAGE_PLATFORM);
  const settings = await getLinkedInSettings(db);
  const token = await getAccessToken(db, LINKEDIN_PAGE_PLATFORM);
  if (!token || !settings.organizationUrn) throw new Error("LinkedIn access token and Organization URN are required.");
  return publishNextLinkedInForPlatform(db, LINKEDIN_PAGE_PLATFORM, token, settings.organizationUrn, settings.defaultCoverImageUrl, "Published to LinkedIn Page.");
}

export async function publishNextLinkedInMember(db: Pool): Promise<{ item: LinkedInPublishItem | null; message: string }> {
  return publishLinkedInMemberSegment(db, { respectSchedule: false });
}

export async function publishDueLinkedInMember(db: Pool): Promise<{ item: LinkedInPublishItem | null; message: string }> {
  return publishLinkedInMemberSegment(db, { respectSchedule: true });
}

async function publishLinkedInMemberSegment(
  db: Pool,
  options: { respectSchedule: boolean }
): Promise<{ item: LinkedInPublishItem | null; message: string }> {
  await syncLinkedInMemberQueue(db);
  const settings = await getLinkedInMemberSettings(db);
  const token = await getAccessToken(db, LINKEDIN_MEMBER_PLATFORM);
  if (!token || !settings.memberUrn) throw new Error("LinkedIn member access token and Member URN are required.");

  if (options.respectSchedule) {
    const items = await listLinkedInItemsForPlatform(db, LINKEDIN_MEMBER_PLATFORM);
    const next = items.find((x) => x.status === "queued" || x.status === "failed");
    if (!next) return { item: null, message: "No queued LinkedIn member articles." };
    if (next.estimatedPublishAt && new Date(next.estimatedPublishAt).getTime() > Date.now()) {
      return {
        item: null,
        message: `Next LinkedIn member post due at ${next.estimatedPublishAt} (Beijing 9:00 & 13:00, 2 posts/day).`
      };
    }
  }

  return publishNextLinkedInForPlatform(
    db,
    LINKEDIN_MEMBER_PLATFORM,
    token,
    settings.memberUrn,
    settings.defaultCoverImageUrl,
    "Published to LinkedIn member profile."
  );
}

async function publishNextLinkedInForPlatform(
  db: Pool,
  platform: string,
  token: string,
  authorUrn: string,
  defaultCoverImageUrl: string,
  successMessage: string
): Promise<{ item: LinkedInPublishItem | null; message: string }> {
  const [rows] = await db.query(
    `SELECT * FROM social_publish_items
      WHERE platform = ? AND status IN ('queued', 'failed')
      ORDER BY queue_order ASC, segment_index ASC, id ASC
      LIMIT 1`,
    [platform]
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return { item: null, message: "No queued LinkedIn articles." };

  const article = await loadBlogArticleBySlug(String(row.source_slug));
  if (!article) throw new Error("Source markdown file not found.");

  const segmentIndex = Math.max(0, Number(row.segment_index ?? 0));
  const isMemberPost = platform === LINKEDIN_MEMBER_PLATFORM && segmentIndex >= 1;

  try {
    let postId: string;
    if (isMemberPost) {
      const rawInsights = extractLinkedInInsights(article);
      const keyPoints = pickMemberKeyPoints(rawInsights);
      const trackingUrl = String(row.tracking_url ?? memberTrackingUrlFor(article.slug, 1));
      const commentary = buildMemberArticlePost(article, keyPoints, trackingUrl, rawInsights);
      postId = await createLinkedInTextPost(token, authorUrn, commentary);
    } else {
      const coverUrl = resolveCoverImageUrl(article, defaultCoverImageUrl);
      const imageUrn = await uploadLinkedInImage(token, authorUrn, coverUrl);
      postId = await createLinkedInArticlePost(token, authorUrn, article, imageUrn, platform);
    }
    await db.query(
      `UPDATE social_publish_items
          SET status = 'published',
              published_at = NOW(),
              platform_article_id = ?,
              platform_url = ?,
              last_error = NULL
        WHERE id = ?`,
      [postId, postIdToUrl(postId), row.id]
    );
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [
      msg.slice(0, 4000),
      row.id
    ]);
    throw e;
  }

  const items = await listLinkedInItemsForPlatform(db, platform);
  return { item: items.find((x) => x.id === Number(row.id)) ?? null, message: successMessage };
}

async function uploadLinkedInImage(token: string, owner: string, imageUrl: string): Promise<string> {
  const initResp = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } })
  });
  const initText = await initResp.text();
  const initJson = parseJson(initText);
  if (initResp.status === 401) {
    throw new Error(
      "LinkedIn access token is invalid. Please generate an OAuth Access Token with the required LinkedIn scope; do not use Client ID or Primary Client Secret."
    );
  }
  if (!initResp.ok) throw new Error(`LinkedIn image initialize failed: ${initResp.status} ${initText}`);
  const uploadUrl = String(initJson?.value?.uploadUrl ?? "");
  const imageUrn = String(initJson?.value?.image ?? "");
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn did not return uploadUrl/image URN.");

  const imageResp = await fetch(imageUrl);
  if (!imageResp.ok) throw new Error(`Cover image fetch failed: ${imageResp.status} ${imageUrl}`);
  const bytes = Buffer.from(await imageResp.arrayBuffer());
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": imageResp.headers.get("content-type") || "image/jpeg" },
    body: bytes
  });
  if (!uploadResp.ok) throw new Error(`LinkedIn image upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
  return imageUrn;
}

async function createLinkedInTextPost(token: string, author: string, commentary: string): Promise<string> {
  const payload = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LinkedIn post failed: ${resp.status} ${text}`);
  return resp.headers.get("x-restli-id") || "";
}

async function createLinkedInArticlePost(token: string, author: string, article: BlogArticle, thumbnail: string, platform: string): Promise<string> {
  const payload = {
    author,
    commentary: buildCommentary(article, platform),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: {
      article: {
        source: trackingUrlFor(article.slug, platform),
        thumbnail,
        title: String(article.frontmatter.title ?? article.slug).slice(0, 200),
        description: String(article.frontmatter.description ?? "").slice(0, 4086)
      }
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LinkedIn post failed: ${resp.status} ${text}`);
  return resp.headers.get("x-restli-id") || "";
}

async function detectLinkedInMemberUrnFromToken(token: string): Promise<{ memberUrn: string; source: "userinfo" | "me" }> {
  const userinfoResp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const userinfoText = await userinfoResp.text();
  const userinfoJson = parseJson(userinfoText);
  const sub = String(userinfoJson?.sub ?? "").trim();
  if (userinfoResp.ok && sub) {
    return { memberUrn: `urn:li:person:${sub}`, source: "userinfo" };
  }

  const meResp = await fetch("https://api.linkedin.com/v2/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0"
    }
  });
  const meText = await meResp.text();
  const meJson = parseJson(meText);
  const id = String(meJson?.id ?? "").trim();
  if (meResp.ok && id) {
    return { memberUrn: `urn:li:person:${id}`, source: "me" };
  }

  if (userinfoResp.status === 401 || meResp.status === 401) {
    throw new Error("LinkedIn access token is invalid or expired. Please generate a new OAuth Access Token.");
  }
  if (userinfoResp.status === 403 && meResp.status === 403) {
    throw new Error(
      "LinkedIn token cannot reveal Member URN. Regenerate the token after enabling Sign In with LinkedIn using OpenID Connect and selecting openid/profile/email plus w_member_social."
    );
  }
  throw new Error(`LinkedIn Member URN detection failed. userinfo=${userinfoResp.status} ${userinfoText}; me=${meResp.status} ${meText}`);
}

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

async function getAccessToken(db: Pool, platform: string): Promise<string> {
  const [rows] = await db.query(`SELECT api_key_enc FROM social_platform_settings WHERE platform = ? LIMIT 1`, [platform]);
  const enc = (rows as Array<{ api_key_enc: string | null }>)[0]?.api_key_enc?.trim();
  return enc ? decryptSecret(enc).trim() : "";
}

function buildCommentary(article: BlogArticle, platform: string): string {
  const title = String(article.frontmatter.title ?? article.slug);
  const trackingUrl = trackingUrlFor(article.slug, platform);
  const insights = extractLinkedInInsights(article);
  const cta = `Full article: ${trackingUrl}`;
  const hashtags = "#EmailMarketing #B2BMarketing #BigSocialBoss";
  const maxChars = Number(process.env.LINKEDIN_COMMENTARY_MAX_CHARS || 900);
  const minInsightCount = Math.min(3, insights.length);
  const lines = [title, "", "Key ideas:"];

  for (const insight of insights.slice(0, 5)) {
    lines.push(`- ${insight}`);
    const draft = `${lines.join("\n")}\n\n${cta}\n\n${hashtags}`;
    if (draft.length > maxChars && lines.length > 3 + minInsightCount) {
      lines.pop();
      break;
    }
  }

  return truncateCommentary(`${lines.join("\n")}\n\n${cta}\n\n${hashtags}`, maxChars);
}

function extractLinkedInInsights(article: BlogArticle): string[] {
  const desc = cleanMarkdownText(String(article.frontmatter.description ?? ""));
  const lines = article.body.split("\n");
  const candidates: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("|") || /^```/.test(trimmed)) continue;
    const listMatch = trimmed.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/);
    const headingMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    const raw = listMatch?.[1] || headingMatch?.[1] || trimmed;
    const cleaned = cleanMarkdownText(raw);
    if (isUsefulLinkedInInsight(cleaned)) candidates.push(cleaned);
  }

  const fallback = cleanMarkdownText(article.body)
    .split(/[.!?]\s+/)
    .map((x) => x.trim())
    .filter(isUsefulLinkedInInsight);

  return uniqueInsights([...candidates, ...fallback, desc]).slice(0, 5).map((x) => trimSentence(x, 145));
}

function isUsefulLinkedInInsight(text: string): boolean {
  if (text.length < 35 || text.length > 220) return false;
  if (/https?:\/\/|www\.|utm_|official comparison|register on the main site|next step/i.test(text)) return false;
  return true;
}

function uniqueInsights(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 90);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function cleanMarkdownText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  return `${cut.slice(0, Math.max(40, cut.lastIndexOf(" ")))}...`;
}

function truncateCommentary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 3);
  return `${cut.slice(0, Math.max(200, cut.lastIndexOf("\n")))}...`;
}

function resolveCoverImageUrl(article: BlogArticle, fallback: string): string {
  const cover = String(article.frontmatter.coverImage ?? "").trim();
  return normalizeUrl(cover) || (cover.startsWith("/") ? `${siteOrigin()}${cover}` : "") || fallback;
}

async function loadBlogArticleBySlug(slug: string): Promise<BlogArticle | null> {
  const path = resolve(resolveBlogDir(), "src/content/articles", `${slug}.md`);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const { frontmatter, body } = parseMarkdown(raw);
  return { slug, path, frontmatter, body };
}

async function loadBlogArticles(): Promise<BlogArticle[]> {
  const dir = resolve(resolveBlogDir(), "src/content/articles");
  const filenames = (await readdir(dir)).filter((x) => x.endsWith(".md"));
  const articles: BlogArticle[] = [];
  for (const filename of filenames) {
    const path = resolve(dir, filename);
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
      (data[currentArrayKey] as string[]).push(parseScalar(arrayItem[1] ?? ""));
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
    } else {
      data[key] = parseScalar(rawValue);
      currentArrayKey = null;
    }
  }
  return data;
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function mapItemRow(row: Record<string, unknown>): LinkedInPublishItem {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.tags_json || "[]"));
  } catch {
    tags = [];
  }
  return {
    id: Number(row.id),
    platform: "linkedin",
    sourceSlug: String(row.source_slug ?? ""),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    canonicalUrl: String(row.canonical_url ?? ""),
    trackingUrl: String(row.tracking_url ?? ""),
    tags,
    status: String(row.status ?? "queued") as SocialPublishStatus,
    queueOrder: Number(row.queue_order ?? 0),
    segmentIndex: Number(row.segment_index ?? 0),
    segmentTotal: Number(row.segment_total ?? 1),
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
    platformArticleId: row.platform_article_id == null ? null : String(row.platform_article_id),
    platformUrl: row.platform_url == null ? null : String(row.platform_url),
    lastError: row.last_error == null ? null : String(row.last_error),
    estimatedPublishAt: null,
    mainVisitCount: Number(row.main_visit_count ?? 0),
    uniqueIpCount: Number(row.unique_ip_count ?? 0),
    registrationCount: Number(row.registration_count ?? 0),
    paidConversionCount: Number(row.paid_conversion_count ?? 0),
    paidAmountCents: Number(row.paid_amount_cents ?? 0)
  };
}

function attachEstimatedPublishTimes(items: LinkedInPublishItem[], platform: string): LinkedInPublishItem[] {
  const queued = items.filter((x) => x.status === "queued");
  const now = new Date();
  if (platform === LINKEDIN_MEMBER_PLATFORM) {
    const publishedCount = items.filter((x) => x.status === "published").length;
    queued.forEach((item, index) => {
      item.estimatedPublishAt = linkedInMemberSlotForQueueIndex(index, now, publishedCount).toISOString();
    });
    return items;
  }

  const first = nextBeijingDailySlot(9, 0);
  queued.forEach((item, index) => {
    item.estimatedPublishAt = new Date(first.getTime() + index * 86400000).toISOString();
  });
  return items;
}

function nextBeijingDailySlot(hour: number, minute: number): Date {
  const now = new Date();
  const beijingNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const slot = new Date(beijingNow);
  slot.setHours(hour, minute, 0, 0);
  if (slot.getTime() <= beijingNow.getTime()) slot.setDate(slot.getDate() + 1);
  return new Date(slot.getTime() - 8 * 60 * 60 * 1000);
}

function trackingUrlFor(slug: string, platform = LINKEDIN_PAGE_PLATFORM, segmentIndex?: number): string {
  const url = new URL(canonicalUrlFor(slug));
  url.searchParams.set("utm_source", platform);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", slug);
  url.searchParams.set("utm_content", segmentIndex && segmentIndex > 0 ? `seg${segmentIndex}` : "en");
  return url.toString();
}

function memberTrackingUrlFor(slug: string, segmentIndex: number): string {
  return trackingUrlFor(slug, LINKEDIN_MEMBER_PLATFORM, segmentIndex);
}

function canonicalUrlFor(slug: string): string {
  return `${siteOrigin()}/en/${slug}`;
}

function siteOrigin(): string {
  return (process.env.BLOG_SITE_ORIGIN || "https://www.bigsocialboss.top").replace(/\/$/, "");
}

function resolveBlogDir(): string {
  return resolve(process.cwd(), process.env.BSB_BLOG_DIR || "../blog");
}

function queueOrderFromPublishedAt(publishedAt: string, slug: string): number {
  const normalized = publishedAt.replace(/-/g, "");
  const base = /^\d{8}$/.test(normalized) ? Number(normalized) * 1000 : 99991231000;
  let hash = 0;
  for (const ch of slug) hash = (hash + ch.charCodeAt(0)) % 997;
  return base + hash;
}

function sanitizeTags(tags: unknown): string[] {
  const raw = Array.isArray(tags) ? tags : ["emailmarketing", "selfhosted", "marketing"];
  return [...new Set(raw.map((x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean))].slice(0, 4);
}

function parseConfig(raw: string | null | undefined): LinkedInConfig {
  try {
    const o = JSON.parse(raw || "{}") as Partial<LinkedInConfig>;
    return {
      organizationUrn: String(o.organizationUrn ?? ""),
      memberUrn: String(o.memberUrn ?? ""),
      defaultCoverImageUrl: String(o.defaultCoverImageUrl ?? "")
    };
  } catch {
    return { organizationUrn: "", memberUrn: "", defaultCoverImageUrl: "" };
  }
}

function normalizeOrganizationUrn(raw: string): string {
  const v = raw.trim();
  if (/^urn:li:organization:\d+$/.test(v)) return v;
  if (/^\d+$/.test(v)) return `urn:li:organization:${v}`;
  return "";
}

function normalizeMemberUrn(raw: string): string {
  const v = raw.trim();
  if (/^urn:li:person:[A-Za-z0-9_-]+$/.test(v)) return v;
  if (/^[A-Za-z0-9_-]+$/.test(v)) return `urn:li:person:${v}`;
  return "";
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function hintForSecret(secret: string): string {
  const clean = secret.trim();
  return clean.length <= 8 ? "已保存" : `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function postIdToUrl(postId: string): string {
  const id = postId.split(":").pop();
  return id ? `https://www.linkedin.com/feed/update/${postId}` : "";
}
