import React, { useMemo } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignStatsListStrings, getSendListTabs } from "../../../i18n/emailCampaignStatsListI18n";
import type { SendContactRow } from "./CampaignSendRecipientsTable";
import {
  COMPLIANCE_ACTION_TD_CLASS,
  COMPLIANCE_ACTION_TH_CLASS,
  COMPLIANCE_EVENT_TABLE_CLASS,
  ComplianceListNotice,
  SEND_LIST_PAGE_SIZE,
  SendListPanelShell,
  SendListTabId,
  listScrollHint
} from "./campaignSendListUi";

const DELETE_BTN_CLASS =
  "shrink-0 rounded border border-red-400 bg-white px-2.5 py-1 text-[11px] font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50";

const PAGE_SIZE = SEND_LIST_PAGE_SIZE;

type EventItem = {
  id: number;
  contactId?: number | null;
  email: string;
  reason?: string;
  company?: string;
  name?: string;
};

type Paged<T> = {
  slice: T[];
  page: number;
  totalPages: number;
  total: number;
};

type SliceTabId = "opened" | "success" | "failed" | "unconfirmed";
type ComplianceTabId = "subscribe" | "unsubscribe" | "complaint";

export type CampaignSendListActivePanelProps = {
  activeTab: SendListTabId;
  sliceTabLoading: Partial<Record<SliceTabId, boolean>>;
  sliceTabEmptyMessage: Partial<Record<SliceTabId, string>>;
  complianceTabLoading: Partial<Record<ComplianceTabId, boolean>>;
  allEmptyMessage: string;
  summaryTruncated: boolean;
  sortByOpensDesc: boolean;
  onSortByOpensDesc: (v: boolean) => void;
  openedRows: SendContactRow[];
  openedPaged: Paged<SendContactRow>;
  onOpenedPage: (p: number) => void;
  successRows: SendContactRow[];
  successPaged: Paged<SendContactRow>;
  onSuccessPage: (p: number) => void;
  unconfirmedRows: SendContactRow[];
  unconfirmedPaged: Paged<SendContactRow>;
  onUnconfirmedPage: (p: number) => void;
  failedRows: SendContactRow[];
  failedPaged: Paged<SendContactRow>;
  onFailedPage: (p: number) => void;
  selectedFailedContactIds: number[];
  allFailedSelected: boolean;
  bulkDeleting: boolean;
  onToggleSelectAllFailed: (checked: boolean) => void;
  onToggleSelectFailed: (id: number, checked: boolean) => void;
  onRemoveFailedSelected: () => void;
  subscribeTotal: number;
  subscribePaged: { slice: EventItem[]; page: number; totalPages: number; total: number };
  onSubscribePage: (p: number) => void;
  unsubscribeTotal: number;
  unsubscribePaged: { slice: EventItem[]; page: number; totalPages: number; total: number };
  onUnsubscribePage: (p: number) => void;
  complaintItems: EventItem[];
  complaintPage: number;
  complaintTotal: number;
  complaintTotalPages: number;
  onComplaintPage: (p: number) => void;
  allRows: SendContactRow[];
  allPage: number;
  allTotal: number;
  allTotalPages: number;
  allLoading: boolean;
  hasAllData: boolean;
  onAllPage: (p: number) => void;
  exportingTab: SendListTabId | null;
  activeTabForExport: SendListTabId;
  onExportCsv: () => void;
  exportDisabled: boolean;
  deleteLocked?: boolean;
  deleteAllBusy: boolean;
  deleteAllDisabled: boolean;
  onDeleteAll: () => void;
  deleteConfirmBusy: boolean;
  deletingContactId: number | null;
  deletingSubscribeEventId: number | null;
  deletingUnsubscribeEventId: number | null;
  deletingComplaintEventId: number | null;
  renderDeleteConfirm: (anchor: string, className?: string) => React.ReactNode;
  onRemoveOpened: (row: SendContactRow) => void;
  onRemoveSuccess: (row: SendContactRow) => void;
  onRemoveFailed: (row: SendContactRow) => void;
  onRemoveSubscribe: (item: EventItem) => void;
  onRemoveUnsubscribe: (item: EventItem) => void;
  onRemoveComplaint: (item: EventItem) => void;
  onRemoveAllContact: (row: SendContactRow) => void;
};

function EmptyBody(props: { colSpan: number; message: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={props.colSpan} className="h-[20rem] align-middle text-center text-slate-500">
          {props.message}
        </td>
      </tr>
    </tbody>
  );
}

