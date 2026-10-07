import type { SiteLocale } from "./siteLocaleTypes";

export type StandaloneDedicatedWorkbenchStrings = {
  pageTitle: string;
  pageDescription: string;
  dailyLimitLabel: string;
  dailyLimitUnit: string;
  laneCountLabel: string;
  laneCountUnit: string;
  domainSlotsLabel: string;
  domainSlotsUnit: string;
  multiLaneBanner: (laneCount: number) => string;
  sectionTitle: string;
  sectionDescription: string;
  licenseSlotsMismatch: (expected: number, actual: number) => string;
  licenseSlotsMismatchHint: string;
};

export function getStandaloneDedicatedWorkbenchStrings(locale: SiteLocale): StandaloneDedicatedWorkbenchStrings {
  if (locale === "en") {
    return {
      pageTitle: "Dedicated server provisioning",
      pageDescription:
        "After saving sender settings, complete VPS, SMTP, DKIM and DNS on this page, paste records at your DNS provider, then send a test email.",
      dailyLimitLabel: "Daily send cap",
      dailyLimitUnit: "emails/day",
      laneCountLabel: "Dedicated lanes",
      laneCountUnit: "lanes",
      domainSlotsLabel: "Sending domains",
      domainSlotsUnit: "slots",
      multiLaneBanner: (laneCount) =>
        `This plan includes ${laneCount} dedicated lane(s): select a lane above and add sending domains; in step 2 fill Relay/PTR IP and SSH for each group, then SMTP, DKIM and DNS per domain. Campaigns can send in parallel per lane.`,
      sectionTitle: "Sending domains & DNS",
      sectionDescription:
        "Step 1 save sender settings → Step 2 provision VPS & generate DNS → Step 3 paste DNS at registrar → test send.",
      licenseSlotsMismatch: (expected, actual) =>
        `LICENSE mismatch: this plan allows ${expected} sending domains but the server reports ${actual}.`,
      licenseSlotsMismatchHint:
        "Merge LICENSE.env from your order into install .env, then run: docker compose build --no-cache frontend && docker compose up -d && bash install.sh (or upgrade.sh)."
    };
  }
  return {
    pageTitle: "专机装机工作台",
    pageDescription: "保存发信资料后，在本页完成机组 VPS、SMTP、DKIM 与生成 DNS，再粘贴记录到域名服务商并发送测试邮件。",
    dailyLimitLabel: "日发上限",
    dailyLimitUnit: "封/日",
    laneCountLabel: "专线数量",
    laneCountUnit: "条",
    domainSlotsLabel: "发信域名名额",
    domainSlotsUnit: "个",
    multiLaneBanner: (laneCount) =>
      `本套餐含 ${laneCount} 条专线：请先在上方选择专线并添加发信域；在步骤 2 为每一组专机填写 Relay/PTR IP 与 SSH，再对该域做 SMTP、DKIM 与 DNS。邮件营销页各专线可并行发送。`,
    sectionTitle: "发信域名与 DNS",
    sectionDescription: "步骤 1 保存发信资料 → 步骤 2 机组装机与生成 DNS → 步骤 3 在域名后台粘贴 DNS → 测试发信。",
    licenseSlotsMismatch: (expected, actual) =>
      `LICENSE 名额不符：本套餐应支持 ${expected} 个发信域名，但当前服务器仅识别 ${actual} 个。`,
    licenseSlotsMismatchHint:
      "请将订单 ZIP 内 LICENSE.env 合并进安装目录 .env，然后执行：docker compose build --no-cache frontend && docker compose up -d，再运行 install.sh 或 upgrade.sh 同步套餐。"
  };
}
