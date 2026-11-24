"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Sparkles,
  Upload,
} from "lucide-react";
import type { DocxConversionMode } from "@/lib/converters/types";
import type { FlipDocumentPublic, PageTheme } from "@/types/document";

interface DropZoneProps {
  libreOfficeAvailable: boolean;
  disabled?: boolean;
  onCreated: (doc: FlipDocumentPublic) => void;
}

const THEME_CHIPS: Array<{ id: PageTheme; label: string; swatch: string }> = [
  { id: "warm-paper", label: "暖纸书香", swatch: "#F7F1E3" },
  { id: "editorial", label: "杂志纯白", swatch: "#FFFFFF" },
  { id: "minimal", label: "极简灰", swatch: "#EEF1F5" },
  { id: "dark-ink", label: "夜读墨", swatch: "#23252A" },
];

export function DropZone({ libreOfficeAvailable, disabled, onCreated }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [docxMode, setDocxMode] = useState<DocxConversionMode>("auto");
  const [theme, setTheme] = useState<PageTheme>("warm-paper");

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (files.length === 0 || uploading || disabled) return;

    setUploading(true);
    setError("");
    setStatusText(
      files.length > 1
        ? `正在合成 ${files.length} 张图片为翻页画册…`
        : `正在解析《${files[0].name}》并生成翻页画册…`
    );

    try {
      const fd = new FormData();
      for (const file of files) {
        fd.append("files", file);
      }
      fd.append("docxMode", docxMode);
      fd.append("theme", theme);
      fd.append("defaultViewMode", "auto");

      const res = await fetch("/api/docs", {
        method: "POST",
        body: fd,
      });

      const data = (await res.json().catch(() => ({}))) as {
        doc?: FlipDocumentPublic;
        error?: string;
      };

      if (!res.ok || !data.doc) {
        setError(data.error || "导入转换失败，请检查文件格式");
        return;
      }

      onCreated(data.doc);
    } catch {
      setError("上传请求失败，请检查本地服务是否正常运行");
    } finally {
      setUploading(false);
      setStatusText("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="relative">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            void uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => {
          if (!disabled && !uploading) inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`group relative cursor-pointer overflow-hidden rounded-[28px] border-2 border-dashed transition-all duration-250 ${
          dragging
            ? "scale-[1.005] border-[#C85A32] bg-[#FFF8F4] shadow-xl shadow-[#C85A32]/10"
            : "border-[#DDD5C7] bg-white hover:border-[#C85A32]/65 hover:shadow-lg hover:shadow-[#1A1816]/5"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.gif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void uploadFiles(e.target.files);
            }
          }}
        />

        {/* Subtle warm editorial corner wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#C85A32]/[0.06] blur-2xl transition group-hover:bg-[#C85A32]/[0.10]"
        />

        <div className="relative flex flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-300 ${
              dragging
                ? "scale-110 bg-[#C85A32] text-white"
                : "bg-[#F5EFE4] text-[#C85A32] group-hover:-translate-y-1 group-hover:bg-[#C85A32] group-hover:text-white"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <Upload className="h-7 w-7" />
            )}
          </div>

          <h2 className="mt-5 text-xl font-bold tracking-tight text-[#1A1816] sm:text-2xl">
            {uploading ? statusText : "拖入文件，一键生成微信翻页画册"}
          </h2>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6C655B]">
            {uploading
              ? "正在自动提取目录、生成封面并装订页面，通常只需几秒钟…"
              : "支持单文件导入或一次选择多张图片合成图集；自动适配桌面 3D 翻书与微信手机丝滑滑动"}
          </p>

          {/* Supported format pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#4A453E]">
              <FileText className="h-3.5 w-3.5 text-[#C85A32]" />
              PDF
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#4A453E]">
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#28537A]" />
              Word (.docx)
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#4A453E]">
              <Presentation className="h-3.5 w-3.5 text-[#D16B3E]" />
              PPT (.pptx)
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#4A453E]">
              <Sparkles className="h-3.5 w-3.5 text-[#2D5A47]" />
              Markdown / TXT
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#4A453E]">
              <FileImage className="h-3.5 w-3.5 text-[#A4793B]" />
              多图画册
            </span>
          </div>

          {!uploading && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1816] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-[#C85A32]">
              选择文件导入
            </div>
          )}
        </div>
      </div>

      {/* Subtle inline conversion preferences bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAE3D6] bg-white/80 px-4 py-2.5 text-xs text-[#6C655B]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[#4A453E]">Word 转换：</span>
          <button
            type="button"
            onClick={() => setDocxMode("auto")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              docxMode === "auto"
                ? "bg-[#1A1816] text-white"
                : "bg-[#F2EEE6] text-[#5C564D] hover:bg-[#E7E0D3]"
            }`}
          >
            {libreOfficeAvailable ? "自动高保真 (LibreOffice)" : "自动精排"}
          </button>
          <button
            type="button"
            onClick={() => setDocxMode("reflow")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              docxMode === "reflow"
                ? "bg-[#2D5A47] text-white"
                : "bg-[#F2EEE6] text-[#5C564D] hover:bg-[#E7E0D3]"
            }`}
          >
            手机精排重排
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[#4A453E]">精排纸张：</span>
          {THEME_CHIPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                theme === t.id
                  ? "bg-[#C85A32]/14 font-semibold text-[#A94522] ring-1 ring-[#C85A32]/40"
                  : "hover:bg-[#F2EEE6]"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-black/20"
                style={{ backgroundColor: t.swatch }}
              />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
