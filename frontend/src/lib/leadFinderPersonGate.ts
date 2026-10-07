/**
 * Lead Finder 网页版 · 人名门控
 * 原则（对齐插件）：服务端 peopleHints 已经过 finalizeLeadPeople，
 * 客户端只挡「行业品类假名」等明确脏数据，禁止再用职称词表误杀真人名。
 */

const HONORIFIC = /^(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Sir|Dame|Mx)\.?$/i;

/** 行业 / 品类当人名：Medical Devices、Consumer Electronics… */
const INDUSTRY_CATEGORY_AS_NAME =
  /\b(Medical|Consumer|Industrial|Digital|Clinical|Diagnostic|Therapeutic|Surgical|Orthopedic|Dental|Veterinary|Automotive|Aerospace|Electronic|Electrical)\s+(Devices?|Electronics|Equipment|Instruments|Products?|Solutions|Systems|Supplies|Materials|Components)\b/i;

const CATEGORY_TAIL =
  /^(Devices?|Electronics|Equipment|Instruments|Platforms?|Supplies|Consumables|Implants?|Therapeutics?)$/i;

const HEADLINE_JUNK =
  /\b(Is\s+Going|Going\s+Back|Says?\s+AI|Who\s+Lost|Steps?\s+Down|Emerging\s+Markets|Express\s+Lane|Brand\.\s*While|Gave\s+His|While\s+The)\b/i;

export function cleanLeadFinderPersonName(name: string): string {
  let n = String(name || "")
    .trim()
    .replace(/[.\u3002]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = n.split(/\s+/).filter(Boolean);
  while (parts.length && HONORIFIC.test(parts[0]!)) parts.shift();
  while (parts.length && HONORIFIC.test(parts[parts.length - 1]!)) parts.pop();
  return parts.join(" ").trim();
}

/** 仅用于挡假名；服务端已过漏斗的名单应走 soft 模式 */
export function isPlausibleLeadFinderPersonName(
  name: string,
  opts?: { trustedServer?: boolean }
): boolean {
  const raw = String(name || "").trim();
  if (!raw) return false;
  if (INDUSTRY_CATEGORY_AS_NAME.test(raw)) return false;
  if (HEADLINE_JUNK.test(raw)) return false;
  const n = cleanLeadFinderPersonName(raw);
  if (n.length < 4 || n.length > 80) return false;
  if (!/\s/.test(n)) return false;
  if (INDUSTRY_CATEGORY_AS_NAME.test(n)) return false;
  if (HEADLINE_JUNK.test(n)) return false;
  {
    const parts = n.split(/\s+/);
    const last = parts[parts.length - 1] || "";
    if (
      CATEGORY_TAIL.test(last) &&
      (parts.length === 2 ||
        /^(Medical|Consumer|Industrial|Clinical|Digital|Dental|Surgical|Imaging|Oral|Health)$/i.test(
          parts[0]!
        ))
    ) {
      return false;
    }
  }
  if (/https?:|www\.|@|\.com|\d{3,}/i.test(n)) return false;

  // 服务端已 finalize：不再要求严格 Capitalization（避免误杀 van/de 等）
  if (opts?.trustedServer) {
    return partsLookLikePerson(n);
  }

  if (!/^[A-ZÀ-Ý][\p{L}.'\-]+(?:\s+[A-ZÀ-Ý\.][\p{L}.'\-]*){1,3}$/u.test(n)) return false;
  return partsLookLikePerson(n);
}

function partsLookLikePerson(n: string): boolean {
  const parts = n.split(/\s+/);
  if (parts.length < 2 || parts.length > 5) return false;
  if (parts.some((p) => HONORIFIC.test(p))) return false;
  // 全大写缩写不当人名
  if (parts.some((p) => /^[A-Z]{3,}$/.test(p) && !/^(III|II|IV|JR|SR)$/i.test(p))) return false;
  return true;
}

/** Prefer real linkedin.com/company/… URLs from SERP / page text */
export function pickLinkedInCompanyUrl(...texts: Array<string | null | undefined>): string | null {
  const blob = texts.filter(Boolean).join("\n");
  const company = blob.match(
    /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[a-zA-Z0-9._%-]+\/?/gi
  );
  if (company?.length) {
    const cleaned = company.map((u) => u.replace(/\/$/, "").split("?")[0]!);
    cleaned.sort((a, b) => a.length - b.length);
    return cleaned[0] || null;
  }
  return null;
}

export function pickCompanySize(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (/employees?|staff|people|头|人|规模/i.test(s) || /\d/.test(s)) return s.slice(0, 64);
    if (/^\d[\d,\s\-–—+kKmM]*$/.test(s)) return s.slice(0, 64);
  }
  return null;
}

export function contactKindOf(
  c: { kind?: string | null; title?: string | null; email?: string | null; contact_name?: string | null }
): "decision_makers" | "people" | "generic" {
  const kind = String(c.kind || "").toLowerCase();
  if (kind === "generic") return "generic";
  if (kind === "decision_makers" || kind === "decision_maker") return "decision_makers";
  if (kind === "people") return "people";
  const email = String(c.email || "");
  if (email.includes("@") && !String(c.contact_name || "").trim()) return "generic";
  const t = String(c.title || "").toLowerCase();
  if (
    /\b(ceo|cto|cfo|coo|cmo|cio|cro|cpo|founder|co-founder|president|owner|director|vp|vice president|head of|chief|partner)\b/.test(
      t
    ) ||
    /\bc[a-z]{1,4}o\b/.test(t)
  ) {
    return "decision_makers";
  }
  return "people";
}
