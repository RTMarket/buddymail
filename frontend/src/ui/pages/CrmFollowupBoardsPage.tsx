import React, { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../lib/api";
import {
  CATEGORIES,
  DEFAULT_CHANNEL_KEYS,
  Field,
  Modal,
  STAGES,
  StageBoard,
  detectCategoryFromPath,
  resolveChannelLabel,
  useFollowupChannels
} from "./CrmFollowupBoardsShared";
import type { Category, ChannelTab, Stage } from "./CrmFollowupBoardsShared";
import { refreshFollowupChannelsCache } from "../nav/standaloneNavCatalog";

// ================= 主视图（默认 4 阶段；onlyStage 有值时只渲染该阶段） =================
function BoardsView(props: { category: Category; channels: ChannelTab[]; onlyStage?: Stage }) {
  const [counts, setCounts] = useState<Record<Stage, number>>({ cold: 0, intent: 0, deal: 0, won: 0 });
  const [refreshSignal, setRefreshSignal] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const r = await apiJson<{ ok: boolean; counts: Record<Stage, number> }>(
        `/api/crm/followup-boards/stage-counts?category=${encodeURIComponent(props.category)}`
      );
      const cc = r.counts ?? {};
      setCounts({
        cold: Number(cc.cold ?? 0),
        intent: Number(cc.intent ?? 0),
        deal: Number(cc.deal ?? 0),
        won: Number(cc.won ?? 0)
      });
    } catch {
      /* 忽略 */
    }
  }, [props.category]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const catLabel = resolveChannelLabel(props.category, props.channels);
  const catDesc =
    props.channels.find((c) => c.key === props.category)?.description ??
    CATEGORIES.find((c) => c.key === props.category)?.description ??
    "";

  function bump() {
    setRefreshSignal((k) => k + 1);
    loadCounts();
  }

  const stagesToShow = props.onlyStage ? STAGES.filter((s) => s.key === props.onlyStage) : STAGES;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">客户跟进 · {catLabel}</h1>
        {catDesc ? <p className="mt-1 text-sm text-slate-500">{catDesc}</p> : null}
      </div>
      {stagesToShow.map((s) => (
        <StageBoard
          key={`${props.category}-${s.key}`}
          category={props.category}
          stage={s.key}
          refreshSignal={refreshSignal}
          onChanged={bump}
        />
      ))}
    </div>
  );
}

// ================= 渠道管理弹窗 =================
function ChannelManageModal(props: { onClose: () => void }) {
  const [items, setItems] = useState<{ channelKey: string; label: string }[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ ok: boolean; items?: { channelKey: string; label: string }[] }>(
        "/api/crm/followup-channels"
      );
      if (r.ok && Array.isArray(r.items)) {
        setItems(r.items);
        const m: Record<string, string> = {};
        r.items.forEach((it) => {
          m[it.channelKey] = it.label;
        });
        setLabels(m);
      }
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function afterChanged() {
    await refreshFollowupChannelsCache();
    window.location.reload();
  }

  async function saveLabel(key: string) {
    const label = (labels[key] ?? "").trim();
    if (!label) {
      setMsg("渠道名称不能为空");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await apiJson(`/api/crm/followup-channels/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ label })
      });
      await afterChanged();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  async function addChannel() {
    const label = newLabel.trim();
    if (!label) {
      setMsg("请输入新渠道名称");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await apiJson<{ ok: boolean; channelKey: string }>("/api/crm/followup-channels", {
        method: "POST",
        body: JSON.stringify({ label })
      });
      await afterChanged();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  async function deleteChannel(key: string, label: string) {
    if (DEFAULT_CHANNEL_KEYS.includes(key)) return;
    if (!window.confirm(`确定删除渠道「${label}」吗？该渠道下的所有客户数据会被一起删除。`)) return;
    setSaving(true);
    setMsg("");
    try {
      await apiJson(`/api/crm/followup-channels/${encodeURIComponent(key)}`, { method: "DELETE" });
      await afterChanged();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title="跟进渠道管理" onClose={props.onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          每个渠道拥有独立的 4 个跟进阶段区。默认 3 个渠道不可删除，自定义渠道可删除（会连同该渠道所有客户数据一起删除）。
        </p>
        <div className="space-y-2">
          {items.map((it) => {
            const isDefault = DEFAULT_CHANNEL_KEYS.includes(it.channelKey);
            return (
              <div key={it.channelKey} className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                  value={labels[it.channelKey] ?? ""}
                  onChange={(e) => setLabels((m) => ({ ...m, [it.channelKey]: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveLabel(it.channelKey)}
                  className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  保存
                </button>
                {isDefault ? (
                  <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">默认</span>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => deleteChannel(it.channelKey, it.label)}
                    className="whitespace-nowrap rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    删除
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {msg ? <p className="text-sm text-rose-600">{msg}</p> : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ================= 页面导出 =================
export function CrmFollowupBoardsPage() {
  const pathCat = detectCategoryFromPath();
  const { channels } = useFollowupChannels();
  const [tab, setTab] = useState<Category>("direct");
  // ?manage=1：从菜单栏齿轮进入时自动打开渠道管理弹窗
  const [showManage, setShowManage] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("manage") === "1";
  });

  if (pathCat) {
    // 渠道页面只显示冷启动破冰区，右上角"进入意向沟通区"进入独立页
    return (
      <div className="p-4 md:p-6">
        <BoardsView category={pathCat} channels={channels} onlyStage="cold" />
      </div>
    );
  }

  const activeTab = channels.some((c) => c.key === tab) ? tab : channels[0]?.key ?? "direct";

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === c.key
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowManage(true)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          渠道管理
        </button>
      </div>
      <BoardsView category={activeTab} channels={channels} />
      {showManage ? <ChannelManageModal onClose={() => setShowManage(false)} /> : null}
    </div>
  );
}

export function CrmFollowupDirectPage() {
  return <CrmFollowupBoardsPage />;
}
export function CrmFollowupAgencyPage() {
  return <CrmFollowupBoardsPage />;
}
export function CrmFollowupInfluencerPage() {
  return <CrmFollowupBoardsPage />;
}
