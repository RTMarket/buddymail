// 企业leads精搜 / 行业企业搜索 两页共用的类型、常量与展示组件。
import type { LeadFinderColumnId } from "../../lib/leadFinderColumns";

export function columnsToSearchFields(columns: LeadFinderColumnId[], hasRoles: boolean): Fields {
  return {
    companyName: true,
    website: columns.includes("website") || columns.includes("linkedin") || columns.includes("source"),
    address: columns.includes("location") || columns.includes("country"),
    mainBusiness:
      columns.includes("description") || columns.includes("industry") || columns.includes("tags"),
    phone: false,
    // 找人找邮箱由目标职位勾选驱动（"邮箱联系人"字段已移除）
    email: hasRoles,
    titles: hasRoles
  };
}

export type Fields = {
  companyName: boolean;
  website: boolean;
  address: boolean;
  mainBusiness: boolean;
  phone: boolean;
  email: boolean;
  titles: boolean;
};

export type CompanyHit = {
  name: string;
  website: string;
  domain: string;
  deepCount?: number;
  country?: string;
  province?: string;
  city?: string;
};
export type ContactHit = {
  company?: string;
  website?: string;
  domain?: string;
  contact?: string;
  title?: string;
  email?: string;
  email_status?: string;
  phone?: string;
  address?: string;
  country?: string;
  mainBusiness?: string;
};
export type Profile = { intro?: string; employees?: string; founded?: string; funding?: string };
export type Grade = { grade: "A" | "B" | "C" | "D"; reason?: string };

/** 每分级栏的统计（后端提供；缺失时前端按 0 显示） */
export type GradeStat = {
  companies: number;
  contacts: number;
  emails: number;
  validEmails: number;
  newCompanies: number;
  newContacts: number;
  newValidEmails: number;
};

export type Job = {
  id: number;
  status: string;
  quota: number;
  processed: number;
  current_note: string | null;
  error_message?: string | null;
  stage?: string;
  mode?: string;
  companies?: CompanyHit[];
  companyCount?: number;
  researchRows?: ContactHit[];
  resultRows?: ContactHit[];
  profiles?: Record<string, Profile>;
  grades?: Record<string, Grade>;
  queuedDomains?: string[];
  discoverFound?: number;
  discoverChecked?: number;
  undugCount?: number;
  /** 目标企业数（后端回显；缺失时用前端选择值） */
  targetCount?: number;
  /** 后端判定任务可能卡住（超过 5 分钟无进展） */
  stuck?: boolean;
  /** 每分级栏统计，后端未 ready 时缺失 */
  stats?: Record<string, GradeStat>;
};

export type EventRow = { status: string; note: string; created_at: string };

export type CompanyCard = {
  domain: string;
  name: string;
  website: string;
  profile: Profile;
  grade?: Grade;
  rows: ContactHit[];
};

export const KEYWORD_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#c026d3",
  "#ca8a04",
  "#e11d48",
  "#475569"
];

export const GRADE_STYLE: Record<Grade["grade"], { title: string; bg: string; border: string; head: string }> = {
  A: { title: "A 类 · 最精准客群", bg: "#ecfdf5", border: "#10b981", head: "#047857" },
  B: { title: "B 类 · 较精准", bg: "#eff6ff", border: "#3b82f6", head: "#1d4ed8" },
  C: { title: "C 类 · 一般相关", bg: "#fffbeb", border: "#f59e0b", head: "#b45309" },
  D: { title: "D 类 · 关联较弱", bg: "#f8fafc", border: "#94a3b8", head: "#475569" }
};

export const STATUS_TEXT: Record<string, { text: string; color: string }> = {
  valid: { text: "有效", color: "#047857" },
  risky: { text: "可能有效", color: "#b45309" },
  invalid: { text: "无效", color: "#b91c1c" },
  no_email: { text: "未找到", color: "#64748b" },
  unverified: { text: "未验证", color: "#64748b" }
};

export function countryNameEn(iso2: string): string {
  if (!iso2) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(iso2) || iso2;
  } catch {
    return iso2;
  }
}

