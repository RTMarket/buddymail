/** QQ 数字邮箱生成（纯前端 · 不校验是否真实存在） */

export type QqDigitLength = 8 | 9 | 10;

export const QQ_DIGIT_OPTIONS: ReadonlyArray<{
  digits: QqDigitLength;
  theoryCount: number;
  theoryLabelZh: string;
}> = [
  { digits: 8, theoryCount: 100_000_000, theoryLabelZh: "1 亿" },
  { digits: 9, theoryCount: 1_000_000_000, theoryLabelZh: "10 亿" },
  { digits: 10, theoryCount: 10_000_000_000, theoryLabelZh: "100 亿" }
];

export const QQ_GENERATE_COUNT_OPTIONS = [50, 100, 500, 1000, 5000] as const;
export type QqGenerateCount = (typeof QQ_GENERATE_COUNT_OPTIONS)[number];

const QQ_DOMAIN = "@qq.com";

function randomIntInclusive(min: number, max: number): number {
  const span = max - min + 1;
  if (span <= 0) return min;
  const buf = new Uint32Array(1);
  // 拒绝采样，避免 % 偏差
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return min + (x % span);
}

/** 生成恰好 digits 位的数字串（允许前导 0，与理论空间 10^n 一致） */
export function randomQqLocalPart(digits: QqDigitLength): string {
  if (digits === 10) {
    // Number 安全整数上限约 9e15；10 位用两段拼接避免精度问题
    const high = randomIntInclusive(0, 99);
    const low = randomIntInclusive(0, 99_999_999);
    return `${String(high).padStart(2, "0")}${String(low).padStart(8, "0")}`;
  }
  const max = 10 ** digits - 1;
  return String(randomIntInclusive(0, max)).padStart(digits, "0");
}

export function toQqEmail(localPart: string): string {
  return `${localPart}${QQ_DOMAIN}`;
}

/** 批量生成不重复邮箱；若理论空间不足则返回已有全部 */
export function generateUniqueQqEmails(digits: QqDigitLength, count: number): string[] {
  const theory = 10 ** digits;
  const target = Math.min(Math.max(0, Math.floor(count)), theory);
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  const maxGuard = Math.max(target * 20, target + 1000);
  while (out.length < target && guard < maxGuard) {
    guard += 1;
    const email = toQqEmail(randomQqLocalPart(digits));
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function emailsToCsv(emails: string[]): string {
  const lines = ["email", ...emails];
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function dripIntervalMs(total: number): number {
  if (total <= 50) return 28;
  if (total <= 100) return 16;
  if (total <= 500) return 6;
  if (total <= 1000) return 3;
  return 1;
}
