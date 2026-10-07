/**
 * Find real company websites from news + web search (plugin-style).
 * Never invent domains.
 */
export type WebFoundCompany = {
  name: string;
  domain: string;
  website: string;
  country: string;
  city: string;
  mainBusiness: string;
  evidence?: string;
};

const SKIP_HOST =
  /^(www\.)?(google|bing|duckduckgo|yahoo|yandex|baidu|facebook|fb\.com|instagram|twitter|x\.com|youtube|tiktok|linkedin|wikipedia|reddit|pinterest|amazon|apple|microsoft|tesla|nike|walmart|alibaba|tencent|bytedance|shopify|cloudflare|wix|wordpress|blogspot|medium|substack|reuters|bloomberg|forbes|techcrunch|nytimes|bbc|cnn|theguardian|straitstimes|channelnewsasia|businesstimes|f6s|zoominfo|crunchbase|owler|dnb|dandb|glassdoor|indeed|github|gitlab|bitbucket|unilever|unileverusa|dove|pg\.com|loreal|colgate|johnson|nestle|pampers|nivea|personalcarecouncil|essity|essityusa|edgewell|mailchimp|klaviyo|sendgrid|constantcontact|hubspot|mailerlite|getresponse|aweber|convertkit|activecampaign|brevo|sendinblue|campaignmonitor|mailgun|postmarkapp|sparkpost|omnisend|drip\.com|iterable|customer\.io|bigsocialboss)\b/i;

const SKIP_PATH_HOST = /news\.google|google\.com\/(search|rss)|bing\.com\/(search|news)|duckduckgo\.com/i;

/** Rankings / yellow pages / exhibition lists — harvest outbound company sites, never keep as a lead. */
const LIST_HOST =
  /(yellowpages|yp\.com|yelp\.com|thomasnet|kompass|europages|made-in-china|globalsources|tradeindia|exhibitor|expocad|10times|clutch\.co|zoominfo|crunchbase|owler|dnb\.com|chamberofcommerce|europages|indiamart|alibaba\.com|forbes\.com|inc\.com|eventseye|tradefair|messe|exhibition)/i;

function isListHit(hit: Hit): boolean {
  const host = hostOf(hit.url);
  if (LIST_HOST.test(host)) return true;
  return /top\s+\d+|best\s+\d+|directory|yellow pages|exhibitors?|trade show|member list|companies in |manufacturer list|association members/i.test(
    `${hit.title} ${hit.snippet}`
  );
}

function extractOutboundHosts(html: string, pageHost: string, country: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href\s*=\s*["'](https?:\/\/[^"'#?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const host = hostOf(m[1] || "");
    if (!host || host === pageHost || host.endsWith(`.${pageHost}`)) continue;
    if (skipCompanyHost(host, country) || LIST_HOST.test(host) || SKIP_PATH_HOST.test(m[1] || "")) continue;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
    if (out.length >= 80) break;
  }
  return out;
}

async function harvestListPages(hits: Hit[], country: string, needles: string[]): Promise<Hit[]> {
  const lists = hits.filter((h) => isListHit(h)).slice(0, 20);
  const extra: Hit[] = [];
  const seen = new Set<string>();
  await Promise.all(
    lists.map(async (hit) => {
      const ctx = `${hit.title} ${hit.snippet}`.toLowerCase();
      if (needles.length && !htmlHasIndustry(ctx, needles)) return;
      const html = await fetchText(hit.url, 12_000);
      if (!html || html.length < 400) return;
      if (ADULT_TEXT.test(html) || ADULT_HOST.test(html)) return;
      const blob = html.slice(0, 60_000).toLowerCase();
      if (needles.length && !htmlHasIndustry(blob, needles)) return;
      const pageHost = hostOf(hit.url);
      for (const host of extractOutboundHosts(html, pageHost, country)) {
        if (seen.has(host)) continue;
        seen.add(host);
        extra.push({ url: `https://${host}`, title: brandFromHost(host), snippet: `from list ${pageHost}` });
      }
    })
  );
  return extra;
}

