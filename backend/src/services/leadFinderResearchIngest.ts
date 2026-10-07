/**
 * 调研完成（leads-sync）后写入本机 CRM + 总库。
 * 不改 Lead Finder 搜索/CSV 页面。
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import type { Pool } from "mysql2/promise";
import { isPlausibleLeadPersonName } from "./leadFinderPersonNameGate.js";

type ClassifyFn = (input: {
  industry?: string | null;
  description?: string | null;
  companyName?: string | null;
  name?: string | null;
  tags?: string[];
}) => string[];

let classify: ClassifyFn | null = null;

async function loadClassify(): Promise<ClassifyFn> {
  if (classify) return classify;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const abs = path.join(here, "leadFinderIndustryTags.mjs");
  const mod = (await import(pathToFileURL(abs).href)) as { classifyMajorIndustryTags: ClassifyFn };
  classify = mod.classifyMajorIndustryTags;
  return classify;
}

function shanghaiDateTag(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function splitName(full: string): { first: string | null; last: string | null } {
  const bits = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!bits.length) return { first: null, last: null };
  if (bits.length === 1) return { first: bits[0] || null, last: null };
  return { first: bits[0] || null, last: bits.slice(1).join(" ") };
}

function isRealEmail(raw: unknown): raw is string {
  const e = String(raw || "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isDateTag(raw: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || "").trim());
}

function warehouseIndustryTags(tags: string[], description: string | null, companyName: string | null): string[] {
  const blob = `${description || ""} ${companyName || ""}`;
  let out = tags.filter((t) => t && !isDateTag(t));
  if (!out.length || (out.length === 1 && out[0] === "Other")) {
    if (/母婴|婴儿|baby|infant|toddler|diaper/i.test(blob)) out = ["Mother & Baby"];
    else if (/pet|宠物/i.test(blob)) out = ["Pets"];
    else if (/skin|makeup|beauty|cosmetic|personal care|hair care|skincare/i.test(blob)) {
      out = ["Consumer Goods"];
    } else if (!out.length) out = ["Other"];
  }
  return out.slice(0, 5);
}

function warehouseConfig() {
  const base = String(process.env.LEADS_WAREHOUSE_URL || "http://69.165.65.34")
    .trim()
    .replace(/\/+$/, "");
  let token = String(process.env.LEADS_WAREHOUSE_TOKEN || "").trim();
  if (!token) {
    for (const p of ["/app/.leads-warehouse-token", "/app/.env"]) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        if (p.endsWith("token")) {
          token = raw.trim();
        } else {
          const m = raw.match(/^LEADS_WAREHOUSE_TOKEN=(.*)$/m);
          token = String(m?.[1] || "")
            .trim()
            .replace(/^["']|["']$/g, "");
        }
        if (token) break;
      } catch {
        /* ignore */
      }
    }
  }
  return { base, token, enabled: Boolean(base && token) };
}

