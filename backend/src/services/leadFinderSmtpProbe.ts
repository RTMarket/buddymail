type ProbeEndpoint = { base: string; token: string };

/**
 * Probe pool: LEADS_FINDER_SMTP_PROBE_URL and LEADS_FINDER_SMTP_PROBE_TOKEN
 * accept comma-separated lists, paired by index (a single token applies to
 * every URL). A single URL + single token behaves exactly like before.
 */
function getProbePool(): ProbeEndpoint[] {
  const urls = String(process.env.LEADS_FINDER_SMTP_PROBE_URL || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const tokens = String(process.env.LEADS_FINDER_SMTP_PROBE_TOKEN || "")
    .split(",")
    .map((s) => s.trim());
  return urls
    .map((base, i) => ({ base, token: tokens[i] || tokens[0] || "" }))
    .filter((p) => p.token.length > 0);
}

/** FNV-1a hash with fmix32 finalizer: stable per-email routing so load spreads across probes. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export async function smtpProbeHealth(): Promise<boolean> {
  const pool = getProbePool();
  if (!pool.length) return false;
  const checks = await Promise.all(
    pool.map(async (p) => {
      try {
        const resp = await fetch(`${p.base}/health`, { signal: AbortSignal.timeout(4000) });
        return resp.ok;
      } catch {
        return false;
      }
    })
  );
  return checks.some(Boolean);
}

async function probeOne(p: ProbeEndpoint, email: string): Promise<{ ok: boolean; status: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 18_000);
  try {
    const resp = await fetch(`${p.base}/probe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.token}`,
        "X-Probe-Token": p.token
      },
      body: JSON.stringify({ email }),
      signal: ctrl.signal
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; status?: string };
    if (!resp.ok) return { ok: false, status: "" };
    return { ok: true, status: String(data.status || "").toLowerCase() };
  } catch {
    return { ok: false, status: "" };
  } finally {
    clearTimeout(t);
  }
}

export async function smtpProbeRemote(email: string): Promise<ProbeStatus> {
  const pool = getProbePool();
  if (!pool.length) return "unverified";
  const em = email.trim().toLowerCase();
  if (!em.includes("@")) return "invalid";
  // Start index hashed by email: spreads load; fail over to next probe on error.
  const start = pool.length > 1 ? hashStr(em) % pool.length : 0;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(start + i) % pool.length];
    const r = await probeOne(p, em);
    if (!r.ok) continue;
    const st = r.status;
    if (st === "valid" || st === "invalid" || st === "risky" || st === "unverified") return st;
    return "unverified";
  }
  return "unverified";
}

/** Per-tenant probe gate: serialize probe-heavy work for the same tenant so
 *  concurrent jobs don't flood the probe pool. Returns fn's result unchanged. */
const tenantProbeChains = new Map<string, Promise<unknown>>();

export function runWithProbeTenant<T>(tenantId: string | number, fn: () => Promise<T>): Promise<T> {
  const key = String(tenantId);
  const prev = tenantProbeChains.get(key) || Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  tenantProbeChains.set(key, next.catch(() => {}));
  return next;
}

/** One person: try each pattern once, stop at first SMTP-valid. */
export async function verifyPersonCombosOneByOne(
  name: string,
  domain: string,
  guesses: string[],
  onTry?: (email: string) => Promise<void>
): Promise<string> {
  for (const email of guesses) {
    if (onTry) await onTry(email);
    const st = await smtpProbeRemote(email);
    if (st === "valid") return email;
    if (st === "risky") {
      // Catch-all / accept-all: still keep the first high-hit pattern so CSV is not empty
      if (!guesses[0]) continue;
      return email;
    }
  }
  return "";
}
