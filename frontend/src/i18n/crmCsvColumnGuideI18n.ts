import type { SiteLocale } from "./siteLocaleTypes";
import { crmImportColumnTitle } from "../lib/crmContactImportColumns";
import type { CrmContactImportColumnDef } from "../lib/crmContactImportColumns";

export type CrmCsvColumnGuideStrings = {
  introLead: string;
  introStrong: string;
  introTail: string;
  badge: string;
  summaryTitle: string;
  summaryToggle: string;
  headerRule: string;
  headerRuleTail: string;
  emailColumnRule: string;
  emailColumnStrong: string;
  emailColumnTail: string;
  countExample: string;
  countExampleStrong: string;
  countExampleEnd: string;
  ignoredNote: string;
  mappedPrefix: (n: number) => string;
  mappedJoin: string;
  ignoredPrefix: string;
  columnLabel: (col: CrmContactImportColumnDef) => string;
};

export function getCrmCsvColumnGuideStrings(locale: SiteLocale): CrmCsvColumnGuideStrings {
  if (locale === "en") {
    return {
      introLead: "Only rows with a ",
      introStrong: "valid email",
      introTail: " are imported; empty, invalid, or duplicate emails in this file are skipped. One email per CRM contact; duplicates keep the first row. About {batchSize} rows per batch on submit.",
      badge: "Guide",
      summaryTitle: "CSV import rules & column names",
      summaryToggle: "(click to expand / collapse)",
      headerRule: "Row 1 is headers only — not imported.",
      headerRuleTail: " Data starts row 2; column order may vary; fields on one row stay on that contact.",
      emailColumnRule: "Headers must identify the ",
      emailColumnStrong: "email column",
      emailColumnTail: " (Email / 邮箱 / 电子邮件, etc.).",
      countExample:
        "Example: 1500 data rows, 500 no email, 3 invalid, 2 duplicate → skip 505 rows, ",
      countExampleStrong: "995 will be imported",
      countExampleEnd: ".",
      ignoredNote:
        "Unlisted headers are ignored column-wide. Deleting a contact removes it from CRM, industry counts, list tabs, and the 7 summary metrics.",
      mappedPrefix: (n) => `This file matched ${n} column(s): `,
      mappedJoin: "; ",
      ignoredPrefix: "Unrecognized headers (column skipped): ",
      columnLabel: (col) => crmImportColumnTitle(col, "en")
    };
  }
  return {
    introLead: "仅录入",
    introStrong: "带合法邮箱",
    introTail: "的行；无邮箱、无效邮箱、本文件重复邮箱均跳过。CRM 一邮箱一条，重复只保留首行。提交时每批约 {batchSize} 条。",
    badge: "说明",
    summaryTitle: "CSV 导入规则与列名对照",
    summaryToggle: "（点击展开 / 收起）",
    headerRule: "首行是表头（title），不会导入。",
    headerRuleTail: "从第二行起按表头写入 CRM；列顺序可乱，同一行字段不会串到别的联系人。",
    emailColumnRule: "表头须能识别",
    emailColumnStrong: "邮箱列",
    emailColumnTail: "（Email / 邮箱 / 电子邮件等）。",
    countExample: "计数示例：1500 行数据，无邮箱 500、无效 3、重复 2 → 跳过 505 行，",
    countExampleStrong: "最终将导入 995 条",
    countExampleEnd: "。",
    ignoredNote: "未在下表中的表头整列忽略。删除联系人会同步从 CRM、行业标签人数、名单 tab 与上方 7 项指标中移除。",
    mappedPrefix: (n) => `本文件已对齐 ${n} 列：`,
    mappedJoin: "；",
    ignoredPrefix: "以下表头未识别，整列不导入：",
    columnLabel: (col) => crmImportColumnTitle(col, "zh")
  };
}
