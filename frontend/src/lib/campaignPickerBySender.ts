import { apiJson } from "./api";

export type CampaignPickerRow = {
  id: number;
  campaign_code?: string | null;
  name?: string;
  status?: string | null;
  template_name?: string | null;
  template_id?: number | null;
  recipient_count?: number | null;
  sent_count?: number;
  failed_count?: number;
  attempts_count?: number;
  has_sent?: boolean;
  latest_round_no?: number;
};

function normEmail(email: string): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

type SentPickerCandidate = {
  has_sent?: boolean;
  attempts_count?: number | null;
  sent_count?: number | null;
  status?: string | null;
};

/** 是否已有发送记录（统计页右侧活动 ID 下拉用） */
export function campaignHasSendHistory(x: SentPickerCandidate): boolean {
  const st = String(x.status ?? "").toLowerCase();
  if (st === "sending") return true;
  if (x.has_sent === true) return true;
  if (Number(x.attempts_count ?? 0) > 0) return true;
  if (Number(x.sent_count ?? 0) > 0) return true;
  if (st === "completed" || st === "stopped" || st === "paused") return true;
  return false;
}

/** 营销发信等：优先展示已有发送记录的活动；若全无已发则回退整表 */
export function pickSentCampaignPickerPool<T extends SentPickerCandidate>(items: T[]): T[] {
  const sent = items.filter(campaignHasSendHistory);
  return sent.length > 0 ? sent : items;
}

/** 统计页活动 ID 下拉：仅已发送过的活动；未发过的绝不出现 */
export function statsCampaignPickerPool<T extends SentPickerCandidate>(items: T[]): T[] {
  return items.filter(campaignHasSendHistory);
}

type StatsPickerSortable = {
  id: number;
  last_send_id?: number | null;
  attempts_count?: number | null;
};

/** 按最近一封 email_sends 排序（勿用内部 id：旧活动复用后 id 小但刚发过，如 929667→id=13） */
export function sortStatsCampaignPickerByRecentActivity<T extends StatsPickerSortable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const la = Math.max(0, Math.floor(Number(a.last_send_id ?? 0)));
    const lb = Math.max(0, Math.floor(Number(b.last_send_id ?? 0)));
    if (lb !== la) return lb - la;
    const aa = Math.max(0, Math.floor(Number(a.attempts_count ?? 0)));
    const bb = Math.max(0, Math.floor(Number(b.attempts_count ?? 0)));
    if (bb !== aa) return bb - aa;
    return b.id - a.id;
  });
}

/** 统计页默认活动：该发信域下最近有发送记录的一场 */
export function pickDefaultStatsCampaignId<T extends StatsPickerSortable>(items: T[]): number | null {
  if (!items.length) return null;
  const sorted = sortStatsCampaignPickerByRecentActivity(items);
  return sorted[0]?.id ?? null;
}

function mergeCampaignPickerRows(lists: CampaignPickerRow[][]): CampaignPickerRow[] {
  const byId = new Map<number, CampaignPickerRow>();
  for (const list of lists) {
    for (const row of list) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, row);
        continue;
      }
      byId.set(id, {
        ...prev,
        ...row,
        has_sent: prev.has_sent === true || row.has_sent === true
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

function campaignRowStillSendable(row: CampaignPickerRow): boolean {
  return !(row.has_sent === true && String(row.status ?? "").toLowerCase() !== "sending");
}

/**
 * 专线发信栏：优先展示可再发的活动，再补最近已发（网格里已发不可点）。
 */
export function buildLaneFormalSendPickerPool(
  rows: CampaignPickerRow[],
  maxPool = 24
): CampaignPickerRow[] {
  const limit = Math.max(6, Math.floor(maxPool));
  const unsent = rows.filter(campaignRowStillSendable).sort((a, b) => b.id - a.id);
  const sent = rows.filter((r) => !campaignRowStillSendable(r)).sort((a, b) => b.id - a.id);
  const out: CampaignPickerRow[] = [];
  for (const r of unsent) {
    if (out.length >= limit) break;
    out.push(r);
  }
  for (const r of sent) {
    if (out.length >= limit) break;
    if (out.some((x) => x.id === r.id)) continue;
    out.push(r);
  }
  return out;
}

function pickerItemsFromResponse(res: { items?: CampaignPickerRow[] } | null | undefined): CampaignPickerRow[] {
  return Array.isArray(res?.items) ? res.items! : [];
}

/** 合并全局 / 未发 / 按发信域筛选的 picker 列表（单路失败不拖垮整表） */
export async function fetchCampaignPickerMerged(
  fromEmails: string[],
  opts?: { includeUnsent?: boolean; includeGlobal?: boolean }
): Promise<CampaignPickerRow[]> {
  const emails = [...new Set(fromEmails.map(normEmail).filter(Boolean))];
  const urls: string[] = [];
  if (opts?.includeGlobal !== false) {
    urls.push("/api/email/campaigns?picker=1");
  }
  if (opts?.includeUnsent !== false) {
    urls.push("/api/email/campaigns?picker=1&unsentOnly=true");
  }
  for (const fe of emails) {
    urls.push(`/api/email/campaigns?picker=1&fromEmail=${encodeURIComponent(fe)}`);
  }
  if (urls.length === 0) {
    urls.push("/api/email/campaigns?picker=1");
  }

  const settled = await Promise.allSettled(
    urls.map((url) => apiJson<{ ok?: boolean; items?: CampaignPickerRow[] }>(url))
  );
  const lists: CampaignPickerRow[][] = [];
  for (const row of settled) {
    if (row.status === "fulfilled") {
      lists.push(pickerItemsFromResponse(row.value));
    }
  }
  if (lists.length === 0) {
    throw new Error("活动列表加载失败，请检查网络或刷新页面");
  }
  return mergeCampaignPickerRows(lists);
}

export function mapCampaignPickerRowsToLaneOptions(
  rows: CampaignPickerRow[]
): Array<{
  id: number;
  campaign_code: string | null;
  name: string;
  status: string | null;
  recipient_count: number | null;
  has_sent: boolean;
}> {
  return rows.map((x) => ({
    id: Number(x.id),
    campaign_code: x.campaign_code ?? null,
    name: String(x.name ?? ""),
    status: x.status ?? null,
    recipient_count: x.recipient_count == null ? null : Number(x.recipient_count),
    has_sent: x.has_sent === true
  }));
}
