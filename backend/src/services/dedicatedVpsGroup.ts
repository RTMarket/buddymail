import type { Pool } from "mysql2/promise";
import { defaultPtrHostname, isLikelyIpv4Host, normalizePtrHostnameForDns } from "./dedicatedMailServerGroup.js";
import {
  attachNewDedicatedServerToDefaultVpsGroup,
  buildDedicatedEntitlementsSnapshotForTenant,
  formatDedicatedQuotaDenyMessage
} from "./dedicatedEntitlements.js";

export type VpsGroupInfrastructure = {
  relayIp: string;
  ptrIp: string;
  ptrHostname: string;
};

function pickIp(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (t) return t;
  }
  return "";
}

/** 主机名 / PTR 域名：排除 IPv4，避免 pickIp 把发信机 IP 当成 ptr_hostname */
function pickHostname(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (t && !isLikelyIpv4Host(t)) return t;
  }
  return "";
}

/** 从组表或同组已 provision 的专线行读取双机 IP */
export async function loadVpsGroupInfrastructure(
  db: Pool,
  tenantId: number,
  vpsGroupId: number | null
): Promise<VpsGroupInfrastructure | null> {
  if (!vpsGroupId || vpsGroupId <= 0) return null;

  const [gRows] = await db.query(
    `SELECT relay_ip, ptr_ip, ptr_hostname
       FROM email_dedicated_vps_groups
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    [vpsGroupId, tenantId]
  );
  const g = (gRows as Array<{
    relay_ip: string | null;
    ptr_ip: string | null;
    ptr_hostname: string | null;
  }>)[0];

  let relayIp = pickIp(g?.relay_ip);
  let ptrIp = pickIp(g?.ptr_ip);
  let ptrHostname = pickHostname(g?.ptr_hostname);
  let senderDomain = "";

  if (!relayIp || !ptrIp) {
    const [sRows] = await db.query(
      `SELECT relay_ip, ptr_ip, ptr_hostname, ip_address, hostname, sender_domain
         FROM email_dedicated_servers
        WHERE tenant_id = ? AND vps_group_id = ? AND status <> 'cancelled'
          AND (
            NULLIF(TRIM(relay_ip), '') IS NOT NULL
            OR NULLIF(TRIM(ptr_ip), '') IS NOT NULL
          )
        ORDER BY
          CASE WHEN status IN ('ready', 'awaiting_dns') THEN 0 ELSE 1 END,
          id ASC
        LIMIT 1`,
      [tenantId, vpsGroupId]
    );
    const s = (sRows as Array<{
      relay_ip: string | null;
      ptr_ip: string | null;
      ptr_hostname: string | null;
      ip_address: string | null;
      hostname: string | null;
      sender_domain: string | null;
    }>)[0];
    relayIp = relayIp || pickIp(s?.relay_ip, s?.ip_address);
    ptrIp = ptrIp || pickIp(s?.ptr_ip);
    ptrHostname =
      ptrHostname ||
      pickHostname(s?.ptr_hostname, s?.hostname, s?.sender_domain);
    senderDomain = pickHostname(s?.sender_domain) || "";
  } else {
    const [sRows] = await db.query(
      `SELECT sender_domain FROM email_dedicated_servers
        WHERE tenant_id = ? AND vps_group_id = ? AND status <> 'cancelled'
        ORDER BY
          CASE WHEN status IN ('ready', 'awaiting_dns') THEN 0 ELSE 1 END,
          id ASC
        LIMIT 1`,
      [tenantId, vpsGroupId]
    );
    const s = (sRows as Array<{ sender_domain: string | null }>)[0];
    senderDomain = pickHostname(s?.sender_domain) || "";
  }

  if (!relayIp || !ptrIp) return null;
  return {
    relayIp,
    ptrIp,
    ptrHostname: normalizePtrHostnameForDns(ptrHostname, senderDomain || ptrHostname)
  };
}

export async function syncVpsGroupInfrastructure(
  db: Pool,
  tenantId: number,
  vpsGroupId: number,
  infra: VpsGroupInfrastructure
): Promise<void> {
  await db.query(
    `UPDATE email_dedicated_vps_groups
        SET relay_ip = ?, ptr_ip = ?, ptr_hostname = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?`,
    [infra.relayIp, infra.ptrIp, infra.ptrHostname, vpsGroupId, tenantId]
  );
}

export type ResolveProvisionInfraResult = {
  infra: VpsGroupInfrastructure;
  vpsGroupId: number;
  reusedGroupInfra: boolean;
  groupDomainCount: number;
};

/**
 * 解析 provision 用双机 IP：优先请求体；否则复用同组已有 IP（R15 多域同组）。
 */
export async function resolveProvisionInfrastructure(
  db: Pool,
  tenantId: number,
  serverId: number,
  vpsGroupId: number | null,
  input: {
    relayIp?: string;
    ptrIp?: string;
    ptrHostname?: string | null;
    senderDomain: string;
  }
): Promise<ResolveProvisionInfraResult> {
  let groupId = vpsGroupId != null && vpsGroupId > 0 ? Number(vpsGroupId) : 0;
  if (!groupId) {
    await attachNewDedicatedServerToDefaultVpsGroup(db, tenantId, serverId);
    const [r] = await db.query(
      `SELECT vps_group_id FROM email_dedicated_servers WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [serverId, tenantId]
    );
    groupId = Number((r as Array<{ vps_group_id: unknown }>)[0]?.vps_group_id ?? 0);
  }
  if (!groupId) {
    throw new Error("无法确定专线组，请刷新后重试。");
  }

  const existing = await loadVpsGroupInfrastructure(db, tenantId, groupId);
  const bodyRelay = pickIp(input.relayIp);
  const bodyPtr = pickIp(input.ptrIp);
  const senderDomain = input.senderDomain.trim().toLowerCase();

  let relayIp = bodyRelay;
  let ptrIp = bodyPtr;
  let reusedGroupInfra = false;

  if (relayIp && ptrIp) {
    if (
      existing &&
      (existing.relayIp !== relayIp || existing.ptrIp !== ptrIp)
    ) {
      throw new Error(
        `该租户本组双机已登记为发信 ${existing.relayIp} / PTR ${existing.ptrIp}。` +
          `同组增加发信域须复用上述 IP（可留空由系统自动填入），` +
          `若需另一套物理双机请先开通新专线组（受套餐专线名额限制）。`
      );
    }
  } else if (existing) {
    relayIp = existing.relayIp;
    ptrIp = existing.ptrIp;
    reusedGroupInfra = true;
  } else {
    throw new Error("请填写发信机 IP 与 PTR 机 IP，或先在同组首域上完成双机登记。");
  }

  const ptrHostname = normalizePtrHostnameForDns(
    pickHostname(input.ptrHostname, existing?.ptrHostname),
    senderDomain
  );

  const infra: VpsGroupInfrastructure = { relayIp, ptrIp, ptrHostname };
  await syncVpsGroupInfrastructure(db, tenantId, groupId, infra);

  const [[cntRow]] = (await db.query(
    `SELECT COUNT(*) AS c FROM email_dedicated_servers
      WHERE tenant_id = ? AND vps_group_id = ? AND status <> 'cancelled'`,
    [tenantId, groupId]
  )) as [{ c: unknown }[], unknown];

  return {
    infra,
    vpsGroupId: groupId,
    reusedGroupInfra,
    groupDomainCount: Number(cntRow?.c ?? 0)
  };
}

/** 租户再占一条物理专线组（不同 relay/ptr）时校验名额 */
export async function assertCanAllocateNewVpsGroup(db: Pool, tenantId: number): Promise<void> {
  const snap = await buildDedicatedEntitlementsSnapshotForTenant(db, tenantId);
  if (snap.usedVpsGroups >= snap.vpsGroupSlots) {
    throw new Error(formatDedicatedQuotaDenyMessage("vps_group_slots", snap));
  }
}

export async function countDomainsInVpsGroup(
  db: Pool,
  tenantId: number,
  vpsGroupId: number
): Promise<number> {
  const [[r]] = (await db.query(
    `SELECT COUNT(*) AS c FROM email_dedicated_servers
      WHERE tenant_id = ? AND vps_group_id = ? AND status <> 'cancelled'
        AND sender_domain IS NOT NULL AND TRIM(sender_domain) <> ''`,
    [tenantId, vpsGroupId]
  )) as [{ c: unknown }[], unknown];
  return Number(r?.c ?? 0);
}
