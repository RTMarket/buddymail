import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { readStoredSiteLocale, writeStoredSiteLocale } from "./siteLocaleStorage";
import type { SiteLocale } from "./siteLocaleTypes";

type SiteLocaleContextValue = {
  locale: SiteLocale;
  setLocale: (locale: SiteLocale) => void;
};

const SiteLocaleContext = createContext<SiteLocaleContextValue | null>(null);

export function SiteLocaleProvider(props: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SiteLocale>(() => readStoredSiteLocale());

  const setLocale = useCallback((next: SiteLocale) => {
    setLocaleState(next);
    writeStoredSiteLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <SiteLocaleContext.Provider value={value}>{props.children}</SiteLocaleContext.Provider>;
}

export function useSiteLocale(): SiteLocaleContextValue {
  const ctx = useContext(SiteLocaleContext);
  if (!ctx) throw new Error("useSiteLocale must be used within SiteLocaleProvider");
  return ctx;
}
