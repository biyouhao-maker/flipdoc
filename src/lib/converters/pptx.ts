import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { generateEditorialCover } from "@/lib/cover-generator";
import { convertOfficeToPdf, findLibreOfficePath } from "@/lib/libreoffice";
import { getDocDir, writeDocJson } from "@/lib/storage";
import type { HtmlPageItem, PageTheme, TocItem } from "@/types/document";
import { convertPdfBuffer } from "./pdf";
import type { ConvertedDocResult } from "./types";

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ParsedSlide {
  index: number;
  title: string;
  paragraphs: string[];
  imageUrls: string[];
}

async function parsePptxSlides(docId: string, buffer: Buffer): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml/i.exec(a)?.[1] || 0);
      const nb = Number(/slide(\d+)\.xml/i.exec(b)?.[1] || 0);
      return na - nb;
    });

  const assetsDir = path.join(getDocDir(docId), "assets");
  const slides: ParsedSlide[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const entryName = slideEntries[i];
    const xml = await zip.files[entryName].async("string");
    const slideNumber = i + 1;

    // Extract title placeholder if present
    let title = "";
    const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/gi) || [];
    const paragraphs: string[] = [];

    for (const shape of shapes) {
      const isTitlePlaceholder = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(shape);
      const pBlocks = shape.match(/<a:p\b[\s\S]*?<\/a:p>/gi) || [];
      for (const pBlock of pBlocks) {
        const runs = Array.from(pBlock.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)).map((m) =>
          decodeXmlEntities(m[1])
        );
        const line = runs.join("").replace(/\s+/g, " ").trim();
        if (!line) continue;
        if (isTitlePlaceholder && !title) {
          title = line;
        } else {
          paragraphs.push(line);
        }
      }
    }

    // Fallback: extract text outside <p:sp> (e.g. tables) if paragraphs empty
    if (!title && paragraphs.length === 0) {
      const allRuns = Array.from(xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi))
        .map((m) => decodeXmlEntities(m[1]).trim())
        .filter(Boolean);
      if (allRuns.length > 0) {
        title = allRuns[0];
        paragraphs.push(...allRuns.slice(1));
      }
    }

    if (!title && paragraphs.length > 0) {
      title = paragraphs.shift() || `第 ${slideNumber} 页`;
    }

    // Extract slide images via slide rels
    const imageUrls: string[] = [];
    const slideBasename = path.basename(entryName);
    const relsEntry = zip.files[`ppt/slides/_rels/${slideBasename}.rels`];
    if (relsEntry) {
      const relsXml = await relsEntry.async("string");
      const targetMatches = Array.from(
        relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/gi)
      );
      for (const tm of targetMatches) {
        const mediaName = tm[1];
        const mediaEntry = zip.files[`ppt/media/${mediaName}`];
        if (!mediaEntry) continue;
        const ext = path.extname(mediaName).toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) continue;
        fs.mkdirSync(assetsDir, { recursive: true });
        const outName = `slide-${slideNumber}-${mediaName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const mediaBytes = await mediaEntry.async("nodebuffer");
        fs.writeFileSync(path.join(assetsDir, outName), mediaBytes);
        imageUrls.push(`/api/files/${docId}/assets/${outName}`);
      }
    }

    slides.push({
      index: slideNumber,
      title: title || `第 ${slideNumber} 页`,
      paragraphs,
      imageUrls,
    });
  }

  return slides;
}

export async function convertPptxBuffer(params: {
  docId: string;
  buffer: Buffer;
  originalFilename: string;
  title?: string;
  description?: string;
  theme?: PageTheme;
}): Promise<ConvertedDocResult> {
  const docDir = getDocDir(params.docId);
  const sourcePath = path.join(docDir, "source.pptx");
  fs.writeFileSync(sourcePath, params.buffer);

  const slides = await parsePptxSlides(params.docId, params.buffer);
  const fallbackName = path.parse(params.originalFilename).name;
  const resolvedTitle =
    params.title?.trim() || fallbackName || slides[0]?.title || "未命名演示文稿";
  const resolvedDesc =
    params.description?.trim() ||
    slides[0]?.paragraphs[0]?.slice(0, 120) ||
    `共 ${Math.max(1, slides.length)} 页演示文稿 · 支持 3D 翻页与微信高清缩放`;

  const toc: TocItem[] = slides.map((s) => ({
    id: `slide-${s.index}`,
    title: s.title.slice(0, 56),
    page: s.index,
    level: s.index === 1 ? 1 : 2,
  }));

  // High-fidelity LibreOffice PPTX -> PDF conversion when available
  if (findLibreOfficePath()) {
    const pdfPath = await convertOfficeToPdf(sourcePath, docDir);
    if (pdfPath && fs.existsSync(pdfPath)) {
      const pdfBytes = fs.readFileSync(pdfPath);
      return convertPdfBuffer({
        docId: params.docId,
        buffer: pdfBytes,
        originalFilename: params.originalFilename,
        title: resolvedTitle,
        description: resolvedDesc,
        theme: params.theme,
        sourceTypeOverride: "pptx",
        converterNoteOverride: "PPTX 原版高保真还原（LibreOffice）",
        tocOverride: toc,
      });
    }
  }

  // Zero-dependency built-in slide renderer fallback
  const htmlPages: HtmlPageItem[] = slides.map((slide, idx) => {
    const isCover = idx === 0;
    const bulletsHtml = slide.paragraphs
      .slice(0, 10)
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    const imgsHtml = slide.imageUrls
      .slice(0, 2)
      .map((url) => `<img src="${escapeHtml(url)}" alt="slide visual" class="fd-slide-img" />`)
      .join("");

    const html = isCover
      ? `
        <div class="fd-slide-page fd-slide-cover">
          <div class="fd-slide-kicker">PRESENTATION · ${slides.length} SLIDES</div>
          <h1 class="fd-slide-cover-title">${escapeHtml(slide.title)}</h1>
          ${slide.paragraphs.length ? `<p class="fd-slide-cover-sub">${escapeHtml(slide.paragraphs.slice(0, 2).join(" · "))}</p>` : ""}
          ${imgsHtml ? `<div class="fd-slide-media-row">${imgsHtml}</div>` : ""}
        </div>
      `
      : `
        <div class="fd-slide-page">
          <div class="fd-slide-header">
            <span class="fd-slide-num">${String(slide.index).padStart(2, "0")}</span>
            <h2 class="fd-slide-title">${escapeHtml(slide.title)}</h2>
          </div>
          <div class="fd-slide-body ${imgsHtml ? "has-media" : ""}">
            ${bulletsHtml ? `<ul class="fd-slide-list">${bulletsHtml}</ul>` : ""}
            ${imgsHtml ? `<div class="fd-slide-media">${imgsHtml}</div>` : ""}
          </div>
        </div>
      `;

    return {
      index: slide.index,
      html,
      sectionTitle: slide.title,
      isCover,
      slideStyle: "slide",
    };
  });

  if (htmlPages.length === 0) {
    htmlPages.push({
      index: 1,
      html: `<div class="fd-slide-page"><h2>${escapeHtml(resolvedTitle)}</h2><p>未能从 PPTX 中读取到幻灯片内容。</p></div>`,
      sectionTitle: resolvedTitle,
      slideStyle: "slide",
    });
  }

  writeDocJson(params.docId, "pages.json", htmlPages);

  const coverFile = await generateEditorialCover({
    docId: params.docId,
    title: resolvedTitle,
    description: resolvedDesc,
    sourceType: "pptx",
    pageCount: htmlPages.length,
    theme: params.theme,
    isLandscape: true,
  });

  return {
    title: resolvedTitle,
    description: resolvedDesc,
    sourceType: "pptx",
    renderMode: "html-pages",
    converterNote: "PPTX 轻量幻灯片解析（内置模式）",
    pageCount: htmlPages.length,
    pageWidth: 1280,
    pageHeight: 720,
    coverFile,
    pdfFile: null,
    toc,
  };
}
