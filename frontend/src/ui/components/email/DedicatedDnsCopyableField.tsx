import React, { useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getSettingsEmailDedicatedStandaloneStrings } from "../../../i18n/settingsEmailDedicatedStandaloneI18n";
import { copyTextToClipboard, selectElementText } from "../../../lib/dedicatedDnsClipboard";

export function DedicatedDnsCopyableField(props: {
  value: string;
  title?: string;
  inputClassName?: string;
}) {
  const { value, title, inputClassName } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function handleSelect() {
    selectElementText(inputRef.current);
  }

  async function handleCopy() {
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <input
        ref={inputRef}
        readOnly
        value={value}
        title={title ?? value}
        onFocus={handleSelect}
        onClick={handleSelect}
        className={
          inputClassName ??
          "min-w-[6rem] flex-1 rounded border border-amber-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-900 outline-none focus:ring-1 focus:ring-amber-400"
        }
      />
      <button
        type="button"
        onClick={handleSelect}
        className="shrink-0 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-950 hover:bg-amber-50"
      >
        {sui.dnsSelectAll}
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="shrink-0 rounded border border-emerald-400 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100"
      >
        {copied ? sui.dnsCopiedBtn : sui.dnsCopyBtn}
      </button>
    </div>
  );
}
