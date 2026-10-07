import type { SiteLocale } from "./siteLocaleTypes";
import { getCrmSharedStrings, type CrmSharedStrings } from "./crmSharedI18n";

export type CrmContactsDatabasePageStrings = CrmSharedStrings & {
  pageTitle: string;
  filterTitle: string;
  filterDescription: string;
  industryLabel: string;
  industryFilterList: string;
  allIndustryTags: string;
  countStats: string;
  checkingBackend: string;
  backendDisconnected: string;
  loadingData: string;
  apiFailed: string;
  currentListCountPrefix: string;
  currentListCountSuffix: string;
  keywordLabel: string;
  keywordPlaceholder: string;
  backendUnreachableTitle: string;
  backendUnreachableSteps: string[];
  recheckBackend: string;
  loadFailedWithBackend: string;
  contactListTitle: string;
  loading: string;
  listNoBackend: string;
  listNoBackendHint: string;
  loadFailed: string;
  retryLoad: string;
  noContacts: string;
  selectColumn: string;
  selectContact: (email: string) => string;
  pageActions: string;
  selectAllPage: string;
  selectedLabel: string;
  selectedOf: string;
  confirmDelete: (n: number) => string;
  deleting: string;
  confirmDeleteBtn: string;
  cancel: string;
  deleteSelected: string;
  exportSelectedCsv: string;
  exportPageCsv: string;
  exportByPageTitle: string;
  exportByPageHint: (max: number, pageSize: number) => string;
  exportFrom: string;
  exportTo: string;
  exportPageUnit: string;
  exportStartPage: string;
  exportEndPage: string;
  exportEstRows: (n: number) => string;
  exporting: string;
  exportByPage: string;
  pagination: (page: number, totalPages: number, pageSize: number, total: number) => string;
  jumpTo: string;
  jumpPage: string;
  pageUnit: string;
  jump: string;
  prevPage: string;
  nextPage: string;
  subtitleLoading: string;
  subtitleUnreachable: string;
  subtitleSummary: (total: number, pageSize: number, page: number, totalPages: number) => string;
  errNoExport: string;
  errInvalidPageRange: string;
  errNoContactsInRange: string;
  errSelectToDelete: string;
  exportedCsv: (n: number) => string;
  exportedRange: (from: number, to: number, count: number, capped: boolean) => string;
  deletedCount: (n: number) => string;
  exportCapNote: string;
};

export function buildDbColumns(ui: CrmContactsDatabasePageStrings) {
  return [
    { key: "created_at" as const, title: ui.colDate, thClass: "min-w-[6.5rem] whitespace-nowrap" },
    { key: "industry" as const, title: ui.colIndustryTag, thClass: "min-w-[6rem] whitespace-nowrap" },
    { key: "website" as const, title: ui.colWebsite, thClass: "max-w-[200px] min-w-[9rem]" },
    { key: "company" as const, title: ui.colCompany, thClass: "min-w-[8rem]" },
    { key: "contact" as const, title: ui.colContact, thClass: "min-w-[7.5rem] whitespace-nowrap" },
    { key: "job_title" as const, title: ui.colJobTitle, thClass: "min-w-[6rem] whitespace-nowrap" },
    { key: "main_business" as const, title: ui.colMainBusiness, thClass: "min-w-[12rem]" },
    { key: "phone" as const, title: ui.colPhone, thClass: "min-w-[7rem] whitespace-nowrap" },
    { key: "fax" as const, title: ui.colFax, thClass: "min-w-[7rem] whitespace-nowrap" },
    { key: "email" as const, title: ui.colEmail, thClass: "min-w-[10rem]" },
    { key: "address" as const, title: ui.colAddress, thClass: "min-w-[12rem]" },
    { key: "email_status" as const, title: ui.colEmailStatus, thClass: "min-w-[8rem] whitespace-nowrap" },
    { key: "linkedin" as const, title: "LinkedIn", thClass: "min-w-[5rem]" },
    { key: "instagram" as const, title: "INS", thClass: "min-w-[4rem]" },
    { key: "facebook" as const, title: "FB", thClass: "min-w-[4rem]" }
  ];
}

