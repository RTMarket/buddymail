import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useSiteLocale } from "../i18n/SiteLocaleContext";
import { getRequireAuthStrings } from "../i18n/shellI18n";

export function RequireAuth(props: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { locale } = useSiteLocale();
  const copy = useMemo(() => getRequireAuthStrings(locale), [locale]);
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"
          aria-hidden
        />
        <p className="text-sm text-slate-600">{copy.connecting}</p>
        <p className="max-w-sm text-xs text-slate-400">{copy.slowHint}</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/gate" replace state={{ from: location.pathname }} />;
  }
  return <>{props.children}</>;
}
