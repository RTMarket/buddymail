import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { ensureSocialPublishingSchema, resolveBlogDir, type SocialPublishStatus } from "./socialPublishingDevto.js";

export type WechatPublishItem = {
  id: number;
  platform: "wechat_official";
  sourceSlug: string;
  sourceLocale: string;
  title: string;
  description: string | null;
  canonicalUrl: string;
  trackingUrl: string;
  status: SocialPublishStatus;
  queueOrder: number;
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

export type WechatReadingPlan = {
  id: number;
  articleTitle: string;
  articleUrl: string;
  targetReads: number;
  actualReads: number;
  promotionChannels: string[];
  status: "planned" | "running" | "done";
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WechatScheduledPublishTask = {
  id: number;
  mediaId: string;
  localId: string | null;
  title: string;
  scheduledAt: string;
  status: "scheduled" | "running" | "published" | "failed";
  publishId: string | null;
  publishedAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BlogArticle = {
  slug: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

const PLATFORM = "wechat_official";

/** 双公众号独立：slot 1 -> wechat_official_1，slot 2 -> wechat_official_2 */
export function wechatPlatformForSlot(slot: number): string {
  return Number(slot) === 2 ? "wechat_official_2" : "wechat_official_1";
}

/** 兼容旧的单号数据：slot 1 优先读 wechat_official_1，不存在则回退读 wechat_official */
async function readWechatSettingRow(db: Pool, slot: number) {
  const platform = wechatPlatformForSlot(slot);
  const [rows] = await db.query(
    `SELECT api_key_enc, api_key_hint, config_json, updated_at
       FROM social_platform_settings
      WHERE platform = ?
      LIMIT 1`,
    [platform]
  );
  let row = (rows as Array<{ api_key_enc: string | null; api_key_hint: string | null; config_json: string | null; updated_at: Date | string | null }>)[0];
  if (!row && platform === "wechat_official_1") {
    const [legacy] = await db.query(
      `SELECT api_key_enc, api_key_hint, config_json, updated_at
         FROM social_platform_settings
        WHERE platform = ?
        LIMIT 1`,
      [PLATFORM]
    );
    row = (legacy as Array<{ api_key_enc: string | null; api_key_hint: string | null; config_json: string | null; updated_at: Date | string | null }>)[0];
  }
  return { row, platform };
}
let schemaReady = false;

export async function ensureWechatPublishingSchema(db: Pool): Promise<void> {
  if (schemaReady) return;
  await ensureSocialPublishingSchema(db);
  await db.query(`ALTER TABLE social_platform_settings ADD COLUMN instance_url VARCHAR(512) NULL AFTER api_key_hint`).catch(() => {});
  await db.query(`ALTER TABLE social_platform_settings ADD COLUMN config_json TEXT NULL AFTER instance_url`).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS wechat_reading_growth_plans (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      article_title VARCHAR(512) NOT NULL DEFAULT '',
      article_url VARCHAR(1200) NOT NULL DEFAULT '',
      target_reads INT NOT NULL DEFAULT 0,
      actual_reads INT NOT NULL DEFAULT 0,
      promotion_channels_json TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'planned',
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_wechat_reading_status (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wechat_scheduled_publishes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      media_id VARCHAR(256) NOT NULL,
      local_id VARCHAR(128) NULL,
      title VARCHAR(512) NOT NULL DEFAULT '',
      scheduled_at TIMESTAMP NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
      publish_id VARCHAR(128) NULL,
      published_at TIMESTAMP NULL,
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_wechat_sched_due (status, scheduled_at),
      KEY idx_wechat_sched_media (media_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  schemaReady = true;
}

export async function getWechatSettings(
  db: Pool,
  slot: number = 1
): Promise<{ configured: boolean; hint: string; appId: string; accountName: string; author: string; thumbMediaId: string; updatedAt: string | null }> {
  await ensureWechatPublishingSchema(db);
  const { row } = await readWechatSettingRow(db, slot);
  const cfg = parseConfig(row?.config_json);
  return {
    configured: Boolean(row?.api_key_enc && cfg.appId && cfg.thumbMediaId),
    hint: row?.api_key_hint ?? "",
    appId: cfg.appId,
    accountName: cfg.accountName,
    author: cfg.author,
    thumbMediaId: cfg.thumbMediaId,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function saveWechatSettings(
  db: Pool,
  input: { appId: string; appSecret?: string; accountName?: string; author?: string; thumbMediaId?: string },
  slot: number = 1
): Promise<{ configured: boolean; hint: string; appId: string; accountName: string; author: string; thumbMediaId: string }> {
  await ensureWechatPublishingSchema(db);
  const appId = input.appId.trim();
  const appSecret = input.appSecret?.trim() ?? "";
  const accountName = (input.accountName ?? "").trim();
  const author = (input.author ?? "").trim();

  const { row: existing, platform } = await readWechatSettingRow(db, slot);
  const existingCfg = parseConfig(existing?.config_json);
  const thumbMediaId = (input.thumbMediaId ?? "").trim() || existingCfg.thumbMediaId || "";

  if (!appId) throw new Error("请填写微信公众号 AppID。");
  if (!appSecret && !existing?.api_key_enc) throw new Error("请填写微信公众号 AppSecret。");

  const enc = appSecret ? encryptSecret(appSecret) : existing!.api_key_enc;
  const hint = appSecret ? hintForSecret(appSecret) : existing?.api_key_hint ?? "";
  await db.query(
    `INSERT INTO social_platform_settings (platform, api_key_enc, api_key_hint, config_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       api_key_enc = VALUES(api_key_enc),
       api_key_hint = VALUES(api_key_hint),
       config_json = VALUES(config_json)`,
    [platform, enc, hint, JSON.stringify({ appId, accountName, author, thumbMediaId })]
  );
  const configured = Boolean(enc && appId && thumbMediaId);
  return { configured, hint, appId, accountName, author, thumbMediaId };
}

export async function syncWechatQueue(db: Pool): Promise<{ added: number; updated: number; totalChinese: number }> {
  await ensureWechatPublishingSchema(db);
  const articles = (await loadBlogArticles()).filter((a) => String(a.frontmatter.locale ?? "zh") === "zh");
  let added = 0;
  let updated = 0;
  for (const article of articles) {
    const queueOrder = queueOrderFromPublishedAt(String(article.frontmatter.publishedAt ?? ""), article.slug);
    const [result] = await db.query(
      `INSERT INTO social_publish_items
         (platform, source_slug, source_locale, source_path, title, description, canonical_url, tracking_url, tags_json, status, queue_order)
       VALUES (?, ?, 'zh', ?, ?, ?, ?, ?, '[]', 'queued', ?)
       ON DUPLICATE KEY UPDATE
         source_path = VALUES(source_path),
         title = VALUES(title),
         description = VALUES(description),
         canonical_url = VALUES(canonical_url),
         tracking_url = VALUES(tracking_url),
         queue_order = CASE WHEN status = 'queued' THEN VALUES(queue_order) ELSE queue_order END`,
      [
        PLATFORM,
        article.slug,
        article.path,
        String(article.frontmatter.title ?? article.slug).slice(0, 512),
        String(article.frontmatter.description ?? "").slice(0, 2000),
        canonicalUrlFor(article.slug),
        trackingUrlFor(article.slug),
        queueOrder
      ]
    );
    const info = result as { affectedRows?: number; changedRows?: number };
    if (info.affectedRows === 1) added += 1;
    else if ((info.changedRows ?? 0) > 0) updated += 1;
  }
  return { added, updated, totalChinese: articles.length };
}

export async function listWechatItems(db: Pool): Promise<WechatPublishItem[]> {
  await ensureWechatPublishingSchema(db);
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
        s.id ASC`,
    [PLATFORM, PLATFORM, PLATFORM, PLATFORM]
  );
  return attachEstimatedPublishTimes((rows as Record<string, unknown>[]).map(mapItemRow));
}

export async function moveWechatItem(db: Pool, id: number, direction: "up" | "down"): Promise<void> {
  const items = (await listWechatItems(db)).filter((x) => x.status === "queued");
  const idx = items.findIndex((x) => x.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx]!;
  const b = items[swapIdx]!;
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [b.queueOrder, a.id]);
  await db.query(`UPDATE social_publish_items SET queue_order = ? WHERE id = ?`, [a.queueOrder, b.id]);
}

export async function publishNextWechat(db: Pool): Promise<{ item: WechatPublishItem | null; message: string }> {
  await syncWechatQueue(db);
  const settings = await getWechatSettings(db);
  if (!settings.configured) throw new Error("请先完成微信公众号 AppID、AppSecret 和 thumb_media_id 配置。");
  const appSecret = await getAppSecret(db);
  const [rows] = await db.query(
    `SELECT * FROM social_publish_items
      WHERE platform = ? AND status IN ('queued', 'failed')
      ORDER BY queue_order ASC, id ASC
      LIMIT 1`,
    [PLATFORM]
  );
  const row = (rows as Array<{ id: number; source_slug: string }>)[0];
  if (!row) return { item: null, message: "没有待发布的微信公众号文章。" };
  const article = await loadBlogArticleBySlug(String(row.source_slug));
  if (!article) throw new Error("源文章 Markdown 文件不存在。");

  try {
    const accessToken = await requestWechatAccessToken(settings.appId, appSecret);
    const draftMediaId = await addWechatDraft(accessToken, article, settings);
    const publishId = await submitWechatPublish(accessToken, draftMediaId);
    await db.query(
      `UPDATE social_publish_items
          SET status = 'published',
              published_at = NOW(),
              platform_article_id = ?,
              platform_url = NULL,
              last_error = NULL
        WHERE id = ?`,
      [publishId, row.id]
    );
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [msg.slice(0, 4000), row.id]);
    throw e;
  }

  const items = await listWechatItems(db);
  return { item: items.find((x) => x.id === Number(row.id)) ?? null, message: "已提交微信公众号发布任务。" };
}

export async function createNextWechatDraft(db: Pool): Promise<{ item: WechatPublishItem | null; message: string }> {
  await syncWechatQueue(db);
  const settings = await getWechatSettings(db);
  if (!settings.configured) throw new Error("请先完成微信公众号 AppID、AppSecret 和 thumb_media_id 配置。");
  const appSecret = await getAppSecret(db);
  const [rows] = await db.query(
    `SELECT * FROM social_publish_items
      WHERE platform = ? AND status IN ('queued', 'failed')
      ORDER BY queue_order ASC, id ASC
      LIMIT 1`,
    [PLATFORM]
  );
  const row = (rows as Array<{ id: number; source_slug: string }>)[0];
  if (!row) return { item: null, message: "没有待生成草稿的微信公众号文章。" };
  const article = await loadBlogArticleBySlug(String(row.source_slug));
  if (!article) throw new Error("源文章 Markdown 文件不存在。");

  try {
    const accessToken = await requestWechatAccessToken(settings.appId, appSecret);
    const draftMediaId = await addWechatDraft(accessToken, article, settings);
    await db.query(
      `UPDATE social_publish_items
          SET status = 'queued',
              platform_article_id = ?,
              platform_url = NULL,
              last_error = NULL
        WHERE id = ?`,
      [draftMediaId, row.id]
    );
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [msg.slice(0, 4000), row.id]);
    throw e;
  }

  const items = await listWechatItems(db);
  return { item: items.find((x) => x.id === Number(row.id)) ?? null, message: "已生成微信公众号草稿，请到公众号后台检查排版。" };
}

export async function submitNextWechatDraft(db: Pool): Promise<{ item: WechatPublishItem | null; message: string }> {
  await ensureWechatPublishingSchema(db);
  const settings = await getWechatSettings(db);
  if (!settings.configured) throw new Error("请先完成微信公众号 AppID、AppSecret 和 thumb_media_id 配置。");
  const appSecret = await getAppSecret(db);
  const [rows] = await db.query(
    `SELECT id, platform_article_id
       FROM social_publish_items
      WHERE platform = ? AND status IN ('queued', 'failed') AND platform_article_id IS NOT NULL AND platform_article_id != ''
      ORDER BY queue_order ASC, id ASC
      LIMIT 1`,
    [PLATFORM]
  );
  const row = (rows as Array<{ id: number; platform_article_id: string | null }>)[0];
  if (!row?.platform_article_id) return { item: null, message: "没有可提交的草稿。请先点击“生成草稿”。" };

  try {
    const accessToken = await requestWechatAccessToken(settings.appId, appSecret);
    const publishId = await submitWechatPublish(accessToken, row.platform_article_id);
    await db.query(
      `UPDATE social_publish_items
          SET status = 'published',
              published_at = NOW(),
              platform_article_id = ?,
              platform_url = NULL,
              last_error = NULL
        WHERE id = ?`,
      [publishId, row.id]
    );
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    await db.query(`UPDATE social_publish_items SET status = 'failed', last_error = ? WHERE id = ?`, [msg.slice(0, 4000), row.id]);
    throw e;
  }

  const items = await listWechatItems(db);
  return { item: items.find((x) => x.id === Number(row.id)) ?? null, message: "已提交微信公众号发布任务。" };
}

export async function listWechatReadingPlans(db: Pool): Promise<WechatReadingPlan[]> {
  await ensureWechatPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT * FROM wechat_reading_growth_plans ORDER BY id DESC LIMIT 100`
  );
  return (rows as Record<string, unknown>[]).map(mapPlanRow);
}

export async function createWechatReadingPlan(
  db: Pool,
  input: { articleTitle: string; articleUrl: string; targetReads: number; promotionChannels: string[]; note?: string }
): Promise<WechatReadingPlan[]> {
  await ensureWechatPublishingSchema(db);
  const targetReads = Math.max(1, Math.min(1_000_000, Math.floor(input.targetReads)));
  await db.query(
    `INSERT INTO wechat_reading_growth_plans
       (article_title, article_url, target_reads, promotion_channels_json, status, note)
     VALUES (?, ?, ?, ?, 'planned', ?)`,
    [
      input.articleTitle.trim().slice(0, 512),
      input.articleUrl.trim().slice(0, 1200),
      targetReads,
      JSON.stringify(input.promotionChannels.slice(0, 12)),
      (input.note ?? "").trim().slice(0, 4000)
    ]
  );
  return listWechatReadingPlans(db);
}

export async function updateWechatReadingPlan(
  db: Pool,
  id: number,
  input: { actualReads?: number; status?: "planned" | "running" | "done"; note?: string }
): Promise<WechatReadingPlan[]> {
  await ensureWechatPublishingSchema(db);
  const fields: string[] = [];
  const params: unknown[] = [];
  if (typeof input.actualReads === "number" && Number.isFinite(input.actualReads)) {
    fields.push("actual_reads = ?");
    params.push(Math.max(0, Math.min(1_000_000, Math.floor(input.actualReads))));
  }
  if (input.status) {
    fields.push("status = ?");
    params.push(input.status);
  }
  if (typeof input.note === "string") {
    fields.push("note = ?");
    params.push(input.note.trim().slice(0, 4000));
  }
  if (fields.length) {
    params.push(id);
    await db.query(`UPDATE wechat_reading_growth_plans SET ${fields.join(", ")} WHERE id = ?`, params);
  }
  return listWechatReadingPlans(db);
}

async function requestWechatAccessToken(appId: string, appSecret: string): Promise<string> {
  const resp = await fetch("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid: appId, secret: appSecret, force_refresh: false })
  });
  const text = await resp.text();
  const json = parseJson(text);
  const token = String(json?.access_token ?? "");
  if (!resp.ok || !token) throw formatWechatApiFailure(text, "微信公众号 access_token 获取失败");
  return token;
}

function formatWechatApiFailure(text: string, prefix: string): Error {
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  const errmsg = String(json?.errmsg ?? text);
  if (errcode === 40164 || errmsg.includes("not in whitelist")) {
    const ipMatch = errmsg.match(/invalid ip\s+([\d.a-f:]+)/i);
    const ip = ipMatch?.[1] ?? "本服务器公网 IP";
    return new Error(
      `微信 API 拒绝连接：服务器 IP（${ip}）未加入公众号 IP 白名单。请登录微信公众平台 → 开发 → 基本配置 → IP 白名单，添加该 IP 后重试。`
    );
  }
  if (errcode === 40001 || errcode === 40013) {
    return new Error("微信 AppID 或 AppSecret 不正确，请在「账号认证」页核对后重新保存。");
  }
  if (errcode) {
    return new Error(`${prefix}（${errcode}）：${errmsg}`);
  }
  return new Error(`${prefix}：${text.slice(0, 400)}`);
}

async function getWechatApiAccess(db: Pool, slot: number = 1): Promise<{ accessToken: string; settings: Awaited<ReturnType<typeof getWechatSettings>> }> {
  const settings = await getWechatSettings(db, slot);
  const appSecret = await getAppSecret(db, slot);
  if (!settings.appId?.trim()) throw new Error("请先完成微信公众号 AppID 配置。");
  if (!appSecret) throw new Error("请先完成微信公众号 AppSecret 配置。");
  const accessToken = await requestWechatAccessToken(settings.appId, appSecret);
  return { accessToken, settings };
}

/** 供数据统计（datacube）等模块获取 access_token */
export async function getWechatAccessTokenForDatacube(db: Pool, slot: number = 1): Promise<string> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  return accessToken;
}

function resolveThumbMediaId(inputThumb: string | undefined, settings: { thumbMediaId: string }): string {
  const thumb = (inputThumb ?? "").trim() || settings.thumbMediaId?.trim() || "";
  if (!thumb) {
    throw new Error("请在本页「文章封面」上传封面图后再同步草稿箱（也可在账号认证页设置默认封面）。");
  }
  return thumb;
}

export async function uploadWechatThumbMaterial(
  db: Pool,
  file: Buffer,
  filename: string,
  slot: number = 1
): Promise<{ thumbMediaId: string; url: string | null }> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const lower = filename.toLowerCase();
  const mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(file)], { type: mime }), filename || "cover.jpg");
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=thumb`,
    { method: "POST", body: form }
  );
  const text = await resp.text();
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  const thumbMediaId = String(json?.media_id ?? "");
  if (!resp.ok || errcode !== 0 || !thumbMediaId) {
    throw formatWechatApiFailure(text, "微信封面上传失败");
  }
  return { thumbMediaId, url: json?.url == null ? null : String(json.url) };
}

/** 正文插图 · uploadimg（jpg/png ≤1MB） */
export async function uploadWechatContentImage(
  db: Pool,
  file: Buffer,
  filename: string,
  slot: number = 1
): Promise<{ url: string }> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const lower = filename.toLowerCase();
  const mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(file)], { type: mime }), filename || "content.jpg");
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(accessToken)}`,
    { method: "POST", body: form }
  );
  const text = await resp.text();
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  const url = String(json?.url ?? "");
  if (!resp.ok || errcode !== 0 || !url) {
    throw formatWechatApiFailure(text, "正文图片上传失败");
  }
  return { url };
}

export async function uploadWechatVideoMaterial(
  db: Pool,
  file: Buffer,
  filename: string,
  meta: { title: string; introduction?: string },
  slot: number = 1
): Promise<{ mediaId: string }> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(file)], { type: "video/mp4" }), filename || "video.mp4");
  form.append(
    "description",
    JSON.stringify({
      title: meta.title.slice(0, 64) || "视频",
      introduction: (meta.introduction ?? meta.title).slice(0, 256)
    })
  );
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=video`,
    { method: "POST", body: form }
  );
  const text = await resp.text();
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  const mediaId = String(json?.media_id ?? "");
  if (!resp.ok || errcode !== 0 || !mediaId) {
    throw formatWechatApiFailure(text, "视频上传失败");
  }
  return { mediaId };
}

export async function getWechatVideoMaterialStatus(
  db: Pool,
  mediaId: string,
  slot: number = 1
): Promise<{ ready: boolean; title: string; downUrl: string | null; statusMessage: string }> {
  const { accessToken } = await getWechatApiAccess(db);
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/get_material?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: mediaId })
    }
  );
  const text = await resp.text();
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  if (!resp.ok || errcode !== 0) {
    throw new Error(`查询视频状态失败：${text.slice(0, 400)}`);
  }
  const title = String(json?.title ?? "视频");
  const downUrl = json?.down_url == null ? null : String(json.down_url);
  const ready = Boolean(downUrl);
  return {
    ready,
    title,
    downUrl,
    statusMessage: ready ? "视频已转码完成，可插入正文。" : "视频仍在微信后台转码中，请稍后再试。"
  };
}

export function buildWechatVideoEmbedHtml(title: string, downUrl: string): string {
  const safeTitle = title.replace(/"/g, "&quot;");
  const safeUrl = downUrl.replace(/"/g, "&quot;");
  return [
    `<section class="wechat-video-block" style="margin:18px 0;text-align:center;">`,
    `<iframe class="video_iframe rich_pages" frameborder="0" src="${safeUrl}"`,
    ` allowfullscreen="true" style="width:100%;max-width:640px;height:360px;border-radius:8px;background:#000;"></iframe>`,
    `<p style="margin:8px 0 0;font-size:13px;color:#64748b;">${safeTitle}</p>`,
    `</section>`
  ].join("");
}

export type WechatDraftArticleInput = {
  title: string;
  digest?: string;
  contentHtml: string;
  author?: string;
  contentSourceUrl?: string;
  thumbMediaId?: string;
  picCrop2351?: string;
  picCrop11?: string;
};

export type WechatRemoteDraftItem = {
  mediaId: string;
  title: string;
  digest: string;
  updateTime: string | null;
  thumbUrl: string | null;
};

export type WechatRemotePublishedArticle = {
  id: string;
  publishId: string;
  title: string;
  digest: string;
  contentHtml: string;
  author: string;
  articleUrl: string;
  thumbUrl: string | null;
  publishedAt: string | null;
  updateTime: string | null;
};

export type WechatPublishedSyncDebug = {
  appId: string;
  accountName: string;
  tokenOk: boolean;
  material: { status: number; totalCount: number; itemCount: number; raw: unknown };
  freepublish: { status: number; totalCount: number; itemCount: number; raw: unknown };
};

export type WechatPublishDiagnostic = {
  mediaId: string;
  title: string;
  contentChars: number;
  imageCount: number;
  thumbMediaId: string;
  thumbUrl: string | null;
  hasProxyImage: boolean;
  canSubmit: boolean;
  issues: string[];
};

export type WechatPublishStatus = {
  publishId: string;
  publishStatus: number | null;
  statusText: string;
  articleId: string;
  articleUrl: string;
  failIdx: number | null;
  raw: unknown;
};

export async function createWechatDraftFromHtml(
  db: Pool,
  input: WechatDraftArticleInput,
  slot: number = 1
): Promise<{ mediaId: string; message: string }> {
  const { accessToken, settings } = await getWechatApiAccess(db, slot);
  const thumbMediaId = resolveThumbMediaId(input.thumbMediaId, settings);
  const mediaId = await addWechatDraftArticle(accessToken, {
    title: input.title,
    digest: input.digest ?? "",
    contentHtml: input.contentHtml,
    author: input.author || settings.author || "BigSocialBoss",
    contentSourceUrl: input.contentSourceUrl ?? "",
    thumbMediaId,
    picCrop2351: input.picCrop2351,
    picCrop11: input.picCrop11
  });
  return { mediaId, message: "已同步到微信公众号草稿箱。" };
}

export async function listRemoteWechatDrafts(db: Pool, slot: number = 1): Promise<WechatRemoteDraftItem[]> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: 0, count: 50, no_content: 1 })
    }
  );
  const text = await resp.text();
  const json = parseJson(text);
  if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
    throw new Error(`读取微信公众号草稿箱失败：${resp.status} ${text}`);
  }
  const items = Array.isArray(json?.item) ? json.item : [];
  return items.map((item: Record<string, unknown>) => {
    const content = (item.content as Record<string, unknown> | undefined) ?? {};
    const news = Array.isArray(content.news_item) ? content.news_item : [];
    const first = (news[0] as Record<string, unknown> | undefined) ?? {};
    const updateTime = item.update_time ? new Date(Number(item.update_time) * 1000).toISOString() : null;
    return {
      mediaId: String(item.media_id ?? ""),
      title: String(first.title ?? "（无标题）").slice(0, 128),
      digest: String(first.digest ?? "").slice(0, 200),
      updateTime,
      thumbUrl: first.thumb_url == null ? null : String(first.thumb_url)
    };
  });
}

export async function getRemoteWechatDraftDetail(
  db: Pool,
  mediaId: string,
  slot: number = 1
): Promise<{
  mediaId: string;
  title: string;
  digest: string;
  contentHtml: string;
  author: string;
  thumbMediaId: string;
  thumbUrl: string | null;
  updateTime: string | null;
}> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: mediaId })
    }
  );
  const text = await resp.text();
  const json = parseJson(text);
  if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
    throw new Error(`读取草稿详情失败：${resp.status} ${text}`);
  }
  const news = Array.isArray(json?.news_item) ? json.news_item : [];
  const first = (news[0] as Record<string, unknown> | undefined) ?? {};
  const updateTime = json.update_time ? new Date(Number(json.update_time) * 1000).toISOString() : null;
  return {
    mediaId,
    title: String(first.title ?? ""),
    digest: String(first.digest ?? ""),
    contentHtml: String(first.content ?? ""),
    author: String(first.author ?? ""),
    thumbMediaId: String(first.thumb_media_id ?? ""),
    thumbUrl: first.thumb_url == null ? null : String(first.thumb_url),
    updateTime
  };
}

export async function deleteRemoteWechatDraft(db: Pool, mediaId: string, slot: number = 1): Promise<{ message: string }> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const id = mediaId.trim();
  if (!id) throw new Error("缺少草稿 media_id。");
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: id })
    }
  );
  const text = await resp.text();
  const json = parseJson(text);
  if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
    throw new Error(`删除微信公众号草稿失败：${resp.status} ${text}`);
  }
  return { message: "已删除微信公众号草稿箱文章。" };
}

export async function listRemoteWechatPublishedArticles(db: Pool, slot: number = 1): Promise<WechatRemotePublishedArticle[]> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const materials = await listRemoteWechatMaterialArticlesByToken(accessToken);
  const items: Record<string, unknown>[] = [];
  const count = 20;
  for (let offset = 0; offset < 100; offset += count) {
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/freepublish/batchget?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, count, no_content: 0 })
      }
    );
    const text = await resp.text();
    const json = parseJson(text);
    if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
      throw new Error(`读取微信公众号已发布文章失败：${resp.status} ${text}`);
    }
    const page = Array.isArray(json?.item) ? (json.item as Record<string, unknown>[]) : [];
    items.push(...page);
    const total = Number(json?.total_count ?? 0);
    if (page.length < count || (total > 0 && items.length >= total)) break;
  }
  const out: WechatRemotePublishedArticle[] = [...materials];
  for (const item of items) {
    const publishId = String(item.publish_id ?? item.publishid ?? item.msg_data_id ?? item.article_id ?? "").trim();
    const content = (item.content as Record<string, unknown> | undefined) ?? item;
    const news = Array.isArray(content.news_item) ? content.news_item : [];
    const first = (news[0] as Record<string, unknown> | undefined) ?? {};
    const title = String(first.title ?? item.title ?? "（无标题）").trim();
    const articleUrl = String(first.url ?? first.article_url ?? first.content_url ?? first.content_source_url ?? item.article_url ?? "").trim();
    const publishTimeRaw = item.publish_time ?? item.update_time ?? first.publish_time;
    const updateTimeRaw = item.update_time ?? first.update_time;
    const publishedAt = publishTimeRaw ? new Date(Number(publishTimeRaw) * 1000).toISOString() : null;
    const updateTime = updateTimeRaw ? new Date(Number(updateTimeRaw) * 1000).toISOString() : publishedAt;
    const stableId = publishId || articleUrl || title;
    if (!stableId) continue;
    out.push({
      id: `wxpub_${stableId}`.replace(/[^\w-]/g, "").slice(0, 64),
      publishId,
      title: title.slice(0, 128),
      digest: String(first.digest ?? "").slice(0, 200),
      contentHtml: String(first.content ?? ""),
      author: String(first.author ?? ""),
      articleUrl,
      thumbUrl: first.thumb_url == null ? null : String(first.thumb_url),
      publishedAt,
      updateTime
    });
  }
  return dedupeWechatPublishedArticles(out);
}

async function listRemoteWechatMaterialArticlesByToken(accessToken: string): Promise<WechatRemotePublishedArticle[]> {
  const out: WechatRemotePublishedArticle[] = [];
  const count = 20;
  for (let offset = 0; offset < 200; offset += count) {
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "news", offset, count })
      }
    );
    const text = await resp.text();
    const json = parseJson(text);
    if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
      throw new Error(`读取微信公众号素材库图文失败：${resp.status} ${text}`);
    }
    const page = Array.isArray(json?.item) ? (json.item as Record<string, unknown>[]) : [];
    for (const item of page) {
      const mediaId = String(item.media_id ?? "").trim();
      const updateTime = item.update_time ? new Date(Number(item.update_time) * 1000).toISOString() : null;
      const content = (item.content as Record<string, unknown> | undefined) ?? {};
      const news = Array.isArray(content.news_item) ? content.news_item : [];
      news.forEach((raw, idx) => {
        const first = (raw as Record<string, unknown> | undefined) ?? {};
        const title = String(first.title ?? "（无标题）").trim();
        const articleUrl = String(first.url ?? first.content_url ?? first.content_source_url ?? "").trim();
        if (!title || !articleUrl) return;
        const msgid = extractWechatArticleMsgid(articleUrl);
        const stableId = msgid || articleUrl || `${mediaId}_${idx + 1}`;
        out.push({
          id: `wxmat_${stableId}`.replace(/[^\w-]/g, "").slice(0, 64),
          publishId: msgid,
          title: title.slice(0, 128),
          digest: String(first.digest ?? "").slice(0, 200),
          contentHtml: String(first.content ?? ""),
          author: String(first.author ?? ""),
          articleUrl,
          thumbUrl: first.thumb_url == null ? null : String(first.thumb_url),
          publishedAt: updateTime,
          updateTime
        });
      });
    }
    const total = Number(json?.total_count ?? 0);
    if (page.length < count || (total > 0 && offset + page.length >= total)) break;
  }
  return out;
}

export async function debugWechatPublishedSync(db: Pool, slot: number = 1): Promise<WechatPublishedSyncDebug> {
  const { accessToken, settings } = await getWechatApiAccess(db, slot);
  const materialResp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "news", offset: 0, count: 20 })
    }
  );
  const materialText = await materialResp.text();
  const materialJson = parseJson(materialText);
  const freepublishResp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/freepublish/batchget?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: 0, count: 20, no_content: 0 })
    }
  );
  const freepublishText = await freepublishResp.text();
  const freepublishJson = parseJson(freepublishText);
  const debug: WechatPublishedSyncDebug = {
    appId: settings.appId,
    accountName: settings.accountName,
    tokenOk: true,
    material: {
      status: materialResp.status,
      totalCount: Number(materialJson?.total_count ?? 0),
      itemCount: Number(materialJson?.item_count ?? (Array.isArray(materialJson?.item) ? materialJson.item.length : 0)),
      raw: redactWechatDebugPayload(materialJson ?? materialText)
    },
    freepublish: {
      status: freepublishResp.status,
      totalCount: Number(freepublishJson?.total_count ?? 0),
      itemCount: Number(freepublishJson?.item_count ?? (Array.isArray(freepublishJson?.item) ? freepublishJson.item.length : 0)),
      raw: redactWechatDebugPayload(freepublishJson ?? freepublishText)
    }
  };
  console.info("[wechat-official] published sync debug", JSON.stringify(debug));
  return debug;
}

function dedupeWechatPublishedArticles(items: WechatRemotePublishedArticle[]): WechatRemotePublishedArticle[] {
  const byKey = new Map<string, WechatRemotePublishedArticle>();
  for (const item of items) {
    const key = item.publishId || item.articleUrl || item.id;
    if (!key) continue;
    const old = byKey.get(key);
    if (!old || (!old.contentHtml && item.contentHtml) || (!old.thumbUrl && item.thumbUrl)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const bt = Date.parse(b.publishedAt ?? b.updateTime ?? "") || 0;
    const at = Date.parse(a.publishedAt ?? a.updateTime ?? "") || 0;
    return bt - at;
  });
}

function redactWechatDebugPayload(raw: unknown): unknown {
  if (raw == null) return raw;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const clipped = text.slice(0, 6000);
  return parseJson(clipped) ?? clipped;
}

export async function importWechatPublishedArticleUrl(input: {
  url: string;
  title?: string;
  accountName?: string;
  publishedAt?: string;
}): Promise<WechatRemotePublishedArticle> {
  const url = normalizeWechatArticleUrl(input.url);
  const requestedTitle = (input.title ?? "").trim();
  const publishedAt = parseOptionalIso(input.publishedAt) ?? new Date().toISOString();
  let html = "";
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Referer: "https://mp.weixin.qq.com/"
      }
    });
    if (resp.ok) html = await resp.text();
  } catch {
    html = "";
  }

  const extractedTitle =
    requestedTitle ||
    extractWechatArticleMeta(html, ["og:title", "twitter:title"]) ||
    extractWechatArticleVar(html, "msg_title") ||
    extractHtmlTitle(html) ||
    "微信公众号已发布文章";
  const digest =
    extractWechatArticleMeta(html, ["og:description", "description"]) ||
    extractWechatArticleVar(html, "msg_desc") ||
    "";
  const thumbUrl =
    extractWechatArticleMeta(html, ["og:image", "twitter:image"]) ||
    extractWechatArticleVar(html, "msg_cdn_url") ||
    null;
  const author =
    extractWechatArticleVar(html, "nickname") ||
    extractWechatArticleVar(html, "user_name") ||
    (input.accountName ?? "").trim();
  const contentHtml = extractWechatJsContent(html) || buildWechatArticleLinkFallbackHtml(extractedTitle, digest, url);
  if (
    html &&
    /已停止访问该网页|该内容已被发布者删除|此内容因违规无法查看/i.test(html) &&
    !extractWechatJsContent(html)
  ) {
    throw new Error(
      "该公众号文章链接在微信侧已失效（已停止访问/已删除）。请从微信后台复制最新的「永久链接」后再保存模版。"
    );
  }
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 20);

  const msgid = extractWechatArticleMsgid(url);
  return {
    id: `wxlink_${hash}`,
    publishId: msgid,
    title: extractedTitle.slice(0, 128),
    digest: digest.slice(0, 200),
    contentHtml,
    author,
    articleUrl: url,
    thumbUrl,
    publishedAt,
    updateTime: publishedAt
  };
}

export async function updateRemoteWechatDraft(
  db: Pool,
  mediaId: string,
  input: WechatDraftArticleInput,
  slot: number = 1
): Promise<{ message: string }> {
  const { accessToken, settings } = await getWechatApiAccess(db, slot);
  const detail = await getRemoteWechatDraftDetail(db, mediaId, slot);
  const thumbMediaId = resolveThumbMediaId(input.thumbMediaId, settings);
  const articles: Record<string, unknown> = {
    title: input.title.slice(0, 64) || detail.title.slice(0, 64),
    author: input.author || settings.author || "BigSocialBoss",
    digest: (input.digest ?? detail.digest).slice(0, 120),
    content: input.contentHtml || detail.contentHtml,
    content_source_url: input.contentSourceUrl ?? "",
    thumb_media_id: thumbMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0
  };
  /**
   * 更新微信后台已有草稿时不复用本地裁剪参数。
   * 远端封面可能已在公众号后台替换过，旧裁剪坐标会触发 53401「封面图片尺寸不合法」。
   */
  const payload = {
    media_id: mediaId,
    index: 0,
    articles
  };
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  const text = await resp.text();
  const json = parseJson(text);
  if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
    throw new Error(`更新微信公众号草稿失败：${resp.status} ${text}`);
  }
  return { message: "草稿已更新。" };
}

export async function submitWechatDraftByMediaId(db: Pool, mediaId: string, slot: number = 1): Promise<{ publishId: string; message: string }> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const readyMediaId = await assertWechatDraftPublishable(accessToken, mediaId);
  const publishId = await submitWechatPublish(accessToken, readyMediaId);
  return { publishId, message: "已提交微信公众号正式发布。" };
}

export async function diagnoseWechatDraftForPublish(db: Pool, mediaId: string, slot: number = 1): Promise<WechatPublishDiagnostic> {
  const { accessToken } = await getWechatApiAccess(db, slot);
  const detail = await readWechatDraftForPublish(accessToken, mediaId);
  const content = detail.contentHtml;
  const issues: string[] = [];
  if (!detail.title) issues.push("缺少标题");
  if (!content.trim()) issues.push("正文为空");
  if (!detail.thumbMediaId) issues.push("缺少封面 thumb_media_id");
  if (content.includes("/api/wechat-official/image-proxy")) issues.push("正文仍含本站图片代理地址，微信无法识别");
  if (content.length > 120000) issues.push("正文 HTML 超过 120000 字符");
  return {
    mediaId: detail.mediaId,
    title: detail.title,
    contentChars: content.length,
    imageCount: (content.match(/<img\b/gi) ?? []).length,
    thumbMediaId: detail.thumbMediaId,
    thumbUrl: detail.thumbUrl,
    hasProxyImage: content.includes("/api/wechat-official/image-proxy"),
    canSubmit: issues.length === 0,
    issues
  };
}

export async function getWechatPublishStatus(db: Pool, publishId: string): Promise<WechatPublishStatus> {
  const { accessToken } = await getWechatApiAccess(db);
  return getWechatPublishStatusByToken(accessToken, publishId);
}

export async function listWechatScheduledPublishes(db: Pool): Promise<WechatScheduledPublishTask[]> {
  await ensureWechatPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT *
       FROM wechat_scheduled_publishes
      ORDER BY
        CASE status WHEN 'scheduled' THEN 0 WHEN 'running' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
        scheduled_at ASC,
        id DESC
      LIMIT 100`
  );
  return (rows as Record<string, unknown>[]).map(mapScheduledPublishRow);
}

