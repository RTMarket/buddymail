import type { SiteLocale } from "./siteLocaleTypes";
import { getCrmSharedStrings, type CrmSharedStrings } from "./crmSharedI18n";

export type EmailContactsPageStrings = CrmSharedStrings & {
  pageTitle: string;
  pageDescription: string;
  industrySectionTitle: string;
  industrySectionDescription: string;
  newIndustryTagLabel: string;
  industryTagPlaceholder: string;
  creatingIndustryTag: string;
  createIndustryTag: string;
  quickAddTitle: string;
  quickAddDescription: string;
  fieldEmail: string;
  fieldPhone: string;
  fieldFax: string;
  fieldCompany: string;
  fieldContactName: string;
  contactNamePlaceholder: string;
  fieldJobTitle: string;
  fieldWebsite: string;
  fieldMainBusiness: string;
  fieldCountry: string;
  fieldIndustry: string;
  fieldAddress: string;
  saveContact: string;
  moveToCrmDb: string;
  quickAddFileName: string;
  csvSectionTitle: string;
  csvUploadTitle: string;
  csvBatchHint: string;
  csvImportHint: string;
  importIndustryTagLabel: string;
  importIndustryTagPlaceholder: string;
  importIndustryTagEmptyHint: string;
  chooseCsv: string;
  excelSectionTitle: string;
  excelUploadTitle: string;
  excelImportHint: string;
  chooseExcel: string;
  convertExcelToCsv: string;
  convertingExcel: string;
  downloadConvertedCsv: string;
  excelSelected: (name: string) => string;
  noExcelSelected: string;
  clearExcel: string;
  errExcelOnly: string;
  errExcelConvertFailed: (msg: string) => string;
  excelConvertedOk: (csvName: string, industry: string) => string;
  industryFromFileNameHint: string;
  noFileSelected: string;
  clearImport: string;
  confirmImport: string;
  importing: string;
  resumeImport: string;
  selectIndustryTagFirst: string;
  skippedImportRows: (n: number) => string;
  crmModalTitle: string;
  crmModalDescription: string;
  chooseExistingGroup: string;
  crmTargetGroup: string;
  selectCrmTargetGroup: string;
  noGroupsYet: string;
  createNewGroup: string;
  newGroupPlaceholder: string;
  cancel: string;
  confirmWrite: string;
  writing: string;
  resumeWrite: string;
  skippedWriteRows: (n: number) => string;
  errIndustryTagName: string;
  errNoExportData: string;
  errEmailRequired: string;
  errEmailInvalid: string;
  errImportCsvFirst: string;
  errSelectForCrm: string;
  errSelectCrmRows: string;
  errNewGroupName: string;
  errSelectValidGroup: string;
  errCsvOnly: string;
  errSelectIndustryBeforeCsv: string;
  errCsvNeedsEmail: string;
  errNoValidEmails: string;
  importComplete: string;
  preparingWrite: string;
  writeProgress: (done: number, total: number) => string;
  writeComplete: (ok: number, skipped: number) => string;
  writeDone: (n: number) => string;
  writeInterrupted: (done: number, total: number) => string;
  importProgressStart: (done: number, total: number) => string;
  importProgress: (done: number, total: number) => string;
  importInterrupted: (done: number, total: number) => string;
  importDoneMessage: (industry: string, parseNote: string, success: number, serverSkipped: number, apiRejected: number) => string;
  validEmailsCount: (n: number) => string;
  industryTagRemoved: (tag: string, deleted?: number) => string;
  industryTagCreated: (name: string) => string;
  contactSaved: string;
  csvParsedOk: (outcome: string, ignoredCols?: number) => string;
  csvTooLarge: (outcome: string) => string;
  selectedFileSummary: (fileName: string, outcome: string) => string;
  unrecognizedCols: (n: number) => string;
  resumeWriteProgress: (done: number, total: number) => string;
};

export type CrmListColumnDef = {
  key:
    | "groupNames"
    | "industry"
    | "website"
    | "company"
    | "contact"
    | "jobTitle"
    | "mainBusiness"
    | "phone"
    | "fax"
    | "email"
    | "address"
    | "linkedin"
    | "instagram"
    | "facebook"
    | "emailStatus";
  title: string;
  thClass: string;
  tdClass: string;
};

