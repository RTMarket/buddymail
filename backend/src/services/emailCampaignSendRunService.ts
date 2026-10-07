import type { Pool } from "mysql2/promise";
import {
  sqlEmailSendIsSmtpFailure,
  sqlSumEmailSendSmtpFailures
} from "./campaignSendDeliveryFailure.js";
import { sqlSendRowHasBounceEvent } from "./emailBounceReconcile.js";
import {
  ensureEmailCampaignSendRunsSchema,
  type EmailCampaignSendRunStatus,
  type EmailCampaignSendRunTrigger
} from "./emailCampaignSendRunsSchema.js";

export type BeginCampaignSendRunOpts = {
  campaignId: number;
  tenantId: number;
  triggerSource: EmailCampaignSendRunTrigger;
  laneIndex?: number | null;
  smtpProfileId?: number | null;
  fromEmail?: string | null;
  industries?: string[];
};

export type CampaignSendRunProgressMetrics = {
  attempted: number;
  sent: number;
  failed: number;
  smtpFailed: number;
  bounceFailures: number;
  suppressed?: number;
  /** 去重邮箱维度仍为「发送中」的数量（SMTP 进行中；尚未计入 smtpFailed） */
  sendingDistinct?: number;
  /** 本轮 send_run 内 email_sends 总行数（含 sending） */
  totalRows?: number;
};

/** 由 email 路由注册：当前 Node 进程内 executeCampaignSend 仍在跑的活动 ID */
let activeSendCampaignIdProvider: (() => ReadonlySet<number>) | null = null;
let pruneActiveSendMemoryHook: ((db: Pool) => Promise<void>) | null = null;

export function registerActiveSendCampaignIdProvider(fn: () => ReadonlySet<number>): void {
  activeSendCampaignIdProvider = fn;
}

export function registerPruneActiveSendMemoryHook(fn: (db: Pool) => Promise<void>): void {
  pruneActiveSendMemoryHook = fn;
}

function resolveActiveSendCampaignIds(): ReadonlySet<number> {
  try {
    return activeSendCampaignIdProvider?.() ?? new Set();
  } catch {
    return new Set();
  }
}

/**
 * 按去重邮箱聚合后的投递状态（send-progress / 本轮 send_run 共用）。
 * 优先 failed/suppressed，其次退信，最后 sent；避免「先 failed 又有 sent」时被算成成功。
 */
/** 退信：优先 email_send_id 直连（含 postfix_deferred），再回退邮箱+campaign 匹配 */
export function sqlSendRowHasBounceEventImmediate(sAlias = "s"): string {
  const bouncePred = sqlSendRowHasBounceEvent(sAlias);
  return `EXISTS (
    SELECT 1 FROM email_delivery_events e
    WHERE e.event_type = 'bounced'
      AND (
        e.email_send_id = ${sAlias}.id
        OR (${bouncePred})
        OR (
          e.campaign_id = ${sAlias}.campaign_id
          AND LOWER(TRIM(e.email)) = LOWER(TRIM(${sAlias}.to_email))
        )
      )
  )`;
}

export function sqlPerEmailDeliveryStateExpr(sAlias = "s"): string {
  const bouncePred = sqlSendRowHasBounceEventImmediate(sAlias);
  return `CASE
    WHEN SUM(CASE WHEN ${sAlias}.status IN ('failed', 'suppressed') THEN 1 ELSE 0 END) > 0 THEN 'failed'
    WHEN SUM(
      CASE
        WHEN ${sAlias}.status = 'sent' AND ${bouncePred} THEN 1
        ELSE 0
      END
    ) > 0 THEN 'bounced'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'sent' THEN 1 ELSE 0 END) > 0 THEN 'sent'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'skipped' THEN 1 ELSE 0 END) > 0 THEN 'skipped'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'sending' THEN 1 ELSE 0 END) > 0 THEN 'sending'
    ELSE 'other'
  END`;
}

/** 发送中实时监控：拒收单独归类，退信与 sent 互斥（sent 已是「真实送达」口径） */
export function sqlPerEmailDeliveryStateExprLive(sAlias = "s"): string {
  const bouncePred = sqlSendRowHasBounceEventImmediate(sAlias);
  return `CASE
    WHEN SUM(CASE WHEN ${sAlias}.status = 'suppressed' THEN 1 ELSE 0 END) > 0 THEN 'suppressed'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'failed' THEN 1 ELSE 0 END) > 0 THEN 'failed'
    WHEN SUM(
      CASE
        WHEN ${sAlias}.status = 'sent' AND ${bouncePred} THEN 1
        ELSE 0
      END
    ) > 0 THEN 'bounced'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'sent' THEN 1 ELSE 0 END) > 0 THEN 'sent'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'skipped' THEN 1 ELSE 0 END) > 0 THEN 'skipped'
    WHEN SUM(CASE WHEN ${sAlias}.status = 'sending' THEN 1 ELSE 0 END) > 0 THEN 'sending'
    ELSE 'other'
  END`;
}

