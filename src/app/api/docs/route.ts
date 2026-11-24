import { NextResponse } from "next/server";
import { convertUploadedFiles } from "@/lib/converters";
import type { DocxConversionMode } from "@/lib/converters/types";
import {
  generateDocId,
  generateUniqueSlug,
  insertDocument,
  listDocuments,
  stripSecret,
} from "@/lib/db";
import { hashPasscode, isExpired, isStudioAuthorized } from "@/lib/security";
import { ensureDemoSeeded } from "@/lib/seed";
import { removeDocDir } from "@/lib/storage";
import type { PageTheme, ViewMode } from "@/types/document";

export const dynamic = "force-dynamic";

const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60MB

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reseed = url.searchParams.get("reseed") === "1";

  if (reseed) {
    if (!(await isStudioAuthorized())) {
      return NextResponse.json({ error: "需要管理口令" }, { status: 401 });
    }
    await ensureDemoSeeded(true);
  } else {
    await ensureDemoSeeded(false);
  }

  const records = listDocuments();
  const docs = records.map((r) =>
    stripSecret(r, {
      isExpired: isExpired(r.expiresAt),
      isUnlocked: true,
    })
  );

  return NextResponse.json({ docs });
}

export async function POST(request: Request) {
  if (!(await isStudioAuthorized())) {
    return NextResponse.json({ error: "需要验证工作台管理口令" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "无法解析上传表单数据" }, { status: 400 });
  }

  const rawFiles: File[] = [];
  for (const entry of formData.getAll("files")) {
    if (entry instanceof File && entry.size > 0) rawFiles.push(entry);
  }
  const single = formData.get("file");
  if (rawFiles.length === 0 && single instanceof File && single.size > 0) {
    rawFiles.push(single);
  }

  if (rawFiles.length === 0) {
    return NextResponse.json({ error: "请选择至少一个有效文件" }, { status: 400 });
  }

  const totalBytes = rawFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "上传文件总大小不能超过 60MB" }, { status: 413 });
  }

  const title = (formData.get("title") as string | null)?.trim() || "";
  const description = (formData.get("description") as string | null)?.trim() || "";
  const defaultViewMode =
    ((formData.get("defaultViewMode") as string | null) as ViewMode) || "auto";
  const theme = ((formData.get("theme") as string | null) as PageTheme) || "warm-paper";
  const docxMode =
    ((formData.get("docxMode") as string | null) as DocxConversionMode) || "auto";
  const passcode = (formData.get("passcode") as string | null)?.trim() || "";
  const passcodeHint = (formData.get("passcodeHint") as string | null)?.trim() || "";
  const expiresAtRaw = (formData.get("expiresAt") as string | null)?.trim() || "";

  let expiresAt: string | null = null;
  if (expiresAtRaw) {
    const parsed = Date.parse(expiresAtRaw);
    if (!Number.isNaN(parsed)) {
      expiresAt = new Date(parsed).toISOString();
    }
  }

  const docId = generateDocId();

  try {
    const fileBuffers = await Promise.all(
      rawFiles.map(async (file) => ({
        name: file.name || "untitled",
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const converted = await convertUploadedFiles({
      docId,
      files: fileBuffers,
      title,
      description,
      theme,
      docxMode,
    });

    const slug = generateUniqueSlug(converted.title);
    const originalFilename =
      rawFiles.length > 1
        ? `${rawFiles[0].name} 等 ${rawFiles.length} 个文件`
        : rawFiles[0].name;

    const record = insertDocument({
      id: docId,
      slug,
      title: converted.title,
      description: converted.description,
      originalFilename,
      sourceType: converted.sourceType,
      renderMode: converted.renderMode,
      converterNote: converted.converterNote,
      pageCount: converted.pageCount,
      pageWidth: converted.pageWidth,
      pageHeight: converted.pageHeight,
      defaultViewMode: ["auto", "flip", "swipe"].includes(defaultViewMode)
        ? defaultViewMode
        : "auto",
      theme: ["editorial", "warm-paper", "minimal", "dark-ink"].includes(theme)
        ? theme
        : "warm-paper",
      coverFile: converted.coverFile,
      pdfFile: converted.pdfFile,
      toc: converted.toc,
      passcodeHash: passcode ? hashPasscode(passcode) : null,
      passcodeHint,
      expiresAt,
    });

    return NextResponse.json(
      {
        doc: stripSecret(record, {
          isExpired: isExpired(record.expiresAt),
          isUnlocked: true,
        }),
      },
      { status: 201 }
    );
  } catch (err) {
    removeDocDir(docId);
    const message = err instanceof Error ? err.message : "文档转换失败，请检查文件是否损坏";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
