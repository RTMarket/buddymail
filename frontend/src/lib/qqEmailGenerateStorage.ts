import type { QqDigitLength, QqGenerateCount } from "./qqEmailGenerate";

const STORAGE_KEY = "bss_qq_email_generate_v1";

export type QqVerifyStatusStored = "valid" | "invalid" | "unverified";

export type QqEmailGeneratePersisted = {
  v: 1;
  updatedAt: string;
  digits: QqDigitLength;
  count: QqGenerateCount;
  generated: string[];
  validEmails: string[];
  showValidOnly: boolean;
  validCount: number;
  invalidCount: number;
  unverifiedCount: number;
  verifyMsg: string | null;
  verifyProgress: { done: number; total: number };
  /** email → 检验结果，用于换页后继续验未检的 */
  verifyByEmail: Record<string, QqVerifyStatusStored>;
};

function isDigitLength(n: unknown): n is QqDigitLength {
  return n === 8 || n === 9 || n === 10;
}

function isGenCount(n: unknown): n is QqGenerateCount {
  return n === 50 || n === 100 || n === 500 || n === 1000 || n === 5000;
}

export function loadQqEmailGenerateState(): QqEmailGeneratePersisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<QqEmailGeneratePersisted>;
    if (obj?.v !== 1 || !Array.isArray(obj.generated)) return null;
    const generated = obj.generated.map((x) => String(x)).filter(Boolean).slice(0, 5000);
    const validEmails = Array.isArray(obj.validEmails)
      ? obj.validEmails.map((x) => String(x)).filter(Boolean).slice(0, 5000)
      : [];
    const verifyByEmail =
      obj.verifyByEmail && typeof obj.verifyByEmail === "object" ? { ...obj.verifyByEmail } : {};
    return {
      v: 1,
      updatedAt: String(obj.updatedAt ?? ""),
      digits: isDigitLength(obj.digits) ? obj.digits : 10,
      count: isGenCount(obj.count) ? obj.count : 50,
      generated,
      validEmails,
      showValidOnly: Boolean(obj.showValidOnly),
      validCount: Math.max(0, Number(obj.validCount ?? validEmails.length) || 0),
      invalidCount: Math.max(0, Number(obj.invalidCount ?? 0) || 0),
      unverifiedCount: Math.max(0, Number(obj.unverifiedCount ?? 0) || 0),
      verifyMsg: obj.verifyMsg == null ? null : String(obj.verifyMsg),
      verifyProgress: {
        done: Math.max(0, Number(obj.verifyProgress?.done ?? 0) || 0),
        total: Math.max(0, Number(obj.verifyProgress?.total ?? generated.length) || 0)
      },
      verifyByEmail
    };
  } catch {
    return null;
  }
}

export function saveQqEmailGenerateState(state: Omit<QqEmailGeneratePersisted, "v" | "updatedAt">): void {
  try {
    const payload: QqEmailGeneratePersisted = {
      v: 1,
      updatedAt: new Date().toISOString(),
      digits: state.digits,
      count: state.count,
      generated: state.generated.slice(0, 5000),
      validEmails: state.validEmails.slice(0, 5000),
      showValidOnly: state.showValidOnly,
      validCount: state.validCount,
      invalidCount: state.invalidCount,
      unverifiedCount: state.unverifiedCount,
      verifyMsg: state.verifyMsg,
      verifyProgress: state.verifyProgress,
      verifyByEmail: state.verifyByEmail
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearQqEmailGenerateState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
