import type { LeadFinderRoleTierId } from "./leadFinderRoleTiers";
import { titleMatchesSelectedRoles } from "./leadFinderRoleTiers";
import {
  cleanLeadFinderPersonName,
  contactKindOf,
  isPlausibleLeadFinderPersonName,
  pickCompanySize,
  pickLinkedInCompanyUrl
} from "./leadFinderPersonGate";
import { classifyMajorIndustryTags } from "./leadFinderIndustryTags";
import {
  leadFinderAiEnrich,
  leadFinderDiscoverLane,
  leadFinderGuessVerifyBatch,
  leadFinderLeadsSync,
  leadFinderScrape
} from "./leadFinderWebApi";
import type {
  LeadFinderCompanyBlock,
  LeadFinderContact,
  LeadFinderScrapePack,
  ProgressItemState
} from "./leadFinderWebTypes";

function brandFromDomain(query: string): string {
  const raw = query.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = raw.split("/")[0] || raw;
  const base = host.split(".")[0] || host;
  if (!base) return host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function mergePeopleHints(
  lists: Array<Array<{ name: string; title?: string | null }> | undefined>,
  opts?: { trustedServer?: boolean }
): Array<{ name: string; title?: string | null }> {
  const out: Array<{ name: string; title?: string | null }> = [];
  const seen = new Set<string>();
  const trusted = opts?.trustedServer !== false; // default trust server-finalize'd hints
  for (const list of lists) {
    for (const p of list || []) {
      const cleaned = cleanLeadFinderPersonName(String(p.name || ""));
      if (!cleaned || !isPlausibleLeadFinderPersonName(cleaned, { trustedServer: trusted })) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: cleaned, title: p.title ?? null });
    }
  }
  return out;
}

/** Merge contact rows from scrape + all discover-lanes (keep generics + named people). */
function mergeContactItems(lists: Array<LeadFinderContact[] | undefined>): LeadFinderContact[] {
  const out: LeadFinderContact[] = [];
  const byEmail = new Set<string>();
  const byName = new Set<string>();
  for (const list of lists) {
    for (const raw of list || []) {
      const c = normalizeContact(raw);
      const email = String(c.email || "")
        .trim()
        .toLowerCase();
      const name = String(c.contact_name || c.name || "")
        .trim()
        .toLowerCase();
      if (email && email.includes("@")) {
        if (byEmail.has(email)) continue;
        byEmail.add(email);
        if (name) byName.add(name);
        out.push(c);
        continue;
      }
      if (name) {
        if (byName.has(name)) continue;
        byName.add(name);
        out.push(c);
      }
    }
  }
  return out;
}

const GENERIC_LOCAL =
  /^(info|sales|support|hello|contact|admin|office|hr|media|press|enquiries|enquiry|inquiry|service|team|care|help|shop|store|orders?|noreply|no-reply|newsletter|cs|custserv|customerservice|customer\.service|investor|investors|ir|pr|marketing|biz|business|partners?)\b/i;

function isGenericMailbox(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const local = e.split("@")[0] || "";
  return GENERIC_LOCAL.test(local);
}

function inferKind(title: string | null | undefined): "decision_makers" | "people" {
  const t = String(title || "").toLowerCase();
  if (
    /\b(ceo|cto|cfo|coo|cmo|cio|cro|cpo|founder|co-founder|president|owner|director|vp|vice president|head of|chief|partner|consultant)\b/.test(
      t
    ) ||
    /\bc[a-z]{1,4}o\b/.test(t)
  ) {
    return "decision_makers";
  }
  return "people";
}

