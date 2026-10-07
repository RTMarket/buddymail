import { fetchHtmlText, searchWebHits, type WebFoundCompany } from "./leadFinderKeywordCompanySearch.js";

export type AiSettings = { apiKey: string; apiBaseUrl: string; apiModel: string };

export type CompanyProfile = {
  intro: string;
  employees: string;
  founded: string;
  funding: string;
};

export type CompanyGrade = { grade: "A" | "B" | "C" | "D"; reason: string };

export type GradeInput = {
  domain: string;
  name: string;
  intro: string;
  mainBusiness: string;
  country: string;
  people: number;
  validEmails: number;
  publicEmails: number;
};

export type GradeTarget = {
  industry: string;
  keywords: string;
  relatedKeywords: string[];
  geo: string;
  titles: string;
  profileText?: string;
};

function kimiBases(baseUrl: string): string[] {
  const first = String(baseUrl || "https://api.moonshot.ai/v1").trim().replace(/\/+$/, "");
  const alt = first.includes("moonshot.cn") ? first.replace("moonshot.cn", "moonshot.ai") : first.replace("moonshot.ai", "moonshot.cn");
  return [...new Set([first, alt])];
}

const FALLBACK_MODELS = ["kimi-k2.6", "kimi-k3"];
let workingModel = "";

type KimiChoice = {
  finish_reason?: string;
  message?: {
    content?: unknown;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  };
};

async function kimiText(
  s: AiSettings,
  system: string,
  user: string,
  ms = 60_000,
  webSearch = false,
  noThinking = false
): Promise<string> {
  if (!s.apiKey) return "";
  const models = [...new Set([workingModel, s.apiModel, ...FALLBACK_MODELS].filter(Boolean))];
  bases: for (const base of kimiBases(s.apiBaseUrl)) {
    for (const model of models) {
      try {
        const messages: unknown[] = [
          { role: "system", content: system },
          { role: "user", content: user }
        ];
        let busyRetries = 0;
        for (let turn = 0; turn < 6; turn++) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              temperature: noThinking && /^kimi-k2/i.test(model) ? 0.6 : /^kimi-/i.test(model) ? 1 : 0.2,
              max_tokens: 8192,
              messages,
              ...(noThinking && /^kimi-k2/i.test(model) ? { thinking: { type: "disabled" } } : {}),
              ...(webSearch ? { tools: [{ type: "builtin_function", function: { name: "$web_search" } }] } : {})
            }),
            signal: AbortSignal.timeout(ms)
          });
          if (res.status === 401 || res.status === 403) continue bases;
          if ((res.status === 429 || res.status >= 500) && busyRetries < 2) {
            busyRetries++;
            turn--;
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          if (!res.ok) break;
          const json = (await res.json()) as { choices?: KimiChoice[] };
          const ch = json.choices?.[0];
          if (webSearch && ch?.finish_reason === "tool_calls" && ch.message?.tool_calls?.length) {
            messages.push(ch.message);
            for (const tc of ch.message.tool_calls) {
              messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: tc.function.arguments });
            }
            continue;
          }
          const c = ch?.message?.content;
          const text = typeof c === "string" ? c : "";
          if (webSearch && turn < 5 && !/\[\s*\{|\{\s*"(?!search_queries)/.test(text)) {
            messages.push({ role: "assistant", content: text });
            messages.push({ role: "user", content: "Use the search results you already have and return the final JSON now. JSON only." });
            continue;
          }
          workingModel = model;
          return text;
        }
      } catch {
        /* next model */
      }
    }
  }
  return "";
}

function parseJsonLoose(text: string): unknown {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = (fence?.[1] || raw).trim();
  for (const [open, close] of [
    ["[", "]"],
    ["{", "}"]
  ] as const) {
    const a = src.indexOf(open);
    const b = src.lastIndexOf(close);
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(src.slice(a, b + 1));
      } catch {
        /* try next shape */
      }
    }
  }
  return null;
}

const FALLBACK_SUFFIX = [
  "manufacturer",
  "supplier",
  "wholesale",
  "distributor",
  "factory",
  "brand",
  "OEM",
  "exporter",
  "importer",
  "retailer",
  "private label",
  "B2B",
  "company",
  "online store",
  "services"
];

