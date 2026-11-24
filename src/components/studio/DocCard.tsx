"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Clock,
  Eye,
  Lock,
  Settings2,
  Share2,
  Trash2,
} from "lucide-react";
import type { FlipDocumentPublic, SourceType } from "@/types/document";

interface DocCardProps {
  doc: FlipDocumentPublic;
  onShare: (doc: FlipDocumentPublic) => void;
  onEdit: (doc: FlipDocumentPublic) => void;
  onDelete: (doc: FlipDocumentPublic) => Promise<void>;
}

const TYPE_META: Record<SourceType, { label: string; color: string }> = {
  pdf: { label: "PDF", color: "bg-[#C85A32]/12 text-[#B14822]" },
  docx: { label: "WORD", color: "bg-[#28537A]/12 text-[#234A6D]" },
  pptx: { label: "PPT", color: "bg-[#D97736]/14 text-[#B4591D]" },
  markdown: { label: "MD", color: "bg-[#2D5A47]/12 text-[#244B3B]" },
  images: { label: "图集", color: "bg-[#9A6F2B]/14 text-[#7D571D]" },
};

function formatExpiryLabel(expiresAt: string | null, isExpired: boolean): string | null {
  if (!expiresAt) return null;
  if (isExpired) return "已过期";
  const diffMs = Date.parse(expiresAt) - Date.now();
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hours <= 24) return `剩 ${Math.max(1, hours)} 小时`;
  const days = Math.ceil(hours / 24);
  return `剩 ${days} 天`;
}

export function DocCard({ doc, onShare, onEdit, onDelete }: DocCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeInfo = TYPE_META[doc.sourceType] || TYPE_META.pdf;
  const expiryLabel = formatExpiryLabel(doc.expiresAt, doc.isExpired);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(doc);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-[#E6DFD2] bg-white transition duration-250 hover:-translate-y-0.5 hover:border-[#D6CCBA] hover:shadow-xl hover:shadow-[#1A1816]/[0.07]">
      {/* Book Showcase Stage */}
      <Link
        href={`/v/${doc.slug}`}
        className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#F4EFE5] to-[#ECE5D8] p-5"
      >
        {doc.coverUrl ? (
          <img
            src={doc.coverUrl}
            alt={doc.title}
            loading="lazy"
            className="fd-book-cover max-h-full max-w-full rounded-md object-contain transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="fd-book-cover flex h-full w-32 items-center justify-center rounded-md bg-white text-xs font-medium text-[#6C655B]">
            {doc.pageCount} 页
          </div>
        )}

        {/* Top-left format & page pills */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide backdrop-blur-xs ${typeInfo.color}`}
          >
            {typeInfo.label}
          </span>
          <span className="rounded-full bg-black/60 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-xs">
            {doc.pageCount} 页
          </span>
        </div>

        {/* Top-right security & expiry tags */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {doc.hasPasscode && (
            <span
              title="已开启密码保护"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1816]/80 text-[#F5B08F] backdrop-blur-xs"
            >
              <Lock className="h-3 w-3" />
            </span>
          )}
          {expiryLabel && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-xs ${
                doc.isExpired
                  ? "bg-rose-600/90 text-white"
                  : "bg-white/90 text-[#4A453E]"
              }`}
            >
              <Clock className="h-2.5 w-2.5" />
              {expiryLabel}
            </span>
          )}
        </div>
      </Link>

      {/* Info Body */}
      <div className="flex flex-1 flex-col p-4">
        <Link href={`/v/${doc.slug}`} className="block">
          <h3 className="line-clamp-1 text-[15px] font-bold text-[#1A1816] transition group-hover:text-[#C85A32]">
            {doc.title}
          </h3>
        </Link>
        <p className="mt-1 line-clamp-2 min-h-[34px] text-xs leading-relaxed text-[#6C655B]">
          {doc.description || doc.converterNote}
        </p>

        <div className="mt-3 flex items-center justify-between text-[11px] text-[#8E867B]">
          <span className="truncate pr-2">{doc.converterNote}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-mono">
            <Eye className="h-3 w-3" />
            {doc.viewCount}
          </span>
        </div>

        {/* Action Row */}
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-[#F0EAE0] pt-3">
          <Link
            href={`/v/${doc.slug}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1A1816] py-2 text-xs font-semibold text-white transition hover:bg-[#C85A32]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            翻页阅读
          </Link>

          <button
            type="button"
            onClick={() => onShare(doc)}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#E6DFD2] bg-[#FAF8F4] px-3 py-2 text-xs font-medium text-[#1A1816] transition hover:border-[#C85A32]/50 hover:bg-[#FFF6F1] hover:text-[#C85A32]"
            title="生成微信链接与分享海报"
          >
            <Share2 className="h-3.5 w-3.5" />
            分享
          </button>

          <button
            type="button"
            onClick={() => onEdit(doc)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#E6DFD2] text-[#6C655B] transition hover:bg-[#F2EEE6] hover:text-[#1A1816]"
            title="编辑封面、密码与有效期"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {confirmDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
              onMouseLeave={() => setConfirmDelete(false)}
              className="rounded-xl bg-rose-600 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-rose-700"
            >
              {deleting ? "…" : "确认删"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#E6DFD2] text-[#8E867B] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              title="删除画册"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
