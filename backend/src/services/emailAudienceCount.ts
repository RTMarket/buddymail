import type { Pool } from "mysql2/promise";

/**
 * 营销群发「可发受众」计数口径（与 executeCampaignSend 筛选一致）：
 * - active + 非空邮箱
 * - 租户内
 * - 行业 / 分组 / 业务线（有行业时不叠业务线，与发送循环相同）
 * - 排除退订与 complaint
 * - COUNT(DISTINCT LOWER(TRIM(email))) 去重邮箱
 *
 * 仅用于预览人数、行业标签旁数字、发送前进度校准；不改动 email_sends 与统计页汇总逻辑。
 */

export type EmailAudienceCountOpts = {
  tenantId: number;
  groupIds?: number[];
  industries?: string[];
  businessLine?: string | null;
  /** 默认 true：与 executeCampaignSend 一致（选了行业则不叠 business_line） */
  sendPipelineMatch?: boolean;
};

export type EmailAudienceCountExtra = {
  /** 断点续发：排除本活动已写入 email_sends 的邮箱（仅发送队列/校准用） */
  campaignIdForResume?: number;
  /** 上限（发送 batch limit） */
  cap?: number;
};

/** 租户维度退订 / 投诉过滤（与 routes/email.ts 原实现一致） */
export function appendTenantMarketingOptOutFilters(
  whereParts: string[],
  params: unknown[],
  contactAlias: string,
  tenantId: number
): void {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;
  const c = contactAlias;
  whereParts.push(
    `NOT EXISTS (
      SELECT 1 FROM email_unsubscribe_events u
      LEFT JOIN email_campaigns uc ON uc.id = u.campaign_id
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(${c}.email))
        AND (u.tenant_id = ? OR uc.tenant_id = ?)
    )`,
    `NOT EXISTS (
      SELECT 1 FROM email_delivery_events e
      LEFT JOIN email_campaigns ec ON ec.id = e.campaign_id
      WHERE e.event_type = 'complaint'
        AND LOWER(TRIM(e.email)) = LOWER(TRIM(${c}.email))
        AND (e.tenant_id = ? OR ec.tenant_id = ?)
    )`
  );
  params.push(tenantId, tenantId, tenantId, tenantId);
}

