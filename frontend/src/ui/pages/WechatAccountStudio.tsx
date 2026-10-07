import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { apiFormUploadWithTimeout, apiJson } from "../../lib/api";

type SlotSettings = {
  configured?: boolean;
  hint?: string;
  appId?: string;
  accountName?: string;
  author?: string;
  thumbMediaId?: string;
};

type SlotForm = {
  appId: string;
  appSecret: string;
  accountName: string;
  author: string;
  thumbMediaId: string;
  hint: string;
  ready: boolean;
};

const EMPTY_SLOT: SlotForm = {
  appId: "",
  appSecret: "",
  accountName: "",
  author: "",
  thumbMediaId: "",
  hint: "",
  ready: false
};

const EMOJIS = [
  "😊", "😄", "😉", "😍", "🥰", "😘", "🤔", "😎", "🙏", "👍",
  "👏", "🎉", "✨", "💡", "📌", "🔥", "❤️", "⭐", "✅", "❗",
  "💬", "📣", "🎁", "🌟", "🍀", "🌈", "☀️", "📝", "📷", "👀",
  "💪", "🤝", "💼", "📈"
];

const FONT_SIZES = ["14px", "15px", "16px", "18px", "20px", "24px"];

const TEXT_COLORS = ["#1e293b", "#64748b", "#059669", "#dc2626", "#ea580c", "#2563eb", "#7c3aed"];

const TEMPLATES: Array<{ name: string; hint: string; html: string }> = [
  {
    name: "关注我们",
    hint: "绿底引导关注",
    html: `<section style="margin:16px 0;padding:16px;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:10px;text-align:center;"><p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#065f46;">关注我们</p><p style="margin:0;font-size:14px;line-height:1.8;color:#047857;">长按识别二维码，获取最新资讯。</p></section><p><br></p>`
  },
  {
    name: "Follow us",
    hint: "深色英文关注条",
    html: `<section style="margin:16px 0;padding:16px;background:#0f172a;border-radius:10px;text-align:center;"><p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#ffffff;">Follow us</p><p style="margin:0;font-size:13px;line-height:1.7;color:#cbd5e1;">Stay with us for the next update.</p></section><p><br></p>`
  },
  {
    name: "正文段落",
    hint: "两端对齐正文",
    html: `<p style="margin:12px 0;font-size:16px;line-height:1.9;color:#1e293b;text-align:justify;">在这里写下这一段正文。</p>`
  },
  {
    name: "主题框",
    hint: "左侧绿条标题框",
    html: `<section style="margin:16px 0;padding:14px 16px;border-left:4px solid #059669;background:#f8fafc;border-radius:0 8px 8px 0;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0f172a;">主题标题</p><p style="margin:0;font-size:15px;line-height:1.8;color:#334155;">这里放主题说明。</p></section><p><br></p>`
  },
  {
    name: "小标题",
    hint: "带下划线的小节名",
    html: `<p style="margin:18px 0 8px;font-size:18px;font-weight:700;color:#0f172a;border-bottom:2px solid #10b981;padding-bottom:4px;">小标题</p>`
  },
  {
    name: "金句",
    hint: "居中强调一句",
    html: `<p style="margin:16px 0;padding:18px 14px;text-align:center;font-size:18px;font-weight:700;line-height:1.7;color:#065f46;background:#f0fdf4;border-radius:10px;">一句想让读者记住的话</p>`
  },
  {
    name: "引用",
    hint: "左侧灰线引文",
    html: `<blockquote style="margin:16px 0;padding:10px 14px;border-left:3px solid #94a3b8;color:#475569;font-size:15px;line-height:1.8;">引用一段话。</blockquote>`
  },
  {
    name: "提示条",
    hint: "橙色注意说明",
    html: `<p style="margin:12px 0;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#9a3412;font-size:14px;line-height:1.7;">提示：这里写需要读者注意的内容。</p>`
  },
  {
    name: "要点卡",
    hint: "浅底要点块",
    html: `<section style="margin:16px 0;padding:12px 14px;background:#f1f5f9;border-radius:10px;"><p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;">要点</p><p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">把要点写在这里。</p></section><p><br></p>`
  },
  {
    name: "三步说明",
    hint: "01 / 02 / 03",
    html: `<section style="margin:16px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;"><p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#1e293b;"><strong style="color:#059669;">01</strong>&nbsp;第一步说明</p><p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#1e293b;"><strong style="color:#059669;">02</strong>&nbsp;第二步说明</p><p style="margin:0;font-size:15px;line-height:1.7;color:#1e293b;"><strong style="color:#059669;">03</strong>&nbsp;第三步说明</p></section><p><br></p>`
  },
  {
    name: "分割线",
    hint: "段落之间的间隔",
    html: `<p style="margin:18px 0;text-align:center;color:#94a3b8;letter-spacing:6px;font-size:14px;">— ◆ —</p>`
  },
  {
    name: "文末署名",
    hint: "右对齐结束语",
    html: `<p style="margin:20px 0 0;text-align:right;font-size:14px;color:#64748b;line-height:1.8;">感谢阅读<br>关注我们，下篇见</p>`
  }
];