export async function beginCampaignSendRun(
  db: Pool,
  opts: BeginCampaignSendRunOpts
): Promise<{ sendRunId: number; roundNo: number }> {
  await ensureEmailCampaignSendRunsSchema(db);
  const [maxRows] = await db.query(
    `SELECT COALESCE(MAX(round_no), 0) AS m FROM email_campaign_send_runs WHERE campaign_id = ?`,
    [opts.campaignId]
  );
  const roundNo = Math.max(0, Number((maxRows as Array<{ m?: unknown }>)[0]?.m ?? 0)) + 1;
  const industriesJson = (opts.industries ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  /** 先插入本轮 sending，再结束旧轮次，避免 reconcile 在空窗期误杀活动 */
  const [ins] = await db.query(
    `INSERT INTO email_campaign_send_runs (
       campaign_id, tenant_id, round_no, status, trigger_source,
       lane_index, smtp_profile_id, from_email, target_industries_json
     ) VALUES (?, ?, ?, 'sending', ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      opts.campaignId,
      opts.tenantId,
      roundNo,
      opts.triggerSource,
      opts.laneIndex != null && Number.isFinite(Number(opts.laneIndex)) ? Number(opts.laneIndex) : null,
      opts.smtpProfileId != null && Number(opts.smtpProfileId) > 0 ? Number(opts.smtpProfileId) : null,
      opts.fromEmail?.trim() || null,
      industriesJson.length > 0 ? JSON.stringify(industriesJson) : null
    ]
  );
  const sendRunId = Number((ins as { insertId?: unknown }).insertId ?? 0);
  if (!Number.isFinite(sendRunId) || sendRunId <= 0) {
    throw new Error("创建发送轮次失败");
  }
  const [staleRows] = await db.query(
    `SELECT id FROM email_campaign_send_runs WHERE campaign_id = ? AND status = 'sending' AND id <> ?`,
    [opts.campaignId, sendRunId]
  );
  for (const row of staleRows as Array<{ id?: unknown }>) {
    const staleId = Number(row.id ?? 0);
    if (staleId > 0) {
      await finalizeCampaignSendRun(db, staleId, "stopped").catch(() => undefined);
    }
  }
  return { sendRunId, roundNo };
}

export async function updateSendRunPlannedCount(db: Pool, sendRunId: number, plannedCount: number): Promise<void> {
  if (!sendRunId) return;
  await db.query(`UPDATE email_campaign_send_runs SET planned_count = ? WHERE id = ?`, [
    Math.max(0, Math.floor(Number(plannedCount) || 0)),
    sendRunId
  ]);
}

type SendRunScope = {
  runStillSending: boolean;
  runScopeSql: string;
  runScopeParams: unknown[];
};

async function resolveSendRunScope(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<SendRunScope> {
  const [runMetaRows] = await db.query(
    `SELECT status, started_at FROM email_campaign_send_runs WHERE id = ? AND campaign_id = ? LIMIT 1`,
    [sendRunId, campaignId]
  );
  const runMeta = (runMetaRows as Array<{ status?: unknown; started_at?: Date | string | null }>)[0];
  const runStillSending = String(runMeta?.status ?? "").toLowerCase() === "sending";
  /**
   * 专线轮次：只统计本 send_run_id 行，勿把 send_run_id IS NULL 的历史行算进 attempted/recent
   * （曾导致监控只显示首封「发送中」、三栏计数不涨）。
   */
  const runScopeSql = `s.send_run_id = ?`;
  const runScopeParams = [campaignId, sendRunId];
  return { runStillSending, runScopeSql, runScopeParams };
}

/** 去重邮箱：SMTP failed/suppressed 或任意 bounced 事件（含 postfix_deferred） */
async function countDistinctDeliveryFailedInRun(
  db: Pool,
  scope: SendRunScope
): Promise<number> {
  const bounceImm = sqlSendRowHasBounceEventImmediate("s");
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(s.to_email))) AS c
       FROM email_sends s
      WHERE s.campaign_id = ? AND ${scope.runScopeSql}
        AND (
          s.status IN ('failed', 'suppressed')
          OR (${bounceImm})
        )`,
    scope.runScopeParams
  );
  return Math.max(0, Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0));
}

function mergeFailedTotals(
  smtpFailed: number,
  suppressed: number,
  bounceFailures: number,
  failedDistinct: number
): number {
  const fromStates = Math.max(0, smtpFailed) + Math.max(0, suppressed) + Math.max(0, bounceFailures);
  return Math.max(fromStates, Math.max(0, failedDistinct));
}

export async function countSendRunProgressMetrics(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<CampaignSendRunProgressMetrics> {
  const scope = await resolveSendRunScope(db, campaignId, sendRunId);
  const stateExpr = sqlPerEmailDeliveryStateExpr("s");
  const [countRows] = await db.query(
    `SELECT
         COUNT(*) AS attempted,
         COALESCE(SUM(CASE WHEN email_state = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
         COALESCE(SUM(CASE WHEN email_state = 'failed' THEN 1 ELSE 0 END), 0) AS smtp_failed,
         COALESCE(SUM(CASE WHEN email_state = 'bounced' THEN 1 ELSE 0 END), 0) AS bounce_failures
       FROM (
         SELECT
           LOWER(TRIM(s.to_email)) AS em,
           ${stateExpr} AS email_state
         FROM email_sends s
         WHERE s.campaign_id = ? AND ${scope.runScopeSql}
         GROUP BY LOWER(TRIM(s.to_email))
       ) per_email`,
    scope.runScopeParams
  );
  const c = (countRows as Array<Record<string, unknown>>)[0] ?? {};
  const sent = Number(c.sent ?? 0);
  const smtpFailed = Number(c.smtp_failed ?? 0);
  const bounceFailures = Number(c.bounce_failures ?? 0);
  const failedDistinct = await countDistinctDeliveryFailedInRun(db, scope);
  return {
    attempted: Number(c.attempted ?? 0),
    sent,
    failed: mergeFailedTotals(smtpFailed, 0, bounceFailures, failedDistinct),
    smtpFailed,
    bounceFailures
  };
}

/**
 * 发送中轮询：轻量 status 聚合 + 独立退信计数（避免 EXISTS 拖死 400ms 轮询）。
 * 返回的 sent 为真实送达（SMTP sent 且已知退信已扣），勿在前端再减 bounceFailures。
 */
export async function countSendRunProgressMetricsLite(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<CampaignSendRunProgressMetrics> {
  /** 无 send_run 时返回 0，避免把历史轮次行算进「已受理」 */
  if (sendRunId <= 0) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      smtpFailed: 0,
      bounceFailures: 0,
      suppressed: 0,
      sendingDistinct: 0
    };
  }
  /** 已受理 = 本轮 send_run 下所有行（含 sending/skipped，与诊断「尝试发送」同轮次口径） */
  const [countRows] = await db.query(
    `SELECT
         COUNT(*) AS total_rows,
         COALESCE(SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
         COALESCE(SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END), 0) AS smtp_failed,
         COALESCE(SUM(CASE WHEN s.status = 'suppressed' THEN 1 ELSE 0 END), 0) AS suppressed,
         COALESCE(SUM(CASE WHEN s.status = 'sending' THEN 1 ELSE 0 END), 0) AS sending_distinct,
         COALESCE(SUM(CASE WHEN s.status NOT IN ('sending') THEN 1 ELSE 0 END), 0) AS processed_count,
        COALESCE(SUM(CASE WHEN s.status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count
       FROM email_sends s
       WHERE s.campaign_id = ? AND s.send_run_id = ?`,
    [campaignId, sendRunId]
  );
  const c = (countRows as Array<Record<string, unknown>>)[0] ?? {};
  const sent = Number(c.sent ?? 0);
  const smtpFailed = Number(c.smtp_failed ?? 0);
  const skippedCount = Number(c.skipped_count ?? 0);
  const suppressed = Number(c.suppressed ?? 0);
  const sendingDistinct = Number(c.sending_distinct ?? 0);
  /** 已受理 = 本轮已投递完成（sent/failed/skipped 等，不含仍在 sending 的行） */
  const attempted = Number(c.processed_count ?? 0);
  const totalRows = Number(c.total_rows ?? 0);
  /**
   * 发送中 lite 轮询（约 250–650ms）：勿每 tick 跑 EXISTS 退信聚合，否则首封前 send-progress 卡顿数秒、
   * 监控表长期「等待中」。退信/postfix 失败数在无在途 sending 时再对账（见 email.ts send-progress）。
   */
  const failedTotal = smtpFailed + suppressed + skippedCount;
  return {
    attempted,
    sent,
    failed: failedTotal,
    smtpFailed,
    bounceFailures: 0,
    suppressed,
    sendingDistinct: Number.isFinite(sendingDistinct) ? sendingDistinct : 0,
    totalRows: Number.isFinite(totalRows) ? totalRows : 0
  };
}

