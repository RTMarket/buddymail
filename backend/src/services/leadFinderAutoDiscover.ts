import {
  discoverCompaniesFromWebNews,
  discoverEspUserCompanies,
  keepLiveCompanyWebsites,
  type WebFoundCompany
} from "./leadFinderKeywordCompanySearch.js";

export type DiscoveredCompany = {
  name: string;
  domain: string;
  country: string;
  website: string;
  mainBusiness: string;
  contactName?: string;
  title?: string;
  email?: string;
  city?: string;
};

export const OUTREACH_COUNTRY_CODES = ["US", "SG", "GB", "DE", "AU", "CA", "FR", "NL", "NZ", "MY"] as const;

const COUNTRY_NAME_EN: Record<string, string> = {
  US: "United States",
  SG: "Singapore",
  GB: "United Kingdom",
  DE: "Germany",
  AU: "Australia",
  CA: "Canada",
  FR: "France",
  NL: "Netherlands",
  NZ: "New Zealand",
  MY: "Malaysia"
};

export function outreachCountryName(code: string): string {
  const c = String(code || "").trim().toUpperCase();
  if (COUNTRY_NAME_EN[c]) return COUNTRY_NAME_EN[c];
  if (/singapore/i.test(code)) return "Singapore";
  if (/united states|^usa$|^us$/i.test(code)) return "United States";
  const raw = String(code || "").trim();
  return raw || "United States";
}

function countryNameEn(code: string): string {
  return outreachCountryName(code);
}

function countryCodeFromHint(hint: string | undefined, fallback: string): string {
  const raw = String(hint || fallback || "US").trim().toUpperCase();
  if ((OUTREACH_COUNTRY_CODES as readonly string[]).includes(raw)) return raw;
  const en = outreachCountryName(raw);
  const hit = Object.entries(COUNTRY_NAME_EN).find(([, name]) => name.toLowerCase() === en.toLowerCase());
  return hit?.[0] || "US";
}

function toDiscovered(co: WebFoundCompany, countryHint?: string): DiscoveredCompany {
  const code = countryCodeFromHint(co.country || countryHint, countryHint || "US");
  return {
    name: co.name,
    domain: co.domain,
    country: code,
    website: co.website,
    mainBusiness: co.mainBusiness,
    city: co.city
  };
}

const SME_ICP_SYSTEM = `You research real-world B2B companies for an email-marketing SaaS sold to operators who still send quotes, catalogs, and follow-ups by hand.

STRICT ICP (include):
- Small and mid-size firms (roughly 5–200 staff), independent, often family-run or founder-run
- Traditional / "old economy" trades: wholesale, distributors, industrial parts, fasteners, packaging, printing, HVAC, plumbing, electrical contractors, machine shops, metal fabrication, plastics, chemicals, food ingredients, agriculture supply, building materials, logistics/freight forwarding, warehouse, safety equipment, uniforms, janitorial, lab supplies, OEM components
- They likely still use Outlook, Excel, or a cheap ESP, NOT a full HubSpot/Salesforce marketing cloud
- Public website may look dated, few pages, catalog PDFs, "request a quote"

HARD EXCLUDE (never list):
- Fortune 500 / household giants (Apple, Amazon, Google, Microsoft, Meta, Tesla, Nike, Coca-Cola, Walmart, Samsung, Huawei, Alibaba, Tencent, ByteDance, TikTok, Shopify, Salesforce, HubSpot, etc.)
- Unicorns, famous VC-backed consumer apps, luxury fashion, trendy D2C brands, global banks, Big 4, FAANG, hyperscalers
- Marketing agencies and companies that already sell marketing software

Prefer companies whose own domain can receive email (has staff or info@ on the site). Avoid Shopify-only storefronts with no company mailbox.
Output valid JSON arrays only.`;

function normalizeDomain(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^\w.-]/g, "");
}

function kimiEndpoints(preferred: string): string[] {
  const p = String(preferred || "").replace(/\/+$/, "");
  const cn = "https://api.moonshot.cn/v1";
  const ai = "https://api.moonshot.ai/v1";
  const out: string[] = [];
  if (p) out.push(p);
  out.push(cn, ai);
  return [...new Set(out)];
}

function isGeoBlocked(status: number, body: string): boolean {
  return status === 403 && /unsupported_country|territory not supported|request_forbidden/i.test(body);
}

function messageContent(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const o = p as { text?: unknown; content?: unknown };
          return String(o.text || o.content || "");
        }
        return "";
      })
      .join("");
  }
  if (raw && typeof raw === "object") {
    const o = raw as { text?: unknown; content?: unknown };
    if (o.text != null) return String(o.text);
    if (typeof o.content === "string") return o.content;
  }
  return "";
}

