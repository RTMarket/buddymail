import { type Express, urlencoded } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import nodemailer from "nodemailer";
import { SocksClient } from "socks";
import type { Pool } from "mysql2/promise";
import type { Env } from "../env.js";
import { decryptSecret, encryptSecret } from "../cryptoSecret.js";
import { resolveTenantId } from "../middleware/auth.js";
import { computeCampaignRoundStatsSummary } from "../services/campaignStatsRoundScope.js";
import { countTenantEmailSentToday, getTenantEmailDailySendLimit } from "../services/emailSendQuota.js";
import {
  appendTenantMarketingOptOutFilters,
  countDistinctAudienceEmails,
  countDistinctEmailsByIndustryCrmCatalogMap,
  countDistinctEmailsByIndustryMap
} from "../services/emailAudienceCount.js";
import { resolveDedicatedSmtpPlainPassword } from "../services/dedicatedSmtpCredentials.js";
import {
  attachCrmCountsToIndustryItems,
  buildIndustryCatalogListItems,
  buildIndustryCountItems
} from "../services/emailIndustryTagResolve.js";
/** 开源版：套餐永久有效，只校验 status=active（period_end 为 NULL 表示永久） */
function isSubscriptionPeriodActive(row: { status: string; period_end?: unknown } | null): boolean {
  if (!row) return false;
  return String(row.status ?? "").trim().toLowerCase() === "active";
}
import { notifyAllTenantMembers } from "../services/userNotifications.js";
import { getEmailBounceImapIngestorHealthSnapshot, triggerEmailBounceImapIngestorNow } from "../services/emailBounceImapIngestor.js";
import {
  backfillImapBounceEventsForCampaign,
  countCampaignDistinctBouncedEmails,
  reconcileCampaignBouncedSends,
  sqlBounceEventMatchesSend,
  sqlSendRowHasBounceEvent
} from "../services/emailBounceReconcile.js";
import { sendEmail as sesSendEmail } from "../services/sesIdentityService.js";
import { isSuppressed } from "../services/sesSuppression.js";
import { checkDedicatedLaneSendAllowed } from "../services/dedicatedLanes.js";
import { checkSendAllowed, refreshOneTenantAndMaybeBreak } from "../services/tenantSendTier.js";
import { rewriteWechatArticleGoUrlsInEmailHtml, resolveStandaloneEmailPublicBaseUrl, publicBaseFromComplianceUrl, rewriteLoopbackEmailApiUrls } from "../lib/standaloneEmailPublicBaseUrl.js";
import { ensureStandaloneTenantEmailModule } from "../services/standaloneTenantEmailModule.js";
import { emitTenantWebhookEvent } from "../services/tenantWebhooks.js";
import {
  sendMailWithTimeout,
  verifySmtpWithTimeout,
  runWithTimeout,
  campaignSmtpSendTimeoutMs
} from "../services/smtpSendMail.js";
import { nodemailerTransportFromSmtpRow, resolveSmtpAuthUser } from "../smtpTransportConfig.js";
import {
  businessDayMysqlRange,
  businessRangeMysqlBounds,
  businessTodayYmd,
  formatBusinessDateTime,
  sqlBusinessDatetimeBetweenAnd
} from "../services/businessCalendar.js";
import { mxExists } from "../services/emailDeliverability.js";
import { buildEmailPlatformBrandingFooterHtml } from "../lib/emailPlatformBranding.js";
import { loadTenantEmailRangeStats } from "../services/emailTenantRangeStats.js";
import { loadTenantPackageSuccessDailySeries } from "../services/emailTenantPackageSuccessDaily.js";
import {
  invalidateTenantRangeStatsCache,
  readTenantRangeStatsCache,
  tenantRangeStatsCacheKey,
  writeTenantRangeStatsCache
} from "../services/tenantRangeStatsCache.js";
import { countCampaignFailedContactsDistinct } from "../services/campaignSendFailureCount.js";
import { loadCampaignEngagementSummary, countCampaignComplaints } from "../services/campaignEngagementStats.js";
import { buildCampaignStatsHttpBody } from "../services/campaignStatsPanelResponse.js";
import { runCampaignStatsSelfHeal } from "../services/campaignStatsSelfHeal.js";
import { ensureEmailCampaignSendRunsSchema } from "../services/emailCampaignSendRunsSchema.js";
import {
  beginCampaignSendRun,
  countCampaignDeliveryFailedDistinct,
  loadCampaignSummaryFailCount,
  loadCampaignSummaryFailCountStatsPanel,
  countSendRunProgressMetrics,
  countSendRunProgressMetricsLite,
  sqlPerEmailDeliveryStateExpr,
  sqlSendRowHasBounceEventImmediate,
  finalizeActiveSendRunForCampaign,
  finalizeCampaignSendRun,
  getActiveSendRunRow,
  resolveCampaignProgressSendRunId,
  resolveLatestSendRunIdForCampaign,
  listCampaignSendRuns,
  loadLatestRoundNoByCampaignIds,
  recoverOrphanSendingRunsOnStartup,
  recoverOrphanSendingCampaignsOnStartup,
  recoverStaleSendingCampaigns,
  recoverStaleSendingCampaignsForTenant,
  reconcileCampaignsWithoutActiveSendRun,
  registerActiveSendCampaignIdProvider,
  registerPruneActiveSendMemoryHook,
  reconcileStaleSendingEmailRows,
  reconcileEndgameSendingEmailRows,
  reconcileTailSendingForSendProgress,
  campaignSendingRowStaleReconcileSec,
  sendRunDeliveryComplete,
  resolveCampaignSendRunId,
  updateSendRunPlannedCount
} from "../services/emailCampaignSendRunService.js";
import { parseSendRunQueryInput, sqlSendRunFilter } from "../services/campaignSendRunFilter.js";
import { dbAuth } from "../db.js";
import {
  campaignHasSendHistory,
  loadTodayCampaignActivitiesSummary
} from "../services/campaignSendOnce.js";
import {
  sqlEmailSendIsSmtpFailure,
  sqlSumEmailSendDeliveryFailures,
  sqlSumEmailSendSmtpFailures
} from "../services/campaignSendDeliveryFailure.js";
import {
  buildCampaignAllTimeSuccessSeries,
  chartSlotTimeRange,
  ymdFromDbDateValue
} from "../services/campaignSuccessChartSeries.js";
import {
  bulkDeleteCampaignSendTabContacts,
  deleteTenantContactsByIds,
  deleteTenantContactByEmail
} from "../services/campaignSendContactsBulkDelete.js";
import { resolveWechatReadUrlForTemplate } from "../services/wechatArticleStats.js";
import {
  loadCampaignSendContactsPageFast,
  loadCampaignSendTabTotalsFast,
  loadCampaignSendTabTotalsStatsPanel
} from "../services/campaignSendContactsList.js";
import {
  campaignSendListCacheKey,
  invalidateCampaignSendListCache,
  invalidateCampaignSendListCaches,
  readCampaignSendListCache,
  writeCampaignSendListCache
} from "../services/campaignSendContactsCache.js";
import { sendContactsTabFilterSql } from "../services/sendContactsTabFilter.js";
import {
  invalidateCampaignPanelStatsCache,
  readCampaignPanelStatsCache,
  writeCampaignPanelStatsCache
} from "../services/campaignPanelStatsCache.js";

export type EmailCtx = { db: Pool };

type Ctx = { db: Pool; env: Env };

/** 发送进度轮询时拉取 IMAP 退信（发送中活动约 2–3 秒一次；非发送中可放慢） */
const campaignBounceImapPullAt = new Map<number, number>();
/** 本轮发送硬上限：累计尝试达到此值应停止（baseline + 待发） */
const campaignActiveSendPlanned = new Map<number, number>();
/** 点击发送时的累计尝试基线 */
const campaignSendRunBaseline = new Map<number, number>();
/** 实时监控展示用的本轮计划数（待发去重邮箱，不含历史累计） */
const campaignSendRunDisplayPlanned = new Map<number, number>();
/** 当前进行中的发送轮次（email_campaign_send_runs.id） */
const campaignActiveSendRunId = new Map<number, number>();
/** executeCampaignSend 后台异常时供 send-progress 展示 */
const campaignSendAsyncError = new Map<number, string>();
/** 首封前准备阶段（供实时监控展示根因） */
const campaignSendPrepSnapshot = new Map<
  number,
  { stage: string; detail?: string; at: number }
>();
/** 专线 formal POST 已闸过的 lane cap（execute 内勿重复 reconcile） */
const campaignLaneSendCtxCache = new Map<
  number,
  { lineSentCap: number; sentTodayBaseline: number; laneRemaining: number }
>();
/** send-progress 对账节流：避免 400ms 轮询 + 每次 UPDATE 占满连接池 */
const sendProgressReconcileLastAt = new Map<number, number>();
/** lite 响应短缓存：同活动 550ms 内复用 JSON，减轻 MySQL QPS */
const sendProgressLiteCache = new Map<
  number,
  { at: number; sendRunId: number; body: Record<string, unknown> }
>();
const SEND_PROGRESS_LITE_CACHE_MS = 550;
/** auto-complete 写 DB 节流：发送中每 3s 最多一次 */
const sendProgressAutoCompleteLastAt = new Map<number, number>();
/** 同活动并发 poll 合并为一次 DB 刷新，避免连接池排队 60s+ */
const sendProgressLiteInflight = new Map<number, Promise<Record<string, unknown>>>();
/** 专线 lite 诊断短缓存，发送中勿与 send-progress 争业务池 */
const deliveryDiagLiteCache = new Map<number, { at: number; body: Record<string, unknown> }>();
const deliveryDiagLiteInflight = new Map<number, Promise<Record<string, unknown>>>();
const DELIVERY_DIAG_LITE_CACHE_MS = 3_000;
const DELIVERY_DIAG_LITE_CACHE_SENDING_MS = 8_000;
/** send-progress 退信 DB 对账（仅 UPDATE，不拉 IMAP） */
const sendProgressBounceReconcileLastAt = new Map<number, number>();
/** 7 栏对齐失败计数（contact 去重）：发送中约 2.5s 节流，避免每 tick 跑 EXISTS */
const sendProgressCampaignFailLastAt = new Map<number, number>();
const sendProgressCampaignFailCache = new Map<number, { run: number; campaign: number }>();
/** 活动进行中 SMTP 连接：send-progress 对账后可 close 以打断卡死的 sendMail */
const campaignSmtpTransporterActive = new Map<number, nodemailer.Transporter>();
type CampaignSmtpPipelineHandle = { cancel: () => void; drain: (maxWaitMs?: number) => Promise<void> };
const campaignSmtpPipelineActive = new Map<number, CampaignSmtpPipelineHandle>();

function isCampaignSendWorkerActive(campaignId: number): boolean {
  return (
    campaignActiveSendRunId.has(campaignId) ||
    campaignSmtpPipelineActive.has(campaignId) ||
    campaignSmtpTransporterActive.has(campaignId)
  );
}

function dbgSendSession(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  // #region agent log
  console.warn(
    "[DEBUG_0bd240]",
    JSON.stringify({
      sessionId: "0bd240",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  );
  // #endregion
}
/** 本轮 formal 发送所选节奏（毫秒），供 send-progress 对账与流水线排队估算 */
const campaignSendMinIntervalMs = new Map<number, number>();

function abortCampaignSmtpTransport(campaignId: number): void {
  const tr = campaignSmtpTransporterActive.get(campaignId);
  if (tr && typeof tr.close === "function") {
    try {
      tr.close();
    } catch {
      /* ignore */
    }
  }
  campaignSmtpTransporterActive.delete(campaignId);
}

function staleSendingReconcileSec(): { minStaleSec: number; staleSec: number } {
  return campaignSendingRowStaleReconcileSec();
}

/** SMTP 串行投递队列：主循环按节奏起封，sendMail 在后台一条接一条执行 */
function createCampaignSmtpPipeline(campaignId: number) {
  /** 单 transporter 并行 sendMail 易挂死（运行时：6/13 后下一批长期 sending）→ 强制串行 */
  const MAX_CONCURRENCY = 1;
  let cancelled = false;
  let running = 0;
  const queue: Array<() => void> = [];
  function next() {
    if (cancelled || queue.length === 0 || running >= MAX_CONCURRENCY) return;
    const job = queue.shift()!;
    running += 1;
    job();
  }
  const api = {
    enqueue(job: () => Promise<void>) {
      if (cancelled) return;
      const run = () => {
        job().finally(() => {
          running -= 1;
          next();
        });
      };
      if (running < MAX_CONCURRENCY) {
        running += 1;
        run();
      } else {
        queue.push(run);
      }
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      abortCampaignSmtpTransport(campaignId);
    },
    drain(maxWaitMs = 120_000) {
      const deadline = Date.now() + Math.max(5_000, Math.floor(Number(maxWaitMs) || 0));
      return new Promise<void>((resolve) => {
        const check = () => {
          if (running === 0 && queue.length === 0) return resolve();
          if (Date.now() >= deadline) return resolve();
          setTimeout(check, 100);
        };
        check();
      });
    }
  };
  campaignSmtpPipelineActive.set(campaignId, {
    cancel: () => api.cancel(),
    drain: (ms) => api.drain(ms)
  });
  return api;
}

/** 流水线多封 sending 时，对账阈值须覆盖「排队 + 单次 SMTP」避免误杀 */
function pipelineStaleSendingMinSec(
  minIntervalMs: number,
  sendingCount: number
): { minStaleSec: number; staleSec: number } {
  const base = staleSendingReconcileSec();
  const sendSec = Math.ceil(campaignSmtpSendTimeoutMs() / 1000);
  const intervalSec = Math.max(0, Math.ceil(minIntervalMs / 1000));
  const n = Math.max(1, Math.floor(sendingCount));
  /** 末封仅 1 条 sending：用 8s 基线，勿等整段 SMTP 超时（否则 12/13 长期不动） */
  if (n <= 1) return base;
  /** 并发模式（intervalSec=0）时所有封几乎同时发出，只有 SMTP 超时等待 */
  if (intervalSec <= 0) {
    const cap = Math.min(5, sendSec * Math.max(0, n - 1));
    const minStaleSec = Math.max(base.minStaleSec, sendSec + cap);
    const staleSec = Math.max(base.staleSec, minStaleSec + 1);
    return { minStaleSec, staleSec };
  }
  const queueSec = intervalSec * (n - 1);
  const minStaleSec = Math.max(base.minStaleSec, sendSec + Math.min(queueSec + 8, 10));
  const staleSec = Math.max(base.staleSec, minStaleSec + 1);
  return { minStaleSec, staleSec };
}

async function maybeReconcileStaleSendingForProgress(
  db: Pool,
  campaignId: number,
  sendRunId: number,
  opts?: { aggressive?: boolean }
): Promise<void> {
  if (sendRunId <= 0) return;
  if (isCampaignSendWorkerActive(campaignId)) return;
  /** aggressive=false 时由调用方自行判断（如无在途 sending 可跳过） */
  if (!opts?.aggressive) return;
  const now = Date.now();
  const last = sendProgressReconcileLastAt.get(campaignId) ?? 0;
  const throttleMs = opts?.aggressive ? 2_000 : 12_000;
  if (now - last < throttleMs) return;
  sendProgressReconcileLastAt.set(campaignId, now);
  const { minStaleSec, staleSec } = staleSendingReconcileSec();
  try {
    const affected = await reconcileStaleSendingEmailRows(db, campaignId, {
      staleSec,
      minStaleSec
    });
    if (affected > 0) {
      abortCampaignSmtpTransport(campaignId);
    }
  } catch {
    /* ignore */
  }
}

/**
 * send-progress：僵尸 sending 对账 + 必要时关闭 SMTP 连接，让 executeCampaignSend 继续下一封。
 */
async function reconcileStaleSendingForSendProgress(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<void> {
  if (sendRunId <= 0) return;
  if (isCampaignSendWorkerActive(campaignId)) return;
  const [ageRows] = await db.query(
    `SELECT COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, NOW())), 0) AS age_sec
       FROM email_sends
      WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
    [campaignId, sendRunId]
  );
  const sendingAgeSec = Math.max(
    0,
    Number((ageRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? 0)
  );
  if (sendingAgeSec <= 0) return;

  const { minStaleSec, staleSec } = staleSendingReconcileSec();
  const smtpHardSec = Math.ceil(campaignSmtpSendTimeoutMs() / 1000);
  if (sendingAgeSec < minStaleSec) {
    return;
  }

  const now = Date.now();
  const last = sendProgressReconcileLastAt.get(campaignId) ?? 0;
  if (now - last < 2_000) {
    return;
  }
  sendProgressReconcileLastAt.set(campaignId, now);

  /** 在途 sending 超过 minStaleSec：先掐 SMTP，避免 sendMail 挂死导致进度长期停在 N-1/N */
  if (sendingAgeSec >= minStaleSec) {
    abortCampaignSmtpTransport(campaignId);
  }

  try {
    const affected = await reconcileStaleSendingEmailRows(db, campaignId, {
      staleSec: Math.max(minStaleSec, staleSec - 1),
      minStaleSec: Math.max(5, minStaleSec - 1),
      sendRunId
    });
    /** 仍有在途 sending 时勿 abort，避免掐断流水线正在执行的 sendMail */
    if (affected > 0) {
      const [leftRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends
          WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
        [campaignId, sendRunId]
      );
      const leftSending = Math.max(0, Number((leftRows as Array<{ n?: unknown }>)[0]?.n ?? 0));
      if (leftSending <= 0) {
        abortCampaignSmtpTransport(campaignId);
      }
    } else if (sendingAgeSec >= smtpHardSec) {
      abortCampaignSmtpTransport(campaignId);
    }
  } catch {
    /* ignore */
  }
}

async function oldestSendingAgeSecForRun(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<number> {
  if (sendRunId <= 0) return 0;
  const [ageRows] = await db.query(
    `SELECT COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, NOW())), 0) AS age_sec
       FROM email_sends
      WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
    [campaignId, sendRunId]
  );
  return Math.max(0, Number((ageRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? 0));
}

/** send-progress 中途：SMTP 挂起 → abort + 对账，与 Rule A 8–9s 口径一致（勿再用 15s 才动） */
async function unblockStaleSmtpForSendProgress(
  db: Pool,
  campaignId: number,
  sendRunId: number,
  oldestAgeSec?: number
): Promise<number> {
  if (sendRunId <= 0) return 0;
  if (isCampaignSendWorkerActive(campaignId)) return 0;
  const age =
    oldestAgeSec != null && oldestAgeSec > 0
      ? oldestAgeSec
      : await oldestSendingAgeSecForRun(db, campaignId, sendRunId);
  if (age <= 0) return 0;
  const { minStaleSec, staleSec } = staleSendingReconcileSec();
  if (age < minStaleSec) return 0;
  abortCampaignSmtpTransport(campaignId);
  try {
    return await reconcileStaleSendingEmailRows(db, campaignId, {
      sendRunId,
      staleSec: Math.max(minStaleSec, staleSec - 1),
      minStaleSec: Math.max(5, minStaleSec - 1)
    });
  } catch {
    return 0;
  }
}

const SEND_PROGRESS_LITE_BUILD_BUDGET_MS = 12_000;
const DELIVERY_DIAG_LITE_BUILD_BUDGET_MS = 8_000;

const SEND_PREP_STAGE_LABELS: Record<string, string> = {
  queued: "排队等待后台任务",
  gates: "校验发送权限",
  audience: "准备发送列表",
  smtp: "连接发信服务器",
  loop: "进入逐封发送",
  unknown: "准备中"
};

function setCampaignSendPrep(campaignId: number, stage: string, detail?: string) {
  campaignSendPrepSnapshot.set(campaignId, {
    stage,
    detail: detail?.trim() || undefined,
    at: Date.now()
  });
}

function clearCampaignSendPrep(campaignId: number) {
  campaignSendPrepSnapshot.delete(campaignId);
}

function labelSendPrepStage(stage: string | undefined | null): string {
  const key = String(stage ?? "").trim().toLowerCase();
  return SEND_PREP_STAGE_LABELS[key] ?? (key ? key : SEND_PREP_STAGE_LABELS.unknown);
}

function buildSendProgressPrepFields(
  campaignId: number,
  opts: {
    campaignSending: boolean;
    progressRunStillSending: boolean;
    progressRunStartedAt: Date | string | null;
    attempted: number;
    lastAsyncError: string | null;
    /** DB 仍有 sending 轮次（多 worker 时内存 map 可能为空） */
    activeSendRunInDb?: boolean;
  }
): {
  prepStage: string | null;
  prepDetail: string | null;
  prepAgeMs: number;
  prepBlockReason: string | null;
  sendWorkerAlive: boolean;
} {
  const prep = campaignSendPrepSnapshot.get(campaignId);
  const runStartMs = opts.progressRunStartedAt
    ? new Date(opts.progressRunStartedAt).getTime()
    : 0;
  const prepAgeMs =
    prep?.at != null
      ? Math.max(0, Date.now() - prep.at)
      : runStartMs > 0
        ? Math.max(0, Date.now() - runStartMs)
        : 0;
  const workerAlive =
    campaignActiveSendRunId.has(campaignId) || opts.activeSendRunInDb === true;
  const stageLabel = labelSendPrepStage(prep?.stage);
  const prepDetail = prep?.detail?.trim() || stageLabel;

  let prepBlockReason: string | null = null;
  const asyncErr = String(opts.lastAsyncError ?? "").trim();
  if (asyncErr) {
    prepBlockReason = asyncErr;
  } else if (opts.attempted > 0 && opts.campaignSending && !workerAlive && prepAgeMs >= 45_000) {
    prepBlockReason =
      `发送进度已停止约 ${Math.round(prepAgeMs / 1000)} 秒（已受理 ${opts.attempted} 封）。` +
      "常见原因：专线日上限、SMTP 中断或后台任务已结束。请刷新页面查看结果；若数字仍不变，点「停止发送」后换专线或明日再试。";
  } else if (opts.attempted <= 0 && opts.campaignSending) {
    if (!workerAlive && prepAgeMs >= 45_000) {
      prepBlockReason =
        `后台发送任务已不在运行（${stageLabel}，已等待 ${Math.round(prepAgeMs / 1000)} 秒）。` +
        "常见原因：系统回收了 sending 状态，或多进程下任务未在本机执行。请点「停止发送」→ 确认已部署最新版 → 新建活动再发。";
    } else if (prepAgeMs >= 120_000) {
      prepBlockReason =
        `准备超时（${Math.round(prepAgeMs / 1000)} 秒）：当前阶段「${stageLabel}」。` +
        "若 587 已通仍无首封，请查看服务器 pm2 日志 bss-backend，或点停止后新建活动重试。";
    } else if (prepAgeMs >= 60_000) {
      prepBlockReason =
        `首封尚未写入（${stageLabel}，已 ${Math.round(prepAgeMs / 1000)} 秒）。` +
        "请稍候；若持续无邮箱出现，可点「停止发送」后新建活动再试。";
    }
  }

  return {
    prepStage: prep?.stage ?? (opts.attempted <= 0 && opts.campaignSending ? "unknown" : null),
    prepDetail: opts.attempted <= 0 && opts.campaignSending ? prepDetail : null,
    prepAgeMs,
    prepBlockReason,
    sendWorkerAlive: workerAlive
  };
}

function clearCampaignActiveSendPlan(campaignId: number) {
  campaignActiveSendPlanned.delete(campaignId);
  campaignSendRunBaseline.delete(campaignId);
  campaignSendRunDisplayPlanned.delete(campaignId);
  campaignActiveSendRunId.delete(campaignId);
  campaignSendAsyncError.delete(campaignId);
  campaignLaneSendCtxCache.delete(campaignId);
  clearCampaignSendPrep(campaignId);
}

function bindCampaignActiveSendRunMaps(campaignId: number, sendRunId: number, plannedForRun: number) {
  campaignActiveSendRunId.set(campaignId, sendRunId);
  campaignSendRunBaseline.set(campaignId, 0);
  campaignSendRunDisplayPlanned.set(campaignId, Math.max(0, Math.floor(plannedForRun)));
  campaignActiveSendPlanned.set(campaignId, Math.max(0, Math.floor(plannedForRun)));
}
const CAMPAIGN_BOUNCE_IMAP_PULL_MS = Math.max(
  2_000,
  Math.min(60_000, Number(process.env.CAMPAIGN_BOUNCE_IMAP_PULL_MS || 3_000))
);
const CAMPAIGN_BOUNCE_IMAP_PULL_MS_SENDING = Math.max(
  1_500,
  Math.min(30_000, Number(process.env.CAMPAIGN_BOUNCE_IMAP_PULL_MS_SENDING || 2_000))
);
/** 已结束/非发送中活动：统计页轮询勿每 3s 扫 IMAP（底部列表已快，顶部百分比会卡） */
const CAMPAIGN_BOUNCE_IMAP_PULL_MS_IDLE = Math.max(
  30_000,
  Math.min(600_000, Number(process.env.CAMPAIGN_BOUNCE_IMAP_PULL_MS_IDLE || 120_000))
);
/** 发送进度轮询：退信对账（仅 UPDATE status，不扫 IMAP）节流 */
const CAMPAIGN_BOUNCE_RECONCILE_MS_SENDING = Math.max(
  1_000,
  Math.min(30_000, Number(process.env.CAMPAIGN_BOUNCE_RECONCILE_MS_SENDING || 2_000))
);
const campaignBounceReconcileAt = new Map<number, number>();

function queryFlagTruthy(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * 统计页按发信邮箱筛活动 ID：避免对 email_campaigns 每行做 email_sends EXISTS（大表会拖过 Nginx/前端超时）。
 */
async function listCampaignIdsForStatsFromEmail(
  db: Pool,
  fromEmail: string,
  tenantId: number,
  superAdminGlobal: boolean,
  limit: number,
  opts?: { smtpOnly?: boolean }
): Promise<number[]> {
  const fe = String(fromEmail ?? "")
    .trim()
    .toLowerCase();
  if (!fe) return [];
  const cap = Math.max(1, Math.min(500, Math.floor(limit) || 500));
  const smtpOnly = opts?.smtpOnly === true;
  const ids = new Set<number>();

  const pushIds = (rows: Array<{ id?: unknown }>) => {
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  };

  if (tenantId > 0 && !superAdminGlobal) {
    const [smtpRows] = await db.query(
      `SELECT c.id
         FROM email_campaigns c
         INNER JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
        WHERE c.tenant_id = ?
          AND LOWER(TRIM(COALESCE(sp.from_email, ''))) = ?
        ORDER BY c.id DESC
        LIMIT ?`,
      [tenantId, fe, cap]
    );
    pushIds(smtpRows as Array<{ id?: unknown }>);

    if (!smtpOnly && ids.size < cap) {
      const [sendRows] = await db.query(
        `SELECT DISTINCT s.campaign_id AS id
           FROM email_sends s
           INNER JOIN email_campaigns c ON c.id = s.campaign_id AND c.tenant_id = ?
          WHERE s.campaign_id > 0
            AND LOWER(TRIM(COALESCE(s.from_email, ''))) = ?
          ORDER BY s.campaign_id DESC
          LIMIT 150`,
        [tenantId, fe]
      );
      pushIds(sendRows as Array<{ id?: unknown }>);
    }
  } else {
    const [smtpRows] = await db.query(
      `SELECT c.id
         FROM email_campaigns c
         INNER JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
        WHERE LOWER(TRIM(COALESCE(sp.from_email, ''))) = ?
        ORDER BY c.id DESC
        LIMIT ?`,
      [fe, cap]
    );
    pushIds(smtpRows as Array<{ id?: unknown }>);

    if (!smtpOnly && ids.size < cap) {
      const [sendRows] = await db.query(
        `SELECT DISTINCT s.campaign_id AS id
           FROM email_sends s
          WHERE s.campaign_id > 0
            AND LOWER(TRIM(COALESCE(s.from_email, ''))) = ?
          ORDER BY s.campaign_id DESC
          LIMIT 150`,
        [fe]
      );
      pushIds(sendRows as Array<{ id?: unknown }>);
    }
  }

  return [...ids].sort((a, b) => b - a).slice(0, cap);
}

async function attachPickerSendStats(
  db: Pool,
  items: Array<{ id: number; status: string; has_sent?: boolean }>
): Promise<
  Array<{
    id: number;
    status: string;
    has_sent?: boolean;
    sent_count: number;
    failed_count: number;
    attempts_count: number;
  }>
> {
  if (items.length === 0) return [];
  const ids = items.map((x) => x.id).filter((id) => id > 0);
  const byId = new Map<
    number,
    { sent_ok: number; smtp_fail: number; attempts: number }
  >();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const ph = slice.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT s.campaign_id AS campaign_id,
              COUNT(*) AS attempts,
              SUM(CASE WHEN s.status IN ('sent', 'delivered') THEN 1 ELSE 0 END) AS sent_ok,
              ${sqlSumEmailSendDeliveryFailures("s")} AS smtp_fail
         FROM email_sends s
        WHERE s.campaign_id IN (${ph})
        GROUP BY s.campaign_id`,
      slice
    );
    for (const r of rows as Array<{
      campaign_id?: unknown;
      attempts?: unknown;
      sent_ok?: unknown;
      smtp_fail?: unknown;
    }>) {
      const cid = Number(r.campaign_id ?? 0);
      if (cid <= 0) continue;
      byId.set(cid, {
        attempts: Number(r.attempts ?? 0),
        sent_ok: Number(r.sent_ok ?? 0),
        smtp_fail: Number(r.smtp_fail ?? 0)
      });
    }
  }
  return items.map((row) => {
    const m = byId.get(row.id);
    const attempts = m?.attempts ?? 0;
    const sentOk = m?.sent_ok ?? 0;
    const smtpFail = m?.smtp_fail ?? 0;
    const status = String(row.status ?? "").toLowerCase();
    const hasSent =
      row.has_sent === true ||
      attempts > 0 ||
      sentOk > 0 ||
      status === "sending" ||
      status === "completed" ||
      status === "stopped";
    return {
      id: row.id,
      status: row.status,
      has_sent: hasSent,
      sent_count: sentOk,
      failed_count: smtpFail,
      attempts_count: attempts
    };
  });
}

type OutboundIpPoolType = "direct" | "http" | "socks5";

type OutboundIpPoolRow = {
  id: number;
  tenant_id: number;
  label: string | null;
  type: OutboundIpPoolType;
  host: string;
  port: number;
  username: string | null;
  password_enc: string | null;
  is_enabled: number;
  last_used_at: string | null;
};

const smtpUpsertSchema = z.object({
  name: z.string().min(1).max(64),
  fromEmail: z.string().email(),
  /** 邮件 From 头里收件人看到的显示名（如 "Acme Sales"），可空时不写显示名 */
  displayName: z.string().max(255).optional(),
  /** 收件人点"回复"时邮件去往这里；空 = 同 from_email */
  replyTo: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().min(1),
  password: z.string().min(1),
  imapEnabled: z.boolean().optional(),
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  imapUsername: z.string().optional(),
  imapPassword: z.string().optional(),
  imapMailbox: z.string().optional(),
  makeDefault: z.boolean().optional()
});

const smtpUpdateSchema = z.object({
  name: z.string().min(1).max(64),
  fromEmail: z.string().email(),
  displayName: z.string().max(255).optional(),
  replyTo: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  /** 留空表示保留原密码 */
  password: z.string().optional(),
  imapEnabled: z.boolean().optional(),
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  imapUsername: z.string().optional(),
  /** 留空表示保留原密码 */
  imapPassword: z.string().optional(),
  imapMailbox: z.string().optional(),
  makeDefault: z.boolean().optional()
});

const senderUpsertSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  displayName: z.string().min(1),
  replyTo: z.string().email().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  telegram: z.string().optional(),
  makeDefault: z.boolean().optional()
});

const contactEmailStatusSchema = z.enum(["valid", "invalid", "risky", "unverified", "none"]);

const contactCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
  jobTitle: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  emailStatus: contactEmailStatusSchema.optional(),
  businessLine: z.enum(["partner", "factory", "company_register", "all"]).optional(),
  /** 若传入则覆盖该联系人的分组归属（空数组表示移除全部分组） */
  groupIds: z.array(z.number().int().positive()).max(100).optional(),
  tags: z.array(z.string()).optional()
});

const campaignCreateSchema = z.object({
  name: z.string().min(1),
  businessLine: z.enum(["partner", "factory", "company_register", "all"]).optional(),
  templateId: z.number().int().positive(),
  smtpProfileId: z.number().int().positive().optional(),
  senderProfileId: z.number().int().positive().optional(),
  /**
   * 多租户 SES BYOD 通道：选了 SES 发件邮箱时优先走 SES（带配置集 + tags），
   * 没选则回退老 SMTP 通道。两者只取其一。
   */
  sesSenderAddressId: z.number().int().positive().optional(),
  groupIds: z.array(z.number().int().positive()).optional().default([]),
  industries: z.array(z.string().min(1).max(128)).max(100).optional(),
  /** 是否预约特定时间发送；为 false 时不写入计划时间，需手动点发送 */
  scheduleSpecific: z.boolean(),
  /** scheduleSpecific 为 true 时必填（ISO），须不早于当前时刻 */
  scheduleStartAt: z.union([z.string(), z.null()]).optional(),
  /** 即时=只发 1 轮；循环=首轮完成后自动再发，共 sendRoundsTotal 轮 */
  sendMode: z.enum(["immediate", "recurring"]),
  /** 循环时 1–5；即时忽略，服务端固定为 1 */
  sendRoundsTotal: z.coerce.number().int().min(1).max(5).optional()
});

const audiencePreviewSchema = z.object({
  groupIds: z.array(z.number().int().positive()).optional().default([]),
  industries: z.array(z.string().min(1).max(128)).max(100).optional(),
  businessLine: z.enum(["partner", "factory", "company_register", "all"]).optional(),
  /** 续发/新轮：排除本活动历史已尝试邮箱，与 executeCampaignSend 新轮首轮一致 */
  campaignId: z.coerce.number().int().positive().optional()
});

const DOMAIN_AUTH_STATUS = ["unknown", "pass", "fail"] as const;

/** 邮件内订阅/退订/投诉/追踪链接的公网根地址（独立站须指向本机站点根 URL，勿落到主站） */
function getUnsubscribeBaseUrl() {
  return resolveStandaloneEmailPublicBaseUrl();
}

function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function isTrackableHref(raw: string): boolean {
  const href = raw.trim();
  if (!/^https?:\/\//i.test(href)) return false;
  if (/\/api\/email\/(?:unsubscribe|subscribe|complaint|track\/)/i.test(href)) return false;
  return true;
}

function decorateHtmlWithTracking(html: string, baseUrl: string, sendUuid: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const openUrl = `${base}/api/email/track/open/${encodeURIComponent(sendUuid)}.gif`;
  const withLinks = html.replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, (m, quote, href) => {
    const target = String(href ?? "");
    if (!isTrackableHref(target)) return m;
    const clickUrl = `${base}/api/email/track/click/${encodeURIComponent(sendUuid)}?u=${encodeURIComponent(target)}`;
    return `href=${quote}${clickUrl}${quote}`;
  });
  const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:none!important;width:1px;height:1px;opacity:0;border:0;" />`;
  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}

function makeUnsubscribeToken(contactId: number, campaignId: number, email: string) {
  const payload = `${contactId}.${campaignId}.${email.trim().toLowerCase()}`;
  const secret = (process.env.CREDENTIALS_SECRET ?? "bss-dev-secret").trim() || "bss-dev-secret";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 24);
  const emailEncoded = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${contactId}.${campaignId}.${emailEncoded}.${sig}`;
}

function makeComplaintToken(contactId: number, campaignId: number, email: string) {
  const payload = `${contactId}.${campaignId}.${email.trim().toLowerCase()}.complaint`;
  const secret = (process.env.CREDENTIALS_SECRET ?? "bss-dev-secret").trim() || "bss-dev-secret";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 24);
  const emailEncoded = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${contactId}.${campaignId}.${emailEncoded}.${sig}`;
}

function makeSubscribeToken(contactId: number, campaignId: number, email: string) {
  const payload = `${contactId}.${campaignId}.${email.trim().toLowerCase()}.subscribe`;
  const secret = (process.env.CREDENTIALS_SECRET ?? "bss-dev-secret").trim() || "bss-dev-secret";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 24);
  const emailEncoded = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${contactId}.${campaignId}.${emailEncoded}.${sig}`;
}

function parseAndVerifyUnsubscribeToken(token: string): { ok: true; contactId: number; campaignId: number; email: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return { ok: false };
  }
  const contactId = Number(parts[0]);
  const campaignId = Number(parts[1]);
  const email = Buffer.from(parts[2] ?? "", "base64url").toString("utf8").trim().toLowerCase();
  const sig = String(parts[3] ?? "");
  if (!Number.isFinite(contactId) || contactId <= 0 || !Number.isFinite(campaignId) || campaignId <= 0 || !email) {
    return { ok: false };
  }
  const expected = makeUnsubscribeToken(contactId, campaignId, email).split(".")[3] ?? "";
  if (sig !== expected) {
    return { ok: false };
  }
  return { ok: true, contactId, campaignId, email };
}

function parseAndVerifyComplaintToken(token: string): { ok: true; contactId: number; campaignId: number; email: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false };
  const contactId = Number(parts[0]);
  const campaignId = Number(parts[1]);
  const email = Buffer.from(parts[2] ?? "", "base64url").toString("utf8").trim().toLowerCase();
  const sig = String(parts[3] ?? "");
  if (!Number.isFinite(contactId) || contactId <= 0 || !Number.isFinite(campaignId) || campaignId <= 0 || !email) return { ok: false };
  const expected = makeComplaintToken(contactId, campaignId, email).split(".")[3] ?? "";
  if (sig !== expected) return { ok: false };
  return { ok: true, contactId, campaignId, email };
}

function parseAndVerifySubscribeToken(token: string): { ok: true; contactId: number; campaignId: number; email: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false };
  const contactId = Number(parts[0]);
  const campaignId = Number(parts[1]);
  const email = Buffer.from(parts[2] ?? "", "base64url").toString("utf8").trim().toLowerCase();
  const sig = String(parts[3] ?? "");
  if (!Number.isFinite(contactId) || contactId <= 0 || !Number.isFinite(campaignId) || campaignId <= 0 || !email) return { ok: false };
  const expected = makeSubscribeToken(contactId, campaignId, email).split(".")[3] ?? "";
  if (sig !== expected) return { ok: false };
  return { ok: true, contactId, campaignId, email };
}

function safeRequestUserAgent(req: { get(name: string): string | undefined }): string | null {
  const userAgent = String(req.get("user-agent") ?? "").trim();
  return userAgent ? userAgent.slice(0, 2000) : null;
}

function publicEmailAction(
  label: string,
  handler: (req: any, res: any) => Promise<unknown>
): (req: any, res: any) => void {
  return (req, res) => {
    handler(req, res).catch((e: unknown) => {
      console.error(`[email-public-action] ${label} failed`, e);
      if (res.headersSent) return;
      return res
        .status(500)
        .type("html")
        .send(
          `<html><body style="font-family:system-ui;padding:28px;"><h2>操作暂时失败</h2><p>请稍后重试，或联系发件方处理。</p></body></html>`
        );
    });
  };
}

function csvEscapeCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function mapComplianceContactEventRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    contactId: r.contact_id != null ? Number(r.contact_id) : null,
    email: String(r.email ?? ""),
    reason: r.reason ? String(r.reason) : "",
    createdAt: r.created_at,
    industry: r.industry ? String(r.industry) : "",
    company: r.company ? String(r.company) : "",
    name: `${String(r.first_name ?? "").trim()} ${String(r.last_name ?? "").trim()}`.trim(),
    jobTitle: r.job_title ? String(r.job_title) : "",
    phone: r.phone ? String(r.phone) : "",
    fax: r.fax ? String(r.fax) : "",
    address: r.address ? String(r.address) : "",
    country: r.country ? String(r.country) : "",
    website: r.website ? String(r.website) : "",
    linkedin: r.linkedin ? String(r.linkedin) : "",
    businessLine: r.business_line ? String(r.business_line) : "",
    emailStatus: r.email_status ? String(r.email_status) : "",
    contactStatus: r.contact_status ? String(r.contact_status) : ""
  };
}

/** 统计页名单 tab：仅返回表格展示所需字段 */
function mapComplianceContactEventRowSlim(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    contactId: r.contact_id != null ? Number(r.contact_id) : null,
    email: String(r.email ?? ""),
    reason: r.reason ? String(r.reason) : "",
    company: r.company ? String(r.company) : "",
    name: `${String(r.first_name ?? "").trim()} ${String(r.last_name ?? "").trim()}`.trim()
  };
}

const COMPLIANCE_CONTACT_JOIN_SELECT = `
  c.industry, c.company, c.first_name, c.last_name, c.job_title, c.phone, c.fax, c.address,
  c.country, c.website, c.linkedin, c.business_line, c.email_status, c.status AS contact_status`;

function buildComplianceEventsCsvBody(
  rows: Record<string, unknown>[],
  timeHeader: string,
  reasonHeader: string
): string {
  const headers = [
    "行业",
    "企业名称",
    "联系人",
    "职位",
    "电话",
    "传真",
    "邮箱",
    "联系地址",
    "国家",
    "网址",
    "LinkedIn",
    "业务线",
    "邮箱状态",
    "联系人状态",
    timeHeader,
    reasonHeader
  ];
  const lines = [headers.map(csvEscapeCell).join(",")];
  for (const r of rows) {
    const mapped = mapComplianceContactEventRow(r);
    const createdAt =
      r.created_at instanceof Date
        ? r.created_at.toISOString().slice(0, 19).replace("T", " ")
        : String(r.created_at ?? "");
    lines.push(
      [
        mapped.industry,
        mapped.company,
        mapped.name,
        mapped.jobTitle,
        mapped.phone,
        mapped.fax,
        mapped.email,
        mapped.address,
        mapped.country,
        mapped.website,
        mapped.linkedin,
        mapped.businessLine,
        mapped.emailStatus,
        mapped.contactStatus,
        createdAt,
        mapped.reason
      ]
        .map(csvEscapeCell)
        .join(",")
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

function extractFailedEmailFromDsn(rawText: string): string | null {
  const txt = String(rawText ?? "");
  const checks = [
    /(?:无法送达到|无法送达)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /message you sent to\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /recipient[^a-zA-Z0-9._%+-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  ];
  for (const re of checks) {
    const m = re.exec(txt);
    if (m?.[1]) return String(m[1]).trim().toLowerCase();
  }
  const all = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  if (!all.length) return null;
  return String(all[0]).trim().toLowerCase();
}

function extractDsnReason(rawText: string): string {
  const txt = String(rawText ?? "");
  const lines = txt
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const key = lines.find((x) => /(?:rejected|denied|unauthenticated|undeliver|退信|拒绝|invalid)/i.test(x));
  const fallback = lines[0] ?? "";
  return (key || fallback).slice(0, 500);
}

function summarizeSmtpRejection(info: any): string | null {
  const acceptedCount = Array.isArray(info?.accepted) ? info.accepted.length : 0;
  const rejectedCount = Array.isArray(info?.rejected) ? info.rejected.length : 0;
  const pendingCount = Array.isArray(info?.pending) ? info.pending.length : 0;
  const responseText = String(info?.response ?? "").trim();
  // 检查 SMTP response 中是否包含拒绝码（5xx 永久失败 / 4xx 临时失败）
  const smtpErrorMatch = /^\s*([45]\d{2})\s/.exec(responseText);
  const responseHasError = smtpErrorMatch !== null;
  if (rejectedCount <= 0 && pendingCount <= 0 && acceptedCount > 0) {
    if (responseHasError) {
      return `SMTP 返回错误: ${responseText.slice(0, 300)}`;
    }
    return null;
  }
  if (rejectedCount <= 0 && pendingCount <= 0 && acceptedCount <= 0) {
    return "SMTP 未返回 accepted 收件人";
  }
  const rejected = (Array.isArray(info?.rejected) ? info.rejected : [])
    .map((x: any) => String(x ?? "").trim())
    .filter(Boolean);
  const pending = (Array.isArray(info?.pending) ? info.pending : [])
    .map((x: any) => String(x ?? "").trim())
    .filter(Boolean);
  const reasonParts: string[] = [];
  if (rejected.length > 0) reasonParts.push(`rejected: ${rejected.join(", ")}`);
  if (pending.length > 0) reasonParts.push(`pending: ${pending.join(", ")}`);
  if (responseText) reasonParts.push(`response: ${responseText}`);
  return reasonParts.join(" | ").slice(0, 500) || "SMTP 拒收或延迟，未确认送达";
}

function decorateHtmlWithComplianceLinks(
  html: string,
  unsubscribeUrl: string,
  complaintUrl: string,
  subscribeUrl: string,
  wechatReadOriginalFallback?: string | null
) {
  /**
   * 兜底再跑一次相对路径改写：覆盖「在本次修复前已写入 email_campaigns.html 的旧活动」，
   * 让旧活动下次发送也能把 <img src="/uploads/..."> 修成绝对 URL。改写是幂等的：
   * 已是绝对地址（http/https/data:/protocol-relative）一律跳过。
   * assetBase 与 unsubscribeUrl 同源，避免自动化发信传入公网根时仍落到 getUnsubscribeBaseUrl() 的 localhost。
   */
  const assetBase = publicBaseFromComplianceUrl(unsubscribeUrl) || getUnsubscribeBaseUrl();
  const htmlScrubbed = rewriteLoopbackEmailApiUrls(html ?? "", assetBase);
  const absUrlHtml = normalizeEmailHtmlAssetUrls(
    rewriteWechatArticleGoUrlsInEmailHtml(htmlScrubbed, assetBase),
    assetBase
  );
  const wechatReadOriginalUrl =
    extractWechatReadOriginalUrl(absUrlHtml, assetBase) ||
    String(wechatReadOriginalFallback ?? "").trim();
  const htmlWithoutWechatMarker = absUrlHtml.replace(/<!--\s*BSS_WECHAT_READ_ORIGINAL_URL:[\s\S]*?-->/g, "");
  const htmlWithWechatLinks =
    wechatReadOriginalUrl && /mp\.weixin\.qq\.com/i.test(htmlWithoutWechatMarker)
      ? rewriteWechatArticleHrefTargets(htmlWithoutWechatMarker, wechatReadOriginalUrl)
      : htmlWithoutWechatMarker;
  /** 把 Quill 的 class（对齐/字号/字体/缩进）翻译成内联 style，邮件客户端不会加载 Quill CSS */
  const safeHtml = inlineQuillClassesToStyles(htmlWithWechatLinks);
  const footer =
    `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">` +
    (wechatReadOriginalUrl
      ? `<a href="${escapeEmailAttr(wechatReadOriginalUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;">阅读原文</a>` +
        `　|　`
      : "") +
    `确认继续接收此类邮件？<a href="${subscribeUrl}" style="color:#2563eb;">订阅</a>` +
    `　|　` +
    `不想再接收？<a href="${unsubscribeUrl}" style="color:#2563eb;">退订</a>` +
    `　|　` +
    `若内容不相关或质量不佳：<a href="${complaintUrl}" style="color:#2563eb;">投诉</a>` +
    `</div>`;
  const brandingFooter = buildEmailPlatformBrandingFooterHtml();
  return wrapEmailHtmlForMobile(`${safeHtml}${footer}${brandingFooter}`);
}

function rewriteWechatArticleHrefTargets(html: string, replacementUrl: string): string {
  const cleanReplacement = replacementUrl.trim();
  if (!html || !cleanReplacement) return html ?? "";
  return html.replace(
    /\bhref\s*=\s*(["'])([^"']*mp\.weixin\.qq\.com[^"']*)\1/gi,
    (match, quote: string, rawHref: string) => {
      const decoded = rawHref.replace(/&amp;/gi, "&").trim();
      try {
        const u = new URL(decoded);
        const host = u.hostname.toLowerCase();
        const path = u.pathname.toLowerCase();
        if ((host === "mp.weixin.qq.com" || host === "www.mp.weixin.qq.com") && (path === "/s" || path.startsWith("/s/"))) {
          return `href=${quote}${escapeEmailAttr(cleanReplacement)}${quote}`;
        }
      } catch {
        return match;
      }
      return match;
    }
  );
}

function extractWechatReadOriginalUrl(html: string, base?: string): string {
  const match = html.match(/<!--\s*BSS_WECHAT_READ_ORIGINAL_URL:([\s\S]*?)-->/);
  if (!match?.[1]) return "";
  try {
    const decoded = decodeURIComponent(match[1].trim());
    if (/^https?:\/\//i.test(decoded)) {
      const url = new URL(decoded);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return decoded;
    }
    if (decoded.startsWith("/api/") && base?.trim()) {
      return `${base.replace(/\/+$/, "")}${decoded}`;
    }
  } catch {
    return "";
  }
  return "";
}

function escapeEmailAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 把邮件正文包进一个完整 HTML 文档，并附上让手机邮件客户端正常显示的样式：
 *   1) <meta viewport>：手机 QQ 邮箱/Outlook for iOS 看到 720px 宽布局时不会再做整体等比缩放，
 *      避免出现「把整封邮件压扁后字变成 8-10px」。
 *   2) -webkit-text-size-adjust:100%：iOS Mail 默认会自动放大小字，关掉它防意外。
 *   3) img{max-width:100%}：用户上传的 logo 等大图会被收敛到容器宽度，不再撑爆排版。
 *   4) @media (max-width:480px)：手机端把容器内边距收紧、字号回到 16px，正文阅读体验跟桌面一致。
 *
 * 所有发邮件的链路（邮件营销群发、测试发送、活动测试发送）都最终走 decorateHtmlWithComplianceLinks → 此处。
 */
function wrapEmailHtmlForMobile(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  body{margin:0;padding:0;background:#ffffff;}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;max-width:100%;height:auto;display:block;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;max-width:100%;}
  .bss-mail{margin:0 auto;max-width:720px;font-size:16px;line-height:1.6;color:#111827;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:16px;}
  .bss-mail p{margin:0 0 12px;}
  @media only screen and (max-width:480px){
    .bss-mail{font-size:16px!important;line-height:1.6!important;padding:12px!important;}
    .bss-mail h1{font-size:22px!important;}
    .bss-mail h2{font-size:20px!important;}
    .bss-mail h3{font-size:18px!important;}
  }
</style>
</head>
<body>
<div class="bss-mail">${innerHtml}</div>
</body>
</html>`;
}

function parseOptionalScheduleAt(raw: string | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 邮件出站前把正文里的相对路径改写为绝对 URL：
 *   <img src="/uploads/x.jpg">  → <img src="https://example.com/uploads/x.jpg">
 *   <a href="/foo">             → <a href="https://example.com/foo">
 *   style="...url(/x.png)..."   → style="...url(https://example.com/x.png)..."
 *
 * 邮件客户端（特别是手机 QQ 邮箱、Outlook for iOS 等）打开邮件时没有「当前页面」基准 URL，
 * 相对路径会直接 broken；网页编辑器里仍按相对路径存储、便于本站预览，仅在出站这一步替换。
 *
 * 跳过：data: URI、protocol-relative `//cdn.../...`、http/https 绝对地址。
 */
function rewriteRelativeUrlsForEmail(html: string, base: string): string {
  const trimmedBase = (base ?? "").replace(/\/+$/, "");
  if (!html || !trimmedBase) return html ?? "";
  return html
    .replace(
      /(\b(?:src|href|action|poster|background)\s*=\s*)(["'])\/(?!\/)([^"']*)\2/gi,
      (_m, attr: string, quote: string, path: string) => `${attr}${quote}${trimmedBase}/${path}${quote}`
    )
    .replace(
      /(url\(\s*)(["']?)\/(?!\/)([^"')]+)\2(\s*\))/gi,
      (_m, pre: string, quote: string, path: string, post: string) =>
        `${pre}${quote}${trimmedBase}/${path}${quote}${post}`
    );
}

function escapeRegExpForUrl(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 授权安装默认写入 http://域名:8080；模版/活动 HTML 里会留下 http 的 /uploads 绝对地址。
 * 手机邮箱常仍可加载；Outlook 桌面端等常拦截 http 远程图。PUBLIC_BASE_URL 为 https 时出站升为 https。
 */
function upgradeHttpUploadUrlsForEmail(html: string, base: string): string {
  const trimmedBase = (base ?? "").replace(/\/+$/, "");
  if (!html || !trimmedBase) return html ?? "";
  let preferred: URL;
  try {
    preferred = new URL(trimmedBase.includes("://") ? trimmedBase : `https://${trimmedBase}`);
  } catch {
    return html;
  }
  if (preferred.protocol !== "https:") return html;
  const host = preferred.hostname;
  const httpsPort =
    preferred.port && preferred.port !== "443" ? `:${preferred.port}` : "";
  const httpsRoot = `https://${host}${httpsPort}`;
  const httpRoots = new Set<string>([`http://${host}:8080`, `http://${host}`]);
  let out = html;
  for (const httpRoot of httpRoots) {
    const esc = escapeRegExpForUrl(httpRoot);
    out = out.replace(
      new RegExp(`(\\b(?:src|href)\\s*=\\s*)(["'])${esc}/uploads/`, "gi"),
      `$1$2${httpsRoot}/uploads/`
    );
  }
  return out;
}

function normalizeEmailHtmlAssetUrls(html: string, base: string): string {
  return upgradeHttpUploadUrlsForEmail(rewriteRelativeUrlsForEmail(html, base), base);
}

function emailInlineImageMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return null;
}

function localUploadImagePathFromEmailSrc(src: string): string | null {
  const raw = String(src ?? "").trim();
  if (!raw || /^cid:/i.test(raw) || /^data:/i.test(raw)) return null;
  let pathname = "";
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
    else pathname = raw.split(/[?#]/, 1)[0] ?? "";
  } catch {
    return null;
  }
  if (!pathname.startsWith("/uploads/")) return null;
  let rel = "";
  try {
    rel = decodeURIComponent(pathname.slice("/uploads/".length));
  } catch {
    rel = pathname.slice("/uploads/".length);
  }
  if (!rel || rel.includes("\0")) return null;
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  const filePath = path.resolve(uploadRoot, rel);
  if (filePath !== uploadRoot && !filePath.startsWith(`${uploadRoot}${path.sep}`)) return null;
  return filePath;
}

function prepareSmtpHtmlWithInlineUploadImages(html: string): {
  html: string;
  attachments?: nodemailer.SendMailOptions["attachments"];
} {
  if (!html || !/<img\b/i.test(html)) return { html };
  const attachments: NonNullable<nodemailer.SendMailOptions["attachments"]> = [];
  const seen = new Map<string, string>();
  let totalBytes = 0;
  const maxImages = Math.max(0, Math.min(12, Number(process.env.EMAIL_INLINE_UPLOAD_IMAGE_MAX_COUNT ?? 8)));
  const maxOneBytes = Math.max(64 * 1024, Math.min(3 * 1024 * 1024, Number(process.env.EMAIL_INLINE_UPLOAD_IMAGE_MAX_ONE_BYTES ?? 1024 * 1024)));
  const maxTotalBytes = Math.max(maxOneBytes, Math.min(8 * 1024 * 1024, Number(process.env.EMAIL_INLINE_UPLOAD_IMAGE_MAX_TOTAL_BYTES ?? 4 * 1024 * 1024)));

  const nextHtml = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (match, pre: string, quote: string, src: string) => {
      const filePath = localUploadImagePathFromEmailSrc(src);
      if (!filePath) return match;
      const contentType = emailInlineImageMimeType(filePath);
      if (!contentType) return match;
      let st: fs.Stats;
      try {
        st = fs.statSync(filePath);
      } catch {
        return match;
      }
      if (!st.isFile() || st.size <= 0 || st.size > maxOneBytes) return match;
      const existing = seen.get(filePath);
      if (existing) return `${pre}${quote}cid:${existing}${quote}`;
      if (attachments.length >= maxImages || totalBytes + st.size > maxTotalBytes) return match;
      const cid = `bss-${crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 16)}@inline`;
      seen.set(filePath, cid);
      totalBytes += st.size;
      attachments.push({
        filename: path.basename(filePath),
        path: filePath,
        cid,
        contentType,
        contentDisposition: "inline"
      });
      return `${pre}${quote}cid:${cid}${quote}`;
    }
  );

  return attachments.length > 0 ? { html: nextHtml, attachments } : { html };
}

/**
 * Quill 富文本编辑器把对齐/字号/字体/缩进等格式存成 class 名（如 ql-align-center），
 * 而不是内联 style。本站预览时由前端 inlineQuillPreviewStyles 现场翻译；但邮件 HTML
 * 出站后客户端不会加载 Quill 的 CSS，class 直接失效，所有居中标题都会回到左对齐。
 *
 * 这里在邮件发送前把这些 class 翻译为等价的 inline style，等同于前端预览 effect。
 * 用正则做：Quill 的类名（ql-*）独特且固定，不会跟用户输入的其他 class 冲突。
 */
const QUILL_CLASS_TO_STYLE: ReadonlyArray<readonly [string, string]> = [
  ["ql-align-center", "text-align:center"],
  ["ql-align-right", "text-align:right"],
  ["ql-align-justify", "text-align:justify"],
  ["ql-size-small", "font-size:0.75em"],
  ["ql-size-large", "font-size:1.5em"],
  ["ql-size-huge", "font-size:2.5em"],
  ["ql-font-serif", "font-family:Georgia,'Times New Roman',serif"],
  ["ql-font-monospace", "font-family:Menlo,Consolas,'Courier New',monospace"],
  ["ql-indent-1", "padding-left:3em"],
  ["ql-indent-2", "padding-left:6em"],
  ["ql-indent-3", "padding-left:9em"],
  ["ql-indent-4", "padding-left:12em"],
  ["ql-indent-5", "padding-left:15em"],
  ["ql-indent-6", "padding-left:18em"],
  ["ql-indent-7", "padding-left:21em"],
  ["ql-indent-8", "padding-left:24em"]
];

function inlineQuillClassesToStyles(html: string): string {
  if (!html) return html ?? "";
  let out = html;
  for (const [cls, css] of QUILL_CLASS_TO_STYLE) {
    /** 匹配「带 class 属性、且 class 中包含目标 cls 单词」的开标签 */
    const re = new RegExp(
      `<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
      "g"
    );
    out = out.replace(re, (match, tag: string, attrs: string) => {
      const styleMatch = attrs.match(/\bstyle\s*=\s*(["'])([^"']*)\1/);
      if (styleMatch) {
        /** 已有 style 中已包含同 css 时不再追加，避免重复 */
        if (styleMatch[2].includes(css)) return match;
        const merged = styleMatch[2].replace(/;\s*$/, "") + ";" + css;
        const newAttrs = attrs.replace(
          /\bstyle\s*=\s*(["'])([^"']*)\1/,
          `style="${merged}"`
        );
        return `<${tag}${newAttrs}>`;
      }
      return `<${tag}${attrs} style="${css}">`;
    });
  }
  return out;
}

function assembleTemplateEmailHtml(bodyHtml: string, signatureHtml?: string | null) {
  const base = getUnsubscribeBaseUrl();
  const bodyAbs = normalizeEmailHtmlAssetUrls(bodyHtml ?? "", base);
  const sigRaw = (signatureHtml ?? "").trim();
  const sigEmpty =
    !sigRaw ||
    sigRaw === "<p><br></p>" ||
    /^<p>\s*(<br\s*\/?>\s*)?<\/p>$/i.test(sigRaw.replace(/\s/g, " "));
  const sigAbs = sigEmpty ? "" : normalizeEmailHtmlAssetUrls(sigRaw, base);
  const sigPart = sigEmpty
    ? ""
    : `<div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">${sigAbs}</div>`;
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111827;max-width:720px;">${bodyAbs}${sigPart}</div>`;
}

function getComplianceDemoLinks() {
  const base = getUnsubscribeBaseUrl().replace(/\/$/, "");
  return {
    subscribeUrl: `${base}/api/email/subscribe-demo`,
    unsubscribeUrl: `${base}/api/email/unsubscribe-demo`,
    complaintUrl: `${base}/api/email/complaint-demo`
  };
}

async function loadCampaignMailFromTemplate(db: Pool, templateId: number) {
  const [rows] = await db.query(
    `SELECT subject_template, body_html, signature_html FROM email_templates WHERE id = ? LIMIT 1`,
    [templateId]
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error("邮件模版不存在");
  const html = assembleTemplateEmailHtml(String(row.body_html ?? ""), row.signature_html);
  return { subject: String(row.subject_template ?? ""), html };
}

async function allocateCampaignCode(db: Pool): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = String(crypto.randomInt(100000, 1000000));
    const [rows] = await db.query(`SELECT id FROM email_campaigns WHERE campaign_code = ? LIMIT 1`, [code]);
    if ((rows as any[]).length === 0) return code;
  }
  throw new Error("无法生成 6 位活动编号，请重试");
}

/** 可发受众去重邮箱数（预览、活动保存、列表展示人数；与 executeCampaignSend 筛选一致） */
async function countAudience(
  db: Pool,
  groupIds: number[],
  businessLine?: string | null,
  industries?: string[] | null,
  tenantId?: number | null
): Promise<number> {
  const tid = tenantId != null ? Number(tenantId) : 0;
  return countDistinctAudienceEmails(db, {
    tenantId: tid,
    groupIds,
    industries: industries ?? [],
    businessLine: businessLine ?? null,
    sendPipelineMatch: true
  });
}

function parseCampaignTargetIndustriesJson(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseCampaignTargetGroupIds(raw: unknown): number[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 活动列表/待发展示用人数：有目标分组或行业时与群发一致按 countAudience 现算；
 * 否则若有发送记录则用去重 contact_id 数（可还原「测了 6 人 / 551 人」）；否则用库内 recipient_count。
 */
async function resolveCampaignDisplayAudience(
  db: Pool,
  row: {
    tenant_id?: unknown;
    business_line?: unknown;
    target_group_ids?: unknown;
    target_industries_json?: unknown;
    recipient_count?: unknown;
  },
  touchedDistinct: number,
  cache: Map<string, Promise<number>>
): Promise<number> {
  const tid = Number(row.tenant_id ?? 0);
  const industries = parseCampaignTargetIndustriesJson(row.target_industries_json);
  const groupIds = parseCampaignTargetGroupIds(row.target_group_ids);
  const blRaw = row.business_line != null ? String(row.business_line) : null;

  if (tid > 0 && (groupIds.length > 0 || industries.length > 0)) {
    const key = `aud:${tid}:${blRaw ?? ""}:g:${[...groupIds].sort((a, b) => a - b).join(",")}:i:${[...industries].sort().join("\u0001")}`;
    let p = cache.get(key);
    if (!p) {
      p = countAudience(db, groupIds, blRaw, industries, tid);
      cache.set(key, p);
    }
    return await p;
  }
  const stored = Math.max(0, Number(row.recipient_count ?? 0));
  if (touchedDistinct > 0) return Math.max(stored, touchedDistinct);
  return stored;
}

async function mapDistinctContactsPerCampaign(db: Pool, campaignIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!campaignIds.length) return map;
  const ph = campaignIds.map(() => "?").join(",");
  const [trows] = await db.query(
    `SELECT campaign_id, COUNT(DISTINCT contact_id) AS n
       FROM email_sends
      WHERE campaign_id IN (${ph}) AND contact_id IS NOT NULL
      GROUP BY campaign_id`,
    campaignIds
  );
  for (const t of trows as any[]) {
    map.set(Number(t.campaign_id), Number(t.n ?? 0));
  }
  return map;
}

/** 活动统计/进度轮询：按间隔拉 IMAP 退信 → 回填 campaign_id → 对账 sent→failed */
async function syncCampaignBounceImapAndReconcile(
  db: Pool,
  env: Env,
  campaignId: number,
  opts?: { statusHint?: string; forceImap?: boolean }
): Promise<void> {
  let status = String(opts?.statusHint ?? "").trim().toLowerCase();
  if (!status) {
    const [stRows] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    status = String((stRows as Array<{ status?: unknown }>)[0]?.status ?? "").trim().toLowerCase();
  }
  const pullNow = Date.now();
  const lastPull = campaignBounceImapPullAt.get(campaignId) ?? 0;
  const campaignSending = status === "sending";
  const pullInterval = campaignSending
    ? CAMPAIGN_BOUNCE_IMAP_PULL_MS_SENDING
    : status === "completed" || status === "stopped" || status === "paused"
      ? CAMPAIGN_BOUNCE_IMAP_PULL_MS_IDLE
      : CAMPAIGN_BOUNCE_IMAP_PULL_MS;
  if (opts?.forceImap || pullNow - lastPull >= pullInterval) {
    campaignBounceImapPullAt.set(campaignId, pullNow);
    try {
      await triggerEmailBounceImapIngestorNow(db, env, {
        forceRescanRecent: true,
        campaignIdHint: campaignId
      });
    } catch {
      /* IMAP 失败不阻断对账 */
    }
    try {
      await backfillImapBounceEventsForCampaign(db, campaignId);
    } catch {
      /* backfill 失败不阻断对账 */
    }
  }
  const nowRec = Date.now();
  const lastRec = campaignBounceReconcileAt.get(campaignId) ?? 0;
  const reconcileInterval = campaignSending
    ? CAMPAIGN_BOUNCE_RECONCILE_MS_SENDING
    : CAMPAIGN_BOUNCE_IMAP_PULL_MS;
  if (nowRec - lastRec >= reconcileInterval) {
    campaignBounceReconcileAt.set(campaignId, nowRec);
    const r = await reconcileCampaignBouncedSends(db, campaignId, { apply: true, limit: 5000 });
    if (r.updated > 0) {
      invalidateCampaignSendListCache(campaignId);
      invalidateCampaignPanelStatsCache(campaignId);
    }
  }
}

/** 仅 DB 回填 + sent→failed 对账（不拉 IMAP），统计页轮次切换/轮询用 */
async function reconcileCampaignBounceDbOnly(db: Pool, campaignId: number): Promise<number> {
  await backfillImapBounceEventsForCampaign(db, campaignId);
  const r = await reconcileCampaignBouncedSends(db, campaignId, { apply: true, limit: 5000 });
  if (r.updated > 0) {
    invalidateCampaignSendListCache(campaignId);
    invalidateCampaignPanelStatsCache(campaignId);
  }
  return r.updated;
}

/**
 * send-progress 专用：发送中绝不 await IMAP/backfill，避免 250ms 轮询被拖死或 DB 锁争用。
 */
async function enrichSendProgressRecentWithBounce(
  db: Pool,
  recent: Array<{
    id: number;
    email: string;
    status: string;
    createdAt: unknown;
    openCount: number;
    clickCount: number;
    bounceEventCount: number;
  }>
) {
  const ids = recent.map((r) => r.id).filter((id) => id > 0);
  if (ids.length === 0) return recent;
  const ph = ids.map(() => "?").join(", ");
  const [evRows] = await db.query(
    `SELECT s.id AS email_send_id, COUNT(*) AS c
       FROM email_sends s
       INNER JOIN email_delivery_events e
         ON e.event_type = 'bounced'
        AND ${sqlBounceEventMatchesSend("e", "s")}
      WHERE s.id IN (${ph})
      GROUP BY s.id`,
    ids
  );
  const byId = new Map<number, number>();
  for (const row of evRows as Array<{ email_send_id?: unknown; c?: unknown }>) {
    const sid = Number(row.email_send_id ?? 0);
    if (sid > 0) byId.set(sid, Number(row.c ?? 0));
  }
  return recent.map((r) => ({
    ...r,
    bounceEventCount: Math.max(r.bounceEventCount, byId.get(r.id) ?? 0)
  }));
}

async function syncCampaignBounceForSendProgress(
  db: Pool,
  env: Env,
  campaignId: number,
  statusHint: string
): Promise<void> {
  const campaignSending = statusHint === "sending";
  /** 发送中：进度轮询不做任何退信/IMAP 对账，避免与 SMTP 发送争 DB 导致超时 */
  if (campaignSending) {
    return;
  }
  await syncCampaignBounceImapAndReconcile(db, env, campaignId, { statusHint });
}

async function finalizeCampaignAfterSend(db: Pool, campaignId: number) {
  const activeRunId = campaignActiveSendRunId.get(campaignId);
  if (activeRunId && activeRunId > 0) {
    await finalizeCampaignSendRun(db, activeRunId, "completed");
  } else {
    await finalizeActiveSendRunForCampaign(db, campaignId, "completed");
  }
  clearCampaignActiveSendPlan(campaignId);
  await db.query(`UPDATE email_campaigns SET send_rounds_done = COALESCE(send_rounds_done, 0) + 1 WHERE id = ?`, [campaignId]);
  const [rows] = await db.query(
    `SELECT send_rounds_done, COALESCE(send_rounds_total, 1) AS send_rounds_total FROM email_campaigns WHERE id = ? LIMIT 1`,
    [campaignId]
  );
  const c = (rows as any[])[0];
  if (!c) return;
  const done = Number(c.send_rounds_done ?? 0);
  const total = Number(c.send_rounds_total ?? 1);
  if (done >= total) {
    await db.query(`UPDATE email_campaigns SET status='completed', next_run_at=NULL WHERE id=?`, [campaignId]);
  } else {
    await db.query(
      `UPDATE email_campaigns SET status='scheduled', next_run_at=DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE id=?`,
      [campaignId]
    );
  }
  /** 勿在单场 finalize 时 tenant 级 reconcile：多专线并行发送时易误停其它栏 */
}


/** 进度轮询发现轮次已结束但活动仍为 sending 时，自动写回 completed / 回收占用 */
async function maybeAutoCompleteCampaignFromSendProgress(
  db: Pool,
  campaignId: number,
  tenantId: number,
  progressSendRunId: number,
  runPlannedTotal: number,
  runMetrics: { attempted: number; sendingDistinct?: number },
  progressRunStillSending: boolean
): Promise<{ campaignStatus: string; runStillSending: boolean }> {
  const [stRows] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  let campaignStatus = String((stRows as Array<{ status?: unknown }>)[0]?.status ?? "")
    .trim()
    .toLowerCase();
  let runStillSending = progressRunStillSending;

  if (campaignStatus !== "sending") {
    return { campaignStatus, runStillSending };
  }

  const activeInProcess = campaignActiveSendRunId.has(campaignId);
  const plannedEff = runPlannedTotal > 0 ? runPlannedTotal : runMetrics.attempted;
  const sendingDistinctN = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
  const runDeliveryComplete = sendRunDeliveryComplete(runMetrics, plannedEff);
  const runCompleteByMetrics = runDeliveryComplete;

  /** ── 防护：检查本轮 send_run 最近写入年龄（勿用全活动 MAX 误判仍在写） ── */
  let youngestAgeSec = -1;
  if (progressSendRunId > 0) {
    try {
      const [youngRows] = await db.query(
        `SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS age_sec
           FROM email_sends
          WHERE campaign_id = ? AND send_run_id = ?`,
        [campaignId, progressSendRunId]
      );
      youngestAgeSec = Number((youngRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? -1);
    } catch {
      /* 查询失败不阻断 */
    }
  }
  const recentlyWriting =
    !runDeliveryComplete && youngestAgeSec >= 0 && youngestAgeSec <= 8;

  /** 无在途 + 无活跃进程 + 30 秒无新行：仅当尝试数已满计划才可收尾（禁止 attempted<planned 误收尾） */
  const plannedForComplete = Math.max(0, Math.floor(Number(plannedEff) || 0));
  const attemptedForComplete = Math.max(0, Math.floor(Number(runMetrics.attempted) || 0));
  const noMoreWork =
    sendingDistinctN === 0 &&
    !activeInProcess &&
    (youngestAgeSec < 0 || youngestAgeSec >= 15) &&
    (plannedForComplete <= 0 || attemptedForComplete >= plannedForComplete);

  const shouldComplete = runDeliveryComplete || noMoreWork;

  /** worker 已结束但活动仍 sending：由 poll 补写 completed（避免永远卡在 99%） */
  if (shouldComplete && (runDeliveryComplete || !activeInProcess)) {
    try {
      if (runStillSending && progressSendRunId > 0) {
        await finalizeCampaignSendRun(db, progressSendRunId, "completed");
        runStillSending = false;
      }
      const [stFix] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [
        campaignId
      ]);
      const stNow = String((stFix as Array<{ status?: unknown }>)[0]?.status ?? "")
        .trim()
        .toLowerCase();
      if (stNow === "sending") {
        await finalizeCampaignAfterSend(db, campaignId);
      }
    } catch (e) {
      console.warn("[send-progress] delivery-complete finalize", campaignId, (e as Error)?.message ?? e);
    }
    const [stRowsFix] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [
      campaignId
    ]);
    campaignStatus = String((stRowsFix as Array<{ status?: unknown }>)[0]?.status ?? "")
      .trim()
      .toLowerCase();
  }

  if (activeInProcess || recentlyWriting) {
    /** worker 映射未清但本轮已无在途：仍写 completed，避免活动/工作台长期「发送中」 */
    if (runDeliveryComplete && sendingDistinctN === 0 && campaignStatus === "sending") {
      try {
        if (runStillSending && progressSendRunId > 0) {
          await finalizeCampaignSendRun(db, progressSendRunId, "completed");
          runStillSending = false;
        }
        const [stMid] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [
          campaignId
        ]);
        const stMidNow = String((stMid as Array<{ status?: unknown }>)[0]?.status ?? "")
          .trim()
          .toLowerCase();
        if (stMidNow === "sending") {
          await finalizeCampaignAfterSend(db, campaignId);
        }
        const [stMid2] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [
          campaignId
        ]);
        campaignStatus = String((stMid2 as Array<{ status?: unknown }>)[0]?.status ?? "")
          .trim()
          .toLowerCase();
      } catch (e) {
        console.warn(
          "[send-progress] delivery-complete while worker active",
          campaignId,
          (e as Error)?.message ?? e
        );
      }
    }
    return { campaignStatus, runStillSending };
  }

  try {
    if (runCompleteByMetrics) {
      if (runStillSending && progressSendRunId > 0) {
        await finalizeCampaignSendRun(db, progressSendRunId, "completed");
        runStillSending = false;
      }
      if (!campaignActiveSendRunId.has(campaignId)) {
        await finalizeCampaignAfterSend(db, campaignId);
      }
    }
    /** 勿在 send-progress 轮询里 tenant 级 recoverStale：backend 重启后易误杀其它专线正在发送的活动 */
  } catch (e) {
    console.warn("[send-progress] auto-complete failed", campaignId, (e as Error)?.message ?? e);
  }

  const [stRows2] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  campaignStatus = String((stRows2 as Array<{ status?: unknown }>)[0]?.status ?? "")
    .trim()
    .toLowerCase();
  return { campaignStatus, runStillSending };
}

/** executeCampaignSend 抛错或进程中断前未 finalize 时，活动会卡在 sending；按发送前状态写回（仅当仍为 sending） */
async function restoreCampaignStatusIfSending(db: Pool, campaignId: number, previousStatusRaw: string) {
  const allowed = new Set(["draft", "scheduled", "completed", "paused", "stopped"]);
  const raw = String(previousStatusRaw ?? "").trim();
  const lower = raw.toLowerCase();
  const statusToSet = raw && allowed.has(lower) ? raw : "paused";
  await db.query(
    `UPDATE email_campaigns SET status = ?, next_run_at = NULL WHERE id = ? AND LOWER(COALESCE(status, '')) = 'sending'`,
    [statusToSet, campaignId]
  );
  clearCampaignActiveSendPlan(campaignId);
}

type CampaignRuntimeControl = "continue" | "pause" | "stop";
const campaignRuntimeControlOverrides = new Map<number, CampaignRuntimeControl>();

async function resolveCampaignRuntimeControl(db: Pool, campaignId: number): Promise<CampaignRuntimeControl> {
  const overridden = campaignRuntimeControlOverrides.get(campaignId);
  if (overridden && overridden !== "continue") return overridden;
  const [rows] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  const status = String((rows as Array<{ status?: unknown }>)[0]?.status ?? "").trim().toLowerCase();
  if (status === "paused") return "pause";
  if (status === "stopped") return "stop";
  return "continue";
}

async function waitWithCampaignControl(db: Pool, campaignId: number, totalMs: number): Promise<CampaignRuntimeControl> {
  const ms = Math.max(0, Math.floor(Number(totalMs) || 0));
  if (ms <= 0) return "continue";
  const started = Date.now();
  // 轮询状态以便暂停/停止能在等待阶段即时生效，而不是等完整间隔结束
  while (Date.now() - started < ms) {
    const ctrl = await resolveCampaignRuntimeControl(db, campaignId);
    if (ctrl !== "continue") return ctrl;
    const remain = ms - (Date.now() - started);
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(25, remain))));
  }
  return "continue";
}

async function tryMarkCampaignSending(db: Pool, campaignId: number, allowedFrom: string[]): Promise<boolean> {
  const from = Array.from(new Set(allowedFrom.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean)));
  if (from.length === 0) return false;
  const ph = from.map(() => "?").join(",");
  const ret = await db.query(
    `UPDATE email_campaigns
        SET status='sending', next_run_at=NULL
      WHERE id = ? AND LOWER(COALESCE(status, '')) IN (${ph})`,
    [campaignId, ...from]
  );
  return Number((ret as any)?.[0]?.affectedRows ?? 0) > 0;
}

async function ensureEmailSendsFromEmailColumn(db: Pool) {
  try {
    await db.query(`ALTER TABLE email_sends ADD COLUMN from_email VARCHAR(320) NULL`);
  } catch {
    // Column may already exist (older MySQL / duplicate).
  }
}

/**
 * SES BYOD 通道相关列：与迁移 046 同义，但代码侧也保证存在，
 * 让"先发码再跑迁移"的部署顺序也能 work（生产 server-build 会先 migrate，
 * 测试/dev 也可能跳过迁移直接起 backend）。
 */
async function ensureEmailSendsProviderColumns(db: Pool) {
  try {
    await db.query(`ALTER TABLE email_sends ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'smtp'`);
  } catch {
    // 列已存在
  }
  try {
    await db.query(`ALTER TABLE email_sends ADD COLUMN send_uuid VARCHAR(40) NULL`);
  } catch {
    // 列已存在
  }
  try {
    await db.query(`ALTER TABLE email_sends ADD COLUMN ses_sender_address_id BIGINT NULL`);
  } catch {
    // 列已存在
  }
  try {
    await db.query(`CREATE UNIQUE INDEX idx_email_sends_send_uuid ON email_sends (send_uuid)`);
  } catch {
    // 索引已存在 / NULL 重复约束差异
  }
  try {
    await db.query(`CREATE INDEX idx_email_sends_ses_sender_address_id ON email_sends (ses_sender_address_id)`);
  } catch {
    // 索引已存在
  }
  try {
    await db.query(
      `CREATE INDEX idx_email_sends_from_email_campaign ON email_sends (from_email(191), campaign_id)`
    );
  } catch {
    // 索引已存在
  }
  try {
    await db.query(`ALTER TABLE email_delivery_events ADD COLUMN send_uuid VARCHAR(40) NULL`);
  } catch {
    // 列已存在
  }
  try {
    await db.query(`CREATE INDEX idx_delivery_send_uuid ON email_delivery_events (send_uuid)`);
  } catch {
    // 索引已存在
  }
}

async function ensureEmailDeliveryEventsSendIdColumn(db: Pool) {
  try {
    await db.query(`ALTER TABLE email_delivery_events ADD COLUMN email_send_id BIGINT NULL`);
  } catch {
    // 列已存在
  }
  try {
    await db.query(`CREATE INDEX idx_delivery_email_send_id ON email_delivery_events (email_send_id)`);
  } catch {
    // 索引已存在
  }
}

async function ensureEmailCampaignRuntimeColumns(db: Pool) {
  try {
    await db.query(
      `ALTER TABLE email_campaigns
       ADD COLUMN IF NOT EXISTS smtp_profile_id BIGINT NULL,
       ADD COLUMN IF NOT EXISTS sender_profile_id BIGINT NULL,
       ADD COLUMN IF NOT EXISTS target_industries_json JSON NULL`
    );
  } catch {
    // Older MySQL may not support IF NOT EXISTS in ADD COLUMN.
    // Best effort compatibility fallback:
    try {
      await db.query(`ALTER TABLE email_campaigns ADD COLUMN smtp_profile_id BIGINT NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE email_campaigns ADD COLUMN sender_profile_id BIGINT NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE email_campaigns ADD COLUMN target_industries_json JSON NULL`);
    } catch {}
  }
  try {
    await db.query(`ALTER TABLE sender_profiles ADD COLUMN IF NOT EXISTS reply_to VARCHAR(255) NULL`);
  } catch {
    try {
      await db.query(`ALTER TABLE sender_profiles ADD COLUMN reply_to VARCHAR(255) NULL`);
    } catch {}
  }
  try {
    await db.query(
      `ALTER TABLE smtp_profiles
       ADD COLUMN IF NOT EXISTS imap_enabled TINYINT(1) NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS imap_port INT NULL,
       ADD COLUMN IF NOT EXISTS imap_secure TINYINT(1) NOT NULL DEFAULT 1,
       ADD COLUMN IF NOT EXISTS imap_username VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS imap_password_enc TEXT NULL,
       ADD COLUMN IF NOT EXISTS imap_mailbox VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS reply_to VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS dedicated_server_id BIGINT NULL`
    );
  } catch {
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_enabled TINYINT(1) NOT NULL DEFAULT 0`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_host VARCHAR(255) NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_port INT NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_secure TINYINT(1) NOT NULL DEFAULT 1`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_username VARCHAR(255) NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_password_enc TEXT NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN imap_mailbox VARCHAR(255) NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN display_name VARCHAR(255) NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN reply_to VARCHAR(255) NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE smtp_profiles ADD COLUMN dedicated_server_id BIGINT NULL`);
    } catch {}
  }
}

async function pickCampaignSmtp(db: Pool, campaign: any) {
  const tenantId = Number(campaign?.tenant_id ?? 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
  if (campaign?.smtp_profile_id) {
    const [rows] = await db.query(
      `SELECT * FROM smtp_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [campaign.smtp_profile_id, tenantId]
    );
    const row = (rows as any[])[0];
    if (row) return row;
  }
  const [rows] = await db.query(`SELECT * FROM smtp_profiles WHERE tenant_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1`, [
    tenantId
  ]);
  const profile = (rows as any[])[0] ?? null;
  if (profile) return profile;
  // dnrpj.cn 定制：无 SMTP 配置时回退到发信机（用最新的一台）
  try {
    const [dsRows] = await db.query(
      `SELECT id, relay_ip, sender_domain, from_email FROM email_dedicated_servers WHERE tenant_id = ? AND status NOT IN ('cancelled','deleted') ORDER BY id DESC LIMIT 1`,
      [tenantId]
    );
    const dsRow = (dsRows as any[])[0];
    if (!dsRow?.id) return null;
    const dsHost = String(dsRow?.relay_ip ?? "").trim() || process.env.DAILY_MAILBOX_SMTP_HOST || "";
    let dsPass = "";
    try {
      const resolved = await resolveDedicatedSmtpPlainPassword(db, Number(dsRow.id), { allowAutoGenerate: false });
      dsPass = resolved.password;
    } catch { /* ignore */ }
    dsPass = dsPass || process.env.DAILY_MAILBOX_PASSWORD || "";
    const dsFrom = String(dsRow?.from_email ?? "").trim() || (dsRow?.sender_domain ? `marketing@${dsRow.sender_domain}` : "marketing@dnrpj.cn");
    if (dsHost && dsPass) {
      return {
        id: 0,
        tenant_id: tenantId,
        from_email: dsFrom,
        host: dsHost,
        port: 587,
        secure: 0,
        username: dsFrom,
        password_enc: null,
        _dedicatedFallback: true,
        _dedicatedPass: dsPass
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 当活动指定了 ses_sender_address_id 时，加载并校验该 SES 发件邮箱：
 *   - 必须属于本活动租户
 *   - 关联域名必须 status='verified'，否则发不出去；这里直接拒绝走 SES 路径，
 *     调用方决定是否回退到 SMTP（目前我们选择直接报错而不是悄悄降级，
 *     避免用户以为"用 SES 发"实际却走老 SMTP 黑邮箱）
 * 返回 null 表示活动没有配 SES sender（应走 SMTP 老通道）。
 */
async function pickCampaignSesSender(
  db: Pool,
  campaign: { tenant_id?: number | string | null; ses_sender_address_id?: number | string | null }
): Promise<{
  id: number;
  tenantId: number;
  fromEmail: string;
  displayName: string | null;
  replyTo: string | null;
  domain: string;
  domainId: number;
} | null> {
  const sesId = Number(campaign?.ses_sender_address_id ?? 0);
  if (!Number.isFinite(sesId) || sesId <= 0) return null;
  const tenantId = Number(campaign?.tenant_id ?? 0);
  const [rows] = await db.query(
    `SELECT a.id, a.tenant_id, a.from_email, a.display_name, a.reply_to,
            d.id AS domain_id, d.domain, d.status AS domain_status
       FROM email_sender_addresses a
       JOIN email_sender_domains d ON d.id = a.domain_id
      WHERE a.id = ? AND a.tenant_id = ?
      LIMIT 1`,
    [sesId, tenantId]
  );
  const r = (rows as any[])[0];
  if (!r) {
    throw new Error("SES 发件邮箱不存在或不属于当前租户，无法发送。");
  }
  if (String(r.domain_status) !== "verified") {
    throw new Error(
      `SES 发件域名 ${r.domain} 当前状态为 ${r.domain_status}，请先在「设置 → 邮件 → 发件域名」完成 DKIM 验证。`
    );
  }
  return {
    id: Number(r.id),
    tenantId: Number(r.tenant_id),
    fromEmail: String(r.from_email),
    displayName: r.display_name ?? null,
    replyTo: r.reply_to ?? null,
    domain: String(r.domain),
    domainId: Number(r.domain_id)
  };
}

async function pickCampaignSender(db: Pool, campaign: any) {
  const tenantId = Number(campaign?.tenant_id ?? 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
  if (campaign?.sender_profile_id) {
    const [rows] = await db.query(
      `SELECT * FROM sender_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [campaign.sender_profile_id, tenantId]
    );
    const row = (rows as any[])[0];
    if (row) return row;
  }
  /** 活动已绑定具体 SES / SMTP 邮箱且库中 sender_profile_id 为空时，不再自动叠加租户默认资料（与模版测试发信一致；显示名/回信以邮箱配置为准） */
  const hasExplicitMailbox =
    Number(campaign?.ses_sender_address_id ?? 0) > 0 || Number(campaign?.smtp_profile_id ?? 0) > 0;
  if (hasExplicitMailbox) return null;

  const [rows] = await db.query(
    `SELECT * FROM sender_profiles WHERE tenant_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1`,
    [tenantId]
  );
  return (rows as any[])[0] ?? null;
}

/**
 * 测试发信：可选指定发件人资料 id。
 * - 未指定 id 且 useTenantDefaultWhenUnspecified（默认 true）：回退到租户默认「通用发件人资料」。
 * - 未指定 id 且 useTenantDefaultWhenUnspecified === false：不合并资料（用于用户已在 UI 明确选了 SES/SMTP 邮箱时，仅以该邮箱上的显示名/回信为准）。
 */
async function pickSenderProfileByOptionalId(
  db: Pool,
  tenantId: number,
  senderProfileId?: number | null,
  options?: { useTenantDefaultWhenUnspecified?: boolean }
) {
  const useTenantDefault = options?.useTenantDefaultWhenUnspecified !== false;

  if (senderProfileId != null && senderProfileId > 0) {
    const [rows] = await db.query(`SELECT * FROM sender_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`, [
      senderProfileId,
      tenantId
    ]);
    const row = (rows as any[])[0];
    if (row) return row;
  }

  if (!useTenantDefault) return null;

  const [rows] = await db.query(
    `SELECT * FROM sender_profiles WHERE tenant_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1`,
    [tenantId]
  );
  return (rows as any[])[0] ?? null;
}

/**
 * 设置页「测试发送」：优先走 SES 时，选取租户下域名已 verified 的发件邮箱；优先 is_default。
 */
async function pickDefaultSesSenderAddressForTest(
  db: Pool,
  tenantId: number
): Promise<{ id: number; fromEmail: string; displayName: string | null; replyTo: string | null } | null> {
  const [rows] = await db.query(
    `SELECT a.id, a.from_email, a.display_name, a.reply_to
       FROM email_sender_addresses a
       JOIN email_sender_domains d ON d.id = a.domain_id
      WHERE a.tenant_id = ?
        AND d.status = 'verified'
      ORDER BY a.is_default DESC, a.id DESC
      LIMIT 1`,
    [tenantId]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    fromEmail: String(r.from_email),
    displayName: r.display_name ?? null,
    replyTo: r.reply_to ?? null
  };
}

/** 模版测试：按 id 选取 SES 发件邮箱（须域名 verified）。 */
async function pickSesSenderAddressByIdForTest(
  db: Pool,
  tenantId: number,
  addressId: number
): Promise<{ id: number; fromEmail: string; displayName: string | null; replyTo: string | null } | null> {
  const [rows] = await db.query(
    `SELECT a.id, a.from_email, a.display_name, a.reply_to
       FROM email_sender_addresses a
       JOIN email_sender_domains d ON d.id = a.domain_id
      WHERE a.id = ? AND a.tenant_id = ?
        AND d.status = 'verified'
      LIMIT 1`,
    [addressId, tenantId]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    fromEmail: String(r.from_email),
    displayName: r.display_name ?? null,
    replyTo: r.reply_to ?? null
  };
}

/** 测试发信：可选指定 SMTP 配置 id，否则用默认 SMTP */
async function pickSmtpProfileByOptionalId(db: Pool, tenantId: number, smtpProfileId?: number | null) {
  if (smtpProfileId != null && smtpProfileId > 0) {
    const [rows] = await db.query(`SELECT * FROM smtp_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`, [
      smtpProfileId,
      tenantId
    ]);
    const row = (rows as any[])[0];
    if (row) return row;
  }
  const [rows] = await db.query(`SELECT * FROM smtp_profiles WHERE tenant_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1`, [
    tenantId
  ]);
  return (rows as any[])[0] ?? null;
}

async function pickAndTouchOutboundChannel(db: Pool, tenantId: number): Promise<OutboundIpPoolRow | null> {
  const [rows] = await db.query(
    `SELECT *
       FROM email_outbound_ip_pools
      WHERE tenant_id = ? AND is_enabled = 1
      ORDER BY (last_used_at IS NULL) DESC, last_used_at ASC, id ASC
      LIMIT 1`,
    [tenantId]
  );
  const row = (rows as any[])[0] as OutboundIpPoolRow | undefined;
  if (!row) return null;
  await db.query(`UPDATE email_outbound_ip_pools SET last_used_at = NOW() WHERE id = ?`, [row.id]);
  return row;
}

function buildHttpProxyUrl(ch: OutboundIpPoolRow): string {
  const auth =
    ch.username && ch.password_enc ? `${encodeURIComponent(ch.username)}:${encodeURIComponent(decryptSecret(ch.password_enc))}@` : "";
  return `http://${auth}${ch.host}:${ch.port}`;
}

const CAMPAIGN_SMTP_TRANSPORT_TIMEOUTS = {
  /** 避免专线群发在 sendMail 上无限挂起，实时监控长期停在「发送中」 */
  connectionTimeout: 20_000,
  socketTimeout: 45_000,
  greetingTimeout: 30_000
} as const;

async function createTransporterForSmtpWithChannel(smtp: any, channel: OutboundIpPoolRow | null) {
  // dnrpj.cn 定制：专线回退时直接用明文密码
  const pass = smtp._dedicatedFallback ? smtp._dedicatedPass : decryptSecret(smtp.password_enc);
  const baseOpts = nodemailerTransportFromSmtpRow(
    smtp,
    { user: resolveSmtpAuthUser(smtp), pass },
    CAMPAIGN_SMTP_TRANSPORT_TIMEOUTS
  );

  // direct / no channel: regular transport
  if (!channel || channel.type === "direct") {
    return nodemailer.createTransport(baseOpts);
  }

  // HTTP proxy: Nodemailer supports 'proxy' (HTTP CONNECT)
  if (channel.type === "http") {
    return nodemailer.createTransport({
      ...baseOpts,
      proxy: buildHttpProxyUrl(channel)
    } as any);
  }

  // SOCKS5 proxy: use socks to create socket per message
  if (channel.type === "socks5") {
    const proxyUser = channel.username ?? undefined;
    const proxyPass = channel.password_enc ? decryptSecret(channel.password_enc) : undefined;
    return nodemailer.createTransport({
      ...baseOpts,
      getSocket: async (options: any, callback: any) => {
        try {
          const destHost = String(options?.host ?? smtp.host);
          const destPort = Number(options?.port ?? smtp.port);
          const conn = await SocksClient.createConnection({
            proxy: {
              host: channel.host,
              port: Number(channel.port),
              type: 5,
              userId: proxyUser,
              password: proxyPass
            },
            command: "connect",
            destination: { host: destHost, port: destPort },
            timeout: 25_000
          } as any);
          callback(null, { socket: conn.socket });
        } catch (e: any) {
          callback(e);
        }
      }
    } as any);
  }

  return nodemailer.createTransport(baseOpts);
}

/** 活动统计与去重发送统一用规范化邮箱 */
function normalizeCampaignEmail(email: unknown): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

const CAMPAIGN_EMAIL_FORMAT_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,63})?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** CRM 联系人邮箱状态：无效/高风险则当场记 failed */
function precheckCampaignContactEmailStatus(emailStatus: unknown): string | null {
  const s = String(emailStatus ?? "")
    .trim()
    .toLowerCase();
  if (s === "invalid") return "CRM 标记为无效邮箱";
  if (s === "risky") return "CRM 标记为高风险邮箱";
  return null;
}

/** 明显无效收件人：当场记 failed，不等异步退信（格式错误 / 无 TLD / 连续点等） */
function precheckCampaignRecipientEmail(email: unknown): string | null {
  const em = normalizeCampaignEmail(email);
  if (!em) return "收件人邮箱为空";
  if (em.length > 254) return "收件人邮箱过长";
  if (!CAMPAIGN_EMAIL_FORMAT_RE.test(em)) return "收件人邮箱格式无效";
  const [local, domain] = em.split("@");
  if (!local || !domain || local.includes("..") || domain.includes("..")) {
    return "收件人邮箱格式无效（含连续点）";
  }
  if (local.startsWith(".") || local.endsWith(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "收件人邮箱格式无效";
  }
  const tld = domain.split(".").pop() ?? "";
  if (tld.length < 2) return "收件人邮箱域名无效";
  return null;
}

/** 收件域无 MX → 当场 failed（与注册邮箱 MX 校验一致；同域只查一次 DNS） */
async function precheckCampaignRecipientMx(
  domain: string,
  cache: Map<string, boolean>
): Promise<string | null> {
  const d = String(domain ?? "")
    .trim()
    .toLowerCase();
  if (!d) return "收件人邮箱域名无效";
  let hasMx = cache.get(d);
  if (hasMx === undefined) {
    hasMx = await mxExists(d);
    cache.set(d, hasMx);
  }
  if (!hasMx) return "收件人域名无 MX 记录，无法投递";
  return null;
}

/** 同一活动只向每个邮箱发一封（CRM 重复联系人只保留 id 最小的一条） */
function dedupeContactsByEmail<T extends { id?: unknown; email?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const em = normalizeCampaignEmail(row.email);
    if (!em || seen.has(em)) continue;
    seen.add(em);
    out.push(row);
  }
  return out;
}

/** 与 executeCampaignSend 待发队列一致的可发人数（去重邮箱；新轮次不过滤本活动历史已发） */
async function countCampaignSendableContacts(
  db: Pool,
  campaignId: number,
  campaign: {
    tenant_id?: unknown;
    business_line?: unknown;
    target_group_ids?: unknown;
    target_industries_json?: unknown;
  },
  opts: { industries?: string[]; groupIds?: number[]; limit?: number; forNewSendRun?: boolean }
): Promise<number> {
  const tenantId = Number(campaign.tenant_id ?? 0);
  const batchLimit = Math.max(1, Math.min(opts.limit ?? 100_000, 200_000));

  let groupIds = parseCampaignTargetGroupIds(campaign.target_group_ids);
  let industries = parseCampaignTargetIndustriesJson(campaign.target_industries_json);
  const overrideIndustries = (opts.industries ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (overrideIndustries.length > 0) industries = overrideIndustries;
  const overrideGroupIds = (opts.groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (overrideGroupIds.length > 0) groupIds = overrideGroupIds;

  const forNewSendRun = opts.forNewSendRun === true;
  return countDistinctAudienceEmails(
    db,
    {
      tenantId,
      groupIds,
      industries,
      businessLine: campaign.business_line != null ? String(campaign.business_line) : null,
      sendPipelineMatch: true
    },
  forNewSendRun ? { cap: batchLimit } : { campaignIdForResume: campaignId, cap: batchLimit }
  );
}

async function calibrateCampaignRecipientCountBeforeSend(
  db: Pool,
  campaignId: number,
  opts: { industries?: string[]; groupIds?: number[]; limit?: number }
): Promise<number> {
  const [campRows] = await db.query(
    `SELECT tenant_id, business_line, target_group_ids, target_industries_json FROM email_campaigns WHERE id = ? LIMIT 1`,
    [campaignId]
  );
  const campaign = (campRows as any[])[0];
  if (!campaign) return 0;

  const [attemptRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(to_email))) AS n FROM email_sends WHERE campaign_id = ?`,
    [campaignId]
  );
  const existingAttempts = Math.max(0, Number((attemptRows as Array<{ n?: unknown }>)[0]?.n ?? 0));
  const remaining = await countCampaignSendableContacts(db, campaignId, campaign, {
    ...opts,
    forNewSendRun: true
  });
  const plannedTotal = existingAttempts + remaining;

  if (remaining > 0) {
    campaignSendRunBaseline.set(campaignId, existingAttempts);
    campaignSendRunDisplayPlanned.set(campaignId, remaining);
    campaignActiveSendPlanned.set(campaignId, plannedTotal);
  }

  const overrideIndustries = (opts.industries ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  let recipientForDb = plannedTotal;
  if (overrideIndustries.length > 0) {
    const tenantId = Number(campaign.tenant_id ?? 0);
    const groupIds = parseCampaignTargetGroupIds(campaign.target_group_ids);
    const overrideGroupIds = (opts.groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const effectiveGroupIds = overrideGroupIds.length > 0 ? overrideGroupIds : groupIds;
    recipientForDb = await countDistinctAudienceEmails(db, {
      tenantId,
      groupIds: effectiveGroupIds,
      industries: overrideIndustries,
      businessLine: campaign.business_line != null ? String(campaign.business_line) : null,
      sendPipelineMatch: true
    });
  }
  await db.query(`UPDATE email_campaigns SET recipient_count = ? WHERE id = ?`, [recipientForDb, campaignId]);
  return remaining;
}

function sqlCampaignSendResumeNotExists(contactRef: string, emailRef: string): string {
  return ` AND NOT EXISTS (
    SELECT 1 FROM email_sends sx
    WHERE sx.campaign_id = ?
      AND (
        sx.contact_id = ${contactRef}
        OR LOWER(TRIM(sx.to_email)) = LOWER(TRIM(${emailRef}))
      )
  )`;
}

/** 仅跳过本发送轮次已尝试的联系人（新轮次可再次向同一活动受众发送） */
function sqlCampaignSendResumeNotExistsForRun(contactRef: string, emailRef: string): string {
  return ` AND NOT EXISTS (
    SELECT 1 FROM email_sends sx
    WHERE sx.campaign_id = ?
      AND sx.send_run_id = ?
      AND (
        sx.contact_id = ${contactRef}
        OR LOWER(TRIM(sx.to_email)) = LOWER(TRIM(${emailRef}))
      )
  )`;
}

export async function executeCampaignSend(
  db: Pool,
  id: number,
  opts: {
    limit?: number;
    unsubscribeBaseUrl?: string;
    minIntervalMs?: number;
    industries?: string[];
    /** 若传入非空，则覆盖活动表内 target_group_ids，用于发送页即时选择分组 */
    groupIds?: number[];
    resumeFromPause?: boolean;
    /** 本次正式发送轮次；有值时仅在本轮内断点续发并写入 send_run_id */
    sendRunId?: number;
    /** 自动化分批发送：跳过本租户过往已经尝试过的邮箱，避免下一批从行业开头重发 */
    excludePriorTenantSends?: boolean;
    /** 自动化分批发送：仅跳过同一自动化任务前序批次已尝试过的活动，避免误排除历史活动 */
    excludePriorCampaignIds?: number[];
  }
) {
  let batchLimit = opts.limit ?? 100_000;

  const [campRows] = await db.query(`SELECT * FROM email_campaigns WHERE id = ? LIMIT 1`, [id]);
  const campaign = (campRows as any[])[0];
  if (!campaign) throw new Error("活动不存在");

  const preSendCtrl = await resolveCampaignRuntimeControl(db, id);
  if (preSendCtrl !== "continue") {
    return {
      sent: 0,
      failed: 0,
      attempted: 0,
      planned: 0,
      minIntervalMs:
        opts.minIntervalMs != null && Number.isFinite(Number(opts.minIntervalMs))
          ? Math.max(0, Math.floor(Number(opts.minIntervalMs)))
          : 0,
      aborted: preSendCtrl
    };
  }

  const activeSendRunIdEarly =
    opts.sendRunId != null && Number.isFinite(Number(opts.sendRunId)) && Number(opts.sendRunId) > 0
      ? Math.floor(Number(opts.sendRunId))
      : 0;
  /** 正式 send_run：POST /send 已占住 sending，此处立刻标记进程内活跃，避免僵尸回收误杀首封前的准备阶段 */
  if (activeSendRunIdEarly > 0) {
    campaignActiveSendRunId.set(id, activeSendRunIdEarly);
    campaignSendAsyncError.delete(id);
    setCampaignSendPrep(id, "gates", "校验套餐、额度与发信通道");
  }

  const tenantId = Number(campaign.tenant_id ?? 0);
  if (tenantId > 0) {
    const [emailRows] = await db.query(
      `SELECT status, period_end
         FROM tenant_product_modules
        WHERE tenant_id = ? AND module = 'email'
        LIMIT 1`,
      [tenantId]
    );
    const emailModule = (emailRows as Array<{ status: string; period_end: Date | string | null }>)[0] ?? null;
    if (!isSubscriptionPeriodActive(emailModule)) {
      throw new Error("邮件套餐未开通或已到期，当前不可发送。请先在个人中心完成订阅续费。");
    }

    /** 专线 formal：POST 已做 lane 闸时跳过 checkSendAllowed 重复查询；日发上限始终校验 */
    if (activeSendRunIdEarly <= 0) {
      const allowed = await checkSendAllowed(db, tenantId, batchLimit);
      if (!allowed.ok) {
        throw new Error(allowed.reason);
      }

      const laneGateEarly = await checkDedicatedLaneSendAllowed(db, tenantId, {
        campaignId: id,
        plannedCount: batchLimit,
        allowOngoingCampaignId: id
      });
      if (!laneGateEarly.ok) {
        throw new Error(laneGateEarly.reason);
      }
    }

    const dailyCap = await getTenantEmailDailySendLimit(db, tenantId);
    if (dailyCap != null) {
      const used = await countTenantEmailSentToday(db, tenantId);
      const remaining = dailyCap - used;
      if (remaining <= 0) {
        if (dailyCap === 0) {
          throw new Error(
            "当前每日发送额度为 0：凡尘记名试炼已结束，或成长计划已限制发送。请前往「个人中心 → 邮件与营销」敕封仙阶套餐后再试。"
          );
        }
        throw new Error(
          `今日送达成功已达套餐上限（${dailyCap} 封/日，与营销活动统计「送达成功」同口径，不含发送失败与退信）。请明日再试或联系客服升级套餐。`
        );
      }
      /**
       * 日发上限是“成功送达”的停止线，不是本轮受众 SQL 的计划人数。
       * 不在这里裁剪 batchLimit，避免选择 9325 人时界面显示计划发送 2952/3000。
       */
    }
  }

  /**
   * 通道决策：
   *   - 活动绑定 ses_sender_address_id 时走 SES（多租户 SaaS 默认/未来主路径）；
   *   - 否则走老 SMTP（兼容存量活动 + 高级用户自带 SMTP）。
   *
   * 提前决策的好处：内层 for-loop 不必每封都 if/else 走两条 codepath，
   * 也避免一封 SES 一封 SMTP 把"任务详情"分析数据搅乱。
   */
  const sesSender = await pickCampaignSesSender(db, campaign);
  const channelMode: "ses" | "smtp" = sesSender ? "ses" : "smtp";

  const smtp = channelMode === "smtp" ? await pickCampaignSmtp(db, campaign) : null;
  if (channelMode === "smtp" && !smtp) throw new Error("未配置默认 SMTP");

  type LaneSendCtx = { lineSentCap: number; sentTodayBaseline: number };
  let laneSendCtx: LaneSendCtx | null = null;
  const cachedLaneCtx = campaignLaneSendCtxCache.get(id);
  /** 专线 formal：POST 已闸过 lane；发送中不再按「专线尝试总数」截断，仅套餐送达成功日上限可停发 */
  if (activeSendRunIdEarly > 0 && cachedLaneCtx && channelMode === "smtp") {
    laneSendCtx = {
      lineSentCap: cachedLaneCtx.lineSentCap,
      sentTodayBaseline: cachedLaneCtx.sentTodayBaseline
    };
  } else if (tenantId > 0 && channelMode === "smtp") {
    const laneGate = await checkDedicatedLaneSendAllowed(db, tenantId, {
      campaignId: id,
      smtpProfileId: Number(campaign.smtp_profile_id ?? smtp!.id),
      plannedCount: batchLimit,
      allowOngoingCampaignId: id
    });
    if (!laneGate.ok) {
      throw new Error(laneGate.reason);
    }
    if (laneGate.ok && laneGate.vpsGroupId != null && laneGate.laneRemaining != null) {
      laneSendCtx = {
        lineSentCap: laneGate.lineSentCap ?? laneGate.laneRemaining + (laneGate.sentToday ?? 0),
        sentTodayBaseline: laneGate.sentToday ?? 0
      };
    }
  }

  const sender = await pickCampaignSender(db, campaign);

  /**
   * 显示名/回信地址优先级（SES 与 SMTP 现在都先看自身，再回退到独立 sender_profile）：
   *   - SES 路径：sender 资料 > SES 邮箱自带 display_name > 不写显示名
   *   - SMTP 路径：sender 资料 > SMTP 邮箱自带 display_name > 不写显示名
   * 注：sender 资料目前在前端已不再让用户新建（被 SMTP/SES 邮箱自带字段替代），
   *     仅作为存量数据的"高级覆盖"通道继续生效。
   */
  const fromEmailForLog =
    channelMode === "ses"
      ? sesSender!.fromEmail
      : String(smtp!.from_email ?? "").trim();
  const fromAddressDisplay =
    channelMode === "ses"
      ? (sender?.display_name ?? sesSender!.displayName ?? null)
      : (sender?.display_name ?? (smtp!.display_name?.toString().trim() || null));
  const fromAddress = fromAddressDisplay
    ? `${fromAddressDisplay} <${fromEmailForLog}>`
    : fromEmailForLog;
  const replyTo =
    channelMode === "ses"
      ? (sender?.reply_to ?? sesSender!.replyTo ?? "").toString().trim()
      : (sender?.reply_to ?? smtp!.reply_to ?? "").toString().trim();

  const rawGids = campaign.target_group_ids;
  const rawIndustries = campaign.target_industries_json;
  let groupIds: number[] = [];
  let industries: string[] = [];
  if (rawGids != null) {
    if (typeof rawGids === "string") {
      try {
        groupIds = JSON.parse(rawGids);
      } catch {
        groupIds = [];
      }
    } else if (Array.isArray(rawGids)) {
      groupIds = rawGids.map((x: any) => Number(x)).filter((n) => n > 0);
    }
  }
  if (rawIndustries != null) {
    if (typeof rawIndustries === "string") {
      try {
        industries = JSON.parse(rawIndustries);
      } catch {
        industries = [];
      }
    } else if (Array.isArray(rawIndustries)) {
      industries = rawIndustries.map((x: any) => String(x ?? "").trim()).filter(Boolean);
    }
  }

  const overrideIndustries = (opts.industries ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (overrideIndustries.length > 0) {
    industries = overrideIndustries;
  }

  const overrideGroupIds = (opts.groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (overrideGroupIds.length > 0) {
    groupIds = overrideGroupIds;
  }

  /** 有分组时只向分组内发送；行业条件为额外筛选（与分组取交集）。无分组时仍为租户内按行业匹配。 */
  const effectiveGroupIds = groupIds;

  const blWhere: string[] = [`c.status = 'active'`, `(c.email IS NOT NULL AND TRIM(c.email) <> '')`];
  const blParams: any[] = [];
  if (tenantId > 0) {
    blWhere.push(`c.tenant_id = ?`);
    blParams.push(tenantId);
  }
  // 以“按行业群发”为准时，不再叠加历史业务线过滤，避免预估 24 实发 18 这类口径不一致
  if (industries.length === 0 && campaign.business_line && campaign.business_line !== "all") {
    blWhere.push(`(c.business_line = ? OR c.business_line IS NULL)`);
    blParams.push(campaign.business_line);
  }
  if (industries.length > 0) {
    const trimmedIndustries = industries.map((x: string) => String(x ?? "").trim()).filter(Boolean);
    const industryPlaceholders = trimmedIndustries.map(() => "?").join(",");
    blWhere.push(`TRIM(c.industry) IN (${industryPlaceholders})`);
    blParams.push(...trimmedIndustries);
  }

  const activeSendRunId =
    opts.sendRunId != null && Number.isFinite(Number(opts.sendRunId)) && Number(opts.sendRunId) > 0
      ? Math.floor(Number(opts.sendRunId))
      : 0;
  /** 专线小批次：跳过 SQL 退订/投诉 NOT EXISTS（循环内仍会 isSuppressed），缩短首封前受众查询 */
  const laneFormalFastAudience =
    activeSendRunId > 0 &&
    industries.length > 0 &&
    batchLimit <= 500 &&
    effectiveGroupIds.length === 0;
  if (!laneFormalFastAudience) {
    appendTenantMarketingOptOutFilters(blWhere, blParams, "c", tenantId);
  }
  const runPlannedFromCalibrate =
    activeSendRunId > 0 ? Math.max(0, Math.floor(Number(campaignSendRunDisplayPlanned.get(id) ?? 0))) : 0;
  let useCampaignWideResumeForNewRun = false;
  if (activeSendRunId > 0 && runPlannedFromCalibrate > 0) {
    /** 新轮次须允许再次向同一受众发送；仅在本轮 send_run 内断点续发时跳过已发 */
    useCampaignWideResumeForNewRun = false;
  }
  // 既然产品仅保留「暂停→继续」，默认按断点续发；有 sendRunId 时仅跳过本轮已发联系人
  const resumeFromPause = opts.resumeFromPause !== false;
  const resumeClause = !resumeFromPause
    ? ""
    : activeSendRunId > 0 && !useCampaignWideResumeForNewRun
      ? sqlCampaignSendResumeNotExistsForRun("c.id", "c.email")
      : sqlCampaignSendResumeNotExists("c.id", "c.email");
  const resumeParams = !resumeFromPause
    ? []
    : activeSendRunId > 0 && !useCampaignWideResumeForNewRun
      ? [id, activeSendRunId]
      : [id];
  const priorCampaignIds = Array.from(
    new Set(
      (opts.excludePriorCampaignIds ?? [])
        .map((x) => Math.floor(Number(x) || 0))
        .filter((x) => x > 0)
    )
  ).slice(0, 200);
  const priorCampaignSendClause =
    priorCampaignIds.length > 0
      ? ` AND NOT EXISTS (
          SELECT 1
            FROM email_sends ps
           WHERE ps.campaign_id IN (${priorCampaignIds.map(() => "?").join(",")})
             AND (
               ps.contact_id = c.id
               OR LOWER(TRIM(ps.to_email)) = LOWER(TRIM(c.email))
             )
        )`
      : "";
  const priorTenantSendClause =
    priorCampaignIds.length === 0 && opts.excludePriorTenantSends && tenantId > 0
      ? ` AND NOT EXISTS (
          SELECT 1
            FROM email_sends ps
            INNER JOIN email_campaigns pc ON pc.id = ps.campaign_id
           WHERE pc.tenant_id = ?
             AND ps.campaign_id <> ?
             AND (
               ps.contact_id = c.id
               OR LOWER(TRIM(ps.to_email)) = LOWER(TRIM(c.email))
             )
        )`
      : "";
  const priorCampaignSendParams = priorCampaignIds;
  const priorTenantSendParams =
    priorCampaignIds.length === 0 && opts.excludePriorTenantSends && tenantId > 0 ? [tenantId, id] : [];
  /** 专线 SMTP 直连 relay_ip，勿走 outbound 代理（坏代理会导致 587 长时间无首封） */
  const useOutboundPool =
    channelMode === "smtp" && smtp != null && !(Number(smtp.dedicated_server_id ?? 0) > 0);
  /** 与受众 SQL 并行预取 SMTP 出站通道，缩短首封前等待 */
  setCampaignSendPrep(id, "audience", "准备收件人");
  const outboundChannelPromise: Promise<OutboundIpPoolRow | null> = useOutboundPool
    ? pickAndTouchOutboundChannel(db, tenantId)
    : Promise.resolve(null);
  let contactRows: any[];
  if (effectiveGroupIds.length > 0) {
    const placeholders = effectiveGroupIds.map(() => "?").join(",");
    const sql = `SELECT DISTINCT c.id, c.email, c.email_status
      FROM email_contacts c
      INNER JOIN email_contact_groups ecg ON ecg.contact_id = c.id
      WHERE ecg.group_id IN (${placeholders}) AND ${blWhere.join(" AND ")}${resumeClause}${priorCampaignSendClause}${priorTenantSendClause}
      ORDER BY c.id ASC
      LIMIT ?`;
    const params = [...effectiveGroupIds, ...blParams, ...resumeParams, ...priorCampaignSendParams, ...priorTenantSendParams, batchLimit];
    const [rows] = await db.query(sql, params);
    contactRows = rows as any[];
  } else {
    const [rows] = await db.query(
      `SELECT c.id, c.email, c.email_status FROM email_contacts c WHERE ${blWhere.join(" AND ")}${resumeClause}${priorCampaignSendClause}${priorTenantSendClause} ORDER BY c.id ASC LIMIT ?`,
      [...blParams, ...resumeParams, ...priorCampaignSendParams, ...priorTenantSendParams, batchLimit]
    );
    contactRows = rows as any[];
  }

  if (activeSendRunId > 0) {
    console.info("[executeCampaignSend] audience loaded", {
      campaignId: id,
      sendRunId: activeSendRunId,
      contacts: Array.isArray(contactRows) ? contactRows.length : 0,
      laneFormalFastAudience
    });
  }

  contactRows = dedupeContactsByEmail(contactRows);
  if (activeSendRunId > 0) {
    const listLenEarly = contactRows.length;
    if (listLenEarly > 0) {
      campaignSendRunDisplayPlanned.set(id, listLenEarly);
      campaignActiveSendPlanned.set(id, listLenEarly);
      try {
        await updateSendRunPlannedCount(db, activeSendRunId, listLenEarly);
        await db.query(`UPDATE email_campaigns SET recipient_count = ? WHERE id = ?`, [listLenEarly, id]);
      } catch {
        /* 校准失败不阻断发送 */
      }
    }
  }
  const cachedOutboundChannel = await outboundChannelPromise;

  if (!Array.isArray(contactRows) || contactRows.length === 0) {
    if (resumeFromPause) {
      throw new Error("该活动已无可续发联系人：此前暂停后的剩余收件人已发送完成。");
    }
    const industryHint = industries.length > 0 ? `；行业筛选：${industries.join("、")}` : "";
    const scopeHint =
      effectiveGroupIds.length > 0
        ? industries.length > 0
          ? " 说明：本活动在「所选分组」内再按行业交集筛选；请确认这些分组里的联系人行业字段与选项一致。"
          : " 说明：本活动仅向「属于所选分组」且状态为 active、邮箱非空的联系人发送。"
        : tenantId > 0
          ? " 说明：未选分组时，仅向当前租户内、行业字段（首尾空格已忽略）与选项一致且状态为 active 的联系人发送。"
          : "";
    throw new Error(
      (
        `当前活动没有可发送联系人：请确认存在「状态为 active 且邮箱非空」的联系人${industryHint}。${scopeHint}` +
        (industries.length > 0 && tenantId > 0
          ? " 若人数统计有值但此处为 0，多为活动归属租户与 CRM 联系人租户不一致，或联系人的「业务线」与活动业务线不一致。"
          : "")
      ).trim()
    );
  }

  const rawMin = opts.minIntervalMs;
  const minIntervalMs =
    rawMin != null && Number.isFinite(Number(rawMin)) ? Math.max(0, Math.min(Math.floor(Number(rawMin)), 120_000)) : 0;

  let sent = 0;
  let failed = 0;
  const unsubBase = (opts.unsubscribeBaseUrl ?? getUnsubscribeBaseUrl()).replace(/\/$/, "");

  const list = contactRows as any[];
  setCampaignSendPrep(
    id,
    "loop",
    channelMode === "smtp" ? `共 ${list.length} 封待发` : `共 ${list.length} 封待发`
  );
  const beforeLoopCtrl = await resolveCampaignRuntimeControl(db, id);
  if (beforeLoopCtrl !== "continue") {
    return {
      sent: 0,
      failed: 0,
      attempted: 0,
      planned: list.length,
      minIntervalMs,
      aborted: beforeLoopCtrl
    };
  }
  /**
   * 发送进度分母必须用“后端实际发送计划”校准，而不能只信创建活动时保存的
   * recipient_count。原因：前端预估口径与 executeCampaignSend 的实际筛选口径可能
   * 出现偏差（分组、行业、断点续发、历史已尝试联系人等），一旦 recipient_count
   * 偏小，前端进度条会先到 100%，但后端仍在继续发送。
   *
   * 当前发送总计划 = 已经写入 email_sends 的尝试数 + 本轮剩余待发联系人数。
   * 这里在真正进入 sendMail 循环前写回 DB，/send-progress 会实时返回这个值。
   */
  try {
    const listLen = list.length;
    if (activeSendRunId > 0) {
      /** 计划数与 dedupe 后待发列表一致，避免预览 12 / 实发 11 时进度永远剩 1 封 */
      const plannedForRun = listLen;
      campaignActiveSendRunId.set(id, activeSendRunId);
      campaignSendRunBaseline.set(id, 0);
      campaignSendRunDisplayPlanned.set(id, plannedForRun);
      campaignActiveSendPlanned.set(id, plannedForRun);
      await updateSendRunPlannedCount(db, activeSendRunId, plannedForRun);
    } else {
      const [attemptRows] = await db.query(
        `SELECT COUNT(DISTINCT LOWER(TRIM(to_email))) AS n FROM email_sends WHERE campaign_id = ?`,
        [id]
      );
      const existingAttempts = Math.max(0, Number((attemptRows as Array<{ n?: unknown }>)[0]?.n ?? 0));
      const plannedTotal = existingAttempts + listLen;
      campaignSendRunBaseline.set(id, existingAttempts);
      campaignSendRunDisplayPlanned.set(id, listLen);
      campaignActiveSendPlanned.set(id, plannedTotal);
      await db.query(`UPDATE email_campaigns SET recipient_count = ? WHERE id = ?`, [plannedTotal, id]);
    }
  } catch {
    // 进度分母校准失败不应阻断发送；前端仍可根据 attempted 自适应。
  }
  const plannedCap = campaignActiveSendPlanned.get(id) ?? null;
  let aborted: CampaignRuntimeControl | null = null;
  let laneAttemptsThisRun = 0;

  /** 套餐日发上限（送达成功）：LICENSE 硬顶 + tenant_product_modules / tier */
  const dbDailyCap = tenantId > 0 ? await getTenantEmailDailySendLimit(db, tenantId) : null;
  const packageDailyDeliveredCap =
    dbDailyCap != null && dbDailyCap > 0 ? dbDailyCap : null;
  let dailyDeliveredCapHit = false;
  async function tenantDailyDeliveredCapReached(): Promise<boolean> {
    if (tenantId <= 0 || packageDailyDeliveredCap == null || packageDailyDeliveredCap <= 0) {
      return false;
    }
    const used = await countTenantEmailSentToday(db, tenantId);
    if (used < packageDailyDeliveredCap) return false;
    dailyDeliveredCapHit = true;
    campaignSendAsyncError.set(
      id,
      `活动已停止发送：今日日发限额已满（已送达 ${used.toLocaleString("zh-CN")} / 上限 ${packageDailyDeliveredCap.toLocaleString("zh-CN")} 封/日，与统计页「已送达」同口径）。明日 0 点后可继续发送本活动剩余名单。`
    );
    aborted = "stop";
    return true;
  }

  let cachedSmtpTransporter: nodemailer.Transporter | null = null;
  let cachedSmtpChannelKey: string | null = null;
  let smtpConnectionVerified = false;

  /** 本轮已尝试过的邮箱（含 DB 已有行 + 循环内新写入），用于跳过重复并避免 cap 每封 COUNT */
  const touchedEmailsInRun = new Set<string>();
  let touchedDistinctCount = 0;
  if (activeSendRunId > 0) {
    const [cntRows] = await db.query(
      `SELECT COUNT(*) AS n FROM email_sends WHERE campaign_id = ? AND send_run_id = ?`,
      [id, activeSendRunId]
    );
    const existingRunRows = Math.max(0, Number((cntRows as Array<{ n?: unknown }>)[0]?.n ?? 0));
    if (existingRunRows > 0) {
      try {
        await reconcileStaleSendingEmailRows(db, id, { sendRunId: activeSendRunId, staleSec: 5 });
        const [touchedRows] = await db.query(
          `SELECT LOWER(TRIM(to_email)) AS em FROM email_sends
            WHERE campaign_id = ? AND send_run_id = ? AND TRIM(COALESCE(to_email, '')) <> ''`,
          [id, activeSendRunId]
        );
        for (const r of touchedRows as Array<{ em?: unknown }>) {
          const em = String(r.em ?? "").trim();
          if (em) touchedEmailsInRun.add(em);
        }
      } catch {
        /* 续发预载失败不阻断 */
      }
    }
    touchedDistinctCount = touchedEmailsInRun.size;
  } else {
    try {
      const [touchedRows] = await db.query(
        `SELECT LOWER(TRIM(to_email)) AS em FROM email_sends
          WHERE campaign_id = ? AND TRIM(COALESCE(to_email, '')) <> ''`,
        [id]
      );
      for (const r of touchedRows as Array<{ em?: unknown }>) {
        const em = String(r.em ?? "").trim();
        if (em) touchedEmailsInRun.add(em);
      }
      touchedDistinctCount = touchedEmailsInRun.size;
    } catch {
      /* 预载失败不阻断发送 */
    }
  }

  let runtimeCtrlCache: CampaignRuntimeControl = "continue";
  let runtimeCtrlCheckedAt = 0;
  async function loopRuntimeControl(): Promise<CampaignRuntimeControl> {
    const overridden = campaignRuntimeControlOverrides.get(id);
    if (overridden && overridden !== "continue") return overridden;
    const now = Date.now();
    if (now - runtimeCtrlCheckedAt < 500) return runtimeCtrlCache;
    runtimeCtrlCache = await resolveCampaignRuntimeControl(db, id);
    runtimeCtrlCheckedAt = now;
    return runtimeCtrlCache;
  }

  /**
   * 独立发信服务器（专线 VPS）：不在首封前做 verify 预连接，避免监控长期停在「连接发信服务器」。
   * 首封 INSERT 后由 pipeline worker 懒加载 transporter（与单组逻辑一致，失败会写入 lastAsyncError）。
   */
  const isDedicatedSmtp =
    channelMode === "smtp" && smtp != null && Number(smtp.dedicated_server_id ?? 0) > 0;
  if (channelMode === "smtp" && smtp && !isDedicatedSmtp) {
    setCampaignSendPrep(id, "smtp", "连接发信服务器…");
    try {
      await runWithTimeout(
        async () => {
          const channel = cachedOutboundChannel;
          const channelKey = channel ? `c${channel.id}:${channel.type}` : "direct";
          cachedSmtpTransporter = await createTransporterForSmtpWithChannel(smtp, channel);
          cachedSmtpChannelKey = channelKey;
          try {
            await verifySmtpWithTimeout(cachedSmtpTransporter, 6_000);
          } catch (verifyErr) {
            console.warn(
              "[executeCampaignSend] SMTP pre-verify failed, workers will retry",
              id,
              (verifyErr as Error)?.message ?? verifyErr
            );
          }
          smtpConnectionVerified = true;
          campaignSmtpTransporterActive.set(id, cachedSmtpTransporter);
        },
        25_000,
        "连接发信服务器超时（25 秒）。请检查专线 VPS、587/465 端口与 relay_ip；可点「停止发送」后重试或新建活动。"
      );
      clearCampaignSendPrep(id);
    } catch (preConnErr) {
      const msg = String((preConnErr as Error)?.message ?? preConnErr);
      clearCampaignSendPrep(id);
      campaignSendAsyncError.set(id, msg);
      console.warn("[executeCampaignSend] SMTP pre-connect failed", id, msg);
    }
  }

  if (activeSendRunId > 0 && list.length > 0) {
    console.info("[executeCampaignSend] loop start", {
      campaignId: id,
      sendRunId: activeSendRunId,
      planned: list.length,
      channelMode,
      minIntervalMs
    });
  }

  const smtpPipeline = channelMode === "smtp" ? createCampaignSmtpPipeline(id) : null;
  campaignSendMinIntervalMs.set(id, minIntervalMs);
  /** 本轮正式发送：按收件域缓存 MX 查询结果 */
  const recipientMxCache = new Map<string, boolean>();
  const wechatReadOriginalFallback = await resolveWechatReadUrlForTemplate(
    db,
    tenantId,
    campaign.template_id != null ? Number(campaign.template_id) : 0
  );

  try {
  for (let i = 0; i < list.length; i++) {
    const ctrl = await loopRuntimeControl();
    if (ctrl !== "continue") {
      aborted = ctrl;
      break;
    }
    if (tenantId > 0 && packageDailyDeliveredCap != null && packageDailyDeliveredCap > 0) {
      if (await tenantDailyDeliveredCapReached()) break;
    }
    if (plannedCap != null && plannedCap > 0 && touchedDistinctCount >= plannedCap) {
      break;
    }
    const c = list[i]!;
    const normEmail = normalizeCampaignEmail(c.email);
    let pendingSmtpRowId = 0;
    try {
      if (normEmail && touchedEmailsInRun.has(normEmail)) {
        if (activeSendRunId > 0) {
          await db.query(
            `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider)
             VALUES (?, ?, ?, ?, 'skipped', ?, ?, ?)`,
            [
              id,
              activeSendRunId,
              c.id,
              c.email,
              "重复邮箱（本活动本轮已处理过），已跳过",
              fromEmailForLog || null,
              channelMode
            ]
          );
          if (laneSendCtx) laneAttemptsThisRun += 1;
        }
        if (normEmail) {
          touchedEmailsInRun.add(normEmail);
          touchedDistinctCount = touchedEmailsInRun.size;
        }
        continue;
      }

      /**
       * 抑制列表（hard bounce / complaint 自动入册的全平台黑名单）
       * 直接跳过本封；记一行 status='suppressed' 让前端"任务详情"能查到原因。
       */
      if (tenantId > 0 && (await isSuppressed(db, tenantId, String(c.email ?? "")))) {
        if (activeSendRunId > 0) {
          await db.query(
            `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider)
             VALUES (?, ?, ?, ?, 'suppressed', ?, ?, ?)`,
            [
              id,
              activeSendRunId,
              c.id,
              c.email,
              "已加入抑制列表（hard bounce / complaint），跳过发送",
              fromEmailForLog || null,
              channelMode
            ]
          );
        } else {
          await db.query(
            `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, error, from_email, provider)
             VALUES (?, ?, ?, 'suppressed', ?, ?, ?)`,
            [
              id,
              c.id,
              c.email,
              "已加入抑制列表（hard bounce / complaint），跳过发送",
              fromEmailForLog || null,
              channelMode
            ]
          );
        }
        if (normEmail) {
          touchedEmailsInRun.add(normEmail);
          touchedDistinctCount = touchedEmailsInRun.size;
        }
        continue;
      }

      const statusPrecheck = precheckCampaignContactEmailStatus(c.email_status);
      let recipientPrecheck =
        statusPrecheck ?? precheckCampaignRecipientEmail(c.email);
      if (!recipientPrecheck && normEmail) {
        const recipientDomain = normEmail.split("@")[1];
        if (recipientDomain) {
          recipientPrecheck = await precheckCampaignRecipientMx(recipientDomain, recipientMxCache);
        }
      }
      if (recipientPrecheck) {
        failed += 1;
        if (activeSendRunId > 0) {
          await db.query(
            `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider)
             VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`,
            [id, activeSendRunId, c.id, c.email, recipientPrecheck, fromEmailForLog || null, channelMode]
          );
        } else {
          await db.query(
            `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, error, from_email, provider)
             VALUES (?, ?, ?, 'failed', ?, ?, ?)`,
            [id, c.id, c.email, recipientPrecheck, fromEmailForLog || null, channelMode]
          );
        }
        if (laneSendCtx) laneAttemptsThisRun += 1;
        if (normEmail) {
          touchedEmailsInRun.add(normEmail);
          touchedDistinctCount = touchedEmailsInRun.size;
        }
        continue;
      }

      const token = makeUnsubscribeToken(Number(c.id), id, String(c.email ?? ""));
      const complaintToken = makeComplaintToken(Number(c.id), id, String(c.email ?? ""));
      const subscribeToken = makeSubscribeToken(Number(c.id), id, String(c.email ?? ""));
      const unsubUrl = `${unsubBase}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
      const complaintUrl = `${unsubBase}/api/email/complaint?token=${encodeURIComponent(complaintToken)}`;
      const subscribeUrl = `${unsubBase}/api/email/subscribe?token=${encodeURIComponent(subscribeToken)}`;
      const sendUuid = crypto.randomUUID();
      const htmlWithCompliance = decorateHtmlWithComplianceLinks(
        String(campaign.html ?? ""),
        unsubUrl,
        complaintUrl,
        subscribeUrl,
        wechatReadOriginalFallback
      );
      const html = decorateHtmlWithTracking(htmlWithCompliance, unsubBase, sendUuid);

      if (channelMode === "ses") {
        /**
         * SES 通道：每封邮件随机一个 send_uuid（同时作为 SES EmailTags.bss_send_id），
         * SNS bounce/complaint 回调按这个 id 反查 email_sends 行更新状态。
         * messageId 由 SES 返回，但开放平台可能延迟，先不强依赖；以 send_uuid 为主键。
         */
        try {
          const r = await sesSendEmail({
            fromAddress,
            toAddresses: [String(c.email)],
            replyToAddress: replyTo || undefined,
            subject: String(campaign.subject ?? ""),
            htmlBody: html,
            tags: {
              bss_tenant_id: String(tenantId),
              bss_campaign_id: String(id),
              bss_contact_id: String(c.id ?? ""),
              bss_send_id: sendUuid
            }
          });
          if (activeSendRunId > 0) {
            await db.query(
              `INSERT INTO email_sends
                 (campaign_id, send_run_id, contact_id, to_email, status, provider_message_id, from_email, provider, send_uuid, ses_sender_address_id)
               VALUES (?, ?, ?, ?, 'sent', ?, ?, 'ses', ?, ?)`,
              [
                id,
                activeSendRunId,
                c.id,
                c.email,
                r.messageId || null,
                fromEmailForLog || null,
                sendUuid,
                sesSender!.id
              ]
            );
          } else {
            await db.query(
              `INSERT INTO email_sends
                 (campaign_id, contact_id, to_email, status, provider_message_id, from_email, provider, send_uuid, ses_sender_address_id)
               VALUES (?, ?, ?, 'sent', ?, ?, 'ses', ?, ?)`,
              [
                id,
                c.id,
                c.email,
                r.messageId || null,
                fromEmailForLog || null,
                sendUuid,
                sesSender!.id
              ]
            );
          }
          sent += 1;
        } catch (e: any) {
          failed += 1;
          if (activeSendRunId > 0) {
            await db.query(
              `INSERT INTO email_sends
                 (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider, send_uuid, ses_sender_address_id)
               VALUES (?, ?, ?, ?, 'failed', ?, ?, 'ses', ?, ?)`,
              [
                id,
                activeSendRunId,
                c.id,
                c.email,
                String(e?.message ?? e),
                fromEmailForLog || null,
                sendUuid,
                sesSender!.id
              ]
            );
          } else {
            await db.query(
              `INSERT INTO email_sends
                 (campaign_id, contact_id, to_email, status, error, from_email, provider, send_uuid, ses_sender_address_id)
               VALUES (?, ?, ?, 'failed', ?, ?, 'ses', ?, ?)`,
              [
                id,
                c.id,
                c.email,
                String(e?.message ?? e),
                fromEmailForLog || null,
                sendUuid,
                sesSender!.id
              ]
            );
          }
        }
      } else {
        /**
         * SMTP 流水线：worker 开始时 INSERT sending（串行队列下最多 1 行在途），再 sendMail。
         */
        pendingSmtpRowId = 0;
        if (normEmail) {
          touchedEmailsInRun.add(normEmail);
          touchedDistinctCount = touchedEmailsInRun.size;
        }
        if (laneSendCtx) laneAttemptsThisRun += 1;

        const contactId = Number(c.id);
        const contactEmail = String(c.email ?? "");
        const mailHtml = html;
        const mailSubject = String(campaign.subject ?? "");
        const mailSendUuid = sendUuid;

        smtpPipeline!.enqueue(async () => {
          const workerCtrl = await loopRuntimeControl();
          if (workerCtrl !== "continue") {
            dbgSendSession("H3-pipeline-worker-stop", "email.ts:smtp-worker", "worker skipped after stop", {
              campaignId: id,
              workerCtrl
            });
            return;
          }
          let smtpRowId = 0;
          try {
            if (activeSendRunId > 0) {
              const [insPending] = await db.query(
                `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, from_email, provider, send_uuid)
                 VALUES (?, ?, ?, ?, 'sending', ?, 'smtp', ?)`,
                [id, activeSendRunId, contactId, contactEmail, fromEmailForLog || null, mailSendUuid]
              );
              smtpRowId = Number((insPending as { insertId?: unknown }).insertId ?? 0);
            } else {
              const [insPending] = await db.query(
                `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, from_email, provider, send_uuid)
                 VALUES (?, ?, ?, 'sending', ?, 'smtp', ?)`,
                [id, contactId, contactEmail, fromEmailForLog || null, mailSendUuid]
              );
              smtpRowId = Number((insPending as { insertId?: unknown }).insertId ?? 0);
            }
            if (smtpRowId > 0) clearCampaignSendPrep(id);
            setCampaignSendPrep(id, "smtp", `正在投递：${contactEmail.trim() || "…"}`);
          } catch (insErr: unknown) {
            failed += 1;
            console.warn(
              "[executeCampaignSend] smtp worker insert failed",
              id,
              (insErr as Error)?.message ?? insErr
            );
            return;
          }
          if (smtpRowId <= 0) return;
          try {
            const channel = cachedOutboundChannel;
            const channelKey = channel ? `c${channel.id}:${channel.type}` : "direct";
            if (!cachedSmtpTransporter || channelKey !== cachedSmtpChannelKey) {
              abortCampaignSmtpTransport(id);
              if (cachedSmtpTransporter && typeof cachedSmtpTransporter.close === "function") {
                try {
                  cachedSmtpTransporter.close();
                } catch {
                  /* ignore */
                }
              }
              cachedSmtpTransporter = await createTransporterForSmtpWithChannel(smtp, channel);
              cachedSmtpChannelKey = channelKey;
              smtpConnectionVerified = false;
              campaignSmtpTransporterActive.set(id, cachedSmtpTransporter);
            }
            const transporter = cachedSmtpTransporter;
            if (!smtpConnectionVerified) {
              try {
                await verifySmtpWithTimeout(transporter, 6_000);
              } catch (verifyErr) {
                console.warn(
                  "[executeCampaignSend] SMTP verify failed, continuing with sendMail",
                  id,
                  (verifyErr as Error)?.message ?? verifyErr
                );
              }
              smtpConnectionVerified = true;
            }
            const inlineMail = prepareSmtpHtmlWithInlineUploadImages(mailHtml);
            const info = await sendMailWithTimeout(transporter, {
              from: fromAddress,
              ...(replyTo ? { replyTo } : {}),
              to: contactEmail,
              subject: mailSubject,
              html: inlineMail.html,
              ...(inlineMail.attachments?.length ? { attachments: inlineMail.attachments } : {})
            }).catch(async (sendErr: unknown) => {
              const errMsg = String((sendErr as Error)?.message ?? sendErr);
              failed += 1;
              if (smtpRowId > 0) {
                await db.query(
                  `UPDATE email_sends SET status = 'failed', error = ?, provider_message_id = ? WHERE id = ? AND status = 'sending'`,
                  [errMsg, null, smtpRowId]
                ).catch(() => undefined);
              }
              /* SMTP 失败后重置 transporter，下次 worker 会重新创建连接 */
              if (cachedSmtpTransporter) {
                try { cachedSmtpTransporter.close(); } catch { /* ignore */ }
                cachedSmtpTransporter = null;
                cachedSmtpChannelKey = '';
                smtpConnectionVerified = false;
                campaignSmtpTransporterActive.delete(id);
              }
              return null;
            });
            if (!info) return;
            const rejectReason = summarizeSmtpRejection(info);
            if (rejectReason) {
              failed += 1;
              if (smtpRowId > 0) {
                await db.query(
                  `UPDATE email_sends SET status = 'failed', error = ?, provider_message_id = ? WHERE id = ? AND status = 'sending'`,
                  [rejectReason, info?.messageId ?? null, smtpRowId]
                );
              } else if (activeSendRunId > 0) {
                await db.query(
                  `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, provider_message_id, from_email, provider, send_uuid)
                   VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, 'smtp', ?)`,
                  [
                    id,
                    activeSendRunId,
                    contactId,
                    contactEmail,
                    rejectReason,
                    info?.messageId ?? null,
                    fromEmailForLog || null,
                    mailSendUuid
                  ]
                );
              } else {
                await db.query(
                  `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, error, provider_message_id, from_email, provider, send_uuid)
                   VALUES (?, ?, ?, 'failed', ?, ?, ?, 'smtp', ?)`,
                  [
                    id,
                    contactId,
                    contactEmail,
                    rejectReason,
                    info?.messageId ?? null,
                    fromEmailForLog || null,
                    mailSendUuid
                  ]
                );
              }
            } else if (smtpRowId > 0) {
              const [updSent] = await db.query(
                `UPDATE email_sends SET status = 'sent', provider_message_id = ? WHERE id = ? AND status = 'sending'`,
                [info?.messageId ?? null, smtpRowId]
              );
              const sentApplied = Math.max(0, Number((updSent as { affectedRows?: unknown }).affectedRows ?? 0));
              if (sentApplied <= 0) {
                const [rowSt] = await db.query(`SELECT status FROM email_sends WHERE id = ? LIMIT 1`, [smtpRowId]);
                const st = String((rowSt as Array<{ status?: unknown }>)[0]?.status ?? "").toLowerCase();
                if (st !== "sent") failed += 1;
              } else {
                sent += 1;
              }
            } else if (activeSendRunId > 0) {
              await db.query(
                `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, provider_message_id, from_email, provider, send_uuid)
                 VALUES (?, ?, ?, ?, 'sent', ?, ?, 'smtp', ?)`,
                [
                  id,
                  activeSendRunId,
                  contactId,
                  contactEmail,
                  info?.messageId ?? null,
                  fromEmailForLog || null,
                  mailSendUuid
                ]
              );
              sent += 1;
            } else {
              await db.query(
                `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, provider_message_id, from_email, provider, send_uuid)
                 VALUES (?, ?, ?, 'sent', ?, ?, 'smtp', ?)`,
                [id, contactId, contactEmail, info?.messageId ?? null, fromEmailForLog || null, mailSendUuid]
              );
              sent += 1;
            }
          } catch (e: unknown) {
            failed += 1;
            const errMsg = String((e as Error)?.message ?? e);
            if (smtpRowId > 0) {
              await db.query(
                `UPDATE email_sends SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'`,
                [errMsg, smtpRowId]
              );
            } else if (activeSendRunId > 0) {
              await db.query(
                `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider)
                 VALUES (?, ?, ?, ?, 'failed', ?, ?, 'smtp')`,
                [id, activeSendRunId, contactId, contactEmail, errMsg, fromEmailForLog || null]
              );
            } else {
              await db.query(
                `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, error, from_email, provider)
                 VALUES (?, ?, ?, 'failed', ?, ?, 'smtp')`,
                [id, contactId, contactEmail, errMsg, fromEmailForLog || null]
              );
            }
          } finally {
            if (smtpRowId > 0) {
              try {
                const [rowSt] = await db.query(`SELECT status FROM email_sends WHERE id = ? LIMIT 1`, [
                  smtpRowId
                ]);
                const st = String((rowSt as Array<{ status?: unknown }>)[0]?.status ?? "").toLowerCase();
                if (st === "sending") {
                  failed += 1;
                  await db.query(
                    `UPDATE email_sends SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'`,
                    ["SMTP 投递未正常结束（请检查 VPS/Postfix 或重试）", smtpRowId]
                  );
                }
              } catch {
                /* ignore */
              }
            }
          }
        });
      }
    } catch (e: any) {
      failed += 1;
      const errMsg = String(e?.message ?? e);
      if (pendingSmtpRowId > 0) {
        await db.query(
          `UPDATE email_sends SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'`,
          [errMsg, pendingSmtpRowId]
        );
      } else if (activeSendRunId > 0) {
        await db.query(
          `INSERT INTO email_sends (campaign_id, send_run_id, contact_id, to_email, status, error, from_email, provider)
           VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`,
          [id, activeSendRunId, c.id, c.email, errMsg, fromEmailForLog || null, channelMode]
        );
      } else {
        await db.query(
          `INSERT INTO email_sends (campaign_id, contact_id, to_email, status, error, from_email, provider)
           VALUES (?, ?, ?, 'failed', ?, ?, ?)`,
          [id, c.id, c.email, errMsg, fromEmailForLog || null, channelMode]
        );
      }
    }
    if (normEmail && !touchedEmailsInRun.has(normEmail)) {
      touchedEmailsInRun.add(normEmail);
      touchedDistinctCount = touchedEmailsInRun.size;
    }
    const afterCtrl = await loopRuntimeControl();
    if (afterCtrl !== "continue") {
      aborted = afterCtrl;
      dbgSendSession("H3-loop-abort", "email.ts:send-loop", "loop aborted", {
        campaignId: id,
        afterCtrl,
        index: i
      });
      break;
    }
    if (activeSendRunId > 0 && channelMode === "smtp" && i % 2 === 0 && !isCampaignSendWorkerActive(id)) {
      try {
        const rowStale = staleSendingReconcileSec();
        await reconcileStaleSendingEmailRows(db, id, {
          sendRunId: activeSendRunId,
          staleSec: rowStale.staleSec,
          minStaleSec: rowStale.minStaleSec
        });
      } catch {
        /* active worker 结束后才对账僵尸 sending，避免误杀正在投递的 SMTP。 */
      }
    }
    if (minIntervalMs > 0 && i < list.length - 1) {
      const waitCtrl = await waitWithCampaignControl(db, id, minIntervalMs);
      if (waitCtrl !== "continue") {
        aborted = waitCtrl;
        break;
      }
    }
    /** 让 send-progress 轮询有机会插入响应，避免长时间占满事件循环 */
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  } finally {
    if (smtpPipeline) {
      try {
        if (aborted === "stop") {
          smtpPipeline.cancel();
          await smtpPipeline.drain(2_000);
        } else {
          await smtpPipeline.drain(90_000);
        }
      } catch {
        /* 队列收尾失败不阻断 */
      }
    }
    campaignSmtpPipelineActive.delete(id);
    campaignSendMinIntervalMs.delete(id);
    abortCampaignSmtpTransport(id);
    if (cachedSmtpTransporter && typeof cachedSmtpTransporter.close === "function") {
      try {
        cachedSmtpTransporter.close();
      } catch {
        /* ignore */
      }
    }
    try {
      if (activeSendRunId > 0) {
        const stablePlannedCount = Math.max(
          0,
          Math.floor(Number(campaignActiveSendPlanned.get(id) ?? 0)),
          Math.floor(Number(campaignSendRunDisplayPlanned.get(id) ?? 0)),
          Array.isArray(list) ? list.length : 0,
          touchedDistinctCount
        );
        if (stablePlannedCount > 0) {
          await updateSendRunPlannedCount(db, activeSendRunId, stablePlannedCount);
          campaignActiveSendPlanned.set(id, stablePlannedCount);
          campaignSendRunDisplayPlanned.set(id, stablePlannedCount);
        }
      }
      const [sendingCountRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends WHERE campaign_id = ? AND status = 'sending'${
          activeSendRunId > 0 ? " AND send_run_id = ?" : ""
        }`,
        activeSendRunId > 0 ? [id, activeSendRunId] : [id]
      );
      const sendingCount = Math.max(
        0,
        Number((sendingCountRows as Array<{ n?: unknown }>)[0]?.n ?? 0)
      );
      /** worker 已全部跑完：仍剩 sending 即僵尸行，立刻终态，勿再等「末封 N 秒」 */
      if (activeSendRunId > 0 && sendingCount > 0) {
        await reconcileEndgameSendingEmailRows(db, id, activeSendRunId);
      } else if (sendingCount > 0) {
        const { staleSec, minStaleSec } = pipelineStaleSendingMinSec(minIntervalMs, sendingCount);
        await reconcileStaleSendingEmailRows(db, id, {
          sendRunId: activeSendRunId > 0 ? activeSendRunId : undefined,
          staleSec,
          minStaleSec
        });
      }
    } catch {
      /* 收尾对账失败不阻断返回 */
    }
  }

  return {
    sent,
    failed,
    attempted: sent + failed,
    planned: list.length,
    minIntervalMs,
    aborted,
    dailyDeliveredCapHit
  };
}

export async function stopCampaignSendNow(
  db: Pool,
  id: number,
  opts?: { requestTenantId?: number; source?: "api" | "session" | "automation" }
): Promise<{ ok: true; status: "stopped" | "paused"; message: string }> {
  const [rows] = await db.query(`SELECT tenant_id, status FROM email_campaigns WHERE id = ? LIMIT 1`, [id]);
  const row = (rows as Array<{ tenant_id?: unknown; status?: unknown }>)[0];
  if (!row) throw new Error("活动不存在");
  const requestTenantId = Math.floor(Number(opts?.requestTenantId ?? 0));
  const campaignTenantId = Number(row.tenant_id ?? 0);
  if (requestTenantId > 0 && campaignTenantId > 0 && campaignTenantId !== requestTenantId) {
    throw new Error("无权操作该活动（与当前租户不一致）。");
  }
  const statusNow = String(row.status ?? "").toLowerCase();
  const [activeRunRows] = await db.query(
    `SELECT id FROM email_campaign_send_runs
      WHERE campaign_id = ? AND status = 'sending'
      ORDER BY id DESC LIMIT 1`,
    [id]
  );
  const activeSendRunId = Number((activeRunRows as Array<{ id?: unknown }>)[0]?.id ?? 0);
  const runStillActive = activeSendRunId > 0;
  if (statusNow !== "sending" && !runStillActive) {
    if (statusNow === "paused") {
      return { ok: true, status: "paused", message: "活动已处于暂停状态。" };
    }
    if (statusNow === "stopped") {
      return { ok: true, status: "stopped", message: "活动已处于停止状态。" };
    }
    throw new Error("当前活动不在发送中，无法停止。");
  }

  campaignRuntimeControlOverrides.set(id, "stop");
  campaignSmtpPipelineActive.get(id)?.cancel();
  abortCampaignSmtpTransport(id);
  dbgSendSession("H3-stop-control", "email.ts:control-stop", "stop requested", {
    campaignId: id,
    activeSendRunId,
    statusNow
  });
  await db.query(`UPDATE email_campaigns SET status = ?, next_run_at = NULL WHERE id = ?`, [
    "stopped",
    id
  ]);
  const stopRunId = activeSendRunId;
  if (stopRunId > 0) {
    try {
      await db.query(
        `UPDATE email_sends
            SET status = 'failed',
                error = COALESCE(
                  NULLIF(TRIM(error), ''),
                  '用户停止发送（在途邮件已结束）'
                )
          WHERE campaign_id = ?
            AND send_run_id = ?
            AND status = 'sending'`,
        [id, stopRunId]
      );
    } catch {
      /* 失败不阻断停止流程 */
    }
    await finalizeCampaignSendRun(db, stopRunId, "stopped", { skipMetrics: true });
  } else {
    await finalizeActiveSendRunForCampaign(db, id, "stopped", { skipMetrics: true });
  }
  clearCampaignActiveSendPlan(id);
  campaignRuntimeControlOverrides.set(id, "stop");
  dbgSendSession("H3-stop-control", "email.ts:control-stop", "stop finalized", {
    campaignId: id,
    stopRunId
  });
  void emitTenantWebhookEvent(db, campaignTenantId, "email.campaign.stopped", {
    campaignId: id,
    sendRunId: stopRunId > 0 ? stopRunId : null,
    source: opts?.source ?? "session"
  });
  return {
    ok: true,
    status: "stopped",
    message: "已停止发送；已发出的邮件仍计入营销活动统计。"
  };
}

export function registerEmailRoutes(app: Express, ctx: Ctx) {
  const { db, env } = ctx;
  registerActiveSendCampaignIdProvider(() => new Set(campaignActiveSendRunId.keys()));
  registerPruneActiveSendMemoryHook((pool) => pruneCampaignActiveSendMemory(pool));
  void ensureEmailCampaignRuntimeColumns(db);
  void ensureEmailSendsFromEmailColumn(db);
  void ensureEmailSendsProviderColumns(db);
  void ensureEmailDeliveryEventsSendIdColumn(db);
  void ensureEmailCampaignSendRunsSchema(db);

  app.get("/api/email/smtp", async (req, res) => {
    const tenantId = resolveTenantId(req);
    /**
     * 专线开通后 `email_dedicated_servers.smtp_profile_id` 往往已写入，但
     * `smtp_profiles.dedicated_server_id` 可能未回填（旧 admin 流程或手动改库）。
     * 列表前对齐一次，避免前端「仅中量」过滤掉已绑定的发件邮箱。
     */
    try {
      await db.query(
        `UPDATE smtp_profiles sp
         INNER JOIN (
           SELECT smtp_profile_id, tenant_id, MIN(id) AS eds_id
           FROM email_dedicated_servers
           WHERE smtp_profile_id IS NOT NULL
           GROUP BY smtp_profile_id, tenant_id
         ) map ON map.smtp_profile_id = sp.id AND map.tenant_id = sp.tenant_id
         SET sp.dedicated_server_id = map.eds_id,
             sp.updated_at = CURRENT_TIMESTAMP
         WHERE sp.tenant_id = ?
           AND (sp.dedicated_server_id IS NULL OR sp.dedicated_server_id <> map.eds_id)`,
        [tenantId]
      );
    } catch {
      /* 缺列或权限时仍返回列表；列由 ensure schema 兜底 */
    }
    const [rows] = await db.query(
      `SELECT sp.id, sp.name, sp.from_email, sp.display_name, sp.reply_to, sp.host, sp.port, sp.secure, sp.username, sp.is_default, sp.created_at, sp.updated_at
              , sp.imap_enabled, sp.imap_host, sp.imap_port, sp.imap_secure, sp.imap_username, sp.imap_mailbox
              , (sp.password_enc IS NOT NULL AND LENGTH(TRIM(COALESCE(sp.password_enc, ''))) > 0) AS has_password
              , (sp.imap_password_enc IS NOT NULL AND LENGTH(TRIM(COALESCE(sp.imap_password_enc, ''))) > 0) AS has_imap_password
              , COALESCE(
                  sp.dedicated_server_id,
                  (SELECT MIN(e.id) FROM email_dedicated_servers e
                    WHERE e.smtp_profile_id = sp.id AND e.tenant_id = sp.tenant_id)
                ) AS dedicated_server_id
       FROM smtp_profiles sp
       WHERE sp.tenant_id = ?
       ORDER BY sp.is_default DESC, sp.id DESC`,
      [tenantId]
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/email/smtp", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = smtpUpsertSchema.parse(req.body);
    const passwordEnc = encryptSecret(body.password);
    const imapEnabled = Boolean(body.imapEnabled);
    const imapHost = String(body.imapHost ?? "").trim() || null;
    const imapPort = body.imapPort != null ? Number(body.imapPort) : null;
    const imapSecure = body.imapSecure == null ? true : Boolean(body.imapSecure);
    const imapUsername = String(body.imapUsername ?? "").trim() || null;
    const imapPwdRaw = String(body.imapPassword ?? "").trim();
    const imapPasswordEnc = imapPwdRaw ? encryptSecret(imapPwdRaw) : null;
    const imapMailbox = String(body.imapMailbox ?? "").trim() || "INBOX";

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      if (body.makeDefault) {
        await conn.query(`UPDATE smtp_profiles SET is_default = 0 WHERE tenant_id = ?`, [tenantId]);
      }
      const [result] = await conn.query(
        `INSERT INTO smtp_profiles
         (tenant_id, name, from_email, display_name, reply_to, host, port, secure, username, password_enc, is_default,
          imap_enabled, imap_host, imap_port, imap_secure, imap_username, imap_password_enc, imap_mailbox)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          body.name,
          body.fromEmail,
          body.displayName?.trim() || null,
          body.replyTo?.trim() || null,
          body.host,
          body.port,
          body.secure ? 1 : 0,
          body.username,
          passwordEnc,
          body.makeDefault ? 1 : 0,
          imapEnabled ? 1 : 0,
          imapHost,
          imapPort,
          imapSecure ? 1 : 0,
          imapUsername,
          imapPasswordEnc,
          imapMailbox
        ]
      );
      const insertId = (result as any).insertId as number;
      await conn.commit();
      res.json({ ok: true, id: insertId });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.put("/api/email/smtp/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = smtpUpdateSchema.parse(req.body);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id, password_enc, is_default, imap_enabled, imap_host, imap_port, imap_secure, imap_username, imap_password_enc, imap_mailbox
         FROM smtp_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [id, tenantId]
      );
      const existing = (rows as any[])[0];
      if (!existing) {
        await conn.rollback();
        return res.status(404).json({ ok: false, message: "SMTP 配置不存在" });
      }

      const pwdIn = (body.password ?? "").trim();
      const passwordEnc = pwdIn ? encryptSecret(pwdIn) : existing.password_enc;
      const imapPwdIn = (body.imapPassword ?? "").trim();
      const imapPasswordEnc = imapPwdIn ? encryptSecret(imapPwdIn) : existing.imap_password_enc;
      const imapEnabled = body.imapEnabled == null ? Number(existing.imap_enabled) === 1 : Boolean(body.imapEnabled);
      const imapHost = String(body.imapHost ?? existing.imap_host ?? "").trim() || null;
      const imapPort = body.imapPort != null ? Number(body.imapPort) : Number(existing.imap_port ?? 993);
      const imapSecure = body.imapSecure == null ? Number(existing.imap_secure ?? 1) === 1 : Boolean(body.imapSecure);
      const imapUsername = String(body.imapUsername ?? existing.imap_username ?? "").trim() || null;
      const imapMailbox = String(body.imapMailbox ?? existing.imap_mailbox ?? "INBOX").trim() || "INBOX";

      const wantDefault = Boolean(body.makeDefault);
      if (wantDefault) {
        await conn.query(`UPDATE smtp_profiles SET is_default = 0 WHERE tenant_id = ?`, [tenantId]);
      }

      await conn.query(
        `UPDATE smtp_profiles
         SET name = ?, from_email = ?, display_name = ?, reply_to = ?, host = ?, port = ?, secure = ?, username = ?, password_enc = ?, is_default = ?
            , imap_enabled = ?, imap_host = ?, imap_port = ?, imap_secure = ?, imap_username = ?, imap_password_enc = ?, imap_mailbox = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          body.name,
          body.fromEmail,
          body.displayName?.trim() || null,
          body.replyTo?.trim() || null,
          body.host,
          body.port,
          body.secure ? 1 : 0,
          body.username,
          passwordEnc,
          wantDefault ? 1 : 0,
          imapEnabled ? 1 : 0,
          imapHost,
          imapPort,
          imapSecure ? 1 : 0,
          imapUsername,
          imapPasswordEnc,
          imapMailbox,
          id,
          tenantId
        ]
      );

      if (!wantDefault) {
        const [cntRows] = await conn.query(`SELECT COUNT(*) AS n FROM smtp_profiles WHERE tenant_id = ? AND is_default = 1`, [
          tenantId
        ]);
        const n = Number((cntRows as any[])[0]?.n ?? 0);
        if (n === 0) {
          await conn.query(`UPDATE smtp_profiles SET is_default = 1 WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`, [tenantId]);
        }
      }

      await conn.commit();
      res.json({ ok: true, id });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.delete("/api/email/smtp/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id, is_default, dedicated_server_id FROM smtp_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [id, tenantId]
      );
      const item = (rows as Array<{ id?: unknown; is_default?: unknown; dedicated_server_id?: unknown }>)[0];
      if (!item) {
        await conn.rollback();
        return res.status(404).json({ ok: false, message: "SMTP 配置不存在" });
      }
      const dedicatedServerId = Math.max(0, Math.floor(Number(item.dedicated_server_id ?? 0)));
      /** 同步专线工作台：删除中量 SMTP 时标记关联发信域 deleted，避免 dedicated-lanes 仍展示 */
      await conn.query(
        `UPDATE email_dedicated_servers
            SET status = 'deleted',
                tenant_deleted_at = CURRENT_TIMESTAMP,
                smtp_profile_id = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ?
            AND status NOT IN ('cancelled', 'deleted')
            AND (smtp_profile_id = ?${dedicatedServerId > 0 ? " OR id = ?" : ""})`,
        dedicatedServerId > 0 ? [tenantId, id, dedicatedServerId] : [tenantId, id]
      );
      await conn.query(`DELETE FROM smtp_profiles WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
      if (Number(item.is_default) === 1) {
        await conn.query(`UPDATE smtp_profiles SET is_default = 1 WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`, [tenantId]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.post("/api/email/smtp/test", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const schema = z.object({
      to: z.string().email(),
      senderProfileId: z.coerce.number().int().positive().optional(),
      /**
       * 指定时：只测该条 smtp_profiles，不再走 SES 优先逻辑。
       * 用于「刚配好腾讯云 / 企业邮」等场景，避免误以为在测当前行实际却走了 SES 或另一条默认 SMTP。
       */
      smtpProfileId: z.coerce.number().int().positive().optional()
    });
    const { to, senderProfileId, smtpProfileId } = schema.parse(req.body ?? {});

    const sender = await pickSenderProfileByOptionalId(db, tenantId, senderProfileId ?? null);

    /**
     * 统一测试发信（小白友好）：
     * 1）若存在域名已验证的 SES 发件邮箱 → 走 SES（与营销页推荐通道一致）
     * 2）否则 → 走默认 SMTP
     *
     * 若请求体带 smtpProfileId：跳过 SES，仅测该条 SMTP（与上两条独立）。
     */
    if (!smtpProfileId) {
      const sesAddr = await pickDefaultSesSenderAddressForTest(db, tenantId);
      if (sesAddr) {
        const effectiveDisplayName =
          sender?.display_name?.trim() || sesAddr.displayName?.trim() || null;
        const fromEmailForLog = sesAddr.fromEmail;
        const fromAddress = effectiveDisplayName
          ? `${effectiveDisplayName} <${fromEmailForLog}>`
          : fromEmailForLog;
        const replyTo = (sender?.reply_to ?? sesAddr.replyTo ?? "").toString().trim();

        try {
          const r = await sesSendEmail({
            fromAddress,
            toAddresses: [to],
            replyToAddress: replyTo || undefined,
            subject: "BigSocialBoss 测试邮件（发件域名 / SES）",
            htmlBody:
              "<p>如果你收到这封邮件，说明通过<strong>发件域名（SES）</strong>的发信配置可用。</p>",
            textBody: "如果你收到这封邮件，说明通过发件域名（SES）的发信配置可用。",
            tags: {
              bss_tenant_id: String(tenantId),
              bss_test: "settings_email_ui",
              bss_ses_sender_id: String(sesAddr.id)
            }
          });
          return res.json({
            ok: true,
            messageId: r.messageId,
            channel: "ses" as const,
            from: fromEmailForLog
          });
        } catch (e: unknown) {
          const msg = String((e as Error)?.message ?? e);
          return res.status(500).json({
            ok: false,
            message: `SES 测试发送失败：${msg}。请确认发件域名已在 AWS 侧验证，或暂时改用下方 SMTP 默认邮箱测试。`
          });
        }
      }
    }

    const profile = await pickSmtpProfileByOptionalId(db, tenantId, smtpProfileId ?? null);
    if (!profile) {
      return res.status(400).json({
        ok: false,
        message: smtpProfileId
          ? "未找到该 SMTP 配置（可能已删除或不属于当前账号）。"
          : "暂无可用的测试发件方式：请在上方完成「发件域名」验证并添加「发件邮箱」，或在「邮件服务商配置（SMTP）」中添加邮箱并设为默认。"
      });
    }

    /** 优先级：SMTP 邮箱自带 display_name > 显式选的发件人资料 > 不设显示名 */
    const effectiveDisplayName = profile.display_name?.trim() || sender?.display_name || null;
    const fromAddress = effectiveDisplayName
      ? `${effectiveDisplayName} <${profile.from_email}>`
      : profile.from_email;
    /** Reply-To 同样的优先级；若两者都没有，发件邮箱本身就是回信邮箱 */
    const replyTo = (profile.reply_to?.trim() || sender?.reply_to || "").toString().trim();

    const pass = decryptSecret(profile.password_enc);
    const transporter = nodemailer.createTransport(
      nodemailerTransportFromSmtpRow(profile, { user: resolveSmtpAuthUser(profile), pass }, {
        /** 避免连不上 SMTP 时长时间挂起，触发 Nginx/Vite 先返回 502 且前端只能看到泛化网关提示 */
        connectionTimeout: 20_000,
        socketTimeout: 45_000,
        /** 部分公网 SMTP（含 587 STARTTLS）首包较慢，默认过短会误报 Greeting never received */
        greetingTimeout: 30_000
      })
    );

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        ...(replyTo ? { replyTo } : {}),
        to,
        subject: "BigSocialBoss 测试邮件（SMTP）",
        text: "如果你收到这封邮件，说明 SMTP 配置可用。",
        html: "<p>如果你收到这封邮件，说明 <b>SMTP</b> 配置可用。</p>"
      });
      res.json({
        ok: true,
        messageId: info.messageId,
        channel: "smtp" as const,
        from: String(profile.from_email ?? "")
      });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      let hint = "";
      if (/not exist in redis/i.test(msg)) {
        hint +=
          " 腾讯云邮件推送：请在控制台「邮件配置 → 发信地址」对该发信地址点「设置 SMTP 密码」并保存；SMTP 登录名一般为该发信邮箱全称（与控制台一致）。个人认证账号若公告限制 SMTP，请改用 API 发信或升级企业认证。";
      }
      if (/Greeting never received/i.test(msg)) {
        hint +=
          " 587 端口若超时：多为出网被拦或链路问题，可改 465+SSL；并确认主机为 smtp.qcloudmail.com（或控制台要求的 gz-smtp… 等区域主机）。";
      }
      res.status(500).json({
        ok: false,
        message: `SMTP 测试失败：${msg}。请核对服务器/端口/SSL、账号密码，并确认部署机网络能访问该 SMTP（防火墙或安全组未拦 outbound）。${hint}`
      });
    }
  });

  app.post("/api/email/imap/test", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = z
      .object({
        smtpProfileId: z.coerce.number().int().positive().optional(),
        host: z.string().optional(),
        port: z.coerce.number().int().min(1).max(65535).optional(),
        secure: z.boolean().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        mailbox: z.string().optional()
      })
      .parse(req.body ?? {});

    let host = String(body.host ?? "").trim();
    let port = body.port != null ? Number(body.port) : 993;
    let secure = body.secure == null ? true : Boolean(body.secure);
    let username = String(body.username ?? "").trim();
    let password = String(body.password ?? "").trim();
    let mailbox = String(body.mailbox ?? "").trim() || "INBOX";

    if (body.smtpProfileId && body.smtpProfileId > 0) {
      const [rows] = await db.query(
        `SELECT imap_host, imap_port, imap_secure, imap_username, imap_password_enc, imap_mailbox
           FROM smtp_profiles
          WHERE id = ? AND tenant_id = ?
          LIMIT 1`,
        [body.smtpProfileId, tenantId]
      );
      const row = (rows as any[])[0];
      if (!row) return res.status(404).json({ ok: false, message: "邮箱配置不存在" });
      if (!host) host = String(row.imap_host ?? "").trim();
      if (!body.port && Number(row.imap_port ?? 0) > 0) port = Number(row.imap_port);
      if (body.secure == null) secure = Number(row.imap_secure ?? 1) === 1;
      if (!username) username = String(row.imap_username ?? "").trim();
      if (!password) {
        const enc = String(row.imap_password_enc ?? "").trim();
        if (enc) password = decryptSecret(enc);
      }
      if (!body.mailbox) mailbox = String(row.imap_mailbox ?? "").trim() || "INBOX";
    }

    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, message: "请填写完整 IMAP 配置（host/username/password）" });
    }

    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user: username, pass: password },
        logger: false
      });
      await client.connect();
      const lock = await client.getMailboxLock(mailbox);
      lock.release();
      await client.logout().catch(() => undefined);
      return res.json({ ok: true, message: `IMAP 连接成功（${mailbox}）` });
    } catch (e: unknown) {
      return res.status(400).json({ ok: false, message: `IMAP 连接失败：${String((e as Error)?.message ?? e)}` });
    }
  });

  app.get("/api/email/domain-auth", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(
      `SELECT tenant_id, domain, spf_status, dkim_status, dmarc_status, notes, last_checked_at, updated_at
       FROM email_domain_auth_checks
       WHERE tenant_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 200`,
      [tenantId]
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/email/domain-auth", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = z
      .object({
        domain: z.string().min(1).max(255),
        spfStatus: z.enum(DOMAIN_AUTH_STATUS),
        dkimStatus: z.enum(DOMAIN_AUTH_STATUS),
        dmarcStatus: z.enum(DOMAIN_AUTH_STATUS),
        notes: z.string().max(5000).optional()
      })
      .parse(req.body ?? {});
    await db.query(
      `INSERT INTO email_domain_auth_checks
       (tenant_id, domain, spf_status, dkim_status, dmarc_status, notes, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         domain = VALUES(domain),
         spf_status = VALUES(spf_status),
         dkim_status = VALUES(dkim_status),
         dmarc_status = VALUES(dmarc_status),
         notes = VALUES(notes),
         last_checked_at = NOW()`,
      [tenantId, body.domain.trim().toLowerCase(), body.spfStatus, body.dkimStatus, body.dmarcStatus, body.notes ?? null]
    );
    res.json({ ok: true });
  });

  app.delete("/api/email/domain-auth", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const q = z
      .object({
        domain: z.string().min(1).max(255)
      })
      .parse(req.query ?? {});
    await db.query(`DELETE FROM email_domain_auth_checks WHERE tenant_id = ? AND domain = ?`, [
      tenantId,
      q.domain.trim().toLowerCase()
    ]);
    res.json({ ok: true });
  });

  // =========================
  // 发信通道设置 - IP 池管理
  // =========================

  app.get("/api/email/ip-pools", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(
      `SELECT id, tenant_id, managed_by, period_start, period_end, package_label, label, type, host, port, username, is_enabled, last_used_at, updated_at
         FROM email_outbound_ip_pools
        WHERE tenant_id = ?
        ORDER BY managed_by ASC, is_enabled DESC, updated_at DESC, id DESC
        LIMIT 500`,
      [tenantId]
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/email/ip-pools", async (req, res) => {
    const schema = z.object({
      id: z.coerce.number().int().positive().optional(),
      label: z.string().max(64).optional(),
      type: z.enum(["direct", "http", "socks5"]),
      host: z.string().min(1).max(255),
      port: z.coerce.number().int().min(1).max(65535),
      username: z.string().max(255).optional(),
      password: z.string().max(512).optional(),
      isEnabled: z.boolean().default(true)
    });
    const tenantId = resolveTenantId(req);
    const body = schema.parse(req.body ?? {});
    const passwordEnc = body.password ? encryptSecret(body.password) : null;

    if (body.id) {
      const [[ch]] = await db.query(
        `SELECT managed_by FROM email_outbound_ip_pools WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [body.id, tenantId]
      );
      const managed = String((ch as any)?.managed_by ?? "user");
      if (managed === "admin") {
        return res.status(403).json({ ok: false, message: "官方代配的 IP 通道仅可由管理后台维护，不可在此编辑" });
      }
      // update
      const fields: string[] = [
        "label = ?",
        "type = ?",
        "host = ?",
        "port = ?",
        "username = ?",
        "is_enabled = ?"
      ];
      const params: any[] = [
        body.label?.trim() || null,
        body.type,
        body.host.trim(),
        body.port,
        body.username?.trim() || null,
        body.isEnabled ? 1 : 0
      ];
      if (body.password !== undefined) {
        fields.push("password_enc = ?");
        params.push(passwordEnc);
      }
      params.push(body.id, tenantId);
      await db.query(`UPDATE email_outbound_ip_pools SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
      return res.json({ ok: true, id: body.id });
    }

    const [result] = await db.query(
      `INSERT INTO email_outbound_ip_pools (tenant_id, managed_by, label, type, host, port, username, password_enc, is_enabled)
       VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        body.label?.trim() || null,
        body.type,
        body.host.trim(),
        body.port,
        body.username?.trim() || null,
        passwordEnc,
        body.isEnabled ? 1 : 0
      ]
    );
    res.json({ ok: true, id: (result as any).insertId });
  });

  app.delete("/api/email/ip-pools/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [[ch]] = await db.query(
      `SELECT managed_by FROM email_outbound_ip_pools WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    if (!(ch as any)?.managed_by) {
      return res.status(404).json({ ok: false, message: "通道不存在" });
    }
    if (String((ch as any).managed_by) === "admin") {
      return res.status(403).json({ ok: false, message: "官方代配的 IP 通道不可删除" });
    }
    await db.query(`DELETE FROM email_outbound_ip_pools WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    res.json({ ok: true });
  });

  /** 邮件模版页：组装 HTML 并发送测试；可选 sesSenderAddressId / smtpProfileId（二选一），均未指定时按默认 SES→SMTP */
  const testSendTemplateSchema = z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    bodyHtml: z.string().min(1),
    signatureHtml: z.string().optional(),
    templateId: z.coerce.number().int().positive().optional(),
    sesSenderAddressId: z.coerce.number().int().positive().optional(),
    smtpProfileId: z.coerce.number().int().positive().optional(),
    senderProfileId: z.coerce.number().int().positive().optional()
  });

  app.post("/api/email/test-send", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = testSendTemplateSchema.parse(req.body ?? {});

    const explicitSesId = body.sesSenderAddressId != null && body.sesSenderAddressId > 0;
    const explicitSmtpId = body.smtpProfileId != null && body.smtpProfileId > 0;
    if (explicitSesId && explicitSmtpId) {
      return res.status(400).json({
        ok: false,
        message: "请勿同时指定 SES 发件邮箱与 SMTP 邮箱。"
      });
    }

    /** 模版页已明确选 SES/SMTP 邮箱时，不再自动叠加租户默认「通用发件人资料」，避免盖住邮箱上的显示名（如 market@… 旁的 us factorybridge） */
    const userExplicitMailboxChoice = explicitSesId || explicitSmtpId;
    const sender = await pickSenderProfileByOptionalId(db, tenantId, body.senderProfileId ?? null, {
      useTenantDefaultWhenUnspecified: !userExplicitMailboxChoice
    });

    const html = assembleTemplateEmailHtml(body.bodyHtml, body.signatureHtml);
    const demoLinks = getComplianceDemoLinks();
    const wechatReadFallback = await resolveWechatReadUrlForTemplate(db, tenantId, body.templateId ?? null);
    const htmlWithCompliance = decorateHtmlWithComplianceLinks(
      html,
      demoLinks.unsubscribeUrl,
      demoLinks.complaintUrl,
      demoLinks.subscribeUrl,
      wechatReadFallback
    );
    const text =
      html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || body.subject;

    if (explicitSesId) {
      const sesAddr = await pickSesSenderAddressByIdForTest(db, tenantId, body.sesSenderAddressId!);
      if (!sesAddr) {
        return res.status(400).json({
          ok: false,
          message:
            "指定的 SES 发件邮箱不可用（不存在、不属于当前账号或域名未验证）。请在「设置 · 邮件 → 巨量邮箱配置」核对发件域名与发件邮箱。"
        });
      }
      const effectiveDisplayName =
        sender?.display_name?.trim() || sesAddr.displayName?.trim() || null;
      const fromEmailForLog = sesAddr.fromEmail;
      const fromAddress = effectiveDisplayName
        ? `${effectiveDisplayName} <${fromEmailForLog}>`
        : fromEmailForLog;
      const replyTo = (sender?.reply_to ?? sesAddr.replyTo ?? "").toString().trim();
      try {
        const r = await sesSendEmail({
          fromAddress,
          toAddresses: [body.to],
          replyToAddress: replyTo || undefined,
          subject: `[测试] ${body.subject}`,
          htmlBody: htmlWithCompliance,
          textBody: text,
          tags: {
            bss_tenant_id: String(tenantId),
            bss_test: "template_ui",
            bss_ses_sender_id: String(sesAddr.id)
          }
        });
        return res.json({ ok: true, messageId: r.messageId, channel: "ses" as const });
      } catch (e: unknown) {
        const msg = String((e as Error)?.message ?? e);
        return res.status(500).json({
          ok: false,
          message: `SES 测试发送失败：${msg}`
        });
      }
    }

    if (!explicitSmtpId) {
      const sesAddr = await pickDefaultSesSenderAddressForTest(db, tenantId);
      if (sesAddr) {
        const effectiveDisplayName =
          sender?.display_name?.trim() || sesAddr.displayName?.trim() || null;
        const fromEmailForLog = sesAddr.fromEmail;
        const fromAddress = effectiveDisplayName
          ? `${effectiveDisplayName} <${fromEmailForLog}>`
          : fromEmailForLog;
        const replyTo = (sender?.reply_to ?? sesAddr.replyTo ?? "").toString().trim();
        try {
          const r = await sesSendEmail({
            fromAddress,
            toAddresses: [body.to],
            replyToAddress: replyTo || undefined,
            subject: `[测试] ${body.subject}`,
            htmlBody: htmlWithCompliance,
            textBody: text,
            tags: {
              bss_tenant_id: String(tenantId),
              bss_test: "template_ui",
              bss_ses_sender_id: String(sesAddr.id)
            }
          });
          return res.json({ ok: true, messageId: r.messageId, channel: "ses" as const });
        } catch (e: unknown) {
          const msg = String((e as Error)?.message ?? e);
          return res.status(500).json({
            ok: false,
            message: `SES 测试发送失败：${msg}`
          });
        }
      }
    }

    const profile = await pickSmtpProfileByOptionalId(db, tenantId, explicitSmtpId ? body.smtpProfileId : null);
    if (!profile) {
      // dnrpj.cn 定制：无 SMTP 配置时直接走发信机（用最新的一台），不再提示配置
      const [dsRows] = await db.query(
        `SELECT id, relay_ip, sender_domain, from_email FROM email_dedicated_servers WHERE tenant_id = ? AND status NOT IN ('cancelled','deleted') ORDER BY id DESC LIMIT 1`,
        [tenantId]
      );
      const dsRow = (dsRows as Array<{ id: number; relay_ip: string | null; sender_domain: string | null; from_email: string | null }>)[0];
      if (!dsRow?.id) {
        return res.status(400).json({
          ok: false,
          message: "发信机未配置，请联系管理员。"
        });
      }
      const dsHost = String(dsRow?.relay_ip ?? "").trim() || process.env.DAILY_MAILBOX_SMTP_HOST || "";
      let dsPass = "";
      try {
        const resolved = await resolveDedicatedSmtpPlainPassword(db, Number(dsRow.id), { allowAutoGenerate: false });
        dsPass = resolved.password;
      } catch { /* ignore */ }
      dsPass = dsPass || process.env.DAILY_MAILBOX_PASSWORD || "";
      const dsFrom = String(dsRow?.from_email ?? "").trim() || (dsRow?.sender_domain ? `marketing@${dsRow.sender_domain}` : "marketing@dnrpj.cn");
      if (!dsHost || !dsPass) {
        return res.status(400).json({
          ok: false,
          message: "发信机未配置，请联系管理员。"
        });
      }
      try {
        const transporter = nodemailer.createTransport({
          host: dsHost,
          port: 587,
          secure: false,
          auth: { user: dsFrom, pass: dsPass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 20_000,
          socketTimeout: 45_000
        });
        const inlineMail = prepareSmtpHtmlWithInlineUploadImages(htmlWithCompliance);
        const info = await transporter.sendMail({
          from: dsFrom,
          to: body.to,
          subject: `[测试] ${body.subject}`,
          text,
          html: inlineMail.html,
          ...(inlineMail.attachments?.length ? { attachments: inlineMail.attachments } : {})
        });
        try { transporter.close(); } catch {}
        return res.json({ ok: true, messageId: info.messageId, channel: "dedicated" as const });
      } catch (e: unknown) {
        const msg = String((e as Error)?.message ?? e);
        return res.status(500).json({
          ok: false,
          message: `测试发送失败：${msg}`
        });
      }
    }

    /** SMTP 邮箱自带 display_name 优先；否则回退选定/默认发件人资料 */
    const effectiveDisplayName = profile.display_name?.trim() || sender?.display_name || null;
    const fromAddress = effectiveDisplayName
      ? `${effectiveDisplayName} <${profile.from_email}>`
      : profile.from_email;
    const replyTo = (profile.reply_to?.trim() || sender?.reply_to || "").toString().trim();

    const pass = decryptSecret(profile.password_enc);
    const transporter = nodemailer.createTransport(
      nodemailerTransportFromSmtpRow(profile, { user: resolveSmtpAuthUser(profile), pass }, {
        connectionTimeout: 20_000,
        socketTimeout: 45_000
      })
    );

    try {
      const inlineMail = prepareSmtpHtmlWithInlineUploadImages(htmlWithCompliance);
      const info = await transporter.sendMail({
        from: fromAddress,
        ...(replyTo ? { replyTo } : {}),
        to: body.to,
        subject: `[测试] ${body.subject}`,
        text,
        html: inlineMail.html,
        ...(inlineMail.attachments?.length ? { attachments: inlineMail.attachments } : {})
      });

      return res.json({ ok: true, messageId: info.messageId, channel: "smtp" as const });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      return res.status(500).json({
        ok: false,
        message: `SMTP 测试发送失败：${msg}。请核对 SMTP 账号、密码、服务器、端口和 SSL 设置；认证失败不会影响网站登录和其它页面。`
      });
    } finally {
      try {
        transporter.close();
      } catch {
        /* ignore */
      }
    }
  });

  app.get("/api/email/sender", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(
      `SELECT id, display_name, reply_to, website, phone, telegram, is_default, created_at, updated_at
       FROM sender_profiles
       WHERE tenant_id = ?
       ORDER BY is_default DESC, id DESC
       LIMIT 20`,
      [tenantId]
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/email/sender", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = senderUpsertSchema.parse(req.body);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const shouldBeDefault = Boolean(body.makeDefault);
      if (shouldBeDefault) {
        await conn.query(`UPDATE sender_profiles SET is_default = 0 WHERE tenant_id = ?`, [tenantId]);
      }
      let id = body.id ?? 0;
      if (body.id) {
        const [existsRows] = await conn.query(`SELECT id FROM sender_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`, [
          body.id,
          tenantId
        ]);
        if (!(existsRows as any[])[0]) {
          await conn.rollback();
          return res.status(404).json({ ok: false, message: "发件人资料不存在" });
        }
        const [result] = await conn.query(
          `UPDATE sender_profiles
             SET display_name = ?, reply_to = ?, website = ?, phone = ?, telegram = ?, is_default = ?
           WHERE id = ? AND tenant_id = ?`,
          [
            body.displayName,
            body.replyTo ?? null,
            body.website ?? null,
            body.phone ?? null,
            body.telegram ?? null,
            shouldBeDefault ? 1 : 0,
            body.id,
            tenantId
          ]
        );
        if (Number((result as any).affectedRows ?? 0) === 0) {
          await conn.rollback();
          return res.status(404).json({ ok: false, message: "发件人资料不存在" });
        }
        id = body.id;
      } else {
        const [cntRows] = await conn.query(`SELECT COUNT(*) as c FROM sender_profiles WHERE tenant_id = ?`, [tenantId]);
        const existingCount = Number((cntRows as any[])[0]?.c ?? 0);
        const [result] = await conn.query(
          `INSERT INTO sender_profiles (tenant_id, display_name, reply_to, website, phone, telegram, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            body.displayName,
            body.replyTo ?? null,
            body.website ?? null,
            body.phone ?? null,
            body.telegram ?? null,
            shouldBeDefault || existingCount === 0 ? 1 : 0
          ]
        );
        id = (result as any).insertId as number;
      }
      await conn.commit();
      res.json({ ok: true, id });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.delete("/api/email/sender/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(`SELECT id, is_default FROM sender_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`, [
        id,
        tenantId
      ]);
      const item = (rows as any[])[0];
      if (!item) {
        await conn.rollback();
        return res.status(404).json({ ok: false, message: "发件人资料不存在" });
      }
      await conn.query(`DELETE FROM sender_profiles WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
      if (Number(item.is_default) === 1) {
        await conn.query(`UPDATE sender_profiles SET is_default = 1 WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`, [tenantId]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.get("/api/email/contacts", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const businessLine = typeof req.query.businessLine === "string" ? req.query.businessLine : "";
    const industry = typeof req.query.industry === "string" ? req.query.industry.trim() : "";
    const groupIdRaw = typeof req.query.groupId === "string" ? req.query.groupId : "";
    const groupId = groupIdRaw ? Number(groupIdRaw) : NaN;
    const pageRaw = typeof req.query.page === "string" ? req.query.page : "";
    const pageSizeRaw = typeof req.query.pageSize === "string" ? req.query.pageSize : "";
    const page = /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;
    let pageSize = /^\d+$/.test(pageSizeRaw) ? Number(pageSizeRaw) : 50;
    if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 50;
    pageSize = Math.min(100, pageSize);
    const offset = (page - 1) * pageSize;

    const where: string[] = ["c.tenant_id = ?"];
    const params: any[] = [tenantId];
    if (q) {
      where.push(
        `(c.email LIKE ? OR c.company LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.job_title LIKE ?)`
      );
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    if (businessLine && businessLine !== "all") {
      where.push(`(c.business_line = ? OR c.business_line IS NULL)`);
      params.push(businessLine);
    }
    if (industry) {
      where.push(`c.industry LIKE ?`);
      params.push(`%${industry}%`);
    }
    if (Number.isFinite(groupId) && groupId > 0) {
      where.push(
        `EXISTS (SELECT 1 FROM email_contact_groups ecg_f WHERE ecg_f.contact_id = c.id AND ecg_f.group_id = ?)`
      );
      params.push(groupId);
    }

    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS cnt FROM email_contacts c${whereSql}`;
    const [countRows] = await db.query(countSql, params);
    const total = Number((countRows as { cnt: unknown }[])[0]?.cnt ?? 0);

    const sql =
      `SELECT c.id, c.email, c.first_name, c.last_name, c.company, c.country, c.industry, c.phone, c.fax, c.address, c.job_title,
        c.website, c.linkedin, c.instagram, c.facebook, c.email_status,
        c.business_line, c.status, c.created_at,
        (SELECT GROUP_CONCAT(cg.name ORDER BY cg.name SEPARATOR '、')
         FROM email_contact_groups ecgf
         JOIN contact_groups cg ON cg.id = ecgf.group_id
         WHERE ecgf.contact_id = c.id) AS group_labels
       FROM email_contacts c` +
      whereSql +
      ` ORDER BY c.id DESC LIMIT ? OFFSET ?`;

    const [rows] = await db.query(sql, [...params, pageSize, offset]);
    res.json({ ok: true, items: rows, total, page, pageSize });
  });

  /** CRM 数据库 · 按页码区间导出（与列表同筛选；单次最多 1 万条，每页 50 条） */
  app.get("/api/email/contacts/export-range", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const industry = typeof req.query.industry === "string" ? req.query.industry.trim() : "";
    const fromPageRaw = typeof req.query.fromPage === "string" ? req.query.fromPage : "1";
    const toPageRaw = typeof req.query.toPage === "string" ? req.query.toPage : "1";
    const exportPageSize = 50;
    const exportMaxRows = 10_000;
    const exportMaxPages = exportMaxRows / exportPageSize;
    let fromPage = /^\d+$/.test(fromPageRaw) ? Math.max(1, Number(fromPageRaw)) : 1;
    let toPage = /^\d+$/.test(toPageRaw) ? Math.max(1, Number(toPageRaw)) : fromPage;
    if (toPage < fromPage) {
      const t = fromPage;
      fromPage = toPage;
      toPage = t;
    }

    const where: string[] = ["c.tenant_id = ?"];
    const params: unknown[] = [tenantId];
    if (q) {
      where.push(
        `(c.email LIKE ? OR c.company LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.job_title LIKE ?)`
      );
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    if (industry) {
      where.push(`c.industry LIKE ?`);
      params.push(`%${industry}%`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS cnt FROM email_contacts c${whereSql}`;
    const [countRows] = await db.query(countSql, params);
    const total = Number((countRows as { cnt: unknown }[])[0]?.cnt ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / exportPageSize));
    fromPage = Math.min(fromPage, totalPages);
    toPage = Math.min(toPage, totalPages);
    if (toPage < fromPage) toPage = fromPage;

    let spanPages = toPage - fromPage + 1;
    let capped = false;
    if (spanPages > exportMaxPages) {
      toPage = fromPage + exportMaxPages - 1;
      spanPages = exportMaxPages;
      capped = true;
    }
    let limit = spanPages * exportPageSize;
    if (limit > exportMaxRows) {
      limit = exportMaxRows;
      capped = true;
    }
    const offset = (fromPage - 1) * exportPageSize;
    const remaining = Math.max(0, total - offset);
    if (limit > remaining) {
      limit = remaining;
    }

    const sql =
      `SELECT c.id, c.email, c.first_name, c.last_name, c.company, c.country, c.industry, c.phone, c.fax, c.address, c.job_title,
        c.website, c.linkedin, c.instagram, c.facebook, c.email_status,
        c.business_line, c.status, c.created_at
       FROM email_contacts c` +
      whereSql +
      ` ORDER BY c.id DESC LIMIT ? OFFSET ?`;
    const [rows] = await db.query(sql, [...params, limit, offset]);
    const items = rows as unknown[];
    return res.json({
      ok: true,
      items,
      total,
      fromPage,
      toPage,
      exported: items.length,
      capped
    });
  });

  async function buildIndustryContactCountMap(tenantId: number, groupIds: number[]): Promise<Map<string, number>> {
    return countDistinctEmailsByIndustryMap(db, {
      tenantId,
      groupIds,
      sendPipelineMatch: true
    });
  }

  async function buildIndustryCrmCatalogMap(tenantId: number, groupIds: number[]): Promise<Map<string, number>> {
    return countDistinctEmailsByIndustryCrmCatalogMap(db, {
      tenantId,
      groupIds
    });
  }

  app.get("/api/email/contacts/industry-counts", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const groupIdsRaw = typeof req.query.groupIds === "string" ? req.query.groupIds.trim() : "";
    let groupIds: number[] = [];
    if (groupIdsRaw) {
      groupIds = groupIdsRaw
        .split(",")
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    const lite =
      req.query.lite === "1" ||
      req.query.lite === "true" ||
      req.query.sendable === "0";
    const catalogMap = await buildIndustryCrmCatalogMap(tenantId, groupIds);
    if (lite) {
      const items = buildIndustryCatalogListItems(catalogMap, new Map());
      return res.json({ ok: true, lite: true, items });
    }
    const countMap = await buildIndustryContactCountMap(tenantId, groupIds);
    const tagsRaw = typeof req.query.tags === "string" ? req.query.tags.trim() : "";
    const requestedTags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const items =
      requestedTags.length > 0
        ? attachCrmCountsToIndustryItems(buildIndustryCountItems(requestedTags, countMap), catalogMap)
        : buildIndustryCatalogListItems(catalogMap, countMap);
    res.json({ ok: true, items });
  });

  app.post("/api/email/contacts/industry-counts", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = z
      .object({
        tags: z.array(z.string().min(1).max(128)).max(500).optional(),
        groupIds: z.array(z.number().int().positive()).max(100).optional()
      })
      .parse(req.body ?? {});
    const groupIds = (body.groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const [catalogMap, countMap] = await Promise.all([
      buildIndustryCrmCatalogMap(tenantId, groupIds),
      buildIndustryContactCountMap(tenantId, groupIds)
    ]);
    const requestedTags = (body.tags ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
    const items =
      requestedTags.length > 0
        ? attachCrmCountsToIndustryItems(buildIndustryCountItems(requestedTags, countMap), catalogMap)
        : buildIndustryCatalogListItems(catalogMap, countMap);
    res.json({ ok: true, items });
  });

  app.post("/api/email/contacts/sync-from-leads", async (req, res) => {
    const authEmail = String(req?.auth?.email ?? "")
      .trim()
      .toLowerCase();
    if (authEmail !== "2415022172@qq.com") {
      return res.status(403).json({ ok: false, message: "仅指定管理员账号可执行该同步操作。" });
    }

    const tenantId = resolveTenantId(req);
    const bodySchema = z
      .object({
        includeGlobalPool: z.boolean().optional().default(true),
        includeCurrentTenant: z.boolean().optional().default(true)
      })
      .default({});
    const body = bodySchema.parse(req.body ?? {});

    const sourceTenantIds: number[] = [];
    if (body.includeGlobalPool) sourceTenantIds.push(1);
    if (body.includeCurrentTenant && tenantId !== 1) sourceTenantIds.push(tenantId);
    if (tenantId === 1 && body.includeCurrentTenant) sourceTenantIds.push(1);
    const uniqSource = Array.from(new Set(sourceTenantIds)).filter((x) => Number.isFinite(x) && x > 0);
    if (uniqSource.length === 0) {
      return res.status(400).json({ ok: false, message: "请至少选择一个来源（全局库/当前租户）。" });
    }

    const placeholders = uniqSource.map(() => "?").join(",");
    const [statRows] = await db.query(
      `SELECT COUNT(*) AS totalRows,
              COUNT(DISTINCT LOWER(TRIM(primary_email))) AS uniqueEmails
         FROM leads
        WHERE tenant_id IN (${placeholders})
          AND primary_email IS NOT NULL
          AND TRIM(primary_email) <> ''`,
      uniqSource
    );
    const totalRows = Number((statRows as any[])[0]?.totalRows ?? 0);
    const uniqueEmails = Number((statRows as any[])[0]?.uniqueEmails ?? 0);

    const [insertResult] = await db.query(
      `INSERT IGNORE INTO email_contacts
       (tenant_id, email, first_name, last_name, company, country, industry, phone, fax, address, job_title, website, email_status, business_line, status)
       SELECT
         ? AS tenant_id,
         LOWER(TRIM(src.primary_email)) AS email,
         NULLIF(TRIM(src.contact_name), '') AS first_name,
         NULL AS last_name,
         NULLIF(TRIM(src.company_name), '') AS company,
         NULLIF(TRIM(src.country), '') AS country,
         NULLIF(TRIM(src.industry), '') AS industry,
         NULLIF(TRIM(src.phone), '') AS phone,
         NULLIF(TRIM(src.fax), '') AS fax,
         NULLIF(TRIM(src.address), '') AS address,
         NULLIF(TRIM(src.job_title), '') AS job_title,
         NULLIF(TRIM(src.website), '') AS website,
         NULLIF(TRIM(src.email_status), '') AS email_status,
         'leads_sync' AS business_line,
         'active' AS status
       FROM leads src
       JOIN (
         SELECT MAX(id) AS id
           FROM leads
          WHERE tenant_id IN (${placeholders})
            AND primary_email IS NOT NULL
            AND TRIM(primary_email) <> ''
          GROUP BY LOWER(TRIM(primary_email))
       ) picked ON picked.id = src.id`,
      [tenantId, ...uniqSource]
    );

    const inserted = Number((insertResult as any)?.affectedRows ?? 0);
    const skipped = Math.max(0, uniqueEmails - inserted);
    return res.json({
      ok: true,
      tenantId,
      sourceTenantIds: uniqSource,
      totalRows,
      uniqueEmails,
      inserted,
      skipped
    });
  });

  /** 幂等写入演示数据；生产环境默认关闭，需设置 ALLOW_CRM_DEMO_SEED=1 */
  
  app.post("/api/email/contacts", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = contactCreateSchema.parse(req.body);
    const tagsJson = body.tags ? JSON.stringify(body.tags) : null;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existingRows] = await conn.query(`SELECT id, tenant_id FROM email_contacts WHERE email = ? LIMIT 1`, [body.email]);
      const existing = (existingRows as any[])[0];
      if (existing && Number(existing.tenant_id) !== tenantId) {
        await conn.rollback();
        return res.status(409).json({
          ok: false,
          message: "该邮箱已存在于其他工作区，当前版本暂不支持跨工作区重复同一邮箱联系人。"
        });
      }
      const emailStatusDb = body.emailStatus ?? null;
      await conn.query(
        `INSERT INTO email_contacts (tenant_id, email, first_name, last_name, company, country, industry, phone, fax, address, job_title, website, linkedin, instagram, facebook, email_status, business_line, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE
          tenant_id = VALUES(tenant_id),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           company = VALUES(company),
           country = VALUES(country),
           industry = VALUES(industry),
           phone = VALUES(phone),
           fax = VALUES(fax),
           address = VALUES(address),
           job_title = VALUES(job_title),
           website = VALUES(website),
           linkedin = VALUES(linkedin),
           instagram = VALUES(instagram),
           facebook = VALUES(facebook),
           email_status = VALUES(email_status),
           business_line = VALUES(business_line),
           tags_json = VALUES(tags_json)`,
        [
          tenantId,
          body.email,
          body.firstName ?? null,
          body.lastName ?? null,
          body.company ?? null,
          body.country ?? null,
          body.industry ?? null,
          body.phone ?? null,
          body.fax ?? null,
          body.address ?? null,
          body.jobTitle ?? null,
          body.website ?? null,
          body.linkedin ?? null,
          body.instagram ?? null,
          body.facebook ?? null,
          emailStatusDb,
          body.businessLine ?? null,
          tagsJson
        ]
      );

      const [idRows] = await conn.query(`SELECT id FROM email_contacts WHERE email = ? AND tenant_id = ? LIMIT 1`, [
        body.email,
        tenantId
      ]);
      const contactId = Number((idRows as { id: number }[])[0]?.id);

      if (contactId && body.groupIds !== undefined) {
        await conn.query(`DELETE FROM email_contact_groups WHERE contact_id = ?`, [contactId]);
        for (const gid of body.groupIds) {
          await conn.query(`INSERT IGNORE INTO email_contact_groups (tenant_id, contact_id, group_id) VALUES (?, ?, ?)`, [
            tenantId,
            contactId,
            gid
          ]);
        }
      }

      await conn.commit();
      res.json({ ok: true, id: contactId > 0 ? contactId : undefined });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.post("/api/email/contacts/import", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const schema = z.object({
      contacts: z.array(z.record(z.unknown())).min(1).max(5000)
    });
    const { contacts: rawContacts } = schema.parse(req.body);

    let imported = 0;
    let rejected = 0;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const raw of rawContacts) {
        const parsed = contactCreateSchema.safeParse(raw);
        if (!parsed.success) {
          rejected += 1;
          continue;
        }
        const c = parsed.data;
        try {
          const tagsJson = c.tags ? JSON.stringify(c.tags) : null;
          const emailStatusImp = c.emailStatus ?? null;
          await conn.query(
            `INSERT INTO email_contacts (tenant_id, email, first_name, last_name, company, country, industry, phone, fax, address, job_title, website, linkedin, instagram, facebook, email_status, business_line, tags_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              tenant_id = VALUES(tenant_id),
              first_name = VALUES(first_name),
              last_name = VALUES(last_name),
              company = VALUES(company),
              country = VALUES(country),
              industry = VALUES(industry),
              phone = VALUES(phone),
              fax = VALUES(fax),
              address = VALUES(address),
              job_title = VALUES(job_title),
              website = VALUES(website),
              linkedin = VALUES(linkedin),
              instagram = VALUES(instagram),
              facebook = VALUES(facebook),
              email_status = VALUES(email_status),
              business_line = VALUES(business_line),
              tags_json = VALUES(tags_json)`,
            [
              tenantId,
              c.email,
              c.firstName ?? null,
              c.lastName ?? null,
              c.company ?? null,
              c.country ?? null,
              c.industry ?? null,
              c.phone ?? null,
              c.fax ?? null,
              c.address ?? null,
              c.jobTitle ?? null,
              c.website ?? null,
              c.linkedin ?? null,
              c.instagram ?? null,
              c.facebook ?? null,
              emailStatusImp,
              c.businessLine ?? null,
              tagsJson
            ]
          );

          const [idRows] = await conn.query(
            `SELECT id FROM email_contacts WHERE email = ? AND tenant_id = ? LIMIT 1`,
            [c.email, tenantId]
          );
          const contactId = Number((idRows as { id: number }[])[0]?.id ?? 0);

          if (contactId && c.groupIds !== undefined) {
            for (const gid of c.groupIds) {
              await conn.query(
                `INSERT IGNORE INTO email_contact_groups (tenant_id, contact_id, group_id) VALUES (?, ?, ?)`,
                [tenantId, contactId, gid]
              );
            }
          }
          imported += 1;
        } catch (e: any) {
          rejected += 1;
          console.warn("[email] contacts/import row failed:", c.email, e?.message ?? e);
        }
      }
      await conn.commit();
      res.json({ ok: true, imported, rejected });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  app.get("/api/email/contacts/:id/groups", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const contactId = z.coerce.number().int().positive().parse(req.params.id);
    const [rows] = await db.query(`SELECT group_id FROM email_contact_groups WHERE tenant_id = ? AND contact_id = ?`, [
      tenantId,
      contactId
    ]);
    res.json({ ok: true, groupIds: (rows as any[]).map((r) => r.group_id) });
  });

  app.put("/api/email/contacts/:id/groups", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const contactId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({ groupIds: z.array(z.number().int().positive()) }).parse(req.body);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM email_contact_groups WHERE tenant_id = ? AND contact_id = ?`, [tenantId, contactId]);
      for (const gid of body.groupIds) {
        await conn.query(`INSERT INTO email_contact_groups (tenant_id, contact_id, group_id) VALUES (?, ?, ?)`, [
          tenantId,
          contactId,
          gid
        ]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e: any) {
      await conn.rollback();
      res.status(500).json({ ok: false, message: String(e?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  /** 按行业永久删除该租户下全部 CRM 联系人（与单条删除相同的关联表清理） */
  app.post("/api/email/contacts/purge-by-industry", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { industry } = z.object({ industry: z.string().min(1).max(200) }).parse(req.body ?? {});
    const ind = String(industry ?? "").trim();
    if (!ind) {
      return res.status(400).json({ ok: false, message: "行业不能为空" });
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [idRows] = await conn.query(
        `SELECT id FROM email_contacts WHERE tenant_id = ? AND TRIM(industry) = ?`,
        [tenantId, ind]
      );
      const ids = (idRows as { id: unknown }[])
        .map((r) => Number(r.id))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) {
        await conn.commit();
        return res.json({ ok: true, industry: ind, deleted: 0 });
      }
      const ph = ids.map(() => "?").join(",");
      await conn.query(`DELETE FROM email_contact_groups WHERE tenant_id = ? AND contact_id IN (${ph})`, [
        tenantId,
        ...ids
      ]);
      await conn.query(`DELETE FROM crm_contact_followups WHERE tenant_id = ? AND contact_id IN (${ph})`, [
        tenantId,
        ...ids
      ]);
      await conn.query(`DELETE FROM email_unsubscribe_events WHERE tenant_id = ? AND contact_id IN (${ph})`, [
        tenantId,
        ...ids
      ]);
      await conn.query(`DELETE FROM email_subscribe_events WHERE tenant_id = ? AND contact_id IN (${ph})`, [
        tenantId,
        ...ids
      ]);
      await conn.query(`DELETE FROM email_delivery_events WHERE tenant_id = ? AND contact_id IN (${ph})`, [
        tenantId,
        ...ids
      ]);
      const [result] = await conn.query(`DELETE FROM email_contacts WHERE tenant_id = ? AND TRIM(industry) = ?`, [
        tenantId,
        ind
      ]);
      await conn.commit();
      return res.json({
        ok: true,
        industry: ind,
        deleted: Number((result as { affectedRows?: number })?.affectedRows ?? 0)
      });
    } catch (e: unknown) {
      await conn.rollback();
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    } finally {
      conn.release();
    }
  });

  /** 删除单条投递事件（如无 CRM 联系人时从投诉列表移除） */
  app.delete("/api/email/delivery-events/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const eventId = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await db.query(`DELETE FROM email_delivery_events WHERE id = ? AND tenant_id = ?`, [
      eventId,
      tenantId
    ]);
    const deleted = Number((result as any)?.affectedRows ?? 0);
    if (deleted === 0) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    return res.json({ ok: true, id: eventId, deleted });
  });

  /** 删除联系人（同步清理 CRM/分组关联），用于退回/失败邮箱的快速剔除 */
  app.delete("/api/email/contacts/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const contactId = z.coerce.number().int().positive().parse(req.params.id);
    try {
      const [rows] = await db.query(`SELECT id, email FROM email_contacts WHERE id = ? AND tenant_id = ? LIMIT 1`, [
        contactId,
        tenantId
      ]);
      const row = (rows as { id?: unknown; email?: unknown }[])[0];
      if (!row) {
        return res.status(404).json({ ok: false, message: "联系人不存在或不属于当前租户" });
      }
      const email = String(row.email ?? "").trim();
      const [idRows] = await db.query(
        `SELECT id FROM email_contacts WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))`,
        [tenantId, email]
      );
      const contactIdsToDelete = (idRows as { id?: unknown }[])
        .map((r) => Number(r.id ?? 0))
        .filter((id) => id > 0);
      if (contactIdsToDelete.length === 0) {
        return res.status(404).json({ ok: false, message: "联系人不存在或不属于当前租户" });
      }
      const idPh = contactIdsToDelete.map(() => "?").join(",");
      const [campRows] = await db.query(
        `SELECT DISTINCT campaign_id AS campaign_id FROM email_sends WHERE contact_id IN (${idPh})`,
        contactIdsToDelete
      );
      const deleted = await deleteTenantContactsByIds(db, tenantId, contactIdsToDelete);
      invalidateCampaignSendListCaches(
        (campRows as { campaign_id?: unknown }[]).map((r) => Number(r.campaign_id ?? 0))
      );
      return res.json({ ok: true, contactId, email, deleted, contactIds: contactIdsToDelete });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** CRM 数据库 · 按页勾选/发送列表批量删除 */
  app.post("/api/email/contacts/bulk-delete", async (req, res) => {
    const tenantId = resolveTenantId(req);
    try {
      const body = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(200) }).parse(req.body ?? {});
      const ids = Array.from(new Set(body.ids));
      const [campRows] = await db.query(
        `SELECT DISTINCT campaign_id AS campaign_id FROM email_sends WHERE contact_id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      const deleted = await deleteTenantContactsByIds(db, tenantId, ids);
      invalidateCampaignSendListCaches(
        (campRows as { campaign_id?: unknown }[]).map((r) => Number(r.campaign_id ?? 0))
      );
      return res.json({ ok: true, deleted, requested: ids.length });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ ok: false, message: e.message });
      }
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 订阅/退订/投诉列表：按邮箱删 CRM 联系人（同步行业标签人数与分组） */
  app.post("/api/email/contacts/delete-by-email", async (req, res) => {
    const tenantId = resolveTenantId(req);
    try {
      const body = z.object({ email: z.string().min(1).max(320) }).parse(req.body ?? {});
      const result = await deleteTenantContactByEmail(db, tenantId, body.email);
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ ok: false, message: e.message });
      }
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.post("/api/email/campaigns/preview-count", async (req, res) => {
    try {
      const body = audiencePreviewSchema.parse(req.body);
      const tenantId = resolveTenantId(req);
      const campaignId = body.campaignId != null ? Number(body.campaignId) : 0;
      const cnt =
        campaignId > 0
          ? await countDistinctAudienceEmails(
              db,
              {
                tenantId,
                groupIds: body.groupIds,
                industries: body.industries ?? [],
                businessLine: body.businessLine ?? null,
                sendPipelineMatch: true
              },
              { campaignIdForResume: campaignId }
            )
          : await countAudience(db, body.groupIds, body.businessLine ?? null, body.industries ?? [], tenantId);
      res.json({ ok: true, count: cnt });
    } catch (e: any) {
      res.status(400).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.post("/api/email/campaigns", async (req, res) => {
    try {
      const body = campaignCreateSchema.parse(req.body);
      /** 活动归属与收件人统计：当前会话租户（含超管用 ?tenantId=） */
      const tenantId = resolveTenantId(req);
      const { subject, html } = await loadCampaignMailFromTemplate(db, body.templateId);
      if (!subject.trim()) {
        return res.status(400).json({ ok: false, message: "模版主题为空" });
      }
      const gids = JSON.stringify(body.groupIds);
      const industries = (body.industries ?? []).map((x) => x.trim()).filter(Boolean);
      const industriesJson = industries.length > 0 ? JSON.stringify(industries) : null;
      const recipientCount = await countAudience(db, body.groupIds, body.businessLine ?? null, industries, tenantId);

      let scheduleAt: Date | null = null;
      const nowMs = Date.now();

      if (body.scheduleSpecific) {
        scheduleAt = parseOptionalScheduleAt(body.scheduleStartAt === undefined ? null : body.scheduleStartAt);
        if (!scheduleAt) {
          return res.status(400).json({ ok: false, message: "已选择特定时间发送，请填写日期与时间" });
        }
        if (scheduleAt.getTime() < nowMs - 60_000) {
          return res.status(400).json({ ok: false, message: "特定发送时间须不早于当前时间（可选今天起的之后时刻）" });
        }
      } else {
        scheduleAt = null;
      }

      const roundsTotal =
        body.sendMode === "immediate"
          ? 1
          : Math.min(5, Math.max(1, body.sendRoundsTotal ?? 2));

      let status = "draft";
      let nextRunAt: Date | null = null;
      if (scheduleAt && scheduleAt.getTime() > nowMs) {
        status = "scheduled";
        nextRunAt = scheduleAt;
      }
      
      const campaignCode = await allocateCampaignCode(db);

      if (body.smtpProfileId) {
        const [smtpRows] = await db.query(
          `SELECT id FROM smtp_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [body.smtpProfileId, tenantId]
        );
        if (!(smtpRows as any[])[0]) return res.status(400).json({ ok: false, message: "所选发件邮箱不存在" });
      }
      if (body.senderProfileId) {
        const [senderRows] = await db.query(
          `SELECT id FROM sender_profiles WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [body.senderProfileId, tenantId]
        );
        if (!(senderRows as any[])[0]) return res.status(400).json({ ok: false, message: "所选发件人资料不存在" });
      }
      /** SES 发件邮箱：必须属于本租户且关联域名已 verified */
      if (body.sesSenderAddressId) {
        const [sesRows] = await db.query(
          `SELECT a.id, d.status AS domain_status
             FROM email_sender_addresses a
             JOIN email_sender_domains d ON d.id = a.domain_id
            WHERE a.id = ? AND a.tenant_id = ? LIMIT 1`,
          [body.sesSenderAddressId, tenantId]
        );
        const sesRow = (sesRows as Array<{ id: number; domain_status: string }>)[0];
        if (!sesRow) {
          return res.status(400).json({ ok: false, message: "所选 SES 发件邮箱不存在或不属于当前租户" });
        }
        if (sesRow.domain_status !== "verified") {
          return res.status(400).json({
            ok: false,
            message: "所选 SES 发件邮箱所在域名尚未通过 DKIM 验证；请先在「设置 → 邮件 → 发件域名」完成验证。"
          });
        }
      }

      const [result] = await db.query(
        `INSERT INTO email_campaigns
         (tenant_id, name, business_line, subject, html, status, template_id, target_group_ids,
          target_industries_json,
          schedule_start_at, repeat_every_days, repeat_every_hours, next_run_at, recipient_count,
          campaign_code, smtp_profile_id, sender_profile_id, ses_sender_address_id,
          send_mode, send_rounds_total, send_rounds_done)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          body.name,
          body.businessLine ?? null,
          subject,
          html,
          status,
          body.templateId,
          gids,
          industriesJson,
          scheduleAt,
          0,
          0,
          nextRunAt,
          recipientCount,
          campaignCode,
          body.smtpProfileId ?? null,
          body.senderProfileId ?? null,
          body.sesSenderAddressId ?? null,
          body.sendMode,
          roundsTotal,
          0
        ]
      );
      const insertId = (result as any).insertId as number;
      res.json({ ok: true, id: insertId, campaignCode });
    } catch (e: any) {
      res.status(400).json({ ok: false, message: String(e?.message ?? e) });
    }
  });

  app.get("/api/email/campaigns", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const picker = queryFlagTruthy(req.query.picker);
    const pickerFast = queryFlagTruthy(req.query.fast);
    const tenantIdQuery = Number(req.query.tenantId);
    const hasExplicitTenantId = Number.isFinite(tenantIdQuery) && tenantIdQuery > 0;
    const unsentOnly = queryFlagTruthy(req.query.unsentOnly);
    const params: unknown[] = [];
    const fromEmailRaw = String(req.query.fromEmail ?? "")
      .trim()
      .toLowerCase();
    const filterBySender = Boolean(fromEmailRaw && fromEmailRaw !== "all");
    /** 统计页 picker 必须按发信邮箱 + 租户，禁止无 tenantId 扫全库 */
    const superAdminPickerGlobal = Boolean(
      picker && req.auth?.isSuperAdmin && !hasExplicitTenantId && !filterBySender
    );
    /** 仅单机组统计页（singleLaneStats=1）强制 picker 带 fromEmail；多机组页保留原逻辑 */
    const singleLaneStatsPicker = queryFlagTruthy(req.query.singleLaneStats);
    if (picker && !req.auth?.isSuperAdmin && tenantId <= 0) {
      return res.status(403).json({ ok: false, message: "当前账号未绑定租户，无法列出营销活动。" });
    }
    if (picker && !filterBySender && singleLaneStatsPicker) {
      return res.json({ ok: true, items: [] });
    }
    const whereParts: string[] = [];
    if (tenantId > 0 && !superAdminPickerGlobal) {
      whereParts.push("c.tenant_id = ?");
      params.push(tenantId);
    }
    if (filterBySender) {
      /** 已发信记录 或 活动绑定的 SMTP 发信域 与所选域名一致（统计页右侧活动 ID 下拉） */
      whereParts.push(`(
        EXISTS (
          SELECT 1
            FROM email_sends s
           WHERE s.campaign_id = c.id
             AND LOWER(TRIM(COALESCE(s.from_email, ''))) = ?
        )
        OR EXISTS (
          SELECT 1
            FROM smtp_profiles p
           WHERE p.id = c.smtp_profile_id
             AND LOWER(TRIM(COALESCE(p.from_email, ''))) = ?
        )
      )`);
      params.push(fromEmailRaw, fromEmailRaw);
    }
    if (unsentOnly) {
      whereParts.push(`(
        NOT EXISTS (SELECT 1 FROM email_sends sx WHERE sx.campaign_id = c.id)
        OR LOWER(COALESCE(c.status, '')) = 'sending'
      )`);
      whereParts.push(`LOWER(COALESCE(c.status, '')) NOT IN ('completed')`);
    }
    const tenantWhere = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    /** 统计页按发信邮箱筛活动时需列出全部匹配记录（上限防滥用） */
    const listLimit = 500;

    /** picker 模式仅供下拉展示：跳过所有 email_sends 聚合，避免百万行扫描拖慢前端 */
    if (picker) {
      let pickerRows: unknown;
      if (filterBySender) {
        const idList = await listCampaignIdsForStatsFromEmail(
          db,
          fromEmailRaw,
          tenantId,
          superAdminPickerGlobal,
          listLimit,
          { smtpOnly: false }
        );
        if (idList.length === 0) {
          return res.json({ ok: true, items: [] });
        }
        const ph = idList.map(() => "?").join(",");
        const tenantClause = tenantId > 0 && !superAdminPickerGlobal ? " AND c.tenant_id = ?" : "";
        const idParams: unknown[] = [...idList];
        if (tenantClause) idParams.push(tenantId);
        const extraWhere = unsentOnly
          ? ` AND (
        NOT EXISTS (SELECT 1 FROM email_sends sx WHERE sx.campaign_id = c.id)
        OR LOWER(COALESCE(c.status, '')) = 'sending'
      ) AND LOWER(COALESCE(c.status, '')) NOT IN ('completed')`
          : "";
        [pickerRows] = await db.query(
          `SELECT c.id, c.tenant_id, c.campaign_code, c.name, c.status,
                  c.template_id, c.recipient_count
             FROM email_campaigns c
            WHERE c.id IN (${ph})${tenantClause}${extraWhere}
            ORDER BY c.id DESC
            LIMIT ${listLimit}`,
          idParams
        );
      } else {
        [pickerRows] = await db.query(
          `SELECT c.id, c.tenant_id, c.campaign_code, c.name, c.status,
                  c.template_id, c.recipient_count
             FROM email_campaigns c
             ${tenantWhere}
            ORDER BY c.id DESC
            LIMIT ${listLimit}`,
          params
        );
      }
      const pList = pickerRows as Array<{
        id: number;
        campaign_code?: string | null;
        name?: string | null;
        status?: string | null;
        template_id?: number | null;
        recipient_count?: number | null;
      }>;
      const baseItems = pList.map((row) => {
        const recipient = Number(row.recipient_count ?? 0);
        const cid = Number(row.id);
        const status = String(row.status ?? "").toLowerCase();
        const hasSent = status === "sending" || status === "stopped" || status === "completed";
        return {
          id: cid,
          campaign_code: row.campaign_code ?? null,
          name: String(row.name ?? ""),
          status,
          template_name: null,
          template_id: row.template_id != null ? Number(row.template_id) : null,
          recipient_count: recipient,
          sent_count: 0,
          failed_count: 0,
          attempts_count: 0,
          pending_unsent: status === "draft" ? recipient : 0,
          has_sent: hasSent
        };
      });
      const items = await attachPickerSendStats(
        db,
        baseItems.map((r) => ({ id: r.id, status: r.status, has_sent: r.has_sent }))
      );
      const merged = baseItems.map((r) => {
        const st = items.find((x) => x.id === r.id);
        if (!st) return r;
        return {
          ...r,
          sent_count: st.sent_count,
          failed_count: st.failed_count,
          attempts_count: st.attempts_count,
          has_sent: st.has_sent
        };
      });
      return res.json({ ok: true, items: merged, fast: pickerFast || undefined });
    }

    const [rows] = await db.query(
      `SELECT
         c.id,
         c.tenant_id,
         c.campaign_code,
         c.name,
         c.status,
         c.business_line,
         c.subject,
         c.template_id,
         c.created_at,
         c.schedule_start_at,
         c.next_run_at,
         c.repeat_every_days,
         c.repeat_every_hours,
         c.send_mode,
         c.send_rounds_total,
         c.send_rounds_done,
         c.smtp_profile_id,
         c.sender_profile_id,
         c.recipient_count,
         c.target_group_ids,
         c.target_industries_json,
         sp.from_email AS smtp_from_email,
         sp.name AS smtp_name,
         snd.display_name AS sender_display_name,
         t.name AS template_name,
         t.category AS template_category
       FROM email_campaigns c
       LEFT JOIN email_templates t ON t.id = c.template_id
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       LEFT JOIN sender_profiles snd ON snd.id = c.sender_profile_id
       ${tenantWhere}
       ORDER BY c.id DESC
       LIMIT ${listLimit}`,
      params
    );
    const list = rows as any[];
    const ids = list.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    /** 一次 GROUP BY 把全部 (sent/failed/attempts) 取出，替代每行 3 条相关子查询 */
    const countsByCampaign = new Map<number, { sent: number; failed: number; attempts: number }>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const [aggRows] = await db.query(
        `SELECT s.campaign_id,
                COUNT(DISTINCT CASE WHEN s.status = 'sent' THEN LOWER(TRIM(s.to_email)) END) AS sent_cnt,
                COUNT(DISTINCT CASE WHEN s.status IN ('failed', 'suppressed') THEN LOWER(TRIM(s.to_email)) END) AS failed_cnt,
                COUNT(DISTINCT LOWER(TRIM(s.to_email))) AS attempts_cnt
           FROM email_sends s
          WHERE s.campaign_id IN (${ph})
          GROUP BY s.campaign_id`,
        ids
      );
      for (const r of aggRows as Array<{ campaign_id?: unknown; sent_cnt?: unknown; failed_cnt?: unknown; attempts_cnt?: unknown }>) {
        const cid = Number(r.campaign_id ?? 0);
        if (cid > 0) {
          countsByCampaign.set(cid, {
            sent: Number(r.sent_cnt ?? 0),
            failed: Number(r.failed_cnt ?? 0),
            attempts: Number(r.attempts_cnt ?? 0)
          });
        }
      }
    }
    const touchedMap = await mapDistinctContactsPerCampaign(db, ids);
    const audCache = new Map<string, Promise<number>>();
    const items = [];
    for (const row of list) {
      const cid = Number(row.id);
      const touched = touchedMap.get(cid) ?? 0;
      const displayAudience = await resolveCampaignDisplayAudience(db, row, touched, audCache);
      const counts = countsByCampaign.get(cid) ?? { sent: 0, failed: 0, attempts: 0 };
      const attempts = counts.attempts;
      const { target_industries_json: _ti, target_group_ids: _tg, ...pub } = row;
      items.push({
        ...pub,
        sent_count: counts.sent,
        failed_count: counts.failed,
        attempts_count: counts.attempts,
        targetGroupIds: parseCampaignTargetGroupIds(row.target_group_ids),
        targetIndustries: parseCampaignTargetIndustriesJson(row.target_industries_json),
        recipient_count: displayAudience,
        pending_unsent: Math.max(0, displayAudience - attempts),
        has_sent: attempts > 0
      });
    }
    res.json({ ok: true, items });
  });

  app.delete("/api/email/campaigns/:id", async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const tenantId = resolveTenantId(req);
    const [rows] = await db.query(`SELECT id, tenant_id, status FROM email_campaigns WHERE id = ? LIMIT 1`, [id]);
    const row = (rows as Array<{ id: number; tenant_id: number; status: string }>)[0];
    if (!row) return res.status(404).json({ ok: false, message: "活动不存在" });
    if (tenantId > 0 && Number(row.tenant_id) !== tenantId) {
      return res.status(403).json({ ok: false, message: "无权删除该活动（与当前租户不一致）。" });
    }
    if (String(row.status ?? "").toLowerCase() === "sending") {
      return res.status(400).json({ ok: false, message: "活动正在发送中，暂不可删除。" });
    }
    const campTenantId = Number(row.tenant_id);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `DELETE e FROM email_delivery_events e
          INNER JOIN email_sends s ON s.id = e.email_send_id
         WHERE s.campaign_id = ?`,
        [id]
      );
      await conn.query(`DELETE FROM email_delivery_events WHERE campaign_id = ?`, [id]);
      await conn.query(`DELETE FROM email_unsubscribe_events WHERE campaign_id = ?`, [id]);
      await conn.query(`DELETE FROM email_subscribe_events WHERE campaign_id = ?`, [id]);
      await conn.query(`DELETE FROM email_sends WHERE campaign_id = ?`, [id]);
      await conn.query(`DELETE FROM email_campaigns WHERE id = ?`, [id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    invalidateCampaignPanelStatsCache(id);
    res.json({ ok: true });
    if (Number.isFinite(campTenantId) && campTenantId > 0) {
      void refreshOneTenantAndMaybeBreak(db, campTenantId).catch((err) => {
        console.warn("[email] refresh circuit after campaign delete failed:", (err as Error)?.message ?? err);
      });
    }
  });

  /** 独立站统计页 · 诊断与修复：仅清当前租户服务端缓存 + lite 探测（无 shell、不跨站） */
  app.post("/api/email/stats-self-heal", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(401).json({ ok: false, message: "未登录或无法识别租户" });
    }
    const body = z
      .object({
        campaignId: z.coerce.number().int().positive().optional()
      })
      .parse(req.body ?? {});
    try {
      const result = await runCampaignStatsSelfHeal(db, {
        tenantId,
        campaignId: body.campaignId ?? null
      });
      return res.json({ ok: result.ok, ...result });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 租户维度：日期范围内所有营销活动的投递汇总（非单一活动） */
  /** 租户维度：套餐开通至今订阅总数（与活动、日期区间、lite 无关） */
  
  app.get("/api/email/marketing/today-campaigns-summary", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "无法识别租户" });
    }
    const query = z
      .object({
        day: z.string().optional(),
        clientToday: z.string().optional(),
        lite: z.union([z.string(), z.boolean()]).optional()
      })
      .parse(req.query);
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const dayYmd =
      (query.day && ymdRe.test(query.day) ? query.day : null) ?? businessTodayYmd();
    try {
      const lite = queryFlagTruthy(query.lite);
      const summary = await loadTodayCampaignActivitiesSummary(db, tenantId, dayYmd, { lite });
      return res.json({ ok: true, day: dayYmd, summary, lite: lite || undefined });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/email/marketing/tenant-range-stats", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "无法识别租户" });
    }
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        clientToday: z.string().optional(),
        lite: z.union([z.string(), z.boolean()]).optional(),
        refresh: z.union([z.string(), z.boolean()]).optional(),
        fromEmail: z.string().optional(),
        fromEmails: z.string().optional()
      })
      .parse(req.query);
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = query.from && ymdRe.test(query.from) ? query.from : businessTodayYmd();
    let toY = query.to && ymdRe.test(query.to) ? query.to : fromY;
    if (fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }
    const lite = queryFlagTruthy(query.lite);
    const refresh = queryFlagTruthy(query.refresh);
    const scopeFromEmail = query.fromEmail?.trim() || null;
    const scopeFromEmails = query.fromEmails
      ? query.fromEmails
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      : null;
    const scopeKey =
      scopeFromEmails && scopeFromEmails.length > 0
        ? scopeFromEmails.join(",")
        : scopeFromEmail?.toLowerCase() || "__all__";
    const cacheKey = tenantRangeStatsCacheKey({ tenantId, fromY, toY, lite, scopeKey });
    try {
      if (!refresh) {
        const cached = readTenantRangeStatsCache(cacheKey);
        if (cached) {
          return res.json({
            ok: true,
            range: { from: fromY, to: toY },
            summary: cached,
            scopeFromEmail,
            scopeFromEmails: scopeFromEmails ?? (scopeFromEmail ? [scopeFromEmail] : []),
            cached: true
          });
        }
      }
      const summary = await loadTenantEmailRangeStats(
        db,
        tenantId,
        fromY,
        toY,
        null,
        lite,
        scopeFromEmail,
        scopeFromEmails
      );
      writeTenantRangeStatsCache(cacheKey, summary);
      res.json({
        ok: true,
        range: { from: fromY, to: toY },
        summary,
        scopeFromEmail,
        scopeFromEmails: scopeFromEmails ?? (scopeFromEmail ? [scopeFromEmail] : []),
        cached: false
      });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  app.get("/api/email/marketing/package-success-daily-series", async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "无法识别租户" });
    }
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional()
      })
      .parse(req.query);
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const chartFrom = query.from && ymdRe.test(query.from) ? query.from : null;
    const chartTo = query.to && ymdRe.test(query.to) ? query.to : null;
    try {
      const series = await loadTenantPackageSuccessDailySeries(db, tenantId, chartFrom, chartTo);
      return res.json({ ok: true, series });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /** 按 6 位活动编号解析活动（当前租户） */
  app.get("/api/email/campaigns/resolve-code", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const codeRaw = String(req.query.code ?? "").trim().replace(/\D/g, "");
    if (!codeRaw) {
      return res.status(400).json({ ok: false, message: "请输入活动编号（6 位数字）" });
    }
    const code = codeRaw.padStart(6, "0").slice(-6);
    const params: unknown[] = [code];
    let tenantSql = "";
    if (tenantId > 0) {
      tenantSql = " AND tenant_id = ? ";
      params.push(tenantId);
    }
    const [rows] = await db.query(
      `SELECT id, campaign_code, name, status
         FROM email_campaigns
        WHERE campaign_code = ? ${tenantSql}
        ORDER BY id DESC
        LIMIT 1`,
      params
    );
    const row = (rows as Array<{ id: number; campaign_code: string | null; name: string; status: string }>)[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: `未找到活动编号 ${code}` });
    }
    res.json({
      ok: true,
      item: {
        id: Number(row.id),
        campaign_code: row.campaign_code ?? code,
        name: String(row.name ?? ""),
        status: String(row.status ?? "")
      }
    });
  });

  /** 活动正式发送轮次列表（统计页轮次切换 / 发送历史） */
  app.get("/api/email/campaigns/:id/send-runs", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [
      campaignId
    ]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动发送轮次。" });
    }
    const items = await listCampaignSendRuns(db, campaignId);
    const latestRoundNo = items.length > 0 ? Math.max(...items.map((x) => x.round_no)) : 0;
    return res.json({ ok: true, campaignId, latestRoundNo, items });
  });

  /** 营销活动统计：时间范围内发送成功/失败汇总 + 序列（单日按 3 小时桶，多日按天） */
  app.get("/api/email/campaigns/:id/stats", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id, recipient_count FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campaignProgressRow = (tenantRows as { tenant_id?: unknown; recipient_count?: unknown }[])[0];
    const campTenantId = Number(campaignProgressRow?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的统计（与当前租户不一致）。" });
    }
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        /** 按发件邮箱（SMTP from）筛选；兼容旧参数 domain（收件域） */
        fromEmail: z.string().optional(),
        domain: z.string().optional(),
        /** 统计页轻量轮询：跳过 IMAP / 对账 / 受众重复（发送中勿传） */
        skipImap: z.union([z.string(), z.boolean()]).optional(),
        skipReconcile: z.union([z.string(), z.boolean()]).optional(),
        /** 快速统计：跳过 IMAP、受众扫描、订阅归因子查询等（统计页默认应传） */
        lite: z.union([z.string(), z.boolean()]).optional(),
        /** 浏览器本地「今天」YYYY-MM-DD，用于今日订阅统计 */
        clientToday: z.string().optional(),
        /** 统计页「当前活动」：整场活动累计，不按日期截断 */
        allTime: z.union([z.string(), z.boolean()]).optional(),
        /** 统计页专用：裁剪 summary/series，省略 senderEmails 等大字段 */
        panel: z.union([z.string(), z.boolean()]).optional(),
        /** 1=跳过服务端 panel 缓存，切换活动或发送中轮询时传 */
        refresh: z.union([z.string(), z.boolean()]).optional(),
        /** 1=首屏/全量刷新时拉 IMAP 退信（轮询勿传，避免每 10s 扫邮箱） */
        bounceImap: z.union([z.string(), z.boolean()]).optional(),
        /** 统计页 7 栏：仅该发送轮次；概览折线图仍用全活动 summary */
        sendRunId: z.coerce.number().int().positive().optional(),
        roundNo: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const sendRunQuery = parseSendRunQueryInput(query);
    const panel = queryFlagTruthy(query.panel);
    const refreshPanelCache = queryFlagTruthy(query.refresh);
    const lite = queryFlagTruthy(query.lite);
    const allTime = queryFlagTruthy(query.allTime);
    const skipImap = queryFlagTruthy(query.skipImap) || lite;
    const skipReconcile = queryFlagTruthy(query.skipReconcile) || lite;

    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = query.from && ymdRe.test(query.from) ? query.from : businessTodayYmd();
    let toY = query.to && ymdRe.test(query.to) ? query.to : fromY;
    if (fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }

    const { start: startDt, endExclusive } = businessRangeMysqlBounds(fromY, toY);
    const sendRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive);
    const evtCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("created_at", startDt, endExclusive);
    const unsubCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("u.created_at", startDt, endExclusive);
    const subCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive);

    const fromEmailRaw = String(query.fromEmail ?? query.domain ?? "all")
      .trim()
      .toLowerCase();
    const fromEmailFilter = fromEmailRaw && fromEmailRaw !== "all";

    const [campRows] = await db.query(
      `SELECT id, tenant_id, business_line, target_industries_json, recipient_count, smtp_profile_id, status
         FROM email_campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );
    const camp = (campRows as any[])[0];
    if (!camp) return res.status(404).json({ ok: false, message: "活动不存在" });

    const wantsRoundDetail = Boolean(sendRunQuery.sendRunId || sendRunQuery.roundNo);
    if (panel && !refreshPanelCache && !wantsRoundDetail) {
      const cached = readCampaignPanelStatsCache(campaignId);
      if (cached) return res.json(cached);
    }

    const statusHint = String(camp.status ?? "").trim().toLowerCase();
    const bounceImap = queryFlagTruthy(query.bounceImap);
    const terminalCampaign =
      statusHint === "completed" || statusHint === "stopped" || statusHint === "paused";
    const needsDbBounceReconcile = refreshPanelCache || statusHint === "sending";
    const needsImapBouncePull =
      bounceImap && (statusHint === "sending" || terminalCampaign);
    // 统计页 lite：轮询仅 DB 对账；首屏 bounceImap=1 对已结束活动强制拉一次 IMAP。
    try {
      if (!skipImap) {
        await syncCampaignBounceImapAndReconcile(db, env, campaignId, {
          statusHint,
          forceImap: bounceImap || refreshPanelCache
        });
      } else if (!skipReconcile) {
        await reconcileCampaignBounceDbOnly(db, campaignId);
      } else {
        if (needsImapBouncePull) {
          if (statusHint === "sending") {
            void syncCampaignBounceForSendProgress(db, env, campaignId, statusHint);
          } else {
            await syncCampaignBounceImapAndReconcile(db, env, campaignId, {
              statusHint,
              forceImap: true
            });
          }
        } else if (statusHint === "sending") {
          void syncCampaignBounceForSendProgress(db, env, campaignId, statusHint);
        }
        if (needsDbBounceReconcile) {
          await reconcileCampaignBounceDbOnly(db, campaignId);
        }
      }
    } catch {
      // ignore reconcile errors, keep stats endpoint available
    }

    const [smtpJoinRows] = await db.query(
      `SELECT LOWER(TRIM(COALESCE(sp.from_email, ''))) AS fe
       FROM email_campaigns c
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       WHERE c.id = ?
       LIMIT 1`,
      [campaignId]
    );
    const campaignSmtpFromLower = String((smtpJoinRows as any[])[0]?.fe ?? "").trim();

    const fromClause = fromEmailFilter
      ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ? `
      : "";
    const fromParams: string[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fromEmailRaw] : [];

    const [sumRows] = await db.query(
      `SELECT
        SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent_ok,
        ${sqlSumEmailSendDeliveryFailures("s")} AS sent_fail
       FROM email_sends s
       WHERE s.campaign_id = ?${sendRange.clause}${fromClause}`,
      [campaignId, ...sendRange.params, ...fromParams]
    );
    const sum = (sumRows as any[])[0] || {};
    let successCount = Number(sum.sent_ok ?? 0);
    let failedSendCount = Number(sum.sent_fail ?? 0);
    const [bounceRows] = await db.query(
      `SELECT COUNT(*) AS c
       FROM email_sends s
       WHERE s.campaign_id = ?
         AND s.status = 'sent'
         ${sendRange.clause}${fromClause}
         AND EXISTS (
           SELECT 1
           FROM email_delivery_events e
           WHERE e.event_type = 'bounced'
             AND ${sqlBounceEventMatchesSend("e", "s")}
         )`,
      [campaignId, ...sendRange.params, ...fromParams]
    );
    let bouncedMatchedSentCount = Number((bounceRows as any[])[0]?.c ?? 0);
    let usedAllTimeFallback = allTime;
    let statsScope: "range" | "all_time_fallback" = allTime ? "all_time_fallback" : "range";
    const allFromClause = fromEmailFilter
      ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ? `
      : "";
    const allFromParams: unknown[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fromEmailRaw] : [];

    const rangeHadNoSends =
      !allTime && successCount + failedSendCount + bouncedMatchedSentCount === 0;
    if (rangeHadNoSends) {
      const [probeRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${allFromClause}`,
        [campaignId, ...allFromParams]
      );
      const probeN = Number((probeRows as { n?: unknown }[])[0]?.n ?? 0);
      if (probeN > 0) {
        usedAllTimeFallback = true;
        statsScope = "all_time_fallback";
        const [sumAllRows] = await db.query(
          `SELECT
            SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent_ok,
            ${sqlSumEmailSendDeliveryFailures("s")} AS sent_fail
           FROM email_sends s
           WHERE s.campaign_id = ?${allFromClause}`,
          [campaignId, ...allFromParams]
        );
        const all = (sumAllRows as any[])[0] || {};
        successCount = Number(all.sent_ok ?? 0);
        failedSendCount = Number(all.sent_fail ?? 0);
        const [bounceAllRows] = await db.query(
          `SELECT COUNT(*) AS c
             FROM email_sends s
            WHERE s.campaign_id = ?
              AND s.status = 'sent'
              ${allFromClause}
              AND EXISTS (
                SELECT 1
                  FROM email_delivery_events e
                 WHERE e.event_type = 'bounced'
                   AND ${sqlBounceEventMatchesSend("e", "s")}
              )`,
          [campaignId, ...allFromParams]
        );
        bouncedMatchedSentCount = Number((bounceAllRows as { c?: unknown }[])[0]?.c ?? 0);
      }
    }

    const evtRangeSql = usedAllTimeFallback ? "" : evtCreatedRange.clause;
    const evtRangeParams: unknown[] = usedAllTimeFallback ? [] : [...evtCreatedRange.params];
    const unsubRangeSql = usedAllTimeFallback ? "" : unsubCreatedRange.clause;
    const unsubRangeParams: unknown[] = usedAllTimeFallback ? [] : [...unsubCreatedRange.params];
    // 统计口径：
    // - email_sends.sent 为「SMTP 已受理」；
    // - bounced 是后续退回事件，应从成功中扣除，避免同一封同时计入成功与失败。
    // 仅用「仍为 sent 且 EXISTS 退信」计数，避免与已对账为 failed 的行重复叠加。
    const bouncedDeduct = Math.max(0, Math.min(successCount, bouncedMatchedSentCount));
    const deliveredSuccessCount = Math.max(0, successCount - bouncedDeduct);
    let failCount = failedSendCount + bouncedDeduct;
    try {
      const failDistinct = await countCampaignDeliveryFailedDistinct(db, campaignId, {
        sendRangeClause: usedAllTimeFallback ? "" : sendRange.clause,
        sendRangeParams: usedAllTimeFallback ? [] : sendRange.params,
        fromClause: usedAllTimeFallback ? allFromClause : fromClause,
        fromParams: usedAllTimeFallback ? allFromParams : fromParams
      });
      failCount = Math.max(failCount, failDistinct);
    } catch {
      /* 托底计数失败不阻断统计 */
    }
    const attemptsInRange = deliveredSuccessCount + failCount;
    const successRatePct = attemptsInRange > 0 ? Math.round((100 * deliveredSuccessCount) / attemptsInRange) : 0;
    const deliveredPct = successRatePct;
    const bouncedPct = attemptsInRange > 0 ? Math.round((100 * failCount) / attemptsInRange) : 0;

    const engSendRange =
      usedAllTimeFallback || allTime
        ? { clause: allFromClause, params: allFromParams }
        : sendRange;
    const subRangeForEng =
      usedAllTimeFallback || allTime
        ? { clause: "", params: [] as unknown[] }
        : subCreatedRange;
    const engagementFast = await loadCampaignEngagementSummary(db, campaignId, {
      sendRange: engSendRange,
      subRange: subRangeForEng,
      fromClause,
      fromParams,
      unsubRange: { clause: unsubRangeSql, params: unsubRangeParams },
      evtRange: { clause: evtRangeSql, params: evtRangeParams }
    });
    const openedCount = engagementFast.openedCount;
    const clickedCount = engagementFast.clickedCount;
    const openedPct = deliveredSuccessCount > 0 ? Math.round((100 * openedCount) / deliveredSuccessCount) : 0;
    const clickedPct = deliveredSuccessCount > 0 ? Math.round((100 * clickedCount) / deliveredSuccessCount) : 0;

    // 退订/投诉：退订来自退订事件；投诉来自投递事件（webhook 或收件人投诉表单）
    const [unsubRows] = await db.query(
      `SELECT COUNT(*) AS unsub_cnt
       FROM email_unsubscribe_events u
       WHERE u.campaign_id = ?${unsubRangeSql}`,
      [campaignId, ...unsubRangeParams]
    );
    const unsubscribeCount = Number((unsubRows as any[])[0]?.unsub_cnt ?? 0);
    const unsubscribePct = deliveredSuccessCount > 0 ? Math.round((100 * unsubscribeCount) / deliveredSuccessCount) : 0;
    let subscribeCount = engagementFast.subscribeCount;
    let subscribePct =
      deliveredSuccessCount > 0 ? Math.round((100 * subscribeCount) / deliveredSuccessCount) : 0;
    let subscribeSameDayCount = 0;
    let subscribeTodayCount = 0;
    let subscribeTodayBySendingDomain: Array<{ fromEmail: string; count: number }> = [];
    let subscribeTotalSincePackage = 0;
    let subscribePackageStart: string | null = null;
    let subscribeBySendingDomain: Array<{ fromEmail: string; count: number }> = [];
    /** 今日订阅：统一按后端北京时间自然日，避免用户设备时间影响统计口径 */
    const subscribeTodayYmd = businessTodayYmd();
    const bouncePredSub = sqlSendRowHasBounceEvent("es");
    const esFromClause = fromEmailFilter
      ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(es.from_email), ''), ?))) = ? `
      : "";
    const esFromParams: string[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fromEmailRaw] : [];
    const pkgTenantId = Number(camp.tenant_id ?? 0) || 0;
    /* 开源版：无套餐订阅体系，累计值置空 */
    void pkgTenantId;
    try {
      {
        const { start: todayStart, endExclusive: todayEndExclusive } =
          businessDayMysqlRange(subscribeTodayYmd);
        const todaySubRange = sqlBusinessDatetimeBetweenAnd("s.created_at", todayStart, todayEndExclusive);
        const [todayRows] = await db.query(
          `SELECT COUNT(*) AS sub_cnt
             FROM email_subscribe_events s
            WHERE s.campaign_id = ?${todaySubRange.clause}`,
          [campaignId, ...todaySubRange.params]
        );
        subscribeTodayCount = Number((todayRows as any[])[0]?.sub_cnt ?? 0);
        const [todayDomainRows] = await db.query(
          `SELECT sub.from_email, COUNT(*) AS sub_cnt
             FROM (
               SELECT s.id,
                 (
                   SELECT LOWER(TRIM(COALESCE(NULLIF(TRIM(es.from_email), ''), ?)))
                     FROM email_sends es
                    WHERE es.campaign_id = s.campaign_id
                      AND es.contact_id = s.contact_id
                      AND es.status = 'sent'
                      AND NOT (${bouncePredSub})
                      AND es.created_at <= s.created_at
                    ORDER BY es.created_at DESC
                    LIMIT 1
                 ) AS from_email
                 FROM email_subscribe_events s
                WHERE s.campaign_id = ?${todaySubRange.clause}
             ) sub
            WHERE sub.from_email IS NOT NULL AND sub.from_email <> ''
            GROUP BY sub.from_email
            ORDER BY sub_cnt DESC, sub.from_email ASC`,
          [campaignSmtpFromLower || "", campaignId, ...todaySubRange.params]
        );
        subscribeTodayBySendingDomain = (todayDomainRows as any[])
          .map((r) => ({
            fromEmail: String(r.from_email ?? "").trim(),
            count: Number(r.sub_cnt ?? 0)
          }))
          .filter((r) => r.fromEmail && r.count > 0);
      }
      if (!lite) {
      const [sameDayRows] = await db.query(
        `SELECT COUNT(*) AS sub_cnt
         FROM email_subscribe_events s
         WHERE s.campaign_id = ?${subCreatedRange.clause}
           AND EXISTS (
             SELECT 1
               FROM email_sends es
              WHERE es.campaign_id = s.campaign_id
                AND es.contact_id = s.contact_id
                AND es.status = 'sent'
                AND NOT (${bouncePredSub})
                AND DATE(es.created_at) = DATE(s.created_at)
                ${sqlBusinessDatetimeBetweenAnd("es.created_at", startDt, endExclusive).clause}
                ${esFromClause}
           )`,
        [campaignId, ...subCreatedRange.params, ...sqlBusinessDatetimeBetweenAnd("es.created_at", startDt, endExclusive).params, ...esFromParams]
      );
      subscribeSameDayCount = Number((sameDayRows as any[])[0]?.sub_cnt ?? 0);

      const tenantId = Number(camp.tenant_id ?? 0) || 0;
      if (tenantId > 0 && subscribePackageStart) {
        const pkgStartDt = `${subscribePackageStart} 00:00:00`;
        const [domainRows] = await db.query(
          `SELECT sub.from_email, COUNT(*) AS sub_cnt
             FROM (
               SELECT s.id,
                 (
                   SELECT LOWER(TRIM(COALESCE(NULLIF(TRIM(es.from_email), ''), ?)))
                     FROM email_sends es
                    WHERE es.campaign_id = s.campaign_id
                      AND es.contact_id = s.contact_id
                      AND es.status = 'sent'
                      AND NOT (${bouncePredSub})
                      AND es.created_at <= s.created_at
                    ORDER BY es.created_at DESC
                    LIMIT 1
                 ) AS from_email
                 FROM email_subscribe_events s
                 INNER JOIN email_campaigns c ON c.id = s.campaign_id
                WHERE c.tenant_id = ? AND s.created_at >= ?
             ) sub
            WHERE sub.from_email IS NOT NULL AND sub.from_email <> ''
            GROUP BY sub.from_email
            ORDER BY sub_cnt DESC, sub.from_email ASC`,
          [campaignSmtpFromLower || "", tenantId, pkgStartDt]
        );
        subscribeBySendingDomain = (domainRows as any[])
          .map((r) => ({
            fromEmail: String(r.from_email ?? "").trim(),
            count: Number(r.sub_cnt ?? 0)
          }))
          .filter((r) => r.fromEmail && r.count > 0);
      }
      }
    } catch {
      /* 未跑 060 迁移时订阅表可能不存在，不阻断 stats */
    }
    const complaintCount = Math.max(
      engagementFast.complaintCount,
      await countCampaignComplaints(db, campaignId)
    );

    let campaignSendFirstYmd: string | null = null;
    let campaignSendLastYmd: string | null = null;
    const [spanRows] = await db.query(
      `SELECT MIN(s.created_at) AS first_at, MAX(s.created_at) AS last_at
         FROM email_sends s
        WHERE s.campaign_id = ?${allFromClause}`,
      [campaignId, ...allFromParams]
    );
    const span = (spanRows as { first_at?: unknown; last_at?: unknown }[])[0];
    if (span?.first_at) {
      campaignSendFirstYmd = formatBusinessDateTime(span.first_at)?.slice(0, 10) ?? null;
    }
    if (span?.last_at) {
      campaignSendLastYmd = formatBusinessDateTime(span.last_at)?.slice(0, 10) ?? null;
    }
    const [senderRows] = await db.query(
      `SELECT DISTINCT LOWER(TRIM(s.from_email)) AS fe
       FROM email_sends s
       WHERE s.campaign_id = ? AND TRIM(COALESCE(s.from_email, '')) <> ''
       ORDER BY fe ASC`,
      [campaignId]
    );
    const fromDb = (senderRows as any[]).map((r) => String(r.fe ?? "").trim()).filter(Boolean);
    const senderEmails = Array.from(new Set([...(campaignSmtpFromLower ? [campaignSmtpFromLower] : []), ...fromDb])).sort();

    let delayedQueue = 0;
    if (!lite) {
      const [attemptAllRows] = await db.query(`SELECT COUNT(*) AS n FROM email_sends WHERE campaign_id = ?`, [campaignId]);
      const attemptsAll = Number((attemptAllRows as any[])[0]?.n ?? 0);
      const [distSendRows] = await db.query(
        `SELECT COUNT(DISTINCT contact_id) AS n FROM email_sends WHERE campaign_id = ? AND contact_id IS NOT NULL`,
        [campaignId]
      );
      const touchedDistinct = Number((distSendRows as any[])[0]?.n ?? 0);
      const audCacheStats = new Map<string, Promise<number>>();
      const displayAudienceForPend = await resolveCampaignDisplayAudience(db, camp, touchedDistinct, audCacheStats);
      delayedQueue = Math.max(0, displayAudienceForPend - attemptsAll);
    }

    const tFrom = new Date(fromY + "T00:00:00").getTime();
    const tTo = new Date(toY + "T00:00:00").getTime();
    const daySpan = Math.floor((tTo - tFrom) / 86400000) + 1;

    type Pt = {
      label: string;
      success: number;
      fail: number;
      date?: string;
      segments?: Array<{ timeRange: string; success: number }>;
    };
    let series: Pt[] = [];

    if (usedAllTimeFallback) {
      series = await buildCampaignAllTimeSuccessSeries(
        db,
        campaignId,
        fromClause,
        fromParams,
        campaignSendFirstYmd,
        campaignSendLastYmd,
        deliveredSuccessCount,
        failCount
      );
    } else if (daySpan <= 1) {
      const { start: dayStart, endExclusive: dayEndStr } = businessDayMysqlRange(fromY);
      const daySendRange = sqlBusinessDatetimeBetweenAnd("s.created_at", dayStart, dayEndStr);
      const bouncePredDay = sqlSendRowHasBounceEvent("s");
      const [buckRows] = await db.query(
        `SELECT FLOOR(HOUR(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) / 3) AS bi,
          SUM(CASE WHEN s.status = 'sent' AND NOT (${bouncePredDay}) THEN 1 ELSE 0 END) AS okc,
          SUM(CASE WHEN ${sqlEmailSendIsSmtpFailure("s")} OR (s.status = 'sent' AND (${bouncePredDay})) THEN 1 ELSE 0 END) AS badc
         FROM email_sends s
         WHERE s.campaign_id = ?${daySendRange.clause}${fromClause}
         GROUP BY bi ORDER BY bi`,
        [campaignId, ...daySendRange.params, ...fromParams]
      );
      const byB = new Map<number, { ok: number; bad: number }>();
      for (const r of buckRows as any[]) {
        byB.set(Number(r.bi), { ok: Number(r.okc ?? 0), bad: Number(r.badc ?? 0) });
      }
      const labels = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
      for (let i = 0; i < 8; i++) {
        const v = byB.get(i) ?? { ok: 0, bad: 0 };
        const segments =
          v.ok > 0 ? [{ timeRange: chartSlotTimeRange(i), success: v.ok }] : [];
        series.push({
          label: labels[i]!,
          date: fromY,
          success: v.ok,
          fail: v.bad,
          segments
        });
      }
    } else {
      const cappedEnd = Math.min(daySpan, 31);
      const bouncePredSeries = sqlSendRowHasBounceEvent("s");
      const [dayRows] = await db.query(
        `SELECT DATE(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) AS d,
          SUM(CASE WHEN s.status = 'sent' AND NOT (${bouncePredSeries}) THEN 1 ELSE 0 END) AS okc,
          SUM(CASE WHEN ${sqlEmailSendIsSmtpFailure("s")} OR (s.status = 'sent' AND (${bouncePredSeries})) THEN 1 ELSE 0 END) AS badc
         FROM email_sends s
         WHERE s.campaign_id = ?${sendRange.clause}${fromClause}
         GROUP BY DATE(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) ORDER BY d ASC`,
        [campaignId, ...sendRange.params, ...fromParams]
      );
      const byD = new Map<string, { ok: number; bad: number }>();
      for (const r of dayRows as any[]) {
        let key: string;
        const dv = r.d;
        if (dv instanceof Date) {
          key = formatBusinessDateTime(dv)?.slice(0, 10) ?? "";
        } else {
          key = String(dv).slice(0, 10);
        }
        if (!key) continue;
        byD.set(key, { ok: Number(r.okc ?? 0), bad: Number(r.badc ?? 0) });
      }
      const cursor = new Date(`${fromY}T12:00:00+08:00`);
      for (let i = 0; i < cappedEnd; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const v = byD.get(key) ?? { ok: 0, bad: 0 };
        const mm = String(cursor.getMonth() + 1).padStart(2, "0");
        const dd = String(cursor.getDate()).padStart(2, "0");
        series.push({
          date: key,
          label: `${mm}-${dd}`,
          success: v.ok,
          fail: v.bad
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      const bouncePredSeg = sqlSendRowHasBounceEvent("s");
      const dateExpr = `DATE(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at))`;
      const hourExpr = `FLOOR(HOUR(COALESCE(CONVERT_TZ(s.created_at, @@session.time_zone, '+08:00'), s.created_at)) / 3)`;
      const [segRows] = await db.query(
        `SELECT ${dateExpr} AS d, ${hourExpr} AS bi,
            SUM(CASE WHEN s.status = 'sent' AND NOT (${bouncePredSeg}) THEN 1 ELSE 0 END) AS okc
           FROM email_sends s
           WHERE s.campaign_id = ?${sendRange.clause}${fromClause}
           GROUP BY d, bi
           HAVING okc > 0
           ORDER BY d ASC, bi ASC`,
        [campaignId, ...sendRange.params, ...fromParams]
      );
      const segMap = new Map<string, Array<{ timeRange: string; success: number }>>();
      for (const r of segRows as { d?: unknown; bi?: unknown; okc?: unknown }[]) {
        const dk = ymdFromDbDateValue(r.d);
        if (!dk) continue;
        const list = segMap.get(dk) ?? [];
        list.push({
          timeRange: chartSlotTimeRange(Number(r.bi ?? 0)),
          success: Number(r.okc ?? 0)
        });
        segMap.set(dk, list);
      }
      series = series.map((pt) => ({
        ...pt,
        segments: pt.date ? segMap.get(pt.date) ?? [] : []
      }));
    }

    const fullSummary = {
      deliveredPct,
      openedPct,
      clickedPct,
      bouncedPct,
      unsubscribeCount,
      unsubscribePct,
      subscribeCount,
      subscribePct,
      subscribeSameDayCount,
      subscribeTodayCount,
      subscribeTodayBySendingDomain,
      subscribeTodayDate: subscribeTodayYmd,
      subscribeTotalSincePackage,
      subscribePackageStart,
      subscribeBySendingDomain,
      complaintCount,
      openedCount,
      clickedCount,
      delayedQueue,
      successCount: deliveredSuccessCount,
      failCount,
      successRatePct
    };

    let roundSummaryPayload: Record<string, unknown> | null = null;
    let selectedSendRunId: number | null = null;
    let selectedRoundNo: number | null = null;
    if (wantsRoundDetail) {
      const resolved = await resolveCampaignSendRunId(db, campaignId, sendRunQuery);
      if (resolved) {
        selectedSendRunId = resolved.sendRunId;
        selectedRoundNo = resolved.roundNo;
        const roundCore = await computeCampaignRoundStatsSummary(
          db,
          campaignId,
          resolved.sendRunId,
          fromClause,
          fromParams
        );
        roundSummaryPayload = {
          ...roundCore,
          subscribeTodayCount: fullSummary.subscribeTodayCount,
          subscribeTodayBySendingDomain: fullSummary.subscribeTodayBySendingDomain,
          subscribeTodayDate: fullSummary.subscribeTodayDate
        };
      }
    }

    const httpBody = buildCampaignStatsHttpBody({
      campaignId,
      panel,
      fromY,
      toY,
      statsScope,
      campaignSendFirstYmd,
      campaignSendLastYmd,
      summary: fullSummary,
      roundSummary: roundSummaryPayload,
      selectedSendRunId,
      selectedRoundNo,
      series,
      senderEmails: panel ? undefined : senderEmails
    });
    if (panel && !wantsRoundDetail) {
      const statusLower = String(camp.status ?? "").toLowerCase();
      const ttlMs =
        statusLower === "sending"
          ? 15_000
          : statusLower === "completed" || statusLower === "stopped" || statusLower === "paused"
            ? 30_000
            : undefined;
      writeCampaignPanelStatsCache(campaignId, httpBody, "v1", ttlMs);
    }
    res.json(httpBody);
  });

  /** 活动订阅/退订/投诉计数（统计页名单 tab 角标，避免为 total 拉整表） */
  app.get("/api/email/campaigns/:id/compliance-counts", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动统计。" });
    }
    const query = z
      .object({
        allTime: z.union([z.string(), z.boolean()]).optional(),
        sendRunId: z.coerce.number().int().positive().optional(),
        roundNo: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const sendRunQuery = parseSendRunQueryInput(query);
    const resolved = sendRunQuery.sendRunId || sendRunQuery.roundNo
      ? await resolveCampaignSendRunId(db, campaignId, sendRunQuery)
      : null;
    if (resolved) {
      const roundCore = await computeCampaignRoundStatsSummary(db, campaignId, resolved.sendRunId, "", []);
      return res.json({
        ok: true,
        sendRunId: resolved.sendRunId,
        roundNo: resolved.roundNo,
        counts: {
          subscribe: roundCore.subscribeCount,
          unsubscribe: roundCore.unsubscribeCount,
          complaint: roundCore.complaintCount
        }
      });
    }
    const allTime = queryFlagTruthy(query.allTime);
    const subRange = allTime ? { clause: "", params: [] as unknown[] } : { clause: "", params: [] as unknown[] };
    const unsubRange = subRange;
    const evtRange = subRange;
    const sendRange = subRange;
    const summary = await loadCampaignEngagementSummary(db, campaignId, {
      sendRange,
      subRange,
      fromClause: "",
      fromParams: [],
      unsubRange,
      evtRange
    });
    const complaintCount = await countCampaignComplaints(db, campaignId);
    res.json({
      ok: true,
      counts: {
        subscribe: summary.subscribeCount,
        unsubscribe: summary.unsubscribeCount,
        complaint: Math.max(summary.complaintCount, complaintCount)
      }
    });
  });

  /** 活动互动指标（已打开/已订阅等），与 send-contacts 打开统计口径一致 */
  app.get("/api/email/campaigns/:id/engagement-summary", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动统计（与当前租户不一致）。" });
    }
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        fromEmail: z.string().optional(),
        domain: z.string().optional(),
        allTime: z.union([z.string(), z.boolean()]).optional()
      })
      .parse(req.query);
    const allTime = queryFlagTruthy(query.allTime);
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = query.from && ymdRe.test(query.from) ? query.from : businessTodayYmd();
    let toY = query.to && ymdRe.test(query.to) ? query.to : fromY;
    if (fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }
    const { start: startDt, endExclusive } = businessRangeMysqlBounds(fromY, toY);
    const sendRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive);
    const subCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive);
    const evtCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("created_at", startDt, endExclusive);
    const unsubCreatedRange = allTime
      ? { clause: "", params: [] as unknown[] }
      : sqlBusinessDatetimeBetweenAnd("u.created_at", startDt, endExclusive);

    const fromEmailRaw = String(query.fromEmail ?? query.domain ?? "all")
      .trim()
      .toLowerCase();
    const fromEmailFilter = fromEmailRaw && fromEmailRaw !== "all";
    const [campRows] = await db.query(`SELECT id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    if (!(campRows as any[])[0]) return res.status(404).json({ ok: false, message: "活动不存在" });

    const [smtpJoinRows] = await db.query(
      `SELECT LOWER(TRIM(COALESCE(sp.from_email, ''))) AS fe
       FROM email_campaigns c
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       WHERE c.id = ?
       LIMIT 1`,
      [campaignId]
    );
    const campaignSmtpFromLower = String((smtpJoinRows as any[])[0]?.fe ?? "").trim();
    const fromClause = fromEmailFilter
      ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ? `
      : "";
    const fromParams: string[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fromEmailRaw] : [];
    const allFromClause = fromEmailFilter
      ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ? `
      : "";
    const allFromParams: unknown[] = fromEmailFilter ? [campaignSmtpFromLower || "__none__", fromEmailRaw] : [];

    let usedAllTimeFallback = allTime;
    if (!allTime) {
      const [probeRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${sendRange.clause}${fromClause}`,
        [campaignId, ...sendRange.params, ...fromParams]
      );
      const probeN = Number((probeRows as { n?: unknown }[])[0]?.n ?? 0);
      if (probeN === 0) {
        const [allProbeRows] = await db.query(
          `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${allFromClause}`,
          [campaignId, ...allFromParams]
        );
        if (Number((allProbeRows as { n?: unknown }[])[0]?.n ?? 0) > 0) {
          usedAllTimeFallback = true;
        }
      }
    }

    const engSendRange =
      usedAllTimeFallback || allTime
        ? { clause: allFromClause, params: allFromParams }
        : sendRange;
    const subRangeForEng =
      usedAllTimeFallback || allTime ? { clause: "", params: [] as unknown[] } : subCreatedRange;
    const evtRangeSql = usedAllTimeFallback || allTime ? "" : evtCreatedRange.clause;
    const evtRangeParams: unknown[] =
      usedAllTimeFallback || allTime ? [] : [...evtCreatedRange.params];
    const unsubRangeSql = usedAllTimeFallback || allTime ? "" : unsubCreatedRange.clause;
    const unsubRangeParams: unknown[] =
      usedAllTimeFallback || allTime ? [] : [...unsubCreatedRange.params];

    const summary = await loadCampaignEngagementSummary(db, campaignId, {
      sendRange: engSendRange,
      subRange: subRangeForEng,
      fromClause,
      fromParams,
      unsubRange: { clause: unsubRangeSql, params: unsubRangeParams },
      evtRange: { clause: evtRangeSql, params: evtRangeParams }
    });
    const complaintCount = await countCampaignComplaints(db, campaignId);
    res.json({
      ok: true,
      statsScope: usedAllTimeFallback ? "all_time_fallback" : "range",
      summary: { ...summary, complaintCount: Math.max(summary.complaintCount, complaintCount) }
    });
  });

  /** 活动投递诊断：查看 SMTP 受理/拒收与退信事件的对账结果 */
  app.get("/api/email/campaigns/:id/delivery-diagnostics", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const lite = queryFlagTruthy((req.query as { lite?: unknown }).lite);
    const fromEmailsRaw = String((req.query as { fromEmails?: unknown }).fromEmails ?? "").trim();
    const fromEmails = [
      ...new Set(
        fromEmailsRaw
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    ];
    const fromEmailSql =
      fromEmails.length > 0
        ? ` AND LOWER(TRIM(COALESCE(s.from_email, ''))) IN (${fromEmails.map(() => "?").join(", ")})`
        : "";
    const fromEmailParams = fromEmails.length > 0 ? fromEmails : [];
    const requestTenantId = resolveTenantId(req);
    const diagReadPool = lite ? dbAuth : db;
    const [tenantRows] = await diagReadPool.query(
      `SELECT tenant_id, recipient_count, status FROM email_campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );
    const campaignProgressRow =
      (tenantRows as { tenant_id?: unknown; recipient_count?: unknown; status?: unknown }[])[0] ??
      null;
    const campTenantId = Number(campaignProgressRow?.tenant_id ?? 0);
    const campaignSendingHint =
      String(campaignProgressRow?.status ?? "")
        .trim()
        .toLowerCase() === "sending";
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的投递诊断（与当前租户不一致）。" });
    }

    /** 专线发信区快速诊断：仅 email_sends 汇总 + 最近样本，不做退信 EXISTS（发送中 DB 压力大时避免超时） */
    if (lite) {
      const diagCacheTtlMs = campaignSendingHint
        ? DELIVERY_DIAG_LITE_CACHE_SENDING_MS
        : DELIVERY_DIAG_LITE_CACHE_MS;
      const diagCacheHit = deliveryDiagLiteCache.get(campaignId);
      if (diagCacheHit && Date.now() - diagCacheHit.at < diagCacheTtlMs) {
        return res.json(diagCacheHit.body);
      }
      const inflightDiag = deliveryDiagLiteInflight.get(campaignId);
      if (inflightDiag) {
        return res.json(await inflightDiag);
      }
      const diagLiteT0 = Date.now();
      const diagBuild = (async (): Promise<Record<string, unknown>> => {
      try {
      let diagSendRunSql = "";
      const diagSendRunParams: unknown[] = [];
      if (campaignSendingHint) {
        let diagRunId = Math.max(0, Number(campaignActiveSendRunId.get(campaignId) ?? 0));
        if (diagRunId <= 0) {
          diagRunId = await resolveCampaignProgressSendRunId(dbAuth, campaignId);
        }
        if (diagRunId > 0) {
          diagSendRunSql = " AND s.send_run_id = ?";
          diagSendRunParams.push(diagRunId);
        }
      }
      const [sumRows] = await runWithTimeout(
        () =>
          dbAuth.query(
            `SELECT
           COUNT(*) AS attempts,
           SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent_ok,
           ${sqlSumEmailSendSmtpFailures("s")} AS sent_fail,
           SUM(CASE WHEN s.status = 'sending' THEN 1 ELSE 0 END) AS sending_now
         FROM email_sends s
         WHERE s.campaign_id = ?${fromEmailSql}${diagSendRunSql}`,
            [campaignId, ...fromEmailParams, ...diagSendRunParams]
          ),
        8_000,
        "诊断汇总查询超时（8 秒）。发送中请稍候再点「生成诊断」。"
      );
      const sum = (sumRows as Array<Record<string, unknown>>)[0] ?? {};
      const attempts = Number(sum.attempts ?? 0);
      const sentOk = Number(sum.sent_ok ?? 0);
      const sentFail = Number(sum.sent_fail ?? 0);
      const sendingNow = Number(sum.sending_now ?? 0);
      const [sampleRows] = await runWithTimeout(
        () =>
          dbAuth.query(
            `SELECT
           s.id AS send_id,
           s.to_email,
           s.status AS send_status,
           s.error AS send_error,
           s.provider_message_id,
           s.created_at AS send_created_at
         FROM email_sends s
         WHERE s.campaign_id = ?${fromEmailSql}${diagSendRunSql}
         ORDER BY s.id DESC
         LIMIT 30`,
            [campaignId, ...fromEmailParams, ...diagSendRunParams]
          ),
        8_000,
        "诊断样本查询超时（8 秒）。"
      );
      const diagBody = {
        ok: true,
        lite: true,
        campaignId,
        fromEmails: fromEmails.length > 0 ? fromEmails : undefined,
        totals: {
          attempts,
          sentRecorded: sentOk,
          failedRecorded: sentFail,
          sendingNow,
          bouncedEvents: 0,
          bouncedMatchedSends: 0,
          deliveredCorrected: sentOk,
          failedCorrected: sentFail
        },
        samples: (sampleRows as Array<Record<string, unknown>>).map((r) => ({
          sendId: Number(r.send_id ?? 0),
          email: String(r.to_email ?? ""),
          sendStatus: String(r.send_status ?? ""),
          sendError: String(r.send_error ?? ""),
          providerMessageId: r.provider_message_id ? String(r.provider_message_id) : "",
          sendCreatedAt: r.send_created_at,
          lastBouncedAt: null
        }))
      };
      deliveryDiagLiteCache.set(campaignId, { at: Date.now(), body: diagBody });
      return diagBody;
      } catch (diagErr: unknown) {
        const diagMsg = String((diagErr as Error)?.message ?? diagErr);
        const stale = deliveryDiagLiteCache.get(campaignId);
        if (stale) {
          return { ...stale.body, cacheStale: true };
        }
        throw diagErr;
      }
      })();
      deliveryDiagLiteInflight.set(campaignId, diagBuild);
      try {
        return res.json(await diagBuild);
      } finally {
        deliveryDiagLiteInflight.delete(campaignId);
      }
    }

    const [sumRows] = await db.query(
      `SELECT
         COUNT(*) AS attempts,
         SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent_ok,
         ${sqlSumEmailSendSmtpFailures("s")} AS sent_fail
       FROM email_sends s
       WHERE s.campaign_id = ?${fromEmailSql}`,
      [campaignId, ...fromEmailParams]
    );
    const sum = (sumRows as any[])[0] ?? {};
    const attempts = Number(sum.attempts ?? 0);
    const sentOk = Number(sum.sent_ok ?? 0);
    const sentFail = Number(sum.sent_fail ?? 0);

    const [bounceRows] = await db.query(
      `SELECT COUNT(DISTINCT e.id) AS c
         FROM email_delivery_events e
        WHERE e.event_type = 'bounced'
          AND EXISTS (
            SELECT 1
              FROM email_sends sx
             WHERE sx.campaign_id = ?
               ${fromEmails.length > 0 ? `AND LOWER(TRIM(COALESCE(sx.from_email, ''))) IN (${fromEmails.map(() => "?").join(", ")})` : ""}
               AND ${sqlBounceEventMatchesSend("e", "sx")}
          )`,
      fromEmails.length > 0 ? [campaignId, ...fromEmailParams] : [campaignId]
    );
    const bouncedEvents = Number((bounceRows as any[])[0]?.c ?? 0);
    const [bounceMatchRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM email_sends s
        WHERE s.campaign_id = ?${fromEmailSql}
          AND s.status = 'sent'
          AND EXISTS (
            SELECT 1
              FROM email_delivery_events e
             WHERE e.event_type = 'bounced'
               AND ${sqlBounceEventMatchesSend("e", "s")}
          )`,
      [campaignId, ...fromEmailParams]
    );
    const bouncedMatchedSends = Number((bounceMatchRows as any[])[0]?.c ?? 0);
    const correctedDelivered = Math.max(0, sentOk - Math.min(sentOk, bouncedMatchedSends));
    const correctedFailed = sentFail + Math.max(0, Math.min(sentOk, bouncedMatchedSends));

    const [sampleRows] = await db.query(
      `SELECT
         s.id AS send_id,
         s.to_email,
         s.status AS send_status,
         s.error AS send_error,
         s.provider_message_id,
         s.created_at AS send_created_at,
         (
           SELECT MAX(e.created_at)
             FROM email_delivery_events e
            WHERE e.event_type = 'bounced'
              AND ${sqlBounceEventMatchesSend("e", "s")}
         ) AS last_bounced_at
       FROM email_sends s
       WHERE s.campaign_id = ?${fromEmailSql}
       ORDER BY s.id DESC
       LIMIT 50`,
      [campaignId, ...fromEmailParams]
    );

    return res.json({
      ok: true,
      campaignId,
      fromEmails: fromEmails.length > 0 ? fromEmails : undefined,
      totals: {
        attempts,
        sentRecorded: sentOk,
        failedRecorded: sentFail,
        bouncedEvents,
        bouncedMatchedSends,
        deliveredCorrected: correctedDelivered,
        failedCorrected: correctedFailed
      },
      samples: (sampleRows as any[]).map((r) => ({
        sendId: Number(r.send_id ?? 0),
        email: String(r.to_email ?? ""),
        sendStatus: String(r.send_status ?? ""),
        sendError: String(r.send_error ?? ""),
        providerMessageId: r.provider_message_id ? String(r.provider_message_id) : "",
        sendCreatedAt: r.send_created_at,
        lastBouncedAt: r.last_bounced_at
      }))
    });
  });

  /** 历史数据校正：将已匹配退信事件但仍标记 sent 的记录改为 failed（默认 dry-run） */
  app.post("/api/email/campaigns/:id/reconcile-delivery", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权校正该活动的投递数据（与当前租户不一致）。" });
    }
    const body = z
      .object({
        apply: z
          .union([z.boolean(), z.string()])
          .optional()
          .transform((v) => {
            if (typeof v === "boolean") return v;
            const t = String(v ?? "")
              .trim()
              .toLowerCase();
            return t === "1" || t === "true" || t === "yes" || t === "on";
          })
          .default(false)
      })
      .parse(req.body ?? {});
    const apply = body.apply;

    const r = await reconcileCampaignBouncedSends(db, campaignId, { apply, limit: 200000 });

    return res.json({
      ok: true,
      campaignId,
      dryRun: !apply,
      matched: r.matched,
      updated: r.updated
    });
  });

  /** 发送名单各 tab 联系人数量（避免前端多页拉全量做筛选） */
  app.get("/api/email/campaigns/:id/send-contacts/tab-totals", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的发送列表。" });
    }
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        fromEmail: z.string().optional(),
        domain: z.string().optional(),
        skipImap: z.union([z.string(), z.boolean()]).optional(),
        fast: z.union([z.string(), z.boolean()]).optional(),
        /** 统计页 7 栏：轻量退信口径，避免首屏超时 */
        statsPanel: z.union([z.string(), z.boolean()]).optional(),
        /** 1=跳过 tab-totals 缓存，发送中轮询时传 */
        refresh: z.union([z.string(), z.boolean()]).optional(),
        sendRunId: z.coerce.number().int().positive().optional(),
        roundNo: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const sendRunQuery = parseSendRunQueryInput(q);
    const wantsRoundScope = Boolean(sendRunQuery.sendRunId || sendRunQuery.roundNo);
    const resolvedRun = wantsRoundScope
      ? await resolveCampaignSendRunId(db, campaignId, sendRunQuery)
      : null;
    const scopedSendRunId = resolvedRun?.sendRunId ?? null;
    const [campRows] = await db.query(`SELECT id, status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campRow = (campRows as Array<{ id?: unknown; status?: unknown }>)[0];
    if (!campRow) return res.status(404).json({ ok: false, message: "活动不存在" });
    const skipImap = queryFlagTruthy(q.skipImap);
    const refreshTotals = queryFlagTruthy(q.refresh);
    const statusHint = String(campRow.status ?? "").trim().toLowerCase();
    try {
      if (!skipImap) {
        await syncCampaignBounceImapAndReconcile(db, env, campaignId, { statusHint });
      }
      /** skipImap=1 为统计页快速路径：不做退信对账，避免 tab-totals / 名单超时 */
    } catch {
      /* ignore */
    }
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = q.from && ymdRe.test(q.from) ? q.from : "";
    let toY = q.to && ymdRe.test(q.to) ? q.to : "";
    if (fromY && toY && fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }
    const fromEmailRaw = String(q.fromEmail ?? q.domain ?? "all")
      .trim()
      .toLowerCase();
    const useStatsPanelTotals =
      queryFlagTruthy(q.statsPanel) &&
      queryFlagTruthy(q.fast) &&
      skipImap;
    const cacheKey = campaignSendListCacheKey({
      kind: "totals",
      campaignId,
      from: fromY,
      to: toY,
      fe: fromEmailRaw,
      run: scopedSendRunId ?? 0
    });
    const cached = readCampaignSendListCache<{
      all: number;
      opened: number;
      success: number;
      failed: number;
    }>(cacheKey);
    /** 统计页 7 栏勿用旧缓存（发送完成后常残留 failed=0） */
    if (cached && !refreshTotals && !useStatsPanelTotals) {
      const cachedFail = Number(cached.failed ?? 0);
      return res.json({
        ok: true,
        totals: cached,
        cached: true,
        campaignFailCount: useStatsPanelTotals ? cachedFail : undefined,
        summaryFailCount: useStatsPanelTotals ? cachedFail : undefined,
        sendRunId: scopedSendRunId ?? undefined,
        roundNo: resolvedRun?.roundNo
      });
    }
    if (useStatsPanelTotals) {
      try {
        await reconcileCampaignBounceDbOnly(db, campaignId);
      } catch {
        /* DB 对账失败不阻断 tab-totals */
      }
    }
    const totals = useStatsPanelTotals
      ? await loadCampaignSendTabTotalsStatsPanel(db, campaignId, scopedSendRunId, {
          fromY,
          toY,
          fromEmail: fromEmailRaw && fromEmailRaw !== "all" ? fromEmailRaw : "all"
        })
      : await loadCampaignSendTabTotalsFast(
          db,
          campaignId,
          fromY,
          toY,
          fromEmailRaw,
          scopedSendRunId
        );
    /** 7 栏仍为 0 时：与单组 send-progress lite 对齐（含 skipped 行）；发送中且非 refresh 才托底 */
    if (useStatsPanelTotals && totals.failed === 0 && statusHint === "sending" && !refreshTotals) {
      try {
        let liteRunId = scopedSendRunId ?? 0;
        if (liteRunId <= 0) {
          const [runIdRows] = await db.query(
            `SELECT id FROM email_campaign_send_runs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`,
            [campaignId]
          );
          liteRunId = Number((runIdRows as Array<{ id?: unknown }>)[0]?.id ?? 0);
        }
        if (liteRunId > 0) {
          const lite = await countSendRunProgressMetricsLite(db, campaignId, liteRunId);
          if (lite.failed > 0) {
            totals.failed = lite.failed;
            totals.success = lite.sent;
            totals.all = Math.max(totals.all, lite.sent + lite.failed);
          }
        }
      } catch {
        /* lite 托底失败不阻断 */
      }
    }
    /** 统计页：名单「退回/失败」tab 用 distinct；7 栏 failCount 用 summaryFailCount */
    let campaignFailCount = totals.failed;
    let summaryFailCount = totals.failed;
    if (useStatsPanelTotals) {
      try {
        summaryFailCount = await loadCampaignSummaryFailCountStatsPanel(db, campaignId, totals.failed);
        campaignFailCount = summaryFailCount;
        totals.failed = summaryFailCount;
      } catch {
        /* 托底计数失败不阻断 tab-totals */
      }
      /** 历史轮次 send_run 未写入 fail_count 时，按 7 栏结果回写，避免统计页长期 0 */
      if (totals.failed > 0) {
        try {
          const [runIdRows] = await db.query(
            `SELECT id FROM email_campaign_send_runs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`,
            [campaignId]
          );
          const latestRunId = Number((runIdRows as Array<{ id?: unknown }>)[0]?.id ?? 0);
          if (latestRunId > 0) {
            await db.query(
              `UPDATE email_campaign_send_runs
                  SET fail_count = GREATEST(COALESCE(fail_count, 0), ?),
                      success_count = ?,
                      updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
              [totals.failed, totals.success, latestRunId]
            );
          }
        } catch {
          /* 回写失败不阻断响应 */
        }
      }
    }
    writeCampaignSendListCache(
      cacheKey,
      totals,
      useStatsPanelTotals ? 30_000 : undefined
    );
    return res.json({
      ok: true,
      totals,
      campaignFailCount: useStatsPanelTotals ? campaignFailCount : undefined,
      summaryFailCount: useStatsPanelTotals ? summaryFailCount : undefined,
      fast: true,
      statsPanel: useStatsPanelTotals,
      sendRunId: scopedSendRunId ?? undefined,
      roundNo: resolvedRun?.roundNo
    });
  });

  /** 某活动下已触达联系人汇总（分页）。open_count 来自 email_delivery_events.opened；退信类计 bounce_like_count。 */
  app.get("/api/email/campaigns/:id/send-contacts", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的发送列表（与当前租户不一致）。" });
    }
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        /** 默认 50；统计页拉「整活动成功/失败名单」时可传更大值（有上限防刷库） */
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        sort: z.enum(["default", "opens_desc"]).default("default"),
        tab: z.enum(["all", "opened", "success", "failed"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        fromEmail: z.string().optional(),
        domain: z.string().optional(),
        /** 统计页轮询传 1：跳过 IMAP 同步，显著降低列表接口延迟 */
        skipImap: z.union([z.string(), z.boolean()]).optional(),
        /** 与 skipImap 相同：走轻量 send-contacts 查询 */
        fast: z.union([z.string(), z.boolean()]).optional(),
        lite: z.union([z.string(), z.boolean()]).optional(),
        /** 统计页全活动名单：轻量 tab 计数与退信口径 */
        statsPanel: z.union([z.string(), z.boolean()]).optional(),
        /** 1=跳过 send-contacts 分页缓存（删除联系人后刷新名单） */
        refresh: z.union([z.string(), z.boolean()]).optional(),
        sendRunId: z.coerce.number().int().positive().optional(),
        roundNo: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const sendRunQuery = parseSendRunQueryInput(q);
    const wantsRoundScope = Boolean(sendRunQuery.sendRunId || sendRunQuery.roundNo);
    const resolvedRun = wantsRoundScope
      ? await resolveCampaignSendRunId(db, campaignId, sendRunQuery)
      : null;
    const scopedSendRunId = resolvedRun?.sendRunId ?? null;
    const listTab = q.tab && q.tab !== "all" ? q.tab : undefined;
    const tabFilterSql = sendContactsTabFilterSql(listTab);

    const [campRows] = await db.query(
      `SELECT id, status FROM email_campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );
    const campRow = (campRows as Array<{ id?: unknown; status?: unknown }>)[0];
    if (!campRow) return res.status(404).json({ ok: false, message: "活动不存在" });

    const skipImapList = queryFlagTruthy(q.skipImap);
    if (!skipImapList) {
      try {
        await syncCampaignBounceImapAndReconcile(db, env, campaignId, {
          statusHint: String(campRow.status ?? "")
        });
      } catch {
        /* IMAP 同步失败不阻断联系人列表 */
      }
    }

    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = q.from && ymdRe.test(q.from) ? q.from : "";
    let toY = q.to && ymdRe.test(q.to) ? q.to : "";
    if (fromY && toY && fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }
    const hasDateRange = Boolean(fromY && toY);
    const rangeBounds = hasDateRange ? businessRangeMysqlBounds(fromY, toY) : null;
    const startDt = rangeBounds?.start ?? "";
    const endExclusive = rangeBounds?.endExclusive ?? "";

    const fromEmailRaw = String(q.fromEmail ?? q.domain ?? "all")
      .trim()
      .toLowerCase();
    const fromEmailFilter = fromEmailRaw && fromEmailRaw !== "all";
    const [smtpJoinRows] = await db.query(
      `SELECT LOWER(TRIM(COALESCE(sp.from_email, ''))) AS fe
       FROM email_campaigns c
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       WHERE c.id = ?
       LIMIT 1`,
      [campaignId]
    );
    const campaignSmtpFromLower = String((smtpJoinRows as any[])[0]?.fe ?? "").trim();

    const fromClause = fromEmailFilter ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ?` : "";
    const fromParams: unknown[] = fromEmailFilter
      ? [campaignSmtpFromLower || "__none__", fromEmailRaw]
      : [];
    let sendListRange = hasDateRange
      ? sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive)
      : { clause: "", params: [] as [] };
    let listDateScope: "range" | "all_campaign" = hasDateRange ? "range" : "all_campaign";

    const useFastSendList = skipImapList || queryFlagTruthy(q.fast);
    if (hasDateRange && !useFastSendList) {
      const [rangeProbeRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${sendListRange.clause}${fromClause}`,
        [campaignId, ...sendListRange.params, ...fromParams]
      );
      const rangeProbeN = Number((rangeProbeRows as { n?: unknown }[])[0]?.n ?? 0);
      if (rangeProbeN === 0) {
        const [allProbeRows] = await db.query(
          `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${fromClause}`,
          [campaignId, ...fromParams]
        );
        if (Number((allProbeRows as { n?: unknown }[])[0]?.n ?? 0) > 0) {
          sendListRange = { clause: "", params: [] };
          listDateScope = "all_campaign";
        }
      }
    }

    const pageSize = q.pageSize;
    const offset = (q.page - 1) * pageSize;
    const refreshList = queryFlagTruthy(q.refresh);

    if (useFastSendList) {
      const cacheKey = campaignSendListCacheKey({
        kind: "page",
        campaignId,
        tab: listTab ?? "all",
        page: q.page,
        pageSize,
        sort: q.sort,
        from: fromY,
        to: toY,
        fe: fromEmailRaw,
        run: scopedSendRunId ?? 0
      });
      const cached = refreshList
        ? null
        : readCampaignSendListCache<{
            total: number;
            items: unknown[];
            listDateScope: "range" | "all_campaign";
          }>(cacheKey);
      if (cached) {
        const totalPages = cached.total === 0 ? 1 : Math.ceil(cached.total / pageSize);
        return res.json({
          ok: true,
          cached: true,
          listDateScope: cached.listDateScope,
          page: q.page,
          pageSize,
          total: cached.total,
          totalPages,
          items: cached.items
        });
      }
      const totalsHint = refreshList
        ? null
        : readCampaignSendListCache<{
            all: number;
            opened: number;
            success: number;
            failed: number;
          }>(
            campaignSendListCacheKey({
              kind: "totals",
              campaignId,
              from: fromY,
              to: toY,
              fe: fromEmailRaw,
              run: scopedSendRunId ?? 0
            })
          );
      const statsPanelList = queryFlagTruthy(q.statsPanel);
      const fast = await loadCampaignSendContactsPageFast(db, {
        campaignId,
        tab: listTab,
        page: q.page,
        pageSize,
        sort: q.sort,
        fromY,
        toY,
        fromEmail: fromEmailRaw,
        sendRunId: scopedSendRunId,
        lite: queryFlagTruthy(q.lite) || useFastSendList,
        totalsHint,
        contactLevelMetrics: statsPanelList
      });
      writeCampaignSendListCache(cacheKey, fast);
      const totalPages = fast.total === 0 ? 1 : Math.ceil(fast.total / pageSize);
      return res.json({
        ok: true,
        fast: true,
        listDateScope: fast.listDateScope,
        page: q.page,
        pageSize,
        total: fast.total,
        totalPages,
        items: fast.items
      });
    }

    const rangeClause = sendListRange.clause;
    const sxRangeClause = sendListRange.clause.replace(/s\.created_at/g, "sx.created_at");
    const commonParams: unknown[] = [...sendListRange.params, ...fromParams];

    const orderSql =
      q.sort === "opens_desc" ? "open_count DESC, send_count DESC, contact_id ASC" : "contact_id ASC";

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT
           COALESCE(MAX(oe.opened_count), 0) AS open_count,
           COUNT(s.id) AS send_count,
           ${sqlSumEmailSendSmtpFailures("s")}
             + COALESCE(MAX(be.bounced_count), 0) AS bounce_like_count
         FROM email_sends s
         INNER JOIN email_contacts c ON c.id = s.contact_id
         LEFT JOIN (
           SELECT sx.campaign_id, COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key, COUNT(DISTINCT e.id) AS bounced_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e ON e.event_type = 'bounced' AND ${sqlBounceEventMatchesSend("e", "sx")}
           WHERE sx.campaign_id = ?${sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) be ON be.campaign_id = s.campaign_id
           AND ((be.contact_id_key > 0 AND be.contact_id_key = c.id) OR (be.contact_id_key = 0 AND be.email_key = LOWER(TRIM(c.email))))
         LEFT JOIN (
           SELECT sx.campaign_id, COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key, COUNT(DISTINCT e.id) AS opened_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e ON e.event_type = 'opened' AND e.email_send_id = sx.id
           WHERE sx.campaign_id = ?${sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) oe ON oe.campaign_id = s.campaign_id
           AND ((oe.contact_id_key > 0 AND oe.contact_id_key = c.id) OR (oe.contact_id_key = 0 AND oe.email_key = LOWER(TRIM(c.email))))
         WHERE s.campaign_id = ? AND s.contact_id IS NOT NULL ${rangeClause} ${fromClause}
         GROUP BY c.id
       ) agg
       WHERE 1=1${tabFilterSql}`,
      [
        campaignId,
        ...sendListRange.params,
        campaignId,
        ...sendListRange.params,
        campaignId,
        ...commonParams
      ]
    );
    const total = Number((countRows as any[])[0]?.cnt ?? 0);

    const [rows] = await db.query(
      `SELECT * FROM (
         SELECT
           c.id AS contact_id,
           COALESCE(c.industry, '') AS industry,
           COALESCE(c.company, '') AS company,
           TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS contact_name,
           COALESCE(c.job_title, '') AS job_title,
           COALESCE(c.phone, '') AS phone,
           COALESCE(c.fax, '') AS fax,
           c.email,
           COALESCE(c.address, '') AS address,
           COUNT(s.id) AS send_count,
           COALESCE(MAX(oe.opened_count), 0) AS open_count,
           ${sqlSumEmailSendSmtpFailures("s")}
             + COALESCE(MAX(be.bounced_count), 0) AS bounce_like_count
         FROM email_sends s
         INNER JOIN email_contacts c ON c.id = s.contact_id
         LEFT JOIN (
           SELECT
             sx.campaign_id,
             COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key,
             COUNT(DISTINCT e.id) AS bounced_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e
             ON e.event_type = 'bounced'
            AND ${sqlBounceEventMatchesSend("e", "sx")}
           WHERE sx.campaign_id = ?${sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) be
           ON be.campaign_id = s.campaign_id
          AND (
            (be.contact_id_key > 0 AND be.contact_id_key = c.id)
            OR (be.contact_id_key = 0 AND be.email_key = LOWER(TRIM(c.email)))
          )
         LEFT JOIN (
           SELECT
             sx.campaign_id,
             COALESCE(sx.contact_id, 0) AS contact_id_key,
             LOWER(TRIM(sx.to_email)) AS email_key,
             COUNT(DISTINCT e.id) AS opened_count
           FROM email_sends sx
           INNER JOIN email_delivery_events e
             ON e.event_type = 'opened'
            AND e.email_send_id = sx.id
           WHERE sx.campaign_id = ?${sxRangeClause}
           GROUP BY sx.campaign_id, COALESCE(sx.contact_id, 0), LOWER(TRIM(sx.to_email))
         ) oe
           ON oe.campaign_id = s.campaign_id
          AND (
            (oe.contact_id_key > 0 AND oe.contact_id_key = c.id)
            OR (oe.contact_id_key = 0 AND oe.email_key = LOWER(TRIM(c.email)))
          )
         WHERE s.campaign_id = ? ${rangeClause} ${fromClause}
         GROUP BY c.id, c.industry, c.company, c.first_name, c.last_name, c.job_title, c.phone, c.fax, c.email, c.address
       ) agg
       WHERE 1=1${tabFilterSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      [
        campaignId,
        ...sendListRange.params,
        campaignId,
        ...sendListRange.params,
        campaignId,
        ...commonParams,
        pageSize,
        offset
      ]
    );

    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    res.json({
      ok: true,
      listDateScope,
      page: q.page,
      pageSize,
      total,
      totalPages,
      items: (rows as any[]).map((r) => ({
        contactId: Number(r.contact_id),
        industry: String(r.industry ?? ""),
        company: String(r.company ?? ""),
        contactName: String(r.contact_name ?? "").trim() || "—",
        jobTitle: String(r.job_title ?? ""),
        phone: String(r.phone ?? ""),
        fax: String(r.fax ?? ""),
        email: String(r.email ?? ""),
        address: String(r.address ?? ""),
        sendCount: Number(r.send_count ?? 0),
        openCount: Number(r.open_count ?? 0),
        bounceLikeCount: Number(r.bounce_like_count ?? 0)
      }))
    });
  });

  /** 按发送名单 tab 批量删除 CRM 联系人（服务端分批，避免前端上千次 DELETE） */
  app.post("/api/email/campaigns/:id/send-contacts/bulk-delete-contacts", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const body = z
      .object({
        tab: z.enum(["opened", "success", "failed"]),
        contactIds: z.array(z.coerce.number().int().positive()).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        fromEmail: z.string().optional()
      })
      .parse(req.body ?? {});
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const fromY = body.from && ymdRe.test(body.from) ? body.from : "";
    const toY = body.to && ymdRe.test(body.to) ? body.to : "";
    try {
      const result = await bulkDeleteCampaignSendTabContacts(db, {
        campaignId,
        tenantId: requestTenantId,
        tab: body.tab,
        contactIds: body.contactIds,
        fromY,
        toY,
        fromEmail: body.fromEmail
      });
      return res.json({ ok: true, ...result });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, message: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * 某活动下单次 SMTP 发送行（email_sends 一行一封），分页 + 投递事件计数。
   * 供「营销活动统计」页做全活动逐封实时表格；与 send-contacts（按联系人聚合）互补。
   */
  app.get("/api/email/campaigns/:id/send-rows", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((tenantRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的发送明细（与当前租户不一致）。" });
    }
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        from: z.string().optional(),
        to: z.string().optional(),
        fromEmail: z.string().optional(),
        sendRunId: z.coerce.number().int().positive().optional(),
        roundNo: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const sendRunQuery = parseSendRunQueryInput(q);
    const wantsRoundScope = Boolean(sendRunQuery.sendRunId || sendRunQuery.roundNo);
    const resolvedRun = wantsRoundScope
      ? await resolveCampaignSendRunId(db, campaignId, sendRunQuery)
      : null;
    const runOnS = sqlSendRunFilter("s", resolvedRun?.sendRunId);

    const [campRows] = await db.query(`SELECT id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    if (!(campRows as any[])[0]) return res.status(404).json({ ok: false, message: "活动不存在" });

    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromY = q.from && ymdRe.test(q.from) ? q.from : "";
    let toY = q.to && ymdRe.test(q.to) ? q.to : "";
    if (fromY && toY && fromY > toY) {
      const t = fromY;
      fromY = toY;
      toY = t;
    }
    const hasDateRange = Boolean(fromY && toY);
    const rangeBounds = hasDateRange ? businessRangeMysqlBounds(fromY, toY) : null;
    const startDt = rangeBounds?.start ?? "";
    const endExclusive = rangeBounds?.endExclusive ?? "";

    const fromEmailRaw = String(q.fromEmail ?? "all")
      .trim()
      .toLowerCase();
    const fromEmailFilter = fromEmailRaw && fromEmailRaw !== "all";
    const [smtpJoinRows] = await db.query(
      `SELECT LOWER(TRIM(COALESCE(sp.from_email, ''))) AS fe
       FROM email_campaigns c
       LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
       WHERE c.id = ?
       LIMIT 1`,
      [campaignId]
    );
    const campaignSmtpFromLower = String((smtpJoinRows as any[])[0]?.fe ?? "").trim();

    const fromClause = fromEmailFilter ? ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.from_email), ''), ?))) = ?` : "";
    const fromParams: unknown[] = fromEmailFilter
      ? [campaignSmtpFromLower || "__none__", fromEmailRaw]
      : [];
    let sendListRange = hasDateRange
      ? sqlBusinessDatetimeBetweenAnd("s.created_at", startDt, endExclusive)
      : { clause: "", params: [] as [] };
    let listDateScope: "range" | "all_campaign" = hasDateRange ? "range" : "all_campaign";

    if (hasDateRange) {
      const [rangeProbeRows] = await db.query(
        `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${sendListRange.clause}${runOnS.clause}${fromClause}`,
        [campaignId, ...sendListRange.params, ...runOnS.params, ...fromParams]
      );
      if (Number((rangeProbeRows as { n?: unknown }[])[0]?.n ?? 0) === 0) {
        const [allProbeRows] = await db.query(
          `SELECT COUNT(*) AS n FROM email_sends s WHERE s.campaign_id = ?${runOnS.clause}${fromClause}`,
          [campaignId, ...runOnS.params, ...fromParams]
        );
        if (Number((allProbeRows as { n?: unknown }[])[0]?.n ?? 0) > 0) {
          sendListRange = { clause: "", params: [] };
          listDateScope = "all_campaign";
        }
      }
    }

    const rangeClause = `${sendListRange.clause}${runOnS.clause}`;
    const commonParams: unknown[] = [...sendListRange.params, ...runOnS.params, ...fromParams];

    const pageSize = q.pageSize;
    const offset = (q.page - 1) * pageSize;

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS cnt
         FROM email_sends s
        WHERE s.campaign_id = ? ${rangeClause} ${fromClause}`,
      [campaignId, ...commonParams]
    );
    const total = Number((countRows as any[])[0]?.cnt ?? 0);

    const [sendRows] = await db.query(
      `SELECT s.id, s.to_email, s.status, s.created_at, s.from_email,
              s.provider_message_id, s.error, s.contact_id, s.send_run_id
         FROM email_sends s
        WHERE s.campaign_id = ? ${rangeClause} ${fromClause}
        ORDER BY s.id DESC
        LIMIT ? OFFSET ?`,
      [campaignId, ...commonParams, pageSize, offset]
    );

    const base = (sendRows as any[]).map((r) => ({
      sendId: Number(r.id ?? 0),
      toEmail: String(r.to_email ?? ""),
      status: String(r.status ?? ""),
      createdAt: r.created_at,
      fromEmail: String(r.from_email ?? ""),
      providerMessageId: String(r.provider_message_id ?? ""),
      error: String(r.error ?? "").slice(0, 500),
      contactId: r.contact_id != null ? Number(r.contact_id) : null
    }));

    const ids = base.map((b) => b.sendId).filter((id) => Number.isFinite(id) && id > 0);
    const evBySendId = new Map<number, { opened: number; clicked: number; bounced: number; complaint: number }>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(", ");
      const [evRows] = await db.query(
        `SELECT email_send_id, event_type, COUNT(*) AS c
           FROM email_delivery_events
          WHERE email_send_id IN (${ph})
            AND event_type IN ('opened', 'clicked', 'bounced', 'complaint')
          GROUP BY email_send_id, event_type`,
        ids
      );
      for (const row of evRows as any[]) {
        const sid = Number(row.email_send_id ?? 0);
        if (!sid) continue;
        if (!evBySendId.has(sid)) evBySendId.set(sid, { opened: 0, clicked: 0, bounced: 0, complaint: 0 });
        const m = evBySendId.get(sid)!;
        const t = String(row.event_type ?? "");
        const cnt = Number(row.c ?? 0);
        if (t === "opened") m.opened = cnt;
        else if (t === "clicked") m.clicked = cnt;
        else if (t === "bounced") m.bounced = cnt;
        else if (t === "complaint") m.complaint = cnt;
      }
    }

    const items = base.map((b) => {
      const ev = evBySendId.get(b.sendId);
      return {
        ...b,
        openCount: ev?.opened ?? 0,
        clickCount: ev?.clicked ?? 0,
        bounceEventCount: ev?.bounced ?? 0,
        complaintCount: ev?.complaint ?? 0
      };
    });

    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    return res.json({
      ok: true,
      listDateScope,
      page: q.page,
      pageSize,
      total,
      totalPages,
      items
    });
  });

  /** 发送进行中的轻量进度：供前端轮询展示最近邮箱与剩余估算 */
  app.get("/api/email/campaigns/:id/send-progress", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    let campaignId = 0;
    try {
    campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [tenantRows] = await db.query(
      `SELECT tenant_id, recipient_count FROM email_campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );
    /**
     * 进度接口同时取 recipient_count 作为前端进度条分母（executeCampaignSend
     * 进入循环前会校准这个字段），避免下面响应里使用 campaignProgressRow 时
     * 报 ReferenceError 把 /send-progress 整接口废掉（这条接口被前端 800ms 轮询
     * 一次，一旦异常会让浏览器看起来"发送中…但毫无进展"）。
     */
    const campaignProgressRow =
      (tenantRows as { tenant_id?: unknown; recipient_count?: unknown }[])[0] ?? null;
    const campTenantId = Number(campaignProgressRow?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权查看该活动的发送进度（与当前租户不一致）。" });
    }
    const sinceIdRaw = Number(req.query.sinceId ?? 0);
    const sinceId = Number.isFinite(sinceIdRaw) && sinceIdRaw > 0 ? Math.floor(sinceIdRaw) : 0;
    const clientSendRunIdRaw = Number(req.query.sendRunId ?? 0);
    const clientSendRunId =
      Number.isFinite(clientSendRunIdRaw) && clientSendRunIdRaw > 0 ? Math.floor(clientSendRunIdRaw) : 0;

    const [stRowsEarly] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campaignStatusHint = String((stRowsEarly as Array<{ status?: unknown }>)[0]?.status ?? "")
      .trim()
      .toLowerCase();
    let progressSendRunId = await resolveCampaignProgressSendRunId(db, campaignId, {
      clientSendRunId,
      memoryRunId: campaignActiveSendRunId.get(campaignId)
    });
    const campaignSendingEarly = campaignStatusHint === "sending";
    if (progressSendRunId <= 0 && !campaignSendingEarly) {
      progressSendRunId = await resolveLatestSendRunIdForCampaign(db, campaignId);
    }
    let runRoundNo = 0;
    let runPlannedTotal = Math.max(0, Number(campaignSendRunDisplayPlanned.get(campaignId) ?? 0));
    let progressRunStartedAt: Date | string | null = null;
    let progressRunStillSending = false;
    let progressLaneIndex = 0;
    if (progressSendRunId > 0) {
      const [rr] = await db.query(
        `SELECT round_no, planned_count, started_at, status, lane_index FROM email_campaign_send_runs WHERE id = ? LIMIT 1`,
        [progressSendRunId]
      );
      const rr0 = (rr as Array<{
        round_no?: unknown;
        planned_count?: unknown;
        started_at?: Date | string | null;
        status?: unknown;
        lane_index?: unknown;
      }>)[0];
      runRoundNo = Math.max(0, Number(rr0?.round_no ?? 0));
      const plannedDb = Math.max(0, Number(rr0?.planned_count ?? 0));
      if (plannedDb > 0) runPlannedTotal = plannedDb;
      progressRunStartedAt = rr0?.started_at ?? null;
      progressRunStillSending = String(rr0?.status ?? "").toLowerCase() === "sending";
      progressLaneIndex = Math.max(0, Math.floor(Number(rr0?.lane_index ?? 0)));
    }

    /**
     * 是否走 send_run 轻量统计（countSendRunProgressMetricsLite）。
     * 须在 progressRunStillSending 解析之后计算：活动 status 可能仍为 draft（tryMark 未写回），
     * 但 send_run 已在 sending，此时也必须走 lite，否则前端三栏恒为 0。
     */
    const campaignSending = campaignStatusHint === "sending";
    /**
     * 只要有 send_run 就走 lite，勿再落全活动聚合（7452 行），否则 400ms 多标签轮询会拖死连接池、
     * /api/auth/me 挂起，整站白屏转圈（见 pm2 PROTOCOL_CONNECTION_LOST @ send-progress）。
     */
    const useLiteSendProgress = progressSendRunId > 0;
    const progressFresh = String(req.query.fresh ?? "").trim() === "1";
    const laneMonitorFast = String(req.query.laneMonitor ?? "").trim() === "1";

    /** 发送中轮询：轻量路径，跳过全活动退信聚合 / IMAP / 最近行 bounce EXISTS */
    if (useLiteSendProgress) {
      const liteProgressT0 = Date.now();
      const liteCacheHit = sendProgressLiteCache.get(campaignId);
      const liteNow = Date.now();
      const lastReconcileAt = sendProgressReconcileLastAt.get(campaignId) ?? 0;
      /** 发送轮次进行中勿命中 lite 缓存，避免 recent/失败数长时间停在空或旧值 */
      const liteCacheSkippable = progressFresh || (progressRunStillSending && progressSendRunId > 0);
      if (
        !liteCacheSkippable &&
        liteCacheHit &&
        liteCacheHit.sendRunId === progressSendRunId &&
        liteNow - liteCacheHit.at < SEND_PROGRESS_LITE_CACHE_MS &&
        liteNow - lastReconcileAt < 2_500
      ) {
        return res.json(liteCacheHit.body);
      }

      const inflightHit = sendProgressLiteInflight.get(campaignId);
      if (inflightHit) {
        /** 专线 laneMonitor 必须等最新聚合，勿在 inflight 期间反复返回旧 attempted */
        const stale = sendProgressLiteCache.get(campaignId);
        if (
          !laneMonitorFast &&
          stale &&
          stale.sendRunId === progressSendRunId &&
          progressRunStillSending
        ) {
          return res.json(stale.body);
        }
        return res.json(await inflightHit);
      }

      const liteBuild = (async (): Promise<Record<string, unknown>> => {
      const routeDb = db;
      const liteBuildT0 = Date.now();
      let runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
      let sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
      /**
       * 多专线发信区 monitor（laneMonitor=1）发送中：COUNT 聚合为主，勿查 recent/失败 DISTINCT/autoComplete。
       * 已受理不含 status=sending 行；在途时必须节流派 reconcile（内部 2s 节流），否则 SMTP 挂起后数字冻住、流水线卡死。
       */
      if (laneMonitorFast && progressRunStillSending) {
        if (sendingDistinct > 0) {
          await reconcileStaleSendingForSendProgress(routeDb, campaignId, progressSendRunId);
          runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
          sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
          if (sendingDistinct > 0 && runMetrics.attempted > 0) {
            const oldestSendingAgeLm = await oldestSendingAgeSecForRun(
              routeDb,
              campaignId,
              progressSendRunId
            );
            const midUnblockedLm = await unblockStaleSmtpForSendProgress(
              routeDb,
              campaignId,
              progressSendRunId,
              oldestSendingAgeLm
            );
            if (midUnblockedLm > 0) {
              runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
              sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
            }
          }
          dbgSendSession("H6-lane-reconcile", "email.ts:send-progress", "lane minimal reconcile", {
            campaignId,
            progressSendRunId,
            attempted: runMetrics.attempted,
            sendingDistinct,
            ms: Date.now() - liteBuildT0
          });
        }
        const lockedPlannedLm = campaignActiveSendPlanned.get(campaignId);
        const recipientCountLm =
          runPlannedTotal > 0
            ? runPlannedTotal
            : lockedPlannedLm != null && lockedPlannedLm > 0
              ? lockedPlannedLm
              : Math.max(0, Number(campaignProgressRow?.recipient_count ?? 0));
        const plannedLm = Math.max(
          runPlannedTotal,
          recipientCountLm,
          lockedPlannedLm != null && lockedPlannedLm > 0 ? lockedPlannedLm : 0
        );
        const failedLm = Math.max(
          runMetrics.failed,
          runMetrics.smtpFailed + Math.max(0, Number(runMetrics.suppressed ?? 0))
        );
        const prepLm = buildSendProgressPrepFields(campaignId, {
          campaignSending: campaignSending || progressRunStillSending,
          progressRunStillSending,
          progressRunStartedAt,
          attempted: runMetrics.attempted,
          lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
          activeSendRunInDb: progressSendRunId > 0
        });
        const liteBodyLm = {
          ok: true,
          attempted: runMetrics.attempted,
          sent: runMetrics.sent,
          failed: failedLm,
          runBaselineAttempted: 0,
          runPlannedTotal,
          sendRunId: progressSendRunId,
          roundNo: runRoundNo > 0 ? runRoundNo : undefined,
          smtpFailed: runMetrics.smtpFailed,
          bounceFailures: 0,
          suppressedCount: Math.max(0, Number(runMetrics.suppressed ?? 0)),
          sendingDistinct,
          attemptRows: runMetrics.attempted,
          totalRows: Math.max(0, Number(runMetrics.totalRows ?? 0)),
          imapBounceEvents: 0,
          recipientCount: recipientCountLm,
          lastId: 0,
          recent: [] as Array<Record<string, unknown>>,
          campaignStatus: campaignStatusHint,
          runStillSending: true,
          warmingUp: runMetrics.attempted <= 0 && sendingDistinct <= 0,
          lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
          prepStage: prepLm.prepStage,
          prepDetail: prepLm.prepDetail,
          prepAgeMs: prepLm.prepAgeMs,
          prepBlockReason: prepLm.prepBlockReason,
          sendWorkerAlive: prepLm.sendWorkerAlive,
          runDeliveryComplete: sendRunDeliveryComplete(
            runMetrics,
            plannedLm > 0 ? plannedLm : runMetrics.attempted
          ),
          lite: true,
          laneMonitorMinimal: true
        };
        sendProgressLiteCache.set(campaignId, {
          at: Date.now(),
          sendRunId: progressSendRunId,
          body: liteBodyLm
        });
        dbgSendSession("H5-lane-lite", "email.ts:send-progress", "lane monitor minimal", {
          campaignId,
          progressSendRunId,
          attempted: runMetrics.attempted,
          sendingDistinct,
          ms: Date.now() - liteBuildT0
        });
        return liteBodyLm;
      }
      /**
       * 首封/任一封 SMTP 挂起时 email_sends 长期 status=sending，监控会卡在「发送中」且进度不走。
       * 发送循环内对账仅 i%3===0（首封期间不会跑）；须在 send-progress 对 stale sending 收尾。
       * 非 laneMonitor 或 send_run 已非 sending 时走完整 lite（含对账/尾封）。
       */
      if (!laneMonitorFast) {
        await reconcileStaleSendingForSendProgress(routeDb, campaignId, progressSendRunId);
        runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
        sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
      }
      const lockedPlannedEarly = campaignActiveSendPlanned.get(campaignId);
      const plannedForTail = Math.max(
        runPlannedTotal,
        lockedPlannedEarly != null && lockedPlannedEarly > 0 ? lockedPlannedEarly : 0,
        Math.max(0, Number(campaignProgressRow?.recipient_count ?? 0))
      );
      /** 末封 12/13：worker 已结束立刻终态；仍在 SMTP 则等真实超时（≈15s）后 abort+终态，勿再叠 15s tail */
      if (
        !laneMonitorFast &&
        progressSendRunId > 0 &&
        sendingDistinct === 1 &&
        plannedForTail > 0 &&
        runMetrics.attempted >= plannedForTail - 1
      ) {
        const [tailAgeRows] = await routeDb.query(
          `SELECT COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, NOW())), 0) AS age_sec
             FROM email_sends
            WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
          [campaignId, progressSendRunId]
        );
        const tailAgeSec = Math.max(
          0,
          Number((tailAgeRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? 0)
        );
        const sendSecTail = Math.ceil(campaignSmtpSendTimeoutMs() / 1000);
        const workerActive = isCampaignSendWorkerActive(campaignId);
        const workerDone = !workerActive;
        if (workerDone || (!workerActive && tailAgeSec >= sendSecTail)) {
          if (!workerDone && tailAgeSec >= sendSecTail) {
            abortCampaignSmtpTransport(campaignId);
          }
          await reconcileEndgameSendingEmailRows(routeDb, campaignId, progressSendRunId);
        }
        runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
        sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
      }
      /** 中途（未触达计划）：8–9s 即 abort+对账（勿等 15s SMTP 超时，避免 19/28 长期不动） */
      let oldestSendingAgeLogged = 0;
      if (
        !laneMonitorFast &&
        !isCampaignSendWorkerActive(campaignId) &&
        progressSendRunId > 0 &&
        sendingDistinct > 0 &&
        runMetrics.attempted > 0
      ) {
        oldestSendingAgeLogged = await oldestSendingAgeSecForRun(routeDb, campaignId, progressSendRunId);
        const midUnblocked = await unblockStaleSmtpForSendProgress(
          routeDb,
          campaignId,
          progressSendRunId,
          oldestSendingAgeLogged
        );
        if (midUnblocked > 0) {
          runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
          sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
        }
      }
      /** 与 countSendRunProgressMetricsLite 同口径：仅本 send_run，勿混入 send_run_id IS NULL 行 */
      const [liteRecentRows] = await routeDb.query(
        `SELECT id, to_email, status, error, created_at
           FROM email_sends
          WHERE campaign_id = ? AND send_run_id = ?
          ORDER BY id DESC
          LIMIT 20`,
        [campaignId, progressSendRunId]
      );
      const recentById = new Map<
        number,
        {
          id: number;
          email: string;
          status: string;
          error: string | null;
          createdAt: unknown;
          openCount: number;
          clickCount: number;
          bounceEventCount: number;
        }
      >();
      const pushRecentRow = (r: {
        id?: unknown;
        to_email?: unknown;
        status?: unknown;
        error?: unknown;
        created_at?: unknown;
      }) => {
        const id = Number(r.id ?? 0);
        if (id <= 0) return;
        recentById.set(id, {
          id,
          email: String(r.to_email ?? ""),
          status: String(r.status ?? ""),
          error: r.error != null ? String(r.error).trim() || null : null,
          createdAt: r.created_at,
          openCount: 0,
          clickCount: 0,
          bounceEventCount: 0
        });
      };
      for (const r of liteRecentRows as Array<{
        id?: unknown;
        to_email?: unknown;
        status?: unknown;
        error?: unknown;
        created_at?: unknown;
      }>) {
        pushRecentRow(r);
      }
      /** 前端传 sinceId 时补拉增量行，避免 800ms 空窗漏掉第 2、3 封 */
      if (sinceId > 0) {
        const [deltaRows] = await routeDb.query(
          `SELECT id, to_email, status, error, created_at
             FROM email_sends
            WHERE campaign_id = ? AND send_run_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT 12`,
          [campaignId, progressSendRunId, sinceId]
        );
        for (const r of deltaRows as Array<{
          id?: unknown;
          to_email?: unknown;
          status?: unknown;
          error?: unknown;
          created_at?: unknown;
        }>) {
          pushRecentRow(r);
        }
      }
      const recent = Array.from(recentById.values())
        .sort((a, b) => a.id - b.id)
        .slice(-20);
      const recentEnriched =
        progressRunStillSending && sendingDistinct > 0
          ? recent
          : await enrichSendProgressRecentWithBounce(routeDb, recent);
      /**
       * 有在途 sending 时跳过全活动退信对账，避免 800ms 轮询被拖死、前端「最近 3 封」卡在首封。
       * 无在途时再对账，失败栏仍能跟上 postfix_deferred。
       */
      if (!laneMonitorFast && runMetrics.attempted > 0 && sendingDistinct === 0) {
        const bounceLast = sendProgressBounceReconcileLastAt.get(campaignId) ?? 0;
        if (bounceLast === 0 || Date.now() - bounceLast >= 2_000) {
          sendProgressBounceReconcileLastAt.set(campaignId, Date.now());
          try {
            await reconcileCampaignBounceDbOnly(routeDb, campaignId);
            runMetrics = await countSendRunProgressMetricsLite(routeDb, campaignId, progressSendRunId);
            sendingDistinct = Math.max(0, Number(runMetrics.sendingDistinct ?? 0));
          } catch {
            /* 对账失败不阻断进度轮询 */
          }
        }
      }
      const bounceFailuresTotal = Math.max(0, Number(runMetrics.bounceFailures ?? 0));
      let runFailContacts = 0;
      let campaignFailContacts = 0;
      const failCached = sendProgressCampaignFailCache.get(campaignId);
      if (failCached) {
        runFailContacts = failCached.run;
        campaignFailContacts = failCached.campaign;
      }
      const failCountLast = sendProgressCampaignFailLastAt.get(campaignId) ?? 0;
      const failCountDue =
        !laneMonitorFast &&
        runMetrics.attempted > 0 &&
        (failCountLast === 0 ||
          Date.now() - failCountLast >= 2_500 ||
          sendingDistinct === 0);
      if (failCountDue) {
        sendProgressCampaignFailLastAt.set(campaignId, Date.now());
        try {
          const [runN, campN] = await Promise.all([
            countCampaignFailedContactsDistinct(routeDb, campaignId, {
              sendRunId: progressSendRunId
            }),
            countCampaignFailedContactsDistinct(routeDb, campaignId)
          ]);
          runFailContacts = runN;
          campaignFailContacts = campN;
          sendProgressCampaignFailCache.set(campaignId, { run: runN, campaign: campN });
        } catch {
          /* 失败计数托底：仍用 lite SMTP 分项 */
        }
      }
      const failedDistinct = Math.max(runFailContacts, campaignFailContacts);
      const failedForMonitor =
        failedDistinct > 0
          ? failedDistinct
          : Math.max(runMetrics.failed, failedDistinct);
      const lastId = recentEnriched.reduce((m, r) => Math.max(m, r.id), 0);
      const lockedPlanned = campaignActiveSendPlanned.get(campaignId);
      const recipientCount =
        runPlannedTotal > 0
          ? runPlannedTotal
          : lockedPlanned != null && lockedPlanned > 0
            ? lockedPlanned
            : Math.max(0, Number(campaignProgressRow?.recipient_count ?? 0));
      const plannedForDeliveryComplete = Math.max(
        runPlannedTotal,
        recipientCount,
        lockedPlanned != null && lockedPlanned > 0 ? lockedPlanned : 0
      );
      /** 发送中 auto-complete 写 DB 节流，避免每 400ms 轮询都跑 finalize 查询 */
      let autoComplete: { campaignStatus: string; runStillSending: boolean } = {
        campaignStatus: campaignStatusHint,
        runStillSending: progressRunStillSending
      };
      const autoLast = sendProgressAutoCompleteLastAt.get(campaignId) ?? 0;
      const autoDue =
        runMetrics.attempted <= 0 && sendingDistinct <= 0 && progressRunStillSending
          ? false
          : Date.now() - autoLast >= 3_000 || sendingDistinct === 0;
      let youngestAgeSecLite = -1;
      if (progressSendRunId > 0) {
        try {
          const [youngRows] = await routeDb.query(
            `SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS age_sec
               FROM email_sends
              WHERE campaign_id = ? AND send_run_id = ?`,
            [campaignId, progressSendRunId]
          );
          youngestAgeSecLite = Number((youngRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? -1);
        } catch {
          /* ignore */
        }
      }
      const midSendInFlight =
        progressRunStillSending &&
        sendingDistinct > 0 &&
        plannedForDeliveryComplete > 0 &&
        runMetrics.attempted > 0 &&
        runMetrics.attempted < plannedForDeliveryComplete &&
        campaignActiveSendRunId.has(campaignId) &&
        (youngestAgeSecLite < 0 || youngestAgeSecLite < 45);
      if (
        autoDue &&
        !midSendInFlight &&
        !(runMetrics.attempted <= 0 && sendingDistinct <= 0 && progressRunStillSending)
      ) {
        sendProgressAutoCompleteLastAt.set(campaignId, Date.now());
        autoComplete = await maybeAutoCompleteCampaignFromSendProgress(
          routeDb,
          campaignId,
          campTenantId,
          progressSendRunId,
          runPlannedTotal,
          runMetrics,
          progressRunStillSending
        );
      }
      const prepFields = buildSendProgressPrepFields(campaignId, {
        campaignSending: campaignSending || progressRunStillSending,
        progressRunStillSending,
        progressRunStartedAt,
        attempted: runMetrics.attempted,
        lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
        activeSendRunInDb: progressRunStillSending && progressSendRunId > 0
      });
      const liteBody = {
        ok: true,
        attempted: runMetrics.attempted,
        sent: runMetrics.sent,
        failed: failedForMonitor,
        runBaselineAttempted: 0,
        runPlannedTotal,
        sendRunId: progressSendRunId,
        roundNo: runRoundNo > 0 ? runRoundNo : undefined,
        smtpFailed: runMetrics.smtpFailed,
        bounceFailures: Math.max(
          bounceFailuresTotal,
          Math.max(0, failedForMonitor - runMetrics.smtpFailed - Math.max(0, Number(runMetrics.suppressed ?? 0)))
        ),
        campaignFailCount: failedForMonitor > 0 ? failedForMonitor : undefined,
        summaryFailCount: failedForMonitor > 0 ? failedForMonitor : undefined,
        runFailCount: runFailContacts > 0 ? runFailContacts : undefined,
        suppressedCount: Math.max(0, Number(runMetrics.suppressed ?? 0)),
        sendingDistinct: Math.max(0, Number(runMetrics.sendingDistinct ?? 0)),
        attemptRows: runMetrics.attempted,
        totalRows: Math.max(0, Number(runMetrics.totalRows ?? 0)),
        imapBounceEvents: 0,
        recipientCount,
        lastId,
        recent: recentEnriched,
        campaignStatus: autoComplete.campaignStatus || campaignStatusHint,
        runStillSending: autoComplete.runStillSending,
        /** 已创建 send_run 但尚未写入 email_sends（受众/SMTP 准备中） */
        warmingUp:
          progressRunStillSending &&
          runMetrics.attempted <= 0 &&
          recentEnriched.length === 0,
        lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
        prepStage: prepFields.prepStage,
        prepDetail: prepFields.prepDetail,
        prepAgeMs: prepFields.prepAgeMs,
        prepBlockReason: prepFields.prepBlockReason,
        sendWorkerAlive: prepFields.sendWorkerAlive,
        runDeliveryComplete: sendRunDeliveryComplete(
          runMetrics,
          plannedForDeliveryComplete > 0 ? plannedForDeliveryComplete : runMetrics.attempted
        ),
        lite: true
      };
      if (liteBody.runDeliveryComplete && runMetrics.sendingDistinct === 0) {
      }
      sendProgressLiteCache.set(campaignId, {
        at: Date.now(),
        sendRunId: progressSendRunId,
        body: liteBody
      });
      if (laneMonitorFast) {
        dbgSendSession("H5-lane-lite", "email.ts:send-progress", "lane lite built", {
          campaignId,
          progressSendRunId,
          attempted: runMetrics.attempted,
          sendingDistinct,
          ms: Date.now() - liteBuildT0
        });
      }
      return liteBody;
      })();

      sendProgressLiteInflight.set(campaignId, liteBuild);
      try {
        return res.json(await liteBuild);
      } finally {
        if (sendProgressLiteInflight.get(campaignId) === liteBuild) {
          sendProgressLiteInflight.delete(campaignId);
        }
      }
    }

    /** 非发送中（非 lite）再做退信对账，避免首封阶段被对账阻塞。 */
    try {
      await syncCampaignBounceForSendProgress(db, env, campaignId, campaignStatusHint);
    } catch {
      /* 对账失败不阻断进度轮询 */
    }

    /**
     * 活动已为 sending 但 send_run 尚未解析：返回 warming 占位（勿与 useLiteSendProgress 混用，
     * 否则 draft+活跃 send_run 会被误判为 warming 而返回 attempted=0）。
     */
    if (campaignSending && progressSendRunId <= 0) {
      const lockedPlanned = campaignActiveSendPlanned.get(campaignId);
      const recipientCount =
        runPlannedTotal > 0
          ? runPlannedTotal
          : lockedPlanned != null && lockedPlanned > 0
            ? lockedPlanned
            : Math.max(0, Number(campaignProgressRow?.recipient_count ?? 0));
      /**
       * 即使 send_run 未解析，也用 countSendRunProgressMetricsLite 查询真实数据
       *（已去掉 send_run_id 过滤，按 campaign_id 即可）
       */
      let warmMetrics: { attempted: number; sent: number; failed: number; smtpFailed: number; sendingDistinct: number; suppressed: number } = { attempted: 0, sent: 0, failed: 0, smtpFailed: 0, sendingDistinct: 0, suppressed: 0 };
      try {
        const rawMetrics = await countSendRunProgressMetricsLite(db, campaignId, 0);
        warmMetrics = {
          attempted: rawMetrics.attempted,
          sent: rawMetrics.sent,
          failed: rawMetrics.failed,
          smtpFailed: rawMetrics.smtpFailed,
          sendingDistinct: Math.max(0, Number(rawMetrics.sendingDistinct ?? 0)),
          suppressed: Math.max(0, Number(rawMetrics.suppressed ?? 0))
        };
      } catch {
        /* 查询失败不阻断 */
      }
      const prepFields = buildSendProgressPrepFields(campaignId, {
        campaignSending: true,
        progressRunStillSending: true,
        progressRunStartedAt: progressRunStartedAt,
        attempted: warmMetrics.attempted,
        lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
        activeSendRunInDb: false
      });
      return res.json({
        ok: true,
        attempted: warmMetrics.attempted,
        sent: warmMetrics.sent,
        failed: warmMetrics.failed,
        runBaselineAttempted: 0,
        runPlannedTotal: recipientCount,
        sendRunId: progressSendRunId > 0 ? progressSendRunId : undefined,
        roundNo: runRoundNo > 0 ? runRoundNo : undefined,
        smtpFailed: warmMetrics.smtpFailed,
        bounceFailures: 0,
        suppressedCount: warmMetrics.suppressed,
        attemptRows: warmMetrics.attempted,
        imapBounceEvents: 0,
        recipientCount,
        lastId: 0,
        recent: [],
        campaignStatus: campaignStatusHint,
        runStillSending: true,
        warmingUp: true,
        lastAsyncError: campaignSendAsyncError.get(campaignId) ?? null,
        prepStage: prepFields.prepStage,
        prepDetail: prepFields.prepDetail,
        prepAgeMs: prepFields.prepAgeMs,
        prepBlockReason: prepFields.prepBlockReason,
        sendWorkerAlive: prepFields.sendWorkerAlive,
        lite: true
      });
    }

    const campaignStateExpr = sqlPerEmailDeliveryStateExpr("s");
    const [countRows] = await db.query(
      `SELECT
         COUNT(*) AS attempted,
         COALESCE(SUM(CASE WHEN email_state = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
         COALESCE(SUM(CASE WHEN email_state = 'failed' THEN 1 ELSE 0 END), 0) AS smtp_failed,
         COALESCE(SUM(CASE WHEN email_state = 'bounced' THEN 1 ELSE 0 END), 0) AS bounce_failures,
         COALESCE(SUM(attempt_rows), 0) AS attempt_rows,
         COALESCE(MAX(last_id), 0) AS last_id
       FROM (
         SELECT
           LOWER(TRIM(s.to_email)) AS em,
           COUNT(*) AS attempt_rows,
           MAX(s.id) AS last_id,
           ${campaignStateExpr} AS email_state
         FROM email_sends s
         WHERE s.campaign_id = ?
         GROUP BY LOWER(TRIM(s.to_email))
       ) per_email`,
      [campaignId]
    );
    const c = (countRows as any[])[0] ?? {};
    /** 去重邮箱数（与运营理解的「发了多少人」一致） */
    let attempted = Number(c.attempted ?? 0);
    let sent = Number(c.sent ?? 0);
    let smtpFailed = Number(c.smtp_failed ?? 0);
    let sentWithBounce = Number(c.bounce_failures ?? 0);
    let failed = smtpFailed + sentWithBounce;
    try {
      const failedDistinct = await countCampaignDeliveryFailedDistinct(db, campaignId);
      failed = Math.max(failed, failedDistinct);
    } catch {
      /* 托底计数失败不阻断进度 */
    }
    /** email_sends 原始行数（含 CRM 重复联系人导致的多行，仅供排查） */
    const attemptRows = Number(c.attempt_rows ?? 0);
    /** 含 campaign_id 直接写入，或通过 email_send_id 归属到本活动的记录（旧逻辑曾写入 campaign_id=NULL） */
    const [imapRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM email_delivery_events e
        WHERE e.event_type = 'bounced'
          AND e.provider = 'imap_bounce'
          AND (
            e.campaign_id = ?
            OR (
              e.email_send_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM email_sends s
                WHERE s.id = e.email_send_id AND s.campaign_id = ?
              )
            )
          )`,
      [campaignId, campaignId]
    );
    const imapBounceEvents = Number((imapRows as any[])[0]?.c ?? 0);
    const lastId = Number(c.last_id ?? 0);

    const recentWhere: string[] = ["campaign_id = ?"];
    const recentParams: unknown[] = [campaignId];
    if (progressSendRunId > 0) {
      if (progressRunStillSending && progressRunStartedAt) {
        recentWhere.push("(send_run_id = ? OR (send_run_id IS NULL AND created_at >= ?))");
        recentParams.push(progressSendRunId, progressRunStartedAt);
      } else {
        recentWhere.push("send_run_id = ?");
        recentParams.push(progressSendRunId);
      }
    } else if (sinceId > 0) {
      /** 无 send_run 时仍允许 sinceId 增量（正式发送页）；专线栏不传 sinceId */
      recentWhere.push("id > ?");
      recentParams.push(sinceId);
    }
    const [recentRows] = await db.query(
      `SELECT id, to_email, status, created_at
         FROM email_sends
        WHERE ${recentWhere.join(" AND ")}
        ORDER BY id DESC
        LIMIT 5`,
      recentParams
    );
    const recentBase = (recentRows as any[])
      .map((r) => ({
        id: Number(r.id ?? 0),
        email: String(r.to_email ?? ""),
        status: String(r.status ?? ""),
        createdAt: r.created_at
      }))
      .reverse();

    const recentEmails = Array.from(
      new Set(recentBase.map((r) => String(r.email ?? "").trim().toLowerCase()).filter(Boolean))
    );
    const bounceByEmail = new Map<string, number>();
    if (recentEmails.length > 0) {
      const eph = recentEmails.map(() => "?").join(", ");
      const runScopeSql = progressSendRunId > 0 ? ` AND s.send_run_id = ?` : "";
      const runScopeParams = progressSendRunId > 0 ? [progressSendRunId] : [];
      const [bEmailRows] = await db.query(
        `SELECT LOWER(TRIM(s.to_email)) AS em, COUNT(*) AS c
           FROM email_sends s
          WHERE s.campaign_id = ?
            ${runScopeSql}
            AND LOWER(TRIM(s.to_email)) IN (${eph})
            AND EXISTS (
              SELECT 1
                FROM email_delivery_events e
               WHERE e.event_type = 'bounced'
                 AND (e.email_send_id = s.id OR ${sqlBounceEventMatchesSend("e", "s")})
            )
          GROUP BY LOWER(TRIM(s.to_email))`,
        [campaignId, ...runScopeParams, ...recentEmails]
      );
      for (const row of bEmailRows as Array<{ em?: unknown; c?: unknown }>) {
        const em = String(row.em ?? "").trim().toLowerCase();
        if (em) bounceByEmail.set(em, Number(row.c ?? 0));
      }
    }

    const recentIds = recentBase.map((r) => r.id).filter((id) => Number.isFinite(id) && id > 0);
    const evBySendId = new Map<number, { opened: number; clicked: number; bounced: number }>();
    if (recentIds.length > 0) {
      const ph = recentIds.map(() => "?").join(", ");
      const [evRows] = await db.query(
        `SELECT email_send_id, event_type, COUNT(*) AS c
           FROM email_delivery_events
          WHERE email_send_id IN (${ph})
            AND event_type IN ('opened', 'clicked', 'bounced')
          GROUP BY email_send_id, event_type`,
        recentIds
      );
      for (const row of evRows as any[]) {
        const sid = Number(row.email_send_id ?? 0);
        if (!sid) continue;
        if (!evBySendId.has(sid)) evBySendId.set(sid, { opened: 0, clicked: 0, bounced: 0 });
        const m = evBySendId.get(sid)!;
        const t = String(row.event_type ?? "");
        const cnt = Number(row.c ?? 0);
        if (t === "opened") m.opened = cnt;
        else if (t === "clicked") m.clicked = cnt;
        else if (t === "bounced") m.bounced = cnt;
      }
    }
    const recent = recentBase.map((r) => {
      const ev = evBySendId.get(r.id);
      const em = String(r.email ?? "").trim().toLowerCase();
      const bounceByAddr = bounceByEmail.get(em) ?? 0;
      return {
        ...r,
        openCount: ev?.opened ?? 0,
        clickCount: ev?.clicked ?? 0,
        bounceEventCount: Math.max(ev?.bounced ?? 0, bounceByAddr)
      };
    });

    let runBaselineAttempted = Math.max(0, Number(campaignSendRunBaseline.get(campaignId) ?? 0));
    if (progressSendRunId > 0) {
      const runMetrics = await countSendRunProgressMetrics(db, campaignId, progressSendRunId);
      attempted = runMetrics.attempted;
      sent = runMetrics.sent;
      failed = runMetrics.failed;
      smtpFailed = runMetrics.smtpFailed;
      sentWithBounce = runMetrics.bounceFailures;
      runBaselineAttempted = 0;
    } else {
      const [latestRoundRows] = await db.query(
        `SELECT MAX(round_no) AS latest_round_no FROM email_campaign_send_runs WHERE campaign_id = ?`,
        [campaignId]
      );
      runRoundNo = Math.max(0, Number((latestRoundRows as Array<{ latest_round_no?: unknown }>)[0]?.latest_round_no ?? 0));
    }
    const lockedPlanned = campaignActiveSendPlanned.get(campaignId);
    let sendingDistinctFull = 0;
    try {
      const sdMetrics = await countSendRunProgressMetricsLite(
        db,
        campaignId,
        progressSendRunId > 0 ? progressSendRunId : 0
      );
      sendingDistinctFull = Math.max(0, Number(sdMetrics.sendingDistinct ?? 0));
    } catch {
      /* 查询失败不阻断 */
    }
    let recipientCount =
      runPlannedTotal > 0
        ? runPlannedTotal
        : lockedPlanned != null && lockedPlanned > 0
          ? lockedPlanned
          : Math.max(0, Number(campaignProgressRow?.recipient_count ?? 0));

    let fullCampaignStatus = campaignStatusHint;
    let fullRunStillSending = progressRunStillSending;
    if (useLiteSendProgress) {
      const fullAuto = await maybeAutoCompleteCampaignFromSendProgress(
        db,
        campaignId,
        campTenantId,
        progressSendRunId,
        runPlannedTotal,
        { attempted },
        progressRunStillSending
      );
      fullCampaignStatus = fullAuto.campaignStatus || fullCampaignStatus;
      fullRunStillSending = fullAuto.runStillSending;
    } else if (campaignSending) {
      /** non-lite 路径也 reconcile stale sending + auto-complete */
      let reconcileSendRunId = progressSendRunId;
      if (reconcileSendRunId <= 0) {
        const [anyRun] = await db.query(
          `SELECT id FROM email_campaign_send_runs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`,
          [campaignId]
        );
        reconcileSendRunId = Math.max(0, Number((anyRun as Array<{ id?: unknown }>)[0]?.id ?? 0));
      }
      if (reconcileSendRunId > 0) {
        await reconcileStaleSendingForSendProgress(db, campaignId, reconcileSendRunId);
        const fullAuto = await maybeAutoCompleteCampaignFromSendProgress(
          db,
          campaignId,
          campTenantId,
          reconcileSendRunId,
          runPlannedTotal,
          { attempted, sendingDistinct: sendingDistinctFull },
          progressRunStillSending
        );
        fullCampaignStatus = fullAuto.campaignStatus || fullCampaignStatus;
        fullRunStillSending = fullAuto.runStillSending;
      }
    } else if (!campaignSending && !progressRunStillSending) {
      const [stFull] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
      fullCampaignStatus = String((stFull as Array<{ status?: unknown }>)[0]?.status ?? "")
        .trim()
        .toLowerCase();
    }

    res.json({
      ok: true,
      attempted,
      sent,
      failed,
      /** 本次点击发送前的累计尝试（用于前端算本轮进度） */
      runBaselineAttempted,
      /** 本轮计划发送的去重邮箱数（与预览人数一致） */
      runPlannedTotal,
      sendRunId: progressSendRunId > 0 ? progressSendRunId : undefined,
      roundNo: runRoundNo > 0 ? runRoundNo : undefined,
      /** SMTP 当场拒信（按去重邮箱） */
      smtpFailed,
      /** 异步退信（按去重邮箱） */
      bounceFailures: sentWithBounce,
      /** email_sends 表行数（可能大于 attempted，因历史重复联系人） */
      attemptRows,
      /** IMAP 收件箱解析入库的退信事件条数（可与 bounceFailures 对照；多条事件可能对应同一封发送） */
      imapBounceEvents,
      /** 后端校准后的实际计划总数，用作实时进度分母 */
      recipientCount,
      lastId,
      recent,
      campaignStatus: fullCampaignStatus,
      runStillSending: fullRunStillSending,
      sendingDistinct: sendingDistinctFull,
      runDeliveryComplete: sendRunDeliveryComplete(
        { attempted, sendingDistinct: sendingDistinctFull },
        recipientCount > 0 ? recipientCount : attempted
      )
    });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.warn("[send-progress] failed", campaignId, msg);
      if (!res.headersSent) {
        const poolBusy =
          msg.includes("PROTOCOL_CONNECTION_LOST") ||
          msg.includes("Pool is closed") ||
          msg.includes("queue limit");
        return res.status(503).json({
          ok: false,
          message: poolBusy
            ? "数据库繁忙，请关闭其它「发送中」页面标签后刷新；若持续失败请稍后再试。"
            : msg || "发送进度查询失败"
        });
      }
    }
  });

  app.get("/api/email/campaigns/:id/unsubscribes", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        slim: z.union([z.string(), z.boolean()]).optional()
      })
      .parse(req.query);
    const slimUnsub = queryFlagTruthy(q.slim);
    const offset = (q.page - 1) * q.pageSize;

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM email_unsubscribe_events WHERE campaign_id = ?`, [campaignId]);
    const total = Number((countRows as any[])[0]?.cnt ?? 0);
    const unsubJoinSelect = slimUnsub
      ? "c.company, c.first_name, c.last_name"
      : COMPLIANCE_CONTACT_JOIN_SELECT;
    const [rows] = await db.query(
      `SELECT u.id, u.contact_id, u.email, u.reason, u.created_at, ${unsubJoinSelect}
       FROM email_unsubscribe_events u
       LEFT JOIN email_contacts c ON c.id = u.contact_id
       WHERE u.campaign_id = ?
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [campaignId, q.pageSize, offset]
    );

    res.json({
      ok: true,
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: (rows as any[]).map((r) =>
        slimUnsub ? mapComplianceContactEventRowSlim(r) : mapComplianceContactEventRow(r)
      )
    });
  });

  app.get("/api/email/campaigns/:id/subscribes", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        slim: z.union([z.string(), z.boolean()]).optional(),
        sendRunId: z.coerce.number().int().positive().optional()
      })
      .parse(req.query);
    const slimSubscribe = queryFlagTruthy(q.slim);
    const offset = (q.page - 1) * q.pageSize;
    const sendRunId = q.sendRunId != null ? Math.floor(Number(q.sendRunId)) : 0;
    const runFilter =
      sendRunId > 0
        ? ` AND EXISTS (
             SELECT 1 FROM email_sends es
              WHERE es.campaign_id = s.campaign_id
                AND es.send_run_id = ?
                AND es.contact_id = s.contact_id
           )`
        : "";
    const runParams = sendRunId > 0 ? [sendRunId] : [];

    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT LOWER(TRIM(s.email))) AS cnt
         FROM email_subscribe_events s
        WHERE s.campaign_id = ?
          AND TRIM(COALESCE(s.email, '')) <> ''${runFilter}`,
      [campaignId, ...runParams]
    );
    const total = Number((countRows as any[])[0]?.cnt ?? 0);
    const subJoinSelect = slimSubscribe
      ? "c.company, c.first_name, c.last_name"
      : COMPLIANCE_CONTACT_JOIN_SELECT;
    const runFilterS2 = runFilter.replace(/\bs\./g, "s2.");
    const [rows] = await db.query(
      `SELECT s.id, s.contact_id, s.email, s.reason, s.created_at, ${subJoinSelect}
       FROM email_subscribe_events s
       LEFT JOIN email_contacts c ON c.id = s.contact_id
       INNER JOIN (
         SELECT MAX(s2.id) AS max_id
           FROM email_subscribe_events s2
          WHERE s2.campaign_id = ?
            AND TRIM(COALESCE(s2.email, '')) <> ''${runFilterS2}
          GROUP BY LOWER(TRIM(s2.email))
       ) dedup ON dedup.max_id = s.id
       WHERE s.campaign_id = ?
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [campaignId, ...runParams, campaignId, q.pageSize, offset]
    );

    res.json({
      ok: true,
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: (rows as any[]).map((r) =>
        slimSubscribe ? mapComplianceContactEventRowSlim(r) : mapComplianceContactEventRow(r)
      )
    });
  });

  app.get("/api/email/campaigns/:id/subscribes/export.csv", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((campRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权导出该活动的订阅列表。" });
    }

    const [rows] = await db.query(
      `SELECT s.email, s.reason, s.created_at, ${COMPLIANCE_CONTACT_JOIN_SELECT}
       FROM email_subscribe_events s
       LEFT JOIN email_contacts c ON c.id = s.contact_id
       WHERE s.campaign_id = ?
       ORDER BY s.created_at DESC`,
      [campaignId]
    );

    const body = buildComplianceEventsCsvBody(rows as Record<string, unknown>[], "订阅时间", "订阅原因");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaignId}-subscribes.csv"`);
    return res.send(body);
  });

  app.get("/api/email/campaigns/:id/unsubscribes/export.csv", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((campRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权导出该活动的退订列表。" });
    }
    const [rows] = await db.query(
      `SELECT u.email, u.reason, u.created_at, ${COMPLIANCE_CONTACT_JOIN_SELECT}
       FROM email_unsubscribe_events u
       LEFT JOIN email_contacts c ON c.id = u.contact_id
       WHERE u.campaign_id = ?
       ORDER BY u.created_at DESC`,
      [campaignId]
    );
    const body = buildComplianceEventsCsvBody(rows as Record<string, unknown>[], "退订时间", "退订原因");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaignId}-unsubscribes.csv"`);
    return res.send(body);
  });

  app.get("/api/email/campaigns/:id/complaints/export.csv", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const requestTenantId = resolveTenantId(req);
    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
    const campTenantId = Number((campRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
    if (requestTenantId > 0 && campTenantId > 0 && campTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权导出该活动的投诉列表。" });
    }
    const [rows] = await db.query(
      `SELECT e.email, e.created_at, e.payload_json, ${COMPLIANCE_CONTACT_JOIN_SELECT}
       FROM email_delivery_events e
       LEFT JOIN email_contacts c ON c.id = e.contact_id
       WHERE e.campaign_id = ? AND e.event_type = 'complaint'
       ORDER BY e.created_at DESC`,
      [campaignId]
    );
    const normRows = (rows as Record<string, unknown>[]).map((r) => {
      const payload = r.payload_json;
      const fromPayload =
        payload && typeof payload === "object" ? String((payload as { reason?: unknown }).reason ?? "") : "";
      return { ...r, reason: fromPayload };
    });
    const body = buildComplianceEventsCsvBody(normRows, "投诉时间", "投诉原因");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaignId}-complaints.csv"`);
    return res.send(body);
  });

  app.delete("/api/email/unsubscribe-events/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const eventId = z.coerce.number().int().positive().parse(req.params.id);
    let deleted = 0;
    if (tenantId > 0) {
      const [result] = await db.query(
        `DELETE u FROM email_unsubscribe_events u
         LEFT JOIN email_campaigns c ON c.id = u.campaign_id
         WHERE u.id = ?
           AND (u.tenant_id = ? OR c.tenant_id = ?)`,
        [eventId, tenantId, tenantId]
      );
      deleted = Number((result as { affectedRows?: number })?.affectedRows ?? 0);
    } else {
      const [result] = await db.query(`DELETE FROM email_unsubscribe_events WHERE id = ?`, [eventId]);
      deleted = Number((result as { affectedRows?: number })?.affectedRows ?? 0);
    }
    if (deleted === 0) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    return res.json({ ok: true, id: eventId, deleted });
  });

  app.delete("/api/email/subscribe-events/:id", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const eventId = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await db.query(`DELETE FROM email_subscribe_events WHERE id = ? AND tenant_id = ?`, [
      eventId,
      tenantId
    ]);
    const deleted = Number((result as { affectedRows?: number })?.affectedRows ?? 0);
    if (deleted === 0) {
      return res.status(404).json({ ok: false, message: "记录不存在或不属于当前租户" });
    }
    return res.json({ ok: true, id: eventId, deleted });
  });

  app.get("/api/email/campaigns/:id/complaints", async (req, res) => {
    const campaignId = z.coerce.number().int().positive().parse(req.params.id);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20)
      })
      .parse(req.query);
    const offset = (q.page - 1) * q.pageSize;

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM email_delivery_events WHERE campaign_id = ? AND event_type = 'complaint'`,
      [campaignId]
    );
    const total = Number((countRows as any[])[0]?.cnt ?? 0);
    const [rows] = await db.query(
      `SELECT e.id, e.contact_id, e.email, e.created_at, e.payload_json,
              c.company, c.first_name, c.last_name
         FROM email_delivery_events e
         LEFT JOIN email_contacts c ON c.id = e.contact_id
        WHERE e.campaign_id = ? AND e.event_type = 'complaint'
        ORDER BY e.created_at DESC
        LIMIT ? OFFSET ?`,
      [campaignId, q.pageSize, offset]
    );

    res.json({
      ok: true,
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: (rows as any[]).map((r) => ({
        id: Number(r.id),
        contactId: r.contact_id != null ? Number(r.contact_id) : null,
        email: String(r.email ?? ""),
        reason:
          r.payload_json && typeof r.payload_json === "object"
            ? String((r.payload_json as any).reason ?? "")
            : "",
        createdAt: r.created_at,
        company: r.company ? String(r.company) : "",
        name: `${String(r.first_name ?? "").trim()} ${String(r.last_name ?? "").trim()}`.trim()
      }))
    });
  });

  async function recordTrackingEvent(req: any, sendUuid: string, eventType: "opened" | "clicked", payload: Record<string, unknown>) {
    const [rows] = await db.query(
      `SELECT s.id AS send_id, s.campaign_id, s.contact_id, s.to_email,
              c.tenant_id
         FROM email_sends s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE s.send_uuid = ?
        LIMIT 1`,
      [sendUuid]
    );
    const row = (rows as any[])[0];
    if (!row) return false;
    const ip = typeof req.headers?.["x-forwarded-for"] === "string"
      ? String(req.headers["x-forwarded-for"]).split(",")[0]?.trim()
      : req.ip;
    const ua = typeof req.headers?.["user-agent"] === "string" ? String(req.headers["user-agent"]).slice(0, 500) : null;
    await db.query(
      `INSERT INTO email_delivery_events
       (tenant_id, campaign_id, contact_id, email_send_id, send_uuid, email, event_type, provider, provider_message_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'bss_track', NULL, CAST(? AS JSON), NOW())`,
      [
        Number(row.tenant_id ?? 1),
        Number(row.campaign_id),
        row.contact_id != null ? Number(row.contact_id) : null,
        Number(row.send_id),
        sendUuid,
        String(row.to_email ?? "").toLowerCase(),
        eventType,
        JSON.stringify({ ...payload, ip: ip ?? null, userAgent: ua })
      ]
    );
    const campaignId = Number(row.campaign_id ?? 0);
    const trackTenantId = Number(row.tenant_id ?? 0);
    if (campaignId > 0 && (eventType === "opened" || eventType === "clicked")) {
      invalidateCampaignSendListCache(campaignId);
      invalidateCampaignPanelStatsCache(campaignId);
      if (trackTenantId > 0) invalidateTenantRangeStatsCache(trackTenantId);
    }
    return true;
  }

  async function recordImplicitOpenForContactAction(
    req: any,
    parsed: { contactId: number; campaignId: number; email: string },
    source: "subscribe" | "unsubscribe" | "complaint"
  ) {
    const [rows] = await db.query(
      `SELECT s.id AS send_id, s.send_uuid, s.campaign_id, s.contact_id, s.to_email,
              c.tenant_id
         FROM email_sends s
         INNER JOIN email_campaigns c ON c.id = s.campaign_id
        WHERE s.campaign_id = ? AND s.contact_id = ?
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [parsed.campaignId, parsed.contactId]
    );
    const row = (rows as any[])[0];
    if (!row) return false;

    const sendId = Number(row.send_id);
    const [dupRows] = await db.query(
      `SELECT id FROM email_delivery_events
        WHERE email_send_id = ? AND event_type = 'opened'
        LIMIT 1`,
      [sendId]
    );
    if ((dupRows as Array<{ id?: unknown }>)[0]?.id) return true;

    const ip = typeof req.headers?.["x-forwarded-for"] === "string"
      ? String(req.headers["x-forwarded-for"]).split(",")[0]?.trim()
      : req.ip;
    const ua = typeof req.headers?.["user-agent"] === "string" ? String(req.headers["user-agent"]).slice(0, 500) : null;
    await db.query(
      `INSERT INTO email_delivery_events
       (tenant_id, campaign_id, contact_id, email_send_id, send_uuid, email, event_type, provider, provider_message_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'opened', 'bss_track', NULL, CAST(? AS JSON), NOW())`,
      [
        Number(row.tenant_id ?? 1),
        Number(row.campaign_id),
        row.contact_id != null ? Number(row.contact_id) : null,
        sendId,
        row.send_uuid ? String(row.send_uuid) : null,
        String(row.to_email ?? parsed.email ?? "").toLowerCase(),
        JSON.stringify({ source: `${source}_action`, inferred: true, ip: ip ?? null, userAgent: ua })
      ]
    );
    const campaignId = Number(row.campaign_id ?? 0);
    const trackTenantId = Number(row.tenant_id ?? 0);
    if (campaignId > 0) {
      invalidateCampaignSendListCache(campaignId);
      invalidateCampaignPanelStatsCache(campaignId);
      if (trackTenantId > 0) invalidateTenantRangeStatsCache(trackTenantId);
    }
    return true;
  }

  app.get("/api/email/track/open/:sendUuid.gif", async (req, res) => {
    const sendUuid = String(req.params.sendUuid ?? "").trim();
    if (/^[0-9a-f-]{36}$/i.test(sendUuid)) {
      await recordTrackingEvent(req, sendUuid, "opened", { source: "pixel" }).catch(() => undefined);
    }
    const gif = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.end(gif);
  });

  app.get("/api/email/track/click/:sendUuid", async (req, res) => {
    const sendUuid = String(req.params.sendUuid ?? "").trim();
    const target = typeof req.query.u === "string" ? String(req.query.u) : "";
    if (/^[0-9a-f-]{36}$/i.test(sendUuid)) {
      await recordTrackingEvent(req, sendUuid, "clicked", { source: "link", target }).catch(() => undefined);
    }
    if (/^https?:\/\//i.test(target)) {
      return res.redirect(302, target);
    }
    return res.redirect(302, getUnsubscribeBaseUrl());
  });

  app.post("/api/email/webhooks/events", async (req, res) => {
    const body = z
      .object({
        provider: z.string().min(1).max(64).default("unknown"),
        events: z
          .array(
            z.object({
              eventType: z.enum(["delivered", "opened", "clicked", "bounced", "complaint"]),
              campaignId: z.coerce.number().int().positive().optional(),
              contactId: z.coerce.number().int().positive().optional(),
              email: z.string().email(),
              providerMessageId: z.string().optional(),
              createdAt: z.string().optional(),
              payload: z.unknown().optional()
            })
          )
          .min(1)
          .max(1000)
      })
      .parse(req.body ?? {});

    let inserted = 0;
    for (const ev of body.events) {
      let tenantId = 1;
      let finalCampaignId: number | null =
        ev.campaignId != null && Number(ev.campaignId) > 0 ? Number(ev.campaignId) : null;
      let finalContactId: number | null =
        ev.contactId != null && Number(ev.contactId) > 0 ? Number(ev.contactId) : null;
      let emailSendId: number | null = null;

      /** 退信：优先用 SMTP Message-ID / 服务商消息 id 对齐 email_sends，写入 email_send_id，统计才能挂靠到具体活动 */
      const pmid = String(ev.providerMessageId ?? "").trim();
      if (ev.eventType === "bounced" && pmid) {
        const [matchRows] = await db.query(
          `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id
             FROM email_sends s
             INNER JOIN email_campaigns c ON c.id = s.campaign_id
            WHERE LOWER(TRIM(s.provider_message_id)) = LOWER(TRIM(?))
            ORDER BY s.id DESC
            LIMIT 1`,
          [pmid]
        );
        const mr = (matchRows as any[])[0];
        if (mr) {
          const sid = Number(mr.send_id ?? 0);
          emailSendId = sid > 0 ? sid : null;
          const cid = Number(mr.campaign_id ?? 0);
          if (cid > 0) finalCampaignId = cid;
          if (mr.contact_id != null) finalContactId = Number(mr.contact_id) || finalContactId;
          const tid = Number(mr.tenant_id ?? 0);
          if (tid > 0) tenantId = tid;
        }
      }

      if (finalCampaignId != null && finalCampaignId > 0) {
        const [crow] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [finalCampaignId]);
        const ctid = Number((crow as any[])[0]?.tenant_id ?? 0);
        if (ctid > 0) tenantId = ctid;
      }
      await db.query(
        `INSERT INTO email_delivery_events
         (tenant_id, campaign_id, contact_id, email_send_id, email, event_type, provider, provider_message_id, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), COALESCE(?, NOW()))`,
        [
          tenantId,
          finalCampaignId,
          finalContactId,
          emailSendId,
          ev.email.toLowerCase(),
          ev.eventType,
          body.provider,
          ev.providerMessageId ?? null,
          JSON.stringify(ev.payload ?? {}),
          ev.createdAt ?? null
        ]
      );
      inserted += 1;
      if (ev.eventType === "complaint") {
        await db.query(`UPDATE email_contacts SET status = 'unsubscribed' WHERE tenant_id = ? AND email = ?`, [
          tenantId,
          ev.email.toLowerCase()
        ]);
      }
    }
    res.json({ ok: true, inserted });
  });

  /** 手动导入退信回执（DSN/NDR 原文），写入 email_delivery_events 供统计页读取 */
  app.post("/api/email/delivery-events/dsn-import", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const body = z
      .object({
        provider: z.string().min(1).max(64).optional(),
        reports: z
          .array(
            z.object({
              campaignId: z.coerce.number().int().positive().optional(),
              failedEmail: z.string().email().optional(),
              occurredAt: z.string().optional(),
              reason: z.string().optional(),
              rawText: z.string().min(10)
            })
          )
          .min(1)
          .max(200)
      })
      .parse(req.body ?? {});

    let inserted = 0;
    for (const rep of body.reports) {
      const bouncedEmail = (rep.failedEmail?.trim().toLowerCase() || extractFailedEmailFromDsn(rep.rawText) || "").trim();
      if (!bouncedEmail) continue;
      const campaignId = Number(rep.campaignId ?? 0);

      let finalCampaignId: number | null = null;
      let finalContactId: number | null = null;
      let finalSendId: number | null = null;
      let finalTenantId = tenantId > 0 ? tenantId : 1;

      if (campaignId > 0) {
        const [campRows] = await db.query(`SELECT id, tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
        const camp = (campRows as any[])[0];
        const campTenantId = Number(camp?.tenant_id ?? 0);
        if (camp && !(tenantId > 0 && campTenantId > 0 && campTenantId !== tenantId)) {
          finalCampaignId = Number(camp.id);
          if (campTenantId > 0) finalTenantId = campTenantId;
        }
      } else {
        const [sendRows] = await db.query(
          `SELECT s.id AS send_id, s.campaign_id, s.contact_id, c.tenant_id
             FROM email_sends s
             INNER JOIN email_campaigns c ON c.id = s.campaign_id
            WHERE LOWER(TRIM(s.to_email)) = ?
              ${tenantId > 0 ? "AND c.tenant_id = ?" : ""}
            ORDER BY s.id DESC
            LIMIT 1`,
          tenantId > 0 ? [bouncedEmail, tenantId] : [bouncedEmail]
        );
        const row = (sendRows as any[])[0];
        if (row) {
          finalSendId = Number(row.send_id ?? 0) > 0 ? Number(row.send_id) : null;
          finalCampaignId = Number(row.campaign_id ?? 0) || null;
          finalContactId = Number(row.contact_id ?? 0) || null;
          const tid = Number(row.tenant_id ?? 0);
          if (tid > 0) finalTenantId = tid;
        }
      }

      if (finalSendId == null && finalCampaignId != null && finalCampaignId > 0) {
        const [sendOne] = await db.query(
          `SELECT s.id AS send_id
             FROM email_sends s
            WHERE s.campaign_id = ?
              AND LOWER(TRIM(s.to_email)) = ?
            ORDER BY s.id DESC
            LIMIT 1`,
          [finalCampaignId, bouncedEmail]
        );
        const sid = Number((sendOne as any[])[0]?.send_id ?? 0);
        if (sid > 0) finalSendId = sid;
      }

      if (finalContactId == null) {
        const [contactRows] = await db.query(
          `SELECT id FROM email_contacts WHERE tenant_id = ? AND LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1`,
          [finalTenantId, bouncedEmail]
        );
        const c = (contactRows as any[])[0];
        if (c) finalContactId = Number(c.id ?? 0) || null;
      }

      const reason = String(rep.reason ?? "").trim() || extractDsnReason(rep.rawText);
      await db.query(
        `INSERT INTO email_delivery_events
         (tenant_id, campaign_id, contact_id, email_send_id, email, event_type, provider, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'bounced', ?, CAST(? AS JSON), COALESCE(?, NOW()))`,
        [
          finalTenantId,
          finalCampaignId,
          finalContactId,
          finalSendId,
          bouncedEmail,
          String(body.provider ?? "dsn_manual").trim() || "dsn_manual",
          JSON.stringify({ reason, source: "dsn_import", rawText: rep.rawText.slice(0, 12000) }),
          rep.occurredAt ?? null
        ]
      );
      inserted += 1;
    }
    return res.json({ ok: true, inserted });
  });

  /** 按发信域查看 IMAP 入库的退信记录（各专线 info@mail.<域> 对应域） */
  app.get("/api/email/sender-domain-bounces", async (req, res) => {
    const requestTenantId = resolveTenantId(req);
    const query = z
      .object({
        senderDomain: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(500).optional()
      })
      .parse(req.query);
    const domain = String(query.senderDomain).trim().toLowerCase();
    const limit = query.limit ?? 100;
    const tenantWhere = requestTenantId > 0 ? "AND e.tenant_id = ?" : "";
    const tenantParams = requestTenantId > 0 ? [requestTenantId] : [];

    const [rows] = await db.query(
      `SELECT
          e.id AS event_id,
          e.email,
          e.campaign_id,
          e.email_send_id,
          e.reason,
          e.provider,
          e.created_at,
          s.from_email,
          c.campaign_code
         FROM email_delivery_events e
         LEFT JOIN email_sends s ON s.id = e.email_send_id
         LEFT JOIN email_campaigns c ON c.id = e.campaign_id
        WHERE e.event_type = 'bounced'
          AND (
            LOWER(TRIM(COALESCE(s.from_email, ''))) LIKE ?
            OR LOWER(TRIM(COALESCE(s.from_email, ''))) LIKE ?
            OR e.campaign_id IN (
              SELECT c2.id
                FROM email_campaigns c2
                INNER JOIN smtp_profiles sp ON sp.id = c2.smtp_profile_id
                INNER JOIN email_dedicated_servers eds ON eds.smtp_profile_id = sp.id
               WHERE LOWER(TRIM(eds.sender_domain)) = ?
            )
          )
          ${tenantWhere}
        ORDER BY e.id DESC
        LIMIT ?`,
      [`%@${domain}`, `%@mail.${domain}`, domain, ...tenantParams, limit]
    );

    const [dedRows] = await db.query(
      `SELECT e.id, e.sender_domain, sp.username AS imap_username, sp.host AS imap_host
         FROM email_dedicated_servers e
         INNER JOIN smtp_profiles sp ON sp.id = e.smtp_profile_id
        WHERE LOWER(TRIM(e.sender_domain)) = ?
        ${requestTenantId > 0 ? "AND e.tenant_id = ?" : ""}
        ORDER BY e.id DESC
        LIMIT 5`,
      requestTenantId > 0 ? [domain, requestTenantId] : [domain]
    );

    const [cntRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM email_delivery_events e
         LEFT JOIN email_sends s ON s.id = e.email_send_id
        WHERE e.event_type = 'bounced'
          AND (
            LOWER(TRIM(COALESCE(s.from_email, ''))) LIKE ?
            OR LOWER(TRIM(COALESCE(s.from_email, ''))) LIKE ?
            OR e.campaign_id IN (
              SELECT c2.id
                FROM email_campaigns c2
                INNER JOIN smtp_profiles sp ON sp.id = c2.smtp_profile_id
                INNER JOIN email_dedicated_servers eds ON eds.smtp_profile_id = sp.id
               WHERE LOWER(TRIM(eds.sender_domain)) = ?
            )
          )
          ${tenantWhere}`,
      [`%@${domain}`, `%@mail.${domain}`, domain, ...tenantParams]
    );

    return res.json({
      ok: true,
      senderDomain: domain,
      totalBounces: Number((cntRows as Array<{ c?: unknown }>)[0]?.c ?? 0),
      dedicatedMailboxes: (dedRows as Array<Record<string, unknown>>).map((r) => ({
        dedicatedServerId: Number(r.id ?? 0),
        senderDomain: String(r.sender_domain ?? ""),
        imapUsername: String(r.imap_username ?? ""),
        imapHost: String(r.imap_host ?? "")
      })),
      items: (rows as Array<Record<string, unknown>>).map((r) => ({
        eventId: Number(r.event_id ?? 0),
        email: String(r.email ?? ""),
        campaignId: r.campaign_id == null ? null : Number(r.campaign_id),
        campaignCode: r.campaign_code == null ? null : String(r.campaign_code),
        emailSendId: r.email_send_id == null ? null : Number(r.email_send_id),
        fromEmail: r.from_email == null ? null : String(r.from_email),
        reason: r.reason == null ? null : String(r.reason),
        provider: String(r.provider ?? ""),
        createdAt: r.created_at ?? null
      }))
    });
  });

  app.get("/api/email/bounce-imap/health", async (req, res) => {
    const tenantId = resolveTenantId(req);
    const health = getEmailBounceImapIngestorHealthSnapshot();
    const tid = tenantId > 0 ? tenantId : null;
    const tenantWhere = tid != null ? "AND tenant_id = ?" : "";
    const tenantParams = tid != null ? [tid] : [];

    const [recentRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM email_delivery_events
        WHERE event_type = 'bounced'
          AND provider = 'imap_bounce'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          ${tenantWhere}`,
      tenantParams
    );
    const [allRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM email_delivery_events
        WHERE event_type = 'bounced'
          AND provider = 'imap_bounce'
          ${tenantWhere}`,
      tenantParams
    );

    const [imapCfgRows] = await db.query(
      `SELECT COUNT(*) AS c
         FROM smtp_profiles
        WHERE imap_enabled = 1
          AND LENGTH(TRIM(COALESCE(imap_host, ''))) > 0
          AND LENGTH(TRIM(COALESCE(imap_username, ''))) > 0
          AND LENGTH(TRIM(COALESCE(imap_password_enc, ''))) > 0
          ${tenantWhere}`,
      tenantParams
    );

    return res.json({
      ok: true,
      health,
      metrics: {
        bouncedViaImapLast24h: Number((recentRows as any[])[0]?.c ?? 0),
        bouncedViaImapAllTime: Number((allRows as any[])[0]?.c ?? 0),
        /** 库中已勾选 IMAP 且主机/用户/密文非空（与采集进程是否解密成功无关，便于对照「启用来源」） */
        imapProfilesConfiguredInDb: Number((imapCfgRows as any[])[0]?.c ?? 0)
      }
    });
  });

  app.post("/api/email/bounce-imap/sync-now", async (req, res) => {
    const requestTenantId = resolveTenantId(req);
    const body = z
      .object({
        campaignId: z.coerce.number().int().positive().optional()
      })
      .parse(req.body ?? {});

    let reconcile: { matched: number; updated: number } | null = null;
    if (body.campaignId) {
      const [rows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [body.campaignId]);
      const row = (rows as any[])[0];
      if (!row) return res.status(404).json({ ok: false, message: "活动不存在" });
      const campTid = Number(row.tenant_id ?? 0);
      // 与统计接口一致：仅在明确处于某租户上下文时限制跨租户；
      // 超管/全局上下文（requestTenantId<=0）允许对选中活动触发同步。
      if (requestTenantId > 0 && campTid > 0 && campTid !== requestTenantId) {
        return res.status(403).json({ ok: false, message: "无权同步该活动（与当前租户不一致）。" });
      }
    }

    /** 必须先等 IMAP 轮询把退信写入 email_delivery_events，再 reconcile；原先 void 异步会导致对账永远早于入库 → 统计一直为 0 */
    const syncResult = await triggerEmailBounceImapIngestorNow(db, env, {
      forceRescanRecent: Boolean(body.campaignId),
      ...(body.campaignId ? { campaignIdHint: body.campaignId } : {})
    });

    let backfilledImapOrphans = 0;
    if (body.campaignId) {
      try {
        backfilledImapOrphans = await backfillImapBounceEventsForCampaign(db, body.campaignId);
      } catch {
        backfilledImapOrphans = 0;
      }
    }

    if (body.campaignId) {
      try {
        reconcile = await reconcileCampaignBouncedSends(db, body.campaignId, { apply: true, limit: 200000 });
      } catch {
        reconcile = { matched: 0, updated: 0 };
      }
    }

    let syncMessage =
      syncResult.message ??
      (syncResult.sources === 0
        ? "当前没有可用的 IMAP 退信来源（请在「邮件配置」中为 SMTP 启用 IMAP 并填写主机、账号与密码，或在服务器 backend/.env 配置 BOUNCE_IMAP_*）。"
        : `IMAP 扫描完成：来源 ${syncResult.sources} 个，新增退信事件 ${syncResult.inserted} 条。`);

    if (!syncResult.message && syncResult.sources !== undefined && syncResult.sources > 0 && syncResult.inserted === 0) {
      syncMessage =
        "IMAP 已连接但未解析到新退信（可能收件箱暂无退信邮件，或正文格式无法识别收件人邮箱）。如确有退信，可将一封退信原文通过「DSN 导入」接口录入。";
    }

    if (body.campaignId && backfilledImapOrphans > 0) {
      syncMessage = `${syncMessage} 已为 ${backfilledImapOrphans} 条历史 IMAP 退信补全活动归属并对账。`;
    }

    return res.json({
      ok: true,
      sync: {
        started: syncResult.started,
        inserted: syncResult.inserted,
        sources: syncResult.sources,
        async: false,
        message: syncMessage
      },
      campaignId: body.campaignId ?? null,
      reconcile,
      backfilledImapOrphans
    });
  });

  app.get("/api/email/unsubscribe", publicEmailAction("unsubscribe", async (req, res) => {
    const token = z.string().min(1).safeParse(req.query.token);
    if (!token.success) {
      return res.status(400).type("html").send("<h3>退订链接无效</h3>");
    }
    const parsed = parseAndVerifyUnsubscribeToken(token.data);
    if (!parsed.ok) {
      return res.status(400).type("html").send("<h3>退订链接校验失败</h3>");
    }

    const [rows] = await db.query(
      `SELECT id FROM email_contacts WHERE id = ? AND email = ? LIMIT 1`,
      [parsed.contactId, parsed.email]
    );
    const contact = (rows as any[])[0];
    if (!contact) return res.status(404).type("html").send("<h3>联系人不存在或已删除</h3>");

    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [parsed.campaignId]);
    const campTenantId = Number((campRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 1) || 1;

    await recordImplicitOpenForContactAction(req, parsed, "unsubscribe").catch(() => undefined);
    await db.query(`UPDATE email_contacts SET status = 'unsubscribed' WHERE id = ?`, [parsed.contactId]);
    if (campTenantId > 0) {
      await db.query(
        `UPDATE email_contacts SET status = 'unsubscribed' WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))`,
        [campTenantId, parsed.email]
      );
    }
    await db.query(
      `INSERT INTO email_unsubscribe_events
       (tenant_id, campaign_id, contact_id, email, reason, user_agent, ip)
       VALUES (?, ?, ?, ?, 'user_click', ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         user_agent = VALUES(user_agent),
         ip = VALUES(ip)`,
      [campTenantId, parsed.campaignId, parsed.contactId, parsed.email, safeRequestUserAgent(req), req.ip ?? null]
    );

    invalidateCampaignPanelStatsCache(parsed.campaignId);
    invalidateCampaignSendListCache(parsed.campaignId);
    if (campTenantId > 0) invalidateTenantRangeStatsCache(campTenantId);

    return res
      .status(200)
      .type("html")
      .send(
        `<html><body style="font-family:system-ui;padding:28px;"><h2>已成功退订</h2><p>你将不再收到该活动后续邮件。</p></body></html>`
      );
  }));

  app.get("/api/email/subscribe", publicEmailAction("subscribe", async (req, res) => {
    const token = z.string().min(1).safeParse(req.query.token);
    if (!token.success) {
      return res.status(400).type("html").send("<h3>订阅链接无效</h3>");
    }
    const parsed = parseAndVerifySubscribeToken(token.data);
    if (!parsed.ok) {
      return res.status(400).type("html").send("<h3>订阅链接校验失败</h3>");
    }

    const [rows] = await db.query(
      `SELECT id FROM email_contacts WHERE id = ? AND email = ? LIMIT 1`,
      [parsed.contactId, parsed.email]
    );
    const contact = (rows as { id?: unknown }[])[0];
    if (!contact) return res.status(404).type("html").send("<h3>联系人不存在或已删除</h3>");

    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [parsed.campaignId]);
    const campTenantId = Number((campRows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 1) || 1;

    await recordImplicitOpenForContactAction(req, parsed, "subscribe").catch(() => undefined);
    await db.query(`UPDATE email_contacts SET status = 'active' WHERE id = ? AND status = 'unsubscribed'`, [
      parsed.contactId
    ]);
    await db.query(
      `INSERT INTO email_subscribe_events
       (tenant_id, campaign_id, contact_id, email, reason, user_agent, ip)
       VALUES (?, ?, ?, ?, 'user_click', ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         user_agent = VALUES(user_agent),
         ip = VALUES(ip)`,
      [campTenantId, parsed.campaignId, parsed.contactId, parsed.email, safeRequestUserAgent(req), req.ip ?? null]
    );

    invalidateCampaignPanelStatsCache(parsed.campaignId);
    invalidateCampaignSendListCache(parsed.campaignId);
    if (campTenantId > 0) invalidateTenantRangeStatsCache(campTenantId);

    return res
      .status(200)
      .type("html")
      .send(
        `<html><body style="font-family:system-ui;padding:28px;"><h2>订阅已确认</h2><p>感谢确认继续接收此类邮件。</p></body></html>`
      );
  }));

  app.get("/api/email/subscribe-demo", async (_req, res) => {
    return res
      .status(200)
      .type("html")
      .send(
        `<html><body style="font-family:system-ui;padding:28px;"><h2>订阅已确认</h2><p>感谢确认继续接收此类邮件。</p></body></html>`
      );
  });

  app.get("/api/email/unsubscribe-demo", async (_req, res) => {
    return res
      .status(200)
      .type("html")
      .send(
        `<html><body style="font-family:system-ui;padding:28px;"><h2>已成功退订</h2><p>你将不再收到该活动后续邮件。</p></body></html>`
      );
  });

  app.get("/api/email/complaint", publicEmailAction("complaint-form", async (req, res) => {
    const token = z.string().min(1).safeParse(req.query.token);
    if (!token.success) {
      return res.status(400).type("html").send("<h3>投诉链接无效</h3>");
    }
    const parsed = parseAndVerifyComplaintToken(token.data);
    if (!parsed.ok) {
      return res.status(400).type("html").send("<h3>投诉链接校验失败</h3>");
    }
    return res.status(200).type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>提交投诉</title></head>
<body style="font-family:system-ui;padding:24px;color:#0f172a;">
<h2 style="margin:0 0 10px 0;">邮件投诉反馈</h2>
<p style="margin:0 0 14px 0;color:#475569;">请填写投诉原因，我们会将反馈同步给发件方改进内容质量。</p>
<form method="post" action="/api/email/complaint">
  <input type="hidden" name="token" value="${token.data}"/>
  <label style="font-size:13px;color:#334155;">投诉原因（必填）</label><br/>
  <select name="reason" required style="width:100%;max-width:560px;height:36px;margin:6px 0 10px 0;">
    <option value="内容无关">内容无关</option>
    <option value="发送过于频繁">发送过于频繁</option>
    <option value="疑似垃圾邮件">疑似垃圾邮件</option>
    <option value="冒用身份/误导">冒用身份/误导</option>
    <option value="其他">其他</option>
  </select><br/>
  <label style="font-size:13px;color:#334155;">补充说明（选填）</label><br/>
  <textarea name="detail" rows="5" maxlength="2000" style="width:100%;max-width:560px;margin-top:6px;"></textarea><br/>
  <button type="submit" style="margin-top:12px;height:36px;padding:0 14px;">提交投诉</button>
</form>
</body></html>`);
  }));

  app.post("/api/email/complaint", urlencoded({ extended: false }), publicEmailAction("complaint-submit", async (req, res) => {
    const token = z.string().min(1).safeParse(req.body?.token);
    if (!token.success) return res.status(400).type("html").send("<h3>投诉提交失败：缺少 token</h3>");
    const parsed = parseAndVerifyComplaintToken(token.data);
    if (!parsed.ok) return res.status(400).type("html").send("<h3>投诉提交失败：token 无效</h3>");

    const reason = String(req.body?.reason ?? "").trim().slice(0, 255) || "未填写";
    const detail = String(req.body?.detail ?? "").trim().slice(0, 2000);

    const [campRows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [parsed.campaignId]);
    const campaign = (campRows as Array<{ tenant_id: number }>)[0];
    if (!campaign) return res.status(404).type("html").send("<h3>活动不存在，投诉无法提交</h3>");

    const [contactRows] = await db.query(
      `SELECT id FROM email_contacts WHERE id = ? AND email = ? LIMIT 1`,
      [parsed.contactId, parsed.email]
    );
    const contact = (contactRows as Array<{ id: number }>)[0];
    if (!contact) return res.status(404).type("html").send("<h3>联系人不存在，投诉无法提交</h3>");

    const [dupRows] = await db.query(
      `SELECT id FROM email_delivery_events
        WHERE campaign_id = ? AND contact_id = ? AND event_type = 'complaint'
        LIMIT 1`,
      [parsed.campaignId, parsed.contactId]
    );
    if ((dupRows as Array<{ id: number }>)[0]?.id) {
      return res
        .status(200)
        .type("html")
        .send("<html><body style='font-family:system-ui;padding:24px;'><h3>投诉已记录</h3><p>感谢反馈，我们已收到您的投诉。</p></body></html>");
    }

    const campTenantId = Number(campaign.tenant_id);

    const [sendRows] = await db.query(
      `SELECT id FROM email_sends
        WHERE campaign_id = ? AND contact_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [parsed.campaignId, parsed.contactId]
    );
    const emailSendId = Number((sendRows as { id?: unknown }[])[0]?.id ?? 0) || null;

    await recordImplicitOpenForContactAction(req, parsed, "complaint").catch(() => undefined);
    await db.query(
      `INSERT INTO email_delivery_events
       (tenant_id, campaign_id, contact_id, email, email_send_id, event_type, provider, payload_json)
       VALUES (?, ?, ?, ?, ?, 'complaint', 'user_form', CAST(? AS JSON))`,
      [
        campTenantId,
        parsed.campaignId,
        parsed.contactId,
        parsed.email,
        emailSendId,
        JSON.stringify({ reason, detail, source: "complaint_form", userAgent: safeRequestUserAgent(req), ip: req.ip ?? null })
      ]
    );
    await db.query(`UPDATE email_contacts SET status = 'unsubscribed' WHERE id = ?`, [parsed.contactId]);
    if (campTenantId > 0) {
      await db.query(
        `UPDATE email_contacts SET status = 'unsubscribed' WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))`,
        [campTenantId, parsed.email]
      );
    }

    try {
      await notifyAllTenantMembers(db, campTenantId, {
        kind: "email_complaint_received",
        title: "收到收件人投诉反馈",
        bodyText: `活动 #${parsed.campaignId} 收到投诉（${reason}）。请检查模板内容与发送频率，必要时调整分组与文案。`,
        linkPath: "/email/campaigns/list",
        meta: { campaignId: parsed.campaignId, contactId: parsed.contactId, email: parsed.email, reason }
      });
    } catch {}

    invalidateCampaignPanelStatsCache(parsed.campaignId);
    invalidateCampaignSendListCache(parsed.campaignId);
    if (campTenantId > 0) invalidateTenantRangeStatsCache(campTenantId);

    return res
      .status(200)
      .type("html")
      .send("<html><body style='font-family:system-ui;padding:24px;'><h3>投诉提交成功</h3><p>感谢反馈，我们会尽快改进发送内容。</p></body></html>");
  }));

  app.get("/api/email/complaint-demo", async (_req, res) => {
    return res
      .status(200)
      .type("html")
      .send(
        "<html><body style='font-family:system-ui;padding:24px;'><h3>投诉提交成功</h3><p>感谢反馈，我们会尽快改进发送内容。</p></body></html>"
      );
  });

  app.post("/api/email/campaigns/:id/send", async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const schema = z.object({
      limit: z.coerce.number().int().min(1).max(200000).optional(),
      /** 每封之间的最小间隔（毫秒），0 表示尽快连续发；上限 120 秒 */
      minIntervalMs: z.coerce.number().int().min(0).max(120_000).optional(),
      industries: z.array(z.string().min(1).max(128)).max(100).optional(),
      /** 非空时覆盖活动保存的分组，可多选（联系人属于任一所选分组即命中，再去重） */
      groupIds: z.array(z.number().int().positive()).max(100).optional(),
      /** 混元专线栏 formal 发送 */
      laneIndex: z.coerce.number().int().min(1).max(99).optional(),
      triggerSource: z.enum(["lane_manual", "page_manual", "scheduler"]).optional()
    });
    const parsed = schema.parse(req.body ?? {});
    let limit = parsed.limit ?? 100_000;
    const minIntervalMs = parsed.minIntervalMs ?? 0;
    const industries = (parsed.industries ?? []).map((x) => x.trim()).filter(Boolean);
    const requestGroupIds = (parsed.groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const requestTenantId = resolveTenantId(req);
    const [campTenantRows] = await db.query(
      `SELECT c.tenant_id, c.status, c.smtp_profile_id, c.business_line, c.target_group_ids, sp.from_email AS smtp_from_email
         FROM email_campaigns c
         LEFT JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id
        WHERE c.id = ? LIMIT 1`,
      [id]
    );
    const campaignRow = (campTenantRows as {
      tenant_id?: unknown;
      status?: unknown;
      business_line?: unknown;
      target_group_ids?: unknown;
    }[])[0];
    const campaignTenantId = Number(campaignRow?.tenant_id ?? 0);
    if (industries.length > 0 && campaignTenantId > 0) {
      const groupIds =
        requestGroupIds.length > 0
          ? requestGroupIds
          : parseCampaignTargetGroupIds(campaignRow?.target_group_ids);
      const previewCount = await countDistinctAudienceEmails(
        db,
        {
          tenantId: campaignTenantId,
          groupIds,
          industries,
          businessLine:
            campaignRow?.business_line != null ? String(campaignRow.business_line) : null,
          sendPipelineMatch: true
        },
        { cap: 200_000 }
      );
      if (previewCount > 0 && previewCount > limit) {
        limit = previewCount;
      }
    }
    if (requestTenantId > 0 && campaignTenantId > 0 && campaignTenantId !== requestTenantId) {
      return res.status(403).json({
        ok: false,
        message:
          "该活动不属于当前工作租户，无法匹配当前租户内的 CRM 联系人。请重新「保存活动」生成属于本租户的活动，或在超管模式下为同一租户选择活动后再发送（预计人数与发送必须使用同一租户）。"
      });
    }

    if (campaignTenantId > 0) {
      try {
        await ensureStandaloneTenantEmailModule(db, campaignTenantId);
      } catch (syncErr) {
        console.warn("[email/campaigns/:id/send] license sync:", (syncErr as Error)?.message ?? syncErr);
      }
      const laneGate = await checkDedicatedLaneSendAllowed(db, campaignTenantId, {
        campaignId: id,
        plannedCount: limit,
        allowOngoingCampaignId: id
      });
      if (!laneGate.ok) {
        return res.status(laneGate.httpStatus).json({
          ok: false,
          message: laneGate.reason,
          code: laneGate.code
        });
      }
      if (campaignTenantId > 0) {
        const dailyCap = await getTenantEmailDailySendLimit(db, campaignTenantId);
        if (dailyCap != null && dailyCap > 0) {
          const usedToday = await countTenantEmailSentToday(db, campaignTenantId);
          if (usedToday >= dailyCap) {
            return res.status(403).json({
              ok: false,
              message: `今日送达成功已达套餐上限（${dailyCap.toLocaleString("zh-CN")} 封/日，与营销活动统计「已送达」同口径）。请明日再试或升级套餐。`
            });
          }
        }
      }
      if (laneGate.ok && laneGate.laneRemaining != null) {
        campaignLaneSendCtxCache.set(id, {
          lineSentCap: laneGate.lineSentCap ?? laneGate.laneRemaining + (laneGate.sentToday ?? 0),
          sentTodayBaseline: laneGate.sentToday ?? 0,
          laneRemaining: laneGate.laneRemaining
        });
      }
    }

    try {
      campaignRuntimeControlOverrides.delete(id);
      const hasHistory = await campaignHasSendHistory(db, id);
      if (hasHistory) {
        return res.status(409).json({
          ok: false,
          message: "该活动编号已发送过，不可重复发送。请新建活动（新 6 位编号）后再发。"
        });
      }

      if (industries.length > 0) {
        await db.query(`UPDATE email_campaigns SET target_industries_json = CAST(? AS JSON) WHERE id = ?`, [
          JSON.stringify(industries),
          id
        ]);
      }

      const sendOpts = {
        limit,
        unsubscribeBaseUrl: getUnsubscribeBaseUrl(),
        minIntervalMs,
        industries,
        groupIds: requestGroupIds.length > 0 ? requestGroupIds : undefined
      };

      /** 进程内占位，避免 reconcile 在 send_run 写入前误杀（同 worker 请求） */
      campaignActiveSendRunId.set(id, -1);
      campaignSendAsyncError.delete(id);
      setCampaignSendPrep(id, "queued", "已创建发送轮次，等待后台执行");

      let sendRunId = 0;
      let roundNo = 0;
      try {
        const campMeta = campTenantRows as Array<{
          tenant_id?: unknown;
          smtp_profile_id?: unknown;
          smtp_from_email?: unknown;
        }>;
        /** 先写 send_run，再标 campaign sending，避免 refreshDedicatedLanes 在空窗期 reconcile 误杀 */
        const begun = await beginCampaignSendRun(db, {
          campaignId: id,
          tenantId: campaignTenantId,
          triggerSource: parsed.triggerSource ?? "page_manual",
          laneIndex: parsed.laneIndex ?? null,
          smtpProfileId:
            campMeta[0]?.smtp_profile_id != null ? Number(campMeta[0].smtp_profile_id) : null,
          fromEmail: String(campMeta[0]?.smtp_from_email ?? "").trim() || null,
          industries
        });
        sendRunId = begun.sendRunId;
        roundNo = begun.roundNo;
      } catch (e) {
        console.error("[email/campaigns/:id/send] beginCampaignSendRun failed", id, e);
        clearCampaignActiveSendPlan(id);
        return res.status(500).json({ ok: false, message: "创建发送轮次失败，请稍后重试。" });
      }

      /**
       * 计划数 = 行业预览/前端 limit（全量受众），非「日发剩余额度」。
       * 有 industries 时 POST 已将 limit 抬至 preview-count；executeCampaignSend 拉完列表后再校准。
       */
      let interimPlanned = Math.max(1, Math.min(limit, 200_000));
      const skipCalibrateForPreview =
        parsed.limit != null || (industries.length > 0 && campaignTenantId > 0 && limit > 0);
      if (!skipCalibrateForPreview) {
        try {
          const calibratedRemaining = await calibrateCampaignRecipientCountBeforeSend(db, id, {
            industries,
            groupIds: requestGroupIds.length > 0 ? requestGroupIds : undefined,
            limit
          });
          if (calibratedRemaining > 0) {
            interimPlanned = calibratedRemaining;
          }
        } catch (calErr) {
          console.warn("[email/campaigns/:id/send] calibrate planned failed", id, (calErr as Error)?.message ?? calErr);
        }
      }
      bindCampaignActiveSendRunMaps(id, sendRunId, interimPlanned);
      try {
        await updateSendRunPlannedCount(db, sendRunId, interimPlanned);
        await db.query(`UPDATE email_campaigns SET recipient_count = ? WHERE id = ?`, [interimPlanned, id]);
      } catch {
        /* ignore */
      }

      const claimed = await tryMarkCampaignSending(db, id, ["draft", "scheduled", "paused", "stopped"]);
      if (!claimed) {
        await finalizeCampaignSendRun(db, sendRunId, "stopped").catch(() => undefined);
        clearCampaignActiveSendPlan(id);
        const [statusRows] = await db.query(`SELECT status FROM email_campaigns WHERE id = ? LIMIT 1`, [id]);
        const statusNow = String((statusRows as Array<{ status?: unknown }>)[0]?.status ?? "");
        if (String(statusNow).toLowerCase() === "sending") {
          return res.status(409).json({ ok: false, message: "该活动正在发送中，请勿重复点击。" });
        }
        return res.status(409).json({ ok: false, message: `当前活动状态为 ${statusNow || "未知"}，暂不可开始发送。` });
      }

      /**
       * 整批发送可能持续数分钟～数小时；若在本 handler 内 await executeCampaignSend，
       * Nginx/反代默认 60s 读超时易返回 504，浏览器拿不到 JSON。实际进度已由
       * GET /send-progress 轮询展示，故在占住「sending」后立即响应，发送在后台跑完。
       */
      void (async () => {
        try {
          const r = await executeCampaignSend(db, id, {
            ...sendOpts,
            sendRunId,
            /** 专线新轮次：只在本 run 内断点，不按活动历史跳过（避免误杀可发列表） */
            resumeFromPause: false
          });
          try {
            await triggerEmailBounceImapIngestorNow(db, env, {
              forceRescanRecent: true,
              campaignIdHint: id
            });
            await backfillImapBounceEventsForCampaign(db, id);
            await reconcileCampaignBouncedSends(db, id, { apply: true, limit: 5000 });
          } catch {
            /* 发送结束后的首轮退信同步失败不阻断 finalize */
          }
          if (r.aborted == null) {
            campaignSendAsyncError.delete(id);
            await finalizeCampaignAfterSend(db, id);
            void emitTenantWebhookEvent(db, campaignTenantId, "email.send.completed", {
              campaignId: id,
              sendRunId,
              roundNo,
              status: "completed"
            });
          } else if (sendRunId > 0) {
            const finalStatus = r.aborted === "pause" ? "paused" : "stopped";
            if (r.dailyDeliveredCapHit) {
              campaignSendAsyncError.set(
                id,
                campaignSendAsyncError.get(id) ??
                  "活动已停止发送：今日日发限额已满（与套餐送达成功日上限一致）。"
              );
            }
            await finalizeCampaignSendRun(db, sendRunId, "stopped");
            clearCampaignActiveSendPlan(id);
            await db.query(
              `UPDATE email_campaigns SET status = ?, next_run_at = NULL WHERE id = ? AND LOWER(COALESCE(status, '')) = 'sending'`,
              [finalStatus, id]
            );
            void emitTenantWebhookEvent(db, campaignTenantId, "email.send.completed", {
              campaignId: id,
              sendRunId,
              roundNo,
              status: finalStatus,
              dailyDeliveredCapHit: Boolean(r.dailyDeliveredCapHit)
            });
            if (r.dailyDeliveredCapHit) {
              void emitTenantWebhookEvent(db, campaignTenantId, "email.send.daily_limit_reached", {
                campaignId: id,
                sendRunId,
                roundNo
              });
            }
          }
          if (industries.length > 0) {
            void (async () => {
              try {
                const [crowRows] = await db.query(
                  `SELECT tenant_id, business_line, target_group_ids FROM email_campaigns WHERE id = ? LIMIT 1`,
                  [id]
                );
                const crow = (crowRows as { tenant_id?: unknown; business_line?: unknown; target_group_ids?: unknown }[])[0];
                if (!crow) return;
                const tid = Number(crow.tenant_id ?? 0);
                const bl = crow.business_line != null ? String(crow.business_line) : null;
                const gidsDb = parseCampaignTargetGroupIds(crow.target_group_ids);
                const gids = requestGroupIds.length > 0 ? requestGroupIds : gidsDb;
                const audience = await countAudience(db, gids, bl, industries, tid > 0 ? tid : null);
                await db.query(`UPDATE email_campaigns SET recipient_count = ?, target_industries_json = CAST(? AS JSON) WHERE id = ?`, [
                  audience,
                  JSON.stringify(industries),
                  id
                ]);
              } catch {
                // ignore async audience snapshot update failures
              }
            })();
          }
        } catch (e: any) {
          if (sendRunId > 0) {
            await finalizeCampaignSendRun(db, sendRunId, "stopped").catch(() => undefined);
            clearCampaignActiveSendPlan(id);
          }
          const msg = String(e?.message ?? e);
          campaignSendAsyncError.set(id, msg);
          setCampaignSendPrep(id, "unknown", msg);
          try {
            await restoreCampaignStatusIfSending(db, id, String(campaignRow?.status ?? ""));
          } catch {
            // ignore restore errors
          }
          console.error("[email/campaigns/:id/send async]", id, msg);
          void emitTenantWebhookEvent(db, campaignTenantId, "email.send.completed", {
            campaignId: id,
            sendRunId,
            roundNo,
            status: "failed",
            error: msg
          });
        }
      })();

      return res.json({
        ok: true,
        deferred: true,
        minIntervalMs,
        sendRunId,
        roundNo,
        runPlannedTotal: interimPlanned,
        message: "发送已在后台执行，请通过下方实时监控查看进度；完成后活动状态会自动更新。"
      });
    } catch (e: any) {
      try {
        await restoreCampaignStatusIfSending(db, id, String(campaignRow?.status ?? ""));
      } catch {
        // ignore restore errors
      }
      const msg = String(e?.message ?? e);
      if (msg.includes("活动不存在")) return res.status(404).json({ ok: false, message: msg });
      if (msg.includes("未开通或已到期")) return res.status(403).json({ ok: false, message: msg });
      if (msg.includes("今日已超出套餐发送上限")) return res.status(400).json({ ok: false, message: msg });
      if (msg.includes("没有可发送联系人")) return res.status(400).json({ ok: false, message: msg });
      if (msg.includes("SMTP")) return res.status(400).json({ ok: false, message: msg });
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post("/api/email/campaigns/:id/control", async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        action: z.enum(["pause", "stop"])
      })
      .parse(req.body ?? {});

    const [rows] = await db.query(`SELECT tenant_id, status FROM email_campaigns WHERE id = ? LIMIT 1`, [id]);
    const row = (rows as Array<{ tenant_id?: unknown; status?: unknown }>)[0];
    if (!row) return res.status(404).json({ ok: false, message: "活动不存在" });
    const requestTenantId = resolveTenantId(req);
    const campaignTenantId = Number(row.tenant_id ?? 0);
    if (requestTenantId > 0 && campaignTenantId > 0 && campaignTenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, message: "无权操作该活动（与当前租户不一致）。" });
    }
    const statusNow = String(row.status ?? "").toLowerCase();
    const [activeRunRows] = await db.query(
      `SELECT id FROM email_campaign_send_runs
        WHERE campaign_id = ? AND status = 'sending'
        ORDER BY id DESC LIMIT 1`,
      [id]
    );
    const activeSendRunId = Number((activeRunRows as Array<{ id?: unknown }>)[0]?.id ?? 0);
    const runStillActive = activeSendRunId > 0;
    if (statusNow !== "sending" && !runStillActive) {
      if (statusNow === "paused") {
        return res.json({ ok: true, status: "paused", message: "活动已处于暂停状态。" });
      }
      if (statusNow === "stopped") {
        return res.json({ ok: true, status: "stopped", message: "活动已处于停止状态。" });
      }
      return res.status(409).json({
        ok: false,
        message: body.action === "stop" ? "当前活动不在发送中，无法停止。" : "当前活动不在发送中，无法执行暂停。"
      });
    }
    if (body.action === "stop") {
      const result = await stopCampaignSendNow(db, id, {
        requestTenantId,
        source: req.auth?.role === "api_key" ? "api" : "session"
      });
      return res.json(result);
    }
    campaignRuntimeControlOverrides.set(id, "pause");
    await db.query(`UPDATE email_campaigns SET status = ?, next_run_at = NULL WHERE id = ?`, ["paused", id]);
    res.json({ ok: true, status: "paused" });
  });

  app.post("/api/email/campaigns/:id/send-test", async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { to } = z.object({ to: z.string().email() }).parse(req.body);

    const [campRows] = await db.query(
      `SELECT subject, html, smtp_profile_id, sender_profile_id, ses_sender_address_id, tenant_id, template_id FROM email_campaigns WHERE id = ? LIMIT 1`,
      [id]
    );
    const campaign = (campRows as any[])[0];
    if (!campaign) return res.status(404).json({ ok: false, message: "活动不存在" });

    const tenantId = Number(campaign.tenant_id ?? 0);
    if (tenantId > 0) {
      const [emailRows] = await db.query(
        `SELECT status, period_end
           FROM tenant_product_modules
          WHERE tenant_id = ? AND module = 'email'
          LIMIT 1`,
        [tenantId]
      );
      const emailModule = (emailRows as Array<{ status: string; period_end: Date | string | null }>)[0] ?? null;
      if (!isSubscriptionPeriodActive(emailModule)) {
        return res.status(403).json({ ok: false, message: "邮件套餐未开通或已到期，当前不可发送测试邮件。" });
      }
    }

    const html = String(campaign.html ?? "");
    const demoLinks = getComplianceDemoLinks();
    const wechatReadFallback = await resolveWechatReadUrlForTemplate(
      db,
      tenantId,
      campaign.template_id != null ? Number(campaign.template_id) : 0
    );
    const htmlWithCompliance = decorateHtmlWithComplianceLinks(
      html,
      demoLinks.unsubscribeUrl,
      demoLinks.complaintUrl,
      demoLinks.subscribeUrl,
      wechatReadFallback
    );
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    /** 活动显式绑定了 SES 发件邮箱：测试必须与正式群发走同一身份（仅 SES，不回退 SMTP） */
    if (Number(campaign.ses_sender_address_id ?? 0) > 0) {
      try {
        const sesSender = await pickCampaignSesSender(db, campaign);
        const sender = await pickCampaignSender(db, campaign);
        const fromEmailForLog = sesSender!.fromEmail;
        const fromAddressDisplay = sender?.display_name ?? sesSender!.displayName ?? null;
        const fromAddress = fromAddressDisplay ? `${fromAddressDisplay} <${fromEmailForLog}>` : fromEmailForLog;
        const replyTo = (sender?.reply_to ?? sesSender!.replyTo ?? "").toString().trim();
        const r = await sesSendEmail({
          fromAddress,
          toAddresses: [to],
          replyToAddress: replyTo || undefined,
          subject: `[测试] ${campaign.subject}`,
          htmlBody: htmlWithCompliance,
          textBody: text || String(campaign.subject),
          tags: {
            bss_tenant_id: String(tenantId),
            bss_test: "campaign_send_test",
            bss_campaign_id: String(id),
            bss_ses_sender_id: String(sesSender!.id)
          }
        });
        return res.json({ ok: true, messageId: r.messageId, channel: "ses" as const });
      } catch (e: unknown) {
        return res.status(400).json({
          ok: false,
          message: String((e as Error)?.message ?? e)
        });
      }
    }

    const smtp = await pickCampaignSmtp(db, campaign);
    if (smtp) {
      const sender = await pickCampaignSender(db, campaign);
      /** SMTP 邮箱自带 display_name 优先；否则回退活动绑定的发件人资料 */
      const effectiveDisplayName = smtp.display_name?.trim() || sender?.display_name || null;
      const fromAddress = effectiveDisplayName ? `${effectiveDisplayName} <${smtp.from_email}>` : smtp.from_email;
      const replyTo = (smtp.reply_to?.trim() || sender?.reply_to || "").toString().trim();

      const pass = decryptSecret(smtp.password_enc);
      const transporter = nodemailer.createTransport(
        nodemailerTransportFromSmtpRow(smtp, { user: resolveSmtpAuthUser(smtp), pass }, {})
      );

      try {
        const inlineMail = prepareSmtpHtmlWithInlineUploadImages(htmlWithCompliance);
        const info = await transporter.sendMail({
          from: fromAddress,
          ...(replyTo ? { replyTo } : {}),
          to,
          subject: `[测试] ${campaign.subject}`,
          text: text || String(campaign.subject),
          html: inlineMail.html,
          ...(inlineMail.attachments?.length ? { attachments: inlineMail.attachments } : {})
        });

        return res.json({ ok: true, messageId: info.messageId, channel: "smtp" as const });
      } catch (e: unknown) {
        const msg = String((e as Error)?.message ?? e);
        return res.status(500).json({
          ok: false,
          message: `SMTP 测试发送失败：${msg}。请核对当前活动绑定的 SMTP 账号、密码、服务器、端口和 SSL 设置；认证失败不会影响网站登录和其它页面。`
        });
      } finally {
        try {
          transporter.close();
        } catch {
          /* ignore */
        }
      }
    }

    /** 活动未绑 SMTP 时：与设置页一致，尝试租户默认可用的 SES 发件邮箱 */
    const sesFallback = await pickDefaultSesSenderAddressForTest(db, tenantId);
    if (sesFallback) {
      const sender = await pickCampaignSender(db, campaign);
      const effectiveDisplayName =
        sender?.display_name?.trim() || sesFallback.displayName?.trim() || null;
      const fromEmailForLog = sesFallback.fromEmail;
      const fromAddress = effectiveDisplayName
        ? `${effectiveDisplayName} <${fromEmailForLog}>`
        : fromEmailForLog;
      const replyTo = (sender?.reply_to ?? sesFallback.replyTo ?? "").toString().trim();
      try {
        const r = await sesSendEmail({
          fromAddress,
          toAddresses: [to],
          replyToAddress: replyTo || undefined,
          subject: `[测试] ${campaign.subject}`,
          htmlBody: htmlWithCompliance,
          textBody: text || String(campaign.subject),
          tags: {
            bss_tenant_id: String(tenantId),
            bss_test: "campaign_send_test_fallback_ses",
            bss_campaign_id: String(id),
            bss_ses_sender_id: String(sesFallback.id)
          }
        });
        return res.json({ ok: true, messageId: r.messageId, channel: "ses" as const });
      } catch (e: unknown) {
        const msg = String((e as Error)?.message ?? e);
        return res.status(500).json({
          ok: false,
          message: `SES 测试发送失败：${msg}`
        });
      }
    }

    return res.status(400).json({
      ok: false,
      message:
        "暂无可用的测试发信方式：请在活动中选择「发件邮箱（SES）」或配置 SMTP；也可在「设置 · 邮件」完成发件域名验证。"
    });
  });
}

async function pruneCampaignActiveSendMemory(db: Pool): Promise<void> {
  const ids = [...campaignActiveSendRunId.keys()];
  if (ids.length === 0) return;
  const ph = ids.map(() => "?").join(", ");
  const [rows] = await db.query(
    `SELECT id, LOWER(COALESCE(status, '')) AS st FROM email_campaigns WHERE id IN (${ph})`,
    ids
  );
  const notSending = new Set(
    (rows as Array<{ id?: unknown; st?: unknown }>)
      .filter((r) => String(r.st ?? "") !== "sending")
      .map((r) => Number(r.id ?? 0))
      .filter((id) => id > 0)
  );
  for (const id of ids) {
    if (notSending.has(id)) {
      clearCampaignActiveSendPlan(id);
      campaignRuntimeControlOverrides.delete(id);
    }
  }
}

export function startEmailCampaignScheduler(db: Pool) {
  let lastSchedulerErrorLogAt = 0;
  const SCHEDULER_ERROR_LOG_INTERVAL_MS = 5 * 60 * 1000;

  /** 启动即刻回收孤儿 sending（不阻塞 setInterval 启动） */
  void recoverOrphanSendingCampaignsOnStartup(db);
  void recoverOrphanSendingRunsOnStartup(db);

  const tick = async () => {
    try {
      /** 每分钟回收僵尸 sending，避免专线长期显示「X 域发送中」阻塞其它活动 */
      await pruneCampaignActiveSendMemory(db);
      if (process.env.CAMPAIGN_SEND_ALLOW_SCHEDULER_RECOVER === "1") {
        void reconcileCampaignsWithoutActiveSendRun(db).catch(() => undefined);
      }
      const activeSendIds = new Set(campaignActiveSendRunId.keys());
      const recoveredIds = await recoverStaleSendingCampaigns(db, activeSendIds);
      if (recoveredIds.length > 0) {
        for (const recoveredId of recoveredIds) {
          /** 仅回收真孤儿：勿对仍在 map 内的活动写 stop，避免误中断后台 send 循环 */
          if (!activeSendIds.has(recoveredId)) {
            campaignRuntimeControlOverrides.set(recoveredId, "stop");
          }
          clearCampaignActiveSendPlan(recoveredId);
        }
        // eslint-disable-next-line no-console
        console.log(`[email campaign scheduler] recovered ${recoveredIds.length} stale sending campaign(s)`);
      }

      const [rows] = await db.query(
        `SELECT id FROM email_campaigns
         WHERE status = 'scheduled' AND next_run_at IS NOT NULL AND next_run_at <= NOW()
         ORDER BY next_run_at ASC
         LIMIT 5`
      );
      for (const r of rows as any[]) {
        const id = Number(r.id);
        if (!id) continue;
        if (await campaignHasSendHistory(db, id)) {
          await db.query(
            `UPDATE email_campaigns SET status = 'completed', next_run_at = NULL WHERE id = ? AND status = 'scheduled'`,
            [id]
          );
          continue;
        }
        const claimed = await tryMarkCampaignSending(db, id, ["scheduled"]);
        if (!claimed) continue;
        try {
          const [campRows] = await db.query(
            `SELECT tenant_id, smtp_profile_id FROM email_campaigns WHERE id = ? LIMIT 1`,
            [id]
          );
          const camp = (campRows as Array<{ tenant_id?: unknown; smtp_profile_id?: unknown }>)[0];
          const tenantIdSched = Number(camp?.tenant_id ?? 0);
          const { sendRunId } = await beginCampaignSendRun(db, {
            campaignId: id,
            tenantId: tenantIdSched,
            triggerSource: "scheduler",
            smtpProfileId: camp?.smtp_profile_id != null ? Number(camp.smtp_profile_id) : null,
            industries: []
          });
          bindCampaignActiveSendRunMaps(id, sendRunId, 0);
          await executeCampaignSend(db, id, {
            limit: 100_000,
            unsubscribeBaseUrl: getUnsubscribeBaseUrl(),
            sendRunId
          });
          const currentControl = await resolveCampaignRuntimeControl(db, id);
          if (currentControl === "continue") {
            await finalizeCampaignAfterSend(db, id);
          }
        } catch (inner: unknown) {
          try {
            await db.query(
              `UPDATE email_campaigns SET status = 'scheduled', next_run_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE) WHERE id = ? AND LOWER(COALESCE(status, '')) = 'sending'`,
              [id]
            );
          } catch {
            // ignore
          }
          // eslint-disable-next-line no-console
          console.error("[email campaign scheduler] executeCampaignSend failed for campaign", id, inner);
        }
      }
    } catch (e: any) {
      const now = Date.now();
      if (now - lastSchedulerErrorLogAt < SCHEDULER_ERROR_LOG_INTERVAL_MS) return;
      lastSchedulerErrorLogAt = now;
      // eslint-disable-next-line no-console
      console.error("[email campaign scheduler]", e);
      if (e?.code === "ECONNREFUSED") {
        // eslint-disable-next-line no-console
        console.error(
          "[email campaign scheduler] 提示：无法连接 MySQL（常见为服务未启动或端口不是 3306）。请启动本机 MySQL，或在 backend/.env 中配置 MYSQL_HOST / MYSQL_PORT / MYSQL_*。"
        );
      }
    }
  };
  setInterval(tick, 60_000);
  void tick();
}
