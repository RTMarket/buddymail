import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { getEmailCampaignsChildStrings } from "../../../i18n/emailCampaignsChildI18n";

export type CampaignActivityIdOption = {
  id: number;
  campaign_code: string | null;
  name?: string | null;
  status?: string | null;
  /** 是否已发送过（已发送的活动不可再选为发送目标） */
  has_sent?: boolean;
};

export function isCampaignActivitySendDisabled(item: CampaignActivityIdOption): boolean {
  return item.has_sent === true && String(item.status ?? "").toLowerCase() !== "sending";
}

export type CampaignActivityIdDropdownVariant = "sidebar" | "laneGrid" | "testPick";

function isPickDisabled(item: CampaignActivityIdOption, allowSentSelection: boolean): boolean {
  if (allowSentSelection) return false;
  return isCampaignActivitySendDisabled(item);
}

function campaignSentForTest(item: CampaignActivityIdOption): boolean {
  return item.has_sent === true && String(item.status ?? "").toLowerCase() !== "sending";
}

function formatCode(x: CampaignActivityIdOption): string {
  return x.campaign_code ?? String(x.id).padStart(6, "0");
}

type CampaignPickerUi = ReturnType<typeof getEmailCampaignsChildStrings>;

function formatName(x: CampaignActivityIdOption, unnamed: string): string {
  return String(x.name ?? "").trim() || unnamed;
}

/** 最近 N 条；若当前选中不在列表内则置顶保留 */
export function pickRecentCampaignOptions(
  items: CampaignActivityIdOption[],
  selectedId: number | null | undefined,
  maxItems: number
): CampaignActivityIdOption[] {
  const limit = Math.max(1, Math.floor(maxItems));
  const sorted = [...items].sort((a, b) => b.id - a.id);
  const recent = sorted.slice(0, limit);
  if (selectedId == null) return recent;
  if (recent.some((x) => x.id === selectedId)) return recent;
  const selected = items.find((x) => x.id === selectedId);
  if (!selected) return recent;
  return [selected, ...recent.filter((x) => x.id !== selectedId).slice(0, limit - 1)];
}

function CampaignIdRow(props: {
  item: CampaignActivityIdOption;
  selected: boolean;
  disabled: boolean;
  allowSentSelection?: boolean;
  ui: CampaignPickerUi;
  onPick: () => void;
}) {
  const { item, selected, disabled, allowSentSelection = false, ui, onPick } = props;
  const code = formatCode(item);
  const sentLocked = !allowSentSelection && isCampaignActivitySendDisabled(item);
  const sentDone = allowSentSelection && campaignSentForTest(item);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      className={`flex min-h-[2.75rem] w-full flex-col justify-center gap-0.5 rounded-md border px-2.5 py-1.5 text-left font-mono transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : selected
            ? "border-violet-300 bg-violet-100/90 text-violet-950 ring-1 ring-violet-200"
            : "border-slate-200/90 bg-white text-slate-800 hover:border-violet-200 hover:bg-violet-50/60"
      }`}
      onClick={() => {
        if (disabled) return;
        onPick();
      }}
    >
      <span className="text-[9px] font-sans font-medium text-slate-500">{ui.activityInternalId(item.id)}</span>
      <span className="text-[10px] font-semibold tracking-wide">{code}</span>
      {sentLocked ? (
        <span className="text-[9px] font-sans font-medium text-amber-700">{ui.activitySentNoResend}</span>
      ) : sentDone ? (
        <span className="text-[9px] font-sans font-medium text-emerald-700">{ui.activitySent}</span>
      ) : null}
    </button>
  );
}