export async function createWechatScheduledPublish(
  db: Pool,
  input: { mediaId: string; title?: string; localId?: string; scheduledAt: string }
): Promise<WechatScheduledPublishTask[]> {
  await ensureWechatPublishingSchema(db);
  const mediaId = input.mediaId.trim();
  if (!mediaId) throw new Error("缺少草稿 media_id。");
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("请选择有效的发布时间。");
  if (scheduledAt.getTime() < Date.now() - 30_000) throw new Error("发布时间不能早于当前时间。");

  await db.query(
    `INSERT INTO wechat_scheduled_publishes (media_id, local_id, title, scheduled_at, status)
     VALUES (?, ?, ?, ?, 'scheduled')`,
    [
      mediaId.slice(0, 256),
      input.localId?.trim().slice(0, 128) || null,
      input.title?.trim().slice(0, 512) || "微信公众号草稿",
      scheduledAt
    ]
  );
  return listWechatScheduledPublishes(db);
}

export async function tickWechatScheduledPublishes(db: Pool): Promise<void> {
  await ensureWechatPublishingSchema(db);
  const [rows] = await db.query(
    `SELECT id, media_id
       FROM wechat_scheduled_publishes
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC, id ASC
      LIMIT 5`
  );
  for (const row of rows as Array<{ id: number; media_id: string }>) {
    const [claimed] = await db.query(
      `UPDATE wechat_scheduled_publishes
          SET status = 'running', last_error = NULL
        WHERE id = ? AND status = 'scheduled'`,
      [row.id]
    );
    if ((claimed as { affectedRows?: number }).affectedRows !== 1) continue;
    try {
      const result = await submitWechatDraftByMediaId(db, String(row.media_id));
      await db.query(
        `UPDATE wechat_scheduled_publishes
            SET status = 'published',
                publish_id = ?,
                published_at = NOW(),
                last_error = NULL
          WHERE id = ?`,
        [result.publishId, row.id]
      );
    } catch (e: unknown) {
      await db.query(
        `UPDATE wechat_scheduled_publishes
            SET status = 'failed',
                last_error = ?
          WHERE id = ?`,
        [String((e as Error)?.message ?? e).slice(0, 4000), row.id]
      );
    }
  }
}

