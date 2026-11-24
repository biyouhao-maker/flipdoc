import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/db";
import {
  isDocUnlockedForCurrentRequest,
  isExpired,
  isStudioAuthorized,
  isStudioLockEnabled,
} from "@/lib/security";
import { getMimeType, resolveSafeDocFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const PUBLIC_COVER_FILES = new Set(["cover.png", "custom-cover.png", "page1-cover.png"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ docId: string; filepath: string[] }> }
) {
  const { docId, filepath } = await context.params;
  if (!filepath || filepath.length === 0) {
    return NextResponse.json({ error: "File not specified" }, { status: 400 });
  }

  const record = getDocumentById(docId);
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isPublicCover =
    filepath.length === 1 && PUBLIC_COVER_FILES.has(filepath[0]);

  if (!isPublicCover) {
    // Protected assets require valid expiry & unlock state (or authenticated studio operator when studio lock is configured)
    const expired = isExpired(record.expiresAt);
    const unlocked = await isDocUnlockedForCurrentRequest(record.id, record.passcodeHash);
    const studioOverride = isStudioLockEnabled() && (await isStudioAuthorized());

    if (expired && !studioOverride) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }
    if (!unlocked && !studioOverride) {
      return NextResponse.json({ error: "Locked" }, { status: 403 });
    }
  }

  const fullPath = resolveSafeDocFile(docId, filepath);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const contentType = getMimeType(fullPath);
  const cacheControl = isPublicCover
    ? "public, max-age=300, stale-while-revalidate=3600"
    : "private, max-age=600";

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2]
        ? Math.min(stat.size - 1, Number.parseInt(match[2], 10))
        : stat.size - 1;

      if (start >= stat.size || start > end || Number.isNaN(start) || Number.isNaN(end)) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }

      const chunkSize = end - start + 1;
      const buf = Buffer.alloc(chunkSize);
      const fd = fs.openSync(fullPath, "r");
      try {
        fs.readSync(fd, buf, 0, chunkSize, start);
      } finally {
        fs.closeSync(fd);
      }

      return new NextResponse(buf, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  const data = fs.readFileSync(fullPath);
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
