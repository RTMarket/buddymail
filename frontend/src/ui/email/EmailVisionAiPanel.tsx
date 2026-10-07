import { useEffect, useRef, useState } from "react";
import { apiJson, apiJsonWithTimeout } from "../../lib/api";
import { compressImageFileForVision } from "../../lib/visionImageCompress";
import { cropImageRegion, fileToDataUrl } from "../../lib/commerceScreenshotCrop";
import { finalizeReplicaBodyHtml, type ReplicaProduct } from "../../lib/emailLayoutReplicaShared";
import { findVisionPreset, VISION_AI_PRESETS } from "../../lib/emailVisionAiPresets";
import { toAbsoluteEmailAssetUrl } from "../../lib/emailTemplateAssetUrls";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";

type UploadResult = { url: string; name: string };

type ProductScreenshot = {
  id: string;
  file: File;
  previewUrl: string;
};

type VisionProduct = ReplicaProduct;

type VisionConfigResponse = {
  ok: boolean;
  configured?: boolean;
  preset?: string | null;
  providerLabel?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  apiKeyMasked?: string | null;
  hasKey?: boolean;
  message?: string;
};

export function EmailVisionAiPanel(props: {
  ui: EmailTemplatesPageStrings;
  uploadFile: (file: File) => Promise<UploadResult>;
  onInsertHtml: (html: string) => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const { ui, uploadFile, onInsertHtml, onError, onSuccess } = props;
  const { locale } = useSiteLocale();
  const isZh = locale === "zh";

  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const [preset, setPreset] = useState("openai");
  const [baseUrl, setBaseUrl] = useState(VISION_AI_PRESETS[0]!.baseUrl);
  const [model, setModel] = useState(VISION_AI_PRESETS[0]!.model);
  const [apiKey, setApiKey] = useState("");

  const [layoutHint, setLayoutHint] = useState("");
  const [columnsPerRow, setColumnsPerRow] = useState(3);
  const [screenshots, setScreenshots] = useState<ProductScreenshot[]>([]);

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
        setConfigLoaded(true);
      } catch {
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
      if (!data.ok) throw new Error(data.message ?? ui.visionConfigSaveErr);
      setHasKey(Boolean(data.hasKey));
      if (data.apiKeyMasked) setApiKey(data.apiKeyMasked);
      onSuccess?.(ui.visionConfigSaved);
      return true;
    } catch (e: unknown) {
      onError(String((e as Error)?.message ?? e));
      return false;
    } finally {
      setSavingConfig(false);
    }
  }

  async function ensureConfigReady(): Promise<boolean> {
    if (!baseUrl.trim() || !model.trim()) {
      onError(ui.visionErrNeedConfig);
      return false;
    }
    if (!hasKey && isMaskedKey(apiKey)) {
      onError(ui.visionErrNeedConfig);
      return false;
    }
    if (!isMaskedKey(apiKey)) {
      return saveConfig();
    }
    return true;
  }

  async function uploadBlob(blob: Blob, name: string): Promise<string> {
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    const up = await uploadFile(file);
    return toAbsoluteEmailAssetUrl(up.url);
  }

  async function productsFromVision(file: File, detected: VisionProduct[]): Promise<string[]> {
    const dataUrl = await fileToDataUrl(file);
    const urls: string[] = [];
    for (let i = 0; i < detected.length; i++) {
      const d = detected[i]!;
      const blob = await cropImageRegion(dataUrl, d.bbox);
      const up = await uploadBlob(blob, `vision-${Date.now()}-${i}.jpg`);
      urls.push(up);
    }
    return urls;
  }

  function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const added: ProductScreenshot[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        onError(ui.commerceErrImageOnly);
        continue;
      }
      added.push({
        id: `vs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }
    if (added.length) setScreenshots((prev) => [...prev, ...added]);
  }

  async function runVisionGenerate() {
    if (!screenshots.length) {
      onError(ui.visionErrNeedImage);
      return;
    }
    const ready = await ensureConfigReady();
    if (!ready) return;
    setBusy(true);
    try {
      let mergedHtml = "";
      for (const ss of screenshots) {
        const imageBase64 = await compressImageFileForVision(ss.file);
        const data = await apiJsonWithTimeout<{
          ok: boolean;
          bodyHtml?: string;
          products?: VisionProduct[];
          message?: string;
        }>(
          "/api/email/vision/replicate-template",
          {
            method: "POST",
            body: JSON.stringify({
              imageBase64,
              layoutHint: layoutHint.trim() || undefined
            })
          },
          180_000
        );
        if (!data.ok || !data.bodyHtml?.trim()) {
          throw new Error(data.message ?? ui.commerceErrNeedProduct);
        }
        const imageUrls = data.products?.length
          ? await productsFromVision(ss.file, data.products)
          : [];
        const html = finalizeReplicaBodyHtml(
          data.bodyHtml,
          data.products ?? [],
          imageUrls,
          columnsPerRow
        );
        mergedHtml += html;
      }
      if (!mergedHtml.trim()) {
        throw new Error(ui.commerceErrNeedProduct);
      }
      onInsertHtml(mergedHtml);
      onSuccess?.(ui.visionGenerateSuccess());
    } catch (e: unknown) {
      onError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const activePreset = findVisionPreset(preset);
  const presetHint = activePreset ? (isZh ? activePreset.hintZh : activePreset.hintEn) : "";

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-amber-950">{ui.visionTitle}</p>
          <p className="text-[11px] leading-snug text-amber-900/90">{ui.visionHint}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? ui.visionCollapse : ui.visionOpen}
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-amber-200/80 px-3 pb-3 pt-2">
          <div className="rounded-md border border-amber-200 bg-white/90">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-amber-950"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <span>{ui.visionSettingsTitle}</span>
              <span className="text-amber-700">{settingsOpen ? "▲" : "▼"}</span>
            </button>
            {settingsOpen ? (
              <div className="space-y-2 border-t border-amber-100 px-3 pb-3 pt-2">
                <p className="text-[11px] text-slate-600">{ui.visionSettingsHint}</p>
                <label className="block text-xs text-slate-700">
                  {ui.visionProviderLabel}
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={preset}
                    onChange={(e) => applyPreset(e.target.value)}
                  >
                    {VISION_AI_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {isZh ? p.labelZh : p.labelEn}
                      </option>
                    ))}
                  </select>
                </label>
                {presetHint ? <p className="text-[11px] text-amber-800/90">{presetHint}</p> : null}
                <label className="block text-xs text-slate-700">
                  {ui.visionBaseUrlLabel}
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-xs text-slate-700">
                  {ui.visionModelLabel}
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-xs text-slate-700">
                  {ui.visionApiKeyLabel}
                  <input
                    type="password"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <p className="text-[11px] text-slate-500">{ui.visionApiKeyNote}</p>
                <button
                  type="button"
                  disabled={savingConfig || !configLoaded}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
                  onClick={() => void saveConfig()}
                >
                  {savingConfig ? ui.visionConfigSaving : ui.visionConfigSave}
                </button>
                {hasKey ? (
                  <p className="text-[11px] text-emerald-800">{ui.visionConfigReady}</p>
                ) : (
                  <p className="text-[11px] text-red-700">{ui.visionConfigMissing}</p>
                )}
              </div>
            ) : hasKey ? (
              <p className="border-t border-amber-100 px-3 py-2 text-[11px] text-emerald-800">
                {ui.visionConfigBrief(model)}
              </p>
            ) : (
              <p className="border-t border-amber-100 px-3 py-2 text-[11px] text-red-700">{ui.visionConfigMissing}</p>
            )}
          </div>

          <label className="block text-xs text-slate-700">
            {ui.visionLayoutHintLabel}
            <textarea
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              rows={2}
              value={layoutHint}
              onChange={(e) => setLayoutHint(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              className="rounded-md border border-amber-600 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
              onClick={() => fileRef.current?.click()}
            >
              {ui.visionUploadImages}
            </button>
          </div>

          {screenshots.length ? (
            <div>
              <p className="text-xs font-medium text-slate-700">{ui.visionImagesLabel}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {screenshots.map((ss) => (
                  <img
                    key={ss.id}
                    src={ss.previewUrl}
                    alt=""
                    className="h-24 max-w-[120px] rounded border border-slate-200 object-cover object-top"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <button
              type="button"
              disabled={busy || !screenshots.length}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              onClick={() => void runVisionGenerate()}
            >
              {busy ? ui.visionGenerating : ui.visionGenerateButton}
            </button>
            {!screenshots.length ? (
              <p className="text-[11px] text-slate-500">{ui.visionErrNeedImage}</p>
            ) : !hasKey && isMaskedKey(apiKey) ? (
              <p className="text-[11px] text-red-700">{ui.visionConfigMissing}</p>
            ) : busy ? (
              <p className="text-[11px] text-amber-800">{ui.visionGenerating}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
