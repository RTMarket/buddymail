import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";

const execFileAsync = promisify(execFile);

function toPositiveId(value: unknown): number {
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }
  const n = Math.trunc(Number(value));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export const SOCIAL_LIBRARY_PLATFORMS = [
  "devto",
  "mastodon",
  "bluesky",
  "linkedin_member",
  "wechat_official"
] as const;

export type SocialLibraryPlatform = (typeof SOCIAL_LIBRARY_PLATFORMS)[number];
export type SocialLibraryAssetKind = "image" | "video" | "file";

export type SocialLibraryAsset = {
  id: number;
  kind: SocialLibraryAssetKind;
  fileName: string;
  storedName: string;
  mime: string;
  sizeBytes: number;
  url: string;
  posterUrl: string;
  createdAt: string | null;
};

export type SocialLibraryDraft = {
  title: string;
  body: string;
  selectedAssetIds: number[];
  selectedPlatforms: SocialLibraryPlatform[];
  updatedAt: string | null;
};

export type SocialLibraryNamedDraft = SocialLibraryDraft & { id: number };

export type SocialLibraryPublishLog = {
  id: number;
  title: string;
  platforms: SocialLibraryPlatform[];
  status: "ok" | "partial" | "failed";
  results: Array<{ platform: string; ok: boolean; message: string; url?: string }>;
  createdAt: string | null;
};

const UPLOAD_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "uploads",
  "standalone-social-library"
);

let schemaReady = false;

export function socialLibraryUploadDir(): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function socialLibraryPublicUrl(storedName: string): string {
  return `/uploads/standalone-social-library/${storedName}`;
}

export function socialLibraryPosterStoredName(storedName: string): string {
  return `${path.basename(storedName)}.poster.jpg`;
}

export function socialLibraryPosterPath(storedName: string): string {
  return path.join(socialLibraryUploadDir(), socialLibraryPosterStoredName(storedName));
}

export function socialLibraryPosterUrl(storedName: string): string {
  return socialLibraryPublicUrl(socialLibraryPosterStoredName(storedName));
}

export function saveSocialLibraryPosterFile(storedName: string, sourcePath: string): void {
  if (!storedName || !sourcePath || !fs.existsSync(sourcePath)) return;
  fs.copyFileSync(sourcePath, socialLibraryPosterPath(storedName));
}

export async function extractSocialLibraryVideoPoster(storedName: string, videoPath: string): Promise<boolean> {
  if (!storedName || !videoPath || !fs.existsSync(videoPath)) return false;
  const posterPath = socialLibraryPosterPath(storedName);
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  try {
    await execFileAsync(
      ffmpeg,
      ["-y", "-ss", "0.3", "-i", videoPath, "-frames:v", "1", "-q:v", "3", posterPath],
      { timeout: 25000 }
    );
    return fs.existsSync(posterPath) && fs.statSync(posterPath).size > 200;
  } catch {
    return false;
  }
}

export async function ensureStandaloneSocialLibrarySchema(db: Pool): Promise<void> {
  if (schemaReady) return;
  socialLibraryUploadDir();
  await db.query(`
    CREATE TABLE IF NOT EXISTS standalone_social_library_assets (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      kind VARCHAR(16) NOT NULL,
      file_name VARCHAR(512) NOT NULL DEFAULT '',
      stored_name VARCHAR(512) NOT NULL DEFAULT '',
      mime VARCHAR(128) NOT NULL DEFAULT '',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      url VARCHAR(1024) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS standalone_social_library_draft (
      id TINYINT PRIMARY KEY,
      title VARCHAR(512) NOT NULL DEFAULT '',
      body MEDIUMTEXT NULL,
      selected_asset_ids_json TEXT NULL,
      selected_platforms_json TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS standalone_social_library_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(512) NOT NULL DEFAULT '',
      platforms_json TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'failed',
      results_json MEDIUMTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_social_lib_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS standalone_social_library_named_drafts (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(200) NOT NULL,
      body MEDIUMTEXT NULL,
      selected_asset_ids_json TEXT NULL,
      selected_platforms_json TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_social_lib_named_title (title)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  schemaReady = true;
}

export async function listSocialLibraryAssets(db: Pool): Promise<SocialLibraryAsset[]> {
  await ensureStandaloneSocialLibrarySchema(db);
  const [rows] = await db.query(
    `SELECT id, kind, file_name, stored_name, mime, size_bytes, url, created_at
       FROM standalone_social_library_assets
      ORDER BY id DESC
      LIMIT 200`
  );
  return (rows as Array<Record<string, unknown>>).map(mapAsset);
}

export async function getSocialLibraryAssetsByIds(db: Pool, ids: number[]): Promise<SocialLibraryAsset[]> {
  await ensureStandaloneSocialLibrarySchema(db);
  const clean = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return [];
  const placeholders = clean.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT id, kind, file_name, stored_name, mime, size_bytes, url, created_at
       FROM standalone_social_library_assets
      WHERE id IN (${placeholders})`,
    clean
  );
  const mapped = (rows as Array<Record<string, unknown>>).map(mapAsset);
  const byId = new Map(mapped.map((a) => [a.id, a]));
  return clean.map((id) => byId.get(id)).filter((a): a is SocialLibraryAsset => Boolean(a));
}

