import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings, getSendListTabs } from "../../../i18n/emailCampaignStatsListI18n";

export const SEND_LIST_PAGE_SIZE = 50;
export const SEND_LIST_VISIBLE_ROWS = 10;

/** 固定列表可视区高度（约 10 行 + 表头），空数据时也占位 */
export const SEND_LIST_SCROLL_BOX =
  "mt-2 min-h-[22.75rem] max-h-[22.75rem] overflow-y-auto overflow-x-auto rounded-md border bg-white [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:shadow-[0_1px_0_0_rgba(226,232,240,1)]";

export type SendListTabId =
  | "opened"
  | "success"
  | "unconfirmed"
  | "failed"
  | "subscribe"
  | "unsubscribe"
  | "complaint"
  | "all";

export type SendListTabTheme = {
  id: SendListTabId;
  label: string;
  panelBorder: string;
  panelBg: string;
  theadBg: string;
  rowBorder: string;
  tabActive: string;
  tabIdle: string;
};

export function csvEscapeCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsvFile(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.map(csvEscapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscapeCell).join(","));
  }
  const body = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function contactToCsvRow(r: {
  industry: string;
  company: string;
  contactName: string;
  jobTitle: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  sendCount: number;
  openCount: number;
  bounceLikeCount: number;
}): unknown[] {
  return [
    r.industry,
    r.company,
    r.contactName,
    r.jobTitle,
    r.phone,
    r.fax,
    r.email,
    r.address,
    r.sendCount,
    r.openCount,
    r.bounceLikeCount
  ];
}

export function complianceEventToCsvRow(
  r: {
    industry?: string;
    company?: string;
    name?: string;
    jobTitle?: string;
    phone?: string;
    fax?: string;
    email: string;
    address?: string;
    country?: string;
    website?: string;
    linkedin?: string;
    businessLine?: string;
    emailStatus?: string;
    contactStatus?: string;
    reason?: string;
    createdAt?: string;
  },
  timeLabel: string
): unknown[] {
  return [
    r.industry ?? "",
    r.company ?? "",
    r.name ?? "",
    r.jobTitle ?? "",
    r.phone ?? "",
    r.fax ?? "",
    r.email,
    r.address ?? "",
    r.country ?? "",
    r.website ?? "",
    r.linkedin ?? "",
    r.businessLine ?? "",
    r.emailStatus ?? "",
    r.contactStatus ?? "",
    timeLabel,
    r.reason ?? ""
  ];
}

/** 退订/投诉列表：说明永久停发 + 删除入口 */
export function ComplianceListNotice(props: { variant: "unsubscribe" | "complaint"; children?: React.ReactNode }) {
  return props.children ? <>{props.children}</> : null;
}

export const COMPLIANCE_EVENT_TABLE_CLASS = "w-full min-w-[20rem] border-collapse text-xs";
export const COMPLIANCE_ACTION_TH_CLASS = "sticky right-0 z-[2] w-[5.5rem] whitespace-nowrap px-2 py-1.5 text-right shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)]";
export const COMPLIANCE_ACTION_TD_CLASS =
  "sticky right-0 z-[1] w-[5.5rem] whitespace-nowrap bg-white px-2 py-1.5 text-right shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.08)]";

export function listScrollHint(
  _sliceCount: number,
  _opts: { page: number; pageSize: number; total: number; totalPages: number }
) {
  return null;
}

export function SendListPager(props: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (next: number) => void;
}) {
  const { page, total, onPageChange } = props;
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const totalPages = Math.max(1, props.totalPages);
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600">
      <span>{listUi.pagerTotal(total, total > 0 ? page : 0, totalPages)}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          disabled={page <= 1 || total === 0}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          {listUi.prevPage}
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          disabled={page >= totalPages || total === 0}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          {listUi.nextPage}
        </button>
      </div>
    </div>
  );
}

export function SendListTabBar(props: {
  active: SendListTabId;
  counts: Record<SendListTabId, number>;
  onChange: (id: SendListTabId) => void;
}) {
  const { locale } = useSiteLocale();
  const tabs = useMemo(() => getSendListTabs(locale), [locale]);
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {tabs.map((tab) => {
        const n = props.counts[tab.id] ?? 0;
        const isActive = props.active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => props.onChange(tab.id)}
            className={`rounded-lg border px-2 py-2 text-center text-[11px] font-medium leading-snug transition-colors ${
              isActive ? tab.tabActive : tab.tabIdle
            }`}
          >
            <span className="block">{tab.label}</span>
            <span className="mt-0.5 block tabular-nums text-[10px] opacity-80">{listUi.tabCountBadge(n)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SendListPanelShell(props: {
  theme: SendListTabTheme;
  title: string;
  count: number;
  description?: React.ReactNode;
  toolbar?: React.ReactNode;
  scrollHint?: React.ReactNode;
  scrollClassName?: string;
  children: React.ReactNode;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  exportLabel?: string;
  exporting?: boolean;
  exportDisabled?: boolean;
  onExport?: () => void;
  deleteAllLabel?: string;
  deleteAllBusy?: boolean;
  deleteAllDisabled?: boolean;
  onDeleteAll?: () => void;
}) {
  const { locale } = useSiteLocale();
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const t = props.theme;
  return (
    <div className={`rounded-lg border p-3 ${t.panelBorder} ${t.panelBg}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {props.title}
            <span className="ml-1 tabular-nums font-normal text-slate-600">{listUi.tabCountBadge(props.count)}</span>
          </div>
          {props.description ? <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{props.description}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.toolbar}
          {props.onDeleteAll && props.total > 0 ? (
            <button
              type="button"
              className="rounded border border-red-400 bg-white px-2 py-1 text-[11px] font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
              disabled={props.deleteAllDisabled || props.deleteAllBusy || props.exporting}
              onClick={props.onDeleteAll}
            >
              {props.deleteAllBusy ? listUi.deleting : (props.deleteAllLabel ?? listUi.deleteAll)}
            </button>
          ) : null}
          {props.onExport ? (
            <button
              type="button"
              className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              disabled={props.exportDisabled || props.exporting}
              onClick={props.onExport}
            >
              {props.exporting ? listUi.exporting : (props.exportLabel ?? listUi.exportCsv)}
            </button>
          ) : null}
        </div>
      </div>
      {props.scrollHint}
      <div className={`${SEND_LIST_SCROLL_BOX} ${props.scrollClassName ?? t.rowBorder}`}>{props.children}</div>
      <SendListPager
        page={props.page}
        totalPages={props.totalPages}
        total={props.total}
        onPageChange={props.onPageChange}
      />
    </div>
  );
}
