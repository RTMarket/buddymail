import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import {
  getSettingsEmailDedicatedStandaloneStrings,
  type SettingsEmailDedicatedStandaloneStrings,
  validateDedicatedFromEmailLocalized,
  validateDedicatedSenderDomainLocalized
} from "../../../i18n/settingsEmailDedicatedStandaloneI18n";
import type { SiteLocale } from "../../../i18n/siteLocaleTypes";
import { formatSiteLocaleDateTime, intlLocaleTag } from "../../../i18n/siteLocaleTypes";
import { useAuth } from "../../../auth/AuthContext";
import { apiJson } from "../../../lib/api";
import { prepareDedicatedDnsRecordsForUi, dnsRecordsAlreadyPreparedForPanel, sortDedicatedDnsRecordsForUi } from "../../../lib/dedicatedDnsPrepare";
import { useProductModules } from "../../../state/ProductModulesContext";
import {
  suggestFromEmail,
  validateDedicatedFromEmail,
  validateDedicatedSenderDomain
} from "../../../lib/dedicatedSenderDomainRules";
import { fetchDedicatedSenderDomainPrecheck } from "../../../lib/dedicatedSenderDomainPrecheck";
import { DedicatedDomainQuotaComplianceBanner } from "../../components/email/DedicatedDomainQuotaComplianceBanner";
import { toDedicatedDnsPanelRow } from "../../../lib/dedicatedDnsPanelDisplay";
import {
  copyTextToClipboard,
  formatAllDnsRecordsForClipboard,
  formatDnsPanelRowForClipboard,
  selectElementText
} from "../../../lib/dedicatedDnsClipboard";
import { DedicatedDnsCopyableField } from "../../components/email/DedicatedDnsCopyableField";
import { usePageFeedback } from "../../../lib/inlineFeedback";
import { InlineConfirmBar, PageFeedbackLine } from "../../components/InlineFeedbackPanels";
import type { DedicatedEntitlementsSnapshot } from "../../../lib/dedicatedEntitlements";
import {
  computeDomainSlotsPerLane,
  countDedicatedUsageFromClientItems,
  mergeEntitlementsWithUsage,
  parseEntitlementsSnapshot
} from "../../../lib/dedicatedEntitlements";
import {
  IS_STANDALONE_DEPLOY,
  standaloneLicenseDomainSlots,
  standaloneLicensePlanTierId,
  standaloneLicenseVpsGroupSlots
} from "../../../lib/standaloneDeploy";
import { resolveStandalonePlanEntitlements } from "../../../lib/standalonePlanEntitlements";
import {
  fetchDedicatedLanes,
  findLaneByIndex,
  pickDefaultLaneIndex,
  type DedicatedLaneSnapshot
} from "../../../lib/dedicatedLanes";

/**
 * 「邮件营销服务开通」卡片（旧称：独立发信服务器 / 独立 IP）。
 *
 * 放在邮箱配置页最上方，作为高发量场景的首选入口。
 *
 * 关键设计：**统一布局 / 不切视图**。无论用户有没有提交申请，
 * 卡片内的结构都恒定（自上而下）：
 *   1. 顶部可售套餐网格
 *   2. 中间发件人资料表单
 *   3. 操作条：未提交时显示「提交开通申请」；已提交时显示「取消申请」
 *      + 提示文案（"已申请，等待平台开通"）
 *   4. DNS 记录区（永远打开）：3 种模式
 *        a) 未提交 → preview 占位（教育性骨架）
 *        b) 已提交但 admin 还没推 → submitted 占位
 *        c) admin 已推送 → 完整可复制表格 + 验证按钮
 *   5. 测试发送区：仅 status='ready' 时出现
 *
 * 这样提交前后用户看到的是"同一张表"，只是按钮、表单的可编辑性、
 * 下方 DNS 区的形态会变化，避免页面跳来跳去带来的认知断裂。
 */

type OnboardingStatus =
  | "requested"
  | "provisioning"
  | "awaiting_dns"
  | "ready"
  | "paused"
  | "failed"
  | "cancelled"
  | "rejected"
  | "deleted";

interface DnsRecord {
  host: string;
  type: string;
  value: string;
  verified?: boolean;
  note?: string;
  hostRecord?: string;
  dnsZone?: string;
  mxPriority?: number;
}

interface OnboardingItem {
  id: number;
  label: string;
  senderDomain: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  dnsRecords: DnsRecord[];
  subscriptionTierId: string | null;
  status: OnboardingStatus;
  smtpProfileId: number | null;
  vpsGroupId: number | null;
  notesFromUser: string | null;
  billingStartedAt: string | null;
  billingPeriodEndAt: string | null;
  domainChangeStatus?: string;
  pendingSenderDomain?: string | null;
  pendingFromName?: string | null;
  pendingFromEmail?: string | null;
  pendingReplyTo?: string | null;
  domainChangeRequestedAt?: string | null;
  applicationRejectionReason?: string | null;
  applicationRejectedAt?: string | null;
  /** R26c：租户是否已提交 SMTP 密码（仅布尔，不回显明文） */
  hasTenantSubmittedSmtpPassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 防御式归一化：后端代码可能还没部署到位（旧版本不返回 dnsRecords /
 * fromName 等新字段），统一兜底为合法 shape，避免前端崩溃。
 */
function normalizeItem(raw: any): OnboardingItem {
  const recs = Array.isArray(raw?.dnsRecords) ? raw.dnsRecords : [];
  const mapped = recs
    .filter((r: any) => r && typeof r.host === "string" && typeof r.value === "string")
    .map((r: any) => ({
      host: String(r.host),
      type: String(r.type ?? "TXT"),
      value: String(r.value),
      verified: Boolean(r.verified ?? false),
      note: typeof r.note === "string" ? r.note : undefined,
      hostRecord: typeof r.hostRecord === "string" ? r.hostRecord : undefined,
      dnsZone: typeof r.dnsZone === "string" ? r.dnsZone : undefined,
      mxPriority:
        r.mxPriority != null && Number.isFinite(Number(r.mxPriority))
          ? Number(r.mxPriority)
          : undefined
    }));
  const senderDomain = raw?.senderDomain ?? null;
  const dnsRecords = dnsRecordsAlreadyPreparedForPanel(mapped)
    ? sortDedicatedDnsRecordsForUi(mapped)
    : prepareDedicatedDnsRecordsForUi(mapped, {
        senderDomain,
        ptrIp: raw?.ptrIp ?? null,
        relayIp: raw?.relayIp ?? null,
        ptrHostname: raw?.ptrHostname ?? raw?.hostname ?? senderDomain
      });
  return {
    id: Number(raw?.id ?? 0),
    label: String(raw?.label ?? ""),
    senderDomain,
    fromName: raw?.fromName ?? null,
    fromEmail: raw?.fromEmail ?? null,
    replyTo: raw?.replyTo ?? null,
    dnsRecords,
    subscriptionTierId: (raw?.subscriptionTierId ?? null) as string | null,
    status: (raw?.status ?? "requested") as OnboardingStatus,
    smtpProfileId: raw?.smtpProfileId != null ? Number(raw.smtpProfileId) : null,
    vpsGroupId: raw?.vpsGroupId != null ? Number(raw.vpsGroupId) : null,
    notesFromUser: raw?.notesFromUser ?? null,
    billingStartedAt: raw?.billingStartedAt ?? null,
    billingPeriodEndAt: raw?.billingPeriodEndAt ?? null,
    domainChangeStatus: String(raw?.domainChangeStatus ?? "none"),
    pendingSenderDomain: raw?.pendingSenderDomain ?? null,
    pendingFromName: raw?.pendingFromName ?? null,
    pendingFromEmail: raw?.pendingFromEmail ?? null,
    pendingReplyTo: raw?.pendingReplyTo ?? null,
    domainChangeRequestedAt: raw?.domainChangeRequestedAt ?? null,
    applicationRejectionReason: raw?.applicationRejectionReason ?? null,
    applicationRejectedAt: raw?.applicationRejectedAt ?? null,
    hasTenantSubmittedSmtpPassword: Boolean(raw?.hasTenantSubmittedSmtpPassword),
    createdAt: String(raw?.createdAt ?? ""),
    updatedAt: String(raw?.updatedAt ?? "")
  };
}

function formatServiceDateTime(iso: string | null | undefined, locale: SiteLocale): string {
  return formatSiteLocaleDateTime(iso, locale);
}

const STATUS_BADGE: Record<OnboardingStatus, { text: string; cls: string }> = {
  requested:    { text: "申请已收到",         cls: "bg-slate-100 text-slate-700 border-slate-200" },
  provisioning: { text: "开通中",             cls: "bg-amber-100 text-amber-900 border-amber-200" },
  awaiting_dns: { text: "等待您添加 DNS 记录", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  ready:        { text: "✓ 已开通",           cls: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  paused:       { text: "已暂停 / 已到期",     cls: "bg-rose-100 text-rose-900 border-rose-200" },
  failed:       { text: "开通失败",            cls: "bg-rose-100 text-rose-900 border-rose-200" },
  cancelled:    { text: "已取消",             cls: "bg-slate-100 text-slate-500 border-slate-200" },
  rejected:     { text: "申请未通过",         cls: "bg-rose-100 text-rose-900 border-rose-200" },
  deleted:      { text: "已删除",             cls: "bg-slate-100 text-slate-400 border-slate-200" }
};

/* ─────────────────────────────────────────────────────────────
 * 开源版本地替代：以下商业模块已从开源版中移除——
 *   lib/emailMarketingTierCatalog、lib/emailSubscriptionDisplay、
 *   lib/emailDedicatedActivation、lib/standaloneProvisionShared、
 *   state/subscriptionPlanConfig、./StandaloneDedicatedProvisionBlock。
 * 这里提供装机配置核心功能（DNS 展示/验证、发信域管理）所需的最小本地实现；
 * SaaS 侧的付费档位 / 套餐有效期 / 代装流程在开源版中不存在，相关判断恒为"无"。
 * ───────────────────────────────────────────────────────────── */

/** 邮件模块周期字段的本地形状（原商业模块 EmailModuleCycleRow 的最小子集） */
type EmailModuleCycleLike = {
  simulatedPaidAt?: string | null;
  serviceEffectiveStart?: string | null;
  serviceEffectiveEnd?: string | null;
  periodEnd?: string | null;
};

/** 状态徽标：直接按发信域状态映射（开源版无套餐周期叠加逻辑） */
function dedicatedStatusBadge(item: OnboardingItem): { text: string; cls: string } {
  return (
    STATUS_BADGE[item.status] ?? {
      text: item.status,
      cls: "bg-slate-100 text-slate-700 border-slate-200"
    }
  );
}

/** 开通参考周期：原商业 resolveDedicatedFormalPeriod 的本地等价实现 */
function dedicatedFormalPeriod(
  item: OnboardingItem | null | undefined,
  emailRow?: EmailModuleCycleLike
): { start: string | null; end: string | null } {
  const start =
    (emailRow?.serviceEffectiveStart && String(emailRow.serviceEffectiveStart).trim()) ||
    (item?.billingStartedAt && String(item.billingStartedAt).trim()) ||
    null;
  const end =
    (emailRow?.serviceEffectiveEnd && String(emailRow.serviceEffectiveEnd).trim()) ||
    (emailRow?.periodEnd && String(emailRow.periodEnd).trim()) ||
    (item?.billingPeriodEndAt && String(item.billingPeriodEndAt).trim()) ||
    null;
  return { start, end };
}

/** DNS 是否全部验证通过：按每条记录的 verified 布尔值判断 */
function dedicatedDnsAllVerified(item: OnboardingItem | null | undefined): boolean {
  return Boolean(item?.dnsRecords?.length) && item!.dnsRecords.every((r) => r.verified);
}

export type DedicatedOnboardingVariant = "medium" | "bulk";

const DEDICATED_VARIANT_CONFIG = {
  medium: {
    channelLabel: "中量",
    checkoutPageLabel: "中量邮箱配置",
    payPageHint: "中量专线 · 套餐开通"
  },
  bulk: {
    channelLabel: "巨量",
    checkoutPageLabel: "巨量邮箱配置",
    payPageHint: "巨量专线 · 套餐开通"
  }
} as const;

/**
 * 本地兜底快照：用户提交申请时把整个表单值写到 localStorage。
 *
 * 解决的实际问题：
 *  - 线上后端版本可能滞后于前端（fromName / fromEmail / senderDomain /
 *    replyTo 等新字段还没合并进去），导致 POST 时被丢弃，再 GET 回来
 *    都是 null，只读视图显示「（未填）」让用户困惑
 *  - 用这份本地快照做"前端优先回显"，保证用户提交后仍然能看到自己刚才
 *    填的内容；当后端补齐字段后，currentItem 的值会自然覆盖快照
 *
 * 注意：本快照仅做 UI 兜底，不参与后端真实存储；切设备 / 清缓存后会丢失。
 * 这是 UX 缓冲，不是数据可靠性方案——后端字段还是必须升级。
 */
const SNAPSHOT_KEY = "bss_email_onboarding_form_snapshot_v1";

/** 独立站：不用浏览器 localStorage 草稿，避免同浏览器访问其它站点/旧安装时串域名字段 */
function useBrowserFormDraft(): boolean {
  return !IS_STANDALONE_DEPLOY;
}
interface FormSnapshot {
  tierId: string;
  label: string;
  senderDomain: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  notes: string;
}
function loadFormSnapshot(): FormSnapshot | null {
  if (!useBrowserFormDraft()) return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    return {
      tierId: String(v.tierId ?? ""),
      label: String(v.label ?? ""),
      senderDomain: String(v.senderDomain ?? ""),
      fromName: String(v.fromName ?? ""),
      fromEmail: String(v.fromEmail ?? ""),
      replyTo: String(v.replyTo ?? ""),
      notes: String(v.notes ?? "")
    };
  } catch {
    return null;
  }
}
function saveFormSnapshot(snap: FormSnapshot) {
  if (!useBrowserFormDraft()) return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* localStorage 可能被禁用 / 隐私模式，忽略 */
  }
}
function clearFormSnapshot() {
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/** 把工单 + 本地快照合并成表单展示值（后端字段优先；独立站仅用后端，不合并浏览器草稿） */
function buildFormFieldsFromItem(
  item: OnboardingItem,
  snap: FormSnapshot | null
): FormSnapshot {
  if (!useBrowserFormDraft()) {
    return {
      tierId: String(item.subscriptionTierId ?? ""),
      label: item.label ?? "",
      senderDomain: item.senderDomain ?? "",
      fromName: item.fromName ?? "",
      fromEmail: item.fromEmail ?? "",
      replyTo: item.replyTo ?? "",
      notes: item.notesFromUser ?? ""
    };
  }
  return {
    tierId: String(item.subscriptionTierId ?? snap?.tierId ?? ""),
    label: item.label || snap?.label || "",
    senderDomain: item.senderDomain || snap?.senderDomain || "",
    fromName: item.fromName || snap?.fromName || "",
    fromEmail: item.fromEmail || snap?.fromEmail || "",
    replyTo: item.replyTo || snap?.replyTo || "",
    notes: item.notesFromUser || snap?.notes || ""
  };
}

export function SettingsEmailDedicatedServerSection(props: {
  variant?: DedicatedOnboardingVariant;
  /** 页面上方「套餐开通」所选档位，用于工单登记（暂不与个人中心强制同步） */
  checkoutTierId?: string;
  onEntitlementsChange?: (snapshot: DedicatedEntitlementsSnapshot | null) => void;
  /** 独立站装机工作台：隐藏 SaaS 支付/选档，仅展示 LICENSE 套餐与发信域名表单 */
  standaloneWorkbench?: boolean;
}) {
  const variant = props.variant ?? "medium";
  const standaloneWorkbench = Boolean(props.standaloneWorkbench || IS_STANDALONE_DEPLOY);
  const variantCfg = DEDICATED_VARIANT_CONFIG[variant];
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [entitlements, setEntitlements] = useState<DedicatedEntitlementsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refresh: refreshProductModules } = useProductModules();

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    setError(null);
    if (!silent) {
      setLoading(true);
    }
    try {
      const [r] = await Promise.all([
        apiJson<{ ok: boolean; items: unknown[]; entitlements?: unknown }>(
          "/api/email/dedicated-servers"
        ),
        refreshProductModules()
      ]);
      const raw = Array.isArray(r.items) ? r.items : [];
      const normalized = raw.map(normalizeItem);
      setItems(normalized);
      if (standaloneWorkbench) {
        const activeCount = normalized.filter(
          (i) => i.status !== "cancelled" && i.status !== "rejected" && i.status !== "deleted"
        ).length;
        if (activeCount === 0) clearFormSnapshot();
      }
      let snap = parseEntitlementsSnapshot(r.entitlements);
      if (snap && snap.usedVpsGroups === 0) {
        const fromItems = countDedicatedUsageFromClientItems(normalized);
        if (fromItems.usedVpsGroups > 0 || fromItems.usedDomains > snap.usedDomains) {
          snap = mergeEntitlementsWithUsage(
            snap.dailyLimit,
            Math.max(snap.usedDomains, fromItems.usedDomains),
            fromItems.usedVpsGroups
          );
        }
      }
      setEntitlements(snap);
      props.onEntitlementsChange?.(snap);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dedicated-entitlements-updated", { detail: snap }));
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [refreshProductModules, props.onEntitlementsChange, standaloneWorkbench]);

  /** 子步骤完成后静默刷新，避免整页「加载中」闪跳 */
  const reloadQuiet = useCallback(async () => {
    await reload({ silent: true });
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const [focusDomainId, setFocusDomainId] = useState<number | null>(null);
  /** 驳回后点「继续编辑」临时解锁；保存后清除 */
  const [editUnlockedDomainIds, setEditUnlockedDomainIds] = useState<Set<number>>(() => new Set());

  const rejectedItems = useMemo(() => items.filter((i) => i.status === "rejected"), [items]);
  const activeItems = useMemo(
    () =>
      items.filter(
        (i) => i.status !== "cancelled" && i.status !== "rejected" && i.status !== "deleted"
      ),
    [items]
  );

  const planPreset = resolveStandalonePlanEntitlements(standaloneLicensePlanTierId());
  const viteDomainSlots = standaloneLicenseDomainSlots();
  const viteVpsSlots = standaloneLicenseVpsGroupSlots();
  const domainSlotCount = Math.max(
    entitlements?.domainSlots ?? 0,
    planPreset?.domainSlots ?? 0,
    viteDomainSlots ?? 0,
    1
  );
  const vpsGroupSlotCount = Math.max(
    entitlements?.vpsGroupSlots ?? 0,
    planPreset?.vpsGroupSlots ?? 0,
    viteVpsSlots ?? 0,
    1
  );

  /** 独立站 · 单 IP 多发信域：固定槽位（如 3 域共用 1 台 VPS） */
  const standaloneSingleIpTripleDomainFlow =
    standaloneWorkbench && vpsGroupSlotCount === 1 && domainSlotCount > 1;

  /** 独立站多机组（≥2 组 VPS） */
  const standaloneMultiGroupWorkbenchFlow = standaloneWorkbench && vpsGroupSlotCount > 1;

  /** 独立站单域体验档 */
  const standaloneSingleDomainFlow =
    standaloneWorkbench &&
    !standaloneSingleIpTripleDomainFlow &&
    !standaloneMultiGroupWorkbenchFlow;

  const standaloneCurrentItem =
    standaloneSingleDomainFlow && activeItems.length > 0 ? activeItems[0]! : null;

  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {error ? (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {standaloneWorkbench ? `${sui.loadFailed} ${error}` : `加载失败：${error}`}
          <button onClick={() => void reload()} className="ml-2 underline hover:no-underline">
            {standaloneWorkbench ? sui.retry : "重试"}
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="mb-3 text-xs text-slate-500">{standaloneWorkbench ? sui.loading : "加载中…"}</div>
      ) : null}

      {rejectedItems.length > 0 ? (
        <RejectedApplicationsPanel
          items={rejectedItems}
          className="mb-4"
          sui={sui}
          locale={locale}
          onChanged={reload}
          onReopen={(id) => {
            setEditUnlockedDomainIds((prev) => new Set(prev).add(id));
            setFocusDomainId(id);
          }}
        />
      ) : null}

      <DedicatedDomainQuotaComplianceBanner entitlements={entitlements} className="mb-4" />

      {standaloneSingleIpTripleDomainFlow ? (
        <SingleIpTripleDomainWorkbench
          variant={variant}
          activeItems={activeItems}
          entitlements={entitlements}
          onChanged={reloadQuiet}
          checkoutTierId={props.checkoutTierId}
        />
      ) : activeItems.length === 0 ? (
        <UnifiedView
          variant={variant}
          currentItem={null}
          onChanged={reload}
          checkoutTierId={props.checkoutTierId}
          standaloneWorkbench={standaloneWorkbench}
        />
      ) : standaloneMultiGroupWorkbenchFlow ? (
        <StandaloneMultiGroupWorkbench
          variant={variant}
          activeItems={activeItems}
          entitlements={entitlements}
          onChanged={reloadQuiet}
          checkoutTierId={props.checkoutTierId}
          workbenchMode="multiGroup"
        />
      ) : standaloneSingleDomainFlow ? (
        <UnifiedView
          variant={variant}
          currentItem={standaloneCurrentItem}
          onChanged={reloadQuiet}
          checkoutTierId={props.checkoutTierId}
          standaloneWorkbench={standaloneWorkbench}
        />
      ) : (
        <MultiDomainView
          variant={variant}
          activeItems={activeItems}
          entitlements={entitlements}
          onChanged={reload}
          checkoutTierId={props.checkoutTierId}
          focusDomainId={focusDomainId}
          onFocusConsumed={() => setFocusDomainId(null)}
          editUnlockedDomainIds={editUnlockedDomainIds}
          onEditLock={(id) =>
            setEditUnlockedDomainIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            })
          }
        />
      )}
    </div>
  );
}

