import { clsx } from "clsx";
import { useMemo } from "react";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getSiteLanguageSwitcherStrings } from "../../i18n/shellI18n";

/** 注册/登录页 · 全站 locale 入口（写入 localStorage，登录后各页只读） */
export function SiteLanguageSwitcher(props: { className?: string; compact?: boolean }) {
  const { locale, setLocale } = useSiteLocale();
  const strings = useMemo(() => getSiteLanguageSwitcherStrings(locale), [locale]);

  if (props.compact) {
    return (
      <select
        className={clsx(
          "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-slate-400",
          props.className
        )}
        value={locale}
        aria-label={strings.label}
        onChange={(e) => setLocale(e.target.value === "en" ? "en" : "zh")}
      >
        <option value="zh">{strings.zhOption}</option>
        <option value="en">{strings.enOption}</option>
      </select>
    );
  }

  return (
    <label className={clsx("grid gap-1.5", props.className)}>
      <span className="text-sm text-slate-700">{strings.label}</span>
      <select
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
        value={locale}
        aria-label={strings.label}
        onChange={(e) => setLocale(e.target.value === "en" ? "en" : "zh")}
      >
        <option value="zh">{strings.zhOption}</option>
        <option value="en">{strings.enOption}</option>
      </select>
    </label>
  );
}
