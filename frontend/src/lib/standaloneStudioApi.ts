import { apiJson, apiJsonWithTimeout } from "./api";

export type StudioStatus = {
  ok: true;
  chatReady: boolean;
  chatSource: "agent-brain" | "deepseek-env" | "none";
  imageReady: boolean;
  imageMessage: string;
  videoReady: boolean;
  videoProvider: "autodl-art" | "minimax" | "gpu" | "none";
  videoMessage: string;
  gpuReady: boolean;
  gpuMessage: string;
};

export type StudioAsset = {
  id: number;
  kind: "image" | "video" | "file";
  fileName: string;
  url: string;
};

export type StudioCopyResult = {
  ok: true;
  title: string;
  body: string;
  table: string[][];
};

export type StudioVideoJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message: string;
  provider: StudioStatus["videoProvider"];
  durationSec: number;
  asset: StudioAsset | null;
};

export function fetchStudioStatus() {
  return apiJson<StudioStatus>("/api/standalone/studio/status");
}

export type StudioChatAction = "chat" | "image" | "video" | "copy" | "docs";

export type StudioChatTurn = {
  ok: true;
  reply: string;
  action: StudioChatAction;
  prompt: string;
  count: number;
  durationSec: number;
  formats: Array<"docx" | "xlsx" | "pdf">;
  copy: { title: string; body: string; table: string[][] } | null;
};

export function postStudioChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  imageBase64?: string
) {
  return apiJsonWithTimeout<StudioChatTurn>(
    "/api/standalone/studio/chat",
    {
      method: "POST",
      body: JSON.stringify({ messages: messages.slice(-40), imageBase64: imageBase64 || undefined })
    },
    imageBase64 ? 120_000 : 90_000
  );
}

export type StudioImagePick = {
  key: "kolors" | "turbo" | "qwen";
  model: string;
  label: string;
  estimatedCny: number;
  reason: string;
};

export function postStudioTxt2Img(
  prompt: string,
  negative?: string,
  imageChoice?: "auto" | "kolors" | "turbo" | "qwen",
  styleImageBase64?: string
) {
  return apiJsonWithTimeout<{ ok: true; asset: StudioAsset; prompt: string; pick: StudioImagePick; styleBrief?: string }>(
    "/api/standalone/studio/txt2img",
    {
      method: "POST",
      body: JSON.stringify({
        prompt,
        negative: negative || undefined,
        imageChoice: imageChoice || "auto",
        styleImageBase64: styleImageBase64 || undefined
      })
    },
    180_000
  );
}

export function postStudioCopy(prompt: string) {
  return apiJsonWithTimeout<StudioCopyResult>(
    "/api/standalone/studio/copy",
    { method: "POST", body: JSON.stringify({ prompt }) },
    90_000
  );
}

export function postStudioVideo(body: {
  prompt: string;
  durationSec: number;
  imageAssetId?: number;
  imageBase64?: string;
  negative?: string;
}) {
  return apiJsonWithTimeout<{ ok: true; job: StudioVideoJob }>(
    "/api/standalone/studio/video",
    { method: "POST", body: JSON.stringify(body) },
    60_000
  );
}

export function fetchStudioVideoJob(id: string) {
  return apiJson<{ ok: true; job: StudioVideoJob }>(`/api/standalone/studio/video/${encodeURIComponent(id)}`);
}
