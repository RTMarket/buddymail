import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { PageShell } from "../components/PageShell";
import { apiJson } from "../../lib/api";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { TIKTOK_LS_ACCOUNTS, readTikTokJson } from "../../lib/tiktokPublisherStorage";

// 日报页打开时也同步一次本地 TikTok 账号（只同步已接通的公开资料，不含 token；本地无账号时不下发空同步）
async function syncTikTokAccountsOnce(): Promise<void> {
  try {
    const list = readTikTokJson<Array<{
      slot?: number; name?: string; username?: string; avatarUrl?: string;
      openId?: string; accessToken?: string;
      followerCount?: number | null; videoCount?: number | null;
    }>>(TIKTOK_LS_ACCOUNTS, []);
    const ready = (Array.isArray(list) ? list : []).filter(
      (a) => a && a.accessToken && a.accessToken.length >= 20 && a.openId
    );
    if (!ready.length) return;
    await apiJson("/api/standalone/tiktok/accounts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: ready.map((a) => ({
          slot: Number(a.slot) || 0,
          username: a.username || "",
          name: a.name || "",
          avatarUrl: a.avatarUrl || "",
          openId: a.openId || "",
          followerCount: a.followerCount ?? null,
          videoCount: a.videoCount ?? null
        }))
      })
    });
  } catch {
    /* 忽略，不影响日报加载 */
  }
}

type MailboxStat = {
  account: string;
  inboxTotal: number;
  sentTotal: number;
  inboxToday: number;
  sentToday: number;
  stale: boolean;
  error: string;
};

type SocialStat = {
  kind: "library" | "channel";
  id: string;
  label: string;
  account: string;
  totalPosts: number;
  todayPosts: number;
  posts: number | null;
  followers: number | null;
  following: number | null;
  subscribers: number | null;
  notes: number | null;
  reactions: number | null;
  comments: number | null;
  views: number | null;
  videos: number | null;
};

type SearchDaily = {
  searchesToday: number;
  importedToday: number;
  importedTotal: number;
};

type Sections = {
  date: string;
  mailboxes: MailboxStat[];
  social: SocialStat[];
  leadSearch: SearchDaily;
  industrySearch: SearchDaily;
} | null;

type SendStats = {
  delivered: number;
  failed: number;
  opened: number;
  subscribe: number;
  unsubscribe: number;
  complaint: number;
};

type Payload = {
  ok: boolean;
  sendStats?: SendStats | null;
  sections: Sections;
};

type PetSyncState = {
  ok: boolean;
  configured: boolean;
  maskedKey: string;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMessage: string;
  message?: string;
};

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function socialPublicText(s: SocialStat, zh: boolean): string {
  const parts: string[] = [];
  if (s.posts !== null && s.posts !== undefined) parts.push(zh ? `帖子 ${s.posts}` : `${s.posts} posts`);
  if (s.notes !== null && s.notes !== undefined) parts.push(zh ? `帖子 ${s.notes}` : `${s.notes} notes`);
  if (s.followers !== null && s.followers !== undefined) parts.push(zh ? `粉丝 ${s.followers}` : `${s.followers} followers`);
  if (s.following !== null && s.following !== undefined) parts.push(zh ? `关注 ${s.following}` : `following ${s.following}`);
  if (s.subscribers !== null && s.subscribers !== undefined) parts.push(zh ? `订阅 ${s.subscribers}` : `${s.subscribers} subscribers`);
  if (s.reactions !== null && s.reactions !== undefined) parts.push(zh ? `反应 ${s.reactions}` : `${s.reactions} reactions`);
  if (s.comments !== null && s.comments !== undefined) parts.push(zh ? `评论 ${s.comments}` : `${s.comments} comments`);
  if (s.views !== null && s.views !== undefined) parts.push(zh ? `浏览 ${s.views}` : `${s.views} views`);
  if (s.videos !== null && s.videos !== undefined) parts.push(zh ? `作品 ${s.videos}` : `${s.videos} videos`);
  return parts.length ? parts.join(" · ") : "—";
}

