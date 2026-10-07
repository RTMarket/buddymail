import type { Pool } from "mysql2/promise";

/**
 * 邮件内容关键词黑名单服务。
 *
 * 三层使用场景：
 *   (a) 模板编辑器实时提示：前端 debounce 调 checkContent({ subject, html })
 *       服务端只返回命中点位 + severity + hint，前端在右侧 panel 渲染
 *   (b) 模板保存时检查：保存后端口同时调一次 checkContent，把 high/medium 命中数
 *       一并返回；前端展示一个"内容健康度报告"
 *   (c) 营销活动发送前最终拦截：executeCampaignSend 进循环前再调一次 checkContent，
 *       若有 high 命中且未确认 → 拒绝发送；medium/low 仅记录不拦截
 *
 * 性能：
 *   - 关键词数量上限 ~500 条（平台级 + 租户级），都 cache 到内存 30 秒；
 *   - HTML 先 stripTags 成纯文本再扫描，避免 <span> 切词误判；
 *   - regex 类只允许平台级（超管维护），避免恶意租户注入 catastrophic regex。
 */

export type KeywordSeverity = "low" | "medium" | "high";
export type KeywordScope = "subject" | "body" | "both";
export type KeywordMatchKind = "plain" | "word" | "regex";

interface KeywordRow {
  id: number;
  tenant_id: number | null;
  term: string;
  match_kind: KeywordMatchKind;
  severity: KeywordSeverity;
  hint: string | null;
  scope: KeywordScope;
  enabled: 0 | 1;
}

export interface KeywordHit {
  id: number;
  term: string;
  severity: KeywordSeverity;
  scope: KeywordScope;
  /** 在主题/正文里的命中次数 */
  countInSubject: number;
  countInBody: number;
  /** UI 直接渲染的提示语 */
  hint: string | null;
  /** 平台级 / 该租户私有，便于 UI 标小角标 */
  source: "platform" | "tenant";
}

export interface CheckSummary {
  hits: KeywordHit[];
  /** 命中聚合：UI 顶部展示"高 X / 中 Y / 低 Z" */
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** 是否需要拦截发送（仅当 high>0 且调用方传入 enforceHigh=true） */
  blockSend: boolean;
  /** 总体打分：用于"内容健康度" UI 圆环 0-100，100 = 没命中、0 = 大量高危命中 */
  score: number;
}

/**
 * 内存缓存：30 秒 TTL，避免每次模板键入都查 DB。
 * 在 admin 后台改动黑名单后，可以调 invalidateKeywordCache() 立即生效。
 */
const CACHE_TTL_MS = 30_000;
let cacheAt = 0;
let cachedRowsAll: KeywordRow[] = [];

export function invalidateKeywordCache() {
  cacheAt = 0;
  cachedRowsAll = [];
}

async function loadKeywords(db: Pool): Promise<KeywordRow[]> {
  const now = Date.now();
  if (cachedRowsAll.length > 0 && now - cacheAt < CACHE_TTL_MS) {
    return cachedRowsAll;
  }
  const [rows] = await db.query(
    `SELECT id, tenant_id, term, match_kind, severity, hint, scope, enabled
       FROM email_keyword_blacklist
      WHERE enabled = 1`
  );
  cachedRowsAll = rows as KeywordRow[];
  cacheAt = now;
  return cachedRowsAll;
}

/**
 * 主入口：对一封邮件的主题 + 正文做关键词检查。
 *
 * @param tenantId 租户级关键词作用域；传 0 / null 则只用平台级
 * @param subject 主题（纯文本）
 * @param html 邮件正文（HTML 或纯文本均可，本函数会 stripTags）
 * @param enforceHigh 是否在 high 命中时把 blockSend=true（默认 false 仅提示）
 */