function normalizeContact(c: LeadFinderContact): LeadFinderContact {
  const rawName = (c.contact_name || c.name || null) as string | null;
  const cleaned = rawName ? cleanLeadFinderPersonName(rawName) : "";
  // Soft gate only (industry / headline junk) — mirror plugin trust of server-finalize'd names
  const contact_name =
    cleaned && isPlausibleLeadFinderPersonName(cleaned, { trustedServer: true }) ? cleaned : null;
  const email = c.email ? String(c.email).trim() : null;
  const hasMail = Boolean(email && email.includes("@") && !email.startsWith("__person__:"));

  if (rawName && !contact_name && !hasMail) {
    return {
      ...c,
      contact_name: null,
      name: null,
      email: null,
      kind: "people",
      email_status: "no_email",
      source: "rejected-name"
    };
  }

  let kind = String(c.kind || "").trim();
  if (hasMail && (!contact_name || isGenericMailbox(email) || String(c.source || "") === "generic")) {
    if (!contact_name || isGenericMailbox(email)) kind = "generic";
  }
  if (!kind) kind = contact_name ? inferKind(c.title) : "generic";
  if (kind !== "generic" && contact_name) kind = inferKind(c.title) || kind;

  return {
    ...c,
    contact_name,
    name: contact_name,
    email: hasMail ? email : null,
    kind: contact_name ? (kind === "generic" ? inferKind(c.title) : kind) : "generic",
    email_status: c.email_status || (hasMail ? "unverified" : "queued")
  };
}

/**
 * Build roster like Chrome plugin: keep ALL people + decision makers + generics.
 * Role checkboxes only sort matching titles first (do not hard-drop — that was causing ~3 people).
 */
