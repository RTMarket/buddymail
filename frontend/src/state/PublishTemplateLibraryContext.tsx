import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "bss_publish_template_library_v1";
const IDB_NAME = "bss_publish_template_library_db";
const IDB_STORE = "template_payloads";

export type TemplateKind = "image" | "copy" | "video";

/** 图片模版中的一张（保存到库时多套图会带序号文件名 1.png、2.jpg …） */
export type ImageStudioItem = { dataUrl: string; fileName: string };

export type StudioPayload =
  | { kind: "copy"; text: string }
  | {
      kind: "image";
      dataUrl: string;
      fileName?: string;
      /** 多图集；存在时与首张一致写入 dataUrl/fileName 以便兼容只读单图的旧逻辑 */
      images?: ImageStudioItem[];
    }
  | { kind: "video"; dataUrl: string; fileName?: string };

export type PublishTemplate = {
  id: string;
  name: string;
  tags: string[];
  kind: TemplateKind;
  savedAt: string;
  /** 来自顶部「保存到库」仅有元数据；创作区保存会写入素材 */
  payload: StudioPayload | null;
};

type StoredTemplateRow = Omit<PublishTemplate, "payload"> & {
  payload: StudioPayload | null;
  payloadStoredInDb?: boolean;
};

function openPayloadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

function idbSetPayload(id: string, payload: StudioPayload): Promise<void> {
  return openPayloadDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(payload, id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB 写入失败"));
        };
      })
  );
}

function idbGetPayload(id: string): Promise<StudioPayload | null> {
  return openPayloadDb().then(
    (db) =>
      new Promise<StudioPayload | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => resolve((req.result as StudioPayload | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB 读取失败"));
        tx.oncomplete = () => db.close();
      })
  );
}

function idbDeletePayload(id: string): Promise<void> {
  return openPayloadDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB 删除失败"));
        };
      })
  );
}

function payloadNeedsDb(payload: StudioPayload | null): boolean {
  if (!payload) return false;
  if (payload.kind === "copy") return false;
  if (payload.kind === "image") {
    if (payload.dataUrl.startsWith("data:")) return true;
    return (payload.images ?? []).some((x) => x.dataUrl.startsWith("data:"));
  }
  return payload.dataUrl.startsWith("data:");
}

function normalizeTemplateRow(raw: unknown): PublishTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = typeof t.id === "string" ? t.id : "";
  const name = typeof t.name === "string" ? t.name : "";
  const kind = t.kind === "image" || t.kind === "copy" || t.kind === "video" ? t.kind : null;
  const savedAt = typeof t.savedAt === "string" ? t.savedAt : "";
  if (!id || !name || !kind) return null;
  const tagsRaw = t.tags;
  const tags = Array.isArray(tagsRaw)
    ? [...new Set(tagsRaw.map((x) => String(x).trim()).filter(Boolean))]
    : [];
  const payload = (t.payload ?? null) as PublishTemplate["payload"];
  return { id, name, tags, kind, savedAt, payload };
}

function normalizeStoredTemplateRow(raw: unknown): StoredTemplateRow | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const base = normalizeTemplateRow(raw);
  if (!base) return null;
  return {
    ...base,
    payload: (t.payload ?? null) as PublishTemplate["payload"],
    payloadStoredInDb: t.payloadStoredInDb === true
  };
}

function loadFromStorage(): StoredTemplateRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeStoredTemplateRow).filter((x): x is StoredTemplateRow => x != null);
  } catch {
    return [];
  }
}

/** 多数浏览器单域名 localStorage 约 5MB；略小于上限做预检，避免整页崩溃 */
const STORAGE_SOFT_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);

function toStorageRow(item: PublishTemplate): StoredTemplateRow {
  if (!payloadNeedsDb(item.payload)) {
    return { ...item, payloadStoredInDb: false };
  }
  return { ...item, payload: null, payloadStoredInDb: true };
}

function tryPersistTemplates(items: PublishTemplate[]): { ok: true } | { ok: false; message: string } {
  try {
    const compactRows = items.map(toStorageRow);
    const json = JSON.stringify(compactRows);
    const bytes = new TextEncoder().encode(json).byteLength;
    if (bytes > STORAGE_SOFT_LIMIT_BYTES) {
      return {
        ok: false,
        message:
          `模版库数据约 ${(bytes / 1024 / 1024).toFixed(1)}MB，超过浏览器本地存储安全上限（约 5MB）。多图以 base64 保存会非常大，请减少一次保存的张数、压缩图片，或删掉发布中心里不再需要的旧模版后再试。`
      };
    }
    localStorage.setItem(STORAGE_KEY, json);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      message:
        "本地存储写入失败（多为空间已满）。请减少一次保存的图片张数或体积，或在发布中心模版库中删除旧条目后重试。"
    };
  }
}

type Ctx = {
  templates: PublishTemplate[];
  existingNamesForKind: (kind: TemplateKind) => string[];
  allTags: string[];
  upsertStudio: (input: {
    name: string;
    tags: string[];
    kind: TemplateKind;
    payload: StudioPayload;
  }) => void;
  addQuickMeta: (input: { name: string; tags: string[]; kind: TemplateKind }) => void;
  removeTemplate: (id: string) => void;
  /** 批量删除，一次持久化 */
  removeTemplates: (ids: string[]) => void;
};

const PublishTemplateLibraryContext = createContext<Ctx | null>(null);

