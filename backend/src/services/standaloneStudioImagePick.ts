import { runAgentBrainChat } from "./aiChat.js";
import type { AgentBrainCredentials } from "./aiChat.js";

export type StudioImageChoice = "auto" | "kolors" | "turbo" | "qwen";

export type StudioImagePick = {
  key: "kolors" | "turbo" | "qwen";
  model: string;
  label: string;
  estimatedCny: number;
  reason: string;
  imageSize: string;
  steps: number;
  guidance: number;
};

const MODELS = {
  kolors: {
    key: "kolors" as const,
    model: "Kwai-Kolors/Kolors",
    label: "Kolors（免费）",
    estimatedCny: 0,
    steps: 20,
    guidance: 5
  },
  turbo: {
    key: "turbo" as const,
    model: "Tongyi-MAI/Z-Image-Turbo",
    label: "Z-Image-Turbo（约 ¥0.10）",
    estimatedCny: 0.1,
    steps: 8,
    guidance: 0
  },
  qwen: {
    key: "qwen" as const,
    model: "Qwen/Qwen-Image",
    label: "Qwen-Image（约 ¥0.30）",
    estimatedCny: 0.3,
    steps: 28,
    guidance: 4
  }
};

const DENSE_RE =
  /表格|日程|周计划|单元格|格子|checkbox|spreadsheet|playbook|infographic|信息图|流程图|路线图|步骤\s*[1-9]|numbered|grid|matrix|易拉宝|展架|roll-?up|mockup|密密麻麻|小字|多段文字|每一格|monday|account\s*0[1-9]/i;
const POSTER_RE =
  /海报|banner|展架|易拉宝|标题|headline|logo|品牌名|中英文|paper.?cut|剪纸|排版|typography|poster|flyer|大字|标语|slogan|infographic|信息图|按钮文案/i;
const PHOTO_RE =
  /实拍|照片|人像|风景|产品静物|cinematic|photoreal|办公室午后|窗外|自然光|街拍|美食特写/i;

function countQuotedChunks(text: string): number {
  const a = text.match(/[“"][^”"]{2,80}[”"]/g);
  const b = text.match(/\b[A-Z][A-Z0-9 &'/-]{3,}\b/g);
  return (a?.length ?? 0) + (b?.length ?? 0);
}

export function pickStudioImageSize(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/易拉宝|展架|roll-?up|竖版|9:16|portrait banner/.test(p)) return "768x1024";
  return "1024x1024";
}

export function pickStudioImageModelHeuristic(prompt: string): StudioImagePick {
  const p = prompt.trim();
  const dense = DENSE_RE.test(p) || countQuotedChunks(p) >= 6 || (p.length > 500 && POSTER_RE.test(p));
  const poster = POSTER_RE.test(p);
  const photo = PHOTO_RE.test(p);
  const size = pickStudioImageSize(p);
  if (dense) {
    return { ...MODELS.qwen, imageSize: size, reason: "描述里字多、表格或信息图，走 Qwen-Image。" };
  }
  if (poster && !photo) {
    return { ...MODELS.turbo, imageSize: size, reason: "海报/标题类，走 Z-Image-Turbo。" };
  }
  if (poster && photo) {
    return { ...MODELS.turbo, imageSize: size, reason: "场景+标题，走 Z-Image-Turbo。" };
  }
  return { ...MODELS.kolors, imageSize: size, reason: "偏实拍/氛围，走免费 Kolors。" };
}

export async function pickStudioImageModel(opts: {
  prompt: string;
  choice?: StudioImageChoice;
  creds?: AgentBrainCredentials | null;
  hasStyleRef?: boolean;
}): Promise<StudioImagePick> {
  const choice = opts.choice || "auto";
  if (choice === "kolors") {
    return { ...MODELS.kolors, imageSize: pickStudioImageSize(opts.prompt), reason: "你指定了 Kolors。" };
  }
  if (choice === "turbo") {
    return { ...MODELS.turbo, imageSize: pickStudioImageSize(opts.prompt), reason: "你指定了 Z-Image-Turbo。" };
  }
  if (choice === "qwen") {
    return { ...MODELS.qwen, imageSize: pickStudioImageSize(opts.prompt), reason: "你指定了 Qwen-Image。" };
  }

  const heuristic = pickStudioImageModelHeuristic(opts.prompt || "style reference graphic");
  if (opts.hasStyleRef && heuristic.key === "kolors") {
    return {
      ...MODELS.turbo,
      imageSize: pickStudioImageSize(opts.prompt),
      reason: "有风格参考图，走 Z-Image-Turbo 更贴海报字。"
    };
  }
  if (!opts.creds) return heuristic;

  try {
    const reply = await runAgentBrainChat({
      creds: opts.creds,
      systemPrompt:
        "Classify one image-generation request. Reply with exactly one word: kolors, turbo, or qwen. kolors=photo/scene/product with little on-image text. turbo=poster/banner/headline/few labels. qwen=infographic/table/grid/many small labels/roll-up with lots of copy.",
      messages: [{ role: "user", content: opts.prompt.slice(0, 2500) }],
      maxTokens: 16
    });
    const token = reply.toLowerCase().replace(/[^a-z]/g, "");
    if (token.includes("qwen")) {
      return { ...MODELS.qwen, imageSize: heuristic.imageSize, reason: "按描述判断：字多/信息图，走 Qwen-Image。" };
    }
    if (token.includes("turbo")) {
      return { ...MODELS.turbo, imageSize: heuristic.imageSize, reason: "按描述判断：海报/标题，走 Z-Image-Turbo。" };
    }
    if (token.includes("kolors")) {
      if (opts.hasStyleRef) {
        return { ...MODELS.turbo, imageSize: heuristic.imageSize, reason: "有风格参考图，走 Z-Image-Turbo 更贴海报字。" };
      }
      return { ...MODELS.kolors, imageSize: heuristic.imageSize, reason: "按描述判断：实拍/氛围，走免费 Kolors。" };
    }
  } catch {
    /* keep heuristic */
  }
  return heuristic;
}
