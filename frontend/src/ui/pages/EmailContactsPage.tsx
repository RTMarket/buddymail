import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";
import {
  CONTACTS_IMPORT_HTTP_BATCH_SIZE,
  isContactsImportPartialError,
  postContactsImportBatches,
  type ContactsImportProgress
} from "../../lib/postContactsImportBatches";
import {
  isEmailValidForApiImport,
  parseImportContactsFromCsvText,
  type ContactEmailStatus,
  type CsvColumnMappingSnapshot,
  type ImportContactPayload
} from "../../lib/csvContactsImport";
import {
  convertExcelListFileToCsv,
  downloadCsvTextFile,
  industryTagFromImportFileName
} from "../../lib/excelListToCsv";
import { CrmContactCsvColumnGuide } from "../components/email/CrmContactCsvColumnGuide";
import { ImportIndustryTagCardPicker } from "../components/email/ImportIndustryTagCardPicker";
import {
  applyCrmListDedup,
  CRM_DEDUP_INITIAL,
  tokenizeIndustryNeedles,
  type CrmDedupRuleFlags,
  type CrmDedupRow
} from "../../lib/crmListDedup";
import {
  formatIndustryTagWithCountDetail,
  mergeIndustryTagOptions,
  type IndustryCountRow
} from "../../lib/emailIndustryCounts";
import { loadIndustryTagOptionsFromServer, type IndustryTagOptionsLoadResult } from "../../lib/loadIndustryTagOptions";
import { readIndustryCatalogCache } from "../../lib/industryTagCatalogCache";
import {
  loadScopedIndustryTagLists,
  prependCustomIndustryTag,
  subscribeIndustryTagsChanged
} from "../../lib/emailIndustryTagStorage";
import { removeIndustryTagAndCrmContacts } from "../../lib/emailIndustryTagRemove";
import { subscribeEmailContactsChanged } from "../../lib/emailCrmContactsSync";
import { useAuth, getCachedAuthUserEmail } from "../../auth/AuthContext";
import { usePageFeedback } from "../../lib/inlineFeedback";
import { PageFeedbackLine } from "../components/InlineFeedbackPanels";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  buildCrmListColumns,
  getEmailContactsPageStrings,
  type CrmListColumnDef,
  type EmailContactsPageStrings
} from "../../i18n/emailContactsPageI18n";

type ContactGroupRow = { id: number; name: string };
type CrmImportContactBody = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  country?: string;
  industry?: string;
  phone?: string;
  fax?: string;
  address?: string;
  jobTitle?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  emailStatus?: string;
  groupIds?: number[];
};

/** CSV 解析后的暂存行（稳定 _sid 用于勾选，与 Leads 列表 id 作用类似） */
type CsvStagingRow = ImportContactPayload & { _sid: number };

type DedupAugmented = CrmDedupRow & { _sid: number; staging: CsvStagingRow };

/** 表格每页条数（与 Leads 搜索一致） */
const LIST_PAGE_SIZE = 50;

const EXPORT_QUANTITY_OPTIONS = [5, 50, 100, 200, 500] as const;

/** 「加入分组」外框高度与原先一致；内部约 6 行高度，超出纵向滚动 */
const GROUP_JOIN_BOX_MAX_HEIGHT = "calc(8 * 2.5rem + 1rem)";
const GROUP_JOIN_ROW_MIN_HEIGHT = "calc((8 * 2.5rem) / 6)";

/** 去重下方联系人列表列 */
type CrmListColKey =
  | "groupNames"
  | "industry"
  | "website"
  | "company"
  | "contact"
  | "jobTitle"
  | "mainBusiness"
  | "phone"
  | "fax"
  | "email"
  | "address"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "emailStatus";

type CrmEmailStatusFilter = "all" | "valid" | "invalid" | "risky" | "none";

function contactDisplayFromImportRow(s: ImportContactPayload): string {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
}

function effectiveEmailStatus(row: ImportContactPayload): ContactEmailStatus {
  if (!row.email?.trim()) return "none";
  const st = row.emailStatus;
  if (st === "valid" || st === "invalid" || st === "risky" || st === "unverified") return st;
  return "unverified";
}

function crmEmailStatusLabel(s: ContactEmailStatus, ui: EmailContactsPageStrings): string {
  if (s === "valid") return ui.emailStatusValid;
  if (s === "invalid") return ui.emailStatusInvalid;
  if (s === "risky" || s === "unverified") return ui.emailStatusRisky;
  return "";
}

function rowMatchesCrmEmailStatusFilter(row: ImportContactPayload, f: CrmEmailStatusFilter): boolean {
  if (f === "all") return true;
  if (f === "none") return !row.email?.trim();
  if (!row.email?.trim()) return false;
  const st = effectiveEmailStatus(row);
  if (f === "valid") return st === "valid";
  if (f === "invalid") return st === "invalid";
  if (f === "risky") return st === "risky" || st === "unverified";
  return true;
}

function emailStatusToSelectValue(st: ContactEmailStatus): "valid" | "invalid" | "risky" {
  if (st === "valid") return "valid";
  if (st === "invalid") return "invalid";
  return "risky";
}

function stagingCell(s: CsvStagingRow, key: CrmListColKey, ui: EmailContactsPageStrings): string {
  switch (key) {
    case "groupNames":
      return s.groupNames ?? "";
    case "industry":
      return s.industry ?? "";
    case "website":
      return s.website ?? "";
    case "company":
      return s.company ?? "";
    case "contact":
      return contactDisplayFromImportRow(s);
    case "jobTitle":
      return s.jobTitle ?? "";
    case "mainBusiness":
      return s.mainBusiness ?? "";
    case "phone":
      return s.phone ?? "";
    case "fax":
      return s.fax ?? "";
    case "email":
      return (s.email ?? "").trim();
    case "address":
      return s.address ?? "";
    case "linkedin":
      return s.linkedin ?? "";
    case "instagram":
      return s.instagram ?? "";
    case "facebook":
      return s.facebook ?? "";
    case "emailStatus":
      return crmEmailStatusLabel(effectiveEmailStatus(s), ui);
    default:
      return "";
  }
}

function SocialCell({ url, openLabel }: { url: string | undefined; openLabel: string }) {
  if (!url?.trim()) return <span className="text-slate-400">—</span>;
  return (
    <a className="text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer">
      {openLabel}
    </a>
  );
}

