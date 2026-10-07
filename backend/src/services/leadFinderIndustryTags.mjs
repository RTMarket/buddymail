/**
 * Industry tags from main business / description (1–5 tags, English).
 * Meta labels (LeadFinder缓存, 展会导入…) are NOT industry tags.
 */

export const MAJOR_INDUSTRY_TAGS = [
  "Semiconductors",
  "Gifts",
  "Mother & Baby",
  "Packaging",
  "Technology",
  "Internet",
  "Software/SaaS",
  "Manufacturing",
  "Healthcare",
  "Biotech/Pharma",
  "Finance",
  "Education",
  "Retail/E-commerce",
  "Consumer Goods",
  "Energy",
  "Clean Energy",
  "Real Estate/Construction",
  "Media/Entertainment",
  "Advertising/Marketing",
  "Logistics",
  "Professional Services",
  "Consulting",
  "Legal",
  "Human Resources",
  "Agriculture",
  "Food & Beverage",
  "Automotive",
  "Aerospace",
  "Chemicals",
  "Environment",
  "Travel/Hospitality",
  "Telecom",
  "Hardware/Electronics",
  "Gaming",
  "Pets",
  "Advanced Materials",
  "Non-profit",
  "Other"
];

/** Legacy Chinese → English */
const ZH_TO_EN = {
  半导体: "Semiconductors",
  礼品: "Gifts",
  母婴: "Mother & Baby",
  包装: "Packaging",
  科技: "Technology",
  互联网: "Internet",
  "软件/SaaS": "Software/SaaS",
  制造业: "Manufacturing",
  医疗健康: "Healthcare",
  生物医药: "Biotech/Pharma",
  金融: "Finance",
  教育培训: "Education",
  零售电商: "Retail/E-commerce",
  消费品: "Consumer Goods",
  能源: "Energy",
  新能源: "Clean Energy",
  "房地产/建筑": "Real Estate/Construction",
  媒体娱乐: "Media/Entertainment",
  广告营销: "Advertising/Marketing",
  物流运输: "Logistics",
  专业服务: "Professional Services",
  咨询: "Consulting",
  法律: "Legal",
  人力资源: "Human Resources",
  农业: "Agriculture",
  食品饮料: "Food & Beverage",
  汽车: "Automotive",
  航空航天: "Aerospace",
  化工: "Chemicals",
  环保: "Environment",
  旅游酒店: "Travel/Hospitality",
  电信: "Telecom",
  硬件电子: "Hardware/Electronics",
  游戏: "Gaming",
  宠物: "Pets",
  新材料: "Advanced Materials",
  非营利: "Non-profit",
  其他: "Other"
};

function normalizeTag(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (ZH_TO_EN[t]) return ZH_TO_EN[t];
  if (MAJOR_INDUSTRY_TAGS.includes(t)) return t;
  return t;
}

const META_TAG_RE =
  /^(LeadFinder|lead.?finder|展会录入|展会线索|展会导入|综合名片|migrate-|exhibition:|domain_finder|plugin|page|generic|pattern)$/i;

