import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { generateEditorialCover } from "@/lib/cover-generator";
import { getDocDir } from "@/lib/storage";
import type { PageTheme, SourceType, TocItem } from "@/types/document";
import type { ConvertedDocResult } from "./types";

export async function inspectPdfMetrics(pdfBytes: Buffer): Promise<{
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
}> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = Math.max(1, pdfDoc.getPageCount());
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();

  // Normalize dimensions so aspect ratio is exact while keeping clean integer scale
  const scale = width > height ? 1280 / width : 840 / width;
  return {
    pageCount,
    pageWidth: Math.round(width * scale),
    pageHeight: Math.round(height * scale),
  };
}

export async function convertPdfBuffer(params: {
  docId: string;
  buffer: Buffer;
  originalFilename: string;
  title?: string;
  description?: string;
  theme?: PageTheme;
  sourceTypeOverride?: SourceType;
  converterNoteOverride?: string;
  tocOverride?: TocItem[];
}): Promise<ConvertedDocResult> {
  const docDir = getDocDir(params.docId);
  const pdfFile = "rendered.pdf";
  fs.writeFileSync(path.join(docDir, pdfFile), params.buffer);

  let pageCount = 1;
  let pageWidth = 840;
  let pageHeight = 1188;

  try {
    const metrics = await inspectPdfMetrics(params.buffer);
    pageCount = metrics.pageCount;
    pageWidth = metrics.pageWidth;
    pageHeight = metrics.pageHeight;
  } catch (err) {
    console.warn("[FlipDoc] pdf-lib inspect warning, using default metrics:", err);
  }

  const fallbackName = path.parse(params.originalFilename).name;
  const resolvedTitle = params.title?.trim() || fallbackName || "未命名画册";
  const resolvedDesc =
    params.description?.trim() ||
    `共 ${pageCount} 页 · 支持 3D 仿真翻书、手机滑动与高清双指缩放`;
  const sourceType = params.sourceTypeOverride || "pdf";

  const coverFile = await generateEditorialCover({
    docId: params.docId,
    title: resolvedTitle,
    description: resolvedDesc,
    sourceType,
    pageCount,
    theme: params.theme,
    isLandscape: pageWidth > pageHeight,
  });

  return {
    title: resolvedTitle,
    description: resolvedDesc,
    sourceType,
    renderMode: "pdf",
    converterNote: params.converterNoteOverride || "PDF 原版高清分页渲染",
    pageCount,
    pageWidth,
    pageHeight,
    coverFile,
    pdfFile,
    toc: params.tocOverride || [],
  };
}