export type CampaignDeliveryFailureCountOpts = {
  /** 追加在 campaign_id 条件之后，如 ` AND s.created_at >= ?` */
  sendRangeClause?: string;
  sendRangeParams?: unknown[];
  /** 发信邮箱筛选，如 ` AND LOWER(TRIM(COALESCE(s.from_email,''))) = ?` */
  fromClause?: string;
  fromParams?: unknown[];
};

/**
 * 营销活动统计 · 7 栏失败计数（锁定口径）：
 * 按活动内去重联系人：SMTP failed/suppressed + 退信（含 postfix_deferred）。
 */
export async function loadCampaignFailCountPostfixPlusSmtp(
  db: Pool,
  campaignId: number
): Promise<number> {
  const { countCampaignFailedContactsDistinct } = await import("./campaignSendFailureCount.js");
  return countCampaignFailedContactsDistinct(db, campaignId);
}

/** 统计页 tab-totals → 7 栏 summaryFailCount */
export async function loadCampaignSummaryFailCountStatsPanel(
  db: Pool,
  campaignId: number,
  panelFailed: number
): Promise<number> {
  const failN = await loadCampaignFailCountPostfixPlusSmtp(db, campaignId);
  return Math.max(panelFailed, failN);
}

/** 7 栏 / stats 托底：与 loadCampaignFailCountPostfixPlusSmtp 同口径 */
export async function loadCampaignSummaryFailCount(db: Pool, campaignId: number): Promise<number> {
  return loadCampaignFailCountPostfixPlusSmtp(db, campaignId);
}

/** @deprecated 名称保留；实现已与 7 栏 / 名单失败 tab 对齐为 contact_id 去重 */
export async function countCampaignDeliveryFailedDistinct(
  db: Pool,
  campaignId: number,
  opts?: CampaignDeliveryFailureCountOpts
): Promise<number> {
  const { countCampaignFailedContactsDistinct } = await import("./campaignSendFailureCount.js");
  return countCampaignFailedContactsDistinct(db, campaignId, {
    sendRangeClause: opts?.sendRangeClause,
    sendRangeParams: opts?.sendRangeParams,
    fromClause: opts?.fromClause,
    fromParams: opts?.fromParams
  });
}