function hostOf(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function brandFromHost(host: string): string {
  const base = host.split(".")[0] || host;
  if (!base) return host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function nameFromTitle(title: string, host: string): string {
  const t = String(title || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const junk =
    /top\s+\d+|best\s+\d+|companies in |directory|wholesale|github|list of |official site|^home$|authentic beauty|beauty supply|personal care products council/i.test(
      t
    );
  if (junk || t.length > 60) return brandFromHost(host);
  const short = t.replace(/\s*[-–—|].*$/, "").trim();
  if (/\b(inc|llc|ltd|pte|gmbh|corp|co\.|company|limited)\b/i.test(short) && short.length <= 60) return short;
  return brandFromHost(host);
}

async function fetchText(url: string, ms: number): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!res.ok && res.status >= 500) return "";
    return await res.text();
  } catch {
    return "";
  }
}

type Hit = { url: string; title: string; snippet: string };

async function duckDuckGo(query: string): Promise<Hit[]> {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 10_000);
  if (!html || !/result__a|uddg=/i.test(html)) return [];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const re =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1200}?class="result__snippet"[^>]*>([\s\S]*?)<\//gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const hrefRaw = m[1] || "";
    const title = (m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippet = (m[3] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const uddg = hrefRaw.match(/uddg=([^&"]+)/i);
    let url = uddg ? decodeURIComponent(uddg[1]!) : hrefRaw;
    url = url.replace(/&amp;/g, "&").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ url, title, snippet });
    if (hits.length >= 40) break;
  }
  return hits;
}

function decodeBingRedirect(url: string): string {
  try {
    const u = new URL(url.replace(/&amp;/g, "&"));
    if (!/bing\.com\/ck\//i.test(u.href)) return url;
    const raw = u.searchParams.get("u") || "";
    if (!raw) return url;
    const b64 = raw.replace(/^a1/i, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "===".slice((b64.length + 3) % 4);
    const decoded = Buffer.from(pad, "base64").toString("utf8");
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {
    /* keep */
  }
  return url;
}

async function bingSearch(query: string, first = 1, country = ""): Promise<Hit[]> {
  const loc = bingLocale(country);
  const html = await fetchText(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${encodeURIComponent(loc.mkt)}&cc=${loc.cc}&mkt=${encodeURIComponent(loc.mkt)}&first=${first}`,
    10_000
  );
  if (!html || html.length < 400) return [];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi)].slice(0, 24);
  for (const block of blocks) {
    const chunk = block[0] || "";
    const a = chunk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let url = decodeBingRedirect(String(a[1] || "").trim());
    const title = (a[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snipM = chunk.match(/class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const citeM = chunk.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
    const snippet = (snipM?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const cite = (citeM?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(url) && cite) {
      const maybe = cite.split(/\s*[›>]\s*/)[0]?.trim() || "";
      if (/^https?:\/\//i.test(maybe)) url = maybe;
      else if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(maybe)) url = `https://${maybe}`;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    if (/bing\.com\/(search|news|images)/i.test(url)) continue;
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ url, title, snippet: snippet || cite });
  }
  return hits;
}

export type WebSearchHit = Hit;

export async function searchWebHits(query: string): Promise<Hit[]> {
  const [a, b] = await Promise.all([duckDuckGo(query), bingSearch(query, 1)]);
  return [...a, ...b];
}

export async function fetchHtmlText(url: string, ms = 10_000): Promise<string> {
  return fetchText(url, ms);
}

async function newsRss(query: string): Promise<Hit[]> {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const feeds = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`
  ];
  for (const feedUrl of feeds) {
    const xml = await fetchText(feedUrl, 10_000);
    if (!xml || !/<item/i.test(xml)) continue;
    for (const item of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20)) {
      const body = item[1] || "";
      const title = (
        body.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ||
        body.match(/<title>([^<]+)<\/title>/i)?.[1] ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      const link = (
        body.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i)?.[1] ||
        body.match(/<link>([^<]+)<\/link>/i)?.[1] ||
        ""
      ).trim();
      const snippet = (
        body.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ||
        body.match(/<description>([^<]+)<\/description>/i)?.[1] ||
        ""
      )
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!title || !/^https?:\/\//i.test(link)) continue;
      const key = `${title}|${link}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ url: link, title, snippet });
    }
  }
  return hits;
}