export async function checkContent(
  db: Pool,
  args: {
    tenantId?: number | null;
    subject: string;
    html: string;
    enforceHigh?: boolean;
  }
): Promise<CheckSummary> {
  const tenantId = Number(args.tenantId ?? 0) || 0;
  const subject = String(args.subject ?? "");
  const bodyText = stripTags(String(args.html ?? ""));

  const all = await loadKeywords(db);
  /**
   * 取平台级 + 当前租户级；平台级优先级更高（同 term 时 platform 先）。
   * tenant_id IS NULL → 平台级；非 NULL 必须等于 tenantId。
   */
  const applicable = all.filter((k) => k.tenant_id == null || Number(k.tenant_id) === tenantId);

  const hits: KeywordHit[] = [];
  for (const kw of applicable) {
    const inSubj =
      kw.scope === "body" ? 0 : countOccurrences(subject, kw.term, kw.match_kind);
    const inBody =
      kw.scope === "subject" ? 0 : countOccurrences(bodyText, kw.term, kw.match_kind);
    if (inSubj === 0 && inBody === 0) continue;
    hits.push({
      id: kw.id,
      term: kw.term,
      severity: kw.severity,
      scope: kw.scope,
      countInSubject: inSubj,
      countInBody: inBody,
      hint: kw.hint,
      source: kw.tenant_id == null ? "platform" : "tenant"
    });
  }

  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  for (const h of hits) {
    const total = h.countInSubject + h.countInBody;
    if (h.severity === "high") highCount += total;
    else if (h.severity === "medium") mediumCount += total;
    else lowCount += total;
  }

  /**
   * 评分：
   *   起始 100 分；每个 high 命中扣 25、medium 扣 6、low 扣 1。
   *   最低 0。
   * 这套加权是经验值；P4 阶段超管后台可调。
   */
  const score = Math.max(0, 100 - (highCount * 25 + mediumCount * 6 + lowCount * 1));

  const blockSend = !!args.enforceHigh && highCount > 0;
  return {
    hits: hits.sort(severityRank),
    highCount,
    mediumCount,
    lowCount,
    blockSend,
    score
  };
}

function severityRank(a: KeywordHit, b: KeywordHit): number {
  const order: Record<KeywordSeverity, number> = { high: 0, medium: 1, low: 2 };
  if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
  return a.term.localeCompare(b.term);
}

function stripTags(html: string): string {
  /**
   * 简化版 stripTags：只去 <...> 标签，保留可见字符。HTML entity 不解码（比如 &amp; 保留），
   * 因为反垃圾过滤器一般也直接看 raw HTML。这里如果未来要更精细可以接 cheerio，
   * 但目前 ~500 字节正文 + 30 个关键词的扫描，简单 replace 已经足够。
   */
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

function countOccurrences(haystack: string, needle: string, kind: KeywordMatchKind): number {
  if (!haystack || !needle) return 0;
  if (kind === "regex") {
    /** 平台级关键词才允许 regex；恶意 catastrophic regex 由超管自检（暂不内置 ReDoS 保护） */
    try {
      const re = new RegExp(needle, "gi");
      const m = haystack.match(re);
      return m ? m.length : 0;
    } catch {
      return 0;
    }
  }
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  if (kind === "word") {
    /** word 模式：用 \b 边界包裹（中文没有词边界，退化为 plain） */
    if (/[\u4e00-\u9fa5]/.test(lowerNeedle)) {
      return countOccurrences(haystack, needle, "plain");
    }
    try {
      const re = new RegExp(`\\b${escapeRegex(lowerNeedle)}\\b`, "gi");
      const m = lowerHay.match(re);
      return m ? m.length : 0;
    } catch {
      return 0;
    }
  }
  // plain：子串计数
  let i = 0;
  let count = 0;
  while (true) {
    const idx = lowerHay.indexOf(lowerNeedle, i);
    if (idx === -1) break;
    count += 1;
    i = idx + lowerNeedle.length;
  }
  return count;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 给前端"内容健康度"卡片用的快速汇总；包装 checkContent 的返回去掉 hits 数组（避免大 payload）。
 */
export async function summarizeContentHealth(
  db: Pool,
  args: { tenantId?: number | null; subject: string; html: string }
): Promise<{ score: number; highCount: number; mediumCount: number; lowCount: number }> {
  const r = await checkContent(db, args);
  return { score: r.score, highCount: r.highCount, mediumCount: r.mediumCount, lowCount: r.lowCount };
}