export async function finalizeCampaignSendRun(
  db: Pool,
  sendRunId: number,
  status: EmailCampaignSendRunStatus,
  opts?: { skipMetrics?: boolean }
): Promise<void> {
  if (!sendRunId) return;
  if (opts?.skipMetrics) {
    await db.query(
      `UPDATE email_campaign_send_runs
          SET status = ?,
              ended_at = COALESCE(ended_at, NOW()),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [status, sendRunId]
    );
    return;
  }
  const [rows] = await db.query(
    `SELECT campaign_id FROM email_campaign_send_runs WHERE id = ? LIMIT 1`,
    [sendRunId]
  );
  const campaignId = Number((rows as Array<{ campaign_id?: unknown }>)[0]?.campaign_id ?? 0);
  if (!campaignId) return;
  const metrics = await countSendRunProgressMetrics(db, campaignId, sendRunId);
  const lite = await countSendRunProgressMetricsLite(db, campaignId, sendRunId);
  const { countCampaignFailedContactsDistinct } = await import("./campaignSendFailureCount.js");
  const { invalidateCampaignSendListCache } = await import("./campaignSendContactsCache.js");
  const { invalidateCampaignPanelStatsCache } = await import("./campaignPanelStatsCache.js");
  const contactFail = await countCampaignFailedContactsDistinct(db, campaignId, { sendRunId });
  const failCount = Math.max(
    contactFail,
    Number(lite.smtpFailed ?? 0),
    Number(lite.suppressed ?? 0),
    Number(metrics.failed ?? 0)
  );
  const sentCount = Math.max(0, Number(lite.sent ?? metrics.sent ?? 0));
  await db.query(
    `UPDATE email_campaign_send_runs
        SET status = ?,
            ended_at = COALESCE(ended_at, NOW()),
            success_count = ?,
            fail_count = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [status, sentCount, failCount, sendRunId]
  );
  invalidateCampaignSendListCache(campaignId);
  invalidateCampaignPanelStatsCache(campaignId);
}

export async function finalizeActiveSendRunForCampaign(
  db: Pool,
  campaignId: number,
  status: EmailCampaignSendRunStatus,
  opts?: { skipMetrics?: boolean }
): Promise<void> {
  const [rows] = await db.query(
    `SELECT id FROM email_campaign_send_runs
      WHERE campaign_id = ? AND status = 'sending'
      ORDER BY id DESC LIMIT 1`,
    [campaignId]
  );
  const sendRunId = Number((rows as Array<{ id?: unknown }>)[0]?.id ?? 0);
  if (sendRunId > 0) {
    await finalizeCampaignSendRun(db, sendRunId, status, opts);
  }
}

export async function recoverOrphanSendingRunsOnStartup(db: Pool): Promise<void> {
  const orphanIdleMs = campaignSendOrphanIdleMs();
  const orphanIdleSec = Math.ceil(orphanIdleMs / 1000);
  try {
    const [ret] = await db.query(
      `UPDATE email_campaign_send_runs r
          SET status = 'stopped',
              ended_at = COALESCE(ended_at, NOW()),
              updated_at = CURRENT_TIMESTAMP
        WHERE r.status = 'sending'
          AND r.started_at < DATE_SUB(NOW(), INTERVAL ? SECOND)
          AND NOT EXISTS (
            SELECT 1 FROM email_sends s
             WHERE s.send_run_id = r.id
               AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
          )`,
      [orphanIdleSec, orphanIdleSec]
    );
    const n = Number((ret as { affectedRows?: number })?.affectedRows ?? 0);
    if (n > 0) {
      console.warn("[emailCampaignSendRun] recovered orphan sending run(s) on startup", { n, orphanIdleSec });
    }
  } catch (e) {
    console.warn("[emailCampaignSendRun] orphan run recovery:", (e as Error)?.message);
  }
}

export type StuckSendingCampaignRow = {
  campaignId: number;
  campaignCode: string | null;
  name: string;
  tenantId: number;
  runId: number | null;
  runStartedAt: Date | null;
  runSendRows: number;
  lastSendAt: Date | null;
};

/** backend 重启后内存 map 已空时，须用较长窗口判断真僵尸（默认 30 分钟） */
export function campaignSendOrphanIdleMs(): number {
  return Math.max(60_000, Number(process.env.CAMPAIGN_SEND_ORPHAN_IDLE_MS || 1_800_000));
}

/** 列出 DB 中 status=sending 的活动（供运维脚本 / 定时回收） */
export async function listStuckSendingCampaigns(db: Pool): Promise<StuckSendingCampaignRow[]> {
  try {
    await ensureEmailCampaignSendRunsSchema(db);
  } catch {
    /* 本地库未迁移时仍可用简化查询 */
  }
  try {
    const [rows] = await db.query(
      `SELECT ec.id AS campaign_id,
              ec.campaign_code,
              ec.name,
              ec.tenant_id,
              r.id AS run_id,
              r.started_at AS run_started_at,
              (SELECT COUNT(*) FROM email_sends s WHERE s.campaign_id = ec.id AND s.send_run_id = r.id) AS run_send_rows,
              (SELECT MAX(s.created_at) FROM email_sends s WHERE s.campaign_id = ec.id AND s.send_run_id = r.id) AS last_send_at
         FROM email_campaigns ec
         LEFT JOIN email_campaign_send_runs r ON r.campaign_id = ec.id AND r.status = 'sending'
        WHERE LOWER(COALESCE(ec.status, '')) = 'sending'
        ORDER BY ec.id DESC`
    );
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      campaignId: Number(row.campaign_id ?? 0),
      campaignCode: row.campaign_code != null ? String(row.campaign_code) : null,
      name: String(row.name ?? ""),
      tenantId: Number(row.tenant_id ?? 0),
      runId: row.run_id != null ? Number(row.run_id) : null,
      runStartedAt: row.run_started_at ? new Date(String(row.run_started_at)) : null,
      runSendRows: Number(row.run_send_rows ?? 0),
      lastSendAt: row.last_send_at ? new Date(String(row.last_send_at)) : null
    }));
  } catch (e) {
    const msg = String((e as { sqlMessage?: string; message?: string })?.sqlMessage ?? (e as Error)?.message ?? e);
    if (msg.includes("email_campaign_send_runs") && msg.includes("doesn't exist")) {
      const [rows] = await db.query(
        `SELECT id AS campaign_id, campaign_code, name, tenant_id
           FROM email_campaigns
          WHERE LOWER(COALESCE(status, '')) = 'sending'
          ORDER BY id DESC`
      );
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        campaignId: Number(row.campaign_id ?? 0),
        campaignCode: row.campaign_code != null ? String(row.campaign_code) : null,
        name: String(row.name ?? ""),
        tenantId: Number(row.tenant_id ?? 0),
        runId: null,
        runStartedAt: null,
        runSendRows: 0,
        lastSendAt: null
      }));
    }
    throw e;
  }
}

async function resolveRecoverFinalStatusForCampaign(
  db: Pool,
  campaignId: number
): Promise<"paused" | "stopped" | "completed"> {
  const [rows] = await db.query(
    `SELECT status FROM email_campaign_send_runs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`,
    [campaignId]
  );
  const rs = String((rows as Array<{ status?: unknown }>)[0]?.status ?? "").trim().toLowerCase();
  if (rs === "completed") return "completed";
  if (rs === "stopped") return "stopped";
  return "paused";
}

