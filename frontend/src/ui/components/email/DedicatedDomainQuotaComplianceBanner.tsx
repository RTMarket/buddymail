import { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getSettingsEmailDedicatedStandaloneStrings } from "../../../i18n/settingsEmailDedicatedStandaloneI18n";
import type { DedicatedEntitlementsSnapshot } from "../../../lib/dedicatedEntitlements";
import { formatDomainOverQuotaBlockMessage } from "../../../lib/dedicatedEntitlements";

export function DedicatedDomainQuotaComplianceBanner(props: {
  entitlements: DedicatedEntitlementsSnapshot | null;
  className?: string;
}) {
  const { entitlements, className } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  if (!entitlements?.blocksDedicatedSend) return null;
  const over = entitlements.domainOverBy ?? 0;
  const slots = entitlements.domainSlots ?? 0;
  return (
    <div
      className={`rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs text-rose-950 ${className ?? ""}`}
      role="alert"
    >
      <p className="font-semibold">{sui.quotaOverTitle}</p>
      <p className="mt-1 leading-relaxed">
        {locale === "en" ? sui.quotaOverBody(over, slots) : formatDomainOverQuotaBlockMessage(entitlements)}
      </p>
      <p className="mt-1.5 text-[11px] text-rose-800/90">{sui.quotaOverFootnote}</p>
    </div>
  );
}
