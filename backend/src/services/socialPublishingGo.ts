import type { Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { setMarketingCookieIfAbsent } from "./marketingAttribution.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/i;
const SEGMENT_RE = /^[1-9]$/;

function siteOrigin(): string {
  return (process.env.BLOG_SITE_ORIGIN || "").replace(/\/$/, "");
}

function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0]?.trim() ?? null;
  return (req.ip ?? "").toString() || null;
}

function resolveArticleSlug(shortSlug: string): string {
  const clean = shortSlug.trim().toLowerCase();
  if (clean.startsWith("en-")) return clean;
  return `en-${clean}`;
}

export function blueskyShortLinkFor(slug: string, segmentIndex: number): string {
  const shortSlug = slug.replace(/^en-/, "");
  const seg = Math.max(1, Math.min(9, Math.floor(segmentIndex)));
  return `${siteOrigin()}/go/b/${shortSlug}/${seg}`;
}

function blueskyDestinationUrl(slug: string, segmentIndex: number): string {
  const url = new URL(`${siteOrigin()}/en/${slug}`);
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", slug);
  url.searchParams.set("utm_content", `${slug}-seg${segmentIndex}`);
  return url.toString();
}

async function recordSocialGoVisit(
  db: Pool,
  req: Request,
  res: Response,
  params: { path: string; source: string; campaign: string; content: string }
): Promise<void> {
  const utm = { source: params.source, medium: "social", campaign: params.campaign, content: params.content };
  setMarketingCookieIfAbsent(req, res, utm);
  const referrer = typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 1024) : null;
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 1024) : null;
  const ip = clientIp(req);
  try {
    await db.query(
      `INSERT INTO site_visit_events (path, referrer, user_agent, ip, utm_source, utm_medium, utm_campaign, utm_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.path, referrer, userAgent, ip, utm.source, utm.medium, utm.campaign, utm.content]
    );
  } catch {
    /* best-effort */
  }
}

export async function handleBlueskyShortGo(
  db: Pool,
  req: Request,
  res: Response,
  shortSlugRaw: string,
  segmentRaw: string
): Promise<void> {
  const shortSlug = String(shortSlugRaw ?? "").trim().toLowerCase();
  const segment = String(segmentRaw ?? "").trim();
  if (!SLUG_RE.test(shortSlug) || !SEGMENT_RE.test(segment)) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  const slug = resolveArticleSlug(shortSlug);
  const segmentIndex = Number(segment);
  const target = blueskyDestinationUrl(slug, segmentIndex);
  await recordSocialGoVisit(db, req, res, {
    path: `/en/${slug}`,
    source: "bluesky",
    campaign: slug,
    content: `${slug}-seg${segmentIndex}`
  });
  res.redirect(302, target);
}
