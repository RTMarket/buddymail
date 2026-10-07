import { useState } from "react";
import { apiJsonWithTimeout } from "../../lib/api";
import { EMAIL_TEMPLATE_VISION_TEST_TIMEOUT_MS } from "../../lib/emailTemplateAiTimeouts";
import { VISION_AI_PRESETS } from "../../lib/emailVisionAiPresets";
import type { EmailTemplateVisionConfig } from "../../lib/useEmailTemplateVisionConfig";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";

export function EmailTemplateAiConfigPanel(props: {
  ui: EmailTemplatesPageStrings;
  config: EmailTemplateVisionConfig;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { ui, config, onSaved, onError } = props;
  const { locale } = useSiteLocale();
  const isZh = locale === "zh";
  const [testing, setTesting] = useState(false);
  const [testLine, setTestLine] = useState<{ ok: boolean; text: string } | null>(null);

  const presetHint = VISION_AI_PRESETS.find((p) => p.id === config.preset);
  const likelyNonVision =
    config.preset === "deepseek" ||
    /deepseek-chat|gpt-3\.5|text-only/i.test(config.model.trim());

  async function runVisionTest() {
    setTesting(true);
    setTestLine(null);
    try {
      if (!config.baseUrl.trim() || !config.model.trim()) {
        throw new Error(ui.visionConfigMissing);
      }
      if (!config.hasKey && config.isMaskedKey(config.apiKey)) {
        throw new Error(ui.visionConfigMissing);
      }
      const data = await apiJsonWithTimeout<{ ok: boolean; message?: string }>(
        "/api/email/vision-ai-config/test",
        {
          method: "POST",
          body: JSON.stringify({
            baseUrl: config.baseUrl.trim(),
            model: config.model.trim(),
            apiKey: config.isMaskedKey(config.apiKey) ? undefined : config.apiKey.trim()
          })
        },
        EMAIL_TEMPLATE_VISION_TEST_TIMEOUT_MS
      );
      if (!data.ok) throw new Error(data.message ?? ui.visionConfigTestFail);
      setTestLine({ ok: true, text: ui.visionConfigTestOk });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e).trim() || ui.visionConfigTestFail;
      setTestLine({ ok: false, text: msg });
      onError(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        onClick={() => config.setSettingsOpen((v) => !v)}
      >
        <span className="text-sm font-semibold text-slate-900">{ui.aiConfigTitle}</span>
        <span className="text-xs text-slate-500">{config.settingsOpen ? "▲" : "▼"}</span>
      </button>
      {config.settingsOpen ? (
        <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
          <label className="block text-xs text-slate-700">
            {ui.visionProviderLabel}
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={config.preset}
              onChange={(e) => config.applyPreset(e.target.value)}
            >
              {VISION_AI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {isZh ? p.labelZh : p.labelEn}
                </option>
              ))}
            </select>
          </label>
          {presetHint ? (
            <p className="text-[11px] leading-snug text-amber-800">
              {isZh ? presetHint.hintZh : presetHint.hintEn}
            </p>
          ) : null}
          {likelyNonVision ? (
            <p className="text-[11px] leading-snug text-red-700">
              {isZh
                ? "当前模型名可能不支持识图；链接/图片生成会失败。请换 gpt-4o-mini、豆包视觉、硅基 Nex-N2-Pro 等，并点「测试识图能力」。"
                : "This model may not support vision; link/image generate will fail. Use gpt-4o-mini, Doubao vision, SiliconFlow Nex-N2-Pro, etc., then run Test vision."}
            </p>
          ) : null}
          <label className="block text-xs text-slate-700">
            {ui.visionBaseUrlLabel}
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={config.baseUrl}
              onChange={(e) => config.setBaseUrl(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs text-slate-700">
            {ui.visionModelLabel}
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={config.model}
              onChange={(e) => config.setModel(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs text-slate-700">
            {ui.visionApiKeyLabel}
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={config.apiKey}
              onChange={(e) => config.setApiKey(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={config.savingConfig || !config.configLoaded}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
              onClick={() =>
                void config.saveConfig().then((ok) => {
                  if (ok) onSaved(ui.visionConfigSaved);
                })
              }
            >
              {config.savingConfig ? ui.visionConfigSaving : ui.visionConfigSave}
            </button>
            <button
              type="button"
              disabled={testing || !config.configLoaded}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void runVisionTest()}
            >
              {testing ? ui.visionConfigTesting : ui.visionConfigTest}
            </button>
          </div>
          {testLine ? (
            <p className={`text-[11px] ${testLine.ok ? "text-emerald-800" : "text-red-700"}`}>{testLine.text}</p>
          ) : config.hasKey ? (
            <p className="text-[11px] text-emerald-800">{ui.visionConfigReady}</p>
          ) : (
            <p className="text-[11px] text-red-700">{ui.visionConfigMissing}</p>
          )}
        </div>
      ) : config.hasKey ? (
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-emerald-800">
          {ui.visionConfigBrief(config.model)}
        </p>
      ) : (
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-red-700">{ui.visionConfigMissing}</p>
      )}
    </div>
  );
}