/** 平台驳回的首次申请：展示原因；可继续编辑或删除回执 */
function RejectedApplicationsPanel(props: {
  items: OnboardingItem[];
  className?: string;
  sui: SettingsEmailDedicatedStandaloneStrings;
  locale: SiteLocale;
  onChanged: () => void;
  onReopen: (id: number) => void;
}) {
  const { items, className = "", sui, locale, onChanged, onReopen } = props;
  const pageMsg = usePageFeedback();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (items.length === 0) return null;

  async function handleReopen(id: number) {
    setBusyId(id);
    try {
      await apiJson(`/api/email/dedicated-servers/${id}/reopen-application`, { method: "POST" });
      pageMsg.showOk(sui.rejectedReopenOk);
      onReopen(id);
      onChanged();
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);
    try {
      await apiJson(`/api/email/dedicated-servers/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      pageMsg.showOk(sui.rejectedRemoveOk);
      onChanged();
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={`rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-3 ${className}`}>
      <PageFeedbackLine feedback={pageMsg.feedback} />
      <div className="text-xs font-semibold text-rose-950">{sui.rejectedTitle}</div>
      <p className="mt-1 text-[11px] text-rose-900/90">{sui.rejectedDesc}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-md border border-rose-200/80 bg-white/90 px-2.5 py-2 text-[11px] text-rose-950"
          >
            <div className="font-mono font-semibold">{item.senderDomain ?? item.label}</div>
            {item.applicationRejectionReason ? (
              <div className="mt-1">
                <span className="font-medium text-rose-800">{sui.rejectedReasonLabel}</span>
                {item.applicationRejectionReason}
              </div>
            ) : (
              <div className="mt-1 text-rose-800/80">{sui.rejectedNoReason}</div>
            )}
            {item.applicationRejectedAt ? (
              <div className="mt-0.5 text-rose-800/70">
                {sui.rejectedProcessedAt(formatSiteLocaleDateTime(item.applicationRejectedAt, locale))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyId != null}
                onClick={() => void handleReopen(item.id)}
                className="rounded-md border border-violet-400 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
              >
                {busyId === item.id ? sui.rejectedBusy : sui.rejectedContinueEdit}
              </button>
              {confirmDeleteId === item.id ? (
                <InlineConfirmBar
                  className="max-w-md"
                  message={sui.rejectedDeleteConfirm}
                  onConfirm={() => void handleDelete(item.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  busy={busyId === item.id}
                  confirmLabel={sui.rejectedDeleteConfirmLabel}
                  cancelLabel={sui.cancel}
                />
              ) : (
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => setConfirmDeleteId(item.id)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {sui.rejectedDelete}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * MultiDomainView（R25+）：专线切换 + 同区域左右滑查看各域（DNS+测试一体）
 * ───────────────────────────────────────────────────────────── */

type DomainSlideKey = `item:${number}` | "add";

function domainSlideKey(id: number): DomainSlideKey {
  return `item:${id}` as DomainSlideKey;
}

function MultiDomainView(props: {
  variant: DedicatedOnboardingVariant;
  activeItems: OnboardingItem[];
  entitlements: DedicatedEntitlementsSnapshot | null;
  onChanged: () => void;
  checkoutTierId?: string;
  focusDomainId?: number | null;
  onFocusConsumed?: () => void;
  editUnlockedDomainIds?: Set<number>;
  onEditLock?: (id: number) => void;
}) {
  const {
    variant,
    activeItems,
    entitlements,
    onChanged,
    checkoutTierId,
    focusDomainId,
    onFocusConsumed,
    editUnlockedDomainIds,
    onEditLock
  } = props;
  const variantCfg = DEDICATED_VARIANT_CONFIG[variant];
  const slots = entitlements?.domainSlots ?? 0;
  const vpsGroupSlots = entitlements?.vpsGroupSlots ?? 1;
  const used = entitlements?.usedDomains ?? activeItems.length;
  const remaining = entitlements?.domainsRemaining ?? Math.max(0, slots - used);
  const domainSlotsPerLane = computeDomainSlotsPerLane(slots, vpsGroupSlots);
  const [lanes, setLanes] = useState<DedicatedLaneSnapshot[]>([]);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | "">("");
  const [activeSlide, setActiveSlide] = useState<DomainSlideKey | "">("");
  const touchStartX = React.useRef(0);

  useEffect(() => {
    let cancelled = false;
    void fetchDedicatedLanes()
      .then((r) => {
        if (cancelled) return;
        setLanes(Array.isArray(r.lanes) ? r.lanes : []);
      })
      .catch(() => {
        if (!cancelled) setLanes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeItems]);

  useEffect(() => {
    if (focusDomainId == null) return;
    if (activeItems.some((i) => i.id === focusDomainId)) {
      setActiveSlide(domainSlideKey(focusDomainId));
      onFocusConsumed?.();
    }
  }, [focusDomainId, activeItems, onFocusConsumed]);

  useEffect(() => {
    if (lanes.length === 0) return;
    if (selectedLaneIndex === "") {
      setSelectedLaneIndex(pickDefaultLaneIndex(lanes));
    }
  }, [lanes, selectedLaneIndex]);

  const selectedLane = useMemo(
    () => findLaneByIndex(lanes, selectedLaneIndex),
    [lanes, selectedLaneIndex]
  );

  const showLinePicker =
    lanes.length > 1 || (entitlements?.vpsGroupSlots ?? 0) > 1;

  const itemsInLane = useMemo(() => {
    if (!showLinePicker || !selectedLane) return activeItems;
    const gid = selectedLane.vpsGroupId != null ? Number(selectedLane.vpsGroupId) : 0;
    if (gid > 0) {
      return activeItems.filter((i) => Number(i.vpsGroupId ?? 0) === gid);
    }
    const serverIds = new Set(selectedLane.domains.map((d) => d.serverId));
    return activeItems.filter((i) => serverIds.has(i.id));
  }, [activeItems, selectedLane, showLinePicker]);

  const laneRemaining = useMemo(() => {
    if (!showLinePicker || !selectedLane) return remaining;
    return Math.max(0, Math.min(remaining, domainSlotsPerLane - itemsInLane.length));
  }, [showLinePicker, selectedLane, remaining, domainSlotsPerLane, itemsInLane.length]);

  const laneDomainCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const lane of lanes) {
      const gid = lane.vpsGroupId != null ? Number(lane.vpsGroupId) : 0;
      if (gid > 0) {
        counts.set(lane.laneIndex, activeItems.filter((i) => Number(i.vpsGroupId ?? 0) === gid).length);
      } else {
        const serverIds = new Set((lane.domains ?? []).map((d) => d.serverId));
        counts.set(lane.laneIndex, activeItems.filter((i) => serverIds.has(i.id)).length);
      }
    }
    return counts;
  }, [lanes, activeItems]);

  const canAddInLane = remaining > 0 && laneRemaining > 0;

  useEffect(() => {
    if (!showLinePicker) return;
    setActiveSlide("");
  }, [selectedLaneIndex, showLinePicker]);

  const slideKeys = useMemo((): DomainSlideKey[] => {
    const keys: DomainSlideKey[] = itemsInLane.map((i) => domainSlideKey(i.id));
    if (canAddInLane) keys.push("add");
    return keys;
  }, [itemsInLane, canAddInLane]);

  useEffect(() => {
    if (slideKeys.length === 0) {
      setActiveSlide("");
      return;
    }
    if (activeSlide && slideKeys.includes(activeSlide)) return;
    setActiveSlide(slideKeys[0]!);
  }, [slideKeys, activeSlide]);

  const slideIndex = activeSlide ? slideKeys.indexOf(activeSlide) : -1;

  function goSlide(delta: number) {
    if (slideKeys.length === 0) return;
    const i = slideIndex < 0 ? 0 : slideIndex;
    const next = (i + delta + slideKeys.length) % slideKeys.length;
    setActiveSlide(slideKeys[next]!);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) < 48) return;
    goSlide(dx < 0 ? 1 : -1);
  }

  function handleDomainAdded(newId: number) {
    setActiveSlide(domainSlideKey(newId));
    onChanged();
  }

  const activeItem =
    activeSlide.startsWith("item:") && slideIndex >= 0
      ? itemsInLane.find((i) => domainSlideKey(i.id) === activeSlide) ?? null
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-xs leading-relaxed text-violet-950">
        <p className="font-semibold text-violet-900">已开通发信域名（{used}{slots > 0 ? ` / ${slots}` : ""}）</p>
        <p className="mt-1 text-violet-900/90">
          在下方<strong className="mx-0.5 font-medium">同一区域</strong>
          左右切换各发信域名；每个域名均含资料、DNS 记录与测试发信。套餐正式期自平台
          <strong className="mx-0.5 font-medium">首次推送 DNS</strong>
          起算，有效期内各域可随时验证与测试发信。
        </p>
        {remaining > 0 ? (
          <p className="mt-1 text-violet-800">
            {showLinePicker && selectedLane ? (
              <>
                当前<strong className="mx-0.5 font-medium">{selectedLane.label || `专线 ${selectedLane.laneIndex}`}</strong>
                还可新增 <strong>{laneRemaining}</strong> 个域（本专线上限 {domainSlotsPerLane} 个；套餐合计还可{" "}
                {remaining} 个）。
              </>
            ) : (
              <>
                还可新增 <strong>{remaining}</strong> 个域：点「+ 新增发信域名」标签后填写并提交，再切回该域完成 DNS 与测试。
              </>
            )}
          </p>
        ) : null}
      </div>

      {showLinePicker && lanes.length > 0 ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-800">1. 选择专线</div>
          <div className="flex flex-wrap gap-2">
            {lanes.map((lane) => {
              const on = selectedLaneIndex === lane.laneIndex;
              const domainCount = laneDomainCounts.get(lane.laneIndex) ?? lane.domains?.length ?? 0;
              return (
                <button
                  key={lane.laneIndex}
                  type="button"
                  onClick={() => {
                    setSelectedLaneIndex(lane.laneIndex);
                    setActiveSlide("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"
                  }`}
                >
                  {lane.label || `专线 ${lane.laneIndex}`}
                  {domainCount > 0 ? (
                    <span className={on ? "text-violet-100" : "text-slate-500"}>
                      {" "}
                      · {domainCount} 域
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-800">
            {showLinePicker ? "2. " : ""}发信域名
            <span className="ml-2 font-normal text-slate-500">（点标签或 ← → 切换；手机可左右滑动）</span>
          </div>
          {slideKeys.length > 1 ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => goSlide(-1)}
                aria-label="上一个域名"
              >
                ←
              </button>
              <span className="text-[11px] text-slate-500">
                {slideIndex >= 0 ? slideIndex + 1 : 1} / {slideKeys.length}
              </span>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => goSlide(1)}
                aria-label="下一个域名"
              >
                →
              </button>
            </div>
          ) : null}
        </div>

        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {itemsInLane.map((item) => {
            const key = domainSlideKey(item.id);
            const on = activeSlide === key;
            const domain = item.senderDomain?.trim() || "（待推送）";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSlide(key)}
                className={`shrink-0 max-w-[200px] truncate rounded-full border px-3 py-1 text-[11px] font-medium ${
                  on
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"
                }`}
                title={domain}
              >
                {item.label || domain}
              </button>
            );
          })}
          {canAddInLane ? (
            <button
              type="button"
              onClick={() => setActiveSlide("add")}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                activeSlide === "add"
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-dashed border-violet-400 bg-violet-50/60 text-violet-800 hover:bg-violet-50"
              }`}
            >
              + 新增发信域名
            </button>
          ) : null}
        </div>

        <div
          className="rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5"
          onTouchStart={slideKeys.length > 1 ? onTouchStart : undefined}
          onTouchEnd={slideKeys.length > 1 ? onTouchEnd : undefined}
        >
          {activeSlide === "add" && canAddInLane ? (
            <AddDedicatedDomainPanel
              variant={variant}
              layout="inline"
              onChanged={onChanged}
              onAdded={handleDomainAdded}
              checkoutTierId={checkoutTierId}
              nextIndex={itemsInLane.length + 1}
              laneIndex={
                showLinePicker && selectedLaneIndex !== "" ? selectedLaneIndex : undefined
              }
            />
          ) : activeItem?.status === "requested" ? (
            <RequestedDomainEditSlide
              variant={variant}
              item={activeItem}
              editable={Boolean(editUnlockedDomainIds?.has(activeItem.id))}
              onChanged={onChanged}
              onEditLock={() => onEditLock?.(activeItem.id)}
            />
          ) : activeItem ? (
            <DedicatedDomainWorkbenchSlide item={activeItem} onChanged={onChanged} />
          ) : itemsInLane.length === 0 && canAddInLane ? (
            <div className="p-4 text-xs text-slate-600">
              该专线下暂无发信域名，请点上方「+ 新增发信域名」提交（将绑定到
              {selectedLane ? ` ${selectedLane.label || `专线 ${selectedLane.laneIndex}`}` : " 当前专线"}）。
            </div>
          ) : remaining > 0 && !canAddInLane && showLinePicker ? (
            <div className="p-4 text-xs text-amber-900">
              该专线下发信域名已达上限（{domainSlotsPerLane} 个/专线）。请切换其它专线或升级套餐。
            </div>
          ) : remaining > 0 ? (
            <div className="p-4 text-xs text-slate-600">请选择上方「+ 新增发信域名」提交新域。</div>
          ) : (
            <p className="p-4 text-[11px] text-slate-500">发信域名名额已用尽；如需更多请升级「邮件与营销」套餐。</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        发送档位与
        <Link to="/account/center?panel=email" className="mx-0.5 text-violet-700 underline">
          个人中心 · 邮件与营销
        </Link>
        一致；换档请在页面上方 {variantCfg.payPageHint} 完成。
      </p>
    </div>
  );
}

type WorkbenchDomainRow = {
  id: number;
  senderDomain: string | null;
  fromEmail: string | null;
  ptrHostname: string | null;
  groupRelayIp: string | null;
  groupPtrIp: string | null;
  hasAdminSmtpPassword?: boolean;
  dkimPublicKey?: string | null;
  vpsGroupId?: number | null;
};

/** 开源版本地机组槽位形状（原商业代装模块的 WorkbenchGroupSlot 已移除） */
type WorkbenchGroupSlot = {
  id: number | null;
  groupIndex: number;
  label: string;
  relayIp: string | null;
  ptrIp: string | null;
  relayVpsUsername: string | null;
  hasRelayVpsPassword: boolean;
  ptrVpsUsername: string | null;
  hasPtrVpsPassword: boolean;
  infrastructureLocked: boolean;
  isPlaceholder?: boolean;
};

type StandaloneWorkbenchPayload = {
  ok: boolean;
  groups: Array<
    WorkbenchGroupSlot & {
      domains?: Array<{ id: number; senderDomain: string | null; fromEmail: string | null }>;
    }
  >;
  domains: WorkbenchDomainRow[];
  domainSlotsPerLane?: number;
  features: {
    provisionJobsEnabled: boolean;
    provisionSshEnabled: boolean;
    vpsInstallEnabled: boolean;
  };
};

function domainItemsForGroup(
  group: StandaloneWorkbenchPayload["groups"][number],
  activeItems: OnboardingItem[]
): OnboardingItem[] {
  const ids = new Set((group.domains ?? []).map((d) => d.id));
  if (ids.size > 0) {
    return activeItems.filter((i) => ids.has(i.id));
  }
  if (group.id != null) {
    return activeItems.filter((i) => Number(i.vpsGroupId ?? 0) === Number(group.id));
  }
  return [];
}

/** 独立站 · 单 IP：固定 N 个发信域槽位 + 共用 1 组 VPS */
function SingleIpTripleDomainWorkbench(props: {
  variant: DedicatedOnboardingVariant;
  activeItems: OnboardingItem[];
  entitlements: DedicatedEntitlementsSnapshot | null;
  onChanged: () => void;
  checkoutTierId?: string;
}) {
  const { variant, activeItems, entitlements, onChanged, checkoutTierId } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const planPreset = resolveStandalonePlanEntitlements(standaloneLicensePlanTierId());
  const slotCount = Math.max(1, planPreset?.domainSlots ?? entitlements?.domainSlots ?? 3);
  const used = entitlements?.usedDomains ?? activeItems.length;
  const remaining = entitlements?.domainsRemaining ?? Math.max(0, slotCount - used);

  const sortedItems = useMemo(
    () => [...activeItems].sort((a, b) => a.id - b.id),
    [activeItems]
  );
  const slotItems = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => sortedItems[i] ?? null),
    [slotCount, sortedItems]
  );

  const [focusSlotIndex, setFocusSlotIndex] = useState(0);

  useEffect(() => {
    const firstFilled = slotItems.findIndex((item) => item != null);
    if (firstFilled >= 0 && slotItems[focusSlotIndex] == null) {
      setFocusSlotIndex(firstFilled);
    }
  }, [slotItems, focusSlotIndex]);

  const handleRefresh = useCallback(async () => {
    await onChanged();
  }, [onChanged]);

  const focusItem = slotItems[focusSlotIndex] ?? sortedItems[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-violet-950">
        <p className="font-semibold">{sui.singleIpMultiDomainTitle(slotCount, used)}</p>
        <p className="mt-1">{sui.singleIpMultiDomainFlow}</p>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">{sui.tripleDomainStep1(slotCount, used)}</div>
        <div className="space-y-3">
          {slotItems.map((item, idx) => {
            const isFocus = focusSlotIndex === idx;
            const canAddHere = !item && remaining > 0;
            return (
              <div
                key={idx}
                className={`rounded-lg border bg-white shadow-sm transition-colors ${
                  isFocus && item ? "border-violet-400 ring-1 ring-violet-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{sui.tripleDomainSlotTitle(idx + 1)}</div>
                    <div className="text-[10px] text-slate-500">
                      {item
                        ? `${item.senderDomain ?? item.label} · ${item.fromEmail ?? "—"}`
                        : sui.tripleDomainSlotEmpty}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setFocusSlotIndex(idx)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                            isFocus
                              ? "border-violet-600 bg-violet-600 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"
                          }`}
                        >
                          {sui.tripleDomainConfigureTab(item.senderDomain ?? item.label)}
                        </button>
                        <TenantDeleteDedicatedDomainBlock
                          item={item}
                          compact
                          onChanged={() => void handleRefresh()}
                          onDeleted={() => {
                            const next = slotItems.findIndex((x, j) => j !== idx && x != null);
                            if (next >= 0) setFocusSlotIndex(next);
                          }}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="p-3">
                  {item ? (
                    <UnifiedView
                      variant={variant}
                      currentItem={item}
                      onChanged={() => void handleRefresh()}
                      checkoutTierId={checkoutTierId}
                      standaloneWorkbench
                      compactProfileOnly
                    />
                  ) : canAddHere ? (
                    <AddDedicatedDomainPanel
                      variant={variant}
                      layout="inline"
                      standaloneSelfService
                      onChanged={() => void handleRefresh()}
                      onAdded={(id) => {
                        setFocusSlotIndex(idx);
                        void handleRefresh();
                      }}
                      checkoutTierId={checkoutTierId}
                      nextIndex={idx + 1}
                    />
                  ) : (
                    <p className="text-[11px] text-slate-500">{sui.tripleDomainSlotEmpty}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <p className="text-[11px] text-amber-800">{sui.tripleDomainSelectForSmtp}</p>
      ) : (
        <>
          <p className="rounded-md border border-sky-100 bg-sky-50/90 px-3 py-2 text-[11px] leading-relaxed text-sky-950">
            {sui.tripleDomainSharedVpsHint}
          </p>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {sortedItems.map((item) => {
              const idx = slotItems.findIndex((s) => s?.id === item.id);
              const on = idx === focusSlotIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFocusSlotIndex(idx >= 0 ? idx : 0)}
                  className={`max-w-[200px] truncate rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    on
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                  title={item.senderDomain ?? item.label}
                >
                  {item.senderDomain ?? item.label}
                </button>
              );
            })}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-slate-800">{sui.step2Title}</div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] leading-relaxed text-slate-500">
                代装流程在开源版中不可用：请在您自己的服务器上完成发信机配置，然后在下方继续 DNS 与测试发信。
              </p>
            </div>
          </div>

          {focusItem ? (
            <>
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-800">
                  {sui.step3Dns}
                  {focusItem.dnsRecords.length > 0 ? (
                    <span className="ml-2 font-normal text-emerald-700">
                      {sui.step3DnsReady(focusItem.dnsRecords.length, focusItem.senderDomain ?? "")}
                    </span>
                  ) : (
                    <span className="ml-2 font-normal text-amber-800">{sui.step3DnsPending}</span>
                  )}
                </div>
                {focusItem.dnsRecords.length === 0 ? (
                  <DnsRecordsAwaitingBlock
                    variant="submitted"
                    senderDomain={focusItem.senderDomain}
                    standaloneSelfService
                  />
                ) : (
                  <DnsRecordsBlock item={focusItem} onChanged={() => void handleRefresh()} />
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-800">{sui.step4Test}</div>
                <TestSendBlock
                  item={focusItem}
                  emailSubscriptionPaid={true}
                  emailModuleRow={undefined}
                  onChanged={() => void handleRefresh()}
                  standaloneWorkbench
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** 独立站 · 多机组：步骤 1 发信域 + Tab/滑动切换各组 VPS / SMTP / DNS */
function StandaloneMultiGroupWorkbench(props: {
  variant: DedicatedOnboardingVariant;
  activeItems: OnboardingItem[];
  entitlements: DedicatedEntitlementsSnapshot | null;
  onChanged: () => void;
  checkoutTierId?: string;
  workbenchMode?: "multiGroup" | "singleIpMultiDomain";
}) {
  const { variant, activeItems, entitlements, onChanged, checkoutTierId, workbenchMode = "multiGroup" } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const slots = entitlements?.domainSlots ?? 0;
  const vpsGroupSlots = entitlements?.vpsGroupSlots ?? 1;
  const used = entitlements?.usedDomains ?? activeItems.length;
  const remaining = entitlements?.domainsRemaining ?? Math.max(0, slots - used);
  const domainSlotsPerLane = computeDomainSlotsPerLane(slots, vpsGroupSlots);

  const [workbench, setWorkbench] = useState<StandaloneWorkbenchPayload | null>(null);
  const [wbLoading, setWbLoading] = useState(true);
  const [wbErr, setWbErr] = useState<string | null>(null);

  const [lanes, setLanes] = useState<DedicatedLaneSnapshot[]>([]);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | "">("");
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(1);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [domainSlide, setDomainSlide] = useState<DomainSlideKey | "">("");
  const touchStartX = React.useRef(0);

  const reloadWorkbench = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setWbLoading(true);
      setWbErr(null);
    }
    try {
      const r = await apiJson<StandaloneWorkbenchPayload>("/api/email/dedicated-provision/workbench");
      setWorkbench(r);
      setWbErr(null);
      const groups = [...(r.groups ?? [])].sort((a, b) => a.groupIndex - b.groupIndex);
      if (groups.length > 0 && !groups.some((g) => g.groupIndex === selectedGroupIndex)) {
        setSelectedGroupIndex(groups[0]!.groupIndex);
      }
    } catch (e: unknown) {
      setWbErr(String((e as Error)?.message ?? e));
      if (!silent) {
        setWorkbench(null);
      }
    } finally {
      setWbLoading(false);
    }
  }, [selectedGroupIndex]);

  useEffect(() => {
    void reloadWorkbench();
  }, [reloadWorkbench]);

  useEffect(() => {
    let cancelled = false;
    void fetchDedicatedLanes()
      .then((r) => {
        if (!cancelled) setLanes(Array.isArray(r.lanes) ? r.lanes : []);
      })
      .catch(() => {
        if (!cancelled) setLanes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeItems.length]);

  useEffect(() => {
    if (lanes.length === 0) return;
    if (selectedLaneIndex === "") {
      setSelectedLaneIndex(pickDefaultLaneIndex(lanes));
    }
  }, [lanes, selectedLaneIndex]);

  const sortedGroups = useMemo(() => {
    if (!workbench?.groups?.length) {
      return Array.from({ length: vpsGroupSlots }, (_, i) => ({
        id: null,
        groupIndex: i + 1,
        label: sui.groupLabel(i + 1),
        relayIp: null,
        ptrIp: null,
        relayVpsUsername: null,
        hasRelayVpsPassword: false,
        ptrVpsUsername: null,
        hasPtrVpsPassword: false,
        infrastructureLocked: false,
        isPlaceholder: true,
        domains: []
      })) satisfies StandaloneWorkbenchPayload["groups"];
    }
    return [...workbench.groups].sort((a, b) => a.groupIndex - b.groupIndex);
  }, [workbench, vpsGroupSlots]);

  const selectedGroup =
    sortedGroups.find((g) => g.groupIndex === selectedGroupIndex) ?? sortedGroups[0] ?? null;

  const selectedLane = useMemo(
    () => findLaneByIndex(lanes, selectedLaneIndex),
    [lanes, selectedLaneIndex]
  );

  const showLinePicker = lanes.length > 1 || vpsGroupSlots > 1;

  const itemsInLane = useMemo(() => {
    if (!showLinePicker || !selectedLane) return activeItems;
    const gid = selectedLane.vpsGroupId != null ? Number(selectedLane.vpsGroupId) : 0;
    if (gid > 0) {
      return activeItems.filter((i) => Number(i.vpsGroupId ?? 0) === gid);
    }
    const serverIds = new Set(selectedLane.domains.map((d) => d.serverId));
    return activeItems.filter((i) => serverIds.has(i.id));
  }, [activeItems, selectedLane, showLinePicker]);

  const itemsInGroup = useMemo(() => {
    if (!selectedGroup) return [];
    return domainItemsForGroup(selectedGroup, activeItems);
  }, [selectedGroup, activeItems]);

  useEffect(() => {
    if (itemsInGroup.length === 0) {
      setSelectedDomainId(null);
      return;
    }
    if (selectedDomainId == null || !itemsInGroup.some((i) => i.id === selectedDomainId)) {
      setSelectedDomainId(itemsInGroup[0]!.id);
    }
  }, [itemsInGroup, selectedDomainId]);

  useEffect(() => {
    if (!domainSlide.startsWith("item:")) return;
    const id = Number(domainSlide.slice("item:".length));
    if (Number.isFinite(id) && id > 0) {
      setSelectedDomainId(id);
    }
  }, [domainSlide]);

  const selectedDomainItem =
    itemsInGroup.find((i) => i.id === selectedDomainId) ?? itemsInGroup[0] ?? null;

  /** 步骤 3/4 与 SMTP 区共用：仅限当前专线/当前组，不串其它专线 */
  const flowDomainItem = useMemo(() => {
    if (selectedDomainItem) return selectedDomainItem;
    if (domainSlide.startsWith("item:")) {
      const id = Number(domainSlide.slice("item:".length));
      if (Number.isFinite(id)) {
        const hit =
          itemsInLane.find((i) => i.id === id) ?? itemsInGroup.find((i) => i.id === id);
        if (hit) return hit;
      }
    }
    if (itemsInLane[0]) return itemsInLane[0];
    if (itemsInGroup[0]) return itemsInGroup[0];
    return null;
  }, [selectedDomainItem, domainSlide, itemsInLane, itemsInGroup]);

  const laneRemaining = useMemo(() => {
    if (!showLinePicker || !selectedLane) return remaining;
    return Math.max(0, Math.min(remaining, domainSlotsPerLane - itemsInLane.length));
  }, [showLinePicker, selectedLane, remaining, domainSlotsPerLane, itemsInLane.length]);

  const canAddInLane = remaining > 0 && laneRemaining > 0;

  const activeDomainSlideItem = useMemo(() => {
    if (!domainSlide.startsWith("item:")) return null;
    const id = Number(domainSlide.slice("item:".length));
    if (!Number.isFinite(id) || id <= 0) return null;
    return itemsInLane.find((i) => i.id === id) ?? null;
  }, [domainSlide, itemsInLane]);

  const domainSlideKeys = useMemo((): DomainSlideKey[] => {
    const keys = itemsInLane.map((i) => domainSlideKey(i.id));
    if (canAddInLane) keys.push("add");
    return keys;
  }, [itemsInLane, canAddInLane]);

  useEffect(() => {
    if (domainSlideKeys.length === 0) {
      setDomainSlide("");
      return;
    }
    if (domainSlide && domainSlideKeys.includes(domainSlide)) return;
    setDomainSlide(domainSlideKeys[0]!);
  }, [domainSlideKeys, domainSlide]);

  const groupSlideIndex = sortedGroups.findIndex((g) => g.groupIndex === selectedGroupIndex);

  function goGroup(delta: number) {
    if (sortedGroups.length === 0) return;
    const i = groupSlideIndex < 0 ? 0 : groupSlideIndex;
    const next = (i + delta + sortedGroups.length) % sortedGroups.length;
    setSelectedGroupIndex(sortedGroups[next]!.groupIndex);
  }

  function onGroupTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
  }

  function onGroupTouchEnd(e: React.TouchEvent) {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) < 48) return;
    goGroup(dx < 0 ? 1 : -1);
  }

  async function handleRefresh() {
    await onChanged();
    await reloadWorkbench({ silent: true });
  }

  const emailSubscriptionPaid = true;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-violet-950">
        <p className="font-semibold">
          {workbenchMode === "singleIpMultiDomain"
            ? sui.singleIpMultiDomainTitle(slots, used)
            : sui.multiGroupTitle(vpsGroupSlots, slots, used)}
        </p>
        <p className="mt-1">
          {workbenchMode === "singleIpMultiDomain" ? sui.singleIpMultiDomainFlow : sui.multiGroupFlow}
        </p>
      </div>

      {/* ── 步骤 1：专线 + 发信域 ── */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">{sui.step1Domains}</div>
        {showLinePicker && lanes.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {lanes.map((lane) => {
              const on = selectedLaneIndex === lane.laneIndex;
              const n = activeItems.filter((i) => {
                const gid = lane.vpsGroupId != null ? Number(lane.vpsGroupId) : 0;
                if (gid > 0) return Number(i.vpsGroupId ?? 0) === gid;
                return lane.domains.some((d) => d.serverId === i.id);
              }).length;
              return (
                <button
                  key={lane.laneIndex}
                  type="button"
                  onClick={() => {
                    setSelectedLaneIndex(lane.laneIndex);
                    setDomainSlide("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    on
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-violet-300"
                  }`}
                >
                  {lane.label || sui.laneLabel(lane.laneIndex)}
                  {n > 0 ? (
                    <span className={on ? "text-violet-100" : "text-slate-500"}>{sui.domainCount(n)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mb-2 flex flex-wrap gap-1.5">
          {itemsInLane.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDomainSlide(domainSlideKey(item.id))}
              className={`max-w-[180px] truncate rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                domainSlide === domainSlideKey(item.id)
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
              title={item.senderDomain ?? item.label}
            >
              {item.senderDomain ?? item.label}
            </button>
          ))}
          {canAddInLane ? (
            <button
              type="button"
              onClick={() => setDomainSlide("add")}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                domainSlide === "add"
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-dashed border-violet-400 text-violet-800"
              }`}
            >
              {sui.addDomain}
            </button>
          ) : null}
        </div>

        {activeDomainSlideItem ? (
          <TenantDeleteDedicatedDomainBlock
            className="mb-2"
            item={activeDomainSlideItem}
            onChanged={() => void handleRefresh()}
            onDeleted={() => {
              const rest = itemsInLane.filter((i) => i.id !== activeDomainSlideItem.id);
              if (rest.length > 0) {
                setDomainSlide(domainSlideKey(rest[0]!.id));
              } else if (canAddInLane) {
                setDomainSlide("add");
              } else {
                setDomainSlide("");
              }
            }}
          />
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          {domainSlide === "add" && canAddInLane ? (
            <AddDedicatedDomainPanel
              variant={variant}
              layout="inline"
              onChanged={onChanged}
              onAdded={(id) => {
                setDomainSlide(domainSlideKey(id));
                void handleRefresh();
              }}
              checkoutTierId={checkoutTierId}
              nextIndex={itemsInLane.length + 1}
              laneIndex={showLinePicker && selectedLaneIndex !== "" ? selectedLaneIndex : undefined}
              standaloneSelfService
            />
          ) : domainSlide.startsWith("item:") ? (
            <UnifiedView
              variant={variant}
              currentItem={
                itemsInLane.find((i) => domainSlideKey(i.id) === domainSlide) ?? itemsInLane[0] ?? null
              }
              onChanged={handleRefresh}
              checkoutTierId={checkoutTierId}
              standaloneWorkbench
              compactProfileOnly
            />
          ) : itemsInLane.length === 0 && canAddInLane ? (
            <p className="text-[11px] text-slate-600">{sui.noDomainInLane}</p>
          ) : (
            <p className="text-[11px] text-slate-500">{sui.pickDomainHint}</p>
          )}
        </div>
      </div>

      {/* ── 步骤 2–3：组机 Tab ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-800">
            {sui.step2Title}
            <span className="ml-2 font-normal text-slate-500">{sui.step2TabHint}</span>
          </div>
          {sortedGroups.length > 1 ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                onClick={() => goGroup(-1)}
                aria-label={sui.prevGroup}
              >
                ←
              </button>
              <span className="text-[11px] text-slate-500">
                {groupSlideIndex >= 0 ? groupSlideIndex + 1 : 1} / {sortedGroups.length}
              </span>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                onClick={() => goGroup(1)}
                aria-label={sui.nextGroup}
              >
                →
              </button>
            </div>
          ) : null}
        </div>

        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {sortedGroups.map((g) => {
            const on = g.groupIndex === selectedGroupIndex;
            const domainCount = domainItemsForGroup(g, activeItems).length;
            return (
              <button
                key={g.groupIndex}
                type="button"
                onClick={() => {
                  setSelectedGroupIndex(g.groupIndex);
                  const lane = lanes.find((l) => l.laneIndex === g.groupIndex);
                  if (lane) setSelectedLaneIndex(lane.laneIndex);
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                  on
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-sky-400"
                }`}
              >
                {g.label || sui.groupLabel(g.groupIndex)}
                {domainCount > 0 ? (
                  <span className={on ? "text-sky-100" : "text-slate-500"}>{sui.domainCount(domainCount)}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] leading-relaxed text-slate-500">
            代装流程在开源版中不可用：请在您自己的服务器上完成发信机 / 解析机配置，然后在下方继续 DNS 与测试发信。
          </p>
        </div>
      </div>

      {/* ── 步骤 3：DNS（始终展示，便于整页从上到下走完流程） ── */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-slate-800">
          {sui.step3Dns}
          {flowDomainItem && flowDomainItem.dnsRecords.length > 0 ? (
            <span className="ml-2 font-normal text-emerald-700">
              {sui.step3DnsReady(flowDomainItem.dnsRecords.length, flowDomainItem.senderDomain ?? "")}
            </span>
          ) : (
            <span className="ml-2 font-normal text-amber-800">{sui.step3DnsPending}</span>
          )}
        </div>
        {!flowDomainItem ? (
          <DnsRecordsAwaitingBlock variant="submitted" standaloneSelfService />
        ) : flowDomainItem.dnsRecords.length === 0 ? (
          <DnsRecordsAwaitingBlock
            variant="submitted"
            senderDomain={flowDomainItem.senderDomain}
            standaloneSelfService
          />
        ) : (
          <DnsRecordsBlock item={flowDomainItem} onChanged={handleRefresh} />
        )}
      </div>

      {/* ── 步骤 4：测试发信（始终展示） ── */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-slate-800">{sui.step4Test}</div>
        <TestSendBlock
          item={flowDomainItem}
          emailSubscriptionPaid={emailSubscriptionPaid}
          emailModuleRow={undefined}
          onChanged={handleRefresh}
          standaloneWorkbench
        />
      </div>
    </div>
  );
}

const TENANT_DELETABLE_STATUSES = new Set([
  "requested",
  "rejected",
  "provisioning",
  "awaiting_dns",
  "ready",
  "paused",
  "failed"
]);

function TenantDeleteDedicatedDomainBlock(props: {
  item: OnboardingItem;
  onChanged: () => void;
  onDeleted?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { item, onChanged, onDeleted, className = "", compact = false } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const pageMsg = usePageFeedback();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  if (!TENANT_DELETABLE_STATUSES.has(item.status)) return null;

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>(
        `/api/email/dedicated-servers/${item.id}`,
        { method: "DELETE" }
      );
      pageMsg.showOk(r.message ?? sui.deleted);
      setDeleteConfirm(false);
      onDeleted?.();
      onChanged();
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    } finally {
      setDeleteBusy(false);
    }
  }

  const label = item.senderDomain ?? item.label;
  const hint =
    item.status === "ready" || item.status === "paused" ? sui.deleteHintReady : sui.deleteHintOther;

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        {deleteConfirm ? (
          <InlineConfirmBar
            className="flex-1 min-w-[12rem]"
            message={sui.confirmDelete(label)}
            onConfirm={() => void handleDelete()}
            onCancel={() => setDeleteConfirm(false)}
            busy={deleteBusy}
            confirmLabel={sui.confirmDeleteLabel}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
          >
            {sui.deleteThisDomain}
          </button>
        )}
        <PageFeedbackLine feedback={pageMsg.feedback} />
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 ${className}`}>
      <div className="text-xs font-semibold text-slate-800">{sui.deleteDomainTitle}</div>
      <p className="mt-1 text-[11px] text-slate-600">{hint}</p>
      {deleteConfirm ? (
        <InlineConfirmBar
          className="mt-2"
          message={sui.confirmDelete(label)}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteConfirm(false)}
          busy={deleteBusy}
          confirmLabel={sui.confirmDeleteLabel}
        />
      ) : (
        <button
          type="button"
          onClick={() => setDeleteConfirm(true)}
          className="mt-2 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
        >
          {sui.deleteThisDomain}
        </button>
      )}
      <PageFeedbackLine feedback={pageMsg.feedback} className="mt-2" />
    </div>
  );
}

/** 待审核：默认锁定；驳回后「继续编辑」解锁 */
function RequestedDomainEditSlide(props: {
  variant: DedicatedOnboardingVariant;
  item: OnboardingItem;
  editable: boolean;
  onChanged: () => void;
  onEditLock?: () => void;
}) {
  const { item, editable, onChanged, onEditLock } = props;
  const pageMsg = usePageFeedback();
  const [label, setLabel] = useState(item.label ?? "");
  const [senderDomain, setSenderDomain] = useState(item.senderDomain ?? "");
  const [fromName, setFromName] = useState(item.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(item.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(item.replyTo ?? "");
  const [notes, setNotes] = useState(item.notesFromUser ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const snap = loadFormSnapshot();
    const merged = buildFormFieldsFromItem(item, snap);
    setLabel(merged.label);
    setSenderDomain(merged.senderDomain);
    setFromName(merged.fromName);
    setFromEmail(merged.fromEmail);
    setReplyTo(merged.replyTo);
    setNotes(merged.notes);
  }, [item.id, item.updatedAt]);

  useEffect(() => {
    if (!editable) return;
    if (!fromEmail && senderDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(senderDomain.trim())) {
      setFromEmail(suggestFromEmail(senderDomain) || `marketing@${senderDomain.trim().toLowerCase()}`);
    }
  }, [senderDomain, fromEmail, editable]);

  async function handleSave() {
    setError(null);
    if (!label.trim()) {
      setError("请填写服务名称");
      return;
    }
    const domainErr = validateDedicatedSenderDomain(senderDomain);
    if (domainErr) {
      setError(domainErr);
      return;
    }
    if (!fromName.trim()) {
      setError("请填写发件人显示名");
      return;
    }
    const emailErr = validateDedicatedFromEmail(fromEmail, senderDomain);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (replyTo.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo.trim())) {
      setError("回信地址格式不正确");
      return;
    }
    try {
      const pre = await fetchDedicatedSenderDomainPrecheck(senderDomain, fromEmail);
      if (!pre.ok && pre.hardErrors.length) {
        setError(pre.hardErrors.join("；"));
        return;
      }
    } catch {
      /* ignore */
    }
    setSaving(true);
    try {
      await apiJson(`/api/email/dedicated-servers/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: label.trim(),
          senderDomain: senderDomain.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          replyTo: replyTo.trim() || null,
          notesFromUser: notes.trim() || null
        })
      });
      saveFormSnapshot({
        tierId: String(item.subscriptionTierId ?? ""),
        label: label.trim(),
        senderDomain: senderDomain.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyTo: replyTo.trim(),
        notes: notes.trim()
      });
      pageMsg.showOk("资料已保存，请等待平台审核");
      onEditLock?.();
      onChanged();
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] ${
          editable
            ? "border-sky-200 bg-sky-50 text-sky-950"
            : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
        }`}
      >
        {editable ? (
          <>
            <strong>驳回后重新编辑</strong>
            <span className="ml-1">请修改下方资料后点「保存修改」，将重新进入平台审核。</span>
          </>
        ) : (
          <>
            <strong>发信域名开通申请已提交</strong>
            <span className="ml-1">
              资料已锁定，请等待平台审核与 DNS 推送。若被驳回，可在页面上方驳回通知中点「继续编辑」。
            </span>
          </>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">
          发件域名与发件人资料{editable ? "（可编辑）" : "（已提交 · 只读）"}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldText
            label="服务名称 *"
            sub="（仅自己看）"
            value={label}
            onChange={setLabel}
            placeholder="例：主营销服务"
            readOnly={!editable}
          />
          <FieldText
            label="发件域名 *"
            value={senderDomain}
            onChange={setSenderDomain}
            placeholder="例：mail.yourcompany.com"
            mono
            readOnly={!editable}
          />
          <FieldText
            label="发件人显示名 *"
            value={fromName}
            onChange={setFromName}
            placeholder="例：运营组"
            readOnly={!editable}
          />
          <FieldText
            label="发件邮箱 *"
            value={fromEmail}
            onChange={setFromEmail}
            placeholder="例：marketing@mail.yourcompany.com"
            mono
            type="email"
            readOnly={!editable}
          />
          <FieldText
            label="回信地址（可选）"
            value={replyTo}
            onChange={setReplyTo}
            placeholder="留空 = 与发件邮箱一致"
            mono
            type="email"
            readOnly={!editable}
          />
          <FieldTextArea
            label="备注（可选）"
            value={notes}
            onChange={setNotes}
            rows={2}
            className="sm:col-span-2"
            readOnly={!editable}
          />
        </div>
        {error ? (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        ) : null}
        {editable ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存修改"}
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">
          DNS 记录
          <span className="ml-2 font-normal text-amber-800">（平台审核并推送后显示）</span>
        </div>
        <DnsRecordsAwaitingBlock variant="submitted" senderDomain={senderDomain.trim() || null} />
      </div>

      <div className="border-t border-slate-200 pt-3">
        {deleteConfirm ? (
          <InlineConfirmBar
            message={`删除「${senderDomain || label}」？名额将释放。`}
            onConfirm={async () => {
              setDeleteBusy(true);
              try {
                const r = await apiJson<{ ok: boolean; message?: string }>(
                  `/api/email/dedicated-servers/${item.id}`,
                  { method: "DELETE" }
                );
                pageMsg.showOk(r.message ?? "已删除");
                setDeleteConfirm(false);
                onChanged();
              } catch (e: unknown) {
                pageMsg.showErr(String((e as Error)?.message ?? e));
              } finally {
                setDeleteBusy(false);
              }
            }}
            onCancel={() => setDeleteConfirm(false)}
            busy={deleteBusy}
            confirmLabel="确认删除"
          />
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            删除此发信域
          </button>
        )}
        <PageFeedbackLine feedback={pageMsg.feedback} />
      </div>
    </div>
  );
}

function DedicatedDomainWorkbenchSlide(props: { item: OnboardingItem; onChanged: () => void }) {
  const { item, onChanged } = props;
  const { locale } = useSiteLocale();
  const { modules } = useProductModules();
  const emailRow = modules.find((m) => m.key === "email");
  const emailModuleForCycle = emailRow
    ? {
        simulatedPaidAt: emailRow.simulatedPaidAt,
        serviceEffectiveStart: emailRow.serviceEffectiveStart,
        serviceEffectiveEnd: emailRow.serviceEffectiveEnd,
        periodEnd: emailRow.periodEnd
      }
    : undefined;
  const emailSubscriptionPaid = Boolean(emailRow?.simulatedPaidAt && emailRow?.emailTierId);
  const badge = dedicatedStatusBadge(item);
  const formalPeriod = dedicatedFormalPeriod(item, emailModuleForCycle);
  /** 开源版无 SaaS 套餐体系：不存在"新套餐待生效"概念 */
  const pendingNewCycle = false;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-violet-900">发信域名资料</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{item.label || "发信域名"}</div>
          <div className="mt-0.5 font-mono text-xs text-slate-600">{item.senderDomain ?? "（待填写）"}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{item.fromEmail ?? "—"}</div>
        </div>
        {badge ? (
          <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        ) : null}
      </div>

      {formalPeriod.start ? (
        <p className="text-[11px] text-slate-600">
          本域开通参考：{formatServiceDateTime(formalPeriod.start, locale)}
          {formalPeriod.end ? ` — ${formatServiceDateTime(formalPeriod.end, locale)}` : ""}
        </p>
      ) : null}

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">
          DNS 记录
          {item.dnsRecords.length > 0 ? (
            <span className="ml-2 font-normal text-emerald-700">
              （已推送 {item.dnsRecords.length} 条，请复制到域名服务商）
            </span>
          ) : (
            <span className="ml-2 font-normal text-amber-800">（平台推送后显示；提交新域后请切回本标签查看）</span>
          )}
        </div>
        {item.dnsRecords.length === 0 ? (
          <DnsRecordsAwaitingBlock variant="submitted" senderDomain={item.senderDomain} />
        ) : (
          <DnsRecordsBlock item={item} onChanged={onChanged} pendingNewCycle={pendingNewCycle} />
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">发送测试邮件</div>
        <TestSendBlock
          item={item}
          emailSubscriptionPaid={emailSubscriptionPaid}
          emailModuleRow={emailModuleForCycle}
          onChanged={onChanged}
        />
      </div>

      <TenantDeleteDedicatedDomainBlock item={item} onChanged={onChanged} />
    </div>
  );
}

function AddDedicatedDomainPanel(props: {
  variant: DedicatedOnboardingVariant;
  onChanged: () => void;
  checkoutTierId?: string;
  nextIndex: number;
  layout?: "collapsed" | "inline";
  onAdded?: (newId: number) => void;
  /** 多专线：绑定到所选专线（1-based） */
  laneIndex?: number | "";
  /** 独立站：LICENSE 已开通，无需 SaaS 支付校验 */
  standaloneSelfService?: boolean;
}) {
  const {
    variant,
    onChanged,
    checkoutTierId,
    nextIndex,
    layout = "collapsed",
    onAdded,
    laneIndex,
    standaloneSelfService = false
  } = props;
  const variantCfg = DEDICATED_VARIANT_CONFIG[variant];
  const { user } = useAuth();
  const { modules } = useProductModules();
  const pageMsg = usePageFeedback();
  const emailRow = modules.find((m) => m.key === "email");
  const emailSubscriptionPaid =
    standaloneSelfService || Boolean(emailRow?.simulatedPaidAt && emailRow?.emailTierId);
  const accountEmailTierId = (emailRow?.emailTierId ?? "") as string;
  /** 开源版无 SaaS 付费档位概念 */
  const accountTierIsPaidDedicated = false;
  const bypassTierLock = user?.role === "super_admin";
  const [open, setOpen] = useState(layout === "inline");
  const [submitting, setSubmitting] = useState(false);
  const [tierId, setTierId] = useState<string | "">(() => {
    if (bypassTierLock) return "";
    if (standaloneSelfService) return standaloneLicensePlanTierId() as string;
    return accountTierIsPaidDedicated ? accountEmailTierId : "";
  });
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const [label, setLabel] = useState(
    standaloneSelfService ? sui.addDomainDefaultLabel(nextIndex) : `发信域名 ${nextIndex}`
  );
  const [senderDomain, setSenderDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (layout === "inline") setOpen(true);
  }, [layout]);

  useEffect(() => {
    if (!open || fromEmail || !senderDomain.trim()) return;
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(senderDomain.trim())) {
      setFromEmail(suggestFromEmail(senderDomain) || `marketing@${senderDomain.trim().toLowerCase()}`);
    }
  }, [senderDomain, fromEmail, open]);

  async function handleAdd() {
    const effectiveTier =
      tierId || (standaloneSelfService ? (standaloneLicensePlanTierId() as string) : "");
    if (!effectiveTier) {
      pageMsg.showErr("请先确认发送档位（须与个人中心邮件套餐一致）");
      return;
    }
    const domainErr = standaloneSelfService
      ? validateDedicatedSenderDomainLocalized(senderDomain, sui)
      : validateDedicatedSenderDomain(senderDomain);
    if (domainErr) {
      pageMsg.showErr(domainErr);
      return;
    }
    if (!fromName.trim()) {
      pageMsg.showErr(standaloneSelfService ? sui.errFromName : "请填写发件人显示名");
      return;
    }
    const emailErr = standaloneSelfService
      ? validateDedicatedFromEmailLocalized(fromEmail, senderDomain, sui)
      : validateDedicatedFromEmail(fromEmail, senderDomain);
    if (emailErr) {
      pageMsg.showErr(emailErr);
      return;
    }
    try {
      const pre = await fetchDedicatedSenderDomainPrecheck(senderDomain, fromEmail);
      if (!pre.ok && pre.hardErrors.length) {
        pageMsg.showErr(pre.hardErrors.join("；"));
        return;
      }
      if (pre.warnings.length && !standaloneSelfService) {
        pageMsg.showOk(`DNS 提示：${pre.warnings.join("；")}`);
      }
    } catch {
      /* 预检失败不阻断提交 */
    }
    setSubmitting(true);
    try {
      const lane =
        laneIndex != null && laneIndex !== "" ? Math.max(1, Math.floor(Number(laneIndex))) : 0;
      const r = await apiJson<{ ok: boolean; id?: number }>("/api/email/dedicated-servers", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim(),
          senderDomain: senderDomain.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          replyTo: replyTo.trim() || undefined,
          subscriptionTierId: effectiveTier,
          notesFromUser: notes.trim() || undefined,
          ...(lane > 0 ? { laneIndex: lane } : {})
        })
      });
      const newId = r.id != null ? Number(r.id) : 0;
      pageMsg.showOk(standaloneSelfService ? sui.addDomainSaved : "已提交新发信域名申请。请点上方该域名标签，在同一区域完成 DNS 验证与测试发信。");
      if (layout === "inline" && newId > 0) {
        onAdded?.(newId);
      } else {
        setOpen(false);
        onChanged();
      }
      setSenderDomain("");
      setFromEmail("");
      setLabel(standaloneSelfService ? sui.addDomainDefaultLabel(nextIndex + 1) : `发信域名 ${nextIndex + 1}`);
      if (layout !== "inline") onChanged();
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open && layout === "collapsed") {
    return (
      <button
        type="button"
        className="w-full rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-4 py-3 text-sm font-medium text-violet-900 hover:bg-violet-50"
        onClick={() => setOpen(true)}
      >
        {standaloneSelfService ? sui.addDomain : "+ 新增发信域名"}
      </button>
    );
  }

  return (
    <div className={layout === "inline" ? "space-y-3 p-4" : "rounded-lg border border-violet-200 bg-violet-50/40 p-4"}>
      <div className="text-xs font-semibold text-violet-950">
        {standaloneSelfService
          ? sui.addDomainTitle(
              nextIndex,
              laneIndex != null && laneIndex !== "" ? Number(laneIndex) : undefined
            )
          : `新增发信域名（第 ${nextIndex} 个${laneIndex != null && laneIndex !== "" ? ` · 专线 ${laneIndex}` : ""}）`}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-violet-900/90">
        {standaloneSelfService ? sui.addDomainHint : "提交后平台推送 DNS；请点上方新域名标签，在本区域下方完成 DNS 与测试（无需整页往下找）。"}
      </p>
      {!emailSubscriptionPaid && !bypassTierLock ? (
        <p className="mt-2 text-[11px] text-amber-800">请先在页面上方完成「{variantCfg.payPageHint}」支付。</p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FieldText
          label={standaloneSelfService ? sui.fieldServiceName : "服务名称 *"}
          value={label}
          onChange={setLabel}
          placeholder={standaloneSelfService ? sui.fieldServiceNamePh : "例：海外活动 B"}
        />
        <FieldText
          label={standaloneSelfService ? sui.fieldSenderDomain : "发件域名 *"}
          value={senderDomain}
          onChange={setSenderDomain}
          placeholder={standaloneSelfService ? sui.fieldSenderDomainPh : "mail.example.com"}
          mono
        />
        <FieldText
          label={standaloneSelfService ? sui.fieldFromName : "发件人显示名 *"}
          value={fromName}
          onChange={setFromName}
          placeholder={standaloneSelfService ? sui.fieldFromNamePh : undefined}
        />
        <FieldText
          label={standaloneSelfService ? sui.fieldFromEmail : "发件邮箱 *"}
          value={fromEmail}
          onChange={setFromEmail}
          mono
          type="email"
          placeholder={standaloneSelfService ? sui.fieldFromEmailPh : undefined}
        />
        <FieldText
          label={standaloneSelfService ? sui.fieldReplyTo : "回信地址（可选）"}
          value={replyTo}
          onChange={setReplyTo}
          mono
          type="email"
          placeholder={standaloneSelfService ? sui.fieldReplyToPh : undefined}
        />
      </div>
      <p className="text-[11px] text-slate-600">
        {standaloneSelfService ? sui.addDomainSmtpNote : "SMTP 发信密码由平台运营在后台生成并写入发信机，您无需填写。"}
      </p>
      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
        {standaloneSelfService ? sui.addDomainDnsNote : (
          <>
            提交成功后，DNS 记录与「发送测试邮件」将出现在<strong className="mx-0.5">该域名</strong>
            的标签页内（与首域相同流程）。
          </>
        )}
      </div>
      <input type="hidden" value={tierId} readOnly />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting || (!emailSubscriptionPaid && !bypassTierLock)}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          onClick={() => void handleAdd()}
        >
          {submitting ? sui.saving : standaloneSelfService ? sui.saveSenderDomain : "提交新发信域名申请"}
        </button>
        {layout === "collapsed" ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            onClick={() => setOpen(false)}
          >
            {standaloneSelfService ? sui.cancel : "取消"}
          </button>
        ) : null}
      </div>
      <PageFeedbackLine feedback={pageMsg.feedback} className="mt-2" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * UnifiedView：套餐网格 + 表单 + 操作条 + DNS 区 + 测试发送区
 * 首域申请（无任何非 cancelled 记录时）使用。
 * ───────────────────────────────────────────────────────────── */

function UnifiedView(props: {
  variant: DedicatedOnboardingVariant;
  currentItem: OnboardingItem | null;
  onChanged: () => void;
  checkoutTierId?: string;
  standaloneWorkbench?: boolean;
  /** 多机组页步骤 1 内嵌：仅资料表单，不重复渲染装机/DNS 块 */
  compactProfileOnly?: boolean;
}) {
  const {
    variant,
    currentItem,
    onChanged,
    checkoutTierId,
    standaloneWorkbench = false,
    compactProfileOnly = false
  } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const variantCfg = DEDICATED_VARIANT_CONFIG[variant];
  const submitted = currentItem !== null;
  const { user } = useAuth();
  const { modules, loading: pmLoading } = useProductModules();
  const emailRow = modules.find((m) => m.key === "email");
  /** 已付款开通档位（未必已开始正式服务周期） */
  const emailSubscriptionPaid = standaloneWorkbench
    ? true
    : Boolean(emailRow?.simulatedPaidAt && emailRow?.emailTierId);
  const emailModuleForCycle = useMemo(
    () =>
      emailRow
        ? {
            simulatedPaidAt: emailRow.simulatedPaidAt,
            serviceEffectiveStart: emailRow.serviceEffectiveStart,
            serviceEffectiveEnd: emailRow.serviceEffectiveEnd,
            periodEnd: emailRow.periodEnd
          }
        : undefined,
    [emailRow]
  );
  /** 超管前端为联调/演示保留任意选档；普通租户与个人中心「邮件与营销」套餐强制一致 */
  const bypassTierLock = user?.role === "super_admin";

  const accountEmailTierId = useMemo(() => {
    const row = modules.find((m) => m.key === "email");
    const id = row?.emailTierId;
    if (standaloneWorkbench) {
      if (id && typeof id === "string") return id as string;
      return standaloneLicensePlanTierId() as string;
    }
    return id && typeof id === "string" ? (id as string) : "";
  }, [modules, standaloneWorkbench]);

  /** 开源版无 SaaS 付费档位概念（原 isPaidDedicatedEmailTierId 已移除） */
  const accountTierIsPaidDedicated = false;

  /** 受控字段：未提交时来自 form state；已提交时直接取 currentItem */
  const [tierId, setTierId] = useState<string | "">("");
  const [label, setLabel] = useState("");
  const [senderDomain, setSenderDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [notes, setNotes] = useState("");

  /**
   * 已提交时，把 currentItem 的值同步进 state（只读展示用）。
   * 这样切换"提交前 → 提交后"瞬间不会出现空字段闪烁。
   *
   * 兜底逻辑：当 currentItem 某字段为 null（说明老后端把这个字段丢了），
   * 用本地快照（提交时缓存的 form 值）来回显，避免出现「（未填）」误导。
   */
  useEffect(() => {
    if (!currentItem) return;
    const snap = loadFormSnapshot();
    const merged = buildFormFieldsFromItem(currentItem, snap);
    const tierForForm =
      !bypassTierLock && accountTierIsPaidDedicated && accountEmailTierId
        ? accountEmailTierId
        : ((merged.tierId || "") as string | "");
    setTierId(tierForForm);
    setLabel(merged.label);
    setSenderDomain(merged.senderDomain);
    setFromName(merged.fromName);
    setFromEmail(merged.fromEmail);
    setReplyTo(merged.replyTo);
    setNotes(merged.notes);
    /** 用平台后台已保存的数据刷新本地快照，避免只显示「（未填）」 */
    saveFormSnapshot(merged);
  }, [currentItem, accountEmailTierId, accountTierIsPaidDedicated, bypassTierLock]);

  /** 未提交工单时：SaaS 恢复浏览器草稿；独立站保持空白 */
  useEffect(() => {
    if (currentItem || standaloneWorkbench) return;
    const snap = loadFormSnapshot();
    if (!snap) return;
    if (snap.tierId) setTierId(snap.tierId as string);
    if (snap.label) setLabel(snap.label);
    if (snap.senderDomain) setSenderDomain(snap.senderDomain);
    if (snap.fromName) setFromName(snap.fromName);
    if (snap.fromEmail) setFromEmail(snap.fromEmail);
    if (snap.replyTo) setReplyTo(snap.replyTo);
    if (snap.notes) setNotes(snap.notes);
  }, [currentItem, standaloneWorkbench]);

  /**
   * 未存在开通申请时：发送档位与个人中心「邮件与营销」已购 tier 同步（中量页不可另选）。
   * 若个人中心为 500 等低于可售低档，本页不预选（须先升级）。
   */
  useEffect(() => {
    if (submitted) return;
    if (standaloneWorkbench) {
      setTierId(accountEmailTierId || (standaloneLicensePlanTierId() as string));
      return;
    }
    if (bypassTierLock) return;
    if (pmLoading) return;
    if (accountTierIsPaidDedicated) {
      setTierId(accountEmailTierId as string);
    } else {
      setTierId("");
    }
  }, [
    submitted,
    pmLoading,
    accountTierIsPaidDedicated,
    accountEmailTierId,
    bypassTierLock,
    standaloneWorkbench,
    accountEmailTierId
  ]);

  /** 个人中心换档/续费后，表单档位与之一致（避免仍用旧工单档 3000 校验失败） */
  useEffect(() => {
    if (bypassTierLock) return;
    if (accountTierIsPaidDedicated && accountEmailTierId) {
      setTierId(accountEmailTierId);
    }
  }, [accountEmailTierId, accountTierIsPaidDedicated, bypassTierLock]);

  /** 用户填了发件域名却没填 from_email 时，自动建议 marketing@domain */
  useEffect(() => {
    if (
      !submitted &&
      !fromEmail &&
      senderDomain &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(senderDomain.trim())
    ) {
      setFromEmail(suggestFromEmail(senderDomain) || `marketing@${senderDomain.trim().toLowerCase()}`);
    }
  }, [senderDomain, fromEmail, submitted]);

  const [submitting, setSubmitting] = useState(false);
  const [domainChangeSubmitting, setDomainChangeSubmitting] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const pageMsg = usePageFeedback();
  /** 已提交后：null=未选择，false=保持域名，true=编辑并申请更换 */
  const [wantsDomainChange, setWantsDomainChange] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const domainChangePending = currentItem?.domainChangeStatus === "pending_admin";
  const domainChangeRejected = currentItem?.domainChangeStatus === "rejected";
  /** 开源版无 SaaS 套餐体系：套餐有效期概念恒为"无" */
  const tenantPackageInValidity = false;
  const formalServiceInPeriod = tenantPackageInValidity;
  /** 仅在新套餐付款后、尚未推送 DNS 起算正式周期时，可询问是否更换域名 */
  const canOfferDomainChange =
    !standaloneWorkbench &&
    submitted &&
    emailSubscriptionPaid &&
    !formalServiceInPeriod &&
    !domainChangePending;
  /** 付款后、待后台推送 DNS 起算正式周期 */
  const pendingNewCycleActivation =
    !standaloneWorkbench &&
    emailSubscriptionPaid &&
    submitted &&
    !tenantPackageInValidity;

  useEffect(() => {
    if (!currentItem) {
      setWantsDomainChange(null);
      return;
    }
    if (domainChangePending) {
      setWantsDomainChange(true);
      return;
    }
    if (domainChangeRejected) {
      setWantsDomainChange(null);
    }
  }, [currentItem?.id, domainChangePending, domainChangeRejected]);

  const profileFieldsReadOnly = standaloneWorkbench
    ? false
    : submitted &&
      currentItem?.status !== "requested" &&
      !domainChangePending &&
      wantsDomainChange !== true;
  function validateProfileFields(opts?: { requireTier?: boolean }): string | null {
    const requireTier = opts?.requireTier !== false;
    if (requireTier && !tierId) {
      return standaloneWorkbench ? sui.errNoLicenseTier : "请先在上方选择一个发送量套餐";
    }
    if (requireTier && !bypassTierLock && !standaloneWorkbench) {
      if (!emailSubscriptionPaid || !accountEmailTierId) {
        return `请先在页面上方「${variantCfg.payPageHint}」扫码支付；支付成功后本页档位将与个人中心自动同步`;
      }
      if (!accountTierIsPaidDedicated) {
        return `个人中心当前套餐与${variantCfg.channelLabel}专线不匹配，请先购买对应档位后再提交申请`;
      }
      if (tierId !== accountEmailTierId) {
        return "发送档位须与个人中心当前套餐一致，请刷新页面或前往个人中心换档";
      }
    }
    if (!label.trim()) return standaloneWorkbench ? sui.errServiceName : "请给这条服务起个名字，便于您后续区分多个发送通道";
    const domainErr = standaloneWorkbench
      ? validateDedicatedSenderDomainLocalized(senderDomain, sui)
      : validateDedicatedSenderDomain(senderDomain);
    if (domainErr) return domainErr;
    if (!fromName.trim()) return standaloneWorkbench ? sui.errFromName : "请填写发件人显示名";
    const emailErr = standaloneWorkbench
      ? validateDedicatedFromEmailLocalized(fromEmail, senderDomain, sui)
      : validateDedicatedFromEmail(fromEmail, senderDomain);
    if (emailErr) return emailErr;
    if (replyTo.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo.trim())) {
      return standaloneWorkbench ? sui.errReplyToFormat : "回信地址格式不正确";
    }
    return null;
  }

  function validate(): string | null {
    return validateProfileFields({ requireTier: true });
  }

  async function handleSubmit() {
    setError(null);
    setSoftNotice(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (senderDomain.trim()) {
      try {
        const pre = await fetchDedicatedSenderDomainPrecheck(senderDomain, fromEmail);
        if (!pre.ok && pre.hardErrors.length) {
          setError(pre.hardErrors.join("；"));
          return;
        }
        if (pre.warnings.length && !standaloneWorkbench) {
          setSoftNotice(`提示：${pre.warnings.join("；")}`);
        }
      } catch {
        /* ignore */
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        label: label.trim(),
        subscriptionTierId: tierId || null,
        senderDomain: senderDomain.trim() || null,
        fromName: fromName.trim() || null,
        fromEmail: fromEmail.trim() || null,
        replyTo: replyTo.trim() || null,
        notesFromUser: notes.trim() || null
      };
      await apiJson("/api/email/dedicated-servers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      /**
       * 把整个表单值写到 localStorage 作为只读视图的回显兜底；
       * 即使后端 POST 时丢字段（老版本），GET 回来 currentItem.fromName=null，
       * useEffect 也会用这份快照填回原始值。
       */
      saveFormSnapshot({
        tierId: String(tierId || ""),
        label: label.trim(),
        senderDomain: senderDomain.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyTo: replyTo.trim(),
        notes: notes.trim()
      });
      setError(null);
      setSoftNotice(null);
      setFlashMsg(standaloneWorkbench ? sui.saved : "✓ 申请已成功提交！平台运营已收到通知，开通进度将通过站内私信同步给您。");
      window.setTimeout(() => setFlashMsg(null), standaloneWorkbench ? 2500 : 4000);
      onChanged();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (standaloneWorkbench && /如需更多请升级邮件营销套餐|未检测到 .+ 的 MX 记录/.test(msg)) {
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveProfileUpdate() {
    if (!currentItem) return;
    setError(null);
    const v = validateProfileFields({ requireTier: false });
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      await apiJson(`/api/email/dedicated-servers/${currentItem.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: label.trim(),
          senderDomain: senderDomain.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          replyTo: replyTo.trim() || null,
          notesFromUser: notes.trim() || null
        })
      });
      saveFormSnapshot({
        tierId: String(tierId || ""),
        label: label.trim(),
        senderDomain: senderDomain.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyTo: replyTo.trim(),
        notes: notes.trim()
      });
      setError(null);
      setFlashMsg(
        standaloneWorkbench ? sui.savedProfile : "✓ 发信资料已更新。若更换了域名，请重新执行步骤 2 装机并生成 DNS。"
      );
      window.setTimeout(() => setFlashMsg(null), standaloneWorkbench ? 2500 : 5000);
      onChanged();
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestDomainChange() {
    if (!currentItem) return;
    setError(null);
    const v = validateProfileFields({ requireTier: false });
    if (v) {
      setError(v);
      return;
    }
    setDomainChangeSubmitting(true);
    try {
      await apiJson(`/api/email/dedicated-servers/${currentItem.id}/request-domain-change`, {
        method: "POST",
        body: JSON.stringify({
          senderDomain: senderDomain.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          replyTo: replyTo.trim() || null,
          notesFromUser: notes.trim() || null
        })
      });
      setFlashMsg(
        "✓ 更换域名申请已提交。原 DNS 记录已清空，请等待平台审核；通过后本页将显示新域名的 DNS，验证通过后再发送测试邮件。"
      );
      setWantsDomainChange(false);
      window.setTimeout(() => setFlashMsg(null), 5000);
      onChanged();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setDomainChangeSubmitting(false);
    }
  }

  async function confirmDeleteApplication() {
    if (!currentItem) return;
    setCancelBusy(true);
    try {
      const r = await apiJson<{ ok: boolean; message?: string }>(
        `/api/email/dedicated-servers/${currentItem.id}`,
        { method: "DELETE" }
      );
      clearFormSnapshot();
      setDeleteConfirmOpen(false);
      pageMsg.showOk(r.message ?? "已删除");
      onChanged();
    } catch (e: any) {
      pageMsg.showErr(String(e?.message ?? e));
    } finally {
      setCancelBusy(false);
    }
  }

  const badge = currentItem ? dedicatedStatusBadge(currentItem) : null;

  const canTenantDelete =
    currentItem != null &&
    (standaloneWorkbench
      ? TENANT_DELETABLE_STATUSES.has(currentItem.status)
      : currentItem.status === "requested" ||
        currentItem.status === "provisioning" ||
        currentItem.status === "awaiting_dns");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PageFeedbackLine feedback={pageMsg.feedback} />
      {!standaloneWorkbench ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-800">
            1. 选择您的{variantCfg.channelLabel}专线仙阶
            {!submitted ? (
              emailSubscriptionPaid && accountTierIsPaidDedicated && !bypassTierLock ? (
                <span className="ml-2 font-normal text-slate-500">
                  （已与已购「邮件与营销」套餐同步；换档请返回页面上方「{variantCfg.payPageHint}」扫码支付）
                </span>
              ) : (
                <span className="ml-2 font-normal text-slate-500">
                  （请先完成页面上方「{variantCfg.payPageHint}」扫码支付；支付成功后本页自动同步档位，不可在此另选）
                </span>
              )
            ) : (
              <span className="ml-2 font-normal text-slate-500">
                （工单内发件资料提交后不可改；发送档位与已购套餐保持同步，换档在页面上方「{variantCfg.payPageHint}」完成）
              </span>
            )}
          </div>
          {!submitted && !bypassTierLock && emailSubscriptionPaid && accountEmailTierId && !accountTierIsPaidDedicated ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
              您当前的邮件套餐不是{variantCfg.channelLabel}专线付费档。请先在页面上方「{variantCfg.payPageHint}」完成对应档位支付后再提交专线申请。
            </div>
          ) : null}

          {emailSubscriptionPaid && accountTierIsPaidDedicated && !bypassTierLock ? (
            <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-sm text-violet-950">
              <span className="font-semibold">已购套餐：</span>
              {String(accountEmailTierId ?? "")}
              <p className="mt-1 text-[11px] leading-relaxed text-violet-900/90">
                发件档位与已购套餐一致。若需更换仙阶，请返回页面上方「{variantCfg.payPageHint}」扫码换购。
              </p>
            </div>
          ) : !emailSubscriptionPaid && !bypassTierLock ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-800">
              <p>
                请先在页面上方「<strong className="font-semibold">{variantCfg.payPageHint}</strong>
                」选择仙阶并完成扫码支付，再返回本页填写发件域名。
              </p>
              {checkoutTierId ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                  上方已选预览：
                  <strong className="mx-0.5 font-semibold text-slate-800">
                    {String(checkoutTierId ?? "")}
                  </strong>
                  （支付成功后此处将自动显示为已购档位）
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── 发件人资料表单（提交后只读） ── */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">
          {standaloneWorkbench ? sui.profileStepTitle : "2. 填写您的首个发件域名与发件人资料"}
          {!submitted ? (
            <span className="ml-2 font-normal text-slate-500">
              {standaloneWorkbench ? sui.profileHintNew : "（平台会用这套信息为您单独配置独立 IP / SPF / DKIM / DMARC；开通后可在本页继续「新增发信域名」）"}
            </span>
          ) : standaloneWorkbench ? (
            <span className="ml-2 font-normal text-slate-500">{sui.profileHintEdit}</span>
          ) : profileFieldsReadOnly ? (
            <span className="ml-2 font-normal text-slate-500">（已锁定；续费换档时可申请更换此域，或名额允许时新增其他域）</span>
          ) : wantsDomainChange ? (
            <span className="ml-2 font-normal text-amber-800">（正在填写新域名，提交后由平台审核）</span>
          ) : null}
        </div>

        {submitted && formalServiceInPeriod && !standaloneWorkbench ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-relaxed text-rose-950">
            <p className="font-semibold text-rose-900">当前套餐有效期内无法更换发件域名</p>
            <p className="mt-1">
              如需更换域名，请先在页面上方「{variantCfg.payPageHint}」完成
              <strong className="mx-0.5 font-semibold">续费或换档</strong>
              支付。新套餐付款成功后，本页将询问您是否更换域名，并须重新验证 DNS、发送测试邮件后，新套餐才算正式生效开通。
            </p>
          </div>
        ) : null}

        {canOfferDomainChange && wantsDomainChange === null ? (
          <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] leading-relaxed text-sky-950">
            <p className="font-semibold text-sky-900">本次套餐付款后：是否需要更换发件域名？</p>
            <p className="mt-1">
              若继续使用当前域名，资料将保持锁定；若需更换，请点击「申请更换」后编辑发件资料，提交后平台将重新推送 DNS。
              无论是否更换，均须在下方重新验证 DNS 并发送测试邮件，新套餐方可正式生效。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => setWantsDomainChange(false)}
              >
                保持当前域名
              </button>
              <button
                type="button"
                className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                onClick={() => setWantsDomainChange(true)}
              >
                申请更换域名
              </button>
            </div>
          </div>
        ) : null}

        {domainChangePending && !standaloneWorkbench ? (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
            <strong>更换域名审核中</strong>
            {currentItem?.pendingSenderDomain ? (
              <span className="ml-1">
                新域名：
                <span className="font-mono font-semibold">{currentItem.pendingSenderDomain}</span>
                — 请等待平台同意后在本页添加新的 DNS 记录。
              </span>
            ) : (
              <span className="ml-1">请等待平台审核。</span>
            )}
          </div>
        ) : null}

        {domainChangeRejected ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900">
            上次更换域名申请未通过，您可继续使用当前域名，或重新点击「申请更换域名」。
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldText
            label={standaloneWorkbench ? sui.fieldServiceName : "服务名称 *"}
            sub={standaloneWorkbench ? sui.fieldServiceNameSub : "（仅自己看，便于您区分多个发送通道）"}
            value={label}
            onChange={setLabel}
            placeholder={standaloneWorkbench ? sui.fieldServiceNamePh : "例：主营销服务 / 海外活动 A"}
            readOnly={profileFieldsReadOnly}
          />
          <FieldText
            label={standaloneWorkbench ? sui.fieldSenderDomain : "发件域名 *"}
            value={senderDomain}
            onChange={setSenderDomain}
            placeholder={standaloneWorkbench ? sui.fieldSenderDomainPh : "例：mail.yourcompany.com（须为子域名）"}
            mono
            readOnly={profileFieldsReadOnly}
          />
          <FieldText
            label={standaloneWorkbench ? sui.fieldFromName : "发件人显示名 *"}
            value={fromName}
            onChange={setFromName}
            placeholder={standaloneWorkbench ? sui.fieldFromNamePh : "例：BigSocialBoss 运营组"}
            readOnly={profileFieldsReadOnly}
          />
          <FieldText
            label={standaloneWorkbench ? sui.fieldFromEmail : "发件邮箱 *"}
            value={fromEmail}
            onChange={setFromEmail}
            placeholder={standaloneWorkbench ? sui.fieldFromEmailPh : "例：marketing@mail.yourcompany.com"}
            mono
            type="email"
            readOnly={profileFieldsReadOnly}
          />
          <FieldText
            label={standaloneWorkbench ? sui.fieldReplyTo : "回信地址（可选）"}
            value={replyTo}
            onChange={setReplyTo}
            placeholder={standaloneWorkbench ? sui.fieldReplyToPh : "留空 = 与发件邮箱一致"}
            mono
            type="email"
            readOnly={profileFieldsReadOnly}
          />
          <FieldTextArea
            label={standaloneWorkbench ? sui.fieldNotes : "备注 / 期望机房 / 上线时间（可选）"}
            value={notes}
            onChange={setNotes}
            placeholder={
              standaloneWorkbench ? sui.fieldNotesPh : "例：主要发美国 / 希望机房 US-West / 期望 5 月内上线 / 已有部分客户名单"
            }
            rows={2}
            className="sm:col-span-2"
            readOnly={profileFieldsReadOnly}
          />
          {submitted ? (
            <p className="sm:col-span-2 text-[11px] text-slate-600">
              SMTP 发信密码由平台在后台配置，您无需填写或修改。
            </p>
          ) : null}
        </div>

        {submitted && standaloneWorkbench ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSaveProfileUpdate()}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {submitting ? sui.saving : sui.saveChanges}
            </button>
          </div>
        ) : null}
        {submitted && !standaloneWorkbench && wantsDomainChange === true && !domainChangePending ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={domainChangeSubmitting}
              onClick={() => void handleRequestDomainChange()}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              {domainChangeSubmitting ? "提交中…" : "提交更换域名申请"}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── 错误 / 成功 提示 ── */}
      {softNotice ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {softNotice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}
      {flashMsg ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {flashMsg}
        </div>
      ) : null}

      {/* ── 操作条：未提交=提交按钮；已提交=状态 + 取消按钮 ── */}
      {!submitted ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          <div>
            {standaloneWorkbench ? <>{sui.saveHintNew}</> : (
              <>
                提交后平台运营会收到您的开通工单并安排工程师在
                <strong className="mx-0.5 font-semibold">1–2 个工作日内</strong>
                完成 VPS 部署。DNS 解析记录推送到本页后，您会同步收到一条
                <strong className="mx-0.5 font-semibold">站内私信通知</strong>。
              </>
            )}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="shrink-0 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? sui.saving : standaloneWorkbench ? sui.saveSenderDomain : "提交开通申请"}
          </button>
        </div>
      ) : standaloneWorkbench ? (
        !compactProfileOnly && canTenantDelete && currentItem ? (
          <TenantDeleteDedicatedDomainBlock item={currentItem} onChanged={onChanged} />
        ) : null
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">当前状态：</span>
            {badge ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
              >
                {badge.text}
              </span>
            ) : null}
            <span className="text-[11px] text-violet-900/90">
              ——平台已收到您的申请，请耐心等待开通；下方 DNS 区域会在工程师推送后自动显示需要您粘贴的记录。
            </span>
          </div>
          {canTenantDelete ? (
            deleteConfirmOpen ? (
              <InlineConfirmBar
                className="shrink-0 max-w-md"
                message={`删除发信域「${currentItem?.senderDomain ?? currentItem?.label ?? ""}」？\n\n删除后名额释放，管理端将保留「已删除」记录供统计。`}
                onConfirm={() => void confirmDeleteApplication()}
                onCancel={() => setDeleteConfirmOpen(false)}
                busy={cancelBusy}
                confirmLabel="确认删除"
              />
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                删除发信域
              </button>
            )
          ) : null}
        </div>
      )}

      {standaloneWorkbench && !compactProfileOnly ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-800">
            {sui.step2VpsTitle}
            {!submitted ? (
              <span className="ml-2 font-normal text-amber-800">{sui.step2VpsPending}</span>
            ) : null}
          </div>
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500 shadow-sm">
            代装流程在开源版中不可用：请在您自己的服务器上完成发信机 / 解析机配置，然后在下方继续 DNS 与测试发信。
          </p>
        </div>
      ) : null}

      {!compactProfileOnly ? (
      <>
      {/* ── DNS 记录区 ── */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-800">
          {standaloneWorkbench ? sui.step3DnsTitle : "3. 在您的域名 DNS 后台添加记录"}
          {pendingNewCycleActivation && !standaloneWorkbench && currentItem && currentItem.dnsRecords.length > 0 ? (
            <span className="ml-2 font-normal text-amber-800">
              （新套餐付款后须重新验证全部 DNS，通过后再发送测试邮件）
            </span>
          ) : currentItem && currentItem.dnsRecords.length > 0 ? (
            <span className="ml-2 font-normal text-emerald-700">
              {standaloneWorkbench
                ? sui.step3DnsGenerated(currentItem.dnsRecords.length)
                : `（平台已推送 ${currentItem.dnsRecords.length} 条，请复制到腾讯云 / 阿里云 / Cloudflare 等）`}
            </span>
          ) : submitted ? (
            <span className="ml-2 font-normal text-amber-800">
              {standaloneWorkbench ? sui.step3DnsNeedGenerate : "（工程师正在配置，推送后会在此显示可复制表格）"}
            </span>
          ) : (
            <span className="ml-2 font-normal text-slate-500">
              （提交开通申请并由平台推送后，此处会显示 SPF / DKIM / DMARC 等待粘贴记录）
            </span>
          )}
        </div>
        {submitted &&
        !senderDomain.trim() &&
        !fromEmail.trim() &&
        !fromName.trim() ? (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
            {standaloneWorkbench
              ? `${sui.profileSyncWarning}${currentItem.id}。`
              : (
                <>
                  发件资料暂未从服务器同步到本页。请点浏览器<strong className="mx-0.5">强制刷新</strong>
                  （⌘⇧R）；若管理后台已有您的申请资料仍为空，请联系客服核对工单 #{currentItem.id}。
                </>
              )}
          </div>
        ) : null}
        {!currentItem ? (
          <DnsRecordsAwaitingBlock variant="preview" />
        ) : domainChangePending && !standaloneWorkbench ? (
          <DnsRecordsAwaitingBlock
            variant="submitted"
            senderDomain={(currentItem.pendingSenderDomain ?? senderDomain.trim()) || null}
            headerOverride="等待平台审核并推送新域名的 DNS 记录"
            leadOverride={`您已申请将发件域名更换为 ${currentItem.pendingSenderDomain ?? "（新域名）"}。管理员同意后将在此显示新的 SPF / DKIM / DMARC 记录。`}
          />
        ) : currentItem.dnsRecords.length === 0 ? (
          <DnsRecordsAwaitingBlock
            variant="submitted"
            senderDomain={senderDomain.trim() || null}
            standaloneSelfService={standaloneWorkbench}
          />
        ) : (
          <DnsRecordsBlock
            item={currentItem}
            onChanged={onChanged}
            pendingNewCycle={pendingNewCycleActivation}
          />
        )}
      </div>

      {pendingNewCycleActivation && !standaloneWorkbench ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-violet-950">
          <strong className="font-semibold">新套餐生效流程：</strong>
          付款后请等待平台推送 DNS 记录；<strong className="mx-0.5 font-medium">首次推送成功时起算</strong>
          正式服务周期（1 个月）。推送后可在有效期内随时验证 DNS 与发送测试邮件。
        </div>
      ) : null}

      {standaloneWorkbench && submitted ? (
        <div className="mb-2 text-xs font-semibold text-slate-800">{sui.step4Test}</div>
      ) : null}

      {/* ── 测试发送区：须已购套餐且 DNS 全部验证通过 ── */}
      <TestSendBlock
        item={currentItem}
        emailSubscriptionPaid={emailSubscriptionPaid}
        emailModuleRow={emailModuleForCycle}
        onChanged={onChanged}
        standaloneWorkbench={standaloneWorkbench}
      />
      </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 通用字段组件（双模式：可编辑 / 只读）
 * ───────────────────────────────────────────────────────────── */

function FieldText(props: {
  label: string;
  sub?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  readOnly?: boolean;
}) {
  const { label, sub, value, onChange, placeholder, mono, type, readOnly } = props;
  return (
    <label className="block text-xs">
      <div className="mb-1 text-slate-700">
        {label}
        {sub ? <span className="ml-1 text-[10px] font-normal text-slate-400">{sub}</span> : null}
      </div>
      {readOnly ? (
        <div
          className={`w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 ${
            mono ? "font-mono" : ""
          } ${value ? "text-slate-800" : "text-slate-400"}`}
        >
          {value || "（未填）"}
        </div>
      ) : (
        <input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-md border border-slate-300 px-2 py-2 ${mono ? "font-mono" : ""}`}
        />
      )}
    </label>
  );
}

function FieldTextArea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  readOnly?: boolean;
}) {
  const { label, value, onChange, placeholder, rows, className, readOnly } = props;
  return (
    <label className={`block text-xs ${className ?? ""}`}>
      <div className="mb-1 text-slate-700">{label}</div>
      {readOnly ? (
        <div
          className={`w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-2 ${
            value ? "text-slate-800" : "text-slate-400"
          }`}
        >
          {value || "（未填）"}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 2}
          className="w-full rounded-md border border-slate-300 px-2 py-2"
        />
      )}
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────
 * DNS 记录推送区（实表格模式）
 * ───────────────────────────────────────────────────────────── */

function dnsRecordKindLabel(rec: DnsRecord, panelType: string): string {
  const host = rec.host.toLowerCase();
  if (panelType === "TXT" && host.includes("_domainkey.")) return "DKIM";
  if (panelType === "TXT" && host.startsWith("_dmarc.")) return "DMARC";
  if (panelType === "TXT") return "SPF";
  if (panelType === "A") return "A";
  if (panelType === "MX") return "MX";
  return panelType;
}

function DnsRecordsBlock(props: {
  item: OnboardingItem;
  onChanged: () => void;
  pendingNewCycle?: boolean;
}) {
  const { item, onChanged, pendingNewCycle } = props;
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  const allVerified = item.dnsRecords.length > 0 && item.dnsRecords.every((r) => r.verified);

  async function handleCopyAll() {
    const text = formatAllDnsRecordsForClipboard(item.dnsRecords, item.senderDomain, (rec, panelType) =>
      dnsRecordKindLabel(rec, panelType)
    );
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1800);
    }
  }

  async function handleVerify() {
    setMsg(null);
    setVerifying(true);
    try {
      const r = await apiJson<{ ok: boolean; allVerified?: boolean; message?: string }>(
        `/api/email/dedicated-servers/${item.id}/verify-dns`,
        { method: "POST" }
      );
      if (r.allVerified) {
        setMsg(sui.dnsVerifyAllOk);
      } else {
        setMsg(r.message ?? sui.dnsVerifyPartial);
      }
      await Promise.resolve(onChanged());
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 px-3 py-2">
        <div className="text-[12px] font-semibold text-amber-950">{sui.dnsRecordsTitle}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={item.dnsRecords.length === 0}
            onClick={() => void handleCopyAll()}
            className="rounded-md border border-emerald-500 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          >
            {allCopied ? sui.copiedAll : sui.copyAll}
          </button>
          <button
            type="button"
            disabled={verifying}
            onClick={() => void handleVerify()}
            className="rounded-md bg-amber-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {verifying ? sui.verifying : sui.verifyDns}
          </button>
        </div>
      </div>
      {pendingNewCycle ? (
        <div className="border-b border-amber-300 bg-amber-100/70 px-3 py-2 text-[11px] font-medium text-amber-950">
          {sui.dnsPendingNewCycleBanner}
        </div>
      ) : null}
      <div className="space-y-2 px-3 py-2 text-[11px] leading-relaxed text-amber-950/90">
        <p>{sui.dnsInstructionsLead}</p>
        <p className="rounded border border-amber-300/80 bg-amber-100/50 px-2 py-1.5 text-amber-950">
          {sui.dnsTencentAliyunHint}
        </p>
      </div>

      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[720px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-amber-100/60 text-left text-amber-950">
              <th className="px-2 py-1.5 font-medium">{sui.thHost}</th>
              <th className="px-2 py-1.5 font-medium">{sui.thType}</th>
              <th className="px-2 py-1.5 font-medium">{sui.thMxPriority}</th>
              <th className="px-2 py-1.5 font-medium">{sui.thValue}</th>
              <th className="px-2 py-1.5 font-medium">{sui.thVerify}</th>
            </tr>
          </thead>
          <tbody>
            {item.dnsRecords.map((rec, i) => (
              <DnsRow
                key={`${rec.host}-${rec.type}-${i}`}
                rec={rec}
                senderDomain={item.senderDomain}
              />
            ))}
          </tbody>
        </table>
      </div>

      {msg ? (
        <div className="border-t border-amber-200 bg-amber-100/40 px-3 py-2 text-[11px] text-amber-950">
          {msg}
        </div>
      ) : null}

      {allVerified ? (
        <div className="border-t border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
          {sui.dnsVerifyAllOk}
        </div>
      ) : null}
    </div>
  );
}

function DnsRow({
  rec,
  senderDomain
}: {
  rec: DnsRecord;
  senderDomain?: string | null;
}) {
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const panel = toDedicatedDnsPanelRow(rec, senderDomain);
  const [copiedField, setCopiedField] = useState<"host" | "value" | "mx" | null>(null);

  async function copy(text: string, which: "host" | "value" | "mx") {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopiedField(which);
    setTimeout(() => setCopiedField(null), 1500);
  }

  return (
    <tr className="border-b border-amber-200/60 align-top">
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={() => void copy(panel.hostRecord, "host")}
          className="font-mono text-left text-slate-900 hover:underline"
          title={sui.fqdnHint(panel.fqdnHost, panel.dnsZone)}
        >
          {panel.hostRecord}
        </button>
        <div className="mt-0.5 text-[10px] text-slate-500">{sui.fullLabel(panel.fqdnHost)}</div>
        {copiedField === "host" ? (
          <div className="mt-0.5 text-[10px] font-medium text-emerald-700">{sui.copied}</div>
        ) : null}
      </td>
      <td className="px-2 py-1.5">
        <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-amber-200">
          {panel.type}
        </span>
      </td>
      <td className="px-2 py-1.5 font-mono text-slate-800">
        {panel.type === "MX" && panel.mxPriority != null ? (
          <button
            type="button"
            onClick={() => void copy(String(panel.mxPriority), "mx")}
            className="rounded border border-amber-200 bg-white px-1.5 py-0.5 hover:bg-amber-50"
            title={sui.mxPriorityTitle}
          >
            {panel.mxPriority}
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        )}
        {copiedField === "mx" ? <span className="ml-1 text-emerald-700">✓</span> : null}
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={() => void copy(panel.value, "value")}
          className="max-w-[420px] truncate font-mono text-left text-slate-900 hover:underline"
          title={
            panel.type === "MX"
              ? sui.mxValueTitle
              : panel.type === "A"
                ? sui.aValueTitle
                : panel.value
          }
        >
          {panel.value}
        </button>
        {copiedField === "value" ? (
          <div className="mt-0.5 text-[10px] font-medium text-emerald-700">{sui.copied}</div>
        ) : null}
      </td>
      <td className="px-2 py-1.5">
        {panel.verified ? (
          <span className="text-emerald-700">{sui.verified}</span>
        ) : (
          <span className="text-slate-400">{sui.notVerified}</span>
        )}
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────
 * DNS 占位（等待平台推送），preview / submitted 两种文案
 * ───────────────────────────────────────────────────────────── */

function DnsRecordsAwaitingBlock({
  variant,
  senderDomain,
  headerOverride,
  leadOverride,
  standaloneSelfService = false
}: {
  variant: "preview" | "submitted";
  senderDomain?: string | null;
  headerOverride?: string;
  leadOverride?: string;
  /** 独立站：自助装机生成 DNS，无平台审核 */
  standaloneSelfService?: boolean;
}) {
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const headerText =
    headerOverride ??
    (standaloneSelfService
      ? sui.dnsHeaderStandalone
      : variant === "preview"
        ? "需要您在域名 DNS 后台添加的记录（提交开通后由平台推送）"
        : "需要您在域名 DNS 后台添加的记录（待平台推送）");

  const leadText =
    leadOverride ??
    (standaloneSelfService
      ? sui.dnsLeadStandalone
      : variant === "preview"
        ? "您提交开通申请后，平台工程师将采购 VPS、生成 DKIM 密钥，并把您需要在域名 DNS 上添加的记录（通常 5 条："
        : "平台工程师采购 VPS、生成 DKIM 密钥后，会把您需要在域名 DNS 上添加的记录（通常 5 条：");

  const footnote = standaloneSelfService
    ? senderDomain
      ? sui.dnsFootnoteWithDomain(senderDomain)
      : sui.dnsFootnoteGeneric
    : variant === "preview"
      ? "您当前还未提交开通申请；提交后此区域将进入「等待推送」状态，1–2 个工作日内由平台运营推送。"
      : senderDomain
        ? `发件域名 ${senderDomain}：预计 1–2 个工作日完成 DNS 记录推送；如急用请联系平台客服。`
        : "预计 1–2 个工作日完成；如急用请联系平台客服。";

  return (
    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/40">
      <div className="border-b border-amber-200/70 px-3 py-2 text-[12px] font-semibold text-amber-950">
        {headerText}
      </div>
      <div className="space-y-2 px-3 py-3 text-[11px] text-amber-950/90">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <div>
            {leadOverride ? (
              leadText
            ) : (
              <>
                {leadText}
                <strong className="mx-0.5 font-medium">SPF / DKIM / DMARC / A / MX</strong>
                {standaloneSelfService ? sui.dnsLeadRecordsSuffix : "）推送到这里。"}
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md bg-white/60 ring-1 ring-amber-200/70">
          <table className="w-full min-w-[560px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-amber-100/60 text-left text-amber-950/80">
                <th className="px-2 py-1.5 font-medium">
                  {standaloneSelfService ? sui.thHost : "主机记录 (Host)"}
                </th>
                <th className="px-2 py-1.5 font-medium">{standaloneSelfService ? sui.thType : "类型"}</th>
                <th className="px-2 py-1.5 font-medium">
                  {standaloneSelfService ? sui.thValue : "值 (Value)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-amber-200/50 last:border-0">
                  <td className="px-2 py-1.5">
                    <span className="inline-block h-2.5 w-32 animate-pulse rounded bg-amber-200/70" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block h-2.5 w-10 animate-pulse rounded bg-amber-200/70" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block h-2.5 w-64 animate-pulse rounded bg-amber-200/70" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md bg-white/60 px-2.5 py-2 ring-1 ring-amber-200/70">
          <div className="font-semibold text-amber-900">
            {standaloneSelfService ? sui.dnsAwaitingExperienceTitle : "推送后的体验："}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-950/80">
            <li>{standaloneSelfService ? sui.dnsAwaitingExperience1 : "本区域将自动变成一张可复制的表格（主机记录 / 类型 / 值）"}</li>
            <li>
              {standaloneSelfService
                ? sui.dnsAwaitingExperience2
                : "您只需复制粘贴到自己域名 DNS 服务商（腾讯云 / 阿里云 / Cloudflare 等）的解析后台"}
            </li>
            <li>{standaloneSelfService ? sui.dnsAwaitingExperience3 : "添加完点「验证 DNS」按钮，平台会自动校验"}</li>
            <li>
              {standaloneSelfService ? (
                <strong className="font-medium">{sui.dnsAwaitingExperience4}</strong>
              ) : (
                <>
                  <strong className="font-medium">同步发您一条站内私信</strong>
                  ，避免您错过这个进度
                </>
              )}
            </li>
          </ul>
        </div>

        <div className="text-[10px] text-amber-950/70">{footnote}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 测试发送区
 * ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
 * 测试发送区
 *
 * 设计目标：永远显示，让用户随时可以"自检"开通是否完成。
 *  - 未提交申请 → 按钮禁用 + 引导文案"提交申请后即可测试"
 *  - 已提交但未 ready → 点了按钮会拿到后端 409 错误，前端展示原因 + 提供"复制原因"按钮，让用户能粘贴反馈给平台后台
 *  - 已 ready → 真实发送（或 stub 返回成功）→ 明确显示「已开通」
 *
 * 失败原因复制是个关键 UX 细节：用户拿到详细错误后能直接复制粘贴
 * 到站内私信 / 客服对话框 / 邮件 里，缩短问题反馈链路。
 * ───────────────────────────────────────────────────────────── */

function TestSendBlock({
  item,
  emailSubscriptionPaid,
  emailModuleRow,
  onChanged,
  standaloneWorkbench = false
}: {
  item: OnboardingItem | null;
  emailSubscriptionPaid: boolean;
  emailModuleRow?: {
    simulatedPaidAt?: string | null;
    serviceEffectiveStart?: string | null;
    serviceEffectiveEnd?: string | null;
    periodEnd?: string | null;
  };
  onChanged: () => void;
  standaloneWorkbench?: boolean;
}) {
  const { locale } = useSiteLocale();
  const sui = useMemo(() => getSettingsEmailDedicatedStandaloneStrings(locale), [locale]);
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  /** result.ok=true 表示测试送达；false 时 text 为失败原因（可复制） */
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasonCopied, setReasonCopied] = useState(false);

  /** 开源版无 SaaS 套餐体系：套餐有效期概念恒为"无"；DNS 状态按记录 verified 布尔值判断 */
  const tenantPackageInValidity = false;
  const formalPeriod = dedicatedFormalPeriod(item, emailModuleRow);
  const dnsReady = dedicatedDnsAllVerified(item);

  const disabledReason: string | null = (() => {
    if (!item) return sui.testDisabledNoItem;
    if (!item.dnsRecords?.length) return sui.testDisabledNoDns;
    if (!dnsReady) return sui.testDisabledDns;
    if (!item.smtpProfileId) return sui.testDisabledSmtp;
    return null;
  })();

  async function handleSend() {
    if (!item) {
      setResult({
        ok: false,
        text: "请先提交开通申请，提交后才能发起测试发送。"
      });
      return;
    }
    if (!recipient.trim()) {
      setResult({ ok: false, text: standaloneWorkbench ? sui.errNoRecipient : "请填写测试收件邮箱。" });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.trim())) {
      setResult({ ok: false, text: standaloneWorkbench ? sui.errRecipientFormat : "测试收件邮箱格式不正确。" });
      return;
    }
    setSending(true);
    setResult(null);
    setReasonCopied(false);
    const abort = new AbortController();
    const abortTimer = window.setTimeout(() => abort.abort(), 95_000);
    try {
      const r = await apiJson<{
        ok: boolean;
        messageId?: string;
        note?: string;
        connectivityOnly?: boolean;
        serviceActivatedAt?: string;
        serviceEffectiveEnd?: string;
        formalPeriodStart?: string;
        formalPeriodEnd?: string;
        serviceEffectiveStart?: string;
      }>(
        `/api/email/dedicated-servers/${item.id}/test-send`,
        {
          method: "POST",
          body: JSON.stringify({ recipient: recipient.trim() }),
          signal: abort.signal
        }
      );
      const successLines = standaloneWorkbench
        ? [
            sui.testSuccessLine(recipient.trim(), r.messageId),
            r.note?.trim() || sui.testSuccessNote
          ]
        : [
            `✓ 已送达：测试邮件已成功发送到 ${recipient.trim()}${
              r.messageId ? `（messageId: ${r.messageId}）` : ""
            }`,
            `套餐正式生效时间：${
              r.formalPeriodStart
                ? formatServiceDateTime(r.formalPeriodStart, locale)
                : r.serviceActivatedAt
                  ? formatServiceDateTime(r.serviceActivatedAt, locale)
                  : formatServiceDateTime(new Date().toISOString(), locale)
            }`,
            `套餐正式结束时间：${
              r.formalPeriodEnd ?? r.serviceEffectiveEnd
                ? formatServiceDateTime(r.formalPeriodEnd ?? r.serviceEffectiveEnd ?? null, locale)
                : "—"
            }`,
            ...(r.note?.trim() ? [r.note.trim()] : [])
          ];
      setResult({
        ok: true,
        text: successLines.join("\n")
      });
      setRecipient("");
      if (!standaloneWorkbench) {
        onChanged();
      }
    } catch (e: any) {
      /**
       * 失败时把详细 message 完整放进 result.text，方便用户复制粘贴反馈。
       * apiJson 抛错时一般是 "HTTP 409 / 500：xxx" 的形式，已经够具体。
       */
      const name = (e as Error)?.name;
      const reason =
        name === "AbortError"
          ? standaloneWorkbench
            ? sui.errTimeout
            : "请求超时（约 95 秒）：后端仍未返回。请确认 backend 已启动，或查看后端终端是否有 SMTP 报错。"
          : String(e?.message ?? e);
      setResult({ ok: false, text: reason });
    } finally {
      window.clearTimeout(abortTimer);
      setSending(false);
    }
  }

  async function copyReason() {
    if (!result || result.ok) return;
    try {
      const payload = sui.testFailureClipboard({
        item,
        recipient,
        reason: result.text,
        time: new Date().toLocaleString(intlLocaleTag(locale))
      });
      await navigator.clipboard.writeText(payload);
      setReasonCopied(true);
      setTimeout(() => setReasonCopied(false), 2000);
    } catch {
      /** http 环境下 navigator.clipboard 可能失败；忽略即可 */
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 px-3 py-2">
        <div className="text-[12px] font-semibold text-emerald-950">
          {standaloneWorkbench ? sui.testSendTitle : "发送测试邮件 —— 验证您的专属通道是否已开通"}
        </div>
        {!standaloneWorkbench && tenantPackageInValidity ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">
            套餐生效中
          </span>
        ) : !standaloneWorkbench && emailSubscriptionPaid && item ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-300">
            待推送 DNS
          </span>
        ) : standaloneWorkbench && item ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">
            {sui.testReady}
          </span>
        ) : null}
      </div>

      {!standaloneWorkbench && emailSubscriptionPaid && item && !tenantPackageInValidity ? (
        <div className="border-b border-emerald-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
          您已完成套餐付款。正式服务周期将在平台<strong className="mx-0.5 font-semibold">首次推送 DNS 记录</strong>
          时开始计算（1 个月）；推送后您可在有效期内随时验证 DNS 与发送测试邮件。
        </div>
      ) : null}

      {!standaloneWorkbench && tenantPackageInValidity ? (
        <div className="border-b border-emerald-300 bg-emerald-100/80 px-3 py-2.5 text-[11px] text-emerald-950">
          <div className="font-semibold text-emerald-900">✓ 套餐已正式生效（有效期内）</div>
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
          <div>
            套餐正式生效时间：
            <strong className="ml-1 font-semibold">{formatServiceDateTime(formalPeriod.start, locale)}</strong>
          </div>
          <div>
            套餐正式结束时间：
            <strong className="ml-1 font-semibold">{formatServiceDateTime(formalPeriod.end, locale)}</strong>
          </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-emerald-900/85">
            正式周期自平台首次推送 DNS 起算，与何时验证 DNS、何时发送测试邮件无关。上述时间与「个人中心 · 邮件与营销」同步；有效期内可多次发送测试邮件自检各发信域通道。
          </p>
        </div>
      ) : null}

      <div className="space-y-2 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={disabledReason ? disabledReason : sui.recipientPh}
            disabled={Boolean(disabledReason)}
            className="min-w-[16rem] flex-1 rounded-md border border-emerald-300 px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-emerald-50 disabled:text-emerald-950/50"
          />
          <button
            type="button"
            disabled={sending || Boolean(disabledReason)}
            onClick={() => void handleSend()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            title={disabledReason ?? ""}
          >
            {sending ? sui.sending : sui.sendTest}
          </button>
        </div>

        {/* 结果区 */}
        {result?.ok ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-100 px-3 py-2 text-[11px] text-emerald-950">
            <div className="font-semibold">{sui.testDelivered}</div>
            <div className="mt-0.5 whitespace-pre-line">{result.text}</div>
            <div className="mt-1 text-[10px] text-emerald-950/70">{sui.testInboxHint}</div>
          </div>
        ) : null}

        {result && !result.ok ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{sui.testFailed}</div>
              <button
                type="button"
                onClick={() => void copyReason()}
                className="rounded border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
              >
                {reasonCopied ? sui.copied : sui.copyFailure}
              </button>
            </div>
            <div className="mt-1 whitespace-pre-line break-all rounded bg-white/70 px-2 py-1 font-mono text-[11px] ring-1 ring-rose-200">
              {result.text}
            </div>
            <div className="mt-1.5 text-[10px] text-rose-900/80">{sui.testFailureFeedback}</div>
          </div>
        ) : null}

        <div className="text-[10px] text-emerald-950/70">{sui.testFooter}</div>
      </div>
    </div>
  );
}
