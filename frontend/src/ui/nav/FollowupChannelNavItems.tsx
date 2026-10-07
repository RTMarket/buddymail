import React, { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../lib/api";
import { refreshFollowupChannelsCache } from "./standaloneNavCatalog";

type Channel = { id: number; channelKey: string; label: string; sortOrder: number };

const DEFAULT_KEYS = ["direct", "agency", "influencer"];

/**
 * 客户跟进的子菜单：支持行内改名、新增渠道
 * 用在 AppLayout 左侧导航"客户跟进"分组下
 */
export function FollowupChannelNavItems(props: {
  renderLink: (to: string, label: string, active: boolean) => React.ReactNode;
  pathname: string;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingLabel, setDeletingLabel] = useState("");
  const [deletingCount, setDeletingCount] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirmDelete(key: string, label: string) {
    // 先查该渠道下有多少客户
    try {
      const r = await apiJson<{ ok: boolean; count: number }>(
        "/api/crm/followup-channels/" + encodeURIComponent(key) + "/count"
      );
      setDeletingCount(r.ok ? r.count : 0);
    } catch {
      setDeletingCount(0);
    }
    setDeletingKey(key);
    setDeletingLabel(label);
  }

  async function doDelete() {
    if (!deletingKey) return;
    setSaving(true);
    try {
      await apiJson("/api/crm/followup-channels/" + encodeURIComponent(deletingKey), {
        method: "DELETE",
      });
      await refreshFollowupChannelsCache();
      window.location.reload();
    } finally {
      setSaving(false);
      setDeletingKey(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ ok: boolean; items: Channel[] }>("/api/crm/followup-channels");
      if (r.ok && Array.isArray(r.items) && r.items.length) {
        setChannels(r.items);
        return;
      }
    } catch {
      // 回退默认
    }
    setChannels([
      { id: 1, channelKey: "direct", label: "直客跟进", sortOrder: 1 },
      { id: 2, channelKey: "agency", label: "代理分销商", sortOrder: 2 },
      { id: 3, channelKey: "influencer", label: "网红博主导师", sortOrder: 3 },
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRename(key: string) {
    const label = editLabel.trim();
    if (!label) {
      setEditingKey(null);
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/crm/followup-channels/" + encodeURIComponent(key), {
        method: "PUT",
        body: JSON.stringify({ label }),
      });
      await refreshFollowupChannelsCache();
      // 刷新整个页面，让标题和菜单都用新名称
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  async function addChannel() {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    try {
      await apiJson("/api/crm/followup-channels", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      await refreshFollowupChannelsCache();
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-0.5">
      {channels.map((ch) => {
        const to = `/crm/followup-boards/${ch.channelKey}`;
        const active = props.pathname === to || props.pathname.startsWith(to + "/");
        const isEditing = editingKey === ch.channelKey;
        return (
          <div key={ch.channelKey} className="group relative">
            {isEditing ? (
              <div className="mb-0.5 flex items-center gap-1 rounded-md border border-sky-400 bg-white px-2 py-1.5">
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(ch.channelKey);
                    if (e.key === "Escape") setEditingKey(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-slate-800 outline-none"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveRename(ch.channelKey)}
                  className="shrink-0 rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                {props.renderLink(to, ch.label, active)}
                <button
                  type="button"
                  title="改名"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setEditLabel(ch.label);
                    setEditingKey(ch.channelKey);
                  }}
                  className="absolute top-1/2 right-8 hidden -translate-y-1/2 rounded p-1 text-slate-400 group-hover:block hover:bg-slate-200 hover:text-slate-600"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="删除渠道"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    confirmDelete(ch.channelKey, ch.label);
                  }}
                  className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded p-1 text-slate-400 group-hover:block hover:bg-red-100 hover:text-red-600"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </>
            )}
          </div>
        );
      })}
      {/* 删除确认弹窗 */}
      {deletingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeletingKey(null)}>
          <div className="w-80 rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </span>
              <h3 className="text-sm font-bold text-red-600">确定删除该渠道吗？</h3>
            </div>
            <p className="mb-1 text-sm text-slate-700">
              渠道「{deletingLabel}」下有 <span className="font-bold text-red-600">{deletingCount}</span> 家客户，
            </p>
            <p className="mb-4 text-sm text-slate-700">
              删除后这些客户的跟进记录将<span className="font-bold text-red-600">全部清空，不可恢复</span>！
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingKey(null)}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={doDelete}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
