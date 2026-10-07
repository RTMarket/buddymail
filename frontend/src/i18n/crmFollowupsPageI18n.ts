import type { SiteLocale } from "./siteLocaleTypes";
import { getCrmSharedStrings } from "./crmSharedI18n";

export type FollowupStage = { value: string; label: string };
export type FollowupKind = { value: string; label: string };
export type KanbanColumn = {
  id: string;
  title: string;
  subtitle: string;
  stages: string[];
  dropStage: string;
};

export type CrmFollowupsPageStrings = {
  stages: FollowupStage[];
  kinds: FollowupKind[];
  kanbanColumns: KanbanColumn[];
  tagChips: string[];
  pageTitle: string;
  pageDescription: string;
  crmDatabaseLink: string;
  addFollowup: string;
  globalSearchPlaceholder: string;
  statToday: string;
  statWeek: string;
  statOverdue: string;
  statTotal: string;
  funnelTitle: string;
  funnelHint: string;
  filterSectionTitle: string;
  filterSectionDescription: string;
  kindFilterLabel: string;
  kindFilterAll: string;
  kindFilterSuffix: string;
  stageFilterLabel: string;
  stageFilterAll: string;
  clearDateFilter: string;
  workspaceTitle: string;
  subtitleLoading: string;
  subtitleDraft: string;
  viewBoard: string;
  viewList: string;
  boardEmptyTitle: string;
  boardEmptyHint: string;
  boardDragHint: string;
  peopleUnit: string;
  listEmptyTitle: string;
  listEmptyHint: string;
  colNextFollowup: string;
  colKind: string;
  colStage: string;
  colContact: string;
  colCompany: string;
  colEmail: string;
  colGroups: string;
  colLastNote: string;
  colActions: string;
  overdue: string;
  today: string;
  urgentBadge: string;
  todayBadge: string;
  nextPrefix: string;
  edit: string;
  remove: string;
  removeConfirm: string;
  customerDetail: string;
  close: string;
  basicInfo: string;
  contact: string;
  jobTitle: string;
  phone: string;
  groups: string;
  quickActions: string;
  sendEmail: string;
  callPhone: string;
  fullEdit: string;
  timelineTitle: string;
  timelineHint: string;
  timelineSystem: string;
  timelineJoined: string;
  timelineDraft: string;
  timelineDraftDesc: string;
  timelineNote: string;
  timelineRecent: string;
  writeFollowup: string;
  notePlaceholder: string;
  saveNote: string;
  saving: string;
  addModalTitle: string;
  pickContactHint: string;
  searchPlaceholder: string;
  searching: string;
  noContactResults: string;
  selectedPrefix: string;
  reselect: string;
  followKindLabel: string;
  kindShortLong: string;
  kindLongLong: string;
  stageLabel: string;
  nextDateLabel: string;
  noteLabel: string;
  notePlaceholderShort: string;
  cancel: string;
  save: string;
  editModalTitle: string;
  kindShort: string;
  kindLong: string;
};