async function kimiChatCompletions(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const payload = {
    model: opts.model || "moonshot-v1-128k",
    temperature: opts.temperature,
    max_tokens: 8192,
    messages: opts.messages
  };
  for (const base of kimiEndpoints(opts.baseUrl)) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: unknown } }> };
        return messageContent(json.choices?.[0]?.message?.content);
      } catch {
        return text;
      }
    }
    if (isGeoBlocked(res.status, text) || res.status === 401 || res.status === 403) {
      continue;
    }
    break;
  }
  throw new Error("Kimi 当前无法从本服务器完成调研。");
}

function extractJsonArrayText(content: string): string {
  const raw = String(content || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = (fence?.[1] || raw).trim();
  const start = src.search(/\[/);
  if (start < 0) {
    const objStart = src.search(/\{/);
    if (objStart >= 0) {
      const objText = sliceBalanced(src, objStart, "{", "}");
      if (objText) {
        try {
          const obj = JSON.parse(objText) as Record<string, unknown>;
          for (const key of ["companies", "data", "items", "results", "list"]) {
            if (Array.isArray(obj[key])) return JSON.stringify(obj[key]);
          }
        } catch {
          /* fall through */
        }
      }
    }
    throw new Error("Kimi 未返回公司 JSON 列表");
  }
  const arrText = sliceBalanced(src, start, "[", "]");
  if (arrText) return arrText;
  const truncated = src.slice(start);
  for (let n = 1; n <= 8; n++) {
    try {
      const trial = truncated + "]".repeat(n);
      const parsed = JSON.parse(trial);
      if (Array.isArray(parsed)) return trial;
    } catch {
      /* keep closing */
    }
  }
  throw new Error("Kimi 未返回公司 JSON 列表");
}

function sliceBalanced(src: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function parseCompanyArray(content: string, fallbackCountry?: string): DiscoveredCompany[] {
  const arr = JSON.parse(extractJsonArrayText(content)) as Array<Record<string, unknown>>;
  if (!Array.isArray(arr)) throw new Error("Kimi 未返回公司 JSON 列表");
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    const domain = normalizeDomain(String(row.domain || row.website || ""));
    if (!domain || !domain.includes(".") || seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: String(row.name || domain).trim() || domain,
      domain,
      country: String(row.country || fallbackCountry || "").trim(),
      website: String(row.website || `https://${domain}`).trim(),
      mainBusiness: String(row.mainBusiness || row.business || "").trim(),
      contactName: String(row.contactName || row.contact || "").trim(),
      title: String(row.title || "").trim(),
      email: String(row.email || "").trim(),
      city: String(row.city || "").trim()
    });
  }
  return out;
}

const PROMOTER_QUALIFY_SYSTEM = `You keep companies that could buy email marketing because they promote their own work.
KEEP: independent small and micro businesses, family firms, sole traders, studios, shops, wholesalers, distributors, local brands, workshops. A simple or dated website is a keep.
DROP: news sites, directories, governments, universities, email-tool vendors (Mailchimp, Klaviyo, HubSpot and similar), global household brands, and parked domains.
When a row is a real small company and you are unsure, keep it.
Return ONLY a JSON array of domain strings to keep.`;

function parseKeptDomains(content: string): Set<string> {
  const arr = JSON.parse(extractJsonArrayText(content)) as unknown[];
  const kept = new Set<string>();
  for (const item of arr) {
    const domain =
      typeof item === "string"
        ? normalizeDomain(item)
        : normalizeDomain(String((item as { domain?: unknown })?.domain || ""));
    if (domain.includes(".")) kept.add(domain);
  }
  return kept;
}

async function qualifyPromoterBatch(
  opts: { apiKey: string; baseUrl: string; model: string },
  rows: WebFoundCompany[]
): Promise<Set<string> | null> {
  if (!opts.apiKey.trim() || !rows.length) return null;
  const brief = rows.map((c) => ({
    name: c.name,
    domain: c.domain,
    business: String(c.mainBusiness || c.evidence || "").slice(0, 240)
  }));
  try {
    const content = await kimiChatCompletions({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: PROMOTER_QUALIFY_SYSTEM },
        { role: "user", content: JSON.stringify(brief) }
      ]
    });
    return parseKeptDomains(content);
  } catch {
    return null;
  }
}

