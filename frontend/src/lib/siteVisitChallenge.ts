import { resolveApiUrl } from "./api";

export type SiteVisitChallenge = {
  challenge: string;
  ts: number;
  proof: string;
  fetchedAt: number;
};

const STORAGE_KEY = "bss_site_visit_challenge_v1";
const MAX_AGE_MS = 4 * 60 * 1000;

export function readSiteVisitChallenge(): SiteVisitChallenge | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiteVisitChallenge;
    if (!parsed?.challenge || !parsed?.proof || !parsed?.ts) return null;
    if (Date.now() - Number(parsed.fetchedAt ?? 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function refreshSiteVisitChallenge(): Promise<SiteVisitChallenge | null> {
  try {
    const resp = await fetch(resolveApiUrl("/api/public/site-visit-challenge"), {
      method: "GET",
      credentials: "same-origin"
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      ok?: boolean;
      challenge?: string;
      ts?: number;
      proof?: string;
    };
    if (!data.ok || !data.challenge || !data.proof || !data.ts) return null;
    const cached: SiteVisitChallenge = {
      challenge: data.challenge,
      ts: data.ts,
      proof: data.proof,
      fetchedAt: Date.now()
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    return cached;
  } catch {
    return null;
  }
}

/** 应用启动后预取；SiteVisitTracker 也会定时刷新 */
export function ensureSiteVisitChallengeWarm(): void {
  if (readSiteVisitChallenge()) return;
  void refreshSiteVisitChallenge();
}
