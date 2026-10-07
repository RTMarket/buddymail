import React, { useMemo } from "react";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getShellConfirmStrings } from "../../i18n/shellI18n";

/** 路由懒加载占位：仅首屏分包用，不影响业务逻辑 */
export function RoutePageFallback() {
  const { locale } = useSiteLocale();
  const shellUi = useMemo(() => getShellConfirmStrings(locale), [locale]);
  return (
    <div className="flex min-h-[12rem] items-center justify-center p-6">
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600"
        aria-label={shellUi.pageLoadingAria}
      />
    </div>
  );
}