const ADULT_HOST =
  /jable|missav|hanime|pornhub|xvideos|xnxx|xhamster|onlyfans|chaturbate|stripchat|spankbang|91porn|ggjav|javlibrary|avgle|netflav|supjav|njav|hpjav|thisav|tktube|youjizz/i;

const ADULT_TEXT = /\b(porn|xxx|nsfw|hentai|jav\b|adult video|live sex|cam girl)\b/i;

const US_STATE_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

function expandPlaceToken(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  const up = t.toUpperCase();
  if (US_STATE_NAME[up]) return US_STATE_NAME[up];
  return t;
}

function isUsSearch(country: string): boolean {
  return /united states|^us$|^usa$/i.test(String(country || "").trim());
}

function bingLocale(country: string): { cc: string; mkt: string } {
  const n = String(country || "").trim().toLowerCase();
  const table: Record<string, { cc: string; mkt: string }> = {
    germany: { cc: "DE", mkt: "de-DE" },
    france: { cc: "FR", mkt: "fr-FR" },
    italy: { cc: "IT", mkt: "it-IT" },
    spain: { cc: "ES", mkt: "es-ES" },
    japan: { cc: "JP", mkt: "ja-JP" },
    "united kingdom": { cc: "GB", mkt: "en-GB" },
    uk: { cc: "GB", mkt: "en-GB" },
    australia: { cc: "AU", mkt: "en-AU" },
    canada: { cc: "CA", mkt: "en-CA" },
    india: { cc: "IN", mkt: "en-IN" },
    brazil: { cc: "BR", mkt: "pt-BR" },
    mexico: { cc: "MX", mkt: "es-MX" },
    netherlands: { cc: "NL", mkt: "nl-NL" },
    "south korea": { cc: "KR", mkt: "ko-KR" },
    korea: { cc: "KR", mkt: "ko-KR" },
    singapore: { cc: "SG", mkt: "en-SG" },
    "united arab emirates": { cc: "AE", mkt: "en-AE" },
    china: { cc: "CN", mkt: "zh-CN" },
    taiwan: { cc: "TW", mkt: "zh-TW" },
    "hong kong": { cc: "HK", mkt: "zh-HK" },
    poland: { cc: "PL", mkt: "pl-PL" },
    sweden: { cc: "SE", mkt: "sv-SE" },
    switzerland: { cc: "CH", mkt: "de-CH" },
    austria: { cc: "AT", mkt: "de-AT" },
    belgium: { cc: "BE", mkt: "fr-BE" },
    indonesia: { cc: "ID", mkt: "id-ID" },
    thailand: { cc: "TH", mkt: "th-TH" },
    vietnam: { cc: "VN", mkt: "vi-VN" },
    malaysia: { cc: "MY", mkt: "en-MY" },
    "new zealand": { cc: "NZ", mkt: "en-NZ" },
    "south africa": { cc: "ZA", mkt: "en-ZA" }
  };
  return table[n] || { cc: "US", mkt: "en-US" };
}

function geoSearchPhrase(opts: { city?: string; province?: string; countryNameEn?: string }): string {
  const city = String(opts.city || "").trim();
  const region = expandPlaceToken(opts.province || "");
  const country = String(opts.countryNameEn || "").trim();
  const bits: string[] = [];
  if (city) bits.push(`"${city}"`);
  if (region && region.toLowerCase() !== city.toLowerCase()) bits.push(`"${region}"`);
  if (country) bits.push(`"${country}"`);
  return bits.join(" ");
}

