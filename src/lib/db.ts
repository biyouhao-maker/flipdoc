import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDataDir } from "./storage";
import type {
  FlipDocument,
  PageTheme,
  RenderMode,
  SourceType,
  TocItem,
  ViewMode,
} from "@/types/document";

interface DocumentRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  original_filename: string;
  source_type: string;
  render_mode: string;
  converter_note: string;
  page_count: number;
  page_width: number;
  page_height: number;
  default_view_mode: string;
  theme: string;
  cover_file: string | null;
  pdf_file: string | null;
  toc_json: string;
  passcode_hash: string | null;
  passcode_hint: string;
  expires_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord extends FlipDocument {
  passcodeHash: string | null;
}

declare global {
  var __flipdocDb: DatabaseSync | undefined;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      original_filename TEXT NOT NULL,
      source_type TEXT NOT NULL,
      render_mode TEXT NOT NULL,
      converter_note TEXT NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 1,
      page_width INTEGER NOT NULL DEFAULT 840,
      page_height INTEGER NOT NULL DEFAULT 1188,
      default_view_mode TEXT NOT NULL DEFAULT 'auto',
      theme TEXT NOT NULL DEFAULT 'warm-paper',
      cover_file TEXT,
      pdf_file TEXT,
      toc_json TEXT NOT NULL DEFAULT '[]',
      passcode_hash TEXT,
      passcode_hint TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getDb(): DatabaseSync {
  if (!globalThis.__flipdocDb) {
    const dbPath = path.join(getDataDir(), "flipdoc.sqlite");
    const db = new DatabaseSync(dbPath);
    initSchema(db);
    globalThis.__flipdocDb = db;
  }
  return globalThis.__flipdocDb;
}

function rowToRecord(row: DocumentRow): DocumentRecord {
  let toc: TocItem[] = [];
  try {
    toc = JSON.parse(row.toc_json || "[]") as TocItem[];
  } catch {
    toc = [];
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    originalFilename: row.original_filename,
    sourceType: row.source_type as SourceType,
    renderMode: row.render_mode as RenderMode,
    converterNote: row.converter_note,
    pageCount: row.page_count,
    pageWidth: row.page_width,
    pageHeight: row.page_height,
    defaultViewMode: row.default_view_mode as ViewMode,
    theme: row.theme as PageTheme,
    coverFile: row.cover_file,
    pdfFile: row.pdf_file,
    toc,
    hasPasscode: Boolean(row.passcode_hash),
    passcodeHash: row.passcode_hash,
    passcodeHint: row.passcode_hint || "",
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function generateDocId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function generateUniqueSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const rand = crypto.randomBytes(3).toString("hex");
  const base = ascii ? `${ascii}-${rand}` : `doc-${rand}`;
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM documents WHERE slug = ?").get(base);
  if (!exists) return base;
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}

export function listDocuments(): DocumentRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM documents ORDER BY created_at DESC")
    .all() as unknown as DocumentRow[];
  return rows.map(rowToRecord);
}

export function getDocumentBySlug(slug: string): DocumentRecord | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM documents WHERE slug = ?")
    .get(slug) as unknown as DocumentRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getDocumentById(id: string): DocumentRecord | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as unknown as DocumentRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface CreateDocumentInput {
  id: string;
  slug: string;
  title: string;
  description: string;
  originalFilename: string;
  sourceType: SourceType;
  renderMode: RenderMode;
  converterNote: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  defaultViewMode: ViewMode;
  theme: PageTheme;
  coverFile: string | null;
  pdfFile: string | null;
  toc: TocItem[];
  passcodeHash: string | null;
  passcodeHint: string;
  expiresAt: string | null;
}

export function insertDocument(input: CreateDocumentInput): DocumentRecord {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO documents (
      id, slug, title, description, original_filename, source_type, render_mode,
      converter_note, page_count, page_width, page_height, default_view_mode,
      theme, cover_file, pdf_file, toc_json, passcode_hash, passcode_hint,
      expires_at, view_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    input.id,
    input.slug,
    input.title,
    input.description,
    input.originalFilename,
    input.sourceType,
    input.renderMode,
    input.converterNote,
    input.pageCount,
    input.pageWidth,
    input.pageHeight,
    input.defaultViewMode,
    input.theme,
    input.coverFile,
    input.pdfFile,
    JSON.stringify(input.toc),
    input.passcodeHash,
    input.passcodeHint,
    input.expiresAt,
    now,
    now
  );

  return getDocumentById(input.id)!;
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string;
  defaultViewMode?: ViewMode;
  theme?: PageTheme;
  coverFile?: string | null;
  passcodeHash?: string | null;
  passcodeHint?: string;
  expiresAt?: string | null;
  toc?: TocItem[];
}

export function updateDocument(slug: string, patch: UpdateDocumentInput): DocumentRecord | null {
  const existing = getDocumentBySlug(slug);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE documents SET
      title = ?,
      description = ?,
      default_view_mode = ?,
      theme = ?,
      cover_file = ?,
      passcode_hash = ?,
      passcode_hint = ?,
      expires_at = ?,
      toc_json = ?,
      updated_at = ?
    WHERE slug = ?`
  ).run(
    patch.title !== undefined ? patch.title : existing.title,
    patch.description !== undefined ? patch.description : existing.description,
    patch.defaultViewMode !== undefined ? patch.defaultViewMode : existing.defaultViewMode,
    patch.theme !== undefined ? patch.theme : existing.theme,
    patch.coverFile !== undefined ? patch.coverFile : existing.coverFile,
    patch.passcodeHash !== undefined ? patch.passcodeHash : existing.passcodeHash,
    patch.passcodeHint !== undefined ? patch.passcodeHint : existing.passcodeHint,
    patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt,
    patch.toc !== undefined ? JSON.stringify(patch.toc) : JSON.stringify(existing.toc),
    now,
    slug
  );

  return getDocumentBySlug(slug);
}

export function deleteDocument(slug: string): DocumentRecord | null {
  const existing = getDocumentBySlug(slug);
  if (!existing) return null;
  const db = getDb();
  db.prepare("DELETE FROM documents WHERE slug = ?").run(slug);
  return existing;
}

export function incrementViewCount(slug: string): void {
  const db = getDb();
  db.prepare("UPDATE documents SET view_count = view_count + 1 WHERE slug = ?").run(slug);
}

export function getMeta(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function stripSecret(
  record: DocumentRecord,
  opts: { isExpired: boolean; isUnlocked: boolean }
): import("@/types/document").FlipDocumentPublic {
  const { passcodeHash: _secret, ...rest } = record;
  void _secret;
  return {
    ...rest,
    coverUrl: record.coverFile
      ? `/api/files/${record.id}/${record.coverFile}?v=${encodeURIComponent(record.updatedAt)}`
      : null,
    isExpired: opts.isExpired,
    isUnlocked: opts.isUnlocked,
  };
}
