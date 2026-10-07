import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearCampaignListBySenderCache } from "../lib/campaignListBySenderCache";
import { apiJson, apiJsonWithTimeout, getAccessToken, setAccessToken } from "../lib/api";

const STORAGE_USER = "bss_auth_user_v2";
/** 最近一次成功登录的邮箱（供社交媒体开发白名单在 /me 异常时仍能识别） */
export const LAST_LOGIN_EMAIL_SESSION_KEY = "bss_last_login_email";

/** 独立站登录：硬超时，避免按钮长期停在「登录中…」 */
const LOGIN_TIMEOUT_MS = 20_000;

const ALREADY_LOGGED_IN_MSG =
  "您已登录，请先退出当前账号后再登录。 / You are already signed in. Please sign out first.";

export type AuthUser = {
  id: number;
  nickname: string;
  email: string;
  tenantId: number;
  role: "super_admin" | "tenant_admin" | "member";
  /** 展示用：首字头像色或 emoji */
  avatarSeed: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (account: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  register: (input: {
    tenantName: string;
    nickname: string;
    email: string;
    password: string;
    /** 无验证码注册时可省略或传空字符串 */
    verificationCode?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  resetPassword: (input: {
    email: string;
    verificationCode: string;
    newPassword: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** 侧栏白名单等：在 /api/auth/me 尚未写回 React 状态前，可读本地缓存邮箱 */
export function getCachedAuthUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  const u = readStoredUser();
  const e = u?.email;
  return typeof e === "string" && e.trim() ? e.trim() : null;
}

/** 合并 React 用户、localStorage、session 中的邮箱，供社交媒体预览白名单判断 */
export function resolveAuthEmailForPreview(hookUser: AuthUser | null | undefined): string {
  const fromUser = (hookUser?.email ?? "").trim();
  if (fromUser) return fromUser;
  const cached = getCachedAuthUserEmail();
  if (cached) return cached;
  try {
    if (typeof sessionStorage === "undefined") return "";
    return (sessionStorage.getItem(LAST_LOGIN_EMAIL_SESSION_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function formatLoginError(e: unknown): string {
  const name = (e as Error)?.name;
  const msg = String((e as Error)?.message ?? e);
  if (name === "AbortError" || msg.includes("超时") || msg.includes("中断")) {
    return (
      "登录超时（20 秒）。常见原因：backend 刚重启、Nginx 仍指向旧容器 IP。请等 10 秒后重试；若仍失败，SSH 执行 bash fix-standalone-login.sh。/ " +
      "Login timed out (20s). Often backend just restarted or Nginx stale upstream. Wait 10s and retry; or run fix-standalone-login.sh on the server."
    );
  }
  return msg;
}

/** 登录前确认 API 可达，避免 backend migrate/重启窗口内白等 20s */
async function waitForLoginBackendReady(maxWaitMs = 15_000): Promise<void> {
  const started = Date.now();
  let lastErr = "";
  while (Date.now() - started < maxWaitMs) {
    try {
      await apiJsonWithTimeout<{ ok?: boolean }>("/api/health/db", undefined, 4_000);
      return;
    } catch (e) {
      lastErr = String((e as Error)?.message ?? e);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error(lastErr || "API 尚未就绪，请稍后再试。");
}

async function postLoginRequest(account: string, password: string) {
  const email = account.trim().toLowerCase();
  return apiJsonWithTimeout<{
    ok: true;
    accessToken: string;
    user: { id: number; nickname: string; email: string; tenantId: number; role: AuthUser["role"] };
  }>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password })
    },
    LOGIN_TIMEOUT_MS
  );
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  /** 无 token 时不读缓存用户，避免出现「页面能进但请求无 Bearer」的半登录态 */
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    if (!getAccessToken()) return null;
    return readStoredUser();
  });

  const persistUser = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u) localStorage.setItem(STORAGE_USER, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_USER);
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      persistUser(null);
      setLoading(false);
      return;
    }
    apiJsonWithTimeout<{ ok: true; user: Record<string, unknown> }>("/api/auth/me", undefined, 12_000)
      .then((r) => {
        const u = (r?.user ?? {}) as Record<string, unknown>;
        const idRaw = u.userId ?? u.id;
        const idNum = typeof idRaw === "number" ? idRaw : Number(idRaw);
        const prev = readStoredUser();
        const id =
          Number.isFinite(idNum) && idNum > 0 ? Math.floor(idNum) : prev && prev.id > 0 ? prev.id : 0;
        const emailFromServer = String(u.email ?? "").trim();
        const email = emailFromServer || (prev?.email ?? "").trim();
        const nickname = String(u.nickname ?? "").trim() || "用户";
        const tenantId = Number(u.tenantId ?? 0);
        const role = u.role as AuthUser["role"];
        if (!email) {
          // eslint-disable-next-line no-console
          console.warn("[auth/me] 接口未返回 email，社交媒体预览白名单等将不可用", u);
        } else {
          try {
            if (typeof sessionStorage !== "undefined") {
              sessionStorage.setItem(LAST_LOGIN_EMAIL_SESSION_KEY, email);
            }
          } catch {
            /* ignore */
          }
        }
        persistUser({
          id,
          nickname,
          email,
          tenantId: Number.isFinite(tenantId) ? tenantId : 0,
          role: role === "super_admin" || role === "tenant_admin" || role === "member" ? role : "member",
          avatarSeed: nickname.slice(0, 1).toUpperCase() || "U"
        });
      })
      .catch(() => {
        const token = getAccessToken();
        if (token) {
          void apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        }
        setAccessToken(null);
        persistUser(null);
      })
      .finally(() => setLoading(false));
  }, [persistUser]);

  const login = useCallback(async (account: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (getAccessToken() && readStoredUser()) {
      return { ok: false, message: ALREADY_LOGGED_IN_MSG };
    }
    try {
      await waitForLoginBackendReady();
      let r;
      try {
        r = await postLoginRequest(account, password);
      } catch (e) {
        const name = (e as Error)?.name;
        const msg = String((e as Error)?.message ?? e);
        if (name === "AbortError" || msg.includes("超时") || msg.includes("中断")) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await waitForLoginBackendReady(10_000);
          r = await postLoginRequest(account, password);
        } else {
          throw e;
        }
      }
      setAccessToken(r.accessToken);
      const trimmedEmail = String(r.user.email ?? account).trim();
      persistUser({
        id: Number(r.user.id),
        nickname: r.user.nickname,
        email: trimmedEmail,
        tenantId: Number(r.user.tenantId),
        role: r.user.role,
        avatarSeed: r.user.nickname.trim().slice(0, 1).toUpperCase() || "U"
      });
      try {
        if (typeof sessionStorage !== "undefined" && trimmedEmail) {
          sessionStorage.setItem(LAST_LOGIN_EMAIL_SESSION_KEY, trimmedEmail);
        }
      } catch {
        /* ignore */
      }
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: formatLoginError(e) };
    }
  }, [persistUser]);

  const register = useCallback(
    async (input: {
      tenantName: string;
      nickname: string;
      email: string;
      password: string;
      verificationCode?: string;
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      try {
        await apiJson<{ ok: true }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            tenantName: input.tenantName,
            nickname: input.nickname,
            email: input.email,
            password: input.password,
            verificationCode: input.verificationCode ?? ""
          })
        });
        return login(input.email, input.password);
      } catch (e: unknown) {
        return { ok: false, message: String((e as Error)?.message ?? e) };
      }
    },
    [login]
  );

  const resetPassword = useCallback(
    async (input: {
      email: string;
      verificationCode: string;
      newPassword: string;
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      try {
        await apiJson<{ ok: true; message?: string }>("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            verificationCode: input.verificationCode,
            newPassword: input.newPassword
          })
        });
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, message: String((e as Error)?.message ?? e) };
      }
    },
    []
  );

  const logout = useCallback(() => {
    void apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(LAST_LOGIN_EMAIL_SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    clearCampaignListBySenderCache();
    persistUser(null);
  }, [persistUser]);

  const value = useMemo(
    () => ({ user, loading, login, register, resetPassword, logout }),
    [user, loading, login, register, resetPassword, logout]
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
