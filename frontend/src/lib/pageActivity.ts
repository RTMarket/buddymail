import { resolveApiUrl } from "./api";

const CTX_KEY = "bss_page_activity_ctx_v1";
/** 少于该秒数的切页不上报，避免误触 */
const MIN_DURATION_SEC = 3;
/** 单页停留上限 30 分钟 */
const MAX_DURATION_SEC = 1800;

type PageCtx = { path: string; enteredAt: number };

function readCtx(): PageCtx | null {
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as PageCtx;
    if (!o?.path || !o.enteredAt) return null;
    return o;
  } catch {
    return null;
  }
}

function writeCtx(path: string) {
  try {
    sessionStorage.setItem(CTX_KEY, JSON.stringify({ path, enteredAt: Date.now() }));
  } catch {
    // ignore
  }
}

function readUserId(): number | undefined {
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

function flushActivity(path: string, enteredAt: number, durationSec: number) {
  const userId = readUserId();
  if (!userId) return;
  const payload = JSON.stringify({
    userId,
    path,
    durationSec,
    enteredAt: new Date(enteredAt).toISOString()
  });
  const url = resolveApiUrl("/api/public/page-activity");
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }).catch(
    () => undefined
  );
}

/** 进入页面时记一次访问（无停留时长，用于日活详情补全路径） */
function recordPageEnter(path: string) {
  flushActivity(path, Date.now(), 0);
}

/** SPA 路由切换时上报上一页停留时长（仅登录用户） */
export function trackPageActivityOnNavigate(nextPath: string) {
  if (typeof window === "undefined") return;
  const normalized = nextPath.split("?")[0] || "/";
  if (normalized.startsWith("/admin-console")) return;

  const prev = readCtx();
  const now = Date.now();
  if (prev && prev.path !== normalized) {
    const rawSec = Math.floor((now - prev.enteredAt) / 1000);
    const durationSec = Math.min(Math.max(rawSec, 0), MAX_DURATION_SEC);
    if (durationSec >= MIN_DURATION_SEC) {
      flushActivity(prev.path, prev.enteredAt, durationSec);
    }
  }
  writeCtx(normalized);
  recordPageEnter(normalized);
}

/** 标签页关闭前尽量上报当前页 */
export function bindPageActivityBeforeUnload() {
  if (typeof window === "undefined") return () => undefined;
  const onHide = () => {
    const prev = readCtx();
    if (!prev) return;
    const durationSec = Math.min(
      Math.max(Math.floor((Date.now() - prev.enteredAt) / 1000), 0),
      MAX_DURATION_SEC
    );
    if (durationSec >= MIN_DURATION_SEC) {
      flushActivity(prev.path, prev.enteredAt, durationSec);
    }
  };
  window.addEventListener("pagehide", onHide);
  return () => window.removeEventListener("pagehide", onHide);
}