function contactsFromPack(
  pack: LeadFinderScrapePack,
  roleFilter: LeadFinderRoleTierId[]
): LeadFinderContact[] {
  const fromItems = (pack.items || []).map(normalizeContact);
  const names = new Set(
    fromItems.map((c) => String(c.contact_name || c.name || "").trim().toLowerCase()).filter(Boolean)
  );
  const fromHints: LeadFinderContact[] = [];
  for (const p of pack.peopleHints || []) {
    const name = String(p.name || "").trim();
    if (!name || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    fromHints.push(
      normalizeContact({
        contact_name: name,
        title: p.title ?? null,
        email: null,
        kind: inferKind(p.title),
        email_status: "queued",
        source: "gap-fill"
      })
    );
  }
  const all = [...fromItems, ...fromHints]
    .map((c) => ({ ...c, kind: contactKindOf(c) }))
    .filter((c) => {
      if (c.source === "rejected-name") return false;
      if (String(c.kind) === "generic") return Boolean(c.email);
      return Boolean(String(c.contact_name || "").trim());
    });

  const rank = (c: LeadFinderContact): number => {
    const kind = contactKindOf(c);
    if (kind === "generic") return 30;
    const match = titleMatchesSelectedRoles(c.title, roleFilter);
    if (kind === "decision_makers" && match) return 0;
    if (kind === "decision_makers") return 1;
    if (match) return 2;
    return 10;
  };

  return all.sort((a, b) => rank(a) - rank(b));
}

function companyFromPack(
  pack: LeadFinderScrapePack,
  columns: string[],
  roleFilter: LeadFinderRoleTierId[]
): LeadFinderCompanyBlock {
  const co = (pack.company || {}) as Record<string, unknown>;
  const domain = String(pack.domain || "").trim().toLowerCase();
  const name =
    String(co.name || co.company_name || "").trim() || brandFromDomain(domain) || domain;
  const phone =
    (co.phone as string) ||
    (co.telephone as string) ||
    (co.tel as string) ||
    (co.company_phone as string) ||
    null;
  const year =
    co.year_founded != null
      ? String(co.year_founded)
      : co.founded_year != null
        ? String(co.founded_year)
        : co.founded != null
          ? String(co.founded)
          : null;
  const size =
    (co.size as string) ||
    (co.employee_range as string) ||
    (co.employees as string) ||
    null;
  const city = (co.city as string) || null;
  const location =
    (co.location as string) ||
    (co.address as string) ||
    (city ? city : null);
  const rawTags = Array.isArray(co.tags) ? (co.tags as string[]) : [];
  const tags = classifyMajorIndustryTags({
    industry: (co.industry as string) || null,
    description: (co.description as string) || null,
    companyName: name,
    tags: rawTags
  });
  const industry =
    ((co.industry as string) || null) && String(co.industry) !== "其他"
      ? String(co.industry)
      : tags.find((t) => t !== "其他") || (co.industry as string) || null;
  return {
    domain,
    company_name: name,
    website: (co.website as string) || `https://${domain}`,
    industry,
    company_type: (co.company_type as string) || null,
    size,
    location,
    country: (co.country as string) || null,
    city,
    year_founded: year,
    funding_series: (co.funding_series as string) || null,
    funding_amount: (co.funding_amount as string) || null,
    last_funding_date: (co.last_funding_date as string) || null,
    source: (co.source as string) || "lead_finder",
    description: (co.description as string) || null,
    tags,
    technology: Array.isArray(co.technology) ? (co.technology as string[]) : [],
    signals: Array.isArray(pack.signals)
      ? pack.signals
      : Array.isArray(co.signals)
        ? (co.signals as string[])
        : [],
    linkedin: (co.linkedin as string) || null,
    twitter: (co.twitter as string) || null,
    facebook: (co.facebook as string) || null,
    youtube: (co.youtube as string) || null,
    instagram: (co.instagram as string) || null,
    updated_at: (co.updated_at as string) || null,
    created_at: (co.created_at as string) || null,
    phone,
    columns: [...columns],
    contacts: contactsFromPack(pack, roleFilter)
  };
}

function pickFilled(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

function mergeCompanyPreferFilled(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...a,
    ...b,
    name: pickFilled(b.name, b.company_name, a.name, a.company_name),
    company_name: pickFilled(b.company_name, b.name, a.company_name, a.name),
    website: pickFilled(b.website, a.website),
    description: (() => {
      const bd = String(b.description || "").trim();
      const ad = String(a.description || "").trim();
      if (bd.length >= ad.length && bd.length > 0) return bd;
      return ad || bd || null;
    })(),
    industry: pickFilled(b.industry, a.industry),
    company_type: pickFilled(b.company_type, a.company_type),
    size: pickFilled(b.size, b.employee_range, a.size, a.employee_range),
    employee_range: pickFilled(b.employee_range, b.size, a.employee_range, a.size),
    location: pickFilled(b.location, b.address, a.location, a.address),
    address: pickFilled(b.address, b.location, a.address, a.location),
    city: pickFilled(b.city, a.city),
    country: pickFilled(b.country, a.country),
    phone: pickFilled(b.phone, b.tel, b.telephone, a.phone, a.tel, a.telephone),
    year_founded: pickFilled(b.year_founded, b.founded_year, b.founded, a.year_founded, a.founded_year),
    founded_year: pickFilled(b.founded_year, b.year_founded, b.founded, a.founded_year, a.year_founded),
    linkedin: pickFilled(b.linkedin, a.linkedin),
    twitter: pickFilled(b.twitter, a.twitter),
    facebook: pickFilled(b.facebook, a.facebook),
    youtube: pickFilled(b.youtube, a.youtube),
    instagram: pickFilled(b.instagram, a.instagram),
    tags: [
      ...new Set([
        ...(Array.isArray(a.tags) ? (a.tags as string[]) : []),
        ...(Array.isArray(b.tags) ? (b.tags as string[]) : [])
      ])
    ]
  };
}

function extractPhoneFromText(text: string): string | null {
  const tel = String(text || "").match(/tel:([+\d][\d()\s.-]{6,})/i);
  if (tel?.[1]) return tel[1].replace(/\s+/g, " ").trim().slice(0, 64);
  const intl = String(text || "").match(
    /(?:\+|00)\d{1,3}[\s.-]?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/
  );
  return intl ? intl[0].replace(/\s+/g, " ").trim().slice(0, 64) : null;
}

function buildAiContextFromLanes(
  site: LeadFinderScrapePack | null,
  lanes: Array<LeadFinderScrapePack | null | undefined>
): string {
  const parts: string[] = [];
  const siteCtx = String(site?.aiContext || "").trim();
  if (siteCtx) parts.push(siteCtx);
  for (const lane of lanes) {
    if (!lane) continue;
    const ctx = String(lane.aiContext || "").trim();
    if (ctx) parts.push(ctx);
    for (const u of lane.pagesFetched || []) {
      parts.push(`[page:${u}]`);
    }
    for (const p of lane.peopleHints || []) {
      parts.push(`Person: ${p.name}${p.title ? ` — ${p.title}` : ""}`);
    }
  }
  return parts.join("\n\n").slice(0, 100_000);
}

/** 展开式搜索进度标签（各车道并行启动，完成一项打勾一项） */
export function buildExpandedProgress(zh: boolean): ProgressItemState[] {
  const q = zh ? "排队" : "Queued";
  return [
    {
      id: "phase_website",
      label: zh ? "① 官网 Website（并行）" : "① Website (parallel)",
      status: "queued",
      note: q,
      isPhase: true
    },
    {
      id: "web_pages",
      label: zh ? "　· 抓取官网页面" : "　· Crawl website pages",
      status: "queued",
      note: q
    },
    {
      id: "web_people",
      label: zh ? "　· 从官网提取人名 / 职位" : "　· People & titles from site",
      status: "queued",
      note: q
    },
    {
      id: "web_emails",
      label: zh ? "　· 公开邮箱 / generic" : "　· Public / generic emails",
      status: "queued",
      note: q
    },
    {
      id: "web_li_icon",
      label: zh ? "　· 检测官网 LinkedIn 图标超链接" : "　· Detect LinkedIn icon link on site",
      status: "queued",
      note: q
    },
    {
      id: "phase_linkedin",
      label: zh ? "② LinkedIn（并行）" : "② LinkedIn (parallel)",
      status: "queued",
      note: q,
      isPhase: true
    },
    {
      id: "li_from_site",
      label: zh ? "　· 若有官网 LinkedIn 链接则跟进" : "　· Follow LinkedIn link from site",
      status: "queued",
      note: q
    },
    {
      id: "li_google",
      label: zh
        ? "　· Google「公司名 + LinkedIn」搜高管"
        : "　· Google “Company + LinkedIn”",
      status: "queued",
      note: q
    },
    {
      id: "phase_news",
      label: zh ? "③ 新闻 / 采访 / 访谈（并行）" : "③ News / interviews (parallel)",
      status: "queued",
      note: q,
      isPhase: true
    },
    {
      id: "news_people",
      label: zh
        ? "　· 报道 / interview 提取人名与职位"
        : "　· Names & titles from news / interviews",
      status: "queued",
      note: q
    },
    {
      id: "phase_funding",
      label: zh ? "④ 职位多路径 + 科技/融资/创投（并行）" : "④ Titles + funding / VC (parallel)",
      status: "queued",
      note: q,
      isPhase: true
    },
    {
      id: "titles_roles",
      label: zh
        ? "　· 按职位多路径搜索（CXO / Founder / …）"
        : "　· Multi-path title search (CXO / Founder / …)",
      status: "queued",
      note: q
    },
    {
      id: "funding_trace",
      label: zh
        ? "　· 平台 AI：简介 / 国家城市 / 电话 / LinkedIn / 规模成立年"
        : "　· Platform AI: about / geo / phone / LinkedIn / size / founded",
      status: "queued",
      note: q
    }
  ];
}

type RunOpts = {
  query: string;
  installId: string;
  columns: string[];
  roles: LeadFinderRoleTierId[];
  zh: boolean;
  onProgress: (items: ProgressItemState[]) => void;
};

function countPeople(pack: LeadFinderScrapePack | null | undefined): number {
  if (!pack) return 0;
  return (pack.peopleHints || []).length + (pack.items || []).filter((c) => c.contact_name || c.name).length;
}

function countEmails(pack: LeadFinderScrapePack | null | undefined): number {
  if (!pack) return 0;
  return (pack.items || []).filter((c) => String(c.email || "").includes("@")).length;
}

function countGenerics(pack: LeadFinderScrapePack | null | undefined): number {
  if (!pack) return 0;
  return (pack.items || []).filter((c) => {
    const kind = String(c.kind || "");
    const email = String(c.email || "");
    return kind === "generic" || isGenericMailbox(email);
  }).length;
}

function hasLinkedIn(pack: LeadFinderScrapePack | null | undefined): boolean {
  const co = pack?.company as { linkedin?: string } | undefined;
  return Boolean(co?.linkedin && String(co.linkedin).includes("linkedin"));
}

const SOCIAL_LANES = [
  { col: "facebook", lane: "facebook" },
  { col: "youtube", lane: "youtube" },
  { col: "instagram", lane: "instagram" },
  { col: "twitter", lane: "twitter" }
] as const;

/**
 * Mirror Chrome Lead Finder:
 * 1) Parallel: scrape + news + titles + linkedin_web (+ social columns)
 * 2) Then platform AI enrich with scrape aiContext → company phone/country/city/linkedin/about + more people
 * 3) Merge peopleHints + items (generics kept)
 */
export async function runLeadFinderWebSearch(opts: RunOpts): Promise<LeadFinderCompanyBlock> {
  const { query, installId, columns, roles, zh, onProgress } = opts;
  let progress = buildExpandedProgress(zh);
  const bump = (id: string, status: ProgressItemState["status"], note: string) => {
    progress = progress.map((p) => (p.id === id ? { ...p, status, note } : p));
    onProgress([...progress]);
  };
  const bumpMany = (ids: string[], status: ProgressItemState["status"], note: string) => {
    const set = new Set(ids);
    progress = progress.map((p) => (set.has(p.id) ? { ...p, status, note } : p));
    onProgress([...progress]);
  };
  const running = zh ? "并行搜索中…" : "Searching in parallel…";
  const done = zh ? "完成" : "Done";
  const fail = zh ? "失败" : "Failed";

  const brand = brandFromDomain(query);

  // Kick all progress rows to running together (plugin behavior)
  bumpMany(
    [
      "phase_website",
      "web_pages",
      "web_people",
      "web_emails",
      "web_li_icon",
      "phase_linkedin",
      "li_from_site",
      "li_google",
      "phase_news",
      "news_people",
      "phase_funding",
      "titles_roles",
      "funding_trace"
    ],
    "running",
    running
  );

  let warehouseSnap: LeadFinderScrapePack | null = null;
  try {
    warehouseSnap = await leadFinderScrape({
      query,
      installId,
      sources: columns,
      forceRefresh: false,
      warehouseOnly: true,
      skipWebEnrich: true
    });
  } catch {
    warehouseSnap = null;
  }

  type LaneBag = {
    site: LeadFinderScrapePack | null;
    news: LeadFinderScrapePack | null;
    titles: LeadFinderScrapePack | null;
    linkedin: LeadFinderScrapePack | null;
    social: LeadFinderScrapePack[];
    siteErr: unknown;
  };
  const bag: LaneBag = {
    site: null,
    news: null,
    titles: null,
    linkedin: null,
    social: [],
    siteErr: null
  };

  const siteP = leadFinderScrape({
    query,
    installId,
    sources: columns,
    forceRefresh: true,
    warehouseOnly: false,
    skipWebEnrich: true
  })
    .then((d) => {
      bag.site = d;
      const peopleN = countPeople(d);
      const emailN = countEmails(d);
      const genN = countGenerics(d);
      const liOnSite = hasLinkedIn(d);
      bump("web_pages", "done", done);
      bump("web_people", "done", peopleN ? `${done} · ${peopleN}` : done);
      bump(
        "web_emails",
        "done",
        emailN || genN
          ? `${done} · ${emailN}${zh ? " 封" : ""}${genN ? ` · generic ${genN}` : ""}`
          : done
      );
      bump(
        "web_li_icon",
        "done",
        liOnSite ? (zh ? "已发现链接" : "Link found") : zh ? "未发现" : "Not found"
      );
      bump("phase_website", "done", done);
      return d;
    })
    .catch(async (crawlErr) => {
      try {
        const d = await leadFinderScrape({
          query,
          installId,
          sources: columns,
          warehouseOnly: true,
          skipWebEnrich: true
        });
        bag.site = d;
        bump("web_pages", "done", zh ? "完成（库快照）" : "Done (warehouse)");
        bump("web_people", "done", `${done} · ${countPeople(d)}`);
        bump("web_emails", "done", `${done} · ${countEmails(d)}`);
        bump("web_li_icon", "done", hasLinkedIn(d) ? (zh ? "已发现" : "Found") : zh ? "未发现" : "Not found");
        bump("phase_website", "done", done);
        return d;
      } catch {
        bag.siteErr = crawlErr;
        bag.site = warehouseSnap;
        bump("web_pages", "error", fail);
        bump("web_people", "error", fail);
        bump("web_emails", "error", fail);
        bump("web_li_icon", "error", fail);
        bump("phase_website", "error", fail);
        throw crawlErr;
      }
    });

  const laneP = (lane: string, onOk: (d: LeadFinderScrapePack) => void, onFail: () => void) =>
    leadFinderDiscoverLane({
      query,
      lane,
      installId,
      companyName: brand
    })
      .then((d) => {
        onOk(d);
        return d;
      })
      .catch(() => {
        onFail();
        const empty: LeadFinderScrapePack = { peopleHints: [], pagesFetched: [], items: [] };
        onOk(empty);
        return empty;
      });

  const newsP = laneP(
    "news",
    (d) => {
      bag.news = d;
      const n = countPeople(d);
      bump("news_people", "done", n ? `${done} · ${n}` : done);
      bump("phase_news", "done", done);
    },
    () => {
      bump("news_people", "error", fail);
      bump("phase_news", "error", fail);
    }
  );

  const titlesP = laneP(
    "titles",
    (d) => {
      bag.titles = d;
      const n = countPeople(d);
      bump("titles_roles", "done", n ? `${done} · ${n}` : done);
    },
    () => bump("titles_roles", "error", fail)
  );

  const linkedinP = laneP(
    "linkedin_web",
    (d) => {
      bag.linkedin = d;
      const n = countPeople(d);
      const liOnSite = hasLinkedIn(bag.site || warehouseSnap);
      bump("li_from_site", "done", liOnSite ? (n ? `${done} · ${n}` : done) : zh ? "无站内链接" : "No site link");
      bump("li_google", "done", n ? `${done} · ${n}` : done);
      bump("phase_linkedin", "done", done);
    },
    () => {
      bump("li_from_site", "error", fail);
      bump("li_google", "error", fail);
      bump("phase_linkedin", "error", fail);
    }
  );

  const socialPs = SOCIAL_LANES.filter((s) => columns.includes(s.col)).map((s) =>
    leadFinderDiscoverLane({
      query,
      lane: s.lane,
      installId,
      companyName: brand
    })
      .then((d) => {
        bag.social.push(d);
        return d;
      })
      .catch(() => {
        const empty: LeadFinderScrapePack = { peopleHints: [], items: [], pagesFetched: [] };
        bag.social.push(empty);
        return empty;
      })
  );

  // Core lanes parallel (same as Chrome plugin) — AI enrich is step 2 with page text
  const settled = await Promise.all([
    siteP.then((d) => ({ ok: true as const, d })).catch((e) => ({ ok: false as const, e })),
    newsP,
    titlesP,
    linkedinP,
    ...socialPs
  ]);

  const sitePack = bag.site || warehouseSnap;
  if (!settled[0].ok && !sitePack?.domain) {
    throw (
      (settled[0] as { e: unknown }).e ||
      new Error(zh ? "搜索失败：未解析到企业域名" : "Search failed: missing company domain")
    );
  }
  if (!sitePack?.domain) {
    throw new Error(
      zh
        ? "搜索失败：未解析到企业域名。请输入官网如 nike.com"
        : "Search failed: missing company domain"
    );
  }

  // —— Platform AI enrich（与插件一致：必须带上 scrape 的 aiContext）——
  bump("funding_trace", "running", zh ? "平台 AI 抽取公司信息 / 人名…" : "Platform AI enriching company + people…");
  const aiContext = buildAiContextFromLanes(sitePack, [
    bag.news,
    bag.titles,
    bag.linkedin,
    ...bag.social,
    warehouseSnap
  ]);
  let aiCompany: Record<string, unknown> = {};
  let aiPeople: Array<{ name: string; title?: string | null }> = [];
  let aiContacts: LeadFinderContact[] = [];
  let aiSignals: string[] = [];
  try {
    if (aiContext.length >= 40 || (sitePack.pagesFetched || []).length > 0) {
      const enriched = await leadFinderAiEnrich({
        installId,
        domain: sitePack.domain,
        columns,
        aiContext
      });
      aiCompany = (enriched.company || {}) as Record<string, unknown>;
      aiPeople = enriched.peopleHints || [];
      aiSignals = Array.isArray(enriched.signals) ? enriched.signals.map(String) : [];
      aiContacts = (enriched.contacts || []).map((c) =>
        normalizeContact({
          contact_name: c.name || null,
          title: c.title ?? null,
          email: c.email ?? null,
          linkedin: c.linkedin ?? null,
          kind: c.email && !c.name ? "generic" : inferKind(c.title),
          email_status: c.email ? "unverified" : "queued",
          source: "ai"
        })
      );
      const n = aiPeople.length + aiContacts.filter((c) => c.contact_name).length;
      bump(
        "funding_trace",
        "done",
        n
          ? `${done} · AI +${n}`
          : zh
            ? "完成（公司字段已补）"
            : "Done (company fields)"
      );
    } else {
      bump("funding_trace", "done", zh ? "页面文本过少，跳过 AI" : "Thin page text — AI skipped");
    }
  } catch (e: unknown) {
    bump(
      "funding_trace",
      "done",
      zh
        ? `AI 跳过（${String((e as Error)?.message || e).slice(0, 40)}）`
        : `AI skipped (${String((e as Error)?.message || e).slice(0, 40)})`
    );
  }
  bump("phase_funding", "done", done);

  // 若并行车道人名过少，再跑一次「内嵌 web enrich」补人（插件车道失败时的托底）
  let recoveryPack: LeadFinderScrapePack | null = null;
  const namedBeforeRecovery = mergePeopleHints([
    sitePack.peopleHints,
    bag.linkedin?.peopleHints,
    bag.news?.peopleHints,
    bag.titles?.peopleHints,
    aiPeople,
    warehouseSnap?.peopleHints
  ]).length;
  if (namedBeforeRecovery < 5) {
    bump("funding_trace", "running", zh ? "人名偏少 · 补跑全量公开源…" : "Few people · full public enrich…");
    try {
      recoveryPack = await leadFinderScrape({
        query,
        installId,
        sources: columns,
        forceRefresh: true,
        warehouseOnly: false,
        skipWebEnrich: false
      });
      const n = countPeople(recoveryPack);
      bump(
        "funding_trace",
        "done",
        n ? `${done} · ${zh ? "补人" : "recover"} ${n}` : done
      );
    } catch {
      bump("funding_trace", "done", zh ? "补跑跳过" : "Recover skipped");
      recoveryPack = null;
    }
  }

  const socialHints = bag.social.map((s) => s.peopleHints);
  const socialItems = bag.social.map((s) => s.items || []);

  let mergedCompany = mergeCompanyPreferFilled(
    mergeCompanyPreferFilled(
      (warehouseSnap?.company || {}) as Record<string, unknown>,
      (sitePack.company || {}) as Record<string, unknown>
    ),
    aiCompany
  );
  if (recoveryPack?.company) {
    mergedCompany = mergeCompanyPreferFilled(mergedCompany, recoveryPack.company as Record<string, unknown>);
  }

  // Heuristic fills from page text / LinkedIn SERP if AI/warehouse missed
  const liHeuristic = pickLinkedInCompanyUrl(
    aiContext,
    ...(bag.linkedin?.pagesFetched || []),
    ...(sitePack.pagesFetched || []),
    String(mergedCompany.linkedin || "")
  );
  const phoneHeuristic = extractPhoneFromText(aiContext);
  if (liHeuristic) mergedCompany.linkedin = liHeuristic;
  if (!mergedCompany.phone && phoneHeuristic) mergedCompany.phone = phoneHeuristic;
  const sizePick = pickCompanySize(
    mergedCompany.size,
    mergedCompany.employee_range,
    mergedCompany.employees,
    aiCompany.size,
    aiCompany.employee_range
  );
  if (sizePick) {
    mergedCompany.size = sizePick;
    if (!mergedCompany.employee_range) mergedCompany.employee_range = sizePick;
  }

  const data: LeadFinderScrapePack = {
    ...sitePack,
    aiContext,
    peopleHints: mergePeopleHints([
      sitePack.peopleHints,
      bag.linkedin?.peopleHints,
      bag.news?.peopleHints,
      bag.titles?.peopleHints,
      aiPeople,
      recoveryPack?.peopleHints,
      warehouseSnap?.peopleHints,
      ...socialHints
    ]),
    items: mergeContactItems([
      sitePack.items,
      warehouseSnap?.items,
      bag.linkedin?.items,
      bag.news?.items,
      bag.titles?.items,
      aiContacts,
      recoveryPack?.items,
      ...socialItems
    ]),
    pagesFetched: [
      ...new Set([
        ...(sitePack.pagesFetched || []),
        ...(bag.linkedin?.pagesFetched || []),
        ...(bag.news?.pagesFetched || []),
        ...(bag.titles?.pagesFetched || []),
        ...(recoveryPack?.pagesFetched || []),
        ...bag.social.flatMap((s) => s.pagesFetched || [])
      ])
    ],
    signals: [
      ...new Set([
        ...(Array.isArray(sitePack.signals) ? sitePack.signals.map(String) : []),
        ...aiSignals
      ])
    ],
    company: mergedCompany
  };

  const block = companyFromPack(data, columns, roles.length ? roles : []);

  try {
    await leadFinderLeadsSync({
      domain: block.domain,
      installId,
      company: {
        name: block.company_name,
        website: block.website,
        industry: block.industry,
        tags: block.tags,
        description: block.description,
        country: block.country,
        city: block.city,
        location: block.location,
        size: block.size,
        year_founded: block.year_founded,
        linkedin: block.linkedin,
        phone: block.phone
      },
      contacts: block.contacts.map((c) => ({
        contact_name: c.contact_name,
        title: c.title,
        email: c.email,
        kind: c.kind,
        email_status: c.email_status === "valid" ? "valid" : "unverified",
        source: c.source || "web"
      })),
      peopleHints: (data.peopleHints || []).map((p) => ({ name: p.name, title: p.title }))
    });
  } catch {
    /* best-effort */
  }

  return block;
}

export async function verifyLeadFinderBlockPeople(
  block: LeadFinderCompanyBlock,
  installId: string,
  onUpdate: (next: LeadFinderCompanyBlock) => void
): Promise<LeadFinderCompanyBlock> {
  let next = { ...block, contacts: block.contacts.map((c) => ({ ...c })) };
  const people = next.contacts.filter((c) => {
    const kind = String(c.kind || "");
    if (kind === "generic") return false;
    const st = String(c.email_status || "").toLowerCase();
    if (st === "valid" || st === "no_email" || st === "invalid") return false;
    return Boolean(String(c.contact_name || c.name || "").trim());
  });

  for (const person of people) {
    const name = String(person.contact_name || person.name || "").trim();
    next = {
      ...next,
      contacts: next.contacts.map((c) =>
        String(c.contact_name || c.name || "").trim() === name
          ? { ...c, email_status: "verifying" }
          : c
      )
    };
    onUpdate(next);

    try {
      const res = await leadFinderGuessVerifyBatch({
        domain: block.domain,
        installId,
        people: [{ name, title: person.title ?? null }],
        knownEmails: []
      });
      const hit = (res.results || [])[0];
      const email =
        hit?.email && String(hit.email_status || "").toLowerCase() === "valid" ? hit.email : "";
      next = {
        ...next,
        contacts: next.contacts.map((c) => {
          if (String(c.contact_name || c.name || "").trim() !== name) return c;
          if (email) return { ...c, email, email_status: "valid" };
          return { ...c, email: "", email_status: "no_email" };
        })
      };
    } catch {
      next = {
        ...next,
        contacts: next.contacts.map((c) =>
          String(c.contact_name || c.name || "").trim() === name
            ? { ...c, email_status: "no_email", email: "" }
            : c
        )
      };
    }
    onUpdate(next);
  }

  try {
    await leadFinderLeadsSync({
      domain: next.domain,
      installId,
      company: {
        name: next.company_name,
        website: next.website,
        industry: next.industry,
        tags: next.tags
      },
      contacts: next.contacts
        .filter((c) => String(c.email_status || "").toLowerCase() === "valid" && c.email)
        .map((c) => ({
          contact_name: c.contact_name,
          title: c.title,
          email: c.email,
          kind: c.kind,
          email_status: "valid",
          source: c.source || "verify"
        }))
    });
  } catch {
    /* ignore */
  }

  return next;
}

export function leadFinderBlockToCsv(block: LeadFinderCompanyBlock): string {
  const header = ["企业名称", "国家/城市", "地址", "官网", "联系人", "职位", "邮箱", "电话", "行业标签"];
  const industry = [block.industry, ...(block.tags || [])].filter(Boolean).join("|");
  const rows = (block.contacts || []).map((c) =>
    [
      block.company_name,
      [block.country, block.location].filter(Boolean).join(" / "),
      block.location || "",
      block.website || block.domain,
      c.contact_name || "",
      c.title || "",
      c.email || "",
      c.phone || block.phone || "",
      industry
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return `\uFEFF${header.join(",")}\n${rows.join("\n")}`;
}

export function splitContactName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