let wechatScheduleHandle: ReturnType<typeof setInterval> | null = null;

export function startWechatScheduledPublishScheduler(db: Pool): void {
  if (wechatScheduleHandle) return;
  void tickWechatScheduledPublishes(db).catch((e) => {
    console.error("[wechat scheduled publish] startup tick failed:", (e as Error)?.message ?? e);
  });
  wechatScheduleHandle = setInterval(() => {
    void tickWechatScheduledPublishes(db).catch((e) => {
      console.error("[wechat scheduled publish] tick failed:", (e as Error)?.message ?? e);
    });
  }, 60_000);
}

export async function testWechatConnection(db: Pool, slot: number = 1): Promise<{ ok: boolean; message: string }> {
  const settings = await getWechatSettings(db, slot);
  if (!settings.appId) return { ok: false, message: "请先填写并保存 AppID。" };
  const appSecret = await getAppSecret(db, slot);
  if (!appSecret) return { ok: false, message: "请先填写并保存 AppSecret。" };
  await requestWechatAccessToken(settings.appId, appSecret);
  if (!settings.thumbMediaId) {
    return {
      ok: true,
      message: "微信公众号 API 连接成功。同步草稿箱前请在「默认封面 thumb_media_id」栏补充永久素材 ID 并再次保存。"
    };
  }
  return { ok: true, message: "微信公众号 API 连接成功。" };
}

