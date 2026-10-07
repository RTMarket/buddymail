import type { NextFunction, Request, Response } from "express";

type Entry = {
  count: number;
  resetAt: number;
};

/**
 * 简易内存速率限制器（单实例适用）。
 *
 * `maxRequests` 次请求内允许，超限返回 429。
 * `windowMs` 窗口毫秒（例：60_000 = 1 分钟）。
 *
 * 注意：pm2 fork 模式下每个进程各记各的，精确度不如 Redis。
 * 生产若有多进程建议换 `express-rate-limit` + Redis Store。
 */
export function rateLimiter(opts: { windowMs: number; maxRequests: number }) {
  const { windowMs, maxRequests } = opts;
  const store = new Map<string, Entry>();

  // 每 60 秒清理过期 key
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now >= v.resetAt) store.delete(k);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req.ip ?? req.socket.remoteAddress ?? "unknown") + ":" + (req.path ?? "/");
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count++;
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    if (entry.count > maxRequests) {
      return res.status(429).json({
        ok: false,
        message: "请求过于频繁，请稍后再试。"
      });
    }
    return next();
  };
}

/**
 * 敏感路由限流（登录、注册、重置密码）—— 更严格。
 */
export const strictRateLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 10
});

/**
 * 全局通用限流（后台所有 /api 路由）—— 宽松但防止刷爆。
 */
export const globalRateLimiter = rateLimiter({
  windowMs: 1_000,
  maxRequests: 50
});

/** 公开 site-visit：每 IP 每小时最多 300 次（与总览统计口径一致，防脚本刷量） */
export const siteVisitRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 300
});
