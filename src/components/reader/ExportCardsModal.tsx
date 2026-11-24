"use client";

import { useState } from "react";
import { CheckCircle2, Download, ImageDown, Loader2, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPdfPageToPngBlob } from "@/lib/pdf-client";
import type { FlipDocumentContent, PageTheme } from "@/types/document";

interface ExportCardsModalProps {
  open: boolean;
  content: FlipDocumentContent;
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number;
  theme: PageTheme;
  onClose: () => void;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];
  for (const para of text.split(/\n+/)) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    let line = "";
    for (const ch of trimmed) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        result.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) result.push(line);
    result.push("");
  }
  return result;
}

async function renderHtmlPageToPngBlob(params: {
  html: string;
  title: string;
  sectionTitle?: string;
  pageNumber: number;
  totalPages: number;
  theme: PageTheme;
}): Promise<Blob | null> {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const isDark = params.theme === "dark-ink";
  const bg =
    params.theme === "dark-ink"
      ? "#1C1D20"
      : params.theme === "editorial"
        ? "#FFFFFF"
        : params.theme === "minimal"
          ? "#F9FAFB"
          : "#FBF8F1";
  const ink = isDark ? "#EAE6DD" : "#1E1B18";
  const muted = isDark ? "#9E978B" : "#6E675D";
  const accent = isDark ? "#E08256" : "#C85A32";
  const border = isDark ? "#313339" : "#E6DFD1";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = muted;
  ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText((params.sectionTitle || params.title).slice(0, 28), 76, 86);
  ctx.textAlign = "right";
  ctx.fillStyle = accent;
  ctx.fillText("FLIPDOC 轻翻", W - 76, 86);
  ctx.textAlign = "left";

  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 112);
  ctx.lineTo(W - 76, 112);
  ctx.stroke();

  // Extract readable structured text from HTML page
  const plainText = params.html
    .replace(/<\/(h[1-6]|p|li|tr|blockquote|pre|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  ctx.fillStyle = ink;
  ctx.font = '400 30px "PingFang SC", "Microsoft YaHei", sans-serif';
  const lines = wrapLines(ctx, plainText, W - 152);

  let y = 178;
  for (const line of lines) {
    if (y > H - 140) break;
    if (!line) {
      y += 22;
      continue;
    }
    ctx.fillText(line, 76, y);
    y += 48;
  }

  // Footer
  ctx.strokeStyle = border;
  ctx.beginPath();
  ctx.moveTo(76, H - 104);
  ctx.lineTo(W - 76, H - 104);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '500 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(params.title.slice(0, 26), 76, H - 56);
  ctx.textAlign = "right";
  ctx.fillText(
    `${String(params.pageNumber).padStart(2, "0")} / ${String(params.totalPages).padStart(2, "0")}`,
    W - 76,
    H - 56
  );

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.92));
}

function triggerBlobDownload(blob: Blob, filename: string) {
  if (typeof window !== "undefined" && window.FlipDocAndroid) {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        window.FlipDocAndroid?.saveImageBase64(reader.result, filename);
      }
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportCardsModal({
  open,
  content,
  pdfDoc,
  currentPage,
  theme,
  onClose,
}: ExportCardsModalProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  if (!open) return null;

  const { doc, htmlPages, imagePages } = content;
  const totalPages =
    doc.renderMode === "pdf"
      ? pdfDoc?.numPages || doc.pageCount
      : doc.renderMode === "images"
        ? imagePages.length
        : htmlPages.length;

  const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, "_");

  const exportSinglePage = async (pageNum: number): Promise<Blob | null> => {
    if (doc.renderMode === "pdf" && pdfDoc) {
      return renderPdfPageToPngBlob(pdfDoc, pageNum, 1240);
    }
    if (doc.renderMode === "images") {
      const img = imagePages[pageNum - 1];
      if (!img) return null;
      const res = await fetch(img.url);
      return res.blob();
    }
    const page = htmlPages[pageNum - 1];
    if (!page) return null;
    return renderHtmlPageToPngBlob({
      html: page.html,
      title: doc.title,
      sectionTitle: page.sectionTitle,
      pageNumber: pageNum,
      totalPages,
      theme,
    });
  };

  const handleExportCurrent = async () => {
    setExporting(true);
    setDoneMsg("");
    setProgress(`正在导出第 ${currentPage} 页…`);
    try {
      const blob = await exportSinglePage(currentPage);
      if (blob) {
        triggerBlobDownload(
          blob,
          `${safeTitle}-P${String(currentPage).padStart(2, "0")}.png`
        );
        setDoneMsg(`第 ${currentPage} 页高清卡片图已保存，可直接发微信！`);
      }
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    setDoneMsg("");
    const limit = Math.min(totalPages, 12);
    try {
      for (let p = 1; p <= limit; p++) {
        setProgress(`正在逐页导出 (${p} / ${limit})…`);
        const blob = await exportSinglePage(p);
        if (blob) {
          triggerBlobDownload(blob, `${safeTitle}-P${String(p).padStart(2, "0")}.png`);
          await new Promise((r) => setTimeout(r, 220));
        }
      }
      setDoneMsg(
        totalPages > limit
          ? `已导出前 ${limit} 页卡片图（为避免浏览器拦截，单次批量上限 ${limit} 页）。`
          : `全部 ${limit} 页高清卡片图已导出完成！`
      );
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <ImageDown className="h-4 w-4 text-[#C85A32]" />
            <h3 className="text-sm font-bold text-[#1A1816]">导出分页卡片图（微信离线兜底）</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#6C655B] hover:bg-[#F2EEE6]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs leading-relaxed text-[#6C655B]">
            如果当前还未部署公网服务器，可以把页面导出为高清 PNG 卡片图，直接多选发进微信聊天，对方左右划图就能看。
          </p>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportCurrent}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1A1816] py-3 text-sm font-semibold text-white transition hover:bg-[#322F2B] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            导出当前页（第 {currentPage} 页）为 PNG
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportAll}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#DFD8CA] bg-white py-3 text-sm font-medium text-[#1A1816] transition hover:bg-[#F2EEE6] disabled:opacity-50"
          >
            批量导出全册图片（共 {Math.min(totalPages, 12)} 页）
          </button>

          {progress && (
            <p className="text-center text-xs font-medium text-[#C85A32]">{progress}</p>
          )}
          {doneMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{doneMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