function skipCompanyHost(host: string, country = ""): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  if (!h) return true;
  if (LIST_HOST.test(h)) return true;
  if (/(^|\.)google\.(com|com?\.\w+|co\.\w+)$/i.test(h)) return true;
  if (/(^|\.)(gstatic|googleusercontent|googleapis|youtube|youtu\.be|blogger|blogspot)\./i.test(h)) return true;
  if (/\b(wikipedia|wiktionary|wikimedia)\.org$/i.test(h)) return true;
  if (
    /^(dictionary|merriam-webster|thefreedictionary|vocabulary|definitions|thesaurus|urbandictionary|askdifference|poweredmagazine)\./i.test(
      h
    ) ||
    /(^|\.)cambridge\.org$/i.test(h)
  ) {
    return true;
  }
  if (/^(web\.)?whatsapp\.|(^|\.)(msn|g2|wwe|entrepreneur)\.com$/i.test(h)) return true;
  if (/(^|\.)(mailchimp|constantcontact|klaviyo|hubspot)\.com$/i.test(h)) return true;
  if (ADULT_HOST.test(h)) return true;
  if (/^\d{3,}\.[a-z]{2,}$/i.test(h)) return true;
  if (/\.(cc|tv|xyz|top|click|work|icu|rest|fit|buzz|monster|lol)$/i.test(h)) return true;
  if (isUsSearch(country) && /(\.co\.jp|\.or\.jp|\.ne\.jp|\.jp)$/i.test(h)) return true;
  if (isUsSearch(country) && /(^|\.)lixil\./i.test(h)) return true;
  return false;
}

function skipHit(hit: Hit): boolean {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
  return ADULT_TEXT.test(blob) || ADULT_HOST.test(blob);
}

const INDUSTRY_EN: Record<string, string> = {
  办公文具: "office stationery supplies",
  玻璃工艺品: "glass crafts",
  餐具用品: "tableware dinnerware cutlery",
  汽车配件: "auto parts automotive components",
  大型机械及设备: "heavy machinery industrial equipment",
  电子电气产品: "electrical electronics equipment",
  电子消费品: "consumer electronics",
  服装: "apparel clothing garments",
  家具: "furniture",
  箱包及皮具制品: "bags leather goods luggage",
  个人护理用品: "personal care cosmetics skincare",
  工程机械: "construction machinery excavator",
  工具: "hand tools power tools",
  化工产品制品: "chemical products",
  家居日用品: "household products housewares",
  家居装饰品: "home decor furnishings",
  家用电器: "home appliances",
  家用纺织品: "home textiles bedding",
  建筑材料: "building materials construction",
  礼品及赠品: "gifts promotional products",
  摩托车产品: "motorcycle parts accessories",
  食品及保健品: "food supplements health products",
  陶瓷制品: "ceramics pottery tableware",
  体育及旅游休闲产品: "sports outdoor leisure",
  玩具: "toys",
  卫浴产品: "bathroom sanitary ware",
  五金制品: "hardware metal products",
  小型机械产品: "small machinery equipment",
  鞋子: "footwear shoes",
  医疗器械及保健品: "medical devices healthcare",
  园林园艺: "garden horticulture landscaping",
  照明灯具: "lighting lamps LED",
  钟表产品: "watches clocks",
  自行车产品: "bicycle cycling parts"
};

