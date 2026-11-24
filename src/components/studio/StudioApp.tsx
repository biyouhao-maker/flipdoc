"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  HelpCircle,
  KeyRound,
  Loader2,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { FlipDocumentPublic, SourceType, SystemInfo } from "@/types/document";
import { DocCard } from "./DocCard";
import { DropZone } from "./DropZone";
import { PublishDrawer } from "./PublishDrawer";
import { ShareModal } from "./ShareModal";
import { SystemGuideModal } from "./SystemGuideModal";

const FILTER_TABS: Array<{ id: "all" | SourceType; label: string }> = [
  { id: "all", label: "全部" },
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "Word" },
  { id: "pptx", label: "PPT" },
  { id: "markdown", label: "Markdown" },
  { id: "images", label: "图集" },
];

export function StudioApp({
  initialDocs,
  initialSystemInfo,
}: {
  initialDocs: FlipDocumentPublic[];
  initialSystemInfo: SystemInfo;
}) {
  const [docs, setDocs] = useState<FlipDocumentPublic[]>(initialDocs);
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(initialSystemInfo);
  const [filterType, setFilterType] = useState<"all" | SourceType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [shareDoc, setShareDoc] = useState<FlipDocumentPublic | null>(null);
  const [editingDoc, setEditingDoc] = useState<{
    doc: FlipDocumentPublic;
    justCreated: boolean;
  } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [isAndroidApp, setIsAndroidApp] = useState(false);

  useEffect(() => {
    setIsAndroidApp(typeof window !== "undefined" && Boolean(window.FlipDocAndroid));
  }, []);

  // Optional studio passcode unlock (only shown if STUDIO_PASSCODE env var is set)
  const [studioPassInput, setStudioPassInput] = useState("");
  const [studioPassError, setStudioPassError] = useState("");
  const [unlockingStudio, setUnlockingStudio] = useState(false);

  const needsStudioAuth = systemInfo.studioLocked && !systemInfo.studioAuthorized;

  const refreshSystem = useCallback(async () => {
    const res = await fetch("/api/system");
    if (res.ok) {
      setSystemInfo((await res.json()) as SystemInfo);
    }
  }, []);

  const refreshDocs = useCallback(async () => {
    const res = await fetch("/api/docs");
    if (res.ok) {
      const data = (await res.json()) as { docs: FlipDocumentPublic[] };
      setDocs(data.docs);
    }
  }, []);

  useEffect(() => {
    // Sync client-side LAN origin port if needed
    void refreshSystem();
  }, [refreshSystem]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return docs.filter((doc) => {
      if (filterType !== "all" && doc.sourceType !== filterType) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        doc.originalFilename.toLowerCase().includes(q)
      );
    });
  }, [docs, filterType, searchQuery]);

  const handleCreated = (newDoc: FlipDocumentPublic) => {
    setDocs((prev) => [newDoc, ...prev]);
    setEditingDoc({ doc: newDoc, justCreated: true });
  };

  const handleUpdated = (updatedDoc: FlipDocumentPublic) => {
    setDocs((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setEditingDoc((prev) =>
      prev && prev.doc.id === updatedDoc.id ? { ...prev, doc: updatedDoc } : prev
    );
    setShareDoc((prev) => (prev && prev.id === updatedDoc.id ? updatedDoc : prev));
  };

  const handleDelete = async (target: FlipDocumentPublic) => {
    const res = await fetch(`/api/docs/${encodeURIComponent(target.slug)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== target.id));
    }
  };

  const handleReseed = async () => {
    setReseeding(true);
    try {
      const res = await fetch("/api/docs?reseed=1");
      if (res.ok) {
        const data = (await res.json()) as { docs: FlipDocumentPublic[] };
        setDocs(data.docs);
      }
    } finally {
      setReseeding(false);
    }
  };

  const handleStudioUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockingStudio(true);
    setStudioPassError("");
    try {
      const res = await fetch("/api/auth/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: studioPassInput }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStudioPassError(body.error || "口令错误");
        return;
      }
      setStudioPassInput("");
      await refreshSystem();
      await refreshDocs();
    } finally {
      setUnlockingStudio(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F7F5F0] text-[#1A1816]">
      {/* Minimalist Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#EAE3D6]/85 bg-[#F7F5F0]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#C85A32] text-white shadow-sm shadow-[#C85A32]/25">
              <BookOpenText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-[#1A1816]">
                  FlipDoc 轻翻
                </span>
                <span className="hidden rounded-full bg-[#EFE9DC] px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[#6C655B] sm:inline-block">
                  微信翻页画册
                </span>
              </div>
              <p className="text-[11px] text-[#7A7267]">
                拖入文档即刻装订 · 3D 翻书 &amp; 手机丝滑浏览
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {systemInfo.libreOfficeAvailable && (
              <span className="hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 md:inline-flex">
                <Sparkles className="h-3 w-3" />
                Office 高保真已就绪
              </span>
            )}
            {!isAndroidApp && (
              <a
                href="/FlipDoc.apk"
                download="FlipDoc-轻翻.apk"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#2D5A47] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#234839]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>下载安卓 App</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E2DACB] bg-white px-3.5 py-2 text-xs font-medium text-[#4A453E] transition hover:border-[#C85A32]/50 hover:text-[#C85A32]"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">扫码与使用指南</span>
              <span className="sm:hidden">指南</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-7 sm:px-6 sm:py-10">
        {/* Optional Studio Auth Bar (only if STUDIO_PASSCODE is enabled) */}
        {needsStudioAuth && (
          <form
            onSubmit={handleStudioUnlock}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6DFD2] bg-white p-4 shadow-xs"
          >
            <div className="flex items-center gap-2.5 text-sm">
              <KeyRound className="h-4 w-4 text-[#C85A32]" />
              <span className="font-medium">已开启工作台管理口令，输入后可上传或编辑画册</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={studioPassInput}
                onChange={(e) => setStudioPassInput(e.target.value)}
                placeholder="管理口令"
                className="rounded-xl border border-[#DFD8CA] bg-[#FAF8F4] px-3 py-1.5 text-xs outline-none focus:border-[#C85A32]"
              />
              <button
                type="submit"
                disabled={unlockingStudio}
                className="rounded-xl bg-[#1A1816] px-4 py-1.5 text-xs font-semibold text-white"
              >
                {unlockingStudio ? "验证中…" : "解锁工作台"}
              </button>
            </div>
            {studioPassError && (
              <p className="w-full text-xs text-rose-600">{studioPassError}</p>
            )}
          </form>
        )}

        {/* Hero Drag-and-Drop Importer */}
        <DropZone
          libreOfficeAvailable={systemInfo.libreOfficeAvailable}
          disabled={needsStudioAuth}
          onCreated={handleCreated}
        />

        {/* My Flipbooks Gallery Shelf */}
        <section>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-[#1A1816]">我的画册书架</h2>
              <span className="rounded-full bg-[#ECE6DA] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#5E574E]">
                {docs.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 rounded-2xl border border-[#E6DFD2] bg-white p-1">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                      filterType === tab.id
                        ? "bg-[#1A1816] text-white"
                        : "text-[#6C655B] hover:bg-[#F2EEE6]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative flex-1 sm:w-52 sm:flex-none">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#8E867B]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索画册标题…"
                  className="w-full rounded-2xl border border-[#E6DFD2] bg-white py-1.5 pr-3 pl-8 text-xs text-[#1A1816] outline-none focus:border-[#C85A32]"
                />
              </div>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#DFD7C8] bg-white/70 px-6 py-14 text-center">
              <p className="text-sm font-medium text-[#5C564D]">
                {docs.length === 0 ? "书架还是空的，把文件拖到上方即可生成" : "没有找到匹配的画册"}
              </p>
              {docs.length === 0 && !needsStudioAuth && (
                <button
                  type="button"
                  disabled={reseeding}
                  onClick={() => void handleReseed()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#DFD7C8] bg-white px-4 py-2 text-xs font-medium text-[#4A453E] transition hover:border-[#C85A32] hover:text-[#C85A32]"
                >
                  {reseeding ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  重新生成演示样册
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onShare={(d) => setShareDoc(d)}
                  onEdit={(d) => setEditingDoc({ doc: d, justCreated: false })}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-12 border-t border-[#EAE3D6] py-6 text-center text-xs text-[#8E867B]">
        FlipDoc 轻翻 · 支持 PDF / Word / PPT / Markdown / 图集一键转微信翻页画册 · 支持添加到手机桌面作为 PWA 应用
      </footer>

      {/* Modals & Drawers */}
      {editingDoc && (
        <PublishDrawer
          doc={editingDoc.doc}
          isJustCreated={editingDoc.justCreated}
          onUpdated={handleUpdated}
          onOpenShare={(d) => {
            setEditingDoc(null);
            setShareDoc(d);
          }}
          onClose={() => setEditingDoc(null)}
        />
      )}

      {shareDoc && (
        <ShareModal
          doc={shareDoc}
          systemInfo={systemInfo}
          onClose={() => setShareDoc(null)}
        />
      )}

      {guideOpen && (
        <SystemGuideModal systemInfo={systemInfo} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
