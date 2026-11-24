import { NextResponse } from "next/server";
import { getDocumentBySlug, incrementViewCount, stripSecret } from "@/lib/db";
import { isDocUnlockedForCurrentRequest, isExpired } from "@/lib/security";
import { readDocJson } from "@/lib/storage";
import type {
  FlipDocumentContent,
  HtmlPageItem,
  ImagePageItem,
} from "@/types/document";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const record = getDocumentBySlug(slug);
  if (!record) {
    return NextResponse.json({ error: "画册不存在或已被删除" }, { status: 404 });
  }

  if (isExpired(record.expiresAt)) {
    return NextResponse.json(
      { error: "该分享链接已过期", code: "EXPIRED" },
      { status: 410 }
    );
  }

  const unlocked = await isDocUnlockedForCurrentRequest(record.id, record.passcodeHash);
  if (!unlocked) {
    return NextResponse.json(
      { error: "请输入访问密码后查看", code: "LOCKED" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("track") !== "0") {
    incrementViewCount(slug);
    record.viewCount += 1;
  }

  let htmlPages: HtmlPageItem[] = [];
  let imagePages: FlipDocumentContent["imagePages"] = [];
  let pdfUrl: string | null = null;

  if (record.renderMode === "pdf" && record.pdfFile) {
    pdfUrl = `/api/files/${record.id}/${record.pdfFile}`;
  } else if (record.renderMode === "html-pages") {
    htmlPages = readDocJson<HtmlPageItem[]>(record.id, "pages.json") || [];
  } else if (record.renderMode === "images") {
    const rawImages = readDocJson<ImagePageItem[]>(record.id, "pages.json") || [];
    imagePages = rawImages.map((img) => ({
      index: img.index,
      url: `/api/files/${record.id}/${img.file}`,
      width: img.width,
      height: img.height,
      caption: img.caption,
    }));
  }

  const payload: FlipDocumentContent = {
    doc: stripSecret(record, { isExpired: false, isUnlocked: true }),
    pdfUrl,
    htmlPages,
    imagePages,
  };

  return NextResponse.json(payload);
}
