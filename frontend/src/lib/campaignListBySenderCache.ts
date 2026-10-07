/** 按发信邮箱缓存活动列表，切换邮箱时先展示上次结果 */

const mem = new Map<string, unknown[]>();

function norm(email: string) {
  return email.trim().toLowerCase();
}

export function readCampaignListBySender<T>(fromEmail: string): T[] | null {
  const k = norm(fromEmail);
  if (!k) return null;
  if (!mem.has(k)) return null;
  return mem.get(k) as T[];
}

/** 区分「未拉取过」与「已拉取但为空列表」 */
export function hasCampaignListCacheForSender(fromEmail: string): boolean {
  const k = norm(fromEmail);
  return k.length > 0 && mem.has(k);
}

export function writeCampaignListBySender<T>(fromEmail: string, items: T[]) {
  const k = norm(fromEmail);
  if (!k) return;
  /** 勿缓存空列表，避免一次失败/旧接口后一直「共 0 条」直到关页 */
  if (!Array.isArray(items) || items.length === 0) {
    mem.delete(k);
    return;
  }
  mem.set(k, items);
}

export function clearCampaignListBySenderCache(fromEmail?: string) {
  if (fromEmail != null && String(fromEmail).trim()) {
    mem.delete(norm(fromEmail));
    return;
  }
  mem.clear();
}