export function getCrmContactsDatabasePageStrings(locale: SiteLocale): CrmContactsDatabasePageStrings {
  const shared = getCrmSharedStrings(locale);
  if (locale === "en") {
    return {
      ...shared,
      pageTitle: "CRM database",
      filterTitle: "Filters",
      filterDescription:
        "Pick an industry tag on the left, see counts in the middle, search keywords on the right. Counts update with industry and keyword filters.",
      industryLabel: "Industry tag",
      industryFilterList: "Industry tag filter list",
      allIndustryTags: "All industry tags",
      countStats: "Counts",
      checkingBackend: "Checking backend…",
      backendDisconnected: "Backend offline",
      loadingData: "Loading…",
      apiFailed: "API error (see below)",
      currentListCountPrefix: "Current list",
      currentListCountSuffix: "contacts",
      keywordLabel: "Keywords",
      keywordPlaceholder: "Email, company, name…",
      backendUnreachableTitle:
        "Cannot reach backend (/api proxies to 127.0.0.1:8787 by default)",
      backendUnreachableSteps: [
        "In the repo root (with backend and frontend folders), run: npm install, then npm run dev. Open the URL printed (usually http://127.0.0.1:5173).",
        "Do not run only frontend npm run dev unless backend npm run dev runs in another terminal.",
        "Do not open via file:// — there is no /api proxy."
      ],
      recheckBackend: "Backend started — recheck and load",
      loadFailedWithBackend: "Backend is up but loading contacts failed (often MySQL or migrations):",
      contactListTitle: "Contact list",
      loading: "Loading…",
      listNoBackend: "Cannot load list: backend not connected",
      listNoBackendHint: "See the yellow box above, then click recheck and load.",
      loadFailed: "Load failed",
      retryLoad: "Retry",
      noContacts: "No contacts yet",
      selectColumn: "Select",
      selectContact: (email) => `Select contact ${email}`,
      pageActions: "Page actions",
      selectAllPage: "Select all on page",
      selectedLabel: "Selected",
      selectedOf: "of",
      confirmDelete: (n) => `Delete ${n} contact(s)? This cannot be undone.`,
      deleting: "Deleting…",
      confirmDeleteBtn: "Confirm delete",
      cancel: "Cancel",
      deleteSelected: "Delete selected",
      exportSelectedCsv: "Export selected CSV",
      exportPageCsv: "Export this page CSV",
      exportByPageTitle: "Export CSV by page",
      exportByPageHint: (max, pageSize) => `Up to ${max.toLocaleString()} rows per export (${pageSize} per page)`,
      exportFrom: "From",
      exportTo: "to",
      exportPageUnit: "page",
      exportStartPage: "Export start page",
      exportEndPage: "Export end page",
      exportEstRows: (n) => `~${n} rows`,
      exporting: "Exporting…",
      exportByPage: "Export page range",
      pagination: (page, totalPages, pageSize, total) =>
        `Page ${page} / ${totalPages} · ${pageSize} per page · ${total} total`,
      jumpTo: "Go to",
      jumpPage: "Page number",
      pageUnit: "page",
      jump: "Go",
      prevPage: "Previous",
      nextPage: "Next",
      subtitleLoading: "Loading…",
      subtitleUnreachable:
        "Cannot connect to backend API (default 8787). Start npm run dev from repo root per filter section.",
      subtitleSummary: (total, pageSize, page, totalPages) =>
        `${total} total · ${pageSize} per page · page ${page} / ${totalPages} (filter by industry and keywords)`,
      errNoExport: "No contacts to export",
      errInvalidPageRange: "Enter valid start and end page numbers",
      errNoContactsInRange: "No contacts in that page range",
      errSelectToDelete: "Select contacts to delete first",
      exportedCsv: (n) => `Exported ${n} row(s) CSV`,
      exportedRange: (from, to, count, capped) =>
        `Exported pages ${from}–${to}, ${count} row(s)${capped ? " (10k cap reached)" : ""}`,
      deletedCount: (n) => `Deleted ${n} contact(s)`,
      exportCapNote: " (10k export cap)"
    };
  }
  return {
    ...shared,
    pageTitle: "CRM 数据库",
    filterTitle: "筛选",
    filterDescription: "左侧选行业标签，中间为数量统计，右侧搜关键词。中间数字随当前行业标签与关键词筛选变化。",
    industryLabel: "行业标签",
    industryFilterList: "行业标签筛选列表",
    allIndustryTags: "全部行业标签",
    countStats: "数量统计",
    checkingBackend: "检测后端…",
    backendDisconnected: "后端未连接",
    loadingData: "加载数据…",
    apiFailed: "数据接口失败（见下方红字）",
    currentListCountPrefix: "当前列表",
    currentListCountSuffix: "条",
    keywordLabel: "关键词",
    keywordPlaceholder: "邮箱、公司、姓名…",
    backendUnreachableTitle: "当前页面连不上后端（/api 默认由 Vite 代理到 127.0.0.1:8787）",
    backendUnreachableSteps: [
      "在仓库根目录打开终端（应能同时看到 backend 与 frontend 文件夹），依次执行 npm install、npm run dev；用终端打印的地址打开（一般为 http://127.0.0.1:5173）。",
      "不要只在 frontend 里 npm run dev，除非已在 backend 另开终端运行 npm run dev。",
      "不要用 file:// 打开本地 HTML，否则没有 /api 代理。"
    ],
    recheckBackend: "我已按上述启动，重新检测并加载",
    loadFailedWithBackend: "后端已连通，但加载联系人失败（多为 MySQL 未启动或库未 migrate）：",
    contactListTitle: "联系人列表",
    loading: "加载中…",
    listNoBackend: "列表无法加载：未连接到后端",
    listNoBackendHint: "请先看上方筛选区里的黄色说明框，启动后再点「重新检测并加载」。",
    loadFailed: "加载失败",
    retryLoad: "重试加载",
    noContacts: "暂无联系人",
    selectColumn: "选择",
    selectContact: (email) => `选择联系人 ${email}`,
    pageActions: "本页操作",
    selectAllPage: "全选本页",
    selectedLabel: "已选",
    selectedOf: "/",
    confirmDelete: (n) => `确认删除 ${n} 条？不可恢复。`,
    deleting: "删除中…",
    confirmDeleteBtn: "确认删除",
    cancel: "取消",
    deleteSelected: "删除所选",
    exportSelectedCsv: "导出所选 CSV",
    exportPageCsv: "导出本页 CSV",
    exportByPageTitle: "按页导出 CSV",
    exportByPageHint: (max, pageSize) => `单次最多 ${max.toLocaleString()} 条（每页 ${pageSize} 条）`,
    exportFrom: "从",
    exportTo: "到",
    exportPageUnit: "页",
    exportStartPage: "导出起始页",
    exportEndPage: "导出结束页",
    exportEstRows: (n) => `约 ${n} 条`,
    exporting: "导出中…",
    exportByPage: "按页码导出",
    pagination: (page, totalPages, pageSize, total) =>
      `第 ${page} / ${totalPages} 页 · 每页 ${pageSize} 条 · 共 ${total} 条`,
    jumpTo: "跳至",
    jumpPage: "输入页码",
    pageUnit: "页",
    jump: "跳转",
    prevPage: "上一页",
    nextPage: "下一页",
    subtitleLoading: "加载中…",
    subtitleUnreachable: "无法连接后端 API（默认 8787）。请按筛选区下方说明在仓库根目录启动 npm run dev。",
    subtitleSummary: (total, pageSize, page, totalPages) =>
      `共 ${total} 条 · 每页 ${pageSize} 条 · 第 ${page} / ${totalPages} 页（可按行业标签与关键词筛选）`,
    errNoExport: "当前没有可导出的联系人",
    errInvalidPageRange: "请输入有效的起止页码",
    errNoContactsInRange: "该页码范围内没有联系人",
    errSelectToDelete: "请先勾选要删除的联系人",
    exportedCsv: (n) => `已导出 ${n} 条 CSV`,
    exportedRange: (from, to, count, capped) =>
      `已导出第 ${from}–${to} 页，共 ${count} 条${capped ? "（已触及单次 1 万条上限）" : ""}`,
    deletedCount: (n) => `已删除 ${n} 条联系人`,
    exportCapNote: "（已触及单次 1 万条上限）"
  };
}
