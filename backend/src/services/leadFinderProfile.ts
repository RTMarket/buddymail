import type { Pool, RowDataPacket} from "mysql2/promise";
import { decryptSecret} from "../cryptoSecret.js";

/**
* 行业企业搜索 · 用户业务画像（企业介绍 / 业务介绍 / 目标客群画像）
* 画像按 tenant 存一份，前端打开页面时自动带入；AI 画像分析复用桌宠 pet-api。
*/

export type LeadSearchProfile = {
companyIntro: string;
businessDesc: string;
customerProfile: string;
};

export const EMPTY_LEAD_SEARCH_PROFILE: LeadSearchProfile = {
companyIntro: "",
businessDesc: "",
customerProfile: ""
};

export async function ensureLeadSearchProfileSchema(db: Pool): Promise<void> {
await db.query(`
CREATE TABLE IF NOT EXISTS leads_search_profiles (
tenant_id BIGINT NOT NULL PRIMARY KEY,
company_intro TEXT NULL,
business_desc TEXT NULL,
customer_profile TEXT NULL,
updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
}

export async function getLeadSearchProfile(db: Pool, tenantId: number): Promise<LeadSearchProfile | null> {
await ensureLeadSearchProfileSchema(db);
const [rows] = await db.query<RowDataPacket[]>(
`SELECT company_intro, business_desc, customer_profile FROM leads_search_profiles WHERE tenant_id =? LIMIT 1`,
[tenantId]
);
const r = rows[0];
if (!r) return null;
return {
companyIntro: String(r.company_intro?? ""),
businessDesc: String(r.business_desc?? ""),
customerProfile: String(r.customer_profile?? "")
};
}

export async function saveLeadSearchProfile(db: Pool, tenantId: number, p: LeadSearchProfile): Promise<void> {
await ensureLeadSearchProfileSchema(db);
await db.query(
`INSERT INTO leads_search_profiles (tenant_id, company_intro, business_desc, customer_profile)
VALUES (?,?,?,?)
ON DUPLICATE KEY UPDATE
company_intro = VALUES(company_intro),
business_desc = VALUES(business_desc),
customer_profile = VALUES(customer_profile)`,
[tenantId, p.companyIntro, p.businessDesc, p.customerProfile]
);
}

/* ------------------------------------------------------------------ */
/* 桌宠 pet-api 复用（表结构/行类型从 standaloneB2bDaily 抄来，不 import 受保护文件） */
/* ------------------------------------------------------------------ */

const DEFAULT_PET_API_URL = (process.env.PET_API_URL || "").trim();

type PetSyncRow = {
tenant_id: number;
pet_url: string | null;
api_key_enc: string | null;
key_tail: string | null;
};

async function ensurePetSyncSchema(db: Pool): Promise<void> {
await db.query(`
CREATE TABLE IF NOT EXISTS standalone_pet_sync (
tenant_id BIGINT NOT NULL PRIMARY KEY,
pet_url VARCHAR(255) NULL,
api_key_enc TEXT NULL,
key_tail VARCHAR(16) NULL,
last_sync_at BIGINT NULL,
last_sync_ok TINYINT NULL,
last_sync_message VARCHAR(500) NULL,
updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
}

async function loadPetCredential(db: Pool, tenantId: number): Promise<{ base: string; key: string} | null> {
await ensurePetSyncSchema(db);
const [rows] = await db.query<RowDataPacket[]>(
`SELECT pet_url, api_key_enc FROM standalone_pet_sync WHERE tenant_id =? LIMIT 1`,
[tenantId]
);
const row = rows[0] as PetSyncRow | undefined;
if (!row?.api_key_enc) return null;
const base = String(row.pet_url || process.env.BSS_PET_API_URL || DEFAULT_PET_API_URL)
.trim()
.replace(/\/+$/, "");
return { base, key: decryptSecret(String(row.api_key_enc))};
}

const ANALYST_SYSTEM =
"你是 B2B 外贸获客分析师，擅长帮中小企业主梳理目标客户画像、制定找客户策略。" +
"只根据用户给的资料分析判断，不编造。用中文回答，使用 Markdown 格式（标题、列表、加粗），简洁实用。";

function profileBlock(p: LeadSearchProfile): string {
return [
`\n${p.companyIntro.trim() || "（未填）"}`,
`\n${p.businessDesc.trim() || "（未填）"}`,
`\n${p.customerProfile.trim() || "（未填）"}`
].join("\n\n");
}

function firstAnalysisPrompt(p: LeadSearchProfile): string {
return (
`${profileBlock(p)}\n\n` +
`请做一次全面分析，用 Markdown 输出，包含三部分：\n` +
`## 一、画像诊断\n指出画像里写得模糊、缺失或矛盾的地方，并给出补全建议。\n` +
`## 二、找客建议\n建议去哪些国家/地区找、用什么行业词和英文关键词组合搜索、优先找什么职位的人。\n` +
`## 三、执行 SOP\n列出在本工作台「行业企业搜索」页一步一步执行的操作清单` +
`（筛选条件设置、搜索数量、A/B/C/D 分级筛选、深度搜索、入库 CRM）。`
);
}

function followupPrompt(p: LeadSearchProfile, question: string): string {
return (
`${profileBlock(p)}\n\n` +
`用户追问：${question}\n\n` +
`请结合上面的画像资料，用中文 Markdown 简要回答这个追问（可以包含诊断、找客建议或 SOP 调整）。`
);
}

/** 从 pet-api /v1/chat 的返回里尽量抠出文本（兼容 OpenAI 式 choices 与简单格式）。 */
function extractChatText(data: unknown): string {
if (!data || typeof data!== "object") return "";
const o = data as Record<string, unknown>;
const choices = o.choices;
if (Array.isArray(choices) && choices.length > 0) {
const msg = (choices[0] as Record<string, unknown> | undefined)?.message as
| Record<string, unknown>
| undefined;
const content = msg?.content;
if (typeof content === "string" && content.trim()) return content.trim();
if (Array.isArray(content)) {
const t = content
.map((c) => (c && typeof c === "object"? String((c as Record<string, unknown>).text?? ""): ""))
.join("")
.trim();
if (t) return t;
}
}
for (const k of ["reply", "text", "content", "message", "answer"]) {
const v = o[k];
if (typeof v === "string" && v.trim()) return v.trim();
}
return "";
}

export type AnalyzeProfileResult = { ok: boolean; markdown?: string; message?: string};

/**
* 用桌宠大模型分析业务画像。无状态：聊天历史由前端自己维护，
* 每次调用只带画像 + 本次问题（无问题则做首次全面分析）。
*/
export async function analyzeProfileWithPet(
db: Pool,
tenantId: number,
profile: LeadSearchProfile,
question?: string
): Promise<AnalyzeProfileResult> {
const pet = await loadPetCredential(db, tenantId);
if (!pet) {
return { ok: false, message: "还没有保存桌宠 Key，请先到「每日日报总结」页底部保存"};
}
const q = String(question || "").trim();
const userText = q? followupPrompt(profile, q): firstAnalysisPrompt(profile);
const payload = JSON.stringify({
messages: [
{ role: "system", content: ANALYST_SYSTEM},
{ role: "user", content: userText}
]
});
// 桌宠接口偶发网络抖动（fetch failed），自动重试 3 次
let lastErr = "";
for (let attempt = 1; attempt <= 3; attempt++) {
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 90_000);
try {
const res = await fetch(`${pet.base}/v1/chat`, {
method: "POST",
headers: { Authorization: `Bearer ${pet.key}`, "Content-Type": "application/json"},
body: payload,
signal: ctrl.signal
});
if (res.status === 401 || res.status === 403) {
return { ok: false, message: "桌宠 Key 无效，请到「每日日报总结」页底部重新保存"};
}
const data: unknown = await res.json().catch(() => null);
const text = extractChatText(data);
if (!text) return { ok: false, message: `桌宠返回异常（HTTP ${res.status}），请稍后重试`};
return { ok: true, markdown: text};
} catch (e) {
const msg = e instanceof Error? e.message: String(e);
if (/abort/i.test(msg)) return { ok: false, message: "桌宠响应超时（90 秒），请稍后重试"};
lastErr = msg;
if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
} finally {
clearTimeout(timer);
}
}
return { ok: false, message: `连不上桌宠，已重试 3 次（${lastErr.slice(0, 80)}），请稍后重试`};
}
