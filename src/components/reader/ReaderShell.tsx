"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ImageDown,
  LayoutGrid,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  Share2,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ShareModal } from "@/components/studio/ShareModal";
import {
  type EbookFontFamily,
  repaginateEbookToViewport,
} from "@/lib/ebook-paginator";
import {
  extractPdfOutlineToc,
  loadPdfDocument,
  renderPdfPageToPngBlob,
} from "@/lib/pdf-client";
import type {
  FlipDocumentContent,
  FlipDocumentPublic,
  HtmlPageItem,
  PageTheme,
  SystemInfo,
  TocItem,
} from "@/types/document";
import { AppearanceSheet } from "./AppearanceSheet";
import { ExportCardsModal } from "./ExportCardsModal";
import { FlipbookView } from "./FlipbookView";
import { PasscodeGate } from "./PasscodeGate";
import { SwipeZoomView } from "./SwipeZoomView";
import { ThumbnailDrawer } from "./ThumbnailDrawer";
import { TocDrawer } from "./TocDrawer";

interface ReaderShellProps {
  initialDoc: FlipDocumentPublic;
}

const PAPER_BG_COLORS: Record<PageTheme, string> = {
  "warm-paper": "#FBF8F1",
  editorial: "#FFFFFF",
  minimal: "#F9FAFB",
  "dark-ink": "#1C1D20",
};

