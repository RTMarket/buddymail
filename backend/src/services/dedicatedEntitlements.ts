import type { Pool } from "mysql2/promise";
import { getOpenCorePlanTierId, getOpenCoreDailySendLimit } from "../lib/openCoreConfig.js";
import { standaloneLicenseDailyCap } from "./emailSendQuota.js";
import { sqlDedicatedDomainCountsTowardSlot } from "./dedicatedDomainSlotStatus.js";
import { enrichDedicatedEntitlementsSnapshot, formatDomainOverQuotaBlockMessage } from "./dedicatedDomainQuotaCompliance.js";
import type { DomainQuotaCompliance } from "./dedicatedDomainQuotaCompliance.js";

export type DedicatedEntitlements = {
  dailyLimit: number;
  domainSlots: number;
  vpsGroupSlots: number;
};

export type DedicatedUsage = {
  usedDomains: number;
  usedVpsGroups: number;
};

export type DedicatedEntitlementsSnapshot = DedicatedEntitlements &
  DedicatedUsage &
  DomainQuotaCompliance & {
    domainsRemaining: number;
    vpsGroupsRemaining: number;
  };

export type DedicatedEntitlementOverrides = {
  domainSlots?: number | null;
  vpsGroupSlots?: number | null;
};

function formulaDedicatedEntitlements(dailyLimit: number): Omit<DedicatedEntitlements, "dailyLimit"> {
  const limit = Math.max(0, Math.floor(Number(dailyLimit) || 0));
  const domainSlots = limit < 5000 ? 1 : Math.ceil(limit / 5000);
  const vpsGroupSlots = Math.max(1, Math.ceil(limit / 20000));
  return { domainSlots, vpsGroupSlots };
}

/** 与产品规则、整改清单 R07 一致；独立站 LICENSE 可覆盖 domain/vps 名额 */
export function computeDedicatedEntitlements(
  dailyLimit: number,
  overrides?: DedicatedEntitlementOverrides | null
): DedicatedEntitlements {
  const limit = Math.max(0, Math.floor(Number(dailyLimit) || 0));
  const formula = formulaDedicatedEntitlements(limit);
  const domainOverride = overrides?.domainSlots;
  const vpsOverride = overrides?.vpsGroupSlots;
  return {
    dailyLimit: limit,
    domainSlots:
      domainOverride != null && Number(domainOverride) > 0
        ? Math.floor(Number(domainOverride))
        : formula.domainSlots,
    vpsGroupSlots:
      vpsOverride != null && Number(vpsOverride) > 0
        ? Math.floor(Number(vpsOverride))
        : formula.vpsGroupSlots
  };
}

export function standaloneLicenseEntitlementOverrides(): DedicatedEntitlementOverrides {
  void getOpenCorePlanTierId();
  void getOpenCoreDailySendLimit();
  return { domainSlots: null, vpsGroupSlots: null };
}

/** 每条专线可绑发信域上限（如 12 域 / 3 专线 → 每线 4 域） */
export function computeDomainSlotsPerLane(domainSlots: number, vpsGroupSlots: number): number {
  const slots = Math.max(0, Math.floor(Number(domainSlots) || 0));
  const lanes = Math.max(1, Math.floor(Number(vpsGroupSlots) || 0));
  if (slots <= 0) return 0;
  return Math.max(1, Math.ceil(slots / lanes));
}

export function mergeEntitlementsWithUsage(
  entitlements: DedicatedEntitlements,
  usage: DedicatedUsage
): DedicatedEntitlementsSnapshot {
  return enrichDedicatedEntitlementsSnapshot({
    ...entitlements,
    usedDomains: usage.usedDomains,
    usedVpsGroups: usage.usedVpsGroups,
    domainsRemaining: Math.max(0, entitlements.domainSlots - usage.usedDomains),
    vpsGroupsRemaining: Math.max(0, entitlements.vpsGroupSlots - usage.usedVpsGroups)
  } as DedicatedEntitlementsSnapshot);
}

/** 开源版档位 → 日发上限映射（env 可配，默认档位） */
const OPEN_CORE_TIER_DAILY_LIMIT: Record<string, number> = {
  "email-send-3000": 3000,
  "email-send-30000": 30000,
  "email-send-50000": 50000,
  "email-send-100000": 100000
};

export function dailyLimitFromTierId(tierId: string | null | undefined): number | null {
  if (!tierId?.trim()) return null;
  const v = OPEN_CORE_TIER_DAILY_LIMIT[tierId.trim()];
  if (v != null && v > 0) return v;
  return null;
}

/**
 * 专线条「已占用」的去重键：与运营侧「已部署一组」对齐。
 * 优先 smtp_profile（已绑 SMTP = 已落地）；其次 relay|ptr；再退化为单 IP / ready+主机名。
 */