export function buildCrmListColumns(ui: EmailContactsPageStrings): CrmListColumnDef[] {
  return [
    { key: "groupNames", title: ui.colGroup, thClass: "min-w-[7rem]", tdClass: "min-w-[7rem]" },
    { key: "industry", title: ui.colIndustry, thClass: "min-w-[6rem] whitespace-nowrap", tdClass: "min-w-[6rem] whitespace-nowrap" },
    { key: "website", title: ui.colWebsite, thClass: "max-w-[200px] min-w-[9rem]", tdClass: "max-w-[200px] min-w-[9rem]" },
    { key: "company", title: ui.colCompany, thClass: "min-w-[8rem]", tdClass: "min-w-[8rem]" },
    { key: "contact", title: ui.colContact, thClass: "min-w-[7.5rem] whitespace-nowrap", tdClass: "min-w-[7.5rem] whitespace-nowrap" },
    { key: "jobTitle", title: ui.colJobTitle, thClass: "min-w-[6rem] whitespace-nowrap", tdClass: "min-w-[6rem] whitespace-nowrap" },
    { key: "mainBusiness", title: ui.colMainBusiness, thClass: "min-w-[12rem]", tdClass: "min-w-[12rem]" },
    { key: "phone", title: ui.colPhone, thClass: "min-w-[7rem] whitespace-nowrap", tdClass: "min-w-[7rem] whitespace-nowrap" },
    { key: "fax", title: ui.colFax, thClass: "min-w-[7rem] whitespace-nowrap", tdClass: "min-w-[7rem] whitespace-nowrap" },
    { key: "email", title: ui.colEmail, thClass: "min-w-[10rem]", tdClass: "min-w-[10rem]" },
    { key: "address", title: ui.colAddress, thClass: "min-w-[12rem]", tdClass: "min-w-[12rem]" },
    { key: "linkedin", title: "LinkedIn", thClass: "min-w-[5rem]", tdClass: "min-w-[5rem]" },
    { key: "instagram", title: "INS", thClass: "min-w-[4rem]", tdClass: "min-w-[4rem]" },
    { key: "facebook", title: "FB", thClass: "min-w-[4rem]", tdClass: "min-w-[4rem]" },
    { key: "emailStatus", title: ui.colEmailStatus, thClass: "min-w-[9rem]", tdClass: "min-w-[9rem]" }
  ];
}