/** 强制解除活动 sending 占用（停止轮次 + 写回 paused/stopped/completed） */
export async function forceStopStuckCampaignSending(
  db: Pool,
  campaignId: number,
  opts?: { finalStatus?: "paused" | "stopped" | "completed" }
): Promise<{ ok: boolean; message: string }> {
  const id = Math.floor(Number(campaignId) || 0);
  if (id <= 0) return { ok: false, message: "无效的活动 ID" };

  const [rows] = await db.query(
    `SELECT id, status, campaign_code, name FROM email_campaigns WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = (rows as Array<{ id?: unknown; status?: unknown; campaign_code?: unknown; name?: unknown }>)[0];
  if (!row) return { ok: false, message: `未找到活动 id=${id}` };

  const statusNow = String(row.status ?? "").toLowerCase();
  if (statusNow !== "sending") {
    return {
      ok: true,
      message: `活动 ${row.campaign_code ?? id}（${String(row.name ?? "")}）当前状态为 ${statusNow || "未知"}，无需解除。`
    };
  }

  const finalStatus =
    opts?.finalStatus === "stopped"
      ? "stopped"
      : opts?.finalStatus === "completed"
        ? "completed"
        : "paused";
  await finalizeActiveSendRunForCampaign(
    db,
    id,
    finalStatus === "completed" ? "completed" : "stopped"
  );
  await db.query(
    `UPDATE email_campaigns SET status = ?, next_run_at = NULL WHERE id = ? AND LOWER(COALESCE(status, '')) = 'sending'`,
    [finalStatus, id]
  );
  return {
    ok: true,
    message: `已解除活动 ${row.campaign_code ?? id}（${String(row.name ?? "")}）的 sending 占用 → ${finalStatus}。`
  };
}

/**
 * 回收僵尸 sending：DB 为 sending，但本进程无活跃 send 循环，或轮次长时间无进展。
 * activeCampaignIds：当前 Node 进程内 executeCampaignSend 仍在跑的活动 ID（可传 resolveActiveSendCampaignIds()）。
 */
export async function recoverStaleSendingCampaigns(
  db: Pool,
  activeCampaignIds: ReadonlySet<number>,
  opts?: { tenantId?: number }
): Promise<number[]> {
  /**
   * 产品口径（独立站）：一场发送只应在「全部发完」或用户点「停止」时结束。
   * 单封失败只计失败、继续下一封。默认关闭定时 auto-pause（曾误杀首封慢 / 三专线 poll）。
   * 若运维需回收真僵尸占用，可设 CAMPAIGN_SEND_ALLOW_SCHEDULER_RECOVER=1。
   */
  if (process.env.CAMPAIGN_SEND_ALLOW_SCHEDULER_RECOVER !== "1") {
    return [];
  }

  const graceMs = Math.max(20_000, Number(process.env.CAMPAIGN_SEND_STALE_GRACE_MS || 45_000));
  const staleRunMs = Math.max(90_000, Number(process.env.CAMPAIGN_SEND_STALE_RUN_MS || 300_000));
  const idleProgressMs = Math.max(45_000, Number(process.env.CAMPAIGN_SEND_IDLE_PROGRESS_MS || 90_000));
  const orphanIdleMs = campaignSendOrphanIdleMs();
  const tenantFilter = Math.floor(Number(opts?.tenantId) || 0);
  const prepGraceMs = Math.max(
    180_000,
    Number(process.env.CAMPAIGN_SEND_PREP_GRACE_MS || 300_000)
  );
  const now = Date.now();
  const stuck = await listStuckSendingCampaigns(db);
  const recovered: number[] = [];

  for (const row of stuck) {
    const campaignId = row.campaignId;
    if (campaignId <= 0) continue;
    if (tenantFilter > 0 && row.tenantId !== tenantFilter) continue;

    /**
     * 首封写入前（runSendRows=0）：准备受众/SMTP 可能需数分钟。
     * 必须按 DB 轮次开始时间保护，不能依赖本进程内存 map（多 worker / 刷新专线列表会误判）。
     */
    if (row.runSendRows <= 0 && row.runStartedAt) {
      const prepAgeMs = now - row.runStartedAt.getTime();
      if (prepAgeMs >= 0 && prepAgeMs < prepGraceMs) {
        continue;
      }
    }

    const inProcess = activeCampaignIds.has(campaignId);
    const anchorMs =
      row.runStartedAt?.getTime() ??
      row.lastSendAt?.getTime() ??
      0;
    const ageMs = anchorMs > 0 ? now - anchorMs : graceMs + 1;
    const lastActivityMs = row.lastSendAt?.getTime() ?? (anchorMs > 0 ? anchorMs : 0);
    const idleMs = lastActivityMs > 0 ? now - lastActivityMs : ageMs;

    /** 任意路径：近期仍有发信 → 不回收（backend 重启后 scheduler 勿用 30s/90s 误杀） */
    if (row.lastSendAt != null && idleMs < orphanIdleMs) {
      continue;
    }
    if (row.runSendRows > 0 && row.lastSendAt == null && row.runStartedAt) {
      const runAgeMs = now - row.runStartedAt.getTime();
      if (runAgeMs >= 0 && runAgeMs < orphanIdleMs) continue;
    }

    if (inProcess) {
      /** 进程内仍在跑 executeCampaignSend 但尚未写入首封：准备受众/SMTP 可能需数分钟，禁止误回收 */
      if (row.runSendRows <= 0 || row.lastSendAt == null) {
        continue;
      }
      /** 内存 map 有 id 但长期无进展：仍须超过 orphan 窗口（勿 30s 误杀慢 SMTP） */
      if (idleMs < orphanIdleMs) continue;
      if (idleMs < idleProgressMs && ageMs < staleRunMs) continue;
    } else if (row.runSendRows <= 0 && row.runStartedAt) {
      /** 非本进程但仍在首封准备宽限内：上面 prepGraceMs 已处理，此处双保险 */
      continue;
    } else {
      /** 本进程无活跃循环且已过准备宽限：解除僵尸 sending 占用 */
      const freshRunMs = row.runStartedAt ? now - row.runStartedAt.getTime() : Number.POSITIVE_INFINITY;
      if (freshRunMs < prepGraceMs) continue;
    }

    const result = await forceStopStuckCampaignSending(db, campaignId, { finalStatus: "paused" });
    if (result.ok) {
      recovered.push(campaignId);
      console.warn("[emailCampaignSendRun] recovered stale sending campaign", {
        campaignId,
        campaignCode: row.campaignCode,
        inProcess,
        ageMs,
        idleMs,
        runSendRows: row.runSendRows
      });
    }
  }
  return recovered;
}

/** 活动仍为 sending，但已无 status=sending 的 send_run（轮次已结束而活动状态未写回） */
export async function reconcileCampaignsWithoutActiveSendRun(
  db: Pool,
  tenantId?: number
): Promise<number[]> {
  const tid = Math.floor(Number(tenantId) || 0);
  const orphanIdleSec = Math.ceil(campaignSendOrphanIdleMs() / 1000);
  const params: unknown[] = [orphanIdleSec];
  let tenantClause = "";
  if (tid > 0) {
    tenantClause = " AND ec.tenant_id = ?";
    params.push(tid);
  }
  const [rows] = await db.query(
    `SELECT ec.id
       FROM email_campaigns ec
      WHERE LOWER(COALESCE(ec.status, '')) = 'sending'
        AND NOT EXISTS (
          SELECT 1 FROM email_campaign_send_runs r
           WHERE r.campaign_id = ec.id AND r.status = 'sending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM email_campaign_send_runs r2
           WHERE r2.campaign_id = ec.id
             AND r2.started_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND)
        )
        AND NOT EXISTS (
          SELECT 1 FROM email_sends s
           WHERE s.campaign_id = ec.id
             AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
        )
        ${tenantClause}`,
    params
  );
  const activeIds = resolveActiveSendCampaignIds();
  const recovered: number[] = [];
  for (const row of rows as Array<{ id?: unknown }>) {
    const id = Number(row.id ?? 0);
    if (id <= 0 || activeIds.has(id)) continue;
    const finalStatus = await resolveRecoverFinalStatusForCampaign(db, id);
    const result = await forceStopStuckCampaignSending(db, id, { finalStatus });
    if (result.ok) recovered.push(id);
  }
  return recovered;
}

/** 专线发信 / 工作台拉取前：回收该租户僵尸 sending，避免「X 域发送中」长期占位 */
export async function recoverStaleSendingCampaignsForTenant(
  db: Pool,
  tenantId: number,
  opts?: { skipRecover?: boolean; skipReconcile?: boolean }
): Promise<number[]> {
  const tid = Math.floor(Number(tenantId) || 0);
  if (tid <= 0) return [];
  try {
    await pruneActiveSendMemoryHook?.(db);
  } catch {
    /* ignore */
  }
  /** 默认禁止 reconcile（须 CAMPAIGN_SEND_ALLOW_SCHEDULER_RECOVER=1）；拉列表/停一线等显式 skipReconcile */
  const allowTenantReconcile =
    !opts?.skipReconcile && process.env.CAMPAIGN_SEND_ALLOW_SCHEDULER_RECOVER === "1";
  const fromRuns = allowTenantReconcile
    ? await reconcileCampaignsWithoutActiveSendRun(db, tid)
    : [];
  if (opts?.skipRecover) {
    return fromRuns;
  }
  const activeIds = resolveActiveSendCampaignIds();
  const fromStale = await recoverStaleSendingCampaigns(db, activeIds, { tenantId: tid });
  return [...new Set([...fromRuns, ...fromStale])];
}

/** 进程启动：仅回收长时间无进展的孤儿 sending（勿在重启瞬间误杀正在大批量发送的活动） */
export async function recoverOrphanSendingCampaignsOnStartup(db: Pool): Promise<void> {
  const orphanIdleMs = campaignSendOrphanIdleMs();
  try {
    const stuck = await listStuckSendingCampaigns(db);
    let recovered = 0;
    const now = Date.now();
    for (const row of stuck) {
      const lastMs = row.lastSendAt?.getTime() ?? row.runStartedAt?.getTime() ?? 0;
      const idleMs = lastMs > 0 ? now - lastMs : orphanIdleMs + 1;
      if (idleMs < orphanIdleMs) {
        console.warn("[emailCampaignSendRun] skip orphan campaign on startup (recent send activity)", {
          campaignId: row.campaignId,
          idleMs,
          orphanIdleMs
        });
        continue;
      }
      const result = await forceStopStuckCampaignSending(db, row.campaignId, { finalStatus: "paused" });
      if (result.ok) recovered += 1;
    }
    if (recovered > 0) {
      console.warn("[emailCampaignSendRun] recovered orphan sending campaign(s) on startup", {
        recovered,
        orphanIdleMs
      });
    }
  } catch (e) {
    console.error("[emailCampaignSendRun] orphan sending recovery failed:", e);
  }
}

export type CampaignSendRunListItem = {
  id: number;
  round_no: number;
  status: string;
  trigger_source: string | null;
  lane_index: number | null;
  planned_count: number;
  success_count: number;
  fail_count: number;
  started_at: string | null;
  ended_at: string | null;
};

export type LaneLastFormalSend = {
  campaignId: number;
  campaignCode: string | null;
  name: string;
  industries: string[];
  plannedCount: number;
  successCount: number;
  failCount: number;
  startedAt: string | null;
  endedAt: string | null;
  stopped: boolean;
};

function parseSendRunIndustriesJson(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** 专线栏：最近一次已结束的正式发送（按 ended_at 降序） */
export async function loadLastFormalSendForLane(
  db: Pool,
  tenantId: number,
  laneIndex: number
): Promise<LaneLastFormalSend | null> {
  if (tenantId <= 0 || laneIndex <= 0) return null;
  try {
    await ensureEmailCampaignSendRunsSchema(db);
  } catch {
    return null;
  }
  try {
    const [rows] = await db.query(
      `SELECT r.campaign_id, c.campaign_code, c.name, r.target_industries_json,
              r.planned_count, r.success_count, r.fail_count, r.started_at, r.ended_at, r.status
         FROM email_campaign_send_runs r
         INNER JOIN email_campaigns c ON c.id = r.campaign_id AND c.tenant_id = r.tenant_id
        WHERE r.tenant_id = ? AND r.lane_index = ?
          AND r.status IN ('completed', 'stopped')
        ORDER BY COALESCE(r.ended_at, r.started_at) DESC, r.id DESC
        LIMIT 1`,
      [tenantId, laneIndex]
    );
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) return null;
    const campaignId = Number(row.campaign_id ?? 0);
    if (!campaignId) return null;
    const status = String(row.status ?? "").toLowerCase();
    return {
      campaignId,
      campaignCode: row.campaign_code != null ? String(row.campaign_code) : null,
      name: String(row.name ?? "").trim() || "未命名活动",
      industries: parseSendRunIndustriesJson(row.target_industries_json),
      plannedCount: Math.max(0, Number(row.planned_count ?? 0)),
      successCount: Math.max(0, Number(row.success_count ?? 0)),
      failCount: Math.max(0, Number(row.fail_count ?? 0)),
      startedAt: row.started_at != null ? String(row.started_at) : null,
      endedAt: row.ended_at != null ? String(row.ended_at) : null,
      stopped: status === "stopped"
    };
  } catch {
    return null;
  }
}

export async function listCampaignSendRuns(db: Pool, campaignId: number): Promise<CampaignSendRunListItem[]> {
  await ensureEmailCampaignSendRunsSchema(db);
  const [rows] = await db.query(
    `SELECT id, round_no, status, trigger_source, lane_index,
            planned_count, success_count, fail_count, started_at, ended_at
       FROM email_campaign_send_runs
      WHERE campaign_id = ?
      ORDER BY round_no DESC, id DESC`,
    [campaignId]
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id ?? 0),
    round_no: Math.max(0, Number(row.round_no ?? 0)),
    status: String(row.status ?? ""),
    trigger_source: row.trigger_source != null ? String(row.trigger_source) : null,
    lane_index:
      row.lane_index != null && Number.isFinite(Number(row.lane_index)) ? Number(row.lane_index) : null,
    planned_count: Math.max(0, Number(row.planned_count ?? 0)),
    success_count: Math.max(0, Number(row.success_count ?? 0)),
    fail_count: Math.max(0, Number(row.fail_count ?? 0)),
    started_at: row.started_at != null ? String(row.started_at) : null,
    ended_at: row.ended_at != null ? String(row.ended_at) : null
  }));
}

export async function resolveCampaignSendRunId(
  db: Pool,
  campaignId: number,
  opts: { sendRunId?: number; roundNo?: number }
): Promise<{ sendRunId: number; roundNo: number } | null> {
  await ensureEmailCampaignSendRunsSchema(db);
  const byId = Math.floor(Number(opts.sendRunId) || 0);
  if (byId > 0) {
    const [rows] = await db.query(
      `SELECT id, round_no FROM email_campaign_send_runs WHERE id = ? AND campaign_id = ? LIMIT 1`,
      [byId, campaignId]
    );
    const row = (rows as Array<{ id?: unknown; round_no?: unknown }>)[0];
    if (!row) return null;
    return { sendRunId: Number(row.id), roundNo: Math.max(0, Number(row.round_no ?? 0)) };
  }
  const roundNo = Math.floor(Number(opts.roundNo) || 0);
  if (roundNo > 0) {
    const [rows] = await db.query(
      `SELECT id, round_no FROM email_campaign_send_runs
        WHERE campaign_id = ? AND round_no = ?
        ORDER BY id DESC LIMIT 1`,
      [campaignId, roundNo]
    );
    const row = (rows as Array<{ id?: unknown; round_no?: unknown }>)[0];
    if (!row) return null;
    return { sendRunId: Number(row.id), roundNo: Math.max(0, Number(row.round_no ?? 0)) };
  }
  const [latestRows] = await db.query(
    `SELECT id, round_no FROM email_campaign_send_runs
      WHERE campaign_id = ?
      ORDER BY round_no DESC, id DESC
      LIMIT 1`,
    [campaignId]
  );
  const latest = (latestRows as Array<{ id?: unknown; round_no?: unknown }>)[0];
  if (!latest) return null;
  const sendRunId = Number(latest.id ?? 0);
  if (!sendRunId) return null;
  return { sendRunId, roundNo: Math.max(0, Number(latest.round_no ?? 0)) };
}

export async function loadLatestRoundNoByCampaignIds(
  db: Pool,
  campaignIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = campaignIds.filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return map;
  const ph = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT campaign_id, MAX(round_no) AS latest_round_no
       FROM email_campaign_send_runs
      WHERE campaign_id IN (${ph})
      GROUP BY campaign_id`,
    ids
  );
  for (const row of rows as Array<{ campaign_id?: unknown; latest_round_no?: unknown }>) {
    const cid = Number(row.campaign_id ?? 0);
    const round = Math.max(0, Number(row.latest_round_no ?? 0));
    if (cid > 0 && round > 0) map.set(cid, round);
  }
  return map;
}

