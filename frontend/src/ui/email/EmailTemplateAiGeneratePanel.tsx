import { useEffect, useState } from "react";
import { apiJson, apiJsonWithTimeout } from "../../lib/api";
import { EMAIL_TEMPLATE_LINK_IMPORT_TIMEOUT_MS } from "../../lib/emailTemplateAiTimeouts";
import { buildWechatArticleEmailPrefill } from "../../lib/wechatArticleEmailReuse";
import { registerWechatArticleLink } from "../../lib/wechatArticleRegistry";
import type { WechatDraftRecord } from "../../lib/wechatPublisherStorage";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";

const DEFAULT_FONT_STACK =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

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

function createWechatTemplateDraftId() {
  return `wx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeInlineHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function EmailTemplateAiGeneratePanel(props: {
  ui: EmailTemplatesPageStrings;
  onTemplateSaved?: (templateId: number) => Promise<void> | void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const { ui, onTemplateSaved, onError, onSuccess } = props;

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const [pageUrl, setPageUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateTag, setTemplateTag] = useState("公众号");

  useEffect(() => {
    const clean = subject.trim();
    if (clean && !templateName.trim()) setTemplateName(`公众号-${clean.slice(0, 12)}`);
  }, [subject, templateName]);

  async function saveWechatArticleTemplate() {
    const url = pageUrl.trim();
    if (!url) {
      onError(ui.linkImportErrUrlRequired);
      return;
    }
    if (!/^https?:\/\/(?:www\.)?mp\.weixin\.qq\.com\//i.test(url)) {
      onError("请填写 mp.weixin.qq.com 的公众号文章链接。");
      return;
    }
    const cleanSubject = subject.trim();
    if (!cleanSubject) {
      onError("请填写邮件主题。");
      return;
    }
    const cleanName = templateName.trim();
    if (!cleanName) {
      onError("请填写模版名称。");
      return;
    }
    const cleanTag = templateTag.trim();
    if (!cleanTag || cleanTag.length > 15) {
      onError("请填写 1-15 个字的模版标签。");
      return;
    }

    setBusy(true);
    setStatusLine(null);
    try {
      let importedArticle: RemotePublishedArticle | null = null;
      try {
        const imported = await apiJsonWithTimeout<{
          ok: boolean;
          article?: RemotePublishedArticle;
          message?: string;
        }>(
          "/api/wechat-official/published/import-url",
          { method: "POST", body: JSON.stringify({ url, title: cleanSubject }) },
          EMAIL_TEMPLATE_LINK_IMPORT_TIMEOUT_MS
        );
        if (imported.ok && imported.article) importedArticle = imported.article;
      } catch {
        importedArticle = null;
      }

      const articleUrl = importedArticle?.articleUrl?.trim() || url;
      const fallbackHtml = `<p>${escapeInlineHtml(cleanSubject)}</p><p><a href="${escapeInlineHtml(articleUrl)}" target="_blank" rel="noopener noreferrer">打开微信公众号原文</a></p>`;
      const importedHtml = importedArticle?.contentHtml?.trim() || "";
      const contentHtml = importedHtml && !importedHtml.includes("打开微信公众号原文") ? importedHtml : fallbackHtml;
      const now = new Date().toISOString();
      const article: WechatDraftRecord = {
        id: importedArticle?.id || createWechatTemplateDraftId(),
        title: cleanSubject.slice(0, 64),
        digest: importedArticle?.digest?.trim() || "",
        contentHtml,
        status: "published",
        publishId: importedArticle?.publishId || undefined,
        publishedAt: importedArticle?.publishedAt || importedArticle?.updateTime || now,
        publishedArticleUrl: articleUrl,
        author: importedArticle?.author || undefined,
        coverPreviewUrl: importedArticle?.thumbUrl || undefined,
        readCount: 0,
        emailDrivenReads: 0,
        emailSent: 0,
        emailClicks: 0,
        createdAt: now,
        updatedAt: now
      };

      const trackedGoUrl = await registerWechatArticleLink(article);
      const body = buildWechatArticleEmailPrefill(article, {
        trackedGoUrl: trackedGoUrl ?? undefined,
        ctaVariant: "readingOriginalFooter"
      });
      const resp = await apiJson<{ ok: boolean; id?: number; message?: string }>("/api/email/templates", {
        method: "POST",
        body: JSON.stringify({
          name: cleanName.slice(0, 64),
          category: cleanTag,
          businessLine: "all",
          subjectTemplate: cleanSubject.slice(0, 120),
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          fontStack: DEFAULT_FONT_STACK,
          groupIds: [],
          scheduleEnabled: false,
          scheduledAt: null,
          signatureMode: "preset",
          signaturePresetKey: null,
          signatureHtml: null
        })
      });
      if (!resp.ok || !resp.id) throw new Error(resp.message || "保存邮件模版失败");
      await registerWechatArticleLink({ ...article, linkedEmailTemplateId: resp.id, linkedEmailTemplateName: cleanName });
      await onTemplateSaved?.(resp.id);

      const okMsg = ui.linkImportSuccess;
      setStatusLine({ kind: "ok", text: okMsg });
      onSuccess?.(okMsg);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      setStatusLine({ kind: "err", text: msg });
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/80 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-violet-900">{ui.aiModeLink}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-violet-800/90">{ui.linkImportHint}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? ui.commerceCollapse : ui.commerceOpen}
        </button>
      </div>
      {open ? (
        <div className="space-y-3 px-3 pb-3 pt-3">
          <label className="block text-xs font-medium text-slate-700">
            公众号文章 URL
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://mp.weixin.qq.com/s/..."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-700">
              邮件主题
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                placeholder="默认作为邮件标题"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              模版名称
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                maxLength={64}
                placeholder="例如：公众号-Wise"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block text-xs font-medium text-slate-700">
              模版标签
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={templateTag}
                onChange={(e) => setTemplateTag(e.target.value)}
                maxLength={15}
                placeholder="最多 15 字，例如：公众号"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={busy || !pageUrl.trim()}
                className="h-10 rounded-md bg-violet-700 px-4 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                onClick={() => void saveWechatArticleTemplate()}
              >
                {busy ? "保存中…" : "保存到邮件模版库"}
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">{ui.linkImportNote}</p>
          {statusLine ? (
            <p
              className={`rounded-md px-2.5 py-2 text-xs leading-snug ${
                statusLine.kind === "err"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {statusLine.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