function normalizeIndustries(industries?: string[] | null): string[] {
  return (industries ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
}

function normalizeGroupIds(groupIds?: number[] | null): number[] {
  return (groupIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

/** 拼装与 executeCampaignSend 一致的基础 WHERE（不含分组 JOIN） */
export function appendEmailAudienceBaseFilters(
  where: string[],
  params: unknown[],
  contactAlias: string,
  opts: EmailAudienceCountOpts
): void {
  const c = contactAlias;
  const tenantId = Number(opts.tenantId ?? 0);
  const industries = normalizeIndustries(opts.industries);
  const sendPipelineMatch = opts.sendPipelineMatch !== false;

  where.push(`${c}.status = 'active'`, `(${c}.email IS NOT NULL AND TRIM(${c}.email) <> '' AND ${c}.email_status <> 'no_email')`);

  if (tenantId > 0) {
    where.push(`${c}.tenant_id = ?`);
    params.push(tenantId);
  }

  const applyBusinessLine =
    !sendPipelineMatch || industries.length === 0
      ? Boolean(opts.businessLine && opts.businessLine !== "all")
      : false;

  if (applyBusinessLine) {
    where.push(`(${c}.business_line = ? OR ${c}.business_line IS NULL)`);
    params.push(opts.businessLine);
  }

  if (industries.length > 0) {
    const industryPlaceholders = industries.map(() => "?").join(",");
    where.push(`TRIM(${c}.industry) IN (${industryPlaceholders})`);
    params.push(...industries);
  }

  appendTenantMarketingOptOutFilters(where, params, c, tenantId);
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

/**
 * 可发受众：去重邮箱数（预览、活动保存、行业并集、发送前校准）
 */
export async function countDistinctAudienceEmails(
  db: Pool,
  opts: EmailAudienceCountOpts,
  extra?: EmailAudienceCountExtra
): Promise<number> {
  const groupIds = normalizeGroupIds(opts.groupIds);
  const blWhere: string[] = [];
  const blParams: unknown[] = [];
  appendEmailAudienceBaseFilters(blWhere, blParams, "c", opts);

  const resumeClause =
    extra?.campaignIdForResume != null && extra.campaignIdForResume > 0
      ? sqlCampaignSendResumeNotExists("c.id", "c.email")
      : "";
  const resumeParams =
    extra?.campaignIdForResume != null && extra.campaignIdForResume > 0 ? [extra.campaignIdForResume] : [];

  let count = 0;
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT COUNT(DISTINCT LOWER(TRIM(c.email))) AS n
         FROM email_contacts c
         INNER JOIN email_contact_groups ecg ON ecg.contact_id = c.id
        WHERE ecg.group_id IN (${placeholders}) AND ${blWhere.join(" AND ")}${resumeClause}`,
      [...groupIds, ...blParams, ...resumeParams]
    );
    count = Number((rows as Array<{ n?: unknown }>)[0]?.n ?? 0);
  } else {
    const [rows] = await db.query(
      `SELECT COUNT(DISTINCT LOWER(TRIM(c.email))) AS n
         FROM email_contacts c
       WHERE ${blWhere.join(" AND ")}${resumeClause}`,
      [...blParams, ...resumeParams]
    );
    count = Number((rows as Array<{ n?: unknown }>)[0]?.n ?? 0);
  }

  const n = Math.max(0, count);
  if (extra?.cap != null && extra.cap > 0) {
    return Math.min(n, extra.cap);
  }
  return n;
}

/**
 * 每个行业标签对应的可发去重邮箱数（行业名字段须与 CRM TRIM(industry) 完全一致）
 */
export async function countDistinctEmailsByIndustryMap(
  db: Pool,
  opts: Pick<EmailAudienceCountOpts, "tenantId" | "groupIds" | "businessLine" | "sendPipelineMatch">
): Promise<Map<string, number>> {
  const groupIds = normalizeGroupIds(opts.groupIds);
  const blWhere: string[] = [];
  const blParams: unknown[] = [];
  appendEmailAudienceBaseFilters(blWhere, blParams, "c", {
    tenantId: opts.tenantId,
    groupIds: opts.groupIds,
    industries: [],
    businessLine: opts.businessLine,
    sendPipelineMatch: opts.sendPipelineMatch
  });
  blWhere.push(`c.industry IS NOT NULL`, `TRIM(c.industry) <> ''`);

  const countMap = new Map<string, number>();

  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT TRIM(c.industry) AS industry, COUNT(DISTINCT LOWER(TRIM(c.email))) AS count
         FROM email_contacts c
         INNER JOIN email_contact_groups ecg ON ecg.contact_id = c.id
        WHERE ecg.group_id IN (${placeholders}) AND ${blWhere.join(" AND ")}
        GROUP BY TRIM(c.industry)
        ORDER BY count DESC, industry ASC`,
      [...groupIds, ...blParams]
    );
    for (const r of rows as Array<{ industry?: unknown; count?: unknown }>) {
      const key = String(r.industry ?? "").trim();
      if (!key) continue;
      countMap.set(key, Number(r.count ?? 0));
    }
    return countMap;
  }

  const [rows] = await db.query(
    `SELECT TRIM(c.industry) AS industry, COUNT(DISTINCT LOWER(TRIM(c.email))) AS count
       FROM email_contacts c
      WHERE ${blWhere.join(" AND ")}
      GROUP BY TRIM(c.industry)
      ORDER BY count DESC, industry ASC`,
    blParams
  );
  for (const r of rows as Array<{ industry?: unknown; count?: unknown }>) {
    const key = String(r.industry ?? "").trim();
    if (!key) continue;
    countMap.set(key, Number(r.count ?? 0));
  }
  return countMap;
}

/**
 * CRM 行业目录：租户内 active 联系人、非空 industry（不去重邮箱口径与列表一致）。
 * 用于营销/导入页下拉「有哪些行业可选」，与可发受众口径（退订/投诉过滤）分离。
 */
export async function countDistinctEmailsByIndustryCrmCatalogMap(
  db: Pool,
  opts: Pick<EmailAudienceCountOpts, "tenantId" | "groupIds">
): Promise<Map<string, number>> {
  const groupIds = normalizeGroupIds(opts.groupIds);
  const tenantId = Number(opts.tenantId ?? 0);
  const where: string[] = [
    "c.status = 'active'",
    "(c.email IS NOT NULL AND TRIM(c.email) <> '' AND c.email_status <> 'no_email')",
    "c.industry IS NOT NULL",
    "TRIM(c.industry) <> ''"
  ];
  const params: unknown[] = [];
  if (tenantId > 0) {
    where.push("c.tenant_id = ?");
    params.push(tenantId);
  }

  const countMap = new Map<string, number>();

  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT TRIM(c.industry) AS industry, COUNT(DISTINCT LOWER(TRIM(c.email))) AS count
         FROM email_contacts c
         INNER JOIN email_contact_groups ecg ON ecg.contact_id = c.id
        WHERE ecg.group_id IN (${placeholders}) AND ${where.join(" AND ")}
        GROUP BY TRIM(c.industry)
        ORDER BY count DESC, industry ASC`,
      [...groupIds, ...params]
    );
    for (const r of rows as Array<{ industry?: unknown; count?: unknown }>) {
      const key = String(r.industry ?? "").trim();
      if (!key) continue;
      countMap.set(key, Number(r.count ?? 0));
    }
    return countMap;
  }

  const [rows] = await db.query(
    `SELECT TRIM(c.industry) AS industry, COUNT(DISTINCT LOWER(TRIM(c.email))) AS count
       FROM email_contacts c
      WHERE ${where.join(" AND ")}
      GROUP BY TRIM(c.industry)
      ORDER BY count DESC, industry ASC`,
    params
  );
  for (const r of rows as Array<{ industry?: unknown; count?: unknown }>) {
    const key = String(r.industry ?? "").trim();
    if (!key) continue;
    countMap.set(key, Number(r.count ?? 0));
  }
  return countMap;
}
