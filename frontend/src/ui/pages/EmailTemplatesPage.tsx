import "../email/registerEmailHtmlVideoBlot";
import "../email/registerEmailCommerceRowBlot";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { attachQuillImageInteract } from "../email/emailQuillImageInteract";
import { attachQuillVideoResize } from "../email/emailQuillVideoResize";
import { type EmailStarterPreset } from "../email/emailStarterPresets";
import { EmailStarterPresetsSection } from "../email/EmailStarterPresetsSection";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getEmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";
import { EmailTemplateQuillField, type EmailTemplateQuillFieldHandle } from "../email/EmailTemplateQuillField";
import { EmailCommerceAssistantPanel } from "../email/EmailCommerceAssistantPanel";
import { EmailTemplateAiGeneratePanel } from "../email/EmailTemplateAiGeneratePanel";
import { EmailTemplateBodySectionHeader } from "../email/EmailTemplateBodySectionHeader";
import {
  isVisionReplicaHtmlInsertable,
  normalizeCommerceHtmlForQuill,
  normalizeVisionHtmlForQuill
} from "../../lib/emailQuillVisionHtmlImport";
import {
  ALLOWED_BODY_VIDEO_MIMES,
  countBodyInlineMedia,
  MAX_BODY_INLINE_IMAGES,
  MAX_BODY_INLINE_VIDEOS,
  MAX_INLINE_IMAGE_BYTES,
  MAX_INLINE_VIDEO_BYTES
} from "../../lib/emailTemplateBodyMediaLimits";
import {
  guessPresetAndDepthFromColor,
  resolveBodyBackgroundColor,
  unwrapBodyBackground,
  wrapBodyWithBackground
} from "../../lib/emailTemplateBodyBackground";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { InlineConfirmBar, PageFeedbackLine } from "../components/InlineFeedbackPanels";
import { useAuth } from "../../auth/AuthContext";
import { apiFormUploadWithTimeout, apiJson } from "../../lib/api";
import { EMAIL_TEMPLATE_INLINE_UPLOAD_TIMEOUT_MS } from "../../lib/emailTemplateAiTimeouts";
import { usePageFeedback } from "../../lib/inlineFeedback";
import {
  rewriteRelativeUrlsForEmailPreview,
  toAbsoluteEmailAssetUrl
} from "../../lib/emailTemplateAssetUrls";
import { buildEmailPlatformBrandingFooterHtml } from "../../lib/emailPlatformBranding";
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
  findLaneByIndex,
  laneFromEmails,
  laneSenderPrefStorageKey,
  pickDefaultLaneIndex,
  type DedicatedLaneSnapshot
} from "../../lib/dedicatedLanes";
import { DedicatedLaneSenderFilters } from "../components/email/DedicatedLaneSenderFilters";
import { MarketingSenderChannelPicker } from "../components/email/MarketingSenderChannelPicker";
import { postAgentBrainEmailTemplatePolishBody } from "../../lib/standaloneAgentBrainApi";

type TemplateListItem = {
  id: number;
  name: string;
  category: string | null;
  business_line: string | null;
  subject_template: string;
  font_stack: string;
  schedule_enabled?: number | null;
  scheduled_at?: string | null;
  group_ids?: number[] | null;
  created_at: string;
  updated_at: string;
};

type TemplateDetail = {
  id: number;
  name: string;
  category: string | null;
  business_line: string | null;
  subject_template: string;
  body_html: string;
  body_text: string | null;
  font_stack: string;
  assets_json: any | null;
  schedule_enabled?: number | null;
  scheduled_at?: string | null;
  signature_mode?: string | null;
  signature_preset_key?: string | null;
  signature_html?: string | null;
  group_ids?: number[] | null;
};

type AssetSlot = { url: string; name: string; mime?: string; size?: number };

