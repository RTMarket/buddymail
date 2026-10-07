/** 相对路径走当前站点的 /api（dev 下由 Vite 代理）；设置 VITE_API_BASE 可直连后端（需后端 CORS 放行前端源） */
const AUTH_STORAGE_KEY = "bss_auth_access_token_v2";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(AUTH_STORAGE_KEY);
    else localStorage.setItem(AUTH_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

export function resolveApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** 独立站 / 生产构建：勿向用户展示 npm run dev 等开发提示 */
function apiFetchNetworkHint(isDirect: boolean): string {
  if (import.meta.env.PROD) {
    return isDirect
      ? "无法连接 API 服务，请稍后重试或刷新页面。"
      : "网络暂时中断，请稍后重试或刷新页面。";
  }
  return isDirect
    ? "直连后端失败：请确认服务已启动，且 backend CORS_ORIGIN 包含当前页面的完整地址（localhost 与 127.0.0.1 算不同源）。"
    : "请确认 backend 已运行（npm run dev，默认 8787），且与 Vite 代理目标一致；不要用 file:// 打开页面。";
}

function apiEmptyBodyHint(status: number): string {
  if (import.meta.env.PROD) {
    return status === 0
      ? "网络异常或请求未完成，返回内容为空。"
      : `HTTP ${status}，服务暂时无响应，请稍后重试。`;
  }
  return status === 0
    ? "网络异常或请求未完成，返回内容为空。"
    : `HTTP ${status}，返回内容为空。请确认后端已启动（在 backend 目录执行 npm run dev，默认端口 8787），且前端代理指向同一端口。`;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveApiUrl(path);
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const initHeaders = (init?.headers ?? {}) as Record<string, string>;
  let resp: Response;
  try {
    resp = await fetch(url, {
      ...init,
      headers: { ...headers, ...initHeaders }
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "AbortError") {
      const ms = Number((init as { _bssTimeoutMs?: number } | undefined)?._bssTimeoutMs);
      const aiHint =
        ms >= 300_000
          ? "链接/识图生成耗时较长，若仍失败请改用「上传图片」或换更快视觉模型。"
          : "";
      throw new Error(
        `请求超时或已中断。请稍后重试，或检查网络与服务器 Nginx 超时设置。${aiHint}`
      );
    }
    const isDirect = url.startsWith("http://") || url.startsWith("https://");
    const hint = apiFetchNetworkHint(isDirect);
    throw new Error(hint);
  }

  const text = await resp.text();
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error(apiEmptyBodyHint(resp.status));
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    if (resp.status === 504 || resp.status === 502) {
      throw new Error(`网关暂时无响应（HTTP ${resp.status}），页面会继续使用已加载数据，请稍后重试。`);
    }
    throw new Error(`接口返回非 JSON（HTTP ${resp.status}）：${trimmed.slice(0, 200)}`);
  }

  const obj = data as any;
  if (!resp.ok) {
    if (resp.status === 401) {
      setAccessToken(null);
    }
    throw new Error(obj?.message ?? `HTTP ${resp.status}`);
  }
  return data as T;
}

/** 带硬超时的 JSON 请求（避免诊断/进度接口挂死导致按钮一直「生成中」） */
export async function apiJsonWithTimeout<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 30_000
): Promise<T> {
  const ms = Math.max(1000, Math.floor(Number(timeoutMs) || 30_000));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const outer = init?.signal;
  const onOuterAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  try {
    const { signal: _ignored, ...rest } = init ?? {};
    const merged = { ...rest, signal: ctrl.signal, _bssTimeoutMs: ms } as RequestInit & {
      _bssTimeoutMs?: number;
    };
    return await apiJson<T>(path, merged);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * multipart/form-data 上传（不设置 Content-Type，由浏览器带 boundary）。
 * 与 apiJson 相同会附带 Bearer，避免未带 token 导致 401。
 */
export async function apiFormUpload<T>(
  path: string,
  formData: FormData,
  init?: RequestInit
): Promise<T> {
  const url = resolveApiUrl(path);
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      signal: init?.signal
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error("图片上传超时，请检查网络后重试或换一张较小的图片。");
    }
    const isDirect = url.startsWith("http://") || url.startsWith("https://");
    const hint = isDirect
      ? "直连后端失败：请确认 CORS_ORIGIN 包含当前页面源，且请求携带登录 token。"
      : "请确认后端已运行且前端通过代理访问；不要用 file:// 打开页面。";
    throw new Error(`上传请求失败。${hint} ${String((e as Error)?.message ?? e)}`);
  }

  const text = await resp.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`上传返回为空（HTTP ${resp.status}）`);
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    if (resp.status === 413) {
      throw new Error(
        "上传文件过大（HTTP 413）。当前是服务器网关（Nginx）限制了请求体大小，请把 Nginx 的 client_max_body_size 调大后重试。"
      );
    }
    throw new Error(`上传返回非 JSON（HTTP ${resp.status}）：${trimmed.slice(0, 200)}`);
  }

  const obj = data as any;
  if (!resp.ok) {
    if (resp.status === 401) {
      setAccessToken(null);
    }
    const raw = String(obj?.message ?? "");
    const msg =
      resp.status === 401
        ? raw === "Unauthorized" || raw === ""
          ? "请先登录或登录已过期，请重新登录后再试。"
          : raw
        : raw || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/** 带硬超时的 multipart 上传（避免大图上传挂死导致按钮一直「生成中」） */
export async function apiFormUploadWithTimeout<T>(
  path: string,
  formData: FormData,
  timeoutMs = 90_000
): Promise<T> {
  const ms = Math.max(5000, Math.floor(Number(timeoutMs) || 90_000));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await apiFormUpload<T>(path, formData, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeApiPath(urlOrPath: string): string {
  const s = urlOrPath.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      return `${u.pathname}${u.search}`;
    } catch {
      return s;
    }
  }
  return s.startsWith("/") ? s : `/${s}`;
}

/** 带 Bearer 下载二进制文件（普通 a 标签无法附带 Authorization） */
export async function downloadAuthenticatedFile(path: string, filename: string): Promise<void> {
  const url = resolveApiUrl(normalizeApiPath(path));
  const token = getAccessToken();
  if (!token) {
    throw new Error("请先登录后再下载");
  }
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      setAccessToken(null);
    }
    const text = await resp.text();
    let msg = `HTTP ${resp.status}`;
    try {
      const o = JSON.parse(text) as { message?: string };
      if (o?.message) msg = o.message;
    } catch {
      if (text.trim()) msg = text.trim().slice(0, 200);
    }
    if (resp.status === 401 && (msg === "Unauthorized" || msg.startsWith("HTTP"))) {
      msg = "请先登录或登录已过期，请重新登录后再试。";
    }
    throw new Error(msg);
  }
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
