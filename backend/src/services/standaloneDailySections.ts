import type { Pool, RowDataPacket} from "mysql2/promise";
import {
DAILY_MAILBOX_ADDRESSES,
fetchFolderCounts,
loadMailboxConn,
resolveFolders,
withImap
} from "../routes/dailyMailbox.js";
import { listSocialLibraryPlatformStatus } from "./standaloneSocialPublishNow.js";
import { listChannelAccounts } from "./standaloneChannelAccounts.js";
import { listTikTokAccounts } from "./standaloneTikTokAccounts.js";
import { decryptSecret } from "../cryptoSecret.js";
import { loadDailyReport, shanghaiToday, todayCampaignStats} from "./standaloneDailyReport.js";

/* ---------------- types ---------------- */

export type MailboxStat = {
account: string;
inboxTotal: number;
sentTotal: number;
inboxToday: number;
sentToday: number;
stale: boolean;
error: string;
};

export type SocialStat = {
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

export type SearchDaily = {
searchesToday: number;
importedToday: number;
importedTotal: number;
};

export type DailySections = {
date: string;
mailboxes: MailboxStat[];
social: SocialStat[];
leadSearch: SearchDaily;
industrySearch: SearchDaily;
};

/* ---------------- helpers ---------------- */

/** 上海日期 -> UTC 区间 [start, end) */
function shanghaiDayRange(date: string): { start: string; end: string} {
const start = new Date(`${date}T00:00:00+08:00`);
const end = new Date(start.getTime() + 24 * 3600 * 1000);
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
return { start: fmt(start), end: fmt(end)};
}

async function ensureMailboxCacheTable(db: Pool): Promise<void> {
await db.query(`
CREATE TABLE IF NOT EXISTS b2b_daily_mailbox_cache (
tenant_id INT NOT NULL,
account VARCHAR(255) NOT NULL,
inbox_total INT NOT NULL DEFAULT 0,
sent_total INT NOT NULL DEFAULT 0,
inbox_today INT NOT NULL DEFAULT 0,
sent_today INT NOT NULL DEFAULT 0,
fetched_at DATETIME NOT NULL,
PRIMARY KEY (tenant_id, account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
}

type CacheRow = {
inbox_total: number;
sent_total: number;
inbox_today: number;
sent_today: number;
fetched_at: Date;
};

async function readMailboxCache(db: Pool, tenantId: number, account: string): Promise<CacheRow | null> {
await ensureMailboxCacheTable(db);
const [rows] = await db.query<RowDataPacket[]>(
`SELECT inbox_total, sent_total, inbox_today, sent_today, fetched_at
FROM b2b_daily_mailbox_cache WHERE tenant_id =? AND account =? LIMIT 1`,
[tenantId, account]
);
const r = rows[0];
if (!r) return null;
return {
inbox_total: Number(r.inbox_total) || 0,
sent_total: Number(r.sent_total) || 0,
inbox_today: Number(r.inbox_today) || 0,
sent_today: Number(r.sent_today) || 0,
fetched_at: new Date(r.fetched_at)
};
}

async function writeMailboxCache(
db: Pool,
tenantId: number,
account: string,
v: Omit<CacheRow, "fetched_at">
): Promise<void> {
await db.query(
`INSERT INTO b2b_daily_mailbox_cache
(tenant_id, account, inbox_total, sent_total, inbox_today, sent_today, fetched_at)
VALUES (?,?,?,?,?,?, NOW())
ON DUPLICATE KEY UPDATE
inbox_total = VALUES(inbox_total), sent_total = VALUES(sent_total),
inbox_today = VALUES(inbox_today), sent_today = VALUES(sent_today),
fetched_at = NOW()`,
[tenantId, account, v.inbox_total, v.sent_total, v.inbox_today, v.sent_today]
);
}

const MAILBOX_CACHE_MS = 5 * 60 * 1000;

async function fetchLiveMailboxCounts(
db: Pool,
tenantId: number,
account: (typeof DAILY_MAILBOX_ADDRESSES)[number],
since: Date
): Promise<Omit<CacheRow, "fetched_at">> {
const conn = await loadMailboxConn(db, tenantId);
return withImap(db, conn, account, async (client) => {
// 与日常邮箱页 /folder-counts 用同一个 fetchFolderCounts，保证数字时刻一致
const folders = await resolveFolders(client);
const counts = await fetchFolderCounts(client, folders);
let inboxToday = 0;
let sentToday = 0;
const lockInbox = await client.getMailboxLock(folders.inbox).catch(() => null);
if (lockInbox) {
try {
const uids = await client.search({ since}, { uid: true}).catch(() => [] as number[]);
inboxToday = uids.length;
} finally {
lockInbox.release();
}
}
const lockSent = await client.getMailboxLock(folders.sent).catch(() => null);
if (lockSent) {
try {
const uids = await client.search({ since}, { uid: true}).catch(() => [] as number[]);
sentToday = uids.length;
} finally {
lockSent.release();
}
}
return {
inbox_total: counts.inbox.total,
sent_total: counts.sent.total,
inbox_today: inboxToday,
sent_today: sentToday
};
});
}

/* ---------------- sections ---------------- */

export async function getMailboxStats(db: Pool, tenantId: number): Promise<MailboxStat[]> {
const today = shanghaiToday();
const since = new Date(`${today}T00:00:00+08:00`);
const out: MailboxStat[] = [];
for (const account of DAILY_MAILBOX_ADDRESSES) {
const cached = await readMailboxCache(db, tenantId, account).catch(() => null);
const fresh = cached && Date.now() - cached.fetched_at.getTime() < MAILBOX_CACHE_MS;
if (fresh && cached) {
out.push({
account,
inboxTotal: cached.inbox_total,
sentTotal: cached.sent_total,
inboxToday: cached.inbox_today,
sentToday: cached.sent_today,
stale: false,
error: ""
});
continue;
}
try {
const live = await fetchLiveMailboxCounts(db, tenantId, account, since);
await writeMailboxCache(db, tenantId, account, live).catch(() => null);
out.push({
account,
inboxTotal: live.inbox_total,
sentTotal: live.sent_total,
inboxToday: live.inbox_today,
sentToday: live.sent_today,
stale: false,
error: ""
});
} catch (e) {
out.push({
account,
inboxTotal: cached?.inbox_total?? 0,
sentTotal: cached?.sent_total?? 0,
inboxToday: cached?.inbox_today?? 0,
sentToday: cached?.sent_today?? 0,
stale: true,
error: cached? "读取失败，显示缓存数据": `读取失败：${(e as Error)?.message || e}`
});
}
}
return out;
}

export async function getSocialStats(db: Pool, tenantId: number): Promise<SocialStat[]> {
const today = shanghaiToday();
// 全部历史发布日志：社媒库发布记在 platforms_json，频道区发布（nostr/telegram/slack）记在 results_json[].platform；
// TikTok 发布记在 results_json[].platform="tiktok"，message 里带账号槽位号（"TikTok 1 …"），可按账号拆分
type LogRow = { ids: string[]; tiktokSlots: number[]; created: string};
let logs: LogRow[] = [];
try {
const [rows] = await db.query<RowDataPacket[]>(
`SELECT platforms_json, results_json, created_at FROM standalone_social_library_logs ORDER BY id DESC LIMIT 10000`
);
logs = (rows as Array<Record<string, unknown>>).map((r) => {
const ids: string[] = [];
const tiktokSlots: number[] = [];
try {
const p = JSON.parse(String(r.platforms_json || "[]"));
if (Array.isArray(p)) for (const x of p) ids.push(String(x));
} catch {
/* ignore */
}
try {
const rs = JSON.parse(String(r.results_json || "[]"));
if (Array.isArray(rs)) for (const x of rs) {
const rec = x as Record<string, unknown>;
const pl = String(rec?.platform ?? "");
if (pl) ids.push(pl);
if (pl === "tiktok") {
const m = String(rec?.message ?? "").match(/TikTok\s+(\d+)(?=[\s：:]|$)/);
if (m) tiktokSlots.push(Number(m[1]));
}
}
} catch {
/* ignore */
}
return { ids, tiktokSlots, created: String(r.created_at || "")};
});
} catch {
logs = [];
}
const shanghaiDay = (iso: string) => {
const d = new Date(iso.endsWith("Z") || iso.includes("+")? iso: `${iso}Z`);
return new Intl.DateTimeFormat("en-CA", {
timeZone: "Asia/Shanghai",
year: "numeric",
month: "2-digit",
day: "2-digit"
}).format(d);
};
const countFor = (id: string, onlyToday: boolean) =>
logs.filter((l) => l.ids.includes(id) && (!onlyToday || shanghaiDay(l.created) === today)).length;

// 与社媒库页面同一数据源：listSocialLibraryPlatformStatus（账号名、粉丝、帖子等公开数据）
const library = await listSocialLibraryPlatformStatus(db).catch(() => []);
// 与频道区同一数据源：listChannelAccounts（已接通的频道 + 订阅/帖子/关注数）
const channels = await listChannelAccounts(db).catch(() => []);

const out: SocialStat[] = [];
for (const item of library) {
if (!item.configured) continue;
out.push({
kind: "library",
id: String(item.platform),
label: item.label,
account: item.displayName || item.account || "",
totalPosts: countFor(String(item.platform), false),
todayPosts: countFor(String(item.platform), true),
posts: item.posts ?? null,
followers: item.followers ?? null,
following: item.following ?? null,
subscribers: null,
notes: null,
reactions: item.reactions ?? null,
comments: item.comments ?? null,
views: item.views ?? null,
videos: null
});
}
for (const ch of channels) {
if (!ch.configured) continue;
out.push({
kind: "channel",
id: ch.id,
label: ch.label,
account: ch.displayName || ch.account || "",
totalPosts: countFor(ch.id, false),
todayPosts: countFor(ch.id, true),
posts: null,
followers: ch.followers ?? null,
following: null,
subscribers: ch.subscribers ?? null,
notes: ch.notes ?? null,
reactions: null,
comments: null,
views: null,
videos: null
});
}
// TikTok：每个账号一行。账号公开资料来自 TikTok 发布页同步（standalone_tiktok_accounts），
// 发布数按日志 message 里的槽位号（"TikTok 1 …"）归属到各账号。
const tiktokAccounts = await listTikTokAccounts(db, tenantId).catch(() => []);
const tiktokCountFor = (slot: number, onlyToday: boolean) =>
logs.filter((l) => l.tiktokSlots.includes(slot) && (!onlyToday || shanghaiDay(l.created) === today)).length;
for (const a of tiktokAccounts) {
const uname = (a.username ? `@${a.username.replace(/^@/, "")}` : a.name || "").trim();
out.push({
kind: "library",
id: `tiktok:${a.slot}`,
label: "TikTok",
account: uname || `账号 #${a.slot}`,
totalPosts: tiktokCountFor(a.slot, false),
todayPosts: tiktokCountFor(a.slot, true),
posts: null,
followers: a.followerCount,
following: null,
subscribers: null,
notes: null,
reactions: null,
comments: null,
views: null,
videos: a.videoCount
});
}
return out;
}