type SmtpProfileRow = {
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

/** 后端 wrapBodyWithFont 使用的默认字体栈（主题下已去掉手动选择，统一用系统友好默认） */
const DEFAULT_FONT_STACK =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

const EMPTY_QUILL = "<p><br></p>";

/* =============================================================================
 * 邮件正文 + 签名档工具栏（硬性锁定）
 * 没有需求方明确允许：禁止改动两处 EmailTemplateQuillField、插图 handler、及相关 Quill/CSS 约定。
 * 见 .cursor/rules/email-template-quill-toolbar-lock.mdc
 * 配置：../email/emailTemplateQuillConfig.ts；组件：../email/EmailTemplateQuillField.tsx
 * ============================================================================= */

/** 模版库文件夹卡片正文区浅色底（按顺序轮换，便于区分） */
const TEMPLATE_FOLDER_BODY_TINTS = [
  "bg-sky-50/95",
  "bg-emerald-50/95",
  "bg-violet-50/95",
  "bg-amber-50/90",
  "bg-rose-50/95",
  "bg-cyan-50/95"
] as const;

/** 模版库列表可视区：约 8 张（sm+ 两列×四行）；超出用右侧竖条滚动。窄屏单列时高度随视口，仍纵向滚动 */
const TEMPLATE_LIBRARY_SCROLL_CLASS =
  "max-h-[min(78rem,76vh)] overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] sm:max-h-[min(41rem,52vh)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300";
/** 预览区补齐 Quill class 渲染，保证与编辑器视觉一致 */
const PREVIEW_QUILL_RENDER_CLASS = [
  "[&_.ql-align-center]:text-center",
  "[&_.ql-align-right]:text-right",
  "[&_.ql-align-justify]:text-justify",
  "[&_.ql-size-small]:text-[0.75em]",
  "[&_.ql-size-large]:text-[1.5em]",
  "[&_.ql-size-huge]:text-[2.5em]",
  "[&_.ql-font-serif]:font-serif",
  "[&_.ql-font-monospace]:font-mono",
  "[&_ul]:my-2",
  "[&_ol]:my-2",
  "[&_ul]:list-disc",
  "[&_ol]:list-decimal",
  "[&_ul]:pl-6",
  "[&_ol]:pl-6",
  "[&_li]:my-1",
  "[&_.ql-indent-1]:pl-4",
  "[&_.ql-indent-2]:pl-8",
  "[&_.ql-indent-3]:pl-12",
  "[&_.ql-indent-4]:pl-16"
].join(" ");

const MAX_DOCS = 3;
/** 文档附件：压缩包 + Office/PDF；不限制为仅 office，避免系统选择器藏起 zip */
const DOC_ATTACH_ACCEPT =
  ".zip,.7z,.rar,.tar,.tgz,.gz,.bz2,.xz,.zst,.cab,.pdf,.doc,.docx,.xls,.xlsx,application/zip,application/x-zip-compressed,application/x-7z-compressed,application/vnd.rar,application/gzip,application/x-tar,application/x-bzip2,application/x-xz,application/zstd,application/vnd.ms-cab-compressed,application/pdf";
const MAX_IMG_ATTACH = 3;
/** 模版标签（分类）最多 15 个字 */
const MAX_TEMPLATE_TAG_LEN = 15;

/** 正文是否几乎为空（套用预设时可跳过覆盖确认） */
function errMsg(e: unknown): string {
  return String((e as Error)?.message ?? e);
}

/** 列表/发信展示名：优先浏览器本地文件名（UTF-8），避免 multer latin1 乱码 */
function preferReadableAttachName(localName: string, serverName?: string): string {
  const local = String(localName ?? "").trim();
  const server = String(serverName ?? "").trim();
  const looksMojibake = (s: string) => /[\u00C0-\u00FF]{2,}/.test(s) || s.includes("\uFFFD");
  if (local && /[\u4e00-\u9fff]/.test(local)) return local;
  if (server && looksMojibake(server) && local) return local;
  return server || local || "file";
}

function isBodyHtmlEffectivelyEmpty(html: string): boolean {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return true;
  const t = html.trim();
  return t === EMPTY_QUILL || /^<p>\s*(<br\s*\/?>\s*)?<\/p>$/i.test(t.replace(/\s/g, " "));
}

/** 保存时后端会包一层 font-family div；载入编辑器前剥掉外壳，避免 Quill 只显示默认占位 */
function unwrapTemplateBodyHtml(html: string): string {
  const s = String(html ?? "").trim();
  if (!s) return EMPTY_QUILL;
  const m = /^<div[^>]*font-family:[^>]*>([\s\S]*)<\/div>\s*$/i.exec(s);
  if (m?.[1]) {
    const inner = m[1].trim();
    return inner || EMPTY_QUILL;
  }
  return s;
}

function parseEditorBodyFromStored(html: string): {
  html: string;
  bgPreset: string;
  bgDepth: number;
} {
  let s = unwrapTemplateBodyHtml(html);
  const bg = unwrapBodyBackground(s);
  const guessed = guessPresetAndDepthFromColor(bg.bgColor);
  return { html: bg.html || EMPTY_QUILL, bgPreset: guessed.presetId, bgDepth: guessed.depth };
}

function normalizeAssets(raw: any): { documents: AssetSlot[]; attachmentImages: AssetSlot[] } {
  if (!raw || typeof raw !== "object") return { documents: [], attachmentImages: [] };
  if (Array.isArray(raw.documents) || Array.isArray(raw.attachmentImages)) {
    return {
      documents: (raw.documents ?? []).slice(0, MAX_DOCS),
      attachmentImages: (raw.attachmentImages ?? []).slice(0, MAX_IMG_ATTACH)
    };
  }
  const legacy = raw.attachments ?? [];
  const docs: AssetSlot[] = [];
  const imgs: AssetSlot[] = [];
  for (const x of legacy) {
    const mime = x.mime ?? "";
    if (mime.startsWith("image/")) imgs.push(x);
    else docs.push(x);
  }
  return { documents: docs.slice(0, MAX_DOCS), attachmentImages: imgs.slice(0, MAX_IMG_ATTACH) };
}

function isWechatGrowthEmailTemplateHtml(html: string): boolean {
  return /BSS_WECHAT_READ_ORIGINAL_URL:/.test(html);
}

function buildPreviewComplianceHtml(baseComplianceHtml: string, bodyHtml: string): string {
  if (!isWechatGrowthEmailTemplateHtml(bodyHtml)) return baseComplianceHtml;
  return (
    '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">' +
    '系统将自动附加：<span style="color:#2563eb;">阅读原文</span> | ' +
    '<span style="color:#2563eb;">订阅链接</span> | <span style="color:#2563eb;">退订链接</span> | <span style="color:#2563eb;">投诉链接</span>' +
    "</div>"
  );
}

/** 将 Quill class（对齐/字号）固化为行内样式，避免预览与编辑不一致 */
function inlineQuillPreviewStyles(html: string): string {
  if (!html?.trim()) return html;
  if (typeof document === "undefined") return html;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;

  wrap.querySelectorAll<HTMLElement>(".ql-align-center").forEach((el) => {
    el.style.textAlign = "center";
  });
  wrap.querySelectorAll<HTMLElement>(".ql-align-right").forEach((el) => {
    el.style.textAlign = "right";
  });
  wrap.querySelectorAll<HTMLElement>(".ql-align-justify").forEach((el) => {
    el.style.textAlign = "justify";
  });

  wrap.querySelectorAll<HTMLElement>(".ql-size-small").forEach((el) => {
    el.style.fontSize = "0.75em";
  });
  wrap.querySelectorAll<HTMLElement>(".ql-size-large").forEach((el) => {
    el.style.fontSize = "1.5em";
  });
  wrap.querySelectorAll<HTMLElement>(".ql-size-huge").forEach((el) => {
    el.style.fontSize = "2.5em";
  });

  return wrap.innerHTML;
}

/** 与后端 assembleTemplateEmailHtml 一致，用于页面预览 */
function assemblePreviewEmailHtml(
  bodyHtml: string,
  signatureHtml: string,
  compliancePart: string,
  bodyBgColor?: string
) {
  const inner = inlineQuillPreviewStyles(rewriteRelativeUrlsForEmailPreview(bodyHtml ?? ""));
  const body = bodyBgColor
    ? `<div style="background-color:${bodyBgColor.replace(/"/g, "")};padding:20px 16px;border-radius:8px;">${inner}</div>`
    : inner;
  const sig = rewriteRelativeUrlsForEmailPreview(signatureHtml ?? "").trim();
  const sigEmpty =
    !sig ||
    sig === EMPTY_QUILL ||
    /^<p>\s*(<br\s*\/?>\s*)?<\/p>$/i.test(sig.replace(/\s/g, " "));
  const sigStyled = inlineQuillPreviewStyles(sig);
  const sigPart = sigEmpty
    ? ""
    : `<div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">${sigStyled}</div>`;
  const brandingPart = buildEmailPlatformBrandingFooterHtml();
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;">${body}${sigPart}${compliancePart}${brandingPart}</div>`;
}

/** 营销活动模版缩略图：按约 600px 邮件宽度缩放，与右侧编辑画布比例一致 */
export function EmailTemplatesPage() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getEmailTemplatesPageStrings(locale), [locale]);
  const { user } = useAuth();
  const laneSenderPrefKey = useMemo(
    () => laneSenderPrefStorageKey(String(user?.email ?? "")),
    [user?.email]
  );
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [meta, setMeta] = useState({
    name: "",
    category: "",
    subject: ""
  });

  const [listTagFilter, setListTagFilter] = useState<string>("");
  const [listSearch, setListSearch] = useState("");
  /** 本会话内新增的模版标签（合并进下拉与 datalist；保存模版后写入库） */
  const [sessionCustomTags, setSessionCustomTags] = useState<string[]>([]);
  const [newTagDraft, setNewTagDraft] = useState("");

  /** 仍随模版保存；分组勾选已改到邮件营销等页面配置 */
  const [groupIds, setGroupIds] = useState<number[]>([]);
  /** 定时发布改在邮件营销中配置；此处仅存载入值并在保存时回传，避免覆盖后台已有计划 */
  const [scheduleSnapshot, setScheduleSnapshot] = useState<{ enabled: boolean; at: string | null }>({
    enabled: false,
    at: null
  });

  const [signatureHtml, setSignatureHtml] = useState(EMPTY_QUILL);
  const [signatureOpen, setSignatureOpen] = useState(false);

  const [bodyHtml, setBodyHtml] = useState(EMPTY_QUILL);
  const [bodyBgPreset, setBodyBgPreset] = useState("neutral");
  const [bodyBgDepth, setBodyBgDepth] = useState(12);
  const bodyBgColor = useMemo(
    () => resolveBodyBackgroundColor(bodyBgPreset, bodyBgDepth),
    [bodyBgPreset, bodyBgDepth]
  );
  const [assets, setAssets] = useState<{ documents: AssetSlot[]; attachmentImages: AssetSlot[] }>({
    documents: [],
    attachmentImages: []
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiPolishing, setAiPolishing] = useState(false);
  const [aiPolishFeedback, setAiPolishFeedback] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testSendLine, setTestSendLine] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [smtpAll, setSmtpAll] = useState<SmtpProfileRow[]>([]);
  const [dedicatedServers, setDedicatedServers] = useState<
    Array<{ id?: number; subscriptionTierId?: string | null }>
  >([]);
  const [dedicatedLanes, setDedicatedLanes] = useState<DedicatedLaneSnapshot[]>([]);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | "">("");
  const [senderChannel, setSenderChannel] = useState<EmailChannelKind>("light");
  const [sesAddresses, setSesAddresses] = useState<MarketingSesAddressRow[]>([]);
  const [selectedTestSenderKey, setSelectedTestSenderKey] = useState("");

  /** 模版库中「预览」：全尺寸邮件预览弹窗 */
  const [libraryPreview, setLibraryPreview] = useState<{
    open: boolean;
    loading: boolean;
    name: string;
    subject: string;
    html: string;
    documents: AssetSlot[];
    attachmentImages: AssetSlot[];
  }>({
    open: false,
    loading: false,
    name: "",
    subject: "",
    html: "",
    documents: [],
    attachmentImages: []
  });

  const previewComplianceHtml = useMemo(
    () => buildPreviewComplianceHtml(ui.previewComplianceHtml, bodyHtml),
    [ui.previewComplianceHtml, bodyHtml]
  );

  const previewHtml = useMemo(
    () => assemblePreviewEmailHtml(bodyHtml, signatureHtml, previewComplianceHtml, bodyBgColor),
    [bodyHtml, signatureHtml, previewComplianceHtml, bodyBgColor]
  );

  const quillRef = useRef<EmailTemplateQuillFieldHandle | null>(null);
  const signatureQuillRef = useRef<EmailTemplateQuillFieldHandle | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const bodyVideoPickerRef = useRef<HTMLInputElement | null>(null);
  const signatureImagePickerRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const imgAttachInputRef = useRef<HTMLInputElement | null>(null);
  /** 套用营销预设后滚动至正文画布 */
  const editorCanvasRef = useRef<HTMLDivElement | null>(null);

  const [activeStarterPresetId, setActiveStarterPresetId] = useState<string | null>(null);
  const pageMsg = usePageFeedback();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [presetConfirm, setPresetConfirm] = useState<EmailStarterPreset | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const allKnownTemplateTags = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const c = it.category?.trim();
      if (c) s.add(c);
    }
    for (const c of sessionCustomTags) {
      const t = c.trim();
      if (t) s.add(t);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [items, sessionCustomTags]);

  const filteredTemplateItems = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return items.filter((t) => {
      if (listTagFilter && (t.category?.trim() ?? "") !== listTagFilter) return false;
      if (!q) return true;
      const name = t.name.toLowerCase();
      const sub = (t.subject_template ?? "").toLowerCase();
      const tag = (t.category ?? "").toLowerCase();
      const idStr = String(t.id);
      return name.includes(q) || sub.includes(q) || tag.includes(q) || idStr.includes(q);
    });
  }, [items, listTagFilter, listSearch]);

  async function refreshList() {
    const res = await apiJson<{ ok: boolean; items: TemplateListItem[] }>("/api/email/templates");
    setItems(res.items);
  }

  async function openLibraryPreviewModal(id: number) {
    setLibraryPreview({
      open: true,
      loading: true,
      name: "",
      subject: "",
      html: "",
      documents: [],
      attachmentImages: []
    });
    try {
      const res = await apiJson<{ ok: boolean; item: TemplateDetail }>(`/api/email/templates/${id}`);
      const t = res.item;
      const body = unwrapTemplateBodyHtml(t.body_html ?? "");
      const sigRaw = (t.signature_html ?? "").trim();
      const previewAssets = normalizeAssets(t.assets_json);
      setLibraryPreview({
        open: true,
        loading: false,
        name: t.name,
        subject: t.subject_template,
        html: assemblePreviewEmailHtml(body, sigRaw ? unwrapTemplateBodyHtml(sigRaw) : "", buildPreviewComplianceHtml(ui.previewComplianceHtml, body)),
        documents: previewAssets.documents,
        attachmentImages: previewAssets.attachmentImages
      });
    } catch (e: unknown) {
      setLibraryPreview({
        open: false,
        loading: false,
        name: "",
        subject: "",
        html: "",
        documents: [],
        attachmentImages: []
      });
      pageMsg.showErr(errMsg(e));
    }
  }

  async function loadDetail(id: number) {
    try {
      const res = await apiJson<{ ok: boolean; item: TemplateDetail }>(`/api/email/templates/${id}`);
      const t = res.item;
      setActiveStarterPresetId(null);
      setSelectedId(t.id);
      setMeta((m) => ({
        ...m,
        name: t.name,
        category: t.category ?? "",
        subject: t.subject_template
      }));
      const parsedBody = parseEditorBodyFromStored(t.body_html ?? EMPTY_QUILL);
      setBodyHtml(rewriteRelativeUrlsForEmailPreview(parsedBody.html));
      setBodyBgPreset(parsedBody.bgPreset);
      setBodyBgDepth(parsedBody.bgDepth);
      setAssets(normalizeAssets(t.assets_json));
      setGroupIds(Array.isArray(t.group_ids) ? t.group_ids : []);
      setScheduleSnapshot({
        enabled: Boolean(t.schedule_enabled),
        at: t.scheduled_at && String(t.scheduled_at).trim() ? String(t.scheduled_at) : null
      });
      const sig = (t.signature_html ?? "").trim();
      setSignatureHtml(
        sig ? rewriteRelativeUrlsForEmailPreview(unwrapTemplateBodyHtml(t.signature_html as string)) : EMPTY_QUILL
      );
      setPreviewOpen(false);
      window.requestAnimationFrame(() => {
        editorCanvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      pageMsg.showOk(ui.loadedTemplate(t.name));
    } catch (e: unknown) {
      pageMsg.showErr(errMsg(e));
    }
  }

  async function confirmDeleteTemplate() {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    setDeletingId(id);
    try {
      await apiJson(`/api/email/templates/${id}`, { method: "DELETE" });
      if (selectedId === id) {
        await startNewTemplate();
      }
      await refreshList();
      setDeleteConfirm(null);
      pageMsg.showOk(ui.deletedTemplate(name));
    } catch (e: unknown) {
      pageMsg.showErr(errMsg(e));
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    refreshList().catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    if (selectedId != null) return;
    setMeta((m) => ({ ...m, subject: ui.defaultSubject }));
    setBodyHtml(ui.defaultBodyHtml);
    setBodyBgPreset("neutral");
    setBodyBgDepth(12);
  }, [locale, selectedId, ui.defaultSubject, ui.defaultBodyHtml]);

  useEffect(() => {
    (async () => {
      try {
        const [smtp, ded, ses, lanesRes] = await Promise.all([
          apiJson<{ ok: boolean; items: SmtpProfileRow[] }>("/api/email/smtp"),
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
        const lanes = Array.isArray(lanesRes.lanes) ? lanesRes.lanes : [];
        setDedicatedLanes(lanes);
        if (selectedLaneIndex === "" && lanes.length > 0) {
          const def = pickDefaultLaneIndex(lanes, { preferenceStorageKey: laneSenderPrefKey });
          if (def !== "") setSelectedLaneIndex(def);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const selectedLane = useMemo(
    () => findLaneByIndex(dedicatedLanes, selectedLaneIndex),
    [dedicatedLanes, selectedLaneIndex]
  );
  const laneAllowedEmails = useMemo(() => laneFromEmails(selectedLane), [selectedLane]);

  const senderGroups = useMemo(() => {
    const base = buildCampaignStatsSenderGroups(smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses);
    if (dedicatedLanes.length > 0 && selectedLaneIndex !== "" && laneAllowedEmails.length > 0) {
      const filtered = { ...base };
      for (const ch of ["light", "medium", "bulk", "ultra"] as const) {
        filtered[ch] = (base[ch] ?? []).filter((fe) => laneAllowedEmails.includes(fe));
      }
      return filtered;
    }
    return base;
  }, [smtpAll, dedicatedServers, sesAddresses, dedicatedLanes.length, selectedLaneIndex, laneAllowedEmails]);

  useEffect(() => {
    if (!selectedTestSenderKey) {
      const ch = defaultChannelForGroups(senderGroups);
      setSenderChannel(ch);
      const fe = senderGroups[ch][0] ?? "";
      const key = marketingSenderKeyForChannelEmail(ch, fe, smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses);
      if (key) setSelectedTestSenderKey(key);
      return;
    }
    setSenderChannel(
      inferChannelForSenderKey(selectedTestSenderKey, smtpAll as MarketingSmtpRow[], dedicatedServers, sesAddresses)
    );
  }, [senderGroups, smtpAll, dedicatedServers, sesAddresses, selectedTestSenderKey]);

  const uploadFile = useCallback(async (file: File, kind: "inline" | "doc" | "image_attach") => {
    const fd = new FormData();
    fd.append("originalName", file.name || "file");
    fd.append("file", file, file.name || "file");
    const q = kind === "inline" ? "" : `?kind=${encodeURIComponent(kind)}`;
    return apiFormUploadWithTimeout<{ ok: boolean; url: string; name: string; mime?: string; size?: number }>(
      `/api/email/upload${q}`,
      fd,
      EMAIL_TEMPLATE_INLINE_UPLOAD_TIMEOUT_MS
    );
  }, []);

  const checkBodyInlineMediaUpload = useCallback(
    (file: File, kind: "image" | "video"): string | null => {
      const html = quillRef.current?.getEditor()?.root.innerHTML ?? bodyHtml;
      const counts = countBodyInlineMedia(html);
      if (kind === "image" && counts.images >= MAX_BODY_INLINE_IMAGES) {
        return ui.errBodyImageMax(MAX_BODY_INLINE_IMAGES);
      }
      if (kind === "video") {
        if (counts.videos >= MAX_BODY_INLINE_VIDEOS) {
          return ui.errBodyVideoMax(MAX_BODY_INLINE_VIDEOS);
        }
        if (!ALLOWED_BODY_VIDEO_MIMES.has(file.type)) {
          return ui.errBodyVideoFormat;
        }
      }
      const maxBytes = kind === "video" ? MAX_INLINE_VIDEO_BYTES : MAX_INLINE_IMAGE_BYTES;
      if (file.size > maxBytes) {
        return ui.errBodyMediaSize(15);
      }
      return null;
    },
    [bodyHtml, ui]
  );

  const insertBodyEditorHtml = useCallback(
    (
      html: string,
      opts?: { replace?: boolean; preserveLayout?: boolean; commerceLayout?: boolean }
    ): boolean => {
      const quill = quillRef.current?.getEditor();
      if (!quill) {
        pageMsg.showErr(ui.linkImportErrEmpty);
        return false;
      }
      const normalized = opts?.commerceLayout
        ? normalizeCommerceHtmlForQuill(html)
        : normalizeVisionHtmlForQuill(html);
      if (!isVisionReplicaHtmlInsertable(normalized)) {
        pageMsg.showErr(ui.linkImportErrEmpty);
        return false;
      }
      const current = quill.root.innerHTML;
      let next = normalized;
      if (opts?.replace === true) {
        next = normalized;
      } else if (opts?.replace === false) {
        next = isBodyHtmlEffectivelyEmpty(current) ? normalized : `${current}${normalized}`;
      } else {
        next = isBodyHtmlEffectivelyEmpty(current) ? normalized : `${current}${normalized}`;
      }

      if (opts?.preserveLayout) {
        if (opts?.commerceLayout) {
          const len = quill.getLength();
          if (len > 1) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill 1.3 deleteText
            (quill as any).deleteText(0, len - 1, "silent");
          }
          quill.clipboard.dangerouslyPasteHTML(next, "silent");
          if (!isVisionReplicaHtmlInsertable(next)) {
            pageMsg.showErr(ui.linkImportQuillReject);
            return false;
          }
          setBodyHtml(next);
          return true;
        }
        quill.root.innerHTML = next;
        if (!isVisionReplicaHtmlInsertable(quill.root.innerHTML)) {
          pageMsg.showErr(ui.linkImportQuillReject);
          return false;
        }
        // 电商 table 行：保留生成 HTML，避免 Quill 读回时拆成竖排 blockquote
        setBodyHtml(opts?.commerceLayout ? next : quill.root.innerHTML);
        return true;
      }

      if (opts?.replace === true || isBodyHtmlEffectivelyEmpty(current)) {
        const len = quill.getLength();
        if (len > 1) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Quill 1.3 deleteText
          (quill as any).deleteText(0, len, "silent");
        }
      }
      quill.clipboard.dangerouslyPasteHTML(next, "silent");
      const inserted = quill.root.innerHTML;
      if (!isVisionReplicaHtmlInsertable(inserted)) {
        pageMsg.showErr(ui.linkImportQuillReject);
        return false;
      }
      setBodyHtml(inserted);
      return true;
    },
    [pageMsg, ui.linkImportErrEmpty, ui.linkImportQuillReject]
  );

  /** 正文 Quill 挂载后：视频/图片交互（不改 Snow 工具栏） */
  useEffect(() => {
    let cleanupVideo: (() => void) | undefined;
    let cleanupImage: (() => void) | undefined;
    const t = window.setTimeout(() => {
      try {
        const q = quillRef.current?.getEditor();
        if (!q) return;
        cleanupVideo = attachQuillVideoResize(q);
        cleanupImage = attachQuillImageInteract(q, {
          labels: {
            enlarge: ui.quillImageEnlarge,
            shrink: ui.quillImageShrink,
            crop: ui.quillImageCrop,
            replace: ui.quillImageReplace,
            cropTitle: ui.quillImageCropTitle,
            cropCancel: ui.quillImageCropCancel,
            cropConfirm: ui.quillImageCropConfirm,
            cropHint: ui.quillImageCropHint
          },
          uploadBlob: async (blob, filename) => {
            const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
            const limitErr = checkBodyInlineMediaUpload(file, "image");
            if (limitErr) {
              pageMsg.showErr(limitErr);
              throw new Error(limitErr);
            }
            const up = await uploadFile(file, "inline");
            return toAbsoluteEmailAssetUrl(up.url);
          },
          onHtmlChange: () => setBodyHtml(q.root.innerHTML)
        });
      } catch {
        /* 切换模版重建编辑器时可能尚未就绪 */
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
      cleanupVideo?.();
      cleanupImage?.();
    };
  }, [selectedId, ui, uploadFile, checkBodyInlineMediaUpload, pageMsg]);

  const runApplyStarterPreset = useCallback(async (preset: EmailStarterPreset) => {
    setPresetConfirm(null);
    try {
      const r = await apiJson<{ ok: boolean; nextName: string }>("/api/email/templates/meta/next-name");
      setSelectedId(null);
      setMeta((m) => ({
        ...m,
        name: r.nextName,
        subject: preset.subjectHint
      }));
      setBodyHtml(preset.bodyHtml);
      setActiveStarterPresetId(preset.id);
      setAssets({ documents: [], attachmentImages: [] });
      setSignatureHtml(EMPTY_QUILL);
      setPreviewOpen(false);
      window.requestAnimationFrame(() => {
        editorCanvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e: unknown) {
      pageMsg.showErr(errMsg(e));
    }
  }, [pageMsg]);

  const requestApplyStarterPreset = useCallback(
    (preset: EmailStarterPreset) => {
      if (!isBodyHtmlEffectivelyEmpty(bodyHtml)) {
        setPresetConfirm(preset);
        return;
      }
      void runApplyStarterPreset(preset);
    },
    [bodyHtml, runApplyStarterPreset]
  );

  function addNewTemplateTag() {
    const tagErr = ui.validateTag(newTagDraft);
    if (tagErr) {
      pageMsg.showErr(tagErr);
      return;
    }
    const tag = newTagDraft.trim();
    if (!tag) {
      pageMsg.showErr(ui.errEnterTagName);
      return;
    }
    setSessionCustomTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setMeta((m) => ({ ...m, category: tag }));
    setNewTagDraft("");
    pageMsg.showOk(ui.tagAdded(tag));
  }

  function readBodyHtmlFromEditor(): string {
    try {
      const html = quillRef.current?.getEditor().root.innerHTML;
      if (html && html.trim()) return html;
    } catch {
      /* Quill 未就绪时用 state */
    }
    return bodyHtml;
  }

  function readSignatureHtmlFromEditor(): string {
    try {
      const html = signatureQuillRef.current?.getEditor().root.innerHTML;
      if (html && html.trim()) return html;
    } catch {
      /* ignore */
    }
    return signatureHtml;
  }

  async function polishBodyWithAi() {
    const subject = meta.subject.trim();
    setAiPolishFeedback(null);
    if (!subject) {
      const msg = locale === "en" ? "Enter a subject before AI content optimization." : "请先填写邮件标题，再使用 AI 内容优化。";
      setAiPolishFeedback({ kind: "error", message: msg });
      pageMsg.showErr(msg);
      return;
    }
    const liveBody = readBodyHtmlFromEditor();
    const textOnly = liveBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!textOnly && !/<img|<video|<table/i.test(liveBody)) {
      const msg = locale === "en" ? "Add email body content before AI content optimization." : "请先填写邮件正文，再使用 AI 内容优化。";
      setAiPolishFeedback({ kind: "error", message: msg });
      pageMsg.showErr(msg);
      return;
    }
    setAiPolishing(true);
    setAiPolishFeedback({ kind: "info", message: locale === "en" ? "AI is reviewing and polishing the body..." : "AI 正在核查并润色正文..." });
    try {
      const resp = await postAgentBrainEmailTemplatePolishBody({
        templateName: meta.name.trim() || undefined,
        category: meta.category.trim() || undefined,
        subject,
        bodyHtml: liveBody,
        locale: locale === "en" ? "en" : "zh"
      });
      if (!resp.ok || !resp.bodyHtml?.trim()) {
        throw new Error(resp.message || (locale === "en" ? "AI returned empty content." : "AI 未返回正文。"));
      }
      if (resp.subject?.trim()) {
        setMeta((m) => ({ ...m, subject: resp.subject!.trim() }));
      }
      let inserted = insertBodyEditorHtml(resp.bodyHtml, { replace: true, preserveLayout: true });
      if (!inserted) {
        inserted = insertBodyEditorHtml(resp.bodyHtml, { replace: true });
      }
      if (!inserted) {
        const quill = quillRef.current?.getEditor();
        if (quill) {
          quill.root.innerHTML = resp.bodyHtml;
        }
        setBodyHtml(resp.bodyHtml);
      }
      const okMsg = resp.note || (locale === "en" ? "AI content optimization complete." : "AI 内容优化完成。");
      setAiPolishFeedback({ kind: "success", message: okMsg });
      pageMsg.showOk(okMsg);
      editorCanvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: unknown) {
      const msg = errMsg(e);
      setAiPolishFeedback({ kind: "error", message: msg });
      pageMsg.showErr(msg);
    } finally {
      setAiPolishing(false);
    }
  }

  function buildPayload(nameOverride?: string) {
    const name = (nameOverride ?? meta.name).trim();
    const liveBody = readBodyHtmlFromEditor();
    const liveSig = readSignatureHtmlFromEditor();
    return {
      name,
      category: meta.category.trim() || undefined,
      businessLine: "all" as const,
      subjectTemplate: meta.subject,
      bodyHtml: wrapBodyWithBackground(liveBody, bodyBgColor),
      fontStack: DEFAULT_FONT_STACK,
      groupIds,
      scheduleEnabled: scheduleSnapshot.enabled,
      scheduledAt:
        scheduleSnapshot.enabled && scheduleSnapshot.at ? scheduleSnapshot.at : null,
      signatureMode: "custom" as const,
      signaturePresetKey: null,
      signatureHtml: liveSig,
      assets: {
        documents: assets.documents,
        attachmentImages: assets.attachmentImages
      }
    };
  }

  async function saveTemplate() {
    const tagErr = ui.validateTag(meta.category);
    if (tagErr) {
      pageMsg.showErr(tagErr);
      return;
    }
    const nextName = meta.name.trim();
    if (!nextName) {
      pageMsg.showErr(ui.errNameBeforeSave);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(nextName);
      if (selectedId) {
        await apiJson(`/api/email/templates/${selectedId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        const r = await apiJson<{ ok: boolean; id: number }>("/api/email/templates", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setSelectedId(r.id);
      }
      await refreshList();
      setActiveStarterPresetId(null);
      pageMsg.showOk(ui.savedTemplate);
    } catch (e: unknown) {
      pageMsg.showErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  /** 始终在库里新增一条（POST），不覆盖当前选中的模版；适合改主题/标签/正文后当作新模版保留 */
  async function saveTemplateAsNew() {
    const tagErr = ui.validateTag(meta.category);
    if (tagErr) {
      pageMsg.showErr(tagErr);
      return;
    }
    const nextName = meta.name.trim();
    if (!nextName) {
      pageMsg.showErr(ui.errNameBeforeSaveAs);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(nextName);
      const r = await apiJson<{ ok: boolean; id: number }>("/api/email/templates", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setSelectedId(r.id);
      await refreshList();
      setActiveStarterPresetId(null);
      pageMsg.showOk(ui.savedAsNew);
    } catch (e: unknown) {
      pageMsg.showErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function startNewTemplate() {
    setActiveStarterPresetId(null);
    setSelectedId(null);
    const r = await apiJson<{ ok: boolean; nextName: string }>("/api/email/templates/meta/next-name");
    setMeta((m) => ({
      ...m,
      name: r.nextName,
      category: "",
      subject: ui.defaultSubject
    }));
    setBodyHtml(EMPTY_QUILL);
    setBodyBgPreset("neutral");
    setBodyBgDepth(12);
    setAssets({ documents: [], attachmentImages: [] });
    setGroupIds([]);
    setScheduleSnapshot({ enabled: false, at: null });
    setSignatureHtml(EMPTY_QUILL);
    setPreviewOpen(false);
    setTestEmail("");
    setNewTagDraft("");
    setDeleteConfirm(null);
    setPresetConfirm(null);
  }

  return (
    <PageShell
      title={ui.pageTitle}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            disabled={saving}
            onClick={() => {
              void (async () => {
                try {
                  await startNewTemplate();
                  pageMsg.showOk(ui.newBlankTemplate);
                } catch (e: unknown) {
                  pageMsg.showErr(errMsg(e));
                }
              })();
            }}
          >
            {ui.newTemplate}
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void saveTemplate()}
          >
            {saving ? ui.saving : ui.saveTemplate}
          </button>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            disabled={saving}
            onClick={() => void saveTemplateAsNew()}
          >
            {ui.saveAsNew}
          </button>
        </div>
      }
    >
      <PageFeedbackLine feedback={pageMsg.feedback} className="mb-3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left — 模版信息 + 模版库；窄屏时排在第二 */}
        <div className="order-2 space-y-4 lg:order-none lg:col-span-4">
          <SectionCard title={ui.metaSectionTitle}>
            <div className="flex flex-col gap-5">
              <label className="flex min-w-0 flex-col">
                <span className="text-sm font-medium leading-5 text-slate-800">
                  {ui.templateNameLabel} <span className="text-red-500">*</span>
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  placeholder={ui.templateNamePlaceholder}
                  value={meta.name}
                  onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
                />
              </label>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium leading-5 text-slate-800">{ui.templateTagLabel}</span>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    maxLength={MAX_TEMPLATE_TAG_LEN}
                    placeholder={ui.newTagPlaceholder}
                    value={newTagDraft}
                    onChange={(e) => setNewTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNewTemplateTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-10 shrink-0 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 sm:w-auto"
                    onClick={() => addNewTemplateTag()}
                  >
                    {ui.addTag}
                  </button>
                </div>
                <div className="mt-1 flex justify-end text-[11px] text-slate-400 tabular-nums">
                  {[...newTagDraft].length}/{MAX_TEMPLATE_TAG_LEN}
                </div>
                <label className="mt-3 grid gap-1">
                  <span className="text-xs font-medium text-slate-600">{ui.selectTagLabel}</span>
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    maxLength={MAX_TEMPLATE_TAG_LEN}
                    placeholder={ui.tagOptionalPlaceholder}
                    list="email-template-tag-suggestions"
                    value={meta.category}
                    onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}
                  />
                  <datalist id="email-template-tag-suggestions">
                    {allKnownTemplateTags.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                  <div className="flex justify-end text-[11px] text-slate-400 tabular-nums">
                    {[...meta.category].length}/{MAX_TEMPLATE_TAG_LEN}
                  </div>
                </label>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={ui.starterPresetsTitle}>
            <EmailStarterPresetsSection
              activeStarterPresetId={activeStarterPresetId}
              presetConfirm={presetConfirm}
              onCancelConfirm={() => setPresetConfirm(null)}
              onConfirmApply={() => {
                if (presetConfirm) void runApplyStarterPreset(presetConfirm);
              }}
              onRequestApply={requestApplyStarterPreset}
            />
          </SectionCard>

          <SectionCard
            title={ui.libraryTitle}
            right={
              <span className="text-xs text-slate-500">
                {ui.libraryCount(filteredTemplateItems.length, items.length)}
              </span>
            }
          >
            <div className="flex min-h-[min(72vh,760px)] flex-col rounded-2xl border-2 border-slate-300 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100/90 p-4 shadow-inner">
              <div className="shrink-0 space-y-3 border-b border-slate-200/80 pb-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-slate-700">{ui.librarySearchLabel}</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:border-slate-400 focus:ring-2"
                    placeholder={ui.librarySearchPlaceholder}
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="shrink-0 text-xs font-medium text-slate-600">{ui.filterByTag}</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 sm:max-w-xs"
                    value={listTagFilter}
                    onChange={(e) => setListTagFilter(e.target.value)}
                  >
                    <option value="">{ui.allTags}</option>
                    {allKnownTemplateTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200/90 bg-white/70 p-4">
                {items.length === 0 ? (
                  <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
                    {ui.libraryEmpty}
                  </div>
                ) : items.length > 0 && filteredTemplateItems.length === 0 ? (
                  <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-10 text-center text-sm text-amber-950/80">
                    {ui.libraryNoMatch}
                  </div>
                ) : (
                  <div className={TEMPLATE_LIBRARY_SCROLL_CLASS}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {filteredTemplateItems.map((t, folderIndex) => {
                      const tagText = t.category?.trim() ? t.category.trim() : "";
                      const selected = selectedId === t.id;
                      const bodyTint = TEMPLATE_FOLDER_BODY_TINTS[folderIndex % TEMPLATE_FOLDER_BODY_TINTS.length];
                      return (
                        <div
                          key={t.id}
                          className={
                            selected
                              ? "overflow-hidden rounded-xl border-2 border-slate-900 shadow-lg ring-2 ring-slate-900/15"
                              : "overflow-hidden rounded-xl border border-slate-300/90 bg-white shadow-md"
                          }
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-amber-200/70 bg-gradient-to-r from-amber-100/90 to-amber-50 px-2.5 py-1.5">
                            <span className="text-[11px] font-semibold text-amber-950/80">{ui.folderBadge}</span>
                            <span className="shrink-0 rounded bg-white/90 px-1 py-0.5 font-mono text-[9px] leading-none text-slate-600">
                              #{t.id}
                            </span>
                          </div>
                          <div className={`space-y-2 px-3 pb-2.5 pt-2 text-left ${bodyTint}`}>
                            <div className="text-3xl leading-none text-amber-900/90" aria-hidden>
                              📂
                            </div>
                            <dl className="space-y-1 text-[10px] leading-snug">
                              <div>
                                <dt className="font-medium text-slate-500">{ui.nameLabel}</dt>
                                <dd className="mt-0.5 min-w-0 truncate font-medium text-slate-900" title={t.name}>
                                  {t.name}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-medium text-slate-500">{ui.tagLabel}</dt>
                                <dd className="mt-0.5 min-w-0 truncate text-slate-700" title={tagText || undefined}>
                                  {tagText || "—"}
                                </dd>
                              </div>
                            </dl>
                            <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-0.5 border-t border-slate-200/60 pt-2 text-[10px]">
                              <button
                                type="button"
                                className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                                onClick={() => openLibraryPreviewModal(t.id)}
                              >
                                {ui.preview}
                              </button>
                              <button
                                type="button"
                                className="font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
                                onClick={() => loadDetail(t.id)}
                              >
                                {ui.openEdit}
                              </button>
                              {deleteConfirm?.id === t.id ? (
                                <div className="w-full min-w-0 pt-1">
                                  <InlineConfirmBar
                                    className="text-left"
                                    message={ui.deleteConfirm(t.name)}
                                    busy={deletingId === t.id}
                                    onCancel={() => setDeleteConfirm(null)}
                                    onConfirm={() => void confirmDeleteTemplate()}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="font-medium text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-900 disabled:opacity-50"
                                  disabled={deletingId != null}
                                  onClick={() => setDeleteConfirm({ id: t.id, name: t.name })}
                                >
                                  {ui.delete}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right — 窄屏时优先展示主题、正文与签名 */}
        <div className="order-1 space-y-4 lg:order-none lg:col-span-8">
          <SectionCard title={ui.subjectSectionTitle}>
            <Field label={ui.subjectFieldLabel} value={meta.subject} onChange={(v) => setMeta((m) => ({ ...m, subject: v }))} />
          </SectionCard>

          <div className="rounded-lg border border-slate-200 bg-white">
            <EmailTemplateBodySectionHeader
              ui={ui}
              bodyBgPreset={bodyBgPreset}
              bodyBgDepth={bodyBgDepth}
              onBodyBgPreset={setBodyBgPreset}
              onBodyBgDepth={setBodyBgDepth}
            />
            <div className="p-4">
            <EmailTemplateAiGeneratePanel
              ui={ui}
              onTemplateSaved={async (templateId) => {
                await refreshList();
                await loadDetail(templateId);
              }}
              onError={(message) => pageMsg.showErr(message)}
              onSuccess={(message) => {
                pageMsg.showOk(message);
              }}
            />
            <EmailCommerceAssistantPanel
              ui={ui}
              uploadFile={(file) => uploadFile(file, "inline")}
              onInsertHtml={insertBodyEditorHtml}
              onError={(message) => pageMsg.showErr(message)}
              onSuccess={(message) => {
                pageMsg.showOk(message);
                editorCanvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
            <input
              ref={imagePickerRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const limitErr = checkBodyInlineMediaUpload(file, "image");
                if (limitErr) {
                  pageMsg.showErr(limitErr);
                  return;
                }
                const up = await uploadFile(file, "inline").catch((err) => {
                  pageMsg.showErr(errMsg(err));
                  return null;
                });
                if (!up) return;
                const quill = quillRef.current?.getEditor();
                if (!quill) return;
                const range = quill.getSelection(true);
                const index = range?.index ?? Math.max(0, quill.getLength() - 1);
                quill.insertEmbed(index, "image", toAbsoluteEmailAssetUrl(up.url));
              }}
            />
            <input
              ref={bodyVideoPickerRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!file.type.startsWith("video/")) {
                  pageMsg.showErr(ui.errVideoFile);
                  return;
                }
                const limitErr = checkBodyInlineMediaUpload(file, "video");
                if (limitErr) {
                  pageMsg.showErr(limitErr);
                  return;
                }
                const up = await uploadFile(file, "inline").catch((err) => {
                  pageMsg.showErr(errMsg(err));
                  return null;
                });
                if (!up) return;
                const quill = quillRef.current?.getEditor();
                if (!quill) return;
                const range = quill.getSelection(true);
                const index = range?.index ?? Math.max(0, quill.getLength() - 1);
                quill.insertEmbed(index, "emailHtmlVideo", toAbsoluteEmailAssetUrl(up.url), "user");
                quill.setSelection(index + 1, 0, "user");
              }}
            />
            <div className="mb-2 flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50/90 px-2.5 py-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-slate-700">{ui.bodyMediaLabel}</span>
                <button
                  type="button"
                  className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100"
                  onClick={() => bodyVideoPickerRef.current?.click()}
                >
                  {ui.localVideo}
                </button>
              </div>
              <p className="text-[11px] leading-snug text-slate-500">{ui.bodyMediaHint}</p>
              <p className="text-[11px] leading-snug text-slate-500">{ui.bodyMediaVideoFormats}</p>
            </div>
            <div ref={editorCanvasRef} className="rounded-xl bg-slate-100/90 p-4 ring-1 ring-slate-200/80">
              {/* QUILL_LOCK：EmailTemplateQuillField 内含 Snow 工具栏；勿用 flex 包内部 Quill 根 */}
              <div
                className="mx-auto w-full max-w-[600px] overflow-visible rounded-lg border border-slate-200 shadow-md"
                style={{ backgroundColor: bodyBgColor }}
              >
                <EmailTemplateQuillField
                  key={`body-${selectedId ?? "new"}`}
                  ref={quillRef}
                  className="email-quill-body border-0 [&_.ql-toolbar]:overflow-visible [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:bg-slate-50/95 [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[min(60vh,28rem)] [&_.ql-editor]:bg-transparent [&_.ql-editor]:px-4 [&_.ql-editor]:py-4 [&_.ql-editor]:text-[15px] [&_.ql-editor]:leading-relaxed"
                  value={bodyHtml}
                  onChange={setBodyHtml}
                  triggerImagePicker={() => imagePickerRef.current?.click()}
                />
              </div>
              <div className="mx-auto mt-2 flex w-full max-w-[600px] flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-950">
                    {locale === "en" ? "AI content optimization" : "AI 内容优化"}
                  </p>
                  {aiPolishFeedback ? (
                    <p
                      className={`mt-0.5 text-[11px] leading-snug ${
                        aiPolishFeedback.kind === "success"
                          ? "text-emerald-800"
                          : aiPolishFeedback.kind === "error"
                            ? "text-red-700"
                            : "text-violet-800"
                      }`}
                    >
                      {aiPolishFeedback.message}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] leading-snug text-emerald-800">
                      {locale === "en"
                        ? "Optimize the current subject and body with the activated AI agent."
                        : "点击后 AI 会核查当前正文并直接写回编辑框。"}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  disabled={aiPolishing || saving}
                  onClick={() => void polishBodyWithAi()}
                >
                  {aiPolishing
                    ? locale === "en"
                      ? "Optimizing..."
                      : "优化中..."
                    : locale === "en"
                      ? "AI content optimize"
                      : "AI 内容优化"}
                </button>
              </div>
              </div>
            </div>
          </div>

          <SectionCard
            title={ui.signatureTitle}
            description={ui.signatureDescription}
            right={
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => setSignatureOpen((v) => !v)}
              >
                {signatureOpen ? ui.commerceCollapse : ui.commerceOpen}
              </button>
            }
          >
            <p className="mb-2 text-[11px] text-slate-500">{ui.signatureOptionalNote}</p>
            <p className="mb-2 text-[11px] text-emerald-800">{ui.signatureBgSyncNote}</p>
            {signatureOpen ? (
            <>
            <input
              ref={signatureImagePickerRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const up = await uploadFile(file, "inline").catch((err) => {
                  pageMsg.showErr(errMsg(err));
                  return null;
                });
                if (!up) return;
                const quill = signatureQuillRef.current?.getEditor();
                if (!quill) return;
                const range = quill.getSelection(true);
                const index = range?.index ?? Math.max(0, quill.getLength() - 1);
                quill.insertEmbed(index, "image", toAbsoluteEmailAssetUrl(up.url));
              }}
            />
            <div
              className="rounded-md border border-slate-200 shadow-sm"
              style={{ backgroundColor: bodyBgColor }}
            >
            <EmailTemplateQuillField
              key={`sig-${selectedId ?? "new"}`}
              ref={signatureQuillRef}
              className="email-quill-signature rounded-md border-0 [&_.ql-toolbar]:overflow-visible [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:bg-slate-50/95 [&_.ql-editor]:bg-transparent"
              value={signatureHtml}
              onChange={setSignatureHtml}
              triggerImagePicker={() => signatureImagePickerRef.current?.click()}
            />
            </div>
            </>
            ) : null}
          </SectionCard>

          <SectionCard title={ui.previewTestTitle} description={ui.previewTestDescription}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? ui.collapsePreview : ui.openPreview}
              </button>
            </div>

            {previewOpen ? (
              <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {ui.previewSubjectPrefix}
                  {meta.subject || ui.previewSubjectEmpty}
                </div>
                <div
                  className={`max-h-[min(70vh,520px)] overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm [&_a]:text-blue-600 [&_a]:underline [&_p]:my-2 ${PREVIEW_QUILL_RENDER_CLASS}`}
                >
                  {/* eslint-disable-next-line react/no-danger */}
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <div className="font-medium text-slate-800">{ui.previewAttachmentsTitle}</div>
                  {assets.documents.length + assets.attachmentImages.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {assets.documents.map((a) => (
                        <li key={`pv-doc-${a.url}`}>
                          <a className="text-blue-600 underline" href={a.url} target="_blank" rel="noreferrer">
                            {a.name}
                          </a>
                        </li>
                      ))}
                      {assets.attachmentImages.map((a) => (
                        <li key={`pv-img-${a.url}`}>
                          <a className="text-blue-600 underline" href={a.url} target="_blank" rel="noreferrer">
                            {a.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-slate-500">{ui.previewNoAttachments}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{ui.previewHint}</p>
            )}

            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="text-sm font-medium text-slate-800">{ui.sendTestTitle}</div>
              <p className="mt-1 text-xs text-slate-500">{ui.sendTestDescription}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  className="w-full max-w-md rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button
                  type="button"
                  disabled={testSending}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                  onClick={async () => {
                    const to = testEmail.trim();
                    const showTestErr = (text: string) => {
                      setTestSendLine({ kind: "err", text });
                      pageMsg.showErr(text);
                    };
                    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
                      showTestErr(ui.errValidRecipient);
                      return;
                    }
                    const textOnly = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                    if (!textOnly) {
                      showTestErr(ui.errBodyRequired);
                      return;
                    }
                    if (!meta.subject.trim()) {
                      showTestErr(ui.errSubjectRequired);
                      return;
                    }
                    setTestSendLine(null);
                    setTestSending(true);
                    try {
                      const liveBody = readBodyHtmlFromEditor();
                      const testBody: Record<string, unknown> = {
                        to,
                        subject: meta.subject.trim(),
                        bodyHtml: wrapBodyWithBackground(liveBody, bodyBgColor),
                        signatureHtml,
                        assets: {
                          documents: assets.documents,
                          attachmentImages: assets.attachmentImages
                        }
                      };
                      if (selectedId != null && selectedId > 0) {
                        testBody.templateId = selectedId;
                      }
                      await apiJson<{ ok: boolean }>("/api/email/test-send", {
                        method: "POST",
                        body: JSON.stringify(testBody)
                      });
                      setTestSendLine({ kind: "ok", text: ui.testSent });
                      pageMsg.showOk(ui.testSent);
                    } catch (e: unknown) {
                      const text = errMsg(e);
                      setTestSendLine({ kind: "err", text });
                      pageMsg.showErr(text);
                    } finally {
                      setTestSending(false);
                    }
                  }}
                >
                  {testSending ? ui.sending : ui.sendTest}
                </button>
              </div>
              {testSendLine ? (
                <p
                  className={`mt-2 text-sm font-semibold ${
                    testSendLine.kind === "ok" ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {testSendLine.text}
                </p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title={ui.attachmentsTitle}>
            <p className="text-xs text-slate-600">{ui.attachmentsIntro}</p>
            <p className="mt-1 text-xs text-amber-700">{ui.attachmentsSaveHint}</p>

            <input
              ref={docInputRef}
              type="file"
              className="hidden"
              accept={DOC_ATTACH_ACCEPT}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const up = await uploadFile(file, "doc").catch((err) => {
                  pageMsg.showErr(errMsg(err));
                  return null;
                });
                if (!up) return;
                const name = preferReadableAttachName(file.name, up.name);
                setAssets((a) => ({
                  ...a,
                  documents: [...a.documents, { url: up.url, name, mime: up.mime, size: up.size }].slice(0, MAX_DOCS)
                }));
              }}
            />
            <input
              ref={imgAttachInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const up = await uploadFile(file, "image_attach").catch((err) => {
                  pageMsg.showErr(errMsg(err));
                  return null;
                });
                if (!up) return;
                const name = preferReadableAttachName(file.name, up.name);
                setAssets((a) => ({
                  ...a,
                  attachmentImages: [...a.attachmentImages, { url: up.url, name, mime: up.mime, size: up.size }].slice(
                    0,
                    MAX_IMG_ATTACH
                  )
                }));
              }}
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                onClick={() => {
                    if (assets.documents.length >= MAX_DOCS) {
                    pageMsg.showErr(ui.errDocsMax(MAX_DOCS));
                    return;
                  }
                  docInputRef.current?.click();
                }}
              >
                {ui.uploadDocument}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                onClick={() => {
                  if (assets.attachmentImages.length >= MAX_IMG_ATTACH) {
                    pageMsg.showErr(ui.errImagesMax(MAX_IMG_ATTACH));
                    return;
                  }
                  imgAttachInputRef.current?.click();
                }}
              >
                {ui.uploadAttachmentImage}
              </button>
            </div>

            {assets.documents.length > 0 ? (
              <div className="mt-4">
                <div className="text-sm font-medium text-slate-800">{ui.selectedDocuments(assets.documents.length, MAX_DOCS)}</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {assets.documents.map((a) => (
                    <li key={a.url} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
                      <a className="text-slate-900 underline" href={a.url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => setAssets((x) => ({ ...x, documents: x.documents.filter((d) => d.url !== a.url) }))}
                      >
                        {ui.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {assets.attachmentImages.length > 0 ? (
              <div className="mt-4">
                <div className="text-sm font-medium text-slate-800">
                  {ui.attachmentImages(assets.attachmentImages.length, MAX_IMG_ATTACH)}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {assets.attachmentImages.map((a) => (
                    <li key={a.url} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
                      <a className="text-slate-900 underline" href={a.url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() =>
                          setAssets((x) => ({ ...x, attachmentImages: x.attachmentImages.filter((d) => d.url !== a.url) }))
                        }
                      >
                        {ui.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>

      {libraryPreview.open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={ui.previewDialogLabel}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLibraryPreview({
                open: false,
                loading: false,
                name: "",
                subject: "",
                html: "",
                documents: [],
                attachmentImages: []
              });
            }
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{ui.emailPreview}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {libraryPreview.name || ui.templateFallbackName}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() =>
                  setLibraryPreview({
                    open: false,
                    loading: false,
                    name: "",
                    subject: "",
                    html: "",
                    documents: [],
                    attachmentImages: []
                  })
                }
              >
                {ui.close}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4">
              {libraryPreview.loading ? (
                <div className="py-16 text-center text-sm text-slate-500">{ui.loading}</div>
              ) : (
                <div className="mx-auto w-full max-w-[600px] rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-2 py-0.5 text-center text-[10px] text-slate-400">
                    {ui.previewWidthHint}
                  </div>
                  <div className="border-b border-slate-100 px-4 py-3">
                    <div className="text-[11px] text-slate-400">{ui.previewSubjectLine}</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {libraryPreview.subject || ui.noSubject}
                    </div>
                  </div>
                  <div
                    className={`px-4 py-4 text-sm leading-relaxed text-slate-800 [&_a]:text-blue-600 [&_a]:underline [&_p]:my-2 ${PREVIEW_QUILL_RENDER_CLASS}`}
                  >
                    {/* eslint-disable-next-line react/no-danger */}
                    <div dangerouslySetInnerHTML={{ __html: libraryPreview.html }} />
                  </div>
                  <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-700">
                    <div className="font-medium text-slate-800">{ui.previewAttachmentsTitle}</div>
                    {libraryPreview.documents.length + libraryPreview.attachmentImages.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {libraryPreview.documents.map((a) => (
                          <li key={`lib-doc-${a.url}`}>
                            <a className="text-blue-600 underline" href={a.url} target="_blank" rel="noreferrer">
                              {a.name}
                            </a>
                          </li>
                        ))}
                        {libraryPreview.attachmentImages.map((a) => (
                          <li key={`lib-img-${a.url}`}>
                            <a className="text-blue-600 underline" href={a.url} target="_blank" rel="noreferrer">
                              {a.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-slate-500">{ui.previewNoAttachments}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-slate-700">{props.label}</span>
      {props.hint ? <span className="text-xs text-slate-500">{props.hint}</span> : null}
      <input
        className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
