"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageFlip } from "page-flip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EbookFontFamily } from "@/lib/ebook-paginator";
import { renderPdfPageToCanvas } from "@/lib/pdf-client";
import type { FlipDocumentContent, HtmlPageItem, PageTheme } from "@/types/document";

interface FlipbookViewProps {
  content: FlipDocumentContent;
  htmlPagesOverride?: HtmlPageItem[];
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number; // 1-based
  theme: PageTheme;
  fontSize: number;
  fontFamily: EbookFontFamily;
  isMobileFullBleed: boolean;
  onPageChange: (page: number) => void;
  onCenterTap: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function FlipbookView({
  content,
  htmlPagesOverride,
  pdfDoc,
  currentPage,
  theme,
  fontSize,
  fontFamily,
  isMobileFullBleed,
  onPageChange,
  onCenterTap,
}: FlipbookViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const pdfCanvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPdfPagesRef = useRef<Set<number>>(new Set());
  const isInternalFlipRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [pageDims, setPageDims] = useState({ width: 420, height: 594, isSpread: false });

  const { doc, imagePages } = content;
  const htmlPages = htmlPagesOverride || content.htmlPages;

  const totalPages =
    doc.renderMode === "pdf"
      ? pdfDoc?.numPages || doc.pageCount
      : doc.renderMode === "images"
        ? imagePages.length
        : htmlPages.length;

  const aspectRatio = Math.max(0.45, Math.min(2.2, doc.pageWidth / Math.max(1, doc.pageHeight)));
  const isLandscape = aspectRatio > 1.12;
  const isEbookFullBleed = isMobileFullBleed && doc.renderMode === "html-pages";

  // Observe available stage dimensions
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute ideal page width/height & single vs 2-page book spread
  useEffect(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) return;

    if (isEbookFullBleed) {
      // Apple Books Curl mode on mobile: 100% edge-to-edge realistic curling page!
      const w = viewportSize.width;
      const h = viewportSize.height;
      setPageDims((prev) =>
        Math.abs(prev.width - w) > 4 || Math.abs(prev.height - h) > 4 || prev.isSpread
          ? { width: w, height: h, isSpread: false }
          : prev
      );
      return;
    }

    const padX = viewportSize.width >= 768 ? 112 : 20;
    const padY = viewportSize.width >= 768 ? 36 : 20;
    const availW = Math.max(240, viewportSize.width - padX);
    const availH = Math.max(300, viewportSize.height - padY);

    // Portrait docs on wide desktop screens open as a 2-page physical magazine spread!
    const useSpread = !isLandscape && viewportSize.width >= 900 && totalPages > 1;
    const maxSingleW = useSpread ? Math.floor(availW / 2) : availW;

    let w = maxSingleW;
    let h = Math.floor(w / aspectRatio);
    if (h > availH) {
      h = availH;
      w = Math.floor(h * aspectRatio);
    }

    w = Math.max(220, Math.min(w, 960));
    h = Math.max(240, Math.min(h, 960));

    setPageDims((prev) =>
      Math.abs(prev.width - w) > 8 ||
      Math.abs(prev.height - h) > 8 ||
      prev.isSpread !== useSpread
        ? { width: w, height: h, isSpread: useSpread }
        : prev
    );
  }, [viewportSize, aspectRatio, isLandscape, totalPages, isEbookFullBleed]);

  // Mount imperative StPageFlip cleanly outside React VDOM diffing
  useEffect(() => {
    const host = hostRef.current;
    if (!host || totalPages <= 0 || pageDims.width <= 0) return;
    if (doc.renderMode === "pdf" && !pdfDoc) return;

    const canvasMap = pdfCanvasMapRef.current;
    const renderedPages = renderedPdfPagesRef.current;

    if (flipRef.current) {
      try {
        flipRef.current.destroy();
      } catch {
        // ignore
      }
      flipRef.current = null;
    }
    host.innerHTML = "";
    canvasMap.clear();
    renderedPages.clear();

    const bookEl = document.createElement("div");
    bookEl.className = "fd-book-mount";
    bookEl.style.width = `${pageDims.isSpread ? pageDims.width * 2 : pageDims.width}px`;
    bookEl.style.height = `${pageDims.height}px`;
    host.appendChild(bookEl);

    const pageElements: HTMLElement[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const pageEl = document.createElement("div");
      pageEl.className = "fd-flip-page";
      pageEl.setAttribute("data-density", i === 0 || i === totalPages - 1 ? "hard" : "soft");

      if (doc.renderMode === "pdf") {
        const wrap = document.createElement("div");
        wrap.className = "relative flex h-full w-full items-center justify-center bg-white";
        const canvas = document.createElement("canvas");
        canvas.className = "h-full w-full block";
        wrap.appendChild(canvas);
        pageEl.appendChild(wrap);
        canvasMap.set(pageNum, canvas);
      } else if (doc.renderMode === "images") {
        const imgItem = imagePages[i];
        const wrap = document.createElement("div");
        wrap.className = "relative flex h-full w-full items-center justify-center bg-[#181715]";
        if (imgItem) {
          const img = document.createElement("img");
          img.src = imgItem.url;
          img.alt = imgItem.caption || `第 ${pageNum} 页`;
          img.loading = "lazy";
          img.draggable = false;
          img.className = "h-full w-full object-contain select-none";
          wrap.appendChild(img);
        }
        pageEl.appendChild(wrap);
      } else {
        const htmlItem = htmlPages[i];
        const isSpecial = Boolean(htmlItem?.isCover || htmlItem?.slideStyle === "slide");
        const sheet = document.createElement("div");
        sheet.className = `fd-page-sheet ${isEbookFullBleed ? "is-ebook-mobile" : ""}`;
        sheet.setAttribute("data-theme", theme);
        sheet.setAttribute("data-font", fontFamily);

        if (!isSpecial) {
          const header = document.createElement("div");
          header.className = "fd-page-header";
          header.innerHTML = isEbookFullBleed
            ? `<span class="truncate pr-3">${escapeHtml(htmlItem?.sectionTitle || doc.title)}</span>`
            : `<span class="truncate pr-3">${escapeHtml(
                htmlItem?.sectionTitle || doc.title
              )}</span><span class="shrink-0 opacity-75">FLIPDOC</span>`;
          sheet.appendChild(header);
        }

        const body = document.createElement("div");
        body.className = `fd-page-body fd-prose ${htmlItem?.isCover ? "is-cover-body" : ""} ${
          htmlItem?.slideStyle === "slide" ? "is-slide-body" : ""
        }`;
        if (!isSpecial) {
          body.style.fontSize = `${fontSize}px`;
        }
        body.innerHTML = htmlItem?.html || "";
        sheet.appendChild(body);

        if (!isSpecial) {
          const footer = document.createElement("div");
          footer.className = "fd-page-footer";
          if (isEbookFullBleed) {
            const pct = Math.max(0, Math.min(100, (pageNum / Math.max(1, totalPages)) * 100));
            footer.innerHTML = `<div class="flex w-full flex-col items-center gap-1.5"><div class="h-[1.5px] w-full overflow-hidden rounded-full bg-current/10"><div class="h-full rounded-full bg-current/35" style="width:${pct}%"></div></div><span class="font-mono text-[11px] tracking-wide">第 ${pageNum} 页 · 共 ${totalPages} 页</span></div>`;
          } else {
            footer.innerHTML = `<span class="truncate pr-3 opacity-80">${escapeHtml(
              doc.title
            )}</span><span class="shrink-0 font-mono">${String(pageNum).padStart(2, "0")} / ${String(
              totalPages
            ).padStart(2, "0")}</span>`;
          }
          sheet.appendChild(footer);
        }

        pageEl.appendChild(sheet);
      }

      pageElements.push(pageEl);
    }

    const startIdx = Math.max(0, Math.min(totalPages - 1, currentPageRef.current - 1));

    const pf = new PageFlip(bookEl, {
      width: pageDims.width,
      height: pageDims.height,
      size: "fixed",
      autoSize: false,
      usePortrait: !pageDims.isSpread,
      showCover: pageDims.isSpread,
      startPage: startIdx,
      drawShadow: true,
      maxShadowOpacity: 0.42,
      flippingTime: 560,
      mobileScrollSupport: false,
      swipeDistance: 24,
      clickEventForward: false,
      useMouseEvents: true,
      showPageCorners: true,
    });

    pf.loadFromHTML(pageElements);

    pf.on("flip", (ev) => {
      const idx = typeof ev.data === "number" ? ev.data : Number(ev.data) || 0;
      const nextPage = idx + 1;
      isInternalFlipRef.current = true;
      onPageChange(nextPage);
    });

    flipRef.current = pf;

    if (doc.renderMode === "pdf" && pdfDoc) {
      const renderAround = async (center: number) => {
        const start = Math.max(1, center - 2);
        const end = Math.min(totalPages, center + 3);
        for (let p = start; p <= end; p++) {
          if (renderedPages.has(p)) continue;
          const canvas = canvasMap.get(p);
          if (!canvas) continue;
          renderedPages.add(p);
          try {
            await renderPdfPageToCanvas({
              pdf: pdfDoc,
              pageNumber: p,
              canvas,
              targetWidth: pageDims.width,
            });
          } catch {
            renderedPages.delete(p);
          }
        }
      };
      void renderAround(startIdx + 1);
    }

    return () => {
      try {
        pf.destroy();
      } catch {
        // ignore cleanup race
      }
      flipRef.current = null;
      host.innerHTML = "";
      canvasMap.clear();
      renderedPages.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    doc.id,
    doc.renderMode,
    totalPages,
    pageDims.width,
    pageDims.height,
    pageDims.isSpread,
    theme,
    fontSize,
    fontFamily,
    isEbookFullBleed,
    pdfDoc,
    htmlPages,
  ]);

  // Sync external page jumps + render nearby PDF pages
  useEffect(() => {
    const pf = flipRef.current;
    if (pf) {
      if (isInternalFlipRef.current) {
        isInternalFlipRef.current = false;
      } else {
        const targetIdx = Math.max(0, Math.min(totalPages - 1, currentPage - 1));
        const activeIdx = pf.getCurrentPageIndex();
        if (Math.abs(activeIdx - targetIdx) > 0) {
          try {
            if (Math.abs(activeIdx - targetIdx) <= 2) {
              pf.flip(targetIdx);
            } else {
              pf.turnToPage(targetIdx);
            }
          } catch {
            // ignore flip busy state
          }
        }
      }
    }

    if (doc.renderMode === "pdf" && pdfDoc) {
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, currentPage + 3);
      for (let p = start; p <= end; p++) {
        if (renderedPdfPagesRef.current.has(p)) continue;
        const canvas = pdfCanvasMapRef.current.get(p);
        if (!canvas) continue;
        renderedPdfPagesRef.current.add(p);
        renderPdfPageToCanvas({
          pdf: pdfDoc,
          pageNumber: p,
          canvas,
          targetWidth: pageDims.width,
        }).catch(() => {
          renderedPdfPagesRef.current.delete(p);
        });
      }
    }
  }, [currentPage, doc.renderMode, pdfDoc, totalPages, pageDims.width]);

  const handlePrev = () => {
    try {
      flipRef.current?.flipPrev();
    } catch {
      if (currentPage > 1) onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    try {
      flipRef.current?.flipNext();
    } catch {
      if (currentPage < totalPages) onPageChange(currentPage + 1);
    }
  };

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={stageRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
      onPointerDown={(e) => {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = pointerDownPos.current;
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx < 6 && dy < 6 && stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          if (relX > 0.3 && relX < 0.7) {
            onCenterTap();
          }
        }
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handlePrev();
        }}
        disabled={currentPage <= 1}
        aria-label="上一页"
        className="absolute left-3 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-25 md:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        ref={hostRef}
        className={`flex items-center justify-center ${
          isEbookFullBleed ? "" : "drop-shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
        }`}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleNext();
        }}
        disabled={currentPage >= totalPages}
        aria-label="下一页"
        className="absolute right-3 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-25 md:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