async function addWechatDraft(
  accessToken: string,
  article: BlogArticle,
  settings: { author: string; thumbMediaId: string }
): Promise<string> {
  return addWechatDraftArticle(accessToken, {
    title: String(article.frontmatter.title ?? article.slug),
    digest: String(article.frontmatter.description ?? ""),
    contentHtml: markdownToWechatHtml(article),
    author: settings.author || "BigSocialBoss",
    contentSourceUrl: canonicalUrlFor(article.slug),
    thumbMediaId: settings.thumbMediaId
  });
}

async function addWechatDraftArticle(
  accessToken: string,
  input: {
    title: string;
    digest: string;
    contentHtml: string;
    author: string;
    contentSourceUrl: string;
    thumbMediaId: string;
    picCrop2351?: string;
    picCrop11?: string;
  }
): Promise<string> {
  const article: Record<string, unknown> = {
    title: input.title.slice(0, 64),
    author: input.author || "BigSocialBoss",
    digest: input.digest.slice(0, 120),
    content: input.contentHtml,
    content_source_url: input.contentSourceUrl,
    thumb_media_id: input.thumbMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0
  };
  if (input.picCrop2351?.trim()) article.pic_crop_235_1 = input.picCrop2351.trim();
  if (input.picCrop11?.trim()) article.pic_crop_1_1 = input.picCrop11.trim();
  const payload = {
    articles: [article]
  };
  const resp = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  const json = parseJson(text);
  const mediaId = normalizeWechatMediaId(String(json?.media_id ?? ""));
  if (!resp.ok || !mediaId) throw new Error(`微信公众号草稿创建失败：${resp.status} ${text}`);
  return mediaId;
}