function renderCrmListCell(
  s: CsvStagingRow,
  col: CrmListColKey,
  ui: EmailContactsPageStrings,
  opts: {
    variant: "preview" | "list";
    hasRealCsvImport: boolean;
    onPatchContact: (sid: number, patch: Partial<ImportContactPayload>) => void;
  }
): React.ReactNode {
  const { variant, hasRealCsvImport, onPatchContact } = opts;
  switch (col) {
    case "groupNames":
      return <span>{(s.groupNames ?? "").trim() || "—"}</span>;
    case "industry":
      return <span className="whitespace-nowrap">{(s.industry ?? "").trim() || "—"}</span>;
    case "website": {
      const w = s.website?.trim();
      if (!w) return "—";
      const href = /^https?:\/\//i.test(w) ? w : `https://${w}`;
      return (
        <a className="break-all text-blue-600 hover:underline" href={href} target="_blank" rel="noreferrer">
          {w}
        </a>
      );
    }
    case "company":
      return <span className="font-medium text-slate-900">{(s.company ?? "").trim() || "—"}</span>;
    case "contact": {
      const t = contactDisplayFromImportRow(s);
      return t ? <span className="whitespace-nowrap text-slate-800">{t}</span> : <span className="text-slate-400">—</span>;
    }
    case "jobTitle":
      return (s.jobTitle ?? "").trim() ? (
        <span className="whitespace-nowrap text-slate-800">{s.jobTitle}</span>
      ) : (
        "—"
      );
    case "mainBusiness": {
      const t = (s.mainBusiness ?? "").trim();
      if (!t) return "—";
      return <span className="max-w-[280px] whitespace-pre-wrap break-words text-slate-800">{t}</span>;
    }
    case "phone":
      return <span className="whitespace-nowrap">{(s.phone ?? "").trim() || "—"}</span>;
    case "fax":
      return <span className="whitespace-nowrap">{(s.fax ?? "").trim() || "—"}</span>;
    case "email":
      return <span className="max-w-[180px] break-all">{(s.email ?? "").trim() || "—"}</span>;
    case "address":
      return <span>{(s.address ?? "").trim() || "—"}</span>;
    case "linkedin":
      return <SocialCell url={s.linkedin} openLabel={ui.openLink} />;
    case "instagram":
      return <SocialCell url={s.instagram} openLabel={ui.openLink} />;
    case "facebook":
      return <SocialCell url={s.facebook} openLabel={ui.openLink} />;
    case "emailStatus": {
      const hasEmail = Boolean(s.email?.trim());
      const st = effectiveEmailStatus(s);
      const label = crmEmailStatusLabel(st, ui);
      if (!hasEmail) return <span className="text-slate-400">—</span>;
      if (variant === "preview" || !hasRealCsvImport) {
        const tone =
          st === "valid" ? "text-emerald-700" : st === "invalid" ? "text-rose-700" : "text-amber-800";
        return (
          <span className={`text-xs font-medium ${tone}`} title={label}>
            {label || "—"}
          </span>
        );
      }
      const sel = emailStatusToSelectValue(st);
      return (
        <select
          className="max-w-full cursor-pointer rounded border border-violet-200 bg-white py-0.5 pl-1 pr-1 text-[11px] leading-tight text-slate-800 outline-none focus:border-violet-500"
          value={sel}
          aria-label={ui.colEmailStatus}
          title={ui.colEmailStatus}
          onChange={(e) => {
            const v = e.target.value as "valid" | "invalid" | "risky";
            const next: ContactEmailStatus =
              v === "valid" ? "valid" : v === "invalid" ? "invalid" : "risky";
            onPatchContact(s._sid, { emailStatus: next });
          }}
        >
          <option value="valid">{ui.emailStatusValidShort}</option>
          <option value="invalid">{ui.emailStatusInvalidShort}</option>
          <option value="risky">{ui.emailStatusRiskyShort}</option>
        </select>
      );
    }
    default:
      return "—";
  }
}

function IconUpload(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDownload(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** 与后端 contactGroups.validateContactGroupName 一致，避免无效请求 */
function validateContactGroupNameClient(
  name: string,
  ui: EmailContactsPageStrings
): { ok: true } | { ok: false; message: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: ui.groupNameEmpty };
  const hasCjk =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u9fff\uf900-\ufaff]/.test(trimmed);
  if (hasCjk) {
    if ([...trimmed].length > 30) return { ok: false, message: ui.groupNameCjkMax };
  } else {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 120) return { ok: false, message: ui.groupNameWordsMax };
  }
  return { ok: true };
}

function downloadStagingCsv(filename: string, rows: CsvStagingRow[], columns: CrmListColumnDef[], ui: EmailContactsPageStrings) {
  const headers = columns.map((c) => c.title);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((r) => columns.map((c) => esc(stagingCell(r, c.key, ui))).join(","))
  ];
  const bom = "\ufeff";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 与 Leads「移至CRM数据库」一致：按空格拆成 first / last 写入后端 */