export function PublishTemplateLibraryProvider(props: { children: React.ReactNode }) {
  const [templates, setTemplates] = useState<PublishTemplate[]>(() =>
    loadFromStorage().map((x) => ({ ...x, payload: x.payload ?? null }))
  );
  /** 最后一次成功写入 localStorage 的快照；写入失败时回滚，避免白屏 */
  const lastPersistedRef = useRef<PublishTemplate[]>(templates);

  useEffect(() => {
    const result = tryPersistTemplates(templates);
    if (result.ok) {
      lastPersistedRef.current = templates;
      return;
    }
    const rollback = lastPersistedRef.current;
    if (rollback !== templates) {
      window.setTimeout(() => window.alert(result.message), 0);
      setTemplates(rollback);
    }
  }, [templates]);

  useEffect(() => {
    const rows = loadFromStorage();
    const needsHydrate = rows.filter((r) => r.payloadStoredInDb && !r.payload);
    if (needsHydrate.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(needsHydrate.map((r) => idbGetPayload(r.id)));
        if (cancelled) return;
        const byId = new Map<string, StudioPayload | null>();
        needsHydrate.forEach((r, i) => byId.set(r.id, loaded[i] ?? null));
        setTemplates((prev) =>
          prev.map((t) => {
            const p = byId.get(t.id);
            return p ? { ...t, payload: p } : t;
          })
        );
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const existingNamesForKind = useCallback(
    (kind: TemplateKind) => {
      const names = templates.filter((t) => t.kind === kind).map((t) => t.name);
      return [...new Set(names)];
    },
    [templates]
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    templates.forEach((t) => (t.tags ?? []).forEach((x) => s.add(x)));
    return [...s].sort();
  }, [templates]);

  const upsertStudio = useCallback(
    (input: { name: string; tags: string[]; kind: TemplateKind; payload: StudioPayload }) => {
      const name = input.name.trim();
      if (!name) return;
      const tags = [...new Set(input.tags.map((x) => x.trim()).filter(Boolean))];
      const savedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
      setTemplates((prev) => {
        const idx = prev.findIndex((t) => t.name === name && t.kind === input.kind);
        const id = idx >= 0 ? prev[idx]!.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const row: PublishTemplate = {
          id,
          name,
          tags,
          kind: input.kind,
          savedAt,
          payload: input.payload
        };
        if (payloadNeedsDb(input.payload)) {
          void idbSetPayload(id, input.payload).catch((e) => console.error(e));
        } else {
          void idbDeletePayload(id).catch(() => {
            /* ignore */
          });
        }
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = row;
          return next;
        }
        return [row, ...prev];
      });
    },
    []
  );

  const addQuickMeta = useCallback((input: { name: string; tags: string[]; kind: TemplateKind }) => {
    const name = input.name.trim();
    if (!name) return;
    const tags = [...new Set(input.tags.map((x) => x.trim()).filter(Boolean))];
    const savedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.name === name && t.kind === input.kind);
      if (idx >= 0) {
        const next = [...prev];
        const keepPayload = next[idx]!.payload;
        next[idx] = { ...next[idx]!, name, tags, kind: input.kind, savedAt, payload: keepPayload };
        return next;
      }
      return [
        {
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          tags,
          kind: input.kind,
          savedAt,
          payload: null
        },
        ...prev
      ];
    });
  }, []);

  const removeTemplate = useCallback((id: string) => {
    void idbDeletePayload(id).catch(() => {
      /* ignore */
    });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const removeTemplates = useCallback((ids: string[]) => {
    const set = new Set(ids.filter(Boolean));
    if (set.size === 0) return;
    set.forEach((id) => {
      void idbDeletePayload(id).catch(() => {
        /* ignore */
      });
    });
    setTemplates((prev) => prev.filter((t) => !set.has(t.id)));
  }, []);

  const value = useMemo(
    () => ({
      templates,
      existingNamesForKind,
      allTags,
      upsertStudio,
      addQuickMeta,
      removeTemplate,
      removeTemplates
    }),
    [templates, existingNamesForKind, allTags, upsertStudio, addQuickMeta, removeTemplate, removeTemplates]
  );

  return (
    <PublishTemplateLibraryContext.Provider value={value}>{props.children}</PublishTemplateLibraryContext.Provider>
  );
}

export function usePublishTemplateLibrary() {
  const v = useContext(PublishTemplateLibraryContext);
  if (!v) throw new Error("usePublishTemplateLibrary must be used within PublishTemplateLibraryProvider");
  return v;
}

/** 文件转 data URL，过大则 reject */
export function readFileAsDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)}MB，请压缩后再保存到模版库。`));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = url;
  });
}

function stripFileExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * 保存到模版库前对本地图片做缩边+压缩，降低 localStorage 占用，避免频繁触发 5MB 上限。
 */
export async function readImageFileAsCompactDataUrl(
  file: File,
  opts?: { maxEdge?: number; targetBytes?: number }
): Promise<{ dataUrl: string; fileName: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageFromObjectUrl(objectUrl);
    const maxEdge = Math.max(320, opts?.maxEdge ?? 1600);
    const targetBytes = Math.max(120 * 1024, opts?.targetBytes ?? 450 * 1024);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const ratio = Math.min(1, maxEdge / longEdge);
    const width = Math.max(1, Math.round(img.naturalWidth * ratio));
    const height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas");
    ctx.drawImage(img, 0, 0, width, height);

    const qualities = [0.86, 0.78, 0.7, 0.62, 0.54];
    let picked = canvas.toDataURL("image/webp", qualities[0]);
    for (const q of qualities) {
      const cur = canvas.toDataURL("image/webp", q);
      picked = cur.length < picked.length ? cur : picked;
      const approxBytes = Math.floor((cur.length * 3) / 4);
      if (approxBytes <= targetBytes) {
        picked = cur;
        break;
      }
    }
    const base = stripFileExt(file.name || "image");
    return { dataUrl: picked, fileName: `${base}.webp` };
  } catch {
    const dataUrl = await readFileAsDataUrl(file, 8 * 1024 * 1024);
    return { dataUrl, fileName: file.name || "image" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
