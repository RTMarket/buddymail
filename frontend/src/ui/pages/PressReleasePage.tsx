import React, { useCallback, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { apiJson } from "../../lib/api";

type ReleaseItem = {
  id: number;
  title: string;
  excerpt: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type PlatformItem = {
  id: number;
  name: string;
  country: string;
  url: string;
  platform_type: string;
  contact: string;
  notes: string;
  updated_at: string;
};

type TabKey = "write" | "list" | "platforms";

const PLATFORM_TYPES: { value: string; label: string }[] = [
  { value: "media", label: "媒体" },
  { value: "news", label: "新闻稿发布平台" },
  { value: "blog", label: "博客平台" }
];

function platformTypeLabel(v: string): string {
  return PLATFORM_TYPES.find((t) => t.value === v)?.label || v || "媒体";
}

function fmtTime(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50";
const btnDanger =
  "rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50";

export function PressReleasePage() {
  const [tab, setTab] = useState<TabKey>("write");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 写稿表单
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);

  // 平台表单
  const [pfEditingId, setPfEditingId] = useState<number | null>(null);
  const [pfName, setPfName] = useState("");
  const [pfCountry, setPfCountry] = useState("");
  const [pfUrl, setPfUrl] = useState("");
  const [pfType, setPfType] = useState("media");
  const [pfContact, setPfContact] = useState("");
  const [pfNotes, setPfNotes] = useState("");
  const [pfSaving, setPfSaving] = useState(false);

  const showNotice = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 4000);
  };

  const loadReleases = useCallback(async () => {
    const data = await apiJson<{ ok: boolean; items: ReleaseItem[] }>("/api/press/releases");
    setReleases(data.items || []);
  }, []);

  const loadPlatforms = useCallback(async () => {
    const data = await apiJson<{ ok: boolean; items: PlatformItem[] }>("/api/press/platforms");
    setPlatforms(data.items || []);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadReleases(), loadPlatforms()]);
    } catch (e) {
      showNotice("err", (e as Error)?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [loadReleases, loadPlatforms]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const resetEditor = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setStatus("draft");
  };

  const saveRelease = async () => {
    if (!title.trim()) {
      showNotice("err", "请填写标题");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiJson("/api/press/releases/" + editingId, {
          method: "PUT",
          body: JSON.stringify({ title: title.trim(), content, status })
        });
        showNotice("ok", "已更新");
      } else {
        await apiJson("/api/press/releases", {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), content, status })
        });
        showNotice("ok", status === "draft" ? "已保存到草稿箱" : "已发布");
      }
      resetEditor();
      await loadReleases();
    } catch (e) {
      showNotice("err", (e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const editRelease = async (id: number) => {
    try {
      const data = await apiJson<{ ok: boolean; item: { title: string; content: string; status: string } }>(
        "/api/press/releases/" + id
      );
      setEditingId(id);
      setTitle(data.item.title || "");
      setContent(data.item.content || "");
      setStatus(data.item.status || "draft");
      setTab("write");
      window.scrollTo({ top: 0 });
    } catch (e) {
      showNotice("err", (e as Error)?.message || "读取稿件失败");
    }
  };

  const deleteRelease = async (id: number, t: string) => {
    if (!window.confirm(`确定删除稿件「${t}」吗？`)) return;
    try {
      await apiJson("/api/press/releases/" + id, { method: "DELETE" });
      showNotice("ok", "已删除");
      await loadReleases();
    } catch (e) {
      showNotice("err", (e as Error)?.message || "删除失败");
    }
  };

  const resetPlatformForm = () => {
    setPfEditingId(null);
    setPfName("");
    setPfCountry("");
    setPfUrl("");
    setPfType("media");
    setPfContact("");
    setPfNotes("");
  };

  const savePlatform = async () => {
    if (!pfName.trim()) {
      showNotice("err", "请填写平台名称");
      return;
    }
    setPfSaving(true);
    try {
      const body = JSON.stringify({
        name: pfName.trim(),
        country: pfCountry.trim(),
        url: pfUrl.trim(),
        platform_type: pfType,
        contact: pfContact.trim(),
        notes: pfNotes
      });
      if (pfEditingId) {
        await apiJson("/api/press/platforms/" + pfEditingId, { method: "PUT", body });
        showNotice("ok", "平台已更新");
      } else {
        await apiJson("/api/press/platforms", { method: "POST", body });
        showNotice("ok", "平台已录入");
      }
      resetPlatformForm();
      await loadPlatforms();
    } catch (e) {
      showNotice("err", (e as Error)?.message || "保存失败");
    } finally {
      setPfSaving(false);
    }
  };

  const editPlatform = (p: PlatformItem) => {
    setPfEditingId(p.id);
    setPfName(p.name);
    setPfCountry(p.country);
    setPfUrl(p.url);
    setPfType(p.platform_type || "media");
    setPfContact(p.contact);
    setPfNotes(p.notes);
    window.scrollTo({ top: 0 });
  };

  const deletePlatform = async (id: number, name: string) => {
    if (!window.confirm(`确定删除平台「${name}」吗？`)) return;
    try {
      await apiJson("/api/press/platforms/" + id, { method: "DELETE" });
      showNotice("ok", "已删除");
      await loadPlatforms();
    } catch (e) {
      showNotice("err", (e as Error)?.message || "删除失败");
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "write", label: "写新闻稿" },
    { key: "list", label: `稿件列表（${releases.length}）` },
    { key: "platforms", label: `平台库（${platforms.length}）` }
  ];

  return (
    <PageShell
      title="媒体新闻稿撰写区"
      description="市场部在这里写新闻稿、存草稿，并维护各国发布平台库。"
      actions={
        <button className={btnGhost} onClick={reloadAll} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
      }
    >
      {notice && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            notice.kind === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "write" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{editingId ? "编辑稿件" : "写新闻稿"}</h2>
            {editingId && (
              <button className={btnGhost} onClick={resetEditor}>
                取消编辑
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">标题</label>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：BigSocialBoss 发布 AI 获客中台进阶版"
              maxLength={255}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">
              正文 <span className="text-slate-400">（{content.length} 字）</span>
            </label>
            <textarea
              className={`${inputCls} min-h-[320px] leading-relaxed`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里撰写新闻稿正文…"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="text-sm text-slate-600">状态</label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={status === "draft"} onChange={() => setStatus("draft")} />
              存为草稿
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={status === "published"} onChange={() => setStatus("published")} />
              标记已发布
            </label>
          </div>
          <div>
            <button className={btnPrimary} onClick={saveRelease} disabled={saving}>
              {saving ? "保存中…" : editingId ? "更新稿件" : "保存"}
            </button>
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="space-y-3">
          {releases.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
              还没有稿件，去「写新闻稿」写第一篇吧。
            </div>
          )}
          {releases.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{r.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        r.status === "published" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.status === "published" ? "已发布" : "草稿"}
                    </span>
                  </div>
                  {r.excerpt && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{r.excerpt}…</p>}
                  <p className="mt-1 text-xs text-slate-400">更新于 {fmtTime(r.updated_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className={btnGhost} onClick={() => editRelease(r.id)}>
                    编辑
                  </button>
                  <button className={btnDanger} onClick={() => deleteRelease(r.id, r.title)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "platforms" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold">{pfEditingId ? "编辑平台" : "录入新平台"}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-slate-600">平台名称 *</label>
                <input className={inputCls} value={pfName} onChange={(e) => setPfName(e.target.value)} placeholder="例如：PR Newswire" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">国家 / 地区</label>
                <input className={inputCls} value={pfCountry} onChange={(e) => setPfCountry(e.target.value)} placeholder="例如：美国" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">平台网址</label>
                <input className={inputCls} value={pfUrl} onChange={(e) => setPfUrl(e.target.value)} placeholder="https://" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">类型</label>
                <select className={inputCls} value={pfType} onChange={(e) => setPfType(e.target.value)}>
                  {PLATFORM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">联系方式</label>
                <input className={inputCls} value={pfContact} onChange={(e) => setPfContact(e.target.value)} placeholder="投稿邮箱 / 对接人" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">备注</label>
                <input className={inputCls} value={pfNotes} onChange={(e) => setPfNotes(e.target.value)} placeholder="收录要求、价格等" />
              </div>
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary} onClick={savePlatform} disabled={pfSaving}>
                {pfSaving ? "保存中…" : pfEditingId ? "更新平台" : "录入平台"}
              </button>
              {pfEditingId && (
                <button className={btnGhost} onClick={resetPlatformForm}>
                  取消
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {platforms.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                平台库目前是空的。市场部每天去各国找发布平台，找到后在上面录入。
              </div>
            )}
            {platforms.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {platformTypeLabel(p.platform_type)}
                      </span>
                      {p.country && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{p.country}</span>
                      )}
                    </div>
                    {p.url && (
                      <a
                        href={p.url.startsWith("http") ? p.url : `https://${p.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-sm text-blue-600 hover:underline"
                      >
                        {p.url}
                      </a>
                    )}
                    {(p.contact || p.notes) && (
                      <p className="mt-1 text-sm text-slate-500">
                        {[p.contact && `联系：${p.contact}`, p.notes].filter(Boolean).join(" ｜ ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className={btnGhost} onClick={() => editPlatform(p)}>
                      编辑
                    </button>
                    <button className={btnDanger} onClick={() => deletePlatform(p.id, p.name)}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
