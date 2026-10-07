import {
  buildCsvColumnMappingFromHeaders,
  matchCsvHeaderToCrmField,
  type CsvColumnMappingSnapshot
} from "./crmContactImportColumns";
import { detectCsvDelimiter, parseCsv } from "./csvParse";

export type { CsvColumnMappingSnapshot } from "./crmContactImportColumns";
export { CRM_CONTACT_IMPORT_COLUMNS, crmImportColumnLabel } from "./crmContactImportColumns";

/** 与 Leads 搜索邮箱校验语义一致 */
export type ContactEmailStatus = "valid" | "invalid" | "risky" | "unverified" | "none";

export type ImportContactPayload = {
  email: string;
  company?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  industry?: string;
  phone?: string;
  fax?: string;
  address?: string;
  jobTitle?: string;
  website?: string;
  mainBusiness?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  /** 列表展示用，提交 API 时不传 */
  groupNames?: string;
  emailStatus?: ContactEmailStatus;
};

function parseEmailStatusCell(raw: string): ContactEmailStatus | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (lower === "valid" || t.includes("有效")) return "valid";
  if (lower === "invalid" || t.includes("无效")) return "invalid";
  if (lower === "risky" || t.includes("风险")) return "risky";
  if (lower === "unverified" || t.includes("未验") || t.includes("未验证")) return "unverified";
  return undefined;
}

