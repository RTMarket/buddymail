export type VisionAiPreset = {
  id: string;
  labelZh: string;
  labelEn: string;
  baseUrl: string;
  model: string;
  hintZh: string;
  hintEn: string;
};

export const VISION_AI_PRESETS: VisionAiPreset[] = [
  {
    id: "openai",
    labelZh: "OpenAI",
    labelEn: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hintZh: "需支持识图的模型，如 gpt-4o-mini、gpt-4o",
    hintEn: "Use a vision-capable model, e.g. gpt-4o-mini or gpt-4o"
  },
  {
    id: "deepseek",
    labelZh: "DeepSeek",
    labelEn: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hintZh: "deepseek-chat 不支持识图！请改用支持视觉的模型，或换 OpenAI/硅基/豆包预设",
    hintEn: "deepseek-chat cannot read images. Switch to a vision model or OpenAI/SiliconFlow/Doubao preset"
  },
  {
    id: "doubao",
    labelZh: "豆包（火山方舟）",
    labelEn: "Doubao (Volcengine Ark)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1-5-vision-pro-32k",
    hintZh: "在火山方舟控制台创建推理接入点，模型名填接入点 ID 或视觉模型名",
    hintEn: "Create an Ark endpoint; use endpoint ID or vision model name"
  },
  {
    id: "siliconflow",
    labelZh: "硅基流动",
    labelEn: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "nex-agi/Nex-N2-Pro",
    hintZh: "模型名与硅基控制台一致，如 nex-agi/Nex-N2-Pro（须带「视觉」标签）",
    hintEn: "Use exact model ID from SiliconFlow, e.g. nex-agi/Nex-N2-Pro (vision tag)"
  },
  {
    id: "custom",
    labelZh: "自定义（OpenAI 兼容）",
    labelEn: "Custom (OpenAI-compatible)",
    baseUrl: "https://api.example.com/v1",
    model: "your-vision-model",
    hintZh: "填写服务商提供的 Base URL 与识图模型名",
    hintEn: "Enter provider Base URL and vision model name"
  }
];

export function findVisionPreset(id: string): VisionAiPreset | undefined {
  return VISION_AI_PRESETS.find((p) => p.id === id);
}
