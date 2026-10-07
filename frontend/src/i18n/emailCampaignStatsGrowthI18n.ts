import type { SiteLocale } from "./siteLocaleTypes";

export type EmailCampaignStatsGrowthStrings = {
  quotaLoading: string;
  growthLoading: string;
  loadFailed: (err: string) => string;
  retry: string;
  refresh: string;
  todaySent: string;
  planDailyCap: string;
  todayCap: string;
  beijingDay: string;
  warmupReleasing: (actual: string, plan: string) => string;
  remaining: (n: string) => string;
  remainingActual: (n: string) => string;
  warmupTitle: string;
  warmupCurveNote: string;
  warmupReset: (n: number) => string;
  recent1000Title: string;
  successRate: string;
  openRate: string;
  warmupFreeBadge: string;
  warmupFreeText: string;
  warmupD1Badge: (pct: number) => string;
  warmupD1Text: (pct: number, current: string, target: string) => string;
  warmupD3Badge: (pct: number) => string;
  warmupD3Text: (pct: number, current: string, target: string) => string;
  warmupD7Badge: (pct: number) => string;
  warmupD7Text: (pct: number, current: string, target: string) => string;
  warmupOpenBadge: string;
  warmupOpenText: (target: string) => string;
  warmupDefaultBadge: string;
  warmupDefaultText: (current: string, target: string) => string;
  warmupNextD3: (days: number | null) => string | null;
  warmupNextD7: (days: number | null) => string | null;
  warmupNextOpen: (days: number | null) => string | null;
  unknownError: string;
  warmupStepD1: string;
  warmupStepD3: string;
  warmupStepD7: string;
  warmupStepFullyOpen: string;
  warmupHintAfterD1: string;
  warmupHintAfterD3: string;
  warmupHintAfterD7: string;
  warmupNextStage: (label: string) => string;
  recent1000Sample: (n: string) => string;
  recent1000FootnoteCircuit: string;
  recent1000FootnoteStandalone: string;
  suspensionTitleAutoCircuit: string;
  suspensionTitleFrozen: string;
  suspensionTitlePaused: string;
  suspensionBodyPrefix: string;
  suspensionSupportLink: string;
  suspensionBodySuffix: string;
  selfUnsuspendSubmit: string;
  selfUnsuspendBusy: string;
  selfUnsuspendOk: string;
  selfUnsuspendExhausted: string;
  violationStrikeLabel: string;
  violationStrikeCount: (n: number) => string;
  violationStrikeSuffix: string;
  adminCircuitTitle: string;
  adminCircuitDesc: string;
  adminCircuitResetConfirm: (tenantId: number) => string;
  adminCircuitForceConfirm: (tenantId: number) => string;
  adminCircuitForceConfirm2: string;
  adminCircuitForceConfirmLabel: string;
  adminCircuitResetBusy: string;
  adminCircuitResetBtn: string;
  adminCircuitForceBtn: string;
  adminCircuitResetOk: string;
  adminCircuitForceOk: string;
  violationStrikeSep: string;
  confirmDefault: string;
  cancelDefault: string;
};

/** 后端 suspension_reason 目前为中文「自动熔断：…」；兼容未来英文文案 */
export function isAutoCircuitSuspensionReason(reason: string | null | undefined): boolean {
  const r = String(reason ?? "").trim();
  if (!r) return false;
  return r.includes("自动熔断") || /^auto\s*circuit/i.test(r);
}

const TIER_LABEL_EN: Record<string, string> = {
  凡尘记名: "Free sign-up",
  游仙: "Wanderer",
  灵仙: "Spirit immortal",
  真仙: "True immortal",
  玄仙: "Mystic immortal",
  金仙: "Golden immortal",
  大罗: "Daluo",
  混元: "Primordial",
  太乙真君: "Taiyi lord",
  北斗星君: "North star lord",
  南斗星君: "South star lord",
  准圣: "Quasi-sage",
  亚圣: "Near-sage",
  圣王: "Sage king",
  魔尊: "Demon lord",
  道尊: "Dao lord"
};

