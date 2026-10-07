import type { Pool } from "mysql2/promise";
import { businessDayMysqlRange, businessTodayYmd, sqlBusinessDatetimeBetweenAnd } from "./businessCalendar.js";
import { countTenantDeliveredToday } from "./emailDeliveredCount.js";
import { standaloneLicenseDailyCap } from "./emailSendQuota.js";

/**
 * 租户发送等级 + 每日配额 + 预热曲线 + 健康度。
 *
 * 10 档体系（对外展示为洪荒仙阶名；silver 仍保留给历史 $3/500 档，营销页默认不主推）：
 *   bronze_apprentice 200/d  凡尘记名（免费 7 日）
 *   silver            500/d  email-send-500    $3/月 游仙
 *   gold            1,000/d  email-send-1000     $15/月 灵仙
 *   platinum        3,000/d  email-send-3000    $25/月 真仙
 *   diamond         5,000/d  email-send-5000    $45/月 玄仙
 *   master         10,000/d  email-send-10000    $79/月 金仙
 *   titan          20,000/d  email-send-20000   $129/月 大罗
 *   king           30,000/d  email-send-30000   $199/月 混元
 *   taiyi          35,000/d  email-send-35000   $219/月 太乙真君
 *   beidou         40,000/d  email-send-40000   $239/月 北斗星君
 *   nandou         45,000/d  email-send-45000   $259/月 南斗星君
 *   supreme        50,000/d  email-send-50000   $279/月 准圣
 *   yasheng        60,000/d  email-send-60000   $299/月 亚圣
 *   shengwang      80,000/d  email-send-80000   $339/月 圣王
 *   legendary     100,000/d  email-send-100000 $369/月 魔尊
 *   dao_sovereign 120,000/d  email-send-120000 $399/月 道尊
 *   quad_lane_70k  70,000/d  email-send-70000    $7/月 四机组仙（4 专机组联调）
 *
 * 关键设计：
 *   - 用户付费 → target_tier / target_daily_limit 立刻设到对应档位（变现不延迟）；
 *   - 但实际每日限额 = target × warmup_factor，按预热曲线渐进释放：
 *       D1 (0-3 天): 30%
 *       D3 (3-7 天): 50%
 *       D7 (7-14 天): 80%
 *       D14+: 100%
 *   - 行为异常（bounce > 5% 或 complaint > 0.1%，但还没到熔断红线）→ 把
 *     warmup_started_at 推回 NOW()，等同把预热进度重置回 D1，明天降速；
 *   - 真触发熔断红线（bounce > 8% 或 complaint > 0.3%）→ 整体暂停 + 自助解封一次；
 *   - 熔断统计的「最近 N 封」**不包含**已结束（status=completed）或已停止（stopped）的活动批次，
 *     避免活动结束后仍被历史退信锁死；解封时另有 circuit_window_floor_at 剔除更早的发件；
 *   - 指标恢复健康时，系统自动熔断（非人工冻结）可自动解除，发送前也会即时跑一轮扫描。
 *   - 免费档（未订阅付费套餐，target_tier 为空）：自 free_trial_started_at 起 **7 天**内每日 200 封；
 *     试用期满后每日上限为 0，必须订阅邮件发送套餐才可继续群发。
 *
 * 这个文件**只**管 tenant_send_tier 表的逻辑；订阅激活在 emailSubscriptionActivation.ts，
 * 那里调 setTargetTierFromSubscription() 写入本表。
 */

// ============================================================
// 常量配置
// ============================================================

export type SendTier =
  | "bronze_apprentice"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master"
  | "titan"
  | "king"
  | "taiyi"
  | "beidou"
  | "nandou"
  | "supreme"
  | "yasheng"
  | "shengwang"
  | "legendary"
  | "dao_sovereign";

export interface TierDef {
  dailyLimit: number;
  label: string;
  emoji: string;
  /** 对应的付费套餐 ID（与 billing/tierCatalog.ts 的 key 对齐）；免费档为 null */
  subscriptionTierId: string | null;
  monthlyPriceUsd: number | null;
  /** 用户能看到的简短描述，主推卖点 */
  shortNote: string;
}