export async function resolveCampaignProgressSendRunId(
  db: Pool,
  campaignId: number,
  opts?: { clientSendRunId?: number; memoryRunId?: number }
): Promise<number> {
  /** 活动仍在 sending 时，始终以 DB 中 status=sending 的轮次为准，避免前端误传旧 sendRunId 导致监控 0% */
  const active = await getActiveSendRunRow(db, campaignId);
  if (active?.id) return active.id;

  const memId = Math.max(0, Math.floor(Number(opts?.memoryRunId) || 0));
  if (memId > 0) {
    const [rows] = await db.query(
      `SELECT id FROM email_campaign_send_runs WHERE id = ? AND campaign_id = ? AND status = 'sending' LIMIT 1`,
      [memId, campaignId]
    );
    if ((rows as Array<{ id?: unknown }>)[0]?.id) return memId;
  }

  const clientId = Math.max(0, Math.floor(Number(opts?.clientSendRunId) || 0));
  if (clientId > 0) {
    const [rows] = await db.query(
      `SELECT id FROM email_campaign_send_runs WHERE id = ? AND campaign_id = ? AND status = 'sending' LIMIT 1`,
      [clientId, campaignId]
    );
    if ((rows as Array<{ id?: unknown }>)[0]?.id) return clientId;
  }

  return 0;
}

