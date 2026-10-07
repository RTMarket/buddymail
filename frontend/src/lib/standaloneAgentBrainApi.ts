/**
 * 开源版：AI 润色/改写功能已移除（商业版 Agent Brain）。
 * 保留同名函数签名以便 UI 编译通过；调用时返回不可用提示。
 */

const UNAVAILABLE = "AI 辅助润色功能在开源版中不可用";

export async function postAgentBrainWechatReviseArticle(_body: {
  title: string;
  digest?: string;
  contentHtml: string;
}): Promise<{
  ok: boolean;
  title?: string;
  digest?: string;
  contentHtml?: string;
  note?: string;
  agentName?: string;
  message?: string;
}> {
  return { ok: false, message: UNAVAILABLE };
}

export async function postAgentBrainLinkedInReviseQueueCopy(
  _body: {
    title: string;
    body: string;
    url?: string;
    copyLocale?: "zh" | "en";
  },
  _signal?: AbortSignal
): Promise<{
  ok: boolean;
  title?: string;
  body?: string;
  note?: string;
  agentName?: string;
  message?: string;
}> {
  return { ok: false, message: UNAVAILABLE };
}

export async function postAgentBrainEmailTemplatePolishBody(_body: {
  templateName?: string;
  category?: string;
  subject: string;
  bodyHtml: string;
  locale?: "zh" | "en";
}): Promise<{
  ok: boolean;
  subject?: string;
  bodyHtml?: string;
  note?: string;
  agentName?: string;
  message?: string;
}> {
  return { ok: false, message: UNAVAILABLE };
}
