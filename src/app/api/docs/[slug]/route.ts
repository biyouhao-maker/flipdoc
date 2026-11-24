import { NextResponse } from "next/server";
import { generateEditorialCover } from "@/lib/cover-generator";
import {
  deleteDocument,
  getDocumentBySlug,
  stripSecret,
  updateDocument,
} from "@/lib/db";
import {
  hashPasscode,
  isDocUnlockedForCurrentRequest,
  isExpired,
  isStudioAuthorized,
} from "@/lib/security";
import { removeDocDir } from "@/lib/storage";
import type { PageTheme, ViewMode } from "@/types/document";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const record = getDocumentBySlug(slug);
  if (!record) {
    return NextResponse.json({ error: "画册不存在或已被删除" }, { status: 404 });
  }

  const expired = isExpired(record.expiresAt);
  const unlocked =
    (await isDocUnlockedForCurrentRequest(record.id, record.passcodeHash)) ||
    false;

  return NextResponse.json({
    doc: stripSecret(record, { isExpired: expired, isUnlocked: unlocked }),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  if (!(await isStudioAuthorized())) {
    return NextResponse.json({ error: "需要验证工作台管理口令" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = getDocumentBySlug(slug);
  if (!existing) {
    return NextResponse.json({ error: "画册不存在" }, { status: 404 });
  }

  let body: {
    title?: string;
    description?: string;
    defaultViewMode?: ViewMode;
    theme?: PageTheme;
    passcode?: string | null; // null or "" clears passcode; non-empty sets new passcode; undefined keeps current
    passcodeHint?: string;
    expiresAt?: string | null;
    regenerateCover?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求" }, { status: 400 });
  }

  let passcodeHash: string | null | undefined = undefined;
  if (body.passcode === null || body.passcode === "") {
    passcodeHash = null;
  } else if (typeof body.passcode === "string" && body.passcode.trim()) {
    passcodeHash = hashPasscode(body.passcode.trim());
  }

  let expiresAt: string | null | undefined = undefined;
  if (body.expiresAt === null || body.expiresAt === "") {
    expiresAt = null;
  } else if (typeof body.expiresAt === "string") {
    const t = Date.parse(body.expiresAt);
    if (!Number.isNaN(t)) {
      expiresAt = new Date(t).toISOString();
    }
  }

  const nextTitle = body.title?.trim() || existing.title;
  const nextDesc =
    body.description !== undefined ? body.description.trim() : existing.description;
  const nextTheme =
    body.theme && ["editorial", "warm-paper", "minimal", "dark-ink"].includes(body.theme)
      ? body.theme
      : existing.theme;

  // Regenerate editorial cover when requested or when title/theme changed on non-custom cover
  let coverFile = existing.coverFile;
  if (
    body.regenerateCover ||
    (existing.coverFile === "cover.png" &&
      existing.sourceType !== "images" &&
      (nextTitle !== existing.title || nextTheme !== existing.theme))
  ) {
    coverFile = await generateEditorialCover({
      docId: existing.id,
      title: nextTitle,
      description: nextDesc,
      sourceType: existing.sourceType,
      pageCount: existing.pageCount,
      theme: nextTheme,
      isLandscape: existing.pageWidth > existing.pageHeight,
    });
  }

  const updated = updateDocument(slug, {
    title: nextTitle,
    description: nextDesc,
    defaultViewMode:
      body.defaultViewMode && ["auto", "flip", "swipe"].includes(body.defaultViewMode)
        ? body.defaultViewMode
        : existing.defaultViewMode,
    theme: nextTheme,
    coverFile,
    passcodeHash,
    passcodeHint:
      body.passcodeHint !== undefined ? body.passcodeHint.trim() : existing.passcodeHint,
    expiresAt,
  });

  if (!updated) {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }

  return NextResponse.json({
    doc: stripSecret(updated, {
      isExpired: isExpired(updated.expiresAt),
      isUnlocked: true,
    }),
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  if (!(await isStudioAuthorized())) {
    return NextResponse.json({ error: "需要验证工作台管理口令" }, { status: 401 });
  }

  const { slug } = await context.params;
  const deleted = deleteDocument(slug);
  if (!deleted) {
    return NextResponse.json({ error: "画册不存在" }, { status: 404 });
  }

  removeDocDir(deleted.id);
  return NextResponse.json({ deleted: true, slug });
}
