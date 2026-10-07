import type { Pool } from "mysql2/promise";
import { loadCampaignEngagementSummary } from "./campaignEngagementStats.js";
import { loadCampaignSendTabTotalsStatsPanel } from "./campaignSendContactsList.js";
import { invalidateCampaignPanelStatsCache } from "./campaignPanelStatsCache.js";
import { invalidateCampaignSendListCache } from "./campaignSendContactsCache.js";
import { invalidateTenantRangeStatsCache } from "./tenantRangeStatsCache.js";

export type StatsSelfHealStep = {
  step: string;
  ok: boolean;
  ms?: number;
  detail?: string;
};

export type StatsSelfHealResult = {
  ok: boolean;
  tenantId: number;
  campaignId: number | null;
  steps: StatsSelfHealStep[];
};

async function timedStep(step: string, fn: () => void | Promise<void>): Promise<StatsSelfHealStep> {
  const t0 = Date.now();
  try {
    await fn();
    return { step, ok: true, ms: Date.now() - t0 };
  } catch (e: unknown) {
    return { step, ok: false, ms: Date.now() - t0, detail: String((e as Error)?.message ?? e) };
  }
}

async function assertCampaignTenantScope(
  db: Pool,
  tenantId: number,
  campaignId: number
): Promise<StatsSelfHealStep> {
  const [rows] = await db.query(`SELECT tenant_id FROM email_campaigns WHERE id = ? LIMIT 1`, [campaignId]);
  const campTenantId = Number((rows as { tenant_id?: unknown }[])[0]?.tenant_id ?? 0);
  if (!campTenantId) {
    return { step: "campaign_scope", ok: false, detail: "活动不存在" };
  }
  if (campTenantId !== tenantId) {
    return { step: "campaign_scope", ok: false, detail: "无权操作该活动（仅限本独立站当前租户）" };
  }
  return { step: "campaign_scope", ok: true, detail: `campaignId=${campaignId}` };
}

/** 独立站统计页：仅清当前租户/活动服务端缓存并做 lite 探测，不执行 shell、不跨租户 */
export async function runCampaignStatsSelfHeal(
  db: Pool,
  opts: { tenantId: number; campaignId?: number | null }
): Promise<StatsSelfHealResult> {
  const steps: StatsSelfHealStep[] = [];
  const tenantId = Math.floor(Number(opts.tenantId) || 0);
  const campaignId =
    opts.campaignId != null && Number.isFinite(Number(opts.campaignId))
      ? Math.floor(Number(opts.campaignId))
      : 0;

  if (tenantId <= 0) {
    steps.push({ step: "tenant_scope", ok: false, detail: "未识别租户" });
    return { ok: false, tenantId, campaignId: campaignId > 0 ? campaignId : null, steps };
  }
  steps.push({ step: "tenant_scope", ok: true, detail: `tenantId=${tenantId}` });

  steps.push(
    await timedStep("db_ping", async () => {
      await db.query("SELECT 1 AS ok");
    })
  );

  if (campaignId > 0) {
    const scope = await assertCampaignTenantScope(db, tenantId, campaignId);
    steps.push(scope);
    if (!scope.ok) {
      return { ok: false, tenantId, campaignId, steps };
    }
  }

  steps.push(
    await timedStep("invalidate_tenant_range_cache", () => {
      invalidateTenantRangeStatsCache(tenantId);
    })
  );

  if (campaignId > 0) {
    steps.push(
      await timedStep("invalidate_panel_cache", () => {
        invalidateCampaignPanelStatsCache(campaignId);
      })
    );
    steps.push(
      await timedStep("invalidate_send_list_cache", () => {
        invalidateCampaignSendListCache(campaignId);
      })
    );
    steps.push(
      await timedStep("probe_tab_totals_lite", async () => {
        const totals = await loadCampaignSendTabTotalsStatsPanel(db, campaignId, null, {
          fromY: "",
          toY: "",
          fromEmail: "all"
        });
        if (!totals || typeof totals !== "object") {
          throw new Error("tab-totals lite 无返回");
        }
      })
    );
    steps.push(
      await timedStep("probe_engagement_lite", async () => {
        const summary = await loadCampaignEngagementSummary(db, campaignId, {
          sendRange: { clause: "", params: [] },
          subRange: { clause: "", params: [] },
          fromClause: "",
          fromParams: [],
          unsubRange: { clause: "", params: [] },
          evtRange: { clause: "", params: [] }
        });
        if (!summary || typeof summary !== "object") {
          throw new Error("engagement lite 无返回");
        }
      })
    );
  }

  const ok = steps.every((s) => s.ok);
  return { ok, tenantId, campaignId: campaignId > 0 ? campaignId : null, steps };
}
