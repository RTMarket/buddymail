import type { Express } from "express";

const BLOCKED_SELF_SERVICE: ReadonlyArray<{ method: string; path: string; hint: string }> = [
  { method: "POST", path: "/api/auth/register", hint: "独立部署版不支持自助注册" },
  { method: "POST", path: "/api/auth/send-register-code", hint: "独立部署版不支持自助注册" },
  { method: "POST", path: "/api/auth/precheck-register-email", hint: "独立部署版不支持自助注册" },
  { method: "GET", path: "/api/auth/register-options", hint: "独立部署版不支持自助注册" },
  { method: "POST", path: "/api/auth/send-reset-code", hint: "请在登录后进入个人中心修改密码" },
  { method: "POST", path: "/api/auth/verify-reset-code", hint: "请在登录后进入个人中心修改密码" },
  { method: "POST", path: "/api/auth/reset-password", hint: "请在登录后进入个人中心修改密码" }
];

/** 须在 registerAuthRoutes 之前挂载 */
export function registerStandaloneAuthPolicy(app: Express) {
  for (const { method, path, hint } of BLOCKED_SELF_SERVICE) {
    app[method.toLowerCase() as "get" | "post"](path, (_req, res) => {
      res.status(403).json({ ok: false, message: hint });
    });
  }
}