const RULES = [
  { tag: "Semiconductors", re: /半导体|semiconductor|chip|晶圆|集成电路|ic设计/i },
  { tag: "Packaging", re: /包装|packaging|包材|纸箱|软包|薄膜/i },
  { tag: "Gifts", re: /礼品|gift|促销品|伴手礼|文创/i },
  { tag: "Mother & Baby", re: /母婴|婴儿|童装|奶粉|纸尿裤|孕/i },
  { tag: "Pets", re: /宠物|pet|狗粮|猫粮|兽医/i },
  { tag: "Advanced Materials", re: /新材料|polymer|复合材料|纳米材料|工程塑料|玻纤|橡塑/i },
  {
    tag: "Software/SaaS",
    re: /\b(saas|software|cloud|devops|api platform|b2b software)\b|软件|云计算|信息系统/i
  },
  {
    tag: "Internet",
    re: /\b(internet|marketplace|ecommerce platform|web portal|online)\b|互联网|电商平台|在线/i
  },
  {
    tag: "Technology",
    re: /\b(technology|tech|ai|artificial intelligence|machine learning|robotics)\b|科技|人工智能|数字化/i
  },
  {
    tag: "Hardware/Electronics",
    re: /\b(hardware|electronics|iot|pcb|sensor)\b|硬件|电子|物联网|芯片/i
  },
  { tag: "Gaming", re: /\b(game|gaming|esports)\b|游戏|电竞/i },
  {
    tag: "Healthcare",
    re: /\b(health|healthcare|hospital|medical device|clinic|diagnostic|sleep\s*test|home\s*sleep|polysomn|aasm|cpap|sleep\s*apnea|patient\s*monitor)\b|医疗|健康|医院|器械|诊断|睡眠检测|睡眠监测/i
  },
  {
    tag: "Biotech/Pharma",
    re: /\b(biotech|pharma|pharmaceutical|life science|drug)\b|生物|医药|制药|生命科学/i
  },
  {
    tag: "Finance",
    re: /\b(finance|fintech|bank|insurance|payment|invest)\b|金融|银行|保险|支付|投资/i
  },
  {
    tag: "Education",
    re: /\b(education|edtech|university|training|school)\b|教育|培训|学校|在线教育/i
  },
  {
    tag: "Retail/E-commerce",
    re: /\b(retail|e-?commerce|shop|store|marketplace)\b|零售|电商|商城|购物/i
  },
  { tag: "Consumer Goods", re: /\b(consumer|fmcg|cpg|brand)\b|消费品|快消|品牌/i },
  {
    tag: "Manufacturing",
    re: /\b(manufactur|industrial|factory|machinery|equipment)\b|制造|工厂|机械|工业|生产/i
  },
  { tag: "Automotive", re: /\b(automotive|auto|vehicle|ev\b|car)\b|汽车|新能源车/i },
  {
    tag: "Aerospace",
    re: /\b(aerospace|aviation|aircraft|space|无人机|uav)\b|航空|航天|飞机/i
  },
  { tag: "Energy", re: /\b(energy|oil|gas|power|utility)\b|能源|石油|电力/i },
  {
    tag: "Clean Energy",
    re: /\b(renewable|solar|wind|battery|clean energy)\b|新能源|光伏|风电|储能/i
  },
  {
    tag: "Chemicals",
    re: /\b(chemical|materials|plastic|polymer|resin)\b|化工|材料|聚合物|塑料|橡塑|工程塑料/i
  },
  {
    tag: "Environment",
    re: /\b(environment|sustainab|recycl|waste|carbon)\b|环保|碳中和|回收/i
  },
  {
    tag: "Real Estate/Construction",
    re: /\b(real estate|property|construction|architect)\b|房地产|建筑|物业/i
  },
  {
    tag: "Logistics",
    re: /\b(logistics|shipping|freight|supply chain|transport)\b|物流|运输|供应链|货运/i
  },
  {
    tag: "Telecom",
    re: /\b(telecom|telecommunications|5g|network operator)\b|电信|通信|运营商/i
  },
  {
    tag: "Media/Entertainment",
    re: /\b(media|entertainment|streaming|film|music|publishing)\b|媒体|娱乐|影视|出版/i
  },
  {
    tag: "Advertising/Marketing",
    re: /\b(advertis|marketing|agency|martech|seo|sem)\b|广告|营销|投放/i
  },
  {
    tag: "Professional Services",
    re: /\b(professional services|accounting|audit)\b|专业服务|会计|审计/i
  },
  { tag: "Consulting", re: /\b(consulting|advisory|strategy firm)\b|咨询|顾问/i },
  { tag: "Legal", re: /\b(law firm|legal|attorney|lawyer)\b|法律|律师|律所/i },
  {
    tag: "Human Resources",
    re: /\b(human resources|hrtech|recruit|staffing)\b|人力|招聘|猎头/i
  },
  { tag: "Agriculture", re: /\b(agriculture|agtech|farming)\b|农业|农技|种植/i },
  { tag: "Food & Beverage", re: /\b(food|beverage|restaurant|f&b)\b|食品|饮料|餐饮/i },
  {
    tag: "Travel/Hospitality",
    re: /\b(travel|hotel|hospitality|tourism)\b|旅游|酒店|出行/i
  },
  { tag: "Non-profit", re: /\b(non-?profit|ngo|charity|foundation)\b|非营利|公益|基金会/i }
];

export function isIndustryTag(tag) {
  const t = normalizeTag(tag);
  if (!t || t.length > 48) return false;
  if (META_TAG_RE.test(t)) return false;
  if (/leadfinder|展会(录入|导入|线索|数据)|综合名片|migrate-|domain_finder/i.test(t)) return false;
  if (/\.(csv|xlsx|xls|jpg|png)$/i.test(t)) return false;
  if (/^exh-/.test(t)) return false;
  if (MAJOR_INDUSTRY_TAGS.includes(t)) return true;
  return RULES.some((r) => r.tag === t);
}

/** Keep only valid industry tags for CSV / display */
export function filterIndustryTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(tags) ? tags : []) {
    const t = normalizeTag(raw);
    if (!isIndustryTag(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 5);
}

/**
 * Classify 1–5 industry tags from main business / description / company name.
 */
export function classifyMajorIndustryTags(input) {
  const industry = normalizeTag(input?.industry || "");
  const description = String(input?.description || input?.mainBusiness || "").trim();
  const companyName = String(input?.companyName || input?.name || "").trim();
  const existing = Array.isArray(input?.tags) ? input.tags.map(normalizeTag).filter(Boolean) : [];
  const blob = `${industry}\n${description}\n${companyName}\n${existing.filter(isIndustryTag).join(" ")}`;

  const out = new Set();
  for (const t of existing) {
    if (isIndustryTag(t)) out.add(t);
  }
  if (industry && isIndustryTag(industry)) out.add(industry);
  for (const rule of RULES) {
    if (rule.re.test(blob)) out.add(rule.tag);
  }
  for (const m of MAJOR_INDUSTRY_TAGS) {
    if (industry && (industry === m || industry.includes(m))) out.add(m);
    if (description && description.includes(m)) out.add(m);
  }
  if (!out.size && (industry || description || companyName)) out.add(industry && industry !== "Other" ? industry : "Other");
  if (out.size > 1) out.delete("Other");
  return [...out].slice(0, 5);
}
