import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getEmailCampaignsPageStrings } from "../../i18n/emailCampaignsPageI18n";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";
import type { EmailChannelKind } from "../../lib/dedicatedEntitlements";
import { CAMPAIGN_STATS_CHANNEL_LABELS } from "../../lib/campaignStatsSenderChannels";
import {
  parseMarketingSenderKey,
  type MarketingSesAddressRow,
  type MarketingSmtpRow
} from "../../lib/emailMarketingSenderPicklist";
import {
  defaultChannelForGroups,
  inferChannelForSenderKey,
  marketingSenderKeyForChannelEmail
} from "../../lib/marketingSenderChannelPick";
import { buildCampaignStatsSenderGroups } from "../../lib/campaignStatsSenderChannels";
import {
  fetchDedicatedLanes,
  filterCampaignStatsGroupsByEmails,
  findLaneByIndex,
  laneFromEmails,
  pickDefaultLaneIndex,
  type DedicatedLaneSnapshot
} from "../../lib/dedicatedLanes";
import {
  computeSendRunProgress,
  formalSendMetricsFromPoll,
  resolveFormalSendAudienceLimit,
  resolveSendSessionPlannedTotal,
  syncSendSessionPlannedFromPoll,
  toSendRunProgressDisplay
} from "../../lib/campaignSendProgressTotal";
import {
  applyFormalSendLivePollView,
  FORMAL_SEND_LIVE_POLL_FAST_MS,
  FORMAL_SEND_LIVE_POLL_MS,
  FORMAL_SEND_LIVE_RECENT_ROWS
} from "../../lib/formalSendLivePoll";
import {
  applyLocallyFinishedCampaignOverrides,
  buildCampaignStatusByIdForWorkbenchMask,
  dedicatedLanesAfterLocalFinish
} from "../../lib/formalSendLocalFinish";
import {
  applyStoredCompletionNoteToUi,
  FORMAL_COMPLETION_NOTES_STORAGE_KEY,
  FORMAL_LOCALLY_FINISHED_STORAGE_KEY,
  FORMAL_POLL_FINISHED_STORAGE_KEY,
  persistFormalCompletionNote,
  persistFormalLocallyFinishedIds,
  persistFormalPollFinishedIds,
  clearFormalCompletionNote,
  readFormalCompletionNoteForCampaign,
  readFormalLocallyFinishedIds,
  readFormalPollFinishedIds,
  type StoredFormalCompletionNote
} from "../../lib/formalSendSessionPersistence";
import {
  handoffFormalSendBackgroundWatch,
  reclaimFormalSendBackgroundWatch,
  stopFormalSendBackgroundWatch
} from "../../lib/formalSendBackgroundWatch";
import { mapSendProgressRecentRows, type LaneLiveRow, type LaneMonitorBreakdown } from "../../lib/laneSendLiveRows";
import {
  formalSendLiveDripChanged,
  mergeFormalSendLivePool,
  tickFormalSendLiveDripDisplay
} from "../../lib/formalSendLiveRowDrip";
import { type FormalSendReportSnapshot } from "../../lib/marketingSendMonitor";
import { getEmailCampaignsChildStrings } from "../../i18n/emailCampaignsChildI18n";
import { buildSessionSummaryFromPoll } from "../../lib/laneSendMonitorCore";
import { formatLaneSendFinishedAt } from "../../lib/laneSendSession";
import type { FormalSendLivePollView } from "../../lib/formalSendLivePoll";
import { CampaignSendLiveProgress } from "../components/email/CampaignSendLiveProgress";
import {
  formatIndustryTagWithCountDetail,
  mergeIndustryTagOptions,
  type IndustryCountRow
} from "../../lib/emailIndustryCounts";
import { loadIndustryTagOptionsFromServer, type IndustryTagOptionsLoadResult } from "../../lib/loadIndustryTagOptions";
import { readIndustryCatalogCache } from "../../lib/industryTagCatalogCache";

import { DedicatedLaneSenderFilters } from "../components/email/DedicatedLaneSenderFilters";
import { DedicatedLanesWorkbench } from "../components/email/DedicatedLanesWorkbench";
import { MarketingSenderChannelPicker } from "../components/email/MarketingSenderChannelPicker";
import {
  formalSendCampaignCardMonitorMode,
  isFormalSendCampaignSelectable,
  RecentFormalSendCampaignCards
} from "../components/email/RecentFormalSendCampaignCards";
import { useAuth, getCachedAuthUserEmail } from "../../auth/AuthContext";
import {
  isEmailValidForApiImport,
  parseImportContactsFromCsvText,
  type ContactEmailStatus,
  type CsvColumnMappingSnapshot,
  type ImportContactPayload
} from "../../lib/csvContactsImport";
import { CrmContactCsvColumnGuide } from "../components/email/CrmContactCsvColumnGuide";
import { subscribeEmailContactsChanged } from "../../lib/emailCrmContactsSync";
import {
  CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY,
  HIDDEN_INDUSTRY_TAGS_STORAGE_KEY,
  emailIndustryTagScopedStorageKey,
  loadScopedIndustryTagLists,
  prependCustomIndustryTag,
  subscribeIndustryTagsChanged,
  writeScopedStringListToStorage
} from "../../lib/emailIndustryTagStorage";
import { removeIndustryTagAndCrmContacts } from "../../lib/emailIndustryTagRemove";
import { ImportIndustryTagCardPicker } from "../components/email/ImportIndustryTagCardPicker";
import { IndustryTagListRemoveIconButton } from "../components/email/IndustryTagListRemoveIconButton";
import {
  CONTACTS_IMPORT_HTTP_BATCH_SIZE,
  isContactsImportPartialError,
  postContactsImportBatches,
  type ContactsImportProgress
} from "../../lib/postContactsImportBatches";
import { campaignPickerCode, campaignSendPickerCodeText } from "../../lib/campaignRoundDisplay";

type TemplateListItem = {
  id: number;
  name: string;
  category: string | null;
  subject_template: string;
};

type SmtpProfile = {
  id: number;
  name: string;
  from_email: string;
  is_default: number;
  display_name?: string | null;
  reply_to?: string | null;
  host?: string | null;
  port?: number | null;
  secure?: number | null;
  dedicated_server_id?: number | null;
};

type CampaignOption = {
  id: number;
  campaign_code: string | null;
  name: string;
  status?: string | null;
  recipient_count?: number | null;
  targetIndustries?: string[];
  latest_round_no?: number | null;
  created_at?: string | null;
  has_sent?: boolean;
  attempts_count?: number;
  sent_count?: number;
  failed_count?: number;
};

type SendProgressResp = {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  /** 后端校准后的实际计划总数，用作实时进度分母 */
  recipientCount?: number;
  runBaselineAttempted?: number;
  runPlannedTotal?: number;
  sendRunId?: number;
  /** SMTP 当场失败（email_sends.status = failed） */
  smtpFailed?: number;
  /** 退信从「成功」口径划入失败的数量（与 bounced 事件对齐） */
  bounceFailures?: number;
  /** IMAP 收件箱解析写入的 bounced 事件条数（provider=imap_bounce） */
  imapBounceEvents?: number;
  lastId: number;
  warmingUp?: boolean;
  prepDetail?: string | null;
  prepStage?: string | null;
  campaignStatus?: string | null;
  runStillSending?: boolean | null;
  runDeliveryComplete?: boolean | null;
  recent: Array<{
    id: number;
    email: string;
    status: string;
    createdAt: string;
    openCount?: number;
    clickCount?: number;
    bounceEventCount?: number;
  }>;
};

/** 正式发送结束后的汇总（展示在实时监控栏，替代浏览器 alert 弹窗） */
type FormalSendCompletionNote = {
  campaignId: number;
  kind: "done" | "pause" | "stop";
  sent: number;
  failed: number;
  attempted: number;
  planned: number;
  paceHint: string;
  campaignCode?: string;
  campaignName?: string;
  industryLabels?: string;
  durationSec?: number;
  finishedAtMs?: number;
  fromEmails?: string;
};

const CAMPAIGN_NAME_LIBRARY_STORAGE_KEY = "bss_email_campaign_name_library_v1";
const CAMPAIGN_NAME_HIDDEN_STORAGE_KEY = "bss_email_campaign_name_hidden_v1";
/** 本次浏览器会话内用户点击「发送」后写入，用于刷新/返回页时恢复轮询；避免仅凭 DB 残留 sending 误判「发送中」 */
const FORMAL_SEND_WATCH_SESSION_KEY = "bss_email_formal_watch_campaign_id_v1";

type InlineActionFeedback =
  | { phase: "idle" }
  | { phase: "confirm" }
  | { phase: "busy" }
  | { phase: "ok"; message: string }
  | { phase: "err"; message: string };

const INLINE_FEEDBACK_IDLE: InlineActionFeedback = { phase: "idle" };

type PageFeedback = { kind: "ok" | "err"; text: string };

function readFormalWatchCampaignIdFromSession(storageKey: string): string {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const id = Number(raw);
    if (raw && Number.isFinite(id) && id > 0) return String(id);
  } catch {
    /* ignore */
  }
  return "";
}

function scopedStorageKey(baseKey: string, userEmail: string | null | undefined) {
  const email = String(userEmail ?? "")
    .trim()
    .toLowerCase();
  return email ? `${baseKey}__single__${email}` : `${baseKey}__single`;
}

