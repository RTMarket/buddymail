/** 邮件正文模版背景色：与 Quill 文字颜色独立，保存时包一层 div */

export type BodyBgPreset = {
  id: string;
  labelZh: string;
  labelEn: string;
  r: number;
  g: number;
  b: number;
};

export const BODY_BG_PRESETS: BodyBgPreset[] = [
  { id: "neutral", labelZh: "浅灰", labelEn: "Light gray", r: 248, g: 250, b: 252 },
  { id: "warm", labelZh: "米色", labelEn: "Warm", r: 255, g: 251, b: 235 },
  { id: "cool", labelZh: "浅蓝", labelEn: "Cool blue", r: 239, g: 246, b: 255 },
  { id: "mint", labelZh: "浅绿", labelEn: "Mint", r: 236, g: 253, b: 245 },
  { id: "rose", labelZh: "浅粉", labelEn: "Rose", r: 255, g: 241, b: 242 },
  { id: "white", labelZh: "纯白", labelEn: "White", r: 255, g: 255, b: 255 }
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** depth 0=最浅，100=最深（在同色系内加深） */
export function resolveBodyBackgroundColor(presetId: string, depth: number): string {
  const preset = BODY_BG_PRESETS.find((p) => p.id === presetId) ?? BODY_BG_PRESETS[0]!;
  const t = clamp(depth, 0, 100) / 100;
  const toward = t < 0.5 ? 255 : 0;
  const localT = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const r = mix(preset.r, toward, localT * 0.55);
  const g = mix(preset.g, toward, localT * 0.55);
  const b = mix(preset.b, toward, localT * 0.55);
  return `rgb(${r}, ${g}, ${b})`;
}

export function wrapBodyWithBackground(html: string, bgColor: string): string {
  const inner = unwrapBodyBackground(String(html ?? "").trim() || "<p><br></p>").html;
  const safe = bgColor.replace(/"/g, "");
  return `<div data-bss-body-bg="${safe}" style="background-color: ${safe}; padding: 20px 16px; border-radius: 8px;">${inner}</div>`;
}

export function unwrapBodyBackground(html: string): { html: string; bgColor: string | null; presetHint: string | null } {
  const s = String(html ?? "").trim();
  const m = /^<div[^>]*data-bss-body-bg="([^"]*)"[^>]*style="[^"]*background-color:\s*([^;"']+)[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i.exec(
    s
  );
  if (m?.[3]) {
    return {
      html: m[3].trim() || "<p><br></p>",
      bgColor: m[2]!.trim(),
      presetHint: m[1]!.trim()
    };
  }
  return { html: s, bgColor: null, presetHint: null };
}

export function guessPresetAndDepthFromColor(color: string | null): { presetId: string; depth: number } {
  if (!color) return { presetId: "neutral", depth: 12 };
  const rgb = parseRgb(color);
  if (!rgb) return { presetId: "neutral", depth: 12 };
  let best = BODY_BG_PRESETS[0]!;
  let bestDist = Infinity;
  for (const p of BODY_BG_PRESETS) {
    const d = (p.r - rgb.r) ** 2 + (p.g - rgb.g) ** 2 + (p.b - rgb.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  const lum = (rgb.r + rgb.g + rgb.b) / 3;
  const depth = clamp(Math.round(((255 - lum) / 255) * 80), 0, 100);
  return { presetId: best.id, depth };
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = color.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}