function ListTableBody(props: {
  colSpan: number;
  loading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  detailLoading?: string;
  children: React.ReactNode;
}) {
  if (props.loading && props.isEmpty) {
    return <EmptyBody colSpan={props.colSpan} message={props.detailLoading ?? "明细加载中…"} />;
  }
  if (props.isEmpty) {
    return <EmptyBody colSpan={props.colSpan} message={props.emptyMessage} />;
  }
  return <>{props.children}</>;
}

export function CampaignSendListActivePanel(props: CampaignSendListActivePanelProps) {
  const { locale } = useSiteLocale();
  const tabs = useMemo(() => getSendListTabs(locale), [locale]);
  const listUi = useMemo(() => getEmailCampaignStatsListStrings(locale), [locale]);
  const theme = tabs.find((t) => t.id === props.activeTab) ?? tabs[0];
  const exporting = props.exportingTab === props.activeTabForExport;
  const shell = (
    title: string,
    count: number,
    description: React.ReactNode,
    toolbar: React.ReactNode | undefined,
    page: number,
    totalPages: number,
    total: number,
    onPage: (p: number) => void,
    sliceLen: number,
    table: React.ReactNode,
    tableClassName = "w-full border-collapse text-xs",
    panelOpts: { enableDeleteAll?: boolean } = {}
  ) => (
    <SendListPanelShell
      theme={theme}
      title={title}
      count={count}
      description={description}
      toolbar={toolbar}
      scrollHint={listScrollHint(sliceLen, { page, pageSize: PAGE_SIZE, total, totalPages })}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPage}
      exporting={exporting}
      exportDisabled={props.exportDisabled}
      onExport={props.onExportCsv}
      deleteAllBusy={props.deleteAllBusy}
      deleteAllDisabled={props.deleteLocked || props.deleteAllDisabled || total <= 0}
      onDeleteAll={panelOpts.enableDeleteAll === false ? undefined : props.onDeleteAll}
    >
      <table className={tableClassName}>{table}</table>
    </SendListPanelShell>
  );

  switch (props.activeTab) {
    case "opened":
      return shell(
        listUi.panelOpenedTitle,
        props.openedPaged.total,
        props.summaryTruncated ? listUi.panelOpenedTruncated : listUi.panelOpenedDesc,
        undefined,
        props.openedPaged.page,
        props.openedPaged.totalPages,
        props.openedPaged.total,
        props.onOpenedPage,
        props.openedPaged.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colContact}</th>
              <th className="px-2 py-1.5">{listUi.colCompany}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colOpens}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colAction}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={6}
            loading={!!props.sliceTabLoading.opened}
            isEmpty={props.openedPaged.slice.length === 0}
            emptyMessage={props.sliceTabEmptyMessage.opened ?? listUi.emptyOpened}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.openedPaged.slice.map((r, idx) => (
                <tr key={`opened-${r.contactId}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(props.openedPaged.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[10rem] truncate px-2 py-1.5" title={r.contactName}>
                    {r.contactName || "—"}
                  </td>
                  <td className="max-w-[11rem] truncate px-2 py-1.5" title={r.company}>
                    {r.company || "—"}
                  </td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono" title={r.email}>
                    {r.email}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.openCount}</td>
                  <td className="px-2 py-1.5 text-right">
                    {props.renderDeleteConfirm(`opened-row-${r.contactId}`, "mt-0 max-w-[15rem] text-left") ?? (
                      <button
                        type="button"
                        className="rounded border border-sky-400 bg-white px-2 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50"
                        disabled={props.deleteLocked || props.deletingContactId === r.contactId || props.deleteConfirmBusy}
                        onClick={() => props.onRemoveOpened(r)}
                      >
                        {props.deletingContactId === r.contactId ? listUi.deleting : listUi.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>
      );

    case "success":
      return shell(
        listUi.panelSuccessTitle,
        props.successPaged.total,
        listUi.panelSuccessDesc,
        undefined,
        props.successPaged.page,
        props.successPaged.totalPages,
        props.successPaged.total,
        props.onSuccessPage,
        props.successPaged.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colContact}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colSuccessCount}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={4}
            loading={!!props.sliceTabLoading.success}
            isEmpty={props.successPaged.slice.length === 0}
            emptyMessage={props.sliceTabEmptyMessage.success ?? listUi.emptySuccess}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.successPaged.slice.map((r, idx) => (
                <tr key={`succ-${r.contactId}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(props.successPaged.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[11rem] truncate px-2 py-1.5">{r.contactName || "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono">{r.email}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                    {Math.max(0, r.sendCount - r.bounceLikeCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>,
        "w-full border-collapse text-xs",
        { enableDeleteAll: false }
      );

    case "unconfirmed":
      return shell(
        listUi.panelUnconfirmedTitle,
        props.unconfirmedPaged.total,
        listUi.panelUnconfirmedDesc,
        undefined,
        props.unconfirmedPaged.page,
        props.unconfirmedPaged.totalPages,
        props.unconfirmedPaged.total,
        props.onUnconfirmedPage,
        props.unconfirmedPaged.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colContact}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colUnconfirmed}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={4}
            loading={!!props.sliceTabLoading.unconfirmed}
            isEmpty={props.unconfirmedPaged.slice.length === 0}
            emptyMessage={props.sliceTabEmptyMessage.unconfirmed ?? listUi.emptyUnconfirmed}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.unconfirmedPaged.slice.map((r, idx) => (
                <tr key={`unconfirmed-${r.contactId}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(props.unconfirmedPaged.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[11rem] truncate px-2 py-1.5">{r.contactName || "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono">{r.email}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-cyan-700">
                    {Math.max(0, r.sendCount - r.bounceLikeCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>
      );

    case "failed":
      return shell(
        listUi.panelFailedTitle,
        props.failedPaged.total,
        listUi.panelFailedDesc,
        (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-50"
                disabled={props.deleteLocked || props.bulkDeleting || props.selectedFailedContactIds.length === 0}
                onClick={props.onRemoveFailedSelected}
              >
                {listUi.deleteSelected(props.selectedFailedContactIds.length)}
              </button>
              <p className="w-full text-[10px] leading-relaxed text-slate-500">{listUi.bulkDeleteHint}</p>
            </div>
            {props.renderDeleteConfirm("failed-bulk", "w-full max-w-md")}
          </>
        ),
        props.failedPaged.page,
        props.failedPaged.totalPages,
        props.failedPaged.total,
        props.onFailedPage,
        props.failedPaged.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={props.allFailedSelected}
                  disabled={props.deleteLocked}
                  onChange={(e) => props.onToggleSelectAllFailed(e.target.checked)}
                  aria-label={listUi.selectAllPageAria}
                />
              </th>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colFailed}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colAction}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={5}
            loading={!!props.sliceTabLoading.failed}
            isEmpty={props.failedPaged.slice.length === 0}
            emptyMessage={props.sliceTabEmptyMessage.failed ?? listUi.emptyFailed}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.failedPaged.slice.map((r, idx) => (
                <tr key={`fail-${r.contactId}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={props.selectedFailedContactIds.includes(r.contactId)}
                      disabled={props.deleteLocked}
                      onChange={(e) => props.onToggleSelectFailed(r.contactId, e.target.checked)}
                    />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{(props.failedPaged.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono">{r.email}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-rose-700">{r.bounceLikeCount}</td>
                  <td className="px-2 py-1.5 text-right">
                    {props.renderDeleteConfirm(`failed-row-${r.contactId}`, "mt-0 max-w-[15rem] text-left") ?? (
                      <button
                        type="button"
                        className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-50"
                        disabled={props.deleteLocked || props.deletingContactId === r.contactId || props.deleteConfirmBusy}
                        onClick={() => props.onRemoveFailed(r)}
                      >
                        {listUi.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>
      );

    case "subscribe": {
      const sp = props.subscribePaged;
      return shell(
        listUi.tabSubscribe,
        props.subscribeTotal,
        listUi.panelSubscribeDesc,
        undefined,
        sp.page,
        sp.totalPages,
        sp.total,
        props.onSubscribePage,
        sp.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colEmailContact}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colAction}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={3}
            loading={!!props.complianceTabLoading.subscribe}
            isEmpty={sp.slice.length === 0}
            emptyMessage={listUi.emptySubscribe}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {sp.slice.map((c, idx) => (
                <tr key={`sub-${c.id}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(sp.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[14rem] px-2 py-1.5">
                    <div className="truncate font-mono">{c.email}</div>
                    {c.name || c.company ? (
                      <div className="truncate text-[10px] opacity-80">
                        {[c.name, c.company].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {props.renderDeleteConfirm(`subscribe-row-${c.id}`, "mt-0 max-w-[15rem] text-left") ?? (
                      <button
                        type="button"
                        className="rounded border border-teal-500 bg-white px-2 py-1 text-[11px] disabled:opacity-50"
                        disabled={props.deleteLocked || props.deletingSubscribeEventId === c.id || props.deleteConfirmBusy}
                        onClick={() => props.onRemoveSubscribe(c)}
                      >
                        {listUi.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>
      );
    }

    case "unsubscribe": {
      const up = props.unsubscribePaged;
      return shell(
        listUi.tabUnsubscribe,
        props.unsubscribeTotal,
        <ComplianceListNotice variant="unsubscribe" />,
        undefined,
        up.page,
        up.totalPages,
        up.total,
        props.onUnsubscribePage,
        up.slice.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colEmailContact}</th>
              <th className={`${theme.theadBg} ${COMPLIANCE_ACTION_TH_CLASS}`}>{listUi.colAction}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={3}
            loading={!!props.complianceTabLoading.unsubscribe}
            isEmpty={up.slice.length === 0}
            emptyMessage={listUi.emptyUnsubscribe}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {up.slice.map((c, idx) => (
                <tr key={`unsub-${c.id}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(up.page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[14rem] px-2 py-1.5">
                    <div className="truncate font-mono">{c.email}</div>
                    {c.name || c.company ? (
                      <div className="truncate text-[10px] opacity-80">
                        {[c.name, c.company].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className={COMPLIANCE_ACTION_TD_CLASS}>
                    {props.renderDeleteConfirm(`unsubscribe-row-${c.id}`, "mt-0 max-w-[15rem] text-left") ?? (
                      <button
                        type="button"
                        className={DELETE_BTN_CLASS}
                        disabled={props.deleteLocked || props.deletingUnsubscribeEventId === c.id || props.deleteConfirmBusy}
                        onClick={() => props.onRemoveUnsubscribe(c)}
                      >
                        {listUi.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>,
        COMPLIANCE_EVENT_TABLE_CLASS
      );
    }

    case "complaint":
      return shell(
        listUi.tabComplaint,
        props.complaintTotal,
        <ComplianceListNotice variant="complaint" />,
        undefined,
        props.complaintPage,
        props.complaintTotalPages,
        props.complaintTotal,
        props.onComplaintPage,
        props.complaintItems.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndex}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className={`${theme.theadBg} ${COMPLIANCE_ACTION_TH_CLASS}`}>{listUi.colAction}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={3}
            loading={!!props.complianceTabLoading.complaint}
            isEmpty={props.complaintItems.length === 0}
            emptyMessage={listUi.emptyComplaint}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.complaintItems.map((c, idx) => (
                <tr key={`comp-${c.id}-${idx}`} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5 tabular-nums">{(props.complaintPage - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono">{c.email}</td>
                  <td className={COMPLIANCE_ACTION_TD_CLASS}>
                    {props.renderDeleteConfirm(`complaint-row-${c.id}`, "mt-0 max-w-[15rem] text-left") ?? (
                      <button
                        type="button"
                        className={DELETE_BTN_CLASS}
                        disabled={props.deleteLocked || props.deletingComplaintEventId === c.id || props.deleteConfirmBusy}
                        onClick={() => props.onRemoveComplaint(c)}
                      >
                        {listUi.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>,
        COMPLIANCE_EVENT_TABLE_CLASS
      );

    case "all":
      return shell(
        listUi.tabAll,
        props.allTotal,
        (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={props.sortByOpensDesc}
              onChange={(e) => props.onSortByOpensDesc(e.target.checked)}
            />
            <span>{listUi.sortByOpensDesc}</span>
          </label>
        ),
        undefined,
        props.allPage,
        props.allTotalPages,
        props.allTotal,
        props.onAllPage,
        props.allRows.length,
        <>
          <thead>
            <tr className={`${theme.theadBg} text-left text-slate-600`}>
              <th className="px-2 py-1.5">{listUi.colIndustry}</th>
              <th className="px-2 py-1.5">{listUi.colEnterprise}</th>
              <th className="px-2 py-1.5">{listUi.colContact}</th>
              <th className="px-2 py-1.5">{listUi.colJobTitle}</th>
              <th className="px-2 py-1.5">{listUi.colPhone}</th>
              <th className="px-2 py-1.5">{listUi.colEmail}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colSend}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colOpens}</th>
              <th className="px-2 py-1.5 text-right">{listUi.colBounce}</th>
            </tr>
          </thead>
          <ListTableBody
            colSpan={9}
            loading={props.allLoading}
            isEmpty={props.allRows.length === 0}
            emptyMessage={props.allEmptyMessage}
            detailLoading={listUi.detailLoading}
          >
            <tbody>
              {props.allRows.map((r) => (
                <tr key={r.contactId} className={`border-t ${theme.rowBorder} text-slate-700`}>
                  <td className="px-2 py-1.5">{r.industry || "—"}</td>
                  <td className="max-w-[8rem] truncate px-2 py-1.5" title={r.company}>
                    {r.company || "—"}
                  </td>
                  <td className="px-2 py-1.5">{r.contactName || "—"}</td>
                  <td className="max-w-[8rem] truncate px-2 py-1.5">{r.jobTitle || "—"}</td>
                  <td className="px-2 py-1.5">{r.phone || "—"}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono">{r.email}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.sendCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.openCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{r.bounceLikeCount}</td>
                </tr>
              ))}
            </tbody>
          </ListTableBody>
        </>,
        "w-full border-collapse text-xs",
        { enableDeleteAll: false }
      );

    default:
      return null;
  }
}
