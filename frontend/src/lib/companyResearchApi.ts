import { apiJson } from "./api";

export type ResearchCredsPayload = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ResearchTasks = {
  competitors: boolean;
  news: boolean;
  interview: boolean;
  decision: boolean;
};

export type ResearchChatMsg = { role: "user" | "assistant"; content: string };

export async function testCompanyResearchAi(creds: ResearchCredsPayload) {
  return apiJson<{ ok: boolean; connected?: boolean; model?: string; reply?: string; message?: string }>(
    "/api/leads/company-research/test",
    { method: "POST", body: JSON.stringify(creds) }
  );
}

export async function chatCompanyResearch(input: {
  creds: ResearchCredsPayload;
  content: string;
  history: ResearchChatMsg[];
  tasks: ResearchTasks;
  transcript?: string;
}) {
  return apiJson<{ ok: boolean; reply?: string; message?: string }>("/api/leads/company-research/chat", {
    method: "POST",
    body: JSON.stringify({
      ...input.creds,
      content: input.content,
      history: input.history,
      tasks: input.tasks,
      transcript: input.transcript
    })
  });
}

export async function fetchCompanyResearchTranscript(videoUrl: string) {
  return apiJson<{ ok: boolean; title?: string; text?: string; source?: string; url?: string; message?: string }>(
    "/api/leads/company-research/video-transcript",
    { method: "POST", body: JSON.stringify({ videoUrl }) }
  );
}