export const TIER_CONFIG: Record<SendTier, TierDef> = {
  bronze_apprentice: {
    dailyLimit: 200,
    label: "凡尘记名",
    emoji: "🥉",
    subscriptionTierId: null,
    monthlyPriceUsd: null,
    shortNote: "山门记名弟子：新户七日罡风试炼，日限 200 封；期满请敕封仙阶套餐"
  },
  silver: {
    dailyLimit: 500,
    label: "游仙",
    emoji: "🥈",
    subscriptionTierId: "email-send-500",
    monthlyPriceUsd: 3,
    shortNote: "$3/月 · 500 封/日（游尘散仙，老档续费仍可用；新客默认从灵仙起）"
  },
  gold: {
    dailyLimit: 1000,
    label: "灵仙",
    emoji: "🥇",
    subscriptionTierId: "email-send-1000",
    monthlyPriceUsd: 15,
    shortNote: "$15/月 · 1,000 封/日（老档续费；新客从中量真仙 3,000 起）"
  },
  platinum: {
    dailyLimit: 3000,
    label: "真仙",
    emoji: "💎",
    subscriptionTierId: "email-send-3000",
    monthlyPriceUsd: 15,
    shortNote: "$15/月 · 3,000 封/日，可开府建坛"
  },
  diamond: {
    dailyLimit: 5000,
    label: "玄仙",
    emoji: "💠",
    subscriptionTierId: "email-send-5000",
    monthlyPriceUsd: 21,
    shortNote: "$21/月 · 5,000 封/日，玄门星君级吞吐"
  },
  master: {
    dailyLimit: 10000,
    label: "金仙",
    emoji: "⭐",
    subscriptionTierId: "email-send-10000",
    monthlyPriceUsd: 29,
    shortNote: "$29/月 · 10,000 封/日，周天星斗级群发"
  },
  titan: {
    dailyLimit: 20000,
    label: "大罗",
    emoji: "🗿",
    subscriptionTierId: "email-send-20000",
    monthlyPriceUsd: 39,
    shortNote: "$39/月 · 20,000 封/日，大罗果位高发量"
  },
  king: {
    dailyLimit: 30000,
    label: "混元",
    emoji: "👑",
    subscriptionTierId: "email-send-30000",
    monthlyPriceUsd: 59,
    shortNote: "$59/月 · 30,000 封/日，混元道君镇教级"
  },
  taiyi: {
    dailyLimit: 35000,
    label: "太乙真君",
    emoji: "☁️",
    subscriptionTierId: "email-send-35000",
    monthlyPriceUsd: 63,
    shortNote: "$63/月 · 35,000 封/日，太乙敕令镇霄"
  },
  beidou: {
    dailyLimit: 40000,
    label: "北斗星君",
    emoji: "🌌",
    subscriptionTierId: "email-send-40000",
    monthlyPriceUsd: 69,
    shortNote: "$69/月 · 40,000 封/日，北斗照命轮转"
  },
  nandou: {
    dailyLimit: 45000,
    label: "南斗星君",
    emoji: "✨",
    subscriptionTierId: "email-send-45000",
    monthlyPriceUsd: 75,
    shortNote: "$75/月 · 45,000 封/日，南斗延生增福"
  },
  supreme: {
    dailyLimit: 50000,
    label: "准圣",
    emoji: "🏆",
    subscriptionTierId: "email-send-50000",
    monthlyPriceUsd: 79,
    shortNote: "$79/月 · 50,000 封/日，半步圣人执劫"
  },
  yasheng: {
    dailyLimit: 60000,
    label: "亚圣",
    emoji: "⚡",
    subscriptionTierId: "email-send-60000",
    monthlyPriceUsd: 89,
    shortNote: "$89/月 · 60,000 封/日，亚圣临世旺季主力"
  },
  shengwang: {
    dailyLimit: 80000,
    label: "圣王",
    emoji: "👑",
    subscriptionTierId: "email-send-80000",
    monthlyPriceUsd: 109,
    shortNote: "$109/月 · 80,000 封/日，圣王冕下多域并行"
  },
  legendary: {
    dailyLimit: 100000,
    label: "魔尊",
    emoji: "🌟",
    subscriptionTierId: "email-send-100000",
    monthlyPriceUsd: 129,
    shortNote: "$129/月 · 100,000 封/日，九幽魔尊统御万魔潮"
  },
  dao_sovereign: {
    dailyLimit: 120000,
    label: "道尊",
    emoji: "🔱",
    subscriptionTierId: "email-send-120000",
    monthlyPriceUsd: 149,
    shortNote: "$149/月 · 120,000 封/日，混沌道尊封顶仙阶"
  },
  quad_lane_70k: {
    dailyLimit: 70000,
    label: "四机组仙",
    emoji: "🛰️",
    subscriptionTierId: "email-send-70000",
    monthlyPriceUsd: 7,
    shortNote: "$7/月 · 70,000 封/日 · 4 专机组多专线联调"
  }
};

/** 升序排列的等级数组，便于"找下一档"等遍历 */
export const TIER_LADDER: SendTier[] = [
  "bronze_apprentice",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "titan",
  "king",
  "taiyi",
  "beidou",
  "nandou",
  "supreme",
  "yasheng",
  "shengwang",
  "legendary",
  "dao_sovereign",
  "quad_lane_70k"
];

/** 付费套餐 → 等级 反向映射（用户付费成功后调 setTargetTierFromSubscription 用） */
export const SUBSCRIPTION_TO_TIER: Record<string, SendTier> = {
  /** 联调用：极小金额验证支付链路；按 silver 给目标，让它走完整预热 */
  "email-send-test": "silver",
  "email-send-500": "silver",
  "email-send-1000": "gold",
  "email-send-3000": "platinum",
  "email-send-5000": "diamond",
  "email-send-10000": "master",
  "email-send-20000": "titan",
  "email-send-30000": "king",
  "email-send-35000": "taiyi",
  "email-send-40000": "beidou",
  "email-send-45000": "nandou",
  "email-send-50000": "supreme",
  "email-send-60000": "yasheng",
  "email-send-80000": "shengwang",
  "email-send-100000": "legendary",
  "email-send-120000": "dao_sovereign",
  "email-send-70000": "quad_lane_70k"
};

/**
 * 预热曲线：从 warmup_started_at 算起，第 N 天（不含）能放出 target_daily_limit 的多少倍。
 * 末尾一档 1.0 = 完全开放；之间按 step.afterDays 取最近一档。
 */
/** 凡尘记名免费档：自 free_trial_started_at 起可试用天数（期满未付费则不可再免费发） */
export const FREE_TRIAL_DAYS = 7;

export const WARMUP_CURVE: Array<{ afterDays: number; factor: number; label: string }> = [
  { afterDays: 0,  factor: 0.30, label: "D1 预热（30%）" },
  { afterDays: 3,  factor: 0.50, label: "D3 加速（50%）" },
  { afterDays: 7,  factor: 0.80, label: "D7 提速（80%）" },
  { afterDays: 14, factor: 1.00, label: "D14 完全开放（100%）" }
];

/**
 * 自动熔断阈值（红线）。仅当 {@link isSendCircuitBreakerEnforced} 为 true 时生效。
 * 中量/巨量「每租户独立 VPS」部署默认关闭熔断，只保留质量统计。
 */
export const CIRCUIT_BREAKER_THRESHOLDS = {
  recent100: { bounceRate: 0.08, complaintRate: 0.003 },
  recent1000: { bounceRate: 0.05, complaintRate: 0.001 }
} as const;

/**
 * 温和异常阈值（黄线，触发后只重置预热进度，不暂停）。
 * 远低于熔断；用来"早期提醒、降速保护"。
 */
export const WARMUP_RESET_THRESHOLDS = {
  recent100: { bounceRate: 0.05, complaintRate: 0.001 },
  recent1000: { bounceRate: 0.03, complaintRate: 0.0007 }
} as const;

/**
 * 是否执行「自动熔断」与「质量触发的预热重置」。
 * 默认关闭（独立 VPS 租户互不污染）；共享 SES 等多租户共 IP 场景可设 SEND_CIRCUIT_BREAKER_ENABLED=1。
 */
