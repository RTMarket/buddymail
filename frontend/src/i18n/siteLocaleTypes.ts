export type SiteLocale = "zh" | "en";

export const SITE_LOCALE_STORAGE_KEY = "bss_site_locale_v1";

export function normalizeSiteLocale(raw: string | null | undefined): SiteLocale {
  return raw === "en" ? "en" : "zh";
}

export function intlLocaleTag(locale: SiteLocale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function formatSiteLocaleDateTime(
  iso: string | null | undefined,
  locale: SiteLocale,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intlLocaleTag(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...opts
  });
}