// email_contacts 索引：(tenant_id, created_at)，让"今日新增联系人"走索引而不是全表扫描
let emailContactsIdxEnsured = false;
async function ensureEmailContactsIdx(db: Pool) {
if (emailContactsIdxEnsured) return;
try {
await db.query(`CREATE INDEX idx_email_contacts_tenant_created ON email_contacts (tenant_id, created_at)`);
} catch (e) {
if (!/duplicate key name/i.test(String((e as Error)?.message || ""))) throw e;
}
emailContactsIdxEnsured = true;
}

// CRM 入库统计：按 tenant 统计真实联系人数据。
// 历史导入的联系人没有 single-search / industry-search 来源标签，按标签统计永远为 0，
// 所以"今日导入/累计导入"直接按 tenant 的真实入库数统计。
const crmDailyCache = new Map<number, { at: number; val: { importedToday: number; importedTotal: number } }>();
async function getCrmDaily(db: Pool, tenantId: number): Promise<{ importedToday: number; importedTotal: number }> {
const hit = crmDailyCache.get(tenantId);
if (hit && Date.now() - hit.at < 60_000) return hit.val;
const today = shanghaiToday();
const { start, end} = shanghaiDayRange(today);
let importedToday = 0;
let importedTotal = 0;
try {
await ensureEmailContactsIdx(db);
const [r1] = await db.query<RowDataPacket[]>(
`SELECT COUNT(*) AS n FROM email_contacts WHERE tenant_id =? AND created_at >=? AND created_at <?`,
[tenantId, start, end]
);
importedToday = Number(r1[0]?.n) || 0;
const [r2] = await db.query<RowDataPacket[]>(
`SELECT COUNT(*) AS n FROM email_contacts WHERE tenant_id =?`,
[tenantId]
);
importedTotal = Number(r2[0]?.n) || 0;
} catch {
/* ignore */
}
const val = { importedToday, importedTotal};
crmDailyCache.set(tenantId, { at: Date.now(), val});
return val;
}

