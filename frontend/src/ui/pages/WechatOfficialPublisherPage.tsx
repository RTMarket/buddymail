import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiJson, apiJsonWithTimeout } from "../../lib/api";
import { wechatOfficialAccountLimit } from "../../lib/wechatOfficialEntitlement";
import { WechatAccountStudio } from "./WechatAccountStudio";
import { postAgentBrainWechatReviseArticle } from "../../lib/standaloneAgentBrainApi";
import {
  defaultWechatArticleHtml,
  countWechatHtmlImages,
  countWechatTextChars,
  ensureWechatImageDisplayHtml,
  prepareWechatContentHtmlForSync
} from "../../lib/wechatArticleHtml";
import { registerWechatArticleLink } from "../../lib/wechatArticleRegistry";
import { buildWechatArticleEmailPrefill } from "../../lib/wechatArticleEmailReuse";
import { useWechatArticleStatsSync, useWechatArticleStatsMap, type WechatArticleStatsSnapshot } from "../../lib/useWechatArticleEmailStats";
import {
  WECHAT_LS_DRAFTS,
  WECHAT_OPEN_DRAFT_ID,
  type WechatDraftRecord,
  createWechatDraftId,
  prependWechatReadingGrowthWatchUrl,
  readWechatJson,
  readWechatReadingGrowthWatchUrls,
  writeWechatJson
} from "../../lib/wechatPublisherStorage";
import { useProductModules } from "../../state/ProductModulesContext";
import { WechatEmailTemplateCreateModal } from "../components/wechat/WechatEmailTemplateCreateModal";
import { WechatArticleRichEditor } from "../components/wechat/WechatArticleRichEditor";
import { WechatArticleCoverField } from "../components/wechat/WechatArticleCoverField";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { marked } from "marked";

type View = "accounts" | "dashboard" | "compose" | "publish" | "reuse" | "growth" | "drafts";

type WechatSettings = {
  configured: boolean;
  hint: string;
  appId: string;
  accountName?: string;
  author: string;
  thumbMediaId: string;
  updatedAt: string | null;
};

type RemoteDraft = {
  mediaId: string;
  title: string;
  digest: string;
  updateTime: string | null;
  thumbUrl: string | null;
};

type WechatScheduledPublishTask = {
  id: number;
  mediaId: string;
  localId: string | null;
  title: string;
  scheduledAt: string;
  status: "scheduled" | "running" | "published" | "failed";
  publishId: string | null;
  publishedAt: string | null;
  lastError: string | null;
  updatedAt?: string | null;
};

type WechatPublishDiagnostic = {
  mediaId: string;
  title: string;
  contentChars: number;
  imageCount: number;
  thumbMediaId: string;
  thumbUrl: string | null;
  hasProxyImage: boolean;
  canSubmit: boolean;
  issues: string[];
};

type WechatPublishStatus = {
  publishId: string;
  publishStatus: number | null;
  statusText: string;
  articleId: string;
  articleUrl: string;
  failIdx: number | null;
};

type RemotePublishedArticle = {
  id: string;
  publishId: string;
  title: string;
  digest: string;
  contentHtml: string;
  author: string;
  articleUrl: string;
  thumbUrl: string | null;
  publishedAt: string | null;
  updateTime: string | null;
};

function createId() {
  return createWechatDraftId();
}

function nowIso() {
  return new Date().toISOString();
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function localDatetimeValueToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const WECHAT_EMAIL_FONT_STACK =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

function currentWechatAccountLabel(settings?: WechatSettings | null): { accountId: string; accountName: string } {
  const appId = settings?.appId?.trim();
  return {
    accountId: appId || "default",
    accountName: settings?.accountName?.trim() || settings?.author?.trim() || (appId ? `公众号 ${appId.slice(0, 6)}...` : "当前公众号")
  };
}

function remotePublishedToDraft(
  article: RemotePublishedArticle,
  account: { accountId: string; accountName: string }
): WechatDraftRecord {
  const now = nowIso();
  return {
    id: article.id || createId(),
    title: article.title || "微信公众号文章",
    digest: article.digest || "",
    contentHtml: ensureWechatImageDisplayHtml(article.contentHtml || defaultWechatArticleHtml()),
    status: "published",
    publishId: article.publishId || undefined,
    publishedAt: article.publishedAt ?? article.updateTime ?? now,
    publishedArticleUrl: article.articleUrl || undefined,
    accountId: account.accountId,
    accountName: account.accountName,
    readCount: 0,
    emailDrivenReads: 0,
    emailSent: 0,
    emailClicks: 0,
    author: article.author || undefined,
    coverPreviewUrl: article.thumbUrl || undefined,
    createdAt: article.publishedAt ?? article.updateTime ?? now,
    updatedAt: article.updateTime ?? now
  };
}

function upsertPublishedDrafts(prev: WechatDraftRecord[], incoming: WechatDraftRecord[]): WechatDraftRecord[] {
  const byKey = new Map<string, WechatDraftRecord>();
  prev.forEach((item) => byKey.set(`${item.accountId || "default"}:${item.publishId || item.publishedArticleUrl || item.id}`, item));
  incoming.forEach((item) => {
    const key = `${item.accountId || "default"}:${item.publishId || item.publishedArticleUrl || item.id}`;
    const old = byKey.get(key);
    byKey.set(
      key,
      old
        ? {
            ...old,
            ...item,
            linkedEmailTemplateId: old.linkedEmailTemplateId,
            linkedEmailTemplateName: old.linkedEmailTemplateName
          }
        : item
    );
  });
  return Array.from(byKey.values()).sort((a, b) => Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt));
}

async function syncRemotePublishedArticlesIntoDrafts(
  settings: WechatSettings | null,
  setDrafts: (next: WechatDraftRecord[] | ((prev: WechatDraftRecord[]) => WechatDraftRecord[])) => void
): Promise<{ count: number; accountName: string }> {
  const account = currentWechatAccountLabel(settings);
  const resp = await apiJson<{ ok: boolean; articles?: RemotePublishedArticle[]; message?: string }>(
    "/api/wechat-official/published/remote"
  );
  if (!resp.ok) throw new Error(resp.message || "同步已发布文章失败");
  const incoming = (resp.articles ?? []).map((article) => remotePublishedToDraft(article, account));
  setDrafts((prev) => upsertPublishedDrafts(prev, incoming));
  incoming.forEach((article) => {
    if (article.publishedArticleUrl || article.publishId) void registerWechatArticleLink(article);
  });
  return { count: incoming.length, accountName: account.accountName };
}

async function importPublishedArticleUrlIntoDrafts(
  settings: WechatSettings | null,
  setDrafts: (next: WechatDraftRecord[] | ((prev: WechatDraftRecord[]) => WechatDraftRecord[])) => void,
  url: string,
  title?: string
): Promise<{ article: WechatDraftRecord; accountName: string }> {
  const account = currentWechatAccountLabel(settings);
  const resp = await apiJson<{ ok: boolean; article?: RemotePublishedArticle; message?: string }>(
    "/api/wechat-official/published/import-url",
    {
      method: "POST",
      body: JSON.stringify({ url: url.trim(), title: title?.trim() || undefined, accountName: account.accountName })
    }
  );
  if (!resp.ok || !resp.article) throw new Error(resp.message || "导入已发布文章链接失败");
  const article = remotePublishedToDraft(resp.article, account);
  setDrafts((prev) => upsertPublishedDrafts(prev, [article]));
  if (article.publishedArticleUrl || article.publishId) void registerWechatArticleLink(article);
  return { article, accountName: account.accountName };
}

function StatusPill(props: { tone: "green" | "amber" | "slate" | "rose" | "sky"; children: React.ReactNode }) {
  const cls =
    props.tone === "green"
      ? "bg-emerald-100 text-emerald-800"
      : props.tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : props.tone === "rose"
          ? "bg-rose-100 text-rose-800"
          : props.tone === "sky"
            ? "bg-sky-100 text-sky-800"
            : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{props.children}</span>;
}

function ActionButton(props: {
  children: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const base = props.primary
    ? "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-300"
    : props.danger
      ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`h-8 rounded-md px-3 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${base}`}
    >
      {props.children}
    </button>
  );
}

function useWechatDrafts() {
  const [drafts, setDraftsState] = useState<WechatDraftRecord[]>(() => readWechatJson(WECHAT_LS_DRAFTS, []));
  const setDrafts = useCallback((next: WechatDraftRecord[] | ((prev: WechatDraftRecord[]) => WechatDraftRecord[])) => {
    setDraftsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      writeWechatJson(WECHAT_LS_DRAFTS, resolved);
      return resolved;
    });
  }, []);
  return { drafts, setDrafts };
}

function useWechatSettings() {
  const [settings, setSettings] = useState<WechatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiJson<{ ok: boolean; settings?: WechatSettings }>("/api/wechat-official/settings");
      if (resp.ok && resp.settings) setSettings(resp.settings);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const hasCredentials = Boolean(settings?.appId && settings?.hint);
  const canSyncDraft = hasCredentials;
  return { settings, loading, refresh, configured: Boolean(hasCredentials && settings?.thumbMediaId), hasCredentials, canSyncDraft };
}

function PageFrame(props: { view: View; children: React.ReactNode }) {
  const accountLimit = wechatOfficialAccountLimit();
  if (accountLimit <= 0) return <Navigate to="/email/campaigns" replace />;
  const titles: Record<View, string> = {
    accounts: "公众号账号认证",
    dashboard: "推送数据看板",
    compose: "创建文章 · 同步草稿箱",
    publish: "提交正式发布",
    reuse: "内容复用中心",
    growth: "文章涨阅读量",
    drafts: "草稿箱"
  };
  const desc: Record<View, string> = {
    accounts: "可配置 2 个公众号。在本页写文章、套用模版，并提交到所选公众号的草稿箱。",
    dashboard: "查看已发布文章的阅读量、邮件导流点击等汇总数据。",
    compose: "撰写图文正文，插入排版组件，AI 优化后一键同步到微信公众号草稿箱。",
    publish: "浏览已在草稿箱中的文章，编辑确认后提交正式发布，并记录发布时间。",
    reuse: "已发布文章生成邮件模版，通过邮件营销导流回公众号（需组合套餐）。",
    growth: "粘贴公众号文章标题和链接，生成带追踪跳转的邮件模版。",
    drafts: "写好保存的草稿都在这里：查看每篇是否已提交到公众号草稿箱，一键提交未同步的草稿。"
  };
  return (
    <PageShell title={titles[props.view]} description={desc[props.view]}>
      {props.children}
    </PageShell>
  );
}

function FeedbackBanner(props: { tone: "ok" | "err"; children: React.ReactNode }) {
  const cls = props.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{props.children}</div>;
}

