"use client";

import { useEffect, useRef } from "react";
import { LayoutGrid, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPdfPageToCanvas } from "@/lib/pdf-client";
import type { FlipDocumentContent } from "@/types/document";

interface ThumbnailDrawerProps {
  open: boolean;
  content: FlipDocumentContent;
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

function PdfThumbCanvas({
  pdf,
  pageNumber,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || cancelled) return;
        observer.disconnect();
        renderPdfPageToCanvas({
          pdf,
          pageNumber,
          canvas,
          targetWidth: 200,
          maxDpr: 1.5,
        }).catch(() => {});
      },
      { rootMargin: "160px" }
    );
    observer.observe(canvas);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdf, pageNumber]);

  return <canvas ref={canvasRef} className="h-full w-full object-contain" />;
}

export function ThumbnailDrawer({
  open,
  content,
  pdfDoc,
  currentPage,
  onSelectPage,
  onClose,
}: ThumbnailDrawerProps) {
  if (!open) return null;

  const { doc, htmlPages, imagePages } = content;
  const totalPages =
    doc.renderMode === "pdf"
      ? pdfDoc?.numPages || doc.pageCount
      : doc.renderMode === "images"
        ? imagePages.length
        : htmlPages.length;

  const isLandscape = doc.pageWidth > doc.pageHeight;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="safe-bottom relative z-10 flex max-h-[72vh] w-full max-w-4xl flex-col rounded-t-3xl border-t border-white/10 bg-[#1B1A18]/98 text-[#F5F2EB] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-[#E07A52]" />
            <h3 className="text-sm font-semibold">全部页面缩略图</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/65">
              共 {totalPages} 页
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭缩略图"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: totalPages }, (_, idx) => {
            const pageNum = idx + 1;
            const active = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => {
                  onSelectPage(pageNum);
                  onClose();
                }}
                className={`group flex flex-col items-center rounded-xl p-1.5 transition ${
                  active
                    ? "bg-[#C85A32]/25 ring-2 ring-[#E07A52]"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                <div
                  className="relative w-full overflow-hidden rounded-lg bg-[#FAF7F1] shadow-sm"
                  style={{ aspectRatio: isLandscape ? "16 / 9" : "3 / 4.2" }}
                >
                  {doc.renderMode === "pdf" && pdfDoc && (
                    <PdfThumbCanvas pdf={pdfDoc} pageNumber={pageNum} />
                  )}

                  {doc.renderMode === "images" && imagePages[idx] && (
                    <img
                      src={imagePages[idx].url}
                      alt={`第 ${pageNum} 页`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}

                  {doc.renderMode === "html-pages" && htmlPages[idx] && (
                    <div className="flex h-full w-full flex-col justify-between p-2 text-left text-[#221F1C]">
                      <div className="line-clamp-1 text-[8px] font-bold text-[#C85A32]">
                        {htmlPages[idx].isCover
                          ? "COVER"
                          : htmlPages[idx].sectionTitle || doc.title}
                      </div>
                      <div
                        className="line-clamp-5 text-[7px] leading-tight text-[#59534A]"
                        dangerouslySetInnerHTML={{
                          __html: htmlPages[idx].html
                            .replace(/<img[^>]*>/gi, "[图片]")
                            .replace(/<[^>]+>/g, " ")
                            .slice(0, 140),
                        }}
                      />
                      <div className="text-right font-mono text-[7px] text-[#9A9185]">
                        {pageNum}
                      </div>
                    </div>
                  )}
                </div>

                <span
                  className={`mt-1.5 font-mono text-[11px] ${
                    active ? "font-bold text-[#F5A888]" : "text-white/65"
                  }`}
                >
                  {pageNum}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