const DEDICATED_VPS_GROUP_KEY_SQL = `
  CASE
    WHEN vps_group_id IS NOT NULL AND vps_group_id > 0 THEN
      CONCAT('gid:', vps_group_id)
    WHEN smtp_profile_id IS NOT NULL AND smtp_profile_id > 0 THEN
      CONCAT('smtp:', smtp_profile_id)
    WHEN NULLIF(TRIM(ptr_ip), '') IS NOT NULL
     AND (
       NULLIF(TRIM(relay_ip), '') IS NOT NULL
       OR NULLIF(TRIM(ip_address), '') IS NOT NULL
     ) THEN
      CONCAT(
        'grp:',
        TRIM(COALESCE(NULLIF(TRIM(relay_ip), ''), ip_address)),
        '|',
        TRIM(ptr_ip)
      )
    WHEN NULLIF(TRIM(COALESCE(NULLIF(TRIM(relay_ip), ''), ip_address)), '') IS NOT NULL THEN
      CONCAT('ip:', TRIM(COALESCE(NULLIF(TRIM(relay_ip), ''), ip_address)))
    WHEN status IN ('ready', 'awaiting_dns')
     AND NULLIF(TRIM(hostname), '') IS NOT NULL THEN
      CONCAT('host:', TRIM(hostname), ':', id)
    ELSE NULL
  END`;

export async function resolveTenantEmailDailyLimit(
  db: Pool,
  tenantId: number
): Promise<number> {
  const [rows] = await db.query(
    `SELECT daily_send_limit, email_tier_id
       FROM tenant_product_modules
      WHERE tenant_id = ? AND module = 'email'
      LIMIT 1`,
    [tenantId]
  );
  const row = (rows as Array<{ daily_send_limit: unknown; email_tier_id: string | null }>)[0];
  const fromCol =
    row?.daily_send_limit != null && Number(row.daily_send_limit) > 0
      ? Number(row.daily_send_limit)
      : null;
  const fromTier = dailyLimitFromTierId(row?.email_tier_id ?? null);
  let cap = fromCol ?? fromTier ?? 0;
  const licCap = standaloneLicenseDailyCap();
  if (licCap > 0) {
    cap = cap > 0 ? Math.min(cap, licCap) : licCap;
  }
  return cap;
}

export async function countDedicatedUsageForTenant(
  db: Pool,
  tenantId: number
): Promise<DedicatedUsage> {
  const [rows] = await db.query(
    `SELECT
        SUM(
          CASE
            WHEN sender_domain IS NOT NULL AND TRIM(sender_domain) <> '' THEN 1
            ELSE 0
          END
        ) AS used_domains,
        COUNT(DISTINCT ${DEDICATED_VPS_GROUP_KEY_SQL}) AS used_vps_groups
       FROM email_dedicated_servers
      WHERE tenant_id = ? AND ${sqlDedicatedDomainCountsTowardSlot()}`,
    [tenantId]
  );
  const r = (rows as Array<{ used_domains: unknown; used_vps_groups: unknown }>)[0];
  return {
    usedDomains: Number(r?.used_domains ?? 0),
    usedVpsGroups: Number(r?.used_vps_groups ?? 0)
  };
}

