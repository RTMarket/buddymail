import { apiJson } from "./api";
import { notifyEmailContactsChanged } from "./emailCrmContactsSync";

/** 每批条数：单次 /api/email/contacts/import 处理过久易触发 Nginx 默认超时（502/504），保持较小批次 */
export const CONTACTS_IMPORT_HTTP_BATCH_SIZE = 80;
const CONTACTS_IMPORT_FETCH_TIMEOUT_MS = 120_000;
const CONTACTS_IMPORT_RETRY = 3;
const CONTACTS_IMPORT_MIN_BATCH_SIZE = 1;

type ContactImportBody = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  country?: string;
  industry?: string;
  phone?: string;
  jobTitle?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  emailStatus?: string;
  businessLine?: string;
  groupIds?: number[];
};

export type ContactsImportProgress = {
  completed: number;
  total: number;
};

type ContactsImportOptions = {
  batchSize?: number;
  onProgress?: (p: ContactsImportProgress) => void;
  startIndex?: number;
  totalCount?: number;
  continueOnSingleFailure?: boolean;
  onSkipped?: (p: { skipped: number; total: number }) => void;
};

export class ContactsImportPartialError extends Error {
  readonly completed: number;
  readonly total: number;
  readonly nextIndex: number;
  readonly __contactsImportPartial = true;

  constructor(message: string, completed: number, total: number, nextIndex: number) {
    super(message);
    this.name = "ContactsImportPartialError";
    this.completed = completed;
    this.total = total;
    this.nextIndex = nextIndex;
  }
}

export function isContactsImportPartialError(e: unknown): e is ContactsImportPartialError {
  return Boolean(e && typeof e === "object" && (e as { __contactsImportPartial?: unknown }).__contactsImportPartial);
}

/** 将联系人分批 POST 到 import 接口，避免大批量一次请求超时 */
export async function postContactsImportBatches(
  contacts: ContactImportBody[],
  options?: ContactsImportOptions
): Promise<number> {
  const base = Math.max(0, Number(options?.startIndex ?? 0) || 0);
  const total = Math.max(base, Number(options?.totalCount ?? base + contacts.length) || base + contacts.length);
  const batchSize = Math.max(1, Number(options?.batchSize ?? CONTACTS_IMPORT_HTTP_BATCH_SIZE) || CONTACTS_IMPORT_HTTP_BATCH_SIZE);
  let completed = base;
  let skipped = 0;
  const report = (delta: number) => {
    completed += delta;
    options?.onProgress?.({ completed, total });
  };
  options?.onProgress?.({ completed: base, total });
  const reportSkipped = (delta: number) => {
    skipped += delta;
    options?.onSkipped?.({ skipped, total });
  };

  for (let i = 0; i < contacts.length; i += batchSize) {
    const slice = contacts.slice(i, i + batchSize);
    try {
      await postContactsImportAdaptive(slice, report, {
        continueOnSingleFailure: Boolean(options?.continueOnSingleFailure),
        reportSkipped
      });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      throw new ContactsImportPartialError(msg, completed, total, completed);
    }
  }
  if (completed > base) {
    notifyEmailContactsChanged({
      emails: contacts.map((c) => c.email),
      source: "contacts-import-batch"
    });
  }
  return completed;
}

type ImportOnceResult = { imported: number; rejected: number };

async function postContactsImportAdaptive(
  contacts: ContactImportBody[],
  report: (delta: number) => void,
  opts: { continueOnSingleFailure: boolean; reportSkipped: (delta: number) => void }
): Promise<number> {
  if (contacts.length === 0) return 0;
  try {
    const { imported, rejected } = await postContactsImportOnce(contacts);
    const processed = Math.max(0, imported) + Math.max(0, rejected);
    report(processed > 0 ? processed : contacts.length);
    if (rejected > 0) opts.reportSkipped(rejected);
    return imported;
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    const timeoutLike = /HTTP 502|HTTP 504|网关超时/i.test(msg);
    // 若是网关超时且当前批次 >1，自动拆成更小批次继续，直到最小单条。
    if (timeoutLike && contacts.length > CONTACTS_IMPORT_MIN_BATCH_SIZE) {
      const mid = Math.floor(contacts.length / 2);
      const left = contacts.slice(0, mid);
      const right = contacts.slice(mid);
      const leftCount = await postContactsImportAdaptive(left, report, opts);
      const rightCount = await postContactsImportAdaptive(right, report, opts);
      return leftCount + rightCount;
    }
    if (opts.continueOnSingleFailure && contacts.length === CONTACTS_IMPORT_MIN_BATCH_SIZE) {
      opts.reportSkipped(1);
      report(1);
      return 0;
    }
    throw e;
  }
}

async function postContactsImportOnce(contacts: ContactImportBody[]): Promise<ImportOnceResult> {
  let r: { ok: boolean; imported: number; rejected?: number } | null = null;
  let lastError: unknown = null;
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), CONTACTS_IMPORT_FETCH_TIMEOUT_MS);
  try {
    for (let attempt = 1; attempt <= CONTACTS_IMPORT_RETRY; attempt++) {
      try {
        r = await apiJson<{ ok: boolean; imported: number; rejected?: number }>("/api/email/contacts/import", {
          method: "POST",
          body: JSON.stringify({ contacts }),
          signal: ac.signal
        });
        lastError = null;
        break;
      } catch (e: unknown) {
        lastError = e;
        if (attempt >= CONTACTS_IMPORT_RETRY) break;
        const msg = String((e as Error)?.message ?? e);
        if (!/HTTP 502|HTTP 504|网关超时|请求超时|AbortError/i.test(msg)) break;
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 1200));
      }
    }
  } finally {
    window.clearTimeout(timer);
  }
  if (!r) throw lastError ?? new Error("邮箱导入失败");
  return {
    imported: Number(r.imported ?? 0),
    rejected: Number(r.rejected ?? 0)
  };
}