export async function ingestLeadFinderResearch(
  db: Pool,
  tenantId: number,
  body: Record<string, unknown>,
  upstream: Record<string, unknown>
): Promise<{ crm: number; warehouse: boolean }> {
  const coRaw = (body.company && typeof body.company === "object" ? body.company : {}) as Record<
    string,
    unknown
  >;
  const companyName = String(coRaw.name || coRaw.company_name || "").trim() || null;
  const website = String(coRaw.website || "").trim() || "";
  const description = String(coRaw.description || coRaw.main_business || "").trim() || null;
  const domain = String(body.domain || "").trim();

  const fn = await loadClassify();
  const industryTags = fn({
    industry: coRaw.industry ? String(coRaw.industry) : null,
    description,
    companyName,
    name: companyName,
    tags: Array.isArray(coRaw.tags) ? coRaw.tags.map(String) : []
  });
  const industry = industryTags[0] || (coRaw.industry ? String(coRaw.industry) : null);
  const dateTag = shanghaiDateTag();
  const crmTags = [dateTag, ...industryTags.filter((t) => t !== dateTag)];

  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  let crm = 0;
  for (const row of contacts) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    const name = String(c.contact_name || c.name || "").trim();
    let email = isRealEmail(c.email) ? String(c.email).trim().toLowerCase() : "";
    let statusRaw = String(c.email_status || "unverified").toLowerCase();
    if (!email) {
      // 无邮箱但有人名：直接用“名字拼写@域名”入库，人名/职位先沉淀进 CRM，后续再补邮箱（状态 no_email，发信自动排除）
      if (!isPlausibleLeadPersonName(name)) continue;
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ".")
          .replace(/^\.|\.$/g, "")
          .slice(0, 40) || "unknown";
      const dom = domain.replace(/^www\./i, "") || "unknown.local";
      email = `${slug}@${dom}`;
      statusRaw = "no_email";
    }
    const { first, last } = splitName(name);
    const status =
      statusRaw === "valid" ||
      statusRaw === "invalid" ||
      statusRaw === "risky" ||
      statusRaw === "no_email"
        ? statusRaw
        : "unverified";
    try {
      await db.query(
        `INSERT INTO email_contacts
           (tenant_id, email, first_name, last_name, company, industry, job_title, website, email_status, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           first_name = COALESCE(VALUES(first_name), first_name),
           last_name = COALESCE(VALUES(last_name), last_name),
           company = COALESCE(VALUES(company), company),
           industry = COALESCE(NULLIF(industry, ''), VALUES(industry)),
           job_title = COALESCE(VALUES(job_title), job_title),
           website = COALESCE(VALUES(website), website),
           email_status = IF(VALUES(email_status) = 'unverified', email_status, VALUES(email_status)),
           tags_json = VALUES(tags_json)`,
        [
          tenantId,
          email,
          first,
          last,
          companyName,
          industry,
          c.title ? String(c.title) : null,
          website || (domain ? `https://${domain}` : null),
          status,
          JSON.stringify(crmTags)
        ]
      );
      crm += 1;
    } catch (e) {
      console.warn("[lead-finder-ingest] crm row", e);
    }
  }

  if (crm === 0 && domain) {
    const stub = `research-pending@${domain.replace(/^www\./, "")}`;
    try {
      await db.query(
        `INSERT INTO email_contacts
           (tenant_id, email, first_name, last_name, company, industry, website, email_status, tags_json)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'unverified', ?)
         ON DUPLICATE KEY UPDATE
           company = COALESCE(VALUES(company), company),
           industry = COALESCE(NULLIF(industry, ''), VALUES(industry)),
           website = COALESCE(VALUES(website), website),
           tags_json = VALUES(tags_json)`,
        [
          tenantId,
          stub,
          null, // was: company name stuffed into first_name; keep person-name columns for real people
          companyName,
          industry,
          website || `https://${domain}`,
          JSON.stringify(crmTags)
        ]
      );
      crm = 1;
    } catch (e) {
      console.warn("[lead-finder-ingest] crm stub", e);
    }
  }

  let warehouse = false;
  const { base, token, enabled } = warehouseConfig();
  void upstream;
  const warehouseTags = warehouseIndustryTags(industryTags, description, companyName);
  if (enabled && domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.replace(/^www\./i, ""))) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      const host = domain.replace(/^www\./i, "").toLowerCase();
      const resp = await fetch(`${base}/v1/leads/upsert`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Warehouse-Token": token
        },
        body: JSON.stringify({
          domain: host,
          dataSource: "独立站 Lead Finder 网页",
          company: {
            name: companyName,
            website: website || `https://${host}`,
            description,
            country: coRaw.country ? String(coRaw.country) : null,
            city: coRaw.city ? String(coRaw.city) : null,
            location: coRaw.location ? String(coRaw.location) : null,
            phone: coRaw.phone ? String(coRaw.phone) : null,
            linkedin: coRaw.linkedin ? String(coRaw.linkedin) : null,
            size: coRaw.size ? String(coRaw.size) : null,
            industry: warehouseTags[0] || null,
            tags: warehouseTags
          },
          contacts: body.contacts,
          peopleHints: body.peopleHints,
          pagesFetched: body.pagesFetched,
          signals: body.signals
        })
      });
      clearTimeout(t);
      warehouse = resp.ok;
      if (!resp.ok) {
        console.warn("[lead-finder-ingest] warehouse HTTP", resp.status);
      }
    } catch (e) {
      console.warn("[lead-finder-ingest] warehouse", e);
    }
  } else if (!enabled) {
    console.warn("[lead-finder-ingest] warehouse skipped: LEADS_WAREHOUSE_TOKEN unset");
  }

  return { crm, warehouse };
}
