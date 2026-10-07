import React, { useEffect, useState } from "react";
import { apiJson } from "../../lib/api";

type Slot = { slot: number; domain: string; usage: string };

export function EmailDailyMailboxConfigPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>(["", "", "", "", ""]);
  const [savedPrefixes, setSavedPrefixes] = useState<string[]>(["", "", "", "", ""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");

  async function load() {
    try {
      const r = await apiJson<{
        ok: boolean;
        slots: Slot[];
        config: { prefixes: string[]; locked: boolean } | null;
      }>("/api/daily-mailbox/config");
      if (r.ok) {
        setSlots(r.slots || []);
        if (r.config) {
          setPrefixes([...r.config.prefixes]);
          setSavedPrefixes([...r.config.prefixes]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 实时预览：输入时触发导航更新
  function onInput(i: number, v: string) {
    const next = [...prefixes];
    next[i] = v;
    setPrefixes(next);
    // 通知导航栏更新预览
    window.dispatchEvent(new CustomEvent("mailbox-config-preview", {
      detail: { prefixes: next, slots }
    }));
  }

  async function save() {
    const toSave = prefixes.map((p, i) => (savedPrefixes[i] ? null : (p.trim() || null)));
    if (!toSave.some((p) => p)) {
      alert("没有新的前缀需要保存");
      return;
    }
    if (!window.confirm("保存后已填的前缀将锁定，不可再修改。确定保存吗？")) return;
    setSaving(true);
    setProgress("正在保存配置…");
    try {
      const r = await apiJson<{ ok: boolean; message?: string; created?: string[] }>(
        "/api/daily-mailbox/config",
        { method: "POST", body: JSON.stringify({ prefixes: toSave }) }
      );
      if (r.ok) {
        setProgress("正在创建邮箱用户…");
        // 重新加载，刷新锁定状态
        await load();
        // 通知导航栏刷新正式列表
        window.dispatchEvent(new CustomEvent("mailbox-config-saved"));
        setProgress("配置完成！");
        setTimeout(() => setProgress(""), 2000);
      } else {
        alert("保存失败：" + (r.message || "未知错误"));
        setProgress("");
      }
    } catch (e) {
      alert("保存失败：" + String((e as Error)?.message ?? e));
      setProgress("");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-1 text-lg font-bold text-slate-800">企业邮箱配置</h2>
      <p className="mb-6 text-sm text-slate-500">
        填写企业邮箱前缀，域名已固定。已保存的前缀将锁定，不可再修改。可以分多次填写。
      </p>
      {progress && (
        <div className="mb-4 rounded-md border border-sky-300 bg-sky-50 p-3 text-center text-sm text-sky-700">
          {progress}
        </div>
      )}
      <div className="space-y-4">
        {slots.map((s, i) => {
          const isSaved = !!savedPrefixes[i];
          return (
            <div key={s.slot} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  邮箱{i + 1}
                </span>
                {isSaved && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">已锁定</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={prefixes[i] || ""}
                  disabled={isSaved || saving}
                  onChange={(e) => onInput(i, e.target.value)}
                  placeholder="如 marketing"
                  className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
                <span className="text-sm text-slate-500">@{s.domain}</span>
              </div>
              {prefixes[i]?.trim() && (
                <p className="mt-2 text-xs text-slate-400">
                  完整地址：{prefixes[i].trim().toLowerCase()}@{s.domain}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-6 w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "配置中…" : "保存"}
      </button>
    </div>
  );
}
