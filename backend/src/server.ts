/**
 * BuddyMail 开源版 API 入口：CRM + 邮件营销 + 线索搜索 + 社媒发布 + 每日日报。
 * 无 LICENSE / 邀请码 / 商业交付体系。
 */
import "./loadEnv.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { registerEmailRoutes, startEmailCampaignScheduler } from "./routes/email.js";
import { registerEmailDedicatedServersRoutes } from "./routes/emailDedicatedServers.js";
import { ensureEmailDedicatedServersSchema } from "./services/emailDedicatedServersSchema.js";
import { registerEmailTemplateRoutes } from "./routes/emailTemplates.js";
import { registerEmailCommerceAssistantRoutes } from "./routes/emailCommerceAssistant.js";
import { registerContactGroupRoutes } from "./routes/contactGroups.js";
import { registerFollowupRoutes } from "./routes/followups.js";
import { registerCrmFollowupBoards, registerCrmFollowupChannels } from "./routes/crmFollowupBoards.js";
import { registerFollowupDetailBuilderRoutes } from "./routes/followupDetailBuilder.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerDashboardDailyTodosRoutes } from "./routes/dashboardDailyTodos.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerStandaloneAuthPolicy } from "./routes/standaloneAuthPolicy.js";
import { registerStandaloneAuthLoginRoute } from "./routes/standaloneAuthLoginRoute.js";
import { registerTenantApiAccessRoutes } from "./routes/tenantApiAccess.js";
import { registerLinkedInPublisherRoutes } from "./routes/linkedinPublisher.js";
import { registerWechatPublisherRoutes } from "./routes/wechatPublisher.js";
import { registerDailyMailboxRoutes } from "./routes/dailyMailbox.js";
import { registerTikTokPublisherRoutes } from "./routes/tiktokPublisher.js";
import { registerStandaloneSocialLibraryRoutes } from "./routes/standaloneSocialLibrary.js";
import { registerStandaloneStudioRoutes } from "./routes/standaloneStudio.js";
import { registerStandaloneB2bDailyRoutes } from "./routes/standaloneB2bDaily.js";
import { registerOpsHealthRoutes } from "./routes/opsHealth.js";
import { startWechatScheduledPublishScheduler } from "./services/socialPublishingWechat.js";
import { startEmailBounceImapIngestor } from "./services/emailBounceImapIngestor.js";
import { registerLeadsSearchRoutes } from "./routes/leadsSearch.js";
import { registerStandaloneLeadFinderRoutes } from "./routes/standaloneLeadFinder.js";
import { env } from "./env.js";
import { db, dbAuth } from "./db.js";
import { requireAuth } from "./middleware/auth.js";
import { globalRateLimiter } from "./middleware/rateLimiter.js";
import { getOpenCoreDailySendLimit, getOpenCorePlanTierId } from "./lib/openCoreConfig.js";
import { ensureStandaloneTenantEmailModule } from "./services/standaloneTenantEmailModule.js";

const app = express();

const corsOrigins = env.CORS_ORIGIN.split(/[,;]+/)
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length <= 1 ? (corsOrigins[0] ?? true) : corsOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(globalRateLimiter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "buddymail-open-core",
    time: new Date().toISOString(),
    planTierId: getOpenCorePlanTierId(),
    dailySendLimit: getOpenCoreDailySendLimit()
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    const [bizRows, authRows] = await Promise.race([
      Promise.all([db.query("SELECT 1 AS ok"), dbAuth.query("SELECT 1 AS ok")]),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MySQL health check timeout")), 5_000);
      })
    ]);
    res.json({ ok: true, mysql: { business: bizRows[0], auth: authRows[0] } });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: "MySQL connection failed", error: String((e as Error)?.message ?? e) });
  }
});

registerStandaloneAuthPolicy(app);
registerStandaloneAuthLoginRoute(app, { db: dbAuth, env });
registerAuthRoutes(app, { db: dbAuth, env });

