/** Lead Finder web · major industry tags (aligned with warehouse / Chrome plugin). */

const MAJOR = [
  "科技",
  "互联网",
  "软件/SaaS",
  "制造业",
  "医疗健康",
  "生物医药",
  "金融",
  "教育培训",
  "零售电商",
  "消费品",
  "能源",
  "新能源",
  "房地产/建筑",
  "媒体娱乐",
  "广告营销",
  "物流运输",
  "专业服务",
  "咨询",
  "法律",
  "人力资源",
  "农业",
  "食品饮料",
  "汽车",
  "航空航天",
  "化工",
  "环保",
  "旅游酒店",
  "电信",
  "硬件电子",
  "游戏",
  "非营利",
  "其他"
] as const;

const RULES: Array<{ tag: string; re: RegExp }> = [
  {
    tag: "医疗健康",
    re: /\b(health|healthcare|hospital|medical device|clinic|diagnostic|sleep\s*test|home\s*sleep|polysomn|aasm|cpap|sleep\s*apnea|patient\s*monitor)\b|医疗|健康|医院|器械|诊断|睡眠检测|睡眠监测/i
  },
  { tag: "生物医药", re: /\b(biotech|pharma|pharmaceutical|life science|drug)\b|生物|医药|制药|生命科学/i },
  { tag: "软件/SaaS", re: /\b(saas|software|cloud|devops)\b|软件|云计算/i },
  { tag: "互联网", re: /\b(internet|marketplace|ecommerce)\b|互联网|电商平台/i },
  { tag: "科技", re: /\b(technology|tech|ai|robotics)\b|科技|人工智能/i },
  { tag: "硬件电子", re: /\b(hardware|electronics|iot|sensor)\b|硬件|电子|物联网/i },
  { tag: "制造业", re: /\b(manufactur|industrial|factory|machinery)\b|制造|工厂|机械/i },
  { tag: "金融", re: /\b(finance|fintech|bank|insurance)\b|金融|银行|保险/i },
  { tag: "零售电商", re: /\b(retail|e-?commerce|shop)\b|零售|电商/i }
];

export function classifyMajorIndustryTags(input: {
  industry?: string | null;
  description?: string | null;
  tags?: string[] | null;
  companyName?: string | null;
}): string[] {
  const industry = String(input.industry || "").trim();
  const description = String(input.description || "").trim();
  const companyName = String(input.companyName || "").trim();
  const existing = Array.isArray(input.tags) ? input.tags.map(String) : [];
  const blob = `${industry}\n${description}\n${companyName}\n${existing.join(" ")}`;
  const out = new Set<string>();
  for (const t of existing) {
    const hit = MAJOR.find((m) => m === t || t.includes(m));
    if (hit && hit !== "其他") out.add(hit);
  }
  for (const rule of RULES) {
    if (rule.re.test(blob)) out.add(rule.tag);
  }
  for (const m of MAJOR) {
    if (m === "其他") continue;
    if (industry && (industry === m || industry.includes(m))) out.add(m);
  }
  if (!out.size && (industry || description || companyName)) {
    out.add(industry && industry !== "其他" ? industry : "其他");
  }
  if (out.size > 1) out.delete("其他");
  return [...out].slice(0, 6);
}