function fallbackRelated(industry: string, keywords: string): string[] {
  const base = String(keywords || "")
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter((s) => s && !/[\u4e00-\u9fff]/.test(s));
  const seed = base[0] || (/[\u4e00-\u9fff]/.test(industry) ? "" : industry.trim());
  if (!seed) return [];
  return FALLBACK_SUFFIX.map((x) => `${seed} ${x}`).slice(0, 15);
}

export async function suggestRelatedKeywords(
  s: AiSettings,
  opts: { industry: string; keywords: string; country: string }
): Promise<{ items: string[]; source: "kimi" | "local" }> {
  const topic = [opts.industry, opts.keywords].filter(Boolean).join(" / ");
  if (!topic.trim()) return { items: [], source: "local" };
  const text = await kimiText(
    s,
    "You help B2B sales teams search the web for target companies. Reply with JSON only.",
    `Target customers: ${topic}${opts.country ? ` in ${opts.country}` : ""}.
List up to 15 closely related English search keywords (2-4 words each) that such companies use on their own websites: sub-categories, product types, synonyms, buyer-side terms. No company names, no country names, no duplicates of the input.
Return a JSON array of strings.`,
    60_000
  );
  const arr = parseJsonLoose(text);
  const seen = new Set(
    String(opts.keywords || "")
      .split(/[,，;；]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
  const items: string[] = [];
  if (Array.isArray(arr)) {
    for (const v of arr) {
      const k = String(typeof v === "string" ? v : (v as Record<string, unknown>)?.keyword || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!k || k.length > 48 || seen.has(k.toLowerCase())) continue;
      seen.add(k.toLowerCase());
      items.push(k);
      if (items.length >= 15) break;
    }
  }
  if (items.length) return { items, source: "kimi" };
  return { items: fallbackRelated(opts.industry, opts.keywords), source: "local" };
}

export async function suggestCompaniesByKimi(
  s: AiSettings,
  opts: { industry: string; keywords: string; countryNameEn: string; city?: string; province?: string; limit: number }
): Promise<WebFoundCompany[]> {
  const topic = [opts.industry, opts.keywords].filter(Boolean).join(" / ");
  if (!topic.trim()) return [];
  const geo = [opts.city, opts.province, opts.countryNameEn].filter(Boolean).join(", ");
  const ask = `Find up to ${opts.limit} real, currently operating companies that match: ${topic}${geo ? `, based in ${geo}` : ""}.
Prefer small and mid-sized companies with their own official website. Skip global giants, marketplaces, directories, news sites and social profiles.
Return a JSON array of objects: {"name": "...", "website": "https://...", "city": "...", "business": "what they sell or do, max 12 words"}.
Only include a company if you are confident its official website domain is correct.`;
  const texts = await Promise.all([
    kimiText(s, "You find real B2B target companies for sales teams. Use web search. Reply with JSON only.", ask, 150_000, true, true),
    kimiText(s, "You find real B2B target companies for sales teams. Reply with JSON only.", ask, 90_000, false, true)
  ]);
  const arr: unknown[] = [];
  for (const text of texts) {
    const parsed = parseJsonLoose(text);
    if (Array.isArray(parsed) && parsed.length) {
      arr.push(...parsed);
      continue;
    }
    for (const m of text.match(/\{[^{}]*"website"[^{}]*\}/g) || []) {
      try {
        arr.push(JSON.parse(m));
      } catch {
        /* skip broken object */
      }
    }
  }
  const seen = new Set<string>();
  const out: WebFoundCompany[] = [];
  for (const v of arr) {
    const r = (v || {}) as Record<string, unknown>;
    const raw = String(r.website || r.domain || "").trim();
    if (!raw) continue;
    let host = "";
    try {
      host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      continue;
    }
    if (!host.includes(".") || seen.has(host)) continue;
    seen.add(host);
    const business = String(r.business || "").slice(0, 200);
    out.push({
      name: String(r.name || "").trim() || host,
      domain: host,
      website: `https://${host}`,
      country: opts.countryNameEn,
      city: String(r.city || opts.city || "").trim(),
      mainBusiness: business || topic,
      evidence: business
    });
    if (out.length >= opts.limit * 2) break;
  }
  return out;
}

function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function metaDescription(html: string): string {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,400})["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,400})["']/i);
  return m ? htmlToText(m[1]) : "";
}

function regexProfile(blob: string): Omit<CompanyProfile, "intro"> {
  const founded =
    blob.match(/\b(?:founded|established|since|est\.)\s*(?:in\s*)?((?:18|19|20)\d{2})\b/i)?.[1] ||
    blob.match(/成立于\s*((?:19|20)\d{2})/)?.[1] ||
    "";
  const employees =
    blob.match(/\b(\d{1,3}(?:,\d{3})*\+?|\d+\s*-\s*\d+)\s+(?:employees|staff|team members|people)\b/i)?.[1] || "";
  const funding =
    blob.match(/\braised\s+(?:a\s+)?(?:total\s+of\s+)?(\$\s?[\d.,]+\s?(?:million|billion|m|b|k)?)/i)?.[1] ||
    blob.match(/\b(series\s+[a-e]\b[^.]{0,60})/i)?.[1] ||
    "";
  return { founded, employees: employees.replace(/\s+/g, ""), funding: funding.trim() };
}

export async function buildCompanyProfile(
  s: AiSettings,
  co: WebFoundCompany,
  brand: string
): Promise<CompanyProfile> {
  const host = co.domain.replace(/^www\./i, "").toLowerCase();
  const base = (co.website || `https://${host}`).replace(/\/+$/, "");
  const [home, about, hits] = await Promise.all([
    fetchHtmlText(base, 12_000).catch(() => ""),
    fetchHtmlText(`${base}/about`, 10_000)
      .then((h) => h || fetchHtmlText(`${base}/about-us`, 10_000))
      .catch(() => ""),
    searchWebHits(`"${brand}" ${host} founded employees funding`).catch(() => [])
  ]);
  const siteText = `${htmlToText(home).slice(0, 3500)} ${htmlToText(about).slice(0, 3500)}`.trim();
  const snippets = hits
    .slice(0, 8)
    .map((h) => `${h.title} — ${h.snippet}`)
    .join("\n")
    .slice(0, 3000);
  const fallbackIntro = metaDescription(home) || metaDescription(about) || String(co.mainBusiness || "").slice(0, 300);
  const rx = regexProfile(`${siteText} ${snippets}`);
  const text = await kimiText(
    s,
    "You extract company facts strictly from the provided evidence. Never guess. Reply with JSON only.",
    `Company: ${brand} (${host})
Website text:
${siteText.slice(0, 6000)}

Search snippets:
${snippets}

Return JSON {"intro": "", "employees": "", "founded": "", "funding": ""}.
intro: 用中文 1-2 句概括这家公司做什么、卖给谁（不超过 120 字）。
employees: headcount or range if stated (e.g. "50-200"), else "".
founded: year if stated, else "".
funding: total raised / latest round if stated (e.g. "$12M Series A"), else "".
Only use facts present in the evidence.`,
    45_000
  );
  const o = parseJsonLoose(text) as Record<string, unknown> | null;
  const pick = (k: string, fb: string) => {
    const v = o && typeof o === "object" ? String(o[k] ?? "").trim() : "";
    return v && !/^(unknown|n\/a|none|null|未知|未公开)$/i.test(v) ? v.slice(0, 300) : fb;
  };
  const out: CompanyProfile = {
    intro: pick("intro", fallbackIntro),
    employees: pick("employees", rx.employees),
    founded: pick("founded", rx.founded),
    funding: pick("funding", rx.funding)
  };
  if (out.intro && out.employees && out.founded && out.funding) return out;
  const web = parseJsonLoose(
    await kimiText(
      s,
      "Search the web for company facts. Only report facts you found for this exact company. Reply with JSON only.",
      `Company: ${brand}, website ${host}.
Return JSON {"intro": "", "employees": "", "founded": "", "funding": ""}.
intro: 用中文 1-2 句概括这家公司做什么、卖给谁（不超过 120 字）。
employees: headcount or range (e.g. "50-200").
founded: founding year.
funding: total raised / latest round / owner (e.g. "$12M Series A").
Leave a field "" if you cannot confirm it for this exact domain. Do not guess.`,
      90_000,
      true
    )
  ) as Record<string, unknown> | null;
  const webPick = (k: keyof CompanyProfile) => {
    const v = web && typeof web === "object" ? String(web[k] ?? "").trim() : "";
    return v && !/^(unknown|n\/a|none|null|未知|未公开)$/i.test(v) ? v.slice(0, 300) : "";
  };
  for (const k of ["intro", "employees", "founded", "funding"] as const) {
    if (!out[k]) out[k] = webPick(k);
  }
  return out;
}

export function localGrade(t: GradeTarget, c: GradeInput): CompanyGrade {
  const blob = `${c.name} ${c.intro} ${c.mainBusiness}`.toLowerCase();
  const words = [
    ...String(t.keywords || "").split(/[,，;；]/),
    ...t.relatedKeywords,
    ...(/[\u4e00-\u9fff]/.test(t.industry) ? [] : [t.industry])
  ]
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3);
  const hits = words.filter((w) => blob.includes(w)).length;
  const reach = c.validEmails > 0 ? 2 : c.people > 0 || c.publicEmails > 0 ? 1 : 0;
  const score = Math.min(hits, 3) + reach;
  if (score >= 4) return { grade: "A", reason: "业务词高度吻合，且有可联系的人或有效邮箱" };
  if (score >= 3) return { grade: "B", reason: "业务较吻合，联系方式部分可用" };
  if (score >= 1) return { grade: "C", reason: "业务相关度一般或联系方式较少" };
  return { grade: "D", reason: "与目标客群关联弱，且缺少联系方式" };
}

