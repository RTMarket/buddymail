import React, { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { useAuth } from "../../auth/AuthContext";
import { apiJson } from "../../lib/api";

type TierWindow = {
  attempted: number;
  bounced: number;
  complaint: number;
  opened: number;
  delivered: number;
};

type TierStatus = {
  ok: boolean;
  tier: string;
  tierLabel: string;
  tierEmoji?: string;
  targetTier: string | null;
  targetTierLabel: string | null;
  dailyLimit: number;
  targetDailyLimit: number | null;
  usedToday: number;
  remainingToday: number;
  isSuspended: boolean;
  suspensionReason: string | null;
  circuitBreakerEnforced: boolean;
  selfUnsuspendUsed: boolean;
  violationStrikeCount: number;
  windowRecent100: TierWindow;
  windowRecent1000: TierWindow;
  growthPlan?: {
    warmup?: {
      stage: string;
      stageLabel: string;
      factor: number;
      currentLimit: number;
      targetLimit: number;
    };
    warmupResetCount?: number;
  };
};

const STR = {
  zh: {
    title: "运维模式健康度管理",
    subtitle: "送达运维自动化：用一套规则守住你的发信信誉",
    opsMode: "运维模式",
    opsOn: "已开启",
    opsOff: "已关闭",
    opsOnDesc:
      "系统将执行健康度规则：预热配额限流、退信/投诉熔断、黑名单监控。超标前预警，超标后自动熔断止损。",
    opsOffDesc:
      "您已关闭送达运维保护，发送行为不受健康度规则约束，IP / 域名信誉风险自负。线路烧坏后可在后台 5 分钟更换域名 / IP。",
    opsOnNote: "开启运维模式建议先完成反向解析（PTR）、SPF、DKIM、DMARC 配置，可通过年度套餐申请开通。",
    healthNow: "实时健康度",
    tier: "当前档位",
    targetTier: "购买档位",
    dailyLimit: "今日发送上限（含预热折扣）",
    used: "今日已用",
    remaining: "今日剩余",
    bounce100: "近 100 封退信率",
    bounce1000: "近 1000 封退信率",
    complaint100: "近 100 封投诉率",
    complaint1000: "近 1000 封投诉率",
    circuit: "熔断状态",
    normal: "正常",
    suspended: "已熔断暂停",
    enforced: "熔断执行中",
    notEnforced: "仅统计（未强制熔断）",
    selfUnsuspend: "自助解封（仅限一次）",
    unsuspending: "解封中…",
    unsuspendOk: "已解封，发送已恢复。",
    unsuspendFail: "解封失败，请稍后重试或联系管理员。",
    warmupPlan: "预热计划（自动排期）",
    warmupNow: "当前预热阶段",
    warmupResetCount: "预热被重置次数",
    warmupStages: ["D1 预热（30%）", "D3 加速（50%）", "D7 提速（80%）", "D14 完全开放（100%）"],
    warmupRule: "运维模式下预热配额由系统强制执行：新线路按上述曲线逐步放量，到期自动开放，无需人工记忆。",
    circuitRules: "熔断规则",
    ruleBounce: "退信率红线",
    ruleComplaint: "投诉率红线",
    ruleRecent100: "近 100 封",
    ruleRecent1000: "近 1000 封",
    ruleYellow: "黄线（温和异常）：仅重置预热进度、降速保护，不暂停发送。",
    ruleRed: "红线（熔断）：整体暂停发送，需自助解封或管理员处理。",
    sop: "发送 SOP",
    sopBefore: "发送前检查",
    sopBeforeItems: [
      "收件人列表已清洗：硬退、退订、投诉过的地址已移除",
      "主题与正文无典型垃圾词，不过度使用感叹号与全大写",
      "退订链接有效且一键可达",
      "发件域名 SPF / DKIM / DMARC 校验通过",
    ],
    sopAfter: "发送后跟进",
    sopAfterItems: [
      "观察本页健康度：退信率、投诉率接近黄线即降速",
      "触发熔断后先查原因（列表质量 / 内容 / 黑名单），再自助解封",
      "保持打开率：定期清理长期不打开的地址",
    ],
    sopRecover: "线路烧坏恢复",
    sopRecoverItems: [
      "确认黑名单状态，评估该线路是否值得挽救",
      "后台 5 分钟更换域名 / 发信 IP / 解析 IP",
      "新线路自动进入预热计划（D1 30% 起步），并完成反向解析配置",
    ],
    ptrNote: "说明：运维模式的价值建立在正确的基础配置上。反向解析（PTR）需在 VPS 服务商后台设置，可通过年度套餐申请开通；新 IP 仍需按预热计划养信誉，任何工具都无法跳过这一过程。",
    loading: "加载中…",
    loadFail: "健康度数据加载失败，请刷新重试。",
    refresh: "刷新",
  },
  en: {
    title: "Ops Mode Health",
    subtitle: "Deliverability ops automation: guard your sender reputation with one set of rules",
    opsMode: "Ops mode",
    opsOn: "ON",
    opsOff: "OFF",
    opsOnDesc:
      "The system enforces health rules: warmup quota throttling, bounce/complaint circuit breaking, blacklist monitoring. Warns before limits, auto-breaks after.",
    opsOffDesc:
      "Deliverability protection is off. Sending is not constrained by health rules; IP/domain reputation risk is yours. If a line burns out, swap domain/IP in the backend within 5 minutes.",
    opsOnNote: "Ops mode works best with reverse DNS (PTR), SPF, DKIM and DMARC configured. PTR setup is available via the annual plan.",
    healthNow: "Live health",
    tier: "Current tier",
    targetTier: "Purchased tier",
    dailyLimit: "Today's send cap (warmup-adjusted)",
    used: "Used today",
    remaining: "Remaining today",
    bounce100: "Bounce rate (last 100)",
    bounce1000: "Bounce rate (last 1000)",
    complaint100: "Complaint rate (last 100)",
    complaint1000: "Complaint rate (last 1000)",
    circuit: "Circuit breaker",
    normal: "Normal",
    suspended: "Suspended",
    enforced: "Enforcing",
    notEnforced: "Stats only (not enforcing)",
    selfUnsuspend: "Self unsuspend (once only)",
    unsuspending: "Unsuspending…",
    unsuspendOk: "Unsuspended. Sending resumed.",
    unsuspendFail: "Unsuspend failed. Retry later or contact admin.",
    warmupPlan: "Warmup plan (auto-scheduled)",
    warmupNow: "Current warmup stage",
    warmupResetCount: "Warmup resets",
    warmupStages: ["D1 warmup (30%)", "D3 ramp (50%)", "D7 speed-up (80%)", "D14 fully open (100%)"],
    warmupRule: "In ops mode the warmup quota is enforced by the system: new lines ramp along this curve and open automatically. No need to remember.",
    circuitRules: "Circuit breaker rules",
    ruleBounce: "Bounce-rate red line",
    ruleComplaint: "Complaint-rate red line",
    ruleRecent100: "Last 100",
    ruleRecent1000: "Last 1000",
    ruleYellow: "Yellow line (mild): resets warmup progress and slows down only; sending continues.",
    ruleRecent: "",
    ruleRed: "Red line (breaker): pauses all sending until self-unsuspend or admin action.",
    sop: "Sending SOP",
    sopBefore: "Pre-send checklist",
    sopBeforeItems: [
      "List cleaned: hard bounces, unsubscribes and complainers removed",
      "No typical spam trigger words in subject/body; avoid excessive exclamation marks and ALL CAPS",
      "Unsubscribe link works and is one click away",
      "SPF / DKIM / DMARC pass for the sending domain",
    ],
    sopAfter: "Post-send follow-up",
    sopAfterItems: [
      "Watch health here: slow down when bounce/complaint rates approach the yellow line",
      "After a breaker trip, find the cause (list quality / content / blacklist) before self-unsuspending",
      "Protect open rates: regularly prune long-term non-openers",
    ],
    sopRecover: "Burned line recovery",
    sopRecoverItems: [
      "Check blacklist status and decide whether the line is worth saving",
      "Swap domain / sending IP / resolver IP in the backend within 5 minutes",
      "The new line auto-enters the warmup plan (starts at D1 30%) with reverse DNS configured",
    ],
    ptrNote: "Note: ops mode builds on correct base configuration. Reverse DNS (PTR) must be set at your VPS provider and is available via the annual plan; new IPs still need warmup — no tool can skip that.",
    loading: "Loading…",
    loadFail: "Failed to load health data. Please refresh.",
    refresh: "Refresh",
  },
};

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function rate(bounced: number, attempted: number): number {
  if (!attempted || attempted <= 0) return 0;
  return bounced / attempted;
}

export function EmailOpsHealthPage() {
  const { locale } = useSiteLocale();
  const t = locale === "en" ? STR.en : STR.zh;
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? 0;
  const storageKey = `email-ops-mode:${tenantId}`;

  const [opsOn, setOpsOn] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(storageKey);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const [tier, setTier] = useState<TierStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [unsuspending, setUnsuspending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiJson<TierStatus>("/api/email/ses/tier");
      setTier(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleOps = useCallback(() => {
    setOpsOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  const selfUnsuspend = useCallback(async () => {
    setUnsuspending(true);
    setFeedback(null);
    try {
      const r = await apiJson<{ ok: boolean }>("/api/email/ses/tier/self-unsuspend", {
        method: "POST",
      });
      if (r && r.ok) {
        setFeedback(t.unsuspendOk);
        await load();
      } else {
        setFeedback(t.unsuspendFail);
      }
    } catch {
      setFeedback(t.unsuspendFail);
    } finally {
      setUnsuspending(false);
    }
  }, [load, t]);

  const w100 = tier?.windowRecent100;
  const w1000 = tier?.windowRecent1000;

  const statRows = useMemo(() => {
    if (!tier) return [];
    return [
      { label: t.tier, value: `${tier.tierEmoji ?? ""} ${tier.tierLabel}`.trim() },
      { label: t.targetTier, value: tier.targetTierLabel ?? "—" },
      { label: t.dailyLimit, value: String(tier.dailyLimit) },
      { label: t.used, value: String(tier.usedToday) },
      { label: t.remaining, value: String(tier.remainingToday) },
      { label: t.bounce100, value: w100 ? pct(rate(w100.bounced, w100.attempted)) : "—" },
      { label: t.bounce1000, value: w1000 ? pct(rate(w1000.bounced, w1000.attempted)) : "—" },
      { label: t.complaint100, value: w100 ? pct(rate(w100.complaint, w100.attempted)) : "—" },
      { label: t.complaint1000, value: w1000 ? pct(rate(w1000.complaint, w1000.attempted)) : "—" },
    ];
  }, [tier, t, w100, w1000]);

  return (
    <PageShell title={t.title}>
      <p style={{ color: "#666", margin: "0 0 16px" }}>{t.subtitle}</p>

      <SectionCard title={t.opsMode}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={toggleOps}
            aria-pressed={opsOn}
            style={{
              padding: "8px 22px",
              borderRadius: 20,
              border: "1px solid",
              borderColor: opsOn ? "#16a34a" : "#d1d5db",
              background: opsOn ? "#16a34a" : "#f3f4f6",
              color: opsOn ? "#fff" : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {opsOn ? t.opsOn : t.opsOff}
          </button>
          <span style={{ color: "#374151" }}>{opsOn ? t.opsOnDesc : t.opsOffDesc}</span>
        </div>
        {opsOn && (
          <p style={{ color: "#92400e", background: "#fef3c7", padding: "8px 12px", borderRadius: 8, marginTop: 12 }}>
            {t.opsOnNote}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t.healthNow}
      >
        {loading && <div>{t.loading}</div>}
        {loadError && !loading && (
          <div>
            <div style={{ color: "#b91c1c", marginBottom: 8 }}>{t.loadFail}</div>
            <button type="button" onClick={load} style={{ padding: "6px 16px", cursor: "pointer" }}>
              {t.refresh}
            </button>
          </div>
        )}
        {tier && !loading && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {statRows.map((r) => (
                <div
                  key={r.label}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{r.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{r.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>
                {t.circuit}：
                <strong style={{ color: tier.isSuspended ? "#b91c1c" : "#16a34a" }}>
                  {tier.isSuspended ? t.suspended : t.normal}
                </strong>
              </span>
              <span style={{ color: "#6b7280", fontSize: 13 }}>
                ({tier.circuitBreakerEnforced ? t.enforced : t.notEnforced})
              </span>
              {tier.isSuspended && tier.suspensionReason && (
                <span style={{ color: "#92400e", fontSize: 13 }}>{tier.suspensionReason}</span>
              )}
              {tier.isSuspended && !tier.selfUnsuspendUsed && (
                <button
                  type="button"
                  onClick={selfUnsuspend}
                  disabled={unsuspending}
                  style={{ padding: "6px 16px", cursor: "pointer" }}
                >
                  {unsuspending ? t.unsuspending : t.selfUnsuspend}
                </button>
              )}
            </div>
            {feedback && <div style={{ marginTop: 8, color: "#374151" }}>{feedback}</div>}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t.warmupPlan}>
        <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
          {t.warmupStages.map((s) => (
            <li key={s} style={{ marginBottom: 4 }}>{s}</li>
          ))}
        </ol>
        {tier?.growthPlan?.warmup && (
          <div style={{ marginBottom: 12, color: "#374151" }}>
            {t.warmupNow}：<strong>{tier.growthPlan.warmup.stageLabel}</strong>
            {typeof tier.growthPlan.warmupResetCount === "number" && tier.growthPlan.warmupResetCount > 0 && (
              <span style={{ marginLeft: 12, color: "#92400e", fontSize: 13 }}>
                {t.warmupResetCount}：{tier.growthPlan.warmupResetCount}
              </span>
            )}
          </div>
        )}
        <p style={{ color: "#4b5563", margin: 0 }}>{t.warmupRule}</p>
      </SectionCard>

      <SectionCard title={t.circuitRules}>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #e5e7eb", padding: 8, textAlign: "left" }}></th>
              <th style={{ border: "1px solid #e5e7eb", padding: 8, textAlign: "left" }}>{t.ruleRecent100}</th>
              <th style={{ border: "1px solid #e5e7eb", padding: 8, textAlign: "left" }}>{t.ruleRecent1000}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{t.ruleBounce}</td>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>8%</td>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>5%</td>
            </tr>
            <tr>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{t.ruleComplaint}</td>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>0.3%</td>
              <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>0.1%</td>
            </tr>
          </tbody>
        </table>
        <p style={{ color: "#4b5563", margin: "12px 0 4px" }}>{t.ruleYellow}</p>
        <p style={{ color: "#4b5563", margin: 0 }}>{t.ruleRed}</p>
      </SectionCard>

      <SectionCard title={t.sop}>
        <h4 style={{ margin: "0 0 8px" }}>{t.sopBefore}</h4>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          {t.sopBeforeItems.map((s) => (
            <li key={s} style={{ marginBottom: 4 }}>{s}</li>
          ))}
        </ul>
        <h4 style={{ margin: "0 0 8px" }}>{t.sopAfter}</h4>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          {t.sopAfterItems.map((s) => (
            <li key={s} style={{ marginBottom: 4 }}>{s}</li>
          ))}
        </ul>
        <h4 style={{ margin: "0 0 8px" }}>{t.sopRecover}</h4>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          {t.sopRecoverItems.map((s) => (
            <li key={s} style={{ marginBottom: 4 }}>{s}</li>
          ))}
        </ul>
        <p style={{ color: "#4b5563", margin: 0 }}>{t.ptrNote}</p>
      </SectionCard>
    </PageShell>
  );
}
