"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  Laptop,
  Loader2,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import type { ScannedChatFile } from "@/types/document";

interface ChatImportModalProps {
  open: boolean;
  onClose: () => void;
  onTriggerBrowserPicker: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `${days} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}

export function ChatImportModal({
  open,
  onClose,
  onTriggerBrowserPicker,
}: ChatImportModalProps) {
  const router = useRouter();
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Desktop WeChat/QQ auto-scanner state
  const [scanning, setScanning] = useState(false);
  const [chatFiles, setChatFiles] = useState<ScannedChatFile[]>([]);
  const [scannedDirs, setScannedDirs] = useState<string[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [shortcutDone, setShortcutDone] = useState(false);

  const runDesktopScan = useCallback(async () => {
    if (!window.FlipDocDesktop) return;
    setScanning(true);
    try {
      const res = await window.FlipDocDesktop.scanChatFiles();
      setChatFiles(res.files || []);
      setScannedDirs(res.scannedDirs || []);
    } catch {
      setToastMsg("扫描微信/QQ目录时出错");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const android = Boolean(window.FlipDocAndroid);
    const desktop = Boolean(window.FlipDocDesktop);
    setIsAndroidApp(android);
    setIsDesktopApp(desktop);
    setToastMsg("");
    if (desktop) {
      void runDesktopScan();
    }
  }, [open, runDesktopScan]);

  if (!open) return null;

  const handleOpenChatApp = (pkg: string, name: string) => {
    if (!window.FlipDocAndroid?.openChatApp) return;
    const ok = window.FlipDocAndroid.openChatApp(pkg);
    if (!ok) {
      setToastMsg(`未检测到已安装的${name}客户端`);
    }
  };

  const handlePickSavedFiles = () => {
    if (window.FlipDocAndroid?.pickChatSavedFiles) {
      onClose();
      window.FlipDocAndroid.pickChatSavedFiles();
      return;
    }
    onClose();
    onTriggerBrowserPicker();
  };

  const handlePickCustomFolder = async () => {
    if (!window.FlipDocDesktop) return;
    const res = await window.FlipDocDesktop.pickCustomChatFolder();
    if (res) {
      setChatFiles(res.files || []);
      setScannedDirs(res.scannedDirs || []);
    }
  };

  const handleImportDesktopFile = async (file: ScannedChatFile) => {
    if (!window.FlipDocDesktop || importingId) return;
    setImportingId(file.id);
    setToastMsg("");
    try {
      const res = await window.FlipDocDesktop.importScannedFile(file.id);
      if (!res.ok || !res.slug) {
        setToastMsg(res.error || "导入转换失败");
        return;
      }
      onClose();
      router.push(`/v/${res.slug}`);
    } catch {
      setToastMsg("上传转换过程中发生错误");
    } finally {
      setImportingId(null);
    }
  };

  const handleInstallShortcuts = async () => {
    if (!window.FlipDocDesktop) return;
    const res = await window.FlipDocDesktop.installWindowsShortcuts();
    if (res.ok) {
      setShortcutDone(true);
      setTimeout(() => setShortcutDone(false), 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="safe-bottom flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2D5A47]/12 text-[#2D5A47]">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1A1816]">
                从微信 / QQ 聊天记录导入
              </h3>
              <p className="text-xs text-[#6C655B]">
                {isDesktopApp
                  ? "桌面增强版：已自动扫描本机电脑版微信与 QQ 最近收到的文档"
                  : "无需去深层文件夹翻找，一键把聊天文档转成翻页电子书"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-[#6C655B] hover:bg-[#F2EEE6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-6">
          {/* DESKTOP APP EXCLUSIVE: Live Auto-Scanned WeChat / QQ Recent Files! */}
          {isDesktopApp && (
            <div className="rounded-2xl border border-[#2D5A47]/30 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2D5A47]/12 px-2.5 py-0.5 text-xs font-bold text-[#2D5A47]">
                  <Sparkles className="h-3.5 w-3.5" />
                  本机微信 / QQ 最近收到的文档 ({chatFiles.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handlePickCustomFolder()}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E2DACB] bg-[#FAF8F4] px-2.5 py-1 text-[11px] font-medium text-[#4A453E] hover:border-[#C85A32] hover:text-[#C85A32]"
                    title="如果微信/QQ改过存储位置，可手动添加文件夹"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    指定目录
                  </button>
                  <button
                    type="button"
                    disabled={scanning}
                    onClick={() => void runDesktopScan()}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#F2EEE6] px-2.5 py-1 text-[11px] font-medium text-[#1A1816] hover:bg-[#E6DFD2]"
                  >
                    <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
                    刷新
                  </button>
                </div>
              </div>

              {scanning ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#6C655B]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2D5A47]" />
                  正在扫描电脑微信与 QQ 接收目录…
                </div>
              ) : chatFiles.length === 0 ? (
                <div className="my-3 rounded-xl bg-[#FAF8F4] p-4 text-center text-xs text-[#6C655B]">
                  <p>暂未在默认目录扫到最近的聊天文档。</p>
                  <p className="mt-1 text-[11px] opacity-80">
                    如果你把微信/QQ 文件保存位置改到了 D 盘或其他盘，点右上角「指定目录」选一次 `WeChat Files` 或 `FileRecv` 即可永久记住！
                  </p>
                </div>
              ) : (
                <div className="mt-3 max-h-[270px] divide-y divide-[#F2EEE6] overflow-y-auto rounded-xl border border-[#EFE9DD]">
                  {chatFiles.map((file) => {
                    const busy = importingId === file.id;
                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-[#FAF8F4]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                file.source === "微信"
                                  ? "bg-[#07C160]/12 text-[#069E4E]"
                                  : file.source === "QQ"
                                    ? "bg-[#0099FF]/12 text-[#007ACC]"
                                    : "bg-[#C85A32]/12 text-[#B24B26]"
                              }`}
                            >
                              {file.source}
                            </span>
                            <span className="truncate text-xs font-semibold text-[#1A1816]">
                              {file.name}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#8A8277]">
                            <span>{formatFileSize(file.size)}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(file.mtime)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(importingId)}
                          onClick={() => void handleImportDesktopFile(file)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#1A1816] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#C85A32] disabled:opacity-50"
                        >
                          {busy ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              转换中…
                            </>
                          ) : (
                            "转电子书"
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {scannedDirs.length > 0 && (
                <p className="mt-2 truncate text-[10px] text-[#8E867B]">
                  已关联目录：{scannedDirs.join(" · ")}
                </p>
              )}

              {/* Windows Right-Click SendTo + Desktop Shortcut */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F6F3EC] px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#4A453E]">
                  <MousePointerClick className="h-4 w-4 text-[#C85A32]" />
                  <span>注册桌面图标与系统右键「发送到 → FlipDoc 轻翻」</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleInstallShortcuts()}
                  className="shrink-0 rounded-lg bg-[#C85A32] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#B24B26]"
                >
                  {shortcutDone ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      已创建
                    </span>
                  ) : (
                    "一键开启"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Method 1: Native Android WeChat / QQ "Open with FlipDoc" */}
          {!isDesktopApp && (
            <div className="rounded-2xl border border-[#2D5A47]/25 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2D5A47]/12 px-2.5 py-0.5 text-xs font-bold text-[#2D5A47]">
                  <Sparkles className="h-3.5 w-3.5" />
                  安卓最丝滑方式 · 聊天内一键直转
                </span>
                {!isAndroidApp && (
                  <a
                    href="/FlipDoc.apk"
                    download="FlipDoc-轻翻.apk"
                    className="text-xs font-semibold text-[#C85A32] underline underline-offset-2"
                  >
                    需安装安卓 App
                  </a>
                )}
              </div>

              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[#3D3832]">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F2EEE6] font-mono text-[11px] font-bold text-[#1A1816]">
                    1
                  </span>
                  <span>
                    在<strong>微信或 QQ 聊天记录</strong>中，点击你要看的文档（PDF / Word / PPT / Markdown / TXT）或图片；
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F2EEE6] font-mono text-[11px] font-bold text-[#1A1816]">
                    2
                  </span>
                  <span>
                    点右上角 <strong>「···」</strong> → 选择 <strong>「用其他应用打开」</strong>（图片可选「发送给其他应用」）；
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C85A32] font-mono text-[11px] font-bold text-white">
                    3
                  </span>
                  <span>
                    在弹出列表里点 <strong>「FlipDoc 轻翻」</strong>，自动导入并直接打开为苹果图书式翻页电子书！
                  </span>
                </li>
              </ol>

              {isAndroidApp ? (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenChatApp("com.tencent.mm", "微信")}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[#07C160] py-2.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95"
                  >
                    打开微信选文件
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenChatApp("com.tencent.mobileqq", "QQ")}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0099FF] py-2.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95"
                  >
                    打开 QQ 选文件
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="mt-3.5 flex items-center justify-between rounded-xl bg-[#F5F1E8] px-3.5 py-2.5 text-xs text-[#5A5349]">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-[#C85A32]" />
                    装上 57KB 安卓端即可在微信/QQ 菜单出现
                  </span>
                  <a
                    href="/FlipDoc.apk"
                    download="FlipDoc-轻翻.apk"
                    className="shrink-0 rounded-lg bg-[#1A1816] px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    下载 APK
                  </a>
                </div>
              )}
            </div>
          )}

          {toastMsg && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs text-rose-600">
              {toastMsg}
            </p>
          )}

          {/* Method 2: Pick already-saved Download/WeiXin or local files */}
          {!isDesktopApp && (
            <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1816]">
                    <FolderOpen className="h-4 w-4 text-[#C85A32]" />
                    选择已「保存到手机」的微信 / QQ 文件
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#6C655B]">
                    如果你已经在微信/QQ 里点过「保存到手机」，点右侧按钮可直接定位到下载目录导入。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePickSavedFiles}
                  className="shrink-0 rounded-xl border border-[#DFD8CA] bg-[#FAF8F4] px-3.5 py-2 text-xs font-semibold text-[#1A1816] transition hover:border-[#C85A32] hover:text-[#C85A32]"
                >
                  去选文件
                </button>
              </div>
            </div>
          )}

          {/* Method 3: Desktop WeChat / QQ Drag & Drop */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1816]">
              <Laptop className="h-4 w-4 text-[#28537A]" />
              电脑版微信 / QQ 聊天气泡直接拖拽
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#6C655B]">
              无需先另存到桌面：直接按住电脑微信或 QQ 聊天窗口里的文件气泡，<strong>拖进首页虚线上传框</strong>（或直接拖到桌面上的 FlipDoc 软件图标上）即可自动转换！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
