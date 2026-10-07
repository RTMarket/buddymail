import type { Pool, RowDataPacket } from "mysql2/promise";
import { loadTenantEmailRangeStats } from "./emailTenantRangeStats.js";
import { runAgentBrainChat } from "./aiChat.js";
import { getAgentBrainCredentials } from "./aiChat.js";

export type DailyOutreachFacts = {
  runDate: string;
  crmTag: string;
  companiesSearched: number;
  countries: string[];
  emailsChecked: number;
  emailsValid: number;
  sendNote: string;
  lettersPlanned?: number;
  lettersSent?: number;
  lettersFailed?: number;
  status?: string;
};

export type DailyReportView = {
  runDate: string;
  companiesSearched: number;
  countries: string[];
  emailsChecked: number;
  emailsValid: number;
  sendNote: string;
  lettersPlanned: number;
  lettersSent: number;
  lettersFailed: number;
  status: string;
  summary: string;
  updatedAt: string | null;
};

const DEV_FROM = process.env.DAILY_REPORT_FROM || "noreply@example.com";

function factsText(f: DailyOutreachFacts, lettersPlanned: number, lettersSent: number, lettersFailed: number): string {
  const countries = f.countries.length ? f.countries.join("、") : "未记录";
  return [
    `日期 ${f.runDate}。`,
    `搜索企业 ${f.companiesSearched} 家，国家：${countries}。`,
    `搜索时的邮箱不能直接拿来发。已用 SMTP 逐个验证，检查 ${f.emailsChecked} 个，有效 ${f.emailsValid} 个，并写入 CRM，行业标签 ${f.crmTag}。`,
    `邮件营销：${f.sendNote || "未安排"}。`,
    `个性化开发信从日常邮箱第 1 个 ${DEV_FROM} 发送，当天上限 300 封。计划 ${lettersPlanned}，已发出 ${lettersSent}，失败 ${lettersFailed}。`
  ].join("\n");
}

