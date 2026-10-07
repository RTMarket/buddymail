/** CRM 联系人库可导入字段（与 CrmContactsDatabasePage 列一致 + 国家） */
export type CrmImportScalarField =
  | "email"
  | "company"
  | "country"
  | "firstName"
  | "lastName"
  | "industry"
  | "phone"
  | "fax"
  | "address"
  | "jobTitle"
  | "website"
  | "mainBusiness"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "emailStatus";

export type CrmContactImportColumnDef = {
  field: CrmImportScalarField | "contactFullName";
  titleZh: string;
  titleEn: string;
  /** 营销页 CSV 导入必填列 */
  required?: boolean;
  aliases: string[];
};

/** 表头匹配用：小写、去 BOM/空格 */
export function normalizeCsvHeaderCell(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export const CRM_CONTACT_IMPORT_COLUMNS: CrmContactImportColumnDef[] = [
  {
    field: "email",
    titleZh: "邮箱",
    titleEn: "Email",
    required: true,
    aliases: [
      "邮箱",
      "email",
      "e-mail",
      "mail",
      "电子邮箱",
      "郵箱",
      "电邮",
      "email address",
      "e-mail address",
      "work email",
      "business email",
      "primary email",
      "contact email",
      "电子邮件",
      "邮件地址",
      "工作邮箱",
      "电子邮箱地址"
    ]
  },
  {
    field: "industry",
    titleZh: "行业",
    titleEn: "Industry",
    aliases: ["行业", "industry", "sector", "vertical"]
  },
  {
    field: "country",
    titleZh: "国家",
    titleEn: "Country",
    aliases: ["国家", "country", "国家/地区", "country/region", "nation"]
  },
  {
    field: "website",
    titleZh: "官网",
    titleEn: "Website",
    aliases: [
      "官网",
      "公司网址",
      "公司网站",
      "网址",
      "website",
      "url",
      "公司 url",
      "company website",
      "web site",
      "site"
    ]
  },
  {
    field: "company",
    titleZh: "企业名称",
    titleEn: "Company",
    aliases: [
      "公司",
      "公司名称",
      "企业",
      "企业名称",
      "company",
      "company name",
      "organization",
      "org",
      "firm",
      "business name"
    ]
  },
  {
    field: "contactFullName",
    titleZh: "联系人",
    titleEn: "Contact",
    aliases: ["联系人", "contact", "contact name", "contact_name", "姓名", "full name", "name"]
  },
  {
    field: "firstName",
    titleZh: "名",
    titleEn: "First Name",
    aliases: ["名", "first name", "firstname", "first_name", "first", "名字", "given name"]
  },
  {
    field: "lastName",
    titleZh: "姓",
    titleEn: "Last Name",
    aliases: ["姓", "last name", "lastname", "last_name", "last", "姓氏", "surname", "family name"]
  },
  {
    field: "jobTitle",
    titleZh: "职位",
    titleEn: "Job Title",
    aliases: ["职位", "job title", "job_title", "title", "职务", "position", "role"]
  },
  {
    field: "phone",
    titleZh: "电话",
    titleEn: "Phone",
    aliases: ["电话", "phone", "mobile", "手机", "tel", "telephone", "cell", "cellphone"]
  },
  {
    field: "fax",
    titleZh: "FAX/传真",
    titleEn: "Fax",
    aliases: ["传真", "fax", "facsimile", "fax number"]
  },
  {
    field: "address",
    titleZh: "地址",
    titleEn: "Address",
    aliases: [
      "联系地址",
      "地址",
      "address",
      "contact address",
      "company address",
      "mailing address",
      "street address"
    ]
  },
  {
    field: "mainBusiness",
    titleZh: "主营业务",
    titleEn: "Main Business",
    aliases: [
      "主营业务",
      "主营",
      "业务",
      "description",
      "business",
      "main business",
      "main_business",
      "business description"
    ]
  },
  {
    field: "linkedin",
    titleZh: "LinkedIn",
    titleEn: "LinkedIn",
    aliases: ["linkedin", "linked in", "linkedin url", "linkedin profile"]
  },
  {
    field: "instagram",
    titleZh: "INS",
    titleEn: "Instagram",
    aliases: ["instagram", "ins", "ig", "instagram url"]
  },
  {
    field: "facebook",
    titleZh: "FB",
    titleEn: "Facebook",
    aliases: ["facebook", "fb", "facebook url"]
  },
  {
    field: "emailStatus",
    titleZh: "邮箱状态",
    titleEn: "Email Status",
    aliases: ["邮箱状态", "email status", "email validation", "validation status"]
  }
];

export function crmImportColumnLabel(col: CrmContactImportColumnDef): string {
  return `${col.titleZh} / ${col.titleEn}`;
}

export function crmImportColumnTitle(col: CrmContactImportColumnDef, locale: "zh" | "en"): string {
  return locale === "en" ? col.titleEn : col.titleZh;
}

export type CsvHeaderMatch =
  | { kind: "scalar"; field: CrmImportScalarField; column: CrmContactImportColumnDef }
  | { kind: "contactFullName"; column: CrmContactImportColumnDef }
  | { kind: "emailStatus"; column: CrmContactImportColumnDef };

function aliasExactMatch(h: string, aliases: string[]): boolean {
  return aliases.some((a) => normalizeCsvHeaderCell(a) === h);
}

function aliasLooseEmailMatch(h: string): boolean {
  if (h.includes("邮箱") || h.includes("郵箱") || h.includes("电邮")) return true;
  if (h.includes("email") || h.includes("e-mail") || h.includes("e mail")) return true;
  return false;
}

/** 将 CSV 首行单元格映射到 CRM 字段；无法识别返回 null */
export function matchCsvHeaderToCrmField(rawHeader: string): CsvHeaderMatch | null {
  const h = normalizeCsvHeaderCell(rawHeader);
  if (!h) return null;

  for (const col of CRM_CONTACT_IMPORT_COLUMNS) {
    if (col.field === "email") {
      if (aliasExactMatch(h, col.aliases) || aliasLooseEmailMatch(h)) {
        return { kind: "scalar", field: "email", column: col };
      }
      continue;
    }
    if (col.field === "contactFullName") {
      if (aliasExactMatch(h, col.aliases)) {
        return { kind: "contactFullName", column: col };
      }
      continue;
    }
    if (col.field === "emailStatus") {
      if (aliasExactMatch(h, col.aliases) || h.includes("邮箱状态") || h.includes("email status")) {
        return { kind: "emailStatus", column: col };
      }
      continue;
    }
    if (aliasExactMatch(h, col.aliases)) {
      return { kind: "scalar", field: col.field as CrmImportScalarField, column: col };
    }
  }
  return null;
}

export type CsvColumnMappingSnapshot = {
  recognized: Array<{
    header: string;
    field: string;
    titleZh: string;
    titleEn: string;
  }>;
  ignored: string[];
};

/** 解析 CSV 表头行，得到已对齐列与无效列（无效列数据不会导入） */
export function buildCsvColumnMappingFromHeaders(headerCells: string[]): CsvColumnMappingSnapshot {
  const recognized: CsvColumnMappingSnapshot["recognized"] = [];
  const ignored: string[] = [];
  const usedFields = new Set<string>();

  for (const raw of headerCells) {
    const header = raw.trim();
    if (!header) continue;
    const hit = matchCsvHeaderToCrmField(header);
    if (!hit) {
      ignored.push(header);
      continue;
    }
    const fieldKey =
      hit.kind === "contactFullName"
        ? "contactFullName"
        : hit.kind === "emailStatus"
          ? "emailStatus"
          : hit.field;
    if (usedFields.has(fieldKey)) {
      ignored.push(header);
      continue;
    }
    usedFields.add(fieldKey);
    recognized.push({
      header,
      field: fieldKey,
      titleZh: hit.column.titleZh,
      titleEn: hit.column.titleEn
    });
  }
  return { recognized, ignored };
}
