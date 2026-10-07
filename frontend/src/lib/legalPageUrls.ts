import type { SiteLocale } from "../i18n/siteLocaleTypes";

export function legalPageUrls(locale: SiteLocale): { terms: string; privacy: string } {
  if (locale === "en") {
    return { terms: "/legal/terms-en.html", privacy: "/legal/privacy-en.html" };
  }
  return { terms: "/legal/terms-zh.html", privacy: "/legal/privacy-zh.html" };
}
