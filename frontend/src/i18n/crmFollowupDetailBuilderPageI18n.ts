import type { SiteLocale } from "./siteLocaleTypes";

export type CrmFollowupDetailBuilderStrings = {
  pageTitle: string;
  pageDescription: string;
  exportExcel: string;
  exportPdf: string;
  exportWord: string;
  templateNameLabel: string;
  templateNamePh: string;
  pageProgress: (current: number, total: number, sections: number) => string;
  firstPage: string;
  prevPage: string;
  nextPage: string;
  pageNavHint: (maxVisible: number) => string;
  pickPageLabel: string;
  pickPagePlaceholder: string;
  pageListAria: string;
  pageTitleFallback: (index: number) => string;
  pageRowTitle: (title: string, sections: number) => string;
  sectionCount: (n: number) => string;
  addPage: string;
  copyPage: string;
  copyPageDisabledTitle: string;
  copyPageTitle: string;
  deletePage: string;
  addSection: string;
  sectionQuota: (current: number, max: number, visible: number) => string;
  loading: string;
  emptySections: (max: number) => string;
  sectionTitle: (index: number) => string;
  sectionTitlePh: string;
  copySection: string;
  delete: string;
  fieldShortText: string;
  fieldLongText: string;
  fieldAttachment: string;
  fieldGeneric: string;
  defaultSectionTitle: string;
  defaultPageTitle: string;
  pageCopySuffix: string;
  fileDropHint: string;
  chooseFile: string;
  uploading: string;
  removeFile: string;
  addShortText: string;
  addLongText: string;
  addAttachment: string;
  exportFollowupItem: string;
  exportItemN: (n: number) => string;
  exportNone: string;
  exportSheetName: string;
  alertFileTypes: string;
  alertMinOnePage: string;
  confirmDeletePage: (title: string) => string;
  alertSectionLimit: (max: number) => string;
  alertSectionLimitCopy: (max: number) => string;
};