export function isSendCircuitBreakerEnforced(): boolean {
  const disabled = String(process.env.DISABLE_SEND_CIRCUIT_BREAKER ?? "").trim().toLowerCase();
  if (disabled === "1" || disabled === "true" || disabled === "yes") return false;
  const enabled = String(process.env.SEND_CIRCUIT_BREAKER_ENABLED ?? "0").trim().toLowerCase();
  return enabled === "1" || enabled === "true" || enabled === "yes";
}

// ============================================================
// 类型
// ============================================================

export interface TierState {
  tenant_id: number;
  tier: SendTier;
  /**
   * 当前实际生效的每日限额（写库快照值；逻辑上由 computeActualDailyLimit() 派生，
   * 写回库便于其它服务直接读，不再每次重新算）
   */
  daily_limit: number;
  /** 用户购买的付费档（可空 = 当前是免费档） */
  target_tier: SendTier | null;
  /** 用户购买档的目标日发量（不会受预热影响，是营销页"5000封"那种数字的真值） */
  target_daily_limit: number | null;
  stable_days: number;
  is_suspended: 0 | 1;
  suspension_reason: string | null;
  suspended_at: Date | null;
  self_unsuspend_count: number;
  recent_attempted_100: number;
  recent_bounce_100: number;
  recent_complaint_100: number;
  recent_attempted_1000: number;
  recent_bounce_1000: number;
  recent_complaint_1000: number;
  last_metric_refresh_at: Date | null;
  stability_streak_started_at: Date | null;
  /** 解封后熔断统计的起算时间：仅统计 created_at >= 此时间的 email_sends；NULL=不按时间裁剪 */
  circuit_window_floor_at: Date | null;
  /** 预热曲线锚点：付费当时设为 NOW()，温和异常时被推回当前时间触发"D1 重置" */
  warmup_started_at: Date | null;
  warmup_reset_count: number;
  last_promoted_at: Date | null;
  /** 凡尘记名免费档试用起算时间（仅 target_tier 为空时有意义） */
  free_trial_started_at: Date | null;
  created_at: Date;
}

// ============================================================
// 计算函数
// ============================================================

export interface FreeTrialState {
  /** 未订阅付费邮件套餐（tenant_send_tier.target_tier 为空） */
  isFreeOnly: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  /** 试用剩余整天数（未满一天向上取整）；未试用或已付费为 0 */
  daysRemaining: number;
  isTrialActive: boolean;
  isTrialExpired: boolean;
}

/**
 * 免费档 7 日试用：仅当从未写入付费 target_tier 时生效。
 * 试用起算：free_trial_started_at，缺省时回退 created_at（应在 ensureTierState 里补齐）。
 */
export function evalFreeTrial(t: Pick<TierState, "target_tier" | "free_trial_started_at" | "created_at">): FreeTrialState {
  const isFreeOnly = t.target_tier == null || String(t.target_tier).trim() === "";
  if (!isFreeOnly) {
    return {
      isFreeOnly: false,
      trialStartedAt: null,
      trialEndsAt: null,
      daysRemaining: 0,
      isTrialActive: false,
      isTrialExpired: false
    };
  }
  const startRaw = t.free_trial_started_at ?? t.created_at;
  if (!startRaw) {
    return {
      isFreeOnly: true,
      trialStartedAt: null,
      trialEndsAt: null,
      daysRemaining: FREE_TRIAL_DAYS,
      isTrialActive: true,
      isTrialExpired: false
    };
  }
  const startMs = new Date(startRaw).getTime();
  const endMs = startMs + FREE_TRIAL_DAYS * 86_400_000;
  const now = Date.now();
  const isTrialExpired = now >= endMs;
  const isTrialActive = !isTrialExpired;
  const msLeft = Math.max(0, endMs - now);
  const daysRemaining =
    isTrialExpired ? 0 : msLeft <= 0 ? 0 : Math.max(1, Math.ceil(msLeft / 86_400_000));
  return {
    isFreeOnly: true,
    trialStartedAt: new Date(startMs).toISOString(),
    trialEndsAt: new Date(endMs).toISOString(),
    daysRemaining,
    isTrialActive,
    isTrialExpired
  };
}

/** 距 warmup_started_at 经过的天数；NULL 时返回 null（免费档） */
export function daysSinceWarmupStart(warmupStartedAt: Date | null): number | null {
  if (!warmupStartedAt) return null;
  return (Date.now() - new Date(warmupStartedAt).getTime()) / 86_400_000;
}

/** 当前预热阶段的 factor (0.30 / 0.50 / 0.80 / 1.00) */
export function computeWarmupFactor(warmupStartedAt: Date | null): number {
  const days = daysSinceWarmupStart(warmupStartedAt);
  if (days == null) return 1.0; // 免费档不走预热
  if (days < 0) return WARMUP_CURVE[0]!.factor;
  let f = WARMUP_CURVE[0]!.factor;
  for (const step of WARMUP_CURVE) {
    if (days >= step.afterDays) f = step.factor;
  }
  return f;
}

/**
 * 计算当前实际每日限额。
 *
 * 规则：
 *   - 免费档（target_tier=null）：7 日试用期内每日 200；试用期满后 **0**；
 *   - 付费档：target_daily_limit × warmup factor，但**至少给免费档的 200**，避免
 *     付费用户首日反而比免费档低（D1=30% × 500 = 150 < 200，需兜底）。
 */
export function computeActualDailyLimit(
  t: Pick<TierState, "target_tier" | "target_daily_limit" | "warmup_started_at" | "free_trial_started_at" | "created_at">
): number {
  if (!t.target_tier || !t.target_daily_limit) {
    const ft = evalFreeTrial(t);
    if (ft.isTrialExpired) return 0;
    return TIER_CONFIG.bronze_apprentice.dailyLimit;
  }
  const factor = computeWarmupFactor(t.warmup_started_at);
  const raw = Math.floor(t.target_daily_limit * factor);
  return Math.max(TIER_CONFIG.bronze_apprentice.dailyLimit, raw);
}