/** 官网核验用同义词；禁止单独用 care / personal，避免命中银行 careers、customer care */
const INDUSTRY_NEEDLES: Record<string, string[]> = {
  办公文具: ["stationery", "office supplies", "notebook", "pen", "folder"],
  玻璃工艺品: ["glassware", "glass craft", "crystal"],
  餐具用品: ["tableware", "dinnerware", "cutlery", "crockery"],
  汽车配件: ["auto parts", "automotive", "car parts", "aftermarket"],
  大型机械及设备: ["heavy machinery", "industrial equipment", "excavator"],
  电子电气产品: ["electrical", "electronics", "pcb", "switchgear"],
  电子消费品: ["consumer electronics", "gadget", "headphones"],
  服装: ["apparel", "clothing", "garment", "fashion", "ready to wear"],
  家具: ["furniture", "sofa", "cabinet", "furnishings"],
  箱包及皮具制品: ["leather", "handbag", "luggage", "wallet"],
  个人护理用品: [
    "skincare",
    "skin care",
    "cosmetics",
    "cosmetic",
    "beauty",
    "personal care",
    "toiletries",
    "shampoo",
    "serum",
    "moisturizer",
    "makeup",
    "fragrance",
    "护肤",
    "美容",
    "化妆品"
  ],
  工程机械: ["construction machinery", "excavator", "loader"],
  工具: ["hand tools", "power tools", "wrench"],
  化工产品制品: ["chemical", "resin", "solvent"],
  家居日用品: ["housewares", "household", "homeware"],
  家居装饰品: ["home decor", "decoration", "ornament"],
  家用电器: ["appliance", "refrigerator", "washing machine"],
  家用纺织品: ["bedding", "textile", "towel", "linen"],
  建筑材料: ["building material", "cement", "tile"],
  礼品及赠品: ["promotional", "gift", "souvenir"],
  摩托车产品: ["motorcycle", "motorbike", "scooter parts"],
  食品及保健品: ["food", "supplement", "nutraceutical", "snack"],
  陶瓷制品: ["ceramic", "pottery", "porcelain"],
  体育及旅游休闲产品: ["sports", "outdoor", "leisure", "camping"],
  玩具: ["toy", "toys", "playset"],
  卫浴产品: ["bathroom", "sanitary", "faucet", "toilet"],
  五金制品: ["hardware", "fastener", "metal parts"],
  小型机械产品: ["small machinery", "compressor", "pump"],
  鞋子: ["footwear", "shoes", "sneakers"],
  医疗器械及保健品: ["medical device", "healthcare", "diagnostic"],
  园林园艺: ["garden", "horticulture", "landscaping"],
  照明灯具: ["lighting", "led lamp", "luminaire"],
  钟表产品: ["watch", "watches", "clock"],
  自行车产品: ["bicycle", "cycling", "bike parts"]
};

