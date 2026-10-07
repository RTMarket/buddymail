/**
 * 本机网页搜联系人。只收「像人名 + 像职位」的组合，不把游戏/软件/栏目标题当高管。
 */
import { fetchHtmlText, searchWebHits } from "./leadFinderKeywordCompanySearch.js";
import {
  cleanLeadJobTitle,
  cleanLeadPersonName,
  isPlausibleLeadJobTitle,
  isPlausibleLeadPersonName
} from "./leadFinderPersonNameGate.js";

export type LocalPerson = { name: string; title: string };

const TITLE_PATHS = [
  "Founder",
  "Co-Founder",
  "CEO",
  "Chief Executive Officer",
  "President",
  "CTO",
  "Chief Technology Officer",
  "CFO",
  "COO",
  "CMO",
  "Country Leader",
  "Country Manager",
  "Managing Director"
];

const SKIP_HIT =
  /wikihow|duckmath|unblocked|adobe\.com|hotdoc|play\.google|granny|ragdoll|golfsimulator/i;

/** 职位 tier → LinkedIn/网页搜索关键词（与前端 leadFinderRoleTiers 保持一致） */
const TIER_QUERY_HINTS: Record<string, string[]> = {
  cxo: ["CEO", "CTO", "CFO", "COO", "CMO"],
  founder: ["Founder", "Co-Founder"],
  partner: ["Partner", "Managing Partner"],
  director: ["Director", "Vice President", "Head of"],
  consultant: ["Consultant", "Advisor"],
  procurement: ["Procurement", "Purchasing", "Supply Chain", "Buyer"],
  sales: ["Sales", "Business Development", "Account Executive"],
  marketing: ["Marketing", "Brand", "Digital Marketing"],
  finance: ["Finance", "Accounting", "Controller"],
  hr: ["Human Resources", "Talent Acquisition", "Recruiter"],
  tech: ["IT", "Engineer", "Developer"]
};

function uniqPeople(list: LocalPerson[]): LocalPerson[] {
  const out: LocalPerson[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const name = cleanLeadPersonName(p.name);
    const title = cleanLeadJobTitle(p.title);
    if (!isPlausibleLeadPersonName(name)) continue;
    if (!isPlausibleLeadJobTitle(title)) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name, title });
  }
  return out;
}

function peopleFromText(blob: string): LocalPerson[] {
  const found: LocalPerson[] = [];
  const t = String(blob || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const re =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s*[,–—|:]\s*((?:Co-)?Founder|CEO|CTO|CFO|COO|CMO|President|Managing Director|Country (?:Leader|Manager)|Chief (?:Executive|Technology|Financial|Operating|Marketing) Officer)(?:\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    found.push({ name: m[1] || "", title: m[2] || "" });
  }
  const li =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s+[-–—]\s+([^|]{3,60}?)\s+\bat\b\s+/gi;
  while ((m = li.exec(t))) {
    found.push({ name: m[1] || "", title: m[2] || "" });
  }
  const appoints =
    /(?:appoints?|names?|hires?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s+as\s+((?:Co-)?Founder|CEO|CTO|CFO|COO|President|Chief (?:Executive|Technology|Financial|Operating|Marketing) Officer)/gi;
  while ((m = appoints.exec(t))) {
    found.push({ name: m[1] || "", title: m[2] || "" });
  }
  const interview =
    /interview with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s*[,–—]\s*((?:Co-)?Founder|CEO|CTO|President)/gi;
  while ((m = interview.exec(t))) {
    found.push({ name: m[1] || "", title: m[2] || "" });
  }
  // LinkedIn 摘要常见格式：Name | Title at Company | LinkedIn
  const pipeLi =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s*\|\s*([^|]{3,60}?)\s+\bat\b\s+([^|]{1,80})/gi;
  while ((m = pipeLi.exec(t))) {
    found.push({ name: m[1] || "", title: m[2] || "" });
  }
  return found;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item === undefined) break;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, () => worker()));
}

async function scrapeTeamPages(website: string, host: string): Promise<LocalPerson[]> {
  let base = String(website || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${host}`;
  const urls = [
    `${base}/about`,
    `${base}/about-us`,
    `${base}/team`,
    `${base}/our-team`,
    `${base}/leadership`,
    `${base}/company`,
    `${base}/contact`,
    `${base}/contact-us`,
    base
  ];
  const found: LocalPerson[] = [];
  for (const url of urls) {
    const html = await fetchHtmlText(url, 12_000);
    if (!html || html.length < 200) continue;
    found.push(...peopleFromText(html.slice(0, 80_000)));
  }
  return found;
}

export async function findPeopleOnTheWeb(opts: {
  brand: string;
  domain: string;
  website: string;
  roleTiers?: string[];
  onNote?: (t: string) => Promise<void>;
}): Promise<LocalPerson[]> {
  const brand = String(opts.brand || "").trim() || opts.domain;
  const host = opts.domain.replace(/^www\./i, "");
  const all: LocalPerson[] = [];
  if (opts.onNote) await opts.onNote(`本机搜联系人 · 官网 about/team/contact · ${brand}`);
  all.push(...(await scrapeTeamPages(opts.website, host)));

  const queries = TITLE_PATHS.map((title) => `"${title}" "${brand}"`);
  // LinkedIn 广撒网：不限职位，先把人捞出来
  queries.push(`site:linkedin.com/in "${brand}"`);
  queries.push(
    `site:linkedin.com/in "${brand}" (Director OR Manager OR "Vice President" OR VP)`
  );
  // 按用户勾选的职位 tier 定向搜 LinkedIn
  const tiers = Array.isArray(opts.roleTiers) ? opts.roleTiers : [];
  for (const tier of tiers) {
    const hints = TIER_QUERY_HINTS[String(tier || "").toLowerCase()];
    if (!hints || !hints.length) continue;
    queries.push(`site:linkedin.com/in "${brand}" (${hints.join(" OR ")})`);
  }
  queries.push(
    `"${brand}" (interview OR "talks with") (CEO OR Founder OR President)`,
    `"${brand}" (appoints OR named) (CEO OR Founder OR President OR CTO)`
  );

  if (opts.onNote) await opts.onNote(`本机并行：职位多路径 / LinkedIn 广撒网 / 访谈 · ${brand}`);
  await pool(queries, 8, async (q) => {
    const hits = await searchWebHits(q);
    for (const hit of hits) {
      if (SKIP_HIT.test(`${hit.url} ${hit.title}`)) continue;
      all.push(...peopleFromText(`${hit.title} ${hit.snippet}`));
    }
  });
  return uniqPeople(all).slice(0, 40);
}