export function hostOf(r: ContactHit): string {
  if (r.domain) return r.domain.replace(/^www\./i, "").toLowerCase();
  try {
    const raw = String(r.website || "");
    return new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function tidyTitle(title: string | undefined, brands: string[]): string {
  let t = String(title || "")
    .replace(/&amp;/gi, "&")
    .trim();
  for (const b of brands.filter((x) => x.length >= 3)) {
    const tail = new RegExp(`\\s+of\\s+${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    const head = t.replace(tail, "");
    if (head !== t && head.toLowerCase().includes(b.toLowerCase())) t = head;
  }
  return t;
}

export function buildCards(job: Job | null, domains: string[], rows: ContactHit[]): CompanyCard[] {
  if (!job) return [];
  const byHost = new Map<string, ContactHit[]>();
  for (const r of rows) {
    const h = hostOf(r);
    if (!h) continue;
    const list = byHost.get(h) || [];
    list.push(r);
    byHost.set(h, list);
  }
  return domains.map((d) => {
    const host = d.replace(/^www\./i, "").toLowerCase();
    const co = (job.companies || []).find((c) => c.domain.toLowerCase() === host);
    const name = byHost.get(host)?.[0]?.company || co?.name || host;
    const brands = [name, co?.name || "", host.split(".")[0] || ""];
    const list = (byHost.get(host) || []).map((r) => (r.title ? { ...r, title: tidyTitle(r.title, brands) } : r));
    return {
      domain: d,
      name,
      website: co?.website || list[0]?.website || `https://${host}`,
      profile: job.profiles?.[d] || job.profiles?.[host] || {},
      grade: job.grades?.[d] || job.grades?.[host],
      rows: list
    };
  });
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCardsCsv(cards: CompanyCard[], filename: string, columns?: LeadFinderColumnId[]) {
  const show = (id: LeadFinderColumnId) => !columns || columns.includes(id);
  const showFunding = show("funding_series") || show("funding_amount") || show("last_funding_date");
  // 固定列：分类/企业名称/联系人类（联系人由职位勾选驱动，始终展示）
  const head = ["分类", "分类理由", "企业名称"];
  if (show("website")) head.push("官网");
  if (show("description")) head.push("企业介绍");
  if (show("size")) head.push("人数");
  if (show("year_founded")) head.push("成立时间");
  if (showFunding) head.push("融资");
  head.push("电话");
  if (show("location")) head.push("地址");
  if (show("country")) head.push("国家");
  head.push("联系人", "职位", "邮箱", "邮箱状态");
  const lines = [head.join(",")];
  for (const c of cards) {
    const base = [c.grade?.grade || "", c.grade?.reason || "", c.name];
    if (show("website")) base.push(c.website);
    if (show("description")) base.push(c.profile.intro || c.rows[0]?.mainBusiness || "");
    if (show("size")) base.push(c.profile.employees || "");
    if (show("year_founded")) base.push(c.profile.founded || "");
    if (showFunding) base.push(c.profile.funding || "");
    const phone = c.rows.find((r) => r.phone)?.phone || "";
    base.push(phone);
    const address = c.rows.find((r) => r.address)?.address || "";
    if (show("location")) base.push(address);
    const country = c.rows.find((r) => r.country)?.country || "";
    if (show("country")) base.push(country);
    const contacts = c.rows.filter((r) => r.contact || r.email);
    if (!contacts.length) {
      lines.push([...base, "", "", "", ""].map(csvCell).join(","));
      continue;
    }
    for (const r of contacts) {
      lines.push(
        [
          ...base,
          r.contact || "",
          r.contact ? r.title || "" : "公共邮箱",
          r.email || "",
          STATUS_TEXT[String(r.email_status || "")]?.text || r.email_status || ""
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }
  const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function StatusTag({ status }: { status?: string }) {
  const s = STATUS_TEXT[String(status || "")];
  if (!s) return null;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs"
      style={{ color: s.color, border: `1px solid ${s.color}`, background: "#fff" }}
    >
      {s.text}
    </span>
  );
}

export function CompanyDetail({ card, columns }: { card: CompanyCard; columns?: LeadFinderColumnId[] }) {
  const show = (id: LeadFinderColumnId) => !columns || columns.includes(id);
  const showFunding = show("funding_series") || show("funding_amount") || show("last_funding_date");
  const people = card.rows.filter((r) => String(r.contact || "").trim());
  const publicMails = card.rows.filter((r) => !String(r.contact || "").trim() && String(r.email || "").includes("@"));
  const phone = card.rows.find((r) => r.phone)?.phone || "";
  const address = card.rows.find((r) => r.address)?.address || "";
  const country = card.rows.find((r) => r.country)?.country || "";
  const facts: Array<[string, string | undefined, boolean]> = [
    ["人数", card.profile.employees, show("size")],
    ["成立时间", card.profile.founded, show("year_founded")],
    ["融资", card.profile.funding, showFunding],
    ["电话", phone, true],
    ["地址", address, show("location")],
    ["国家", country, show("country")]
  ];
  return (
    <div className="rounded border border-white/60 bg-white p-3 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{card.name}</span>
        {show("website") ? (
          <a className="text-blue-700 hover:underline" href={card.website} target="_blank" rel="noreferrer">
            {card.website}
          </a>
        ) : null}
        {card.grade?.reason ? <span className="text-xs text-slate-500">· {card.grade.reason}</span> : null}
      </div>
      {show("description") ? (
        <p className="mt-1 text-slate-700">{card.profile.intro || card.rows[0]?.mainBusiness || "未找到公开介绍"}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
        {facts
          .filter(([, , visible]) => visible)
          .map(([k, v]) => (
            <span key={k}>
              {k}：{v || "未公开"}
            </span>
          ))}
      </div>
      <p className="mt-0.5 text-xs text-slate-400">人数、成立时间、融资来自官网与 AI 检索，仅供参考</p>
      <div className="mt-2">
        <div className="text-xs font-medium text-slate-700">搜到的人（{people.length}）</div>
        {people.length ? (
          <ul className="mt-1 space-y-0.5">
            {people.map((p, i) => (
              <li key={`${p.contact}-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{p.contact}</span>
                <span className="text-slate-600">{p.title || ""}</span>
                <span className="text-slate-800">{p.email || "—"}</span>
                {p.email || p.email_status === "no_email" ? <StatusTag status={p.email_status} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">暂未搜到公开的人名与职位</p>
        )}
      </div>
      <div className="mt-2">
        <div className="text-xs font-medium text-slate-700">公共联系邮箱（{publicMails.length}）</div>
        {publicMails.length ? (
          <ul className="mt-1 flex flex-wrap gap-2">
            {publicMails.map((p, i) => (
              <li key={`${p.email}-${i}`} className="flex items-center gap-1">
                <span className="text-slate-800">{p.email}</span>
                <StatusTag status={p.email_status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">官网没有公开邮箱</p>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ pct, indeterminate }: { pct: number; indeterminate?: boolean }) {
  return (
    <div className="my-2 h-2 overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full bg-emerald-600 ${indeterminate ? "animate-pulse" : ""}`}
        style={{ width: `${indeterminate ? 100 : pct}%`, opacity: indeterminate ? 0.5 : 1 }}
      />
    </div>
  );
}

export function EventLog({ events }: { events: EventRow[] }) {
  const list = events.filter(
    (ev) => !/403|unsupported_country|request_forbidden|Kimi 调研失败|正在用 Kimi 查找/i.test(String(ev.note || ""))
  );
  if (!list.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-slate-500">查看搜索过程（{list.length}）</summary>
      <ul className="mt-1 max-h-40 overflow-auto text-xs text-slate-600">
        {list.map((ev, i) => (
          <li key={`${ev.created_at}-${i}`} className="border-b border-slate-100 py-1">
            <span className={ev.status === "error" ? "text-rose-600" : ev.status === "done" ? "text-emerald-700" : ""}>
              {ev.status === "running" ? "…" : ev.status === "done" ? "✓" : ev.status === "error" ? "!" : "·"}
            </span>{" "}
            {ev.note}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function isLive(job: Job | null): boolean {
  return job?.status === "running" || job?.status === "queued";
}