/** 活动已结束、无 sending 轮次时：hydrate/绿框仍须按「最近一轮 send_run」口径，勿回落全活动累计 */
export async function resolveLatestSendRunIdForCampaign(db: Pool, campaignId: number): Promise<number> {
  const [rows] = await db.query(
    `SELECT id FROM email_campaign_send_runs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`,
    [campaignId]
  );
  return Math.max(0, Number((rows as Array<{ id?: unknown }>)[0]?.id ?? 0));
}

export async function getActiveSendRunRow(
  db: Pool,
  campaignId: number
): Promise<{ id: number; round_no: number; planned_count: number } | null> {
  const [rows] = await db.query(
    `SELECT id, round_no, planned_count
       FROM email_campaign_send_runs
      WHERE campaign_id = ? AND status = 'sending'
      ORDER BY id DESC
      LIMIT 1`,
    [campaignId]
  );
  const row = (rows as Array<{ id?: unknown; round_no?: unknown; planned_count?: unknown }>)[0];
  if (!row) return null;
  const id = Number(row.id ?? 0);
  if (!id) return null;
  return {
    id,
    round_no: Math.max(0, Number(row.round_no ?? 0)),
    planned_count: Math.max(0, Number(row.planned_count ?? 0))
  };
}

/** 本轮是否已触及计划上限（含末封仍在 sending 的 24+1=25） */
export function sendRunReachedPlanned(
  metrics: { attempted: number; sendingDistinct?: number },
  planned: number
): boolean {
  const p = Math.max(0, Math.floor(Number(planned) || 0));
  if (p <= 0) return false;
  const attempted = Math.max(0, Math.floor(Number(metrics.attempted) || 0));
  const sending = Math.max(0, Math.floor(Number(metrics.sendingDistinct) || 0));
  return attempted >= p || attempted + sending >= p;
}

