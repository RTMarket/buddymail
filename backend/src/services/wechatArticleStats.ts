import { createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";
import {
  buildStandaloneWechatArticleGoUrl,
  resolveStandaloneEmailPublicBaseUrl
} from "../lib/standaloneEmailPublicBaseUrl.js";
import { loadWechatArticleEmailStatsByTemplateIds } from "./wechatArticleEmailStats.js";
import { ensureWechatPublishingSchema } from "./socialPublishingWechat.js";

export type WechatArticleRegistryInput = {
  draftId: string;
  title?: string;
  publishId?: string;
  publishedArticleUrl?: string;
  linkedEmailTemplateId?: number;
  publishedAt?: string;
};

export type WechatArticleStatsRow = {
  draftId: string;
  wechatOfficialReads: number | null;
  emailDrivenReads: number;
  emailSent: number;
  emailOpened: number;
  emailClicked: number;
  statsNote?: string;
};

let statsSchemaReady = false;

export async function ensureWechatArticleStatsSchema(db: Pool): Promise<void> {
  if (statsSchemaReady) return;
  await ensureWechatPublishingSchema(db);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wechat_publisher_article_links (
      tenant_id BIGINT NOT NULL,
      draft_id VARCHAR(64) NOT NULL,
      title VARCHAR(512) NOT NULL DEFAULT '',
      publish_id VARCHAR(128) NULL,
      published_article_url VARCHAR(1200) NULL,
      linked_email_template_id BIGINT NULL,
      published_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, draft_id),
      KEY idx_wechat_pub_publish (tenant_id, publish_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wechat_publisher_article_go_clicks (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id BIGINT NOT NULL,
      draft_id VARCHAR(64) NOT NULL,
      template_id BIGINT NULL,
      ip_hash VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      clicked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_wechat_go_draft (tenant_id, draft_id),
      KEY idx_wechat_go_time (clicked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  statsSchemaReady = true;
}

export function resolveWechatArticleGoBaseUrl(): string {
  return resolveStandaloneEmailPublicBaseUrl().replace(/\/+$/, "");
}

export function buildWechatArticleGoUrl(draftId: string): string {
  return buildStandaloneWechatArticleGoUrl(draftId);
}

/** 涨阅读邮件模版：按模版 ID 查登记的文章，返回追踪跳转（发送时底栏「阅读原文」托底） */
export async function resolveWechatReadUrlForTemplate(
  db: Pool,
  tenantId: number,
  templateId: number | null | undefined
): Promise<string> {
  const tid = templateId != null ? Math.floor(Number(templateId)) : 0;
  if (tenantId <= 0 || tid <= 0) return "";
  await ensureWechatArticleStatsSchema(db);
  const [rows] = await db.query(
    `SELECT draft_id FROM wechat_publisher_article_links
      WHERE tenant_id = ? AND linked_email_template_id = ?
      LIMIT 1`,
    [tenantId, tid]
  );
  const draftId = String((rows as Array<{ draft_id?: unknown }>)[0]?.draft_id ?? "").trim();
  if (!draftId) return "";
  return buildWechatArticleGoUrl(draftId);
}

export async function upsertWechatArticleRegistry(
  db: Pool,
  tenantId: number,
  input: WechatArticleRegistryInput
): Promise<{ trackedGoUrl: string }> {
  await ensureWechatArticleStatsSchema(db);
  const draftId = input.draftId.trim().slice(0, 64);
  if (!draftId || tenantId <= 0) throw new Error("无效的文章标识。");

  const publishId = (input.publishId ?? "").trim().slice(0, 128) || null;
  const publishedUrl = (input.publishedArticleUrl ?? "").trim().slice(0, 1200) || null;
  const title = (input.title ?? "").trim().slice(0, 512);
  const templateId =
    typeof input.linkedEmailTemplateId === "number" && input.linkedEmailTemplateId > 0
      ? Math.floor(input.linkedEmailTemplateId)
      : null;
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  const publishedAtSql =
    publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;

  await db.query(
    `INSERT INTO wechat_publisher_article_links
       (tenant_id, draft_id, title, publish_id, published_article_url, linked_email_template_id, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = COALESCE(NULLIF(VALUES(title), ''), title),
       publish_id = COALESCE(VALUES(publish_id), publish_id),
       published_article_url = COALESCE(VALUES(published_article_url), published_article_url),
       linked_email_template_id = COALESCE(VALUES(linked_email_template_id), linked_email_template_id),
       published_at = COALESCE(VALUES(published_at), published_at)`,
    [tenantId, draftId, title, publishId, publishedUrl, templateId, publishedAtSql]
  );

  return { trackedGoUrl: buildWechatArticleGoUrl(draftId) };
}

export async function resolveWechatArticleGoRedirect(
  db: Pool,
  draftId: string
): Promise<{ tenantId: number; redirectUrl: string; templateId: number | null } | null> {
  await ensureWechatArticleStatsSchema(db);
  const id = draftId.trim().slice(0, 64);
  if (!id) return null;
  const [rows] = await db.query(
    `SELECT tenant_id, published_article_url, linked_email_template_id
       FROM wechat_publisher_article_links
      WHERE draft_id = ?
      LIMIT 1`,
    [id]
  );
  const row = (rows as Array<{
    tenant_id: unknown;
    published_article_url: string | null;
    linked_email_template_id: unknown;
  }>)[0];
  if (!row?.published_article_url?.trim()) return null;
  return {
    tenantId: Number(row.tenant_id),
    redirectUrl: row.published_article_url.trim(),
    templateId:
      row.linked_email_template_id == null ? null : Math.floor(Number(row.linked_email_template_id))
  };
}

export async function logWechatArticleGoClick(
  db: Pool,
  tenantId: number,
  draftId: string,
  templateId: number | null,
  ip: string,
  userAgent: string
): Promise<void> {
  await ensureWechatArticleStatsSchema(db);
  const ipHash = createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 32);
  await db.query(
    `INSERT INTO wechat_publisher_article_go_clicks
       (tenant_id, draft_id, template_id, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, draftId.slice(0, 64), templateId, ipHash, userAgent.slice(0, 512)]
  );
}

function formatWechatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

type ArticleReadItem = {
  ref_date?: string;
  msgid?: string;
  read_user?: number;
  read_count?: number;
};

/** 按 publish_id 拉取微信官方阅读次数（datacube/getarticleread，T+1 有数据） */
export async function fetchWechatOfficialReadCount(
  accessToken: string,
  publishId: string,
  publishedAt: string | null
): Promise<{ readCount: number | null; note?: string }> {
  const pid = publishId.trim();
  if (!pid) return { readCount: null, note: "未记录 publish_id" };

  const msgid = pid.includes("_") ? pid : `${pid}_1`;
  const start = publishedAt ? new Date(publishedAt) : new Date(Date.now() - 7 * 86400000);
  if (Number.isNaN(start.getTime())) start.setTime(Date.now() - 7 * 86400000);

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - 1);

  if (start > end) {
    return { readCount: null, note: "微信阅读数据通常次日更新" };
  }

  let bestDate = "";
  let bestReadCount = 0;
  let bestReadUser = 0;
  let hadData = false;

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = formatWechatDate(cursor);
    try {
      const resp = await fetch(
        `https://api.weixin.qq.com/datacube/getarticleread?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ begin_date: day, end_date: day })
        }
      );
      const text = await resp.text();
      const json = JSON.parse(text) as { errcode?: number; list?: ArticleReadItem[] };
      if (Number(json?.errcode ?? 0) !== 0) continue;
      const list = Array.isArray(json.list) ? json.list : [];
      for (const item of list) {
        if (String(item.msgid ?? "") !== msgid) continue;
        hadData = true;
        const refDate = String(item.ref_date ?? day);
        const rc = Math.max(0, Number(item.read_count ?? 0));
        const ru = Math.max(0, Number(item.read_user ?? 0));
        if (refDate >= bestDate) {
          bestDate = refDate;
          bestReadCount = rc;
          bestReadUser = ru;
        }
      }
    } catch {
      /* skip day */
    }
  }

  if (!hadData) {
    return { readCount: null, note: "微信 API 暂无阅读数据（需认证号，且通常 T+1）" };
  }

  const readCount = bestReadCount > 0 ? bestReadCount : bestReadUser;
  return { readCount, note: bestReadCount > 0 ? undefined : "使用阅读人数（次数为 0）" };
}

