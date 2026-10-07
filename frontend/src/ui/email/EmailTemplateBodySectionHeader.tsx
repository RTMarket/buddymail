import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";
import { EmailBodyBackgroundPicker } from "./EmailBodyBackgroundPicker";

export function EmailTemplateBodySectionHeader(props: {
  ui: EmailTemplatesPageStrings;
  bodyBgPreset: string;
  bodyBgDepth: number;
  onBodyBgPreset: (id: string) => void;
  onBodyBgDepth: (depth: number) => void;
}) {
  const { ui, bodyBgPreset, bodyBgDepth, onBodyBgPreset, onBodyBgDepth } = props;

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{ui.bodySectionTitle}</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {ui.bodySectionFeatures.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-500" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full shrink-0 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 lg:max-w-[15rem]">
          <EmailBodyBackgroundPicker
            ui={ui}
            presetId={bodyBgPreset}
            depth={bodyBgDepth}
            onPresetId={onBodyBgPreset}
            onDepth={onBodyBgDepth}
          />
        </div>
      </div>
    </div>
  );
}
