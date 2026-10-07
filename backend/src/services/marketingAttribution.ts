import type { Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import {
  businessRangeMysqlBounds,
  sqlBusinessDatetimeBetweenAnd
} from "./businessCalendar.js";

export const MARKETING_COOKIE = "bss_mkt";
export const MARKETING_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60;

export type MarketingUtm = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
};

let schemaReady: boolean | null = null;

export async function ensureMarketingSchema(db: Pool): Promise<boolean> {
  if (schemaReady === true) return true;
  if (schemaReady === false) return false;
  try {
    const [rows] = await db.query(`SHOW TABLES LIKE 'marketing_user_attributions'`);
    schemaReady = Array.isArray(rows) && (rows as unknown[]).length > 0;
  } catch {
    schemaReady = false;
  }
  return schemaReady;
}

function trimUtmPart(raw: unknown, max: number): string {
  return String(raw ?? "")
    .trim()
    .slice(0, max);
}

export function parseUtmFromSearch(search: string): MarketingUtm | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q.trim()) return null;
  try {
    const params = new URLSearchParams(q);
    const source = trimUtmPart(params.get("utm_source"), 128);
    const medium = trimUtmPart(params.get("utm_medium"), 128);
    const campaign = trimUtmPart(params.get("utm_campaign"), 256);
    const content = trimUtmPart(params.get("utm_content"), 256);
    if (!source && !medium && !campaign) return null;
    return { source, medium, campaign, content };
  } catch {
    return null;
  }
}

export function parseUtmFromPath(pathWithQuery: string): MarketingUtm | null {
  const idx = pathWithQuery.indexOf("?");
  if (idx < 0) return null;
  return parseUtmFromSearch(pathWithQuery.slice(idx));
}

export function parseMarketingCookie(raw: unknown): MarketingUtm | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const source = trimUtmPart(o.s ?? o.source, 128);
    const medium = trimUtmPart(o.m ?? o.medium, 128);
    const campaign = trimUtmPart(o.c ?? o.campaign, 256);
    const content = trimUtmPart(o.ct ?? o.content, 256);
    if (!source && !medium && !campaign) return null;
    return { source, medium, campaign, content };
  } catch {
    return null;
  }
}

export function marketingUtmFromReq(req: Request): MarketingUtm | null {
  return parseMarketingCookie(req.cookies?.[MARKETING_COOKIE]);
}

export function serializeMarketingCookie(utm: MarketingUtm): string {
  return JSON.stringify({
    s: utm.source,
    m: utm.medium,
    c: utm.campaign,
    ct: utm.content,
    t: Date.now()
  });
}

export function setMarketingCookieIfAbsent(req: Request, res: Response, utm: MarketingUtm): void {
  const existing = parseMarketingCookie(req.cookies?.[MARKETING_COOKIE]);
  if (existing?.campaign || existing?.source) return;
  res.cookie(MARKETING_COOKIE, serializeMarketingCookie(utm), {
    maxAge: MARKETING_COOKIE_MAX_AGE_SEC * 1000,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: req.secure || String(req.headers["x-forwarded-proto"] ?? "").includes("https")
  });
}

export function mergeUtmFromBodyAndPath(
  body: Record<string, unknown> | null | undefined,
  pathWithQuery: string
): MarketingUtm | null {
  const fromPath = parseUtmFromPath(pathWithQuery);
  const source = trimUtmPart(body?.utm_source ?? body?.utmSource, 128) || fromPath?.source || "";
  const medium = trimUtmPart(body?.utm_medium ?? body?.utmMedium, 128) || fromPath?.medium || "";
  const campaign = trimUtmPart(body?.utm_campaign ?? body?.utmCampaign, 256) || fromPath?.campaign || "";
  const content = trimUtmPart(body?.utm_content ?? body?.utmContent, 256) || fromPath?.content || "";
  if (!source && !medium && !campaign) return fromPath;
  return { source, medium, campaign, content };
}