export async function countEmailDrivenReads(
  db: Pool,
  tenantId: number,
  draftIds: string[]
): Promise<Map<string, number>> {
  await ensureWechatArticleStatsSchema(db);
  const ids = [...new Set(draftIds.map((d) => d.trim()).filter(Boolean))];
  const map = new Map<string, number>();
  if (!ids.length || tenantId <= 0) return map;

  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await db.query(
    `SELECT draft_id, COUNT(*) AS click_count
       FROM wechat_publisher_article_go_clicks
      WHERE tenant_id = ? AND draft_id IN (${placeholders})
      GROUP BY draft_id`,
    [tenantId, ...ids]
  );
  for (const r of rows as Array<{ draft_id: string; click_count: unknown }>) {
    map.set(String(r.draft_id), Number(r.click_count ?? 0));
  }
  return map;
}

export type WechatArticleStatsRequestItem = {
  draftId: string;
  publishId?: string;
  publishedAt?: string;
  linkedEmailTemplateId?: number;
};

/** 合并微信官方阅读 + 邮件导流点击 + 邮件模版发送统计 */
export async function loadWechatArticleStatsBatch(
  db: Pool,
  tenantId: number,
  items: WechatArticleStatsRequestItem[],
  getAccessToken: () => Promise<string>
): Promise<WechatArticleStatsRow[]> {
  const normalized = items
    .map((item) => ({
      draftId: item.draftId.trim().slice(0, 64),
      publishId: (item.publishId ?? "").trim(),
      publishedAt: item.publishedAt ?? null,
      linkedEmailTemplateId:
        typeof item.linkedEmailTemplateId === "number" && item.linkedEmailTemplateId > 0
          ? Math.floor(item.linkedEmailTemplateId)
          : null
    }))
    .filter((item) => item.draftId);

  const draftIds = normalized.map((i) => i.draftId);
  const emailDrivenMap = await countEmailDrivenReads(db, tenantId, draftIds);

  const templateIds = [
    ...new Set(
      normalized.map((i) => i.linkedEmailTemplateId).filter((id): id is number => typeof id === "number" && id > 0)
    )
  ];
  const emailStats = templateIds.length
    ? await loadWechatArticleEmailStatsByTemplateIds(db, tenantId, templateIds)
    : [];
  const emailByTemplate = new Map(emailStats.map((s) => [s.templateId, s]));

  let accessToken: string | null = null;
  async function token(): Promise<string> {
    if (!accessToken) accessToken = await getAccessToken();
    return accessToken;
  }

  const out: WechatArticleStatsRow[] = [];
  for (const item of normalized) {
    let wechatOfficialReads: number | null = null;
    let statsNote: string | undefined;
    if (item.publishId) {
      try {
        const official = await fetchWechatOfficialReadCount(await token(), item.publishId, item.publishedAt);
        wechatOfficialReads = official.readCount;
        statsNote = official.note;
      } catch (e: unknown) {
        statsNote = String((e as Error)?.message ?? e);
      }
    } else {
      statsNote = "发布后才会同步微信官方阅读";
    }

    const email = item.linkedEmailTemplateId ? emailByTemplate.get(item.linkedEmailTemplateId) : undefined;
    out.push({
      draftId: item.draftId,
      wechatOfficialReads,
      emailDrivenReads: emailDrivenMap.get(item.draftId) ?? 0,
      emailSent: email?.sent ?? 0,
      emailOpened: email?.opened ?? 0,
      emailClicked: email?.clicked ?? 0,
      statsNote
    });
  }
  return out;
}
