import type { Pool } from "mysql2/promise";
import { businessTodayYmd, sqlBusinessDayCampaignSendActivityAnd } from "./businessCalendar.js";
import {
  buildDedicatedEntitlementsSnapshotForTenant,
  type DedicatedEntitlementsSnapshot,
  resolveTenantEmailDailyLimit
} from "./dedicatedEntitlements.js";
import { formatDomainOverQuotaBlockMessage } from "./dedicatedDomainQuotaCompliance.js";
import { sqlDedicatedVisibleToTenant } from "./dedicatedDomainSlotStatus.js";
import {
  computeLineSentCap,
  DEDICATED_LINE_SENT_CAP,
  DEDICATED_LINE_SENT_CAP_HIGH,
  HIGH_LINE_CAP_PACKAGE_DAILY_MIN,
  MULTI_LANE_PACKAGE_DAILY_MIN,
  usesMultiLaneSendPackage
} from "./dedicatedLanesQuota.js";

export {
  computeLineSentCap,
  DEDICATED_LINE_SENT_CAP,
  DEDICATED_LINE_SENT_CAP_HIGH,
  HIGH_LINE_CAP_PACKAGE_DAILY_MIN,
  MULTI_LANE_PACKAGE_DAILY_MIN,
  usesMultiLaneSendPackage
};

import {
  loadLastFormalSendForLane,
  recoverStaleSendingCampaignsForTenant,
  type LaneLastFormalSend
} from "./emailCampaignSendRunService.js";
import { countLaneDeliveredToday, countTenantDeliveredToday } from "./emailDeliveredCount.js";
import {
  isStandaloneMultiLanePremiumPack,
  PREMIUM_LANE_DELIVERED_CAP
} from "../lib/standaloneMultiLanePremiumProfile.js";

export type { LaneLastFormalSend };

export type DedicatedLaneDomain = {
  serverId: number;
  senderDomain: string | null;
  fromEmail: string | null;
  status: string;
  smtpProfileId: number | null;
  sentToday: number;
  domainSuggestCap: number;
  /** 该发信邮箱（SMTP）上是否有活动正在发送 */
  sendingCampaignId: number | null;
};

export type DedicatedLaneSnapshot = {
  vpsGroupId: number | null;
  laneIndex: number;
  label: string;
  provisioned: boolean;
  relayIp: string | null;
  ptrIp: string | null;
  sentToday: number;
  /** 本专线今日送达成功（与统计页已送达一致；不含失败/postfix） */
  deliveredToday: number;
  lineSentCap: number;
  sentRemaining: number;
  /** 套餐日发上限（送达成功池，租户级） */
  packageDailyLimit: number;
  /** 租户今日送达成功合计（与发信闸 countTenantEmailSentToday 一致） */
  tenantDeliveredToday: number;
  packageDeliveredRemaining: number;
  domains: DedicatedLaneDomain[];
  sendingCampaignId: number | null;
  /** 本专线最近一次已结束的正式发送摘要 */
  lastFormalSend: LaneLastFormalSend | null;
};

function sentTodayActivityClause() {
  return sqlBusinessDayCampaignSendActivityAnd(businessTodayYmd());
}

