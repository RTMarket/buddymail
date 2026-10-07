/** Lead Finder 网页版 · 职位勾选（搜人目标） */
export type LeadFinderRoleTierId =
  | "cxo"
  | "founder"
  | "partner"
  | "director"
  | "consultant"
  | "procurement"
  | "sales"
  | "marketing"
  | "finance"
  | "hr"
  | "tech";

export type LeadFinderRoleTier = {
  id: LeadFinderRoleTierId;
  zh: string;
  en: string;
  /** 匹配用关键词（小写） */
  keywords: string[];
  defaultOn: boolean;
};

export const LEAD_FINDER_ROLE_TIERS: LeadFinderRoleTier[] = [
  {
    id: "cxo",
    zh: "CXO（CEO / CMO / CTO / COO / CIO / CFO…）",
    en: "CXO (CEO / CMO / CTO / COO / CIO / CFO…)",
    defaultOn: true,
    keywords: [
      "ceo",
      "cmo",
      "cto",
      "coo",
      "cio",
      "cfo",
      "cro",
      "cpo",
      "chro",
      "ciso",
      "cdo",
      "cxo",
      "chief executive",
      "chief marketing",
      "chief technology",
      "chief operating",
      "chief information",
      "chief financial",
      "chief revenue",
      "chief product",
      "chief people",
      "chief commercial",
      "chief digital",
      "president"
    ]
  },
  {
    id: "founder",
    zh: "Founder / Co-Founder",
    en: "Founder / Co-Founder",
    defaultOn: true,
    keywords: ["founder", "co-founder", "co founder", "cofounder", "chairman", "executive chairman"]
  },
  {
    id: "partner",
    zh: "Partner / Managing Partner",
    en: "Partner / Managing Partner",
    defaultOn: true,
    keywords: ["partner", "managing partner", "general partner"]
  },
  {
    id: "director",
    zh: "Director / 各部门总监 / Head of",
    en: "Director / Head of (dept.)",
    defaultOn: true,
    keywords: [
      "director",
      "head of",
      "managing director",
      "marketing director",
      "sales director",
      "engineering director",
      "finance director",
      "product director",
      "commercial director",
      "country manager",
      "country head",
      "country leader",
      "general manager",
      "vp ",
      "vice president",
      "svp",
      "evp"
    ]
  },
  {
    id: "consultant",
    zh: "Consultant / Advisor",
    en: "Consultant / Advisor",
    defaultOn: true,
    keywords: ["consultant", "advisor", "adviser", "principal consultant", "senior consultant"]
  },
  {
    id: "procurement",
    zh: "采购 / 供应链（采购部总监 / 采购经理 / 买手…）",
    en: "Procurement / Supply Chain (CPO, Procurement Director/Manager, Buyer…)",
    defaultOn: false,
    keywords: [
      "procurement",
      "purchasing",
      "sourcing",
      "supply chain",
      "buyer",
      "cpo",
      "chief procurement",
      "procurement director",
      "procurement manager",
      "purchasing manager",
      "strategic sourcing",
      "vendor management"
    ]
  },
  {
    id: "sales",
    zh: "销售 / 业务拓展（销售总监 / 大客户 / BD…）",
    en: "Sales / Business Development (Sales Director, Key Account, BD…)",
    defaultOn: false,
    keywords: [
      "sales",
      "business development",
      "account executive",
      "key account",
      "sdr",
      "bdr",
      "sales development",
      "inside sales",
      "field sales",
      "sales director",
      "sales manager",
      "revenue"
    ]
  },
  {
    id: "marketing",
    zh: "市场 / 品牌 / 增长（市场总监 / 品牌 / 数字营销…）",
    en: "Marketing / Brand / Growth (Marketing Director, Brand, Digital Marketing…)",
    defaultOn: false,
    keywords: [
      "marketing",
      "brand",
      "digital marketing",
      "growth",
      "demand generation",
      "content marketing",
      "product marketing",
      "communications",
      "public relations",
      "marketing director",
      "marketing manager"
    ]
  },
  {
    id: "finance",
    zh: "财务 / 会计（财务总监 / 会计 / 审计…）",
    en: "Finance / Accounting (Finance Director, Accountant, Audit…)",
    defaultOn: false,
    keywords: [
      "finance",
      "accounting",
      "accountant",
      "controller",
      "fp&a",
      "audit",
      "treasurer",
      "treasury",
      "finance director",
      "finance manager"
    ]
  },
  {
    id: "hr",
    zh: "人力资源 / 招聘（HR 总监 / 招聘 / 人才…）",
    en: "HR / Talent Acquisition (HR Director, Recruiter, Talent…)",
    defaultOn: false,
    keywords: [
      "human resources",
      "talent acquisition",
      "recruiter",
      "recruiting",
      "talent management",
      "people operations",
      "hr director",
      "hr manager",
      "hr business partner",
      "head of hr",
      "vp hr",
      "chief people"
    ]
  },
  {
    id: "tech",
    zh: "技术 / IT / 研发（IT 总监 / 工程师 / 研发…）",
    en: "Technology / IT / R&D (IT Director, Engineer, R&D…)",
    defaultOn: false,
    keywords: [
      "engineer",
      "engineering",
      "developer",
      "software",
      "it ",
      "information technology",
      "devops",
      "r&d",
      "research and development",
      "qa",
      "quality assurance",
      "it director",
      "it manager",
      "systems administrator"
    ]
  }
];

export const DEFAULT_LEAD_FINDER_ROLES: LeadFinderRoleTierId[] = LEAD_FINDER_ROLE_TIERS.filter(
  (t) => t.defaultOn
).map((t) => t.id);

export function titleMatchesSelectedRoles(
  title: string | null | undefined,
  selected: LeadFinderRoleTierId[]
): boolean {
  if (!selected.length) return true;
  const t = String(title || "").toLowerCase();
  if (!t.trim()) return true; // 无职位暂留，验邮前仍可展示
  for (const id of selected) {
    const tier = LEAD_FINDER_ROLE_TIERS.find((x) => x.id === id);
    if (!tier) continue;
    if (tier.keywords.some((k) => t.includes(k))) return true;
    // CXO：匹配所有 C…O 缩写（CEO/CMO/CTO/COO/CIO/CFO/CRO…）
    if (id === "cxo" && /\bc[a-z]{1,4}o\b/.test(t)) return true;
  }
  return false;
}