/** 展示用：去掉历史「见习」后缀；英文 locale 映射已知仙阶名 */
export function displaySendTierLabel(label: string, locale: SiteLocale): string {
  const stripped = label.replace(/\s*见习\s*/g, "").trim();
  if (locale !== "en") return stripped;
  return TIER_LABEL_EN[stripped] ?? stripped;
}

export function getEmailCampaignStatsGrowthStrings(locale: SiteLocale): EmailCampaignStatsGrowthStrings {
  if (locale === "en") {
    return {
      quotaLoading: "Loading send quota…",
      growthLoading: "Loading growth plan…",
      loadFailed: (err) => `Load failed: ${err}`,
      retry: "Retry",
      refresh: "Refresh",
      todaySent: "Sent today / ",
      planDailyCap: "plan daily cap",
      todayCap: "today’s cap",
      beijingDay: "Counted by Beijing calendar day",
      warmupReleasing: (actual, plan) =>
        `Today’s actual cap ${actual} emails (warmup releasing; plan ${plan}/day)`,
      remaining: (n) => `Remaining ${n} emails`,
      remainingActual: (n) => `Remaining ${n} emails (by today’s actual cap)`,
      warmupTitle: "Warmup progress",
      warmupCurveNote:
        "Warmup opens real daily cap in steps 30% → 50% → 80% → 100% to protect deliverability.",
      warmupReset: (n) => `⚠ Warmup was reset ${n} time(s) due to recent poor send quality.`,
      recent1000Title: "Last 1,000 sends",
      successRate: "Success rate ",
      openRate: "Open rate ",
      warmupFreeBadge: "Not on paid warmup",
      warmupFreeText: "Free tier quota; upgrade to start D1 warmup for higher volume.",
      warmupD1Badge: (pct) => `D1 ${pct}%`,
      warmupD1Text: (pct, current, target) =>
        `Warmup D1 at ${pct}% — today ${current} / ${target} emails available.`,
      warmupD3Badge: (pct) => `D3 ${pct}%`,
      warmupD3Text: (pct, current, target) =>
        `Warmup D3 at ${pct}% — today ${current} / ${target} emails available.`,
      warmupD7Badge: (pct) => `D7 ${pct}%`,
      warmupD7Text: (pct, current, target) =>
        `Warmup D7 at ${pct}% — today ${current} / ${target} emails available.`,
      warmupOpenBadge: "100%",
      warmupOpenText: (target) => `Warmup complete — full plan cap ${target} emails/day.`,
      warmupDefaultBadge: "Current",
      warmupDefaultText: (current, target) => `Today ${current} / ${target} emails available.`,
      warmupNextD3: (days) =>
        days != null && days > 0 ? `~${days} day(s) to D3 acceleration` : null,
      warmupNextD7: (days) =>
        days != null && days > 0 ? `~${days} day(s) to D7 speed-up` : null,
      warmupNextOpen: (days) =>
        days != null && days > 0 ? `~${days} day(s) to full open` : null,
      unknownError: "Unknown error",
      warmupStepD1: "D1 warmup (30%)",
      warmupStepD3: "D3 acceleration (50%)",
      warmupStepD7: "D7 speed-up (80%)",
      warmupStepFullyOpen: "D14 full open (100%)",
      warmupHintAfterD1: "After stable D1 warmup, D3 acceleration to 50% unlocks.",
      warmupHintAfterD3: "After stable acceleration, D7 speed-up to 80% unlocks.",
      warmupHintAfterD7: "After stable speed-up, D14 full open to 100% unlocks.",
      warmupNextStage: (label) => `Next stage: ${label}.`,
      recent1000Sample: (n) => `Sample: ${n} messages`,
      recent1000FootnoteCircuit:
        " (excludes completed/stopped campaigns); success rate = accepted sends without bounce; open view rate = opens among delivered; platform may reset warmup or trip circuit on bounce/complaint thresholds.",
      recent1000FootnoteStandalone:
        " (includes recent completed campaigns; reference only in dedicated-lane mode — will not auto-pause sending). Opens require recipients to load the tracking pixel.",
      suspensionTitleAutoCircuit: "Policy hold · auto circuit breaker",
      suspensionTitleFrozen: "Policy hold · account frozen",
      suspensionTitlePaused: "Policy hold · sending paused",
      suspensionBodyPrefix: "Sending is blocked due to quality or risk rules. Use ",
      suspensionSupportLink: "contact support",
      suspensionBodySuffix:
        " with your account and a short note; admins can review against stats on this page.",
      selfUnsuspendSubmit: "Request one-time self-reinstate (once per account)",
      selfUnsuspendBusy: "Submitting…",
      selfUnsuspendOk: "Self-reinstate submitted",
      selfUnsuspendExhausted:
        "Self-reinstate already used — contact support only.",
      violationStrikeLabel: "Violation strikes",
      violationStrikeCount: (n) => `${n}`,
      violationStrikeSuffix:
        " (includes auto circuit trips; same source as Last 1,000 — excludes completed/stopped campaigns)",
      adminCircuitTitle: "Platform admin",
      adminCircuitDesc:
        "Reset circuit stats window to now (only counts sends after) and refresh this page. Default: clears auto circuit and self-reinstate count; manual freeze only moves the window. If UI still shows circuit or exhausted self-reinstate, verify logged-in tenantId or check tenant_send_tier in DB.",
      adminCircuitResetConfirm: (tenantId) =>
        `Reset circuit stats window to now for tenant ${tenantId} and recalculate? (default logic)`,
      adminCircuitForceConfirm: (tenantId) =>
        `Force reinstate clears manual/auto pause and zeros self-reinstate count (tenant ${tenantId}).`,
      adminCircuitForceConfirm2: "If bounce rate is still high, auto circuit may trip again. Continue?",
      adminCircuitForceConfirmLabel: "Confirm force reinstate",
      adminCircuitResetBusy: "Working…",
      adminCircuitResetBtn: "Clear circuit window & recount",
      adminCircuitForceBtn: "Force reinstate & recount",
      adminCircuitResetOk: "Circuit window reset",
      adminCircuitForceOk: "Force reinstate applied and recounted",
      violationStrikeSep: ": ",
      confirmDefault: "Confirm",
      cancelDefault: "Cancel"
    };
  }
  return {
    quotaLoading: "发送配额加载中…",
    growthLoading: "成长计划加载中…",
    loadFailed: (err) => `加载失败：${err}`,
    retry: "重试",
    refresh: "刷新",
    todaySent: "今日已发 / ",
    planDailyCap: "套餐日上限",
    todayCap: "今日可发",
    beijingDay: "按北京时间自然日统计",
    warmupReleasing: (actual, plan) =>
      `今日实际可发 ${actual} 封（预热释放中，套餐为 ${plan} 封/日）`,
    remaining: (n) => `剩余 ${n} 封`,
    remainingActual: (n) => `剩余 ${n} 封（按今日实际可发计算）`,
    warmupTitle: "预热进度",
    warmupCurveNote: "预热曲线按 30% → 50% → 80% → 100% 逐步开放真实可发额度，用于保护平台发信信誉与整体送达率。",
    warmupReset: (n) => `⚠ 因近期发送质量偏低，预热进度已自动重置 ${n} 次。`,
    recent1000Title: "最近 1000 封发送表现",
    successRate: "发送成功率 ",
    openRate: "打开率 ",
    warmupFreeBadge: "未进入付费预热",
    warmupFreeText: "当前为凡尘试炼 / 记名位真实额度；敕封仙阶后，将从 D1 预热开始逐步开放更高发送量。",
    warmupD1Badge: (pct) => `D1 ${pct}%`,
    warmupD1Text: (pct, current, target) =>
      `预先进入预热 D1 ${pct}%，今日已开放 ${current} / ${target} 封。`,
    warmupD3Badge: (pct) => `D3 ${pct}%`,
    warmupD3Text: (pct, current, target) =>
      `当前处于 D3 加速 ${pct}%，今日已开放 ${current} / ${target} 封。`,
    warmupD7Badge: (pct) => `D7 ${pct}%`,
    warmupD7Text: (pct, current, target) =>
      `当前处于 D7 提速 ${pct}%，今日已开放 ${current} / ${target} 封。`,
    warmupOpenBadge: "100%",
    warmupOpenText: (target) => `预热已完成，当前已开放套餐全部额度：${target} 封/日。`,
    warmupDefaultBadge: "真实进度",
    warmupDefaultText: (current, target) => `当前真实可发额度为 ${current} / ${target} 封。`,
    warmupNextD3: (days) => (days != null && days > 0 ? `约 ${days} 天后进入 D3 加速` : null),
    warmupNextD7: (days) => (days != null && days > 0 ? `约 ${days} 天后进入 D7 提速` : null),
    warmupNextOpen: (days) => (days != null && days > 0 ? `约 ${days} 天后完全开放` : null),
    unknownError: "未知错误",
    warmupStepD1: "D1 预热（30%）",
    warmupStepD3: "D3 加速（50%）",
    warmupStepD7: "D7 提速（80%）",
    warmupStepFullyOpen: "D14 完全开放（100%）",
    warmupHintAfterD1: "在第一阶段预热稳定后，可实现 D3 加速 50%。",
    warmupHintAfterD3: "在加速阶段发送质量稳定后，可实现 D7 提速 80%。",
    warmupHintAfterD7: "在提速阶段发送质量稳定后，可实现 D14 完全开放 100%。",
    warmupNextStage: (label) => `下一阶段：${label}。`,
    recent1000Sample: (n) => `数据样本 ${n} 封`,
    recent1000FootnoteCircuit:
      "（不含已结束 / 已停止活动）；发送成功率按「已发出且未退信」计；打开查看率为成功送达中的打开占比；平台仍按退信/投诉红线做预热重置与熔断。",
    recent1000FootnoteStandalone:
      "（含近期已结束活动的发件记录；独立专线模式下仅作参考，不会自动暂停发送）。打开率需收件人加载邮件内追踪像素。",
    suspensionTitleAutoCircuit: "违规提示 · 自动熔断",
    suspensionTitleFrozen: "违规提示 · 账户冻结",
    suspensionTitlePaused: "违规提示 · 发送已暂停",
    suspensionBodyPrefix: "因发送质量或风控规则，当前不可群发。请通过",
    suspensionSupportLink: "私信客服",
    suspensionBodySuffix:
      "说明情况（注明账号与简要说明即可），管理员在后台「站内私信」中可见并与本页质量数据对照处理。",
    selfUnsuspendSubmit: "申请自助解封（每账号仅一次）",
    selfUnsuspendBusy: "提交中…",
    selfUnsuspendOk: "自助解封已提交",
    selfUnsuspendExhausted: "自助解封次数已用尽，请仅通过私信客服联系管理员处理。",
    violationStrikeLabel: "违规处置累计",
    violationStrikeCount: (n) => `${n} 次`,
    violationStrikeSuffix:
      "（含系统自动熔断次数；与上方「最近 1000 封」同源：不含已结束或已停止的活动）",
    adminCircuitTitle: "平台管理员",
    adminCircuitDesc:
      "将熔断统计起点重置为当前时刻（仅统计此后发送），并立即重算本页数据。默认：自动熔断会解除并清零自助解封次数；仅人工冻结时只移动统计窗口。若界面仍显示熔断或「自助解封用尽」，多半是当前登录租户的 tenantId 与预期不一致，请用第二条「强制」或直接在库里核对 tenant_send_tier。",
    adminCircuitResetConfirm: (tenantId) =>
      `确认将租户 ${tenantId} 的熔断统计窗口重置为现在并立即重算？（默认逻辑）`,
    adminCircuitForceConfirm: (tenantId) =>
      `「强制解除暂停」将同时清除人工/自动暂停原因，并把自助解封次数清零（租户 ${tenantId}）。`,
    adminCircuitForceConfirm2: "若随后真实退信率仍超标，系统会再次自动熔断。确定吗？",
    adminCircuitForceConfirmLabel: "确认强制解除",
    adminCircuitResetBusy: "处理中…",
    adminCircuitResetBtn: "清空熔断窗口并重新统计",
    adminCircuitForceBtn: "强制解除暂停并重算",
    adminCircuitResetOk: "熔断窗口已重置",
    adminCircuitForceOk: "已强制解除暂停并重算",
    violationStrikeSep: "：",
    confirmDefault: "确认",
    cancelDefault: "取消"
  };
}