const authRequired = requireAuth(dbAuth);
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/") || req.path === "/health" || req.path.startsWith("/health/")) {
    return next();
  }
  /** TikTok OAuth 回调来自外部，须免登录 */
  if (
    req.path.startsWith("/tiktok/oauth/authorize") ||
    req.path.startsWith("/tiktok/oauth/callback") ||
    req.path.startsWith("/tiktok/oauth/relay") ||
    req.path.startsWith("/tiktok/avatar-proxy")
  ) {
    return next();
  }
  /** 收件人邮件内链接与打开追踪：须免登录 */
  const publicEmailPaths = new Set([
    "/email/unsubscribe",
    "/email/subscribe",
    "/email/complaint",
    "/email/webhooks/events"
  ]);
  if (
    publicEmailPaths.has(req.path) ||
    req.path.startsWith("/email/track/open/") ||
    req.path.startsWith("/email/track/click/")
  ) {
    return next();
  }
  if (req.path === "/wechat-official/article-go" || req.path === "/wechat-official/image-proxy") {
    return next();
  }
  return authRequired(req, res, next);
});

registerTenantApiAccessRoutes(app, { db: dbAuth });
registerEmailRoutes(app, { db, dbAuth, env });
registerEmailTemplateRoutes(app, { db });
registerEmailCommerceAssistantRoutes(app, { env, db });
registerContactGroupRoutes(app, { db });
registerFollowupRoutes(app, { db });
registerCrmFollowupBoards(app, { db });
registerCrmFollowupChannels(app, { db });
registerFollowupDetailBuilderRoutes(app, { db });
registerDashboardRoutes(app, { db });
registerDashboardDailyTodosRoutes(app, { db });
registerEmailDedicatedServersRoutes(app, { db, env });
registerDailyMailboxRoutes(app, { db });
registerLeadsSearchRoutes(app, { db, env });
registerStandaloneLeadFinderRoutes(app, { db, env });
registerLinkedInPublisherRoutes(app);
registerWechatPublisherRoutes(app, { db });
registerTikTokPublisherRoutes(app);
registerStandaloneSocialLibraryRoutes(app, { db });
registerStandaloneStudioRoutes(app, { db });
registerStandaloneB2bDailyRoutes(app, { db, env });
registerOpsHealthRoutes(app, { db });

void ensureEmailDedicatedServersSchema(db).catch((e) => {
  console.warn("[buddymail] ensureEmailDedicatedServersSchema:", e);
});

void (async () => {
  try {
    const [rows] = await db.query(`SELECT id FROM tenants WHERE slug = 'standalone' LIMIT 1`);
    const tenantId = Number((rows as Array<{ id?: number }>)[0]?.id ?? 0);
    if (tenantId > 0) {
      await ensureStandaloneTenantEmailModule(db, tenantId);
      console.log(
        `[buddymail] tenant email module ensured: tenant_id=${tenantId} plan=${getOpenCorePlanTierId()} dailyLimit=${getOpenCoreDailySendLimit()}`
      );
    }
  } catch (e) {
    console.warn("[buddymail] startup tenant sync:", (e as Error)?.message ?? e);
  }
})();

startEmailCampaignScheduler(db);
startWechatScheduledPublishScheduler(db);
startEmailBounceImapIngestor(db, env);

// 日报 sections 预热：启动后先算好各 tenant 的日报缓存，打开日报页秒开
void import("./services/standaloneDailySections.js").then((m) => {
  m.warmupDailySections(db);
}).catch((e) => {
  console.warn("[daily-sections] warmup import failed:", (e as Error)?.message || e);
});

const port = env.PORT;
app.listen(port, () => {
  console.log(
    `[buddymail] listening on :${port} plan=${getOpenCorePlanTierId()} dailyLimit=${getOpenCoreDailySendLimit()}`
  );
});
