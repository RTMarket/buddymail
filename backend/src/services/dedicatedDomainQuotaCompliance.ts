import type { DedicatedEntitlementsSnapshot } from "./dedicatedEntitlements.js";

export type DomainQuotaCompliance = {
  /** 登记发信域数 ≤ 当前套餐名额 */
  domainQuotaCompliant: boolean;
  /** usedDomains - domainSlots（>0 时需先删域） */
  domainOverBy: number;
  /** 阻断营销群发、测试发信等（续费同档、升档未超额不受影响） */
  blocksDedicatedSend: boolean;
};

export function assessDomainQuotaCompliance(
  snapshot: DedicatedEntitlementsSnapshot
): DomainQuotaCompliance {
  const overBy = Math.max(0, snapshot.usedDomains - snapshot.domainSlots);
  return {
    domainQuotaCompliant: overBy === 0,
    domainOverBy: overBy,
    blocksDedicatedSend: overBy > 0
  };
}

export function enrichDedicatedEntitlementsSnapshot(
  snapshot: DedicatedEntitlementsSnapshot
): DedicatedEntitlementsSnapshot & DomainQuotaCompliance {
  const c = assessDomainQuotaCompliance(snapshot);
  return { ...snapshot, ...c };
}

export function formatDomainOverQuotaBlockMessage(
  snapshot: DedicatedEntitlementsSnapshot
): string {
  const daily =
    snapshot.dailyLimit > 0 ? snapshot.dailyLimit.toLocaleString("zh-CN") : "—";
  const overBy = Math.max(0, snapshot.usedDomains - snapshot.domainSlots);
  return (
    `您当前邮件套餐（日发 ${daily} 封/日）最多可保留 ${snapshot.domainSlots} 个发信域名，` +
    `但账户仍登记 ${snapshot.usedDomains} 个。请先在「发信域名」中删除 ${overBy} 个多余域名后，` +
    `再使用邮件营销发送或测试发信。续费同档位、升级套餐未超额时无需操作。`
  );
}
