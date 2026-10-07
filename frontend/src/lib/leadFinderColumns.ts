/** Hunter-style Columns — 与 Chrome 插件 `COMPANY_COLUMNS` 对齐 */
export type LeadFinderColumnId =
  | "website"
  | "source"
  | "location"
  | "industry"
  | "size"
  | "company_type"
  | "tags"
  | "technology"
  | "country"
  | "year_founded"
  | "funding_series"
  | "funding_amount"
  | "last_funding_date"
  | "linkedin"
  | "twitter"
  | "facebook"
  | "youtube"
  | "instagram"
  | "description"
  | "updated_at"
  | "created_at"
  | "emails";

export type LeadFinderColumnDef = {
  id: LeadFinderColumnId;
  zh: string;
  en: string;
  defaultOn: boolean;
};

export const LEAD_FINDER_COLUMNS: LeadFinderColumnDef[] = [
  { id: "website", zh: "网站", en: "Website", defaultOn: true },
  { id: "source", zh: "来源", en: "Source", defaultOn: true },
  { id: "location", zh: "地区", en: "Location", defaultOn: true },
  { id: "industry", zh: "行业", en: "Industry", defaultOn: true },
  { id: "size", zh: "规模", en: "Size", defaultOn: true },
  { id: "company_type", zh: "公司类型", en: "Company type", defaultOn: true },
  { id: "tags", zh: "标签", en: "Tags", defaultOn: true },
  { id: "country", zh: "国家", en: "Country", defaultOn: true },
  { id: "year_founded", zh: "成立年份", en: "Year founded", defaultOn: true },
  { id: "funding_series", zh: "融资轮次", en: "Funding series", defaultOn: false },
  { id: "funding_amount", zh: "融资金额", en: "Funding amount", defaultOn: false },
  { id: "last_funding_date", zh: "最近融资日", en: "Last funding date", defaultOn: false },
  { id: "linkedin", zh: "LinkedIn", en: "LinkedIn", defaultOn: true },
  { id: "twitter", zh: "X / Twitter", en: "X / Twitter", defaultOn: false },
  { id: "facebook", zh: "Facebook", en: "Facebook", defaultOn: false },
  { id: "youtube", zh: "YouTube", en: "YouTube", defaultOn: false },
  { id: "instagram", zh: "Instagram", en: "Instagram", defaultOn: false },
  { id: "description", zh: "公司简介", en: "Description", defaultOn: true },
  { id: "updated_at", zh: "更新时间", en: "Updated at", defaultOn: false },
  { id: "created_at", zh: "创建时间", en: "Created at", defaultOn: false }
];

export const LEAD_FINDER_EMAIL_FILTERS = [
  { id: "people" as const, zh: "个人", en: "People" },
  { id: "decision_makers" as const, zh: "决策者", en: "Decision makers" },
  { id: "generic" as const, zh: "通用", en: "Generic" }
];

export const DEFAULT_LEAD_FINDER_COLUMNS: LeadFinderColumnId[] = LEAD_FINDER_COLUMNS.filter(
  (c) => c.defaultOn
).map((c) => c.id);

export const MAX_DOMAINS_PER_PAGE = 15;
