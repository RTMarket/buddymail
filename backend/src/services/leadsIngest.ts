import type { Pool } from "mysql2/promise";

export type LeadIngestRow = {
  companyName?: string | null;
  website?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  industry?: string | null;
  contactName?: string | null;
  title?: string | null;
  phone?: string | null;
  fax?: string | null;
  address?: string | null;
  zip?: string | null;
  email?: string | null;
  source?: string | null;
  searchQuery?: string | null;
};
export type LeadIngestFailure = {
  rowIndex: number;
  reason: string;
  companyName: string | null;
  website: string | null;
  email: string | null;
};

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function normalizeWebsite(v: string | null): string | null {
  if (!v) return null;
  return v.replace(/\/+$/, "");
}

function normalizeEmail(v: string | null): string | null {
  if (!v) return null;
  return v.trim().toLowerCase();
}

export async function upsertLeads(db: Pool, tenantId: number, rows: LeadIngestRow[]) {
  let inserted = 0;
  let updated = 0;
  const failedRows: LeadIngestFailure[] = [];
  let failedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const email = normalizeEmail(clean(row.email));
    const website = normalizeWebsite(clean(row.website));
    const companyName = clean(row.companyName);
    const contactName = clean(row.contactName);
    try {
      const hasAnyMeaningfulField = Boolean(
        email ||
          website ||
          companyName ||
          contactName ||
          clean(row.title) ||
          clean(row.phone) ||
          clean(row.fax) ||
          clean(row.address) ||
          clean(row.zip) ||
          clean(row.country) ||
          clean(row.state) ||
          clean(row.city) ||
          clean(row.industry)
      );
      if (!hasAnyMeaningfulField) {
        failedCount += 1;
        if (failedRows.length < 200) {
          failedRows.push({ rowIndex: i, reason: "空行或无有效字段", companyName, website, email });
        }
        continue;
      }
      let existingId = 0;
      if (website && companyName && contactName) {
        const [existsRows] = await db.query(
          `SELECT id FROM leads
            WHERE tenant_id = ?
              AND (
                ? IS NOT NULL
                AND ? IS NOT NULL
                AND ? IS NOT NULL
                AND website = ?
                AND company_name <=> ?
                AND contact_name <=> ?
              )
            LIMIT 1`,
          [tenantId, website, companyName, contactName, website, companyName, contactName]
        );
        existingId = Number((existsRows as any[])[0]?.id ?? 0);
      }
      if (existingId > 0) {
        await db.query(
          `UPDATE leads
              SET company_name = COALESCE(?, company_name),
                  contact_name = COALESCE(?, contact_name),
                  job_title = COALESCE(?, job_title),
                  phone = COALESCE(?, phone),
                  fax = COALESCE(?, fax),
                  address = COALESCE(?, address),
                  zip = COALESCE(?, zip),
                  website = COALESCE(?, website),
                  country = COALESCE(?, country),
                  state = COALESCE(?, state),
                  city = COALESCE(?, city),
                  industry = COALESCE(?, industry),
                  primary_email = COALESCE(?, primary_email),
                  source = COALESCE(?, source),
                  search_query = COALESCE(?, search_query),
                  updated_at = NOW()
            WHERE id = ?`,
          [
            companyName,
            contactName,
            clean(row.title),
            clean(row.phone),
            clean(row.fax),
            clean(row.address),
            clean(row.zip),
            website,
            clean(row.country),
            clean(row.state),
            clean(row.city),
            clean(row.industry),
            email,
            clean(row.source) ?? "manual_import",
            clean(row.searchQuery),
            existingId
          ]
        );
        updated += 1;
        continue;
      }
      await db.query(
        `INSERT INTO leads
        (tenant_id, company_name, contact_name, job_title, phone, fax, address, zip, website, country, state, city, industry, primary_email, source, search_query, email_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`,
        [
          tenantId,
          companyName,
          contactName,
          clean(row.title),
          clean(row.phone),
          clean(row.fax),
          clean(row.address),
          clean(row.zip),
          website,
          clean(row.country),
          clean(row.state),
          clean(row.city),
          clean(row.industry),
          email,
          clean(row.source) ?? "manual_import",
          clean(row.searchQuery)
        ]
      );
      inserted += 1;
    } catch (e: any) {
      failedCount += 1;
      if (failedRows.length < 200) {
        failedRows.push({
          rowIndex: i,
          reason: String(e?.message ?? e).slice(0, 300),
          companyName,
          website,
          email
        });
      }
    }
  }
  return { inserted, updated, failedCount, failedRows };
}