function insertHtml(html: string) {
  document.execCommand("insertHTML", false, html);
}

function wrapTemplate(html: string) {
  return `<div data-wx-tpl="1" style="margin:10px 0;"><div data-wx-del="1" contenteditable="false" style="display:inline-block;margin:0 0 6px;padding:1px 8px;border-radius:999px;background:#fff1f2;color:#9f1239;font-size:12px;line-height:20px;cursor:pointer;user-select:none;">删除此模版</div>${html}</div>`;
}

function articleHtmlForSubmit(root: HTMLElement): { html: string; text: string } {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-wx-del]").forEach((node) => node.remove());
  return { html: clone.innerHTML.trim(), text: (clone.innerText || "").replace(/\u00a0/g, " ").trim() };
}

async function compressJpeg(file: File, maxWidth: number, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("图片处理失败。");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.88;
  let blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("图片处理失败。"))), "image/jpeg", quality);
  });
  while (blob.size > maxBytes && quality > 0.42) {
    quality -= 0.1;
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("图片处理失败。"))), "image/jpeg", quality);
    });
  }
  return blob;
}

export function WechatAccountStudio() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<[SlotForm, SlotForm]>([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
  const [loading, setLoading] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fontSize, setFontSize] = useState("16px");
  const [textColor, setTextColor] = useState("#1e293b");
  const savedRange = useRef<Range | null>(null);
  const [title, setTitle] = useState("");
  const [digest, setDigest] = useState("");
  const [submitSlot, setSubmitSlot] = useState<1 | 2>(1);
  const [coverId, setCoverId] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");
  const [authOpen, setAuthOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(true);
  const [draftsOpen, setDraftsOpen] = useState(true);
  type CronDraftItem = {
    id: number; title: string; accountName: string; slot: number;
    createdAt: string; updatedAt: string | null; status: string;
    submittedAt: string | null; mediaId: string | null; chars: number;
  };
  const [drafts, setDrafts] = useState<CronDraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftBusyId, setDraftBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: [SlotForm, SlotForm] = [{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }];
      for (const slot of [1, 2] as const) {
        try {
          const resp = await apiJson<{ ok: boolean; settings?: SlotSettings }>(`/api/wechat-official/settings?slot=${slot}`);
          const s = resp.settings;
          next[slot - 1] = {
            appId: s?.appId ?? "",
            appSecret: "",
            accountName: s?.accountName ?? "",
            author: s?.author ?? "",
            thumbMediaId: s?.thumbMediaId ?? "",
            hint: s?.hint ?? "",
            ready: Boolean(s?.appId && s?.hint)
          };
        } catch {
          /* 空槽位保持空白 */
        }
      }
      if (!cancelled) {
        setSlots(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patchSlot(index: 0 | 1, patch: Partial<SlotForm>) {
    setSlots((prev) => {
      const next: [SlotForm, SlotForm] = [{ ...prev[0] }, { ...prev[1] }];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function focusEditor() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (sel.anchorNode && el.contains(sel.anchorNode)) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function rememberSelection() {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const el = editorRef.current;
    const range = savedRange.current;
    if (!el || !range) {
      focusEditor();
      return;
    }
    el.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function applyBold() {
    restoreSelection();
    document.execCommand("bold");
    rememberSelection();
  }

  function applyColor(color: string) {
    setTextColor(color);
    restoreSelection();
    document.execCommand("foreColor", false, color);
    rememberSelection();
  }

  function applyFontSize(px: string) {
    setFontSize(px);
    restoreSelection();
    document.execCommand("fontSize", false, "7");
    editorRef.current?.querySelectorAll("font[size='7']").forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
  }

  async function saveSlot(index: 0 | 1) {
    const form = slots[index];
    setBusy(`save-${index}`);
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; settings?: SlotSettings; message?: string }>("/api/wechat-official/settings", {
        method: "POST",
        body: JSON.stringify({
          slot: index + 1,
          appId: form.appId.trim(),
          appSecret: form.appSecret.trim() || undefined,
          accountName: form.accountName.trim(),
          author: form.author.trim(),
          thumbMediaId: form.thumbMediaId.trim() || undefined
        })
      });
      if (!resp.ok) throw new Error(resp.message || "保存失败");
      patchSlot(index, { appSecret: "", hint: resp.settings?.hint || form.hint, ready: true });
      setMsgTone("ok");
      setMsg(`公众号 ${index + 1} 已保存。`);
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  async function testSlot(index: 0 | 1) {
    setBusy(`test-${index}`);
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; message?: string }>("/api/wechat-official/test-connection", {
        method: "POST",
        body: JSON.stringify({ slot: index + 1 })
      });
      setMsgTone(resp.ok ? "ok" : "err");
      setMsg(resp.message || (resp.ok ? "连接成功。" : "连接失败。"));
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  async function addImage(file: File) {
    setBusy("image");
    setMsg("");
    try {
      const blob = await compressJpeg(file, 1080, 900_000);
      const fd = new FormData();
      fd.append("file", blob, "content.jpg");
      const resp = await apiFormUploadWithTimeout<{ ok: boolean; url?: string; message?: string }>(
        `/api/wechat-official/content/upload-image?slot=${submitSlot}`,
        fd,
        90_000
      );
      if (!resp.ok || !resp.url) throw new Error(resp.message || "图片上传失败");
      focusEditor();
      insertHtml(
        `<p style="margin:12px 0;text-align:center;"><img src="${resp.url}" style="max-width:100%;height:auto;border-radius:6px;" /></p><p><br></p>`
      );
      setMsgTone("ok");
      setMsg("图片已插入正文。");
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  async function uploadCover(file: File) {
    setBusy("cover");
    setMsg("");
    try {
      const blob = await compressJpeg(file, 1000, 2_000_000);
      const fd = new FormData();
      fd.append("file", blob, "wechat-cover.jpg");
      const resp = await apiFormUploadWithTimeout<{ ok: boolean; thumbMediaId?: string; url?: string; message?: string }>(
        `/api/wechat-official/cover/upload?slot=${submitSlot}`,
        fd,
        90_000
      );
      if (!resp.ok || !resp.thumbMediaId) throw new Error(resp.message || "封面上传失败");
      setCoverId(resp.thumbMediaId);
      setCoverUrl(URL.createObjectURL(blob));
      setMsgTone("ok");
      setMsg("封面已上传，提交时会带上这张图。");
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const [draftsResp, s1, s2] = await Promise.all([
        apiJson<{ ok: boolean; drafts?: CronDraftItem[] }>("/api/wechat-official/cron-drafts"),
        apiJson<{ ok: boolean; settings?: { accountName?: string } }>("/api/wechat-official/settings?slot=1").catch(() => ({ ok: false as const })),
        apiJson<{ ok: boolean; settings?: { accountName?: string } }>("/api/wechat-official/settings?slot=2").catch(() => ({ ok: false as const })),
      ]);
      if (draftsResp.ok && Array.isArray(draftsResp.drafts)) {
        setDrafts(draftsResp.drafts.map((d) => ({ ...d, slot: Number(d.slot) === 2 ? 2 : 1 })));
      }
      if (s1.ok && s1.settings?.accountName) {
        setSlots((prev) => {
          const next = [...prev] as [SlotForm, SlotForm];
          if (!next[0].accountName) next[0] = { ...next[0], accountName: s1.settings!.accountName! };
          return next;
        });
      }
    } catch {
      /* 忽略 */
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const draftGroups = useMemo(() => {
    const g1 = drafts.filter((d) => d.slot !== 2).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const g2 = drafts.filter((d) => d.slot === 2).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return [
      { slot: 1 as const, items: g1 },
      { slot: 2 as const, items: g2 },
    ];
  }, [drafts]);

  async function openDraftInEditor(item: CronDraftItem) {
    setBusy("draft-open");
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; draft?: { title?: string; contentMd?: string } }>(
        `/api/wechat-official/cron-drafts/${item.id}`
      );
      if (!resp.ok || !resp.draft) throw new Error("获取文章内容失败");
      setTitle(resp.draft.title || "");
      setEditingId(item.id);
      setSubmitSlot(item.slot === 2 ? 2 : 1);
      setCoverId("");
      setCoverUrl("");
      if (editorRef.current) {
        const html = String(marked.parse(resp.draft.contentMd || ""));
        editorRef.current.innerHTML = html;
      }
      setEditorOpen(true);
      setMsgTone("ok");
      setMsg(`已载入「${item.title || "未命名"}」，可在上方编辑器修改后提交。`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  function editorHtmlToMarkdown(): string {
    const el = editorRef.current;
    if (!el) return "";
    // 简单转换：把 HTML 块转成 markdown 文本
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return clone.innerText || "";
  }

  async function saveDraft() {
    const md = editorHtmlToMarkdown();
    if (!title.trim()) {
      setMsgTone("err");
      setMsg("请先填写文章标题再保存。");
      return;
    }
    if (!md.trim()) {
      setMsgTone("err");
      setMsg("请先写正文再保存。");
      return;
    }
    setBusy("save");
    setMsg("");
    try {
      if (editingId) {
        const resp = await apiJson<{ ok: boolean; message?: string }>(
          `/api/wechat-official/cron-drafts/${editingId}`,
          { method: "PUT", body: JSON.stringify({ title: title.trim().slice(0, 200), contentMd: md }) }
        );
        if (!resp.ok) throw new Error(resp.message || "保存失败");
      } else {
        const resp = await apiJson<{ ok: boolean; message?: string }>(
          "/api/wechat-official/cron-drafts",
          { method: "POST", body: JSON.stringify({ slot: submitSlot, title: title.trim().slice(0, 200), contentMd: md }) }
        );
        if (!resp.ok) throw new Error(resp.message || "保存失败");
      }
      // 清空编辑器
      setTitle("");
      setEditingId(null);
      setCoverId("");
      setCoverUrl("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setMsgTone("ok");
      setMsg("已保存到草稿箱，编辑器已清空。");
      await loadDrafts();
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  async function submitDraft() {
    const cleaned = editorRef.current ? articleHtmlForSubmit(editorRef.current) : { html: "", text: "" };
    const html = cleaned.html;
    const plain = cleaned.text;
    if (!title.trim()) {
      setMsgTone("err");
      setMsg("请先填写文章标题。");
      return;
    }
    if (!plain) {
      setMsgTone("err");
      setMsg("请先写正文。");
      return;
    }
    const account = slots[submitSlot - 1];
    const effectiveCoverId = coverId || account.thumbMediaId;
    if (!effectiveCoverId) {
      setMsgTone("err");
      setMsg("请先添加封面图，或在上方账号配置中填写默认封面 thumb_media_id。");
      return;
    }
    if (!account.ready && !account.appId) {
      setMsgTone("err");
      setMsg(`请先保存公众号 ${submitSlot} 的 AppID 和 AppSecret。`);
      return;
    }
    setBusy("submit");
    setMsg("");
    try {
      const resp = await apiJson<{ ok: boolean; message?: string; mediaId?: string }>("/api/wechat-official/drafts/sync", {
        method: "POST",
        body: JSON.stringify({
          slot: submitSlot,
          title: title.trim().slice(0, 64),
          digest: digest.trim().slice(0, 120) || undefined,
          contentHtml: html,
          author: account.author.trim() || undefined,
          thumbMediaId: effectiveCoverId
        })
      });
      if (!resp.ok) throw new Error(resp.message || "提交失败");
      setMsgTone("ok");
      setMsg(resp.message || `已同步到公众号 ${submitSlot} 的草稿箱。`);
      setEditingId(null);
      await loadDrafts();
    } catch (e: unknown) {
      setMsgTone("err");
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  }

  const banner =
    msg === ""
      ? null
      : msgTone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <div className="space-y-4">
      <style>{`[data-placeholder]:empty:before{content:attr(data-placeholder);color:#94a3b8;}`}</style>
      {banner ? <div className={`rounded-lg border px-3 py-2 text-sm ${banner}`}>{msg}</div> : null}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">公众号认证</h2>
        <button
          type="button"
          onClick={() => setAuthOpen((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {authOpen ? "收起 ▲" : "展开 ▼"}
        </button>
      </div>
      <div className={authOpen ? "grid gap-3 lg:grid-cols-2" : "hidden"}>
        {slots.map((form, index) => {
          const n = (index + 1) as 1 | 2;
          return (
            <section key={n} className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">公众号 {n}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    form.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {form.ready ? "已保存" : "待配置"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                <input
                  className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                  placeholder="账号名称，例如：品牌公众号"
                  value={form.accountName}
                  onChange={(e) => patchSlot(index as 0 | 1, { accountName: e.target.value })}
                />
                <input
                  className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                  placeholder="AppID"
                  value={form.appId}
                  onChange={(e) => patchSlot(index as 0 | 1, { appId: e.target.value })}
                />
                <input
                  className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                  type="password"
                  placeholder={form.hint ? `AppSecret（已保存 ${form.hint}，留空则不改）` : "AppSecret"}
                  value={form.appSecret}
                  onChange={(e) => patchSlot(index as 0 | 1, { appSecret: e.target.value })}
                />
                <input
                  className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                  placeholder="作者名（提交草稿时默认带上）"
                  value={form.author}
                  onChange={(e) => patchSlot(index as 0 | 1, { author: e.target.value })}
                />
                <input
                  className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                  placeholder="默认封面 thumb_media_id（同步草稿箱必填）"
                  value={form.thumbMediaId}
                  onChange={(e) => patchSlot(index as 0 | 1, { thumbMediaId: e.target.value })}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy !== "" || loading}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => void saveSlot(index as 0 | 1)}
                >
                  {busy === `save-${index}` ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  disabled={busy !== "" || loading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  onClick={() => void testSlot(index as 0 | 1)}
                >
                  {busy === `test-${index}` ? "测试中…" : "测试连接"}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">文章编辑</h3>
            <p className="mt-0.5 text-xs text-slate-500">写正文、加粗、选颜色、插表情和图片。模版插入后可点「删除此模版」。</p>
          </div>
          <button
            type="button"
            onClick={() => setEditorOpen((v) => !v)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {editorOpen ? "收起 ▲" : "展开 ▼"}
          </button>
        </div>
        <div className={editorOpen ? "grid lg:grid-cols-[minmax(0,1fr)_240px]" : "hidden"}>
          <div className="min-w-0 border-b border-slate-100 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                className="h-8 rounded-md border border-slate-300 px-2 text-xs font-bold text-slate-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  rememberSelection();
                }}
                onClick={applyBold}
              >
                加粗
              </button>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                颜色
                <input
                  type="color"
                  aria-label="文字颜色"
                  className="h-8 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  value={textColor}
                  onMouseDown={rememberSelection}
                  onChange={(e) => applyColor(e.target.value)}
                />
              </label>
              <div className="flex items-center gap-1">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    className="h-5 w-5 rounded-full border border-slate-200"
                    style={{ backgroundColor: color }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      rememberSelection();
                    }}
                    onClick={() => applyColor(color)}
                  />
                ))}
              </div>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                字号
                <select
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                  value={fontSize}
                  onMouseDown={rememberSelection}
                  onChange={(e) => applyFontSize(e.target.value)}
                >
                  {FONT_SIZES.map((px) => (
                    <option key={px} value={px}>
                      {px.replace("px", "")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  focusEditor();
                }}
              >
                表情
              </button>
              <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700">
                {busy === "image" ? "图片上传中…" : "插入图片"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={busy !== ""}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void addImage(file);
                  }}
                />
              </label>
            </div>
            {emojiOpen ? (
              <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="h-8 w-8 rounded-md text-base hover:bg-slate-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      focusEditor();
                      insertHtml(emoji);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="h-[420px] overflow-y-auto px-4 py-4 text-[16px] leading-8 text-slate-800 outline-none"
              data-placeholder="从这里开始写文章"
              onMouseUp={rememberSelection}
              onKeyUp={rememberSelection}
              onFocus={() => setEmojiOpen(false)}
              onMouseDown={(e) => {
                const btn = (e.target as HTMLElement).closest?.("[data-wx-del]");
                if (!btn) return;
                e.preventDefault();
                btn.closest("[data-wx-tpl]")?.remove();
              }}
            />
          </div>
          <aside className="bg-slate-50/80">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">可套用模版</div>
            <div className="grid max-h-[520px] gap-2 overflow-y-auto p-3">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    focusEditor();
                    insertHtml(wrapTemplate(tpl.html));
                  }}
                >
                  <div className="text-xs font-semibold text-slate-900">{tpl.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{tpl.hint}</div>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="grid gap-2">
              <label className="block text-xs text-slate-600">
                标题
                <input
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  maxLength={64}
                  placeholder="最多 64 字"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-600">
                摘要
                <textarea
                  className="mt-1 h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6"
                  maxLength={120}
                  placeholder="选填，最多 120 字"
                  value={digest}
                  onChange={(e) => setDigest(e.target.value)}
                />
              </label>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <div className="text-xs font-semibold text-emerald-900">提交到草稿箱</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">选择公众号并添加封面后提交。文章会进入该公众号草稿箱，不会直接群发。</p>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <select
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={submitSlot}
                  onChange={(e) => {
                    setSubmitSlot(Number(e.target.value) === 2 ? 2 : 1);
                    setCoverId("");
                    setCoverUrl("");
                  }}
                >
                  <option value={1}>公众号 1{slots[0].accountName ? ` · ${slots[0].accountName}` : ""}</option>
                  <option value={2}>公众号 2{slots[1].accountName ? ` · ${slots[1].accountName}` : ""}</option>
                </select>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700">
                  {busy === "cover" ? "封面上传中…" : coverId ? "更换封面" : "添加封面图"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={busy !== ""}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadCover(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== ""}
                  className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  onClick={() => void saveDraft()}
                >
                  {busy === "save" ? "保存中…" : editingId ? "保存修改" : "保存到草稿箱"}
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => void submitDraft()}
                >
                  {busy === "submit" ? "提交中…" : "提交并同步到草稿箱"}
                </button>
              </div>
              {coverUrl ? (
                <div className="relative mt-3 inline-block">
                  <img src={coverUrl} alt="封面预览" className="h-20 w-32 rounded-md border border-slate-200 object-cover" />
                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => {
                      setCoverId("");
                      setCoverUrl("");
                      setMsgTone("ok");
                      setMsg("已删除单独上传的封面，提交时将使用账号默认封面。");
                    }}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                    title="删除封面（改用默认封面）"
                  >
                    ×
                  </button>
                </div>
              ) : slots[submitSlot - 1].thumbMediaId ? (
                <p className="mt-3 text-xs text-slate-500">未单独上传封面，提交时将使用该账号的默认封面。</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">草稿箱</h3>
            <p className="mt-0.5 text-xs text-slate-500">两个公众号的文章草稿，点「打开编辑」载入到上方编辑器修改后提交。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadDrafts()} disabled={draftsLoading}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {draftsLoading ? "加载中…" : "刷新"}
            </button>
            <button type="button" onClick={() => setDraftsOpen((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              {draftsOpen ? "收起 ▲" : "展开 ▼"}
            </button>
          </div>
        </div>
        <div className={draftsOpen ? "space-y-3 p-4" : "hidden"}>
          {draftGroups.map((group) => {
            const accName = slots[group.slot - 1].accountName || (group.slot === 1 ? "公众号 1" : "公众号 2");
            return (
              <div key={group.slot} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-800">草稿箱 · {accName}</span>
                  <span className="ml-2 text-xs text-slate-500">共 {group.items.length} 篇</span>
                </div>
                {group.items.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400">暂无草稿</div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                      <thead className="sticky top-0 bg-white text-left text-slate-500">
                        <tr>
                          <th className="px-3 py-2">文章</th>
                          <th className="px-3 py-2">状态</th>
                          <th className="px-3 py-2">保存时间</th>
                          <th className="px-3 py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 font-medium text-slate-900">{item.title || "未命名"}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                item.status === "submitted" ? "bg-sky-100 text-sky-800"
                                : item.status === "published" ? "bg-green-100 text-green-800"
                                : item.status === "failed" ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                              }`}>
                                {item.status === "submitted" ? "已提交" : item.status === "published" ? "已发布" : item.status === "failed" ? "失败" : "未提交"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">{item.createdAt ? item.createdAt.slice(0, 16).replace("T", " ") : "—"}</td>
                            <td className="px-3 py-2">
                              <button type="button" disabled={draftBusyId === item.id || busy !== ""}
                                onClick={() => void openDraftInEditor(item)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                {draftBusyId === item.id ? "载入中…" : "打开编辑"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
