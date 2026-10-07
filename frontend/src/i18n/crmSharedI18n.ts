import type { SiteLocale } from "./siteLocaleTypes";

export type CrmSharedStrings = {
  openLink: string;
  colGroup: string;
  colIndustry: string;
  colIndustryTag: string;
  colDate: string;
  colWebsite: string;
  colCompany: string;
  colContact: string;
  colJobTitle: string;
  colMainBusiness: string;
  colPhone: string;
  colFax: string;
  colEmail: string;
  colAddress: string;
  colEmailStatus: string;
  emailStatusValid: string;
  emailStatusInvalid: string;
  emailStatusRisky: string;
  emailStatusValidShort: string;
  emailStatusInvalidShort: string;
  emailStatusRiskyShort: string;
  emailStatusValidDb: string;
  emailStatusInvalidDb: string;
  emailStatusRiskyDb: string;
  emailStatusNoEmailDb: string;
  groupNameEmpty: string;
  groupNameCjkMax: string;
  groupNameWordsMax: string;
  progressResumeToken: string;
  crmDatabaseLink: string;
  describeCsvParseOutcome: (o: {
    dataRowCount: number;
    validCount: number;
    skippedEmptyEmail: number;
    skippedInvalidEmail: number;
    skippedDuplicateEmail: number;
  }) => string;
  localizeCsvImportError: (message: string) => string;
};

export function getCrmSharedStrings(locale: SiteLocale): CrmSharedStrings {
  if (locale === "en") {
    return {
      openLink: "Open",
      colGroup: "Group",
      colIndustry: "Industry",
      colIndustryTag: "Industry tag",
      colDate: "Date",
      colWebsite: "Website",
      colCompany: "Company",
      colContact: "Contact",
      colJobTitle: "Job title",
      colMainBusiness: "Main business",
      colPhone: "Phone",
      colFax: "FAX",
      colEmail: "Email",
      colAddress: "Address",
      colEmailStatus: "Email status",
      emailStatusValid: "Valid email",
      emailStatusInvalid: "Invalid email",
      emailStatusRisky: "Risky / unverified",
      emailStatusValidShort: "Valid",
      emailStatusInvalidShort: "Invalid",
      emailStatusRiskyShort: "Risky",
      emailStatusValidDb: "Valid",
      emailStatusInvalidDb: "Invalid",
      emailStatusRiskyDb: "Risky",
      emailStatusNoEmailDb: "No email",
      groupNameEmpty: "Group name cannot be empty",
      groupNameCjkMax: "Group name with CJK characters must be at most 30 characters",
      groupNameWordsMax: "English-only group name must be at most 120 words",
      progressResumeToken: "Continue",
      crmDatabaseLink: "CRM database",
      describeCsvParseOutcome: (o) => {
        const skipTotal = o.skippedEmptyEmail + o.skippedInvalidEmail + o.skippedDuplicateEmail;
        const skips: string[] = [];
        if (o.skippedEmptyEmail > 0) skips.push(`no email ${o.skippedEmptyEmail}`);
        if (o.skippedInvalidEmail > 0) skips.push(`invalid ${o.skippedInvalidEmail}`);
        if (o.skippedDuplicateEmail > 0) skips.push(`duplicate ${o.skippedDuplicateEmail}`);
        let s = `${o.dataRowCount} data row(s) → will import ${o.validCount}`;
        if (skips.length > 0) {
          s += ` (skipped ${skipTotal}: ${skips.join(", ")})`;
        }
        return s;
      },
      localizeCsvImportError: (message) => {
        if (message === "文件为空或无法解析。") return "File is empty or could not be parsed.";
        if (
          message ===
          "未找到邮箱列。请确认首行表头含「邮箱 / Email」等字样；Excel 请「另存为」CSV UTF-8。无邮箱或无效邮箱的行不会录入。"
        ) {
          return "No email column found. First row must include Email / 邮箱 etc.; save as CSV UTF-8 from Excel. Rows without valid email are skipped.";
        }
        if (message === "没有有效数据行（需至少一行含合法邮箱）。") {
          return "No valid data rows (at least one row with a valid email required).";
        }
        return message;
      }
    };
  }
  return {
    openLink: "打开",
    colGroup: "分组",
    colIndustry: "行业",
    colIndustryTag: "行业标签",
    colDate: "日期",
    colWebsite: "官网",
    colCompany: "企业名称",
    colContact: "联系人",
    colJobTitle: "职位",
    colMainBusiness: "主营业务",
    colPhone: "电话",
    colFax: "FAX/传真",
    colEmail: "邮箱",
    colAddress: "地址",
    colEmailStatus: "邮箱状态",
    emailStatusValid: "有效邮箱",
    emailStatusInvalid: "无效邮箱",
    emailStatusRisky: "风险未验证",
    emailStatusValidShort: "有效",
    emailStatusInvalidShort: "无效",
    emailStatusRiskyShort: "风险/未验",
    emailStatusValidDb: "有效",
    emailStatusInvalidDb: "无效",
    emailStatusRiskyDb: "风险/未验",
    emailStatusNoEmailDb: "无邮箱",
    groupNameEmpty: "分组名称不能为空",
    groupNameCjkMax: "含中文时分组名称请控制在 30 个字以内",
    groupNameWordsMax: "纯英文分组名称请控制在 120 个单词以内",
    progressResumeToken: "继续",
    crmDatabaseLink: "CRM 数据库",
    describeCsvParseOutcome: (o) => {
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
    },
    localizeCsvImportError: (message) => message
  };
}