export function getEmailContactsPageStrings(locale: SiteLocale): EmailContactsPageStrings {
  const shared = getCrmSharedStrings(locale);
  if (locale === "en") {
    return {
      ...shared,
      pageTitle: "Add CRM contacts",
      pageDescription:
        "Step 1: Pick an industry tag and import CSV (same rules as Campaigns), then save to CRM. Step 2: View saved contacts in CRM database.",
      industrySectionTitle: "Industry tags",
      industrySectionDescription:
        "Shared with Campaigns and CRM database (per login). Sends and stats count by industry field. Removing a tag (×) deletes all CRM contacts under it.",
      newIndustryTagLabel: "New industry tag",
      industryTagPlaceholder: "Industry tag name",
      creatingIndustryTag: "Creating…",
      createIndustryTag: "Create industry tag",
      quickAddTitle: "Quick add contact",
      quickAddDescription:
        "Add one contact. Email is required and must be valid; contacts without a valid email cannot be saved to CRM (same as CSV import).",
      fieldEmail: "Email*",
      fieldPhone: "Phone",
      fieldFax: "FAX",
      fieldCompany: "Company",
      fieldContactName: "Contact",
      contactNamePlaceholder: "e.g. Anne Lee or 张三 (text after space = last name)",
      fieldJobTitle: "Job title",
      fieldWebsite: "Website",
      fieldMainBusiness: "Main business",
      fieldCountry: "Country",
      fieldIndustry: "Industry (single)",
      fieldAddress: "Address",
      saveContact: "Save contact",
      moveToCrmDb: "Move to CRM database",
      quickAddFileName: "Quick add",
      csvSectionTitle: "Import contacts from CSV",
      csvUploadTitle: "Import contacts from CSV",
      csvBatchHint: "≤1500 rows per batch recommended",
      csvImportHint:
        "Choose a CSV file. Import industry tag defaults to the file name (without .csv). You can still change it below before confirming.",
      importIndustryTagLabel: "Import industry tag (single)",
      importIndustryTagPlaceholder: "Select industry tag…",
      importIndustryTagEmptyHint: "No industry tags yet. Create one above first.",
      chooseCsv: "Choose CSV file",
      excelSectionTitle: "Upload Excel list → convert to CSV",
      excelUploadTitle: "Upload Excel list",
      excelImportHint:
        "Upload .xlsx / .xls, click Convert to CSV, then Confirm import. Industry tag = the CSV file name (without extension).",
      chooseExcel: "Choose Excel file",
      convertExcelToCsv: "Convert to CSV",
      convertingExcel: "Converting…",
      downloadConvertedCsv: "Download converted CSV",
      excelSelected: (name) => `Selected Excel: ${name}`,
      noExcelSelected: "No Excel file selected",
      clearExcel: "Clear Excel",
      errExcelOnly: "Only .xlsx / .xls / .xlsm Excel files are supported.",
      errExcelConvertFailed: (msg) => `Excel → CSV failed: ${msg}`,
      excelConvertedOk: (csvName, industry) =>
        `Converted to ${csvName}. Industry tag set to “${industry}”. Review below and click Confirm import.`,
      industryFromFileNameHint: "Industry tag follows the CSV file name (without extension).",
      noFileSelected: "No file selected",
      clearImport: "Clear import",
      confirmImport: "Confirm import",
      importing: "Importing…",
      resumeImport: "Resume import",
      selectIndustryTagFirst: "Select an import industry tag first",
      skippedImportRows: (n) => `Skipped ${n} row(s) during parse or write.`,
      crmModalTitle: "Move to CRM database",
      crmModalDescription:
        "This page does not show CRM database groups in the list. Choose a target group below; data is written only after you click Confirm write.",
      chooseExistingGroup: "Use existing group",
      crmTargetGroup: "Target CRM database group",
      selectCrmTargetGroup: "Select target CRM database group",
      noGroupsYet: "No groups yet — create one first",
      createNewGroup: "Create new group",
      newGroupPlaceholder: "New group name",
      cancel: "Cancel",
      confirmWrite: "Confirm write",
      writing: "Writing…",
      resumeWrite: "Resume write",
      skippedWriteRows: (n) => `Skipped ${n} consecutive failed row(s); others continued.`,
      errIndustryTagName: "Enter an industry tag name.",
      errNoExportData:
        "Nothing to export. Import CSV, optionally dedupe, select rows, or export the full current list if none selected.",
      errEmailRequired: "Enter an email address.",
      errEmailInvalid: "Enter a valid email. Contacts without a valid email cannot be saved to CRM.",
      errImportCsvFirst: "Import CSV, run dedupe if needed, select rows, then use Move to CRM database.",
      errSelectForCrm: "Select rows to move to CRM database (valid email required).",
      errSelectCrmRows: "Select rows to move to CRM database.",
      errNewGroupName: "Enter a new group name.",
      errSelectValidGroup: "Select or create a valid group.",
      errCsvOnly: "Only .csv files are supported (Excel: Save As → CSV UTF-8).",
      errSelectIndustryBeforeCsv: "Select an import industry tag before importing CSV.",
      errCsvNeedsEmail: "Choose a CSV with at least one valid email row.",
      errNoValidEmails: "No valid emails to submit. Check the email column format.",
      importComplete: "Import complete",
      preparingWrite: "Preparing write…",
      writeProgress: (done, total) => `Written ${done}/${total}`,
      writeComplete: (ok, skipped) => `Write complete: ${ok} succeeded, ${skipped} failed rows skipped.`,
      writeDone: (n) => `Wrote ${n} contact(s) to CRM. Open CRM database to view.`,
      writeInterrupted: (done, total) =>
        `Write interrupted: ${done}/${total} done. Click Confirm write again to resume.`,
      importProgressStart: (done, total) =>
        done > 0 ? `Resume: ${done}/${total} emails done` : `Importing 0/${total} emails…`,
      importProgress: (done, total) => `Imported ${done}/${total} emails`,
      importInterrupted: (done, total) =>
        `Import interrupted: ${done}/${total} done. Click Confirm import to continue.`,
      importDoneMessage: (industry, parseNote, success, serverSkipped, apiRejected) =>
        `Import complete (industry “${industry}”): ${parseNote}, wrote ${success}` +
        (serverSkipped > 0 ? `, ${serverSkipped} write failures` : "") +
        (apiRejected > 0 ? `, ${apiRejected} rejected before submit` : "") +
        ". View in CRM database.",
      validEmailsCount: (n) => `${n} valid email(s)`,
      industryTagRemoved: (tag, deleted) =>
        deleted != null && deleted > 0
          ? `Removed industry tag “${tag}” and deleted ${deleted} CRM contact(s)`
          : `Removed industry tag “${tag}”`,
      industryTagCreated: (name) => `Created industry tag “${name}”`,
      contactSaved: "Contact saved",
      csvParsedOk: (outcome, ignoredCols) =>
        `✓ ${outcome}${ignoredCols ? `; ${ignoredCols} unrecognized column(s) not imported` : ""}. Click Confirm import when ready.`,
      csvTooLarge: (outcome) =>
        `${outcome}. Keep batches ≤1500 rows; split the CSV and import in parts.`,
      selectedFileSummary: (fileName, outcome) => `Selected ${fileName} · ${outcome}`,
      unrecognizedCols: (n) => ` · ${n} unrecognized column(s)`,
      resumeWriteProgress: (done, total) => `Written ${done}/${total} — click to resume write`
    };
  }
  return {
    ...shared,
    pageTitle: "CRM 客户新增",
    pageDescription:
      "第 1 步：选择行业标签并导入 CSV（规则与「邮件营销」一致），写入 CRM；第 2 步在「CRM 数据库」查看已存联系人。",
    industrySectionTitle: "行业标签",
    industrySectionDescription:
      "与「邮件营销」「CRM 数据库」共用（按登录账号隔离）。发送与统计按「行业」字段计数；点 × 将同步删除该标签下全部 CRM 联系人。",
    newIndustryTagLabel: "新建行业标签",
    industryTagPlaceholder: "输入行业标签名称",
    creatingIndustryTag: "创建中…",
    createIndustryTag: "创建行业标签",
    quickAddTitle: "快速新增联系人",
    quickAddDescription: "单条写入联系人；邮箱为必填且须有效，无有效邮箱不能写入 CRM（与 CSV 导入规则一致）。",
    fieldEmail: "邮箱*",
    fieldPhone: "电话",
    fieldFax: "FAX/传真",
    fieldCompany: "企业名称",
    fieldContactName: "联系人",
    contactNamePlaceholder: "例如：张三 或 Anne Lee（空格后为姓/后缀）",
    fieldJobTitle: "职位",
    fieldWebsite: "官网",
    fieldMainBusiness: "主营业务",
    fieldCountry: "国家",
    fieldIndustry: "行业（单选）",
    fieldAddress: "地址",
    saveContact: "保存联系人",
    moveToCrmDb: "移至CRM数据库",
    quickAddFileName: "快速新增",
    csvSectionTitle: "上传 CSV 导入联系人",
    csvUploadTitle: "上传 CSV 导入联系人",
    csvBatchHint: "单次建议 ≤1500 条",
    csvImportHint:
      "选择 CSV 文件后，导入行业标签默认取文件名（去掉 .csv）。确认导入前仍可在下方改标签。",
    importIndustryTagLabel: "导入行业标签（单选）",
    importIndustryTagPlaceholder: "请选择行业标签…",
    importIndustryTagEmptyHint: "暂无行业标签。请先上方「新建行业标签」创建。",
    chooseCsv: "选择 CSV 文件",
    excelSectionTitle: "上传 Excel 名单 → 转为 CSV",
    excelUploadTitle: "上传 Excel 名单",
    excelImportHint:
      "上传 .xlsx / .xls，点击「转换为 CSV」后按 CSV 规则导入 CRM。行业标签 = 转换后 CSV 的文件名（不含扩展名）。",
    chooseExcel: "选择 Excel 文件",
    convertExcelToCsv: "转换为 CSV",
    convertingExcel: "转换中…",
    downloadConvertedCsv: "下载转换后的 CSV",
    excelSelected: (name) => `已选 Excel：${name}`,
    noExcelSelected: "未选择 Excel 文件",
    clearExcel: "清空 Excel",
    errExcelOnly: "仅支持 .xlsx / .xls / .xlsm Excel 文件。",
    errExcelConvertFailed: (msg) => `Excel 转 CSV 失败：${msg}`,
    excelConvertedOk: (csvName, industry) =>
      `已转换为 ${csvName}，行业标签已设为「${industry}」。请核对下方预览后点「确认导入」。`,
    industryFromFileNameHint: "行业标签默认取 CSV 文件名（不含扩展名）。",
    noFileSelected: "未选择文件",
    clearImport: "清空导入",
    confirmImport: "确认导入",
    importing: "导入中…",
    resumeImport: "继续导入（从断点）",
    selectIndustryTagFirst: "请先选择导入行业标签",
    skippedImportRows: (n) => `已跳过 ${n} 条（解析或写入阶段）。`,
    crmModalTitle: "移至CRM数据库",
    crmModalDescription:
      "本页列表不展示 CRM 数据库分组。请在下方选择要写入的数据库分组，仅当点击「确认写入」后数据才会进入「CRM 数据库」对应分组。",
    chooseExistingGroup: "选择已有分组",
    crmTargetGroup: "CRM 数据库目标分组",
    selectCrmTargetGroup: "选择 CRM 数据库中的目标分组",
    noGroupsYet: "暂无分组，请先新建",
    createNewGroup: "新建分组",
    newGroupPlaceholder: "新分组名称",
    cancel: "取消",
    confirmWrite: "确认写入",
    writing: "写入中…",
    resumeWrite: "继续写入（从断点）",
    skippedWriteRows: (n) => `已跳过 ${n} 条连续失败记录（其余继续写入）。`,
    errIndustryTagName: "请输入行业标签名称。",
    errNoExportData:
      "没有可导出的数据；可先导入 CSV 并（可选）应用去重，勾选部分行后导出，未选中则导出当前列表全部。",
    errEmailRequired: "请填写邮箱",
    errEmailInvalid: "请填写有效邮箱；无有效邮箱的联系人不能写入 CRM。",
    errImportCsvFirst: "请先导入 CSV，并在去重检查后勾选要写入的记录，再使用「移至CRM数据库」。",
    errSelectForCrm: "请先勾选要移至CRM数据库的记录（需包含有效邮箱）",
    errSelectCrmRows: "请先勾选要移至CRM数据库的记录",
    errNewGroupName: "请填写新分组名称",
    errSelectValidGroup: "请选择或创建有效分组",
    errCsvOnly: "仅支持 .csv 文件（请用 Excel「另存为」选择 CSV UTF-8）。",
    errSelectIndustryBeforeCsv: "请先选择导入行业标签，再导入 CSV。",
    errCsvNeedsEmail: "请先选择 CSV，且文件中需至少一行合法邮箱。",
    errNoValidEmails: "没有可提交的合法邮箱，请检查 CSV 邮箱列格式。",
    importComplete: "导入完成",
    preparingWrite: "准备写入…",
    writeProgress: (done, total) => `已写入 ${done}/${total} 条`,
    writeComplete: (ok, skipped) => `✓ 写入完成：成功 ${ok} 条，已跳过 ${skipped} 条失败记录。`,
    writeDone: (n) => `✓ 已写入 CRM：${n} 条，已进入「CRM 数据库」查看。`,
    writeInterrupted: (done, total) =>
      `写入中断：已完成 ${done}/${total} 条。再次点击「确认写入」将从断点继续。`,
    importProgressStart: (done, total) =>
      done > 0 ? `从断点继续：已完成 ${done}/${total} 条邮箱` : `正在导入 0/${total} 条邮箱…`,
    importProgress: (done, total) => `已导入 ${done}/${total} 条邮箱`,
    importInterrupted: (done, total) =>
      `导入中断：已完成 ${done}/${total} 条。请再次点击「确认导入」继续。`,
    importDoneMessage: (industry, parseNote, success, serverSkipped, apiRejected) =>
      `✓ 导入完成（行业「${industry}」）：${parseNote}，成功写入 ${success} 条` +
      (serverSkipped > 0 ? `，写入失败 ${serverSkipped} 条` : "") +
      (apiRejected > 0 ? `，提交前剔除不合规邮箱 ${apiRejected} 条` : "") +
      "。可在「CRM 数据库」查看。",
    validEmailsCount: (n) => `有效邮箱 ${n} 条`,
    industryTagRemoved: (tag, deleted) =>
      deleted != null && deleted > 0
        ? `✓ 已移除行业标签「${tag}」，并删除 ${deleted} 条 CRM 联系人`
        : `✓ 已移除行业标签「${tag}」`,
    industryTagCreated: (name) => `✓ 已创建行业标签「${name}」`,
    contactSaved: "✓ 已保存联系人",
    csvParsedOk: (outcome, ignoredCols) =>
      `✓ ${outcome}${ignoredCols ? `；未识别列 ${ignoredCols} 个（整列不导入）` : ""}。确认无误后点击「确认导入」。`,
    csvTooLarge: (outcome) => `${outcome}。建议每次控制在 1500 条以内，请拆分 CSV 后分次导入。`,
    selectedFileSummary: (fileName, outcome) => `已选 ${fileName} · ${outcome}`,
    unrecognizedCols: (n) => ` · 未识别列 ${n} 个`,
    resumeWriteProgress: (done, total) => `已写入 ${done}/${total} 条，点击继续写入`
  };
}