async function countSearchesToday(db: Pool, tenantId: number, mode: "single" | "industry"): Promise<number> {
const today = shanghaiToday();
const { start, end} = shanghaiDayRange(today);
try {
const [rows] = await db.query<RowDataPacket[]>(
`SELECT COUNT(*) AS n FROM lead_search_jobs
WHERE tenant_id =? AND created_at >=? AND created_at <?
AND input_json LIKE?`,
[tenantId, start, end, `%"mode":"${mode}"%`]
);
return Number(rows[0]?.n) || 0;
} catch {
return 0;
}
}

export async function getSearchDaily(db: Pool, tenantId: number, mode: "single" | "industry"): Promise<SearchDaily> {
const [searchesToday, crm] = await Promise.all([
countSearchesToday(db, tenantId, mode),
getCrmDaily(db, tenantId)
]);
return { searchesToday, importedToday: crm.importedToday, importedTotal: crm.importedTotal};
}

export async function getDailySections(db: Pool, tenantId: number): Promise<DailySections> {
const date = shanghaiToday();
// dnrpj.cn 定制版：去掉社媒板块（2026-10-01）
const [mailboxes, leadSearch, industrySearch] = await Promise.all([
getMailboxStats(db, tenantId).catch((e) => {
console.warn("[daily-sections] mailbox failed:", (e as Error)?.message || e);
return [];
}),
getSearchDaily(db, tenantId, "single").catch((e) => {
console.warn("[daily-sections] single-search failed:", (e as Error)?.message || e);
return { searchesToday: 0, importedToday: 0, importedTotal: 0 };
}),
getSearchDaily(db, tenantId, "industry").catch((e) => {
console.warn("[daily-sections] industry-search failed:", (e as Error)?.message || e);
return { searchesToday: 0, importedToday: 0, importedTotal: 0 };
})
]);
return { date, mailboxes, social: [], leadSearch, industrySearch};
}

