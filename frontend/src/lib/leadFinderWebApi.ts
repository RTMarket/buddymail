import { apiJson } from "./api";
import type { LeadFinderScrapePack } from "./leadFinderWebTypes";

const INSTALL_KEY = "bss_standalone_lead_finder_install_id_v1";
const INSTALL_RE = /^LFI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function randomSeg(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[bytes[i]! % chars.length];
  return s;
}

/** 主站要求格式 LFI-XXXX-XXXX-XXXX；实际授权由独立站 backend 的 LEAD_FINDER_INSTALL_ID 注入 */
export function getOrCreateLeadFinderInstallId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_KEY)?.trim().toUpperCase() || "";
    if (INSTALL_RE.test(existing)) return existing;
    const id = `LFI-${randomSeg()}-${randomSeg()}-${randomSeg()}`;
    localStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return `LFI-TEMP-${Date.now().toString(36).toUpperCase().slice(-4)}-0000`.slice(0, 19);
  }
}

async function leadFinderPost<T extends { ok?: boolean; message?: string }>(
  path: string,
  body: unknown
): Promise<T> {
  const data = await apiJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(data.message || "Lead Finder 请求失败");
  }
  return data;
}

export async function leadFinderCapability() {
  return apiJson<{ ok: boolean; upstream?: string; message?: string; installConfigured?: boolean }>(
    "/api/standalone/lead-finder/capability"
  );
}

export async function leadFinderScrape(body: {
  query: string;
  installId: string;
  sources: string[];
  forceRefresh?: boolean;
  warehouseOnly?: boolean;
  skipWebEnrich?: boolean;
}): Promise<LeadFinderScrapePack> {
  return leadFinderPost("/api/standalone/lead-finder/scrape", body);
}

export async function leadFinderDiscoverLane(body: {
  query: string;
  lane: string;
  installId: string;
  companyName?: string | null;
}): Promise<LeadFinderScrapePack> {
  return leadFinderPost("/api/standalone/lead-finder/discover-lane", body);
}

export async function leadFinderAiEnrich(body: {
  installId: string;
  domain: string;
  columns?: string[];
  aiContext: string;
}): Promise<{
  ok?: boolean;
  domain?: string;
  company?: Record<string, unknown>;
  contacts?: Array<{
    name?: string | null;
    title?: string | null;
    email?: string | null;
    linkedin?: string | null;
    source?: string | null;
  }>;
  peopleHints?: Array<{ name: string; title?: string | null }>;
  signals?: string[];
  message?: string;
}> {
  return leadFinderPost("/api/standalone/lead-finder/ai-enrich", body);
}

export async function leadFinderGuessVerifyBatch(body: {
  domain: string;
  installId: string;
  people: Array<{ name: string; title?: string | null }>;
  knownEmails?: string[];
}): Promise<{
  ok?: boolean;
  results?: Array<{
    name?: string;
    email?: string | null;
    email_status?: string;
    title?: string | null;
  }>;
  message?: string;
}> {
  return leadFinderPost("/api/standalone/lead-finder/guess-verify-batch", body);
}

export async function leadFinderLeadsSync(body: Record<string, unknown>) {
  return leadFinderPost("/api/standalone/lead-finder/leads-sync", body);
}
