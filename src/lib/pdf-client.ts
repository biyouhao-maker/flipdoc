"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { TocItem } from "@/types/document";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      if (typeof window !== "undefined") {
        mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function loadPdfDocument(url: string): Promise<{
  pdf: PDFDocumentProxy;
  destroy: () => Promise<void>;
}> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    url,
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
    withCredentials: true,
  });
  const pdf = await loadingTask.promise;
  return {
    pdf,
    destroy: async () => {
      try {
        await loadingTask.destroy();
      } catch {
        // ignore cleanup error
      }
    },
  };
}

interface PdfOutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineNode[];
}

export async function extractPdfOutlineToc(pdf: PDFDocumentProxy): Promise<TocItem[]> {
  try {
    const outline = (await pdf.getOutline()) as PdfOutlineNode[] | null;
    if (!outline || outline.length === 0) return [];

    const result: TocItem[] = [];

    const walk = async (nodes: PdfOutlineNode[], level: number) => {
      for (const node of nodes) {
        if (!node.title) continue;
        let pageNum = 1;
        try {
          let dest = node.dest;
          if (typeof dest === "string") {
            dest = await pdf.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const ref = dest[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0];
            const idx = await pdf.getPageIndex(ref);
            pageNum = idx + 1;
          }
        } catch {
          // ignore unresolvable bookmark destination
        }

        result.push({
          id: `pdf-toc-${result.length + 1}`,
          title: node.title.trim().slice(0, 64),
          page: Math.max(1, Math.min(pdf.numPages, pageNum)),
          level: Math.min(3, level),
        });

        if (node.items && node.items.length > 0 && level < 3) {
          await walk(node.items, level + 1);
        }
      }
    };

    await walk(outline, 1);
    return result;
  } catch {
    return [];
  }
}

const activeRenderTasks = new WeakMap<HTMLCanvasElement, RenderTask>();

export async function renderPdfPageToCanvas(params: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  canvas: HTMLCanvasElement;
  targetWidth: number;
  maxDpr?: number;
}): Promise<void> {
  const existing = activeRenderTasks.get(params.canvas);
  if (existing) {
    try {
      existing.cancel();
    } catch {
      // ignore cancel race
    }
  }

  const page = await params.pdf.getPage(params.pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, params.maxDpr ?? 2.2);
  const cssWidth = Math.max(120, params.targetWidth);
  const scale = (cssWidth / baseViewport.width) * dpr;
  const viewport = page.getViewport({ scale });

  const ctx = params.canvas.getContext("2d");
  if (!ctx) return;

  params.canvas.width = Math.floor(viewport.width);
  params.canvas.height = Math.floor(viewport.height);
  params.canvas.style.width = "100%";
  params.canvas.style.height = "100%";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, params.canvas.width, params.canvas.height);

  const renderTask = page.render({
    canvas: params.canvas,
    canvasContext: ctx,
    viewport,
  });

  activeRenderTasks.set(params.canvas, renderTask);
  try {
    await renderTask.promise;
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "RenderingCancelledException") {
      return;
    }
    throw err;
  } finally {
    if (activeRenderTasks.get(params.canvas) === renderTask) {
      activeRenderTasks.delete(params.canvas);
    }
  }
}

export async function renderPdfPageToPngBlob(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  targetWidth = 1080
): Promise<Blob | null> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.92));
}
