import { resolveApiUrl } from "./api";
import { readSiteVisitChallenge, refreshSiteVisitChallenge } from "./siteVisitChallenge";
import { marketingUtmPayload } from "./marketingUtm";

/** 同标签页内两次上报至少间隔 30 分钟，避免 SPA 内频繁跳转刷量 */
const VISIT_THROTTLE_MS = 30 * 60 * 1000;
const STORAGE_KEY = "bss_site_visit_last_ts";

function shouldThrottleVisit(): boolean {
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    const now = Date.now();
    if (last > 0 && now - last < VISIT_THROTTLE_MS) return true;
    sessionStorage.setItem(STORAGE_KEY, String(now));
    return false;
  } catch {
    return false;
  }
}

function readLoggedInUserId(): number | undefined {
  try {
    const raw = localStorage.getItem("bss_auth_user_v2");
    if (!raw) return undefined;
    const u = JSON.parse(raw) as { id?: number };
    if (typeof u.id === "number" && u.id > 0) return u.id;
  } catch {
    // ignore
  }
  return undefined;
}

async function postSiteVisit(entry: "initial" | "route"): Promise<void> {
  if (typeof window === "undefined") return;
  const pathname = window.location.pathname || "/";
  if (pathname.startsWith("/admin-console")) return;

  const userId = readLoggedInUserId();
  const skipThrottle = entry === "route" && !!userId;
  if (!skipThrottle && entry === "route" && shouldThrottleVisit()) return;
  if (!skipThrottle && entry === "initial" && shouldThrottleVisit()) return;

  let challenge = readSiteVisitChallenge();
  if (!challenge) challenge = await refreshSiteVisitChallenge();
  if (!challenge) return;

  const payload = JSON.stringify({
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || "",
    host: window.location.host || "",
    href: String(window.location.href || "").slice(0, 1024),
    entry,
    challenge: challenge.challenge,
    ts: challenge.ts,
    proof: challenge.proof,
    ...(userId ? { userId } : {}),
    ...(marketingUtmPayload() ?? {})
  });
  const url = resolveApiUrl("/api/public/site-visit");
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    const sent = navigator.sendBeacon(url, blob);
    if (sent) {
      void refreshSiteVisitChallenge();
      return;
    }
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "same-origin"
    });
    if (resp.ok) void refreshSiteVisitChallenge();
  } catch {
    // ignore tracking error
  }
}

/** 上报进入前端的一次访问（邮件内链接打开首页亦会计入） */
export function trackSiteVisit(entry: "initial" | "route" = "initial"): void {
  void postSiteVisit(entry);
}

/** @deprecated 使用 trackSiteVisit */
export function trackSiteVisitOnce(): void {
  trackSiteVisit("initial");
}
