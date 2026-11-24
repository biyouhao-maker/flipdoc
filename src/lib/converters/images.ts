import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDocDir, writeDocJson } from "@/lib/storage";
import type { ImagePageItem, TocItem } from "@/types/document";
import type { ConvertedDocResult } from "./types";

export async function convertImageBuffers(params: {
  docId: string;
  files: Array<{ name: string; buffer: Buffer }>;
  title?: string;
  description?: string;
}): Promise<ConvertedDocResult> {
  const docDir = getDocDir(params.docId);
  const assetsDir = path.join(docDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  const imagePages: ImagePageItem[] = [];
  const toc: TocItem[] = [];
  let refWidth = 900;
  let refHeight = 1200;

  for (let i = 0; i < params.files.length; i++) {
    const file = params.files[i];
    const index = i + 1;
    const outFilename = `page-${String(index).padStart(3, "0")}.webp`;
    const outPath = path.join(assetsDir, outFilename);

    const processed = await sharp(file.buffer)
      .rotate()
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });

    fs.writeFileSync(outPath, processed.data);

    const w = processed.info.width || 900;
    const h = processed.info.height || 1200;
    if (i === 0) {
      refWidth = w;
      refHeight = h;
      // Save real cover.png from first image for Open Graph & Studio cards
      await sharp(processed.data)
        .resize({ width: 1080, height: 1440, fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toFile(path.join(docDir, "cover.png"));
    }

    const label = path.parse(file.name).name || `第 ${index} 页`;
    imagePages.push({
      index,
      file: `assets/${outFilename}`,
      width: w,
      height: h,
      caption: label,
    });
    toc.push({
      id: `img-${index}`,
      title: label.slice(0, 48),
      page: index,
      level: 1,
    });
  }

  writeDocJson(params.docId, "pages.json", imagePages);

  const firstBase = path.parse(params.files[0]?.name || "精选图集").name;
  const resolvedTitle =
    params.title?.trim() || (params.files.length > 1 ? `${firstBase} 等 ${params.files.length} 页图集` : firstBase);
  const resolvedDesc =
    params.description?.trim() || `共 ${imagePages.length} 张高清图片 · 微信画册翻页浏览`;

  return {
    title: resolvedTitle,
    description: resolvedDesc,
    sourceType: "images",
    renderMode: "images",
    converterNote: `高清图片画册（已自动 WebP 压缩优化）`,
    pageCount: imagePages.length,
    pageWidth: refWidth,
    pageHeight: refHeight,
    coverFile: "cover.png",
    pdfFile: null,
    toc,
  };
}