function todayLocalYmd() {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

function defaultNextHour() {
  const d = new Date();
  return Math.min(23, d.getHours() + 1);
}

function effectiveEmailStatus(row: ImportContactPayload): ContactEmailStatus {
  if (!row.email?.trim()) return "none";
  const st = row.emailStatus;
  if (st === "valid" || st === "invalid" || st === "risky" || st === "unverified") return st;
  return "unverified";
}

/** 与 EmailContactsPage「移至 CRM」提交结构一致 */
function contactPayloadForImportApi(r: ImportContactPayload, industryTag?: string) {
  const st = effectiveEmailStatus(r);
  const normalizedIndustry = (industryTag ?? "").trim();
  return {
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    country: r.country,
    industry: normalizedIndustry || r.industry,
    phone: r.phone,
    jobTitle: r.jobTitle,
    website: r.website,
    linkedin: r.linkedin,
    instagram: r.instagram,
    facebook: r.facebook,
    emailStatus: st === "none" ? undefined : st
  };
}

async function runContactsImportToIndustry(
  industryTag: string,
  rows: ImportContactPayload[],
  onProgress?: (p: ContactsImportProgress) => void,
  onSkipped?: (p: { skipped: number; total: number }) => void,
  startIndex = 0,
  totalCount?: number
) {
  const mapped = rows.map((r) => contactPayloadForImportApi(r, industryTag));
  return postContactsImportBatches(mapped, {
    onProgress,
    onSkipped,
    startIndex,
    totalCount,
    continueOnSingleFailure: true,
    batchSize: Math.min(CONTACTS_IMPORT_HTTP_BATCH_SIZE, Math.max(1, mapped.length))
  });
}

export function EmailCampaignsSingleLanePage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailCampaignsPageStrings(locale, "single"), [locale]);
  const childUi = useMemo(() => getEmailCampaignsChildStrings(locale), [locale]);

  const { user } = useAuth();
  const userScopedKeys = useMemo(() => {
    const email = String(user?.email ?? "");
    return {
      campaignNameLibrary: scopedStorageKey(CAMPAIGN_NAME_LIBRARY_STORAGE_KEY, email),
      campaignNameHidden: scopedStorageKey(CAMPAIGN_NAME_HIDDEN_STORAGE_KEY, email),
      customIndustryTags: emailIndustryTagScopedStorageKey(CUSTOM_IMPORT_INDUSTRY_TAGS_STORAGE_KEY, email),
      hiddenIndustryTags: emailIndustryTagScopedStorageKey(HIDDEN_INDUSTRY_TAGS_STORAGE_KEY, email),
      formalSendWatchCampaignId: scopedStorageKey(FORMAL_SEND_WATCH_SESSION_KEY, email),
      formalLocallyFinished: scopedStorageKey(FORMAL_LOCALLY_FINISHED_STORAGE_KEY, email),
      formalPollFinished: scopedStorageKey(FORMAL_POLL_FINISHED_STORAGE_KEY, email),
      formalCompletionNotes: scopedStorageKey(FORMAL_COMPLETION_NOTES_STORAGE_KEY, email)
    };
  }, [user?.email]);

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);

  const [templateTagKey, setTemplateTagKey] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | "">("");
  const lastAudienceSyncCampaignIdRef = useRef<string>("");
  const [importIndustryTag, setImportIndustryTag] = useState("");
  /** 用户在本页「创建」的行业标签，合并进导入/发送目标下拉；本地持久化 */
  const [customImportIndustryTags, setCustomImportIndustryTags] = useState<string[]>([]);
  /** 用户从下拉移除的行业（含 CRM 已有行业）；仅隐藏选项，不删 CRM 数据 */
  const [hiddenIndustryTags, setHiddenIndustryTags] = useState<string[]>([]);
  const [smtpAll, setSmtpAll] = useState<SmtpProfile[]>([]);
  const [dedicatedServers, setDedicatedServers] = useState<
    Array<{ id?: number; subscriptionTierId?: string | null }>
  >([]);
  const [sesAddresses, setSesAddresses] = useState<MarketingSesAddressRow[]>([]);
  const [selectedSenderKey, setSelectedSenderKey] = useState("");
  const [senderChannel, setSenderChannel] = useState<EmailChannelKind>("light");
  const [dedicatedLanes, setDedicatedLanes] = useState<DedicatedLaneSnapshot[]>([]);
  const [dedicatedDailyLimit, setDedicatedDailyLimit] = useState(0);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | "">("");

  const [form, setForm] = useState({ name: "" });
  const defaultCampaignNameApplied = useRef(false);
  useEffect(() => {
    if (defaultCampaignNameApplied.current) return;
    defaultCampaignNameApplied.current = true;
    setForm((p) => (p.name ? p : { name: ui.defaultCampaignName }));
  }, [ui.defaultCampaignName]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupBusy, setNewGroupBusy] = useState(false);

  const campaignCsvInputId = useId();
  const [campaignCsvFilename, setCampaignCsvFilename] = useState<string | null>(null);
  const [campaignCsvRows, setCampaignCsvRows] = useState<ImportContactPayload[] | null>(null);
  const [campaignCsvParseStats, setCampaignCsvParseStats] = useState<{
    dataRowCount: number;
    skippedEmpty: number;
    skippedInvalid: number;
    skippedDuplicate: number;
  } | null>(null);
  const [campaignCsvColumnMapping, setCampaignCsvColumnMapping] = useState<CsvColumnMappingSnapshot | null>(
    null
  );
  const [csvImportBusy, setCsvImportBusy] = useState(false);
  const [csvImportProgress, setCsvImportProgress] = useState<string | null>(null);
  const [csvImportSkipped, setCsvImportSkipped] = useState(0);
  const [audienceRefreshTick, setAudienceRefreshTick] = useState(0);

  useEffect(() => {
    return subscribeEmailContactsChanged(() => {
      setAudienceRefreshTick((t) => t + 1);
    });
  }, []);

  const [csvResume, setCsvResume] = useState<{ industry: string; nextIndex: number; total: number } | null>(null);

  /** 仅在为「是」时显示并提交特定日期时间 */
  const [scheduleSpecific, setScheduleSpecific] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(todayLocalYmd);
  const [scheduleHour, setScheduleHour] = useState(defaultNextHour);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  /** 即时=固定 1 轮；循环=共 1–5 轮（首轮完成后自动再发） */
  const [sendMode, setSendMode] = useState<"immediate" | "recurring">("immediate");
  const [sendRoundsTotal, setSendRoundsTotal] = useState(2);

  const [formalSelectedIndustries, setFormalSelectedIndustries] = useState<string[]>([]);
  const [formalIndustryPickerOpen, setFormalIndustryPickerOpen] = useState(false);
  const formalIndustryPickerRef = useRef<HTMLDivElement | null>(null);
  const [formalAudienceCount, setFormalAudienceCount] = useState<number | null>(null);
  const [mergedIndustryTagOptions, setMergedIndustryTagOptions] = useState<string[]>([]);
  const [industryCountResolved, setIndustryCountResolved] = useState<Record<string, IndustryCountRow>>({});
  const [industryCountsReady, setIndustryCountsReady] = useState(false);
  const [industryCatalogLoadError, setIndustryCatalogLoadError] = useState<string | null>(null);

  /** 保存后接口返回的 6 位活动编号 */
  const [savedCampaignCode, setSavedCampaignCode] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [savedCampaignNameLibrary, setSavedCampaignNameLibrary] = useState<string[]>([]);
  const [hiddenCampaignNames, setHiddenCampaignNames] = useState<string[]>([]);
  const [campaignNamePickerOpen, setCampaignNamePickerOpen] = useState(false);
  /** 正式发送 / 测试邮件共用的活动（内部 id） */
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  /** 实时监控独立选择的活动（内部 id）；只用于监控面板，不强制用户重新发送 */
  const [monitorCampaignId, setMonitorCampaignId] = useState("");
  const [deleteCampaignIdUi, setDeleteCampaignIdUi] = useState<InlineActionFeedback>(INLINE_FEEDBACK_IDLE);
  const deleteCampaignIdFeedbackTimerRef = useRef<number | null>(null);
  const [deleteCampaignNameUi, setDeleteCampaignNameUi] = useState<InlineActionFeedback>(INLINE_FEEDBACK_IDLE);
  const [deleteCampaignNameConfirmLabel, setDeleteCampaignNameConfirmLabel] = useState("");
  const deleteCampaignNameFeedbackTimerRef = useRef<number | null>(null);
  const [formalSendActionUi, setFormalSendActionUi] = useState<InlineActionFeedback>(INLINE_FEEDBACK_IDLE);
  const formalSendActionTimerRef = useRef<number | null>(null);
  const [saveCampaignNameFeedback, setSaveCampaignNameFeedback] = useState<string | null>(null);
  const saveCampaignNameFeedbackTimerRef = useRef<number | null>(null);
  const [saveCampaignFeedback, setSaveCampaignFeedback] = useState<PageFeedback | null>(null);
  const saveCampaignFeedbackTimerRef = useRef<number | null>(null);
  const [csvSectionFeedback, setCsvSectionFeedback] = useState<PageFeedback | null>(null);
  const csvSectionFeedbackTimerRef = useRef<number | null>(null);
  const [industryCreateFeedback, setIndustryCreateFeedback] = useState<PageFeedback | null>(null);
  const industryCreateFeedbackTimerRef = useRef<number | null>(null);
  const [industryTagRemoveBusy, setIndustryTagRemoveBusy] = useState<string | null>(null);
  const [formalSendBusy, setFormalSendBusy] = useState(false);
  const formalSendLockRef = useRef(false);
  const formalSendSourceRef = useRef<"manual" | "auto" | "resume" | null>(null);
  const [formalControlBusy, setFormalControlBusy] = useState<null | "stop">(null);
  const formalSendStartedAtRef = useRef<number | null>(null);
  const [formalSendAvgSecPerMail, setFormalSendAvgSecPerMail] = useState<number | null>(null);
  const formalPendingControlActionRef = useRef<null | "stop">(null);
  const formalSuppressAutoBusyUntilRef = useRef(0);
  const [formalSendProgress, setFormalSendProgress] = useState(0);
  const formalSendLivePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [formalSendLiveRows, setFormalSendLiveRows] = useState<LaneLiveRow[]>([]);
  const formalPrevLiveRowsRef = useRef<LaneLiveRow[]>([]);
  const formalPrevBreakdownRef = useRef<Partial<LaneMonitorBreakdown>>({});
  const [formalSendRunAttempted, setFormalSendRunAttempted] = useState(0);
  const [formalSendRunSent, setFormalSendRunSent] = useState(0);
  const [formalSendRunFailed, setFormalSendRunFailed] = useState(0);
  const [formalSendRemainCount, setFormalSendRemainCount] = useState(0);
  const [formalSendRemainSec, setFormalSendRemainSec] = useState(0);
  /** 正式群发：每封之间的最小间隔（毫秒），0=尽快 */
  const [formalSendMinIntervalMs, setFormalSendMinIntervalMs] = useState(3000);
  const formalLastCompletionSigRef = useRef("");
  const formalFinishHandledRef = useRef<Set<number>>(new Set());
  const formalPollFinishedIdsRef = useRef<Set<number>>(new Set());
  const [formalLocallyFinishedIds, setFormalLocallyFinishedIds] = useState<number[]>(() =>
    typeof window !== "undefined"
      ? readFormalLocallyFinishedIds(
          scopedStorageKey(FORMAL_LOCALLY_FINISHED_STORAGE_KEY, String(user?.email ?? ""))
        )
      : []
  );
  const formalLocallyFinishedIdsRef = useRef<number[]>(formalLocallyFinishedIds);
  const formalSendCompletionNoteRef = useRef<FormalSendCompletionNote | null>(null);
  const [formalSendCompletionNote, setFormalSendCompletionNote] = useState<FormalSendCompletionNote | null>(null);
  const formalSendMinIntervalMsRef = useRef(0);
  const formalPlannedRecipientRef = useRef(0);
  const formalSendPlannedLockedRef = useRef(false);
  const formalBaselineAttemptedRef = useRef(0);
  const formalBaselineSentRef = useRef(0);
  const formalBaselineFailedRef = useRef(0);
  const formalSessionSendRunIdRef = useRef(0);
  const lastCrmIndustryRowsRef = useRef<IndustryCountRow[]>([]);
  const formalSelectedIndustriesRef = useRef(formalSelectedIndustries);
  const formalAudienceCountRef = useRef(formalAudienceCount);
  formalSelectedIndustriesRef.current = formalSelectedIndustries;
  formalAudienceCountRef.current = formalAudienceCount;
  const runFormalSendWatchRef = useRef<(id: number, baseLastId: number) => void>(() => {});
  /** 与当前轮询共用的一次 pull，供 POST /send 返回后立即刷新 UI */
  const formalPullLiveOnceRef = useRef<(() => Promise<void>) | null>(null);
  const formalLivePoolRef = useRef<LaneLiveRow[]>([]);
  const formalProgressSinceIdRef = useRef(0);
  const formalDripTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [formalSendPrepHint, setFormalSendPrepHint] = useState<string | null>(null);
  const formalPollIntervalMsRef = useRef(FORMAL_SEND_LIVE_POLL_MS);
  const [formalPollIntervalMs, setFormalPollIntervalMs] = useState(FORMAL_SEND_LIVE_POLL_MS);
  const formalSendPageMountedRef = useRef(true);
  const formalSendWatchStorageKeyRef = useRef("");

  useEffect(() => {
    formalSendMinIntervalMsRef.current = formalSendMinIntervalMs;
  }, [formalSendMinIntervalMs]);

  useEffect(() => {
    formalLocallyFinishedIdsRef.current = formalLocallyFinishedIds;
  }, [formalLocallyFinishedIds]);

  useEffect(() => {
    formalSendWatchStorageKeyRef.current = userScopedKeys.formalSendWatchCampaignId;
  }, [userScopedKeys.formalSendWatchCampaignId]);

  useEffect(() => {
    formalSendPageMountedRef.current = true;
    return () => {
      formalSendPageMountedRef.current = false;
      const watchRaw = readFormalWatchCampaignIdFromSession(formalSendWatchStorageKeyRef.current);
      const watchId = Math.floor(Number(watchRaw) || 0);
      if (watchId > 0) {
        handoffFormalSendBackgroundWatch(watchId, {
          sendRunId: formalSessionSendRunIdRef.current,
          sinceId: formalProgressSinceIdRef.current
        });
      } else {
        stopFormalSendBackgroundWatch();
      }
      if (formalSendLivePollRef.current) {
        clearInterval(formalSendLivePollRef.current);
        formalSendLivePollRef.current = null;
      }
      stopFormalLiveDrip();
      if (deleteCampaignIdFeedbackTimerRef.current) window.clearTimeout(deleteCampaignIdFeedbackTimerRef.current);
      if (deleteCampaignNameFeedbackTimerRef.current) window.clearTimeout(deleteCampaignNameFeedbackTimerRef.current);
      if (formalSendActionTimerRef.current) window.clearTimeout(formalSendActionTimerRef.current);
      if (saveCampaignNameFeedbackTimerRef.current) window.clearTimeout(saveCampaignNameFeedbackTimerRef.current);
      if (saveCampaignFeedbackTimerRef.current) window.clearTimeout(saveCampaignFeedbackTimerRef.current);
      if (csvSectionFeedbackTimerRef.current) window.clearTimeout(csvSectionFeedbackTimerRef.current);
      if (industryCreateFeedbackTimerRef.current) window.clearTimeout(industryCreateFeedbackTimerRef.current);
    };
  }, []);

  function showPageFeedback(
    setter: React.Dispatch<React.SetStateAction<PageFeedback | null>>,
    timerRef: React.MutableRefObject<number | null>,
    kind: "ok" | "err",
    text: string,
    autoClearMs?: number
  ) {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setter({ kind, text });
    const ms = autoClearMs ?? (kind === "ok" ? 4500 : 6500);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setter(null);
    }, ms);
  }

  function scheduleInlineFeedbackClear(timerRef: React.MutableRefObject<number | null>, clear: () => void, ms: number) {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      clear();
    }, ms);
  }

  const templateTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of templates) {
      const c = t.category?.trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (!templateTagKey) return templates;
    if (templateTagKey === "__none__") return templates.filter((t) => !t.category?.trim());
    return templates.filter((t) => (t.category?.trim() ?? "") === templateTagKey);
  }, [templates, templateTagKey]);
  const createdCampaignNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of campaigns) {
      const n = String(c.name ?? "").trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }, [campaigns]);
  const industryTagSelectOptions = mergedIndustryTagOptions;

  const campaignNameOptions = useMemo(() => {
    const hidden = new Set(hiddenCampaignNames.map((x) => x.trim()).filter(Boolean));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...savedCampaignNameLibrary, ...createdCampaignNames]) {
      const t = String(n ?? "").trim();
      if (!t || seen.has(t) || hidden.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [savedCampaignNameLibrary, createdCampaignNames, hiddenCampaignNames]);

  async function refreshTemplates() {
    const res = await apiJson<{ ok: boolean; items: TemplateListItem[] }>("/api/email/templates");
    setTemplates(res.items);
  }

  function mapCampaignOptionFromApi(x: CampaignOption): CampaignOption {
    return {
      id: x.id,
      campaign_code: x.campaign_code ?? null,
      latest_round_no: x.latest_round_no ?? 0,
      name: x.name,
      status: x.status ?? null,
      recipient_count: x.recipient_count == null ? null : Number(x.recipient_count),
      targetIndustries: Array.isArray(x.targetIndustries)
        ? x.targetIndustries.map((t) => String(t ?? "").trim()).filter(Boolean)
        : [],
      created_at: x.created_at ?? null,
      has_sent: x.has_sent === true,
      attempts_count: Math.max(0, Number(x.attempts_count ?? 0)),
      sent_count: Math.max(0, Number(x.sent_count ?? 0)),
      failed_count: Math.max(0, Number(x.failed_count ?? 0))
    };
  }

  function normalizeCampaignListFromApi(items: CampaignOption[]): CampaignOption[] {
    const mapped = (items ?? []).map((x) => mapCampaignOptionFromApi(x));
    const finished = new Set(formalLocallyFinishedIdsRef.current);
    return applyLocallyFinishedCampaignOverrides(mapped, finished);
  }

  async function refreshCampaigns() {
    const res = await apiJson<{ ok: boolean; items: CampaignOption[] }>("/api/email/campaigns");
    setCampaigns(normalizeCampaignListFromApi(res.items ?? []));
  }

  const campaignsRef = useRef(campaigns);
  campaignsRef.current = campaigns;

  function applyDedicatedLanesFromApi(rawLanes: DedicatedLaneSnapshot[]) {
    const statusMap = buildCampaignStatusByIdForWorkbenchMask(
      campaignsRef.current,
      formalLocallyFinishedIdsRef.current
    );
    setDedicatedLanes(
      dedicatedLanesAfterLocalFinish(rawLanes, {
        clearedCampaignIds: formalLocallyFinishedIdsRef.current,
        campaignStatusById: statusMap
      })
    );
  }

  async function refreshDedicatedLanes() {
    const lanesRes = await fetchDedicatedLanes().catch(() => ({
      ok: false as const,
      lanes: [] as DedicatedLaneSnapshot[]
    }));
    applyDedicatedLanesFromApi(Array.isArray(lanesRes.lanes) ? lanesRes.lanes : []);
    setDedicatedDailyLimit(
      Math.max(0, Number("dailyLimit" in lanesRes ? (lanesRes.dailyLimit ?? 0) : 0))
    );
  }

  async function refreshMailerProfiles() {
    const [smtp, ded, ses, lanesRes] = await Promise.all([
      apiJson<{ ok: boolean; items: SmtpProfile[] }>("/api/email/smtp"),
      apiJson<{ ok: boolean; items: Array<{ id?: number; subscriptionTierId?: string | null }> }>(
        "/api/email/dedicated-servers"
      ).catch(() => ({ ok: true as const, items: [] })),
      apiJson<{ ok: boolean; items: MarketingSesAddressRow[] }>("/api/email/ses/sender-addresses").catch(() => ({
        ok: true as const,
        items: [] as MarketingSesAddressRow[]
      })),
      fetchDedicatedLanes().catch(() => ({ ok: false as const, lanes: [] as DedicatedLaneSnapshot[] }))
    ]);
    setSmtpAll(Array.isArray(smtp.items) ? smtp.items : []);
    setDedicatedServers(Array.isArray(ded.items) ? ded.items : []);
    setSesAddresses(Array.isArray(ses.items) ? ses.items : []);
    applyDedicatedLanesFromApi(Array.isArray(lanesRes.lanes) ? lanesRes.lanes : []);
    setDedicatedDailyLimit(
      Math.max(0, Number("dailyLimit" in lanesRes ? (lanesRes.dailyLimit ?? 0) : 0))
    );
  }

  useEffect(() => {
    if (selectedLaneIndex !== "" || dedicatedLanes.length === 0) return;
    const def = pickDefaultLaneIndex(dedicatedLanes);
    if (def !== "") setSelectedLaneIndex(def);
  }, [dedicatedLanes, selectedLaneIndex]);

  const displayDedicatedLanes = useMemo(
    () =>
      dedicatedLanesAfterLocalFinish(dedicatedLanes, {
        clearedCampaignIds: formalLocallyFinishedIds,
        campaignStatusById: buildCampaignStatusByIdForWorkbenchMask(campaigns, formalLocallyFinishedIds)
      }),
    [dedicatedLanes, formalLocallyFinishedIds, campaigns]
  );

  const selectedLane = useMemo(
    () => findLaneByIndex(displayDedicatedLanes, selectedLaneIndex),
    [displayDedicatedLanes, selectedLaneIndex]
  );
  const laneAllowedEmails = useMemo(() => laneFromEmails(selectedLane), [selectedLane]);

  const senderGroups = useMemo(() => {
    const base = buildCampaignStatsSenderGroups(smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses);
    if (selectedLaneIndex !== "" && laneAllowedEmails.length > 0) {
      return filterCampaignStatsGroupsByEmails(base, laneAllowedEmails);
    }
    return base;
  }, [smtpAll, dedicatedServers, sesAddresses, selectedLaneIndex, laneAllowedEmails]);

  useEffect(() => {
    if (!selectedSenderKey) {
      const ch = defaultChannelForGroups(senderGroups);
      setSenderChannel(ch);
      const fe = senderGroups[ch][0] ?? "";
      const key = marketingSenderKeyForChannelEmail(ch, fe, smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses);
      if (key) setSelectedSenderKey(key);
      return;
    }
    setSenderChannel(inferChannelForSenderKey(selectedSenderKey, smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses));
  }, [senderGroups, smtpAll, dedicatedServers, sesAddresses, selectedSenderKey]);

  /** 发件通道预览：轻量 / 中量 / 巨量专线 SMTP */
  const campaignMailboxSenderPreview = useMemo(() => {
    const parsed = parseMarketingSenderKey(selectedSenderKey);
    if (!parsed) return null;
    if ("smtpId" in parsed) {
      const row = smtpAll.find((s) => s.id === parsed.smtpId);
      if (!row) return null;
      const dn = (row.display_name ?? "").trim() || (row.name ?? "").trim() || null;
      const reply = (row.reply_to ?? "").toString().trim();
      return {
        channelLabel: CAMPAIGN_STATS_CHANNEL_LABELS[senderChannel],
        fromEmail: row.from_email,
        displayName: dn,
        replyTo: reply || null
      };
    }
    const row = sesAddresses.find((s) => s.id === parsed.sesId);
    if (!row) return null;
    const dn = (row.displayName ?? "").trim() || null;
    const reply = (row.replyTo ?? "").toString().trim();
    return {
      channelLabel: CAMPAIGN_STATS_CHANNEL_LABELS[senderChannel],
      fromEmail: row.fromEmail,
      displayName: dn,
      replyTo: reply || null
    };
  }, [selectedSenderKey, smtpAll, sesAddresses, senderChannel]);

  useEffect(() => {
    refreshTemplates().catch((e) => console.error(e));
    refreshCampaigns().catch((e) => console.error(e));
    refreshMailerProfiles().catch((e) => console.error(e));
  }, []);

  /** 从其它页面返回：恢复监控活动、本页已收尾登记与绿色汇报（勿对已完成活动 resume 轮询） */
  useEffect(() => {
    const finishedIds = readFormalLocallyFinishedIds(userScopedKeys.formalLocallyFinished);
    const pollFinished = readFormalPollFinishedIds(userScopedKeys.formalPollFinished);
    if (finishedIds.length > 0) {
      formalLocallyFinishedIdsRef.current = finishedIds;
      setFormalLocallyFinishedIds(finishedIds);
      formalFinishHandledRef.current = new Set(pollFinished);
      formalPollFinishedIdsRef.current = new Set(pollFinished);
      void refreshCampaigns().catch(() => undefined);
      void refreshDedicatedLanes().catch(() => undefined);
    }
    const restored = readFormalWatchCampaignIdFromSession(userScopedKeys.formalSendWatchCampaignId);
    if (restored) {
      setMonitorCampaignId((prev) => prev || restored);
      setSelectedCampaignId((prev) => prev || restored);
      const watchId = Number(restored);
      const storedNote = readFormalCompletionNoteForCampaign(
        userScopedKeys.formalCompletionNotes,
        watchId
      );
      if (storedNote) {
        formalSendCompletionNoteRef.current = storedNote as FormalSendCompletionNote;
        applyStoredCompletionNoteToUi(storedNote, {
          setCompletionNote: setFormalSendCompletionNote as (n: StoredFormalCompletionNote) => void,
          setAttempted: setFormalSendRunAttempted,
          setSent: setFormalSendRunSent,
          setFailed: setFormalSendRunFailed,
          setRemain: setFormalSendRemainCount,
          setProgress: setFormalSendProgress,
          setRemainSec: setFormalSendRemainSec
        });
        formalLastCompletionSigRef.current = `done:${watchId}:${storedNote.sent}:${storedNote.failed}:${storedNote.attempted}:${storedNote.planned}:0`;
      }
    }
  }, [
    userScopedKeys.formalSendWatchCampaignId,
    userScopedKeys.formalLocallyFinished,
    userScopedKeys.formalPollFinished,
    userScopedKeys.formalCompletionNotes
  ]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") return;
      refreshCampaigns().catch(() => undefined);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /** 切换活动 ID 时，用服务端保存的行业回填预览（避免与列表刷新打架：仅在所选活动 id 变化时覆盖本地） */
  useEffect(() => {
    const id = selectedCampaignId;
    if (!id) {
      lastAudienceSyncCampaignIdRef.current = "";
      return;
    }
    if (lastAudienceSyncCampaignIdRef.current === id) return;
    const camp = campaigns.find((c) => String(c.id) === id);
    if (!camp) return;
    lastAudienceSyncCampaignIdRef.current = id;
    setFormalSelectedIndustries((camp.targetIndustries ?? []).map((t) => String(t ?? "").trim()).filter(Boolean));
  }, [selectedCampaignId, campaigns]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(userScopedKeys.campaignNameLibrary);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedCampaignNameLibrary(parsed.map((x) => String(x ?? "").trim()).filter(Boolean));
    } catch {
      // ignore
    }
  }, [userScopedKeys.campaignNameLibrary]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(userScopedKeys.campaignNameHidden);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setHiddenCampaignNames(parsed.map((x) => String(x ?? "").trim()).filter(Boolean));
    } catch {
      // ignore
    }
  }, [userScopedKeys.campaignNameHidden]);

  const syncIndustryTagsFromStorage = useCallback(() => {
    const { custom, hidden } = loadScopedIndustryTagLists(user?.email);
    setCustomImportIndustryTags(custom);
    setHiddenIndustryTags(hidden);
    setAudienceRefreshTick((t) => t + 1);
  }, [user?.email]);

  useEffect(() => {
    syncIndustryTagsFromStorage();
  }, [syncIndustryTagsFromStorage]);

  useEffect(() => subscribeIndustryTagsChanged(syncIndustryTagsFromStorage), [syncIndustryTagsFromStorage]);

  useEffect(() => {
    if (!formalIndustryPickerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = formalIndustryPickerRef.current;
      if (el && !el.contains(e.target as Node)) setFormalIndustryPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [formalIndustryPickerOpen]);

  /** 旁栏人数 = 所选行业可发去重并集（与下拉括号内口径一致），不按活动已发过滤 */
  useEffect(() => {
    if (formalSelectedIndustries.length === 0) {
      setFormalAudienceCount(null);
      return;
    }
    let cancelled = false;
    setFormalAudienceCount(null);
    apiJson<{ ok: boolean; count: number }>("/api/email/campaigns/preview-count", {
      method: "POST",
      body: JSON.stringify({
        groupIds: [],
        industries: formalSelectedIndustries
      })
    })
      .then((r) => {
        if (!cancelled) setFormalAudienceCount(Math.max(0, Number(r.count ?? 0)));
      })
      .catch(() => {
        if (!cancelled) setFormalAudienceCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formalSelectedIndustries, audienceRefreshTick]);

  const buildCustomIndustryTags = useCallback(() => {
    return Array.from(
      new Set(
        [...customImportIndustryTags.map((x) => String(x ?? "").trim()).filter(Boolean), importIndustryTag.trim()].filter(
          Boolean
        )
      )
    );
  }, [customImportIndustryTags, importIndustryTag]);

  /** 自定义标签变更后立刻更新下拉，不等待 industry-counts 接口 */
  useEffect(() => {
    const customTags = buildCustomIndustryTags();
    setMergedIndustryTagOptions(
      mergeIndustryTagOptions(customTags, lastCrmIndustryRowsRef.current, hiddenIndustryTags)
    );
  }, [buildCustomIndustryTags, hiddenIndustryTags]);

  useEffect(() => {
    let cancelled = false;
    const customTags = buildCustomIndustryTags();
    const userScope = user?.email ?? getCachedAuthUserEmail() ?? "";
    const hadCache = Boolean(readIndustryCatalogCache(userScope)?.length);
    if (!hadCache) setIndustryCountsReady(false);
    setIndustryCatalogLoadError(null);

    const applyResult = (result: IndustryTagOptionsLoadResult) => {
      if (cancelled) return;
      lastCrmIndustryRowsRef.current = result.crmRows;
      setMergedIndustryTagOptions(result.options);
      setIndustryCountResolved(result.resolvedMap);
      setIndustryCountsReady(result.ready);
      setIndustryCatalogLoadError(result.error);
    };

    void loadIndustryTagOptionsFromServer(customTags, hiddenIndustryTags, {
      userScope,
      onPartial: applyResult
    }).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [audienceRefreshTick, buildCustomIndustryTags, hiddenIndustryTags, user?.email]);

  function formatIndustryTagLabel(tag: string): string {
    const resolved = industryCountResolved[tag] ?? {
      industry: tag,
      count: 0,
      matchKind: "none" as const,
      matchedIndustry: null,
      similarInDb: []
    };
    return formatIndustryTagWithCountDetail(tag, resolved, industryCountsReady);
  }

  function onCampaignCsvFileSelected(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv")) {
      showPageFeedback(
        setCsvSectionFeedback,
        csvSectionFeedbackTimerRef,
        "err",
        ui.errCsvOnly
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const {
          contacts,
          error,
          dataRowCount,
          skippedEmptyEmail,
          skippedInvalidEmail,
          skippedDuplicateEmail,
          columnMapping
        } = parseImportContactsFromCsvText(text);
        setCampaignCsvColumnMapping(columnMapping);
        if (error) {
          showPageFeedback(setCsvSectionFeedback, csvSectionFeedbackTimerRef, "err", error);
          setCampaignCsvRows(null);
          setCampaignCsvFilename(null);
          setCampaignCsvParseStats(null);
          return;
        }
        const parseStats = {
          dataRowCount,
          skippedEmpty: skippedEmptyEmail,
          skippedInvalid: skippedInvalidEmail,
          skippedDuplicate: skippedDuplicateEmail
        };
        setCampaignCsvRows(contacts);
        setCampaignCsvParseStats(parseStats);
        setCampaignCsvFilename(file.name);
        setCsvResume(null);
        setCsvImportSkipped(0);
        const outcomeLine = ui.describeCsvParseOutcome({
          dataRowCount,
          validCount: contacts.length,
          skippedEmptyEmail,
          skippedInvalidEmail,
          skippedDuplicateEmail
        });
        if (contacts.length > 1500) {
          showPageFeedback(
            setCsvSectionFeedback,
            csvSectionFeedbackTimerRef,
            "err",
            ui.csvTooLarge(outcomeLine),
            9000
          );
        } else {
          const ignoreNote =
            columnMapping.ignored.length > 0
              ? ui.csvIgnoreNote(columnMapping.ignored.length)
              : "";
          showPageFeedback(
            setCsvSectionFeedback,
            csvSectionFeedbackTimerRef,
            "ok",
            ui.csvParsedConfirm(outcomeLine, ignoreNote)
          );
        }
      } catch (e: unknown) {
        showPageFeedback(setCsvSectionFeedback, csvSectionFeedbackTimerRef, "err", String((e as Error)?.message ?? e));
        setCampaignCsvRows(null);
        setCampaignCsvFilename(null);
        setCampaignCsvColumnMapping(null);
        setCampaignCsvParseStats(null);
      }
    };
    reader.readAsText(file);
  }

  const removeLocalIndustryTagOnly = useCallback(
    async (tag: string) => {
      const t = tag.trim();
      if (!t || industryTagRemoveBusy) return;
      setIndustryTagRemoveBusy(t);
      try {
        const { deleted } = await removeIndustryTagAndCrmContacts(user?.email, t);
        setImportIndustryTag((cur) => (cur === t ? "" : cur));
        setFormalSelectedIndustries((prev) => prev.filter((x) => x !== t));
        setIndustryCountResolved((prev) => {
          const next = { ...prev };
          delete next[t];
          return next;
        });
        setAudienceRefreshTick((n) => n + 1);
        showPageFeedback(
          setIndustryCreateFeedback,
          industryCreateFeedbackTimerRef,
          "ok",
          deleted > 0
            ? ui.industryTagRemoved(t, deleted) : ui.industryTagRemoved(t)
        );
      } catch (e: unknown) {
        showPageFeedback(
          setIndustryCreateFeedback,
          industryCreateFeedbackTimerRef,
          "err",
          String((e as Error)?.message ?? e)
        );
      } finally {
        setIndustryTagRemoveBusy(null);
      }
    },
    [industryTagRemoveBusy, user?.email]
  );

  const removeFormalIndustryTag = useCallback(
    (tag: string) => {
      void removeLocalIndustryTagOnly(tag);
    },
    [removeLocalIndustryTagOnly]
  );

  function buildScheduleDateTime(): Date | null {
    if (!scheduleDate) return null;
    const d = new Date(
      `${scheduleDate}T${String(scheduleHour).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}:00`
    );
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function buildScheduleIso(): string | null {
    const d = buildScheduleDateTime();
    return d ? d.toISOString() : null;
  }

  function toggleFormalIndustry(industry: string) {
    const key = industry.trim();
    if (!key) return;
    setFormalSelectedIndustries((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  const formalIndustryButtonLabel = useMemo(() => {
    if (formalSelectedIndustries.length === 0) return ui.formalIndustryPlaceholder;
    const names = formalSelectedIndustries.slice(0, 3);
    const more = formalSelectedIndustries.length > 3 ? ui.formalIndustryMore(formalSelectedIndustries.length) : "";
    return ui.formalIndustrySelected(formalSelectedIndustries.length, names.join("、"), more);
  }, [formalSelectedIndustries]);

  const formalSendEtaText = useMemo(() => {
    const cnt = formalAudienceCount ?? 0;
    if (cnt <= 0) return ui.etaSelectIndustries;
    // 粗略估算：单封 SMTP 往返约 2.5s + 可配置节奏间隔
    const smtpAvgSec = 2.5;
    const intervalSec = Math.max(0, formalSendMinIntervalMs) / 1000;
    const sec = Math.round(cnt * smtpAvgSec + Math.max(0, cnt - 1) * intervalSec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return ui.etaHours(h, m, s, cnt);
    if (m > 0) return ui.etaMinutes(m, s, cnt);
    return ui.etaSeconds(s, cnt);
  }, [formalAudienceCount, formalSendMinIntervalMs]);

  function stopFormalLiveDrip() {
    if (formalDripTimerRef.current != null) {
      clearInterval(formalDripTimerRef.current);
      formalDripTimerRef.current = null;
    }
  }

  function tickFormalLiveDrip() {
    const pool = formalLivePoolRef.current;
    const displayed = formalPrevLiveRowsRef.current;
    const next = tickFormalSendLiveDripDisplay(displayed, pool, FORMAL_SEND_LIVE_RECENT_ROWS);
    if (!formalSendLiveDripChanged(displayed, next)) return;
    formalPrevLiveRowsRef.current = next;
    setFormalSendLiveRows(next);
  }

  function startFormalLiveDrip() {
    if (formalDripTimerRef.current != null) return;
    const ms = formalPollIntervalMsRef.current;
    formalDripTimerRef.current = setInterval(() => tickFormalLiveDrip(), ms);
    tickFormalLiveDrip();
  }

  function restartFormalLivePollInterval(ms: number) {
    if (ms === formalPollIntervalMsRef.current && formalSendLivePollRef.current != null) return;
    formalPollIntervalMsRef.current = ms;
    setFormalPollIntervalMs(ms);
    if (formalDripTimerRef.current != null) {
      clearInterval(formalDripTimerRef.current);
      formalDripTimerRef.current = null;
      startFormalLiveDrip();
    }
    if (formalSendLivePollRef.current != null) {
      clearInterval(formalSendLivePollRef.current);
      formalSendLivePollRef.current = setInterval(() => {
        void formalPullLiveOnceRef.current?.();
      }, ms);
    }
  }

  async function fetchSendProgress(
    campaignId: number,
    sinceId = 0,
    fresh = false,
    sendRunId = 0
  ) {
    const params = new URLSearchParams();
    if (sinceId > 0) params.set("sinceId", String(sinceId));
    if (fresh) params.set("fresh", "1");
    if (sendRunId > 0) params.set("sendRunId", String(sendRunId));
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiJson<SendProgressResp>(`/api/email/campaigns/${campaignId}/send-progress${q}`);
  }

  function markFormalSendLocallyFinished(id: number) {
    formalFinishHandledRef.current.add(id);
    formalPollFinishedIdsRef.current.add(id);
    persistFormalPollFinishedIds(userScopedKeys.formalPollFinished, formalPollFinishedIdsRef.current);
    const nextFinished = formalLocallyFinishedIdsRef.current.includes(id)
      ? formalLocallyFinishedIdsRef.current
      : [...formalLocallyFinishedIdsRef.current, id];
    formalLocallyFinishedIdsRef.current = nextFinished;
    setFormalLocallyFinishedIds(nextFinished);
    persistFormalLocallyFinishedIds(userScopedKeys.formalLocallyFinished, nextFinished);
    const finishedSet = new Set(nextFinished);
    setCampaigns((prev) => {
      const nextCampaigns = applyLocallyFinishedCampaignOverrides(prev, finishedSet);
      setDedicatedLanes((lanes) =>
        dedicatedLanesAfterLocalFinish(lanes, {
          clearedCampaignIds: nextFinished,
          campaignStatusById: buildCampaignStatusByIdForWorkbenchMask(nextCampaigns, nextFinished)
        })
      );
      return nextCampaigns;
    });
  }

  function clearFormalSendLocalFinish(id: number) {
    formalFinishHandledRef.current.delete(id);
    formalPollFinishedIdsRef.current.delete(id);
    persistFormalPollFinishedIds(userScopedKeys.formalPollFinished, formalPollFinishedIdsRef.current);
    const nextFinished = formalLocallyFinishedIdsRef.current.filter((x) => x !== id);
    formalLocallyFinishedIdsRef.current = nextFinished;
    setFormalLocallyFinishedIds(nextFinished);
    persistFormalLocallyFinishedIds(userScopedKeys.formalLocallyFinished, nextFinished);
  }

  /** 点击活动卡片后：按卡片状态 hydrate 下方发信栏（已发送→绿框数据；待发→清空汇报） */
  async function hydrateFormalSendMonitorForCampaign(
    camp: (typeof campaigns)[number],
    expectedMonitorId: string
  ) {
    const id = camp.id;
    const mode = formalSendCampaignCardMonitorMode(camp, formalLocallyFinishedIdsRef.current);
    if (String(expectedMonitorId) !== String(id)) return;

    if (mode === "ready") {
      if (formalSendCompletionNoteRef.current?.campaignId === id) {
        formalSendCompletionNoteRef.current = null;
        setFormalSendCompletionNote(null);
      }
      return;
    }

    if (mode === "sending") {
      return;
    }

    try {
      const p = await fetchSendProgress(id, 0, true);
      if (String(expectedMonitorId) !== String(id)) return;
      const hasIndustry = formalSelectedIndustriesRef.current.length > 0;
      const planned = syncSendSessionPlannedFromPoll(0, {
        previewAudienceCount: formalAudienceCountRef.current,
        campaignRecipientCount: camp.recipient_count,
        serverRecipientCount: p.recipientCount,
        serverRunPlannedTotal: p.runPlannedTotal,
        hasIndustrySelection: hasIndustry,
        locked: false
      });
      const industryLabels = childUi.formatFormalIndustryLabels(
        formalSelectedIndustriesRef.current.length > 0
          ? formalSelectedIndustriesRef.current
          : (camp.targetIndustries ?? [])
      );
      const summary = buildSessionSummaryFromPoll(
        p,
        {
          planned,
          durationSec: 0,
          /** 历史卡片 hydrate：勿走末封 tail 抬 attempted/planned（预览 1232 vs 实发 36） */
          stopped: true,
          sessionFailedFloor: Math.max(0, Math.floor(Number(p.failed) || 0))
        },
        {
          campaignCode: campaignPickerCode(camp),
          campaignName: camp.name,
          targetIndustriesNote: industryLabels
        }
      );
      const paceHint =
        formalSendMinIntervalMsRef.current > 0
          ? ui.paceIntervalSec(formalSendMinIntervalMsRef.current / 1000)
          : ui.pace3s;
      const note: FormalSendCompletionNote = {
        campaignId: id,
        kind: "done",
        sent: summary.sent,
        failed: summary.failed,
        attempted: summary.attempted,
        planned: summary.planned,
        paceHint,
        campaignCode: camp.campaign_code ?? undefined,
        campaignName: camp.name,
        industryLabels,
        durationSec: summary.durationSec,
        finishedAtMs: summary.finishedAtMs ?? Date.now(),
        fromEmails: campaignMailboxSenderPreview?.fromEmail
      };
      formalSendCompletionNoteRef.current = note;
      setFormalSendCompletionNote(note);
      setFormalSendRunAttempted(summary.attempted);
      setFormalSendRunSent(summary.sent);
      setFormalSendRunFailed(summary.failed);
      setFormalSendRemainCount(0);
      setFormalSendProgress(0);
      setFormalSendRemainSec(0);
      persistFormalCompletionNote(userScopedKeys.formalCompletionNotes, {
        campaignId: id,
        kind: note.kind === "pause" ? "stop" : note.kind,
        sent: note.sent,
        failed: note.failed,
        attempted: note.attempted,
        planned: note.planned,
        paceHint: note.paceHint,
        campaignCode: note.campaignCode,
        campaignName: note.campaignName,
        industryLabels: note.industryLabels,
        durationSec: note.durationSec,
        finishedAtMs: note.finishedAtMs,
        fromEmails: note.fromEmails
      });
      return;
    } catch {
      /* fall through to stored note */
    }

    const stored = readFormalCompletionNoteForCampaign(userScopedKeys.formalCompletionNotes, id);
    if (stored) {
      formalSendCompletionNoteRef.current = stored as FormalSendCompletionNote;
      applyStoredCompletionNoteToUi(stored, {
        setCompletionNote: setFormalSendCompletionNote as (n: StoredFormalCompletionNote) => void,
        setAttempted: setFormalSendRunAttempted,
        setSent: setFormalSendRunSent,
        setFailed: setFormalSendRunFailed,
        setRemain: setFormalSendRemainCount,
        setProgress: setFormalSendProgress,
        setRemainSec: setFormalSendRemainSec
      });
      setFormalSendProgress(0);
      setFormalSendRemainCount(0);
      setFormalSendRemainSec(0);
    }
  }

  function finishFormalSendFromPoll(id: number, poll: SendProgressResp, view: FormalSendLivePollView) {
    const pollStatus = String(poll.campaignStatus ?? "").trim().toLowerCase();
    const pollAttempted = Math.max(0, Math.floor(Number(poll.attempted ?? 0)));
    const effectivePlan = Math.max(0, Math.floor(view.planned));
    if (
      pollStatus === "sending" &&
      poll.runStillSending !== false &&
      effectivePlan > 0 &&
      pollAttempted < effectivePlan
    ) {
      return;
    }
    if (formalFinishHandledRef.current.has(id)) {
      const stored = readFormalCompletionNoteForCampaign(userScopedKeys.formalCompletionNotes, id);
      if (stored) {
        formalSendCompletionNoteRef.current = stored as FormalSendCompletionNote;
        setFormalSendCompletionNote(stored as FormalSendCompletionNote);
        applyStoredCompletionNoteToUi(stored, {
          setCompletionNote: setFormalSendCompletionNote as (n: StoredFormalCompletionNote) => void,
          setAttempted: setFormalSendRunAttempted,
          setSent: setFormalSendRunSent,
          setFailed: setFormalSendRunFailed,
          setRemain: setFormalSendRemainCount,
          setProgress: setFormalSendProgress,
          setRemainSec: setFormalSendRemainSec
        });
      }
      return;
    }
    markFormalSendLocallyFinished(id);

    if (formalSendLivePollRef.current) {
      clearInterval(formalSendLivePollRef.current);
      formalSendLivePollRef.current = null;
    }
    stopFormalLiveDrip();
    formalPullLiveOnceRef.current = null;
    formalLivePoolRef.current = [];

    const camp = campaigns.find((c) => Number(c.id) === id) ?? null;
    const durationSec =
      formalSendStartedAtRef.current != null
        ? Math.max(1, Math.round((Date.now() - formalSendStartedAtRef.current) / 1000))
        : 0;
    const industryLabels = childUi.formatFormalIndustryLabels(
      formalSelectedIndustriesRef.current.length > 0
        ? formalSelectedIndustriesRef.current
        : (camp?.targetIndustries ?? [])
    );
    const failedFloor = Math.max(
      view.runFailed,
      Math.max(0, Math.floor(Number(formalPrevBreakdownRef.current.deliveryIssues ?? 0)))
    );
    const summary = buildSessionSummaryFromPoll(
      poll,
      {
        planned: view.planned,
        durationSec,
        stopped: false,
        liveRows: view.liveRows,
        sessionFailedFloor: failedFloor
      },
      camp
        ? {
            campaignCode: campaignPickerCode(camp),
            campaignName: camp.name,
            targetIndustriesNote: industryLabels
          }
        : null
    );

    setFormalSendRunAttempted(summary.attempted);
    setFormalSendRunSent(summary.sent);
    setFormalSendRunFailed(summary.failed);
    setFormalSendRemainCount(0);
    setFormalSendProgress(100);
    setFormalSendRemainSec(0);
    setFormalSendLiveRows([]);

    const paceHint =
      formalSendMinIntervalMsRef.current > 0
        ? ui.paceIntervalSec(formalSendMinIntervalMsRef.current / 1000)
        : ui.paceAsapShort;
    const sig = `done:${id}:${summary.sent}:${summary.failed}:${summary.attempted}:${summary.planned}:${formalSendMinIntervalMsRef.current}`;
    if (formalLastCompletionSigRef.current !== sig) {
      formalLastCompletionSigRef.current = sig;
      const note: FormalSendCompletionNote = {
        campaignId: id,
        kind: "done",
        sent: summary.sent,
        failed: summary.failed,
        attempted: summary.attempted,
        planned: summary.planned,
        paceHint,
        campaignCode: camp?.campaign_code ?? undefined,
        campaignName: camp?.name ?? undefined,
        industryLabels,
        durationSec: summary.durationSec,
        finishedAtMs: summary.finishedAtMs ?? Date.now(),
        fromEmails: campaignMailboxSenderPreview?.fromEmail
      };
      formalSendCompletionNoteRef.current = note;
      setFormalSendCompletionNote(note);
      persistFormalCompletionNote(userScopedKeys.formalCompletionNotes, {
        campaignId: id,
        kind: note.kind === "pause" ? "stop" : note.kind,
        sent: note.sent,
        failed: note.failed,
        attempted: note.attempted,
        planned: note.planned,
        paceHint: note.paceHint,
        campaignCode: note.campaignCode,
        campaignName: note.campaignName,
        industryLabels: note.industryLabels,
        durationSec: note.durationSec,
        finishedAtMs: note.finishedAtMs,
        fromEmails: note.fromEmails
      });
    }

    setFormalSendBusy(false);
    formalSendLockRef.current = false;
    formalSendSourceRef.current = null;
    formalSendStartedAtRef.current = null;
    setFormalSendAvgSecPerMail(null);
    formalPendingControlActionRef.current = null;
    cancelFormalSendConfirm();
    try {
      window.sessionStorage.removeItem(userScopedKeys.formalSendWatchCampaignId);
    } catch {
      /* ignore */
    }
    void refreshCampaigns().catch(() => undefined);
    void refreshDedicatedLanes().catch(() => undefined);
  }

  runFormalSendWatchRef.current = (id: number, baseLastId: number) => {
    if (formalSendLivePollRef.current) {
      clearInterval(formalSendLivePollRef.current);
      formalSendLivePollRef.current = null;
    }
    stopFormalLiveDrip();
    formalPrevLiveRowsRef.current = [];
    formalPrevBreakdownRef.current = {};
    formalLivePoolRef.current = [];
    formalProgressSinceIdRef.current = Math.max(0, Math.floor(baseLastId));
    formalPollIntervalMsRef.current = FORMAL_SEND_LIVE_POLL_FAST_MS;
    setFormalPollIntervalMs(FORMAL_SEND_LIVE_POLL_FAST_MS);
    setFormalSendLiveRows([]);
    startFormalLiveDrip();
    const pullLive = async () => {
      try {
        const sinceId = formalProgressSinceIdRef.current;
        const needFresh =
          formalLivePoolRef.current.length === 0 && formalPrevLiveRowsRef.current.length === 0;
        const p = await fetchSendProgress(
          id,
          sinceId,
          needFresh,
          formalSessionSendRunIdRef.current
        );
        const lastId = Math.max(0, Math.floor(Number(p.lastId ?? 0)));
        if (lastId > formalProgressSinceIdRef.current) {
          formalProgressSinceIdRef.current = lastId;
        }
        const sendRunId = Math.max(0, Number(p.sendRunId ?? 0));
        if (sendRunId > 0 && formalSessionSendRunIdRef.current === 0) {
          formalSessionSendRunIdRef.current = sendRunId;
        }
        const camp = campaigns.find((c) => Number(c.id) === id) ?? null;
        const hasIndustry = formalSelectedIndustriesRef.current.length > 0;
        if (Number(p.runBaselineAttempted ?? 0) > 0) {
          formalBaselineAttemptedRef.current = Number(p.runBaselineAttempted ?? 0);
        }
        formalPlannedRecipientRef.current = syncSendSessionPlannedFromPoll(
          formalPlannedRecipientRef.current,
          {
            previewAudienceCount: formalAudienceCountRef.current,
            campaignRecipientCount: camp?.recipient_count,
            serverRecipientCount: p.recipientCount,
            serverRunPlannedTotal: p.runPlannedTotal,
            hasIndustrySelection: hasIndustry,
            locked: formalSendPlannedLockedRef.current
          }
        );
        const recent = mapSendProgressRecentRows(Array.isArray(p.recent) ? p.recent : []);
        formalLivePoolRef.current = mergeFormalSendLivePool(formalLivePoolRef.current, recent);
        const view = applyFormalSendLivePollView(p, {
          previewAudienceCount: formalAudienceCountRef.current,
          campaignRecipientCount: camp?.recipient_count,
          hasIndustrySelection: hasIndustry,
          plannedLocked: formalPlannedRecipientRef.current,
          plannedLockedFlag: formalSendPlannedLockedRef.current,
          baselines: {
            baselineAttempted: formalBaselineAttemptedRef.current,
            baselineSent: formalBaselineSentRef.current,
            baselineFailed: formalBaselineFailedRef.current
          },
          prevLiveRows: formalLivePoolRef.current,
          prevBreakdown: formalPrevBreakdownRef.current,
          sendRunBound: formalSessionSendRunIdRef.current > 0 || sendRunId > 0,
          dripLiveRows: false
        });
        formalPrevBreakdownRef.current = view.breakdown;
        tickFormalLiveDrip();
        const prep = String(p.prepDetail ?? "").trim();
        setFormalSendPrepHint(
          formalPrevLiveRowsRef.current.length === 0 && (p.warmingUp || prep)
            ? prep || ui.prepFirstSend
            : null
        );
        if (formalPrevLiveRowsRef.current.length > 0) {
          setFormalSendPrepHint(null);
          restartFormalLivePollInterval(FORMAL_SEND_LIVE_POLL_MS);
        } else {
          restartFormalLivePollInterval(FORMAL_SEND_LIVE_POLL_FAST_MS);
        }

        const summaryCounts = buildSessionSummaryFromPoll(
          p,
          {
            planned: view.planned,
            durationSec: 0,
            stopped: false,
            liveRows: view.liveRows,
            sessionFailedFloor: view.runFailed
          },
          null
        );
        const displayAttempted = view.showSendComplete ? summaryCounts.attempted : view.runAttempted;
        const displaySent = view.showSendComplete ? summaryCounts.sent : view.runSent;
        const displayFailed = view.showSendComplete ? summaryCounts.failed : view.runFailed;

        const pollStatus = String(p.campaignStatus ?? "").trim().toLowerCase();
        const pollAttemptedRaw = Math.max(0, Math.floor(Number(p.attempted ?? 0)));
        const pollStillSending =
          pollStatus === "sending" &&
          p.runStillSending !== false &&
          view.planned > 0 &&
          pollAttemptedRaw < view.planned;

        const pollFinished =
          !pollStillSending && (view.finish.shouldFinish || view.showSendComplete);
        const monitorCompleted =
          String(camp?.status ?? "").toLowerCase() === "completed" || pollFinished;
        const run = toSendRunProgressDisplay(
          {
            planned: view.planned,
            runAttempted: displayAttempted,
            remain: pollFinished ? 0 : view.remain,
            progressPct: pollFinished ? 100 : view.progressPct
          },
          {
            isSending: !pollFinished,
            campaignCompleted: monitorCompleted
          }
        );
        setFormalSendRunAttempted(displayAttempted);
        setFormalSendRunSent(displaySent);
        setFormalSendRunFailed(displayFailed);
        setFormalSendRemainCount(run.remain);
        const elapsedSec =
          displayAttempted > 0 && formalSendStartedAtRef.current != null
            ? Math.max(1, (Date.now() - formalSendStartedAtRef.current) / 1000)
            : 0;
        const avgSec = displayAttempted > 0 ? elapsedSec / displayAttempted : 0;
        const minSec = Math.max(0, formalSendMinIntervalMsRef.current) / 1000;
        const effectivePerMailSec = Math.max(minSec, avgSec || minSec || 0);
        setFormalSendAvgSecPerMail(avgSec > 0 ? avgSec : null);
        setFormalSendRemainSec(pollFinished ? 0 : Math.round(run.remain * effectivePerMailSec));
        setFormalSendProgress(run.progressPct);
        if (pollFinished) {
          stopFormalLiveDrip();
          formalLivePoolRef.current = [];
          formalPrevLiveRowsRef.current = [];
          setFormalSendLiveRows([]);
          finishFormalSendFromPoll(id, p, view);
        }
      } catch {
        // ignore poll errors; next tick retries
      }
    };
    formalPullLiveOnceRef.current = pullLive;
    formalSendLivePollRef.current = setInterval(() => {
      void pullLive();
    }, FORMAL_SEND_LIVE_POLL_FAST_MS);
    void pullLive();
  };

  const recentMonitorCampaigns = useMemo(() => campaigns.slice(0, 6), [campaigns]);

  const selectedCampaignInRecentCards = useMemo(
    () => recentMonitorCampaigns.some((c) => String(c.id) === selectedCampaignId),
    [recentMonitorCampaigns, selectedCampaignId]
  );

  const selectedCampaign = useMemo(() => {
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) return null;
    return campaigns.find((c) => c.id === id) ?? null;
  }, [campaigns, selectedCampaignId]);

  const selectedMonitorCampaign = useMemo(() => {
    const id = Number(monitorCampaignId);
    if (!id || Number.isNaN(id)) return null;
    return campaigns.find((c) => c.id === id) ?? null;
  }, [campaigns, monitorCampaignId]);
  /**
   * 监控面板"显示进度"的开关：
   * - 选中活动 status='sending'
   * - 或者前端正有一次发送在飞行中（formalSendBusy=true，刚点完发送、后台还没把
   *   email_campaigns.status 翻成 'sending' 之前的窗口期；以前的版本会让监控空白）
   */
  const monitorCompletionNote = useMemo(() => {
    const id = Number(monitorCampaignId);
    if (!id || !formalSendCompletionNote || formalSendCompletionNote.campaignId !== id) return null;
    return formalSendCompletionNote;
  }, [monitorCampaignId, formalSendCompletionNote]);

  const isMonitorLocallyFinished = useMemo(() => {
    const id = Number(monitorCampaignId);
    if (id <= 0) return false;
    if (String(selectedMonitorCampaign?.status ?? "").toLowerCase() === "sending") return false;
    return formalLocallyFinishedIds.includes(id);
  }, [monitorCampaignId, selectedMonitorCampaign?.status, formalLocallyFinishedIds]);

  const selectedMonitorIsSending =
    String(selectedMonitorCampaign?.status ?? "").toLowerCase() === "sending" ||
    (formalSendBusy && !isMonitorLocallyFinished);

  const activeSendingCampaign = useMemo(
    () => campaigns.find((c) => String(c.status ?? "").toLowerCase() === "sending") ?? null,
    [campaigns]
  );

  const selectedCardMonitorMode = useMemo(() => {
    if (!selectedMonitorCampaign) return null;
    return formalSendCampaignCardMonitorMode(selectedMonitorCampaign, formalLocallyFinishedIds);
  }, [selectedMonitorCampaign, formalLocallyFinishedIds]);

  const monitorBlockedByOtherSend = Boolean(
    selectedCardMonitorMode === "ready" &&
      activeSendingCampaign &&
      Number(activeSendingCampaign.id) !== Number(selectedCampaignId)
  );

  const formalSendUiActive =
    formalSendBusy && !formalLocallyFinishedIds.includes(Number(selectedCampaignId));

  const selectedCampaignSelectable = useMemo(() => {
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) return false;
    const camp = campaigns.find((c) => c.id === id) ?? null;
    return camp != null && isFormalSendCampaignSelectable(camp);
  }, [selectedCampaignId, campaigns]);

  const showMonitorSendControls = useMemo(() => {
    if (monitorBlockedByOtherSend) return false;
    if (selectedMonitorIsSending) return true;
    if (!selectedCampaignSelectable) return false;
    const id = Number(selectedCampaignId);
    if (monitorCompletionNote && monitorCompletionNote.campaignId === id) return false;
    if (formalLocallyFinishedIds.includes(id)) return false;
    return true;
  }, [
    monitorBlockedByOtherSend,
    selectedMonitorIsSending,
    selectedCampaignId,
    selectedCampaignSelectable,
    monitorCompletionNote,
    formalLocallyFinishedIds
  ]);

  const monitorShowsCompletionStats = Boolean(monitorCompletionNote) || selectedMonitorIsSending;

  const monitorStatAttempted = monitorCompletionNote?.attempted ?? formalSendRunAttempted;
  const monitorStatSent = monitorCompletionNote?.sent ?? formalSendRunSent;
  const monitorStatFailed = monitorCompletionNote?.failed ?? formalSendRunFailed;

  const monitorCompletionReport = useMemo((): FormalSendReportSnapshot | null => {
    if (!monitorCompletionNote) return null;
    const camp = selectedMonitorCampaign;
    const industries =
      monitorCompletionNote.industryLabels?.trim() ||
      childUi.formatFormalIndustryLabels(
        formalSelectedIndustries.length > 0
          ? formalSelectedIndustries
          : (camp?.targetIndustries ?? [])
      );
    return {
      campaignId: monitorCompletionNote.campaignId,
      kind: monitorCompletionNote.kind,
      campaignCode: monitorCompletionNote.campaignCode ?? camp?.campaign_code ?? "",
      campaignName: monitorCompletionNote.campaignName ?? camp?.name ?? "",
      industryLabels: industries,
      plannedRecipients: monitorCompletionNote.planned,
      fromEmails: monitorCompletionNote.fromEmails ?? campaignMailboxSenderPreview?.fromEmail ?? "—",
      attempted: monitorCompletionNote.attempted,
      sent: monitorCompletionNote.sent,
      failed: monitorCompletionNote.failed,
      durationSec: monitorCompletionNote.durationSec ?? 0,
      finishedAtMs: monitorCompletionNote.finishedAtMs ?? Date.now(),
      sendTimeLabel: formatLaneSendFinishedAt(monitorCompletionNote.finishedAtMs ?? Date.now(), locale)
    };
  }, [
    monitorCompletionNote,
    selectedMonitorCampaign,
    formalSelectedIndustries,
    campaignMailboxSenderPreview?.fromEmail,
    locale
  ]);

  useEffect(() => {
    if (!formalSendBusy) return;
    const t = window.setInterval(() => {
      refreshCampaigns().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(t);
  }, [formalSendBusy]);

  /** 活动已 completed 但进度条仍显示剩余时，再拉一次进度并收束到 100% */
  useEffect(() => {
    const id = Number(monitorCampaignId);
    if (!id) return;
    if (formalSendCompletionNoteRef.current?.campaignId === id) return;
    if (String(selectedMonitorCampaign?.status ?? "").toLowerCase() !== "completed") return;
    if (formalSendProgress >= 100 && formalSendRemainCount <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const p = await fetchSendProgress(id);
        if (cancelled) return;
        const attemptedTotal = Math.max(0, Number(p.attempted ?? 0));
        const hasIndustry = formalSelectedIndustriesRef.current.length > 0;
        if (Number(p.runBaselineAttempted ?? 0) > 0) {
          formalBaselineAttemptedRef.current = Number(p.runBaselineAttempted ?? 0);
        }
        formalPlannedRecipientRef.current = syncSendSessionPlannedFromPoll(formalPlannedRecipientRef.current, {
          previewAudienceCount: formalAudienceCountRef.current,
          campaignRecipientCount: selectedMonitorCampaign?.recipient_count,
          serverRecipientCount: p.recipientCount,
          serverRunPlannedTotal: p.runPlannedTotal,
          hasIndustrySelection: hasIndustry,
          locked: false
        });
        const runRaw = computeSendRunProgress({
          plannedTotal: formalPlannedRecipientRef.current,
          cumulativeAttempted: attemptedTotal,
          baselineAttempted: formalBaselineAttemptedRef.current
        });
        const run = toSendRunProgressDisplay(runRaw, { isSending: false, campaignCompleted: true });
        setFormalSendRemainCount(run.remain);
        setFormalSendProgress(run.progressPct);
        setFormalSendRemainSec(0);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    monitorCampaignId,
    selectedMonitorCampaign?.status,
    selectedMonitorCampaign?.recipient_count,
    formalSendProgress,
    formalSendRemainCount
  ]);

  /** 当前 resume 面板正在跟随的活动 id（用于跨多次渲染检测“切到另一个活动”） */
  const resumeWatchedCampaignIdRef = useRef<number | null>(null);

  /**
   * 实时监控面板跟随「监控下拉框选中的活动」：
   * - 监控活动 = sending → 显示该活动的实时发送进度（resume 模式）
   * - 切换到另一个 sending 活动 → 拆掉旧轮询，挂上新活动的轮询
   * - 切换到非 sending 活动（或清空选中）→ 收起 resume 面板
   *
   * 仅作用于 resume 模式；不打断 manual（用户刚点过「发送」）和 auto（其它发送源）的状态机。
   * 行为变化前的版本固定盯列表里第一个 sending，跟监控选择无关，导致换 ID 后 UI 不跟随。
   */
  useEffect(() => {
    /** 不打断 manual/auto 的状态机；仅在 idle 或 resume 模式下接管 */
    const src = formalSendSourceRef.current;
    if (src === "manual" || src === "auto") return;

    const selId = Number(monitorCampaignId);
    const selCamp = selId > 0 ? campaigns.find((c) => c.id === selId) ?? null : null;
    const selIsSending = !!selCamp && String(selCamp.status ?? "").toLowerCase() === "sending";

    /** 尚未选中 / 列表未加载完：勿清 sessionStorage，避免从其它页返回时误判「已结束」 */
    if (!selId) return;
    if (!selCamp) return;

    if (formalLocallyFinishedIds.includes(selId) || formalFinishHandledRef.current.has(selId)) {
      if (selIsSending) {
        clearFormalSendLocalFinish(selId);
        if (formalSendCompletionNoteRef.current?.campaignId === selId) {
          formalSendCompletionNoteRef.current = null;
          setFormalSendCompletionNote(null);
        }
        clearFormalCompletionNote(userScopedKeys.formalCompletionNotes, selId);
      } else {
        const stored = readFormalCompletionNoteForCampaign(userScopedKeys.formalCompletionNotes, selId);
        if (stored && !formalSendCompletionNoteRef.current) {
          formalSendCompletionNoteRef.current = stored as FormalSendCompletionNote;
          applyStoredCompletionNoteToUi(stored, {
            setCompletionNote: setFormalSendCompletionNote as (n: StoredFormalCompletionNote) => void,
            setAttempted: setFormalSendRunAttempted,
            setSent: setFormalSendRunSent,
            setFailed: setFormalSendRunFailed,
            setRemain: setFormalSendRemainCount,
            setProgress: setFormalSendProgress,
            setRemainSec: setFormalSendRemainSec
          });
        }
        return;
      }
    }

    /** 1) 选中切换到非 sending：如之前在 resume 中，立即拆掉 */
    if (!selIsSending) {
      const keepCompletionSnapshot =
        formalSendCompletionNoteRef.current != null &&
        formalSendCompletionNoteRef.current.campaignId === selId;
      if (formalSendLivePollRef.current) {
        clearInterval(formalSendLivePollRef.current);
        formalSendLivePollRef.current = null;
      }
      stopFormalLiveDrip();
      formalPullLiveOnceRef.current = null;
      formalLivePoolRef.current = [];
      setFormalSendBusy(false);
      formalSendSourceRef.current = null;
      formalSendStartedAtRef.current = null;
      setFormalSendAvgSecPerMail(null);
      setFormalSendProgress(0);
      setFormalSendLiveRows([]);
      if (!keepCompletionSnapshot) {
        setFormalSendRunAttempted(0);
        setFormalSendRunSent(0);
        setFormalSendRunFailed(0);
      } else {
        const snap = formalSendCompletionNoteRef.current!;
        setFormalSendRunAttempted(snap.attempted);
        setFormalSendRunSent(snap.sent);
        setFormalSendRunFailed(snap.failed);
      }
      setFormalSendRemainCount(0);
      setFormalSendRemainSec(0);
      resumeWatchedCampaignIdRef.current = null;
      try {
        window.sessionStorage.removeItem(userScopedKeys.formalSendWatchCampaignId);
      } catch {
        /* ignore sessionStorage failures (privacy mode etc.) */
      }
      return;
    }

    /** 2) 选中活动 = sending 且已经在跟踪它 → 不动（避免每次 campaigns 刷新都重建轮询） */
    if (resumeWatchedCampaignIdRef.current === selId && formalSendLivePollRef.current != null) {
      return;
    }

    /** 3) 选中活动 = sending，但当前未跟踪/在跟踪别的活动 → 切换到它 */
    if (formalSendLockRef.current) return;
    if (formalSendLivePollRef.current) {
      clearInterval(formalSendLivePollRef.current);
      formalSendLivePollRef.current = null;
    }
    stopFormalLiveDrip();
    formalPullLiveOnceRef.current = null;
    formalPrevLiveRowsRef.current = [];
    formalPrevBreakdownRef.current = {};
    formalLivePoolRef.current = [];
    setFormalSendLiveRows([]);

    let cancelled = false;
    resumeWatchedCampaignIdRef.current = selId;

    void (async () => {
      try {
        const bgSnap = reclaimFormalSendBackgroundWatch(selId);
        const base = await fetchSendProgress(selId);
        if (cancelled) return;
        /** 拉 base 时用户可能又切了活动；只在仍是当前跟踪目标时落地 UI */
        if (resumeWatchedCampaignIdRef.current !== selId) return;

        const baseAttempted = Math.max(0, Number(base.attempted ?? 0));
        const hasIndustry = formalSelectedIndustriesRef.current.length > 0;
        const serverBaseline = Math.max(0, Number(base.runBaselineAttempted ?? 0));
        formalBaselineAttemptedRef.current = serverBaseline > 0 ? serverBaseline : baseAttempted;
        const baseSendRunId = Math.max(0, Number(base.sendRunId ?? 0));
        formalSessionSendRunIdRef.current = baseSendRunId > 0 ? baseSendRunId : bgSnap.sendRunId;
        if (baseSendRunId <= 0) {
          formalBaselineSentRef.current = Number(base.sent ?? 0);
          formalBaselineFailedRef.current = Number(base.failed ?? 0);
        } else {
          formalBaselineSentRef.current = 0;
          formalBaselineFailedRef.current = 0;
        }
        formalPlannedRecipientRef.current = syncSendSessionPlannedFromPoll(0, {
          previewAudienceCount: formalAudienceCount,
          campaignRecipientCount: selCamp?.recipient_count,
          serverRecipientCount: base.recipientCount,
          serverRunPlannedTotal: base.runPlannedTotal,
          hasIndustrySelection: hasIndustry,
          locked: false
        });
        formalSendPlannedLockedRef.current = formalPlannedRecipientRef.current > 0;
        const baseLastId = Math.max(Number(base.lastId ?? 0), bgSnap.sinceId);

        setFormalSendBusy(true);
        formalSendSourceRef.current = "resume";
        formalSendStartedAtRef.current = Date.now();
        setFormalSendAvgSecPerMail(null);
        const metrics = formalSendMetricsFromPoll(base, {
          plannedLocked: formalPlannedRecipientRef.current,
          baselineAttempted: formalBaselineAttemptedRef.current,
          baselineSent: formalBaselineSentRef.current,
          baselineFailed: formalBaselineFailedRef.current
        });
        const run = toSendRunProgressDisplay(
          {
            planned: formalPlannedRecipientRef.current,
            runAttempted: metrics.runAttempted,
            remain: metrics.remain,
            progressPct: metrics.progressPct
          },
          { isSending: true }
        );
        setFormalSendRunAttempted(metrics.runAttempted);
        setFormalSendRunSent(metrics.runSent);
        setFormalSendRunFailed(metrics.runFailed);
        setFormalSendRemainCount(run.remain);
        setFormalSendRemainSec(
          run.remain <= 0
            ? 0
            : Math.round((run.remain * Math.max(0, formalSendMinIntervalMsRef.current)) / 1000)
        );
        setFormalSendProgress(run.progressPct);

        try {
          window.sessionStorage.setItem(userScopedKeys.formalSendWatchCampaignId, String(selId));
        } catch {
          /* ignore */
        }
        runFormalSendWatchRef.current(selId, baseLastId);
      } catch {
        /* 拉取失败：保持原状，下一次 campaigns 刷新会自然重试 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaigns, monitorCampaignId, formalLocallyFinishedIds]);

  /**
   * 页面初次加载或回到本页时：如果用户尚未在监控下拉框选择任何活动，但列表里存在
   * status='sending' 的活动，自动选中它（取最新一条），让上面的 resume effect 紧跟着
   * 把实时面板挂起来。
   * 已经有选中时不要覆盖（尊重用户的最近一次操作）。
   */
  /** 服务端仍 sending 但 session 误标已收尾 → 清本地 finish，恢复进度条 */
  useEffect(() => {
    const staleFinished = campaigns.filter(
      (c) =>
        String(c.status ?? "").toLowerCase() === "sending" &&
        formalLocallyFinishedIds.includes(c.id)
    );
    if (staleFinished.length === 0) return;
    for (const c of staleFinished) {
      clearFormalSendLocalFinish(c.id);
      clearFormalCompletionNote(userScopedKeys.formalCompletionNotes, c.id);
    }
    const monitorId = Number(monitorCampaignId);
    if (staleFinished.some((c) => c.id === monitorId) && formalSendCompletionNoteRef.current?.campaignId === monitorId) {
      formalSendCompletionNoteRef.current = null;
      setFormalSendCompletionNote(null);
    }
  }, [campaigns, formalLocallyFinishedIds, monitorCampaignId, userScopedKeys.formalCompletionNotes]);

  useEffect(() => {
    if (formalSendBusy || selectedMonitorIsSending) return;
    const selId = Number(selectedCampaignId);
    const selCamp = selId > 0 ? campaigns.find((c) => c.id === selId) : null;
    const selOk = selCamp != null;
    if (!selOk) {
      const next = [...campaigns]
        .sort((a, b) => b.id - a.id)
        .find((c) => String(c.status ?? "").toLowerCase() === "sending" || isFormalSendCampaignSelectable(c));
      if (next) {
        pickFormalSendCampaign(String(next.id));
      } else if (selectedCampaignId) {
        setSelectedCampaignId("");
        setMonitorCampaignId((prev) => (prev === selectedCampaignId ? "" : prev));
      }
    }
  }, [campaigns, selectedCampaignId, formalSendBusy, selectedMonitorIsSending]);

  useEffect(() => {
    if (monitorCampaignId) return;
    const fromSession = readFormalWatchCampaignIdFromSession(userScopedKeys.formalSendWatchCampaignId);
    if (fromSession) {
      const camp = campaigns.find((c) => String(c.id) === fromSession);
      const stillSending = String(camp?.status ?? "").toLowerCase() === "sending";
      const finished = formalLocallyFinishedIds.includes(Number(fromSession));
      if (!finished || stillSending) {
        setMonitorCampaignId(fromSession);
        setSelectedCampaignId((prev) => prev || fromSession);
      }
      return;
    }
    const firstSending = campaigns.find((c) => String(c.status ?? "").toLowerCase() === "sending");
    if (firstSending) {
      const id = String(firstSending.id);
      setMonitorCampaignId(id);
      setSelectedCampaignId((prev) => prev || id);
      try {
        window.sessionStorage.setItem(userScopedKeys.formalSendWatchCampaignId, id);
      } catch {
        /* ignore */
      }
    }
  }, [campaigns, monitorCampaignId, userScopedKeys.formalSendWatchCampaignId, formalLocallyFinishedIds]);

  useEffect(() => {
    if (selectedCampaign?.status === "sending") return;
    if (!formalSendBusy) return;
    if (formalSendSourceRef.current !== "auto") return;
    if (formalSendLivePollRef.current) {
      clearInterval(formalSendLivePollRef.current);
      formalSendLivePollRef.current = null;
    }
    formalSendLockRef.current = false;
    formalSendSourceRef.current = null;
    formalSendStartedAtRef.current = null;
    setFormalSendAvgSecPerMail(null);
    setFormalSendBusy(false);
    setFormalSendProgress(0);
  }, [selectedCampaign?.status, formalSendBusy]);

  async function saveCampaign() {
    if (selectedTemplateId === "") {
      showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errSelectTemplate);
      return;
    }
    // dnrpj.cn 定制：有专线时不需要手动选通道，自动跳过校验
    const hasDedicated = dedicatedServers.length > 0 || dedicatedLanes.length > 0;
    if (!selectedSenderKey.trim() && !hasDedicated) {
      showPageFeedback(
        setSaveCampaignFeedback,
        saveCampaignFeedbackTimerRef,
        "err",
        ui.errSelectSenderChannel
      );
      return;
    }
    const parsed = selectedSenderKey.trim() ? parseMarketingSenderKey(selectedSenderKey) : null;
    if (!parsed && !hasDedicated) {
      showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errInvalidSenderChannel);
      return;
    }
    const campaignName = form.name.trim();
    if (!campaignName) {
      showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errFillCampaignName);
      return;
    }
    let scheduleStartAt: string | null = null;
    if (scheduleSpecific) {
      if (!scheduleDate) {
        showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errSelectScheduleDate);
        return;
      }
      const dt = buildScheduleDateTime();
      if (!dt) {
        showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errInvalidScheduleTime);
        return;
      }
      if (dt.getTime() < Date.now() - 60_000) {
        showPageFeedback(
          setSaveCampaignFeedback,
          saveCampaignFeedbackTimerRef,
          "err",
          ui.errScheduleNotPast
        );
        return;
      }
      const iso = buildScheduleIso();
      if (!iso) {
        showPageFeedback(setSaveCampaignFeedback, saveCampaignFeedbackTimerRef, "err", ui.errInvalidScheduleTime);
        return;
      }
      scheduleStartAt = iso;
    }
    const industriesForSave = formalSelectedIndustries.map((x) => String(x ?? "").trim()).filter(Boolean);
    const campaignBody: Record<string, unknown> = {
      name: campaignName,
      templateId: Number(selectedTemplateId),
      groupIds: [],
      industries: industriesForSave,
      scheduleSpecific,
      scheduleStartAt,
      sendMode,
      ...(sendMode === "recurring" ? { sendRoundsTotal } : {})
    };
    if (parsed && "smtpId" in parsed) {
      campaignBody.smtpProfileId = parsed.smtpId;
    } else if (parsed) {
      campaignBody.sesSenderAddressId = parsed.sesId;
    }
    // parsed 为 null 时不传通道参数，后端默认走专线
    const r = await apiJson<{ ok: boolean; id: number; campaignCode: string }>("/api/email/campaigns", {
      method: "POST",
      body: JSON.stringify(campaignBody)
    });
    setSavedCampaignCode(r.campaignCode);
    lastAudienceSyncCampaignIdRef.current = "";
    const newId = String(r.id);
    setSelectedCampaignId(newId);
    setMonitorCampaignId(newId);
    await refreshCampaigns();
    showPageFeedback(
      setSaveCampaignFeedback,
      saveCampaignFeedbackTimerRef,
      "ok",
      ui.campaignSaved(r.campaignCode)
    );
  }

  function saveCampaignNameOnly() {
    const name = form.name.trim();
    if (!name) {
      setSaveCampaignNameFeedback(ui.errEnterCampaignName);
      if (saveCampaignNameFeedbackTimerRef.current != null) {
        window.clearTimeout(saveCampaignNameFeedbackTimerRef.current);
      }
      saveCampaignNameFeedbackTimerRef.current = window.setTimeout(() => {
        saveCampaignNameFeedbackTimerRef.current = null;
        setSaveCampaignNameFeedback(null);
      }, 4500);
      return;
    }
    setSavedCampaignNameLibrary((prev) => {
      const next = prev.includes(name) ? prev : [name, ...prev];
      try {
        window.localStorage.setItem(userScopedKeys.campaignNameLibrary, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setHiddenCampaignNames((prev) => {
      const next = prev.filter((x) => x !== name);
      try {
        window.localStorage.setItem(userScopedKeys.campaignNameHidden, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSaveCampaignNameFeedback(ui.campaignNameSaved(name));
    if (saveCampaignNameFeedbackTimerRef.current != null) {
      window.clearTimeout(saveCampaignNameFeedbackTimerRef.current);
    }
    saveCampaignNameFeedbackTimerRef.current = window.setTimeout(() => {
      saveCampaignNameFeedbackTimerRef.current = null;
      setSaveCampaignNameFeedback(null);
    }, 3500);
  }

  function showFormalSendActionFeedback(feedback: InlineActionFeedback, autoClearMs?: number) {
    if (formalSendActionTimerRef.current != null) {
      window.clearTimeout(formalSendActionTimerRef.current);
      formalSendActionTimerRef.current = null;
    }
    setFormalSendActionUi(feedback);
    if (
      autoClearMs != null &&
      autoClearMs > 0 &&
      (feedback.phase === "ok" || feedback.phase === "err")
    ) {
      scheduleInlineFeedbackClear(
        formalSendActionTimerRef,
        () => setFormalSendActionUi(INLINE_FEEDBACK_IDLE),
        autoClearMs
      );
    }
  }

  function cancelFormalSendConfirm() {
    if (formalSendActionTimerRef.current != null) {
      window.clearTimeout(formalSendActionTimerRef.current);
      formalSendActionTimerRef.current = null;
    }
    setFormalSendActionUi(INLINE_FEEDBACK_IDLE);
  }

  function beginFormalSend() {
    if (formalSendLockRef.current) return;
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) {
      showFormalSendActionFeedback({ phase: "err", message: ui.errSelectCampaignId }, 5000);
      return;
    }
    const selCamp = campaigns.find((c) => c.id === id) ?? null;
    if (!selCamp || !isFormalSendCampaignSelectable(selCamp)) {
      showFormalSendActionFeedback({ phase: "err", message: ui.errSelectActivityCard }, 6000);
      return;
    }
    const selStatusNow = String(selectedCampaign?.status ?? "").toLowerCase();
    if (selStatusNow === "sending") {
      showFormalSendActionFeedback(
        {
          phase: "err",
          message:
            ui.errCampaignSending
        },
        7000
      );
      return;
    }
    if (deleteCampaignIdUi.phase === "confirm") cancelDeleteCampaignId();
    setFormalSendActionUi({ phase: "confirm" });
  }

  function beginDeleteCampaignName() {
    if (deleteCampaignNameFeedbackTimerRef.current) {
      window.clearTimeout(deleteCampaignNameFeedbackTimerRef.current);
      deleteCampaignNameFeedbackTimerRef.current = null;
    }
    const name = form.name.trim();
    if (!name) {
      setDeleteCampaignNameUi({
        phase: "err",
        message: ui.errSelectNameToDelete
      });
      scheduleInlineFeedbackClear(deleteCampaignNameFeedbackTimerRef, () => setDeleteCampaignNameUi(INLINE_FEEDBACK_IDLE), 4500);
      return;
    }
    setDeleteCampaignNameConfirmLabel(name);
    setDeleteCampaignNameUi({ phase: "confirm" });
  }

  function cancelDeleteCampaignName() {
    if (deleteCampaignNameFeedbackTimerRef.current) {
      window.clearTimeout(deleteCampaignNameFeedbackTimerRef.current);
      deleteCampaignNameFeedbackTimerRef.current = null;
    }
    setDeleteCampaignNameUi(INLINE_FEEDBACK_IDLE);
    setDeleteCampaignNameConfirmLabel("");
  }

  function confirmDeleteCampaignName() {
    const name = deleteCampaignNameConfirmLabel.trim() || form.name.trim();
    if (!name) {
      setDeleteCampaignNameUi({
        phase: "err",
        message: ui.errSelectNameToDelete
      });
      scheduleInlineFeedbackClear(deleteCampaignNameFeedbackTimerRef, () => setDeleteCampaignNameUi(INLINE_FEEDBACK_IDLE), 4500);
      return;
    }
    setSavedCampaignNameLibrary((prev) => {
      const next = prev.filter((x) => x !== name);
      try {
        window.localStorage.setItem(userScopedKeys.campaignNameLibrary, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setHiddenCampaignNames((prev) => {
      const next = prev.includes(name) ? prev : [name, ...prev];
      try {
        window.localStorage.setItem(userScopedKeys.campaignNameHidden, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setForm((p) => ({ ...p, name: "" }));
    setDeleteCampaignNameConfirmLabel("");
    setDeleteCampaignNameUi({ phase: "ok", message: ui.nameDeleted(name) });
    scheduleInlineFeedbackClear(deleteCampaignNameFeedbackTimerRef, () => setDeleteCampaignNameUi(INLINE_FEEDBACK_IDLE), 3500);
  }

  function beginDeleteCampaignId() {
    if (deleteCampaignIdFeedbackTimerRef.current) {
      window.clearTimeout(deleteCampaignIdFeedbackTimerRef.current);
      deleteCampaignIdFeedbackTimerRef.current = null;
    }
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) {
      setDeleteCampaignIdUi({ phase: "err", message: ui.errSelectCampaignIdToDelete });
      scheduleInlineFeedbackClear(deleteCampaignIdFeedbackTimerRef, () => setDeleteCampaignIdUi(INLINE_FEEDBACK_IDLE), 4500);
      return;
    }
    setDeleteCampaignIdUi({ phase: "confirm" });
  }

  function cancelDeleteCampaignId() {
    if (deleteCampaignIdFeedbackTimerRef.current) {
      window.clearTimeout(deleteCampaignIdFeedbackTimerRef.current);
      deleteCampaignIdFeedbackTimerRef.current = null;
    }
    setDeleteCampaignIdUi(INLINE_FEEDBACK_IDLE);
  }

  function pickFormalSendCampaign(id: string) {
    const camp = campaigns.find((c) => String(c.id) === id);
    if (!camp) return;
    const nextId = Number(id);
    const prevId = Number(selectedCampaignId);
    const mode = formalSendCampaignCardMonitorMode(camp, formalLocallyFinishedIdsRef.current);
    setSelectedCampaignId(id);
    setMonitorCampaignId(id);
    if (formalSendCompletionNoteRef.current?.campaignId !== nextId) {
      formalSendCompletionNoteRef.current = null;
      setFormalSendCompletionNote(null);
    }
    if (prevId !== nextId && nextId > 0) {
      setFormalSendProgress(0);
      setFormalSendRunAttempted(0);
      setFormalSendRunSent(0);
      setFormalSendRunFailed(0);
      setFormalSendRemainCount(0);
      setFormalSendRemainSec(0);
      setFormalSendLiveRows([]);
      cancelFormalSendConfirm();
    }
    if (deleteCampaignIdUi.phase === "confirm") cancelDeleteCampaignId();
    if (mode === "sent" || mode === "ready") {
      void hydrateFormalSendMonitorForCampaign(camp, id);
    }
  }

  async function confirmDeleteCampaignId() {
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) {
      setDeleteCampaignIdUi({ phase: "err", message: ui.errSelectCampaignIdToDelete });
      scheduleInlineFeedbackClear(deleteCampaignIdFeedbackTimerRef, () => setDeleteCampaignIdUi(INLINE_FEEDBACK_IDLE), 4500);
      return;
    }
    setDeleteCampaignIdUi({ phase: "busy" });
    try {
      await apiJson(`/api/email/campaigns/${id}`, { method: "DELETE" });
      setSelectedCampaignId("");
      setMonitorCampaignId((prev) => (prev === String(id) ? "" : prev));
      await refreshCampaigns();
      setDeleteCampaignIdUi({ phase: "ok", message: ui.campaignDeleted });
      scheduleInlineFeedbackClear(deleteCampaignIdFeedbackTimerRef, () => setDeleteCampaignIdUi(INLINE_FEEDBACK_IDLE), 3500);
    } catch (e: unknown) {
      setDeleteCampaignIdUi({ phase: "err", message: String((e as Error)?.message ?? e) });
      scheduleInlineFeedbackClear(deleteCampaignIdFeedbackTimerRef, () => setDeleteCampaignIdUi(INLINE_FEEDBACK_IDLE), 6000);
    }
  }

  async function executeFormalSend() {
    if (formalSendLockRef.current) {
      return;
    }
    const id = Number(selectedCampaignId);
    if (!id || Number.isNaN(id)) {
      showFormalSendActionFeedback({ phase: "err", message: ui.errSelectCampaignId }, 5000);
      return;
    }
    const selStatusNow = String(selectedCampaign?.status ?? "").toLowerCase();
    if (selStatusNow === "sending") {
      showFormalSendActionFeedback(
        {
          phase: "err",
          message:
            ui.errCampaignSending
        },
        7000
      );
      return;
    }
    setFormalSendActionUi(INLINE_FEEDBACK_IDLE);
    formalSendLockRef.current = true;
    formalSendSourceRef.current = "manual";
    formalSendStartedAtRef.current = Date.now();
    setFormalSendAvgSecPerMail(null);
    if (formalSendCompletionNoteRef.current?.campaignId === id) {
      formalSendCompletionNoteRef.current = null;
      setFormalSendCompletionNote(null);
    }
    clearFormalSendLocalFinish(id);
    setFormalSendBusy(true);
    setMonitorCampaignId(String(id));
    try {
      window.sessionStorage.setItem(userScopedKeys.formalSendWatchCampaignId, String(id));
    } catch {
      // ignore private mode / quota
    }
    setFormalSendLiveRows([]);
    setFormalSendPrepHint(null);
    formalLivePoolRef.current = [];
    formalProgressSinceIdRef.current = 0;
    formalSendPlannedLockedRef.current = false;
    formalBaselineAttemptedRef.current = 0;
    formalBaselineSentRef.current = 0;
    formalBaselineFailedRef.current = 0;
    formalSessionSendRunIdRef.current = 0;
    const hasIndustry = formalSelectedIndustries.length > 0;
    formalPlannedRecipientRef.current = resolveSendSessionPlannedTotal({
      previewAudienceCount: formalAudienceCount,
      campaignRecipientCount: selectedCampaign?.recipient_count,
      serverRecipientCount: null,
      hasIndustrySelection: hasIndustry
    });
    formalSendPlannedLockedRef.current = formalPlannedRecipientRef.current > 0;
    setFormalSendRunAttempted(0);
    setFormalSendRunSent(0);
    setFormalSendRunFailed(0);
    setFormalSendRemainCount(formalPlannedRecipientRef.current);
    setFormalSendProgress(0);
    setFormalSendRemainSec(
      formalPlannedRecipientRef.current > 0
        ? Math.round((formalPlannedRecipientRef.current * Math.max(0, formalSendMinIntervalMs)) / 1000)
        : 0
    );

    runFormalSendWatchRef.current(id, 0);

    void (async () => {
      try {
        const base = await fetchSendProgress(id);
        const baseSendRunId = Math.max(0, Number(base.sendRunId ?? 0));
        formalSessionSendRunIdRef.current = baseSendRunId;
        formalBaselineAttemptedRef.current = Number(base.attempted ?? 0);
        if (baseSendRunId <= 0) {
          formalBaselineSentRef.current = Number(base.sent ?? 0);
          formalBaselineFailedRef.current = Number(base.failed ?? 0);
        }
        if (Number(base.runPlannedTotal ?? 0) > 0 && !hasIndustry) {
          formalPlannedRecipientRef.current = Number(base.runPlannedTotal ?? 0);
          formalSendPlannedLockedRef.current = true;
        }
        const run = computeSendRunProgress({
          plannedTotal: formalPlannedRecipientRef.current,
          cumulativeAttempted: formalBaselineAttemptedRef.current,
          baselineAttempted: formalBaselineAttemptedRef.current
        });
        setFormalSendRemainCount(run.remain);
        setFormalSendProgress(run.progressPct);
      } catch {
        /* 轮询会继续拉取 */
      }
    })();
    const pullFinalProgress = async (fallback: { attempted: number; sent: number; failed: number }) => {
      let best = { ...fallback };
      let stableRounds = 0;
      for (let i = 0; i < 8; i++) {
        try {
          const p = await fetchSendProgress(id);
          const cur = {
            attempted: Math.max(0, Number(p.attempted ?? 0)),
            sent: Math.max(0, Number(p.sent ?? 0)),
            failed: Math.max(0, Number(p.failed ?? 0))
          };
          if (cur.attempted > best.attempted || cur.sent > best.sent || cur.failed > best.failed) {
            best = cur;
            stableRounds = 0;
          } else {
            stableRounds += 1;
          }
          const run = computeSendRunProgress({
            plannedTotal: formalPlannedRecipientRef.current,
            cumulativeAttempted: best.attempted,
            baselineAttempted: formalBaselineAttemptedRef.current
          });
          if ((run.planned > 0 && run.runAttempted >= run.planned) || stableRounds >= 2) break;
        } catch {
          // ignore transient read errors
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return best;
    };
    let keepBackgroundSendWatch = false;
    try {
      const audienceLimit = resolveFormalSendAudienceLimit({
        previewAudienceCount: formalAudienceCount,
        hasIndustrySelection: hasIndustry
      });
      const r = await apiJson<{
        ok: boolean;
        deferred?: boolean;
        sent?: number;
        failed?: number;
        attempted?: number;
        planned?: number;
        runPlannedTotal?: number;
        sendRunId?: number;
        aborted?: "pause" | "stop" | null;
        minIntervalMs?: number;
      }>(`/api/email/campaigns/${id}/send`, {
        method: "POST",
        body: JSON.stringify({
          ...(audienceLimit != null && audienceLimit > 0 ? { limit: audienceLimit } : {}),
          minIntervalMs: formalSendMinIntervalMs,
          industries: formalSelectedIndustries,
          triggerSource: "page_manual"
        })
      });
      const ackRunId = Math.max(0, Number(r.sendRunId ?? 0));
      if (ackRunId > 0) formalSessionSendRunIdRef.current = ackRunId;
      const ackPlanned = Math.max(0, Number(r.runPlannedTotal ?? r.planned ?? 0));
      if (ackPlanned > 0) {
        formalPlannedRecipientRef.current = ackPlanned;
        formalSendPlannedLockedRef.current = true;
        if (formalSendPageMountedRef.current) {
          setFormalSendRemainCount(
            Math.max(0, ackPlanned - Math.max(0, formalBaselineAttemptedRef.current))
          );
        }
      }
      await formalPullLiveOnceRef.current?.();
      if (r.deferred) {
        const deadline = Date.now() + 6 * 60 * 60 * 1000;
        while (Date.now() < deadline) {
          if (formalPollFinishedIdsRef.current.has(id)) break;
          await new Promise((resolve) => setTimeout(resolve, 1200));
          try {
            const cr = await apiJson<{ ok: boolean; items: { id: number; status?: string | null }[] }>(
              "/api/email/campaigns"
            );
            const row = (cr.items ?? []).find((x) => Number(x.id) === id);
            if (!row || String(row.status ?? "").toLowerCase() !== "sending") break;
          } catch {
            /* 轮询继续 */
          }
        }
      }
      if (formalFinishHandledRef.current.has(id)) {
        await refreshCampaigns();
        return;
      }
      if (!formalSendPageMountedRef.current) return;
      let seedAttempted = Number(r.attempted ?? 0);
      let seedSent = Number(r.sent ?? 0);
      let seedFailed = Number(r.failed ?? 0);
      if (r.deferred) {
        try {
          const p = await fetchSendProgress(id);
          seedAttempted = Math.max(0, Number(p.attempted ?? 0));
          seedSent = Math.max(0, Number(p.sent ?? 0));
          seedFailed = Math.max(0, Number(p.failed ?? 0));
        } catch {
          seedAttempted = 0;
          seedSent = 0;
          seedFailed = 0;
        }
      }
      const settled = await pullFinalProgress({
        attempted: seedAttempted,
        sent: seedSent,
        failed: seedFailed
      });
      let finalAttempted = settled.attempted;
      let finalSent = settled.sent;
      let finalFailed = settled.failed;
      const plannedTotal = formalPlannedRecipientRef.current;
      let postSendStatus = "";
      try {
        const cr = await apiJson<{ ok: boolean; items: { id: number; status?: string | null }[] }>(
          "/api/email/campaigns"
        );
        postSendStatus = String((cr.items ?? []).find((x) => Number(x.id) === id)?.status ?? "").toLowerCase();
      } catch {
        postSendStatus = "";
      }
      const stillSendingAfterPost = postSendStatus === "sending";
      if (!stillSendingAfterPost) {
        formalSendPlannedLockedRef.current = false;
        if (formalSendLivePollRef.current) {
          clearInterval(formalSendLivePollRef.current);
          formalSendLivePollRef.current = null;
        }
        stopFormalLiveDrip();
      }
      if (!formalSendPageMountedRef.current) return;
      if (stillSendingAfterPost) {
        keepBackgroundSendWatch = true;
        if (!formalSendLivePollRef.current) {
          runFormalSendWatchRef.current(id, formalProgressSinceIdRef.current);
        }
        await refreshCampaigns();
        return;
      }
      try {
        const fin = await fetchSendProgress(id);
        const attemptedTotal = Math.max(0, Number(fin.attempted ?? 0));
        const hasIndustry = formalSelectedIndustriesRef.current.length > 0;
        if (Number(fin.runBaselineAttempted ?? 0) > 0) {
          formalBaselineAttemptedRef.current = Number(fin.runBaselineAttempted ?? 0);
        }
        formalPlannedRecipientRef.current = syncSendSessionPlannedFromPoll(formalPlannedRecipientRef.current, {
          previewAudienceCount: formalAudienceCountRef.current,
          campaignRecipientCount: selectedCampaign?.recipient_count,
          serverRecipientCount: fin.recipientCount,
          serverRunPlannedTotal: fin.runPlannedTotal,
          hasIndustrySelection: hasIndustry,
          locked: false
        });
        const metrics = formalSendMetricsFromPoll(fin, {
          plannedLocked: formalPlannedRecipientRef.current,
          baselineAttempted: formalBaselineAttemptedRef.current,
          baselineSent: formalBaselineSentRef.current,
          baselineFailed: formalBaselineFailedRef.current
        });
        const run = toSendRunProgressDisplay(
          {
            planned: formalPlannedRecipientRef.current,
            runAttempted: metrics.runAttempted,
            remain: metrics.remain,
            progressPct: metrics.progressPct
          },
          { isSending: false, campaignCompleted: postSendStatus === "completed" }
        );
        setFormalSendRunAttempted(metrics.runAttempted);
        setFormalSendRunSent(metrics.runSent);
        setFormalSendRunFailed(metrics.runFailed);
        setFormalSendRemainCount(run.remain);
        setFormalSendProgress(run.progressPct);
        setFormalSendRemainSec(0);
      } catch {
        const runRaw = computeSendRunProgress({
          plannedTotal: formalPlannedRecipientRef.current,
          cumulativeAttempted: finalAttempted,
          baselineAttempted: formalBaselineAttemptedRef.current
        });
        const run = toSendRunProgressDisplay(runRaw, {
          isSending: false,
          campaignCompleted: postSendStatus === "completed"
        });
        setFormalSendRemainCount(run.remain);
        setFormalSendProgress(run.progressPct);
        setFormalSendRemainSec(0);
      }
      const pendingAction = formalPendingControlActionRef.current;
      const treatAsStop =
        r.aborted === "stop" || pendingAction === "stop" || (Boolean(r.deferred) && postSendStatus === "stopped");
      const treatAsPause =
        !treatAsStop &&
        (r.aborted === "pause" || (Boolean(r.deferred) && postSendStatus === "paused"));
      const plannedShown = plannedTotal > 0 ? plannedTotal : (r.planned ?? finalAttempted);
      const paceHint =
        (r.minIntervalMs ?? formalSendMinIntervalMs) > 0
          ? ui.paceIntervalSec((r.minIntervalMs ?? formalSendMinIntervalMs) / 1000)
          : ui.paceAsapShort;
      const noteCamp = campaigns.find((c) => Number(c.id) === id) ?? selectedCampaign;
      const completionMeta = {
        campaignCode: noteCamp?.campaign_code ?? undefined,
        campaignName: noteCamp?.name ?? undefined,
        industryLabels: childUi.formatFormalIndustryLabels(
          formalSelectedIndustriesRef.current.length > 0
            ? formalSelectedIndustriesRef.current
            : (noteCamp?.targetIndustries ?? [])
        ),
        durationSec:
          formalSendStartedAtRef.current != null
            ? Math.max(1, Math.round((Date.now() - formalSendStartedAtRef.current) / 1000))
            : 0,
        finishedAtMs: Date.now(),
        fromEmails: campaignMailboxSenderPreview?.fromEmail
      };
      if (pendingAction === "stop" && treatAsStop) {
        // 已在点击停止时提示，此处仅写入实时监控汇总。
      } else if (treatAsStop) {
        const sig = `stop:${id}:${finalSent}:${finalFailed}:${finalAttempted}:${plannedShown}:${r.minIntervalMs ?? formalSendMinIntervalMs}`;
        if (formalLastCompletionSigRef.current !== sig) {
          formalLastCompletionSigRef.current = sig;
          const note: FormalSendCompletionNote = {
            campaignId: id,
            kind: "stop",
            sent: finalSent,
            failed: finalFailed,
            attempted: finalAttempted,
            planned: plannedShown,
            paceHint,
            ...completionMeta
          };
          formalSendCompletionNoteRef.current = note;
          setFormalSendCompletionNote(note);
        }
      } else if (pendingAction === "pause" && treatAsPause) {
        // 兼容旧暂停路径
      } else if (treatAsPause) {
        const sig = `pause:${id}:${finalSent}:${finalFailed}:${finalAttempted}:${plannedShown}:${r.minIntervalMs ?? formalSendMinIntervalMs}`;
        if (formalLastCompletionSigRef.current !== sig) {
          formalLastCompletionSigRef.current = sig;
          const note: FormalSendCompletionNote = {
            campaignId: id,
            kind: "pause",
            sent: finalSent,
            failed: finalFailed,
            attempted: finalAttempted,
            planned: plannedShown,
            paceHint,
            ...completionMeta
          };
          formalSendCompletionNoteRef.current = note;
          setFormalSendCompletionNote(note);
        }
      } else {
        const sig = `done:${id}:${finalSent}:${finalFailed}:${finalAttempted}:${plannedShown}:${r.minIntervalMs ?? formalSendMinIntervalMs}`;
        if (formalLastCompletionSigRef.current !== sig) {
          formalLastCompletionSigRef.current = sig;
          const note: FormalSendCompletionNote = {
            campaignId: id,
            kind: "done",
            sent: finalSent,
            failed: finalFailed,
            attempted: finalAttempted,
            planned: plannedShown,
            paceHint,
            ...completionMeta
          };
          formalSendCompletionNoteRef.current = note;
          setFormalSendCompletionNote(note);
          markFormalSendLocallyFinished(id);
        }
      }
      await refreshCampaigns();
    } catch (e: unknown) {
      if (formalSendLivePollRef.current) {
        clearInterval(formalSendLivePollRef.current);
        formalSendLivePollRef.current = null;
      }
      formalPullLiveOnceRef.current = null;
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("正在发送中")) {
        await refreshCampaigns().catch(() => undefined);
      } else {
        showFormalSendActionFeedback({ phase: "err", message: msg }, 8000);
      }
    } finally {
      formalSuppressAutoBusyUntilRef.current = Date.now() + 15_000;
      if (!keepBackgroundSendWatch) {
        try {
          window.sessionStorage.removeItem(userScopedKeys.formalSendWatchCampaignId);
        } catch {
          // ignore
        }
        formalPullLiveOnceRef.current = null;
        formalSendSourceRef.current = null;
        formalSendStartedAtRef.current = null;
        setFormalSendAvgSecPerMail(null);
      }
      setFormalSendBusy(false);
      formalSendLockRef.current = false;
      formalPendingControlActionRef.current = null;
    }
  }


  const formalSendConfirmAudienceHint = useMemo(() => {
    const n = Math.max(0, formalAudienceCount ?? Number(selectedCampaign?.recipient_count ?? 0) ?? 0);
    const industryCount = formalSelectedIndustries.length;
    const parts: string[] = [];
    if (n > 0) parts.push(ui.confirmAudienceRecipients(n));
    if (industryCount > 0) parts.push(ui.confirmAudienceIndustries(industryCount));
    return parts.length > 0 ? `${parts.join("，")}。` : "";
  }, [formalAudienceCount, selectedCampaign?.recipient_count, formalSelectedIndustries.length]);

  return (
    <PageShell
      title={ui.pageTitle}
      banner={
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-700">
          <div className="font-semibold text-slate-900">{ui.usageTitle}</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-slate-600">
            {ui.usageBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      }
    >
      {dedicatedLanes.length > 0 ? (
        <div className="mb-4">
          <SectionCard title={ui.workbenchTitle} description={ui.workbenchDescription}>
            <DedicatedLanesWorkbench
              lanes={displayDedicatedLanes}
              selectedLaneIndex={selectedLaneIndex}
              onSelectLaneIndex={(idx) => setSelectedLaneIndex(idx)}
              hideHeading
            />
          </SectionCard>
        </div>
      ) : null}

      <div className="mt-4">
      <SectionCard title={ui.templateSectionTitle} description={ui.templateSectionDescription}>
        <div className="grid grid-cols-1 gap-4">
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">{ui.templateTagLabel}</span>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  value={templateTagKey}
                  onChange={(e) => {
                    setTemplateTagKey(e.target.value);
                    setSelectedTemplateId("");
                  }}
                >
                  <option value="">{ui.allTags}</option>
                  <option value="__none__">{ui.noTag}</option>
                  {templateTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">{ui.selectTemplateLabel}</span>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  value={selectedTemplateId === "" ? "" : String(selectedTemplateId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedTemplateId(v ? Number(v) : "");
                  }}
                >
                  <option value="">{ui.selectTemplatePlaceholder}</option>
                  {filteredTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.subject_template || ui.noSubject}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {templates.length === 0 ? (
              <p className="mt-2 text-xs text-amber-800">{ui.noTemplatesHint}</p>
            ) : null}
        </div>
      </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title={ui.channelSectionTitle} description={ui.channelSectionDescription}>
          {dedicatedLanes.length > 0 ? (
            <DedicatedLaneSenderFilters
              mode="senderKey"
              senderKey={selectedSenderKey}
              onSenderKeyChange={setSelectedSenderKey}
              channel={senderChannel}
              onChannelChange={setSenderChannel}
              lanes={displayDedicatedLanes}
              selectedLaneIndex={selectedLaneIndex}
              onSelectLaneIndex={setSelectedLaneIndex}
              smtpItems={smtpAll as MarketingSmtpRow[]}
              dedicatedServers={dedicatedServers}
              sesAddresses={sesAddresses}
            />
          ) : (
            <MarketingSenderChannelPicker
              mode="senderKey"
              senderKey={selectedSenderKey}
              onSenderKeyChange={setSelectedSenderKey}
              channel={senderChannel}
              onChannelChange={setSenderChannel}
              smtpItems={smtpAll as MarketingSmtpRow[]}
              dedicatedServers={dedicatedServers}
              sesAddresses={sesAddresses}
              inlineRow
            />
          )}
          {campaignMailboxSenderPreview ? (
            <p className="mt-2 text-[11px] text-slate-500">
              {ui.currentSender}
              <span className="ml-1 font-mono text-slate-800">{campaignMailboxSenderPreview.fromEmail}</span>
              {campaignMailboxSenderPreview.displayName ? (
                <span className="text-slate-600"> · {campaignMailboxSenderPreview.displayName}</span>
              ) : null}
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard
          title={ui.taskSectionTitle}
          description={ui.taskSectionDescription}
        >
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            {ui.taskSectionHint}
          </p>
          <div
            className={`grid gap-3 sm:items-end ${
              campaignNameOptions.length > 0 ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"
            }`}
          >
            {campaignNameOptions.length > 0 ? (
              <div className="relative grid gap-1">
                <span className="text-xs text-slate-600">{ui.savedNameLabel}</span>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  onClick={() => setCampaignNamePickerOpen((v) => !v)}
                >
                  <span className={campaignNameOptions.includes(form.name) ? "truncate text-slate-900" : "truncate text-slate-400"}>
                    {campaignNameOptions.includes(form.name) ? form.name : ui.selectSavedNamePlaceholder}
                  </span>
                  <span className="text-xs text-slate-400" aria-hidden>
                    {campaignNamePickerOpen ? "▲" : "▼"}
                  </span>
                </button>
                {campaignNamePickerOpen ? (
                  <div
                    className="absolute left-0 right-0 top-full z-20 mt-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                    style={{ maxHeight: "34rem" }}
                  >
                    {campaignNameOptions.map((name) => (
                      <div
                        key={name}
                        className="mb-1 last:mb-0 flex min-h-9 items-center gap-2 rounded-md border border-slate-100 bg-slate-50/70 px-2 py-1 hover:border-violet-200 hover:bg-violet-50/80"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm text-slate-800"
                          title={name}
                          onClick={() => {
                            setForm((p) => ({ ...p, name }));
                            setCampaignNamePickerOpen(false);
                            if (deleteCampaignNameUi.phase === "confirm") cancelDeleteCampaignName();
                          }}
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                          onClick={() => {
                            setDeleteCampaignNameConfirmLabel(name);
                            setDeleteCampaignNameUi({ phase: "confirm" });
                            setCampaignNamePickerOpen(false);
                          }}
                        >
                          {ui.confirmDelete}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-700">{ui.taskNameLabel}</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                value={form.name}
                onChange={(e) => {
                  setForm((p) => ({ ...p, name: e.target.value }));
                  if (deleteCampaignNameUi.phase === "confirm") cancelDeleteCampaignName();
                }}
                placeholder={ui.taskNamePlaceholder}
                aria-label={ui.taskNameLabel}
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-violet-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void saveCampaign()}
            >
              {ui.confirmSave}
            </button>
          </div>
          {savedCampaignCode != null || saveCampaignFeedback ? (
            <div className="mt-2 space-y-1">
              {savedCampaignCode != null ? (
                <p className="text-xs text-slate-600">
                  {ui.campaignCodeLabel}
                  <span className="ml-1 font-mono text-sm font-semibold tracking-widest text-slate-900">
                    {savedCampaignCode}
                  </span>
                </p>
              ) : null}
              {saveCampaignFeedback ? (
                <p
                  className={`text-xs ${saveCampaignFeedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {saveCampaignFeedback.text}
                </p>
              ) : null}
            </div>
          ) : null}
          {deleteCampaignNameUi.phase === "confirm" ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
              <p>{ui.confirmDeleteNameMessage(deleteCampaignNameConfirmLabel)}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-rose-300 bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  onClick={() => confirmDeleteCampaignName()}
                >
                  {ui.confirmDelete}
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={cancelDeleteCampaignName}
                >
                  {ui.cancel}
                </button>
              </div>
            </div>
          ) : deleteCampaignNameUi.phase === "ok" || deleteCampaignNameUi.phase === "err" ? (
            <p
              className={`mt-2 text-xs ${
                deleteCampaignNameUi.phase === "ok" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {deleteCampaignNameUi.message}
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title={ui.recipientsSectionTitle} description={ui.recipientsSectionDescription}>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs leading-relaxed text-slate-500">
              {ui.industryCrmDescription}
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="grid min-w-[10rem] flex-1 gap-1">
                <span className="text-xs text-slate-600">{ui.newIndustryTagLabel}</span>
                <input
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  placeholder={ui.industryTagPlaceholder}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  disabled={newGroupBusy}
                />
              </label>
              <button
                type="button"
                disabled={newGroupBusy}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={async () => {
                  const name = newGroupName.trim();
                  if (!name) {
                    showPageFeedback(
                      setIndustryCreateFeedback,
                      industryCreateFeedbackTimerRef,
                      "err",
                      ui.errIndustryTagName
                    );
                    return;
                  }
                  const v = ui.validateContactGroupName(name);
                  if (!v.ok) {
                    showPageFeedback(setIndustryCreateFeedback, industryCreateFeedbackTimerRef, "err", v.message);
                    return;
                  }
                  setNewGroupBusy(true);
                  try {
                    const nextCustom = prependCustomIndustryTag(user?.email, name);
                    setCustomImportIndustryTags(nextCustom);
                    setImportIndustryTag(name);
                    setNewGroupName("");
                    showPageFeedback(
                      setIndustryCreateFeedback,
                      industryCreateFeedbackTimerRef,
                      "ok",
                      ui.industryTagCreated(name)
                    );
                  } catch (e: unknown) {
                    showPageFeedback(
                      setIndustryCreateFeedback,
                      industryCreateFeedbackTimerRef,
                      "err",
                      String((e as Error)?.message ?? e)
                    );
                  } finally {
                    setNewGroupBusy(false);
                  }
                }}
              >
                {newGroupBusy ? ui.creatingIndustryTag : ui.createIndustryTag}
              </button>
            </div>
            {industryCreateFeedback ? (
              <p
                className={`mt-2 text-[11px] ${
                  industryCreateFeedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {industryCreateFeedback.text}
              </p>
            ) : null}

            {industryCatalogLoadError ? (
              <p className="mt-2 text-[11px] text-rose-700">
                行业标签列表加载失败：{industryCatalogLoadError}（请刷新或重新登录后再试）
              </p>
            ) : null}

            <ImportIndustryTagCardPicker
              tags={industryTagSelectOptions}
              selected={importIndustryTag}
              onSelect={setImportIndustryTag}
              onRemove={removeLocalIndustryTagOnly}
              formatLabel={formatIndustryTagLabel}
              disabled={csvImportBusy || newGroupBusy || Boolean(industryTagRemoveBusy)}
            />

            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="text-xs font-semibold text-slate-800">{ui.csvUploadTitle}</div>
                <span className="text-[10px] text-slate-500">{ui.csvBatchHint}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                {ui.csvImportHint}
              </p>
              <CrmContactCsvColumnGuide
                mapping={campaignCsvColumnMapping}
                batchSize={CONTACTS_IMPORT_HTTP_BATCH_SIZE}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id={campaignCsvInputId}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    onCampaignCsvFileSelected(f);
                  }}
                />
                <label
                  htmlFor={campaignCsvInputId}
                  className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  {ui.chooseCsv}
                </label>
                {campaignCsvFilename && campaignCsvRows && campaignCsvParseStats ? (
                  <span className="text-xs text-slate-600">
                    {ui.selectedFilePrefix}{campaignCsvFilename} · 
                    {ui.describeCsvParseOutcome({
                      dataRowCount: campaignCsvParseStats.dataRowCount,
                      validCount: campaignCsvRows.length,
                      skippedEmptyEmail: campaignCsvParseStats.skippedEmpty,
                      skippedInvalidEmail: campaignCsvParseStats.skippedInvalid,
                      skippedDuplicateEmail: campaignCsvParseStats.skippedDuplicate
                    })}
                    {campaignCsvColumnMapping && campaignCsvColumnMapping.ignored.length > 0 ? (
                      <span className="text-amber-800">
                        {" "}
                        {ui.unrecognizedCols(campaignCsvColumnMapping.ignored.length)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">{ui.noFileSelected}</span>
                )}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={csvImportBusy || newGroupBusy || !importIndustryTag.trim()}
                  className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title={!importIndustryTag.trim() ? ui.selectIndustryTagFirst : undefined}
                  onClick={async () => {
                    if (!importIndustryTag.trim()) {
                      showPageFeedback(
                        setCsvSectionFeedback,
                        csvSectionFeedbackTimerRef,
                        "err",
                        ui.errSelectIndustryBeforeCsv
                      );
                      return;
                    }
                    if (!campaignCsvRows?.length) {
                      showPageFeedback(
                        setCsvSectionFeedback,
                        csvSectionFeedbackTimerRef,
                        "err",
                        ui.errCsvNeedsEmail
                      );
                      return;
                    }
                    const targetIndustry = importIndustryTag.trim();
                    const rows = campaignCsvRows.filter((r) => isEmailValidForApiImport(r.email));
                    const apiRejected = campaignCsvRows.length - rows.length;
                    if (rows.length === 0) {
                      showPageFeedback(
                        setCsvSectionFeedback,
                        csvSectionFeedbackTimerRef,
                        "err",
                        ui.errNoValidEmails
                      );
                      return;
                    }
                    const canResume = csvResume && csvResume.industry === targetIndustry && csvResume.total === rows.length;
                    const startIndex = canResume ? csvResume.nextIndex : 0;
                    const remaining = rows.slice(startIndex);
                    const n = rows.length;
                    let serverSkipped = 0;
                    setCsvImportBusy(true);
                    if (startIndex === 0) setCsvImportSkipped(apiRejected);
                    setCsvImportProgress(
                      startIndex > 0
                        ? ui.importProgressStart(startIndex, n) : ui.importProgressStart(0, n)
                    );
                    try {
                      await runContactsImportToIndustry(
                        targetIndustry,
                        remaining,
                        (p) => {
                          setCsvImportProgress(ui.importProgress(p.completed, p.total));
                        },
                        (s) => {
                          serverSkipped = s.skipped;
                          setCsvImportSkipped(apiRejected + serverSkipped);
                        },
                        startIndex,
                        n
                      );
                      setCsvResume(null);
                      setCsvImportProgress(ui.importComplete);
                      const parseStatsSnapshot = campaignCsvParseStats;
                      setCampaignCsvRows(null);
                      setCampaignCsvFilename(null);
                      setCampaignCsvParseStats(null);
                      setCampaignCsvColumnMapping(null);
                      setAudienceRefreshTick((x) => x + 1);
                      const successEmails = Math.max(0, n - serverSkipped);
                      const parseNote = parseStatsSnapshot
                        ? ui.describeCsvParseOutcome({
                            dataRowCount: parseStatsSnapshot.dataRowCount,
                            validCount: n,
                            skippedEmptyEmail: parseStatsSnapshot.skippedEmpty,
                            skippedInvalidEmail: parseStatsSnapshot.skippedInvalid,
                            skippedDuplicateEmail: parseStatsSnapshot.skippedDuplicate
                          })
                        : ui.validEmailsCount(n);
                      showPageFeedback(
                        setCsvSectionFeedback,
                        csvSectionFeedbackTimerRef,
                        "ok",
                        ui.importDoneMessage(targetIndustry, parseNote, successEmails, serverSkipped, apiRejected),
                        10000
                      );
                    } catch (e: unknown) {
                      if (isContactsImportPartialError(e)) {
                        setCsvResume({ industry: targetIndustry, nextIndex: e.nextIndex, total: n });
                        setCsvImportProgress(`${ui.importProgress(e.completed, e.total)}`);
                        showPageFeedback(
                          setCsvSectionFeedback,
                          csvSectionFeedbackTimerRef,
                          "err",
                          ui.importInterrupted(e.completed, e.total),
                          10000
                        );
                      } else {
                        showPageFeedback(
                          setCsvSectionFeedback,
                          csvSectionFeedbackTimerRef,
                          "err",
                          String((e as Error)?.message ?? e)
                        );
                      }
                    } finally {
                      setCsvImportBusy(false);
                      window.setTimeout(() => setCsvImportProgress((prev) => (prev?.includes(ui.progressResumeKeyword) ? prev : null)), 1200);
                    }
                  }}
                >
                  {csvImportBusy ? ui.importing : csvResume ? ui.resumeImport : ui.confirmImportVerify}
                </button>
              </div>
              {csvImportProgress ? <p className="mt-2 text-xs text-slate-600">{csvImportProgress}</p> : null}
              {csvSectionFeedback ? (
                <p
                  className={`mt-2 text-xs ${
                    csvSectionFeedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {csvSectionFeedback.text}
                </p>
              ) : null}
              {csvImportSkipped > 0 ? (
                <p className="mt-1 text-xs text-amber-700">{ui.skippedImportRows(csvImportSkipped)}</p>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 mb-14">
        <SectionCard
          title={ui.progressSectionTitle}
          description={ui.progressSectionDescription}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-slate-700">{ui.activityIdRecent}</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">{ui.activityIdRecentHint}</p>
                </div>
                <button
                  type="button"
                  className="h-8 shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    formalSendBusy ||
                    deleteCampaignIdUi.phase === "busy" ||
                    (deleteCampaignIdUi.phase !== "confirm" && !selectedCampaignId)
                  }
                  onClick={() => {
                    if (deleteCampaignIdUi.phase === "confirm") return;
                    beginDeleteCampaignId();
                  }}
                >
                  {deleteCampaignIdUi.phase === "busy" ? ui.deleting : ui.deleteCampaign}
                </button>
              </div>
              {selectedCampaignId && !selectedCampaignInRecentCards && selectedCampaign ? (
                <p className="rounded-md border border-violet-200 bg-violet-50/80 px-2.5 py-1.5 text-[11px] text-violet-900">
                  {ui.currentSelection}
                  <span className="ml-1 font-mono font-semibold tracking-wider">
                    {campaignSendPickerCodeText(campaignPickerCode(selectedCampaign), selectedCampaign.latest_round_no)}
                  </span>
                  <span className="text-violet-800"> · {selectedCampaign.name}</span>
                  <span className="text-violet-600">{ui.notInRecentSix}</span>
                </p>
              ) : null}
              <RecentFormalSendCampaignCards
                campaigns={campaigns}
                selectedId={selectedCampaignId}
                onSelect={pickFormalSendCampaign}
                disabled={deleteCampaignIdUi.phase === "busy"}
                limit={6}
                locallyFinishedIds={formalLocallyFinishedIds}
              />
              {deleteCampaignIdUi.phase === "confirm" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
                  <p>{ui.confirmDeleteCampaign}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-rose-300 bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700"
                      onClick={() => void confirmDeleteCampaignId()}
                    >
                      {ui.confirmDelete}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => cancelDeleteCampaignId()}
                    >
                      {ui.cancel}
                    </button>
                  </div>
                </div>
              ) : null}
              {deleteCampaignIdUi.phase === "ok" ? (
                <p className="text-[11px] text-emerald-700">{deleteCampaignIdUi.message}</p>
              ) : null}
              {deleteCampaignIdUi.phase === "err" ? (
                <p className="text-[11px] text-rose-700">{deleteCampaignIdUi.message}</p>
              ) : null}
            </div>
            <div className="grid gap-1 sm:max-w-xl">
              <span className="text-xs font-medium text-slate-600">{ui.sendTargetIndustries}</span>
              <div className="flex flex-nowrap items-center gap-2">
                <div className="relative min-w-0 flex-1" ref={formalIndustryPickerRef}>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm outline-none ring-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    onClick={() => setFormalIndustryPickerOpen((o) => !o)}
                    aria-expanded={formalIndustryPickerOpen}
                    disabled={formalSendBusy}
                  >
                    <span className="min-w-0 truncate">{formalIndustryButtonLabel}</span>
                    <span className="shrink-0 text-slate-400">{formalIndustryPickerOpen ? "▲" : "▼"}</span>
                  </button>
                  {formalIndustryPickerOpen ? (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-[calc(2.25rem*15+0.25rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100">
                      {industryTagSelectOptions.map((x) => (
                        <div
                          key={x}
                          className="flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-slate-50"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 pl-1">
                            <input
                              type="checkbox"
                              checked={formalSelectedIndustries.includes(x)}
                              onChange={() => toggleFormalIndustry(x)}
                              disabled={formalSendBusy}
                            />
                            <span className="min-w-0 flex-1">{formatIndustryTagLabel(x)}</span>
                          </label>
                          <IndustryTagListRemoveIconButton
                            tag={x}
                            disabled={formalSendBusy || industryTagRemoveBusy === x}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeFormalIndustryTag(x);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex h-9 min-w-[3.5rem] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1">
                  <span className="text-sm font-semibold tabular-nums leading-none text-slate-900">
                    {formalSelectedIndustries.length === 0
                      ? ""
                      : formalAudienceCount === null
                        ? "…"
                        : formalAudienceCount}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200/90 pt-3">
              <label className="grid min-w-0 flex-1 gap-1 sm:max-w-md">
                <span className="text-xs font-medium text-slate-600">{ui.sendPaceLabel}</span>
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  value={String(formalSendMinIntervalMs <= 0 ? 3000 : formalSendMinIntervalMs)}
                  onChange={(e) => {
                    const ms = Number(e.target.value) || 3000;
                    setFormalSendMinIntervalMs(ms <= 0 ? 3000 : ms);
                  }}
                  disabled={formalSendBusy}
                >
                  <option value="3000">{ui.pace3s}</option>
                  <option value="5000">{ui.pace5s}</option>
                  <option value="10000">{ui.pace10s}</option>
                  <option value="30000">{ui.pace30s}</option>
                </select>
                <span className="text-xs text-slate-500">{formalSendEtaText}</span>
              </label>
            </div>
            <div className="flex flex-col gap-3">
              <div
                className="rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-sky-950"
                role="note"
              >
                <div className="font-semibold text-sky-900">{ui.warmUpTitle}</div>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {ui.warmUpBullets.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="grid items-stretch gap-3">
                <div className="h-full rounded-md border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-700">{ui.sendProgressStats}</span>
                      {selectedMonitorCampaign ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-violet-900">
                          {campaignSendPickerCodeText(
                            campaignPickerCode(selectedMonitorCampaign),
                            selectedMonitorCampaign.latest_round_no
                          )}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{ui.noActivitySelected}</span>
                      )}
                      {monitorCampaignId && !selectedMonitorIsSending && !monitorCompletionNote && selectedCardMonitorMode !== "sent" ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                          {ui.taskNotSending}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-right leading-snug text-slate-600">
                      {selectedMonitorIsSending ? (
                        <>
                          {ui.monitorTotals(monitorStatAttempted, monitorStatSent, monitorStatFailed)}
                          <span className="block text-[10px] text-slate-500">
                            {ui.monitorRefreshEvery(formalPollIntervalMs / 1000)}
                          </span>
                        </>
                      ) : monitorShowsCompletionStats ? (
                        <>{ui.monitorTotals(monitorStatAttempted, monitorStatSent, monitorStatFailed)}</>
                      ) : monitorBlockedByOtherSend && activeSendingCampaign ? (
                        ui.sendBlockedOtherCampaignInFlight(
                          campaignSendPickerCodeText(
                            campaignPickerCode(activeSendingCampaign),
                            activeSendingCampaign.latest_round_no
                          )
                        )
                      ) : selectedCampaignSelectable ? (
                        ui.readyToSendHint
                      ) : monitorCampaignId ? (
                        ui.monitorSummaryAfterSend
                      ) : null}
                    </span>
                  </div>
                  {monitorBlockedByOtherSend && activeSendingCampaign ? (
                    <div
                      className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950"
                      role="status"
                    >
                      {ui.sendBlockedOtherCampaignInFlight(
                        campaignSendPickerCodeText(
                          campaignPickerCode(activeSendingCampaign),
                          activeSendingCampaign.latest_round_no
                        )
                      )}
                    </div>
                  ) : null}
                  {monitorCampaignId || selectedMonitorIsSending || monitorCompletionNote || selectedCardMonitorMode === "sent" ? (
                    <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-500">{ui.totalLabel}</div>
                        <div className="tabular-nums text-base font-semibold text-slate-900">{monitorStatAttempted}</div>
                      </div>
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                        <div className="text-emerald-800">{ui.successLabel}</div>
                        <div className="tabular-nums text-base font-semibold text-emerald-900">{monitorStatSent}</div>
                      </div>
                      <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5">
                        <div className="text-rose-800">{ui.failedLabel}</div>
                        <div className="tabular-nums text-base font-semibold text-rose-900">{monitorStatFailed}</div>
                      </div>
                    </div>
                  ) : null}
                  {selectedMonitorIsSending ? (
                    <CampaignSendLiveProgress
                      planned={formalPlannedRecipientRef.current}
                      remainCount={formalSendRemainCount}
                      remainSec={formalSendRemainSec}
                      progressPct={formalSendProgress}
                      isSending={Boolean(selectedMonitorIsSending)}
                      avgSecPerMail={formalSendAvgSecPerMail}
                    />
                  ) : null}
                  {monitorCompletionNote && !selectedMonitorIsSending ? (
                    <div className="mt-2 text-xs text-slate-500">{ui.taskFinishedSummaryBelow}</div>
                  ) : null}
                  {monitorCompletionReport && !selectedMonitorIsSending ? (
                    <div
                      className={`mt-2 rounded-md border px-3 py-2 text-xs leading-relaxed ${
                        monitorCompletionReport.kind === "done"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : monitorCompletionReport.kind === "stop"
                            ? "border-rose-200 bg-rose-50 text-rose-950"
                            : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                      role="status"
                    >
                      {childUi.formatFormalSendCompletionLines(monitorCompletionReport).map((line, idx) => (
                        <div
                          key={idx}
                          className={idx === 0 ? "font-semibold" : "mt-0.5 tabular-nums text-emerald-900/90"}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {formalSendActionUi.phase === "confirm" ? (
                    <div className="mt-3 space-y-1.5 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
                      <p>
                        {ui.confirmStartSend}{formalSendConfirmAudienceHint}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => cancelFormalSendConfirm()}
                        >
                          {ui.cancel}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {formalSendActionUi.phase === "ok" ? (
                    <p className="mt-2 text-[11px] text-emerald-700">{formalSendActionUi.message}</p>
                  ) : null}
                  {formalSendActionUi.phase === "err" ? (
                    <p className="mt-2 text-[11px] text-rose-700">{formalSendActionUi.message}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <Link
                      to="/email/campaigns/list"
                      className="inline-flex items-center gap-1 rounded-md border border-violet-300/90 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 shadow-sm transition hover:border-violet-400 hover:bg-violet-100/90"
                    >
                      {ui.viewStatsDetailed}
                      <span aria-hidden>→</span>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {showMonitorSendControls ? (
                        <>
                      <button
                        type="button"
                        disabled={!formalSendUiActive || !selectedCampaignId || formalControlBusy != null}
                        className="h-9 min-w-[5rem] rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={async () => {
                          const id = Number(selectedCampaignId);
                          if (!id || Number.isNaN(id)) return;
                          setFormalControlBusy("stop");
                          formalPendingControlActionRef.current = "stop";
                          showFormalSendActionFeedback(
                            {
                              phase: "ok",
                              message: ui.stopSendSubmitted
                            },
                            6000
                          );
                          try {
                            await apiJson(`/api/email/campaigns/${id}/control`, {
                              method: "POST",
                              body: JSON.stringify({ action: "stop" })
                            });
                            if (formalSendLivePollRef.current) {
                              clearInterval(formalSendLivePollRef.current);
                              formalSendLivePollRef.current = null;
                            }
                            formalPullLiveOnceRef.current = null;
                            try {
                              window.sessionStorage.removeItem(userScopedKeys.formalSendWatchCampaignId);
                            } catch {
                              // ignore
                            }
                            setFormalSendBusy(false);
                            setFormalSendProgress(0);
                            formalSendLockRef.current = false;
                            formalSendSourceRef.current = null;
                            formalSendStartedAtRef.current = null;
                            setFormalSendAvgSecPerMail(null);
                            setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: "stopped" } : c)));
                            await refreshCampaigns().catch(() => undefined);
                          } catch (e: unknown) {
                            const msg = String((e as Error)?.message ?? e);
                            showFormalSendActionFeedback({ phase: "err", message: ui.stopFailed(msg) }, 8000);
                          } finally {
                            setFormalControlBusy(null);
                          }
                        }}
                      >
                        {formalControlBusy === "stop" ? ui.stopping : ui.stopSend}
                      </button>
                      <button
                        type="button"
                        disabled={formalSendUiActive}
                        className="h-9 min-w-[6rem] rounded-md bg-violet-600 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          if (formalSendUiActive) return;
                          if (formalSendActionUi.phase === "confirm") {
                            void executeFormalSend();
                            return;
                          }
                          beginFormalSend();
                        }}
                      >
                        {formalSendUiActive
                          ? ui.sendBusy
                          : formalSendActionUi.phase === "confirm"
                            ? ui.confirmSend
                            : ui.confirmSend}
                      </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
