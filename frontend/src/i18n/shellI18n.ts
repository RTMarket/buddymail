import type { SiteLocale } from "./siteLocaleTypes";

export type AppLayoutStrings = {
  notActivated: string;
  customChannelTitle: string;
  customChannelLabel: string;
  expandSidebar: string;
  collapseSidebar: string;
  workbench: string;
};

export type ShellConfirmStrings = {
  confirm: string;
  cancel: string;
  pageLoadingAria: string;
};

export type SiteLanguageSwitcherStrings = {
  label: string;
  zhOption: string;
  enOption: string;
};

export function getSiteLanguageSwitcherStrings(locale: SiteLocale): SiteLanguageSwitcherStrings {
  if (locale === "en") {
    return {
      label: "Language",
      zhOption: "Chinese (中文)",
      enOption: "English"
    };
  }
  return {
    label: "选择语言",
    zhOption: "中文",
    enOption: "English"
  };
}

export function getShellConfirmStrings(locale: SiteLocale): ShellConfirmStrings {
  if (locale === "en") {
    return {
      confirm: "Confirm",
      cancel: "Cancel",
      pageLoadingAria: "Loading page"
    };
  }
  return {
    confirm: "确认",
    cancel: "取消",
    pageLoadingAria: "页面加载中"
  };
}

export function getAppLayoutStrings(locale: SiteLocale): AppLayoutStrings {
  if (locale === "en") {
    return {
      notActivated: "Not activated",
      customChannelTitle: "Custom channel — contact support",
      customChannelLabel: "Custom (mid / bulk volume)",
      expandSidebar: "Expand sidebar",
      collapseSidebar: "Collapse sidebar",
      workbench: "Workbench"
    };
  }
  return {
    notActivated: "未开通",
    customChannelTitle: "定制通道，请联系客服",
    customChannelLabel: "定制通道（中量 / 巨量）",
    expandSidebar: "展开侧边导航",
    collapseSidebar: "收起侧边导航",
    workbench: "工作台"
  };
}

export function getRequireAuthStrings(locale: SiteLocale) {
  if (locale === "en") {
    return {
      connecting: "Connecting to server…",
      slowHint:
        "If this takes more than 15 seconds, the database may be busy. Refresh later, or close other tabs with active sends and try again."
    };
  }
  return {
    connecting: "正在连接服务器…",
    slowHint:
      "若超过 15 秒仍无响应，多为服务器数据库繁忙；请稍后刷新，或关闭其它「发送中」页面标签后重试。"
  };
}
