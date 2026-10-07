const STORAGE_KEY = "bss_mkt_touch_v1";

export type MarketingUtmTouch = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  capturedAt: number;
};

function trim(raw: string | null, max: number): string {
  return String(raw ?? "")
    .trim()
    .slice(0, max);
}

export function parseUtmFromLocation(search: string): MarketingUtmTouch | null {
  if (!search || search === "?") return null;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const source = trim(params.get("utm_source"), 128);
    const medium = trim(params.get("utm_medium"), 128);
    const campaign = trim(params.get("utm_campaign"), 256);
    const content = trim(params.get("utm_content"), 256);
    if (!source && !medium && !campaign) return null;
    return { source, medium, campaign, content, capturedAt: Date.now() };
  } catch {
    return null;
  }
}

export function readStoredMarketingUtm(): MarketingUtmTouch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as MarketingUtmTouch;
    if (!o || typeof o !== "object") return null;
    if (!o.campaign && !o.source) return null;
    return o;
  } catch {
    return null;
  }
}

/** 首次触达归因：URL 有 UTM 且本地尚无记录时写入 localStorage */
export function captureMarketingUtmFromUrl(): MarketingUtmTouch | null {
  if (typeof window === "undefined") return null;
  const existing = readStoredMarketingUtm();
  const fromUrl = parseUtmFromLocation(window.location.search);
  if (!fromUrl) return existing;
  if (existing?.campaign || existing?.source) return existing;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
  } catch {
    /* ignore */
  }
  return fromUrl;
}

export function marketingUtmPayload(): Record<string, string> | undefined {
  const touch = captureMarketingUtmFromUrl() ?? readStoredMarketingUtm();
  if (!touch) return undefined;
  return {
    utm_source: touch.source,
    utm_medium: touch.medium,
    utm_campaign: touch.campaign,
    utm_content: touch.content
  };
}
