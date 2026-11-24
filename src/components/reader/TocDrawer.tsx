"use client";

import { BookOpen, X } from "lucide-react";
import type { TocItem } from "@/types/document";

interface TocDrawerProps {
  open: boolean;
  toc: TocItem[];
  currentPage: number;
  totalPages: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export function TocDrawer({
  open,
  toc,
  currentPage,
  totalPages,
  onSelectPage,
  onClose,
}: TocDrawerProps) {
  if (!open) return null;

  const fallbackItems: TocItem[] =
    toc.length > 0
      ? toc
      : Array.from({ length: totalPages }, (_, i) => ({
          id: `p-${i + 1}`,
          title: `第 ${i + 1} 页`,
          page: i + 1,
          level: 1,
        }));

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" />
      <aside
        className="relative z-10 flex h-full w-[min(84vw,340px)] flex-col border-r border-white/10 bg-[#1B1A18]/96 text-[#F5F2EB] shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#E07A52]" />
            <h3 className="text-sm font-semibold">目录导航</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/65">
              {fallbackItems.length} 项
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭目录"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-1">
            {fallbackItems.map((item, idx) => {
              const nextItem = fallbackItems[idx + 1];
              const isActive =
                currentPage === item.page ||
                (nextItem ? currentPage >= item.page && currentPage < nextItem.page : currentPage >= item.page && idx === fallbackItems.length - 1);

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPage(item.page);
                      onClose();
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      isActive
                        ? "bg-[#C85A32]/22 font-semibold text-[#F8B696]"
                        : "text-white/80 hover:bg-white/8 hover:text-white"
                    }`}
                    style={{ paddingLeft: `${12 + (item.level - 1) * 14}px` }}
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 font-mono text-xs opacity-60">P.{item.page}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