export function getCrmFollowupsPageStrings(locale: SiteLocale): CrmFollowupsPageStrings {
  const shared = getCrmSharedStrings(locale);
  if (locale === "en") {
    return {
      stages: [
        { value: "none", label: "Not contacted" },
        { value: "contacted", label: "Reached" },
        { value: "awaiting_reply", label: "Awaiting reply" },
        { value: "quoted", label: "Quoted" },
        { value: "nurturing", label: "Nurturing" },
        { value: "paused", label: "Paused" }
      ],
      kinds: [
        { value: "short", label: "Short-term" },
        { value: "long", label: "Long-term" }
      ],
      kanbanColumns: [
        { id: "pool", title: "To contact", subtitle: "Lead pool", stages: ["none"], dropStage: "none" },
        {
          id: "active",
          title: "In progress",
          subtitle: "Outreach · comms",
          stages: ["contacted", "awaiting_reply"],
          dropStage: "contacted"
        },
        { id: "deal", title: "Quote / deal", subtitle: "Negotiation", stages: ["quoted"], dropStage: "quoted" },
        {
          id: "nurture",
          title: "Nurture / pause",
          subtitle: "Long-term or dormant",
          stages: ["nurturing", "paused"],
          dropStage: "nurturing"
        }
      ],
      tagChips: ["VIP", "High intent", "Price sensitive", "No contact 7d"],
      pageTitle: "Follow-up pipeline",
      pageDescription:
        "Workbench draft: metrics, filters, board or list, drawer for 360° summary and timeline. Drag cards to change stage (saved via API). Tags and funnel are placeholders; enterprise can connect DB and AI.",
      crmDatabaseLink: shared.crmDatabaseLink,
      addFollowup: "Add follow-up",
      globalSearchPlaceholder: "Global search: company, email, notes… (syncs with list filters)",
      statToday: "Due today",
      statWeek: "Due this week",
      statOverdue: "Overdue",
      statTotal: "Follow-ups",
      funnelTitle: "Funnel (preview)",
      funnelHint: "Lead→won reporting TBD; enterprise can configure per line",
      filterSectionTitle: "Filters & tags",
      filterSectionDescription:
        "Dropdowns are live filters. Tag chips are UI draft — click to highlight; can map to custom fields or AI later.",
      kindFilterLabel: "Customer value / type",
      kindFilterAll: "All",
      kindFilterSuffix: " follow-up",
      stageFilterLabel: "Stage",
      stageFilterAll: "All",
      clearDateFilter: "Clear date filter",
      workspaceTitle: "Main workspace",
      subtitleLoading: "Loading…",
      subtitleDraft:
        "Draft layout: board / list toggle · right drawer · tags and conversion are previews (enterprise can add permissions and reports)",
      viewBoard: "Board",
      viewList: "List",
      boardEmptyTitle: "No cards on board",
      boardEmptyHint: "Add follow-ups from CRM contacts; cards appear by stage.",
      boardDragHint: "Drag cards between columns to update stage (saved to server). Click a card for the detail drawer.",
      peopleUnit: "people",
      listEmptyTitle: "No follow-up contacts",
      listEmptyHint: "Save contacts in CRM first, then click Add follow-up.",
      colNextFollowup: "Next follow-up",
      colKind: "Type",
      colStage: "Stage",
      colContact: "Contact",
      colCompany: "Company",
      colEmail: "Email",
      colGroups: "Groups",
      colLastNote: "Last note",
      colActions: "Actions",
      overdue: "Overdue",
      today: "Today",
      urgentBadge: "Due",
      todayBadge: "Today",
      nextPrefix: "Next",
      edit: "Edit",
      remove: "Remove",
      removeConfirm: "Remove from follow-up list? (CRM contact is not deleted)",
      customerDetail: "Customer detail",
      close: "Close",
      basicInfo: "Basic info",
      contact: "Contact",
      jobTitle: "Job title",
      phone: "Phone",
      groups: "Groups",
      quickActions: "Quick actions",
      sendEmail: "Email",
      callPhone: "Call",
      fullEdit: "Full edit",
      timelineTitle: "Activity timeline",
      timelineHint: "Draft: enterprise can log multi-touch events; showing preview + latest note",
      timelineSystem: "System",
      timelineJoined: "Added to follow-ups",
      timelineDraft: "Preview",
      timelineDraftDesc: "Email opens, calls, meetings can auto-log here",
      timelineNote: "Note",
      timelineRecent: "Recent",
      writeFollowup: "Write follow-up",
      notePlaceholder: "Call notes, next steps, AI summary paste…",
      saveNote: "Save follow-up note",
      saving: "Saving…",
      addModalTitle: "Add follow-up",
      pickContactHint: "Pick from existing CRM contacts (search email, company, name).",
      searchPlaceholder: "Search…",
      searching: "Searching…",
      noContactResults: "No results — add contacts in CRM database first.",
      selectedPrefix: "Selected:",
      reselect: "Change",
      followKindLabel: "Follow-up type",
      kindShortLong: "Short-term (near-term outcome)",
      kindLongLong: "Long-term (nurture)",
      stageLabel: "Stage",
      nextDateLabel: "Next follow-up date",
      noteLabel: "Note",
      notePlaceholderShort: "Call notes, todos…",
      cancel: "Cancel",
      save: "Save",
      editModalTitle: "Edit follow-up",
      kindShort: "Short-term",
      kindLong: "Long-term"
    };
  }
  return {
    stages: [
      { value: "none", label: "未联系" },
      { value: "contacted", label: "已触达" },
      { value: "awaiting_reply", label: "待回复" },
      { value: "quoted", label: "已报价" },
      { value: "nurturing", label: "培育中" },
      { value: "paused", label: "暂停" }
    ],
    kinds: [
      { value: "short", label: "短期" },
      { value: "long", label: "长期" }
    ],
    kanbanColumns: [
      { id: "pool", title: "待联系", subtitle: "线索池", stages: ["none"], dropStage: "none" },
      {
        id: "active",
        title: "跟进中",
        subtitle: "接洽 · 沟通",
        stages: ["contacted", "awaiting_reply"],
        dropStage: "contacted"
      },
      { id: "deal", title: "商机报价", subtitle: "谈判阶段", stages: ["quoted"], dropStage: "quoted" },
      {
        id: "nurture",
        title: "培育 / 暂停",
        subtitle: "长期或休眠",
        stages: ["nurturing", "paused"],
        dropStage: "nurturing"
      }
    ],
    tagChips: ["VIP", "高意向", "价格敏感", "7 天未联系"],
    pageTitle: "精选客户跟进",
    pageDescription:
      "工作台草稿（对齐常见 CRM 方案）：顶部指标、筛选与标签、看板或列表、点击卡片打开右侧抽屉查看 360° 摘要与时间线。拖拽卡片可调整阶段（调用接口）。标签 / 转化率为展示占位，企业版可接数据库与 AI。",
    crmDatabaseLink: shared.crmDatabaseLink,
    addFollowup: "添加跟进",
    globalSearchPlaceholder: "全局搜索：公司、邮箱、备注…（与列表筛选联动）",
    statToday: "今日任务",
    statWeek: "本周待办",
    statOverdue: "已逾期",
    statTotal: "精选客户数",
    funnelTitle: "转化漏斗（示意）",
    funnelHint: "线索→成交 待接报表；企业版可按业务线配置",
    filterSectionTitle: "筛选与标签",
    filterSectionDescription: "下拉为真实筛选；标签为 UI 草稿，点击仅高亮，后续可对接自定义字段或 AI 建议。",
    kindFilterLabel: "客户价值 / 类型",
    kindFilterAll: "全部",
    kindFilterSuffix: "跟进",
    stageFilterLabel: "阶段",
    stageFilterAll: "全部",
    clearDateFilter: "清除日期筛选",
    workspaceTitle: "主工作区",
    subtitleLoading: "加载中…",
    subtitleDraft: "豆包方案草稿：看板 / 列表切换 · 右侧抽屉详情 · 标签与转化为示意（企业版可接权限与报表）",
    viewBoard: "看板",
    viewList: "列表",
    boardEmptyTitle: "看板暂无卡片",
    boardEmptyHint: "从 CRM 添加跟进后，卡片会按阶段出现在各列中。",
    boardDragHint: "将卡片拖到另一列可更新阶段（保存到服务器）。点击卡片打开右侧详情抽屉。",
    peopleUnit: "人",
    listEmptyTitle: "暂无跟进客户",
    listEmptyHint: "请先在 CRM 入库联系人，再点「添加跟进」。",
    colNextFollowup: "下次跟进",
    colKind: "类型",
    colStage: "阶段",
    colContact: "联系人",
    colCompany: "公司",
    colEmail: "邮箱",
    colGroups: "分组",
    colLastNote: "最近备注",
    colActions: "操作",
    overdue: "逾期",
    today: "今天",
    urgentBadge: "急",
    todayBadge: "今",
    nextPrefix: "下次",
    edit: "编辑",
    remove: "移除",
    removeConfirm: "确定从跟进列表移除？（不会删除 CRM 联系人）",
    customerDetail: "客户详情",
    close: "关闭",
    basicInfo: "基础信息",
    contact: "联系人",
    jobTitle: "职位",
    phone: "电话",
    groups: "分组",
    quickActions: "快捷动作",
    sendEmail: "发邮件",
    callPhone: "拨打电话",
    fullEdit: "完整编辑",
    timelineTitle: "互动时间线",
    timelineHint: "草稿：企业版可写入多触点记录；当前展示示意 + 最新备注",
    timelineSystem: "系统",
    timelineJoined: "已加入精选跟进",
    timelineDraft: "草稿示意",
    timelineDraftDesc: "此处可接邮件打开、通话、会议等自动打点",
    timelineNote: "备注",
    timelineRecent: "最近",
    writeFollowup: "写跟进",
    notePlaceholder: "电话纪要、下次计划、AI 摘要粘贴…",
    saveNote: "保存跟进备注",
    saving: "保存中…",
    addModalTitle: "添加跟进",
    pickContactHint: "从 CRM 已有联系人中选择（可搜邮箱、公司、姓名）。",
    searchPlaceholder: "搜索…",
    searching: "搜索中…",
    noContactResults: "无结果，请先去 CRM 数据库写入联系人。",
    selectedPrefix: "已选：",
    reselect: "重选",
    followKindLabel: "跟进类型",
    kindShortLong: "短期（近期要结果）",
    kindLongLong: "长期（持续培育）",
    stageLabel: "阶段",
    nextDateLabel: "下次跟进日",
    noteLabel: "备注",
    notePlaceholderShort: "电话纪要、待办等",
    cancel: "取消",
    save: "保存",
    editModalTitle: "编辑跟进",
    kindShort: "短期",
    kindLong: "长期"
  };
}

export function labelFollowupStage(stages: FollowupStage[], value: string): string {
  return stages.find((s) => s.value === value)?.label ?? value;
}

export function labelFollowupKind(kinds: FollowupKind[], value: string): string {
  return kinds.find((k) => k.value === value)?.label ?? value;
}

export function columnIdForStage(kanbanColumns: KanbanColumn[], stage: string): string {
  const col = kanbanColumns.find((c) => c.stages.includes(stage));
  return col?.id ?? "pool";
}