// 日报 sections 服务端缓存：页面要"秒开"，90 秒内直接返回缓存；
// 缓存过期后先返回旧数据、后台刷新（stale-while-revalidate），页面永远不等。
const SECTIONS_TTL_MS = 90_000;
const sectionsCache = new Map<number, { at: number; val: DailySections }>();
export async function getDailySectionsCached(db: Pool, tenantId: number): Promise<DailySections> {
const hit = sectionsCache.get(tenantId);
if (hit && Date.now() - hit.at < SECTIONS_TTL_MS) return hit.val;
if (hit) {
void getDailySections(db, tenantId)
.then((val) => sectionsCache.set(tenantId, { at: Date.now(), val}))
.catch((e) => console.warn("[daily-sections] background refresh failed:", (e as Error)?.message || e));
return hit.val;
}
const val = await getDailySections(db, tenantId);
sectionsCache.set(tenantId, { at: Date.now(), val});
return val;
}

// 启动后预热各 tenant 的日报缓存，Watson 第一次打开页面就是秒开
export function warmupDailySections(db: Pool) {
void (async () => {
try {
const [rows] = await db.query<RowDataPacket[]>(`SELECT id FROM tenants`);
for (const r of rows as Array<{ id: number }>) {
const tid = Number(r.id);
if (!tid) continue;
try {
const val = await getDailySections(db, tid);
sectionsCache.set(tid, { at: Date.now(), val});
} catch (e) {
console.warn("[daily-sections] warmup failed for tenant", tid, (e as Error)?.message || e);
}
}
} catch (e) {
console.warn("[daily-sections] warmup failed:", (e as Error)?.message || e);
}
})();
}

/* ---------------- review ---------------- */

