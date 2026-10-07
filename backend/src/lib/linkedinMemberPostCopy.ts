type BlogArticleLike = {
  slug?: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
};

function cleanLine(raw: string): string {
  return raw
    .replace(/^[-*#>\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickMemberKeyPoints(rawInsights: string): string[] {
  const lines = rawInsights
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length >= 12)
    .slice(0, 4);
  return lines.length > 0 ? lines : [];
}

export function buildMemberHashtags(article: BlogArticleLike, keyPoints: string[]): string[] {
  const tags = Array.isArray(article.frontmatter?.tags) ? article.frontmatter?.tags : [];
  const fromFrontmatter = tags.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean);
  const fallback = keyPoints.length > 0 ? ["SaaS", "Marketing", "Growth"] : ["BigSocialBoss", "Marketing"];
  return Array.from(new Set([...fromFrontmatter, ...fallback]))
    .slice(0, 5)
    .map((tag) => `#${tag.replace(/[^\p{L}\p{N}_]/gu, "")}`)
    .filter((tag) => tag.length > 1);
}

export function buildMemberArticlePost(
  article: BlogArticleLike,
  keyPoints: string[],
  trackingUrl: string,
  rawInsights = ""
): string {
  const title = String(article.frontmatter?.title ?? article.slug ?? "New article").trim();
  const description = String(article.frontmatter?.description ?? "").trim();
  const points = keyPoints.length > 0 ? keyPoints : pickMemberKeyPoints(rawInsights);
  const body = [
    title,
    description,
    ...points.slice(0, 3).map((point) => `- ${point}`),
    trackingUrl.trim()
  ].filter(Boolean);
  return body.join("\n\n").slice(0, 2800);
}

export function linkedInMemberSlotForQueueIndex(index: number, now = new Date(), publishedCount = 0): Date {
  const safeIndex = Math.max(0, Math.floor(index));
  const safePublished = Math.max(0, Math.floor(publishedCount));
  const next = new Date(now);
  next.setHours(9, 30, 0, 0);
  next.setDate(next.getDate() + safeIndex + safePublished);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}
