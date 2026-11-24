import path from "node:path";
import type { PageTheme } from "@/types/document";
import { convertDocxBuffer } from "./docx";
import { convertImageBuffers } from "./images";
import { convertMarkdownBuffer } from "./markdown";
import { convertPdfBuffer } from "./pdf";
import { convertPptxBuffer } from "./pptx";
import type { ConvertedDocResult, DocxConversionMode } from "./types";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export async function convertUploadedFiles(params: {
  docId: string;
  files: Array<{ name: string; buffer: Buffer }>;
  title?: string;
  description?: string;
  theme?: PageTheme;
  docxMode?: DocxConversionMode;
}): Promise<ConvertedDocResult> {
  if (params.files.length === 0) {
    throw new Error("请至少上传一个文件");
  }

  const allImages = params.files.every((f) =>
    IMAGE_EXTS.has(path.extname(f.name).toLowerCase())
  );

  if (allImages) {
    return convertImageBuffers({
      docId: params.docId,
      files: params.files,
      title: params.title,
      description: params.description,
    });
  }

  const primary = params.files[0];
  const ext = path.extname(primary.name).toLowerCase();

  switch (ext) {
    case ".pdf":
      return convertPdfBuffer({
        docId: params.docId,
        buffer: primary.buffer,
        originalFilename: primary.name,
        title: params.title,
        description: params.description,
        theme: params.theme,
      });

    case ".docx":
    case ".doc":
      return convertDocxBuffer({
        docId: params.docId,
        buffer: primary.buffer,
        originalFilename: primary.name,
        title: params.title,
        description: params.description,
        theme: params.theme,
        docxMode: ext === ".doc" ? "fidelity" : params.docxMode,
      });

    case ".pptx":
    case ".ppt":
      return convertPptxBuffer({
        docId: params.docId,
        buffer: primary.buffer,
        originalFilename: primary.name,
        title: params.title,
        description: params.description,
        theme: params.theme,
      });

    case ".md":
    case ".markdown":
    case ".txt":
      return convertMarkdownBuffer({
        docId: params.docId,
        buffer: primary.buffer,
        originalFilename: primary.name,
        title: params.title,
        description: params.description,
        theme: params.theme,
      });

    default:
      throw new Error(
        `暂不支持的文件格式 "${ext || primary.name}"。目前支持 PDF、Word (.docx)、PPT (.pptx)、Markdown (.md / .txt) 以及多张图片。`
      );
  }
}
