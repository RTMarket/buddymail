import { validateLoginPassword } from "../lib/passwordPolicy";
import type { SiteLocale } from "./siteLocaleTypes";

export type AccountCenterStrings = {
  pageTitle: string;
  accountInfoTitle: string;
  currentAccountLabel: string;
  licenseHint: string;
  changePasswordTitle: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  savePassword: string;
  saving: string;
  passwordUpdated: string;
  changeFailed: string;
  passwordMismatch: string;
};

export function getAccountCenterStrings(locale: SiteLocale): AccountCenterStrings {
  if (locale === "en") {
    return {
      pageTitle: "Account settings",
      accountInfoTitle: "Account info",
      currentAccountLabel: "Signed in as",
      licenseHint:
        "Self-hosted edition · Daily send limits and white-label are controlled by your install LICENSE. Renew or upgrade on the BigSocialBoss main site.",
      changePasswordTitle: "Change password",
      newPasswordLabel: "New password (6 letters or digits)",
      confirmPasswordLabel: "Confirm new password",
      savePassword: "Save new password",
      saving: "Saving…",
      passwordUpdated: "Password updated",
      changeFailed: "Could not update password",
      passwordMismatch: "The two new passwords do not match"
    };
  }
  return {
    pageTitle: "个人中心",
    accountInfoTitle: "账户信息",
    currentAccountLabel: "当前登录账号：",
    licenseHint:
      "独立部署版 · 日发上限与去品牌由安装 LICENSE 控制，续费/升级请前往 BigSocialBoss 主站。",
    changePasswordTitle: "修改密码",
    newPasswordLabel: "新密码（6 位字母或数字）",
    confirmPasswordLabel: "确认新密码",
    savePassword: "保存新密码",
    saving: "保存中…",
    passwordUpdated: "密码已更新",
    changeFailed: "修改失败",
    passwordMismatch: "两次输入的新密码不一致"
  };
}

export function validateLoginPasswordLocalized(password: string, locale: SiteLocale): string | null {
  const err = validateLoginPassword(password);
  if (!err) return null;
  if (locale === "en") {
    return "Password must be exactly 6 characters using letters and digits only (all letters, all digits, or mixed).";
  }
  return err;
}