export async function countDedicatedUsageByTenantIds(
  db: Pool,
  tenantIds: number[]
): Promise<Map<number, DedicatedUsage>> {
  const map = new Map<number, DedicatedUsage>();
  if (tenantIds.length === 0) return map;
  const uniq = [...new Set(tenantIds.filter((id) => id > 0))];
  const ph = uniq.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT tenant_id,
            SUM(
              CASE
                WHEN sender_domain IS NOT NULL AND TRIM(sender_domain) <> '' THEN 1
                ELSE 0
              END
            ) AS used_domains,
            COUNT(DISTINCT ${DEDICATED_VPS_GROUP_KEY_SQL}) AS used_vps_groups
       FROM email_dedicated_servers
      WHERE ${sqlDedicatedDomainCountsTowardSlot()} AND tenant_id IN (${ph})
      GROUP BY tenant_id`,
    uniq
  );
  for (const id of uniq) {
    map.set(id, { usedDomains: 0, usedVpsGroups: 0 });
  }
  for (const r of rows as Array<{
    tenant_id: number;
    used_domains: unknown;
    used_vps_groups: unknown;
  }>) {
    map.set(Number(r.tenant_id), {
      usedDomains: Number(r.used_domains ?? 0),
      usedVpsGroups: Number(r.used_vps_groups ?? 0)
    });
  }
  return map;
}

export async function buildDedicatedEntitlementsSnapshotForTenant(
  db: Pool,
  tenantId: number
): Promise<DedicatedEntitlementsSnapshot> {
  const dailyLimit = await resolveTenantEmailDailyLimit(db, tenantId);
  const entitlements = computeDedicatedEntitlements(dailyLimit, standaloneLicenseEntitlementOverrides());
  const usage = await countDedicatedUsageForTenant(db, tenantId);
  return mergeEntitlementsWithUsage(entitlements, usage);
}

export type DedicatedQuotaDenyReason = "domain_slots" | "vps_group_slots";

export function formatDedicatedQuotaDenyMessage(
  reason: DedicatedQuotaDenyReason,
  snapshot: DedicatedEntitlementsSnapshot
): string {
  const daily = snapshot.dailyLimit > 0 ? snapshot.dailyLimit.toLocaleString("zh-CN") : "—";
  if (reason === "domain_slots") {
    return `您当前日发上限为 ${daily} 封/日，最多可登记 ${snapshot.domainSlots} 个发信域名（已用 ${snapshot.usedDomains}）。如需更多请升级邮件营销套餐。`;
  }
  return `您当前日发上限为 ${daily} 封/日，最多可开通 ${snapshot.vpsGroupSlots} 条专线（已用 ${snapshot.usedVpsGroups}）。如需更多请升级邮件营销套餐。`;
}

/** 新专线申请行挂到租户默认组（组 1）；无组且仍有专线名额时自动建组。 */
export async function attachNewDedicatedServerToDefaultVpsGroup(
  db: Pool,
  tenantId: number,
  serverId: number
): Promise<void> {
  const [gRows] = await db.query(
    `SELECT id FROM email_dedicated_vps_groups
      WHERE tenant_id = ?
      ORDER BY group_index ASC
      LIMIT 1`,
    [tenantId]
  );
  let groupId = Number((gRows as Array<{ id: unknown }>)[0]?.id ?? 0);
  if (!groupId) {
    const snap = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
    if (snap.usedVpsGroups >= snap.vpsGroupSlots) {
      throw new Error(formatDedicatedQuotaDenyMessage("vps_group_slots", snap));
    }
    const [ins] = await db.query(
      `INSERT INTO email_dedicated_vps_groups (tenant_id, group_index, label)
       VALUES (?, 1, '组 1')`,
      [tenantId]
    );
    groupId = Number((ins as { insertId?: number }).insertId ?? 0);
  }
  if (!groupId) return;
  await db.query(
    `UPDATE email_dedicated_servers SET vps_group_id = ?
      WHERE id = ? AND tenant_id = ?`,
    [groupId, serverId, tenantId]
  );
}

export async function attachDedicatedServerToVpsGroup(
  db: Pool,
  tenantId: number,
  serverId: number,
  vpsGroupId: number
): Promise<void> {
  const gid = Math.floor(Number(vpsGroupId) || 0);
  if (gid <= 0) throw new Error("无效的专线组，无法绑定发信域名。");
  await db.query(
    `UPDATE email_dedicated_servers SET vps_group_id = ? WHERE id = ? AND tenant_id = ?`,
    [gid, serverId, tenantId]
  );
}

export async function countDedicatedDomainsInVpsGroup(
  db: Pool,
  tenantId: number,
  vpsGroupId: number
): Promise<number> {
  const gid = Math.floor(Number(vpsGroupId) || 0);
  if (gid <= 0) return 0;
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM email_dedicated_servers
      WHERE tenant_id = ? AND vps_group_id = ? AND ${sqlDedicatedDomainCountsTowardSlot()}`,
    [tenantId, gid]
  );
  return Number((rows as Array<{ c?: unknown }>)[0]?.c ?? 0);
}

/** 租户在指定专线下新增发信域：解析/创建 VPS 组（group_index = laneIndex） */
export async function resolveVpsGroupIdForLaneIndex(
  db: Pool,
  tenantId: number,
  laneIndex: number
): Promise<number> {
  const lane = Math.max(1, Math.floor(Number(laneIndex) || 0));
  const snap = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
  if (lane > snap.vpsGroupSlots) {
    throw new Error(
      `当前套餐最多 ${snap.vpsGroupSlots} 条专线，无法在第 ${lane} 条专线下新增发信域名。`
    );
  }
  const [gRows] = await db.query(
    `SELECT id FROM email_dedicated_vps_groups
      WHERE tenant_id = ? AND group_index = ?
      LIMIT 1`,
    [tenantId, lane]
  );
  let groupId = Number((gRows as Array<{ id?: unknown }>)[0]?.id ?? 0);
  if (groupId > 0) return groupId;
  const [ins] = await db.query(
    `INSERT INTO email_dedicated_vps_groups (tenant_id, group_index, label)
     VALUES (?, ?, ?)`,
    [tenantId, lane, `专线 ${lane}`]
  );
  groupId = Number((ins as { insertId?: number }).insertId ?? 0);
  if (!groupId) throw new Error("创建专线组失败，请稍后重试。");
  return groupId;
}

/** 专线下发信域名额 + 套餐总域名额 */
export async function assertLaneDomainSlotsAvailable(
  db: Pool,
  tenantId: number,
  vpsGroupId: number,
  entSnap?: DedicatedEntitlementsSnapshot
): Promise<void> {
  const snap = entSnap ?? (await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId));
  if (snap.blocksDedicatedSend) {
    throw new Error(formatDomainOverQuotaBlockMessage(snap));
  }
  if (snap.usedDomains >= snap.domainSlots) {
    throw new Error(formatDedicatedQuotaDenyMessage("domain_slots", snap));
  }
  const perLane = computeDomainSlotsPerLane(snap.domainSlots, snap.vpsGroupSlots);
  const usedInLane = await countDedicatedDomainsInVpsGroup(db, tenantId, vpsGroupId);
  if (usedInLane >= perLane) {
    throw new Error(
      `该专线下发信域名已达上限（${perLane} 个/专线）。请换其它专线或升级邮件营销套餐。`
    );
  }
}