/** 账号认证 + 文章编辑 + 提交草稿箱 */
export function WechatOfficialAccountsPage() {
  return (
    <PageFrame view="accounts">
      <WechatAccountStudio />
    </PageFrame>
  );
}

/** 数据看板 */
export function WechatOfficialDashboardPage() {
  const { drafts, setDrafts } = useWechatDrafts();
  const { settings, refresh: refreshSettings } = useWechatSettings();
  const { isModuleActive } = useProductModules();
  useWechatArticleStatsSync(drafts, setDrafts, isModuleActive("email"));
  const [syncingPublished, setSyncingPublished] = useState(false);
  const [importingPublishedUrl, setImportingPublishedUrl] = useState(false);
  const [publishedUrlDraft, setPublishedUrlDraft] = useState("");
  const [publishedTitleDraft, setPublishedTitleDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"ok" | "err">("ok");
  const published = drafts.filter((d) => d.status === "published");
  const synced = drafts.filter((d) => d.status === "synced");
  const totals = useMemo(() => {
    return published.reduce(
      (acc, d) => {
        acc.reads += d.readCount ?? 0;
        acc.emailReads += d.emailDrivenReads ?? 0;
        acc.sent += d.emailSent ?? 0;
        acc.clicks += d.emailClicks ?? 0;
        return acc;
      },
      { reads: 0, emailReads: 0, sent: 0, clicks: 0 }
    );
  }, [published]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  async function syncPublishedForDashboard() {
    setSyncingPublished(true);
    setNotice("");
    try {
      const result = await syncRemotePublishedArticlesIntoDrafts(settings, setDrafts);
      setNoticeTone("ok");
      setNotice(
        result.count > 0
          ? `已同步「${result.accountName}」已发布文章 ${result.count} 篇。`
          : `微信接口返回「${result.accountName}」已发布文章 0 篇。若公众号后台确实已有文章，请粘贴文章链接，使用「导入已发布文章链接」。`
      );
    } catch (e: unknown) {
      setNoticeTone("err");
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setSyncingPublished(false);
    }
  }

  async function importPublishedUrlForDashboard() {
    setImportingPublishedUrl(true);
    setNotice("");
    try {
      const result = await importPublishedArticleUrlIntoDrafts(settings, setDrafts, publishedUrlDraft, publishedTitleDraft);
      setPublishedUrlDraft("");
      setPublishedTitleDraft("");
      setNoticeTone("ok");
      setNotice(`已导入「${result.accountName}」已发布文章链接：${result.article.title}`);
    } catch (e: unknown) {
      setNoticeTone("err");
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setImportingPublishedUrl(false);
    }
  }

  function removePublishedDashboardRecord(id: string) {
    setDrafts((prev) => prev.filter((item) => item.id !== id));
    setNoticeTone("ok");
    setNotice("已移除本地文章记录；不会删除微信公众号后台文章。");
  }

  return (
    <PageFrame view="dashboard">
      {notice ? (
        <div className="mb-3">
          <FeedbackBanner tone={noticeTone}>{notice}</FeedbackBanner>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "已正式发布", value: String(published.length), note: "含本地记录" },
          { label: "草稿箱待发布", value: String(synced.length), note: "已同步 media_id" },
          { label: "微信官方阅读", value: String(totals.reads), note: "与公众号后台同步（T+1）" },
          { label: "邮件带来阅读", value: String(totals.emailReads), note: `已发送 ${totals.sent} 封 · 邮件内点击 ${totals.clicks}` }
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-950">{item.value}</div>
            <div className="mt-1 text-[11px] text-slate-500">{item.note}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton disabled={syncingPublished} onClick={() => void syncPublishedForDashboard()}>
          {syncingPublished ? "同步中…" : `同步「${currentWechatAccountLabel(settings).accountName}」已发布文章`}
        </ActionButton>
        <span className="text-xs text-slate-500">当前列表按公众号账号槽记录来源，后续多账号会分别显示账号名称。</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={publishedUrlDraft}
          onChange={(e) => setPublishedUrlDraft(e.target.value)}
          placeholder="粘贴已发布公众号文章链接"
          className="h-8 min-w-[280px] flex-1 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
        />
        <input
          value={publishedTitleDraft}
          onChange={(e) => setPublishedTitleDraft(e.target.value)}
          placeholder="标题（可选）"
          className="h-8 w-48 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
        />
        <ActionButton disabled={importingPublishedUrl || !publishedUrlDraft.trim()} onClick={() => void importPublishedUrlForDashboard()}>
          {importingPublishedUrl ? "导入中…" : "导入已发布文章链接"}
        </ActionButton>
      </div>
      <SectionCard title="文章数据明细" description="微信阅读 = 官方阅读次数（同一人多次打开会累加）；邮件带来 = 点击文末「在公众号阅读」跳转次数（每 30 秒刷新）。">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">文章</th>
                <th className="px-3 py-2">来源账号</th>
                <th className="px-3 py-2">发布时间</th>
                <th className="px-3 py-2 text-right">微信阅读</th>
                <th className="px-3 py-2 text-right">邮件带来</th>
                <th className="px-3 py-2 text-right">邮件发送</th>
                <th className="px-3 py-2">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {published.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    暂无已发布文章。若微信同步返回 0，请先导入已发布文章链接。
                  </td>
                </tr>
              ) : (
                published.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-medium text-slate-900">{item.title}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{item.accountName || "当前公众号"}</td>
                    <td className="px-3 py-3 text-slate-600">{fmtTime(item.publishedAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.readCount ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-800">{item.emailDrivenReads ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.emailSent ?? 0}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <StatusPill tone="green">已发布</StatusPill>
                        <button
                          type="button"
                          onClick={() => removePublishedDashboardRecord(item.id)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          移除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PageFrame>
  );
}

/** 文章编辑器（创建 + 发布页复用） */
type ArticleEditorPatch = {
  title: string;
  digest: string;
  contentHtml: string;
  author: string;
  coverThumbMediaId?: string;
  coverPreviewUrl?: string;
  coverSquarePreviewUrl?: string;
  coverCropMode?: "wide" | "square";
  coverPicCrop2351?: string;
  coverPicCrop11?: string;
  mediaId?: string;
};

function ArticleEditorModal(props: {
  editorKey: string;
  initial: {
    title: string;
    digest: string;
    contentHtml: string;
    author?: string;
    coverThumbMediaId?: string;
    coverPreviewUrl?: string;
    coverSquarePreviewUrl?: string;
    coverCropMode?: "wide" | "square";
    coverPicCrop2351?: string;
    coverPicCrop11?: string;
    mediaId?: string;
  };
  defaultAuthor?: string;
  onClose: () => void;
  onSaved: (patch: ArticleEditorPatch) => void;
  syncLabel?: string;
  remoteSyncOnly?: boolean;
}) {
  const { settings, refresh: refreshSettings } = useWechatSettings();
  const editorFlushRef = useRef<(() => string) | null>(null);
  const [title, setTitle] = useState(props.initial.title);
  const [digest, setDigest] = useState(props.initial.digest);
  const [author, setAuthor] = useState(props.initial.author ?? props.defaultAuthor ?? "");
  const [contentHtml, setContentHtml] = useState(props.initial.contentHtml);
  const [coverThumbMediaId, setCoverThumbMediaId] = useState(props.initial.coverThumbMediaId);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(props.initial.coverPreviewUrl);
  const [coverSquarePreviewUrl, setCoverSquarePreviewUrl] = useState(props.initial.coverSquarePreviewUrl);
  const [coverCropMode, setCoverCropMode] = useState<"wide" | "square" | undefined>(props.initial.coverCropMode);
  const [coverPicCrop2351, setCoverPicCrop2351] = useState(props.initial.coverPicCrop2351);
  const [coverPicCrop11, setCoverPicCrop11] = useState(props.initial.coverPicCrop11);
  const [syncBusy, setSyncBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");
  const [remoteSyncVersion, setRemoteSyncVersion] = useState(0);
  const [remoteSyncMeta, setRemoteSyncMeta] = useState<{
    textChars: number;
    htmlChars: number;
    coverImages: number;
    bodyImages: number;
    at: string;
  } | null>(null);
  const busy = syncBusy || pullBusy;

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    setTitle(props.initial.title);
    setDigest(props.initial.digest);
    setAuthor(props.initial.author ?? props.defaultAuthor ?? "");
    setContentHtml(props.initial.contentHtml);
    setCoverThumbMediaId(props.initial.coverThumbMediaId);
    setCoverPreviewUrl(props.initial.coverPreviewUrl);
    setCoverSquarePreviewUrl(props.initial.coverSquarePreviewUrl);
    setCoverCropMode(props.initial.coverCropMode);
    setCoverPicCrop2351(props.initial.coverPicCrop2351);
    setCoverPicCrop11(props.initial.coverPicCrop11);
  }, [
    props.editorKey,
    props.initial.title,
    props.initial.digest,
    props.initial.contentHtml,
    props.initial.author,
    props.initial.coverThumbMediaId,
    props.initial.coverPreviewUrl,
    props.initial.coverSquarePreviewUrl,
    props.initial.coverCropMode,
    props.initial.coverPicCrop2351,
    props.initial.coverPicCrop11,
    props.defaultAuthor
  ]);

  function syncReadinessMessage(live?: WechatSettings | null): string | null {
    const s = live ?? settings;
    if (!s?.appId?.trim()) return "请先在「账号认证」页填写并保存 AppID。";
    if (!s?.hint) return "请先在「账号认证」页填写并保存 AppSecret。";
    if (!coverThumbMediaId?.trim() && !s?.thumbMediaId?.trim()) {
      return "同步草稿箱需要封面：请在本页「文章封面」上传图片。";
    }
    return null;
  }

  function buildSavePatch(mediaId?: string): ArticleEditorPatch {
    const flushed = editorFlushRef.current?.();
    const html = (flushed ?? contentHtml).trim() || defaultWechatArticleHtml();
    if (flushed && flushed !== contentHtml) setContentHtml(html);
    return {
      title,
      digest,
      contentHtml: html,
      author: author.trim(),
      coverThumbMediaId,
      coverPreviewUrl,
      coverSquarePreviewUrl,
      coverCropMode,
      coverPicCrop2351,
      coverPicCrop11,
      mediaId: mediaId ?? props.initial.mediaId
    };
  }

  function closeAndSaveLocal() {
    props.onSaved(buildSavePatch());
    props.onClose();
  }

  async function runAiOptimize() {
    setAiBusy(true);
    setMsg("");
    try {
      const resp = await postAgentBrainWechatReviseArticle({ title, digest, contentHtml });
      if (!resp.ok) throw new Error(resp.message || "AI 优化失败");
      if (resp.title) setTitle(resp.title);
      if (resp.digest) setDigest(resp.digest);
      if (resp.contentHtml) setContentHtml(resp.contentHtml);
      setMsgTone("ok");
      setMsg(resp.note ? `AI 优化完成：${resp.note}` : "AI 优化完成");
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setAiBusy(false);
    }
  }

  async function syncToWechat() {
    setSyncBusy(true);
    setMsg("");
    try {
      let liveSettings = settings;
      try {
        const cfgResp = await apiJson<{ ok: boolean; settings?: WechatSettings }>("/api/wechat-official/settings");
        if (cfgResp.ok && cfgResp.settings) {
          liveSettings = cfgResp.settings;
        }
      } catch {
        /* use cached */
      }
      const blockMsg = syncReadinessMessage(liveSettings);
      if (blockMsg) {
        setMsgTone("err");
        setMsg(blockMsg);
        return;
      }
      const flushedHtml = editorFlushRef.current?.();
      const htmlForSync = (flushedHtml ?? contentHtml).trim() || defaultWechatArticleHtml();
      if (flushedHtml && flushedHtml !== contentHtml) setContentHtml(htmlForSync);
      const resp = await apiJsonWithTimeout<{ ok: boolean; mediaId?: string; message?: string }>(
        "/api/wechat-official/drafts/sync",
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            digest: digest.trim(),
            author: author.trim() || undefined,
            contentHtml: prepareWechatContentHtmlForSync(htmlForSync),
            thumbMediaId: coverThumbMediaId?.trim() || undefined,
            picCrop2351: props.remoteSyncOnly ? undefined : coverPicCrop2351?.trim() || undefined,
            picCrop11: props.remoteSyncOnly ? undefined : coverPicCrop11?.trim() || undefined,
            mediaId: props.initial.mediaId
          })
        },
        60_000
      );
      if (!resp.ok) throw new Error(resp.message || "同步失败");
      setMsgTone("ok");
      setMsg(resp.message || "已同步到草稿箱");
      props.onSaved(buildSavePatch(resp.mediaId ?? props.initial.mediaId));
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function pullLatestFromWechat() {
    const mediaId = props.initial.mediaId?.trim();
    if (!mediaId) {
      setMsgTone("err");
      setMsg("这篇文章还没有同步到微信公众号草稿箱，暂时没有远程内容可拉取。");
      return;
    }
    setPullBusy(true);
    setMsg("");
    try {
      const resp = await apiJson<{
        ok: boolean;
        draft?: {
          title: string;
          digest: string;
          contentHtml: string;
          author?: string;
          thumbMediaId?: string;
          thumbUrl?: string | null;
        };
        message?: string;
      }>(`/api/wechat-official/drafts/remote/${encodeURIComponent(mediaId)}`);
      if (!resp.ok || !resp.draft) throw new Error(resp.message || "读取微信草稿失败");
      const nextHtml = ensureWechatImageDisplayHtml(resp.draft.contentHtml || defaultWechatArticleHtml());
      const nextImageCount = countWechatHtmlImages(nextHtml);
      const nextTextChars = countWechatTextChars(nextHtml);
      const nextHtmlChars = nextHtml.length;
      const nextTitle = resp.draft.title || title;
      const nextDigest = resp.draft.digest || "";
      const nextAuthor = resp.draft.author || author;
      const nextCoverThumbMediaId = resp.draft.thumbMediaId || coverThumbMediaId;
      const nextCoverPreviewUrl = resp.draft.thumbUrl || coverPreviewUrl;
      const nextCoverImageCount = nextCoverPreviewUrl ? 1 : 0;
      setTitle(nextTitle);
      setDigest(nextDigest);
      setAuthor(nextAuthor);
      setContentHtml(nextHtml);
      setRemoteSyncVersion((v) => v + 1);
      if (resp.draft.thumbMediaId) setCoverThumbMediaId(resp.draft.thumbMediaId);
      if (resp.draft.thumbUrl) setCoverPreviewUrl(resp.draft.thumbUrl);
      if (resp.draft.thumbMediaId || resp.draft.thumbUrl) {
        setCoverSquarePreviewUrl(undefined);
        setCoverCropMode(undefined);
        setCoverPicCrop2351(undefined);
        setCoverPicCrop11(undefined);
      }
      props.onSaved({
        title: nextTitle,
        digest: nextDigest,
        author: nextAuthor,
        contentHtml: nextHtml,
        coverThumbMediaId: nextCoverThumbMediaId,
        coverPreviewUrl: nextCoverPreviewUrl,
        coverSquarePreviewUrl: resp.draft.thumbMediaId || resp.draft.thumbUrl ? undefined : coverSquarePreviewUrl,
        coverCropMode: resp.draft.thumbMediaId || resp.draft.thumbUrl ? undefined : coverCropMode,
        coverPicCrop2351: resp.draft.thumbMediaId || resp.draft.thumbUrl ? undefined : coverPicCrop2351,
        coverPicCrop11: resp.draft.thumbMediaId || resp.draft.thumbUrl ? undefined : coverPicCrop11,
        mediaId
      });
      setMsgTone("ok");
      setRemoteSyncMeta({
        textChars: nextTextChars,
        htmlChars: nextHtmlChars,
        coverImages: nextCoverImageCount,
        bodyImages: nextImageCount,
        at: nowIso()
      });
      setMsg(
        `已从微信公众号草稿箱拉取最新内容，并覆盖本地编辑器。本地可见正文字数 ${nextTextChars}，封面 ${nextCoverImageCount} 张，正文图片 ${nextImageCount} 张。`
      );
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setPullBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold text-slate-950">编辑文章</h2>
          <p className="mt-0.5 text-xs text-slate-500">填写标题、作者、封面与正文；正文支持图片裁剪、链接与视频（视频需微信转码）。</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="标题（≤64字）" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="作者（≤16字，同步草稿箱时一并提交）" value={author} onChange={(e) => setAuthor(e.target.value)} />
            <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="摘要（≤120字，选填，列表页短描述）" value={digest} onChange={(e) => setDigest(e.target.value)} />
            <WechatArticleCoverField
              thumbMediaId={coverThumbMediaId}
              previewUrl={coverPreviewUrl}
              squarePreviewUrl={coverSquarePreviewUrl}
              cropMode={coverCropMode}
              disabled={busy}
              onChange={(patch) => {
                if (patch.coverThumbMediaId !== undefined) setCoverThumbMediaId(patch.coverThumbMediaId);
                if (patch.coverPreviewUrl !== undefined) setCoverPreviewUrl(patch.coverPreviewUrl);
                if (patch.coverSquarePreviewUrl !== undefined) setCoverSquarePreviewUrl(patch.coverSquarePreviewUrl);
                if (patch.coverCropMode !== undefined) setCoverCropMode(patch.coverCropMode);
                if (patch.coverPicCrop2351 !== undefined) setCoverPicCrop2351(patch.coverPicCrop2351);
                if (patch.coverPicCrop11 !== undefined) setCoverPicCrop11(patch.coverPicCrop11);
              }}
            />
            <WechatArticleRichEditor
              editorKey={`${props.editorKey}:${remoteSyncVersion}`}
              title={title}
              digest={digest}
              coverPreviewUrl={coverPreviewUrl}
              html={contentHtml}
              onChange={setContentHtml}
              onFlushRef={editorFlushRef}
            />
            {remoteSyncMeta ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                最近同步：本地可见正文字数 {remoteSyncMeta.textChars.toLocaleString("zh-CN")} · 封面 {remoteSyncMeta.coverImages} 张 · 正文图片 {remoteSyncMeta.bodyImages} 张 · HTML {remoteSyncMeta.htmlChars.toLocaleString("zh-CN")} 字符 · {fmtTime(remoteSyncMeta.at)}
              </div>
            ) : null}
            {syncReadinessMessage() ? (
              <p className="text-xs text-amber-800">{syncReadinessMessage()}</p>
            ) : (
              <p className="text-xs text-emerald-700">账号已就绪，可同步到微信公众号草稿箱。</p>
            )}
            {msg ? <FeedbackBanner tone={msgTone}>{msg}</FeedbackBanner> : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <ActionButton onClick={props.remoteSyncOnly ? props.onClose : closeAndSaveLocal}>关闭</ActionButton>
          {!props.remoteSyncOnly ? (
            <ActionButton disabled={aiBusy || busy} onClick={() => void runAiOptimize()}>
              {aiBusy ? "AI 优化中…" : "AI 优化"}
            </ActionButton>
          ) : null}
          <ActionButton disabled={pullBusy || syncBusy || aiBusy || !props.initial.mediaId} onClick={() => void pullLatestFromWechat()}>
            {pullBusy ? "拉取中…" : props.remoteSyncOnly ? "拉取公众号草稿同步编辑栏内" : "拉取微信端最新草稿"}
          </ActionButton>
          {props.remoteSyncOnly ? (
            <ActionButton primary disabled={syncBusy || pullBusy || aiBusy || !title.trim()} onClick={() => void syncToWechat()}>
              {syncBusy ? "推送中…" : "推送并更新微信公众号草稿"}
            </ActionButton>
          ) : null}
          {!props.remoteSyncOnly ? (
            <>
              <ActionButton
                primary
                disabled={busy || aiBusy || !title.trim()}
                onClick={() => {
                  props.onSaved(buildSavePatch());
                  props.onClose();
                }}
              >
                保存本地
              </ActionButton>
              <ActionButton primary disabled={syncBusy || pullBusy || aiBusy || !title.trim()} onClick={() => void syncToWechat()}>
                {syncBusy ? "同步中…" : props.syncLabel ?? "同步到草稿箱"}
              </ActionButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ComposeNoticeBanner(props: { tone: "ok" | "err" | "amber"; children: React.ReactNode }) {
  const cls =
    props.tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : props.tone === "err"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{props.children}</div>;
}

/** 创建文章 · 草稿列表默认可视行数，超出纵向滚动 */
const COMPOSE_DRAFT_LIST_VISIBLE_ROWS = 15;

/** 创建文章 */
export function WechatOfficialComposePage() {
  const { drafts, setDrafts } = useWechatDrafts();
  const { settings, canSyncDraft, hasCredentials } = useWechatSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<{ id: string; title: string } | null>(null);
  const [composeNotice, setComposeNotice] = useState<{ tone: "ok" | "err" | "amber"; text: string } | null>(null);

  useEffect(() => {
    try {
      const openId = sessionStorage.getItem(WECHAT_OPEN_DRAFT_ID);
      if (openId) {
        sessionStorage.removeItem(WECHAT_OPEN_DRAFT_ID);
        setEditingId(openId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const activeDraft = useMemo(
    () => (editingId ? drafts.find((d) => d.id === editingId) ?? null : null),
    [drafts, editingId]
  );

  function createDraft() {
    const title = "新文章草稿";
    const draft: WechatDraftRecord = {
      id: createId(),
      title,
      digest: "",
      contentHtml: defaultWechatArticleHtml(),
      status: "local",
      readCount: 0,
      emailDrivenReads: 0,
      emailSent: 0,
      emailClicks: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    setDrafts((prev) => [draft, ...prev]);
    setEditingId(draft.id);
  }

  function updateDraft(id: string, patch: Partial<WechatDraftRecord>) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              ...patch,
              updatedAt: nowIso(),
              status: patch.mediaId ? "synced" : d.status === "published" ? "published" : patch.status ?? d.status
            }
          : d
      )
    );
  }

  function requestDeleteDraft(id: string) {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;
    setComposeNotice(null);
    setDeletePrompt({ id, title: target.title });
  }

  function cancelDeleteDraft() {
    setDeletePrompt(null);
  }

  function confirmDeleteDraft() {
    if (!deletePrompt) return;
    const title = deletePrompt.title;
    setDrafts((prev) => prev.filter((d) => d.id !== deletePrompt.id));
    if (editingId === deletePrompt.id) setEditingId(null);
    setDeletePrompt(null);
    setComposeNotice({ tone: "ok", text: `已删除草稿「${title}」` });
  }

  return (
    <PageFrame view="compose">
      <SectionCard title="微信公众号" description="账号配置在「账号认证」页完成。创建文章前可在这里确认当前公众号。">
        <div
          className={`flex max-w-xl items-center gap-3 rounded-lg border px-3 py-2.5 ${
            hasCredentials ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              hasCredentials ? "bg-white text-emerald-800" : "bg-white text-slate-400"
            }`}
          >
            微
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">微信公众号</p>
            <p className={`truncate text-xs ${hasCredentials ? "text-emerald-800" : "text-slate-500"}`}>
              {hasCredentials ? "已接通" : "未配置"}
              {hasCredentials
                ? ` · ${currentWechatAccountLabel(settings).accountName}`
                : ""}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {hasCredentials
                ? `AppID ${settings?.appId || ""}`
                : "请先完成账号认证（AppID / AppSecret），并在微信后台加入本机 IP 白名单。"}
            </p>
            <div className="mt-1.5">
              <Link
                to="/wechat-official/publishing"
                className={
                  hasCredentials
                    ? "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                    : "inline-flex h-7 items-center rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                }
              >
                {hasCredentials ? "重新配置" : "去账号认证"}
              </Link>
            </div>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="文章草稿" description="先保存在本地，再同步到微信公众号草稿箱。列表默认展示 15 篇，其余向下滚动查看。">
        <div className="mb-3 flex flex-wrap gap-2">
          <ActionButton primary onClick={() => createDraft()}>
            新建文章草稿
          </ActionButton>
          <Link to="/wechat-official/publishing/reuse">
            <ActionButton>内容复用 · 邮件推广</ActionButton>
          </Link>
        </div>
        {!canSyncDraft ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            尚未完成公众号 API 配置（AppID / AppSecret）。可先编辑本地草稿，配置完成后即可同步草稿箱。
            <Link to="/wechat-official/publishing" className="ml-1 font-semibold underline">
              去账号认证
            </Link>
          </div>
        ) : null}
        {deletePrompt ? (
          <div className="mb-3">
            <ComposeNoticeBanner tone="amber">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>确认删除「{deletePrompt.title}」？</span>
                <span className="flex flex-wrap gap-2">
                  <ActionButton danger onClick={confirmDeleteDraft}>确认删除</ActionButton>
                  <ActionButton onClick={cancelDeleteDraft}>取消</ActionButton>
                </span>
              </div>
            </ComposeNoticeBanner>
          </div>
        ) : null}
        {composeNotice ? (
          <div className="mb-3">
            <ComposeNoticeBanner tone={composeNotice.tone}>{composeNotice.text}</ComposeNoticeBanner>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div
            className="overflow-x-auto overflow-y-auto"
            style={{ maxHeight: `calc(2.5rem + ${COMPOSE_DRAFT_LIST_VISIBLE_ROWS} * 3.25rem)` }}
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
                <tr>
                  <th className="px-3 py-2">文章</th>
                  <th className="px-3 py-2">草稿状态</th>
                  <th className="px-3 py-2">更新时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {drafts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      暂无草稿。点击「新建文章草稿」开始。
                    </td>
                  </tr>
                ) : (
                  drafts.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">{item.title}</td>
                      <td className="px-3 py-3">
                        <StatusPill tone={item.status === "synced" ? "sky" : item.status === "published" ? "green" : "amber"}>
                          {item.status === "synced" ? "已同步草稿箱" : item.status === "published" ? "已发布" : "本地草稿"}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{fmtTime(item.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <ActionButton onClick={() => setEditingId(item.id)}>编辑 / 同步</ActionButton>
                          <ActionButton danger onClick={() => requestDeleteDraft(item.id)}>删除</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
      {activeDraft ? (
        <ArticleEditorModal
          key={activeDraft.id}
          editorKey={activeDraft.id}
          defaultAuthor={settings?.author ?? activeDraft.author}
          initial={{
            title: activeDraft.title,
            digest: activeDraft.digest,
            contentHtml: activeDraft.contentHtml?.trim()
              ? ensureWechatImageDisplayHtml(activeDraft.contentHtml)
              : defaultWechatArticleHtml(),
            author: activeDraft.author,
            coverThumbMediaId: activeDraft.coverThumbMediaId,
            coverPreviewUrl: activeDraft.coverPreviewUrl,
            coverSquarePreviewUrl: activeDraft.coverSquarePreviewUrl,
            coverCropMode: activeDraft.coverCropMode,
            coverPicCrop2351: activeDraft.coverPicCrop2351,
            coverPicCrop11: activeDraft.coverPicCrop11,
            mediaId: activeDraft.mediaId
          }}
          onClose={() => setEditingId(null)}
          onSaved={(patch) => updateDraft(activeDraft.id, patch)}
        />
      ) : null}
    </PageFrame>
  );
}

/** 提交正式发布 */
export function WechatOfficialPublishPage() {
  const { drafts, setDrafts } = useWechatDrafts();
  const { canSyncDraft, refresh: refreshSettings } = useWechatSettings();
  const [remoteDrafts, setRemoteDrafts] = useState<RemoteDraft[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [editing, setEditing] = useState<{
    title: string;
    digest: string;
    contentHtml: string;
    author?: string;
    coverThumbMediaId?: string;
    coverPreviewUrl?: string;
    coverSquarePreviewUrl?: string;
    coverCropMode?: "wide" | "square";
    coverPicCrop2351?: string;
    coverPicCrop11?: string;
    mediaId: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleBusyId, setScheduleBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [diagnoseBusyId, setDiagnoseBusyId] = useState<string | null>(null);
  const [scheduledTasks, setScheduledTasks] = useState<WechatScheduledPublishTask[]>([]);
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");

  /** 待发布：含 synced 与发布失败（failed），避免点发布后失败就从列表消失 */
  const syncedLocal = drafts.filter((d) => (d.status === "synced" || d.status === "failed") && d.mediaId);

  async function loadRemoteDrafts(options?: { silent?: boolean }) {
    if (!canSyncDraft) {
      if (!options?.silent) {
        setMsgTone("err");
        setMsg("请先完成账号认证（AppID / AppSecret）后再刷新草稿箱。");
      }
      return;
    }
    setLoadingRemote(true);
    if (!options?.silent) setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; drafts?: RemoteDraft[]; message?: string }>(
        "/api/wechat-official/drafts/remote"
      );
      if (!resp.ok) throw new Error(resp.message || "读取草稿箱失败");
      setRemoteDrafts(resp.drafts ?? []);
      if (!options?.silent) {
        setMsgTone("ok");
        setMsg(`已从微信公众号草稿箱读取 ${resp.drafts?.length ?? 0} 篇。`);
      }
    } catch (e: unknown) {
      if (!options?.silent) {
        setMsgTone("err");
        setMsg(String((e as Error)?.message ?? e));
      }
    } finally {
      setLoadingRemote(false);
    }
  }

  async function loadScheduledPublishes() {
    try {
      const resp = await apiJson<{ ok: boolean; tasks?: WechatScheduledPublishTask[]; message?: string }>(
        "/api/wechat-official/publish/scheduled"
      );
      if (!resp.ok) throw new Error(resp.message || "读取定时发布任务失败");
      setScheduledTasks(resp.tasks ?? []);
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    }
  }

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (canSyncDraft) void loadRemoteDrafts();
  }, [canSyncDraft]);

  useEffect(() => {
    void loadScheduledPublishes();
  }, []);

  async function openRemoteDraft(mediaId: string) {
    try {
      const resp = await apiJson<{ ok: boolean; draft?: { title: string; digest: string; contentHtml: string; author?: string }; message?: string }>(
        `/api/wechat-official/drafts/remote/${encodeURIComponent(mediaId)}`
      );
      if (!resp.ok || !resp.draft) throw new Error(resp.message || "读取详情失败");
      const local = drafts.find((d) => d.mediaId === mediaId);
      setEditing({
        mediaId,
        title: resp.draft.title,
        digest: resp.draft.digest,
        contentHtml: ensureWechatImageDisplayHtml(resp.draft.contentHtml),
        author: resp.draft.author ?? local?.author,
        coverThumbMediaId: local?.coverThumbMediaId,
        coverPreviewUrl: local?.coverPreviewUrl,
        coverSquarePreviewUrl: local?.coverSquarePreviewUrl,
        coverCropMode: local?.coverCropMode,
        coverPicCrop2351: local?.coverPicCrop2351,
        coverPicCrop11: local?.coverPicCrop11
      });
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    }
  }

  async function submitPublish(mediaId: string, localId?: string) {
    setBusyId(mediaId);
    setMsg("");
    try {
      const resp = await apiJsonWithTimeout<{ ok: boolean; publishedAt?: string; publishId?: string; message?: string }>(
        "/api/wechat-official/publish",
        { method: "POST", body: JSON.stringify({ mediaId }) },
        60_000
      );
      if (!resp.ok) throw new Error(resp.message || "发布失败");
      const publishedAt = resp.publishedAt ?? nowIso();
      if (localId) {
        const nextDraft = drafts.find((d) => d.id === localId);
        setDrafts(
          drafts.map((d) =>
            d.id === localId
              ? {
                  ...d,
                  status: "published",
                  publishedAt,
                  mediaId,
                  publishId: resp.publishId,
                  publishError: undefined
                }
              : d
          )
        );
        if (nextDraft) {
          void registerWechatArticleLink({
            ...nextDraft,
            status: "published",
            publishedAt,
            mediaId,
            publishId: resp.publishId
          });
        }
      }
      setMsgTone("ok");
      setMsg(`${resp.message ?? "发布成功"} · 发布时间 ${fmtTime(resp.publishedAt ?? nowIso())}`);
      await loadRemoteDrafts({ silent: true });
    } catch (e: unknown) {
      const errMsg = String((e as Error)?.message ?? e);
      setMsgTone("err");
      setMsg(errMsg);
      if (localId) {
        setDrafts(
          drafts.map((d) =>
            d.id === localId
              ? { ...d, status: "failed", publishError: errMsg, updatedAt: nowIso() }
              : d
          )
        );
      }
      await loadRemoteDrafts({ silent: true });
    } finally {
      setBusyId(null);
    }
  }

  async function diagnosePublish(mediaId: string) {
    setDiagnoseBusyId(mediaId);
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; diagnostic?: WechatPublishDiagnostic; message?: string }>(
        "/api/wechat-official/publish/diagnose",
        { method: "POST", body: JSON.stringify({ mediaId }) }
      );
      if (!resp.ok || !resp.diagnostic) throw new Error(resp.message || "发布前诊断失败");
      const d = resp.diagnostic;
      setMsgTone(d.canSubmit ? "ok" : "err");
      setMsg(
        d.canSubmit
          ? `发布前诊断通过：标题「${d.title || "无标题"}」· 正文 ${d.contentChars} 字符 · 图片 ${d.imageCount} 张 · 已有封面。`
          : `发布前诊断未通过：${d.issues.join("；")}（正文 ${d.contentChars} 字符 · 图片 ${d.imageCount} 张）`
      );
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setDiagnoseBusyId(null);
    }
  }

  async function queryPublishStatus(publishId: string) {
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; status?: WechatPublishStatus; message?: string }>(
        `/api/wechat-official/publish/status/${encodeURIComponent(publishId)}`
      );
      if (!resp.ok || !resp.status) throw new Error(resp.message || "查询发布状态失败");
      const s = resp.status;
      setMsgTone(s.publishStatus === 0 ? "ok" : "err");
      setMsg(
        `发布状态：${s.statusText} · publish_id ${s.publishId}${
          s.articleUrl ? ` · 文章链接 ${s.articleUrl}` : ""
        }${s.failIdx != null ? ` · 失败位置 ${s.failIdx}` : ""}`
      );
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    }
  }

  async function schedulePublish(row: { mediaId: string; localId?: string; title: string }) {
    const scheduledAt = localDatetimeValueToIso(scheduleInputs[row.mediaId] ?? "");
    if (!scheduledAt) {
      setMsgTone("err");
      setMsg("请选择有效的定时发布时间。");
      return;
    }
    setScheduleBusyId(row.mediaId);
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; tasks?: WechatScheduledPublishTask[]; message?: string }>(
        "/api/wechat-official/publish/scheduled",
        {
          method: "POST",
          body: JSON.stringify({
            mediaId: row.mediaId,
            localId: row.localId,
            title: row.title,
            scheduledAt
          })
        }
      );
      if (!resp.ok) throw new Error(resp.message || "创建定时发布任务失败");
      setScheduledTasks(resp.tasks ?? []);
      setMsgTone("ok");
      setMsg(`${resp.message ?? "已创建定时正式发布任务。"} · 计划时间 ${fmtTime(scheduledAt)}`);
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setScheduleBusyId(null);
    }
  }

  async function deleteDraftRow(row: { mediaId: string; localId?: string; title: string; source: "local" | "remote" }) {
    const ok = window.confirm(`确认删除草稿箱文章「${row.title || row.mediaId}」吗？这会同时删除微信公众号草稿箱里的对应草稿。`);
    if (!ok) return;
    setDeleteBusyId(row.mediaId);
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; message?: string }>(
        `/api/wechat-official/drafts/remote/${encodeURIComponent(row.mediaId)}`,
        { method: "DELETE" }
      );
      if (!resp.ok) throw new Error(resp.message || "删除草稿失败");
      if (row.localId) {
        setDrafts((prev) => prev.filter((d) => d.id !== row.localId));
      }
      setRemoteDrafts((prev) => prev.filter((d) => d.mediaId !== row.mediaId));
      setScheduledTasks((prev) => prev.filter((task) => task.mediaId !== row.mediaId));
      setMsgTone("ok");
      setMsg(resp.message || "已删除草稿箱文章。");
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setDeleteBusyId(null);
    }
  }

  function latestScheduleFor(mediaId: string): WechatScheduledPublishTask | null {
    return (
      scheduledTasks
        .filter((task) => task.mediaId === mediaId)
        .sort((a, b) => Date.parse(b.updatedAt ?? b.scheduledAt) - Date.parse(a.updatedAt ?? a.scheduledAt))[0] ?? null
    );
  }

  function scheduleStatusPill(task: WechatScheduledPublishTask | null) {
    if (!task) return null;
    const tone = task.status === "published" ? "green" : task.status === "failed" ? "rose" : task.status === "running" ? "amber" : "sky";
    const label =
      task.status === "published"
        ? `定时已发布 ${fmtTime(task.publishedAt)}`
        : task.status === "failed"
          ? "定时失败"
          : task.status === "running"
            ? "定时发布中"
            : `已定时 ${fmtTime(task.scheduledAt)}`;
    return (
      <div className="mt-1">
        <StatusPill tone={tone}>{label}</StatusPill>
        {task.lastError ? <div className="mt-1 max-w-[260px] text-[11px] text-rose-600">{task.lastError}</div> : null}
      </div>
    );
  }

  const allRows = useMemo(() => {
    const localRows = syncedLocal.map((d) => ({
      key: d.id,
      title: d.title,
      digest: d.digest,
      mediaId: d.mediaId!,
      updateTime: d.updatedAt,
      source: "local" as const,
      localId: d.id,
      publishedAt: d.publishedAt,
      publishError: d.publishError,
      localStatus: d.status,
      publishId: d.publishId
    }));
    const remoteRows = remoteDrafts
      .filter((r) => !localRows.some((l) => l.mediaId === r.mediaId))
      .map((r) => ({
        key: r.mediaId,
        title: r.title,
        digest: r.digest,
        mediaId: r.mediaId,
        updateTime: r.updateTime,
        source: "remote" as const,
        localId: undefined,
        publishedAt: undefined as string | undefined,
        publishError: undefined as string | undefined,
        localStatus: undefined as WechatDraftRecord["status"] | undefined,
        publishId: undefined as string | undefined
      }));
    return [...localRows, ...remoteRows];
  }, [syncedLocal, remoteDrafts]);

  return (
    <PageFrame view="publish">
      {msg ? <div className="mb-3"><FeedbackBanner tone={msgTone}>{msg}</FeedbackBanner></div> : null}
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-950">待提交草稿</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{allRows.length}</div>
          <div className="mt-1 text-xs text-slate-500">含本地已同步 + 远程草稿箱</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-950">发布方式</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone="slate">立即发布</StatusPill>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-950">操作</div>
          <div className="mt-2">
            <ActionButton disabled={loadingRemote} onClick={() => void loadRemoteDrafts()}>
              {loadingRemote ? "刷新中…" : "刷新草稿箱"}
            </ActionButton>
          </div>
        </div>
      </div>
      <SectionCard title="草稿箱文章" description="打开查看或编辑，确认无误后提交正式发布。">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">文章</th>
                <th className="px-3 py-2">来源</th>
                <th className="px-3 py-2">更新时间</th>
                <th className="px-3 py-2">发布时间</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    草稿箱暂无内容。请先在「创建文章」页同步到草稿箱。
                  </td>
                </tr>
              ) : (
                allRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.title}</div>
                      {row.digest ? <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{row.digest}</div> : null}
                      {row.localStatus === "failed" ? (
                        <div className="mt-1">
                          <StatusPill tone="rose">上次发布失败</StatusPill>
                          {row.publishError ? (
                            <div className="mt-1 max-w-[320px] text-[11px] text-rose-600">{row.publishError}</div>
                          ) : null}
                        </div>
                      ) : null}
                      {scheduleStatusPill(latestScheduleFor(row.mediaId))}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill tone={row.source === "local" ? "sky" : "slate"}>
                        {row.source === "local" ? "本系统" : "远程草稿箱"}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{fmtTime(row.updateTime)}</td>
                    <td className="px-3 py-3 text-slate-600">{fmtTime(row.publishedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton onClick={() => void openRemoteDraft(row.mediaId)}>查看 / 编辑</ActionButton>
                        <ActionButton
                          disabled={diagnoseBusyId === row.mediaId}
                          onClick={() => void diagnosePublish(row.mediaId)}
                        >
                          {diagnoseBusyId === row.mediaId ? "诊断中…" : "发布前诊断"}
                        </ActionButton>
                        <ActionButton
                          primary
                          disabled={busyId === row.mediaId}
                          onClick={() => void submitPublish(row.mediaId, row.localId)}
                        >
                          {busyId === row.mediaId ? "提交中…" : "提交正式发布"}
                        </ActionButton>
                        {row.publishId ? (
                          <ActionButton onClick={() => void queryPublishStatus(row.publishId!)}>
                            查询发布状态
                          </ActionButton>
                        ) : null}
                        <input
                          type="datetime-local"
                          step={1}
                          className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-700"
                          value={scheduleInputs[row.mediaId] ?? ""}
                          onChange={(e) => setScheduleInputs((prev) => ({ ...prev, [row.mediaId]: e.target.value }))}
                        />
                        <ActionButton
                          disabled={scheduleBusyId === row.mediaId || !scheduleInputs[row.mediaId]}
                          onClick={() => void schedulePublish(row)}
                        >
                          {scheduleBusyId === row.mediaId ? "创建中…" : "定时发布"}
                        </ActionButton>
                        <ActionButton danger disabled={deleteBusyId === row.mediaId} onClick={() => void deleteDraftRow(row)}>
                          {deleteBusyId === row.mediaId ? "删除中…" : "删除"}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {editing ? (
        <ArticleEditorModal
          editorKey={editing.mediaId}
          remoteSyncOnly
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            setEditing({ ...editing, ...patch, mediaId: patch.mediaId ?? editing.mediaId });
            const local = drafts.find((d) => d.mediaId === editing.mediaId);
            if (local) {
              setDrafts(
                drafts.map((d) =>
                  d.id === local.id
                    ? {
                        ...d,
                        title: patch.title,
                        digest: patch.digest,
                        contentHtml: patch.contentHtml,
                        author: patch.author,
                        coverThumbMediaId: patch.coverThumbMediaId,
                        coverPreviewUrl: patch.coverPreviewUrl,
                        coverSquarePreviewUrl: patch.coverSquarePreviewUrl,
                        coverCropMode: patch.coverCropMode,
                        coverPicCrop2351: patch.coverPicCrop2351,
                        coverPicCrop11: patch.coverPicCrop11,
                        updatedAt: nowIso()
                      }
                    : d
                )
              );
            }
          }}
        />
      ) : null}
    </PageFrame>
  );
}

/** 内容复用 · 公众号文章 → 邮件营销 */
export function WechatOfficialReusePage() {
  const { drafts, setDrafts } = useWechatDrafts();
  const { settings, refresh: refreshSettings } = useWechatSettings();
  const { isModuleActive } = useProductModules();
  const emailActive = isModuleActive("email");
  useWechatArticleStatsSync(drafts, setDrafts, emailActive);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"ok" | "err">("ok");
  const [tab, setTab] = useState<"published" | "all">("published");
  const [syncingPublished, setSyncingPublished] = useState(false);
  const [importingPublishedUrl, setImportingPublishedUrl] = useState(false);
  const [publishedUrlDraft, setPublishedUrlDraft] = useState("");
  const [publishedTitleDraft, setPublishedTitleDraft] = useState("");
  const [urlEditId, setUrlEditId] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [templateModalArticle, setTemplateModalArticle] = useState<WechatDraftRecord | null>(null);

  const published = useMemo(() => drafts.filter((d) => d.status === "published"), [drafts]);
  const rows = tab === "published" ? published : drafts;

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  function patchDraft(id: string, patch: Partial<WechatDraftRecord>) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: nowIso() } : d))
    );
  }

  function openTemplateModal(article: WechatDraftRecord) {
    if (!emailActive) {
      setNoticeTone("err");
      setNotice("当前安装包未开通「邮件与营销」模块。请购买邮件营销 + 微信公众号组合套餐后使用。");
      return;
    }
    setTemplateModalArticle(article);
  }

  async function syncRemotePublishedArticles() {
    setSyncingPublished(true);
    setNotice("");
    try {
      const result = await syncRemotePublishedArticlesIntoDrafts(settings, setDrafts);
      setTab("published");
      setNoticeTone("ok");
      setNotice(
        result.count > 0
          ? `已同步「${result.accountName}」已发布文章 ${result.count} 篇。`
          : `微信接口返回「${result.accountName}」已发布文章 0 篇。若公众号后台确实已有文章，请粘贴文章链接，使用「导入已发布文章链接」。`
      );
    } catch (e: unknown) {
      setNoticeTone("err");
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setSyncingPublished(false);
    }
  }

  async function importPublishedUrlForReuse() {
    setImportingPublishedUrl(true);
    setNotice("");
    try {
      const result = await importPublishedArticleUrlIntoDrafts(settings, setDrafts, publishedUrlDraft, publishedTitleDraft);
      setPublishedUrlDraft("");
      setPublishedTitleDraft("");
      setTab("published");
      setNoticeTone("ok");
      setNotice(`已导入「${result.accountName}」已发布文章链接：${result.article.title}`);
    } catch (e: unknown) {
      setNoticeTone("err");
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setImportingPublishedUrl(false);
    }
  }

  function saveArticleUrl(id: string) {
    const article = drafts.find((d) => d.id === id);
    const url = urlDraft.trim() || undefined;
    patchDraft(id, { publishedArticleUrl: url });
    setUrlEditId(null);
    setUrlDraft("");
    setNoticeTone("ok");
    setNotice("文章链接已保存；生成邮件模版时文末「在公众号阅读」将经本站追踪再跳转微信。");
    if (article && url) {
      void registerWechatArticleLink({ ...article, publishedArticleUrl: url });
    }
  }

  return (
    <PageFrame view="reuse">
      {templateModalArticle ? (
        <WechatEmailTemplateCreateModal
          article={templateModalArticle}
          onClose={() => setTemplateModalArticle(null)}
          onSaved={(templateId, templateName) => {
            patchDraft(templateModalArticle.id, {
              linkedEmailTemplateId: templateId,
              linkedEmailTemplateName: templateName
            });
            setTemplateModalArticle(null);
            setNoticeTone("ok");
            setNotice(`已保存到邮件模版库「${templateName}」。请到邮件营销选择该模版发送；微信阅读与邮件带来阅读将分别在本页刷新。`);
          }}
        />
      ) : null}
      {notice ? (
        <div className="mb-3">
          <FeedbackBanner tone={noticeTone}>{notice}</FeedbackBanner>
        </div>
      ) : null}

      <SectionCard
        title="模块说明"
        description="微信公众号为独立增值包；与邮件营销的联动仅在组合套餐下启用，不改邮件统计/模版页本身。"
      >
        <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-slate-700">
          <li>已发布文章可<strong>生成邮件模版</strong>（弹窗填写模版名称、标签；邮件标题默认=文章标题）。</li>
          <li>保存后模版进入邮件模版库；在<strong>邮件营销</strong>选该模版发送即可，无需改邮件板块页面。</li>
          <li><strong>微信阅读</strong> = 与公众号后台<strong>阅读次数</strong>同步（同一人多次打开微信文章会累加，通常 T+1 更新）。</li>
          <li><strong>邮件带来阅读</strong> = 收件人点击邮件文末「在公众号阅读」的次数（与微信次数口径一致，不去重 IP；仅在邮件内阅读不计入）。</li>
          <li>生成模版时会<strong>完整复制</strong>公众号正文到邮件，可直接当邮件推送使用。</li>
          <li>LinkedIn 等内容复用不在此页；各增值包保持独立。</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="已发布文章 · 生成邮件模版"
        description="仅已正式发布的文章可生成模版。请先粘贴公众号文章链接（用于文末追踪跳转与微信阅读同步）。"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <ActionButton primary={tab === "published"} onClick={() => setTab("published")}>
            已发布 ({published.length})
          </ActionButton>
          <ActionButton primary={tab === "all"} onClick={() => setTab("all")}>
            全部 ({drafts.length})
          </ActionButton>
          <Link to="/wechat-official/publishing/dashboard">
            <ActionButton>数据看板</ActionButton>
          </Link>
          <ActionButton disabled={syncingPublished} onClick={() => void syncRemotePublishedArticles()}>
            {syncingPublished ? "同步中…" : `同步「${currentWechatAccountLabel(settings).accountName}」已发布文章`}
          </ActionButton>
          {emailActive ? (
            <Link to="/email/campaigns">
              <ActionButton>去邮件营销发送</ActionButton>
            </Link>
          ) : null}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <input
            value={publishedUrlDraft}
            onChange={(e) => setPublishedUrlDraft(e.target.value)}
            placeholder="粘贴已发布公众号文章链接"
            className="h-8 min-w-[280px] flex-1 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
          />
          <input
            value={publishedTitleDraft}
            onChange={(e) => setPublishedTitleDraft(e.target.value)}
            placeholder="标题（可选）"
            className="h-8 w-48 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
          />
          <ActionButton disabled={importingPublishedUrl || !publishedUrlDraft.trim()} onClick={() => void importPublishedUrlForReuse()}>
            {importingPublishedUrl ? "导入中…" : "导入已发布文章链接"}
          </ActionButton>
        </div>

        {!emailActive ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            当前包未开通邮件与营销。列表可浏览；生成模版与阅读回写需组合套餐。
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">文章</th>
                <th className="px-3 py-2">来源账号</th>
                <th className="px-3 py-2">发布时间</th>
                <th className="px-3 py-2 text-right">微信阅读</th>
                <th className="px-3 py-2 text-right">邮件带来</th>
                <th className="px-3 py-2 text-right">邮件已发</th>
                <th className="px-3 py-2">关联模版</th>
                <th className="px-3 py-2">公众号链接</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {tab === "published" ? "暂无已发布文章。" : "暂无文章。"}
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{item.title}</div>
                      <StatusPill tone={item.status === "published" ? "green" : item.status === "synced" ? "sky" : "amber"}>
                        {item.status === "published" ? "已发布" : item.status === "synced" ? "草稿箱" : "本地"}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{item.accountName || "当前公众号"}</td>
                    <td className="px-3 py-3 text-slate-600">{fmtTime(item.publishedAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.readCount ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-emerald-800">{item.emailDrivenReads ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.emailSent ?? 0}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {item.linkedEmailTemplateName ? (
                        <span title={`模版 ID ${item.linkedEmailTemplateId}`}>{item.linkedEmailTemplateName}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[180px]">
                      {urlEditId === item.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            className="h-8 w-full rounded border border-slate-300 px-2 text-xs"
                            placeholder="https://mp.weixin.qq.com/…"
                            value={urlDraft}
                            onChange={(e) => setUrlDraft(e.target.value)}
                          />
                          <span className="flex gap-1">
                            <ActionButton onClick={() => saveArticleUrl(item.id)}>保存</ActionButton>
                            <ActionButton onClick={() => { setUrlEditId(null); setUrlDraft(""); }}>取消</ActionButton>
                          </span>
                        </div>
                      ) : (
                        <div className="truncate text-xs text-slate-600" title={item.publishedArticleUrl}>
                          {item.publishedArticleUrl ? `${item.publishedArticleUrl.slice(0, 28)}…` : "—"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.status === "published" ? (
                          <>
                            <ActionButton primary={emailActive} disabled={!emailActive} onClick={() => openTemplateModal(item)}>
                              {item.linkedEmailTemplateId ? "重新打开设置" : "打开设置 / 复制到邮件模版"}
                            </ActionButton>
                            {urlEditId !== item.id ? (
                              <ActionButton onClick={() => { setUrlEditId(item.id); setUrlDraft(item.publishedArticleUrl ?? ""); }}>
                                粘贴链接
                              </ActionButton>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">需先发布</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PageFrame>
  );
}

/** 涨阅读 · 单篇文章看板卡片（列表中的一栏） */
function ReadingGrowthArticleBoardRow(props: {
  index: number;
  url: string;
  draft: WechatDraftRecord | null;
  stats?: WechatArticleStatsSnapshot;
}) {
  const { draft, stats } = props;
  const sent = stats?.emailSent ?? draft?.emailSent ?? 0;
  const opened = stats?.emailOpened ?? draft?.emailOpened ?? 0;
  const readClicks = stats?.emailDrivenReads ?? draft?.emailDrivenReads ?? 0;
  const wechatReads = stats?.wechatOfficialReads ?? draft?.readCount ?? null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {props.index}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {draft?.title?.trim() || "未登记文章"}
            </p>
            <p className="mt-0.5 break-all text-[11px] leading-snug text-slate-500">{props.url}</p>
            {draft?.linkedEmailTemplateName ? (
              <p className="mt-1 text-xs text-slate-600">
                模版：{draft.linkedEmailTemplateName}
                {draft.linkedEmailTemplateId ? (
                  <span className="ml-1 text-slate-400">#{draft.linkedEmailTemplateId}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="px-3 py-3">
        {!draft ? (
          <p className="text-sm text-amber-800">
            该链接尚未登记。请先在左侧填写信息并「保存到邮件模版库」，保存后会自动出现在本列表。
          </p>
        ) : !draft.linkedEmailTemplateId ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            已登记文章，但尚未绑定邮件模版。请完成左侧「保存到邮件模版库」后再查看打开与点击数据。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] text-slate-500">已发邮件</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{sent}</p>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2">
              <p className="text-[11px] text-sky-800">邮件打开量</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-sky-950">{opened}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2">
              <p className="text-[11px] text-emerald-800">阅读原文点击</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-950">{readClicks}</p>
            </div>
            <div className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2">
              <p className="text-[11px] text-violet-800">微信官方阅读</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-violet-950">
                {wechatReads != null ? wechatReads : "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** 文章涨阅读量 · 右侧：多篇文章邮件看板（纵向列表，独立于营销活动统计页） */
function ReadingGrowthArticleBoardList(props: {
  drafts: WechatDraftRecord[];
  emailActive: boolean;
  watchUrls: string[];
  onWatchUrlsChange: (urls: string[]) => void;
}) {
  const [lookupInput, setLookupInput] = useState("");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const boardRows = useMemo(() => {
    const registered = props.drafts
      .filter((d) => (d.publishedArticleUrl ?? "").trim())
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const seen = new Set<string>();
    const rows: Array<{ url: string; draft: WechatDraftRecord | null }> = [];

    for (const url of props.watchUrls) {
      const clean = url.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      const draft = props.drafts.find((d) => (d.publishedArticleUrl ?? "").trim() === clean) ?? null;
      rows.push({ url: clean, draft });
    }
    for (const draft of registered) {
      const url = (draft.publishedArticleUrl ?? "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      rows.push({ url, draft });
    }
    return rows;
  }, [props.watchUrls, props.drafts]);

  const statsArticles = useMemo(
    () =>
      boardRows
        .filter((r) => r.draft?.linkedEmailTemplateId)
        .map((r) => ({
          draftId: r.draft!.id,
          publishId: r.draft!.publishId,
          publishedAt: r.draft!.publishedAt,
          linkedEmailTemplateId: r.draft!.linkedEmailTemplateId
        })),
    [boardRows]
  );

  const { byDraftId, loading, lastFetchedAt } = useWechatArticleStatsMap(
    statsArticles,
    props.emailActive && statsArticles.length > 0
  );

  function addToBoard(url: string) {
    const clean = url.trim();
    if (!clean) return;
    const next = prependWechatReadingGrowthWatchUrl(clean);
    props.onWatchUrlsChange(next);
    setLookupInput("");
    window.requestAnimationFrame(() => {
      cardRefs.current[clean]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <SectionCard
      title="已登记文章 · 邮件看板"
      description="每篇通过本页保存过模版的文章各占一栏；也可粘贴其他已登记的文章链接加入列表。与营销活动统计页数据分开查询。"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="粘贴公众号文章链接，查看该篇数据"
            onKeyDown={(e) => {
              if (e.key === "Enter") addToBoard(lookupInput);
            }}
          />
          <ActionButton disabled={!lookupInput.trim()} onClick={() => addToBoard(lookupInput)}>
            加入看板
          </ActionButton>
        </div>

        {boardRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            尚无文章。左侧保存邮件模版后会自动加入；也可在此粘贴已登记过的文章链接。
          </p>
        ) : (
          <div className="max-h-[calc(100vh-14rem)] space-y-3 overflow-y-auto pr-1">
            {boardRows.map((row, idx) => (
              <div
                key={row.url}
                ref={(el) => {
                  cardRefs.current[row.url] = el;
                }}
              >
                <ReadingGrowthArticleBoardRow
                  index={idx + 1}
                  url={row.url}
                  draft={row.draft}
                  stats={row.draft ? byDraftId[row.draft.id] : undefined}
                />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          说明：<strong>邮件打开</strong>≠公众号已读；<strong>阅读原文点击</strong>为邮件内追踪链接点击，更接近导流阅读。
          微信官方阅读通常次日更新，仅供参考。
        </p>
        {lastFetchedAt ? (
          <p className="text-[11px] text-slate-400">
            {loading ? "刷新中…" : `看板更新于 ${lastFetchedAt}`}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

/** 文章涨阅读量 · 链接生成邮件模版 */
export function WechatOfficialReadingGrowthPage() {
  const { drafts, setDrafts } = useWechatDrafts();
  const { settings, refresh: refreshSettings } = useWechatSettings();
  const { isModuleActive } = useProductModules();
  const emailActive = isModuleActive("email");
  useWechatArticleStatsSync(drafts, setDrafts, emailActive);
  const [title, setTitle] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateTag, setTemplateTag] = useState("公众号");
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("这篇文章值得你花几分钟读完，里面有可以直接落地的获客思路。");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"ok" | "err">("ok");
  const [boardWatchUrls, setBoardWatchUrls] = useState<string[]>(() => readWechatReadingGrowthWatchUrls());

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    const t = title.trim();
    if (t && !subject.trim()) setSubject(t.slice(0, 120));
    if (t && !templateName.trim()) setTemplateName(`公众号-${t.slice(0, 12)}`);
  }, [title, subject, templateName]);

  async function saveGrowthTemplate() {
    const cleanTitle = title.trim();
    const cleanUrl = articleUrl.trim();
    const cleanName = templateName.trim();
    const cleanTag = templateTag.trim();
    const cleanSubject = subject.trim() || cleanTitle;
    if (!cleanTitle) {
      setNoticeTone("err");
      setNotice("请填写公众号文章标题。");
      return;
    }
    if (!cleanUrl || !/^https?:\/\/mp\.weixin\.qq\.com\//i.test(cleanUrl)) {
      setNoticeTone("err");
      setNotice("请填写 mp.weixin.qq.com 的公众号文章链接。");
      return;
    }
    if (!cleanName) {
      setNoticeTone("err");
      setNotice("请填写模版名称。");
      return;
    }
    if (!cleanTag || cleanTag.length > 15) {
      setNoticeTone("err");
      setNotice("请填写 1-15 个字的模版标签。");
      return;
    }
    if (!emailActive) {
      setNoticeTone("err");
      setNotice("当前安装包未开通「邮件与营销」模块，无法保存到邮件模版库。");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const account = currentWechatAccountLabel(settings);
      const now = nowIso();
      const existing = drafts.find((d) => d.publishedArticleUrl === cleanUrl);
      const draftId = existing?.id ?? createId();
      let importedArticle: RemotePublishedArticle | null = null;
      try {
        const imported = await apiJson<{ ok: boolean; article?: RemotePublishedArticle; message?: string }>(
          "/api/wechat-official/published/import-url",
          {
            method: "POST",
            body: JSON.stringify({ url: cleanUrl, title: cleanTitle, accountName: account.accountName })
          }
        );
        if (imported.ok && imported.article) importedArticle = imported.article;
      } catch {
        importedArticle = null;
      }
      const fallbackHtml = `<p>${escapeInlineHtml(intro.trim() || cleanTitle)}</p><p><a href="${escapeInlineHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">打开微信公众号原文</a></p>`;
      const importedHtml = importedArticle?.contentHtml?.trim() || "";
      const contentHtml = importedHtml && !importedHtml.includes("打开微信公众号原文") ? importedHtml : fallbackHtml;
      const article: WechatDraftRecord = {
        id: draftId,
        title: cleanTitle,
        digest: importedArticle?.digest?.trim() || intro.trim(),
        contentHtml,
        status: "published",
        publishId: importedArticle?.publishId || existing?.publishId,
        publishedAt: existing?.publishedAt ?? now,
        publishedArticleUrl: cleanUrl,
        accountId: account.accountId,
        accountName: account.accountName,
        author: importedArticle?.author || existing?.author,
        coverPreviewUrl: importedArticle?.thumbUrl || existing?.coverPreviewUrl,
        readCount: existing?.readCount ?? 0,
        emailDrivenReads: existing?.emailDrivenReads ?? 0,
        emailSent: existing?.emailSent ?? 0,
        emailClicks: existing?.emailClicks ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      const trackedGoUrl = await registerWechatArticleLink(article);
      const body = buildWechatArticleEmailPrefill(
        { ...article, title: cleanSubject.slice(0, 64) },
        { trackedGoUrl: trackedGoUrl ?? undefined, ctaVariant: "readingOriginalFooter" }
      );
      const resp = await apiJson<{ ok: boolean; id?: number; message?: string }>("/api/email/templates", {
        method: "POST",
        body: JSON.stringify({
          name: cleanName.slice(0, 64),
          category: cleanTag,
          businessLine: "all",
          subjectTemplate: cleanSubject.slice(0, 120),
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          fontStack: WECHAT_EMAIL_FONT_STACK,
          groupIds: [],
          scheduleEnabled: false,
          scheduledAt: null,
          signatureMode: "preset",
          signaturePresetKey: null,
          signatureHtml: null
        })
      });
      if (!resp.ok || !resp.id) throw new Error(resp.message || "保存邮件模版失败");
      const savedArticle = { ...article, linkedEmailTemplateId: resp.id, linkedEmailTemplateName: cleanName };
      await registerWechatArticleLink(savedArticle);
      setDrafts((prev) => upsertPublishedDrafts(prev, [savedArticle]));
      setBoardWatchUrls(prependWechatReadingGrowthWatchUrl(cleanUrl));
      setNoticeTone("ok");
      setNotice(`已生成邮件模版「${cleanName}」。${importedHtml ? "已尝试采集公众号原文正文。" : "未采集到原文正文，已使用引导文案。"}邮件打开会计入邮件打开；点击「阅读原文」才会计入邮件带来阅读，并可能增加公众号阅读量。`);
    } catch (e: unknown) {
      setNoticeTone("err");
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame view="growth">
      {notice ? (
        <div className="mb-3">
          <FeedbackBanner tone={noticeTone}>{notice}</FeedbackBanner>
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <SectionCard title="生成涨阅读邮件模版" description="填写公众号文章标题和链接，保存后到邮件营销选择该模版发送。">
          <div className="grid gap-3">
            <label className="block text-xs font-medium text-slate-700">
              公众号文章标题
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：海外获客怎么从 0 到 1"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              公众号文章链接
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder="https://mp.weixin.qq.com/s/..."
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              邮件标题
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="默认等于文章标题"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-700">
                模版名称
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="公众号-文章标题"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                模版标签
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                  value={templateTag}
                  onChange={(e) => setTemplateTag(e.target.value)}
                  maxLength={15}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-700">
              邮件引导文案
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton primary disabled={busy} onClick={() => void saveGrowthTemplate()}>
                {busy ? "保存中…" : "保存到邮件模版库"}
              </ActionButton>
              <Link to="/email/templates">
                <ActionButton>查看邮件模版</ActionButton>
              </Link>
              <Link to="/email/campaigns">
                <ActionButton>去邮件营销发送</ActionButton>
              </Link>
            </div>
          </div>
        </SectionCard>
        <ReadingGrowthArticleBoardList
          drafts={drafts}
          emailActive={emailActive}
          watchUrls={boardWatchUrls}
          onWatchUrlsChange={setBoardWatchUrls}
        />
      </div>
    </PageFrame>
  );
}

function escapeInlineHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 草稿箱：写好保存的草稿，显示每篇是否已提交到公众号草稿箱 */
type CronDraftListItem = {
  id: number;
  filename: string;
  title: string;
  accountName: string;
  slot: number;
  createdAt: string;
  updatedAt: string | null;
  status: string;
  submittedAt: string | null;
  mediaId: string | null;
  chars: number;
};

type CronDraftDetail = CronDraftListItem & {
  contentMd: string;
};

export function WechatOfficialDraftsPage() {
  const { settings, canSyncDraft } = useWechatSettings();
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");
  const [drafts, setDrafts] = useState<CronDraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  // 两个公众号的实际名称（按 slot 取）
  const [slotNames, setSlotNames] = useState<Record<string, string>>({ "1": "公众号 1", "2": "公众号 2" });
  // 编辑弹窗
  const [editing, setEditing] = useState<CronDraftDetail | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 并行加载草稿和两个公众号名称
      const [draftsResp, s1, s2] = await Promise.all([
        apiJson<{ ok: boolean; drafts?: CronDraftListItem[] }>("/api/wechat-official/cron-drafts"),
        apiJson<{ ok: boolean; settings?: { accountName?: string } }>("/api/wechat-official/settings?slot=1").catch(() => ({ ok: false as const })),
        apiJson<{ ok: boolean; settings?: { accountName?: string } }>("/api/wechat-official/settings?slot=2").catch(() => ({ ok: false as const })),
      ]);
      if (draftsResp.ok && Array.isArray(draftsResp.drafts)) {
        // 确保 slot 是数字（兼容字符串）
        const normalized = draftsResp.drafts.map((d) => ({
          ...d,
          slot: Number(d.slot) === 2 ? 2 : 1,
        }));
        setDrafts(normalized);
      }
      const names: Record<string, string> = { "1": "公众号 1", "2": "公众号 2" };
      if (s1.ok && s1.settings?.accountName) names["1"] = s1.settings.accountName;
      if (s2.ok && s2.settings?.accountName) names["2"] = s2.settings.accountName;
      setSlotNames(names);
    } catch {
      setMsgTone("err");
      setMsg("加载草稿列表失败，请刷新重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** 按 slot 分区：1=第一个公众号，2=第二个公众号 */
  const accountGroups = useMemo(() => {
    const list1 = drafts.filter((d) => d.slot !== 2);
    const list2 = drafts.filter((d) => d.slot === 2);
    const sortByTime = (a: CronDraftListItem, b: CronDraftListItem) =>
      (b.createdAt || "").localeCompare(a.createdAt || "");
    const groups = [];
    if (list1.length > 0) {
      groups.push({ slot: 1, accountName: slotNames["1"], items: [...list1].sort(sortByTime) });
    }
    if (list2.length > 0) {
      groups.push({ slot: 2, accountName: slotNames["2"], items: [...list2].sort(sortByTime) });
    }
    return groups;
  }, [drafts, slotNames]);

  function statusMeta(status: string): { label: string; tone: "amber" | "sky" | "green" | "rose" } {
    if (status === "submitted") return { label: "已提交到草稿箱", tone: "sky" };
    if (status === "published") return { label: "已发布", tone: "green" };
    if (status === "failed") return { label: "提交失败", tone: "rose" };
    return { label: "未提交", tone: "amber" };
  }

  async function openEditor(item: CronDraftListItem) {
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; draft?: CronDraftDetail }>(
        `/api/wechat-official/cron-drafts/${item.id}`
      );
      if (!resp.ok || !resp.draft) throw new Error("获取文章内容失败");
      setEditing(resp.draft);
      setEditTitle(resp.draft.title || "");
      setEditContent(resp.draft.contentMd || "");
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(`打开失败：${String((e as Error)?.message ?? e)}`);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const title = editTitle.trim();
    if (!title) {
      setMsgTone("err");
      setMsg("标题不能为空。");
      return;
    }
    if (!editContent.trim()) {
      setMsgTone("err");
      setMsg("正文不能为空。");
      return;
    }
    setEditSaving(true);
    try {
      const resp = await apiJson<{ ok: boolean; message?: string }>(
        `/api/wechat-official/cron-drafts/${editing.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ title, contentMd: editContent })
        }
      );
      if (!resp.ok) throw new Error(resp.message || "保存失败");
      setEditing(null);
      setMsgTone("ok");
      setMsg(`「${title}」已保存。`);
      await loadAll();
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(`保存失败：${String((e as Error)?.message ?? e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function submitDraft(item: CronDraftListItem) {
    if (!canSyncDraft) {
      setMsgTone("err");
      setMsg("请先完成公众号 API 配置（AppID / AppSecret）后再提交。");
      return;
    }
    setBusyId(item.id);
    setMsg("");
    try {
      // 取正文并转 HTML
      const detailResp = await apiJson<{ ok: boolean; draft?: CronDraftDetail }>(
        `/api/wechat-official/cron-drafts/${item.id}`
      );
      if (!detailResp.ok || !detailResp.draft?.contentMd) throw new Error("获取文章内容失败");
      const contentHtml = String(marked.parse(detailResp.draft.contentMd));
      const account = currentWechatAccountLabel(settings);
      const submitSlot = item.slot === 2 ? 2 : 1;
      // 取该公众号的默认封面
      let thumbMediaId = "";
      try {
        const sResp = await apiJson<{ ok: boolean; settings?: { thumbMediaId?: string } }>(
          `/api/wechat-official/settings?slot=${submitSlot}`
        );
        if (sResp.ok && sResp.settings?.thumbMediaId) thumbMediaId = sResp.settings.thumbMediaId;
      } catch { /* 无默认封面则空着，后端会报错提示 */ }
      const resp = await apiJsonWithTimeout<{ ok: boolean; mediaId?: string; message?: string }>(
        `/api/wechat-official/cron-drafts/${item.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            slot: submitSlot,
            title: item.title.trim().slice(0, 64),
            contentHtml,
            author: account.accountName || "BigSocialBoss",
            thumbMediaId
          })
        },
        60_000
      );
      if (!resp.ok) throw new Error(resp.message || "提交失败");
      setMsgTone("ok");
      setMsg(`「${item.title || "未命名"}」已提交到微信公众号草稿箱。`);
      await loadAll();
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(`「${item.title || "未命名"}」提交失败：${String((e as Error)?.message ?? e)}`);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageFrame view="drafts">
      {msg ? (
        <div className="mb-3">
          <FeedbackBanner tone={msgTone}>{msg}</FeedbackBanner>
        </div>
      ) : null}
      {!canSyncDraft ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          尚未完成公众号 API 配置（AppID / AppSecret）。可先查看和编辑草稿，配置完成后再提交到草稿箱。
          <Link to="/wechat-official/publishing" className="ml-1 font-semibold underline">
            去创建文章页配置
          </Link>
        </div>
      ) : null}
      {loading ? (
        <SectionCard title="草稿箱" description="正在加载…">
          <div className="px-1 py-4 text-sm text-slate-500">正在加载草稿…</div>
        </SectionCard>
      ) : accountGroups.length === 0 ? (
        <SectionCard title="草稿箱" description="两个公众号的文章草稿会按账号分区显示在这里。">
          <div className="px-1 py-4 text-sm text-slate-500">
            暂无草稿。每天自动写作后会出现在这里。
          </div>
        </SectionCard>
      ) : (
        accountGroups.map((group) => (
          <SectionCard
            key={group.slot}
            title={`草稿箱 · ${group.accountName}`}
            description={`归属公众号「${group.accountName}」的文章草稿，共 ${group.items.length} 篇。点「打开编辑」可修改后保存，点「提交到草稿箱」同步到微信公众号后台。`}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="max-h-[480px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">文章</th>
                      <th className="px-3 py-2">提交状态</th>
                      <th className="px-3 py-2">草稿保存时间</th>
                      <th className="px-3 py-2">提交时间</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {group.items.map((item) => {
                      const meta = statusMeta(item.status);
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-3 font-medium text-slate-900">{item.title || "未命名"}</td>
                          <td className="px-3 py-3">
                            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{fmtTime(item.createdAt)}</td>
                          <td className="px-3 py-3 text-slate-600">
                            {item.submittedAt ? fmtTime(item.submittedAt) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <ActionButton onClick={() => void openEditor(item)}>
                                打开编辑
                              </ActionButton>
                              {item.status === "local" || item.status === "failed" ? (
                                <ActionButton primary disabled={busyId === item.id} onClick={() => void submitDraft(item)}>
                                  {busyId === item.id ? "提交中…" : "提交到草稿箱"}
                                </ActionButton>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          </SectionCard>
        ))
      )}
      {/* 编辑弹窗 */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                编辑文章 · {editing.accountName}
              </h3>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                onClick={() => setEditing(null)}
              >
                关闭
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  正文（Markdown）
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={18}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="text-xs text-slate-500">
                草稿保存时间：{fmtTime(editing.createdAt)}
                {editing.updatedAt ? ` · 上次编辑：${fmtTime(editing.updatedAt)}` : null}
                {editing.submittedAt ? ` · 已提交：${fmtTime(editing.submittedAt)}` : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <ActionButton onClick={() => setEditing(null)}>取消</ActionButton>
              <ActionButton primary disabled={editSaving} onClick={() => void saveEdit()}>
                {editSaving ? "保存中…" : "保存"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageFrame>
  );
}

export function WechatOfficialPublisherPage() {
  return <WechatOfficialAccountsPage />;
}

export default WechatOfficialPublisherPage;