// ============================================================
// 数据库读写
// ============================================================

/**
 * 取一个租户的当前等级状态；不存在则按默认 bronze_apprentice 自动初始化（幂等）。
 * 同时把 daily_limit 同步到 computeActualDailyLimit()，避免老数据滞留导致接口与算法不一致。
 */
export async function ensureTierState(db: Pool, tenantId: number): Promise<TierState> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error(`tenantSendTier.ensureTierState: invalid tenantId=${tenantId}`);
  }
  const [rows] = await db.query(
    `SELECT * FROM tenant_send_tier WHERE tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  let row = (rows as TierState[])[0];
  if (!row) {
    await db.query(
      `INSERT IGNORE INTO tenant_send_tier
         (tenant_id, tier, daily_limit, stability_streak_started_at, free_trial_started_at)
       VALUES (?, 'bronze_apprentice', ?, NOW(), NOW())`,
      [tenantId, TIER_CONFIG.bronze_apprentice.dailyLimit]
    );
    const [rows2] = await db.query(
      `SELECT * FROM tenant_send_tier WHERE tenant_id = ? LIMIT 1`,
      [tenantId]
    );
    row = (rows2 as TierState[])[0]!;
  }
  /** 老迁移未写入时：纯免费户补齐试用起算时间，避免永久「未开始试用」 */
  if (!(row as TierState).target_tier && (row as any).free_trial_started_at == null) {
    await db.query(
      `UPDATE tenant_send_tier
          SET free_trial_started_at = COALESCE(created_at, NOW())
        WHERE tenant_id = ?
          AND target_tier IS NULL
          AND free_trial_started_at IS NULL`,
      [tenantId]
    );
    const [rows3] = await db.query(`SELECT * FROM tenant_send_tier WHERE tenant_id = ? LIMIT 1`, [tenantId]);
    row = (rows3 as TierState[])[0]!;
  }
  /** 自我修复：daily_limit 跟 computed 不一致时拉齐（不影响 admin 手动调档，因为 admin
   *  改 daily_limit 也会同时改 target_daily_limit） */
  const computed = computeActualDailyLimit(row);
  if (Math.abs(row.daily_limit - computed) > 0) {
    await db.query(
      `UPDATE tenant_send_tier SET daily_limit = ? WHERE tenant_id = ?`,
      [computed, tenantId]
    );
    row.daily_limit = computed;
  }
  return row;
}

/**
 * 计算"今天还能发多少封"（送达成功，与营销活动统计页口径一致）。
 *
 * daily_limit 是 ensureTierState 已经按 warmup 校准过的值，所以这里不需要再乘 factor。
 */
export async function getRemainingDailyQuota(
  db: Pool,
  tenantId: number
): Promise<{
  limit: number;
  usedToday: number;
  remaining: number;
  isSuspended: boolean;
  suspensionReason: string | null;
  tier: SendTier;
  targetDailyLimit: number | null;
  targetTier: SendTier | null;
}> {
  const t = await ensureTierState(db, tenantId);
  const used = await countTenantDeliveredToday(db, tenantId);
  const licCap = standaloneLicenseDailyCap();
  const limit =
    licCap > 0 && t.daily_limit > 0
      ? Math.min(t.daily_limit, licCap)
      : licCap > 0
        ? licCap
        : Math.max(0, t.daily_limit);
  const remaining = Math.max(0, limit - used);
  return {
    limit,
    usedToday: used,
    remaining,
    isSuspended: !!t.is_suspended,
    suspensionReason: t.suspension_reason ?? null,
    tier: t.tier,
    targetDailyLimit: t.target_daily_limit,
    targetTier: t.target_tier
  };
}

/** 准入检查：在每次"开始发送活动"之前调用 */
export async function checkSendAllowed(
  db: Pool,
  tenantId: number,
  plannedCount: number
): Promise<{ ok: true } | { ok: false; reason: string; code: string }> {
  const t = await ensureTierState(db, tenantId);
  const ft = evalFreeTrial(t);
  if (ft.isFreeOnly && ft.isTrialExpired) {
    return {
      ok: false,
      code: "FREE_TRIAL_EXPIRED",
      reason:
        `凡尘记名试炼（${FREE_TRIAL_DAYS} 天）已结束，无法再使用免费发送额度。请在「个人中心 → 邮件与营销」敕封仙阶套餐后继续群发。`
    };
  }
  if (isSendCircuitBreakerEnforced() && t.is_suspended === 1) {
    const susp = String(t.suspension_reason ?? "");
    if (susp.includes("自动熔断")) {
      await refreshOneTenantAndMaybeBreak(db, tenantId);
    }
  }
  const q = await getRemainingDailyQuota(db, tenantId);
  if (q.isSuspended) {
    const autoCircuit =
      !isSendCircuitBreakerEnforced() &&
      String(q.suspensionReason ?? "").includes("自动熔断");
    if (!autoCircuit) {
      return {
        ok: false,
        code: "TENANT_SUSPENDED",
        reason:
          q.suspensionReason ??
          "您的账号当前邮件发送已暂停（自动熔断或人工冻结）。请清理联系人列表后到「营销活动统计 → 成长计划」申请解封。"
      };
    }
  }
  if (q.remaining <= 0) {
    return {
      ok: false,
      code: "DAILY_LIMIT_REACHED",
      reason: `今日已达本档配额上限（${q.limit} 封/日）。请明日再试或升级套餐。`
    };
  }
  // plannedCount 超出 remaining 由发送循环自然收口，不在这里硬拒
  void plannedCount;
  return { ok: true };
}

// ============================================================
// 订阅 → 等级映射（变现入口）
// ============================================================

/**
 * 用户付费成功后由 emailSubscriptionActivation.ts 调用：
 *   - 设置 target_tier / target_daily_limit
 *   - 重置 warmup_started_at 为 NOW()，从 D1 (30%) 开始释放
 *   - 重置自助解封计数（这是用户的"二次机会"——付了钱给一次重启）
 *   - **不**清掉 is_suspended：被熔断的用户付费后还得自助解封
 *
 * tenantSubscriptionDailyLimit 是 tenant_product_modules.daily_send_limit（套餐目标），
 * 优先用它（因为我们的"试用版"等可能跟 SUBSCRIPTION_TO_TIER 配置漂移）。
 */
export async function setTargetTierFromSubscription(
  db: Pool,
  tenantId: number,
  subscriptionTierId: string,
  tenantSubscriptionDailyLimit: number
): Promise<{ ok: true; tier: SendTier; targetDailyLimit: number } | { ok: false; reason: string }> {
  const tier = SUBSCRIPTION_TO_TIER[subscriptionTierId];
  if (!tier) {
    return {
      ok: false,
      reason: `setTargetTierFromSubscription: 未知套餐 tierId=${subscriptionTierId}`
    };
  }
  const target = Math.max(1, Math.floor(tenantSubscriptionDailyLimit));
  await ensureTierState(db, tenantId);
  /**
   * 同档复购（续费/换月）的处理：如果用户已经在该 target_tier，**不**重置 warmup
   * 否则用户每月续费一次都要重新走预热，体验灾难。
   * 升档 / 降档 / 首次付费都重置 warmup 锚点。
   */
  await db.query(
    `UPDATE tenant_send_tier
        SET target_tier = ?,
            target_daily_limit = ?,
            warmup_started_at = CASE
              WHEN target_tier IS NULL OR target_tier <> ? THEN NOW()
              ELSE warmup_started_at
            END,
            warmup_reset_count = CASE
              WHEN target_tier IS NULL OR target_tier <> ? THEN 0
              ELSE warmup_reset_count
            END,
            self_unsuspend_count = 0,
            stability_streak_started_at = COALESCE(stability_streak_started_at, NOW()),
            last_promoted_at = NOW()
      WHERE tenant_id = ?`,
    [tier, target, tier, tier, tenantId]
  );
  /** 立刻把 daily_limit 拉到当前 warmup factor 对应值；ensureTierState 会做这件事 */
  await ensureTierState(db, tenantId);
  return { ok: true, tier, targetDailyLimit: target };
}

// ============================================================
// 熔断引擎（每分钟扫一次）
// ============================================================

export async function refreshAllTenantHealthAndCircuitBreakers(db: Pool): Promise<{
  scanned: number;
  newlySuspended: number;
  warmupResets: number;
}> {
  const [tenantRows] = await db.query(
    `SELECT DISTINCT tenant_id FROM email_campaigns WHERE tenant_id > 0`
  );
  const ids = (tenantRows as Array<{ tenant_id: number }>).map((r) => Number(r.tenant_id)).filter(Boolean);
  let newlySuspended = 0;
  let warmupResets = 0;
  for (const tenantId of ids) {
    try {
      const r = await refreshOneTenantAndMaybeBreak(db, tenantId);
      if (r === "suspended") newlySuspended += 1;
      else if (r === "warmup_reset") warmupResets += 1;
    } catch (e) {
      console.warn("[tenantSendTier] refresh failed for tenant", tenantId, (e as Error)?.message);
    }
  }
  return { scanned: ids.length, newlySuspended, warmupResets };
}

export async function refreshOneTenantAndMaybeBreak(
  db: Pool,
  tenantId: number
): Promise<"ok" | "suspended" | "warmup_reset" | "circuit_recovered"> {
  const t = await ensureTierState(db, tenantId);
  const enforceCircuit = isSendCircuitBreakerEnforced();

  if (!enforceCircuit) {
    const susp = String(t.suspension_reason ?? "");
    if (t.is_suspended === 1 && susp.includes("自动熔断")) {
      await db.query(
        `UPDATE tenant_send_tier
            SET is_suspended = 0,
                suspension_reason = NULL,
                suspended_at = NULL
          WHERE tenant_id = ?`,
        [tenantId]
      );
    }
  }

  const metricOpts = { includeEndedCampaigns: !enforceCircuit };
  const win100 = await aggregateWindow(db, tenantId, 100, t.circuit_window_floor_at ?? null, metricOpts);
  const win1000 = await aggregateWindow(db, tenantId, 1000, t.circuit_window_floor_at ?? null, metricOpts);

  if (!enforceCircuit) {
    await db.query(
      `UPDATE tenant_send_tier
          SET recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
              recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
              last_metric_refresh_at = NOW()
        WHERE tenant_id = ?`,
      [
        win100.attempted, win100.bounced, win100.complaint,
        win1000.attempted, win1000.bounced, win1000.complaint,
        tenantId
      ]
    );
    await ensureTierState(db, tenantId);
    return "ok";
  }

  const breach100 =
    win100.attempted > 0 &&
    (win100.bounced / win100.attempted >= CIRCUIT_BREAKER_THRESHOLDS.recent100.bounceRate ||
      win100.complaint / win100.attempted >= CIRCUIT_BREAKER_THRESHOLDS.recent100.complaintRate);
  const breach1000 =
    win1000.attempted >= 200 &&
    (win1000.bounced / win1000.attempted >= CIRCUIT_BREAKER_THRESHOLDS.recent1000.bounceRate ||
      win1000.complaint / win1000.attempted >= CIRCUIT_BREAKER_THRESHOLDS.recent1000.complaintRate);
  const shouldSuspend = breach100 || breach1000;

  // === 0. 已「自动熔断」但当前窗口已不再触红线 → 自动解除（如已结束活动不再计入样本）
  if (t.is_suspended === 1 && !shouldSuspend) {
    const susp = String(t.suspension_reason ?? "");
    if (susp.includes("自动熔断")) {
      await db.query(
        `UPDATE tenant_send_tier
            SET is_suspended = 0,
                suspension_reason = NULL,
                suspended_at = NULL,
                circuit_window_floor_at = NOW(),
                recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
                recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
                last_metric_refresh_at = NOW()
          WHERE tenant_id = ? AND is_suspended = 1`,
        [
          win100.attempted, win100.bounced, win100.complaint,
          win1000.attempted, win1000.bounced, win1000.complaint,
          tenantId
        ]
      );
      await ensureTierState(db, tenantId);
      return "circuit_recovered";
    }
  }

  // === 1. 红线 → 熔断（暂停发送）或刷新已熔断账号的快照与提示文案 ===
  if (shouldSuspend) {
    const reason = buildBreakReason(win100, win1000);
    if (t.is_suspended === 0) {
      const [r] = await db.query(
        `UPDATE tenant_send_tier
            SET is_suspended = 1,
                suspension_reason = ?,
                suspended_at = COALESCE(suspended_at, NOW()),
                stable_days = 0,
                stability_streak_started_at = NULL,
                recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
                recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
                last_metric_refresh_at = NOW()
          WHERE tenant_id = ? AND is_suspended = 0`,
        [
          reason,
          win100.attempted, win100.bounced, win100.complaint,
          win1000.attempted, win1000.bounced, win1000.complaint,
          tenantId
        ]
      );
      return Number((r as any)?.affectedRows ?? 0) > 0 ? "suspended" : "ok";
    }
    const sr = t.suspension_reason == null ? "" : String(t.suspension_reason);
    const keepManualReason = sr.length > 0 && !sr.includes("自动熔断");
    await db.query(
      `UPDATE tenant_send_tier
          SET suspension_reason = ?,
              recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
              recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
              last_metric_refresh_at = NOW()
        WHERE tenant_id = ? AND is_suspended = 1`,
      [
        keepManualReason ? sr : reason,
        win100.attempted, win100.bounced, win100.complaint,
        win1000.attempted, win1000.bounced, win1000.complaint,
        tenantId
      ]
    );
    await ensureTierState(db, tenantId);
    return "ok";
  }

  /** 人工冻结等：仍暂停时不做预热重置，只同步「最近 N 封」快照 */
  if (t.is_suspended === 1) {
    await db.query(
      `UPDATE tenant_send_tier
          SET recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
              recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
              last_metric_refresh_at = NOW()
        WHERE tenant_id = ? AND is_suspended = 1`,
      [
        win100.attempted, win100.bounced, win100.complaint,
        win1000.attempted, win1000.bounced, win1000.complaint,
        tenantId
      ]
    );
    await ensureTierState(db, tenantId);
    return "ok";
  }

  // === 2. 黄线 → 重置预热进度（只对付费档生效，免费档无意义）===
  const warmupBreach100 =
    win100.attempted > 0 &&
    (win100.bounced / win100.attempted >= WARMUP_RESET_THRESHOLDS.recent100.bounceRate ||
      win100.complaint / win100.attempted >= WARMUP_RESET_THRESHOLDS.recent100.complaintRate);
  const warmupBreach1000 =
    win1000.attempted >= 100 &&
    (win1000.bounced / win1000.attempted >= WARMUP_RESET_THRESHOLDS.recent1000.bounceRate ||
      win1000.complaint / win1000.attempted >= WARMUP_RESET_THRESHOLDS.recent1000.complaintRate);
  const shouldResetWarmup =
    t.target_tier != null &&
    t.warmup_started_at != null &&
    (warmupBreach100 || warmupBreach1000) &&
    /** 防抖：上次重置不到 6 小时不重复 reset，否则一旦健康率徘徊就连续 reset */
    (!t.warmup_started_at || Date.now() - new Date(t.warmup_started_at).getTime() > 6 * 3600 * 1000);

  if (shouldResetWarmup) {
    await db.query(
      `UPDATE tenant_send_tier
          SET warmup_started_at = NOW(),
              warmup_reset_count = warmup_reset_count + 1,
              recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
              recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
              last_metric_refresh_at = NOW()
        WHERE tenant_id = ?`,
      [
        win100.attempted, win100.bounced, win100.complaint,
        win1000.attempted, win1000.bounced, win1000.complaint,
        tenantId
      ]
    );
    /** 拉齐 daily_limit：刚 reset 后 factor=0.30，daily_limit 立即降下来 */
    await ensureTierState(db, tenantId);
    return "warmup_reset";
  }

  // === 3. 一切正常：写回最新指标即可 ===
  await db.query(
    `UPDATE tenant_send_tier
        SET recent_attempted_100 = ?, recent_bounce_100 = ?, recent_complaint_100 = ?,
            recent_attempted_1000 = ?, recent_bounce_1000 = ?, recent_complaint_1000 = ?,
            last_metric_refresh_at = NOW()
      WHERE tenant_id = ?`,
    [
      win100.attempted, win100.bounced, win100.complaint,
      win1000.attempted, win1000.bounced, win1000.complaint,
      tenantId
    ]
  );
  /** 拉齐 daily_limit（如果时间走过预热节点 D3/D7/D14，这里把 200/300/500 顶上去） */
  await ensureTierState(db, tenantId);
  return "ok";
}

/** 成长计划 / 面板：按与熔断相同的窗口规则聚合最近 N 封（含打开数）。 */
export async function queryTenantSendWindow(
  db: Pool,
  tenantId: number,
  windowSize: number
): Promise<{ attempted: number; bounced: number; complaint: number; opened: number }> {
  const t = await ensureTierState(db, tenantId);
  const includeEnded = !isSendCircuitBreakerEnforced();
  return aggregateWindow(db, tenantId, windowSize, t.circuit_window_floor_at ?? null, {
    includeEndedCampaigns: includeEnded
  });
}

async function aggregateWindow(
  db: Pool,
  tenantId: number,
  windowSize: number,
  /** 仅统计此时间之后的发件；NULL 表示不按时间裁剪。 */
  circuitFloorAt: Date | string | null,
  opts?: { includeEndedCampaigns?: boolean }
): Promise<{ attempted: number; bounced: number; complaint: number; opened: number }> {
  const floor = circuitFloorAt == null ? null : circuitFloorAt;
  const campaignFilter = opts?.includeEndedCampaigns
    ? ""
    : `AND LOWER(TRIM(COALESCE(c.status, ''))) NOT IN ('completed', 'stopped')`;
  const [rows] = await db.query(
    `SELECT
        COUNT(*) AS attempted,
        SUM(CASE WHEN x.status = 'failed' THEN 1
                 WHEN EXISTS (
                   SELECT 1 FROM email_delivery_events e
                    WHERE e.email_send_id = x.id AND e.event_type = 'bounced'
                 ) THEN 1
                 ELSE 0 END) AS bounced,
        SUM(CASE WHEN EXISTS (
                   SELECT 1 FROM email_delivery_events e
                    WHERE e.email_send_id = x.id AND e.event_type = 'complaint'
                 ) THEN 1 ELSE 0 END) AS complaint,
        SUM(CASE WHEN EXISTS (
                   SELECT 1 FROM email_delivery_events e
                    WHERE e.email_send_id = x.id AND e.event_type = 'opened'
                 ) THEN 1 ELSE 0 END) AS opened
       FROM (
         SELECT es.id, es.status
           FROM email_sends es
           JOIN email_campaigns c ON c.id = es.campaign_id
          WHERE c.tenant_id = ?
            ${campaignFilter}
            AND (? IS NULL OR es.created_at >= ?)
          ORDER BY es.id DESC
          LIMIT ?
       ) AS x`,
    [tenantId, floor, floor, windowSize]
  );
  const r = (rows as Array<{ attempted: unknown; bounced: unknown; complaint: unknown; opened: unknown }>)[0] ?? {};
  return {
    attempted: Number(r.attempted ?? 0),
    bounced: Number(r.bounced ?? 0),
    complaint: Number(r.complaint ?? 0),
    opened: Number(r.opened ?? 0)
  };
}

function buildBreakReason(
  w100: { attempted: number; bounced: number; complaint: number },
  w1000: { attempted: number; bounced: number; complaint: number }
): string {
  const parts: string[] = [];
  if (w100.attempted > 0) {
    const br = (w100.bounced / w100.attempted * 100).toFixed(1);
    const cr = (w100.complaint / w100.attempted * 100).toFixed(2);
    parts.push(`最近 ${w100.attempted} 封：退信率 ${br}%、投诉率 ${cr}%`);
  }
  if (w1000.attempted >= 200) {
    const br = (w1000.bounced / w1000.attempted * 100).toFixed(1);
    const cr = (w1000.complaint / w1000.attempted * 100).toFixed(2);
    parts.push(`最近 ${w1000.attempted} 封：退信率 ${br}%、投诉率 ${cr}%`);
  }
  return `自动熔断：${parts.join("；")}。请清理联系人列表（移除已退信地址 / 检查邮箱有效性 / 检查模板内容）后申请解封。`;
}

// ============================================================
// 解封 / 强制设档
// ============================================================

export async function selfUnsuspendIfEligible(
  db: Pool,
  tenantId: number
): Promise<{ ok: boolean; reason?: string }> {
  const t = await ensureTierState(db, tenantId);
  if (!t.is_suspended) return { ok: true };
  if (t.self_unsuspend_count >= 1) {
    return { ok: false, reason: "您已使用过一次自助解封。再次解封需联系客服或管理员人工审核。" };
  }
  await db.query(
    `UPDATE tenant_send_tier
        SET is_suspended = 0,
            suspension_reason = NULL,
            suspended_at = NULL,
            self_unsuspend_count = self_unsuspend_count + 1,
            stability_streak_started_at = NOW(),
            warmup_started_at = NOW(),
            circuit_window_floor_at = NOW()
      WHERE tenant_id = ?`,
    [tenantId]
  );
  await ensureTierState(db, tenantId);
  return { ok: true };
}

export async function adminForceUnsuspend(db: Pool, tenantId: number, note?: string): Promise<void> {
  await db.query(
    `UPDATE tenant_send_tier
        SET is_suspended = 0,
            suspension_reason = NULL,
            suspended_at = NULL,
            stability_streak_started_at = NOW(),
            circuit_window_floor_at = NOW()
      WHERE tenant_id = ?`,
    [tenantId]
  );
  void note;
}

/**
 * 管理端：把熔断统计的「窗口起点」推到此刻（circuit_window_floor_at），并立刻跑一轮
 * refreshOneTenantAndMaybeBreak 写回最近 100/1000 快照。
 *
 * - 当前为**自动熔断**时：一并解除暂停、清空原因，并将 self_unsuspend_count 归零（便于重新统计后用户仍有一次自助解封机会）。
 * - **人工冻结**等：只移动窗口并刷新指标，不解除暂停。
 */
export async function adminResetSendCircuitWindowForRecalc(
  db: Pool,
  tenantId: number,
  opts?: { forceUnsuspend?: boolean }
): Promise<{ refresh: "ok" | "suspended" | "warmup_reset" | "circuit_recovered" }> {
  await ensureTierState(db, tenantId);
  const t = await ensureTierState(db, tenantId);
  const susp = String(t.suspension_reason ?? "");
  const isAutoSuspend = t.is_suspended === 1 && susp.includes("自动熔断");

  if (opts?.forceUnsuspend) {
    /** 管理端「强制」：解除任意暂停原因，并清零自助解封计数，避免界面仍显示「次数已用尽」 */
    await db.query(
      `UPDATE tenant_send_tier
          SET is_suspended = 0,
              suspension_reason = NULL,
              suspended_at = NULL,
              self_unsuspend_count = 0,
              stability_streak_started_at = NOW(),
              circuit_window_floor_at = NOW()
        WHERE tenant_id = ?`,
      [tenantId]
    );
  } else if (isAutoSuspend) {
    await db.query(
      `UPDATE tenant_send_tier
          SET is_suspended = 0,
              suspension_reason = NULL,
              suspended_at = NULL,
              self_unsuspend_count = 0,
              stability_streak_started_at = NOW(),
              circuit_window_floor_at = NOW()
        WHERE tenant_id = ?`,
      [tenantId]
    );
  } else {
    await db.query(
      `UPDATE tenant_send_tier
          SET circuit_window_floor_at = NOW()
        WHERE tenant_id = ?`,
      [tenantId]
    );
  }

  const refresh = await refreshOneTenantAndMaybeBreak(db, tenantId);
  return { refresh };
}

export async function adminSetTier(db: Pool, tenantId: number, tier: SendTier): Promise<void> {
  await ensureTierState(db, tenantId);
  await db.query(
    `UPDATE tenant_send_tier
        SET tier = ?,
            target_tier = ?,
            target_daily_limit = ?,
            daily_limit = ?,
            last_promoted_at = NOW(),
            warmup_started_at = NOW()
      WHERE tenant_id = ?`,
    [tier, tier, TIER_CONFIG[tier].dailyLimit, TIER_CONFIG[tier].dailyLimit, tenantId]
  );
}

// ============================================================
// 给 /api/email/ses/tier 端点用的成长计划数据
// ============================================================

export interface WarmupStageInfo {
  /** d1 / d3 / d7 / fully-open / free */
  stage: "free" | "d1" | "d3" | "d7" | "fully-open";
  stageLabel: string;
  factor: number;
  currentLimit: number;
  targetLimit: number;
  daysSinceStart: number | null;
  /** 距下一节点还差几天；fully-open / free 时为 null */
  daysUntilNextStage: number | null;
  nextStageLabel: string | null;
}

export interface UpgradeRecommendation {
  /** 用户应该考虑买的下一档（紧邻当前 target_tier） */
  tier: SendTier;
  label: string;
  emoji: string;
  dailyLimit: number;
  subscriptionTierId: string;
  monthlyPriceUsd: number;
}

export interface GrowthPlanState {
  warmup: WarmupStageInfo;
  /** 当前的"温和异常"指标是否触发了预热重置（用户已经感知，但还没熔断） */
  warmupResetCount: number;
  /** 凡尘记名免费档 7 日试用状态（付费用户 isFreeOnly=false） */
  freeTrial: FreeTrialState;
  /** 推荐购买的下一档；已在最高档时为 null；凡尘记名默认跳过游仙（500）直推灵仙（1000） */
  upgrade: UpgradeRecommendation | null;
  /** 全档列表，方便前端铺一行卡片选购 */
  ladder: Array<{
    tier: SendTier;
    label: string;
    emoji: string;
    dailyLimit: number;
    subscriptionTierId: string | null;
    monthlyPriceUsd: number | null;
    shortNote: string;
    isCurrent: boolean;
    isFree: boolean;
  }>;
}

/**
 * 从当前「敕封位」沿阶梯找下一档。
 * 凡尘记名（免费）递进到下一档时跳过游仙（500）与灵仙（1000），与可售档位一致。
 */
function nextUpgradeTierAfter(from: SendTier): SendTier | null {
  const idx = TIER_LADDER.indexOf(from);
  if (idx < 0) return null;
  let i = idx + 1;
  while (i < TIER_LADDER.length) {
    const cand = TIER_LADDER[i]!;
    if (from === "bronze_apprentice" && (cand === "silver" || cand === "gold")) {
      i += 1;
      continue;
    }
    return cand;
  }
  return null;
}

export function evalGrowthPlan(t: TierState): GrowthPlanState {
  const warmup = computeWarmupStageInfo(t);

  /** 找 target_tier 在 ladder 里的下一档（凡尘 → 跳过游仙） */
  const currentTargetTier = t.target_tier ?? "bronze_apprentice";
  const nextTier = nextUpgradeTierAfter(currentTargetTier);
  const nextDef = nextTier ? TIER_CONFIG[nextTier] : null;
  const upgrade: UpgradeRecommendation | null =
    nextDef && nextDef.subscriptionTierId && nextDef.monthlyPriceUsd != null
      ? {
          tier: nextTier!,
          label: nextDef.label,
          emoji: nextDef.emoji,
          dailyLimit: nextDef.dailyLimit,
          subscriptionTierId: nextDef.subscriptionTierId,
          monthlyPriceUsd: nextDef.monthlyPriceUsd
        }
      : null;

  const ladder = TIER_LADDER.filter((id) => id !== "bronze_apprentice" && id !== "gold").map((id) => {
    const cfg = TIER_CONFIG[id];
    return {
      tier: id,
      label: cfg.label,
      emoji: cfg.emoji,
      dailyLimit: cfg.dailyLimit,
      subscriptionTierId: cfg.subscriptionTierId,
      monthlyPriceUsd: cfg.monthlyPriceUsd,
      shortNote: cfg.shortNote,
      isCurrent: id === currentTargetTier,
      isFree: cfg.subscriptionTierId == null
    };
  });

  return {
    warmup,
    warmupResetCount: t.warmup_reset_count,
    freeTrial: evalFreeTrial(t),
    upgrade,
    ladder
  };
}

function computeWarmupStageInfo(t: TierState): WarmupStageInfo {
  if (!t.target_tier || !t.target_daily_limit || !t.warmup_started_at) {
    /** 凡尘记名：未敕封付费档时不走预热曲线 */
    return {
      stage: "free",
      stageLabel: "凡尘记名",
      factor: 1.0,
      currentLimit: TIER_CONFIG.bronze_apprentice.dailyLimit,
      targetLimit: TIER_CONFIG.bronze_apprentice.dailyLimit,
      daysSinceStart: null,
      daysUntilNextStage: null,
      nextStageLabel: null
    };
  }
  const days = (Date.now() - new Date(t.warmup_started_at).getTime()) / 86_400_000;
  let curIdx = 0;
  for (let i = 0; i < WARMUP_CURVE.length; i++) {
    if (days >= WARMUP_CURVE[i]!.afterDays) curIdx = i;
  }
  const cur = WARMUP_CURVE[curIdx]!;
  const next = WARMUP_CURVE[curIdx + 1] ?? null;
  const stage: WarmupStageInfo["stage"] = next == null ? "fully-open" : (["d1", "d3", "d7"][curIdx] as any) ?? "d1";
  const currentLimit = Math.max(
    TIER_CONFIG.bronze_apprentice.dailyLimit,
    Math.floor(t.target_daily_limit * cur.factor)
  );
  return {
    stage,
    stageLabel: cur.label,
    factor: cur.factor,
    currentLimit,
    targetLimit: t.target_daily_limit,
    daysSinceStart: days,
    daysUntilNextStage: next ? Math.max(0, next.afterDays - days) : null,
    nextStageLabel: next ? next.label : null
  };
}