/** 无在途且尝试数已满计划：末封与其它封同一口径，不靠 endgame 提前收尾 */
export function sendRunDeliveryComplete(
  metrics: { attempted: number; sendingDistinct?: number; totalRows?: number },
  planned: number
): boolean {
  const sending = Math.max(0, Math.floor(Number(metrics.sendingDistinct) || 0));
  if (sending > 0) return false;
  const p = Math.max(0, Math.floor(Number(planned) || 0));
  const attempted = Math.max(0, Math.floor(Number(metrics.attempted) || 0));
  const totalRows = Math.max(0, Math.floor(Number(metrics.totalRows) || 0));
  if (p <= 0) return attempted > 0 || totalRows > 0;
  return attempted >= p || (totalRows >= p && totalRows > 0);
}

/**
 * 本轮尝试数已满但仍剩 sending：worker 已走完或末封挂起，立即标失败以便 send-progress 收尾。
 * 勿在发送中途调用（仅 attempted ≥ planned 时由 send-progress 触发）。
 */
/** 本轮 send_run 内最「新」的一封 sending 已停留秒数（无则 -1） */
export async function youngestSendingRowAgeSec(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<number> {
  const runId = Math.floor(Number(sendRunId) || 0);
  if (runId <= 0) return -1;
  const [rows] = await db.query(
    `SELECT MIN(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS age_sec
       FROM email_sends
      WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
    [campaignId, runId]
  );
  const age = Number((rows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? -1);
  return Number.isFinite(age) && age >= 0 ? Math.floor(age) : -1;
}

/**
 * 末封兜底：仅 SMTP 长期无响应、行卡在 sending 时标失败。
 * 正常发完不经过此函数——worker sendMail 返回即 UPDATE sent/failed。
 */
export async function reconcileTailSendingForSendProgress(
  db: Pool,
  campaignId: number,
  sendRunId: number,
  maxWaitSec = 15
): Promise<{ tailEndgameApplied: boolean; affected: number }> {
  const waitSec = Math.max(5, Math.floor(Number(maxWaitSec) || 15));
  let affected = 0;
  try {
    affected += await reconcileStaleSendingEmailRows(db, campaignId, {
      sendRunId,
      staleSec: waitSec,
      minStaleSec: Math.max(5, waitSec - 1)
    });
  } catch {
    /* ignore */
  }
  const [afterStale] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(to_email))) AS n
       FROM email_sends
      WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
    [campaignId, sendRunId]
  );
  const sendingLeft = Math.max(0, Number((afterStale as Array<{ n?: unknown }>)[0]?.n ?? 0));
  if (sendingLeft <= 0) {
    return { tailEndgameApplied: affected > 0, affected };
  }
  /** 流水线仍有多封在途（>1）：只做 stale 对账，禁止 endgame 批量标失败 */
  if (sendingLeft > 1) {
    return { tailEndgameApplied: false, affected };
  }
  const [oldestRows] = await db.query(
    `SELECT COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, NOW())), 0) AS age_sec
       FROM email_sends
      WHERE campaign_id = ? AND send_run_id = ? AND status = 'sending'`,
    [campaignId, sendRunId]
  );
  const ageSec = Math.max(0, Number((oldestRows as Array<{ age_sec?: unknown }>)[0]?.age_sec ?? 0));
  if (ageSec >= waitSec) {
    try {
      affected += await reconcileEndgameSendingEmailRows(db, campaignId, sendRunId);
      return { tailEndgameApplied: true, affected };
    } catch {
      return { tailEndgameApplied: false, affected };
    }
  }
  return { tailEndgameApplied: false, affected };
}

export async function reconcileEndgameSendingEmailRows(
  db: Pool,
  campaignId: number,
  sendRunId: number
): Promise<number> {
  const runId = Math.floor(Number(sendRunId) || 0);
  if (runId <= 0) return 0;
  const [result] = await db.query(
    `UPDATE email_sends
        SET status = 'failed',
            error = COALESCE(
              NULLIF(TRIM(error), ''),
              '末封未在时限内确认送达，已自动结束（请检查发信服务器或重试该邮箱）'
            )
      WHERE campaign_id = ?
        AND send_run_id = ?
        AND status = 'sending'`,
    [campaignId, runId]
  );
  return Math.max(0, Number((result as { affectedRows?: unknown }).affectedRows ?? 0));
}

/** 发送中：DB 行 status=sending 超过此时长标 failed 并继续下一封（与 SMTP sendMail 超时一致，默认 6s） */
export const CAMPAIGN_SENDING_ROW_STALE_SEC = 6;

export function campaignSendingRowStaleReconcileSec(): { minStaleSec: number; staleSec: number } {
  const minStaleSec = CAMPAIGN_SENDING_ROW_STALE_SEC;
  return { minStaleSec, staleSec: minStaleSec + 1 };
}

/** 长时间停在 sending 的单封自动标失败，避免实时监控卡死 */
export async function reconcileStaleSendingEmailRows(
  db: Pool,
  campaignId: number,
  opts?: { sendRunId?: number; staleSec?: number; minStaleSec?: number }
): Promise<number> {
  const rowStale = campaignSendingRowStaleReconcileSec();
  const floor = Math.max(
    CAMPAIGN_SENDING_ROW_STALE_SEC,
    Math.floor(Number(opts?.minStaleSec ?? rowStale.minStaleSec))
  );
  const staleSec = Math.max(floor, Math.floor(Number(opts?.staleSec ?? rowStale.staleSec)));
  const sendRunId = opts?.sendRunId != null && opts.sendRunId > 0 ? Math.floor(opts.sendRunId) : 0;
  const runSql = sendRunId > 0 ? " AND send_run_id = ?" : "";
  const params: unknown[] = [campaignId, staleSec];
  if (sendRunId > 0) params.push(sendRunId);
  const [result] = await db.query(
    `UPDATE email_sends
        SET status = 'failed',
            error = COALESCE(
              NULLIF(TRIM(error), ''),
              'SMTP 发送超时或未收到服务器响应（超过约 6 秒仍在发送中，已标失败并继续下一封）'
            )
      WHERE campaign_id = ?
        AND status = 'sending'
        AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)${runSql}`,
    params
  );
  return Math.max(0, Number((result as { affectedRows?: unknown }).affectedRows ?? 0));
}
