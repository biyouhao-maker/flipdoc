"use client";

import { BookOpen, SlidersHorizontal, X } from "lucide-react";
import type { EbookFontFamily } from "@/lib/ebook-paginator";
import type { PageTheme } from "@/types/document";

interface AppearanceSheetProps {
  open: boolean;
  theme: PageTheme;
  fontSize: number;
  fontFamily: EbookFontFamily;
  activeMode: "flip" | "swipe";
  isReflowEbook: boolean;
  onChangeTheme: (theme: PageTheme) => void;
  onChangeFontSize: (size: number) => void;
  onChangeFontFamily: (family: EbookFontFamily) => void;
  onChangeMode: (mode: "flip" | "swipe") => void;
  onClose: () => void;
}

const FONT_SIZES = [15, 17, 19, 21];

const THEME_CARDS: Array<{
  id: PageTheme;
  label: string;
  bg: string;
  ink: string;
  border: string;
}> = [
  { id: "editorial", label: "静白", bg: "#FFFFFF", ink: "#1A1816", border: "#E3DFD7" },
  { id: "warm-paper", label: "暖纸", bg: "#FBF8F1", ink: "#24201B", border: "#E4DBC9" },
  { id: "minimal", label: "柔灰", bg: "#F2F4F7", ink: "#1D222B", border: "#D7DCE4" },
  { id: "dark-ink", label: "夜读", bg: "#1C1D20", ink: "#ECE8DF", border: "#34363D" },
];

export function AppearanceSheet({
  open,
  theme,
  fontSize,
  fontFamily,
  activeMode,
  isReflowEbook,
  onChangeTheme,
  onChangeFontSize,
  onChangeFontFamily,
  onChangeMode,
  onClose,
}: AppearanceSheetProps) {
  if (!open) return null;

  const isDark = theme === "dark-ink";
  const currentSizeIdx = Math.max(
    0,
    FONT_SIZES.findIndex((s) => s >= fontSize)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`safe-bottom w-full max-w-md rounded-t-[28px] border p-5 shadow-2xl transition sm:rounded-[28px] ${
          isDark
            ? "border-white/12 bg-[#232428]/96 text-[#F2EEE6]"
            : "border-black/8 bg-[#F9F8F5]/96 text-[#1A1816]"
        } backdrop-blur-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight">主题与阅读外观</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭外观设置"
            className={`rounded-full p-1.5 transition ${
              isDark ? "bg-white/10 hover:bg-white/18" : "bg-black/6 hover:bg-black/12"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Font Size & Font Family (for reflowable e-books) */}
        {isReflowEbook && (
          <div className="mb-4 space-y-3">
            {/* Apple Books A- / A+ Stepper */}
            <div
              className={`grid grid-cols-2 gap-1.5 rounded-2xl p-1 ${
                isDark ? "bg-white/8" : "bg-black/[0.06]"
              }`}
            >
              <button
                type="button"
                disabled={currentSizeIdx <= 0}
                onClick={() => onChangeFontSize(FONT_SIZES[Math.max(0, currentSizeIdx - 1)])}
                className={`flex items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-35 ${
                  isDark
                    ? "bg-white/10 hover:bg-white/16"
                    : "bg-white shadow-xs hover:bg-white/80"
                }`}
              >
                <span className="text-xs">A</span>
                <span className="ml-0.5 text-[10px] opacity-65">−</span>
              </button>
              <button
                type="button"
                disabled={currentSizeIdx >= FONT_SIZES.length - 1}
                onClick={() =>
                  onChangeFontSize(
                    FONT_SIZES[Math.min(FONT_SIZES.length - 1, currentSizeIdx + 1)]
                  )
                }
                className={`flex items-center justify-center rounded-xl py-2.5 text-lg font-semibold transition disabled:opacity-35 ${
                  isDark
                    ? "bg-white/10 hover:bg-white/16"
                    : "bg-white shadow-xs hover:bg-white/80"
                }`}
              >
                <span>A</span>
                <span className="ml-0.5 text-xs opacity-65">+</span>
              </button>
            </div>

            {/* Font Family Switcher */}
            <div
              className={`grid grid-cols-2 gap-1.5 rounded-2xl p-1 text-xs font-medium ${
                isDark ? "bg-white/8" : "bg-black/[0.06]"
              }`}
            >
              <button
                type="button"
                onClick={() => onChangeFontFamily("serif")}
                className={`rounded-xl py-2 transition ${
                  fontFamily === "serif"
                    ? isDark
                      ? "bg-white text-[#1A1816] font-semibold"
                      : "bg-white text-[#1A1816] font-semibold shadow-xs"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={{ fontFamily: "var(--font-serif)" }}
              >
                书香宋体
              </button>
              <button
                type="button"
                onClick={() => onChangeFontFamily("sans")}
                className={`rounded-xl py-2 transition ${
                  fontFamily === "sans"
                    ? isDark
                      ? "bg-white text-[#1A1816] font-semibold"
                      : "bg-white text-[#1A1816] font-semibold shadow-xs"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                现代黑体
              </button>
            </div>
          </div>
        )}

        {/* Paper Themes Grid (Apple Books miniature theme cards) */}
        {isReflowEbook && (
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-medium opacity-60">纸张主题</div>
            <div className="grid grid-cols-4 gap-2.5">
              {THEME_CARDS.map((card) => {
                const selected = theme === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onChangeTheme(card.id)}
                    className={`flex flex-col items-center justify-center rounded-2xl py-3 transition ${
                      selected ? "ring-2 ring-[#C85A32] ring-offset-2 ring-offset-transparent" : ""
                    }`}
                    style={{
                      backgroundColor: card.bg,
                      color: card.ink,
                      border: `1px solid ${card.border}`,
                    }}
                  >
                    <span
                      className="text-lg font-bold leading-none"
                      style={{
                        fontFamily:
                          fontFamily === "serif" ? "var(--font-serif)" : "var(--font-ui)",
                      }}
                    >
                      Aa
                    </span>
                    <span className="mt-1.5 text-[11px] font-medium opacity-80">
                      {card.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Page Turning Style */}
        <div>
          <div className="mb-2 text-[11px] font-medium opacity-60">翻页动效</div>
          <div
            className={`grid grid-cols-2 gap-1.5 rounded-2xl p-1 text-xs font-medium ${
              isDark ? "bg-white/8" : "bg-black/[0.06]"
            }`}
          >
            <button
              type="button"
              onClick={() => onChangeMode("swipe")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
                activeMode === "swipe"
                  ? isDark
                    ? "bg-white text-[#1A1816] font-semibold"
                    : "bg-white text-[#1A1816] font-semibold shadow-xs"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              平滑滑页
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("flip")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
                activeMode === "flip"
                  ? isDark
                    ? "bg-white text-[#1A1816] font-semibold"
                    : "bg-white text-[#1A1816] font-semibold shadow-xs"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              仿真卷页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
