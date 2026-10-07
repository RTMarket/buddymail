/** @deprecated 固定推广句已停用；保留常量供旧草稿清理识别。 */
export const LINKEDIN_FIXED_PROMO_EN =
  "From $39 — own an independent enterprise-grade email marketing system with 3,000 emails/day, plus multi-account LinkedIn publishing.";

const PROMO_NEEDLE = "From $39";

const DEFAULT_HASHTAGS = "#EmailMarketing #B2BMarketing #BigSocialBoss";

function lineLooksLikeHashtags(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("http")) return false;
  const tags = t.match(/#[\w\u00C0-\u024F\u4e00-\u9fff_-]+/gu);
  return Boolean(tags?.length && tags.join("").length >= t.replace(/\s/g, "").length * 0.5);
}

function stripOldPromoLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (t.includes(PROMO_NEEDLE) || t.includes("Starting at $39")) return false;
      if (/^CTA\s*[:：]/i.test(t)) return false;
      if (/www\.bigsocialboss\.com/i.test(t) && /\$39|3000|3,000/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 去掉历史固定推广句，保留正文与末尾 hashtag 块（不再插入推广句）。 */
export function ensureLinkedInFixedPromoAboveHashtags(body: string): string {
  let main = stripOldPromoLines(String(body ?? "").trim());
  if (!main) {
    return DEFAULT_HASHTAGS;
  }

  const lines = main.split("\n");
  const hashtagLines: string[] = [];
  while (lines.length) {
    const last = lines[lines.length - 1] ?? "";
    if (!last.trim()) {
      lines.pop();
      continue;
    }
    if (lineLooksLikeHashtags(last)) {
      hashtagLines.unshift(lines.pop()!);
    } else {
      break;
    }
  }

  main = lines.join("\n").trim();
  const hashtags = hashtagLines.join("\n").trim() || DEFAULT_HASHTAGS;

  if (main.includes(PROMO_NEEDLE)) {
    main = stripOldPromoLines(main);
  }

  const parts = [main, hashtags].filter(Boolean);
  return parts.join("\n\n").trim();
}
