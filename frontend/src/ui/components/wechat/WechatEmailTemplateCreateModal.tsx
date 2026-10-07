import React, { useEffect, useState } from "react";
import { apiJson } from "../../../lib/api";
import { buildWechatArticleEmailPrefill } from "../../../lib/wechatArticleEmailReuse";
import { registerWechatArticleLink } from "../../../lib/wechatArticleRegistry";
import type { WechatDraftRecord } from "../../../lib/wechatPublisherStorage";

const DEFAULT_FONT_STACK =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

type Props = {
  article: WechatDraftRecord;
  onClose: () => void;
  onSaved: (templateId: number, templateName: string) => void;
};

export function WechatEmailTemplateCreateModal(props: Props) {
  const [subject, setSubject] = useState(props.article.title.trim().slice(0, 120));
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("公众号");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setSubject(props.article.title.trim().slice(0, 120));
    setTemplateName(`公众号-${props.article.title.trim().slice(0, 12)}`);
    setCategory("公众号");
    setErr("");
  }, [props.article.id, props.article.title]);

  async function save() {
    const name = templateName.trim();
    const tag = category.trim();
    const subj = subject.trim();
    if (!name) {
      setErr("请填写模版名称。");
      return;
    }
    if (!tag) {
      setErr("请填写模版标签。");
      return;
    }
    if (tag.length > 15) {
      setErr("模版标签最多 15 个字。");
      return;
    }
    if (!subj) {
      setErr("邮件标题不能为空。");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const trackedGoUrl = await registerWechatArticleLink(props.article);
      const body = buildWechatArticleEmailPrefill(
        { ...props.article, title: subj.slice(0, 64) },
        { trackedGoUrl: trackedGoUrl ?? undefined }
      );
      const resp = await apiJson<{ ok: boolean; id?: number; message?: string }>("/api/email/templates", {
        method: "POST",
        body: JSON.stringify({
          name: name.slice(0, 64),
          category: tag,
          businessLine: "all",
          subjectTemplate: subj,
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
      await registerWechatArticleLink({
        ...props.article,
        title: subj.slice(0, 64),
        linkedEmailTemplateId: resp.id
      });
      props.onSaved(resp.id, name);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-950">生成邮件模版</h3>
          <p className="mt-0.5 text-xs text-slate-500">保存后写入邮件模版库；在邮件营销选该模版发送即可。</p>
        </div>
        <div className="space-y-3 px-4 py-3">
          <label className="block text-xs font-medium text-slate-700">
            邮件标题（默认=文章标题）
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            模版名称 <span className="text-rose-600">*</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如：公众号-春季促销"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            模版标签 <span className="text-rose-600">*</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={15}
              placeholder="最多 15 字，例如：公众号"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">
            正文将<strong>完整复制</strong>公众号文章 HTML（含图片与排版）；文末附「在公众号阅读」追踪链接，用于统计<strong>邮件带来阅读</strong>（仅统计点击跳转微信的次数）。收件人直接在邮件里阅读不会计入微信后台阅读量。
          </p>
          {err ? <p className="text-sm text-rose-700">{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="h-9 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            disabled={busy}
            onClick={props.onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="h-9 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-emerald-300"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存到模版库"}
          </button>
        </div>
      </div>
    </div>
  );
}
