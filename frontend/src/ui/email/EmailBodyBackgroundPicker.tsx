import {
  BODY_BG_PRESETS,
  resolveBodyBackgroundColor,
  type BodyBgPreset
} from "../../lib/emailTemplateBodyBackground";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";

export function EmailBodyBackgroundPicker(props: {
  ui: EmailTemplatesPageStrings;
  presetId: string;
  depth: number;
  onPresetId: (id: string) => void;
  onDepth: (depth: number) => void;
}) {
  const { ui, presetId, depth, onPresetId, onDepth } = props;
  const { locale } = useSiteLocale();
  const isZh = locale === "zh";
  const color = resolveBodyBackgroundColor(presetId, depth);

  return (
    <div className="flex max-w-[min(100%,20rem)] flex-col gap-1.5 text-left">
      <span className="text-[11px] font-medium text-slate-600">{ui.bodyBgLabel}</span>
      <div className="flex flex-wrap gap-1">
        {BODY_BG_PRESETS.map((p: BodyBgPreset) => (
          <button
            key={p.id}
            type="button"
            title={isZh ? p.labelZh : p.labelEn}
            className={`h-6 w-6 rounded border ${
              presetId === p.id ? "border-violet-600 ring-1 ring-violet-400" : "border-slate-300"
            }`}
            style={{ backgroundColor: resolveBodyBackgroundColor(p.id, depth) }}
            onClick={() => onPresetId(p.id)}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[10px] text-slate-500">
        <span className="shrink-0">{ui.bodyBgLight}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={depth}
          className="min-w-0 flex-1"
          onChange={(e) => onDepth(Number(e.target.value))}
        />
        <span className="shrink-0">{ui.bodyBgDeep}</span>
      </label>
      <span className="text-[10px] text-slate-400">{ui.bodyBgHint}</span>
      <span
        className="inline-block h-3 w-full rounded border border-slate-200"
        style={{ backgroundColor: color }}
        title={color}
      />
    </div>
  );
}