function normalizeWechatMediaId(mediaId: string): string {
  return mediaId.trim().replace(/^["']+|["']+$/g, "");
}

function wechatPublishSubmitError(errcode: number, errmsg: string, rawText: string): Error {
  const hintByCode: Record<number, string> = {
    [-1]:
      "微信服务器返回系统错误。常见原因：草稿未在微信后台保存、正文/封面不合规、或公众号未企业认证。请登录 mp.weixin.qq.com 打开该草稿并手动保存后重试；若仍失败，在「创建文章」重新同步草稿箱。",
    40007: "草稿 media_id 无效或已从草稿箱删除。请在「创建文章」重新同步到草稿箱，或刷新草稿箱后重试。",
    48001: "公众号未开通「发布能力」接口。请登录微信公众平台 → 开发 → 接口权限，确认已企业认证且具备发布接口。",
    53503: "该草稿未通过微信发布检查。请核对标题、封面、正文是否完整，并在微信后台打开草稿保存后再试。",
    53504: "该草稿需前往微信公众平台官网打开并保存后才能发布。",
    53505: "请先在微信公众平台官网打开该草稿并手动保存成功，再回来提交正式发布。"
  };
  const hint = hintByCode[errcode];
  if (hint) return new Error(`微信公众号发布提交失败（${errcode}）：${hint}`);
  if (errcode) return new Error(`微信公众号发布提交失败（${errcode}）：${errmsg || rawText.slice(0, 400)}`);
  return new Error(`微信公众号发布提交失败：${rawText.slice(0, 400)}`);
}

/** 发布前读取草稿并校验；返回规范化 media_id（兼容微信偶发需先 get 再 submit 的情况） */
async function assertWechatDraftPublishable(accessToken: string, mediaId: string): Promise<string> {
  const detail = await readWechatDraftForPublish(accessToken, mediaId);
  const issues: string[] = [];
  if (!detail.title) issues.push("草稿缺少标题，无法发布。请编辑草稿后保存到微信草稿箱再试。");
  if (!detail.contentHtml.trim()) issues.push("草稿正文为空，无法发布。请编辑草稿后保存到微信草稿箱再试。");
  if (!detail.thumbMediaId) issues.push("草稿缺少封面图（thumb_media_id）。请在「创建文章」上传封面并重新同步到草稿箱。");
  if (detail.contentHtml.includes("/api/wechat-official/image-proxy")) {
    issues.push("草稿正文仍含本站图片代理地址，微信无法识别。请在「创建文章」打开该文，重新同步到草稿箱后再发布。");
  }
  if (issues.length) throw new Error(issues.join("；"));
  return detail.mediaId;
}

async function readWechatDraftForPublish(
  accessToken: string,
  mediaId: string
): Promise<{ mediaId: string; title: string; contentHtml: string; thumbMediaId: string; thumbUrl: string | null }> {
  const normalizedId = normalizeWechatMediaId(mediaId);
  if (!normalizedId) throw new Error("缺少草稿 media_id。");

  const resp = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: normalizedId })
  });
  const text = await resp.text();
  const json = parseJson(text);
  const errcode = Number(json?.errcode ?? 0);
  if (!resp.ok || errcode !== 0) {
    if (errcode === 40007) {
      throw new Error("草稿不存在或 media_id 已失效。请刷新草稿箱；若文章已消失，请在「创建文章」重新同步到草稿箱。");
    }
    throw formatWechatApiFailure(text, "读取草稿失败，无法提交发布");
  }

  const news = Array.isArray(json?.news_item) ? json.news_item : [];
  const first = (news[0] as Record<string, unknown> | undefined) ?? {};
  const title = String(first.title ?? "").trim();
  const content = String(first.content ?? "");
  const thumbMediaId = String(first.thumb_media_id ?? "").trim();
  return {
    mediaId: normalizedId,
    title,
    contentHtml: content,
    thumbMediaId,
    thumbUrl: first.thumb_url == null ? null : String(first.thumb_url)
  };
}

