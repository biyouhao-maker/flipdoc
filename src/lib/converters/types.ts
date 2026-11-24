import type { RenderMode, SourceType, TocItem } from "@/types/document";

export type DocxConversionMode = "auto" | "fidelity" | "reflow";

export interface ConvertedDocResult {
  title: string;
  description: string;
  sourceType: SourceType;
  renderMode: RenderMode;
  converterNote: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  coverFile: string | null;
  pdfFile: string | null;
  toc: TocItem[];
}