export async function recordMarketingRegistration(
  db: Pool,
  params: {
    userId: number;
    tenantId: number;
    utm: MarketingUtm | null;
    landingReferrer?: string | null;
  }
): Promise<void> {
  if (!(await ensureMarketingSchema(db))) return;
  if (!params.utm) return;
  const { userId, tenantId, utm } = params;
  if (!utm.source && !utm.campaign) return;
  try {
    await db.query(
      `INSERT IGNORE INTO marketing_user_attributions
         (user_id, tenant_id, utm_source, utm_medium, utm_campaign, utm_content, landing_referrer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        tenantId,
        utm.source,
        utm.medium,
        utm.campaign,
        utm.content,
        params.landingReferrer?.slice(0, 1024) ?? null
      ]
    );
  } catch {
    /* table or column missing */
  }
}

export async function captureMarketingPayAttribution(
  db: Pool,
  req: Request,
  refCode: string,
  modulesCsv: string,
  tenantId?: number | null
): Promise<void> {
  const utm = marketingUtmFromReq(req);
  if (!utm || (!utm.source && !utm.campaign)) return;
  if (!(await ensureMarketingSchema(db))) return;
  const orderKind = "other"; // 开源版：无分销体系
  try {
    await db.query(
      `INSERT IGNORE INTO marketing_pay_attributions
         (ref_code, tenant_id, utm_source, utm_medium, utm_campaign, utm_content, order_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [refCode, tenantId ?? null, utm.source, utm.medium, utm.campaign, utm.content, orderKind]
    );
  } catch {
    /* ignore */
  }
}

export async function recordMarketingPayAmount(
  db: Pool,
  refCode: string,
  amountCents: number
): Promise<void> {
  if (!(await ensureMarketingSchema(db))) return;
  try {
    await db.query(`UPDATE marketing_pay_attributions SET amount_cents = ? WHERE ref_code = ?`, [
      Math.max(0, Math.floor(amountCents)),
      refCode
    ]);
  } catch {
    /* ignore */
  }
}

export type MarketingCampaignRow = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  articleViewCount: number;
  articleUniqueIpCount: number;
  ctaClickCount: number;
  ctaUniqueIpCount: number;
  mainVisitCount: number;
  visitCount: number;
  uniqueIpCount: number;
  registrationCount: number;
  paidConversionCount: number;
  paidAmountCents: number;
};

export type MarketingCampaignIpRow = {
  ip: string;
  visitCount: number;
  hasRegistration: boolean;
  hasPaidConversion: boolean;
  lastVisitedAt: string | null;
  utmContent: string;
};

export async function fetchMarketingCampaignSummary(
  db: Pool,
  startDate: string,
  endDate: string
): Promise<MarketingCampaignRow[]> {
  if (!(await ensureMarketingSchema(db))) return [];
  const { start, endExclusive } = businessRangeMysqlBounds(startDate, endDate);
  const visitRange = sqlBusinessDatetimeBetweenAnd("visited_at", start, endExclusive);
  const regRange = sqlBusinessDatetimeBetweenAnd("registered_at", start, endExclusive);
  const payRange = sqlBusinessDatetimeBetweenAnd("paid_at", start, endExclusive);

  const campaignMap = new Map<string, MarketingCampaignRow>();

  function key(source: string, campaign: string): string {
    return `${source}\0${campaign}`;
  }

  function ensureRow(source: string, campaign: string): MarketingCampaignRow {
    const k = key(source, campaign);
    let row = campaignMap.get(k);
    if (!row) {
      row = {
        utmSource: source,
        utmMedium: "article_funnel",
        utmCampaign: campaign,
        articleViewCount: 0,
        articleUniqueIpCount: 0,
        ctaClickCount: 0,
        ctaUniqueIpCount: 0,
        mainVisitCount: 0,
        visitCount: 0,
        uniqueIpCount: 0,
        registrationCount: 0,
        paidConversionCount: 0,
        paidAmountCents: 0
      };
      campaignMap.set(k, row);
    }
    return row;
  }

  try {
    const [visitRows] = await db.query(
      `SELECT utm_source,
              utm_campaign,
              COUNT(*) AS visit_count,
              COUNT(DISTINCT CASE WHEN ip IS NOT NULL AND ip != '' THEN ip END) AS unique_ip_count,
              SUM(CASE WHEN utm_medium = 'article_view' THEN 1 ELSE 0 END) AS article_view_count,
              COUNT(DISTINCT CASE WHEN utm_medium = 'article_view' AND ip IS NOT NULL AND ip != '' THEN ip END) AS article_unique_ip_count,
              SUM(CASE WHEN utm_medium = 'cta_click' THEN 1 ELSE 0 END) AS cta_click_count,
              COUNT(DISTINCT CASE WHEN utm_medium = 'cta_click' AND ip IS NOT NULL AND ip != '' THEN ip END) AS cta_unique_ip_count,
              SUM(CASE WHEN utm_medium IS NULL OR utm_medium NOT IN ('article_view', 'cta_click') THEN 1 ELSE 0 END) AS main_visit_count
         FROM site_visit_events
        WHERE (utm_campaign IS NOT NULL AND utm_campaign != '')
          ${visitRange.clause}
        GROUP BY utm_source, utm_campaign`,
      [...visitRange.params]
    );
    for (const r of visitRows as {
      utm_source?: string;
      utm_campaign?: string;
      visit_count?: number;
      unique_ip_count?: number;
      article_view_count?: number;
      article_unique_ip_count?: number;
      cta_click_count?: number;
      cta_unique_ip_count?: number;
      main_visit_count?: number;
    }[]) {
      const source = String(r.utm_source ?? "");
      const campaign = String(r.utm_campaign ?? "");
      if (!campaign) continue;
      const row = ensureRow(source, campaign);
      row.visitCount = Number(r.visit_count ?? 0);
      row.uniqueIpCount = Number(r.unique_ip_count ?? 0);
      row.articleViewCount = Number(r.article_view_count ?? 0);
      row.articleUniqueIpCount = Number(r.article_unique_ip_count ?? 0);
      row.ctaClickCount = Number(r.cta_click_count ?? 0);
      row.ctaUniqueIpCount = Number(r.cta_unique_ip_count ?? 0);
      row.mainVisitCount = Number(r.main_visit_count ?? 0);
    }
  } catch {
    /* utm columns may be missing */
  }

  try {
    const [regRows] = await db.query(
      `SELECT utm_source, utm_campaign, COUNT(*) AS c
         FROM marketing_user_attributions
        WHERE utm_campaign != '' ${regRange.clause}
        GROUP BY utm_source, utm_campaign`,
      [...regRange.params]
    );
    for (const r of regRows as {
      utm_source?: string;
      utm_campaign?: string;
      c?: number;
    }[]) {
      const row = ensureRow(String(r.utm_source ?? ""), String(r.utm_campaign ?? ""));
      row.registrationCount = Number(r.c ?? 0);
    }
  } catch {
    /* ignore */
  }

  try {
    const [payRows] = await db.query(
      `SELECT utm_source, utm_campaign,
              COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS amt
         FROM marketing_pay_attributions
        WHERE utm_campaign != '' AND amount_cents > 0 ${payRange.clause}
        GROUP BY utm_source, utm_campaign`,
      [...payRange.params]
    );
    for (const r of payRows as {
      utm_source?: string;
      utm_campaign?: string;
      c?: number;
      amt?: number;
    }[]) {
      const row = ensureRow(String(r.utm_source ?? ""), String(r.utm_campaign ?? ""));
      row.paidConversionCount = Number(r.c ?? 0);
      row.paidAmountCents = Number(r.amt ?? 0);
    }
  } catch {
    /* ignore */
  }

  return [...campaignMap.values()].sort((a, b) => {
    const av = b.articleViewCount - a.articleViewCount;
    if (av !== 0) return av;
    return b.mainVisitCount - a.mainVisitCount;
  });
}

