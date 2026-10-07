import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";

// ================= 类型 =================
// 渠道 key：默认 direct/agency/influencer，用户可新增自定义渠道（key 如 ch_xxx）
export type Category = string;
export type Stage = "cold" | "intent" | "deal" | "won";

export interface CompanyItem {
  id: number;
  category: Category;
  stage: Stage;
  tag: string;
  company: string;
  website: string;
  companyIntro: string;
  owner: string;
  nextFollowupAt: string | null;
  stageUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contactCount: number;
  recordCount: number;
  lastFollowupDate: string | null;
  replyCount: number;
  primaryContactId: number | null;
  primaryContactName: string;
  primaryContactPosition: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  primaryContactStatus: string;
}

export interface ContactItem {
  id: number;
  name: string;
  position: string;
  email: string;
  phone: string;
  status: "active" | "rejected" | "won";
  isPrimary: number | boolean | string;
  recordCount: number;
  lastFollowupDate: string | null;
}

export interface RecordItem {
  id: number;
  followupDate: string;
  actionType: string;
  content: string;
  owner: string;
  hasReply: number | boolean | string;
  createdAt: string;
}

export interface CompanyDetailData {
  id: number;
  category: Category;
  stage: Stage;
  tag: string;
  company: string;
  website: string;
  companyIntro: string;
  owner: string;
  nextFollowupAt: string | null;
}

// ================= 常量 =================
export const CATEGORIES: { key: Category; label: string; description: string }[] = [
  { key: "direct", label: "直客跟进", description: "日常邮箱写开发信跟进的直客" },
  { key: "agency", label: "代理分销商", description: "谈代理分销合作的客户" },
  { key: "influencer", label: "网红博主导师", description: "网红 / 知识博主 / 创业导师合作" }
];

export interface StageMeta {
  key: Stage;
  label: string;
  percent: string;
  description: string;
  wrapCls: string;
  headerCls: string;
  countCls: string;
  nextStage: Stage | null;
  nextPath: string;
  nextLabel: string;
}

export const STAGES: StageMeta[] = [
  {
    key: "cold",
    label: "冷启动破冰区",
    percent: "20%",
    description: "第一次发开发信，3 天一期持续跟进",
    wrapCls: "border-slate-300",
    headerCls: "bg-slate-200/70",
    countCls: "bg-slate-600",
    nextStage: "intent",
    nextPath: "intent",
    nextLabel: "进入意向沟通区"
  },
  {
    key: "intent",
    label: "意向沟通区",
    percent: "50%",
    description: "有回复 / 问询的客户，根据回复内容判断后挪入",
    wrapCls: "border-amber-300",
    headerCls: "bg-amber-100",
    countCls: "bg-amber-600",
    nextStage: "deal",
    nextPath: "deal",
    nextLabel: "进入订单签约区"
  },
  {
    key: "deal",
    label: "订单签约区",
    percent: "80%",
    description: "意向沟通产生的，准备签约 / 下单",
    wrapCls: "border-blue-300",
    headerCls: "bg-blue-100",
    countCls: "bg-blue-600",
    nextStage: "won",
    nextPath: "won",
    nextLabel: "进入成功区"
  },
  {
    key: "won",
    label: "Make a Deal 成功区",
    percent: "100%",
    description: "已签合同 / 对方明确回复确定需要",
    wrapCls: "border-emerald-300",
    headerCls: "bg-emerald-100",
    countCls: "bg-emerald-600",
    nextStage: null,
    nextPath: "",
    nextLabel: ""
  }
];

export const ACTION_TYPES = [
  "第一封开发信",
  "第二封跟进",
  "第三封跟进",
  "电话沟通",
  "微信沟通",
  "视频会议",
  "报价方案",
  "签约",
  "自定义"
];

export const OWNER_OPTIONS = ["勇勇", "琪琪", "豆豆", "旺仔", "GG"];

// ================= 跟进渠道 =================
export interface FollowupChannelItem {
  id: number;
  channelKey: string;
  label: string;
  sortOrder: number;
}

/** 不允许删除的默认渠道 */
export const DEFAULT_CHANNEL_KEYS = ["direct", "agency", "influencer"];