export function B2bDailyReportPage() {
  const { locale } = useSiteLocale();
  const zh = locale !== "en";
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(false);

  const [petKey, setPetKey] = useState("");
  const [petSync, setPetSync] = useState<PetSyncState | null>(null);
  const [petBusy, setPetBusy] = useState<"save" | "push" | null>(null);
  const [petMsg, setPetMsg] = useState("");

  const [review, setReview] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewErr, setReviewErr] = useState("");

  const load = useCallback(async () => {
    if (loadRef.current) return; // 上一次还没回来，跳过这次轮询，避免请求堆积
    loadRef.current = true;
    try {
      const r = await apiJson<Payload>("/api/standalone/b2b/daily-report");
      setData(r);
      setErr("");
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      loadRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadPetSync = useCallback(async () => {
    try {
      const r = await apiJson<PetSyncState>("/api/standalone/b2b/pet-sync");
      setPetSync(r);
    } catch {
      /* 未配置时忽略 */
    }
  }, []);

  useEffect(() => {
    void syncTikTokAccountsOnce(); // 后台同步，不阻塞日报加载
    void load();
    void loadPetSync();
    const t = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(t);
  }, [load, loadPetSync]);

  function exportMailboxExcel() {
    const rows = (data?.sections?.mailboxes || []).map((m) => ({
      [zh ? "企业邮箱" : "Mailbox"]: m.account,
      [zh ? "总收信" : "Total received"]: m.inboxTotal,
      [zh ? "总发信" : "Total sent"]: m.sentTotal,
      [zh ? "今日收信" : "Received today"]: m.inboxToday,
      [zh ? "今日发信" : "Sent today"]: m.sentToday
    }));
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, zh ? "企业邮箱" : "Mailboxes");
    const date = data?.sections?.date || "";
    XLSX.writeFile(wb, `mailbox-daily-${date}.xlsx`);
  }

  function exportSocialExcel() {
    const rows = (data?.sections?.social || []).map((s) => ({
      [zh ? "类型" : "Type"]: s.kind === "library" ? (zh ? "社媒库" : "Library") : (zh ? "频道" : "Channel"),
      [zh ? "平台" : "Platform"]: s.label,
      [zh ? "账号" : "Account"]: s.account || "",
      [zh ? "独立站发布总数" : "Total posts"]: s.totalPosts,
      [zh ? "今日发布" : "Today"]: s.todayPosts,
      [zh ? "公开帖子数" : "Public posts"]: s.posts ?? s.notes ?? "",
      [zh ? "粉丝数" : "Followers"]: s.followers ?? "",
      [zh ? "关注数" : "Following"]: s.following ?? "",
      [zh ? "订阅数" : "Subscribers"]: s.subscribers ?? "",
      [zh ? "反应数" : "Reactions"]: s.reactions ?? "",
      [zh ? "评论数" : "Comments"]: s.comments ?? "",
      [zh ? "浏览量" : "Views"]: s.views ?? ""
    }));
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, zh ? "社媒发布" : "Social");
    const date = data?.sections?.date || "";
    XLSX.writeFile(wb, `social-daily-${date}.xlsx`);
  }

  async function savePetKey() {
    if (!petKey.trim()) {
      setPetMsg(zh ? "请先填写 AI 桌宠 API Key" : "Enter the pet API key first");
      return;
    }
    setPetBusy("save");
    setPetMsg("");
    try {
      const r = await apiJson<PetSyncState>("/api/standalone/b2b/pet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: petKey.trim() })
      });
      setPetSync(r);
      setPetKey("");
      setPetMsg(r.message || (zh ? "已保存" : "Saved"));
    } catch (e) {
      setPetMsg(String((e as Error).message || e));
    } finally {
      setPetBusy(null);
    }
  }

  async function pushToPet() {
    setPetBusy("push");
    setPetMsg("");
    try {
      const r = await apiJson<PetSyncState & { sync?: PetSyncState }>("/api/standalone/b2b/pet-sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: review.trim() || undefined })
      });
      if (r.sync) setPetSync(r.sync);
      setPetMsg(r.message || (zh ? "已推送" : "Pushed"));
    } catch (e) {
      setPetMsg(String((e as Error).message || e));
    } finally {
      setPetBusy(null);
    }
  }

  async function genReview() {
    setReviewBusy(true);
    setReviewErr("");
    try {
      const r = await apiJson<{ ok: boolean; review: string }>("/api/standalone/b2b/daily-report/review", {
        method: "POST"
      });
      setReview(r.review);
    } catch (e) {
      setReviewErr(String((e as Error).message || e));
    } finally {
      setReviewBusy(false);
    }
  }

  const sections = data?.sections;
  const dateLabel = sections?.date || "";

  return (
    <PageShell
      title={zh ? `每日日报总结${dateLabel ? ` · ${dateLabel}` : ""}` : "Daily report"}
      description={
        zh
          ? "各板块分开统计：企业邮箱、社媒发布、企业leads精搜、行业企业搜索、邮件营销。点「生成复盘总结」可出一份复盘，并同步到 AI 桌宠的日历日报。"
          : "Sections: mailboxes, social, lead search, industry search, campaigns."
      }
    >
      {loading ? <p className="text-xs text-slate-500">{zh ? "正在读取今日日报…" : "Loading…"}</p> : null}
      {err ? <p className="mb-3 text-xs text-rose-700">{err}</p> : null}

      {/* 一、企业邮箱 */}
      <SectionCard tone="amber" title={zh ? "一、企业邮箱收发统计" : "1. Mailboxes"} action={
        <button onClick={exportMailboxExcel} className="rounded border border-slate-300 px-2 py-1 text-xs">
          {zh ? "导出 Excel" : "Export Excel"}
        </button>
      }>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 pr-2 font-medium">{zh ? "企业邮箱" : "Mailbox"}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{zh ? "总收信" : "Received"}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{zh ? "总发信" : "Sent"}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{zh ? "今日收信" : "Today in"}</th>
              <th className="py-1.5 text-right font-medium">{zh ? "今日发信" : "Today out"}</th>
            </tr>
          </thead>
          <tbody>
            {(sections?.mailboxes || []).map((m) => (
              <tr key={m.account} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 text-slate-800">
                  {m.account}
                  {m.stale ? <span className="ml-1 text-amber-600">({zh ? "缓存" : "cached"})</span> : null}
                  {m.error && !m.stale ? <span className="ml-1 text-rose-600">{m.error}</span> : null}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{m.inboxTotal}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{m.sentTotal}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{m.inboxToday}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{m.sentToday}</td>
              </tr>
            ))}
            {!(sections?.mailboxes || []).length && !loading ? (
              <tr><td colSpan={5} className="py-2 text-slate-400">{zh ? "暂无数据" : "No data"}</td></tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>

      {/* 二、社媒发布 */}
      <SectionCard tone="sky" title={zh ? "二、社媒发布统计" : "2. Social publishing"} action={
        <button onClick={exportSocialExcel} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          {zh ? "导出 Excel" : "Export Excel"}
        </button>
      }>
        <div className="max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sky-50">
            <tr className="border-b border-sky-200 text-left text-slate-500">
              <th className="py-1.5 pr-2 font-medium">{zh ? "类型" : "Type"}</th>
              <th className="py-1.5 pr-2 font-medium">{zh ? "平台 / 账号" : "Platform / Account"}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{zh ? "独立站发布总数" : "Total"}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{zh ? "今日发布" : "Today"}</th>
              <th className="py-1.5 font-medium">{zh ? "公开数据" : "Public stats"}</th>
            </tr>
          </thead>
          <tbody>
            {(sections?.social || []).map((s) => (
              <tr key={`${s.kind}:${s.id}`} className="border-b border-sky-100">
                <td className="py-1.5 pr-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.kind === "library" ? "bg-sky-200 text-sky-800" : "bg-teal-200 text-teal-800"}`}>
                    {s.kind === "library" ? (zh ? "社媒库" : "Library") : (zh ? "频道" : "Channel")}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-slate-800">
                  {s.label}
                  {s.account ? <span className="ml-1 text-slate-500">{s.account}</span> : null}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s.totalPosts}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{s.todayPosts}</td>
                <td className="py-1.5 text-slate-600">{socialPublicText(s, zh)}</td>
              </tr>
            ))}
            {!(sections?.social || []).length && !loading ? (
              <tr><td colSpan={5} className="py-2 text-slate-400">{zh ? "暂无已接通的平台/频道" : "No connected platforms"}</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {zh ? "账号与公开数据与社媒库页面、频道区实时同步；发布数为独立站全部历史发布记录。" : "Synced with the social library and channel board; posts cover all standalone publish history."}
        </p>
      </SectionCard>

      {/* 三、企业leads精搜 */}
      <SectionCard tone="emerald" title={zh ? "三、企业leads精搜" : "3. Lead search"}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label={zh ? "今日搜索企业" : "Searched today"} value={String(sections?.leadSearch.searchesToday ?? "—")} />
          <Stat label={zh ? "今日导入 CRM" : "Imported today"} value={String(sections?.leadSearch.importedToday ?? "—")} />
          <Stat label={zh ? "累计导入 CRM" : "Total imported"} value={String(sections?.leadSearch.importedTotal ?? "—")} />
        </div>
      </SectionCard>

      {/* 四、行业企业搜索 */}
      <SectionCard tone="violet" title={zh ? "四、行业企业搜索" : "4. Industry search"}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label={zh ? "今日搜索公司" : "Searched today"} value={String(sections?.industrySearch.searchesToday ?? "—")} />
          <Stat label={zh ? "今日导入数据库" : "Imported today"} value={String(sections?.industrySearch.importedToday ?? "—")} />
          <Stat label={zh ? "累计导入数据库" : "Total imported"} value={String(sections?.industrySearch.importedTotal ?? "—")} />
        </div>
      </SectionCard>

      {/* 五、邮件营销 */}
      {data?.sendStats ? (
        <SectionCard tone="rose" title={zh ? "五、邮件营销统计（今日）" : "5. Campaigns (today)"}>
          <div className="grid gap-2 sm:grid-cols-6">
            <Stat label={zh ? "发送成功" : "Delivered"} value={String(data.sendStats.delivered)} />
            <Stat label={zh ? "发送失败" : "Failed"} value={String(data.sendStats.failed)} />
            <Stat label={zh ? "打开/已读" : "Opened"} value={String(data.sendStats.opened)} />
            <Stat label={zh ? "订阅" : "Subscribed"} value={String(data.sendStats.subscribe)} />
            <Stat label={zh ? "退订" : "Unsubscribed"} value={String(data.sendStats.unsubscribe)} />
            <Stat label={zh ? "投诉" : "Complaints"} value={String(data.sendStats.complaint)} />
          </div>
        </SectionCard>
      ) : null}

      {/* 六、复盘总结 */}
      <SectionCard tone="indigo" title={zh ? "六、复盘总结" : "6. Review"}>
        {!review ? (
          <div className="flex items-center gap-2">
            <button
              onClick={genReview}
              disabled={reviewBusy}
              className="rounded bg-slate-900 px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              {reviewBusy ? (zh ? "生成中…" : "Generating…") : zh ? "生成复盘总结" : "Generate review"}
            </button>
            <span className="text-xs text-slate-400">
              {zh ? "汇总今日各板块数据出一份复盘，可同步到 AI 桌宠的日历日报。" : "Summarize today and sync to the pet."}
            </span>
          </div>
        ) : (
          <div>
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-800">{review}</div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={genReview} disabled={reviewBusy} className="rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50">
                {reviewBusy ? (zh ? "重新生成中…" : "Regenerating…") : zh ? "重新生成" : "Regenerate"}
              </button>
              <button
                onClick={pushToPet}
                disabled={petBusy !== null || !petSync?.configured}
                className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                title={!petSync?.configured ? (zh ? "请先在下方配置桌宠 API Key" : "Configure the pet API key below first") : ""}
              >
                {petBusy === "push" ? (zh ? "同步中…" : "Syncing…") : zh ? "同步复盘到 AI 桌宠" : "Sync to pet"}
              </button>
            </div>
          </div>
        )}
        {reviewErr ? <p className="mt-2 text-xs text-rose-700">{reviewErr}</p> : null}
      </SectionCard>

      {/* 桌宠同步设置 */}
      <SectionCard title={zh ? "同步到 AI 桌宠" : "Sync to AI pet"}>
        <p className="mb-3 text-xs text-slate-500">
          {zh
            ? "填写桌宠 pet-api 的 API Key 并保存，独立站会给桌宠安装日报同步 skill；复盘生成后点「同步复盘到 AI 桌宠」，桌宠的日历日报里就能看到。"
            : "Save the pet-api key to install the report sync skill on the pet."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={petKey}
            onChange={(e) => setPetKey(e.target.value)}
            placeholder={petSync?.configured ? `${zh ? "已配置" : "Configured"} (${petSync.maskedKey})，${zh ? "重新输入可覆盖" : "re-enter to replace"}` : zh ? "粘贴 AI 桌宠 API Key" : "Paste pet API key"}
            className="w-64 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
          <button
            onClick={savePetKey}
            disabled={petBusy !== null}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {petBusy === "save" ? (zh ? "保存中…" : "Saving…") : zh ? "保存" : "Save"}
          </button>
        </div>
        {petSync?.lastSyncAt ? (
          <p className="mt-2 text-xs text-slate-500">
            {zh ? "上次同步：" : "Last sync: "}
            {petSync.lastSyncAt.slice(0, 19).replace("T", " ")} ·{" "}
            {petSync.lastSyncOk ? (zh ? "成功" : "ok") : (zh ? "失败" : "failed")}
            {petSync.lastSyncMessage ? ` · ${petSync.lastSyncMessage}` : ""}
          </p>
        ) : null}
        {petMsg ? <p className="mt-2 text-xs text-slate-700">{petMsg}</p> : null}
      </SectionCard>
    </PageShell>
  );
}

const SECTION_TONES: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50",
  sky: "border-sky-200 bg-sky-50",
  emerald: "border-emerald-200 bg-emerald-50",
  violet: "border-violet-200 bg-violet-50",
  rose: "border-rose-200 bg-rose-50",
  indigo: "border-indigo-200 bg-indigo-50",
  slate: "border-slate-200 bg-white"
};

function SectionCard({ title, action, children, tone }: { title: string; action?: React.ReactNode; children: React.ReactNode; tone?: keyof typeof SECTION_TONES }) {
  return (
    <div className={`mb-4 rounded-xl border p-4 ${SECTION_TONES[tone || "slate"]}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-800">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
