import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { generateEditorialCover } from "@/lib/cover-generator";
import { convertOfficeToPdf, findLibreOfficePath } from "@/lib/libreoffice";
import { getDocDir, writeDocJson } from "@/lib/storage";
import type { PageTheme, TocItem } from "@/types/document";
import { paginateEditorialHtml } from "./paginator";
import { convertPdfBuffer } from "./pdf";
import type { ConvertedDocResult, DocxConversionMode } from "./types";

function extractHeadingsFromHtml(html: string): string[] {
  const headings: string[] = [];
  const regex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) headings.push(text);
  }
  return headings;
}

function extractFirstParagraph(html: string): string {
  const match = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function convertDocxBuffer(params: {
  docId: string;
  buffer: Buffer;
  originalFilename: string;
  title?: string;
  description?: string;
  theme?: PageTheme;
  docxMode?: DocxConversionMode;
}): Promise<ConvertedDocResult> {
  const docDir = getDocDir(params.docId);
  const assetsDir = path.join(docDir, "assets");
  const sourcePath = path.join(docDir, "source.docx");
  fs.writeFileSync(sourcePath, params.buffer);

  const fallbackName = path.parse(params.originalFilename).name;
  const mode = params.docxMode || "auto";

  // Extract semantic HTML + images with mammoth (also useful for description & headings)
  let imageCounter = 0;
  const mammothResult = await mammoth.convertToHtml(
    { buffer: params.buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        fs.mkdirSync(assetsDir, { recursive: true });
        imageCounter += 1;
        const ext = image.contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
        const fileName = `docx-img-${imageCounter}.${ext}`;
        const imgBuffer = await image.readAsBuffer();
        fs.writeFileSync(path.join(assetsDir, fileName), imgBuffer);
        return {
          src: `/api/files/${params.docId}/assets/${fileName}`,
        };
      }),
    }
  );

  const html = mammothResult.value || "";
  const firstHeading = extractHeadingsFromHtml(html)[0];
  const resolvedTitle = params.title?.trim() || fallbackName || firstHeading || "未命名 Word 文档";
  const autoDesc =
    params.description?.trim() ||
    extractFirstParagraph(html).slice(0, 120) ||
    "Word 文档翻页阅读版本";

  // High-fidelity LibreOffice path when requested (or default 'auto' when LibreOffice is installed)
  const shouldTryLibreOffice =
    mode === "fidelity" || (mode === "auto" && Boolean(findLibreOfficePath()));

  if (shouldTryLibreOffice) {
    const pdfPath = await convertOfficeToPdf(sourcePath, docDir);
    if (pdfPath && fs.existsSync(pdfPath)) {
      const pdfBytes = fs.readFileSync(pdfPath);
      const headings = extractHeadingsFromHtml(html);
      const pdfResult = await convertPdfBuffer({
        docId: params.docId,
        buffer: pdfBytes,
        originalFilename: params.originalFilename,
        title: resolvedTitle,
        description: autoDesc,
        theme: params.theme,
        sourceTypeOverride: "docx",
        converterNoteOverride: "Word 原版高保真还原（LibreOffice）",
        tocOverride: [],
      });

      // Approximate heading page placement only if headings exist and PDF has no outline
      const approxToc: TocItem[] = headings.slice(0, 18).map((h, idx) => ({
        id: `docx-h-${idx + 1}`,
        title: h.slice(0, 56),
        page: Math.min(
          pdfResult.pageCount,
          Math.max(1, Math.floor((idx / Math.max(1, headings.length)) * pdfResult.pageCount) + 1)
        ),
        level: idx === 0 ? 1 : 2,
      }));
      pdfResult.toc = approxToc;
      return pdfResult;
    }
  }

  // Mobile-friendly Editorial Reflow mode (zero external binary dependency!)
  const { pages, toc, autoDescription } = paginateEditorialHtml({
    html,
    title: resolvedTitle,
    description: autoDesc,
    sourceType: "docx",
    includeCoverPage: true,
  });

  writeDocJson(params.docId, "pages.json", pages);

  const coverFile = await generateEditorialCover({
    docId: params.docId,
    title: resolvedTitle,
    description: autoDescription,
    sourceType: "docx",
    pageCount: pages.length,
    theme: params.theme || "warm-paper",
    isLandscape: false,
  });

  return {
    title: resolvedTitle,
    description: autoDescription,
    sourceType: "docx",
    renderMode: "html-pages",
    converterNote: "Word 手机精排自动分页",
    pageCount: pages.length,
    pageWidth: 840,
    pageHeight: 1188,
    coverFile,
    pdfFile: null,
    toc,
  };
}
