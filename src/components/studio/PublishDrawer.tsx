"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Clock,
  ImagePlus,
  Loader2,
  Lock,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import type { FlipDocumentPublic, PageTheme, ViewMode } from "@/types/document";

interface PublishDrawerProps {
  doc: FlipDocumentPublic;
  isJustCreated?: boolean;
  onUpdated: (doc: FlipDocumentPublic) => void;
  onOpenShare: (doc: FlipDocumentPublic) => void;
  onClose: () => void;
}

const EXPIRY_PRESETS = [
  { label: "永久有效", days: 0 },
  { label: "24 小时", days: 1 },
  { label: "7 天", days: 7 },
  { label: "30 天", days: 30 },
];

export function PublishDrawer({
  doc,
  isJustCreated = false,
  onUpdated,
  onOpenShare,
  onClose,
}: PublishDrawerProps) {
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description);
  const [defaultViewMode, setDefaultViewMode] = useState<ViewMode>(doc.defaultViewMode);
  const [theme, setTheme] = useState<PageTheme>(doc.theme);
  const [enablePasscode, setEnablePasscode] = useState(doc.hasPasscode);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeHint, setPasscodeHint] = useState(doc.passcodeHint || "");
  const [expiresAt, setExpiresAt] = useState<string>(doc.expiresAt || "");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState("");

  const applyExpiryPreset = (days: number) => {
    if (days === 0) {
      setExpiresAt("");
    } else {
      setExpiresAt(new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        title: title.trim() || doc.title,
        description: description.trim(),
        defaultViewMode,
        theme,
        passcodeHint: passcodeHint.trim(),
        expiresAt: expiresAt || null,
      };

      if (!enablePasscode) {
        payload.passcode = null;
      } else if (passcodeInput.trim()) {
        payload.passcode = passcodeInput.trim();
      } else if (!doc.hasPasscode) {
        setError("开启密码保护时请输入访问密码");
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/docs/${encodeURIComponent(doc.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { doc?: FlipDocumentPublic; error?: string };
      if (!res.ok || !data.doc) {
        setError(data.error || "保存失败");
        return;
      }

      onUpdated(data.doc);
      setPasscodeInput("");
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch {
      setError("网络请求失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "custom");
      const res = await fetch(`/api/docs/${encodeURIComponent(doc.slug)}/cover`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { doc?: FlipDocumentPublic; error?: string };
      if (!res.ok || !data.doc) {
        setError(data.error || "上传封面失败");
        return;
      }
      onUpdated(data.doc);
    } catch {
      setError("封面上传异常");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRegenerateCover = async () => {
    setUploadingCover(true);
    setError("");
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(doc.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || doc.title,
          description: description.trim(),
          theme,
          regenerateCover: true,
        }),
      });
      const data = (await res.json()) as { doc?: FlipDocumentPublic; error?: string };
      if (res.ok && data.doc) onUpdated(data.doc);
    } finally {
      setUploadingCover(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#1A1816]">
              {isJustCreated ? "转换成功 · 调整发布信息" : "画册与微信分享设置"}
            </h3>
            <p className="text-xs text-[#6C655B]">
              {doc.converterNote} · 共 {doc.pageCount} 页
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#6C655B] hover:bg-[#F2EEE6]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Cover + Title Card */}
          <div className="flex gap-4 rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="flex h-32 w-24 items-center justify-center overflow-hidden rounded-lg bg-[#F2EEE6] p-1">
                {doc.coverUrl ? (
                  <img
                    src={doc.coverUrl}
                    alt={doc.title}
                    className="fd-book-cover max-h-full max-w-full rounded object-contain"
                  />
                ) : (
                  <span className="text-xs text-[#6C655B]">无封面</span>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCoverUpload(file);
                }}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={uploadingCover}
                  onClick={() => coverInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#F2EEE6] px-2 py-1 text-[11px] font-medium text-[#1A1816] hover:bg-[#E6DFD2]"
                >
                  {uploadingCover ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3 w-3" />
                  )}
                  换封面
                </button>
                {doc.sourceType !== "images" && (
                  <button
                    type="button"
                    disabled={uploadingCover}
                    onClick={() => void handleRegenerateCover()}
                    className="rounded-lg p-1 text-[#6C655B] hover:bg-[#F2EEE6]"
                    title="重新生成默认文字封面"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4A453E]">
                  画册标题（微信卡片标题）
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#E2DACB] bg-[#FAF8F4] px-3 py-2 text-sm text-[#1A1816] outline-none focus:border-[#C85A32]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4A453E]">
                  摘要简介（微信分享摘要）
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话介绍这份文档，显示在分享海报与微信转发摘要中"
                  className="w-full resize-none rounded-xl border border-[#E2DACB] bg-[#FAF8F4] px-3 py-2 text-xs leading-relaxed text-[#1A1816] outline-none focus:border-[#C85A32]"
                />
              </div>
            </div>
          </div>

          {/* Reading Mode */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <label className="mb-2.5 block text-xs font-semibold text-[#4A453E]">
              默认翻页模式
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "auto", label: "智能自适应", sub: "桌面翻书/手机滑" },
                  { id: "flip", label: "3D 仿真翻书", sub: "纸张折角动效" },
                  { id: "swipe", label: "丝滑滑动", sub: "手机最跟手" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDefaultViewMode(opt.id)}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    defaultViewMode === opt.id
                      ? "border-[#C85A32] bg-[#FFF7F3]"
                      : "border-[#E6DFD2] bg-[#FAF8F4] hover:border-[#D0C7B7]"
                  }`}
                >
                  <div className="text-xs font-semibold text-[#1A1816]">{opt.label}</div>
                  <div className="mt-0.5 text-[10px] text-[#6C655B]">{opt.sub}</div>
                </button>
              ))}
            </div>

            {doc.renderMode === "html-pages" && (
              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold text-[#4A453E]">
                  精排纸张主题
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { id: "warm-paper", label: "暖纸书香", bg: "#FBF8F1" },
                      { id: "editorial", label: "杂志纯白", bg: "#FFFFFF" },
                      { id: "minimal", label: "极简灰", bg: "#F4F6F8" },
                      { id: "dark-ink", label: "夜读墨", bg: "#1E2024" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border py-2 text-[11px] font-medium transition ${
                        theme === t.id
                          ? "border-[#C85A32] bg-[#FFF7F3] text-[#A94522]"
                          : "border-[#E6DFD2] text-[#5C564D]"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-black/15"
                        style={{ backgroundColor: t.bg }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Access Control: Passcode + Expiry */}
          <div className="space-y-4 rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#C85A32]" />
                <div>
                  <div className="text-xs font-semibold text-[#1A1816]">访问密码保护</div>
                  <div className="text-[11px] text-[#6C655B]">
                    开启后微信点开需输入正确密码才可浏览
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enablePasscode}
                onClick={() => setEnablePasscode((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition ${
                  enablePasscode ? "bg-[#C85A32]" : "bg-[#D9D2C5]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition ${
                    enablePasscode ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {enablePasscode && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder={doc.hasPasscode ? "留空保持原密码，或填新密码" : "设置访问密码（如 8888）"}
                  className="rounded-xl border border-[#E2DACB] bg-[#FAF8F4] px-3 py-2 text-xs text-[#1A1816] outline-none focus:border-[#C85A32]"
                />
                <input
                  type="text"
                  value={passcodeHint}
                  onChange={(e) => setPasscodeHint(e.target.value)}
                  placeholder="可选提示（如：联系发送人获取）"
                  className="rounded-xl border border-[#E2DACB] bg-[#FAF8F4] px-3 py-2 text-xs text-[#1A1816] outline-none focus:border-[#C85A32]"
                />
              </div>
            )}

            <div className="border-t border-[#F0EAE0] pt-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A1816]">
                  <Clock className="h-3.5 w-3.5 text-[#2D5A47]" />
                  分享链接有效期
                </span>
                <span className="text-[11px] text-[#6C655B]">
                  {expiresAt
                    ? `截止 ${new Date(expiresAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "永久有效"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyExpiryPreset(p.days)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      (p.days === 0 && !expiresAt)
                        ? "bg-[#2D5A47] text-white"
                        : "bg-[#F2EEE6] text-[#4E4942] hover:bg-[#E6DFD2]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">{error}</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#E6DFD2] bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1A1816] py-2.5 text-sm font-semibold text-white transition hover:bg-[#322F2B] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedNotice ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : null}
              {savedNotice ? "已保存" : "保存设置"}
            </button>

            <button
              type="button"
              onClick={() => onOpenShare(doc)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#C85A32] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#B24B26]"
            >
              <Share2 className="h-4 w-4" />
              分享海报
            </button>

            <Link
              href={`/v/${doc.slug}`}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-[#DFD8CA] bg-[#FAF8F4] px-4 py-2.5 text-sm font-medium text-[#1A1816] transition hover:bg-[#EFEAE0]"
            >
              <BookOpen className="h-4 w-4" />
              阅读
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