export function ReaderShell({ initialDoc }: ReaderShellProps) {
  const [docMeta, setDocMeta] = useState<FlipDocumentPublic>(initialDoc);
  const [content, setContent] = useState<FlipDocumentContent | null>(null);
  const [loading, setLoading] = useState(
    !initialDoc.isExpired && initialDoc.isUnlocked
  );
  const [loadError, setLoadError] = useState("");
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfToc, setPdfToc] = useState<TocItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // Adaptive default: desktop -> 3D flipbook, mobile -> smooth Apple Books swipe
  const [activeMode, setActiveMode] = useState<"flip" | "swipe">(() => {
    if (initialDoc.defaultViewMode === "flip") return "flip";
    if (initialDoc.defaultViewMode === "swipe") return "swipe";
    return "flip";
  });

  const [backdrop, setBackdrop] = useState<"dark" | "warm">("dark");
  const [pageTheme, setPageTheme] = useState<PageTheme>(initialDoc.theme);
  const [fontSize, setFontSize] = useState<number>(17);
  const [fontFamily, setFontFamily] = useState<EbookFontFamily>("serif");

  const [chromeVisible, setChromeVisible] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // Dynamically repaginated HTML pages for exact Apple Books zero-scrollbar viewport fit
  const [repaginated, setRepaginated] = useState<{
    pages: HtmlPageItem[];
    toc: TocItem[];
  } | null>(null);

  const coverUpgradedRef = useRef(false);

  // Observe viewport dimensions for mobile Apple Books mode & dynamic repagination
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    syncViewport();
    if (initialDoc.defaultViewMode === "auto") {
      setActiveMode(window.innerWidth < 768 ? "swipe" : "flip");
    }
    if (window.innerWidth >= 768) {
      setFontSize(15);
    }
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [initialDoc.defaultViewMode]);

  const isMobile = viewport.width > 0 && viewport.width < 768;
  const isReflowEbook = Boolean(
    content &&
      content.doc.renderMode === "html-pages" &&
      !content.htmlPages.some((p) => p.slideStyle === "slide")
  );
  const isMobileAppleBooks = isMobile && isReflowEbook;

  // Dynamic viewport repagination so every e-book page fits the exact phone/desktop height with ZERO scrollbar!
  useEffect(() => {
    if (!content || !isReflowEbook || viewport.width === 0 || viewport.height === 0) {
      setRepaginated(null);
      return;
    }

    let pageW = viewport.width;
    let pageH = viewport.height;

    if (!isMobileAppleBooks) {
      const availW = Math.max(240, viewport.width - 112);
      const availH = Math.max(300, viewport.height - 156);
      const useSpread = activeMode === "flip" && viewport.width >= 900;
      const aspect = Math.max(
        0.55,
        Math.min(1, content.doc.pageWidth / Math.max(1, content.doc.pageHeight))
      );
      const maxSingleW = useSpread ? Math.floor(availW / 2) : availW;
      let w = maxSingleW;
      let h = Math.floor(w / aspect);
      if (h > availH) {
        h = availH;
        w = Math.floor(h * aspect);
      }
      pageW = Math.max(260, Math.min(w, 680));
      pageH = Math.max(360, Math.min(h, 880));
    }

    const result = repaginateEbookToViewport({
      sourcePages: content.htmlPages,
      docTitle: content.doc.title,
      containerWidth: pageW,
      containerHeight: pageH,
      fontSize,
      fontFamily,
      theme: pageTheme,
      isMobileFullBleed: isMobileAppleBooks,
    });

    setRepaginated(result);
    setCurrentPage((prev) => Math.max(1, Math.min(result.pages.length, prev)));
  }, [
    content,
    isReflowEbook,
    isMobileAppleBooks,
    viewport.width,
    viewport.height,
    fontSize,
    fontFamily,
    pageTheme,
    activeMode,
  ]);

  // Fetch system info lazily for LAN WeChat QR share modal
  useEffect(() => {
    fetch("/api/system")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SystemInfo | null) => {
        if (data) setSystemInfo(data);
      })
      .catch(() => {});
  }, []);

  // Optional WeChat JS-SDK share registration inside WeChat browser
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/MicroMessenger/i.test(navigator.userAgent)) return;

    fetch(`/api/wechat/signature?url=${encodeURIComponent(window.location.href)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (sig: {
          configured?: boolean;
          appId?: string;
          timestamp?: number;
          nonceStr?: string;
          signature?: string;
        } | null) => {
          if (!sig?.configured || !sig.appId || !sig.signature) return;
          const script = document.createElement("script");
          script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
          script.onload = () => {
            const wx = (window as unknown as {
              wx?: {
                config: (opts: unknown) => void;
                ready: (cb: () => void) => void;
                updateAppMessageShareData?: (opts: unknown) => void;
                updateTimelineShareData?: (opts: unknown) => void;
              };
            }).wx;
            if (!wx) return;
            wx.config({
              debug: false,
              appId: sig.appId,
              timestamp: sig.timestamp,
              nonceStr: sig.nonceStr,
              signature: sig.signature,
              jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
            });
            wx.ready(() => {
              const sharePayload = {
                title: docMeta.title,
                desc: docMeta.description || `共 ${docMeta.pageCount} 页 · 点击翻页阅读`,
                link: window.location.href,
                imgUrl: docMeta.coverUrl
                  ? new URL(docMeta.coverUrl, window.location.origin).toString()
                  : "",
              };
              wx.updateAppMessageShareData?.(sharePayload);
              wx.updateTimelineShareData?.(sharePayload);
            });
          };
          document.head.appendChild(script);
        }
      )
      .catch(() => {});
  }, [docMeta.title, docMeta.description, docMeta.pageCount, docMeta.coverUrl]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(docMeta.slug)}/content`);
      if (res.status === 403) {
        setDocMeta((prev) => ({ ...prev, isUnlocked: false }));
        return;
      }
      if (res.status === 410) {
        setDocMeta((prev) => ({ ...prev, isExpired: true }));
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error || "加载画册失败");
        return;
      }
      const data = (await res.json()) as FlipDocumentContent;
      setContent(data);
      setDocMeta(data.doc);
      setPageTheme(data.doc.theme);
    } catch {
      setLoadError("网络连接异常，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, [docMeta.slug]);

  useEffect(() => {
    if (!docMeta.isExpired && docMeta.isUnlocked) {
      void fetchContent();
    }
  }, [docMeta.isExpired, docMeta.isUnlocked, fetchContent]);

  // Load PDF document via pdfjs-dist when renderMode === "pdf"
  useEffect(() => {
    if (!content?.pdfUrl) return;
    let active = true;
    let destroyPdf: (() => Promise<void>) | null = null;

    loadPdfDocument(content.pdfUrl)
      .then(async ({ pdf, destroy }) => {
        if (!active) {
          void destroy();
          return;
        }
        destroyPdf = destroy;
        setPdfDoc(pdf);

        const outline = await extractPdfOutlineToc(pdf);
        if (active && outline.length > 0) {
          setPdfToc(outline);
        }

        if (
          active &&
          !coverUpgradedRef.current &&
          content.doc.coverFile === "cover.png"
        ) {
          coverUpgradedRef.current = true;
          try {
            const blob = await renderPdfPageToPngBlob(pdf, 1, 960);
            if (blob) {
              const fd = new FormData();
              fd.append("file", blob, "page1.png");
              fd.append("mode", "auto-pdf");
              const upRes = await fetch(
                `/api/docs/${encodeURIComponent(content.doc.slug)}/cover`,
                { method: "POST", body: fd }
              );
              if (upRes.ok) {
                const updated = (await upRes.json()) as { doc?: FlipDocumentPublic };
                if (updated.doc && active) {
                  setDocMeta(updated.doc);
                }
              }
            }
          } catch {
            // ignore optional cover upgrade failure
          }
        }
      })
      .catch(() => {
        if (active) setLoadError("PDF 渲染引擎加载失败，请检查文件是否完整");
      });

    return () => {
      active = false;
      if (destroyPdf) {
        void destroyPdf();
      }
    };
  }, [content?.pdfUrl, content?.doc.coverFile, content?.doc.slug]);

  const effectiveHtmlPages = useMemo(() => {
    if (!content) return [];
    return repaginated ? repaginated.pages : content.htmlPages;
  }, [content, repaginated]);

  const effectiveContent = useMemo<FlipDocumentContent | null>(() => {
    if (!content) return null;
    if (!repaginated) return content;
    return {
      ...content,
      htmlPages: repaginated.pages,
    };
  }, [content, repaginated]);

  const totalPages = useMemo(() => {
    if (!content) return docMeta.pageCount;
    if (content.doc.renderMode === "pdf") {
      return pdfDoc?.numPages || content.doc.pageCount;
    }
    if (content.doc.renderMode === "images") {
      return Math.max(1, content.imagePages.length);
    }
    return Math.max(1, effectiveHtmlPages.length);
  }, [content, pdfDoc, docMeta.pageCount, effectiveHtmlPages.length]);

  const effectiveToc = useMemo(() => {
    if (repaginated && repaginated.toc.length > 0) return repaginated.toc;
    if (content?.doc.toc && content.doc.toc.length > 0) return content.doc.toc;
    return pdfToc;
  }, [repaginated, content?.doc.toc, pdfToc]);

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(totalPages, p));
      setCurrentPage(clamped);
      // In mobile Apple Books mode, gently auto-hide overlay chrome when turning into reading pages
      if (isMobileAppleBooks && clamped > 1) {
        setChromeVisible(false);
      }
    },
    [totalPages, isMobileAppleBooks]
  );

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shareOpen || exportOpen || appearanceOpen) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === "Home") {
        goToPage(1);
      } else if (e.key === "End") {
        goToPage(totalPages);
      } else if (e.key === "Escape") {
        setTocOpen(false);
        setThumbsOpen(false);
        setAppearanceOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, totalPages, goToPage, shareOpen, exportOpen, appearanceOpen]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // iOS Safari / WeChat doesn't support Fullscreen API
    }
  };

  if (docMeta.isExpired || !docMeta.isUnlocked) {
    return (
      <PasscodeGate
        doc={docMeta}
        onUnlocked={() => {
          setDocMeta((prev) => ({ ...prev, isUnlocked: true }));
        }}
      />
    );
  }

  // Adaptive chrome colors: Apple Books frosted light glass on light papers, frosted dark glass on dark stage/night ink
  const isDarkChrome = isMobileAppleBooks
    ? pageTheme === "dark-ink"
    : backdrop === "dark";

  const stageBgStyle = isMobileAppleBooks
    ? { backgroundColor: PAPER_BG_COLORS[pageTheme] }
    : undefined;

  return (
    <div
      style={stageBgStyle}
      className={`relative flex h-[100dvh] w-full flex-col overflow-hidden transition-colors duration-300 ${
        isMobileAppleBooks
          ? pageTheme === "dark-ink"
            ? "text-[#ECE8DF]"
            : "text-[#1A1816]"
          : backdrop === "dark"
            ? "bg-[#141413] text-[#F5F2EB]"
            : "bg-[#E9E4DA] text-[#1A1816]"
      }`}
    >
      {/* Top Floating Glass Toolbar */}
      <header
        className={`safe-top fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pb-2.5 transition-all duration-250 md:px-5 ${
          chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0"
        } ${
          isMobileAppleBooks
            ? isDarkChrome
              ? "border-b border-white/10 bg-[#1F2024]/86 text-white backdrop-blur-xl"
              : "border-b border-black/[0.06] bg-white/86 text-[#1A1816] backdrop-blur-xl"
            : isDarkChrome
              ? "bg-gradient-to-b from-black/80 via-black/55 to-transparent text-white"
              : "bg-gradient-to-b from-[#FAF7F1]/95 via-[#FAF7F1]/80 to-transparent text-[#1A1816]"
        }`}
      >
        {/* Left: Back + Title */}
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className={`flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium backdrop-blur-md transition sm:px-3 ${
              isDarkChrome
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
            title="返回工作台导入或管理画册"
            aria-label="返回书架"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">书架</span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight md:text-base">
              {docMeta.title}
            </h1>
            <p className="truncate text-[11px] opacity-60">
              {currentPage} / {totalPages} 页
              <span className="hidden sm:inline">
                {" "}
                · {activeMode === "flip" ? "3D 仿真翻书" : "平滑滑动"}
              </span>
            </p>
          </div>
        </div>

        {/* Right: Mode / Aa / Backdrop / Share / Fullscreen */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Desktop dual mode pill */}
          <div
            className={`hidden items-center rounded-full p-0.5 text-xs backdrop-blur-md sm:flex ${
              isDarkChrome ? "bg-white/12" : "bg-black/[0.07]"
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveMode("flip")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 font-medium transition ${
                activeMode === "flip"
                  ? "bg-[#C85A32] text-white shadow-xs"
                  : "opacity-75 hover:opacity-100"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>仿真翻书</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("swipe")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 font-medium transition ${
                activeMode === "swipe"
                  ? "bg-[#C85A32] text-white shadow-xs"
                  : "opacity-75 hover:opacity-100"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>平滑滑动</span>
            </button>
          </div>

          {/* Apple Books iconic "Aa" Appearance trigger */}
          <button
            type="button"
            onClick={() => setAppearanceOpen(true)}
            aria-label="字体与主题外观"
            title="字体、纸张与翻页外观"
            className={`flex h-9 items-center justify-center rounded-full px-3 text-sm font-semibold backdrop-blur-md transition ${
              isDarkChrome
                ? "bg-white/12 text-white hover:bg-white/22"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Aa
          </button>

          {/* Desktop stage backdrop toggle (only for non-full-bleed views) */}
          {!isMobileAppleBooks && (
            <button
              type="button"
              onClick={() => setBackdrop((b) => (b === "dark" ? "warm" : "dark"))}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition ${
                isDarkChrome
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
              }`}
              aria-label="切换阅读背景"
              title={backdrop === "dark" ? "切换暖色书桌背景" : "切换深色画廊背景"}
            >
              {backdrop === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Share / Poster button */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="微信分享"
            className="flex h-9 items-center gap-1.5 rounded-full bg-[#C85A32] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B24B26] sm:px-3.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">微信分享</span>
          </button>

          {/* Fullscreen on desktop */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="全屏阅读"
            className={`hidden h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition md:flex ${
              isDarkChrome
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
            title={isFullscreen ? "退出全屏" : "全屏阅读"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main Reading Stage: 100% edge-to-edge full screen in Mobile Apple Books mode! */}
      <main
        className={`relative flex-1 overflow-hidden ${
          isMobileAppleBooks ? "h-[100dvh] w-full p-0" : "pt-14 pb-16"
        }`}
      >
        {loading || !effectiveContent ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm opacity-75">
            {loadError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-4 text-center text-rose-400">
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => void fetchContent()}
                  className="mt-3 rounded-xl bg-black/15 px-4 py-1.5 text-xs"
                >
                  重新加载
                </button>
              </div>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-[#C85A32]" />
                <span>正在装订页面…</span>
              </>
            )}
          </div>
        ) : effectiveContent.doc.renderMode === "pdf" && !pdfDoc ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm opacity-75">
            <Loader2 className="h-6 w-6 animate-spin text-[#C85A32]" />
            <span>正在渲染高清 PDF 页面…</span>
          </div>
        ) : activeMode === "flip" ? (
          <FlipbookView
            content={effectiveContent}
            htmlPagesOverride={effectiveHtmlPages}
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            theme={pageTheme}
            fontSize={fontSize}
            fontFamily={fontFamily}
            isMobileFullBleed={isMobileAppleBooks}
            onPageChange={goToPage}
            onCenterTap={() => setChromeVisible((v) => !v)}
          />
        ) : (
          <SwipeZoomView
            content={effectiveContent}
            htmlPagesOverride={effectiveHtmlPages}
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            theme={pageTheme}
            fontSize={fontSize}
            fontFamily={fontFamily}
            isMobileFullBleed={isMobileAppleBooks}
            onPageChange={goToPage}
            onCenterTap={() => setChromeVisible((v) => !v)}
          />
        )}
      </main>

      {/* Bottom Floating Apple Books Navigation Bar */}
      <footer
        className={`safe-bottom fixed inset-x-0 bottom-0 z-30 px-3 pt-2.5 transition-all duration-250 md:px-6 ${
          chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        } ${
          isMobileAppleBooks
            ? isDarkChrome
              ? "border-t border-white/10 bg-[#1F2024]/88 text-white backdrop-blur-xl"
              : "border-t border-black/[0.06] bg-white/88 text-[#1A1816] backdrop-blur-xl"
            : isDarkChrome
              ? "bg-gradient-to-t from-black/85 via-black/60 to-transparent text-white"
              : "bg-gradient-to-t from-[#FAF7F1]/95 via-[#FAF7F1]/82 to-transparent text-[#1A1816]"
        }`}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 md:gap-4">
          <button
            type="button"
            onClick={() => setTocOpen(true)}
            aria-label="目录导航"
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium backdrop-blur-md transition ${
              isDarkChrome
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>目录</span>
          </button>

          <button
            type="button"
            onClick={() => setThumbsOpen(true)}
            aria-label="页面缩略图"
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium backdrop-blur-md transition ${
              isDarkChrome
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">缩略图</span>
          </button>

          {/* Interactive Page Scrubber */}
          <div className="flex flex-1 items-center gap-2.5">
            <input
              type="range"
              min={1}
              max={Math.max(1, totalPages)}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              aria-label="页面进度条"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-current/20 accent-[#C85A32]"
            />
            <span className="min-w-[46px] text-right font-mono text-xs opacity-75">
              {currentPage}/{totalPages}
            </span>
          </div>

          {/* Export PNG cards */}
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            aria-label="导出分页卡片图"
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium backdrop-blur-md transition ${
              isDarkChrome
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-black/[0.06] text-[#1A1816] hover:bg-black/12"
            }`}
            title="导出高清卡片图片发微信"
          >
            <ImageDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">导出卡片图</span>
          </button>
        </div>
      </footer>

      {/* Apple Books Appearance Sheet (Aa) */}
      <AppearanceSheet
        open={appearanceOpen}
        theme={pageTheme}
        fontSize={fontSize}
        fontFamily={fontFamily}
        activeMode={activeMode}
        isReflowEbook={isReflowEbook}
        onChangeTheme={setPageTheme}
        onChangeFontSize={setFontSize}
        onChangeFontFamily={setFontFamily}
        onChangeMode={setActiveMode}
        onClose={() => setAppearanceOpen(false)}
      />

      {/* Drawers & Modals */}
      <TocDrawer
        open={tocOpen}
        toc={effectiveToc}
        currentPage={currentPage}
        totalPages={totalPages}
        onSelectPage={goToPage}
        onClose={() => setTocOpen(false)}
      />

      {effectiveContent && (
        <ThumbnailDrawer
          open={thumbsOpen}
          content={effectiveContent}
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          onSelectPage={goToPage}
          onClose={() => setThumbsOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareModal
          doc={docMeta}
          systemInfo={systemInfo}
          onClose={() => setShareOpen(false)}
        />
      )}

      {effectiveContent && (
        <ExportCardsModal
          open={exportOpen}
          content={effectiveContent}
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          theme={pageTheme}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
