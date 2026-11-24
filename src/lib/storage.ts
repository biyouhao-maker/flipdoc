import fs from "node:fs";
import path from "node:path";

export function getDataDir(): string {
  const dir = process.env.FLIPDOC_DATA_DIR
    ? path.resolve(process.env.FLIPDOC_DATA_DIR)
    : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getUploadsDir(): string {
  const dir = path.join(getDataDir(), "uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDocDir(docId: string): string {
  const safeId = sanitizeSegment(docId);
  const dir = path.join(getUploadsDir(), safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
}

export function resolveSafeDocFile(docId: string, relativeParts: string[]): string | null {
  const baseDir = path.resolve(getUploadsDir(), sanitizeSegment(docId));
  const cleaned = relativeParts
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => p && p !== "." && p !== "..");
  if (cleaned.length === 0) return null;
  const fullPath = path.resolve(baseDir, ...cleaned);
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    return null;
  }
  return fullPath;
}

export function removeDocDir(docId: string): void {
  const safeId = sanitizeSegment(docId);
  const dir = path.join(getUploadsDir(), safeId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function writeDocJson(docId: string, filename: string, data: unknown): void {
  const filePath = path.join(getDocDir(docId), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function readDocJson<T>(docId: string, filename: string): T | null {
  const filePath = path.join(getDocDir(docId), filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
