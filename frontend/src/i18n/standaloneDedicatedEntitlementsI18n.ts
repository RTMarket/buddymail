import type { SiteLocale } from "./siteLocaleTypes";

export type StandaloneDedicatedEntitlementsStrings = {
  quotaLabel: string;
  domainLabel: string;
  laneLabel: string;
  laneLabelAdmin: string;
  lineHintSuffix: string;
  dailySend: (label: string) => string;
  needDelete: (n: number) => string;
  laneQuotaTitle: string;
  readOnly: string;
  sendingDomainLabel: string;
  packageLaneQuotaTitle: string;
  dailyLimitPrefix: string;
  readOnlyRef: string;
  remaining: (n: number) => string;
  full: string;
  remainingLanes: (n: number, suffix: string) => string;
  footnote: string;
};

export function getStandaloneDedicatedEntitlementsStrings(
  locale: SiteLocale
): StandaloneDedicatedEntitlementsStrings {
  if (locale === "en") {
    return {
      quotaLabel: "Quota",
      domainLabel: "Domains",
      laneLabel: "Lanes",
      laneLabelAdmin: "VPS groups",
      lineHintSuffix: "",
      dailySend: (label) => `Daily cap ${label}`,
      needDelete: (n) => `remove ${n}`,
      laneQuotaTitle: "Lane quota",
      readOnly: "Read-only",
      sendingDomainLabel: "Sending domains",
      packageLaneQuotaTitle: "Plan lane quota",
      dailyLimitPrefix: "Daily cap",
      readOnlyRef: "read-only reference",
      remaining: (n) => `${n} left`,
      full: "Full",
      remainingLanes: (n, suffix) => `${n} left${suffix}`,
      footnote:
        "Under 5,000 emails/day = 1 sending domain + 1 lane; each +5,000/day adds 1 domain slot (e.g. 120k/day up to 24 domains), each +20,000/day adds 1 lane. High daily volume should match lanes (e.g. 120k suggests 6 domains + 6 lanes). Display only; approval limits still apply."
    };
  }
  return {
    quotaLabel: "名额",
    domainLabel: "域名",
    laneLabel: "专线",
    laneLabelAdmin: "双机组",
    lineHintSuffix: "条",
    dailySend: (label) => `日发 ${label}`,
    needDelete: (n) => `需删 ${n}`,
    laneQuotaTitle: "专线名额",
    readOnly: "只读",
    sendingDomainLabel: "发信域名",
    packageLaneQuotaTitle: "套餐专线名额",
    dailyLimitPrefix: "日发上限",
    readOnlyRef: "只读参考",
    remaining: (n) => `还可 ${n}`,
    full: "已满",
    remainingLanes: (n, suffix) => `还可 ${n}${suffix}`,
    footnote:
      "<5,000 封/日为 1 个发信域名额、1 条专线；每 +5,000 日发 +1 域名名额（如 12 万日发最多 24 个），每 +20,000 日发 +1 条专线。高日发建议至少按专线组数配置发信域（如 12 万建议 6 域 + 6 专线）。本页仅展示，申请上限仍以平台审核为准。"
  };
}