export function getCrmFollowupDetailBuilderStrings(
  locale: SiteLocale
): CrmFollowupDetailBuilderStrings {
  if (locale === "en") {
    return {
      pageTitle: "Follow-up detail template",
      pageDescription:
        "Add rows, duplicate rows, split across pages, and export the current page to Excel / PDF / Word.",
      exportExcel: "Export Excel",
      exportPdf: "Export PDF",
      exportWord: "Export Word",
      templateNameLabel: "Template name",
      templateNamePh: "e.g. US company registration follow-up",
      pageProgress: (current, total, sections) =>
        `Page ${current} / ${total}${sections > 0 ? ` · ${sections} row(s)` : ""}`,
      firstPage: "First page",
      prevPage: "Previous",
      nextPage: "Next",
      pageNavHint: (maxVisible) =>
        `History is kept per page; edits auto-save. Open **Pick page** for up to ${maxVisible} entries (scroll if more).`,
      pickPageLabel: "Pick page",
      pickPagePlaceholder: "Click to choose a follow-up page",
      pageListAria: "Follow-up pages",
      pageTitleFallback: (index) => `Page ${index}`,
      pageRowTitle: (title, sections) => `${title} (${sections} row(s))`,
      sectionCount: (n) => `${n} row(s)`,
      addPage: "+ Add page",
      copyPage: "Copy current page",
      copyPageDisabledTitle: "Nothing to copy on this page",
      copyPageTitle: "Copy all rows on this page to a new page",
      deletePage: "Delete current page",
      addSection: "+ Add row",
      sectionQuota: (current, max, visible) =>
        `This page ${current}/${max} rows · ${visible} visible, scroll for more`,
      loading: "Loading…",
      emptySections: (max) =>
        `No rows on this page yet. Click **+ Add row** to start; after ${max} rows use **+ Add page**.`,
      sectionTitle: (index) => `Row ${index}`,
      sectionTitlePh: "e.g. US company registration follow-up",
      copySection: "Duplicate row",
      delete: "Delete",
      fieldShortText: "Short text",
      fieldLongText: "Notes",
      fieldAttachment: "Attachments",
      fieldGeneric: "Field",
      defaultSectionTitle: "Follow-up item",
      defaultPageTitle: "Follow-up detail",
      pageCopySuffix: " copy",
      fileDropHint: "Drag Word / Excel / PDF here",
      chooseFile: "Choose files",
      uploading: "Uploading…",
      removeFile: "Remove",
      addShortText: "+ Short text",
      addLongText: "+ Long text",
      addAttachment: "+ Attachments",
      exportFollowupItem: "Follow-up item",
      exportItemN: (n) => `Item ${n}`,
      exportNone: "None",
      exportSheetName: "Follow-up detail",
      alertFileTypes: "Only Word / Excel / PDF uploads are supported",
      alertMinOnePage: "Keep at least one follow-up page",
      confirmDeletePage: (title) =>
        `Delete "${title}"? Row content on this page will be removed (files stay on server unless deleted manually).`,
      alertSectionLimit: (max) =>
        `At most ${max} rows per page. Use **+ Add page** to continue.`,
      alertSectionLimitCopy: (max) =>
        `At most ${max} rows per page. Add a page before duplicating.`
    };
  }
  return {
    pageTitle: "客户跟进详情",
    pageDescription: "可自由新增排、复制排、分页面记录跟进，并导出当前页的 Excel / PDF / Word。",
    exportExcel: "导出 Excel",
    exportPdf: "导出 PDF",
    exportWord: "导出 Word",
    templateNameLabel: "模板名称",
    templateNamePh: "例如：美国企业注册跟进",
    pageProgress: (current, total, sections) =>
      `当前第 ${current} / ${total} 页${sections > 0 ? ` · ${sections} 排` : ""}`,
    firstPage: "回到第一页",
    prevPage: "上一页",
    nextPage: "下一页",
    pageNavHint: (maxVisible) =>
      `切换页面后各页历史内容仍保留；修改会自动保存。点击「选择页面」栏展开列表，一次最多显示 ${maxVisible} 个，超出可下拉滚动。`,
    pickPageLabel: "选择页面",
    pickPagePlaceholder: "点击选择要跟进的页面",
    pageListAria: "跟进页列表",
    pageTitleFallback: (index) => `跟进页 ${index}`,
    pageRowTitle: (title, sections) => `${title}（${sections} 排）`,
    sectionCount: (n) => `${n} 排`,
    addPage: "+ 新增页面",
    copyPage: "复制当前页到新页",
    copyPageDisabledTitle: "当前页暂无内容可复制",
    copyPageTitle: "复制当前页全部排到新页面",
    deletePage: "删除当前页",
    addSection: "+ 新增一排",
    sectionQuota: (current, max, visible) =>
      `本页 ${current}/${max} 排 · 可视 ${visible} 排，其余下拉滚动`,
    loading: "加载中...",
    emptySections: (max) =>
      `当前页还没有跟进排。点击「+ 新增一排」开始记录；单页满 ${max} 排后请「+ 新增页面」。`,
    sectionTitle: (index) => `第 ${index} 排`,
    sectionTitlePh: "例如：美国企业注册跟进",
    copySection: "复制此排",
    delete: "删除",
    fieldShortText: "短文本",
    fieldLongText: "备注",
    fieldAttachment: "附件",
    fieldGeneric: "字段",
    defaultSectionTitle: "跟进事项",
    defaultPageTitle: "客户跟进详情",
    pageCopySuffix: " 副本",
    fileDropHint: "可拖拽 Word/Excel/PDF 到此区域上传",
    chooseFile: "选择文件",
    uploading: "上传中...",
    removeFile: "移除",
    addShortText: "+ 短文本框",
    addLongText: "+ 长文本框",
    addAttachment: "+ 附件框",
    exportFollowupItem: "跟进项",
    exportItemN: (n) => `第${n}项`,
    exportNone: "无",
    exportSheetName: "客户跟进详情",
    alertFileTypes: "仅支持上传 Word / Excel / PDF",
    alertMinOnePage: "至少保留一个跟进页",
    confirmDeletePage: (title) =>
      `确定删除「${title}」？该页字段内容将一并移除（附件仍保留在服务器，除非手动删除）。`,
    alertSectionLimit: (max) =>
      `单页最多 ${max} 排。请点「新增页面」继续添加跟进。`,
    alertSectionLimitCopy: (max) => `单页最多 ${max} 排。请新增页面后再复制。`
  };
}
