import { normalizeSiteLocale, SITE_LOCALE_STORAGE_KEY, type SiteLocale } from "./siteLocaleTypes";

export function readStoredSiteLocale(): SiteLocale {
  try {
    return normalizeSiteLocale(localStorage.getItem(SITE_LOCALE_STORAGE_KEY));
  } catch {
    return "zh";
  }
}

export function writeStoredSiteLocale(locale: SiteLocale): void {
  try {
    localStorage.setItem(SITE_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
}
