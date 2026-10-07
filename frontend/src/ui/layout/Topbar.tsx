import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getTopbarStrings } from "../../i18n/navI18n";
import { SiteLanguageSwitcher } from "../components/SiteLanguageSwitcher";

export function Topbar() {
  const { user, logout } = useAuth();
  const { locale } = useSiteLocale();
  const topbar = getTopbarStrings(locale);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!user) {
    return (
      <div className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3" />
    );
  }

  return (
    <div className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex min-w-0 items-center justify-end gap-3">
        <SiteLanguageSwitcher compact />
        <div className="relative" ref={wrapRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 shadow-sm hover:bg-slate-100"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white shadow-inner"
              title={user.nickname}
            >
              {user.avatarSeed}
            </div>
            <span className="max-w-[140px] truncate text-sm font-semibold text-slate-900">{user.nickname}</span>
            <span className="text-slate-400" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              <Link
                role="menuitem"
                to="/account/center"
                className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                {topbar.accountCenter}
              </Link>
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate("/gate", { replace: true });
                }}
              >
                {topbar.logout}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