function LaneGridCampaignTile(props: {
  item: CampaignActivityIdOption;
  selected: boolean;
  disabled: boolean;
  blockReason?: string | null;
  ui: CampaignPickerUi;
  onPick: () => void;
  onBlockedPick?: (message: string) => void;
}) {
  const { item, selected, disabled, blockReason, ui, onPick, onBlockedPick } = props;
  const code = formatCode(item);
  const sentLocked = isCampaignActivitySendDisabled(item);
  const name = formatName(item, ui.activityUnnamed);
  const title = blockReason ?? `${code} · ${name}`;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      title={title}
      className={`grid min-h-[2.375rem] w-full grid-cols-1 gap-0.5 rounded border px-1.5 py-1 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : selected
            ? "border-violet-300 bg-violet-100/90 text-violet-950 ring-1 ring-violet-200"
            : "border-slate-200/90 bg-white text-slate-800 hover:border-violet-200 hover:bg-violet-50/70"
      }`}
      onClick={() => {
        if (disabled) {
          if (blockReason) onBlockedPick?.(blockReason);
          return;
        }
        onPick();
      }}
    >
      <span className="truncate font-mono text-[9px] font-semibold leading-tight">{code}</span>
      <span className="flex min-w-0 items-center gap-1 truncate text-[9px] leading-tight">
        <span className={sentLocked ? "truncate text-slate-400" : "truncate text-slate-600"}>{name}</span>
        {sentLocked ? (
          <span className="shrink-0 rounded bg-slate-200/90 px-1 py-0.5 text-[8px] font-medium text-slate-500">
            {ui.activitySent}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function LaneGridSelectedLabel(props: { item: CampaignActivityIdOption; ui: CampaignPickerUi }) {
  const code = formatCode(props.item);
  const name = formatName(props.item, props.ui.activityUnnamed);
  const sentLocked = isCampaignActivitySendDisabled(props.item);
  return (
    <span className="grid min-w-0 flex-1 grid-cols-2 items-center gap-1.5 font-sans">
      <span className="truncate font-mono text-[10px] font-semibold text-slate-900">{code}</span>
      <span className="truncate text-[10px] text-slate-600">
        {sentLocked ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 ring-1 ring-amber-200/60">
            {props.ui.activitySentNoResend}
          </span>
        ) : (
          name
        )}
      </span>
    </span>
  );
}

function TestPickSelectedLabel(props: { item: CampaignActivityIdOption; ui: CampaignPickerUi }) {
  const code = formatCode(props.item);
  const name = formatName(props.item, props.ui.activityUnnamed);
  const sent = campaignSentForTest(props.item);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 font-mono text-[11px] font-semibold tracking-wide text-slate-900">{code}</span>
      <span className="min-w-0 truncate text-[10px] text-slate-600">{name}</span>
      {sent ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 ring-1 ring-amber-200/80">
          {props.ui.activitySentShort}
        </span>
      ) : null}
    </span>
  );
}

function TestPickCampaignTile(props: {
  item: CampaignActivityIdOption;
  selected: boolean;
  ui: CampaignPickerUi;
  onPick: () => void;
}) {
  const { item, selected, ui, onPick } = props;
  const code = formatCode(item);
  const name = formatName(item, ui.activityUnnamed);
  const sent = campaignSentForTest(item);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={`${code} · ${name}`}
      className={`flex min-h-[2.625rem] w-full flex-col justify-between rounded-md border px-2 py-1.5 text-left shadow-sm transition-all ${
        selected
          ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-white ring-2 ring-emerald-200/80"
          : "border-slate-200/90 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow"
      }`}
      onClick={() => onPick()}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-mono text-[10px] font-bold tracking-wide text-slate-900">{code}</span>
        {sent ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-800">
            {ui.activitySentShort}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-800">
            {ui.activityTestable}
          </span>
        )}
      </div>
      <span className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-slate-600">{name}</span>
    </button>
  );
}

/** 下拉列表一次可见的活动条数（其余靠滚动） */
const CAMPAIGN_ID_VISIBLE_ROWS = 10;

