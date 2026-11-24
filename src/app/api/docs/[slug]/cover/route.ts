import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getDocumentBySlug, stripSecret, updateDocument } from "@/lib/db";
import { isExpired, isStudioAuthorized } from "@/lib/security";
import { getDocDir } from "@/lib/storage";

export async function POST(
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "无效的上传数据" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择封面图片" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "封面图片不能超过 15MB" }, { status: 413 });
  }

  const isCustom = formData.get("mode") !== "auto-pdf";
  const coverFilename = isCustom ? "custom-cover.png" : "page1-cover.png";
  const outPath = path.join(getDocDir(existing.id), coverFilename);

  const inputBytes = Buffer.from(await file.arrayBuffer());
  await sharp(inputBytes)
    .rotate()
    .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
    .png({ quality: 92 })
    .toFile(outPath);

  const updated = updateDocument(slug, { coverFile: coverFilename });
  if (!updated) {
    return NextResponse.json({ error: "更新封面失败" }, { status: 500 });
  }

  return NextResponse.json({
    doc: stripSecret(updated, {
      isExpired: isExpired(updated.expiresAt),
      isUnlocked: true,
    }),
  });
}