async function submitWechatPublish(accessToken: string, mediaId: string): Promise<string> {
  const normalizedId = normalizeWechatMediaId(mediaId);
  let lastText = "";
  let lastJson: any = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const resp = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: normalizedId })
    });
    const text = await resp.text();
    const json = parseJson(text);
    lastText = text;
    lastJson = json;
    const errcode = Number(json?.errcode ?? (resp.ok ? 0 : -1));
    if (errcode === 0) {
      const publishId = String(json?.publish_id ?? json?.msg_data_id ?? "");
      if (!publishId) throw new Error(`微信公众号发布提交失败：未返回 publish_id。${text.slice(0, 400)}`);
      return publishId;
    }
    if (errcode !== -1 || attempt >= 4) {
      const err = wechatPublishSubmitError(errcode, String(json?.errmsg ?? ""), text);
      if (errcode === -1 && attempt >= 4) {
        err.message = `${err.message}（已自动重试 ${attempt} 次仍失败）`;
      }
      throw err;
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`微信公众号发布提交失败：${String(lastJson?.errmsg ?? lastText).slice(0, 400)}`);
}

async function getWechatPublishStatusByToken(accessToken: string, publishId: string): Promise<WechatPublishStatus> {
  const id = publishId.trim();
  if (!id) throw new Error("缺少 publish_id。");
  const resp = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/get?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publish_id: id })
  });
  const text = await resp.text();
  const json = parseJson(text);
  if (!resp.ok || Number(json?.errcode ?? 0) !== 0) {
    throw formatWechatApiFailure(text, "查询微信公众号发布状态失败");
  }
  const status = json?.publish_status == null ? null : Number(json.publish_status);
  const articleId = String(json?.article_id ?? json?.article_detail?.article_id ?? "");
  const articleUrl = String(json?.article_url ?? json?.article_detail?.article_url ?? "");
  return {
    publishId: id,
    publishStatus: status,
    statusText: wechatPublishStatusText(status),
    articleId,
    articleUrl,
    failIdx: json?.fail_idx == null ? null : Number(json.fail_idx),
    raw: redactWechatDebugPayload(json)
  };
}

