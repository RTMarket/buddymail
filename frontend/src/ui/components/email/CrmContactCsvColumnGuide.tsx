import React, { useMemo } from "react";
import { CRM_CONTACT_IMPORT_COLUMNS, type CsvColumnMappingSnapshot } from "../../../lib/crmContactImportColumns";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getCrmCsvColumnGuideStrings } from "../../../i18n/crmCsvColumnGuideI18n";

export function CrmContactCsvColumnGuide(props: {
  mapping?: CsvColumnMappingSnapshot | null;
  batchSize?: number;
}) {
  const { mapping = null, batchSize = 80 } = props;
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getCrmCsvColumnGuideStrings(locale), [locale]);
  const introTail = ui.introTail.replace("{batchSize}", String(batchSize));

  return (
    <div className="mt-2 space-y-2">
      <p className="rounded-md border border-slate-200/90 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
        {ui.introLead}
        <strong className="font-semibold text-slate-800">{ui.introStrong}</strong>
        {introTail}
      </p>

      <details className="rounded-md border border-amber-200/90 bg-amber-50/50">
        <summary className="cursor-pointer list-none px-2.5 py-2 text-[11px] font-semibold text-amber-950 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">{ui.badge}</span>
            {ui.summaryTitle}
            <span className="font-normal text-amber-900/70">{ui.summaryToggle}</span>
          </span>
        </summary>
        <div className="space-y-1.5 border-t border-amber-200/60 px-2.5 pb-2.5 pt-2 text-[10px] leading-relaxed text-slate-700">
          <p>
            <span className="font-semibold text-amber-950">{ui.headerRule}</span>
            {ui.headerRuleTail}
          </p>
          <p>
            {ui.emailColumnRule}
            <strong className="text-amber-950">{ui.emailColumnStrong}</strong>
            {ui.emailColumnTail}
          </p>
          <p className="rounded border border-amber-100 bg-white/80 px-2 py-1.5 text-amber-950">
            {ui.countExample}
            <strong>{ui.countExampleStrong}</strong>
            {ui.countExampleEnd}
          </p>
          <p className="text-slate-600">{ui.ignoredNote}</p>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {CRM_CONTACT_IMPORT_COLUMNS.map((col) => (
              <span
                key={col.field}
                className={`inline-flex items-center rounded border px-1.5 py-0.5 ${
                  col.required
                    ? "border-amber-300 bg-amber-50 font-medium text-amber-950"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                title={col.aliases.join(" · ")}
              >
                {ui.columnLabel(col)}
                {col.required ? " *" : ""}
              </span>
            ))}
          </div>
        </div>
      </details>

      {mapping ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px]">
          {mapping.recognized.length > 0 ? (
            <p className="text-emerald-800">
              {ui.mappedPrefix(mapping.recognized.length)}
              {mapping.recognized
                .map((c) => `「${c.header}」→ ${c.titleZh}/${c.titleEn}`)
                .join(ui.mappedJoin)}
            </p>
          ) : null}
          {mapping.ignored.length > 0 ? (
            <p className="text-amber-800">
              {ui.ignoredPrefix}
              {mapping.ignored.map((h) => `「${h}」`).join(locale === "en" ? ", " : "、")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