export async function generateDailyReview(db: Pool, tenantId: number): Promise<string> {
const date = shanghaiToday();
const sections = await getDailySections(db, tenantId).catch(() => null);
const report = await loadDailyReport(db, tenantId, date).catch(() => null);
const campaign = await todayCampaignStats(db, tenantId, date).catch(() => null);

const lines: string[] = [``];
if (sections) {
const mb = sections.mailboxes
.map((m) => `${m.account}：总收信${m.inboxTotal}、总发信${m.sentTotal}、今日收信${m.inboxToday}、今日发信${m.sentToday}`)
.join("；");
lines.push(`企业邮箱：${mb || "无数据"}`);
const sc = sections.social
.map(
(s) =>
`${s.label}${s.account? `（${s.account}）`: ""}：独立站发布${s.totalPosts}篇（今日${s.todayPosts}）` +
(s.followers!== null? `、粉丝${s.followers}`: "") +
(s.subscribers!== null? `、订阅${s.subscribers}`: "")
)
.join("；");
lines.push(`社媒发布（已接通${sections.social.length}个平台/频道）：${sc || "暂无已接通平台"}`);
lines.push(
`企业leads精搜：今日搜索${sections.leadSearch.searchesToday}家，今日入库${sections.leadSearch.importedToday}条（累计${sections.leadSearch.importedTotal}条）。`
);
lines.push(
`行业企业搜索：今日搜索${sections.industrySearch.searchesToday}家，今日入库${sections.industrySearch.importedToday}条（累计${sections.industrySearch.importedTotal}条）。`
);
}
if (report) {
lines.push(
`搜索验证：企业${report.companiesSearched}家（${report.countries.join("、") || "未记录"}），邮箱检查${report.emailsChecked}个、有效${report.emailsValid}个；开发信计划${report.lettersPlanned}、已发${report.lettersSent}、失败${report.lettersFailed}。`
);
}
const st = campaign?.stats;
if (st) {
lines.push(
`邮件营销：发送成功${st.delivered}、失败${st.failed}、打开${st.opened}、订阅${st.subscribe}、退订${st.unsubscribe}、投诉${st.complaint}。`
);
}
const digest = lines.join("\n");

// 复盘固定走 AI 桌宠的大模型（pet-api）；桌宠不可用时才走模板汇总
const reviewPrompt =
"你是独立站获客复盘助手。根据以下今日运营数据写中文复盘（200-350字，不要markdown标题）。要求：\n" +
"1. 先给1-2句总体评价；\n" +
"2. 点出今天做得不错的2-3个亮点（引用关键数字佐证）；\n" +
"3. 指出2-3个最值得改进的问题或机会；\n" +
"4. 最后给1-2条具体、可执行的明日行动建议。\n" +
"不要复述全部原始数据，只在论证观点时引用关键数字；不要编造数据。\n\n今日运营数据：\n" +
digest;
const viaPet = await reviewViaPet(db, tenantId, reviewPrompt).catch(() => null);
if (viaPet) return viaPet;
// 模板兜底：不复读全部数据，只点出今日活跃/沉寂的平台和关键缺口
const tpl: string[] = [`${date} 复盘：`];
if (sections) {
const active = sections.social.filter((s) => s.todayPosts > 0);
const quiet = sections.social.filter((s) => s.todayPosts === 0);
if (active.length)
tpl.push(`· 今日有发布：${active.map((s) => `${s.label}${s.todayPosts}篇`).join("、")}。`);
if (quiet.length)
tpl.push(`· 今日未发布（${quiet.length}个）：${quiet.map((s) => s.label).join("、")}，可考虑补发保持活跃。`);
const todayMails = sections.mailboxes.reduce((n, m) => n + m.inboxToday, 0);
if (todayMails > 0) tpl.push(`· 企业邮箱今日收到 ${todayMails} 封，记得及时回复。`);
if (sections.leadSearch.searchesToday === 0 && sections.industrySearch.searchesToday === 0)
tpl.push(`· 今日未做企业搜索，线索入库为 0，明日可安排至少 1 次精搜补充线索。`);
}
tpl.push("（桌宠暂时连不上，走模板汇总；桌宠恢复后可生成智能复盘。）");
return tpl.join("\n");
}

// 用已保存的桌宠 pet-api Key 调 /v1/chat 生成智能复盘
async function reviewViaPet(db: Pool, tenantId: number, prompt: string): Promise<string | null> {
try {
await db.query(
`CREATE TABLE IF NOT EXISTS standalone_pet_sync (
tenant_id BIGINT NOT NULL PRIMARY KEY,
pet_url VARCHAR(255) NULL,
api_key_enc TEXT NULL,
key_tail VARCHAR(16) NULL,
last_sync_at BIGINT NULL,
last_sync_ok TINYINT NULL,
last_sync_message VARCHAR(500) NULL,
updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
);
const [rows] = await db.query<RowDataPacket[]>(
`SELECT pet_url, api_key_enc FROM standalone_pet_sync WHERE tenant_id = ? LIMIT 1`,
[tenantId]
);
const row = (rows as Array<Record<string, unknown>>)[0];
const enc = String(row?.api_key_enc ?? "");
if (!enc) return null;
const key = decryptSecret(enc);
const base = String(row?.pet_url || process.env.PET_API_URL || "")
.trim()
.replace(/\/+$/, "");
const res = await fetch(`${base}/v1/chat`, {
method: "POST",
headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
body: JSON.stringify({ message: prompt }),
signal: AbortSignal.timeout(90000)
});
if (res.status < 200 || res.status >= 300) return null;
const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
for (const k of ["reply", "text", "message", "content", "answer"]) {
const v = data?.[k];
if (typeof v === "string" && v.trim()) return v.trim().slice(0, 2000);
}
return null;
} catch {
return null;
}
}