export async function discoverEmailMarketingCompanies(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  countries: string[];
  excludeDomains: string[];
  want: number;
}): Promise<DiscoveredCompany[]> {
  const want = Math.max(1, Math.min(40, opts.want));
  const exclude = new Set(opts.excludeDomains.map((d) => d.replace(/^www\./i, "").toLowerCase()));
  const countries = opts.countries.length ? opts.countries : ["US"];
  const collected: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const code of countries) {
    const countryName = countryNameEn(code);
    const raw = await discoverCompaniesFromWebNews({
      keywords: "small business brand shop studio wholesale manufacturer",
      industry: "independent small business wholesaler distributor shop studio workshop",
      countryNameEn: countryName,
      city: "",
      limit: want
    });
    const live = await keepLiveCompanyWebsites(
      raw.filter((c) => !exclude.has(c.domain.replace(/^www\./i, "").toLowerCase()) && !seen.has(c.domain)),
      want
    );
    const kept = await qualifyPromoterBatch(opts, live);
    const picked = kept ? live.filter((c) => kept.has(normalizeDomain(c.domain))) : live;
    for (const co of picked) {
      if (seen.has(co.domain)) continue;
      seen.add(co.domain);
      collected.push(toDiscovered(co, code));
      if (collected.length >= want) return collected;
    }
  }
  return collected;
}

const FALLBACK_OUTREACH = {
  subject: "A private email system for a small team",
  bodyHtml:
    "<p>Hello,</p><p>We help small teams run their own email marketing: your contact list, your templates, and your sending domain, on a server you control.</p><p>If you promote a shop, studio, or wholesale business and still send follow-ups by hand, reply to this note and we will show you how it runs.</p><p>BigSocialBoss</p>"
};

export async function draftDailyOutreachCopy(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  runDate: string;
}): Promise<{ subject: string; bodyHtml: string }> {
  if (!opts.apiKey.trim()) return FALLBACK_OUTREACH;
  try {
    const content = await kimiChatCompletions({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Write one cold email for BigSocialBoss, a private email-marketing system for small businesses. Return ONLY JSON {\"subject\":\"\",\"bodyHtml\":\"\"}. Subject under 80 characters. bodyHtml is 3 short <p> paragraphs in English. No invented customer names, no discounts, no Mailchimp comparison."
        },
        { role: "user", content: `Date ${opts.runDate}. Audience: small shops, studios, wholesalers, and family firms that need to promote their own work.` }
      ]
    });
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return FALLBACK_OUTREACH;
    const parsed = JSON.parse(content.slice(start, end + 1)) as { subject?: unknown; bodyHtml?: unknown };
    const subject = String(parsed.subject || "").trim().slice(0, 180);
    const bodyHtml = String(parsed.bodyHtml || "").trim();
    if (!subject || !bodyHtml.includes("<")) return FALLBACK_OUTREACH;
    return { subject, bodyHtml };
  } catch {
    return FALLBACK_OUTREACH;
  }
}

export async function discoverCompanyPeopleWithKimi(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  companyName: string;
  domain: string;
  titles?: string;
}): Promise<Array<{ name: string; title: string }>> {
  const titles = opts.titles?.trim() || "Owner, Founder, President, General Manager, Sales Manager, Purchasing, Plant Manager, Office Manager";
  const prompt = `List 8 REAL people who work at "${opts.companyName}" (website domain ${opts.domain}), with job titles.
Prefer: owner / founder / president / GM / sales / purchasing / plant / office manager / estimator.
This is a traditional small or mid-size firm, not a famous giant.
Return ONLY a JSON array: {"name":"Full Name","title":"Job title"}
No celebrities, no people from other companies. If unsure, fewer items is OK.`;
  try {
    const content = await kimiChatCompletions({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: SME_ICP_SYSTEM },
        { role: "user", content: prompt }
      ]
    });
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]) as Array<Record<string, unknown>>;
    const out: Array<{ name: string; title: string }> = [];
    const seen = new Set<string>();
    for (const row of arr) {
      const name = String(row.name || "").trim();
      if (!name || name.split(/\s+/).length < 2 || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ name, title: String(row.title || titles.split(",")[0] || "").trim() });
    }
    return out.slice(0, 12);
  } catch {
    return [];
  }
}

export async function discoverLeadsWithKimi(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  want: number;
  countryName?: string;
  city?: string;
  industry?: string;
  keywords?: string;
  titles?: string;
}): Promise<DiscoveredCompany[]> {
  const want = Math.max(1, Math.min(50, opts.want));
  const countryName = countryNameEn(opts.countryName || "US");
  const keywords = opts.keywords?.trim() || "Mailchimp Klaviyo";
  const industry = opts.industry?.trim() || "email marketing ESP user";
  const raw = await discoverCompaniesFromWebNews({
    keywords,
    industry,
    countryNameEn: countryName,
    city: opts.city || "",
    limit: want
  });
  const live = await keepLiveCompanyWebsites(raw, want);
  return live.map((c) => ({
    ...toDiscovered(c, opts.countryName),
    mainBusiness: c.mainBusiness || industry,
    city: c.city || opts.city || ""
  }));
}
