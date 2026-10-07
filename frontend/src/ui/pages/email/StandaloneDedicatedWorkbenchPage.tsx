import { useCallback, useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getStandaloneDedicatedWorkbenchStrings } from "../../../i18n/standaloneDedicatedWorkbenchI18n";
import { apiJson } from "../../../lib/api";
import {
  mergeEntitlementsWithUsage,
  parseEntitlementsSnapshot,
  type DedicatedEntitlementsSnapshot
} from "../../../lib/dedicatedEntitlements";
import {
  standaloneLicenseDailySendLimit,
  standaloneLicensePlanTierId
} from "../../../lib/standaloneDeploy";
import { resolveStandalonePlanEntitlements } from "../../../lib/standalonePlanEntitlements";
import { useProductModules } from "../../../state/ProductModulesContext";
import { DedicatedEntitlementsQuota } from "../../components/email/DedicatedEntitlementsQuota";
import { PageShell } from "../../components/PageShell";
import { SectionCard } from "../../components/SectionCard";
import { SettingsEmailDedicatedServerSection } from "./SettingsEmailDedicatedServerSection";

function defaultEntitlements(): DedicatedEntitlementsSnapshot {
  return mergeEntitlementsWithUsage(standaloneLicenseDailySendLimit(), 0, 0);
}

/**
 * 独立站 · 专机装机工作台（无 SaaS 支付/多通道导航；LICENSE 套餐已开通）
 */
export function StandaloneDedicatedWorkbenchPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getStandaloneDedicatedWorkbenchStrings(locale), [locale]);

  const [entitlements, setEntitlements] = useState<DedicatedEntitlementsSnapshot | null>(() =>
    defaultEntitlements()
  );

  const loadEntitlements = useCallback(async () => {
    try {
      const r = await apiJson<{ ok: boolean; entitlements?: unknown }>("/api/email/dedicated-servers");
      const snap = parseEntitlementsSnapshot(r.entitlements);
      setEntitlements(snap ?? defaultEntitlements());
    } catch {
      setEntitlements(defaultEntitlements());
    }
  }, []);

  useEffect(() => {
    void loadEntitlements();
  }, [loadEntitlements]);

  const onEntitlementsChange = useCallback((snap: DedicatedEntitlementsSnapshot | null) => {
    setEntitlements(snap ?? defaultEntitlements());
  }, []);

  const dailyLimit = entitlements?.dailyLimit ?? standaloneLicenseDailySendLimit();
  const laneCount = entitlements?.vpsGroupSlots ?? 1;
  const planPreset = resolveStandalonePlanEntitlements(standaloneLicensePlanTierId());
  const domainSlotCount = entitlements?.domainSlots ?? planPreset?.domainSlots ?? 1;
  const licenseSlotsMismatch =
    planPreset != null &&
    entitlements != null &&
    entitlements.domainSlots > 0 &&
    entitlements.domainSlots < planPreset.domainSlots;

  return (
    <PageShell title={ui.pageTitle} description={ui.pageDescription}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{ui.dailyLimitLabel}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {dailyLimit.toLocaleString()} {ui.dailyLimitUnit}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{ui.laneCountLabel}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {laneCount} {ui.laneCountUnit}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{ui.domainSlotsLabel}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {domainSlotCount} {ui.domainSlotsUnit}
          </div>
        </div>
      </div>

      {licenseSlotsMismatch && planPreset ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
          <span className="font-semibold">
            {ui.licenseSlotsMismatch(planPreset.domainSlots, domainSlotCount)}
          </span>
          <span className="mt-1 block">{ui.licenseSlotsMismatchHint}</span>
        </p>
      ) : null}

      {entitlements ? (
        <DedicatedEntitlementsQuota snapshot={entitlements} className="mb-4" />
      ) : null}

      {laneCount > 1 ? (
        <p className="mb-4 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-violet-950">
          {ui.multiLaneBanner(laneCount)}
        </p>
      ) : null}

      <SectionCard title={ui.sectionTitle} description={ui.sectionDescription}>
        <SettingsEmailDedicatedServerSection
          variant="medium"
          standaloneWorkbench
          onEntitlementsChange={onEntitlementsChange}
        />
      </SectionCard>
    </PageShell>
  );
}
