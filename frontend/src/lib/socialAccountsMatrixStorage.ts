import type { SocialPlatformId } from "../ui/components/social/SocialPlatformLogo";

export const ALL_PLATFORM_IDS: SocialPlatformId[] = [
  "xiaohongshu",
  "douyin",
  "channels",
  "kuaishou",
  "tiktok",
  "instagram",
  "facebook",
  "linkedin"
];

const STORAGE_KEY = "bss_social_accounts_matrix_v1";

/** 与账号管理页同步：其它页读取授权昵称用 */
export const ACCOUNTS_MATRIX_CHANGED_EVENT = "bss-accounts-matrix-changed";

export type ConnStatus = "online" | "not_logged_in" | "disconnected";

export type NetworkEnv = {
  vendor: string;
  profileId: string;
  region: string;
  apiToken: string;
  remark: string;
};

export type AuthSlot =
  | { status: "empty" }
  | { status: "authorized"; nickname: string; connStatus: ConnStatus; env: NetworkEnv };

export function emptyEnv(): NetworkEnv {
  return { vendor: "", profileId: "", region: "", apiToken: "", remark: "" };
}

export function createInitialMatrix(): Record<SocialPlatformId, AuthSlot[]> {
  const m = {} as Record<SocialPlatformId, AuthSlot[]>;
  ALL_PLATFORM_IDS.forEach((id) => {
    m[id] = [{ status: "empty" }];
  });
  return m;
}

function isAuthSlot(x: unknown): x is AuthSlot {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.status === "empty") return true;
  if (o.status === "authorized" && typeof o.nickname === "string" && o.env && typeof o.env === "object") {
    return true;
  }
  return false;
}

export function loadSocialAccountsMatrix(): Record<SocialPlatformId, AuthSlot[]> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const out = {} as Record<SocialPlatformId, AuthSlot[]>;
    for (const id of ALL_PLATFORM_IDS) {
      const rows = (parsed as Record<string, unknown>)[id];
      if (!Array.isArray(rows)) return null;
      const slots = rows.map((cell) => (isAuthSlot(cell) ? cell : null));
      if (slots.some((s) => s == null)) return null;
      out[id] = slots as AuthSlot[];
    }
    return out;
  } catch {
    return null;
  }
}

export function saveSocialAccountsMatrix(matrix: Record<SocialPlatformId, AuthSlot[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
  } catch {
    /* ignore quota */
  }
}

/** 发布中心圆圈上：平台 + 序号缩写，如 红1、抖2 */
export const PLATFORM_SLOT_ABBR: Record<SocialPlatformId, string> = {
  xiaohongshu: "红",
  douyin: "抖",
  channels: "视",
  kuaishou: "快",
  linkedin: "领",
  instagram: "IG",
  tiktok: "TT",
  facebook: "FB"
};

export function slotDisplayNickname(
  matrix: Record<SocialPlatformId, AuthSlot[]>,
  platformId: SocialPlatformId,
  slotIndex: number
): string {
  const row = matrix[platformId];
  if (!row || slotIndex < 0 || slotIndex >= row.length) return "—";
  const slot = row[slotIndex];
  if (slot.status === "empty") return "未授权";
  return slot.nickname.trim() || "—";
}