/** 专线当日发信尝试数（sent + failed），用于 2 万/线暗闸 */
export async function countLaneSentAttemptsToday(
  db: Pool,
  tenantId: number,
  vpsGroupId: number
): Promise<number> {
  const activity = sentTodayActivityClause();
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_sends s
       ${activity.joinSendRuns}
       INNER JOIN email_campaigns ec ON ec.id = s.campaign_id
       INNER JOIN smtp_profiles sp ON sp.id = ec.smtp_profile_id
       LEFT JOIN email_dedicated_servers eds
         ON eds.id = sp.dedicated_server_id AND eds.tenant_id = ec.tenant_id AND eds.status <> 'cancelled'
       LEFT JOIN email_dedicated_servers eds2
         ON eds2.smtp_profile_id = sp.id AND eds2.tenant_id = ec.tenant_id AND eds2.status <> 'cancelled'
      WHERE ec.tenant_id = ?
        AND COALESCE(eds.vps_group_id, eds2.vps_group_id) = ?
        AND s.status IN ('sent', 'failed')
        ${activity.clause}`,
    [tenantId, vpsGroupId, ...activity.params]
  );
  return Number((rows as { c: unknown }[])[0]?.c ?? 0);
}

export async function countDomainSentAttemptsToday(
  db: Pool,
  tenantId: number,
  fromEmail: string
): Promise<number> {
  const fe = String(fromEmail ?? "").trim().toLowerCase();
  if (!fe) return 0;
  const activity = sentTodayActivityClause();
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
       FROM email_sends s
       ${activity.joinSendRuns}
       INNER JOIN email_campaigns ec ON ec.id = s.campaign_id
      WHERE ec.tenant_id = ?
        AND LOWER(TRIM(COALESCE(s.from_email, ''))) = ?
        AND s.status IN ('sent', 'failed')
        ${activity.clause}`,
    [tenantId, fe, ...activity.params]
  );
  return Number((rows as { c: unknown }[])[0]?.c ?? 0);
}

const laneVpsGroupJoinSql = `
       INNER JOIN smtp_profiles sp ON sp.id = ec.smtp_profile_id
       LEFT JOIN email_dedicated_servers eds
         ON eds.id = sp.dedicated_server_id AND eds.tenant_id = ec.tenant_id AND eds.status <> 'cancelled'
       LEFT JOIN email_dedicated_servers eds2
         ON eds2.smtp_profile_id = sp.id AND eds2.tenant_id = ec.tenant_id AND eds2.status <> 'cancelled'`;

