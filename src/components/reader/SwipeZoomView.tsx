"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EbookFontFamily } from "@/lib/ebook-paginator";
import { renderPdfPageToCanvas } from "@/lib/pdf-client";
import type { FlipDocumentContent, HtmlPageItem, PageTheme } from "@/types/document";
import { HtmlPageFrame } from "./HtmlPageFrame";

interface SwipeZoomViewProps {
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

function PdfSinglePageCanvas({
  pdf,
  pageNumber,
  targetWidth,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || targetWidth <= 0) return;
    renderPdfPageToCanvas({
      pdf,
      pageNumber,
      canvas,
      targetWidth,
      maxDpr: 2.5,
    }).catch(() => {});
  }, [pdf, pageNumber, targetWidth]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}

export function SwipeZoomView({
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
}: SwipeZoomViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const { doc, imagePages } = content;
  const htmlPages = htmlPagesOverride || content.htmlPages;

  const totalPages =
    doc.renderMode === "pdf"
      ? pdfDoc?.numPages || doc.pageCount
      : doc.renderMode === "images"
        ? imagePages.length
        : htmlPages.length;

  const aspectRatio = Math.max(0.45, Math.min(2.2, doc.pageWidth / Math.max(1, doc.pageHeight)));
  const isEbookFlow = isMobileFullBleed && doc.renderMode === "html-pages";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBoxSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset zoom cleanly when switching pages
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setDragOffsetX(0);
  }, [currentPage]);

  const computePageRect = () => {
    if (isEbookFlow && boxSize.width > 0 && boxSize.height > 0) {
      // Apple Books: 100% edge-to-edge full-screen paper on phone!
      return { width: Math.floor(boxSize.width), height: Math.floor(boxSize.height) };
    }

    const padX = boxSize.width >= 768 ? 108 : 16;
    const padY = boxSize.width >= 768 ? 34 : 18;
    const availW = Math.max(240, boxSize.width - padX);
    const availH = Math.max(280, boxSize.height - padY);
    let w = availW;
    let h = w / aspectRatio;
    if (h > availH) {
      h = availH;
      w = h * aspectRatio;
    }
    return { width: Math.floor(w), height: Math.floor(h) };
  };

  const pageRect = computePageRect();

  const clampPan = useCallback(
    (nx: number, ny: number, nextScale: number) => {
      if (nextScale <= 1.01) return { x: 0, y: 0 };
      const maxX = Math.max(0, (pageRect.width * (nextScale - 1)) / 2 + 40);
      const maxY = Math.max(0, (pageRect.height * (nextScale - 1)) / 2 + 40);
      return {
        x: Math.max(-maxX, Math.min(maxX, nx)),
        y: Math.max(-maxY, Math.min(maxY, ny)),
      };
    },
    [pageRect.width, pageRect.height]
  );

  // Touch gesture state (swipe vs pinch-to-zoom vs zoomed-pan vs 3-zone Apple Books tap)
  const gestureRef = useRef<{
    mode: "none" | "swipe" | "pan" | "pinch";
    startX: number;
    startY: number;
    startTime: number;
    startPanX: number;
    startPanY: number;
    startScale: number;
    startPinchDist: number;
    lastTapTime: number;
    moved: boolean;
  }>({
    mode: "none",
    startX: 0,
    startY: 0,
    startTime: 0,
    startPanX: 0,
    startPanY: 0,
    startScale: 1,
    startPinchDist: 0,
    lastTapTime: 0,
    moved: false,
  });

  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTapZones = (clientX: number) => {
    const el = containerRef.current;
    if (!el) {
      onCenterTap();
      return;
    }
    const rect = el.getBoundingClientRect();
    const relX = (clientX - rect.left) / Math.max(1, rect.width);

    // Apple Books signature 3-zone tap: left 24% prev, right 24% next, center toggles chrome
    if (isEbookFlow) {
      if (relX < 0.24 && currentPage > 1) {
        onPageChange(currentPage - 1);
        return;
      }
      if (relX > 0.76 && currentPage < totalPages) {
        onPageChange(currentPage + 1);
        return;
      }
    }
    onCenterTap();
  };

  const lastTouchTimeRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    const g = gestureRef.current;
    if (e.touches.length === 2 && !isEbookFlow) {
      g.mode = "pinch";
      g.startPinchDist = getTouchDist(e.touches[0], e.touches[1]);
      g.startScale = scale;
      g.moved = true;
      setIsDragging(true);
      setDragOffsetX(0);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.startTime = Date.now();
      g.startPanX = pan.x;
      g.startPanY = pan.y;
      g.moved = false;
      g.mode = !isEbookFlow && scale > 1.05 ? "pan" : "swipe";
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (e.touches.length === 2 && g.mode === "pinch" && g.startPinchDist > 0) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const nextScale = Math.max(1, Math.min(3.5, g.startScale * (dist / g.startPinchDist)));
      setScale(nextScale);
      setPan((prev) => clampPan(prev.x, prev.y, nextScale));
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    if (Math.hypot(dx, dy) > 8) g.moved = true;

    if (g.mode === "pan" && scale > 1.05) {
      setPan(clampPan(g.startPanX + dx, g.startPanY + dy, scale));
      return;
    }

    if (g.mode === "swipe" && Math.abs(dx) > Math.abs(dy) * 0.75) {
      const atEdge =
        (currentPage <= 1 && dx > 0) || (currentPage >= totalPages && dx < 0);
      setDragOffsetX(atEdge ? dx * 0.25 : dx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    const g = gestureRef.current;
    setIsDragging(false);

    if (g.mode === "pinch") {
      if (scale < 1.08) {
        setScale(1);
        setPan({ x: 0, y: 0 });
      }
      g.mode = "none";
      return;
    }

    if (!g.moved) {
      const tapX = e.changedTouches[0]?.clientX ?? g.startX;
      if (isEbookFlow) {
        // Zero-latency Apple Books tap (no 290ms double-tap delay!)
        handleTapZones(tapX);
      } else {
        const now = Date.now();
        if (now - g.lastTapTime < 280) {
          g.lastTapTime = 0;
          if (scale > 1.2) {
            setScale(1);
            setPan({ x: 0, y: 0 });
          } else {
            setScale(2.2);
            setPan({ x: 0, y: 0 });
          }
        } else {
          g.lastTapTime = now;
          setTimeout(() => {
            if (gestureRef.current.lastTapTime === now) {
              onCenterTap();
            }
          }, 290);
        }
      }
      setDragOffsetX(0);
      g.mode = "none";
      return;
    }

    if (g.mode === "swipe") {
      const elapsed = Math.max(1, Date.now() - g.startTime);
      const velocity = Math.abs(dragOffsetX) / elapsed;
      const threshold = Math.min(100, boxSize.width * 0.18);

      if (
        (dragOffsetX < -threshold || (dragOffsetX < -28 && velocity > 0.4)) &&
        currentPage < totalPages
      ) {
        onPageChange(currentPage + 1);
      } else if (
        (dragOffsetX > threshold || (dragOffsetX > 28 && velocity > 0.4)) &&
        currentPage > 1
      ) {
        onPageChange(currentPage - 1);
      }
      setDragOffsetX(0);
    }

    g.mode = "none";
  };

  // Desktop mouse drag-to-swipe or drag-to-pan
  const mouseRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || Date.now() - lastTouchTimeRef.current < 700) return;
    mouseRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const m = mouseRef.current;
    if (!m.active) return;
    const dx = e.clientX - m.startX;
    const dy = e.clientY - m.startY;
    if (Math.hypot(dx, dy) > 6) m.moved = true;

    if (!isEbookFlow && scale > 1.05) {
      setPan(clampPan(m.startPanX + dx, m.startPanY + dy, scale));
    } else {
      const atEdge =
        (currentPage <= 1 && dx > 0) || (currentPage >= totalPages && dx < 0);
      setDragOffsetX(atEdge ? dx * 0.25 : dx);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const m = mouseRef.current;
    if (!m.active) return;
    m.active = false;
    setIsDragging(false);

    if (!m.moved) {
      handleTapZones(e.clientX);
      setDragOffsetX(0);
      return;
    }

    if (scale <= 1.05 || isEbookFlow) {
      if (dragOffsetX < -72 && currentPage < totalPages) {
        onPageChange(currentPage + 1);
      } else if (dragOffsetX > 72 && currentPage > 1) {
        onPageChange(currentPage - 1);
      }
      setDragOffsetX(0);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isEbookFlow || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const next = Math.max(1, Math.min(3.5, Number((scale + delta).toFixed(2))));
    setScale(next);
    setPan((prev) => clampPan(prev.x, prev.y, next));
  };

  const renderPageSlot = (pageNum: number) => {
    if (pageNum < 1 || pageNum > totalPages) return null;

    if (doc.renderMode === "pdf" && pdfDoc) {
      return (
        <div className="h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl">
          <PdfSinglePageCanvas
            pdf={pdfDoc}
            pageNumber={pageNum}
            targetWidth={Math.round(
              pageRect.width * (pageNum === currentPage ? Math.min(2, scale) : 1)
            )}
          />
        </div>
      );
    }

    if (doc.renderMode === "images") {
      const img = imagePages[pageNum - 1];
      if (!img) return null;
      return (
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[#181715] shadow-2xl">
          <img
            src={img.url}
            alt={img.caption || `第 ${pageNum} 页`}
            draggable={false}
            className="h-full w-full object-contain select-none"
          />
        </div>
      );
    }

    const htmlItem = htmlPages[pageNum - 1];
    if (!htmlItem) return null;
    return (
      <div
        className={`h-full w-full overflow-hidden ${
          isEbookFlow ? "fd-ebook-slide-shadow" : "rounded-xl shadow-2xl"
        }`}
      >
        <HtmlPageFrame
          page={htmlItem}
          totalPages={totalPages}
          docTitle={doc.title}
          theme={theme}
          fontSize={fontSize}
          fontFamily={fontFamily}
          isMobileFullBleed={isEbookFlow}
        />
      </div>
    );
  };

  const slideStride = isEbookFlow ? pageRect.width : pageRect.width + 24;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
      style={{ touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={() => {
        if (isEbookFlow) return;
        if (scale > 1.2) {
          setScale(1);
          setPan({ x: 0, y: 0 });
        } else {
          setScale(2);
          setPan({ x: 0, y: 0 });
        }
      }}
      onWheel={handleWheel}
    >
      {/* Desktop navigation arrows */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (currentPage > 1) onPageChange(currentPage - 1);
        }}
        disabled={currentPage <= 1}
        aria-label="上一页"
        className="absolute left-3 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-25 md:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Slide track showing prev / current / next cleanly */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: pageRect.width,
          height: pageRect.height,
        }}
      >
        {[currentPage - 1, currentPage, currentPage + 1].map((p) => {
          if (p < 1 || p > totalPages) return null;
          const offsetPages = p - currentPage;
          const isCurrent = p === currentPage;

          // Apple Books Layered Slide physics on mobile e-books:
          // Next page sits calmly underneath as current page slides off to the left!
          let tx = 0;
          let zIndex = 1;
          let opacity = 1;
          let s = 1;

          if (isEbookFlow) {
            if (offsetPages === 1) {
              // Next page waits underneath; reveals cleanly when dragging left
              tx = dragOffsetX < 0 ? Math.min(0, dragOffsetX * 0.14) : slideStride;
              zIndex = 1;
              opacity = dragOffsetX < -2 ? 1 : 0;
            } else if (offsetPages === 0) {
              tx = dragOffsetX < 0 ? dragOffsetX : 0;
              zIndex = 2;
              opacity = 1;
            } else {
              // Previous page slides in from left edge on top when dragging right
              tx = dragOffsetX > 0 ? -slideStride + dragOffsetX : -slideStride;
              zIndex = 3;
              opacity = dragOffsetX > 2 ? 1 : 0;
            }
          } else {
            tx = isCurrent
              ? scale > 1.05
                ? pan.x
                : dragOffsetX
              : offsetPages * slideStride + dragOffsetX;
            s = isCurrent ? scale : 0.96;
            opacity = isCurrent ? 1 : Math.abs(dragOffsetX) > 4 ? 0.92 : 0;
            zIndex = isCurrent ? 2 : 1;
          }

          const ty = isCurrent && !isEbookFlow ? pan.y : 0;

          return (
            <div
              key={p}
              className="absolute inset-0 will-change-transform"
              style={{
                zIndex,
                transform: `translate3d(${tx}px, ${ty}px, 0) scale(${s})`,
                transition: isDragging
                  ? "none"
                  : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                opacity,
                pointerEvents: isCurrent ? "auto" : "none",
              }}
            >
              {renderPageSlot(p)}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (currentPage < totalPages) onPageChange(currentPage + 1);
        }}
        disabled={currentPage >= totalPages}
        aria-label="下一页"
        className="absolute right-3 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-25 md:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Floating zoom pill ONLY for fixed-layout visual docs (PDF / PPT / Images), hidden for Apple Books reflow mode */}
      {!isEbookFlow && (
        <div
          className="absolute right-3 bottom-3 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const next = Math.max(1, Number((scale - 0.35).toFixed(2)));
              setScale(next);
              setPan((prev) => clampPan(prev.x, prev.y, next));
            }}
            className="rounded-full p-1 transition hover:bg-white/15"
            aria-label="缩小"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[40px] text-center font-mono text-[11px]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(3.5, Number((scale + 0.35).toFixed(2)));
              setScale(next);
              setPan((prev) => clampPan(prev.x, prev.y, next));
            }}
            className="rounded-full p-1 transition hover:bg-white/15"
            aria-label="放大"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {scale > 1.05 && (
            <button
              type="button"
              onClick={() => {
                setScale(1);
                setPan({ x: 0, y: 0 });
              }}
              className="rounded-full p-1 text-[#F2A07B] transition hover:bg-white/15"
              aria-label="重置缩放"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