export async function insertSocialLibraryAsset(
  db: Pool,
  input: {
    kind: SocialLibraryAssetKind;
    fileName: string;
    storedName: string;
    mime: string;
    sizeBytes: number;
    url: string;
  }
): Promise<SocialLibraryAsset> {
  await ensureStandaloneSocialLibrarySchema(db);
  await db.query(
    `INSERT INTO standalone_social_library_assets (kind, file_name, stored_name, mime, size_bytes, url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.kind, input.fileName, input.storedName, input.mime, input.sizeBytes, input.url]
  );
  const [lidRows] = await db.query(`SELECT LAST_INSERT_ID() AS id`);
  let id = toPositiveId((lidRows as Array<{ id?: unknown }>)[0]?.id);
  if (id <= 0) {
    const [byName] = await db.query(
      `SELECT id FROM standalone_social_library_assets WHERE stored_name = ? ORDER BY id DESC LIMIT 1`,
      [input.storedName]
    );
    id = toPositiveId((byName as Array<{ id?: unknown }>)[0]?.id);
  }
  const [rows] = await db.query(
    `SELECT id, kind, file_name, stored_name, mime, size_bytes, url, created_at
       FROM standalone_social_library_assets WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error("素材保存失败。");
  return mapAsset(row);
}

export async function deleteSocialLibraryAsset(db: Pool, id: number): Promise<void> {
  await ensureStandaloneSocialLibrarySchema(db);
  const [rows] = await db.query(
    `SELECT stored_name FROM standalone_social_library_assets WHERE id = ? LIMIT 1`,
    [id]
  );
  const stored = String((rows as Array<{ stored_name?: string }>)[0]?.stored_name ?? "");
  await db.query(`DELETE FROM standalone_social_library_assets WHERE id = ?`, [id]);
  if (stored) {
    const filePath = path.join(socialLibraryUploadDir(), path.basename(stored));
    fs.unlink(filePath, () => {});
    fs.unlink(socialLibraryPosterPath(stored), () => {});
  }
}

export async function getSocialLibraryDraft(db: Pool): Promise<SocialLibraryDraft> {
  await ensureStandaloneSocialLibrarySchema(db);
  const [rows] = await db.query(
    `SELECT title, body, selected_asset_ids_json, selected_platforms_json, updated_at
       FROM standalone_social_library_draft WHERE id = 1 LIMIT 1`
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) {
    return { title: "", body: "", selectedAssetIds: [], selectedPlatforms: [], updatedAt: null };
  }
  return {
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    selectedAssetIds: parseIdList(row.selected_asset_ids_json),
    selectedPlatforms: parsePlatformList(row.selected_platforms_json),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null
  };
}

export async function saveSocialLibraryDraft(
  db: Pool,
  input: { title?: string; body?: string; selectedAssetIds?: number[]; selectedPlatforms?: SocialLibraryPlatform[] }
): Promise<SocialLibraryDraft> {
  await ensureStandaloneSocialLibrarySchema(db);
  const current = await getSocialLibraryDraft(db);
  const title = input.title != null ? String(input.title).slice(0, 200) : current.title;
  const body = input.body != null ? String(input.body).slice(0, 20000) : current.body;
  const selectedAssetIds = input.selectedAssetIds ?? current.selectedAssetIds;
  const selectedPlatforms = input.selectedPlatforms ?? current.selectedPlatforms;
  await db.query(
    `INSERT INTO standalone_social_library_draft (id, title, body, selected_asset_ids_json, selected_platforms_json)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body = VALUES(body),
       selected_asset_ids_json = VALUES(selected_asset_ids_json),
       selected_platforms_json = VALUES(selected_platforms_json)`,
    [title, body, JSON.stringify(selectedAssetIds), JSON.stringify(selectedPlatforms)]
  );
  return getSocialLibraryDraft(db);
}

function mapNamedDraft(row: Record<string, unknown>): SocialLibraryNamedDraft {
  return {
    id: Number(row.id ?? 0),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    selectedAssetIds: parseIdList(row.selected_asset_ids_json),
    selectedPlatforms: parsePlatformList(row.selected_platforms_json),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null
  };
}

export async function listSocialLibraryNamedDrafts(db: Pool): Promise<SocialLibraryNamedDraft[]> {
  await ensureStandaloneSocialLibrarySchema(db);
  const [rows] = await db.query(
    `SELECT id, title, body, selected_asset_ids_json, selected_platforms_json, updated_at
       FROM standalone_social_library_named_drafts
      ORDER BY updated_at DESC, id DESC
      LIMIT 80`
  );
  return (rows as Array<Record<string, unknown>>).map(mapNamedDraft);
}

export async function upsertSocialLibraryNamedDraft(
  db: Pool,
  input: { title: string; body: string; selectedAssetIds: number[]; selectedPlatforms: SocialLibraryPlatform[] }
): Promise<SocialLibraryNamedDraft> {
  await ensureStandaloneSocialLibrarySchema(db);
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) throw new Error("保存草稿箱需要先填写标题。");
  const body = String(input.body ?? "").slice(0, 20000);
  await db.query(
    `INSERT INTO standalone_social_library_named_drafts
      (title, body, selected_asset_ids_json, selected_platforms_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       body = VALUES(body),
       selected_asset_ids_json = VALUES(selected_asset_ids_json),
       selected_platforms_json = VALUES(selected_platforms_json)`,
    [title, body, JSON.stringify(input.selectedAssetIds), JSON.stringify(input.selectedPlatforms)]
  );
  const [rows] = await db.query(
    `SELECT id, title, body, selected_asset_ids_json, selected_platforms_json, updated_at
       FROM standalone_social_library_named_drafts WHERE title = ? LIMIT 1`,
    [title]
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error("草稿保存失败。");
  return mapNamedDraft(row);
}

export async function deleteSocialLibraryNamedDraft(db: Pool, id: number): Promise<void> {
  await ensureStandaloneSocialLibrarySchema(db);
  await db.query(`DELETE FROM standalone_social_library_named_drafts WHERE id = ?`, [id]);
}

export async function listSocialLibraryLogs(db: Pool): Promise<SocialLibraryPublishLog[]> {
  await ensureStandaloneSocialLibrarySchema(db);
  const [rows] = await db.query(
    `SELECT id, title, platforms_json, status, results_json, created_at
       FROM standalone_social_library_logs
      ORDER BY id DESC
      LIMIT 80`
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id ?? 0),
    title: String(row.title ?? ""),
    platforms: parsePlatformList(row.platforms_json),
    status: (["ok", "partial", "failed"].includes(String(row.status))
      ? String(row.status)
      : "failed") as SocialLibraryPublishLog["status"],
    results: parseResults(row.results_json),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null
  }));
}

