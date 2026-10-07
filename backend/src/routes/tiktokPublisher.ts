import type { Express, Request, Response } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";

import { env } from "../env.js";
import {
  detectTikTokUser,
  fetchTikTokPublishStatus,
  publishTikTokPost,
  queryTikTokCreatorInfo
} from "../services/tiktokPostPublish.js";

type PendingOAuth = {
  slot: number;
  accessToken: string;
  refreshToken?: string;
  openId: string;
  scope?: string;
  expiresIn?: number;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  createdAt: number;
};

const pendingBySlot = new Map<number, PendingOAuth>();

const allowedUploadExt = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".webm",
  ".m4v"
]);

function normalizeUploadName(rawName: string): string {
  if (!rawName) return "file";
  return Buffer.from(rawName, "latin1").toString("utf8");
}

function publicUploadUrl(filename: string): string {
  return `/uploads/tiktok-publisher/${filename}`;
}

function isAllowedTikTokAvatarUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host.includes("tiktokcdn") ||
      host.endsWith(".tiktok.com") ||
      host.endsWith(".ttwstatic.com") ||
      host.endsWith(".muscdn.com") ||
      host.includes("bytecdn") ||
      host.includes("ibyteimg")
    );
  } catch {
    return false;
  }
}

function makeState(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

function postingConfigured(): boolean {
  return Boolean(
    (env.TIKTOK_POSTING_CLIENT_KEY || process.env.TIKTOK_POSTING_CLIENT_KEY) &&
      (env.TIKTOK_POSTING_CLIENT_SECRET || process.env.TIKTOK_POSTING_CLIENT_SECRET) &&
      (env.TIKTOK_POSTING_REDIRECT_URI || process.env.TIKTOK_POSTING_REDIRECT_URI)
  );
}

function postingClientKey(): string {
  return String(env.TIKTOK_POSTING_CLIENT_KEY || process.env.TIKTOK_POSTING_CLIENT_KEY || "").trim();
}

function postingClientSecret(): string {
  try {
    const fromFile = fs.readFileSync("/app/.tiktok-posting-secret", "utf8").trim();
    if (fromFile) return fromFile;
  } catch {
    /* fall through */
  }
  return String(env.TIKTOK_POSTING_CLIENT_SECRET || process.env.TIKTOK_POSTING_CLIENT_SECRET || "").trim();
}

function postingRedirectUri(): string {
  return String(env.TIKTOK_POSTING_REDIRECT_URI || process.env.TIKTOK_POSTING_REDIRECT_URI || "").trim();
}

function defaultScopes(): string {
  // 与 TikTok Sandbox「Scopes」对齐：basic + video.publish + video.upload。
  // 强制附带发帖 scope，避免容器残留 TIKTOK_POSTING_SCOPES=user.info.basic 导致重做 OAuth 仍不能发。
  const raw = String(process.env.TIKTOK_POSTING_SCOPES ?? env.TIKTOK_POSTING_SCOPES ?? "").trim();
  const parts = new Set(
    (raw || "user.info.basic,video.publish,video.upload")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  parts.add("user.info.basic");
  parts.add("user.info.stats");
  parts.add("video.publish");
  parts.add("video.upload");
  // 沙箱未添加的 scope 不要强塞（如 user.info.profile），以免授权页异常
  parts.delete("user.info.profile");
  return [...parts].join(",");
}

function frontendOAuthReturnUrl(slot: number, ok: boolean, message?: string, dest: "publishing" | "library" = "publishing"): string {
  const base =
    (process.env.PUBLIC_BASE_URL ?? process.env.EMAIL_UNSUBSCRIBE_BASE_URL ?? "").trim().replace(/\/$/, "") ||
    "";
  const path = dest === "library" ? "/social/library" : "/tiktok/publishing";
  const pathPart = `${path}?oauth=${ok ? "ok" : "err"}&slot=${slot}${
    message ? `&msg=${encodeURIComponent(message.slice(0, 160))}` : ""
  }`;
  return base ? `${base}${pathPart}` : pathPart;
}

/** 45 无 HTTPS，沙箱 Login Kit 只认 socialedm.email 回调；授权完再转回 45 */
function oauthRelay45Base(): string {
  return (process.env.TIKTOK_OAUTH_RELAY_45 ?? "").trim().replace(/\/$/, "");
}

function oauthSandboxHome(): boolean {
  return Boolean((process.env.TIKTOK_OAUTH_HOME ?? "").trim());
}

const TIKTOK_LS_ACCOUNTS_KEY = "bss_tiktok_accounts_v1";

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function sendOAuthCompletePage(
  res: Response,
  slot: number,
  account: {
    slot: number;
    accessToken: string;
    refreshToken?: string;
    openId: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
    scope?: string;
  },
  dest: "publishing" | "library"
) {
  const nextUrl = frontendOAuthReturnUrl(slot, true, undefined, dest);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TikTok</title></head>
<body>
<p>正在完成授权…</p>
<script>
(function(){
  var KEY=${escapeScriptJson(TIKTOK_LS_ACCOUNTS_KEY)};
  var slot=${Number(slot)};
  var row=${escapeScriptJson(account)};
  try {
    var rows=[];
    try { rows=JSON.parse(localStorage.getItem(KEY)||"[]"); } catch (e) {}
    if (!Array.isArray(rows)) rows=[];
    var found=false;
    for (var i=0;i<rows.length;i++) {
      if (rows[i] && Number(rows[i].slot)===slot) {
        rows[i]=Object.assign({}, rows[i], row, {slot:slot});
        found=true;
        break;
      }
    }
    if (!found) rows.push(Object.assign({}, row, {slot:slot}));
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch (e) {}
  location.replace(${escapeScriptJson(nextUrl)});
})();
</script>
</body></html>`);
}

export function registerTikTokPublisherRoutes(app: Express) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadDir = path.join(__dirname, "..", "..", "uploads", "tiktok-publisher");
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use("/uploads/tiktok-publisher", express.static(uploadDir));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = normalizeUploadName(file.originalname).replace(/[^\w.\-()+@]/g, "_");
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
      }
    }),
    limits: { fileSize: 280 * 1024 * 1024 }
  });

  app.get("/api/tiktok/oauth/config", (_req, res) => {
    res.json({
      ok: true,
      configured: postingConfigured(),
      redirectUri: postingRedirectUri(),
      scopes: defaultScopes(),
      clientKeySet: Boolean(postingClientKey()),
      note:
        "在 TikTok for Developers 创建 App，添加 Login Kit + Content Posting API，开启 Direct Post，申请 video.publish。未过 Audit 时直发内容通常仅自己可见。"
    });
  });

  app.get("/api/tiktok/avatar-proxy", async (req, res) => {
    const url = String(req.query.url ?? "").trim();
    if (!url || !isAllowedTikTokAvatarUrl(url)) {
      return res.status(400).send("invalid avatar url");
    }
    try {
      const upstream = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Referer: "https://www.tiktok.com/"
        }
      });
      if (!upstream.ok) return res.status(upstream.status).send("avatar fetch failed");
      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) return res.status(415).send("not an image");
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(bytes);
    } catch (e: unknown) {
      return res.status(502).send(String((e as Error)?.message ?? e));
    }
  });

  /** OAuth 入口：?slot=1..10 */
  app.get("/api/tiktok/oauth/authorize", (req, res) => {
    if (!postingConfigured()) {
      return res.status(400).json({
        ok: false,
        message:
          "未配置 TIKTOK_POSTING_CLIENT_KEY / CLIENT_SECRET / REDIRECT_URI。请先在开发者后台拿到密钥并写入服务器 .env。"
      });
    }
    const slot = Math.max(1, Math.min(15, Number(req.query.slot ?? 1) || 1));
    const returnLibrary = String(req.query.return ?? "") === "library";
    const state = `${oauthSandboxHome() ? `${makeState()}.s${slot}.x45` : `${makeState()}.s${slot}`}${
      returnLibrary ? ".lib" : ""
    }`;
    res.cookie("tiktok_pub_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 15 * 60 * 1000
    });
    const url = buildUrl("https://www.tiktok.com/v2/auth/authorize/", {
      client_key: postingClientKey(),
      response_type: "code",
      scope: defaultScopes(),
      redirect_uri: postingRedirectUri(),
      state,
      // 沙箱 client_key（sb…）只能授权 Target users；强制出选账号页，避免浏览器已登录的普通号触发 non_sandbox_target
      disable_auto_auth:
        postingClientKey().toLowerCase().startsWith("sb") || req.query.disable_auto_auth === "1" ? "1" : undefined
    });
    return res.redirect(url);
  });

  app.get("/api/tiktok/oauth/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.tiktok_pub_oauth_state as string | undefined;
    const slotMatch = /\.s(\d+)/.exec(state);
    const slot = slotMatch ? Math.max(1, Math.min(15, Number(slotMatch[1]))) : 1;
    const relay45 = state.includes(".x45");
    const returnLibrary = state.includes(".lib");
    const returnDest = returnLibrary ? "library" : "publishing";
    const relayBase = oauthRelay45Base();
    const failTo = (msg: string) => {
      if (relay45 && relayBase) {
        return res.redirect(
          `${relayBase}/tiktok/publishing?oauth=err&slot=${slot}&msg=${encodeURIComponent(msg.slice(0, 160))}`
        );
      }
      return res.redirect(frontendOAuthReturnUrl(slot, false, msg, returnDest));
    };

    if (!code || !state) {
      return failTo("OAuth state 无效，请重试授权");
    }
    if (!relay45 && (!cookieState || state !== cookieState)) {
      return failTo("OAuth state 无效，请重试授权");
    }
    if (!postingConfigured()) {
      return failTo("服务器未配置 TikTok OAuth 环境变量");
    }

    try {
      const body = new URLSearchParams();
      body.set("client_key", postingClientKey());
      body.set("client_secret", postingClientSecret());
      body.set("code", code);
      body.set("grant_type", "authorization_code");
      body.set("redirect_uri", postingRedirectUri());

      const resp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok || data.error) {
        const msg = String(data.error_description ?? data.error ?? "token exchange failed");
        return failTo(msg);
      }

      const accessToken = String(data.access_token ?? "").trim();
      const openId = String(data.open_id ?? "").trim();
      if (!accessToken || !openId) {
        return failTo("未返回 access_token/open_id");
      }

      let displayName = openId;
      let username = "";
      let avatarUrl = "";
      const detected = await detectTikTokUser(accessToken);
      if (detected.ok) {
        displayName = detected.displayName;
        username = detected.username;
        avatarUrl = detected.avatarUrl;
      }

      pendingBySlot.set(slot, {
        slot,
        accessToken,
        refreshToken: String(data.refresh_token ?? "") || undefined,
        openId,
        scope: String(data.scope ?? ""),
        expiresIn: Number(data.expires_in ?? 0) || undefined,
        displayName,
        username,
        avatarUrl,
        createdAt: Date.now()
      });

      res.clearCookie("tiktok_pub_oauth_state");
      if (relay45 && relayBase) {
        const q = new URLSearchParams({
          slot: String(slot),
          access_token: accessToken,
          refresh_token: String(data.refresh_token ?? ""),
          open_id: openId,
          scope: String(data.scope ?? ""),
          display_name: displayName,
          username,
          avatar_url: avatarUrl
        });
        if (returnLibrary) q.set("return", "library");
        return res.redirect(`${relayBase}/api/tiktok/oauth/relay?${q.toString()}`);
      }
      return sendOAuthCompletePage(
        res,
        slot,
        {
          slot,
          accessToken,
          refreshToken: String(data.refresh_token ?? "") || undefined,
          openId,
          name: displayName,
          username,
          avatarUrl,
          scope: String(data.scope ?? "")
        },
        returnDest
      );
    } catch (e) {
      return failTo(String((e as Error)?.message ?? e).slice(0, 160));
    }
  });

  /** 沙箱回调在 socialedm.email 完成后，把 token 转回 45 */
  app.get("/api/tiktok/oauth/relay", (req, res) => {
    const slot = Math.max(1, Math.min(15, Number(req.query.slot ?? 0) || 0));
    const accessToken = String(req.query.access_token ?? "").trim();
    const openId = String(req.query.open_id ?? "").trim();
    const dest = String(req.query.return ?? "") === "library" ? "library" : "publishing";
    if (!slot || accessToken.length < 20 || !openId) {
      return res.redirect(frontendOAuthReturnUrl(slot || 1, false, "沙箱回传授权不完整", dest));
    }
    const displayName = String(req.query.display_name ?? "") || openId;
    const username = String(req.query.username ?? "");
    const avatarUrl = String(req.query.avatar_url ?? "");
    pendingBySlot.set(slot, {
      slot,
      accessToken,
      refreshToken: String(req.query.refresh_token ?? "") || undefined,
      openId,
      scope: String(req.query.scope ?? "") || undefined,
      displayName,
      username: username || undefined,
      avatarUrl: avatarUrl || undefined,
      createdAt: Date.now()
    });
    return sendOAuthCompletePage(
      res,
      slot,
      {
        slot,
        accessToken,
        refreshToken: String(req.query.refresh_token ?? "") || undefined,
        openId,
        name: displayName,
        username,
        avatarUrl,
        scope: String(req.query.scope ?? "")
      },
      dest
    );
  });

  /** 前端领取 OAuth 结果（10 分钟内可重复领取，避免 React 严格模式/刷新二次请求误报） */
  app.get("/api/tiktok/oauth/pending", (req, res) => {
    const slot = Math.max(1, Math.min(15, Number(req.query.slot ?? 0) || 0));
    if (!slot) return res.status(400).json({ ok: false, message: "缺少 slot" });
    const pending = pendingBySlot.get(slot);
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      pendingBySlot.delete(slot);
      return res.status(404).json({ ok: false, message: "没有待领取的授权，或已过期" });
    }
    return res.json({
      ok: true,
      slot: pending.slot,
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken ?? "",
      openId: pending.openId,
      scope: pending.scope ?? "",
      expiresIn: pending.expiresIn ?? null,
      displayName: pending.displayName ?? pending.openId,
      username: pending.username ?? "",
      avatarUrl: pending.avatarUrl ?? ""
    });
  });

  app.post("/api/tiktok/profile-detect", async (req, res) => {
    try {
      const { accessToken } = z
        .object({ accessToken: z.string().trim().min(20).max(8192) })
        .parse(req.body ?? {});
      const result = await detectTikTokUser(accessToken);
      if (!result.ok) return res.json({ ok: false, message: result.message });
      const creator = await queryTikTokCreatorInfo(accessToken);
      return res.json({
        ok: true,
        openId: result.openId,
        name: result.displayName,
        username: result.username,
        avatarUrl: result.avatarUrl,
        followerCount: result.followerCount ?? null,
        videoCount: result.videoCount ?? null,
        creatorOk: creator.ok,
        privacyLevelOptions: creator.privacyLevelOptions ?? []
      });
    } catch (e) {
      const message = e instanceof z.ZodError ? "Access Token 格式不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/tiktok/assets/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, message: "请选择上传文件" });
    const originalName = normalizeUploadName(file.originalname ?? "");
    const ext = path.extname(originalName).toLowerCase();
    if (!allowedUploadExt.has(ext)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ ok: false, message: "仅支持图片/视频" });
    }
    // TikTok Content Posting 图片仅 JPEG/WebP；PNG 会受理后异步失败，手机上看不到
    if ([".png", ".gif", ".bmp", ".tif", ".tiff"].includes(ext)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({
        ok: false,
        message: "TikTok 图片仅支持 .jpg / .jpeg / .webp。请先把 PNG 转成 JPEG 再上传。"
      });
    }
    return res.json({
      ok: true,
      asset: {
        name: originalName,
        storedName: file.filename,
        mime: file.mimetype,
        sizeBytes: file.size,
        url: publicUploadUrl(file.filename)
      }
    });
  });

  app.post("/api/tiktok/posts/status", async (req, res) => {
    try {
      const body = z
        .object({
          accessToken: z.string().trim().min(20).max(8192),
          publishId: z.string().trim().min(4).max(128)
        })
        .parse(req.body ?? {});
      const st = await fetchTikTokPublishStatus(body.accessToken, body.publishId);
      if (!st.ok) return res.status(400).json({ ok: false, message: st.message || "查询失败" });
      return res.json({
        ok: true,
        status: st.status,
        failReason: st.failReason ?? null,
        downloadedBytes: st.downloadedBytes ?? null,
        uploadedBytes: st.uploadedBytes ?? null
      });
    } catch (e) {
      const message = e instanceof z.ZodError ? "参数不正确" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });

  app.post("/api/tiktok/posts/publish-now", async (req, res) => {
    try {
      const body = z
        .object({
          accessToken: z.string().trim().min(20).max(8192),
          openId: z.string().trim().min(4).max(256),
          title: z.string().max(500).optional().default(""),
          body: z.string().max(4000).optional().default(""),
          postMode: z.enum(["DIRECT_POST", "MEDIA_UPLOAD"]).optional().default("DIRECT_POST"),
          privacyLevel: z
            .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"])
            .optional()
            .default("SELF_ONLY"),
          disableComment: z.boolean().optional().default(false),
          refreshToken: z.string().max(8192).optional().default(""),
          media: z
            .array(
              z.object({
                type: z.enum(["image", "video"]),
                name: z.string().max(500),
                url: z.string().max(2048).optional()
              })
            )
            .max(35)
            .optional()
            .default([])
        })
        .parse(req.body ?? {});

      const forwardedProto = String(req.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
      const host = String(req.get("x-forwarded-host") ?? req.get("host") ?? "").trim();
      const publicOrigin =
        (process.env.PUBLIC_BASE_URL ?? process.env.EMAIL_UNSUBSCRIBE_BASE_URL ?? "").trim().replace(/\/$/, "") ||
        (host ? `${forwardedProto}://${host}` : "");

      const result = await publishTikTokPost({
        accessToken: body.accessToken,
        openId: body.openId,
        refreshToken: body.refreshToken,
        title: body.title,
        body: body.body,
        postMode: body.postMode,
        privacyLevel: body.privacyLevel,
        disableComment: body.disableComment,
        media: body.media,
        publicOrigin
      });
      return res.json({
        ok: true,
        publishId: result.publishId,
        mode: result.mode,
        status: result.status ?? null,
        failReason: result.failReason ?? null,
        warnings: result.warnings,
        accessToken: result.accessToken ?? null,
        refreshToken: result.refreshToken ?? null
      });
    } catch (e) {
      const message = e instanceof z.ZodError ? "发布参数不正确。" : String((e as Error)?.message ?? e);
      return res.status(400).json({ ok: false, message });
    }
  });
}