/** 折叠式活动 ID 选择（统计页右侧栏 / 专线栏） */
export function CampaignActivityIdDropdown(props: {
  items: CampaignActivityIdOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
  disabledHint?: string;
  emptyHint?: string;
  /** 发信邮箱切换后拉列表中：仍显示按钮文案，不沿用上一邮箱的活动条数 */
  loading?: boolean;
  /** sidebar：纵向列表；laneGrid：专线栏；testPick：测试邮件区卡片 */
  variant?: CampaignActivityIdDropdownVariant;
  /** 仅展示最近 N 条（按 id 降序）；选中项不在其中时会保留 */
  maxItems?: number;
  /** 测试邮件等：已发送活动仍可选 */
  allowSentSelection?: boolean;
  /** 发送中/确认发送：可展开查看，但不可改选 */
  selectionLocked?: boolean;
  /** 展开下拉时（用于列表为空时重拉） */
  onOpen?: () => void;
  /** 当前选中活动不在 items 里时仍展示（如编号查询、默认最新活动） */
  pinnedSelection?: CampaignActivityIdOption | null;
  /** 其它专线已选中的活动 id（本栏不可再选） */
  reservedCampaignIds?: ReadonlySet<number>;
  /** 点击不可选卡片时的提示（已发送 / 被其它专线占用） */
  onPickBlocked?: (message: string) => void;
  /** 展开/收起（专线栏用于抬高 z-index，避免被相邻专线面板挡住卡片点击） */
  onOpenChange?: (open: boolean) => void;
}) {
  const {
    items,
    selectedId,
    onSelect,
    disabled = false,
    disabledHint,
    emptyHint,
    loading = false,
    pinnedSelection = null,
    variant = "sidebar",
    maxItems,
    allowSentSelection = false,
    selectionLocked = false,
    onOpen,
    reservedCampaignIds,
    onPickBlocked,
    onOpenChange
  } = props;
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const laneGrid = variant === "laneGrid";
  const testPick = variant === "testPick";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const displayItems = useMemo(() => {
    if (maxItems != null && maxItems > 0) {
      return pickRecentCampaignOptions(items, selectedId, maxItems);
    }
    return items;
  }, [items, selectedId, maxItems]);

  const selected =
    selectedId != null
      ? items.find((x) => x.id === selectedId) ??
        (pinnedSelection != null && pinnedSelection.id === selectedId ? pinnedSelection : null)
      : null;
  const closedLabel =
    !disabled && displayItems.length === 0 && !selected
      ? emptyHint ?? childUi.noActivity
      : selected
        ? null
        : childUi.selectActivity;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const listDisabled = disabled || (!testPick && displayItems.length === 0 && !loading && !selected);
  const pickLocked = selectionLocked || disabled;

  const triggerMinH = testPick ? "min-h-10" : laneGrid ? "min-h-8" : "min-h-10";
  const triggerText = laneGrid ? "text-[10px]" : testPick ? "text-xs" : "text-[11px]";

  const triggerIdleClass = testPick
    ? "border-emerald-200/80 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60"
    : "border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60";
  const triggerOpenClass = testPick
    ? "border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-200/70"
    : "border-violet-400 bg-violet-50/80 ring-2 ring-violet-200/70";

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${open ? "z-[80]" : ""} ${testPick ? "w-full" : "flex-1"}`}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={listDisabled}
        className={`flex ${triggerMinH} w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left shadow-sm outline-none transition-colors ${
          listDisabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : open
              ? triggerOpenClass
              : triggerIdleClass
        }`}
        onClick={() => {
          if (listDisabled) return;
          if (testPick && displayItems.length === 0) {
            onOpen?.();
            return;
          }
          setOpen((v) => {
            const next = !v;
            if (next) onOpen?.();
            return next;
          });
        }}
      >
        <span className="min-w-0 flex-1">
          {listDisabled ? (
            <span className={`${triggerText} text-slate-500`}>
              {disabled ? disabledHint : emptyHint}
            </span>
          ) : selected ? (
            testPick ? (
              <TestPickSelectedLabel item={selected} ui={childUi} />
            ) : laneGrid ? (
              <LaneGridSelectedLabel item={selected} ui={childUi} />
            ) : (
              <span className="flex flex-col gap-0.5 font-mono">
                <span className="text-[10px] font-sans font-medium text-slate-500">
                  {childUi.activityInternalId(selected.id)}
                </span>
                <span className="text-[11px] font-semibold text-slate-900">
                  {formatCode(selected)}
                </span>
              </span>
            )
          ) : (
            <span className={`${triggerText} text-slate-600`}>{closedLabel}</span>
          )}
        </span>
        <span
          className={`shrink-0 text-[9px] text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open && !listDisabled ? (
        <div
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 z-[90] mt-1.5 overflow-hidden rounded-xl border shadow-lg ring-1 backdrop-blur-sm ${
            testPick
              ? "border-emerald-200/90 bg-white/98 p-2 ring-emerald-100/80"
              : "border-violet-200/80 bg-slate-100/95 p-1.5 ring-slate-200/80"
          } ${laneGrid && !testPick ? "p-1" : ""}`}
        >
          {testPick ? (
            <>
              {displayItems.length === 0 ? (
                <div className="rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-2">
                  <p className="text-[10px] leading-relaxed text-emerald-950">
                    {loading ? " " : emptyHint ?? childUi.noActivityId}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {displayItems.map((x) => (
                    <TestPickCampaignTile
                      key={x.id}
                      item={x}
                      selected={x.id === selectedId}
                      ui={childUi}
                      onPick={() => {
                        onSelect(x.id);
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : laneGrid ? (
            displayItems.length === 0 ? (
              <div className="space-y-2 px-1 py-2">
                <p className="text-[10px] leading-relaxed text-slate-600">
                  {loading ? childUi.loadingActivities : emptyHint ?? childUi.noActivity}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {displayItems.map((x) => {
                  const sentLocked = isPickDisabled(x, allowSentSelection);
                  const reservedElsewhere =
                    reservedCampaignIds != null &&
                    reservedCampaignIds.has(x.id) &&
                    x.id !== selectedId;
                  const pickDisabled = pickLocked || sentLocked || reservedElsewhere;
                  const blockReason = sentLocked
                    ? childUi.activityBlockedSent
                    : reservedElsewhere
                      ? childUi.activityBlockedOtherLane
                      : null;
                  return (
                    <LaneGridCampaignTile
                      key={x.id}
                      item={x}
                      selected={x.id === selectedId}
                      disabled={pickDisabled}
                      blockReason={blockReason}
                      ui={childUi}
                      onBlockedPick={(msg) => {
                        if (pickLocked && !sentLocked && !reservedElsewhere) {
                          onPickBlocked?.(childUi.activityBlockedSending);
                          return;
                        }
                        onPickBlocked?.(msg);
                      }}
                      onPick={() => {
                        if (pickLocked || sentLocked || reservedElsewhere) return;
                        onSelect(x.id);
                        setOpen(false);
                      }}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <>
              <p className="mb-1.5 px-1 text-[10px] text-slate-500">
                {loading && displayItems.length === 0
                  ? childUi.loadingActivities
                  : childUi.activityListMeta(displayItems.length, CAMPAIGN_ID_VISIBLE_ROWS)}
              </p>
              <div
                className="space-y-1.5 overflow-y-auto overscroll-contain pr-1"
                style={{
                  maxHeight: `calc(${CAMPAIGN_ID_VISIBLE_ROWS} * 2.75rem + ${CAMPAIGN_ID_VISIBLE_ROWS - 1} * 0.375rem)`
                }}
              >
                {displayItems.map((x) => {
                  const pickDisabled = isPickDisabled(x, allowSentSelection);
                  return (
                    <CampaignIdRow
                      key={x.id}
                      item={x}
                      selected={x.id === selectedId}
                      disabled={pickDisabled}
                      allowSentSelection={allowSentSelection}
                      ui={childUi}
                      onPick={() => {
                        onSelect(x.id);
                        setOpen(false);
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const TEST_EMAIL_RECENT_CAMPAIGN_LIMIT = 15;

/** 测试邮件区：平铺展示近期活动卡片（活动编号 + 名称） */
export function CampaignTestEmailRecentCards(props: {
  items: CampaignActivityIdOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  maxItems?: number;
  emptyHint?: string;
}) {
  const { items, selectedId, onSelect, maxItems = TEST_EMAIL_RECENT_CAMPAIGN_LIMIT, emptyHint } = props;
  const { locale } = useSiteLocale();
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);
  const displayItems = useMemo(
    () => pickRecentCampaignOptions(items, selectedId, maxItems),
    [items, selectedId, maxItems]
  );

  if (displayItems.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
        {emptyHint ?? childUi.testCardsEmpty}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] text-slate-500">{childUi.testCardsHint(displayItems.length)}</p>
      <div
        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
        role="listbox"
        aria-label={childUi.testCardsAria}
      >
        {displayItems.map((x) => {
          const selected = x.id === selectedId;
          const code = formatCode(x);
          const name = formatName(x, childUi.activityUnnamed);
          return (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={selected}
              title={`${code} · ${name}`}
              className={`flex min-h-[3.25rem] flex-col justify-between rounded-lg border px-2 py-1.5 text-left shadow-sm transition-all ${
                selected
                  ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200/80"
                  : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"
              }`}
              onClick={() => onSelect(x.id)}
            >
              <span className="font-mono text-[11px] font-bold tracking-wide text-slate-900">{code}</span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
