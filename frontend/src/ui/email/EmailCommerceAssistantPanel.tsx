import { useRef, useState } from "react";
import {
  buildCommerceAssistantBodyHtml,
  COMMERCE_COLUMN_OPTIONS,
  newCommerceProductDraft,
  type CommerceColumnsPerRow,
  type CommerceProductDraft
} from "../../lib/emailCommerceAssistantLayout";
import { toAbsoluteEmailAssetUrl } from "../../lib/emailTemplateAssetUrls";
import type { EmailTemplatesPageStrings } from "../../i18n/emailTemplatesPageI18n";

type UploadResult = { url: string; name: string };

type ProductScreenshot = {
  id: string;
  file: File;
  previewUrl: string;
};

function productsFromScreenshots(screenshots: ProductScreenshot[]): CommerceProductDraft[] {
  return screenshots.map((ss) =>
    newCommerceProductDraft({
      id: `p-${ss.id}`,
      imageUrl: ss.previewUrl
    })
  );
}

function isBlobImageUrl(url: string): boolean {
  return url.trim().startsWith("blob:");
}

export function EmailCommerceAssistantPanel(props: {
  ui: EmailTemplatesPageStrings;
  uploadFile: (file: File) => Promise<UploadResult>;
  onInsertHtml: (
    html: string,
    opts?: { replace?: boolean; preserveLayout?: boolean; commerceLayout?: boolean }
  ) => boolean;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const { ui, uploadFile, onInsertHtml, onError, onSuccess } = props;
  const shopFileRef = useRef<HTMLInputElement>(null);
  const replaceImageRef = useRef<HTMLInputElement>(null);
  const replaceProductIdRef = useRef<string | null>(null);

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [headline, setHeadline] = useState("");
  const [intro, setIntro] = useState("");
  const [columnsPerRow, setColumnsPerRow] = useState<CommerceColumnsPerRow>(3);
  const [screenshots, setScreenshots] = useState<ProductScreenshot[]>([]);
  const [products, setProducts] = useState<CommerceProductDraft[]>([]);

  function patchProduct(id: string, patch: Partial<CommerceProductDraft>) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeProduct(id: string) {
    const product = products.find((p) => p.id === id);
    const ssId = product?.id.replace(/^p-/, "");
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (ssId) setScreenshots((prev) => prev.filter((ss) => ss.id !== ssId));
  }

  function insertLayout(list: CommerceProductDraft[]): boolean {
    const usable = list.filter((p) => p.imageUrl.trim() || p.title.trim());
    if (!usable.length) return false;
    const html = buildCommerceAssistantBodyHtml({
      headline,
      intro,
      products: usable,
      columnsPerRow
    });
    return onInsertHtml(html, { replace: true, preserveLayout: true, commerceLayout: true });
  }

  async function resolveProductsWithUploadedImages(): Promise<CommerceProductDraft[]> {
    let list = products.filter((p) => p.imageUrl.trim() || p.title.trim());
    if (list.length !== screenshots.length) {
      list = productsFromScreenshots(screenshots);
    }
    const resolved = await Promise.all(
      screenshots.map(async (ss, i) => {
        const base = list[i] ?? productsFromScreenshots([ss])[0]!;
        if (!isBlobImageUrl(base.imageUrl)) return base;
        try {
          const up = await uploadFile(ss.file);
          return { ...base, imageUrl: toAbsoluteEmailAssetUrl(up.url) };
        } catch {
          return base;
        }
      })
    );
    setProducts(resolved);
    return resolved;
  }

  function onShopFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const added: ProductScreenshot[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        onError(ui.commerceErrImageOnly);
        continue;
      }
      added.push({
        id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }
    if (!added.length) return;
    const nextScreens = [...screenshots, ...added];
    setScreenshots(nextScreens);
    setProducts(productsFromScreenshots(nextScreens));
    setStatusLine(null);
  }

  async function generate() {
    if (!screenshots.length) {
      onError(ui.commerceErrNeedProduct);
      return;
    }

    setBusy(true);
    setStatusLine({ kind: "ok", text: ui.commerceUploading });
    try {
      const list = await resolveProductsWithUploadedImages();
      setStatusLine({ kind: "ok", text: ui.commerceGeneratingLayout });
      const inserted = insertLayout(list);
      if (!inserted) {
        throw new Error(ui.commerceInsertFailed);
      }

      onSuccess?.(ui.commerceInserted);
      setStatusLine({ kind: "ok", text: ui.commerceInserted });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      setStatusLine({ kind: "err", text: msg });
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  function triggerReplaceImage(productId: string) {
    replaceProductIdRef.current = productId;
    replaceImageRef.current?.click();
  }

  const generateBusy = busy;

  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/80">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="text-sm font-semibold text-emerald-900">{ui.commerceTitle}</p>
        <button
          type="button"
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? ui.commerceCollapse : ui.commerceOpen}
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-emerald-200/80 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-snug text-slate-600">{ui.commerceHint}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-700">
              {ui.commerceHeadlineLabel}
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={ui.commerceDefaultHeadline}
              />
            </label>
            <label className="block text-xs text-slate-700 sm:col-span-2">
              {ui.commerceIntroLabel}
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder={ui.commerceDefaultIntro}
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700">{ui.commerceColumnsLabel}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {COMMERCE_COLUMN_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`min-w-[2.25rem] rounded-md border px-2.5 py-1 text-xs font-medium ${
                    columnsPerRow === n
                      ? "border-emerald-600 bg-emerald-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => setColumnsPerRow(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={shopFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onShopFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
              onClick={() => shopFileRef.current?.click()}
            >
              {ui.commerceUploadScreenshots}
            </button>
            <span className="text-[11px] text-slate-600">{ui.commerceUploadHint}</span>
          </div>

          {screenshots.length ? (
            <div>
              <p className="text-xs font-medium text-slate-700">
                {ui.commerceShopScreensLabel}（{screenshots.length}）
              </p>
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

          <input
            ref={replaceImageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              const pid = replaceProductIdRef.current;
              replaceProductIdRef.current = null;
              if (!file || !pid) return;
              if (!file.type.startsWith("image/")) {
                onError(ui.commerceErrImageOnly);
                return;
              }
              try {
                const up = await uploadFile(file);
                patchProduct(pid, { imageUrl: toAbsoluteEmailAssetUrl(up.url) });
              } catch (err: unknown) {
                onError(String((err as Error)?.message ?? err));
              }
            }}
          />

          {products.length ? (
            <>
              <p className="text-xs font-medium text-emerald-900">{ui.commerceProductCount(products.length)}</p>
              <ul
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(columnsPerRow, 3)}, minmax(0, 1fr))` }}
              >
                {products.map((p) => (
                  <li key={p.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex flex-col gap-2">
                      {p.imageUrl ? (
                        <div className="relative">
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="mx-auto h-28 w-full max-w-[140px] rounded object-contain ring-1 ring-slate-100"
                          />
                          <button
                            type="button"
                            className="mt-1 w-full text-[11px] text-emerald-800 hover:underline"
                            onClick={() => triggerReplaceImage(p.id)}
                          >
                            {ui.commerceReplaceImage}
                          </button>
                        </div>
                      ) : null}
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        placeholder={ui.commerceProductTitle}
                        value={p.title}
                        onChange={(e) => patchProduct(p.id, { title: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          className="rounded border border-slate-200 px-2 py-1 text-xs"
                          placeholder={ui.commercePrice}
                          value={p.price}
                          onChange={(e) => patchProduct(p.id, { price: e.target.value })}
                        />
                        <input
                          className="rounded border border-slate-200 px-2 py-1 text-xs"
                          placeholder={ui.commerceComparePrice}
                          value={p.comparePrice}
                          onChange={(e) => patchProduct(p.id, { comparePrice: e.target.value })}
                        />
                      </div>
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        placeholder={ui.commerceLink}
                        value={p.link}
                        onChange={(e) => patchProduct(p.id, { link: e.target.value })}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <input
                          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                          value={p.ctaText}
                          onChange={(e) => patchProduct(p.id, { ctaText: e.target.value })}
                        />
                        <button
                          type="button"
                          className="shrink-0 text-[11px] text-red-600 hover:underline"
                          onClick={() => removeProduct(p.id)}
                        >
                          {ui.remove}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-500">{ui.commerceEmpty}</p>
          )}

          <button
            type="button"
            disabled={generateBusy || !screenshots.length}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            onClick={() => void generate()}
          >
            {busy ? ui.commerceGeneratingLayout : ui.commerceGenerate}
          </button>

          {statusLine ? (
            <p
              className={`rounded-md px-2.5 py-2 text-xs leading-snug ${
                statusLine.kind === "err"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {statusLine.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