/** 租户在专线上 status=sending 的活动数（混元+ 全站并发上限） */
export async function countDedicatedSendingCampaigns(db: Pool, tenantId: number): Promise<number> {
  const tid = Math.floor(Number(tenantId) || 0);
  if (tid <= 0) return 0;
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT ec.id) AS c
       FROM email_campaigns ec
       ${laneVpsGroupJoinSql}
      WHERE ec.tenant_id = ?
        AND COALESCE(eds.vps_group_id, eds2.vps_group_id) IS NOT NULL
        AND LOWER(COALESCE(ec.status, '')) = 'sending'`,
    [tid]
  );
  return Number((rows as { c?: unknown }[])[0]?.c ?? 0);
}

export async function findSendingCampaignOnLane(
  db: Pool,
  tenantId: number,
  vpsGroupId: number
): Promise<number | null> {
  const [rows] = await db.query(
    `SELECT ec.id
       FROM email_campaigns ec
       ${laneVpsGroupJoinSql}
      WHERE ec.tenant_id = ?
        AND COALESCE(eds.vps_group_id, eds2.vps_group_id) = ?
        AND LOWER(COALESCE(ec.status, '')) = 'sending'
      ORDER BY ec.id DESC
      LIMIT 1`,
    [tenantId, vpsGroupId]
  );
  const id = Number((rows as { id: unknown }[])[0]?.id ?? 0);
  return id > 0 ? id : null;
}

/**
 * 同专线 + 同一发信 SMTP：是否已有别的活动在 sending。
 * 不同 smtp_profile_id（不同发信域）可并行，共享该线今日发信额度计数。
 */
export async function findSendingCampaignOnLaneSmtpProfile(
  db: Pool,
  tenantId: number,
  vpsGroupId: number,
  smtpProfileId: number
): Promise<number | null> {
  const spId = Math.floor(Number(smtpProfileId) || 0);
  const gid = Math.floor(Number(vpsGroupId) || 0);
  const tid = Math.floor(Number(tenantId) || 0);
  if (spId <= 0 || gid <= 0 || tid <= 0) return null;
  const [rows] = await db.query(
    `SELECT ec.id
       FROM email_campaigns ec
       ${laneVpsGroupJoinSql}
      WHERE ec.tenant_id = ?
        AND COALESCE(eds.vps_group_id, eds2.vps_group_id) = ?
        AND ec.smtp_profile_id = ?
        AND LOWER(COALESCE(ec.status, '')) = 'sending'
      ORDER BY ec.id DESC
      LIMIT 1`,
    [tid, gid, spId]
  );
  const id = Number((rows as { id: unknown }[])[0]?.id ?? 0);
  return id > 0 ? id : null;
}

/** 从 SMTP 配置解析专线 vps_group_id（兼容 dedicated_server_id 未回填） */
export async function resolveVpsGroupIdForSmtpProfile(
  db: Pool,
  tenantId: number,
  smtpProfileId: number
): Promise<number | null> {
  const spId = Math.floor(Number(smtpProfileId) || 0);
  const tid = Math.floor(Number(tenantId) || 0);
  if (spId <= 0 || tid <= 0) return null;
  const [rows] = await db.query(
    `SELECT COALESCE(eds.vps_group_id, eds2.vps_group_id) AS vps_group_id
       FROM smtp_profiles sp
       LEFT JOIN email_dedicated_servers eds
         ON eds.id = sp.dedicated_server_id AND eds.tenant_id = sp.tenant_id AND eds.status <> 'cancelled'
       LEFT JOIN email_dedicated_servers eds2
         ON eds2.smtp_profile_id = sp.id AND eds2.tenant_id = sp.tenant_id AND eds2.status <> 'cancelled'
      WHERE sp.id = ? AND sp.tenant_id = ?
      LIMIT 1`,
    [spId, tid]
  );
  const gid = Number((rows as { vps_group_id?: unknown }[])[0]?.vps_group_id ?? 0);
  return gid > 0 ? gid : null;
}

/** 多机组：UI 专线序号 → 租户 vps_group 主键 */
export async function resolveVpsGroupIdForLaneIndex(
  db: Pool,
  tenantId: number,
  laneIndex: number
): Promise<number | null> {
  const tid = Math.floor(Number(tenantId) || 0);
  const idx = Math.floor(Number(laneIndex) || 0);
  if (tid <= 0 || idx <= 0) return null;
  const [rows] = await db.query(
    `SELECT id FROM email_dedicated_vps_groups
      WHERE tenant_id = ? AND group_index = ?
      LIMIT 1`,
    [tid, idx]
  );
  const gid = Number((rows as { id?: unknown }[])[0]?.id ?? 0);
  return gid > 0 ? gid : null;
}

/** 自动化/调度：按专线序号取该线首个可用 SMTP（与专线工作台 listDedicatedLanes 口径一致） */
export async function resolvePrimarySmtpProfileIdForLane(
  db: Pool,
  tenantId: number,
  laneIndex: number | null | undefined
): Promise<number | null> {
  const tid = Math.floor(Number(tenantId) || 0);
  if (tid <= 0) return null;
  const idx = Math.floor(Number(laneIndex) || 0);
  const vis = sqlDedicatedVisibleToTenant("eds");

  async function lookupByFromEmail(fromEmail: string): Promise<number | null> {
    const fe = String(fromEmail ?? "").trim();
    if (!fe) return null;
    const [rows] = await db.query(
      `SELECT id FROM smtp_profiles
        WHERE tenant_id = ? AND LOWER(TRIM(from_email)) = LOWER(TRIM(?))
        ORDER BY id DESC LIMIT 1`,
      [tid, fe]
    );
    const spId = Math.floor(Number((rows as Array<{ id?: unknown }>)[0]?.id ?? 0));
    return spId > 0 ? spId : null;
  }

  async function lookupOnVpsGroup(gid: number): Promise<number | null> {
    const [byDedServer] = await db.query(
      `SELECT sp.id AS smtp_profile_id
         FROM smtp_profiles sp
         INNER JOIN email_dedicated_servers eds
           ON eds.id = sp.dedicated_server_id AND eds.tenant_id = sp.tenant_id
        WHERE sp.tenant_id = ?
          AND eds.vps_group_id = ?
          AND ${vis}
        ORDER BY sp.id ASC
        LIMIT 1`,
      [tid, gid]
    );
    let spId = Math.floor(Number((byDedServer as Array<{ smtp_profile_id?: unknown }>)[0]?.smtp_profile_id ?? 0));
    if (spId > 0) return spId;

    const [byEdsSmtp] = await db.query(
      `SELECT sp.id AS smtp_profile_id
         FROM email_dedicated_servers eds
         INNER JOIN smtp_profiles sp
           ON sp.id = eds.smtp_profile_id AND sp.tenant_id = eds.tenant_id
        WHERE eds.tenant_id = ?
          AND eds.vps_group_id = ?
          AND ${vis}
        ORDER BY eds.id ASC
        LIMIT 1`,
      [tid, gid]
    );
    spId = Math.floor(Number((byEdsSmtp as Array<{ smtp_profile_id?: unknown }>)[0]?.smtp_profile_id ?? 0));
    if (spId > 0) return spId;

    const [byFromEmail] = await db.query(
      `SELECT sp.id AS smtp_profile_id
         FROM email_dedicated_servers eds
         INNER JOIN smtp_profiles sp
           ON sp.tenant_id = eds.tenant_id
          AND LOWER(TRIM(sp.from_email)) = LOWER(TRIM(eds.from_email))
        WHERE eds.tenant_id = ?
          AND eds.vps_group_id = ?
          AND eds.from_email IS NOT NULL
          AND TRIM(eds.from_email) <> ''
          AND ${vis}
        ORDER BY eds.id ASC
        LIMIT 1`,
      [tid, gid]
    );
    spId = Math.floor(Number((byFromEmail as Array<{ smtp_profile_id?: unknown }>)[0]?.smtp_profile_id ?? 0));
    return spId > 0 ? spId : null;
  }

  async function pickFromLaneSnapshot(lane: DedicatedLaneSnapshot | undefined): Promise<number | null> {
    if (!lane) return null;
    for (const d of lane.domains ?? []) {
      const spId = Math.floor(Number(d.smtpProfileId ?? 0));
      if (spId > 0) return spId;
    }
    for (const d of lane.domains ?? []) {
      const byFe = await lookupByFromEmail(String(d.fromEmail ?? ""));
      if (byFe) return byFe;
    }
    if (lane.vpsGroupId != null && lane.vpsGroupId > 0) {
      return lookupOnVpsGroup(lane.vpsGroupId);
    }
    return null;
  }

  try {
    const snap = await listDedicatedLanesForTenant(db, tid);
    if (idx > 0) {
      const hit = await pickFromLaneSnapshot(snap.lanes.find((l) => l.laneIndex === idx));
      if (hit) return hit;
    } else {
      for (const lane of snap.lanes) {
        const hit = await pickFromLaneSnapshot(lane);
        if (hit) return hit;
      }
    }
  } catch {
    /* fall through to SQL */
  }

  if (idx > 0) {
    const gid = await resolveVpsGroupIdForLaneIndex(db, tid, idx);
    if (gid != null) {
      const onGroup = await lookupOnVpsGroup(gid);
      if (onGroup) return onGroup;
    }
    const [byGroupIndex] = await db.query(
      `SELECT sp.id AS smtp_profile_id
         FROM smtp_profiles sp
         INNER JOIN email_dedicated_servers eds
           ON (eds.id = sp.dedicated_server_id OR eds.smtp_profile_id = sp.id)
          AND eds.tenant_id = sp.tenant_id
         INNER JOIN email_dedicated_vps_groups vg
           ON vg.id = eds.vps_group_id AND vg.tenant_id = eds.tenant_id
        WHERE sp.tenant_id = ?
          AND vg.group_index = ?
          AND ${vis}
        ORDER BY sp.id ASC
        LIMIT 1`,
      [tid, idx]
    );
    const gi = Math.floor(Number((byGroupIndex as Array<{ smtp_profile_id?: unknown }>)[0]?.smtp_profile_id ?? 0));
    if (gi > 0) return gi;
  }

  const [defRows] = await db.query(
    `SELECT id FROM smtp_profiles WHERE tenant_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1`,
    [tid]
  );
  const defId = Math.floor(Number((defRows as Array<{ id?: unknown }>)[0]?.id ?? 0));
  if (defId > 0) return defId;

  const [anyDed] = await db.query(
    `SELECT sp.id AS smtp_profile_id
       FROM smtp_profiles sp
      WHERE sp.tenant_id = ?
        AND sp.dedicated_server_id IS NOT NULL
      ORDER BY sp.id ASC
      LIMIT 1`,
    [tid]
  );
  const anyId = Math.floor(Number((anyDed as Array<{ smtp_profile_id?: unknown }>)[0]?.smtp_profile_id ?? 0));
  if (anyId > 0) return anyId;

  /** 独立站自动化兜底：老装机库可能未回填 dedicated_server_id / smtp_profile_id，但 smtp_profiles 已可用。 */
  const [anySmtp] = await db.query(
    `SELECT id
       FROM smtp_profiles
      WHERE tenant_id = ?
      ORDER BY is_default DESC, id DESC
      LIMIT 1`,
    [tid]
  );
  const anySmtpId = Math.floor(Number((anySmtp as Array<{ id?: unknown }>)[0]?.id ?? 0));
  return anySmtpId > 0 ? anySmtpId : null;
}

export type DedicatedLaneSendGateResult =
  | {
      ok: true;
      vpsGroupId: number | null;
      lineSentCap?: number;
      sentToday?: number;
      laneRemaining?: number;
    }
  | { ok: false; code: string; reason: string; httpStatus: number };

/**
 * R16c：专线发信硬闸 — 同线、同一发信 SMTP 禁止并发第二活动（不同域可并行）；当日 sent+failed 达线 cap 则不可再发。
 * 非专线 SMTP / SES 活动返回 ok + vpsGroupId null（跳过）。
 */
export async function checkDedicatedLaneSendAllowed(
  db: Pool,
  tenantId: number,
  opts: {
    campaignId?: number;
    smtpProfileId?: number;
    sesSenderAddressId?: number;
    plannedCount?: number;
    allowOngoingCampaignId?: number;
    /** 多机组 formal 发信：按专线序号闸，允许各专线并行发送 */
    laneIndex?: number;
  }
): Promise<DedicatedLaneSendGateResult> {
  const tid = Math.floor(Number(tenantId) || 0);
  if (tid <= 0) return { ok: true, vpsGroupId: null };

  const allowOngoing = Math.floor(Number(opts.allowOngoingCampaignId ?? opts.campaignId) || 0);
  try {
    /** 正在启动/续发本场活动时勿误回收首封准备阶段 */
    /** 发信闸勿 reconcile：多专线并行时易误停其它栏正在发送的活动 */
    await recoverStaleSendingCampaignsForTenant(db, tid, {
      skipRecover: allowOngoing > 0,
      skipReconcile: true
    });
  } catch {
    /* 回收失败不阻断发信闸 */
  }

  let smtpProfileId = Math.floor(Number(opts.smtpProfileId) || 0);
  let sesId = Math.floor(Number(opts.sesSenderAddressId) || 0);

  if (opts.campaignId) {
    const [rows] = await db.query(
      `SELECT smtp_profile_id, ses_sender_address_id
         FROM email_campaigns
        WHERE id = ? AND tenant_id = ?
        LIMIT 1`,
      [opts.campaignId, tid]
    );
    const row = (rows as Array<{ smtp_profile_id?: unknown; ses_sender_address_id?: unknown }>)[0];
    if (!row) return { ok: true, vpsGroupId: null };
    if (!smtpProfileId) smtpProfileId = Math.floor(Number(row.smtp_profile_id) || 0);
    if (!sesId) sesId = Math.floor(Number(row.ses_sender_address_id) || 0);
  }

  if (sesId > 0 && smtpProfileId <= 0) {
    return { ok: true, vpsGroupId: null };
  }
  if (smtpProfileId <= 0) {
    return { ok: true, vpsGroupId: null };
  }

  const smtpVpsGroupId = await resolveVpsGroupIdForSmtpProfile(db, tid, smtpProfileId);
  if (smtpVpsGroupId == null) {
    return { ok: true, vpsGroupId: null };
  }

  const entitlements = await buildDedicatedEntitlementsSnapshotForTenant(db, tid);
  if (entitlements.blocksDedicatedSend) {
    return {
      ok: false,
      code: "DEDICATED_DOMAIN_OVER_QUOTA",
      httpStatus: 403,
      reason: formatDomainOverQuotaBlockMessage(entitlements)
    };
  }
  const dailyLimit = await resolveTenantEmailDailyLimit(db, tid);
  const effectiveDaily = entitlements.dailyLimit || dailyLimit;
  const multiLane = usesMultiLaneSendPackage(effectiveDaily, entitlements.vpsGroupSlots);
  const lineSentCap = computeLineSentCap(
    effectiveDaily,
    entitlements.vpsGroupSlots,
    entitlements.domainSlots
  );

  const laneIndex = Math.floor(Number(opts.laneIndex) || 0);
  let gateVpsGroupId = smtpVpsGroupId;
  if (multiLane && laneIndex > 0) {
    const laneGid = await resolveVpsGroupIdForLaneIndex(db, tid, laneIndex);
    if (laneGid != null) {
      if (smtpVpsGroupId !== laneGid) {
        return {
          ok: false,
          code: "DEDICATED_LANE_SMTP_MISMATCH",
          httpStatus: 409,
          reason: `该活动绑定的发信邮箱不属于专线 ${laneIndex}，请先在「专线 ${laneIndex}」对应发信域下保存活动后再发送。`
        };
      }
      gateVpsGroupId = laneGid;
    }
  }

  const sentToday = await countLaneSentAttemptsToday(db, tid, gateVpsGroupId);
  const laneRemaining = Math.max(0, lineSentCap - sentToday);

  if (isStandaloneMultiLanePremiumPack()) {
    const deliveredToday = await countLaneDeliveredToday(db, tid, gateVpsGroupId);
    if (deliveredToday >= PREMIUM_LANE_DELIVERED_CAP) {
      return {
        ok: false,
        code: "DEDICATED_LANE_DELIVERED_CAP",
        httpStatus: 429,
        reason: `本专线今日成功送达已达 ${PREMIUM_LANE_DELIVERED_CAP.toLocaleString("zh-CN")} 封，请换另一条专线或明日再试。`
      };
    }
  }

  if (multiLane) {
    /** 混元+：同专线、同一发信 SMTP 互斥；不同专线（不同 vps_group）可并行 */
    const sendingId = await findSendingCampaignOnLaneSmtpProfile(
      db,
      tid,
      gateVpsGroupId,
      smtpProfileId
    );
    if (sendingId != null && sendingId !== allowOngoing) {
      return {
        ok: false,
        code: "DEDICATED_SENDER_BUSY",
        httpStatus: 409,
        reason: `该发信邮箱已有活动（内部 ID ${sendingId}）正在发送中，请待其完成或暂停后再用同一邮箱开送。同一条专线上的其他发信域名可同时发送。`
      };
    }
    const tenantSending = await countDedicatedSendingCampaigns(db, tid);
    const slots = Math.max(1, entitlements.vpsGroupSlots);
    let allowOngoingIsSending = false;
    if (allowOngoing > 0) {
      const [ongoingRows] = await db.query(
        `SELECT id FROM email_campaigns
          WHERE id = ? AND tenant_id = ? AND LOWER(COALESCE(status, '')) = 'sending'
          LIMIT 1`,
        [allowOngoing, tid]
      );
      allowOngoingIsSending = Number((ongoingRows as { id?: unknown }[])[0]?.id ?? 0) > 0;
    }
    if (!allowOngoingIsSending && tenantSending >= slots) {
      return {
        ok: false,
        code: "DEDICATED_TENANT_LANE_SLOTS",
        httpStatus: 409,
        reason: `当前已有 ${tenantSending} 场活动在专线上发送中（本套餐最多 ${slots} 条专线同时发送）。请暂停或完成其中一场后再开。`
      };
    }
  } else {
    const sendingId = await findSendingCampaignOnLaneSmtpProfile(
      db,
      tid,
      gateVpsGroupId,
      smtpProfileId
    );
    if (sendingId != null && sendingId !== allowOngoing) {
      return {
        ok: false,
        code: "DEDICATED_SENDER_BUSY",
        httpStatus: 409,
        reason: `该发信邮箱已有活动（内部 ID ${sendingId}）正在发送中，请待其完成或暂停后再用同一邮箱开送。同一条专线上的其他发信域名可同时发送。`
      };
    }
  }

  if (laneRemaining <= 0 && !multiLane) {
    return {
      ok: false,
      code: "DEDICATED_LANE_CAP",
      httpStatus: 429,
      reason: multiLane
        ? `本专线今日发送总数已达 ${lineSentCap.toLocaleString("zh-CN")}（含发送失败），请换另一条专线或明日再试。`
        : "本专线今日发信额度已用尽，请换另一条专线或明日再试。"
    };
  }

  void opts.plannedCount;
  return { ok: true, vpsGroupId: gateVpsGroupId, lineSentCap, sentToday, laneRemaining };
}

export async function listDedicatedLanesForTenant(
  db: Pool,
  tenantId: number
): Promise<{
  dailyLimit: number;
  tenantDeliveredToday: number;
  entitlements: DedicatedEntitlementsSnapshot;
  lineSentCapDefault: number;
  domainSuggestCap: number;
  lanes: DedicatedLaneSnapshot[];
}> {
  if (tenantId > 0) {
    try {
      /** 发送中勿在「拉专线列表」时 reconcile/回收：刷新页会频繁触发，易误杀并行专线 */
      await recoverStaleSendingCampaignsForTenant(db, tenantId, {
        skipRecover: true,
        skipReconcile: true
      });
    } catch {
      /* 回收失败仍返回当前快照 */
    }
  }
  const dailyLimit = await resolveTenantEmailDailyLimit(db, tenantId);
  const entitlements = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
  const premiumPack = isStandaloneMultiLanePremiumPack();
  let packageDailyLimit = Math.max(0, entitlements.dailyLimit || dailyLimit);
  const tenantDeliveredToday =
    tenantId > 0 ? await countTenantDeliveredToday(db, tenantId) : 0;
  let packageDeliveredRemaining = Math.max(0, packageDailyLimit - tenantDeliveredToday);
  let lineSentCapDefault = computeLineSentCap(
    packageDailyLimit,
    entitlements.vpsGroupSlots,
    entitlements.domainSlots
  );
  if (premiumPack) {
    packageDailyLimit = 0;
    packageDeliveredRemaining = 0;
    lineSentCapDefault = PREMIUM_LANE_DELIVERED_CAP;
  }
  const domainSuggestCap =
    entitlements.dailyLimit > 0
      ? Math.ceil(
          entitlements.dailyLimit /
            Math.max(1, entitlements.usedDomains, entitlements.usedVpsGroups)
        )
      : 0;

  const [groupRows] = await db.query(
    `SELECT id, group_index, label, relay_ip, ptr_ip
       FROM email_dedicated_vps_groups
      WHERE tenant_id = ?
      ORDER BY group_index ASC`,
    [tenantId]
  );
  const groups = groupRows as Array<{
    id: number;
    group_index: number;
    label: string | null;
    relay_ip: string | null;
    ptr_ip: string | null;
  }>;

  const [serverRows] = await db.query(
    `SELECT id, vps_group_id, sender_domain, from_email, status, smtp_profile_id
       FROM email_dedicated_servers
      WHERE tenant_id = ? AND ${sqlDedicatedVisibleToTenant()}
      ORDER BY id ASC`,
    [tenantId]
  );
  const servers = serverRows as Array<{
    id: number;
    vps_group_id: number | null;
    sender_domain: string | null;
    from_email: string | null;
    status: string;
    smtp_profile_id: number | null;
  }>;

  /** 中量邮箱配置删除后 smtp_profiles 行消失，但 email_dedicated_servers 可能仍带 from_email — 勿在工作台展示 */
  const linkedSmtpIds = [
    ...new Set(
      servers
        .map((s) => (s.smtp_profile_id != null ? Number(s.smtp_profile_id) : 0))
        .filter((id) => id > 0)
    )
  ];
  const activeSmtpProfileIds = new Set<number>();
  if (linkedSmtpIds.length > 0) {
    const placeholders = linkedSmtpIds.map(() => "?").join(",");
    const [spRows] = await db.query(
      `SELECT id FROM smtp_profiles WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...linkedSmtpIds]
    );
    for (const r of spRows as Array<{ id?: unknown }>) {
      const sid = Math.floor(Number(r.id ?? 0));
      if (sid > 0) activeSmtpProfileIds.add(sid);
    }
  }
  const visibleServers = servers.filter((s) => {
    const spId = s.smtp_profile_id != null ? Number(s.smtp_profile_id) : 0;
    if (spId > 0 && !activeSmtpProfileIds.has(spId)) return false;
    return true;
  });

  const groupById = new Map<number, (typeof groups)[0]>();
  for (const g of groups) groupById.set(Number(g.id), g);

  const lanes: DedicatedLaneSnapshot[] = [];
  const slotTotal = Math.max(1, entitlements.vpsGroupSlots);

  for (let laneIndex = 1; laneIndex <= slotTotal; laneIndex += 1) {
    const group = groups.find((g) => Number(g.group_index) === laneIndex) ?? null;
    const groupId = group ? Number(group.id) : null;
    const lineSentCap = premiumPack ? PREMIUM_LANE_DELIVERED_CAP : lineSentCapDefault;
    const groupServers =
      groupId != null
        ? visibleServers.filter((s) => Number(s.vps_group_id) === groupId)
        : [];

    let sentToday = 0;
    let deliveredToday = 0;
    let sendingCampaignId: number | null = null;
    let lastFormalSend: LaneLastFormalSend | null = null;
    if (groupId != null) {
      sentToday = await countLaneSentAttemptsToday(db, tenantId, groupId);
      deliveredToday = await countLaneDeliveredToday(db, tenantId, groupId);
      sendingCampaignId = await findSendingCampaignOnLane(db, tenantId, groupId);
    }
    lastFormalSend = await loadLastFormalSendForLane(db, tenantId, laneIndex);

    const domains: DedicatedLaneDomain[] = [];
    for (const s of groupServers) {
      const fe = String(s.from_email ?? "").trim();
      const domainSent = fe ? await countDomainSentAttemptsToday(db, tenantId, fe) : 0;
      const spId = s.smtp_profile_id != null ? Number(s.smtp_profile_id) : null;
      let domainSendingId: number | null = null;
      if (groupId != null && spId != null && spId > 0) {
        domainSendingId = await findSendingCampaignOnLaneSmtpProfile(db, tenantId, groupId, spId);
      }
      domains.push({
        serverId: Number(s.id),
        senderDomain: s.sender_domain,
        fromEmail: s.from_email,
        status: String(s.status),
        smtpProfileId: spId,
        sentToday: domainSent,
        domainSuggestCap,
        sendingCampaignId: domainSendingId
      });
    }

    /** 邮件营销发信区：统一「专线 N」，勿用库表运维备注（如 组 1） */
    lanes.push({
      vpsGroupId: groupId,
      laneIndex,
      label: `专线 ${laneIndex}`,
      provisioned: groupId != null && (groupServers.length > 0 || Boolean(group?.relay_ip)),
      relayIp: group?.relay_ip ?? null,
      ptrIp: group?.ptr_ip ?? null,
      sentToday,
      deliveredToday,
      lineSentCap,
      sentRemaining: premiumPack
        ? Math.max(0, PREMIUM_LANE_DELIVERED_CAP - deliveredToday)
        : Math.max(0, lineSentCap - sentToday),
      packageDailyLimit,
      tenantDeliveredToday,
      packageDeliveredRemaining,
      domains,
      sendingCampaignId,
      lastFormalSend
    });
  }

  return {
    dailyLimit: packageDailyLimit,
    tenantDeliveredToday,
    entitlements,
    lineSentCapDefault,
    domainSuggestCap,
    lanes
  };
}
