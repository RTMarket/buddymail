import React, { useEffect, useMemo, useState } from "react";
import {
  EMAIL_STARTER_PRESETS_EN,
  EMAIL_STARTER_PRESETS_ZH,
  type EmailStarterPreset
} from "./emailStarterPresets";
import { InlineConfirmBar } from "../components/InlineFeedbackPanels";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import type { SiteLocale } from "../../i18n/siteLocaleTypes";

function StarterPresetThumbnail({ html }: { html: string }) {
  return (
    <div
      className="relative mx-auto h-[128px] w-full overflow-hidden rounded-md border border-slate-200/90 bg-white shadow-inner"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 w-[600px] select-none"
        style={{
          transform: "translateX(-50%) scale(0.21)",
          transformOrigin: "top center"
        }}
      >
        <div
          className="text-left [&_a]:pointer-events-none [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function getPresetSectionStrings(locale: SiteLocale) {
  if (locale === "en") {
    return {
      zhBadge: "Chinese",
      enBadge: "English",
      zhHint: "4 layouts · open editor on the right",
      enHint: "4 layouts · open editor on the right",
      applyZh: "Apply →",
      applyEn: "Apply →",
      showAll: "Show all 8 presets",
      hideExtra: "Show locale presets only",
      confirmReplace: (label: string) =>
        `Replace the current body with “${label}”? Unsaved edits will be lost.`
    };
  }
  return {
    zhBadge: "中文",
    enBadge: "English",
    zhHint: "4 套 · 点击套用后到右侧编辑",
    enHint: "4 layouts · open editor on the right",
    applyZh: "套用编辑 →",
    applyEn: "Apply →",
    showAll: "显示全部 8 套",
    hideExtra: "仅显示当前语言预设",
    confirmReplace: (label: string) => `将用「${label}」替换当前正文，未保存的修改会丢失。确定吗？`
  };
}

type PresetBlockProps = {
  badge: string;
  badgeClass: string;
  hint: string;
  presets: EmailStarterPreset[];
  activeStarterPresetId: string | null;
  applyLabel: string;
  onSelect: (preset: EmailStarterPreset) => void;
};

function PresetBlock({
  badge,
  badgeClass,
  hint,
  presets,
  activeStarterPresetId,
  applyLabel,
  onSelect
}: PresetBlockProps) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold text-white ${badgeClass}`}>{badge}</span>
        <span className="text-xs text-slate-600">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={
              activeStarterPresetId === preset.id
                ? "flex flex-col gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 p-2.5 text-left shadow-md ring-2 ring-emerald-500/25 transition hover:bg-emerald-50/90"
                : "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-slate-50/90"
            }
            onClick={() => onSelect(preset)}
          >
            <StarterPresetThumbnail html={preset.bodyHtml} />
            <div className="min-w-0 px-0.5">
              <div className="truncate text-xs font-semibold text-slate-900">{preset.label}</div>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{preset.blurb}</p>
              <span className="mt-1 inline-block text-[10px] font-medium text-emerald-700">{applyLabel}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export type EmailStarterPresetsSectionProps = {
  activeStarterPresetId: string | null;
  presetConfirm: EmailStarterPreset | null;
  onCancelConfirm: () => void;
  onConfirmApply: () => void;
  onRequestApply: (preset: EmailStarterPreset) => void;
};

export function EmailStarterPresetsSection({
  activeStarterPresetId,
  presetConfirm,
  onCancelConfirm,
  onConfirmApply,
  onRequestApply
}: EmailStarterPresetsSectionProps) {
  const { locale } = useSiteLocale();
  const copy = useMemo(() => getPresetSectionStrings(locale), [locale]);
  const [showAllPresets, setShowAllPresets] = useState(false);

  useEffect(() => {
    setShowAllPresets(false);
  }, [locale]);

  const primaryPresets = locale === "en" ? EMAIL_STARTER_PRESETS_EN : EMAIL_STARTER_PRESETS_ZH;
  const secondaryPresets = locale === "en" ? EMAIL_STARTER_PRESETS_ZH : EMAIL_STARTER_PRESETS_EN;

  return (
    <div className="max-h-[min(52rem,85vh)] space-y-6 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
      {presetConfirm ? (
        <InlineConfirmBar
          message={copy.confirmReplace(presetConfirm.label)}
          busy={false}
          onCancel={onCancelConfirm}
          onConfirm={onConfirmApply}
        />
      ) : null}

      <PresetBlock
        badge={locale === "en" ? copy.enBadge : copy.zhBadge}
        badgeClass={locale === "en" ? "bg-indigo-700" : "bg-slate-900"}
        hint={locale === "en" ? copy.enHint : copy.zhHint}
        presets={primaryPresets}
        activeStarterPresetId={activeStarterPresetId}
        applyLabel={locale === "en" ? copy.applyEn : copy.applyZh}
        onSelect={onRequestApply}
      />

      {showAllPresets ? (
        <PresetBlock
          badge={locale === "en" ? copy.zhBadge : copy.enBadge}
          badgeClass={locale === "en" ? "bg-slate-900" : "bg-indigo-700"}
          hint={locale === "en" ? copy.zhHint : copy.enHint}
          presets={secondaryPresets}
          activeStarterPresetId={activeStarterPresetId}
          applyLabel={locale === "en" ? copy.applyZh : copy.applyEn}
          onSelect={onRequestApply}
        />
      ) : null}

      <div className="flex justify-center border-t border-slate-100 pt-4">
        <button
          type="button"
          className="text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          onClick={() => setShowAllPresets((v) => !v)}
        >
          {showAllPresets ? copy.hideExtra : copy.showAll}
        </button>
      </div>
    </div>
  );
}