export interface ChannelTab {
  key: string;
  label: string;
  description: string;
}

/** 从接口加载跟进渠道列表（失败时回退到默认3个） */
export function useFollowupChannels(): { channels: ChannelTab[]; loading: boolean; reload: () => void } {
  const [channels, setChannels] = useState<ChannelTab[]>(() =>
    CATEGORIES.map((c) => ({ key: c.key, label: c.label, description: c.description }))
  );
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiJson<{ ok: boolean; items?: FollowupChannelItem[] }>("/api/crm/followup-channels");
      if (r.ok && Array.isArray(r.items) && r.items.length > 0) {
        setChannels(
          r.items.map((it) => {
            const def = CATEGORIES.find((c) => c.key === it.channelKey);
            return { key: it.channelKey, label: it.label, description: def?.description ?? "" };
          })
        );
      }
    } catch {
      /* 保持默认 */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { channels, loading, reload: load };
}

/** 解析渠道显示名（自定义渠道用接口数据，找不到则回退 key 本身） */
export function resolveChannelLabel(category: string, channels: ChannelTab[]): string {
  return (
    channels.find((c) => c.key === category)?.label ??
    CATEGORIES.find((c) => c.key === category)?.label ??
    category
  );
}

// ================= 工具函数 =================
export function detectCategoryFromPath(): Category | null {
  if (typeof window === "undefined") return null;
  const segs = window.location.pathname.split("/").filter(Boolean);
  const idx = segs.lastIndexOf("followup-boards");
  if (idx < 0) return null;
  const after = segs.slice(idx + 1);
  if (after.length === 0) return null;
  const last = after[after.length - 1];
  // /crm/followup-boards/{key}/intent|deal|won → 取渠道 key（倒数第二段）
  if ((last === "intent" || last === "deal" || last === "won") && after.length >= 2) {
    return after[after.length - 2];
  }
  return after[0];
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDaysStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function datePart(s: string | null | undefined): string {
  if (!s) return "";
  const t = String(s).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : t.slice(0, 10);
}

function reminderTone(nextFollowupAt: string | null | undefined): "overdue" | "soon" | "normal" | "none" {
  const d = datePart(nextFollowupAt);
  if (!d) return "none";
  const t = todayStr();
  if (d < t) return "overdue";
  if (d <= addDaysStr(7)) return "soon";
  return "normal";
}

function isTruthy(v: number | boolean | string | undefined | null): boolean {
  return v === true || v === 1 || v === "1";
}

function stageLabel(key: Stage): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

// ================= 通用小组件 =================
export function Modal(props: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onClose}>
      <div
        className={`max-h-[92vh] w-full ${props.wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto rounded-lg bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-base font-semibold text-slate-800">{props.title}</h3>
          <button type="button" onClick={props.onClose} className="rounded px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ×
          </button>
        </div>
        <div className="px-5 py-4">{props.children}</div>
      </div>
    </div>
  );
}

export function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{props.label}</span>
      {props.children}
      {props.hint ? <span className="mt-1 block text-xs text-slate-400">{props.hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none";

function OwnerSelect(props: { value: string; onChange: (v: string) => void }) {
  const [manual, setManual] = useState(() => props.value !== "" && !OWNER_OPTIONS.includes(props.value));
  useEffect(() => {
    setManual(props.value !== "" && !OWNER_OPTIONS.includes(props.value));
  }, [props.value]);
  if (manual) {
    return (
      <div className="flex gap-2">
        <input className={inputCls} value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder="输入跟进人" />
        <button
          type="button"
          onClick={() => {
            props.onChange("");
            setManual(false);
          }}
          className="shrink-0 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
        >
          下拉选
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <select className={inputCls} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">请选择</option>
        {OWNER_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManual(true)}
        className="shrink-0 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
      >
        手动填
      </button>
    </div>
  );
}

function Pagination(props: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  if (props.total <= props.pageSize) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm text-slate-600">
      <span>
        第 {props.page}/{totalPages} 页，共 {props.total} 条
      </span>
      <button
        type="button"
        disabled={props.page <= 1}
        onClick={() => props.onPage(props.page - 1)}
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
      >
        上一页
      </button>
      <button
        type="button"
        disabled={props.page >= totalPages}
        onClick={() => props.onPage(props.page + 1)}
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
      >
        下一页
      </button>
    </div>
  );
}

// ================= 新增/编辑公司 =================
export function CompanyFormModal(props: {
  category: Category;
  stage: Stage;
  initial?: CompanyDetailData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const init = props.initial;
  const [company, setCompany] = useState(init?.company ?? "");
  const [tag, setTag] = useState(init?.tag ?? "");
  const [website, setWebsite] = useState(init?.website ?? "");
  const [companyIntro, setCompanyIntro] = useState(init?.companyIntro ?? "");
  const [owner, setOwner] = useState(init?.owner ?? "");
  const [note, setNote] = useState((init as { note?: string } | null)?.note ?? "");
  const [nextFollowupAt, setNextFollowupAt] = useState(() =>
    init ? datePart(init.nextFollowupAt) : props.stage === "cold" ? addDaysStr(3) : todayStr()
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!company.trim()) {
      setErr("企业名称必填");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init) {
        await apiJson<{ ok: boolean }>(`/api/crm/followup-boards/${init.id}`, {
          method: "PUT",
          body: JSON.stringify({
            company: company.trim(),
            tag: tag.trim(),
            website: website.trim(),
            companyIntro: companyIntro.trim(),
            owner: owner.trim(),
            nextFollowupAt: nextFollowupAt || null,
            note: note.trim()
          })
        });
      } else {
        await apiJson<{ ok: boolean; id: number }>(`/api/crm/followup-boards`, {
          method: "POST",
          body: JSON.stringify({
            category: props.category,
            stage: props.stage,
            company: company.trim(),
            tag: tag.trim(),
            website: website.trim(),
            companyIntro: companyIntro.trim(),
            owner: owner.trim(),
            nextFollowupAt: nextFollowupAt || null,
            note: note.trim()
          })
        });
      }
      props.onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={init ? "编辑公司" : `新增客户（${stageLabel(props.stage)}）`} onClose={props.onClose}>
      <div className="space-y-4">
        <Field label="企业名称 *">
          <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司全称" />
        </Field>
        <Field label="客户标签" hint="格式：行业+数字+日期，例如 电商-001-20260929">
          <input className={inputCls} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="电商-001-20260929" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="官网">
            <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="跟进人">
            <OwnerSelect value={owner} onChange={setOwner} />
          </Field>
        </div>
        <Field label="企业介绍">
          <textarea className={inputCls} rows={3} value={companyIntro} onChange={(e) => setCompanyIntro(e.target.value)} placeholder="这家企业是做什么的…" />
        </Field>
        <Field label="备注跟进内容" hint="记录这家客户的背景、跟进要点等">
          <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：这家是做跨境电商的，老板姓王，上次说对邮件营销感兴趣…" />
        </Field>
        <Field label="下次提醒跟进时间" hint={props.stage === "cold" ? "冷启动默认 3 天后跟进" : ""}>
          <input type="date" className={inputCls} value={nextFollowupAt} onChange={(e) => setNextFollowupAt(e.target.value)} />
        </Field>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ================= 新增/编辑联系人 =================
export function ContactFormModal(props: {
  companyId: number;
  initial?: ContactItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const init = props.initial;
  const [name, setName] = useState(init?.name ?? "");
  const [position, setPosition] = useState(init?.position ?? "");
  const [email, setEmail] = useState(init?.email ?? "");
  const [phone, setPhone] = useState(init?.phone ?? "");
  const [isPrimary, setIsPrimary] = useState(init ? isTruthy(init.isPrimary) : false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) {
      setErr("人名必填");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init) {
        await apiJson<{ ok: boolean }>(`/api/crm/followup-boards/${props.companyId}/contacts/${init.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            position: position.trim(),
            email: email.trim(),
            phone: phone.trim(),
            isPrimary
          })
        });
      } else {
        await apiJson<{ ok: boolean; id: number }>(`/api/crm/followup-boards/${props.companyId}/contacts`, {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            position: position.trim(),
            email: email.trim(),
            phone: phone.trim(),
            isPrimary
          })
        });
      }
      props.onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={init ? "编辑联系人" : "新增联系人"} onClose={props.onClose}>
      <div className="space-y-4">
        <Field label="人名 *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="联系人姓名" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="职位">
            <input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="如 市场总监" />
          </Field>
          <Field label="电话">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="电话 / 手机" />
          </Field>
        </div>
        <Field label="邮箱">
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />
          设为主联系人（列表中跟进谁就显示谁）
        </label>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ================= 新增跟进记录 =================
