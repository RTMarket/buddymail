/** 与后端 dedicatedEntitlements.ts 口径一致（前端展示兜底） */

export type DedicatedEntitlementsSnapshot = {
  dailyLimit: number;
  domainSlots: number;
  vpsGroupSlots: number;
  usedDomains: number;
  usedVpsGroups: number;
  domainsRemaining: number;
  vpsGroupsRemaining: number;
  domainQuotaCompliant?: boolean;
  domainOverBy?: number;
  blocksDedicatedSend?: boolean;
};

export function assessDomainQuotaCompliance(snapshot: DedicatedEntitlementsSnapshot) {
  const overBy = Math.max(0, snapshot.usedDomains - snapshot.domainSlots);
  return {
    domainQuotaCompliant: overBy === 0,
    domainOverBy: overBy,
    blocksDedicatedSend: overBy > 0
  };
}

export function computeDedicatedEntitlements(dailyLimit: number) {
  const limit = Math.max(0, Math.floor(Number(dailyLimit) || 0));
  const domainSlots = limit < 5000 ? 1 : Math.ceil(limit / 5000);
  /** 每 +20,000 日发 +1 条专线（与运营「每组至少 1 域」建议口径一致） */
  const vpsGroupSlots = Math.max(1, Math.ceil(limit / 20000));
  return { dailyLimit: limit, domainSlots, vpsGroupSlots };
}

/** 每条专线可绑发信域上限（如 12 域 / 3 专线 → 每线 4 域） */
export function computeDomainSlotsPerLane(domainSlots: number, vpsGroupSlots: number): number {
  const slots = Math.max(0, Math.floor(Number(domainSlots) || 0));
  const lanes = Math.max(1, Math.floor(Number(vpsGroupSlots) || 0));
  if (slots <= 0) return 0;
  return Math.max(1, Math.ceil(slots / lanes));
}

/** R12：高日发时发信域/专线数低于建议最少值（= vpsGroupSlots） */
export function shouldShowDedicatedOperationalHint(snapshot: DedicatedEntitlementsSnapshot): boolean {
  if (snapshot.dailyLimit <= 0) return false;
  return snapshot.usedDomains < snapshot.vpsGroupSlots || snapshot.usedVpsGroups < snapshot.vpsGroupSlots;
}

export function mergeEntitlementsWithUsage(
  dailyLimit: number,
  usedDomains: number,
  usedVpsGroups: number
): DedicatedEntitlementsSnapshot {
  const ent = computeDedicatedEntitlements(dailyLimit);
  const base = {
    ...ent,
    usedDomains,
    usedVpsGroups,
    domainsRemaining: Math.max(0, ent.domainSlots - usedDomains),
    vpsGroupsRemaining: Math.max(0, ent.vpsGroupSlots - usedVpsGroups)
  };
  return { ...base, ...assessDomainQuotaCompliance(base) };
}

export function formatDomainOverQuotaBlockMessage(snapshot: DedicatedEntitlementsSnapshot): string {
  const daily =
    snapshot.dailyLimit > 0 ? snapshot.dailyLimit.toLocaleString("zh-CN") : "—";
  const overBy = Math.max(0, snapshot.usedDomains - snapshot.domainSlots);
  return (
    `您当前邮件套餐（日发 ${daily} 封/日）最多可保留 ${snapshot.domainSlots} 个发信域名，` +
    `但账户仍登记 ${snapshot.usedDomains} 个。请先在「发信域名」中删除 ${overBy} 个多余域名后，` +
    `再使用邮件营销发送或测试发信。续费同档位、升级套餐未超额时无需操作。`
  );
}

export function formatDailyLimit(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("zh-CN");
}

/** 租户端：专线条数已用/上限，如「1/1 条」 */
export function formatDedicatedLineQuota(used: number, total: number): string {
  const u = Math.max(0, Math.floor(Number(used) || 0));
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return `${u}/${t} 条`;
}

/** 租户列表项兜底统计（后端未计入 smtp 绑定时，前端用 smtpProfileId 补全） */
export function countDedicatedUsageFromClientItems(
  items: Array<{
    senderDomain?: string | null;
    smtpProfileId?: number | null;
    status?: string;
  }>
): { usedDomains: number; usedVpsGroups: number } {
  const active = items.filter(
    (i) => i.status !== "cancelled" && i.status !== "rejected" && i.status !== "deleted"
  );
  const usedDomains = active.filter((i) => String(i.senderDomain ?? "").trim()).length;
  const smtpIds = new Set(
    active
      .map((i) => i.smtpProfileId)
      .filter((id): id is number => id != null && Number(id) > 0)
  );
  const deployedByStatus = active.some((i) => i.status === "ready" || i.status === "awaiting_dns");
  return {
    usedDomains,
    usedVpsGroups: smtpIds.size > 0 ? smtpIds.size : deployedByStatus ? 1 : 0
  };
}

export function parseEntitlementsSnapshot(raw: unknown): DedicatedEntitlementsSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dailyLimit = Number(o.dailyLimit ?? 0);
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) return null;
  const base: DedicatedEntitlementsSnapshot = {
    dailyLimit,
    domainSlots: Number(o.domainSlots ?? 0),
    vpsGroupSlots: Number(o.vpsGroupSlots ?? 0),
    usedDomains: Number(o.usedDomains ?? 0),
    usedVpsGroups: Number(o.usedVpsGroups ?? 0),
    domainsRemaining: Number(o.domainsRemaining ?? 0),
    vpsGroupsRemaining: Number(o.vpsGroupsRemaining ?? 0)
  };
  const compliance =
    o.domainOverBy != null || o.blocksDedicatedSend != null
      ? {
          domainQuotaCompliant: Boolean(o.domainQuotaCompliant ?? true),
          domainOverBy: Number(o.domainOverBy ?? 0),
          blocksDedicatedSend: Boolean(o.blocksDedicatedSend ?? false)
        }
      : assessDomainQuotaCompliance(base);
  return { ...base, ...compliance };
}

/** 邮件通道类型（开源版通用） */
export type EmailChannelKind = "light" | "medium" | "bulk" | "ultra";
