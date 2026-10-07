/** 独立站邮件内订阅/退订/投诉/追踪链接的公网根地址归一化（FRONTEND_PORT=80 时去 :8080；STANDALONE_PUBLIC_HTTPS=1 时保留 https） */

function frontendPortFromEnv(): number {
  const n = Number(process.env.FRONTEND_PORT ?? 8080);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8080;
}

function standalonePublicHttpsEnabled(): boolean {
  const v = (process.env.STANDALONE_PUBLIC_HTTPS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 不可作为收件人点击/像素追踪的公网根（开发机回环） */
export function isLoopbackPublicEmailBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  try {
    const h = new URL(trimmed).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
  } catch {
    return true;
  }
}

function publicBaseFromComplianceUrl(unsubscribeUrl: string): string {
  try {
    const u = new URL(unsubscribeUrl.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function rewriteLoopbackEmailApiUrls(html: string, assetBase: string): string {
  const base = assetBase.replace(/\/+$/, "");
  if (!base || isLoopbackPublicEmailBaseUrl(base)) return html;
  return html.replace(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/api\/email\/)/gi, `${base}$1`);
}

export function normalizeStandaloneEmailPublicBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;

  const frontendPort = frontendPortFromEnv();
  const keepHttps = standalonePublicHttpsEnabled();
  if (frontendPort !== 80) return trimmed;

  try {
    const u = new URL(trimmed);
    if (!keepHttps && u.protocol === "https:") {
      u.protocol = "http:";
    }
    if (u.port === "8080" || u.port === "80") {
      u.port = "";
    }
    return u.origin;
  } catch {
    if (keepHttps) {
      return trimmed.replace(/:8080(?=\/|$)/i, "").replace(/:80(?=\/|$)/, "");
    }
    return trimmed
      .replace(/^https:\/\//i, "http://")
      .replace(/:8080(?=\/|$)/i, "")
      .replace(/:80(?=\/|$)/, "");
  }
}

function normalizeLiveEmailBaseUrl(raw: string): string {
  const normalized = normalizeStandaloneEmailPublicBaseUrl(raw);
  return normalized;
}

/** 邮件内订阅/退订/投诉/追踪/阅读原文跳转的公网根（与 email.ts getUnsubscribeBaseUrl 一致） */
export function resolveStandaloneEmailPublicBaseUrl(): string {
  const candidates: string[] = [];
  const push = (raw: string | undefined) => {
    const t = (raw ?? "").trim();
    if (t) candidates.push(t);
  };
  push(process.env.STANDALONE_PUBLIC_BASE_URL);
  push(process.env.EMAIL_UNSUBSCRIBE_BASE_URL);
  push(process.env.PUBLIC_BASE_URL);
  for (const part of (process.env.CORS_ORIGIN ?? "").split(/[,;]+/)) {
    push(part);
  }
  for (const raw of candidates) {
    if (!/^https?:\/\//i.test(raw)) continue;
    const normalized = normalizeLiveEmailBaseUrl(raw);
    if (normalized && !isLoopbackPublicEmailBaseUrl(normalized)) return normalized;
  }
  return (process.env.PUBLIC_SITE_ORIGIN || "").replace(/\/$/, "");
}

/** 自动化任务发信：优先公网域名，跳过 .env 里残留的 localhost / 127.0.0.1 */
export function resolveAutomationEmailPublicBaseUrl(): string {
  const base = resolveStandaloneEmailPublicBaseUrl();
  if (!isLoopbackPublicEmailBaseUrl(base)) return base;
  for (const part of (process.env.CORS_ORIGIN ?? "").split(/[,;]+/)) {
    const raw = part.trim();
    if (!/^https?:\/\//i.test(raw)) continue;
    const normalized = normalizeLiveEmailBaseUrl(raw);
    if (normalized && !isLoopbackPublicEmailBaseUrl(normalized)) return normalized;
  }
  return base;
}

export { publicBaseFromComplianceUrl, rewriteLoopbackEmailApiUrls };

export function buildStandaloneWechatArticleGoUrl(draftId: string): string {
  const base = resolveStandaloneEmailPublicBaseUrl().replace(/\/+$/, "");
  const path = `/api/wechat-official/article-go?d=${encodeURIComponent(draftId.trim())}`;
  return `${base}${path}`;
}

/** 出站邮件：把模版里旧的 article-go 绝对地址统一改成本机公网根（避免落到主站 Unauthorized 或 :8080 不可达） */
export function rewriteWechatArticleGoUrlsInEmailHtml(html: string, base?: string): string {
  const trimmedBase = (base ?? resolveStandaloneEmailPublicBaseUrl()).replace(/\/+$/, "");
  if (!html || !trimmedBase) return html ?? "";

  let out = html.replace(
    /href=(["'])(https?:\/\/[^"']*)?(\/api\/wechat-official\/article-go\?[^"']*)\1/gi,
    (_m, quote: string, _host: string | undefined, path: string) => `href=${quote}${trimmedBase}${path}${quote}`
  );

  out = out.replace(/<!--\s*BSS_WECHAT_READ_ORIGINAL_URL:([\s\S]*?)-->/g, (_m, encoded: string) => {
    try {
      const decoded = decodeURIComponent(String(encoded).trim());
      if (/^https?:\/\//i.test(decoded)) {
        const u = new URL(decoded);
        if (!u.pathname.includes("/api/wechat-official/article-go")) return _m;
        return `<!-- BSS_WECHAT_READ_ORIGINAL_URL:${encodeURIComponent(`${trimmedBase}${u.pathname}${u.search}`)} -->`;
      }
      if (decoded.startsWith("/api/wechat-official/article-go")) {
        return `<!-- BSS_WECHAT_READ_ORIGINAL_URL:${encodeURIComponent(`${trimmedBase}${decoded}`)} -->`;
      }
    } catch {
      /* keep marker */
    }
    return _m;
  });

  return out;
}