export function RecordFormModal(props: {
  companyId: number;
  contactId: number;
  contactName: string;
  companyStage: Stage;
  onClose: () => void;
  onSaved: (movedToIntent: boolean) => void;
}) {
  const [followupDate, setFollowupDate] = useState(todayStr());
  const [actionType, setActionType] = useState(ACTION_TYPES[0]);
  const [customAction, setCustomAction] = useState("");
  const [content, setContent] = useState("");
  const [owner, setOwner] = useState("");
  const [hasReply, setHasReply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const finalAction = actionType === "自定义" ? customAction.trim() || "自定义跟进" : actionType;
    if (!content.trim()) {
      setErr("跟进内容必填");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await apiJson<{ ok: boolean; id: number }>(
        `/api/crm/followup-boards/${props.companyId}/contacts/${props.contactId}/records`,
        {
          method: "POST",
          body: JSON.stringify({
            followupDate,
            actionType: finalAction,
            content: content.trim(),
            owner: owner.trim(),
            hasReply
          })
        }
      );
      let moved = false;
      if (hasReply && props.companyStage === "cold") {
        if (window.confirm("这条跟进标记了有回复，是否把该公司挪到意向沟通区？")) {
          await apiJson<{ ok: boolean }>(`/api/crm/followup-boards/${props.companyId}/move-stage`, {
            method: "POST",
            body: JSON.stringify({ stage: "intent" })
          });
          moved = true;
        }
      }
      props.onSaved(moved);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`新增跟进（${props.contactName}）`} onClose={props.onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          每次跟进都是定制化内容，请先思考完整再记录。
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="日期">
            <input type="date" className={inputCls} value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />
          </Field>
          <Field label="做了什么事">
            <select className={inputCls} value={actionType} onChange={(e) => setActionType(e.target.value)}>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {actionType === "自定义" ? (
          <Field label="自定义事项">
            <input className={inputCls} value={customAction} onChange={(e) => setCustomAction(e.target.value)} placeholder="例如：寄送样品" />
          </Field>
        ) : null}
        <Field label="跟进内容备注 *">
          <textarea
            className={inputCls}
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="这次跟进具体做了什么、对方什么反应、下一步打算…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="跟进人">
            <OwnerSelect value={owner} onChange={setOwner} />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={hasReply} onChange={(e) => setHasReply(e.target.checked)} className="h-4 w-4" />
              有回复 / 有意向
            </label>
          </div>
        </div>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存跟进记录"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ================= 阶段区（可复用） =================
export function StageBoard(props: {
  category: Category;
  stage: Stage;
  refreshSignal?: number;
  onChanged?: () => void;
}) {
  const meta = useMemo(() => STAGES.find((s) => s.key === props.stage)!, [props.stage]);
  const [items, setItems] = useState<CompanyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CompanyDetailData | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiJson<{ ok: boolean; items: CompanyItem[]; total: number }>(
        `/api/crm/followup-boards?category=${props.category}&stage=${props.stage}&page=${page}&pageSize=${pageSize}`
      );
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [props.category, props.stage, page]);

  useEffect(() => {
    load();
  }, [load, props.refreshSignal]);

  useEffect(() => {
    setPage(1);
  }, [props.category, props.stage]);

  function changed() {
    load();
    props.onChanged?.();
  }

  async function moveStage(id: number, to: Stage) {
    if (to === props.stage) return;
    try {
      await apiJson<{ ok: boolean }>(`/api/crm/followup-boards/${id}/move-stage`, {
        method: "POST",
        body: JSON.stringify({ stage: to })
      });
      changed();
    } catch (e) {
      alert(`挪动失败：${String((e as Error)?.message ?? e)}`);
    }
  }

  async function removeCompany(id: number, name: string) {
    if (!window.confirm(`确定删除「${name}」吗？该公司的联系人和跟进记录会一起删除。`)) return;
    try {
      await apiJson<{ ok: boolean }>(`/api/crm/followup-boards/${id}`, { method: "DELETE" });
      changed();
    } catch (e) {
      alert(`删除失败：${String((e as Error)?.message ?? e)}`);
    }
  }

  function openEdit(item: CompanyItem) {
    setEditing({
      id: item.id,
      category: item.category,
      stage: item.stage,
      tag: item.tag ?? "",
      company: item.company,
      website: item.website ?? "",
      companyIntro: item.companyIntro ?? "",
      owner: item.owner ?? "",
      nextFollowupAt: item.nextFollowupAt
    });
  }

  const nextHref =
    meta.nextStage != null ? `/crm/followup-boards/${props.category}/${meta.nextPath}` : null;

  return (
    <section className={`overflow-hidden rounded-lg border ${meta.wrapCls} bg-white`}>
      <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${meta.headerCls}`}>
        <h2 className="text-base font-bold text-slate-800">{meta.label}</h2>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-600">{meta.percent}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${meta.countCls}`}>{total} 家</span>
        <span className="text-xs text-slate-500">{meta.description}</span>
        <div className="ml-auto flex items-center gap-2">
          {nextHref ? (
            <a
              href={nextHref}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              {meta.nextLabel} →
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
          >
            + 新增客户
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <>
          <div className="overflow-x-auto">
            <div className="max-h-[1200px] overflow-y-auto">
            <table className="w-full min-w-[1280px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">客户标签</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">企业名称</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">人名</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">职位</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">邮箱</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">电话</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">跟进人</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">下次提醒</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">跟进次数</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                      加载中…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                      暂无客户，点击右上角「新增客户」
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const tone = reminderTone(it.nextFollowupAt);
                    return (
                      <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-3 py-2">
                          {it.tag ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {it.tag}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="max-w-[220px] px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setDetailId(it.id)}
                            className="truncate font-medium text-sky-700 hover:underline"
                            title={`${it.company}（点击看详情）`}
                          >
                            {it.company}
                          </button>
                          {it.contactCount > 1 ? (
                            <span className="ml-1 text-xs text-slate-400">{it.contactCount}人</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {it.primaryContactName || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {it.primaryContactPosition || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-slate-600" title={it.primaryContactEmail || ""}>
                          {it.primaryContactEmail || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {it.primaryContactPhone || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{it.owner || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {tone === "none" ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span
                              className={
                                tone === "overdue"
                                  ? "font-semibold text-rose-600"
                                  : tone === "soon"
                                    ? "font-semibold text-amber-600"
                                    : "text-slate-600"
                              }
                            >
                              {datePart(it.nextFollowupAt)}
                              {tone === "overdue" ? "（已过期）" : ""}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {it.recordCount} 次
                          {it.replyCount > 0 ? (
                            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                              {it.replyCount}回复
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailId(it.id)}
                              className="rounded px-2 py-1 text-xs text-sky-700 hover:bg-sky-50"
                            >
                              详情
                            </button>
                            <select
                              className="rounded border border-slate-200 px-1 py-1 text-xs text-slate-600"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) moveStage(it.id, e.target.value as Stage);
                                e.target.value = "";
                              }}
                              title="挪到其他阶段"
                            >
                              <option value="">挪到…</option>
                              {STAGES.filter((s) => s.key !== props.stage).map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => openEdit(it)}
                              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCompany(it.id, it.company)}
                              className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>
          <Pagination page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </>
      )}

      {showCreate ? (
        <CompanyFormModal
          category={props.category}
          stage={props.stage}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            changed();
          }}
        />
      ) : null}
      {editing ? (
        <CompanyFormModal
          category={props.category}
          stage={props.stage}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      ) : null}
      {detailId != null ? (
        <CompanyDetailModal
          companyId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => {
            setDetailId(null);
            changed();
          }}
        />
      ) : null}
    </section>
  );
}

// ================= 公司详情（联系人 + 跟进记录） =================
export function CompanyDetailModal(props: { companyId: number; onClose: () => void; onChanged: () => void}) {
const [company, setCompany] = useState<CompanyDetailData | null>(null);
const [contacts, setContacts] = useState<ContactItem[]>([]);
const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
const [records, setRecords] = useState<RecordItem[]>([]);
const [recordsLoading, setRecordsLoading] = useState(false);
const [loading, setLoading] = useState(true);
const [showContactForm, setShowContactForm] = useState(false);
const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
const [showRecordForm, setShowRecordForm] = useState(false);
const [showCompanyEdit, setShowCompanyEdit] = useState(false);

const loadCompany = useCallback(async () => {
setLoading(true);
try {
const r = await apiJson<{ ok: boolean; company: CompanyDetailData; contacts: ContactItem[]}>(
`/api/crm/followup-boards/${props.companyId}`
);
setCompany(r.company);
const cs = r.contacts?? [];
setContacts(cs);
setSelectedContactId((prev) => {
if (prev!= null && cs.some((c) => c.id === prev)) return prev;
const primary = cs.find((c) => isTruthy(c.isPrimary));
return (primary?? cs[0])?.id?? null;
});
} catch {
setCompany(null);
setContacts([]);
} finally {
setLoading(false);
}
}, [props.companyId]);

const loadRecords = useCallback(
async (cid: number) => {
setRecordsLoading(true);
try {
const r = await apiJson<{ ok: boolean; items: RecordItem[]}>(
`/api/crm/followup-boards/${props.companyId}/contacts/${cid}/records`
);
setRecords(r.items?? []);
} catch {
setRecords([]);
} finally {
setRecordsLoading(false);
}
},
[props.companyId]
);

useEffect(() => {
loadCompany();
}, [loadCompany]);

useEffect(() => {
if (selectedContactId!= null) loadRecords(selectedContactId);
else setRecords([]);
}, [selectedContactId, loadRecords]);

const selectedContact = useMemo(
() => contacts.find((c) => c.id === selectedContactId)?? null,
[contacts, selectedContactId]
);

async function moveCompany(to: Stage) {
if (!company || to === company.stage) return;
try {
await apiJson<{ ok: boolean}>(`/api/crm/followup-boards/${company.id}/move-stage`, {
method: "POST",
body: JSON.stringify({ stage: to})
});
props.onChanged();
} catch (e) {
alert(`挪动失败：${String((e as Error)?.message?? e)}`);
}
}

async function setContactStatus(c: ContactItem, to: "active" | "rejected" | "won") {
const tips: Record<string, string> = {
rejected: `把「${c.name}」标记为不再跟进吗？日常跟进不再打扰他，但他的邮箱仍可用于邮件营销。`,
won: `把「${c.name}」标记为已成交客户吗？`,
active: `把「${c.name}」恢复为正常跟进吗？`,
};
if (!window.confirm(tips[to])) return;
try {
await apiJson<{ ok: boolean}>(`/api/crm/followup-boards/${props.companyId}/contacts/${c.id}`, {
method: "PUT",
body: JSON.stringify({ status: to})
});
loadCompany();
} catch (e) {
alert(`操作失败：${String((e as Error)?.message?? e)}`);
}
}

async function removeContact(c: ContactItem) {
if (!window.confirm(`删除联系人「${c.name}」吗？他的跟进记录会一起删除。`)) return;
try {
await apiJson<{ ok: boolean}>(`/api/crm/followup-boards/${props.companyId}/contacts/${c.id}`, {
method: "DELETE"
});
loadCompany();
} catch (e) {
alert(`删除失败：${String((e as Error)?.message?? e)}`);
}
}

async function removeRecord(rid: number) {
if (selectedContactId == null) return;
if (!window.confirm("删除这条跟进记录吗？")) return;
try {
await apiJson<{ ok: boolean}>(
`/api/crm/followup-boards/${props.companyId}/contacts/${selectedContactId}/records/${rid}`,
{ method: "DELETE"}
);
loadRecords(selectedContactId);
props.onChanged();
} catch (e) {
alert(`删除失败：${String((e as Error)?.message?? e)}`);
}
}

if (loading) {
return (
<Modal title="公司详情" onClose={props.onClose} wide>
<p className="py-8 text-center text-slate-400">加载中…</p>
</Modal>
);
}
if (!company) {
return (
<Modal title="公司详情" onClose={props.onClose} wide>
<p className="py-8 text-center text-slate-400">公司不存在或已被删除</p>
</Modal>
);
}

const tone = reminderTone(company.nextFollowupAt);

return (
<Modal title={(company.tag ? "(" + company.tag + ") " : "") + company.company} onClose={props.onClose} wide>
<div className="space-y-6">
{/* 公司信息 */}
<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
<div className="mb-3 flex flex-wrap items-center gap-2">
<span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">{stageLabel(company.stage)}</span>
{company.tag? <span className="text-xs text-slate-500">{company.tag}</span>: null}
<div className="ml-auto flex items-center gap-2">
<select
className="rounded border border-slate-300 px-2 py-1 text-xs"
defaultValue=""
onChange={(e) => {
if (e.target.value) moveCompany(e.target.value as Stage);
e.target.value = "";
}}
>
<option value="">挪到…</option>
{STAGES.filter((s) => s.key!== company.stage).map((s) => (
<option key={s.key} value={s.key}>
{s.label}
</option>
))}
</select>
<button
type="button"
onClick={() => setShowCompanyEdit(true)}
className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
>
编辑公司
</button>
</div>
</div>
<dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
<div>
<dt className="text-xs text-slate-400">企业名称</dt>
<dd className="font-medium text-slate-800">{company.company}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">官网</dt>
<dd className="truncate text-slate-700" title={company.website || ""}>
{company.website? (
<a href={company.website.startsWith("http")? company.website: `https://${company.website}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
{company.website}
</a>
): (
"—"
)}
</dd>
</div>
<div>
<dt className="text-xs text-slate-400">跟进人</dt>
<dd className="text-slate-700">{company.owner || "—"}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">行业</dt>
<dd className="text-slate-700">{(company as unknown as { industry?: string }).industry || "—"}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">国家</dt>
<dd className="text-slate-700">{(company as unknown as { country?: string }).country || "—"}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">州/省</dt>
<dd className="text-slate-700">{(company as unknown as { state?: string }).state || "—"}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">城市</dt>
<dd className="text-slate-700">{(company as unknown as { city?: string }).city || "—"}</dd>
</div>
<div className="col-span-2 md:col-span-3">
<dt className="text-xs text-slate-400">企业地址</dt>
<dd className="whitespace-pre-wrap text-slate-700">{(company as unknown as { address?: string }).address || "—"}</dd>
</div>
<div>
<dt className="text-xs text-slate-400">下次提醒</dt>
<dd className={tone === "overdue"? "font-semibold text-rose-600": tone === "soon"? "font-semibold text-amber-600": "text-slate-700"}>
{tone === "none"? "—": datePart(company.nextFollowupAt)}
</dd>
</div>
<div className="col-span-2 md:col-span-3">
<dt className="text-xs text-slate-400">企业介绍</dt>
<dd className="whitespace-pre-wrap text-slate-700">{company.companyIntro || "—"}</dd>
</div>
</dl>
</div>

{/* 联系人 */}
<div>
<div className="mb-2 flex items-center gap-2">
<h4 className="text-sm font-bold text-slate-800">联系人（{contacts.length}）</h4>
<button
type="button"
onClick={() => {
setEditingContact(null);
setShowContactForm(true);
}}
className="ml-auto rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
>
+ 添加联系人
</button>
</div>
{contacts.length === 0? (
<p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
还没有联系人，点击右上角添加
</p>
): (
<div className="space-y-2">
{contacts.map((c) => {
const rejected = c.status === "rejected";
const isWon = c.status === "won";
const active = c.id === selectedContactId;
return (
<div
key={c.id}
onClick={() => setSelectedContactId(c.id)}
className={`cursor-pointer rounded-lg border p-3 transition-colors ${
active? "border-sky-400 bg-sky-50/60": "border-slate-200 bg-white hover:border-slate-300"
} ${rejected? "opacity-60": ""}`}
>
<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
<span className="font-semibold text-slate-800">{c.name}</span>
{rejected && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">不再跟进</span>}
{isWon && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">已成交</span>}
{isTruthy(c.isPrimary)? (
<span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-700">主联系人</span>
): null}
{rejected? (
<span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
已拒绝 · 日常不打扰，邮件营销仍可发
</span>
): null}
<span className="text-slate-500">{c.position || "—"}</span>
<span className="text-slate-600">{c.email || ""}</span>
<span className="text-slate-600">{c.phone || ""}</span>
<span className="text-xs text-slate-400">
跟进 {c.recordCount} 次{c.lastFollowupDate? ` · 最后 ${datePart(c.lastFollowupDate)}`: ""}
</span>
<span className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
<button
type="button"
onClick={() => {
setEditingContact(c);
setShowContactForm(true);
}}
className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
>
编辑
</button>
{c.status !== "rejected" && (
<button
type="button"
onClick={() => setContactStatus(c, "rejected")}
className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-slate-100"
>
不再跟进
</button>
)}
{c.status !== "won" && (
<button
type="button"
onClick={() => setContactStatus(c, "won")}
className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-slate-100"
>
标记成交
</button>
)}
{c.status !== "active" && (
<button
type="button"
onClick={() => setContactStatus(c, "active")}
className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
>
恢复跟进
</button>
)}
<button
type="button"
onClick={() => removeContact(c)}
className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
>
删除
</button>
</span>
</div>
</div>
);
})}
</div>
)}
</div>

{/* 跟进记录 */}
<div>
<div className="mb-2 flex items-center gap-2">
<h4 className="text-sm font-bold text-slate-800">
跟进记录{selectedContact? `（${selectedContact.name}）`: ""}
</h4>
{selectedContact? (
<button
type="button"
onClick={() => setShowRecordForm(true)}
className="ml-auto rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
>
+ 新增跟进
</button>
): null}
</div>
{!selectedContact? (
<p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
先选择一位联系人查看跟进记录
</p>
): recordsLoading? (
<p className="py-6 text-center text-sm text-slate-400">加载中…</p>
): records.length === 0? (
<p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
还没有跟进记录，点击右上角新增
</p>
): (
<div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
{records.map((r) => {
const replied = isTruthy(r.hasReply);
return (
<div key={r.id} className={`rounded-lg border p-3 ${replied? "border-emerald-300 bg-emerald-50/50": "border-slate-200"}`}>
<div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
<span className="font-semibold text-slate-700">{datePart(r.followupDate)}</span>
<span className="rounded bg-slate-700 px-1.5 py-0.5 font-medium text-white">{r.actionType || "跟进"}</span>
{r.owner? <span className="text-slate-500">跟进人：{r.owner}</span>: null}
{replied? (
<span className="rounded bg-emerald-600 px-1.5 py-0.5 font-semibold text-white">有回复 / 有意向</span>
): null}
<button
type="button"
onClick={() => removeRecord(r.id)}
className="ml-auto rounded px-2 py-0.5 text-rose-600 hover:bg-rose-50"
>
删除
</button>
</div>
<p className="whitespace-pre-wrap text-sm text-slate-700">{r.content}</p>
</div>
);
})}
</div>
)}
</div>
</div>

{showContactForm? (
<ContactFormModal
companyId={props.companyId}
initial={editingContact}
onClose={() => {
setShowContactForm(false);
setEditingContact(null);
}}
onSaved={() => {
setShowContactForm(false);
setEditingContact(null);
loadCompany();
props.onChanged();
}}
/>
): null}
{showRecordForm && selectedContact? (
<RecordFormModal
companyId={props.companyId}
contactId={selectedContact.id}
contactName={selectedContact.name}
companyStage={company.stage}
onClose={() => setShowRecordForm(false)}
onSaved={(moved) => {
setShowRecordForm(false);
if (moved) {
props.onChanged();
} else {
loadRecords(selectedContact.id);
props.onChanged();
}
}}
/>
): null}
{showCompanyEdit? (
<CompanyFormModal
category={company.category}
stage={company.stage}
initial={company}
onClose={() => setShowCompanyEdit(false)}
onSaved={() => {
setShowCompanyEdit(false);
loadCompany();
props.onChanged();
}}
/>
): null}
</Modal>
);
}
