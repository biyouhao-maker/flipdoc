"use client";

import type { EbookFontFamily } from "@/lib/ebook-paginator";
import type { HtmlPageItem, PageTheme } from "@/types/document";

interface HtmlPageFrameProps {
  page: HtmlPageItem;
  totalPages: number;
  docTitle: string;
  theme: PageTheme;
  fontSize?: number;
  fontFamily?: EbookFontFamily;
  isMobileFullBleed?: boolean;
  compact?: boolean;
}

export function HtmlPageFrame({
  page,
  totalPages,
  docTitle,
  theme,
  fontSize = 15,
  fontFamily = "serif",
  isMobileFullBleed = false,
  compact = false,
}: HtmlPageFrameProps) {
  const isSpecial = Boolean(page.isCover || page.slideStyle === "slide");
  const progressPct = Math.max(0, Math.min(100, (page.index / Math.max(1, totalPages)) * 100));

  return (
    <div
      className={`fd-page-sheet ${isMobileFullBleed ? "is-ebook-mobile" : ""}`}
      data-theme={theme}
      data-font={fontFamily}
      style={compact ? { fontSize: "10px" } : undefined}
    >
      {!isSpecial && (
        <div className="fd-page-header">
          <span className="truncate pr-3">
            {isMobileFullBleed ? page.sectionTitle || docTitle : page.sectionTitle || docTitle}
          </span>
          {!isMobileFullBleed && <span className="shrink-0 opacity-75">FLIPDOC</span>}
        </div>
      )}

      <div
        className={`fd-page-body fd-prose ${
          page.isCover ? "is-cover-body" : ""
        } ${page.slideStyle === "slide" ? "is-slide-body" : ""}`}
        style={!isSpecial && !compact ? { fontSize: `${fontSize}px` } : undefined}
        dangerouslySetInnerHTML={{ __html: page.html }}
      />

      {!isSpecial && (
        <div className="fd-page-footer">
          {isMobileFullBleed ? (
            <div className="flex w-full flex-col items-center gap-1.5">
              <div className="h-[1.5px] w-full overflow-hidden rounded-full bg-current/10">
                <div
                  className="h-full rounded-full bg-current/35 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="font-mono text-[11px] tracking-wide">
                第 {page.index} 页 · 共 {totalPages} 页
              </span>
            </div>
          ) : (
            <>
              <span className="truncate pr-3 opacity-80">{docTitle}</span>
              <span className="shrink-0 font-mono">
                {String(page.index).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
