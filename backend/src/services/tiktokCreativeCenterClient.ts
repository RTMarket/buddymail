import crypto from "node:crypto";
import {
  buildCreativeCenterSignHeaders,
  fetchCreativeCenterWebId
} from "./tiktokCreativeCenterSign.js";

const API_BASE = "https://ads.tiktok.com/creative_radar_api/v1/";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DEFAULT_REFERER =
  "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function responseCode(record: Record<string, unknown> | null): number | null {
  if (!record) return null;
  const raw = record.code ?? record.status_code ?? record.statusCode;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

export function listFromCreativeCenterData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (!record) return [];

  for (const key of [
    "list",
    "materials",
    "items",
    "hashtag_list",
    "sound_list",
    "rank_list",
    "videos",
    "trending_list"
  ]) {
    const arr = asArray(record[key]);
    if (arr.length > 0) return arr;
  }

  const nested = asRecord(record.data);
  if (nested) return listFromCreativeCenterData(nested);
  return [];
}

export class CreativeCenterSession {
  private webId: string | null = null;
  private readonly userId = crypto.randomUUID();
  private readonly userAgent: string;

  constructor(userAgent = DEFAULT_UA) {
    this.userAgent = userAgent;
  }

  async get(path: string): Promise<unknown> {
    if (!this.webId) {
      this.webId = await fetchCreativeCenterWebId(this.userAgent);
    }
    const sign = buildCreativeCenterSignHeaders(this.webId, this.userId, this.userAgent);
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        ...sign,
        "accept-language": "en-US,en;q=0.9",
        referer: DEFAULT_REFERER
      }
    });

    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Creative Center invalid JSON (HTTP ${res.status})`);
    }

    const record = asRecord(body);
    const code = responseCode(record);
    if (!res.ok) {
      const msg = pickString(record?.msg, record?.message) ?? `HTTP ${res.status}`;
      throw new Error(`Creative Center ${msg}`);
    }
    if (code != null && code !== 0) {
      const msg = pickString(record?.msg, record?.message) ?? `code ${code}`;
      throw new Error(`Creative Center ${msg}`);
    }

    return record?.data ?? body;
  }

  async probe(path: string): Promise<{
    status: number;
    code: number | null;
    message: string | null;
    dataKeys: string[];
    listLength: number;
    preview: string;
  }> {
    if (!this.webId) {
      this.webId = await fetchCreativeCenterWebId(this.userAgent);
    }
    const sign = buildCreativeCenterSignHeaders(this.webId, this.userId, this.userAgent);
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        ...sign,
        "accept-language": "en-US,en;q=0.9",
        referer: DEFAULT_REFERER
      }
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    const record = asRecord(body);
    const data = record?.data ?? body;
    const list = listFromCreativeCenterData(data);
    const dataRecord = asRecord(data);
    return {
      status: res.status,
      code: responseCode(record),
      message: pickString(record?.msg, record?.message),
      dataKeys: dataRecord ? Object.keys(dataRecord) : [],
      listLength: list.length,
      preview: text.slice(0, 280)
    };
  }
}
