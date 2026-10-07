import type { DedicatedEntitlementsSnapshot } from "../../../lib/dedicatedEntitlements";
import {
  formatDailyLimit,
  shouldShowDedicatedOperationalHint
} from "../../../lib/dedicatedEntitlements";

export function DedicatedHighSendOperationalHint(props: {
  snapshot: DedicatedEntitlementsSnapshot | null;
  className?: string;
}) {
  const { snapshot, className } = props;
  if (!snapshot || !shouldShowDedicatedOperationalHint(snapshot)) return null;

  const dailyLabel = formatDailyLimit(snapshot.dailyLimit);
  const need = snapshot.vpsGroupSlots;
  const maxDomains = snapshot.domainSlots;
  const domainShort = snapshot.usedDomains < need;
  const lineShort = snapshot.usedVpsGroups < need;

  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 ${className ?? ""}`}
      role="status"
    >
      <strong className="font-semibold">高日发部署建议（软提示，不限制提交）：</strong>
      您当前日发上限为 <span className="tabular-nums font-medium">{dailyLabel}</span> 封/日。按专线部署规则，建议至少配置{" "}
      <span className="font-semibold tabular-nums">{need}</span> 个发信域名、开通{" "}
      <span className="font-semibold tabular-nums">{need}</span> 条专线（每增 2 万日发 +1 组 VPS，并同步增加 1 个发信域建议）。
      {domainShort ? (
        <>
          {" "}
          当前已登记发信域 <span className="font-medium tabular-nums">{snapshot.usedDomains}</span> 个
        </>
      ) : null}
      {domainShort && lineShort ? "，" : null}
      {lineShort ? (
        <>
          {!domainShort ? " " : null}
          专线 <span className="font-medium tabular-nums">{snapshot.usedVpsGroups}</span>/{need} 条
        </>
      ) : null}
      {domainShort || lineShort ? "，尚未达标时请继续提交域名与专线申请。" : null}
      {maxDomains > need ? (
        <>
          {" "}
          域名名额上限为 <span className="font-medium tabular-nums">{maxDomains}</span> 个（每 +5,000 日发 +1 名额，本档最多{" "}
          {maxDomains} 个），与上述「建议最少 {need} 个」不同：高日发运营上请优先凑齐 {need} 个域再扩量。
        </>
      ) : null}
    </div>
  );
}