export async function gradeCompanies(
  s: AiSettings,
  target: GradeTarget,
  list: GradeInput[]
): Promise<Record<string, CompanyGrade>> {
  const out: Record<string, CompanyGrade> = {};
  for (const c of list) out[c.domain] = localGrade(target, c);
  if (!list.length || !s.apiKey) return out;
  const chunk = 20;
  for (let i = 0; i < list.length; i += chunk) {
    const part = list.slice(i, i + chunk);
    const text = await kimiText(
      s,
      "你是 B2B 获客分析师，只按给定资料判断，不编造。只输出 JSON。",
      `用户要找的目标客群：行业「${target.industry || "未指定"}」，关键词「${[target.keywords, ...target.relatedKeywords]
        .filter(Boolean)
        .join(", ")}」，地区「${target.geo || "不限"}」，目标职位「${target.titles || "决策人"}」。${
        target.profileText ? `\n\n用户自己的业务画像（分级时优先匹配这类客户）：\n${target.profileText.slice(0, 800)}` : ""
      }

把下面每家公司按与目标客群的吻合度分成 A/B/C/D：
A = 业务完全对口、就是要找的客户，且有决策人或有效邮箱；
B = 业务对口但联系方式一般，或基本对口；
C = 部分相关；
D = 基本不相关或资料太少。

公司：
${part
  .map(
    (c, idx) =>
      `${idx + 1}. domain=${c.domain} | ${c.name} | ${c.country || ""} | 介绍：${(c.intro || c.mainBusiness || "").slice(0, 240)} | 人名 ${c.people} 个 | 有效邮箱 ${c.validEmails} 个 | 公开邮箱 ${c.publicEmails} 个`
  )
  .join("\n")}

返回 JSON 数组：[{"domain":"...","grade":"A","reason":"一句中文理由"}]`,
      60_000
    );
    const arr = parseJsonLoose(text);
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      const rec = v as Record<string, unknown>;
      const d = String(rec.domain || "").trim().toLowerCase();
      const g = String(rec.grade || "").trim().toUpperCase();
      if (!out[d] || !/^[ABCD]$/.test(g)) continue;
      out[d] = { grade: g as CompanyGrade["grade"], reason: String(rec.reason || "").slice(0, 200) || out[d].reason };
    }
  }
  return out;
}