async function ensureReportTable(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_finder_daily_reports (
      tenant_id INT NOT NULL,
      run_date DATE NOT NULL,
      companies_searched INT NOT NULL DEFAULT 0,
      countries VARCHAR(255) NOT NULL DEFAULT '',
      emails_checked INT NOT NULL DEFAULT 0,
      emails_valid INT NOT NULL DEFAULT 0,
      send_note VARCHAR(512) NULL,
      letters_planned INT NOT NULL DEFAULT 0,
      letters_sent INT NOT NULL DEFAULT 0,
      letters_failed INT NOT NULL DEFAULT 0,
      summary_md MEDIUMTEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'ready',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, run_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function polishSummary(db: Pool, tenantId: number, plain: string): Promise<string> {
  const creds = await getAgentBrainCredentials(db, tenantId).catch(() => null);
  if (!creds) return plain;
  try {
    const raw = await runAgentBrainChat({
      creds,
      systemPrompt:
        "你是独立站获客日报助手。把用户给的数字写成一段中文日报，放在对话框里。必须保留全部数字和国家，不要编造。不要 markdown 标题。",
      messages: [{ role: "user", content: plain }],
      maxTokens: 700
    });
    const text = raw.trim();
    return text || plain;
  } catch {
    return plain;
  }
}

export async function publishDailyOutreachReport(db: Pool, tenantId: number, facts: DailyOutreachFacts): Promise<void> {
  await ensureReportTable(db);
  const planned = Math.max(0, Math.floor(facts.lettersPlanned ?? 0));
  const sent = Math.max(0, Math.floor(facts.lettersSent ?? 0));
  const failed = Math.max(0, Math.floor(facts.lettersFailed ?? 0));
  const plain = factsText(facts, planned, sent, failed);
  const summary = await polishSummary(db, tenantId, plain);
  const status = facts.status || (planned > sent + failed ? "letters" : "done");
  await db.query(
    `INSERT INTO lead_finder_daily_reports
      (tenant_id, run_date, companies_searched, countries, emails_checked, emails_valid, send_note,
       letters_planned, letters_sent, letters_failed, summary_md, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       companies_searched = VALUES(companies_searched),
       countries = VALUES(countries),
       emails_checked = VALUES(emails_checked),
       emails_valid = VALUES(emails_valid),
       send_note = VALUES(send_note),
       letters_planned = VALUES(letters_planned),
       letters_sent = VALUES(letters_sent),
       letters_failed = VALUES(letters_failed),
       summary_md = VALUES(summary_md),
       status = VALUES(status)`,
    [
      tenantId,
      facts.runDate,
      facts.companiesSearched,
      facts.countries.join(",").slice(0, 255),
      facts.emailsChecked,
      facts.emailsValid,
      facts.sendNote.slice(0, 512),
      planned,
      sent,
      failed,
      summary,
      status
    ]
  );
}

export async function patchDailyLetterProgress(
  db: Pool,
  tenantId: number,
  runDate: string,
  patch: { lettersPlanned: number; lettersSent: number; lettersFailed: number; status: string }
): Promise<void> {
  await ensureReportTable(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT companies_searched, countries, emails_checked, emails_valid, send_note
       FROM lead_finder_daily_reports WHERE tenant_id=? AND run_date=? LIMIT 1`,
    [tenantId, runDate]
  );
  const row = rows[0];
  if (!row) return;
  const countries = String(row.countries || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const facts: DailyOutreachFacts = {
    runDate,
    crmTag: runDate,
    companiesSearched: Number(row.companies_searched) || 0,
    countries,
    emailsChecked: Number(row.emails_checked) || 0,
    emailsValid: Number(row.emails_valid) || 0,
    sendNote: String(row.send_note || ""),
    lettersPlanned: patch.lettersPlanned,
    lettersSent: patch.lettersSent,
    lettersFailed: patch.lettersFailed,
    status: patch.status
  };
  const plain = factsText(facts, patch.lettersPlanned, patch.lettersSent, patch.lettersFailed);
  const summary = patch.status === "done" ? await polishSummary(db, tenantId, plain) : plain;
  await db.query(
    `UPDATE lead_finder_daily_reports
        SET letters_planned=?, letters_sent=?, letters_failed=?, summary_md=?, status=?
      WHERE tenant_id=? AND run_date=?`,
    [patch.lettersPlanned, patch.lettersSent, patch.lettersFailed, summary, patch.status, tenantId, runDate]
  );
}

export async function loadDailyReport(db: Pool, tenantId: number, runDate: string): Promise<DailyReportView | null> {
  await ensureReportTable(db);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM lead_finder_daily_reports WHERE tenant_id=? AND run_date=? LIMIT 1`,
    [tenantId, runDate]
  );
  const row = rows[0];
  if (!row) return null;
  const countries = String(row.countries || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    runDate,
    companiesSearched: Number(row.companies_searched) || 0,
    countries,
    emailsChecked: Number(row.emails_checked) || 0,
    emailsValid: Number(row.emails_valid) || 0,
    sendNote: String(row.send_note || ""),
    lettersPlanned: Number(row.letters_planned) || 0,
    lettersSent: Number(row.letters_sent) || 0,
    lettersFailed: Number(row.letters_failed) || 0,
    status: String(row.status || "done"),
    summary: String(row.summary_md || ""),
    updatedAt: row.updated_at ? String(row.updated_at) : null
  };
}

export async function todayCampaignStats(db: Pool, tenantId: number, runDate: string): Promise<{
  text: string;
  stats: {
    delivered: number;
    failed: number;
    opened: number;
    subscribe: number;
    unsubscribe: number;
    complaint: number;
  } | null;
}> {
  const sendStats = await loadTenantEmailRangeStats(db, tenantId, runDate, runDate, runDate, true).catch(() => null);
  if (!sendStats) return { text: "邮件营销活动统计暂时读不到。", stats: null };
  const failed = Math.max(0, sendStats.totalSendAttempts - sendStats.deliveredCount);
  const stats = {
    delivered: sendStats.deliveredCount,
    failed,
    opened: sendStats.openedCount,
    subscribe: sendStats.subscribeCount,
    unsubscribe: sendStats.unsubscribeCount,
    complaint: sendStats.complaintCount
  };
  const text = [
    "邮件营销活动统计（今天，与营销活动统计同一口径）：",
    `发送成功 ${stats.delivered}`,
    `发送失败 ${stats.failed}`,
    `打开/已读 ${stats.opened}`,
    `订阅 ${stats.subscribe}`,
    `退订 ${stats.unsubscribe}`,
    `投诉 ${stats.complaint}`
  ].join("\n");
  return { text, stats };
}

export function shanghaiToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