function splitContactNameForStorage(full: string): { firstName?: string; lastName?: string } {
  const t = full.trim();
  if (!t) return {};
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function contactPayloadForImportApi(r: ImportContactPayload, targetGroupId: number) {
  const st = effectiveEmailStatus(r);
  return {
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    country: r.country,
    industry: r.industry,
    phone: r.phone,
    fax: r.fax,
    address: r.address,
    jobTitle: r.jobTitle,
    website: r.website,
    mainBusiness: r.mainBusiness,
    linkedin: r.linkedin,
    instagram: r.instagram,
    facebook: r.facebook,
    emailStatus: st === "none" ? undefined : st,
    groupIds: [targetGroupId]
  };
}

function contactPayloadForIndustryImport(r: ImportContactPayload, industryTag: string) {
  const st = effectiveEmailStatus(r);
  const normalizedIndustry = industryTag.trim();
  return {
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    country: r.country,
    industry: normalizedIndustry || r.industry,
    phone: r.phone,
    fax: r.fax,
    address: r.address,
    jobTitle: r.jobTitle,
    website: r.website,
    mainBusiness: r.mainBusiness,
    linkedin: r.linkedin,
    instagram: r.instagram,
    facebook: r.facebook,
    emailStatus: st === "none" ? undefined : st
  };
}

function importPayloadFromQuickForm(
  form: {
    email: string;
    contactName: string;
    company: string;
    country: string;
    industry: string;
    phone: string;
    fax: string;
    address: string;
    jobTitle: string;
    website: string;
    mainBusiness: string;
    groupIds: number[];
  },
  groups: ContactGroupRow[]
): ImportContactPayload {
  const email = form.email.trim();
  const groupNames =
    form.groupIds.length === 0
      ? undefined
      : form.groupIds
          .map((id) => groups.find((g) => g.id === id)?.name)
          .filter(Boolean)
          .join("、");
  return {
    email,
    ...splitContactNameForStorage(form.contactName),
    company: form.company || undefined,
    country: form.country || undefined,
    industry: form.industry || undefined,
    phone: form.phone.trim() || undefined,
    fax: form.fax.trim() || undefined,
    address: form.address.trim() || undefined,
    jobTitle: form.jobTitle.trim() || undefined,
    website: form.website.trim() || undefined,
    mainBusiness: form.mainBusiness.trim() || undefined,
    groupNames: groupNames || undefined,
    emailStatus: email ? "unverified" : "none"
  };
}

export function EmailContactsPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailContactsPageStrings(locale), [locale]);
  const crmListColumns = useMemo(() => buildCrmListColumns(ui), [ui]);

  const { user } = useAuth();
  const navigate = useNavigate();
  const bulkFileInputId = React.useId();
  const excelFileInputId = React.useId();
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);

  const [form, setForm] = useState({
    email: "",
    contactName: "",
    company: "",
    country: "",
    industry: "",
    phone: "",
    fax: "",
    address: "",
    jobTitle: "",
    website: "",
    mainBusiness: "",
    groupIds: [] as number[]
  });

  const pageMsg = usePageFeedback();
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  /** 仅在为 true 时根据服务端列表修剪 form.groupIds，避免「列表尚未拉取成功时 groups=[]」误清空已勾选 */
  const [groupsSyncedOnce, setGroupsSyncedOnce] = useState(false);
  const groupsFetchSeq = useRef(0);

  const [dedupPanelOpen, setDedupPanelOpen] = useState(false);
  const [dedupDraft, setDedupDraft] = useState<CrmDedupRuleFlags>(() => ({ ...CRM_DEDUP_INITIAL }));
  const [dedupEnabled, setDedupEnabled] = useState(false);
  const [dedupRules, setDedupRules] = useState<CrmDedupRuleFlags>(() => ({ ...CRM_DEDUP_INITIAL }));
  const [bulkPreview, setBulkPreview] = useState<{
    contacts: ImportContactPayload[];
    fileName: string;
    skippedInvalidEmail: number;
    skippedDuplicateEmail: number;
  } | null>(null);
  const [bulkCsvColumnMapping, setBulkCsvColumnMapping] = useState<CsvColumnMappingSnapshot | null>(null);
  const [bulkCsvParseStats, setBulkCsvParseStats] = useState<{
    dataRowCount: number;
    skippedEmpty: number;
    skippedInvalid: number;
    skippedDuplicate: number;
  } | null>(null);
  const [importIndustryTag, setImportIndustryTag] = useState("");
  const [bulkCsvImportBusy, setBulkCsvImportBusy] = useState(false);
  const [bulkCsvImportProgress, setBulkCsvImportProgress] = useState<string | null>(null);
  const [bulkCsvImportSkipped, setBulkCsvImportSkipped] = useState(0);
  const [bulkCsvResume, setBulkCsvResume] = useState<{
    industry: string;
    nextIndex: number;
    total: number;
  } | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelConverting, setExcelConverting] = useState(false);
  const [convertedCsvDownload, setConvertedCsvDownload] = useState<{
    csvText: string;
    csvFileName: string;
  } | null>(null);

  const [listPage, setListPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [exportQuantity, setExportQuantity] = useState<(typeof EXPORT_QUANTITY_OPTIONS)[number]>(50);
  const [emailStatusFilter, setEmailStatusFilter] = useState<CrmEmailStatusFilter>("all");

  const [crmOpen, setCrmOpen] = useState(false);
  /** true：来自「快速新增」表单；false：来自下方导入列表勾选 */
  const [crmTransferFromForm, setCrmTransferFromForm] = useState(false);
  const [crmGroupMode, setCrmGroupMode] = useState<"existing" | "new">("existing");
  const [crmGroupId, setCrmGroupId] = useState<number | "">("");
  const [crmNewName, setCrmNewName] = useState("");
  const [crmBusy, setCrmBusy] = useState(false);
  const [crmImportProgress, setCrmImportProgress] = useState<string | null>(null);
  const [crmImportSkipped, setCrmImportSkipped] = useState(0);
  const [crmResume, setCrmResume] = useState<{
    contacts: CrmImportContactBody[];
    nextIndex: number;
    total: number;
    targetGroupId: number;
  } | null>(null);
  const [customImportIndustryTags, setCustomImportIndustryTags] = useState<string[]>([]);
  const [hiddenIndustryTags, setHiddenIndustryTags] = useState<string[]>([]);
  const [mergedIndustryTagOptions, setMergedIndustryTagOptions] = useState<string[]>([]);
  const [industryCountResolved, setIndustryCountResolved] = useState<Record<string, IndustryCountRow>>({});
  const [industryCountsReady, setIndustryCountsReady] = useState(false);
  const [industryCatalogLoadError, setIndustryCatalogLoadError] = useState<string | null>(null);
  const [audienceRefreshTick, setAudienceRefreshTick] = useState(0);
  const lastCrmIndustryRowsRef = useRef<IndustryCountRow[]>([]);
  const [newIndustryTagName, setNewIndustryTagName] = useState("");
  const [industryTagCreateBusy, setIndustryTagCreateBusy] = useState(false);
  const [industryTagRemoveBusy, setIndustryTagRemoveBusy] = useState<string | null>(null);

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

  const loadContactGroups = useCallback(async () => {
    const seq = ++groupsFetchSeq.current;
    setGroupsLoading(true);
    try {
      const res = await apiJson<{ ok: boolean; items: ContactGroupRow[] }>("/api/email/contact-groups");
      if (seq !== groupsFetchSeq.current) return;
      const items = Array.isArray(res.items) ? res.items : [];
      setGroups(items);
      setGroupsError(null);
      setGroupsSyncedOnce(true);
    } catch (e: unknown) {
      if (seq !== groupsFetchSeq.current) return;
      console.error(e);
      setGroupsError(String((e as Error)?.message ?? e));
    } finally {
      if (seq === groupsFetchSeq.current) setGroupsLoading(false);
    }
  }, []);

  const hasRealCsvImport = Boolean(bulkPreview);

  useEffect(() => {
    return subscribeEmailContactsChanged(() => {
      setAudienceRefreshTick((t) => t + 1);
    });
  }, []);

  const buildCustomIndustryTags = useCallback(() => {
    return Array.from(
      new Set(
        [
          ...customImportIndustryTags.map((x) => String(x ?? "").trim()).filter(Boolean),
          importIndustryTag.trim(),
          form.industry.trim()
        ].filter(Boolean)
      )
    );
  }, [customImportIndustryTags, importIndustryTag, form.industry]);

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

  const industryTagSelectOptions = mergedIndustryTagOptions;

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

  const removeLocalIndustryTagOnly = useCallback(
    async (tag: string) => {
      const t = tag.trim();
      if (!t || industryTagRemoveBusy) return;
      setIndustryTagRemoveBusy(t);
      try {
        const { deleted } = await removeIndustryTagAndCrmContacts(user?.email, t);
        setImportIndustryTag((cur) => (cur === t ? "" : cur));
        setForm((p) => (p.industry === t ? { ...p, industry: "" } : p));
        setIndustryCountResolved((prev) => {
          const next = { ...prev };
          delete next[t];
          return next;
        });
        setAudienceRefreshTick((n) => n + 1);
        pageMsg.showOk(ui.industryTagRemoved(t, deleted > 0 ? deleted : undefined));
      } catch (e: unknown) {
        pageMsg.showErr(String((e as Error)?.message ?? e));
      } finally {
        setIndustryTagRemoveBusy(null);
      }
    },
    [industryTagRemoveBusy, user?.email]
  );

  async function createIndustryTag() {
    const name = newIndustryTagName.trim();
    if (!name) {
      pageMsg.showErr(ui.errIndustryTagName);
      return;
    }
    const v = validateContactGroupNameClient(name, ui);
    if (!v.ok) {
      pageMsg.showErr(v.message);
      return;
    }
    setIndustryTagCreateBusy(true);
    try {
      const nextCustom = prependCustomIndustryTag(user?.email, name);
      setCustomImportIndustryTags(nextCustom);
      setImportIndustryTag(name);
      setForm((p) => ({ ...p, industry: name }));
      setNewIndustryTagName("");
      pageMsg.showOk(ui.industryTagCreated(name));
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    } finally {
      setIndustryTagCreateBusy(false);
    }
  }

  const patchStagingContact = useCallback((sid: number, patch: Partial<ImportContactPayload>) => {
    setBulkPreview((prev) => {
      if (!prev || sid < 0 || sid >= prev.contacts.length) return prev;
      const contacts = prev.contacts.map((c, i) => (i === sid ? { ...c, ...patch } : c));
      return { ...prev, contacts };
    });
  }, []);

  const stagingRows: CsvStagingRow[] = useMemo(() => {
    if (bulkPreview?.contacts.length) {
      return bulkPreview.contacts.map((c, i) => ({ ...c, _sid: i }));
    }
    return [];
  }, [bulkPreview]);

  const forDedup: DedupAugmented[] = useMemo(
    () =>
      stagingRows.map((r) => ({
        _sid: r._sid,
        email: r.email,
        company: r.company ?? null,
        first_name: r.firstName ?? null,
        last_name: r.lastName ?? null,
        industry: r.industry ?? null,
        job_title: r.jobTitle ?? null,
        staging: r
      })),
    [stagingRows]
  );

  /** 先按表头「邮箱状态」筛选，再应用去重（与 Leads 搜索顺序一致） */
  const emailFilteredForDedup: DedupAugmented[] = useMemo(
    () => forDedup.filter((x) => rowMatchesCrmEmailStatusFilter(x.staging, emailStatusFilter)),
    [forDedup, emailStatusFilter]
  );

  const dedupedAugmented: DedupAugmented[] = useMemo(() => {
    if (!dedupEnabled) return emailFilteredForDedup;
    return applyCrmListDedup(emailFilteredForDedup, dedupRules, { keywords: "", industryHint: "" });
  }, [emailFilteredForDedup, dedupEnabled, dedupRules]);

  const listStats = useMemo(() => {
    const total = dedupedAugmented.length;
    const countEmailBuckets = dedupEnabled && dedupRules.emailValidityVerify;
    let valid = 0;
    let invalid = 0;
    let risky = 0;
    if (countEmailBuckets) {
      for (const x of dedupedAugmented) {
        const row = x.staging;
        if (!row.email?.trim()) continue;
        const st = effectiveEmailStatus(row);
        if (st === "valid") valid += 1;
        else if (st === "invalid") invalid += 1;
        else if (st === "risky" || st === "unverified") risky += 1;
      }
    }
    return {
      total,
      valid: countEmailBuckets ? valid : null,
      invalid: countEmailBuckets ? invalid : null,
      risky: countEmailBuckets ? risky : null
    };
  }, [dedupedAugmented, dedupEnabled, dedupRules.emailValidityVerify]);

  const resetDedupAll = useCallback(() => {
    setDedupEnabled(false);
    setDedupRules({ ...CRM_DEDUP_INITIAL });
    setDedupDraft({ ...CRM_DEDUP_INITIAL });
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(dedupedAugmented.length / LIST_PAGE_SIZE)),
    [dedupedAugmented.length]
  );

  const paginatedRows = useMemo(() => {
    const start = (listPage - 1) * LIST_PAGE_SIZE;
    return dedupedAugmented.slice(start, start + LIST_PAGE_SIZE);
  }, [dedupedAugmented, listPage]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  useEffect(() => {
    if (emailStatusFilter === "none") setEmailStatusFilter("all");
  }, [emailStatusFilter]);

  useEffect(() => {
    setListPage(1);
    setSelected({});
  }, [bulkPreview, dedupEnabled, dedupRules, emailStatusFilter]);

  const listIsDemoOnly = !hasRealCsvImport;

  const selectedRows = useMemo(
    () => dedupedAugmented.filter((x) => selected[String(x._sid)]).map((x) => x.staging),
    [dedupedAugmented, selected]
  );
  const selectedCount = selectedRows.length;

  const pageRowIds = useMemo(() => paginatedRows.map((x) => String(x._sid)), [paginatedRows]);
  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selected[id]);
  const somePageSelected =
    pageRowIds.length > 0 && pageRowIds.some((id) => selected[id]) && !allPageSelected;

  const allFilteredSelected =
    dedupedAugmented.length > 0 && dedupedAugmented.every((r) => selected[String(r._sid)]);

  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = somePageSelected;
  }, [somePageSelected, allPageSelected, pageRowIds.length]);

  const toggleRow = useCallback((sid: number) => {
    const k = String(sid);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = true;
      return next;
    });
  }, []);

  const toggleAllPage = useCallback(() => {
    if (pageRowIds.length === 0) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (pageRowIds.length > 0 && pageRowIds.every((id) => prev[id])) {
        for (const id of pageRowIds) delete next[id];
      } else {
        for (const id of pageRowIds) next[id] = true;
      }
      return next;
    });
  }, [pageRowIds]);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelected((prev) => {
      if (dedupedAugmented.length === 0) return prev;
      const allOn = dedupedAugmented.every((r) => prev[String(r._sid)]);
      const next = { ...prev };
      if (allOn) {
        for (const r of dedupedAugmented) delete next[String(r._sid)];
      } else {
        for (const r of dedupedAugmented) next[String(r._sid)] = true;
      }
      return next;
    });
  }, [dedupedAugmented]);

  useEffect(() => {
    void loadContactGroups();
  }, [loadContactGroups]);

  /** 后端晚于前端启动时自动重试拉取列表 */
  useEffect(() => {
    if (!groupsError) return;
    let attempts = 0;
    const maxAttempts = 24;
    const id = setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(id);
        return;
      }
      void loadContactGroups();
    }, 3000);
    return () => clearInterval(id);
  }, [groupsError, loadContactGroups]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadContactGroups();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadContactGroups]);

  /** 仅在已成功同步过服务端列表后，按当前 groups 修剪并单选化（最多保留一个有效 id） */
  useEffect(() => {
    if (!groupsSyncedOnce) return;
    setForm((p) => {
      const valid = p.groupIds.filter((id) => groups.some((g) => g.id === id));
      const next = valid.length === 0 ? [] : [valid[0]!];
      if (next.length === p.groupIds.length && next.every((id, i) => id === p.groupIds[i])) return p;
      return { ...p, groupIds: next };
    });
  }, [groups, groupsSyncedOnce]);

  /** 加入分组为单选：0 或 1 个 id（仅 CSV 写入 CRM 时分组用，与行业标签无关） */
  const setFormJoinGroupId = useCallback((id: number | null) => {
    setForm((p) => ({ ...p, groupIds: id == null ? [] : [id] }));
  }, []);

  function rowsToExport(): CsvStagingRow[] {
    return selectedRows.length ? selectedRows : dedupedAugmented.map((x) => x.staging);
  }

  function doExport() {
    const base = rowsToExport();
    if (!base.length) {
      pageMsg.showErr(ui.errNoExportData);
      return;
    }
    const rows = base.slice(0, exportQuantity);
    const tag = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadStagingCsv(`crm-import-${tag}.csv`, rows, crmListColumns, ui);
  }

  async function openCrmModalFromQuickForm() {
    if (!form.email.trim()) {
      pageMsg.showErr(ui.errEmailRequired);
      return;
    }
    setCrmTransferFromForm(true);
    setCrmOpen(true);
    setCrmImportSkipped(0);
    setCrmResume(null);
    setCrmGroupMode("existing");
    setCrmNewName("");
    try {
      const res = await apiJson<{ ok: boolean; items: ContactGroupRow[] }>("/api/email/contact-groups");
      const list = Array.isArray(res.items) ? res.items : [];
      setGroups(list);
      setGroupsError(null);
      setGroupsSyncedOnce(true);
      const first = list[0]?.id;
      setCrmGroupId(first != null ? first : "");
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
      setCrmOpen(false);
      setCrmTransferFromForm(false);
    }
  }

  async function openCrmModal() {
    setCrmTransferFromForm(false);
    if (listIsDemoOnly) {
      pageMsg.showErr(ui.errImportCsvFirst);
      return;
    }
    if (!selectedRows.length) {
      pageMsg.showErr(ui.errSelectForCrm);
      return;
    }
    setCrmOpen(true);
    setCrmImportSkipped(0);
    setCrmResume(null);
    setCrmGroupMode("existing");
    setCrmNewName("");
    try {
      const res = await apiJson<{ ok: boolean; items: ContactGroupRow[] }>("/api/email/contact-groups");
      const list = Array.isArray(res.items) ? res.items : [];
      setGroups(list);
      setGroupsError(null);
      setGroupsSyncedOnce(true);
      const first = list[0]?.id;
      setCrmGroupId(first != null ? first : "");
    } catch (e: unknown) {
      pageMsg.showErr(String((e as Error)?.message ?? e));
    }
  }

  async function submitCrmTransfer() {
    const fromForm = crmTransferFromForm;
    if (!fromForm && !bulkPreview) {
      pageMsg.showErr(ui.errImportCsvFirst);
      return;
    }
    if (!fromForm && !selectedRows.length) {
      pageMsg.showErr(ui.errSelectCrmRows);
      return;
    }

    setCrmBusy(true);
    try {
      let targetGroupId = crmGroupMode === "existing" ? Number(crmGroupId) : NaN;
      if (crmGroupMode === "new") {
        const name = crmNewName.trim();
        if (!name) {
          pageMsg.showErr(ui.errNewGroupName);
          return;
        }
        const created = await apiJson<{ ok: boolean; id: number }>("/api/email/contact-groups", {
          method: "POST",
          body: JSON.stringify({ name })
        });
        targetGroupId = Number(created.id);
        const gid = targetGroupId;
        const gname = name;
        if (Number.isFinite(gid) && gid > 0) {
          setGroups((prev) => (prev.some((g) => g.id === gid) ? prev : [{ id: gid, name: gname }, ...prev]));
        }
        void loadContactGroups();
      }
      if (!Number.isFinite(targetGroupId) || targetGroupId <= 0) {
        pageMsg.showErr(ui.errSelectValidGroup);
        return;
      }

      const contacts = fromForm
        ? (() => {
            const nameParts = splitContactNameForStorage(form.contactName);
            const em = form.email.trim();
            if (!em || !isEmailValidForApiImport(em)) {
              throw new Error(ui.errEmailInvalid);
            }
            return [
              {
                email: em,
                ...nameParts,
                company: form.company || undefined,
                country: form.country || undefined,
                industry: form.industry || undefined,
                phone: form.phone.trim() || undefined,
                fax: form.fax.trim() || undefined,
                address: form.address.trim() || undefined,
                jobTitle: form.jobTitle.trim() || undefined,
                website: form.website.trim() || undefined,
                mainBusiness: form.mainBusiness.trim() || undefined,
                emailStatus: em ? "unverified" : undefined,
                groupIds: [targetGroupId]
              }
            ];
          })()
        : selectedRows.map((r) => contactPayloadForImportApi(r, targetGroupId));
      const useResume =
        crmResume && crmResume.targetGroupId === targetGroupId && crmResume.total === contacts.length;
      const startIndex = useResume ? crmResume.nextIndex : 0;
      const sourceContacts = useResume ? crmResume.contacts : contacts;
      let skippedFinal = 0;
      if (startIndex === 0) setCrmImportSkipped(0);
      setCrmImportProgress(
        startIndex > 0 ? ui.importProgressStart(startIndex, sourceContacts.length) : ui.preparingWrite
      );
      await postContactsImportBatches(sourceContacts.slice(startIndex), {
        startIndex,
        totalCount: sourceContacts.length,
        continueOnSingleFailure: true,
        onProgress: (p: ContactsImportProgress) => {
          setCrmImportProgress(ui.writeProgress(p.completed, p.total));
        },
        onSkipped: (s) => {
          skippedFinal = s.skipped;
          setCrmImportSkipped(s.skipped);
        }
      });
      setCrmResume(null);

      setCrmOpen(false);
      setCrmTransferFromForm(false);
      if (!fromForm) {
        setBulkPreview(null);
        setSelected({});
        resetDedupAll();
      }
      if (skippedFinal > 0) {
        pageMsg.showOk(ui.writeComplete(contacts.length - skippedFinal, skippedFinal));
      } else {
        pageMsg.showOk(ui.writeDone(contacts.length));
      }
      navigate(`/email/contacts/database?groupId=${targetGroupId}`);
    } catch (e: unknown) {
      if (isContactsImportPartialError(e)) {
        const targetGroupId = crmGroupMode === "existing" ? Number(crmGroupId) : Number.NaN;
        if (Number.isFinite(targetGroupId) && targetGroupId > 0) {
          const fromForm = crmTransferFromForm;
          const baseContacts = fromForm
            ? (() => {
                const nameParts = splitContactNameForStorage(form.contactName);
                const em = form.email.trim();
                return [
                  {
                    email: em,
                    ...nameParts,
                    company: form.company || undefined,
                    country: form.country || undefined,
                    industry: form.industry || undefined,
                    phone: form.phone.trim() || undefined,
                    fax: form.fax.trim() || undefined,
                    address: form.address.trim() || undefined,
                    jobTitle: form.jobTitle.trim() || undefined,
                    website: form.website.trim() || undefined,
                    mainBusiness: form.mainBusiness.trim() || undefined,
                    emailStatus: em ? "unverified" : undefined,
                    groupIds: [targetGroupId]
                  }
                ];
              })()
            : selectedRows.map((r) => contactPayloadForImportApi(r, targetGroupId));
          setCrmResume({
            contacts: baseContacts,
            nextIndex: e.nextIndex,
            total: e.total,
            targetGroupId
          });
          setCrmImportProgress(ui.resumeWriteProgress(e.completed, e.total));
          pageMsg.showOk(ui.writeInterrupted(e.completed, e.total));
        } else {
          pageMsg.showErr(String((e as Error)?.message ?? e));
        }
      } else {
        pageMsg.showErr(String((e as Error)?.message ?? e));
      }
    } finally {
      setCrmBusy(false);
      window.setTimeout(() => {
        setCrmImportProgress((prev) => (prev?.includes(ui.progressResumeToken) ? prev : null));
      }, 1200);
    }
  }

  function applyIndustryTagFromFileName(fileName: string) {
    const tag = industryTagFromImportFileName(fileName);
    if (!tag) return;
    const v = validateContactGroupNameClient(tag, ui);
    if (!v.ok) {
      pageMsg.showErr(v.message);
      return;
    }
    const nextCustom = prependCustomIndustryTag(user?.email, tag);
    setCustomImportIndustryTags(nextCustom);
    setImportIndustryTag(tag);
    setForm((p) => ({ ...p, industry: tag }));
  }

  function stageCsvTextForImport(text: string, displayFileName: string) {
    const {
      contacts,
      error,
      dataRowCount,
      skippedEmptyEmail,
      skippedInvalidEmail,
      skippedDuplicateEmail,
      columnMapping
    } = parseImportContactsFromCsvText(text);
    setBulkCsvColumnMapping(columnMapping);
    if (error) {
      pageMsg.showErr(ui.localizeCsvImportError(error));
      setBulkPreview(null);
      setBulkCsvParseStats(null);
      return false;
    }
    setBulkPreview({
      contacts,
      fileName: displayFileName,
      skippedInvalidEmail,
      skippedDuplicateEmail
    });
    setBulkCsvParseStats({
      dataRowCount,
      skippedEmpty: skippedEmptyEmail,
      skippedInvalid: skippedInvalidEmail,
      skippedDuplicate: skippedDuplicateEmail
    });
    setBulkCsvResume(null);
    setBulkCsvImportSkipped(0);
    resetDedupAll();
    applyIndustryTagFromFileName(displayFileName);
    const outcomeLine = ui.describeCsvParseOutcome({
      dataRowCount,
      validCount: contacts.length,
      skippedEmptyEmail,
      skippedInvalidEmail,
      skippedDuplicateEmail
    });
    if (contacts.length > 1500) {
      pageMsg.showErr(ui.csvTooLarge(outcomeLine));
    } else {
      pageMsg.showOk(
        ui.csvParsedOk(outcomeLine, columnMapping.ignored.length > 0 ? columnMapping.ignored.length : undefined)
      );
    }
    return true;
  }

  function onCsvFileSelected(file: File | null) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      pageMsg.showErr(ui.errCsvOnly);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        stageCsvTextForImport(String(reader.result ?? ""), file.name);
      } catch (e: unknown) {
        pageMsg.showErr(String((e as Error)?.message ?? e));
        setBulkPreview(null);
        setBulkCsvColumnMapping(null);
        setBulkCsvParseStats(null);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function onExcelFileSelected(file: File | null) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!/\.(xlsx|xls|xlsm)$/.test(name)) {
      pageMsg.showErr(ui.errExcelOnly);
      return;
    }
    setExcelFile(file);
    setConvertedCsvDownload(null);
  }

  async function convertExcelAndStageCsv() {
    if (!excelFile) {
      pageMsg.showErr(ui.noExcelSelected);
      return;
    }
    setExcelConverting(true);
    try {
      const { csvText, csvFileName } = await convertExcelListFileToCsv(excelFile);
      setConvertedCsvDownload({ csvText, csvFileName });
      downloadCsvTextFile(csvText, csvFileName);
      const ok = stageCsvTextForImport(csvText, csvFileName);
      if (ok) {
        const industry = industryTagFromImportFileName(csvFileName);
        pageMsg.showOk(ui.excelConvertedOk(csvFileName, industry || csvFileName));
      }
    } catch (e: unknown) {
      pageMsg.showErr(ui.errExcelConvertFailed(String((e as Error)?.message ?? e)));
    } finally {
      setExcelConverting(false);
    }
  }

  async function submitBulkCsvToCrm() {
    if (!importIndustryTag.trim()) {
      pageMsg.showErr(ui.errSelectIndustryBeforeCsv);
      return;
    }
    if (!bulkPreview?.contacts.length) {
      pageMsg.showErr(ui.errCsvNeedsEmail);
      return;
    }
    const targetIndustry = importIndustryTag.trim();
    const rows = bulkPreview.contacts.filter((r) => isEmailValidForApiImport(r.email));
    const apiRejected = bulkPreview.contacts.length - rows.length;
    if (rows.length === 0) {
      pageMsg.showErr(ui.errNoValidEmails);
      return;
    }
    const canResume = bulkCsvResume && bulkCsvResume.industry === targetIndustry && bulkCsvResume.total === rows.length;
    const startIndex = canResume ? bulkCsvResume.nextIndex : 0;
    const remaining = rows.slice(startIndex);
    const n = rows.length;
    let serverSkipped = 0;
    setBulkCsvImportBusy(true);
    if (startIndex === 0) setBulkCsvImportSkipped(apiRejected);
    setBulkCsvImportProgress(startIndex > 0 ? ui.importProgressStart(startIndex, n) : ui.importProgressStart(0, n));
    try {
      const mapped = remaining.map((r) => contactPayloadForIndustryImport(r, targetIndustry));
      await postContactsImportBatches(mapped, {
        onProgress: (p: ContactsImportProgress) => {
          setBulkCsvImportProgress(ui.importProgress(p.completed, p.total));
        },
        onSkipped: (s) => {
          serverSkipped = s.skipped;
          setBulkCsvImportSkipped(apiRejected + serverSkipped);
        },
        startIndex,
        totalCount: n,
        continueOnSingleFailure: true,
        batchSize: Math.min(CONTACTS_IMPORT_HTTP_BATCH_SIZE, Math.max(1, mapped.length))
      });
      setBulkCsvResume(null);
      setBulkCsvImportProgress(ui.importComplete);
      const parseStatsSnapshot = bulkCsvParseStats;
      setBulkPreview(null);
      setBulkCsvColumnMapping(null);
      setBulkCsvParseStats(null);
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
      pageMsg.showOk(ui.importDoneMessage(targetIndustry, parseNote, successEmails, serverSkipped, apiRejected));
    } catch (e: unknown) {
      if (isContactsImportPartialError(e)) {
        setBulkCsvResume({ industry: targetIndustry, nextIndex: e.nextIndex, total: n });
        setBulkCsvImportProgress(ui.importProgress(e.completed, e.total));
        pageMsg.showErr(ui.importInterrupted(e.completed, e.total));
      } else {
        pageMsg.showErr(String((e as Error)?.message ?? e));
      }
    } finally {
      setBulkCsvImportBusy(false);
      window.setTimeout(() => {
        setBulkCsvImportProgress((prev) => (prev?.includes(ui.progressResumeToken) ? prev : null));
      }, 1200);
    }
  }

  const selectedGroupLabel = useMemo(() => {
    const id = form.groupIds[0];
    if (id == null) return null;
    return groups.find((g) => g.id === id)?.name ?? `#${id}`;
  }, [groups, form.groupIds]);

  return (
    <PageShell
      title={ui.pageTitle}
      description={ui.pageDescription}
      actions={
        <Link
          to="/email/contacts/database"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          {ui.crmDatabaseLink}
        </Link>
      }
    >
      <div className="pb-20">
      <PageFeedbackLine feedback={pageMsg.feedback} className="mb-3" />
      <SectionCard title={ui.industrySectionTitle} description={ui.industrySectionDescription}>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-[10rem] flex-1 gap-1">
              <span className="text-xs text-slate-600">{ui.newIndustryTagLabel}</span>
              <input
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                placeholder={ui.industryTagPlaceholder}
                value={newIndustryTagName}
                onChange={(e) => setNewIndustryTagName(e.target.value)}
                disabled={industryTagCreateBusy || Boolean(industryTagRemoveBusy)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createIndustryTag();
                }}
              />
            </label>
            <button
              type="button"
              disabled={industryTagCreateBusy}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void createIndustryTag()}
            >
              {industryTagCreateBusy ? ui.creatingIndustryTag : ui.createIndustryTag}
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="mt-4">
        <SectionCard title={ui.quickAddTitle} description={ui.quickAddDescription}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={ui.fieldEmail} value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
            <Field label={ui.fieldPhone} value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <Field label={ui.fieldFax} value={form.fax} onChange={(v) => setForm((p) => ({ ...p, fax: v }))} />
            <div className="md:col-span-2">
              <Field label={ui.fieldCompany} value={form.company} onChange={(v) => setForm((p) => ({ ...p, company: v }))} />
            </div>
            <Field
              label={ui.fieldContactName}
              value={form.contactName}
              onChange={(v) => setForm((p) => ({ ...p, contactName: v }))}
              placeholder={ui.contactNamePlaceholder}
            />
            <Field label={ui.fieldJobTitle} value={form.jobTitle} onChange={(v) => setForm((p) => ({ ...p, jobTitle: v }))} />
            <Field label={ui.fieldWebsite} value={form.website} onChange={(v) => setForm((p) => ({ ...p, website: v }))} />
            <Field label={ui.fieldCountry} value={form.country} onChange={(v) => setForm((p) => ({ ...p, country: v }))} />
            <div className="md:col-span-2">
              <ImportIndustryTagCardPicker
                tags={industryTagSelectOptions}
                selected={form.industry}
                onSelect={(tag) => setForm((p) => ({ ...p, industry: tag }))}
                onRemove={removeLocalIndustryTagOnly}
                formatLabel={formatIndustryTagLabel}
                label={ui.fieldIndustry}
                disabled={Boolean(industryTagRemoveBusy)}
              />
            </div>
            <div className="md:col-span-2">
              <Field label={ui.fieldAddress} value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
              <Field label={ui.fieldMainBusiness} value={form.mainBusiness} onChange={(v) => setForm((p) => ({ ...p, mainBusiness: v }))} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={async () => {
                const em = form.email.trim();
                if (!em) {
                  pageMsg.showErr(ui.errEmailRequired);
                  return;
                }
                if (!isEmailValidForApiImport(em)) {
                  pageMsg.showErr(ui.errEmailInvalid);
                  return;
                }
                const nameParts = splitContactNameForStorage(form.contactName);
                const payload: Record<string, unknown> = {
                  email: em,
                  ...nameParts,
                  company: form.company || undefined,
                  country: form.country || undefined,
                  industry: form.industry || undefined,
                  phone: form.phone.trim() || undefined,
                  fax: form.fax.trim() || undefined,
                  address: form.address.trim() || undefined,
                  jobTitle: form.jobTitle.trim() || undefined,
                  website: form.website.trim() || undefined,
                  mainBusiness: form.mainBusiness.trim() || undefined,
                  emailStatus: form.email.trim() ? "unverified" : undefined,
                  groupIds: []
                };
                try {
                  await apiJson("/api/email/contacts", {
                    method: "POST",
                    body: JSON.stringify(payload)
                  });
                  const previewRow = importPayloadFromQuickForm(form, groups);
                  setBulkPreview((prev) => {
                    if (prev?.contacts.length) {
                      return { ...prev, contacts: [...prev.contacts, previewRow] };
                    }
                    return {
                      contacts: [previewRow],
                      fileName: ui.quickAddFileName,
                      skippedInvalidEmail: 0,
                      skippedDuplicateEmail: 0
                    };
                  });
                  pageMsg.showOk(ui.contactSaved);
                } catch (e: unknown) {
                  pageMsg.showErr(String((e as Error)?.message ?? e));
                }
              }}
            >
              {ui.saveContact}
            </button>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => void openCrmModalFromQuickForm()}
            >
              {ui.moveToCrmDb}
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title={ui.excelSectionTitle}>
          <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 p-3">
            <div className="text-xs font-semibold text-slate-800">{ui.excelUploadTitle}</div>
            <p className="mt-1 text-[11px] text-slate-600">{ui.excelImportHint}</p>
            <p className="mt-1 text-[11px] text-amber-800">{ui.industryFromFileNameHint}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id={excelFileInputId}
                type="file"
                accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  onExcelFileSelected(f);
                }}
              />
              <label
                htmlFor={excelFileInputId}
                className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {ui.chooseExcel}
              </label>
              <button
                type="button"
                disabled={!excelFile || excelConverting || bulkCsvImportBusy}
                className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void convertExcelAndStageCsv()}
              >
                {excelConverting ? ui.convertingExcel : ui.convertExcelToCsv}
              </button>
              {convertedCsvDownload ? (
                <button
                  type="button"
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() =>
                    downloadCsvTextFile(convertedCsvDownload.csvText, convertedCsvDownload.csvFileName)
                  }
                >
                  {ui.downloadConvertedCsv}
                </button>
              ) : null}
              {excelFile ? (
                <>
                  <span className="text-xs text-slate-600">{ui.excelSelected(excelFile.name)}</span>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setExcelFile(null);
                      setConvertedCsvDownload(null);
                    }}
                  >
                    {ui.clearExcel}
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-400">{ui.noExcelSelected}</span>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title={ui.csvSectionTitle}>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="text-xs font-semibold text-slate-800">{ui.csvUploadTitle}</div>
              <span className="text-[10px] text-slate-500">{ui.csvBatchHint}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">{ui.csvImportHint}</p>
            <p className="mt-1 text-[11px] text-amber-800">{ui.industryFromFileNameHint}</p>
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
              label={ui.importIndustryTagLabel}
              placeholder={ui.importIndustryTagPlaceholder}
              emptyHint={ui.importIndustryTagEmptyHint}
              disabled={bulkCsvImportBusy || Boolean(industryTagRemoveBusy)}
            />
            <CrmContactCsvColumnGuide
              mapping={bulkCsvColumnMapping}
              batchSize={CONTACTS_IMPORT_HTTP_BATCH_SIZE}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id={bulkFileInputId}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  onCsvFileSelected(f);
                }}
              />
              <label
                htmlFor={bulkFileInputId}
                className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {ui.chooseCsv}
              </label>
              {bulkPreview && bulkCsvParseStats ? (
                <span className="text-xs text-slate-600">
                  {ui.selectedFileSummary(
                    bulkPreview.fileName,
                    ui.describeCsvParseOutcome({
                    dataRowCount: bulkCsvParseStats.dataRowCount,
                    validCount: bulkPreview.contacts.length,
                    skippedEmptyEmail: bulkCsvParseStats.skippedEmpty,
                    skippedInvalidEmail: bulkCsvParseStats.skippedInvalid,
                    skippedDuplicateEmail: bulkCsvParseStats.skippedDuplicate
                    })
                  )}
                  {bulkCsvColumnMapping && bulkCsvColumnMapping.ignored.length > 0 ? (
                    <span className="text-amber-800">{ui.unrecognizedCols(bulkCsvColumnMapping.ignored.length)}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-xs text-slate-400">{ui.noFileSelected}</span>
              )}
              {bulkPreview ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setBulkPreview(null);
                    setBulkCsvColumnMapping(null);
                    setBulkCsvParseStats(null);
                    setBulkCsvResume(null);
                    resetDedupAll();
                  }}
                >
                  {ui.clearImport}
                </button>
              ) : null}
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={bulkCsvImportBusy || !importIndustryTag.trim()}
                className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                title={!importIndustryTag.trim() ? ui.selectIndustryTagFirst : undefined}
                onClick={() => void submitBulkCsvToCrm()}
              >
                {bulkCsvImportBusy ? ui.importing : bulkCsvResume ? ui.resumeImport : ui.confirmImport}
              </button>
            </div>
            {bulkCsvImportProgress ? <p className="mt-2 text-xs text-slate-600">{bulkCsvImportProgress}</p> : null}
            {bulkCsvImportSkipped > 0 ? (
              <p className="mt-1 text-xs text-amber-700">{ui.skippedImportRows(bulkCsvImportSkipped)}</p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {crmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">{ui.crmModalTitle}</h2>
            <p className="mt-1 text-xs text-slate-500">{ui.crmModalDescription}</p>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="crmImportGroupMode"
                  checked={crmGroupMode === "existing"}
                  onChange={() => setCrmGroupMode("existing")}
                />
                <span>{ui.chooseExistingGroup}</span>
              </label>
              {crmGroupMode === "existing" ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">{ui.crmTargetGroup}</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={crmGroupId === "" ? "" : String(crmGroupId)}
                    onChange={(e) => setCrmGroupId(e.target.value ? Number(e.target.value) : "")}
                    aria-label={ui.selectCrmTargetGroup}
                  >
                    {groups.length === 0 ? <option value="">{ui.noGroupsYet}</option> : null}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="crmImportGroupMode"
                  checked={crmGroupMode === "new"}
                  onChange={() => setCrmGroupMode("new")}
                />
                <span>{ui.createNewGroup}</span>
              </label>
              {crmGroupMode === "new" ? (
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={ui.newGroupPlaceholder}
                  value={crmNewName}
                  onChange={(e) => setCrmNewName(e.target.value)}
                />
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                onClick={() => {
                  setCrmOpen(false);
                  setCrmTransferFromForm(false);
                  setCrmImportProgress(null);
                  setCrmResume(null);
                  setCrmImportSkipped(0);
                }}
                disabled={crmBusy}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={crmBusy}
                onClick={() => void submitCrmTransfer()}
              >
                {crmBusy ? ui.writing : crmResume ? ui.resumeWrite : ui.confirmWrite}
              </button>
            </div>
            {crmImportProgress ? <p className="mt-2 text-xs text-slate-600">{crmImportProgress}</p> : null}
            {crmImportSkipped > 0 ? (
              <p className="mt-1 text-xs text-amber-700">{ui.skippedWriteRows(crmImportSkipped)}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      </div>
    </PageShell>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-slate-700">{props.label}</span>
      <input
        className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

type CrmStatCardProps =
  | {
      variant?: "stat";
      label: string;
      value: number | null;
      hint: string;
      tone: "blue" | "green" | "red" | "amber";
    }
  | {
      variant: "guide";
      label: string;
      hint: string;
    };

function CrmStatCard(props: CrmStatCardProps) {
  if (props.variant === "guide") {
    const ring = "border-blue-100 bg-blue-50/60";
    return (
      <div className={`flex h-full min-h-0 flex-col rounded-xl border px-4 py-3 ${ring}`}>
        <div className="flex shrink-0 items-center gap-2 text-slate-600">
          <span className="text-lg" aria-hidden>
            📋
          </span>
          <span className="text-sm font-medium">{props.label}</span>
        </div>
        <div
          className="invisible mt-1 shrink-0 text-2xl font-semibold tabular-nums select-none"
          aria-hidden
        >
          —
        </div>
        <div className="shrink-0 text-xs text-slate-500">{props.hint}</div>
        <div className="min-h-0 flex-1" aria-hidden />
      </div>
    );
  }

  const ring =
    props.tone === "blue"
      ? "border-blue-100 bg-blue-50/60"
      : props.tone === "green"
        ? "border-emerald-100 bg-emerald-50/60"
        : props.tone === "red"
          ? "border-rose-100 bg-rose-50/60"
          : "border-amber-100 bg-amber-50/60";
  const icon =
    props.tone === "blue" ? "👤" : props.tone === "green" ? "✓" : props.tone === "red" ? "✕" : "!";
  const idle = props.value == null;
  return (
    <div className={`flex h-full min-h-0 flex-col rounded-xl border px-4 py-3 ${ring}`}>
      <div className="flex shrink-0 items-center gap-2 text-slate-600">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium">{props.label}</span>
      </div>
      <div
        className={`mt-1 shrink-0 text-2xl font-semibold tabular-nums ${idle ? "text-slate-400" : "text-slate-900"}`}
      >
        {idle ? "—" : props.value}
      </div>
      <div className="shrink-0 text-xs text-slate-500">{props.hint}</div>
      <div className="min-h-0 flex-1" aria-hidden />
    </div>
  );
}
