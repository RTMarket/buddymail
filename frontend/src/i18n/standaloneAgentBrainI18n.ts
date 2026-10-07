import type { SiteLocale } from "./siteLocaleTypes";

export function getAgentBrainStrings(locale: SiteLocale) {
  const en = locale === "en";
  return {
    title: en ? "AI agent" : "AI 智能体",
    subtitle: en ? "Uses your API key · shared across pages" : "消耗您的 API Key · 全站对话互通",
    open: en ? "Open chat" : "打开对话",
    openWithName: (name: string) => (en ? `Open ${name}` : `打开 ${name}`),
    collapse: en ? "Minimize" : "收起",
    expandSetup: en ? "Expand settings" : "展开配置",
    collapseSetup: en ? "Collapse" : "收起",
    setupCollapsedHint: en ? "Agent is ready — use the chat bubble on any page." : "智能体已就绪 — 可在任意页面用右下角对话按钮聊天。",
    dragHint: en ? "Drag to move" : "拖动移动",
    close: en ? "Close" : "关闭",
    settings: en ? "API settings" : "API 配置",
    clearHistory: en ? "Clear chat" : "清空对话",
    clearConfirm: en ? "Clear all chat history?" : "确定清空全部对话记录？",
    send: en ? "Send" : "发送",
    placeholder: en ? "Ask about email marketing, automation checklist…" : "问邮件营销、自动化任务清单…",
    thinking: en ? "Thinking…" : "思考中…",
    noKey: en ? "Save and activate your agent on Automation tasks → AI brain first." : "请先在「自动化任务 → AI 大脑」保存并激活。",
    configSaved: en ? "Saved — click Activate when ready" : "已保存 — 请点击激活",
    activatedFlash: en ? "Agent activated" : "智能体已激活",
    preset: en ? "AI provider" : "AI Provider",
    baseUrl: en ? "Base URL" : "API 地址",
    model: en ? "Model" : "模型",
    apiKey: en ? "API Key" : "API Key",
    agentName: en ? "Agent name" : "智能体名称",
    agentNameHint: en ? "Your name for the agent — shown in the chat header" : "您给智能体起的名字 — 会显示在对话框标题",
    agentNamePlaceholder: en ? "e.g. Ali" : "例如 Ali",
    saveConfig: en ? "Save" : "保存",
    activate: en ? "Activate" : "激活",
    envKeyHint: en ? "Using server .env key — enter a name, Save, then Activate" : "当前使用服务器 .env Key — 填写名称 → 保存 → 激活",
    welcome: en
      ? "Name your agent on Automation tasks → AI brain, click Save, then Activate."
      : "请在「自动化任务 → AI 大脑」给智能体起名，点保存，再点激活。",
    setupTitle: en ? "AI brain · your agent" : "AI 大脑 · 智能体",
    setupDesc: en
      ? "Choose provider (e.g. deepseek), paste API key, name your agent → Save → Activate."
      : "选择 Provider（如 deepseek）→ 填写 API Key → 给智能体起名 → 保存 → 激活。",
    activatedBadge: en ? "Activated" : "已激活",
    savedBadge: en ? "Saved · pending activation" : "已保存 · 待激活",
    pendingBadge: en ? "Not configured" : "待配置",
    providerDeepseek: "deepseek",
    setupInAutomationHint: en
      ? "Configure provider, API key, and name on Automation tasks → AI brain."
      : "请在「自动化任务 → AI 大脑」配置 Provider、API Key 与名称。",
    aliRevised: en ? "Revised by Ali" : "Ali 已修改",
    aliThinking: en ? "Ali is thinking…" : "Ali 思考中…",
    aliNeedActivate: en ? "Activate Ali in Automation → AI brain to auto-revise copy." : "请先在「自动化任务 → AI 大脑」激活 Ali，才会自动优化文案。",
    aliRetry: en ? "Ask Ali to revise again" : "让 Ali 重新优化",
    greeting: (_name: string) => "hi"
  };
}

export function agentDisplayTitle(name: string | null | undefined, locale: SiteLocale): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return locale === "en" ? "AI agent" : "AI 智能体";
}
