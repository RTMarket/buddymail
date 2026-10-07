import React from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";

const STEPS: {
  n: number;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  to: string;
  ctaZh: string;
  ctaEn: string;
}[] = [
  {
    n: 1,
    titleZh: "输入行业调研目标",
    titleEn: "Set research targets",
    bodyZh: "填写行业标签、关键词，以及需要调研的方向，明确本轮获客要覆盖的市场与主题。",
    bodyEn: "Enter industry tags, keywords, and the research direction for this outreach cycle.",
    to: "/leads/search",
    ctaZh: "去 Leads 搜索",
    ctaEn: "Open Leads search"
  },
  {
    n: 2,
    titleZh: "进入企业搜索",
    titleEn: "Company & people search",
    bodyZh: "找人、找职位、找关键决策者，并补齐联系方式，形成可跟进的企业名单。",
    bodyEn: "Find companies, roles, decision makers, and contact details.",
    to: "/leads/search",
    ctaZh: "去企业leads精搜",
    ctaEn: "Open company leads search"
  },
  {
    n: 3,
    titleZh: "定制化开发信 · 深度开发信 · 邮件营销",
    titleEn: "Custom outreach & email campaigns",
    bodyZh: "撰写定制开发信与深度开发信，再进入邮件营销完成活动发送与统计。",
    bodyEn: "Write tailored outreach, then run email campaigns and stats.",
    to: "/email/campaigns",
    ctaZh: "去邮件营销",
    ctaEn: "Open campaigns"
  },
  {
    n: 4,
    titleZh: "社媒发布帖子",
    titleEn: "Social publishing",
    bodyZh: "一键管理多社媒平台发布：频道区，以及 LinkedIn / TikTok / 微信等已开通渠道。",
    bodyEn: "Publish across connected social channels from one place.",
    to: "/social/library",
    ctaZh: "去社媒发布",
    ctaEn: "Open social studio"
  },
  {
    n: 5,
    titleZh: "管理 CRM 数据库",
    titleEn: "CRM database",
    bodyZh: "把线索沉淀进 CRM：新增客户、数据库管理、精选跟进。",
    bodyEn: "Store leads in CRM, manage the database, and follow up.",
    to: "/email/contacts/database",
    ctaZh: "打开 CRM 数据库",
    ctaEn: "Open CRM"
  },
  {
    n: 6,
    titleZh: "AI 智能汇报 · 跟进建议 · 总结",
    titleEn: "AI reports & follow-up advice",
    bodyZh: "日报由桌宠和「每日日报总结」显示同一份：搜索、验邮、发信和开发信。",
    bodyEn: "The desktop assistant and Daily report show the same search, verification, and send summary.",
    to: "/b2b-ai/daily-report",
    ctaZh: "打开每日日报",
    ctaEn: "Open daily report"
  }
];

export function B2bAiFlowPage() {
  const { locale } = useSiteLocale();
  const zh = locale !== "en";

  return (
    <PageShell
      title={zh ? "B2B AI" : "B2B AI"}
      description={
        zh
          ? "企业 B2B · BD AI 自动获客流程。按下列 6 步走完调研、找人、开发信、社媒、CRM 与智能汇报。"
          : "Enterprise B2B · BD AI acquisition flow: research, people search, outreach, social, CRM, and AI follow-up."
      }
    >
      <SectionCard
        title={zh ? "企业 B2B · BD AI 自动获客流程" : "Enterprise B2B · BD AI acquisition"}
        description={zh ? "从行业调研到跟进总结的一条主线" : "One path from research to follow-up"}
      >
        <ol className="space-y-4 p-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {step.n}. {zh ? step.titleZh : step.titleEn}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{zh ? step.bodyZh : step.bodyEn}</p>
                </div>
                <Link
                  to={step.to}
                  className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {zh ? step.ctaZh : step.ctaEn}
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>
    </PageShell>
  );
}