function wechatPublishStatusText(status: number | null): string {
  const labels: Record<number, string> = {
    0: "发布成功",
    1: "发布中",
    2: "原创校验失败",
    3: "常规失败",
    4: "平台审核不通过",
    5: "成功后用户删除",
    6: "平台处理中"
  };
  return status == null ? "未知状态" : labels[status] ?? `未知状态 ${status}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAppSecret(db: Pool, slot: number = 1): Promise<string> {
  const { row } = await readWechatSettingRow(db, slot);
  const enc = row?.api_key_enc?.trim();
  return enc ? decryptSecret(enc).trim() : "";
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

function markdownToWechatHtml(article: BlogArticle): string {
  const title = escapeHtml(String(article.frontmatter.title ?? article.slug));
  const intro = escapeHtml(String(article.frontmatter.description ?? ""));
  const paragraphs = article.body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("```") && !block.startsWith("|"))
    .slice(0, 80)
    .map((block) => {
      const heading = block.match(/^#{2,4}\s+(.+)$/);
      if (heading) return `<h2>${escapeHtml(cleanMarkdown(heading[1] ?? ""))}</h2>`;
      return `<p>${escapeHtml(cleanMarkdown(block)).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return `<section><h1>${title}</h1>${intro ? `<p><strong>${intro}</strong></p>` : ""}${paragraphs}<p>原文链接：${escapeHtml(canonicalUrlFor(article.slug))}</p></section>`;
}

function cleanMarkdown(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeWechatArticleUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("请填写微信公众号已发布文章链接。");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("微信公众号文章链接格式不正确。");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "mp.weixin.qq.com" && host !== "mp.weixinbridge.com") {
    throw new Error("请填写 mp.weixin.qq.com 的公众号文章链接。");
  }
  url.hash = "";
  return url.toString();
}

function parseOptionalIso(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractWechatArticleMsgid(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const mid = (url.searchParams.get("mid") || url.searchParams.get("__biz_mid") || "").trim();
    const idx = (url.searchParams.get("idx") || "1").trim();
    return mid && idx ? `${mid}_${idx}`.slice(0, 128) : "";
  } catch {
    return "";
  }
}

function extractWechatArticleMeta(html: string, keys: string[]): string {
  if (!html) return "";
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    );
    const reversePattern = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]*>`,
      "i"
    );
    const match = html.match(pattern) || html.match(reversePattern);
    if (match?.[1]) return decodeHtml(String(match[1])).trim();
  }
  return "";
}

function extractWechatArticleVar(html: string, name: string): string {
  if (!html) return "";
  const match = html.match(new RegExp(`(?:var\\s+)?${escapeRegExp(name)}\\s*=\\s*(['"])([\\s\\S]*?)\\1\\s*[;,]`, "i"));
  if (!match?.[2]) return "";
  return decodeJsString(String(match[2])).trim();
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(stripTags(match[1])).trim() : "";
}

function extractWechatJsContent(html: string): string {
  if (!html) return "";
  const start = html.search(/<[^>]+id=["']js_content["'][^>]*>/i);
  if (start < 0) return "";
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return "";
  const afterOpen = openEnd + 1;
  const endCandidates = [
    html.indexOf('<script nonce="', afterOpen),
    html.indexOf("<script", afterOpen),
    html.indexOf('<div id="js_toobar3"', afterOpen),
    html.indexOf('<div class="rich_media_tool"', afterOpen)
  ].filter((idx) => idx > afterOpen);
  const end = endCandidates.length ? Math.min(...endCandidates) : html.indexOf("</body>", afterOpen);
  const raw = html.slice(afterOpen, end > afterOpen ? end : undefined);
  return sanitizeImportedWechatHtml(raw).trim();
}

function sanitizeImportedWechatHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+data-src=/gi, " src=")
    .replace(/\s+data-backsrc=/gi, " data-backsrc=")
    .replace(/\s+crossorigin=(["']).*?\1/gi, "")
    .replace(/\s+referrerpolicy=(["']).*?\1/gi, "");
}

function buildWechatArticleLinkFallbackHtml(title: string, digest: string, url: string): string {
  const safeTitle = escapeHtml(title || "微信公众号文章");
  const safeDigest = escapeHtml(digest || "");
  const safeUrl = escapeHtml(url);
  return [
    `<section><h1>${safeTitle}</h1>`,
    safeDigest ? `<p>${safeDigest}</p>` : "",
    `<p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">打开微信公众号原文</a></p></section>`
  ].join("");
}

function decodeHtml(raw: string): string {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number.parseInt(num, 10)));
}

function decodeJsString(raw: string): string {
  try {
    return decodeHtml(JSON.parse(`"${raw.replace(/"/g, '\\"')}"`));
  } catch {
    return decodeHtml(raw.replace(/\\\//g, "/").replace(/\\n/g, "\n").replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))));
  }
}

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ");
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapItemRow(row: Record<string, unknown>): WechatPublishItem {
  return {
    id: Number(row.id),
    platform: PLATFORM,
    sourceSlug: String(row.source_slug ?? ""),
    sourceLocale: String(row.source_locale ?? "zh"),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    canonicalUrl: String(row.canonical_url ?? ""),
    trackingUrl: String(row.tracking_url ?? ""),
    status: String(row.status ?? "queued") as SocialPublishStatus,
    queueOrder: Number(row.queue_order ?? 0),
    publishedAt: row.published_at ? new Date(row.published_at as string | Date).toISOString() : null,
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

function mapPlanRow(row: Record<string, unknown>): WechatReadingPlan {
  let channels: string[] = [];
  try {
    channels = JSON.parse(String(row.promotion_channels_json || "[]"));
  } catch {
    channels = [];
  }
  return {
    id: Number(row.id),
    articleTitle: String(row.article_title ?? ""),
    articleUrl: String(row.article_url ?? ""),
    targetReads: Number(row.target_reads ?? 0),
    actualReads: Number(row.actual_reads ?? 0),
    promotionChannels: channels,
    status: String(row.status ?? "planned") as WechatReadingPlan["status"],
    note: String(row.note ?? ""),
    createdAt: row.created_at ? new Date(row.created_at as string | Date).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null
  };
}

function mapScheduledPublishRow(row: Record<string, unknown>): WechatScheduledPublishTask {
  return {
    id: Number(row.id),
    mediaId: String(row.media_id ?? ""),
    localId: row.local_id == null ? null : String(row.local_id),
    title: String(row.title ?? ""),
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at as string | Date).toISOString() : "",
    status: String(row.status ?? "scheduled") as WechatScheduledPublishTask["status"],
    publishId: row.publish_id == null ? null : String(row.publish_id),
    publishedAt: row.published_at ? new Date(row.published_at as string | Date).toISOString() : null,
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: row.created_at ? new Date(row.created_at as string | Date).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null
  };
}

function attachEstimatedPublishTimes(items: WechatPublishItem[]): WechatPublishItem[] {
  let queuedIndex = 0;
  const now = Date.now();
  return items.map((item) => {
    if (item.status !== "queued") return item;
    const estimated = new Date(now + queuedIndex * 24 * 60 * 60 * 1000).toISOString();
    queuedIndex += 1;
    return { ...item, estimatedPublishAt: estimated };
  });
}

function parseConfig(raw: string | null | undefined): { appId: string; accountName: string; author: string; thumbMediaId: string } {
  try {
    const obj = JSON.parse(String(raw || "{}")) as Record<string, unknown>;
    return {
      appId: String(obj.appId ?? ""),
      accountName: String(obj.accountName ?? ""),
      author: String(obj.author ?? ""),
      thumbMediaId: String(obj.thumbMediaId ?? "")
    };
  } catch {
    return { appId: "", accountName: "", author: "", thumbMediaId: "" };
  }
}

function hintForSecret(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function canonicalUrlFor(slug: string): string {
  return `${siteOrigin()}/zh/${encodeURIComponent(slug)}`;
}

function trackingUrlFor(slug: string): string {
  return `${canonicalUrlFor(slug)}?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${encodeURIComponent(slug)}`;
}

function siteOrigin(): string {
  return (process.env.PUBLIC_SITE_ORIGIN || "").replace(/\/$/, "");
}

function queueOrderFromPublishedAt(publishedAt: string, slug: string): number {
  const time = Date.parse(publishedAt);
  if (Number.isFinite(time)) return time;
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 9_000_000_000_000 + hash;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