export async function insertSocialLibraryLog(
  db: Pool,
  input: Omit<SocialLibraryPublishLog, "id" | "createdAt">
): Promise<void> {
  await ensureStandaloneSocialLibrarySchema(db);
  await db.query(
    `INSERT INTO standalone_social_library_logs (title, platforms_json, status, results_json)
     VALUES (?, ?, ?, ?)`,
    [input.title.slice(0, 200), JSON.stringify(input.platforms), input.status, JSON.stringify(input.results)]
  );
}

export function resolveSocialLibraryFilePath(asset: SocialLibraryAsset): string {
  return path.join(socialLibraryUploadDir(), path.basename(asset.storedName || asset.url));
}

function mapAsset(row: Record<string, unknown>): SocialLibraryAsset {
  const storedName = String(row.stored_name ?? "");
  const rawKind = String(row.kind ?? "image");
  const kind: SocialLibraryAssetKind =
    rawKind === "video" ? "video" : rawKind === "file" ? "file" : "image";
  const posterPath = storedName && kind === "video" ? socialLibraryPosterPath(storedName) : "";
  return {
    id: toPositiveId(row.id),
    kind,
    fileName: String(row.file_name ?? ""),
    storedName,
    mime: String(row.mime ?? ""),
    sizeBytes: toPositiveId(row.size_bytes) || Number(row.size_bytes ?? 0),
    url: String(row.url ?? ""),
    posterUrl: posterPath && fs.existsSync(posterPath) ? socialLibraryPosterUrl(storedName) : "",
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null
  };
}

function parseIdList(raw: unknown): number[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function parsePlatformList(raw: unknown): SocialLibraryPlatform[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is SocialLibraryPlatform =>
      SOCIAL_LIBRARY_PLATFORMS.includes(p as SocialLibraryPlatform)
    );
  } catch {
    return [];
  }
}

function parseResults(raw: unknown): SocialLibraryPublishLog["results"] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      platform: (String(item?.platform ?? "") === "tiktok"
        ? "tiktok"
        : String(item?.platform ?? "")) as SocialLibraryPublishLog["results"][number]["platform"],
      ok: Boolean(item?.ok),
      message: String(item?.message ?? ""),
      url: item?.url ? String(item.url) : undefined
    }));
  } catch {
    return [];
  }
}
