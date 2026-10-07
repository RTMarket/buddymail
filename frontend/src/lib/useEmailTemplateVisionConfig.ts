import { useEffect, useState } from "react";
import { apiJson } from "./api";
import { findVisionPreset, VISION_AI_PRESETS } from "./emailVisionAiPresets";
import { useSiteLocale } from "../i18n/SiteLocaleContext";

type VisionConfigResponse = {
  ok: boolean;
  preset?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  apiKeyMasked?: string | null;
  hasKey?: boolean;
  message?: string;
};

export function useEmailTemplateVisionConfig(opts: {
  onError: (message: string) => void;
  onSaved?: (message: string) => void;
  configSaveErr: string;
  configMissingErr: string;
}) {
  const { locale } = useSiteLocale();
  const isZh = locale === "zh";

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const [preset, setPreset] = useState("openai");
  const [baseUrl, setBaseUrl] = useState(VISION_AI_PRESETS[0]!.baseUrl);
  const [model, setModel] = useState(VISION_AI_PRESETS[0]!.model);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<VisionConfigResponse>("/api/email/vision-ai-config");
        if (!data.ok) return;
        setHasKey(Boolean(data.hasKey));
        if (data.preset) setPreset(data.preset);
        if (data.baseUrl) setBaseUrl(data.baseUrl);
        if (data.model) setModel(data.model);
        if (data.apiKeyMasked) setApiKey(data.apiKeyMasked);
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, []);

  function applyPreset(id: string) {
    setPreset(id);
    const p = findVisionPreset(id);
    if (p && id !== "custom") {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  }

  function isMaskedKey(value: string): boolean {
    const v = value.trim();
    if (!v) return true;
    return /^[•*.\s]+$/.test(v) || v.includes("•••");
  }

  async function saveConfig(): Promise<boolean> {
    setSavingConfig(true);
    try {
      const p = findVisionPreset(preset);
      const data = await apiJson<VisionConfigResponse>("/api/email/vision-ai-config", {
        method: "PUT",
        body: JSON.stringify({
          preset,
          providerLabel: p ? (isZh ? p.labelZh : p.labelEn) : preset,
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim() || undefined
        })
      });
      if (!data.ok) throw new Error(data.message ?? opts.configSaveErr);
      setHasKey(Boolean(data.hasKey));
      if (data.apiKeyMasked) setApiKey(data.apiKeyMasked);
      opts.onSaved?.("");
      return true;
    } catch (e: unknown) {
      opts.onError(String((e as Error)?.message ?? e));
      return false;
    } finally {
      setSavingConfig(false);
    }
  }

  async function ensureConfigReady(): Promise<boolean> {
    if (!baseUrl.trim() || !model.trim()) {
      opts.onError(opts.configMissingErr);
      return false;
    }
    if (!hasKey && isMaskedKey(apiKey)) {
      opts.onError(opts.configMissingErr);
      return false;
    }
    if (!isMaskedKey(apiKey)) {
      return saveConfig();
    }
    return true;
  }

  return {
    settingsOpen,
    setSettingsOpen,
    savingConfig,
    configLoaded,
    hasKey,
    preset,
    baseUrl,
    model,
    apiKey,
    setBaseUrl,
    setModel,
    setApiKey,
    applyPreset,
    isMaskedKey,
    saveConfig,
    ensureConfigReady
  };
}

export type EmailTemplateVisionConfig = ReturnType<typeof useEmailTemplateVisionConfig>;
