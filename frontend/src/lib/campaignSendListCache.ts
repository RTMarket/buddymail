/** 活动发送名单：tab 分页结果内存缓存（切换 tab / 返回同活动时秒开） */

import type { SendContactRow } from "../ui/components/email/CampaignSendRecipientsTable";

export type CachedSendListPage = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: SendContactRow[];
};

export type CachedTabTotals = {
  all: number;
  opened: number;
  success: number;
  failed: number;
  unconfirmed?: number;
};

/** 与后端 tab-totals 短 TTL 对齐，避免已打开长期落后已订阅 */
const TTL_MS = 90 * 1000;

type Entry<T> = { savedAt: number; payload: T };

const sliceMem = new Map<string, Entry<CachedSendListPage>>();
const totalsMem = new Map<string, Entry<CachedTabTotals>>();

function scopeKey(
  campaignId: number,
  from: string,
  to: string,
  fromEmail: string,
  sendRunId?: number | null
) {
  const fe = fromEmail.trim().toLowerCase() || "__all__";
  const run = Math.floor(Number(sendRunId) || 0);
  return `${campaignId}|${from}|${to}|${fe}|run:${run}`;
}

export function sliceCacheKey(
  campaignId: number,
  tab: string,
  page: number,
  from: string,
  to: string,
  fromEmail: string,
  sendRunId?: number | null
) {
  return `${scopeKey(campaignId, from, to, fromEmail, sendRunId)}|${tab}|${page}`;
}

export function totalsCacheKey(
  campaignId: number,
  from: string,
  to: string,
  fromEmail: string,
  sendRunId?: number | null
) {
  return `${scopeKey(campaignId, from, to, fromEmail, sendRunId)}|totals`;
}

function read<T>(mem: Map<string, Entry<T>>, key: string): T | null {
  const row = mem.get(key);
  if (!row) return null;
  if (Date.now() - row.savedAt > TTL_MS) {
    mem.delete(key);
    return null;
  }
  return row.payload;
}

export function readCachedSlicePage(key: string): CachedSendListPage | null {
  return read(sliceMem, key);
}

export function writeCachedSlicePage(key: string, payload: CachedSendListPage) {
  sliceMem.set(key, { savedAt: Date.now(), payload });
}

export function readCachedTabTotals(key: string): CachedTabTotals | null {
  return read(totalsMem, key);
}

export function writeCachedTabTotals(key: string, payload: CachedTabTotals) {
  totalsMem.set(key, { savedAt: Date.now(), payload });
}

export function invalidateSendListCacheForCampaign(campaignId: number) {
  const prefix = `${campaignId}|`;
  for (const k of sliceMem.keys()) {
    if (k.startsWith(prefix)) sliceMem.delete(k);
  }
  for (const k of totalsMem.keys()) {
    if (k.startsWith(prefix)) totalsMem.delete(k);
  }
}
