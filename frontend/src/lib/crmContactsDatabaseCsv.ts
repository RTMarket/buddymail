function csvEscapeCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type CrmDatabaseCsvRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  industry: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  job_title: string | null;
  website: string | null;
  main_business: string | null;
  linkedin: string | null;
  instagram: string | null;
  facebook: string | null;
  email_status: string | null;
  created_at?: string | null;
};

export const CRM_DATABASE_CSV_HEADERS = [
  "日期",
  "行业标签",
  "官网",
  "企业名称",
  "联系人",
  "职位",
  "主营业务",
  "电话",
  "FAX/传真",
  "邮箱",
  "地址",
  "邮箱状态",
  "LinkedIn",
  "INS",
  "FB"
] as const;

function contactDisplayName(r: CrmDatabaseCsvRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
}

export function crmDatabaseContactToCsvRow(r: CrmDatabaseCsvRow): string[] {
  return [
    (r.created_at || "").toString().slice(0, 10),
    r.industry ?? "",
    r.website ?? "",
    r.company ?? "",
    contactDisplayName(r),
    r.job_title ?? "",
    r.main_business ?? "",
    r.phone ?? "",
    r.fax ?? "",
    r.email ?? "",
    r.address ?? "",
    r.email_status ?? "",
    r.linkedin ?? "",
    r.instagram ?? "",
    r.facebook ?? ""
  ];
}

export function downloadCrmDatabaseContactsCsv(filename: string, rows: CrmDatabaseCsvRow[]): void {
  const lines = [CRM_DATABASE_CSV_HEADERS.map(csvEscapeCell).join(",")];
  for (const row of rows) {
    lines.push(crmDatabaseContactToCsvRow(row).map(csvEscapeCell).join(","));
  }
  const body = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