function englishSearchTopic(industry: string, keywords: string): string {
  const raw = `${industry} ${keywords}`.trim();
  const mapped: string[] = [];
  for (const [zh, en] of Object.entries(INDUSTRY_EN)) {
    if (raw.includes(zh)) mapped.push(en);
  }
  const en = raw
    .replace(/[\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (en) mapped.push(en);
  if (keywords && !/[\u4e00-\u9fff]/.test(keywords)) mapped.push(keywords);
  const out = [...new Set(mapped.map((s) => s.trim()).filter(Boolean))].join(" ").trim();
  return out || (industry ? industry : "manufacturer wholesaler");
}

function searchOrQuery(industry: string, keywords: string): string {
  const needles = icpNeedles(industry, keywords).filter((n) => !/[\u4e00-\u9fff]/.test(n)).slice(0, 8);
  if (!needles.length) return englishSearchTopic(industry, keywords);
  return needles.map((n) => (n.includes(" ") ? `"${n}"` : n)).join(" OR ");
}

function icpNeedles(industry: string, keywords: string): string[] {
  const GENERIC = /^(personal|care|products?|small|business|official|website|company|group|services?|online|home|best|free|made|with|from|that|this|your|our)$/i;
  const out: string[] = [];
  const raw = `${industry} ${keywords}`.trim();
  for (const [zh, list] of Object.entries(INDUSTRY_NEEDLES)) {
    if (raw.includes(zh)) out.push(...list);
  }
  for (const part of String(keywords || "").split(/[,，;；]/)) {
    const s = part.trim().toLowerCase();
    if (s.length >= 4 && !GENERIC.test(s)) out.push(s);
  }
  if (/[\u4e00-\u9fff]/.test(industry)) out.push(industry.trim());
  return [...new Set(out.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 24);
}

function htmlHasIndustry(blob: string, needles: string[]): boolean {
  if (!needles.length) return true;
  const low = blob.toLowerCase();
  return needles.some((n) => {
    if (n.includes(" ") || /[\u4e00-\u9fff]/.test(n)) return low.includes(n);
    return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low);
  });
}

function domainsFromHit(hit: Hit, country = ""): string[] {
  const host = hostOf(hit.url);
  if (!host || skipCompanyHost(host, country) || SKIP_PATH_HOST.test(hit.url)) return [];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return [];
  return [host];
}

export async function websiteReachable(website: string, domain: string): Promise<boolean> {
  const host = String(domain || "")
    .replace(/^www\./i, "")
    .toLowerCase();
  if (!host || !host.includes(".") || /\.invalid$/i.test(host)) return false;
  let base = String(website || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${host}`;
  for (const url of [base, `https://${host}`, `http://${host}`]) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html"
        }
      });
      if (res.status >= 500) continue;
      const html = await res.text();
      if (/domain is for sale|buy this domain|sedoparking|huge domains|this domain is parked/i.test(html)) {
        return false;
      }
      if (html.length < 80 && res.status >= 400) continue;
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function collectHitsToCompanies(hits: Hit[], opts: { countryNameEn: string; city: string; industry: string; keywords: string }): WebFoundCompany[] {
  const byHost = new Map<string, WebFoundCompany>();
  for (const hit of hits) {
    if (skipHit(hit)) continue;
    for (const host of domainsFromHit(hit, opts.countryNameEn)) {
      if (byHost.has(host)) {
        const prev = byHost.get(host)!;
        const extra = `${hit.title} ${hit.snippet}`.slice(0, 400);
        if (extra && !(prev.evidence || "").includes(extra.slice(0, 80))) {
          prev.evidence = `${prev.evidence || ""} ${extra}`.slice(0, 1200);
        }
        continue;
      }
      byHost.set(host, {
        name: nameFromTitle(hit.title, host),
        domain: host,
        website: `https://${host}`,
        country: opts.countryNameEn || "",
        city: opts.city || "",
        mainBusiness: opts.industry || opts.keywords || "",
        evidence: `${hit.title} ${hit.snippet}`.slice(0, 800)
      });
    }
  }
  return [...byHost.values()];
}

export async function discoverCompaniesFromWebNews(opts: {
  keywords: string;
  industry: string;
  countryNameEn: string;
  city: string;
  province?: string;
  limit: number;
}): Promise<WebFoundCompany[]> {
  const geo = geoSearchPhrase(opts);
  const orTopic = searchOrQuery(opts.industry, opts.keywords);
  const country = opts.countryNameEn || "";
  const needles = icpNeedles(opts.industry, opts.keywords);
  const sme = isUsSearch(country)
    ? '("small business" OR manufacturer OR wholesaler OR distributor OR brand OR shop OR LLC OR Ltd OR Inc)'
    : '("small business" OR manufacturer OR wholesaler OR distributor OR brand OR shop OR GmbH OR Ltd OR Pte OR SARL OR SpA OR Pty OR BV)';
  const skipJunk = "-wikipedia -dictionary -github -linkedin -porn -xxx -jav";
  const queries = [
    `(${orTopic}) ${geo} ${sme} ${skipJunk}`,
    `(${orTopic}) "${country}" (manufacturer OR factory OR wholesaler OR supplier OR brand) ${skipJunk}`,
    `(${orTopic}) ${geo} (association OR directory OR "member list") ${skipJunk}`,
    `(${orTopic}) ${geo} (exhibition OR "trade show" OR exhibitors) ${skipJunk}`,
    `(${orTopic}) ${country} official website ${skipJunk}`
  ].map((q) => q.replace(/\s+/g, " ").trim());
  const pages = [1, 11, 21, 31, 41];
  const packs = await Promise.all(
    queries.flatMap((q) => [duckDuckGo(q), ...pages.map((first) => bingSearch(q, first, country))])
  );
  const news = await newsRss(`${orTopic} ${geo} ${sme}`);
  const serpHits = [...packs.flat(), ...news];
  const harvested = await harvestListPages(serpHits, opts.countryNameEn, needles);
  const mainBusiness = [opts.industry, opts.keywords].filter(Boolean).join(" · ");
  const cap = Math.max(opts.limit * 6, opts.limit, 400);
  return collectHitsToCompanies([...serpHits, ...harvested], {
    ...opts,
    industry: mainBusiness || opts.industry
  }).slice(0, cap);
}

/** Companies that publicly look like they already use an ESP (Mailchimp / Klaviyo / …). */
export async function discoverEspUserCompanies(opts: {
  keywords: string;
  industry: string;
  countryNameEn: string;
  city: string;
  limit: number;
}): Promise<WebFoundCompany[]> {
  const place = [opts.city, opts.countryNameEn].filter(Boolean).join(" ") || "United States";
  const skipVendors =
    "-mailchimp.com -klaviyo.com -hubspot.com -constantcontact.com -sendgrid.net -brevo.com -mailerlite.com -zoominfo -wikipedia -github -list";
  const queries = [
    `"powered by Mailchimp" ${place} -mailchimp.com ${skipVendors}`,
    `"we use Klaviyo" OR "powered by Klaviyo" ${place} ecommerce ${skipVendors}`,
    `"Constant Contact" newsletter ${place} small business ${skipVendors}`,
    `"Mailchimp" "unsubscribe" ${place} shop OR store ${skipVendors}`,
    `Brevo OR Sendinblue customer case ${place} ${skipVendors}`,
    `"email newsletter" "powered by" ${place} brand ${skipVendors}`
  ];
  const packs = await Promise.all(
    queries.flatMap((q) => [duckDuckGo(q), bingSearch(q)])
  );
  const news = await newsRss(`Mailchimp OR Klaviyo customer ${place} marketing`);
  const companies = collectHitsToCompanies([...packs.flat(), ...news], {
    ...opts,
    industry: opts.industry || "email marketing ESP user",
    keywords: opts.keywords || "Mailchimp Klaviyo"
  });
  return companies.slice(0, Math.max(opts.limit * 4, opts.limit));
}

function countryTldLooksRight(host: string, country: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  const n = String(country || "").trim().toLowerCase();
  if (!h || !n) return false;
  const rules: Array<[RegExp, RegExp]> = [
    [/canada/, /\.ca$/i],
    [/australia/, /(\.com\.au|\.au)$/i],
    [/united kingdom|^uk$|^great britain$/, /(\.co\.uk|\.uk)$/i],
    [/germany|deutschland/, /\.de$/i],
    [/france/, /\.fr$/i],
    [/japan/, /\.jp$/i],
    [/singapore/, /\.sg$/i],
    [/new zealand/, /\.nz$/i],
    [/india/, /\.in$/i],
    [/brazil/, /\.br$/i],
    [/mexico/, /\.mx$/i],
    [/italy/, /\.it$/i],
    [/spain/, /\.es$/i],
    [/netherlands/, /\.nl$/i],
    [/switzerland/, /\.ch$/i],
    [/sweden/, /\.se$/i],
    [/malaysia/, /\.my$/i],
    [/thailand/, /\.th$/i],
    [/vietnam/, /\.vn$/i],
    [/indonesia/, /\.id$/i],
    [/philippines/, /\.ph$/i],
    [/south korea|^korea$/, /\.kr$/i],
    [/china/, /\.cn$/i],
    [/hong kong/, /\.hk$/i],
    [/taiwan/, /\.tw$/i],
    [/united arab emirates|^uae$/, /\.ae$/i],
    [/south africa/, /\.za$/i],
    [/ireland/, /\.ie$/i],
    [/austria/, /\.at$/i],
    [/belgium/, /\.be$/i],
    [/poland/, /\.pl$/i],
    [/portugal/, /\.pt$/i],
    [/denmark/, /\.dk$/i],
    [/norway/, /\.no$/i],
    [/finland/, /\.fi$/i]
  ];
  return rules.some(([cn, tld]) => cn.test(n) && tld.test(h));
}

export async function keepLiveCompanyWebsites(
  list: WebFoundCompany[],
  cap: number,
  icp?: { industry: string; keywords: string; countryNameEn?: string; city?: string; province?: string },
  onProgress?: (kept: WebFoundCompany[], checked: number, total: number) => void,
  shouldStop?: () => boolean
): Promise<WebFoundCompany[]> {
  const needles = icpNeedles(icp?.industry || "", icp?.keywords || "");
  const country = icp?.countryNameEn || "";
  const city = icp?.city || "";
  const province = icp?.province || "";
  const out: WebFoundCompany[] = [];
  const pool = 8;
  let i = 0;
  async function worker() {
    while (out.length < cap && i < list.length) {
      if (shouldStop?.()) break;
      onProgress?.(out, i, list.length);
      const idx = i++;
      if (idx >= list.length || out.length >= cap) break;
      const co = list[idx];
      if (!co) break;
      if (skipCompanyHost(co.domain, country) || LIST_HOST.test(co.domain)) continue;
      const html = await fetchHomepageHtml(co.website, co.domain);
      const evidence = String(co.evidence || "");
      const blob = `${html || ""} ${evidence}`.slice(0, 80_000).toLowerCase();
      if (ADULT_TEXT.test(blob) || ADULT_HOST.test(blob)) continue;
      if (/domain is for sale|buy this domain|sedoparking|this domain is parked/i.test(blob)) continue;
      if (isUsSearch(country) && /(\.co\.jp|\.jp)$/i.test(co.domain)) continue;
      const tldOk = countryTldLooksRight(co.domain, country);
      const geoOk =
        tldOk ||
        !country ||
        blob.includes(country.toLowerCase()) ||
        (city && blob.includes(city.toLowerCase())) ||
        (province && blob.includes(String(province).toLowerCase()));
      const topicHit = htmlHasIndustry(blob, needles);
      const companyish =
        /contact|about us|our story|privacy|impressum|über uns|mentions légales|chi siamo|aviso legal|会社|お問い合わせ|llc|gmbh|sarl|\bltd\b|\binc\b|pte\.?\s*ltd|wholesale|manufacturer|distributor|factory|shop now|add to cart|our products|checkout|store locator/.test(
          blob
        );
      if (needles.length && !topicHit) continue;
      if (!html) {
        if (!geoOk) continue;
        out.push(co);
        continue;
      }
      if (!companyish && !tldOk && !geoOk) continue;
      out.push(co);
    }
  }
  await Promise.all(Array.from({ length: pool }, () => worker()));
  onProgress?.(out, list.length, list.length);
  return out.slice(0, cap);
}

async function fetchHomepageHtml(website: string, domain: string): Promise<string> {
  const host = String(domain || "")
    .replace(/^www\./i, "")
    .toLowerCase();
  if (!host || skipCompanyHost(host)) return "";
  let base = String(website || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${host}`;
  for (const url of [base, `https://${host}`, `http://${host}`]) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html"
        }
      });
      if (res.status >= 500) continue;
      const html = await res.text();
      if (html.length < 80 && res.status >= 400) continue;
      return html;
    } catch {
      /* next */
    }
  }
  return "";
}