function simpleEmailValid(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/** 与后端 contactCreateSchema 的 email 校验尽量一致，减少导入请求被拒 */
export function isEmailValidForApiImport(email: string): boolean {
  const t = email.trim();
  if (!simpleEmailValid(t)) return false;
  if (t.length > 254) return false;
  const at = t.indexOf("@");
  if (at <= 0 || at >= t.length - 1) return false;
  const domain = t.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/** 去重比较用：小写 + 去首尾空格（不改变提交 API 时的原始邮箱字符串） */
export function normalizeImportContactEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** 同一列表内按邮箱去重，保留首次出现的行（A、B、C 重复时只保留 A） */
export function dedupeImportContactsByEmail(contacts: ImportContactPayload[]): {
  contacts: ImportContactPayload[];
  skippedDuplicate: number;
} {
  const seen = new Set<string>();
  const out: ImportContactPayload[] = [];
  let skippedDuplicate = 0;
  for (const row of contacts) {
    const key = normalizeImportContactEmailKey(row.email);
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return { contacts: out, skippedDuplicate };
}

const EMPTY_MAPPING: CsvColumnMappingSnapshot = { recognized: [], ignored: [] };

/** 解析结果摘要（用于选文件后一行展示） */
export function describeCsvParseOutcome(o: {
  dataRowCount: number;
  validCount: number;
  skippedEmptyEmail: number;
  skippedInvalidEmail: number;
  skippedDuplicateEmail: number;
}): string {
  const skipTotal = o.skippedEmptyEmail + o.skippedInvalidEmail + o.skippedDuplicateEmail;
  const skips: string[] = [];
  if (o.skippedEmptyEmail > 0) skips.push(`无邮箱 ${o.skippedEmptyEmail}`);
  if (o.skippedInvalidEmail > 0) skips.push(`无效邮箱 ${o.skippedInvalidEmail}`);
  if (o.skippedDuplicateEmail > 0) skips.push(`重复去重 ${o.skippedDuplicateEmail}`);
  let s = `共 ${o.dataRowCount} 行数据 → 将导入 ${o.validCount} 条`;
  if (skips.length > 0) {
    s += `（已跳过 ${skipTotal} 行：${skips.join("、")}）`;
  }
  return s;
}

/**
 * 从 CSV 文本解析可提交到 /api/email/contacts/import 的联系人列表。
 * 首行为表头：按 CRM 中英列名对齐；未识别列整列忽略；表头行本身不作为数据导入。
 */
export function parseImportContactsFromCsvText(text: string): {
  contacts: ImportContactPayload[];
  error: string | null;
  /** 数据行总数（不含表头） */
  dataRowCount: number;
  /** 邮箱列为空而跳过的行数 */
  skippedEmptyEmail: number;
  /** 有邮箱内容但格式不合法而跳过的行数 */
  skippedInvalidEmail: number;
  /** 同一 CSV 内重复邮箱而去掉的行数（保留首次出现） */
  skippedDuplicateEmail: number;
  columnMapping: CsvColumnMappingSnapshot;
} {
  const delim = detectCsvDelimiter(text);
  const grid = parseCsv(text, delim);
  if (!grid.length) {
    return {
      contacts: [],
      error: "文件为空或无法解析。",
      dataRowCount: 0,
      skippedEmptyEmail: 0,
      skippedInvalidEmail: 0,
      skippedDuplicateEmail: 0,
      columnMapping: EMPTY_MAPPING
    };
  }
  const dataRowCount = Math.max(0, grid.length - 1);
  const headerCells = grid[0].map((c) => c.trim());
  const columnMapping = buildCsvColumnMappingFromHeaders(headerCells);

  const colIndex = new Map<keyof ImportContactPayload, number>();
  const contactFullCol: number[] = [];
  const emailStatusCols: number[] = [];

  for (let i = 0; i < headerCells.length; i++) {
    const head = headerCells[i] ?? "";
    const hit = matchCsvHeaderToCrmField(head);
    if (!hit) continue;
    if (hit.kind === "emailStatus") {
      emailStatusCols.push(i);
      continue;
    }
    if (hit.kind === "contactFullName") {
      contactFullCol.push(i);
      continue;
    }
    if (hit.field !== "emailStatus" && !colIndex.has(hit.field)) {
      colIndex.set(hit.field, i);
    }
  }

  if (!colIndex.has("email")) {
    return {
      contacts: [],
      error:
        "未找到邮箱列。请确认首行表头含「邮箱 / Email」等字样；Excel 请「另存为」CSV UTF-8。无邮箱或无效邮箱的行不会录入。",
      dataRowCount,
      skippedEmptyEmail: 0,
      skippedInvalidEmail: 0,
      skippedDuplicateEmail: 0,
      columnMapping
    };
  }

  const contacts: ImportContactPayload[] = [];
  let skippedEmptyEmail = 0;
  let skippedInvalidEmail = 0;
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const emailIdx = colIndex.get("email")!;
    const email = String(cells[emailIdx] ?? "").trim();
    if (!email) {
      skippedEmptyEmail++;
      continue;
    }
    if (!simpleEmailValid(email)) {
      skippedInvalidEmail++;
      continue;
    }

    const pick = (f: keyof ImportContactPayload): string | undefined => {
      const j = colIndex.get(f);
      if (j === undefined) return undefined;
      const v = String(cells[j] ?? "").trim();
      return v || undefined;
    };

    const row: ImportContactPayload = { email };
    const company = pick("company");
    const country = pick("country");
    const firstName = pick("firstName");
    const lastName = pick("lastName");
    const industry = pick("industry");
    const phone = pick("phone");
    const fax = pick("fax");
    const address = pick("address");
    const jobTitle = pick("jobTitle");
    const website = pick("website");
    const mainBusiness = pick("mainBusiness");
    const linkedin = pick("linkedin");
    const instagram = pick("instagram");
    const facebook = pick("facebook");
    if (company) row.company = company;
    if (country) row.country = country;
    if (firstName) row.firstName = firstName;
    if (lastName) row.lastName = lastName;
    if (industry) row.industry = industry;
    if (phone) row.phone = phone;
    if (fax) row.fax = fax;
    if (address) row.address = address;
    if (jobTitle) row.jobTitle = jobTitle;
    if (website) row.website = website;
    if (mainBusiness) row.mainBusiness = mainBusiness;
    if (linkedin) row.linkedin = linkedin;
    if (instagram) row.instagram = instagram;
    if (facebook) row.facebook = facebook;

    if (contactFullCol.length > 0) {
      const j = contactFullCol[0];
      const full = String(cells[j] ?? "").trim();
      if (full) {
        const parts = full.split(/\s+/).filter(Boolean);
        if (parts.length === 1) row.firstName = parts[0];
        else {
          row.firstName = parts[0];
          row.lastName = parts.slice(1).join(" ");
        }
      }
    }

    if (emailStatusCols.length > 0) {
      const raw = String(cells[emailStatusCols[0]] ?? "").trim();
      const parsed = parseEmailStatusCell(raw);
      if (parsed) row.emailStatus = parsed;
    } else {
      row.emailStatus = "unverified";
    }

    contacts.push(row);
  }

  const { contacts: dedupedContacts, skippedDuplicate } = dedupeImportContactsByEmail(contacts);

  if (!dedupedContacts.length) {
    return {
      contacts: [],
      error: "没有有效数据行（需至少一行含合法邮箱）。",
      dataRowCount,
      skippedInvalidEmail,
      skippedEmptyEmail,
      skippedDuplicateEmail: skippedDuplicate,
      columnMapping
    };
  }
  return {
    contacts: dedupedContacts,
    error: null,
    dataRowCount,
    skippedEmptyEmail,
    skippedInvalidEmail,
    skippedDuplicateEmail: skippedDuplicate,
    columnMapping
  };
}
