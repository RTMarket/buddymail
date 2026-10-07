/** Apollo.io · People 搜索 + Bulk Enrich（独立站 Leads） */

export type ApolloLeadRow = {
  id: string;
  company_name: string;
  website: string | null;
  contact_name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  linkedin: string | null;
  email_status: "valid" | "invalid" | "risky" | "unverified" | "none";
  source: "apollo" | "kimi" | string;
};

export type ApolloSearchInput = {
  apiKey: string;
  keywords: string;
  industry: string;
  /** Apollo 可读英文地名，如 United States / California, United States */
  personLocations: string[];
  organizationLocations: string[];
  /** 职位关键词，逗号分隔可选 */
  titles: string[];
  limit: number;
  /** 是否 enrich 解锁邮箱（消耗 credit） */
  enrich: boolean;
};

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function joinName(first: unknown, last: unknown, fallback?: unknown): string | null {
  const a = strOrNull(first);
  const b = strOrNull(last);
  if (a && b) return `${a} ${b}`;
  return a || b || strOrNull(fallback);
}

function buildWebsite(org: any): string | null {
  const raw =
    strOrNull(org?.website_url) ||
    strOrNull(org?.primary_domain) ||
    strOrNull(org?.domain);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function mapPersonToLead(person: any, index: number): ApolloLeadRow {
  const org = person?.organization ?? person?.account ?? {};
  const email = strOrNull(person?.email) || strOrNull(person?.primary_email);
  const phone =
    strOrNull(person?.sanitized_phone) ||
    strOrNull(person?.phone_number) ||
    strOrNull(org?.phone) ||
    strOrNull(org?.sanitized_phone);
  const city = strOrNull(person?.city) || strOrNull(org?.city);
  const state = strOrNull(person?.state) || strOrNull(org?.state);
  const country = strOrNull(person?.country) || strOrNull(org?.country);
  const street = strOrNull(org?.street_address) || strOrNull(org?.raw_address);
  const addressParts = [street, city, state, country].filter(Boolean);
  const industry =
    strOrNull(org?.industry) ||
    (Array.isArray(org?.industries) ? strOrNull(org.industries[0]) : null);

  let email_status: ApolloLeadRow["email_status"] = email ? "unverified" : "none";
  const st = String(person?.email_status ?? "").toLowerCase();
  if (email) {
    if (st === "verified" || st === "valid") email_status = "valid";
    else if (st === "unavailable" || st === "invalid") email_status = "invalid";
    else if (st === "extrapolated" || st === "guessed" || st === "risky") email_status = "risky";
  }

  return {
    id: strOrNull(person?.id) || `apollo-${index}`,
    company_name:
      strOrNull(org?.name) || strOrNull(person?.organization_name) || `Company ${index + 1}`,
    website: buildWebsite(org),
    contact_name: joinName(person?.first_name, person?.last_name, person?.name),
    title: strOrNull(person?.title) || strOrNull(person?.headline),
    phone,
    email,
    address: addressParts.length ? addressParts.join(", ") : street,
    city,
    state,
    country,
    industry,
    linkedin: strOrNull(person?.linkedin_url),
    email_status,
    source: "apollo"
  };
}

async function apolloPost(path: string, apiKey: string, body: Record<string, unknown>) {
  const resp = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let data: any = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Apollo 返回非 JSON（HTTP ${resp.status}）`);
    }
  }
  if (!resp.ok) {
    const msg = strOrNull(data?.error) || strOrNull(data?.message) || text.slice(0, 240);
    throw new Error(`Apollo HTTP ${resp.status}${msg ? `: ${msg}` : ""}`);
  }
  return data;
}

/** 搜索（0 credit）→ 可选 bulk enrich 解锁邮箱 */
export async function searchApolloLeads(input: ApolloSearchInput): Promise<{
  items: ApolloLeadRow[];
  creditsConsumed: number;
  searched: number;
  enriched: number;
}> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit)));
  const keywordParts = [input.keywords.trim(), input.industry.trim()].filter(Boolean);
  const qKeywords = keywordParts.join(" ");

  const searchBody: Record<string, unknown> = {
    page: 1,
    per_page: limit
  };
  if (qKeywords) searchBody.q_keywords = qKeywords;
  if (input.industry.trim()) {
    searchBody.q_organization_keyword_tags = [input.industry.trim()];
  }
  if (input.titles.length) searchBody.person_titles = input.titles;
  if (input.personLocations.length) searchBody.person_locations = input.personLocations;
  if (input.organizationLocations.length) {
    searchBody.organization_locations = input.organizationLocations;
  }

  const searchData = await apolloPost("/mixed_people/api_search", input.apiKey, searchBody);
  const people: any[] = Array.isArray(searchData?.people)
    ? searchData.people
    : Array.isArray(searchData?.contacts)
      ? searchData.contacts
      : [];

  let enrichedMap = new Map<string, any>();
  let creditsConsumed = 0;
  let enriched = 0;

  if (input.enrich && people.length) {
    const ids = people.map((p) => strOrNull(p?.id)).filter(Boolean) as string[];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const details = chunk.map((id) => ({ id }));
      const enrichData = await apolloPost("/people/bulk_match", input.apiKey, {
        details,
        reveal_personal_emails: false,
        reveal_phone_number: false
      });
      creditsConsumed += Number(enrichData?.credits_consumed ?? 0) || 0;
      const matches: any[] = Array.isArray(enrichData?.matches) ? enrichData.matches : [];
      for (const m of matches) {
        if (!m || typeof m !== "object") continue;
        const mid = strOrNull(m.id);
        if (mid) {
          enrichedMap.set(mid, m);
          enriched += 1;
        }
      }
    }
  }

  const items = people.slice(0, limit).map((p, i) => {
    const id = strOrNull(p?.id);
    const merged = id && enrichedMap.has(id) ? { ...p, ...enrichedMap.get(id) } : p;
    return mapPersonToLead(merged, i);
  });

  return { items, creditsConsumed, searched: people.length, enriched };
}
