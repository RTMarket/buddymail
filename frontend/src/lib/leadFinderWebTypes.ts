export type LeadFinderEmailStatus =
  | "valid"
  | "invalid"
  | "risky"
  | "unverified"
  | "no_email"
  | "verifying"
  | "queued"
  | "none"
  | string;

export type LeadFinderContact = {
  contact_name?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  kind?: "people" | "decision_makers" | "generic" | string | null;
  email_status?: LeadFinderEmailStatus | null;
  source?: string | null;
};

export type LeadFinderCompanyBlock = {
  domain: string;
  company_name: string;
  website?: string | null;
  industry?: string | null;
  company_type?: string | null;
  size?: string | null;
  location?: string | null;
  country?: string | null;
  /** 城市（与 location 分开展示） */
  city?: string | null;
  year_founded?: string | null;
  funding_series?: string | null;
  funding_amount?: string | null;
  last_funding_date?: string | null;
  source?: string | null;
  description?: string | null;
  tags?: string[];
  technology?: string[];
  signals?: string[];
  linkedin?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  Instagram?: string | null;
  instagram?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  /** 企业总机 / 公开电话 */
  phone?: string | null;
  columns: string[];
  contacts: LeadFinderContact[];
};

export type LeadFinderScrapePack = {
  ok?: boolean;
  domain?: string;
  company?: Record<string, unknown>;
  items?: LeadFinderContact[];
  peopleHints?: Array<{ name: string; title?: string | null; sourceUrl?: string }>;
  pagesFetched?: string[];
  aiContext?: string;
  signals?: string[];
  message?: string;
};

export type ProgressLaneId =
  | "__crawl"
  | "__news"
  | "__titles"
  | "__linkedin_web"
  | string;

export type ProgressItemState = {
  id: ProgressLaneId;
  label: string;
  status: "queued" | "running" | "done" | "error";
  note: string;
  /** 阶段标题行 */
  isPhase?: boolean;
};