export async function fetchMarketingCampaignIps(
  db: Pool,
  startDate: string,
  endDate: string,
  utmSource: string,
  utmCampaign: string,
  page: number,
  pageSize: number
): Promise<{ items: MarketingCampaignIpRow[]; total: number; page: number; pageSize: number }> {
  if (!(await ensureMarketingSchema(db))) {
    return { items: [], total: 0, page, pageSize };
  }
  const { start, endExclusive } = businessRangeMysqlBounds(startDate, endDate);
  const visitRange = sqlBusinessDatetimeBetweenAnd("visited_at", start, endExclusive);
  const offset = (page - 1) * pageSize;

  const [countRows] = await db.query(
    `SELECT COUNT(DISTINCT ip) AS c
       FROM site_visit_events
      WHERE utm_source = ? AND utm_campaign = ?
        AND ip IS NOT NULL AND ip != ''
        ${visitRange.clause}`,
    [utmSource, utmCampaign, ...visitRange.params]
  );
  const total = Number((countRows as { c?: number }[])[0]?.c ?? 0);

  const [rows] = await db.query(
    `SELECT ip,
            COUNT(*) AS visit_count,
            MAX(visited_at) AS last_at,
            MAX(utm_content) AS utm_content
       FROM site_visit_events
      WHERE utm_source = ? AND utm_campaign = ?
        AND ip IS NOT NULL AND ip != ''
        ${visitRange.clause}
      GROUP BY ip
      ORDER BY visit_count DESC, last_at DESC
      LIMIT ? OFFSET ?`,
    [utmSource, utmCampaign, ...visitRange.params, pageSize, offset]
  );

  const regIps = new Set<string>();
  try {
    const [regRows] = await db.query(
      `SELECT DISTINCT s.ip
         FROM site_visit_events s
         INNER JOIN marketing_user_attributions m ON m.user_id = s.user_id
        WHERE m.utm_source = ? AND m.utm_campaign = ?
          AND s.ip IS NOT NULL`,
      [utmSource, utmCampaign]
    );
    for (const r of regRows as { ip?: string }[]) {
      const ip = String(r.ip ?? "").trim();
      if (ip) regIps.add(ip);
    }
  } catch {
    /* ignore */
  }

  const items: MarketingCampaignIpRow[] = [];
  for (const r of rows as {
    ip?: string;
    visit_count?: number;
    last_at?: unknown;
    utm_content?: string;
  }[]) {
    const ip = String(r.ip ?? "");
    items.push({
      ip,
      visitCount: Number(r.visit_count ?? 0),
      hasRegistration: regIps.has(ip),
      hasPaidConversion: false,
      lastVisitedAt: r.last_at ? String(r.last_at) : null,
      utmContent: String(r.utm_content ?? "")
    });
  }

  return { items, total, page, pageSize };
}
